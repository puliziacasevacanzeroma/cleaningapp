import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { buildInvMap, resolveInv, MANAGED_CATS, type InventoryItem } from "~/lib/linen/linenCore";

export const dynamic = "force-dynamic";

/**
 * AUDIT READ-ONLY — biancheria su ordini che NON dovrebbero averla.
 *
 * Applica la stessa regola della card: una pulizia NON deve avere biancheria se
 * hasLinenOrder===false, oppure hasLinenOrder assente e proprietà usesOwnLinen.
 * Segnala gli ordini che invece HANNO articoli di biancheria gestita (letto/
 * bagno/kit). Non scrive nulla.
 *
 * Default: status=DELIVERED (gli storici). Puoi anche passare ALL o PENDING.
 *
 * Uso: /api/debug/audit-ownlinen-orders-v1?cronSecret=XXX
 *      [&status=DELIVERED|PENDING|ALL]  (default DELIVERED)
 *      [&propertyName=...]
 */

function managedCount(items: any[], invMap: Map<string, InventoryItem>): { count: number; totals: Record<string, number> } {
  const totals: Record<string, number> = {};
  let count = 0;
  (Array.isArray(items) ? items : []).forEach((it: any) => {
    const qty = typeof it?.quantity === "number" ? it.quantity : 0;
    if (qty <= 0) return;
    const inv = resolveInv(it?.itemId || it?.id, invMap);
    let cat: string | null = it?.categoryId || null;
    if (!cat && it?.categoryName) {
      const cn = String(it.categoryName).toLowerCase();
      if (cn.includes("letto")) cat = "biancheria_letto";
      else if (cn.includes("bagno")) cat = "biancheria_bagno";
      else if (cn.includes("kit") || cn.includes("cortesia")) cat = "kit_cortesia";
    }
    if (!cat) cat = inv?.categoryId ?? null;
    if (!cat || !MANAGED_CATS.has(cat)) return;
    const id = inv?.id ?? (it?.itemId || it?.id);
    totals[id] = (totals[id] || 0) + qty;
    count += qty;
  });
  return { count, totals };
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const statusParam = (req.nextUrl.searchParams.get("status") || "DELIVERED").toUpperCase();
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
    const ownLinenProps = new Set<string>();
    propSnap.docs.forEach((d) => { if ((d.data() as any).usesOwnLinen === true) ownLinenProps.add(d.id); });

    const cleanSnap = await adminDb.collection("cleanings").get();
    const cleanMap = new Map<string, any>();
    cleanSnap.docs.forEach((d) => cleanMap.set(d.id, { id: d.id, ...(d.data() as any) }));

    let ordersQuery: FirebaseFirestore.Query = adminDb.collection("orders");
    if (statusParam !== "ALL") ordersQuery = ordersQuery.where("status", "==", statusParam);
    const ordersSnap = await ordersQuery.get();

    let scanned = 0;
    let flagged = 0;
    const offenders: any[] = [];

    for (const od of ordersSnap.docs) {
      const order = od.data() as any;
      const property = order.propertyId ? propMap.get(order.propertyId) : null;
      const propertyName = property?.name || order.propertyName || "(sconosciuta)";
      if (propertyNameFilter && !String(propertyName).toLowerCase().includes(propertyNameFilter)) continue;
      scanned++;

      const cleaning = order.cleaningId ? cleanMap.get(order.cleaningId) : null;
      const propUsesOwn = property?.usesOwnLinen === true;
      const hlo = cleaning ? cleaning.hasLinenOrder : undefined;
      const shouldHaveLinen = !(hlo === false || (hlo === undefined && propUsesOwn));

      if (shouldHaveLinen) continue; // ok: può avere biancheria

      // NON dovrebbe avere biancheria: ha articoli gestiti?
      const m = managedCount(order.items || [], invMap);
      if (m.count > 0) {
        flagged++;
        offenders.push({
          orderId: od.id,
          propertyName,
          status: order.status,
          cleaningId: order.cleaningId || null,
          scheduledDate: order.scheduledDate?.toDate?.()?.toISOString?.() || null,
          reason: {
            propertyUsesOwnLinen: propUsesOwn,
            cleaningHasLinenOrder: hlo ?? null,
          },
          linenItems: m.totals,
          linenQty: m.count,
        });
      }
    }

    offenders.sort((a, b) => String(a.propertyName).localeCompare(String(b.propertyName)));

    return NextResponse.json({
      readOnly: true,
      generatedAt: new Date().toISOString(),
      filters: { status: statusParam, propertyName: propertyNameFilter || null },
      summary: {
        ordersScanned: scanned,
        ownLinenProperties: ownLinenProps.size,
        ordersWithUnexpectedLinen: flagged,
        note:
          "Elenca ordini che hanno biancheria gestita pur non dovendola avere (regola card: hasLinenOrder=false, o assente + proprietà usesOwnLinen). READ-ONLY, nessuna modifica.",
      },
      offenders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Errore", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
