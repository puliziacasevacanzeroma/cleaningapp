import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

/**
 * CRON: Aggiunge all'inventario la biancheria consegnata dalla lavanderia industriale.
 * 
 * Eseguito alle 08:00 di ogni giorno.
 * Cerca laundryDeliveries con:
 *   - dateKey = oggi
 *   - status = COMPLETED
 *   - inventoryApplied = false
 * 
 * Per ogni item consegnato, incrementa la quantity nell'inventario.
 * Il match è fatto per NOME (data.name) perché la lavanderia usa nomi italiani.
 */

export async function GET(request: NextRequest) {
  // Verifica cron secret (header Authorization O query param ?secret=)
  const authHeader = request.headers.get("authorization");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // Data di oggi in formato YYYY-MM-DD (timezone Roma)
    const todayRome = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });

    // Cerca consegne completate per oggi non ancora applicate
    const snap = await adminDb.collection("laundryDeliveries")
      .where("dateKey", "==", todayRome)
      .where("status", "==", "COMPLETED")
      .where("inventoryApplied", "==", false)
      .get();

    if (snap.empty) {
      return NextResponse.json({ 
        success: true, 
        message: `Nessuna consegna da applicare per ${todayRome}`,
        applied: 0 
      });
    }

    // Carica resolver robusto per l'inventario
    const { loadInventoryResolver } = await import("~/lib/inventoryResolver");
    const { resolveToDocId } = await loadInventoryResolver();

    let totalItemsUpdated = 0;
    let totalDeliveriesApplied = 0;
    const errors: string[] = [];

    for (const deliveryDoc of snap.docs) {
      const delivery = deliveryDoc.data();
      const deliveredItems = delivery.deliveredItems || {};

      // Incrementa ogni item nell'inventario
      for (const [itemName, quantity] of Object.entries(deliveredItems)) {
        const qty = quantity as number;
        if (qty <= 0) continue;

        const inventoryDocId = resolveToDocId(itemName);
        if (!inventoryDocId) {
          errors.push(`Item "${itemName}" non trovato nell'inventario`);
          continue;
        }

        try {
          await adminDb.collection("inventory").doc(inventoryDocId).update({
            quantity: FieldValue.increment(qty),
            updatedAt: Timestamp.now(),
          });
          totalItemsUpdated++;
        } catch (e: any) {
          errors.push(`Errore aggiornamento "${itemName}": ${e.message}`);
        }
      }

      // Segna come applicata
      await deliveryDoc.ref.update({
        inventoryApplied: true,
        inventoryAppliedAt: Timestamp.now(),
      });
      totalDeliveriesApplied++;
    }

    return NextResponse.json({
      success: true,
      date: todayRome,
      deliveriesApplied: totalDeliveriesApplied,
      itemsUpdated: totalItemsUpdated,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error("Errore cron apply-laundry-inventory:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
