/**
 * ════════════════════════════════════════════════════════════════════
 * confirmLinenDelivery — conferma la consegna biancheria di una pulizia
 * ════════════════════════════════════════════════════════════════════
 *
 * Replica ESATTAMENTE la logica di auto-conferma del flusso operatore
 * `/api/cleanings/[id]/complete` (funzione `confirmOrder` + `subtractOrderFromInventory`),
 * resa riutilizzabile così che QUALSIASI percorso che porta una pulizia a
 * COMPLETED/VERIFIED possa confermare l'ordine biancheria collegato:
 *   - mette l'ordine in DELIVERED (con deliveredAt, completedCleaningId),
 *   - scala il magazzino (una sola volta, guardia `inventoryDeducted`),
 *   - segna come ritirati gli eventuali ordini di pickup precedenti.
 *
 * È IDEMPOTENTE: se l'ordine è già DELIVERED/CANCELLED/COMPLETED non fa nulla,
 * e non riscalia il magazzino se `inventoryDeducted === true`. Quindi è sicuro
 * chiamarla anche su pulizie già passate da `/complete`.
 *
 * Trova l'ordine con la stessa cascata a 3 metodi di `/complete`:
 *   1) cleaning.laundryOrderId
 *   2) query orders where cleaningId == <id>
 *   3) query orders by propertyId + stessa data schedulata
 *
 * NOTA: `/complete` NON è stato modificato. Questo helper è usato dai percorsi
 * che prima lasciavano l'ordine orfano in PENDING (es. PUT generico su
 * cleanings/[id]). La logica è duplicata di proposito per non toccare il
 * flusso operatore già funzionante; una futura unificazione è possibile.
 */

import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

const isProd = process.env.NODE_ENV === "production";
const log = (...a: any[]) => { if (!isProd) console.log(...a); };

// 📦 Sottrai gli items di un ordine dall'inventario (identico a /complete)
async function subtractOrderFromInventory(orderItems: any[]) {
  if (!orderItems || orderItems.length === 0) return;
  try {
    const { loadInventoryResolver } = await import("~/lib/inventoryResolver");
    const { resolveToDocId } = await loadInventoryResolver();

    for (const item of orderItems) {
      const qty = item.quantity || 0;
      if (qty <= 0) continue;
      const inventoryDocId = resolveToDocId(item.id) || resolveToDocId(item.name);
      if (!inventoryDocId) {
        console.warn(`📦 [confirmLinenDelivery] Item non trovato in inventario: id="${item.id}" name="${item.name}"`);
        continue;
      }
      await adminDb.collection("inventory").doc(inventoryDocId).update({
        quantity: FieldValue.increment(-qty),
        updatedAt: Timestamp.now(),
      });
    }
  } catch (e) {
    console.error("Errore sottrazione inventario (confirmLinenDelivery):", e);
  }
}

export interface ConfirmLinenResult {
  confirmed: boolean;
  method: string | null;
  orderId?: string;
}

/**
 * Conferma l'ordine biancheria collegato alla pulizia `cleaningId`.
 * @param cleaningId  id della pulizia
 * @param cleaning    dati pulizia (deve contenere laundryOrderId/propertyId/scheduledDate aggiornati)
 * @param now         Timestamp da usare per deliveredAt/updatedAt (coerente col chiamante)
 */
export async function confirmLinenDelivery(
  cleaningId: string,
  cleaning: any,
  now: Timestamp = Timestamp.now(),
): Promise<ConfirmLinenResult> {
  let result: ConfirmLinenResult = { confirmed: false, method: null };

  // Helper: conferma un ordine, scala inventario, segna precedenti come ritirati
  const confirmOrder = async (orderDocId: string, orderData: any, method: string): Promise<boolean> => {
    const skipStatuses = ["DELIVERED", "CANCELLED", "COMPLETED"];
    if (skipStatuses.includes(orderData.status)) {
      log(`📦 [confirmLinenDelivery] Ordine ${orderDocId} status=${orderData.status} — skip (${method})`);
      return false;
    }

    const orderUpdateData: any = {
      status: "DELIVERED",
      deliveredAt: now,
      autoConfirmedByCleaningCompletion: true,
      completedCleaningId: cleaningId,
      pickupCompleted: false,
      updatedAt: now,
    };

    // 📦 Scala inventario SOLO se non già scalato
    if (orderData.inventoryDeducted !== true) {
      await subtractOrderFromInventory(orderData.items || []);
      orderUpdateData.inventoryDeducted = true;
      log(`📦 [confirmLinenDelivery] Inventario scalato per ordine ${orderDocId} (${method}) — ${(orderData.items || []).length} items`);
    } else {
      log(`📦 [confirmLinenDelivery] Inventario GIA' scalato per ordine ${orderDocId} — skip deduzione (${method})`);
    }

    await adminDb.collection("orders").doc(orderDocId).update(orderUpdateData);
    log(`📦 [confirmLinenDelivery] Ordine ${orderDocId} confermato DELIVERED (${method})`);

    // 🔄 Segna ordini precedenti come ritirati
    if (orderData.pickupFromOrders?.length > 0) {
      for (const prevId of orderData.pickupFromOrders) {
        try {
          await adminDb.collection("orders").doc(prevId).update({
            pickupCompleted: true,
            pickupCompletedAt: now,
            pickupCompletedInOrderId: orderDocId,
          });
        } catch (e) { /* ignore */ }
      }
    }

    result.orderId = orderDocId;
    return true;
  };

  try {
    // Metodo 1: laundryOrderId
    if (cleaning?.laundryOrderId) {
      const orderSnap = await adminDb.collection("orders").doc(cleaning.laundryOrderId).get();
      if (orderSnap.exists) {
        const ok = await confirmOrder(cleaning.laundryOrderId, orderSnap.data(), "metodo1-laundryOrderId");
        if (ok) result = { ...result, confirmed: true, method: "metodo1-laundryOrderId" };
      } else {
        log(`📦 [confirmLinenDelivery] Metodo 1: laundryOrderId ${cleaning.laundryOrderId} NON trovato`);
      }
    }

    // Metodo 2: orders where cleaningId == cleaningId
    if (!result.confirmed) {
      const ordersSnap = await adminDb.collection("orders").where("cleaningId", "==", cleaningId).get();
      log(`📦 [confirmLinenDelivery] Metodo 2: trovati ${ordersSnap.size} ordini con cleaningId=${cleaningId}`);
      for (const orderDoc of ordersSnap.docs) {
        const ok = await confirmOrder(orderDoc.id, orderDoc.data(), "metodo2-cleaningId");
        if (ok) { result = { ...result, confirmed: true, method: "metodo2-cleaningId" }; break; }
      }
    }

    // Metodo 3: propertyId + stessa data schedulata
    if (!result.confirmed && cleaning?.propertyId && cleaning?.scheduledDate) {
      const scheduledDate = cleaning.scheduledDate?.toDate
        ? cleaning.scheduledDate.toDate()
        : new Date(cleaning.scheduledDate);
      const startOfDay = new Date(scheduledDate); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(scheduledDate); endOfDay.setHours(23, 59, 59, 999);

      const ordersSnap = await adminDb.collection("orders").where("propertyId", "==", cleaning.propertyId).get();
      log(`📦 [confirmLinenDelivery] Metodo 3: trovati ${ordersSnap.size} ordini con propertyId=${cleaning.propertyId}`);
      for (const orderDoc of ordersSnap.docs) {
        const orderData = orderDoc.data() as Record<string, any>;
        const orderDate = orderData.scheduledDate?.toDate ? orderData.scheduledDate.toDate() : null;
        if (
          orderDate &&
          orderDate >= startOfDay &&
          orderDate <= endOfDay &&
          !["DELIVERED", "CANCELLED", "COMPLETED"].includes(orderData.status)
        ) {
          const ok = await confirmOrder(orderDoc.id, orderData, "metodo3-propertyId+data");
          if (ok) { result = { ...result, confirmed: true, method: "metodo3-propertyId+data" }; break; }
        }
      }
    }

    log(`📦 [confirmLinenDelivery] Risultato: ${JSON.stringify(result)}`);
  } catch (e) {
    console.error("❌ [confirmLinenDelivery] Errore:", e);
  }

  return result;
}
