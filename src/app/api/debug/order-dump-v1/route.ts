/**
 * DEBUG: dump grezzo di un ordine per trovare la voce da 1.50€.
 * GET /api/debug/order-dump-v1?cronSecret=XXX&id=5ktain5Zn8eXiDohB6sI
 * Mostra ogni item con: tutti i campi prezzo, come lo valuta la PAGINA (||)
 * e come il CANONICO (??), e la classificazione. SOLO LETTURA.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { isCleaningProductItem } from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "manca ?id=" }, { status: 400 });

  try {
    const doc = await adminDb.collection("orders").doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: "ordine non trovato" }, { status: 404 });
    const o = doc.data() as any;

    const invSnap = await adminDb.collection("inventory").get();
    const inv = new Map<string, any>();
    invSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const obj = { id: d.id, name: data.name, sellPrice: data.sellPrice, price: data.price, categoryId: data.categoryId || data.category, categoryName: data.categoryName };
      inv.set(d.id, obj);
      if (data.key) inv.set(data.key, obj);
      if (d.id.startsWith("item_")) inv.set(d.id.replace("item_", ""), obj);
    });

    const items = (o.items || []).map((item: any) => {
      const key = item.itemId || item.id;
      const invItem = inv.get(key);
      const basePagina = item.unitPrice || item.price || invItem?.sellPrice || 0;
      const baseCanon = item.unitPrice ?? item.price ?? invItem?.sellPrice ?? invItem?.price ?? 0;
      const qty = item.quantity ?? 1;
      const totPagina = item.totalPrice || (item.priceOverride ?? basePagina) * qty;
      const totCanon = item.totalPrice ?? (item.priceOverride ?? baseCanon) * qty;
      return {
        key, name: item.name ?? null, type: item.type ?? null,
        categoryId: item.categoryId ?? item.category ?? null,
        invName: invItem?.name ?? "(non in inventario)", invSellPrice: invItem?.sellPrice ?? null,
        item_unitPrice: item.unitPrice ?? null, item_price: item.price ?? null,
        item_totalPrice: item.totalPrice ?? null, item_priceOverride: item.priceOverride ?? null,
        quantity: qty,
        isCleaningProduct_canonico: isCleaningProductItem(item),
        totalePagina: Math.round(totPagina * 100) / 100,
        totaleCanonico: Math.round(totCanon * 100) / 100,
        DIFF: Math.round((totPagina - totCanon) * 100) / 100,
      };
    });

    return NextResponse.json({
      orderId: id, property: o.propertyName, status: o.status,
      totalPriceOverride: o.totalPriceOverride ?? null,
      deliveryFee: o.deliveryFee ?? null, deliveryFeeEnabled: o.deliveryFeeEnabled ?? null,
      bedMaking: o.bedMaking ?? null, bedMakingFee: o.bedMakingFee ?? null,
      numItems: items.length,
      items,
      sommaDiffItems: Math.round(items.reduce((s: number, i: any) => s + i.DIFF, 0) * 100) / 100,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
