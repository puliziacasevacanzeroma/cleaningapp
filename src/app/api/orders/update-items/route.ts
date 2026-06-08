import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";
import { isCleaningProductItem } from "~/lib/payments/debtCalculator";


export const dynamic = 'force-dynamic';

// Voci sintetiche generate SOLO per il display nella pagina pagamenti:
// non devono MAI essere persistite su orders.items (altrimenti la consegna /
// preparazione letti verrebbe contata due volte, in quanto già presente nei
// campi deliveryFee / bedMakingFee dell'ordine).
const SYNTHETIC_ITEM_IDS = new Set(["_delivery_fee", "_bed_making_fee"]);

interface OrderItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryName?: string;
}

// Helper per rimuovere undefined e garantire valori validi.
// 🔒 Mantiene i campi di classificazione (type / categoryId / categoryGroup):
//    senza di essi il ricalcolo lato server/client non riconoscerebbe più la
//    categoria dell'articolo (es. un prodotto pulizia diventerebbe fatturabile).
function sanitizeItem(item: any) {
  const out: Record<string, any> = {
    itemId: item.itemId || item.id || "",
    name: item.name || "Articolo",
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    totalPrice: Number(item.totalPrice) || 0,
    categoryName: item.categoryName || "Altro"
  };
  if (item.type !== undefined && item.type !== null) out.type = item.type;
  if (item.categoryId !== undefined && item.categoryId !== null) out.categoryId = item.categoryId;
  if (item.category !== undefined && item.category !== null) out.category = item.category;
  if (item.categoryGroup !== undefined && item.categoryGroup !== null) out.categoryGroup = item.categoryGroup;
  return out;
}

export async function POST(req: NextRequest) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const body = await validateBody(req, GenericBodySchema);
    if (body instanceof Response) return body;
    const { orderId, items, calculatedTotal } = body;
    
    if (!orderId) {
      return NextResponse.json({ error: "orderId richiesto" }, { status: 400 });
    }
    
    // Carica l'ordine
    // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }
    
    const orderData: any = orderSnap.data() || {};

    // ── 1) Articoli in arrivo: tengo SOLO i fatturabili ──────────────────────
    //  • scarto le voci sintetiche (_delivery_fee / _bed_making_fee): il costo
    //    reale vive nei campi dell'ordine e verrebbe altrimenti contato 2 volte.
    //  • scarto eventuali prodotti pulizia: non si modificano da qui, li
    //    ri-preservo sotto dall'ordine esistente coi loro flag originali.
    const incomingRaw: any[] = Array.isArray(items) ? items : [];
    const incomingBillable = incomingRaw.filter(
      (it: any) => !SYNTHETIC_ITEM_IDS.has(it.itemId || it.id) && !isCleaningProductItem(it)
    );

    // Nessun articolo fatturabile rimasto → elimina l'ordine (come da logica originale)
    if (incomingBillable.length === 0) {
      await orderRef.delete();
      if (process.env.NODE_ENV !== "production") console.log(`🗑️ Ordine ${orderId} eliminato (nessun articolo rimasto)`);
      return NextResponse.json({
        success: true,
        deleted: true,
        message: "Ordine eliminato (nessun articolo)"
      });
    }

    // ── 2) Preservo i prodotti pulizia operatore già presenti sull'ordine ────
    //    (non fatturati: restano esclusi dal totale ma NON vanno persi). Strippo
    //    anche eventuali voci sintetiche legacy finite in items in passato.
    const existingItems: any[] = Array.isArray(orderData.items) ? orderData.items : [];
    const preservedCleaningProducts = existingItems
      .filter((it: any) => !SYNTHETIC_ITEM_IDS.has(it.itemId || it.id) && isCleaningProductItem(it))
      .map(sanitizeItem);

    const sanitizedBillable = incomingBillable.map(sanitizeItem);
    const sanitizedItems = [...sanitizedBillable, ...preservedCleaningProducts];

    // ── 3) Totale FATTURATO coerente con debtCalculator / processOrder ───────
    //    = Σ articoli fatturabili + deliveryFee (se abilitata) + bedMakingFee.
    //    I prodotti pulizia NON entrano nel totale.
    const itemsTotal = sanitizedBillable.reduce((sum: number, item: any) => sum + item.totalPrice, 0);
    const deliveryFee = (orderData.deliveryFee && orderData.deliveryFeeEnabled !== false) ? (Number(orderData.deliveryFee) || 0) : 0;
    const bedMakingFee = (orderData.bedMaking && orderData.bedMakingFee) ? (Number(orderData.bedMakingFee) || 0) : 0;
    const newTotal = itemsTotal + deliveryFee + bedMakingFee;

    // Prepara i dati aggiornati (senza undefined)
    const updateData: Record<string, any> = {
      items: sanitizedItems,
      itemDetails: sanitizedItems,
      calculatedTotal: newTotal,
      totalItems: sanitizedItems.reduce((sum: number, item: any) => sum + item.quantity, 0),
      updatedAt: Timestamp.now(),
      lastModifiedReason: "Modifica manuale da pagamenti"
    };
    
    // Se c'era un override del prezzo, lo manteniamo solo se ancora valido
    if (orderData.totalPriceOverride !== undefined && orderData.totalPriceOverride !== null) {
      // Se il nuovo totale calcolato è diverso dall'override, rimuovi l'override
      if (Math.abs(newTotal - orderData.totalPriceOverride) > 0.01) {
        updateData.totalPriceOverride = FieldValue.delete();
        updateData.priceOverrideReason = FieldValue.delete();
      }
    }
    
    await orderRef.update(updateData);
    
    if (process.env.NODE_ENV !== "production") console.log(`✏️ Ordine ${orderId} aggiornato: ${sanitizedItems.length} articoli, totale €${newTotal.toFixed(2)}`);
    
    return NextResponse.json({
      success: true,
      orderId,
      itemsCount: sanitizedItems.length,
      calculatedTotal: newTotal,
      message: "Ordine aggiornato"
    });
    
  } catch (error: any) {
    console.error("Errore aggiornamento ordine:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
