import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";


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
        
        // Ricalcola gli items
        const newItems: { id: string; name: string; quantity: number }[] = [];
        
        // Biancheria Letto (bl) - usa 'all' se presente
        if (config.bl) {
          const blSource = config.bl['all'] || config.bl;
          
          if (config.bl['all']) {
            // Usa direttamente 'all'
            Object.entries(config.bl['all']).forEach(([itemId, qty]) => {
              if (typeof qty === 'number' && qty > 0) {
                newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
              }
            });
          } else {
            // Somma da tutti i gruppi letto
            Object.entries(config.bl).forEach(([bedId, items]) => {
              if (typeof items === 'object' && items !== null) {
                Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                  if (typeof qty === 'number' && qty > 0) {
                    const existing = newItems.find(i => i.id === itemId);
                    if (existing) {
                      existing.quantity += qty;
                    } else {
                      newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                    }
                  }
                });
              }
            });
          }
        }
        
        // Biancheria Bagno (ba)
        if (config.ba) {
          Object.entries(config.ba).forEach(([itemId, qty]) => {
            if (typeof qty === 'number' && qty > 0) {
              newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
            }
          });
        }
        
        // Kit Cortesia (ki)
        if (config.ki) {
          Object.entries(config.ki).forEach(([itemId, qty]) => {
            if (typeof qty === 'number' && qty > 0) {
              newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
            }
          });
        }
        
        // Aggiorna l'ordine
        await adminDb.collection("orders").doc(orderDoc.id).update( {
          items: newItems,
          updatedAt: Timestamp.now(),
          itemsUpdatedFromConfig: true,
        });
        
        if (process.env.NODE_ENV !== "production") console.log(`   ✅ Ordine ${orderDoc.id} aggiornato: ${newItems.length} items per ${guestsCount} ospiti`);
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
