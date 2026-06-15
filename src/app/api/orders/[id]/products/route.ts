import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════
// /api/orders/[id]/products  (ADMIN-ONLY)
//
// PATCH  → modifica i PRODOTTI pulizia e/o la DATA di consegna di un ordine.
// DELETE → elimina una spedizione (solo se è prodotti-puri standalone).
//
// GUARDIE (per non rompere biancheria/pagamenti):
//  - Modifica ITEM: tocco SOLO gli item type==="cleaning_product". Gli item
//    biancheria/kit/extra restano IDENTICI (inclusi i loro prezzi).
//  - Modifica DATA: consentita SOLO su spedizioni prodotti-pure standalone.
//    Se l'ordine è legato a una pulizia o contiene biancheria, la data segue
//    la pulizia → 409 (vai a modificarla dalla pulizia).
//  - Ordini DELIVERED/CANCELLED non sono modificabili.
//  - DELETE consentito SOLO su prodotti-puri standalone; su ordini misti si
//    rimuovono i prodotti via PATCH con items: [].
// ═══════════════════════════════════════════════════════════════════════

function toNoonTimestamp(dateStr: string): Timestamp | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return Timestamp.fromDate(dt);
}

function classify(order: Record<string, any>) {
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const hasLinenItems =
    (Array.isArray(order.linenItems) && order.linenItems.length > 0) ||
    items.some(i => i.type !== "cleaning_product");
  const tiedToCleaning = !!order.cleaningId;
  const isPureStandalone =
    !tiedToCleaning &&
    !hasLinenItems &&
    (order.isProductsOnly === true || String(order.type ?? "").toUpperCase() === "PRODUCTS");
  return { items, hasLinenItems, tiedToCleaning, isPureStandalone };
}

function normalizeProducts(
  raw: Array<{ itemId?: string; id?: string; name?: string; quantity?: number }>,
) {
  return raw
    .map(it => {
      const key = it.itemId ?? it.id ?? it.name ?? "";
      const qty = Math.max(1, Math.min(99, Number(it.quantity ?? 1) || 1));
      return {
        id:         key,
        itemId:     key,
        name:       it.name ?? "Prodotto",
        quantity:   qty,
        type:       "cleaning_product" as const,
        categoryId: "prodotti_pulizia" as const,
      };
    })
    .filter(p => p.itemId);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id ordine mancante" }, { status: 400 });

    const body = await validateBody(req, GenericBodySchema);
    if (body instanceof Response) return body;
    const { scheduledDate, items } = body as {
      scheduledDate?: string;
      items?: Array<{ itemId?: string; id?: string; name?: string; quantity?: number }>;
    };

    if (scheduledDate === undefined && items === undefined) {
      return NextResponse.json({ error: "Niente da aggiornare" }, { status: 400 });
    }

    const ref = adminDb.collection("orders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

    const order = snap.data() as Record<string, any>;
    const statusU = String(order.status ?? "").toUpperCase();
    if (statusU === "DELIVERED" || statusU === "CANCELLED") {
      return NextResponse.json(
        { error: "Ordine già consegnato o annullato: non modificabile" },
        { status: 409 },
      );
    }

    const { items: existingItems, isPureStandalone } = classify(order);
    const now = Timestamp.now();
    const update: Record<string, any> = { updatedAt: now };

    // ── DATA ───────────────────────────────────────────────────────────
    if (scheduledDate !== undefined) {
      if (!isPureStandalone) {
        return NextResponse.json(
          { error: "La data di questa consegna è legata a una pulizia: modificala dalla pulizia." },
          { status: 409 },
        );
      }
      const ts = toNoonTimestamp(scheduledDate);
      if (!ts) return NextResponse.json({ error: "Data non valida" }, { status: 400 });
      update.scheduledDate = ts;
    }

    // ── ITEM PRODOTTO (preserva biancheria) ──────────────────────────────
    if (items !== undefined) {
      if (!Array.isArray(items)) {
        return NextResponse.json({ error: "items deve essere un array" }, { status: 400 });
      }
      const newProducts = normalizeProducts(items);
      const nonProduct = existingItems.filter((i: any) => i.type !== "cleaning_product");

      // Pure standalone svuotato dei prodotti → l'ordine non ha più senso: elimina
      if (isPureStandalone && newProducts.length === 0) {
        await ref.delete();
        return NextResponse.json({ success: true, deleted: true });
      }

      update.items = [...nonProduct, ...newProducts];
      update.cleaningProducts = newProducts;
      update.hasCleaningProducts = newProducts.length > 0;
    }

    await ref.update(update);
    return NextResponse.json({ success: true, deleted: false });
  } catch (error) {
    console.error("Errore PATCH order products:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id ordine mancante" }, { status: 400 });

    const ref = adminDb.collection("orders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });

    const order = snap.data() as Record<string, any>;
    const statusU = String(order.status ?? "").toUpperCase();
    if (statusU === "DELIVERED") {
      return NextResponse.json({ error: "Ordine già consegnato: non eliminabile" }, { status: 409 });
    }

    const { isPureStandalone } = classify(order);
    if (!isPureStandalone) {
      return NextResponse.json(
        {
          error:
            "Non eliminabile: l'ordine contiene biancheria o è legato a una pulizia. " +
            "Rimuovi solo i prodotti (PATCH items: []).",
        },
        { status: 409 },
      );
    }

    await ref.delete();
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("Errore DELETE order products:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
