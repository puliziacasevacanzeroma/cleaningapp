import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { resolveItemDisplayName } from "~/lib/itemNames";

export const dynamic = 'force-dynamic';

/**
 * 🔧 FIX ORDINI DIAGNOSTICATI — Opera SOLO sugli ordini con problemi noti
 * 
 * GET  → Dry-run: mostra cosa farebbe senza toccare nulla
 * POST → Esegue i fix
 * 
 * Fix applicati:
 * 1. PRODUCTS_ONLY → aggiunge biancheria dalla serviceConfigs
 * 2. BLOATED_PICKUP → ricalcola pickupItems con filtro propertyId
 */

const ITEM_NAMES: Record<string, string> = {
  'doubleSheets': 'Lenzuola Matrimoniali', 'singleSheets': 'Lenzuola Singole', 'pillowcases': 'Federe',
  'copripiumino': 'Copripiumino', 'copripiumino_matrimoniale': 'Copripiumino Matrimoniale', 'copripiumino_singolo': 'Copripiumino Singolo',
  'towelsLarge': 'Telo Doccia', 'towelsSmall': 'Asciugamano Bidet', 'towelsFace': 'Asciugamano Viso', 'bathMats': 'Tappetino Scendibagno',
  'item_doubleSheets': 'Lenzuola Matrimoniali', 'item_singleSheets': 'Lenzuola Singole', 'item_pillowcases': 'Federe',
  'item_towelsLarge': 'Telo Doccia', 'item_towelsSmall': 'Asciugamano Bidet', 'item_towelsFace': 'Asciugamano Viso', 'item_bathMats': 'Tappetino Scendibagno',
  'shampoo': 'Shampoo', 'bagnoschiuma': 'Bagnoschiuma', 'sapone': 'Sapone', 'crema': 'Crema Corpo',
};
function getItemName(id: string) { return ITEM_NAMES[id] || id; }

const LINEN_KEYWORDS = ['lenzuol','feder','copri','telo','asciugaman','accappato','tappet','scendi','coperta','cuscin','singol','matrimonial','bagno','viso','bidet','corpo'];
const EXCLUDE_KEYWORDS = ['sapone','shampoo','bagnoschiuma','crema','detersivo','spray','detergente','kit','cortesia','amenities'];

function calculateFallbackLinen(guests: number, bedrooms: number, bathrooms: number) {
  return [
    { id: 'doubleSheets', name: 'Lenzuola Matrimoniali', quantity: bedrooms * 3 },
    { id: 'pillowcases', name: 'Federe', quantity: bedrooms * 2 },
    { id: 'towelsLarge', name: 'Telo Doccia', quantity: guests },
    { id: 'towelsFace', name: 'Asciugamano Viso', quantity: guests },
    { id: 'towelsSmall', name: 'Asciugamano Bidet', quantity: guests },
    { id: 'bathMats', name: 'Tappetino Scendibagno', quantity: bathrooms },
  ];
}

async function handler(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

    const isDryRun = request.method === "GET";
    const FIRESTORE_ID_REGEX = /^[a-zA-Z0-9]{15,}$/;

    // ── 1. Carica dati di supporto ──────────
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [propertiesSnap, inventorySnap, ordersSnap] = await Promise.all([
      adminDb.collection("properties").get(),
      adminDb.collection("inventory").get(),
      adminDb.collection("orders").where("status", "==", "PENDING").get(),
    ]);

    const propertiesMap: Record<string, any> = {};
    propertiesSnap.docs.forEach(doc => {
      const d = doc.data() as Record<string, any>;
      propertiesMap[doc.id] = { id: doc.id, name: d.name, serviceConfigs: d.serviceConfigs || null, bedrooms: d.bedrooms || 1, bathrooms: d.bathrooms || 1, maxGuests: d.maxGuests || 2, usesOwnLinen: d.usesOwnLinen || false };
    });

    const inventoryMap = new Map<string, { name: string; categoryId: string }>();
    inventorySnap.docs.forEach(doc => {
      const d = doc.data() as Record<string, any>;
      inventoryMap.set(doc.id, { name: d.name || doc.id, categoryId: d.categoryId || "" });
      if (d.key) inventoryMap.set(d.key, { name: d.name || doc.id, categoryId: d.categoryId || "" });
    });

    // Filtra solo ordini da oggi in avanti
    const futureOrders = ordersSnap.docs.filter(d => {
      const sd = (d.data() as any).scheduledDate?.toDate?.();
      return sd && sd >= today;
    });

    // ── 2. Identifica ordini con problemi ──────────
    const fixes: any[] = [];

    for (const orderDoc of futureOrders) {
      const data = orderDoc.data() as Record<string, any>;
      const propertyId = data.propertyId;
      const property = propertiesMap[propertyId];
      if (!property) continue;

      const items = data.items || [];
      const pickupItems = data.pickupItems || [];
      const isProductsOnly = data.type === 'PRODUCTS' || data.isProductsOnly === true;
      const hasLinenItems = items.some((i: any) => i.type !== 'cleaning_product' && i.categoryId !== 'prodotti_pulizia');
      const pickupTotal = pickupItems.reduce((s: number, i: any) => s + (i.quantity || 0), 0);

      const fixActions: string[] = [];
      const updateData: Record<string, any> = {};

      // ── FIX 1: PRODUCTS_ONLY → aggiungi biancheria ──────────
      if ((isProductsOnly || !hasLinenItems) && items.length > 0 && !property.usesOwnLinen) {
        // Leggi guestsCount dalla pulizia
        let guestsCount = data.guestsCount || 2;
        const cleaningId = data.cleaningId;
        if (cleaningId) {
          try {
            const cDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
            if (cDoc.exists) {
              const cd = cDoc.data()!;
              if (cd.linenConfigModified === true) continue; // Non toccare
              guestsCount = cd.guestsCount || guestsCount;
            }
          } catch {}
        }

        if (property.serviceConfigs) {
          const config = property.serviceConfigs[guestsCount] || property.serviceConfigs[String(guestsCount)];
          if (config) {
            const linenItems: { id: string; name: string; quantity: number }[] = [];
            if (config.bl) {
              if (config.bl['all'] && Object.keys(config.bl['all']).length > 0) {
                Object.entries(config.bl['all']).forEach(([id, qty]) => { if (typeof qty === 'number' && qty > 0) { const inv = inventoryMap.get(id); linenItems.push({ id, name: inv?.name || getItemName(id), quantity: qty }); }});
              } else {
                Object.entries(config.bl).forEach(([bedId, bedItems]) => {
                  if (bedId !== 'all' && typeof bedItems === 'object' && bedItems !== null) {
                    Object.entries(bedItems as Record<string, number>).forEach(([id, qty]) => {
                      if (typeof qty === 'number' && qty > 0) { const inv = inventoryMap.get(id); const ex = linenItems.find(i => i.id === id); if (ex) ex.quantity += qty; else linenItems.push({ id, name: inv?.name || getItemName(id), quantity: qty }); }
                    });
                  }
                });
              }
            }
            if (config.ba) Object.entries(config.ba).forEach(([id, qty]) => { if (typeof qty === 'number' && qty > 0) { const inv = inventoryMap.get(id); linenItems.push({ id, name: inv?.name || getItemName(id), quantity: qty }); }});
            if (config.ki) Object.entries(config.ki).forEach(([id, qty]) => { if (typeof qty === 'number' && qty > 0) { const inv = inventoryMap.get(id); linenItems.push({ id, name: inv?.name || getItemName(id), quantity: qty }); }});

            // Safety net biancheria letto
            const hasBlItem = linenItems.some(i => ['doubleSheets','singleSheets','pillowcases'].includes(i.id) || inventoryMap.get(i.id)?.categoryId === 'biancheria_letto');
            if (!hasBlItem && linenItems.length > 0) {
              const fb = calculateFallbackLinen(guestsCount, property.bedrooms, property.bathrooms);
              for (const f of fb) { if (['doubleSheets','singleSheets','pillowcases'].includes(f.id) && !linenItems.some(i => i.id === f.id)) linenItems.push(f); }
            }

            if (linenItems.length > 0) {
              const existingProducts = items.filter((i: any) => i.type === 'cleaning_product' || i.categoryId === 'prodotti_pulizia');
              updateData.items = [...linenItems, ...existingProducts];
              updateData.type = 'LINEN';
              updateData.isProductsOnly = false;
              updateData.guestsCount = guestsCount;
              fixActions.push(`ADD_LINEN(+${linenItems.length}items, kept ${existingProducts.length} products)`);
            }
          }
        }
      }

      // ── FIX 2: BLOATED_PICKUP → ricalcola con propertyId ──────────
      if (pickupTotal > 50) {
        // Ricalcola pickup SOLO per questa proprietà
        try {
          const deliveredSnap = await adminDb.collection('orders')
            .where('propertyId', '==', propertyId)
            .where('status', '==', 'DELIVERED')
            .get();
          const pending = deliveredSnap.docs.filter(d => d.data().pickupCompleted !== true);

          const pickupMap = new Map<string, { id: string; name: string; quantity: number }>();
          const pickupOrderIds: string[] = [];
          for (const pDoc of pending) {
            const pData = pDoc.data() as Record<string, any>;
            pickupOrderIds.push(pDoc.id);
            for (const item of (pData.items || [])) {
              const inv = inventoryMap.get(item.id);
              const catId = inv?.categoryId || item.categoryId || "";
              const iName = (inv?.name || item.name || "").toLowerCase();
              if (item.type === 'cleaning_product' || item.categoryId === 'prodotti_pulizia') continue;
              if (['kit_cortesia','prodotti_pulizia','cleaning_products'].includes(catId)) continue;
              if (EXCLUDE_KEYWORDS.some(kw => iName.includes(kw))) continue;
              const isLinen = ['biancheria_letto','biancheria_bagno'].includes(catId) || LINEN_KEYWORDS.some(kw => iName.includes(kw)) || !catId;
              if (!isLinen) continue;
              const key = item.id || item.name;
              const ex = pickupMap.get(key);
              if (ex) ex.quantity += item.quantity || 0;
              else pickupMap.set(key, { id: item.id || key, name: inv?.name || resolveItemDisplayName(item.id, item.name), quantity: item.quantity || 0 });
            }
          }
          const newPickup = Array.from(pickupMap.values()).filter(i => i.quantity > 0);
          const newTotal = newPickup.reduce((s, i) => s + i.quantity, 0);

          updateData.pickupItems = newPickup;
          updateData.pickupFromOrders = pickupOrderIds;
          updateData.includePickup = newPickup.length > 0;
          fixActions.push(`FIX_PICKUP(${pickupTotal}→${newTotal}pz, ${data.pickupFromOrders?.length || 0}→${pickupOrderIds.length}ordini)`);
        } catch (e: any) {
          fixActions.push(`PICKUP_ERROR(${e?.message})`);
        }
      }

      // ── Registra fix ──────────
      if (fixActions.length > 0) {
        const schedDate = data.scheduledDate?.toDate?.();
        fixes.push({
          orderId: orderDoc.id,
          date: schedDate ? schedDate.toISOString().split('T')[0] : '???',
          property: property.name,
          actions: fixActions,
          willUpdate: !isDryRun,
        });

        if (!isDryRun) {
          updateData.updatedAt = Timestamp.now();
          updateData.fixedAt = Timestamp.now();
          updateData.fixedBy = 'diagnose-fix-api';
          await orderDoc.ref.update(updateData);
        }
      }
    }

    return NextResponse.json({
      mode: isDryRun ? 'DRY_RUN' : 'EXECUTED',
      totalScanned: futureOrders.length,
      totalFixed: fixes.length,
      fixes,
    });
  } catch (error) {
    console.error("❌ Errore fix-diagnosed-orders:", error);
    return NextResponse.json({ error: "Errore server", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) { return handler(request); }
export async function POST(request: NextRequest) { return handler(request); }
