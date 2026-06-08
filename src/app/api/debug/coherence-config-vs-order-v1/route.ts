import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import {
  buildExpectedItems,
  buildInvMap,
  resolveInv,
  MANAGED_CATS,
  type InventoryItem,
} from "~/lib/linen/linenCore";

export const dynamic = "force-dynamic";

/**
 * DIAGNOSTICA READ-ONLY — Coerenza CONFIG vs ORDINE.
 *
 * Per ogni ordine confronta:
 *   atteso = buildExpectedItems(config)   ← config = customLinenConfig se
 *            linenConfigModified, altrimenti serviceConfigs[ospiti]
 *   reale  = order.items (solo categorie gestite: letto/bagno/kit)
 *
 * Gli ID sono normalizzati a id-inventory canonico (linenCore.resolveInv) così
 * doubleSheets / doc.id / item_* dello stesso articolo NON risultano diversi.
 * Prodotti pulizia, extra e fee NON entrano nel confronto (sono preservati).
 *
 * NB sulla catena:
 *  - card === pagamenti  → ora è SEMPRE vero (entrambe leggono order.items).
 *  - configuratore === ordine → è ciò che questo endpoint verifica. Un ordine
 *    "divergente" è un ordine congelato prima del refactor, da rigenerare.
 *
 * Uso: /api/debug/coherence-config-vs-order-v1?cronSecret=XXX
 *      &status=PENDING   (default; oppure DELIVERED, oppure all)
 *      &propertyName=arya (opzionale, filtro per nome)
 *      &includeCoherent=1 (opzionale: includi anche i coerenti nell'elenco)
 */

type DiffRow = { id: string; name: string; expected: number; order: number };

function normalizeToCanonical(
  itemId: string,
  invMap: Map<string, InventoryItem>
): { id: string; name: string; categoryId: string | null } {
  const inv = resolveInv(itemId, invMap);
  return {
    id: inv?.id ?? itemId,
    name: inv?.name ?? itemId,
    categoryId: inv?.categoryId ?? null,
  };
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const statusParam = (req.nextUrl.searchParams.get("status") || "PENDING").toUpperCase();
  const propertyNameFilter = (req.nextUrl.searchParams.get("propertyName") || "").toLowerCase();
  const includeCoherent = req.nextUrl.searchParams.get("includeCoherent") === "1";

  try {
    // Inventory
    const invSnap = await adminDb.collection("inventory").get();
    const inventory: InventoryItem[] = invSnap.docs.map((d) => {
      const x = d.data() as any;
      return { id: d.id, key: x.key ?? null, name: x.name, sellPrice: x.sellPrice, categoryId: x.categoryId ?? null };
    });
    const invMap = buildInvMap(inventory);

    // Properties (map)
    const propSnap = await adminDb.collection("properties").get();
    const propMap = new Map<string, any>();
    propSnap.docs.forEach((d) => propMap.set(d.id, { id: d.id, ...(d.data() as any) }));

    // Cleanings (map)
    const cleanSnap = await adminDb.collection("cleanings").get();
    const cleanMap = new Map<string, any>();
    cleanSnap.docs.forEach((d) => cleanMap.set(d.id, { id: d.id, ...(d.data() as any) }));

    // Orders
    let ordersQuery: FirebaseFirestore.Query = adminDb.collection("orders");
    if (statusParam !== "ALL") ordersQuery = ordersQuery.where("status", "==", statusParam);
    const ordersSnap = await ordersQuery.get();

    const results: any[] = [];
    let scanned = 0;
    let coherent = 0;
    let divergent = 0;
    let cannotEvaluate = 0;

    for (const od of ordersSnap.docs) {
      const order = od.data() as any;
      const property = order.propertyId ? propMap.get(order.propertyId) : null;
      const propertyName = property?.name || order.propertyName || "(sconosciuta)";

      if (propertyNameFilter && !String(propertyName).toLowerCase().includes(propertyNameFilter)) continue;

      scanned++;

      // Risolvi config
      const cleaning = order.cleaningId ? cleanMap.get(order.cleaningId) : null;
      const guests =
        (cleaning && typeof cleaning.guestsCount === "number" && cleaning.guestsCount) ||
        (typeof order.guestsCount === "number" && order.guestsCount) ||
        2;

      let config: any = null;
      let configSource = "";
      if (cleaning && cleaning.linenConfigModified === true && cleaning.customLinenConfig) {
        config = cleaning.customLinenConfig;
        configSource = "customLinenConfig";
      } else if (property?.serviceConfigs) {
        config = property.serviceConfigs[guests] || property.serviceConfigs[String(guests)];
        configSource = `serviceConfigs[${guests}]`;
      }

      if (!config) {
        cannotEvaluate++;
        results.push({
          orderId: od.id,
          propertyName,
          status: order.status,
          guests,
          cleaningId: order.cleaningId || null,
          verdict: "NO_CONFIG",
          note: cleaning ? "config assente per questo n. ospiti" : "ordine senza pulizia collegata o pulizia mancante",
        });
        continue;
      }

      // Atteso (managed) normalizzato → mappa id canonico → qty
      const expectedMap = new Map<string, { qty: number; name: string }>();
      buildExpectedItems(config).forEach((e) => {
        const c = normalizeToCanonical(e.itemId, invMap);
        const prev = expectedMap.get(c.id);
        expectedMap.set(c.id, { qty: (prev?.qty || 0) + e.quantity, name: c.name });
      });

      // Reale (solo managed) normalizzato
      const orderMap = new Map<string, { qty: number; name: string }>();
      (Array.isArray(order.items) ? order.items : []).forEach((it: any) => {
        const qty = typeof it?.quantity === "number" ? it.quantity : 0;
        if (qty <= 0) return;
        const rawId = it?.itemId || it?.id;
        if (!rawId) return;
        const c = normalizeToCanonical(rawId, invMap);
        // categoria: esplicita sull'item, altrimenti da inventory
        let cat: string | null = it?.categoryId || null;
        if (!cat && it?.categoryName) {
          const cn = String(it.categoryName).toLowerCase();
          if (cn.includes("letto")) cat = "biancheria_letto";
          else if (cn.includes("bagno")) cat = "biancheria_bagno";
          else if (cn.includes("kit") || cn.includes("cortesia")) cat = "kit_cortesia";
        }
        if (!cat) cat = c.categoryId;
        if (!cat || !MANAGED_CATS.has(cat)) return; // ignora prodotti/extra/fee/orfani
        const prev = orderMap.get(c.id);
        orderMap.set(c.id, { qty: (prev?.qty || 0) + qty, name: c.name });
      });

      // Diff
      const diffs: DiffRow[] = [];
      const allIds = new Set<string>([...expectedMap.keys(), ...orderMap.keys()]);
      allIds.forEach((id) => {
        const e = expectedMap.get(id)?.qty || 0;
        const o = orderMap.get(id)?.qty || 0;
        if (e !== o) {
          diffs.push({
            id,
            name: expectedMap.get(id)?.name || orderMap.get(id)?.name || id,
            expected: e,
            order: o,
          });
        }
      });

      if (diffs.length === 0) {
        coherent++;
        if (includeCoherent) {
          results.push({ orderId: od.id, propertyName, status: order.status, guests, configSource, verdict: "OK" });
        }
      } else {
        divergent++;
        results.push({
          orderId: od.id,
          propertyName,
          status: order.status,
          guests,
          cleaningId: order.cleaningId || null,
          configSource,
          verdict: "DIVERGENT",
          diffs: diffs.sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    }

    results.sort((a, b) => {
      const rank: Record<string, number> = { DIVERGENT: 2, NO_CONFIG: 1, OK: 0 };
      return (rank[b.verdict] || 0) - (rank[a.verdict] || 0) || String(a.propertyName).localeCompare(String(b.propertyName));
    });

    return NextResponse.json({
      readOnly: true,
      generatedAt: new Date().toISOString(),
      filters: { status: statusParam, propertyName: propertyNameFilter || null, includeCoherent },
      summary: {
        ordersScanned: scanned,
        coherent,
        divergent,
        cannotEvaluate,
        note:
          "card===pagamenti è garantito per costruzione (entrambe leggono order.items). Qui si verifica config===ordine. DIVERGENT = ordine congelato da rigenerare. NO_CONFIG = ordine senza config valutabile.",
      },
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Errore", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
