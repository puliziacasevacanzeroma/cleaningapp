import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { reconcileOrderItems } from "~/lib/linen/linenCore";
import { configRecomputeSkipReason } from "~/lib/linen/orderLifecycle";


export const dynamic = 'force-dynamic';

// Mappa ID salvati a nomi leggibili
const ITEM_NAMES: Record<string, string> = {
  'doubleSheets': 'Lenzuola Matrimoniali',
  'singleSheets': 'Lenzuola Singole',
  'pillowcases': 'Federe',
  'towel_bath': 'Telo Doccia',
  'towel_face': 'Asciugamano Viso',
  'towel_bidet': 'Asciugamano Bidet',
  'bathmat': 'Tappetino Scendibagno',
};

function getItemName(itemId: string): string {
  return ITEM_NAMES[itemId] || itemId;
}

/**
 * POST /api/properties/[id]/update-pending-orders
 *
 * Aggiorna gli ordini PENDING per questa proprietà ricalcolando gli items
 * dalla nuova configurazione.
 *
 * 🔒 GUARDIA CICLO DI VITA (fix acconti fantasma):
 * Un ordine PENDING la cui PULIZIA è già COMPLETED/VERIFIED rappresenta
 * biancheria già consegnata e già fatturata. NON va ricalcolato: cambiare la
 * config non deve riscrivere il passato (era la causa degli acconti fantasma —
 * es. lenzuola 6→4 su una pulizia completata faceva calare un mese già pagato).
 * La decisione di skip è centralizzata e testata in `~/lib/linen/orderLifecycle`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

    const { id: propertyId } = await params;

    // 1. Carica la proprietà con la nuova configurazione
    const propertyDoc = await adminDb.collection("properties").doc(propertyId).get();
    if (!propertyDoc.exists) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const propertyData = propertyDoc.data() as Record<string, any>;
    const serviceConfigs = propertyData.serviceConfigs;

    if (!serviceConfigs || Object.keys(serviceConfigs).length === 0) {
      return NextResponse.json({ updated: 0, message: "Nessuna configurazione presente" });
    }

    // 2. Trova tutti gli ordini PENDING per questa proprietà
    const ordersQuery = adminDb.collection("orders").where("propertyId", "==", propertyId).where("status", "==", "PENDING");

    const ordersSnapshot = await ordersQuery.get();

    // Inventory caricato una volta: serve a reconcileOrderItems per risolvere
    // prezzo/categoria e per classificare/preservare gli articoli non-biancheria.
    const invSnap = await adminDb.collection("inventory").get();
    const inventory = invSnap.docs.map((d) => {
      const x = d.data() as any;
      return { id: d.id, key: x.key ?? null, name: x.name, sellPrice: x.sellPrice, categoryId: x.categoryId ?? null };
    });

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // 3. Per ogni ordine, ricalcola gli items
    for (const orderDoc of ordersSnapshot.docs) {
      try {
        const orderData = orderDoc.data() as Record<string, any>;
        const cleaningId = orderData.cleaningId;

        // Se l'ordine è collegato a una pulizia, prendi il numero ospiti dalla pulizia
        let guestsCount = 2; // Default
        let cleaningData: Record<string, any> | null = null;

        if (cleaningId) {
          const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
          if (cleaningDoc.exists) {
            cleaningData = cleaningDoc.data() as Record<string, any>;
          }
        }

        // 🔒 GUARDIA CENTRALIZZATA (testata in orderLifecycle):
        //   - pulizia COMPLETED/VERIFIED  → congelato (FIX acconti fantasma)
        //   - biancheria personalizzata   → skip (regola preesistente)
        //   - biancheria propria / no-linen → skip (regola preesistente)
        //   - ordine in stato terminale   → skip
        const skipReason = configRecomputeSkipReason({
          orderStatus: orderData.status,
          cleaning: cleaningData
            ? {
                status: cleaningData.status,
                linenConfigModified: cleaningData.linenConfigModified,
                hasLinenOrder: cleaningData.hasLinenOrder,
              }
            : null,
          propertyUsesOwnLinen: propertyData.usesOwnLinen === true,
        });

        if (skipReason) {
          if (process.env.NODE_ENV !== "production") console.log(`   ⏭️ Ordine ${orderDoc.id} skippato: ${skipReason}`);
          skipped++;
          continue;
        }

        if (cleaningData) {
          guestsCount = cleaningData.guestsCount || 2;
        }

        // Trova la config per questo numero di ospiti
        const config = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)];

        if (!config) {
          if (process.env.NODE_ENV !== "production") console.log(`   ⚠️ Ordine ${orderDoc.id}: nessuna config per ${guestsCount} ospiti`);
          continue;
        }

        // 🎯 CENTRALIZZATO + RICONCILIAZIONE: ricalcola biancheria/kit via linenCore
        // e PRESERVA prodotti pulizia/extra già presenti sull'ordine. Provato (TEST 7).
        const existingItems = Array.isArray(orderData.items) ? orderData.items : [];
        const { finalItems } = reconcileOrderItems(config, inventory, existingItems, getItemName);

        await adminDb.collection("orders").doc(orderDoc.id).update({
          items: finalItems,
          updatedAt: Timestamp.now(),
          itemsUpdatedFromConfig: true,
          guestsCount: guestsCount, // 🔧 Bug #4 fix: sync order.guestsCount con cleaning.guestsCount
        });

        if (process.env.NODE_ENV !== "production") console.log(`   ✅ Ordine ${orderDoc.id} aggiornato: ${finalItems.length} items per ${guestsCount} ospiti`);
        updated++;

      } catch (orderError) {
        console.error(`   ❌ Errore ordine ${orderDoc.id}:`, orderError);
        errors.push(orderDoc.id);
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      errors: errors.length,
      total: ordersSnapshot.docs.length,
      message: `Aggiornati ${updated} ordini, ${skipped} skippati (congelati/personalizzati/biancheria propria)`
    });

  } catch (error) {
    console.error("❌ Errore update-pending-orders:", error);
    return NextResponse.json(
      { error: "Errore server", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
