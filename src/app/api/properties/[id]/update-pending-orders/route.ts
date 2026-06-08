import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { reconcileOrderItems } from "~/lib/linen/linenCore";


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
 * Aggiorna tutti gli ordini PENDING per questa proprietà
 * ricalcolando gli items dalla nuova configurazione
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
        
        if (cleaningId) {
          const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
          if (cleaningDoc.exists) {
            const cleaningData = cleaningDoc.data();
            
            // 🔒 Se la pulizia ha biancheria personalizzata, NON aggiornare l'ordine
            // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
            if (cleaningData.linenConfigModified === true) {
              if (process.env.NODE_ENV !== "production") console.log(`   ⏭️ Ordine ${orderDoc.id} skippato (biancheria personalizzata)`);
              skipped++;
              continue;
            }

            // 🔒 GUARDIA BIANCHERIA (stessa regola di calculateDotazioni / la card):
            // niente biancheria se hasLinenOrder===false, oppure hasLinenOrder assente
            // e proprietà a biancheria propria. In quel caso NON ricalcolare l'ordine.
            // @ts-expect-error TODO-FIX: cleaningData possibly undefined
            const hlo = cleaningData.hasLinenOrder;
            if (hlo === false || (hlo === undefined && propertyData.usesOwnLinen === true)) {
              if (process.env.NODE_ENV !== "production") console.log(`   ⏭️ Ordine ${orderDoc.id} skippato (pulizia senza biancheria / biancheria propria)`);
              skipped++;
              continue;
            }
            
            // @ts-expect-error TODO-FIX: TS18048 'cleaningData' is possibly 'undefined'.
            guestsCount = cleaningData.guestsCount || 2;
          }
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
      message: `Aggiornati ${updated} ordini, ${skipped} skippati (biancheria personalizzata)`
    });
    
  } catch (error) {
    console.error("❌ Errore update-pending-orders:", error);
    return NextResponse.json(
      { error: "Errore server", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
