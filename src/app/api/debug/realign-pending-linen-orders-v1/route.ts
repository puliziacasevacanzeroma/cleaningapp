import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";
import {
  reconcileOrderItems,
  buildInvMap,
  resolveInv,
  MANAGED_CATS,
  type InventoryItem,
} from "~/lib/linen/linenCore";

export const dynamic = "force-dynamic";

/**
 * REALIGN PENDING — Riallinea gli ordini PENDING alla config (via linenCore).
 *
 * Ricalcola biancheria/kit dalla config (customLinenConfig se linenConfigModified,
 * altrimenti serviceConfigs[ospiti]) e PRESERVA prodotti pulizia/extra/fee/orfani
 * (reconcileOrderItems). Scrive SOLO se i totali delle categorie gestite cambiano.
 *
 * SICUREZZA:
 *  - DRY-RUN di default. Scrive solo con apply=1.
 *  - SALTA gli ordini con pulizia personalizzata (linenConfigModified=true).
 *  - SALTA gli ordini senza config valutabile.
 *  - Confronto sulle sole categorie gestite (letto/bagno/kit), ID normalizzati.
 *
 * Uso: /api/debug/realign-pending-linen-orders-v1?cronSecret=XXX
 *      [&propertyName=gaia] [&apply=1]
 */

function managedTotals(items: any[], invMap: Map<string, InventoryItem>): Record<string, number> {
  const out: Record<string, number> = {};
  (Array.isArray(items) ? items : []).forEach((it: any) => {
    const qty = typeof it?.quantity === "number" ? it.quantity : 0;
    if (qty <= 0) return;
    const rawId = it?.itemId || it?.id;
    if (!rawId) return;
    const inv = resolveInv(rawId, invMap);
    let cat: string | null = it?.categoryId || null;
    if (!cat && it?.categoryName) {
      const cn = String(it.categoryName).toLowerCase();
      if (cn.includes("letto")) cat = "biancheria_letto";
      else if (cn.includes("bagno")) cat = "biancheria_bagno";
      else if (cn.includes("kit") || cn.includes("cortesia")) cat = "kit_cortesia";
    }
    if (!cat) cat = inv?.categoryId ?? null;
    if (!cat || !MANAGED_CATS.has(cat)) return;
    const id = inv?.id ?? rawId;
    out[id] = (out[id] || 0) + qty;
  });
  return out;
}

function totalsDiffer(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apply = req.nextUrl.searchParams.get("apply") === "1";
  const propertyNameFilter = (req.nextUrl.searchParams.get("propertyName") || "").toLowerCase();

  try {
    const invSnap = await adminDb.collection("inventory").get();
    const inventory: InventoryItem[] = invSnap.docs.map((d) => {
      const x = d.data() as any;
      return { id: d.id, key: x.key ?? null, name: x.name, sellPrice: x.sellPrice, categoryId: x.categoryId ?? null };
    });
    const invMap = buildInvMap(inventory);

    const propSnap = await adminDb.collection("properties").get();
    const propMap = new Map<string, any>();
    propSnap.docs.forEach((d) => propMap.set(d.id, { id: d.id, ...(d.data() as any) }));

    const cleanSnap = await adminDb.collection("cleanings").get();
    const cleanMap = new Map<string, any>();
    cleanSnap.docs.forEach((d) => cleanMap.set(d.id, { id: d.id, ...(d.data() as any) }));

    const ordersSnap = await adminDb.collection("orders").where("status", "==", "PENDING").get();

    const changes: any[] = [];
    let scanned = 0, skippedCustom = 0, skippedNoConfig = 0, wouldChange = 0, applied = 0;

    for (const od of ordersSnap.docs) {
      const order = od.data() as any;
      const property = order.propertyId ? propMap.get(order.propertyId) : null;
      const propertyName = property?.name || order.propertyName || "(sconosciuta)";
      if (propertyNameFilter && !String(propertyName).toLowerCase().includes(propertyNameFilter)) continue;

      scanned++;

      const cleaning = order.cleaningId ? cleanMap.get(order.cleaningId) : null;
      if (cleaning && cleaning.linenConfigModified === true) { skippedCustom++; continue; }

      const existingItems = Array.isArray(order.items) ? order.items : [];

      // 🎯 GUARDIA BIANCHERIA (stessa regola di calculateDotazioni / la card):
      // niente biancheria se hasLinenOrder===false, oppure hasLinenOrder assente
      // e la proprietà usa biancheria propria.
      const propUsesOwn = property?.usesOwnLinen === true;
      const hlo = cleaning ? cleaning.hasLinenOrder : undefined;
      const shouldHaveLinen = !(hlo === false || (hlo === undefined && propUsesOwn));

      let finalItems: any[];

      if (!shouldHaveLinen) {
        // L'ordine NON deve avere biancheria: rimuovi le categorie gestite
        // (letto/bagno/kit), preserva prodotti pulizia / extra / fee / orfani.
        finalItems = existingItems.filter((it: any) => {
          const inv = resolveInv(it?.itemId || it?.id, invMap);
          let cat: string | null = it?.categoryId || null;
          if (!cat && it?.categoryName) {
            const cn = String(it.categoryName).toLowerCase();
            if (cn.includes("letto")) cat = "biancheria_letto";
            else if (cn.includes("bagno")) cat = "biancheria_bagno";
            else if (cn.includes("kit") || cn.includes("cortesia")) cat = "kit_cortesia";
          }
          if (!cat) cat = inv?.categoryId ?? null;
          return !(cat && MANAGED_CATS.has(cat)); // tieni SOLO il non-gestito
        });
      } else {
        const guests =
          (cleaning && typeof cleaning.guestsCount === "number" && cleaning.guestsCount) ||
          (typeof order.guestsCount === "number" && order.guestsCount) || 2;

        let config: any = null;
        if (cleaning && cleaning.linenConfigModified === true && cleaning.customLinenConfig) {
          config = cleaning.customLinenConfig;
        } else if (property?.serviceConfigs) {
          config = property.serviceConfigs[guests] || property.serviceConfigs[String(guests)];
        }
        if (!config) { skippedNoConfig++; continue; }

        finalItems = reconcileOrderItems(config, inventory, existingItems, getItemName).finalItems;
      }

      const beforeT = managedTotals(existingItems, invMap);
      const afterT = managedTotals(finalItems, invMap);
      if (!totalsDiffer(beforeT, afterT)) continue; // già coerente

      wouldChange++;
      const change: any = {
        orderId: od.id,
        propertyName,
        guests:
          (cleaning && typeof cleaning.guestsCount === "number" && cleaning.guestsCount) ||
          (typeof order.guestsCount === "number" && order.guestsCount) || 2,
        cleaningId: order.cleaningId || null,
        ownLinen: !shouldHaveLinen,
        before: beforeT,
        after: afterT,
        applied: false,
      };

      if (apply) {
        await adminDb.collection("orders").doc(od.id).update({
          items: finalItems,
          updatedAt: Timestamp.now(),
          itemsUpdatedFromConfig: true,
          realignedAt: Timestamp.now(),
        });
        // audit (best-effort)
        try {
          await adminDb.collection("audit_logs").add({
            action: "LINEN_ORDER_REALIGNED_PENDING",
            orderId: od.id,
            propertyId: order.propertyId || null,
            propertyName,
            guests,
            before: beforeT,
            after: afterT,
            at: Timestamp.now(),
          });
        } catch { /* audit non blocca */ }
        change.applied = true;
        applied++;
      }

      changes.push(change);
    }

    return NextResponse.json({
      mode: apply ? "APPLY" : "DRY-RUN",
      generatedAt: new Date().toISOString(),
      filters: { propertyName: propertyNameFilter || null },
      summary: { scanned, wouldChange, applied, skippedCustom, skippedNoConfig },
      changes,
      hint: apply ? undefined : "Aggiungi &apply=1 per scrivere le modifiche.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Errore", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
