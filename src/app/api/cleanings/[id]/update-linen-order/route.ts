import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";
import { getApiUser } from "~/lib/api-auth";


export const dynamic = 'force-dynamic';

/**
 * POST /api/cleanings/[id]/update-linen-order
 * 
 * Aggiorna l'ordine biancheria PENDING collegato a questa specifica pulizia.
 * Ricalcola gli items in base a:
 * - customLinenConfig della pulizia (se linenConfigModified === true)
 * - serviceConfigs della proprietà (altrimenti)
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

    const { id: cleaningId } = await params;
    
    // 1. Carica la pulizia
    const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
    if (!cleaningDoc.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaningData = cleaningDoc.data() as Record<string, any>;
    const propertyId = cleaningData.propertyId;
    const guestsCount = cleaningData.guestsCount || 2;
    const hasCustomConfig = cleaningData.linenConfigModified === true && cleaningData.customLinenConfig;
    
    if (process.env.NODE_ENV !== "production") console.log(`   Proprietà: ${propertyId}, Ospiti: ${guestsCount}, Custom: ${hasCustomConfig}`);
    
    // 2. Trova l'ordine PENDING collegato a questa pulizia
    const ordersQuery = adminDb.collection("orders").where("cleaningId", "==", cleaningId).where("status", "==", "PENDING");
    
    const ordersSnapshot = await ordersQuery.get();
    
    if (ordersSnapshot.empty) {
      if (process.env.NODE_ENV !== "production") console.log(`   ⚠️ Nessun ordine PENDING trovato per questa pulizia`);
      return NextResponse.json({ 
        success: true, 
        updated: 0, 
        message: "Nessun ordine PENDING trovato" 
      });
    }
    
    // 3. Determina la fonte degli items
    let config: any = null;
    let configSource = "";
    
    if (hasCustomConfig) {
      // Usa la configurazione personalizzata della pulizia
      config = cleaningData.customLinenConfig;
      configSource = "customLinenConfig";
      if (process.env.NODE_ENV !== "production") console.log(`   📦 Usando customLinenConfig della pulizia`);
    } else {
      // Usa serviceConfigs della proprietà
      const propertyDoc = await adminDb.collection("properties").doc(propertyId).get();
      if (!propertyDoc.exists) {
        return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
      }
      
      const propertyData = propertyDoc.data() as Record<string, any>;
      const serviceConfigs = propertyData.serviceConfigs;
      
      if (!serviceConfigs) {
        if (process.env.NODE_ENV !== "production") console.log(`   ⚠️ Nessuna serviceConfigs nella proprietà`);
        return NextResponse.json({ 
          success: true, 
          updated: 0, 
          message: "Nessuna configurazione nella proprietà" 
        });
      }
      
      // Cerca la config per questo numero di ospiti (numero o stringa)
      config = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)];
      configSource = `serviceConfigs[${guestsCount}]`;
      
      if (!config) {
        if (process.env.NODE_ENV !== "production") console.log(`   ⚠️ Nessuna config per ${guestsCount} ospiti`);
        return NextResponse.json({ 
          success: true, 
          updated: 0, 
          message: `Nessuna configurazione per ${guestsCount} ospiti` 
        });
      }
      
      if (process.env.NODE_ENV !== "production") console.log(`   📦 Usando ${configSource} dalla proprietà`);
    }
    
    // 4. Calcola i nuovi items
    const newItems: { id: string; name: string; quantity: number }[] = [];
    
    // Biancheria Letto (bl) - usa 'all' come fonte di verità
    if (config.bl) {
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
    
    if (process.env.NODE_ENV !== "production") console.log(`   📋 Calcolati ${newItems.length} items:`, newItems.map(i => `${i.name}:${i.quantity}`).join(', '));
    
    // 5. Aggiorna tutti gli ordini trovati (dovrebbe essere 1)
    let updated = 0;
    for (const orderDoc of ordersSnapshot.docs) {
      await adminDb.collection("orders").doc(orderDoc.id).update({
        items: newItems,
        updatedAt: Timestamp.now(),
        itemsUpdatedFromConfig: true,
        configSource: configSource,
      });
      if (process.env.NODE_ENV !== "production") console.log(`   ✅ Ordine ${orderDoc.id} aggiornato`);
      updated++;
    }
    
    return NextResponse.json({
      success: true,
      updated,
      items: newItems.length,
      configSource,
      message: `Aggiornato ordine con ${newItems.length} items da ${configSource}`
    });
    
  } catch (error) {
    console.error("❌ [UpdateLinenOrder] Errore:", error);
    return NextResponse.json(
      { error: "Errore server", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
