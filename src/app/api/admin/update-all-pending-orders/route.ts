import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { resolveItemDisplayName } from "~/lib/itemNames";

export const dynamic = 'force-dynamic';

/**
 * 🔄 API Admin: Ricalcola items + pickupItems di TUTTI gli ordini PENDING/ASSIGNED
 * 
 * POST → Ricalcola items dalla serviceConfigs attuale + ricalcola pickupItems con filtro propertyId
 * GET  → Conteggio ordini da aggiornare (dry-run)
 * 
 * Risolve:
 * - Ordini con items mancanti (solo kit cortesia quando serviva anche biancheria)
 * - Ordini con pickupItems gonfiati (mancava filtro propertyId)
 * - Ordini con nomi item = ID Firestore
 */

// ── ITEM NAME RESOLUTION (server-side, usa mapping centralizzato) ──────────

const ITEM_NAMES: Record<string, string> = {
  'doubleSheets': 'Lenzuola Matrimoniali', 'singleSheets': 'Lenzuola Singole', 'pillowcases': 'Federe',
  'copripiumino': 'Copripiumino', 'copripiumino_matrimoniale': 'Copripiumino Matrimoniale', 'copripiumino_singolo': 'Copripiumino Singolo',
  'towelsLarge': 'Telo Doccia', 'towelsSmall': 'Asciugamano Bidet', 'towelsFace': 'Asciugamano Viso', 'bathMats': 'Tappetino Scendibagno',
  'item_doubleSheets': 'Lenzuola Matrimoniali', 'item_singleSheets': 'Lenzuola Singole', 'item_pillowcases': 'Federe',
  'item_towelsLarge': 'Telo Doccia', 'item_towelsSmall': 'Asciugamano Bidet', 'item_towelsFace': 'Asciugamano Viso', 'item_bathMats': 'Tappetino Scendibagno',
  'shampoo': 'Shampoo', 'bagnoschiuma': 'Bagnoschiuma', 'sapone': 'Sapone', 'crema': 'Crema Corpo',
};
function getItemName(itemId: string): string { return ITEM_NAMES[itemId] || itemId; }

// ── PICKUP CALCULATION (con filtro propertyId CORRETTO) ──────────

const LINEN_KEYWORDS = ['lenzuol', 'feder', 'copri', 'telo', 'asciugaman', 'accappato', 'tappet', 'scendi', 'coperta', 'cuscin', 'singol', 'matrimonial', 'bagno', 'viso', 'bidet', 'corpo'];
const EXCLUDE_KEYWORDS = ['sapone', 'shampoo', 'bagnoschiuma', 'crema', 'detersivo', 'spray', 'detergente', 'kit', 'cortesia', 'amenities'];
const PICKUP_CATEGORIES = ["biancheria_letto", "biancheria_bagno"];
const EXCLUDE_CATEGORIES = ["kit_cortesia", "prodotti_pulizia", "cleaning_products"];

async function calculatePickupForProperty(
  propertyId: string,
  inventoryMap: Map<string, { name: string; categoryId: string }>,
  excludeOrderId?: string
): Promise<{ pickupItems: { id: string; name: string; quantity: number }[]; pickupFromOrders: string[] }> {
  try {
    // 🔥 FIX: Filtro propertyId PRESENTE
    const deliveredSnap = await adminDb.collection('orders')
      .where('propertyId', '==', propertyId)
      .where('status', '==', 'DELIVERED')
      .get();

    const pendingOrders = deliveredSnap.docs.filter(d => {
      const data = d.data() as Record<string, any>;
      return data.pickupCompleted !== true && d.id !== excludeOrderId;
    });

    if (pendingOrders.length === 0) {
      return { pickupItems: [], pickupFromOrders: [] };
    }

    const itemsMap = new Map<string, { id: string; name: string; quantity: number }>();
    const orderIds: string[] = [];

    for (const doc of pendingOrders) {
      const data = doc.data() as Record<string, any>;
      orderIds.push(doc.id);

      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const invItem = inventoryMap.get(item.id);
          const categoryId = invItem?.categoryId || item.categoryId || "";
          const itemName = (invItem?.name || item.name || "").toLowerCase();
          const itemType = (item.type || "").toLowerCase();

          // Determina se è biancheria
          if (itemType === "cleaning_product" || itemType === "kit_cortesia") continue;
          if (EXCLUDE_CATEGORIES.includes(categoryId)) continue;
          if (EXCLUDE_KEYWORDS.some(kw => itemName.includes(kw))) continue;
          const isLinen = PICKUP_CATEGORIES.includes(categoryId) || 
                          LINEN_KEYWORDS.some(kw => itemName.includes(kw)) ||
                          !categoryId;
          if (!isLinen) continue;

          const itemKey = item.id || item.name;
          const existing = itemsMap.get(itemKey);
          if (existing) {
            existing.quantity += item.quantity || 0;
          } else {
            itemsMap.set(itemKey, {
              id: item.id || itemKey,
              name: invItem?.name || resolveItemDisplayName(item.id, item.name),
              quantity: item.quantity || 0
            });
          }
        }
      }
    }

    return { 
      pickupItems: Array.from(itemsMap.values()).filter(i => i.quantity > 0), 
      pickupFromOrders: orderIds 
    };
  } catch {
    return { pickupItems: [], pickupFromOrders: [] };
  }
}

// ── FALLBACK LINEN CALCULATION ──────────

function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number): { id: string; name: string; quantity: number }[] {
  const items: { id: string; name: string; quantity: number }[] = [];
  items.push({ id: 'doubleSheets', name: 'Lenzuola Matrimoniali', quantity: bedrooms * 3 });
  items.push({ id: 'pillowcases', name: 'Federe', quantity: bedrooms * 2 });
  items.push({ id: 'towelsLarge', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'towelsFace', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'towelsSmall', name: 'Asciugamano Bidet', quantity: guestsCount });
  items.push({ id: 'bathMats', name: 'Tappetino Scendibagno', quantity: bathrooms });
  return items;
}

// ── POST: Ricalcola tutti gli ordini PENDING/ASSIGNED ──────────

export async function POST(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

    // 1. Carica tutte le proprietà con serviceConfigs
    const propertiesSnapshot = await adminDb.collection("properties").get();
    const propertiesMap: Record<string, any> = {};
    propertiesSnapshot.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      propertiesMap[doc.id] = { 
        id: doc.id, 
        name: data.name, 
        serviceConfigs: data.serviceConfigs || null,
        bedrooms: data.bedrooms || 1,
        bathrooms: data.bathrooms || 1,
        maxGuests: data.maxGuests || 2,
        usesOwnLinen: data.usesOwnLinen || false,
      };
    });

    // 2. Carica inventario per categorie e nomi
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryMap = new Map<string, { name: string; categoryId: string }>();
    inventorySnap.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      const itemData = { name: data.name || doc.id, categoryId: data.categoryId || "" };
      inventoryMap.set(doc.id, itemData);
      if (data.key) inventoryMap.set(data.key, itemData);
    });

    // 3. Carica ordini PENDING e ASSIGNED
    const [pendingSnap, assignedSnap] = await Promise.all([
      adminDb.collection("orders").where("status", "==", "PENDING").get(),
      adminDb.collection("orders").where("status", "==", "ASSIGNED").get(),
    ]);
    const allOrders = [...pendingSnap.docs, ...assignedSnap.docs];

    let itemsUpdated = 0;
    let pickupUpdated = 0;
    let skipped = 0;
    let noConfig = 0;
    const errors: string[] = [];
    const details: any[] = [];

    for (const orderDoc of allOrders) {
      try {
        const orderData = orderDoc.data() as Record<string, any>;
        const propertyId = orderData.propertyId;
        const cleaningId = orderData.cleaningId;
        const property = propertiesMap[propertyId];
        if (!property) { noConfig++; continue; }

        // Leggi guestsCount dalla pulizia collegata
        let guestsCount = orderData.guestsCount || 2;
        let linenConfigModified = false;
        if (cleaningId) {
          try {
            const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
            if (cleaningDoc.exists) {
              const cleaningData = cleaningDoc.data()!;
              if (cleaningData.linenConfigModified === true) { 
                linenConfigModified = true;
                skipped++; 
                continue; // Non toccare ordini con config modificata manualmente
              }
              guestsCount = cleaningData.guestsCount || guestsCount;
            }
          } catch { /* ignora errore lettura pulizia */ }
        }

        // ═══ RICALCOLA ITEMS ═══
        const updateData: Record<string, any> = { updatedAt: Timestamp.now() };
        let itemsChanged = false;
        let pickupChanged = false;

        if (property.serviceConfigs) {
          const serviceConfigs = property.serviceConfigs;
          const config = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)];
          
          if (config) {
            const newItems: { id: string; name: string; quantity: number }[] = [];
            
            // Biancheria Letto — 🔥 FIX: MERGE bl['all'] con gruppi letto
            if (config.bl) {
              const blKeys = Object.keys(config.bl);
              const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
              const bedGroupKeys = blKeys.filter((k: string) => k !== 'all');
              const hasBedGroups = bedGroupKeys.length > 0 && bedGroupKeys.some((k: string) => {
                const grpItems = config.bl[k];
                return grpItems && typeof grpItems === 'object' && Object.keys(grpItems).length > 0;
              });

              if (hasAll && hasBedGroups) {
                const merged: Record<string, number> = {};
                bedGroupKeys.forEach((k: string) => {
                  const grpItems = config.bl[k];
                  if (grpItems && typeof grpItems === 'object') {
                    Object.entries(grpItems as Record<string, number>).forEach(([itemId, qty]) => {
                      if (typeof qty === 'number' && qty > 0) merged[itemId] = (merged[itemId] || 0) + qty;
                    });
                  }
                });
                Object.entries(config.bl['all']).forEach(([itemId, qty]) => {
                  if (typeof qty === 'number' && qty > 0) merged[itemId] = qty as number;
                });
                Object.entries(merged).forEach(([itemId, qty]) => {
                  if (qty > 0) {
                    const invItem = inventoryMap.get(itemId);
                    newItems.push({ id: itemId, name: invItem?.name || getItemName(itemId), quantity: qty });
                  }
                });
              } else if (hasAll) {
                Object.entries(config.bl['all']).forEach(([itemId, qty]) => { 
                  if (typeof qty === 'number' && qty > 0) {
                    const invItem = inventoryMap.get(itemId);
                    newItems.push({ id: itemId, name: invItem?.name || getItemName(itemId), quantity: qty }); 
                  }
                });
              } else {
                Object.entries(config.bl).forEach(([bedId, items]) => {
                  if (bedId !== 'all' && typeof items === 'object' && items !== null) {
                    Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                      if (typeof qty === 'number' && qty > 0) { 
                        const invItem = inventoryMap.get(itemId);
                        const existing = newItems.find(i => i.id === itemId); 
                        if (existing) existing.quantity += qty; 
                        else newItems.push({ id: itemId, name: invItem?.name || getItemName(itemId), quantity: qty }); 
                      }
                    });
                  }
                });
              }
            }
            
            // Biancheria Bagno
            if (config.ba) { 
              Object.entries(config.ba).forEach(([itemId, qty]) => { 
                if (typeof qty === 'number' && qty > 0) {
                  const invItem = inventoryMap.get(itemId);
                  newItems.push({ id: itemId, name: invItem?.name || getItemName(itemId), quantity: qty }); 
                }
              }); 
            }
            
            // Kit Cortesia
            if (config.ki) { 
              Object.entries(config.ki).forEach(([itemId, qty]) => { 
                if (typeof qty === 'number' && qty > 0) {
                  const invItem = inventoryMap.get(itemId);
                  newItems.push({ id: itemId, name: invItem?.name || getItemName(itemId), quantity: qty }); 
                }
              }); 
            }

            // Safety net: se ha ki/ba ma nessun bl, inietta fallback biancheria letto
            const hasBlItem = newItems.some(i => {
              const cat = inventoryMap.get(i.id)?.categoryId || "";
              return cat === "biancheria_letto" || ['doubleSheets','singleSheets','pillowcases'].includes(i.id);
            });
            if (!hasBlItem && newItems.length > 0) {
              const fallback = calculateFallbackLinen(guestsCount, property.bedrooms, property.bathrooms);
              for (const fb of fallback) {
                const isBl = fb.id === 'doubleSheets' || fb.id === 'singleSheets' || fb.id === 'pillowcases';
                if (isBl && !newItems.some(i => i.id === fb.id)) {
                  newItems.push(fb);
                }
              }
            }

            if (newItems.length > 0) {
              // Confronta per evitare update inutili
              const oldSorted = JSON.stringify((orderData.items || []).map((i: any) => ({ id: i.id, q: i.quantity })).sort((a: any, b: any) => a.id.localeCompare(b.id)));
              const newSorted = JSON.stringify(newItems.map(i => ({ id: i.id, q: i.quantity })).sort((a, b) => a.id.localeCompare(b.id)));
              
              if (oldSorted !== newSorted) {
                updateData.items = newItems;
                updateData.itemsRecalculatedAt = Timestamp.now();
                itemsChanged = true;
              }
            }
          } else {
            noConfig++;
          }
        } else {
          noConfig++;
        }

        // ═══ RICALCOLA PICKUP ITEMS ═══
        if (orderData.includePickup !== false) {
          const pickupData = await calculatePickupForProperty(propertyId, inventoryMap, orderDoc.id);
          
          const oldPickupCount = (orderData.pickupItems || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0);
          const newPickupCount = pickupData.pickupItems.reduce((s, i) => s + i.quantity, 0);
          
          // Aggiorna se cambiano items o se i numeri sono molto diversi
          if (oldPickupCount !== newPickupCount || 
              (orderData.pickupFromOrders || []).length !== pickupData.pickupFromOrders.length) {
            updateData.pickupItems = pickupData.pickupItems;
            updateData.pickupFromOrders = pickupData.pickupFromOrders;
            updateData.includePickup = pickupData.pickupItems.length > 0;
            updateData.pickupRecalculatedAt = Timestamp.now();
            pickupChanged = true;
          }
        }

        // ═══ SALVA SE CAMBIATO ═══
        if (itemsChanged || pickupChanged) {
          await orderDoc.ref.update(updateData);
          if (itemsChanged) itemsUpdated++;
          if (pickupChanged) pickupUpdated++;
          details.push({
            orderId: orderDoc.id,
            property: property.name,
            status: orderData.status,
            itemsChanged,
            pickupChanged,
            newItemsCount: itemsChanged ? updateData.items?.length : undefined,
            newPickupCount: pickupChanged ? updateData.pickupItems?.length : undefined,
          });
        }
      } catch (orderError) { 
        console.error(`❌ Errore ordine ${orderDoc.id}:`, orderError); 
        errors.push(orderDoc.id); 
      }
    }

    return NextResponse.json({ 
      success: true, 
      itemsUpdated, 
      pickupUpdated, 
      skipped, 
      noConfig, 
      errors: errors.length, 
      total: allOrders.length, 
      details: details.slice(0, 50), // Primi 50 dettagli
      message: `Aggiornati ${itemsUpdated} items + ${pickupUpdated} pickup su ${allOrders.length} ordini totali` 
    });
  } catch (error) {
    console.error("❌ Errore update-all-pending-orders:", error);
    return NextResponse.json({ error: "Errore server", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// ── GET: Dry-run — conta ordini da aggiornare ──────────

export async function GET() {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

    const [pendingSnap, assignedSnap] = await Promise.all([
      adminDb.collection("orders").where("status", "==", "PENDING").get(),
      adminDb.collection("orders").where("status", "==", "ASSIGNED").get(),
    ]);
    
    return NextResponse.json({ 
      pendingOrders: pendingSnap.docs.length, 
      assignedOrders: assignedSnap.docs.length,
      total: pendingSnap.docs.length + assignedSnap.docs.length,
      message: `Ci sono ${pendingSnap.docs.length} PENDING + ${assignedSnap.docs.length} ASSIGNED. Usa POST per aggiornarli.` 
    });
  } catch (error) { 
    return NextResponse.json({ error: "Errore" }, { status: 500 }); 
  }
}
