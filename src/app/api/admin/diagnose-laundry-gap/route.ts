import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

/**
 * DIAGNOSI: Discrepanza requestedItems vs ordini reali
 *
 * Confronta per ogni laundryDelivery:
 * 1. requestedItems salvati (quello che ha visto la lavanderia)
 * 2. Ordini reali in Firestore al momento dell'analisi
 * 3. Differenza item per item
 * 4. Causa probabile (ordini aggiunti dopo lo start, bug percentuale, ecc.)
 */

const LINEN_ITEM_IDS = new Set([
  'doubleSheets','singleSheets','pillowcases','copripiumino',
  'copripiumino_matrimoniale','copripiumino_singolo',
  'item_doubleSheets','item_singleSheets','item_pillowcases',
  'item_copripiumino','item_copripiumino_matrimoniale','item_copripiumino_singolo',
  'lenzuola_matrimoniale','lenzuola_singolo','federa',
  'towelsLarge','towelsSmall','towelsFace','bathMats',
  'item_towelsLarge','item_towelsSmall','item_towelsFace','item_bathMats',
  'asciugamano_grande','asciugamano_piccolo','asciugamano_viso',
  'asciugamano_ospite','telo_doccia','tappetino_bagno',
]);
const LINEN_NAMES = new Set([
  'Lenzuola Matrimoniali','Lenzuola Singole','Federe','Copripiumino',
  'Copripiumino Matrimoniale','Copripiumino Singolo',
  'Telo Doccia','Asciugamano Bidet','Asciugamano Viso','Tappetino Scendibagno',
]);

// Mappa ID → nome display (stesso mapping usato da getItemName)
const ITEM_NAME_MAP: Record<string, string> = {
  doubleSheets: 'Lenzuola Matrimoniali',
  item_doubleSheets: 'Lenzuola Matrimoniali',
  lenzuola_matrimoniale: 'Lenzuola Matrimoniali',
  singleSheets: 'Lenzuola Singole',
  item_singleSheets: 'Lenzuola Singole',
  lenzuola_singolo: 'Lenzuola Singole',
  pillowcases: 'Federe',
  item_pillowcases: 'Federe',
  federa: 'Federe',
  copripiumino: 'Copripiumino',
  copripiumino_matrimoniale: 'Copripiumino Matrimoniale',
  item_copripiumino_matrimoniale: 'Copripiumino Matrimoniale',
  copripiumino_singolo: 'Copripiumino Singolo',
  item_copripiumino_singolo: 'Copripiumino Singolo',
  towelsLarge: 'Telo Doccia',
  item_towelsLarge: 'Telo Doccia',
  telo_doccia: 'Telo Doccia',
  towelsSmall: 'Asciugamano Bidet',
  item_towelsSmall: 'Asciugamano Bidet',
  asciugamano_piccolo: 'Asciugamano Bidet',
  towelsFace: 'Asciugamano Viso',
  item_towelsFace: 'Asciugamano Viso',
  asciugamano_viso: 'Asciugamano Viso',
  asciugamano_ospite: 'Asciugamano Viso',
  asciugamano_grande: 'Telo Doccia',
  bathMats: 'Tappetino Scendibagno',
  item_bathMats: 'Tappetino Scendibagno',
  tappetino_bagno: 'Tappetino Scendibagno',
};

function resolveItemName(id: string, name: string): string {
  if (ITEM_NAME_MAP[id]) return ITEM_NAME_MAP[id];
  if (ITEM_NAME_MAP[name]) return ITEM_NAME_MAP[name];
  if (LINEN_NAMES.has(name)) return name;
  return name;
}

function isLinenItem(id: string, name: string): boolean {
  return LINEN_ITEM_IDS.has(id) || LINEN_ITEM_IDS.has(name) || LINEN_NAMES.has(name);
}

export async function GET(request: NextRequest) {
  // Auth check base
  const authHeader = request.headers.get("authorization");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // 1. Carica tutte le laundryDeliveries
    const deliveriesSnap = await adminDb.collection("laundryDeliveries").get();
    if (deliveriesSnap.empty) {
      return NextResponse.json({ message: "Nessuna delivery trovata", deliveries: [] });
    }

    // 2. Carica settings (percentuale e adjustments)
    const settingsSnap = await adminDb.collection("settings").doc("laundryAdjustments").get();
    const settingsData = settingsSnap.exists ? settingsSnap.data() as any : {};
    const defaultPercentage: number = settingsData.defaultPercentage || 0;
    const adjustments: Record<string, any> = settingsData.days || {};

    // 3. Per ogni delivery, carica gli ordini reali di quel giorno
    const results = [];

    for (const deliveryDoc of deliveriesSnap.docs) {
      const delivery = deliveryDoc.data() as any;
      const dateKey: string = delivery.dateKey || deliveryDoc.id;

      // Parse dateKey → range del giorno (00:00 - 23:59)
      const [y, m, d] = dateKey.split("-").map(Number);
      const dayStart = new Date(y, m - 1, d, 0, 0, 0);
      const dayEnd   = new Date(y, m - 1, d, 23, 59, 59);

      // Carica ordini reali per quel giorno (escludi CANCELLED)
      const { Timestamp } = await import("firebase-admin/firestore");
      const ordersSnap = await adminDb.collection("orders")
        .where("scheduledDate", ">=", Timestamp.fromDate(dayStart))
        .where("scheduledDate", "<=", Timestamp.fromDate(dayEnd))
        .get();

      // Calcola totali raw dagli ordini reali
      const rawTotals = new Map<string, number>();
      const ordersDetail: any[] = [];

      ordersSnap.docs.forEach(orderDoc => {
        const o = orderDoc.data() as any;
        if (o.status === "CANCELLED") return;

        const linenItems: any[] = [];
        (o.items || []).forEach((item: any) => {
          const itemId = item.id || "";
          const itemName = item.name || "";
          if (!isLinenItem(itemId, itemName)) return;
          const displayName = resolveItemName(itemId, itemName);
          rawTotals.set(displayName, (rawTotals.get(displayName) || 0) + item.quantity);
          linenItems.push({ id: itemId, name: itemName, displayName, qty: item.quantity });
        });

        if (linenItems.length > 0) {
          ordersDetail.push({
            orderId: orderDoc.id,
            propertyId: o.propertyId,
            status: o.status,
            type: o.type,
            createdAt: o.createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: o.updatedAt?.toDate?.()?.toISOString() || null,
            linenItems,
          });
        }
      });

      // Applica percentuale e override (stessa logica del frontend)
      const adj = adjustments[dateKey];
      const effectivePct = adj?.percentageOverride !== undefined ? adj.percentageOverride : defaultPercentage;
      
      // NOTA: nella pagina lavanderia (src/app/lavanderia/page.tsx riga ~186)
      // l'ordine è: prima itemOverrides, poi percentuale
      // Nella pagina dashboard (src/app/dashboard/lavanderia/page.tsx riga ~257)
      // l'ordine è: prima percentuale, poi itemOverrides
      // Questo è già un bug potenziale!

      const calculatedWithPctFirst = new Map(rawTotals); // logica dashboard
      if (effectivePct !== 0) {
        for (const [name, qty] of calculatedWithPctFirst) {
          if (!adj?.itemOverrides || adj.itemOverrides[name] === undefined) {
            calculatedWithPctFirst.set(name, Math.round(qty * (1 + effectivePct / 100)));
          }
        }
      }
      if (adj?.itemOverrides) {
        for (const [n, v] of Object.entries(adj.itemOverrides)) {
          calculatedWithPctFirst.set(n, v as number);
        }
      }

      const calculatedWithOverrideFirst = new Map(rawTotals); // logica lavanderia
      if (adj?.itemOverrides) {
        for (const [n, v] of Object.entries(adj.itemOverrides)) {
          calculatedWithOverrideFirst.set(n, v as number);
        }
      }
      if (effectivePct !== 0) {
        for (const [name, qty] of calculatedWithOverrideFirst) {
          if (!adj?.itemOverrides || adj.itemOverrides[name] === undefined) {
            calculatedWithOverrideFirst.set(name, Math.round(qty * (1 + effectivePct / 100)));
          }
        }
      }

      // Confronto item per item
      const requestedItems: Record<string, number> = delivery.requestedItems || {};
      const allItemNames = new Set([
        ...Object.keys(requestedItems),
        ...Array.from(calculatedWithPctFirst.keys()),
      ]);

      const itemDiffs: any[] = [];
      let totalGap = 0;
      let hasGap = false;

      for (const name of allItemNames) {
        const requested = requestedItems[name] || 0;
        const currentRaw = rawTotals.get(name) || 0;
        const currentWithPct = calculatedWithPctFirst.get(name) || 0;
        const currentOverrideFirst = calculatedWithOverrideFirst.get(name) || 0;
        const gap = currentWithPct - requested;

        if (Math.abs(gap) > 0) hasGap = true;
        totalGap += Math.abs(gap);

        itemDiffs.push({
          item: name,
          requestedAtStart: requested,
          rawFromOrders: currentRaw,
          calculatedDashboard: currentWithPct,    // logica dashboard (pct poi override)
          calculatedLavanderia: currentOverrideFirst, // logica lavanderia (override poi pct)
          gap,
          gapPct: requested > 0 ? Math.round((gap / requested) * 100) : null,
          differentLogicResult: currentWithPct !== currentOverrideFirst,
        });
      }

      // Analisi causa
      const causes: string[] = [];

      // Causa 1: ordini aggiunti dopo lo start
      const startedAt = delivery.startedAt?.toDate?.()?.toISOString() || null;
      if (startedAt) {
        const startTime = new Date(startedAt);
        const lateOrders = ordersDetail.filter(o => {
          const created = o.createdAt ? new Date(o.createdAt) : null;
          return created && created > startTime;
        });
        if (lateOrders.length > 0) {
          causes.push(`${lateOrders.length} ordini creati DOPO lo start della delivery (${startedAt})`);
        }
      }

      // Causa 2: bug ordine applicazione (override first vs pct first)
      const logicBugItems = itemDiffs.filter(d => d.differentLogicResult);
      if (logicBugItems.length > 0) {
        causes.push(`BUG LOGICA: ${logicBugItems.length} item hanno risultati diversi tra dashboard e pagina lavanderia (ordine override/percentuale invertito)`);
      }

      // Causa 3: ordini cancellati dopo lo start
      const allOrdersSnap = await adminDb.collection("orders")
        .where("scheduledDate", ">=", Timestamp.fromDate(dayStart))
        .where("scheduledDate", "<=", Timestamp.fromDate(dayEnd))
        .where("status", "==", "CANCELLED")
        .get();
      if (!allOrdersSnap.empty) {
        causes.push(`${allOrdersSnap.size} ordini CANCELLATI per questo giorno (non inclusi nel calcolo attuale)`);
      }

      // Causa 4: nessun ordine trovato ora ma requestedItems esistono
      if (ordersSnap.size === 0 && Object.keys(requestedItems).length > 0) {
        causes.push("ATTENZIONE: nessun ordine trovato in Firestore per questo giorno, ma requestedItems esistono (ordini potrebbero essere stati eliminati)");
      }

      results.push({
        dateKey,
        status: delivery.status,
        startedAt,
        startedByName: delivery.startedByName || null,
        completedAt: delivery.completedAt?.toDate?.()?.toISOString() || null,
        completedByName: delivery.completedByName || null,
        inventoryApplied: delivery.inventoryApplied || false,

        // Contatori
        totalOrdersNow: ordersSnap.size,
        totalOrdersWithLinen: ordersDetail.length,
        requestedItemsTotal: Object.values(requestedItems).reduce((s, v) => s + v, 0),
        calculatedTotal: Array.from(calculatedWithPctFirst.values()).reduce((s, v) => s + v, 0),
        totalGap,
        hasGap,

        // Settings applicati
        defaultPercentage,
        effectivePct,
        hasCustomAdjustment: !!adj,
        itemOverrides: adj?.itemOverrides || null,

        // Dettaglio item
        itemDiffs: itemDiffs.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)),

        // Causa probabile
        causes: causes.length > 0 ? causes : ["Nessuna discrepanza rilevata o causa non identificata"],

        // Ordini dettagliati (solo se gap > 0)
        ordersDetail: hasGap ? ordersDetail : [],
      });
    }

    // Ordina per data
    results.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    // Summary globale
    const summary = {
      totalDeliveries: results.length,
      withGap: results.filter(r => r.hasGap).length,
      withoutGap: results.filter(r => !r.hasGap).length,
      logicBugDetected: results.some(r => r.itemDiffs.some((d: any) => d.differentLogicResult)),
      defaultPercentage,
    };

    return NextResponse.json({ summary, results });

  } catch (error: any) {
    console.error("Errore diagnosi lavanderia:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
