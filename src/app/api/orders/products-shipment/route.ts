import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { requireAdmin } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════
// POST /api/orders/products-shipment  (ADMIN-ONLY)
//
// Crea una SPEDIZIONE PRODOTTI pulizia pianificata dall'admin a una data
// scelta, SLEGATA dalle card pulizia.
//
// REGOLA CONSEGNA (richiesta da Ariele):
//  - Se la proprietà HA una pulizia attiva in quella data → i prodotti vanno
//    AGGIUNTI all'ordine di quella pulizia (unico ordine biancheria+prodotti),
//    esattamente come avviene oggi. Se l'ordine non esiste ancora, ne creo uno
//    legato a quel cleaningId: il percorso biancheria (linenOrderService) lo
//    troverà per cleaningId e ci unirà la biancheria → ordine misto.
//  - Se in quella data NON c'è pulizia (es. casa con biancheria propria) →
//    creo un ordine PRODUCTS-only standalone con quella scheduledDate.
//
// In entrambi i casi: nessun rider assegnato (status PENDING), i prodotti NON
// vengono addebitati al proprietario (debtCalculator li esclude), e lascio una
// productRequest già "fulfilled" (mai "pending") per l'audit trail — così non
// innesco il cleanup degli ordini orfani fatto da /api/cleanings/[id]/start.
// ═══════════════════════════════════════════════════════════════════════

const ACTIVE_CLEANING_STATUSES = new Set([
  "SCHEDULED", "ASSIGNED", "PENDING", "IN_PROGRESS",
  "scheduled", "assigned", "pending", "in_progress",
]);

function toNoonTimestamp(dateStr: string): Timestamp | null {
  // Accetta "YYYY-MM-DD" oppure ISO. Salva a mezzogiorno (convenzione progetto:
  // evita slittamenti di giorno per timezone).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, 12, 0, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return Timestamp.fromDate(dt);
}

function sameDay(ts: any, y: number, mo: number, d: number): boolean {
  const date: Date | undefined = ts?.toDate?.();
  if (!date) return false;
  return date.getFullYear() === y && date.getMonth() === mo && date.getDate() === d;
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth: SOLO admin ──────────────────────────────────────────────
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const user = auth.user;

    const body = await validateBody(req, GenericBodySchema);
    if (body instanceof Response) return body;

    const {
      propertyId,
      scheduledDate,
      items,
      notes,
    } = body as {
      propertyId?: string;
      scheduledDate?: string;
      items?: Array<{ itemId?: string; id?: string; name?: string; quantity?: number }>;
      notes?: string;
    };

    if (!propertyId || !scheduledDate || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Dati mancanti: propertyId, scheduledDate e almeno un prodotto sono obbligatori" },
        { status: 400 },
      );
    }

    const dateTs = toNoonTimestamp(scheduledDate);
    if (!dateTs) {
      return NextResponse.json({ error: "Data non valida (atteso YYYY-MM-DD)" }, { status: 400 });
    }
    const dObj = dateTs.toDate();
    const ty = dObj.getFullYear(), tmo = dObj.getMonth(), td = dObj.getDate();

    const now = Timestamp.now();

    // ── Normalizza items prodotto ─────────────────────────────────────
    const productItems = items
      .map(it => {
        const key = it.itemId ?? it.id ?? it.name ?? "";
        const qty = Math.max(1, Math.min(99, Number(it.quantity ?? 1) || 1));
        return {
          id:         key,
          itemId:     key,
          name:       it.name ?? "Prodotto",
          quantity:   qty,
          type:       "cleaning_product" as const,
          categoryId: "prodotti_pulizia" as const,
        };
      })
      .filter(p => p.itemId);

    if (productItems.length === 0) {
      return NextResponse.json({ error: "Nessun prodotto valido" }, { status: 400 });
    }

    // ── Carica dati proprietà ─────────────────────────────────────────
    let propertyName = "Proprietà";
    let propAddress = "", propCity = "", propPostalCode = "", propFloor = "";
    try {
      const propDoc = await adminDb.collection("properties").doc(propertyId).get();
      if (propDoc.exists) {
        const pd = propDoc.data() as Record<string, any>;
        propertyName   = pd.name        ?? propertyName;
        propAddress    = pd.address      ?? "";
        propCity       = pd.city         ?? "";
        propPostalCode = pd.postalCode   ?? "";
        propFloor      = pd.floor        ?? "";
      }
    } catch { /* non critico */ }

    // ── Cerca pulizia ATTIVA nella data scelta (single-field query → no index) ──
    let targetCleaningId: string | null = null;
    let targetCleaningTs: Timestamp | null = null;
    try {
      const cleaningsSnap = await adminDb
        .collection("cleanings")
        .where("propertyId", "==", propertyId)
        .get();
      for (const c of cleaningsSnap.docs) {
        const cd = c.data() as Record<string, any>;
        const status = String(cd.status ?? "");
        if (!ACTIVE_CLEANING_STATUSES.has(status)) continue;
        if (sameDay(cd.scheduledDate, ty, tmo, td)) {
          targetCleaningId = c.id;
          targetCleaningTs = cd.scheduledDate ?? dateTs;
          break;
        }
      }
    } catch (e) {
      console.error("products-shipment: errore ricerca pulizia:", e);
    }

    let linkedOrderId: string | null = null;
    let merged = false;
    let effectiveDateTs: Timestamp = dateTs;

    if (targetCleaningId) {
      // ── C'è una pulizia quel giorno → unico ordine biancheria+prodotti ──
      effectiveDateTs = targetCleaningTs ?? dateTs;

      // Cerca ordine attivo già esistente per quella pulizia
      const existingSnap = await adminDb
        .collection("orders")
        .where("cleaningId", "==", targetCleaningId)
        .get();
      const activeOrder = existingSnap.docs.find(
        d => String((d.data() as any).status ?? "").toUpperCase() !== "CANCELLED",
      );

      if (activeOrder) {
        // Merge nei prodotti dell'ordine esistente (preserva biancheria!)
        const data = activeOrder.data() as Record<string, any>;
        const existingItems: any[] = Array.isArray(data.items) ? data.items : [];
        const nonProduct = existingItems.filter((i: any) => i.type !== "cleaning_product");

        // Unisci per itemId i prodotti già presenti + i nuovi (somma quantità)
        const prodMap = new Map<string, any>();
        for (const p of existingItems.filter((i: any) => i.type === "cleaning_product")) {
          prodMap.set(p.itemId ?? p.id, { ...p });
        }
        for (const p of productItems) {
          const k = p.itemId;
          if (prodMap.has(k)) prodMap.get(k).quantity = (prodMap.get(k).quantity ?? 0) + p.quantity;
          else prodMap.set(k, { ...p });
        }
        const mergedProducts = Array.from(prodMap.values());

        await adminDb.collection("orders").doc(activeOrder.id).update({
          items:               [...nonProduct, ...mergedProducts],
          cleaningProducts:    mergedProducts,
          hasCleaningProducts: true,
          productRequestIds:   [...(data.productRequestIds ?? [])],
          updatedAt:           now,
        });
        linkedOrderId = activeOrder.id;
        merged = true;
      } else {
        // Pulizia c'è ma nessun ordine ancora → crea ordine legato al cleaningId.
        // linenOrderService lo troverà per cleaningId e ci unirà la biancheria.
        const newRef = await adminDb.collection("orders").add({
          propertyId,
          propertyName,
          propertyAddress:    propAddress,
          propertyCity:       propCity,
          propertyPostalCode: propPostalCode,
          propertyFloor:      propFloor,
          cleaningId:         targetCleaningId,
          type:               "PRODUCTS",
          status:             "PENDING",
          scheduledDate:      effectiveDateTs,
          items:              productItems,
          linenItems:         [],
          cleaningProducts:   productItems,
          hasCleaningProducts: true,
          adminShipment:      true,
          autoGenerated:      false,
          createdAt:          now,
          updatedAt:          now,
        });
        linkedOrderId = newRef.id;
        merged = true; // logicamente "agganciato a una pulizia"
      }
    } else {
      // ── Nessuna pulizia quel giorno → spedizione standalone ──
      const newRef = await adminDb.collection("orders").add({
        propertyId,
        propertyName,
        propertyAddress:    propAddress,
        propertyCity:       propCity,
        propertyPostalCode: propPostalCode,
        propertyFloor:      propFloor,
        type:               "PRODUCTS",
        status:             "PENDING",
        scheduledDate:      dateTs,
        items:              productItems,
        linenItems:         [],
        cleaningProducts:   productItems,
        hasCleaningProducts: true,
        adminShipment:      true,
        autoGenerated:      false,
        createdAt:          now,
        updatedAt:          now,
      });
      linkedOrderId = newRef.id;
    }

    // ── Audit: productRequest già "fulfilled" (mai pending) ───────────
    try {
      await adminDb.collection("productRequests").add({
        propertyId,
        propertyName,
        propertyAddress:       propAddress,
        cleaningId:            targetCleaningId ?? null,
        requestedBy:           user.id,
        requestedByName:       user.name ?? user.email ?? "Admin",
        requestedByRole:       "ADMIN",
        items:                 productItems,
        notes:                 notes ?? "",
        status:                "fulfilled",
        fulfilledInOrderId:    linkedOrderId,
        fulfilledInCleaningId: targetCleaningId ?? null,
        fulfilledAt:           now,
        createdAt:             now,
        updatedAt:             now,
      });
    } catch (e) {
      console.error("products-shipment: errore audit productRequest:", e);
    }

    // ── Notifiche ─────────────────────────────────────────────────────
    const deliveryDateLabel = effectiveDateTs.toDate().toLocaleDateString("it-IT");
    try {
      await createNotification({
        title:   "🧴 Spedizione prodotti pianificata",
        message: merged
          ? `Prodotti per "${propertyName}" aggiunti alla consegna del ${deliveryDateLabel}.`
          : `Spedizione prodotti per "${propertyName}" pianificata per il ${deliveryDateLabel}.`,
        type:              "PRODUCT_REQUEST",
        recipientRole:     "ADMIN",
        senderId:          user.id,
        senderName:        user.name ?? user.email,
        relatedEntityId:   linkedOrderId ?? "",
        relatedEntityType: "ORDER",
        relatedEntityName: propertyName,
        link:              "/dashboard/spedizioni",
      });

      const ridersSnap = await adminDb.collection("users").where("role", "==", "RIDER").get();
      for (const riderDoc of ridersSnap.docs) {
        await createNotification({
          title:   "🧴 Prodotti da consegnare",
          message: `Prodotti pulizia per "${propertyName}" — consegna del ${deliveryDateLabel}.`,
          type:              "PRODUCT_REQUEST",
          recipientRole:     "RIDER",
          recipientId:       riderDoc.id,
          senderId:          user.id,
          senderName:        user.name ?? user.email,
          relatedEntityId:   linkedOrderId ?? "",
          relatedEntityType: "ORDER",
          relatedEntityName: propertyName,
          link:              "/rider",
        });
      }
    } catch { /* non critico */ }

    return NextResponse.json({
      success:       true,
      orderId:       linkedOrderId,
      merged,
      scheduledDate: effectiveDateTs.toDate().toISOString(),
      message: merged
        ? `Prodotti aggiunti alla consegna del ${deliveryDateLabel}.`
        : `Spedizione pianificata per il ${deliveryDateLabel}.`,
    });
  } catch (error) {
    console.error("Errore POST products-shipment:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
