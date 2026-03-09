import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";


export const dynamic = 'force-dynamic';

interface OrderItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryName?: string;
}

// Helper per rimuovere undefined e garantire valori validi
function sanitizeItem(item: any) {
  return {
    itemId: item.itemId || item.id || "",
    name: item.name || "Articolo",
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    totalPrice: Number(item.totalPrice) || 0,
    categoryName: item.categoryName || "Altro"
  };
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
    
    const orderData = orderSnap.data();
    
    // Se non ci sono più items, elimina l'ordine
    // @ts-expect-error TODO-FIX: TS2339 Property 'length' does not exist on type '{}'.
    if (!items || items.length === 0) {
      await orderRef.delete();
      if (process.env.NODE_ENV !== "production") console.log(`🗑️ Ordine ${orderId} eliminato (nessun articolo rimasto)`);
      
      return NextResponse.json({
        success: true,
        deleted: true,
        message: "Ordine eliminato (nessun articolo)"
      });
    }
    
    // Sanitizza tutti gli items
    // @ts-expect-error TODO-FIX: TS2339 Property 'map' does not exist on type '{}'.
    const sanitizedItems = items.map(sanitizeItem);
    
    // Calcola il nuovo totale
    const newTotal = sanitizedItems.reduce((sum: number, item: any) => sum + item.totalPrice, 0);
    
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
    // @ts-expect-error TODO-FIX: TS18048 'orderData' is possibly 'undefined'.
    if (orderData.totalPriceOverride !== undefined && orderData.totalPriceOverride !== null) {
      // Se il nuovo totale calcolato è diverso dall'override, rimuovi l'override
      // @ts-expect-error TODO-FIX: TS18048 'orderData' is possibly 'undefined'.
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
