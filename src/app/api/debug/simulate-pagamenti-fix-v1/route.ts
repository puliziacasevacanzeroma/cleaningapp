/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Simulate Pagamenti Fix v1
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/simulate-pagamenti-fix-v1?cronSecret=XXX
 *
 * Simula il comportamento della NUOVA logica del fix sui dati reali
 * del database. Per ogni ordine recente mostra:
 *   - cosa il proprietario VEDE OGGI (vecchia logica)
 *   - cosa il proprietario VEDRÀ DOPO (nuova logica)
 *   - quale anticalcare/prodotto pulizia sparisce
 *   - quale ID grezzo viene risolto
 *   - quali duplicati vengono fusi
 *
 * READ-ONLY.
 *
 * Query params:
 *   cronSecret  (obbligatorio)
 *   monthsBack  (default 3)
 *   limit       (default 50, max 200) → quanti ordini campionare
 *   propertyId  (opzionale, filtra una proprietà)
 *   showOnlyChanges (default 1) → mostra solo ordini dove qualcosa cambia
 *
 * @file Da eliminare DOPO conferma fix funzionante.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ──────────────────────────────────────────────────────────────
// REPLICA delle funzioni del fix (così possiamo simulare DA SOLI
// senza dipendere dal codice client/hook).
// ──────────────────────────────────────────────────────────────

const CLEANING_PRODUCT_NAME_PATTERNS: RegExp[] = [
  /\banticalcare\b/i,
  /\bsgrass/i,
  /\bdetergent[ei]\b/i,
  /\bdetersivo\b/i,
  /\bcandeggina\b/i,
  /\bamuchina\b/i,
  /\bviakal\b/i,
  /\bmuffa\b/i,
  /\bvetril\b/i,
  /\blysoform\b/i,
];

function isCleaningProductItem(item: any): boolean {
  if (item.type === "cleaning_product") return true;
  const cat = item.categoryId || item.category || "";
  if (cat === "prodotti_pulizia" || cat === "cleaning_products") return true;
  const name = item.name;
  if (name && typeof name === "string") {
    if (CLEANING_PRODUCT_NAME_PATTERNS.some(re => re.test(name))) return true;
  }
  return false;
}

function looksLikeRawId(s: string): boolean {
  if (!s || s.length < 4) return false;
  if (/[\s-]/.test(s)) return false;
  if (/^[a-z][a-z0-9_]*_[a-z0-9_]+$/.test(s)) return true;
  if (/^[a-z][a-z0-9]*[A-Z]/.test(s)) return true;
  if (/^[A-Z][a-z0-9]*$/.test(s)) return false;
  if (s.length >= 12) {
    const hasMultipleUpper = (s.match(/[A-Z]/g) || []).length >= 2;
    const hasDigit = /[0-9]/.test(s);
    if (hasMultipleUpper && hasDigit) return true;
  }
  return false;
}

function classifyItem(item: any, invItem: any): string {
  if (item.type === "cleaning_product") return "cleaning_product";
  const itemCat = (item.categoryId || item.category || "").toLowerCase();
  if (itemCat === "prodotti_pulizia" || itemCat === "cleaning_products") return "cleaning_product";
  if (itemCat === "kit_cortesia") return "kit_cortesia";
  if (itemCat === "biancheria_letto" || itemCat === "biancheria_bagno") return "linen";
  const invCat = (invItem?.categoryId || invItem?.category || "").toLowerCase();
  if (invCat === "prodotti_pulizia" || invCat === "cleaning_products") return "cleaning_product";
  if (invCat === "kit_cortesia") return "kit_cortesia";
  if (invCat === "biancheria_letto" || invCat === "biancheria_bagno") return "linen";
  if (invCat.includes("cortesia") || invCat.includes("kit")) return "kit_cortesia";
  if (invCat.includes("biancheria") || invCat.includes("linen")) return "linen";
  // Fallback name-based per cleaning_product
  const name = (item.name || invItem?.name || "").toString();
  if (name && CLEANING_PRODUCT_NAME_PATTERNS.some(re => re.test(name))) {
    return "cleaning_product";
  }
  return "altro";
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}

function resolveItemName(item: any, invItem: any): string | null {
  // PRIORITÀ ASSOLUTA: nome dell'inventario
  if (invItem?.name && invItem.name.trim()) return invItem.name;
  // Fallback su item.name solo se non è un id tecnico
  if (item.name && typeof item.name === "string" && item.name.trim()) {
    if (!looksLikeRawId(item.name)) return item.name;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const monthsBack = Math.min(12, Math.max(1, parseInt(searchParams.get("monthsBack") || "3", 10)));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const propertyId = searchParams.get("propertyId");
  const showOnlyChanges = searchParams.get("showOnlyChanges") !== "0";

  try {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);

    // Carica inventario
    const invSnap = await adminDb.collection("inventory").get();
    const invByKey = new Map<string, any>();
    invSnap.docs.forEach(d => {
      const data = d.data() as any;
      const entry = {
        id: d.id,
        name: data.name || "",
        categoryId: data.categoryId || data.category || undefined,
      };
      invByKey.set(d.id, entry);
      if (data.key) invByKey.set(data.key, entry);
      if (d.id.startsWith("item_")) invByKey.set(d.id.replace("item_", ""), entry);
    });

    // Carica ordini
    let q: any = adminDb.collection("orders");
    if (propertyId) q = q.where("propertyId", "==", propertyId);
    const ordersSnap = await q.get();

    const samples: any[] = [];
    let totalAnalyzed = 0;
    let totalWithChanges = 0;
    let totalCleaningProductHidden = 0;
    let totalIdsResolved = 0;
    let totalDuplicatesMerged = 0;
    let totalKitSeparated = 0;

    let totalDeltaEur = 0;

    for (const doc of ordersSnap.docs) {
      if (samples.length >= limit) break;

      const order = doc.data() as any;
      if (!Array.isArray(order.items) || order.items.length === 0) continue;

      const orderDate =
        order.createdAt?.toDate?.() ||
        order.scheduledDate?.toDate?.() ||
        order.deliveredAt?.toDate?.() ||
        null;
      if (!orderDate || orderDate < cutoff) continue;

      totalAnalyzed++;

      // ─── VECCHIA LOGICA: tutto incluso, no dedup ───
      const oldItems: any[] = [];
      let oldTotal = 0;
      for (const item of order.items) {
        const itemKey = item.itemId || item.id;
        const invItem = invByKey.get(itemKey);
        const basePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
        const unitPrice = item.priceOverride ?? basePrice;
        const quantity = item.quantity || 1;
        const itemTotal = item.totalPrice || (unitPrice * quantity);
        oldTotal += itemTotal;
        oldItems.push({
          name: item.name || invItem?.name || "Articolo",
          quantity,
          unitPrice,
          totalPrice: itemTotal,
        });
      }
      if (order.deliveryFee && order.deliveryFeeEnabled !== false) oldTotal += order.deliveryFee;
      if (order.bedMaking && order.bedMakingFee) oldTotal += order.bedMakingFee;

      // ─── NUOVA LOGICA: skip cleaning_product, dedup, classifica ───
      const dedupMap = new Map<string, any>();
      let newTotal = 0;
      let linenSubtotal = 0;
      let kitSubtotal = 0;
      const hiddenCleaningProducts: any[] = [];
      const idsResolvedInThisOrder: any[] = [];
      const duplicatesInThisOrder: string[] = [];

      for (const item of order.items) {
        // Skip cleaning_product
        if (isCleaningProductItem(item)) {
          const itemKey = item.itemId || item.id;
          const invItem = invByKey.get(itemKey);
          hiddenCleaningProducts.push({
            name: item.name || invItem?.name || itemKey,
            qty: item.quantity || 1,
            price: item.totalPrice || ((item.unitPrice || item.price || invItem?.sellPrice || 0) * (item.quantity || 1)),
            reason: item.type === "cleaning_product" ? "type=cleaning_product"
              : (item.categoryId === "prodotti_pulizia" || item.categoryId === "cleaning_products") ? "categoryId=prodotti_pulizia"
              : "name pattern (legacy)"
          });
          continue;
        }

        const itemKey = item.itemId || item.id;
        const invItem = invByKey.get(itemKey);
        const name = resolveItemName(item, invItem);
        if (!name) continue;

        // Track quando il nome mostrato è DIVERSO da item.name
        // (sia per id grezzi tipo "canavaccio_cucina" risolto a "Canavaccio Cucina",
        //  sia per nomi storici tipo "Bagnoschiuma" rinominato in inventario a "Doccia-Shampoo")
        if (item.name && invItem?.name && item.name !== invItem.name) {
          idsResolvedInThisOrder.push({ raw: item.name, resolved: invItem.name });
        }

        const group = classifyItem(item, invItem);
        if (group === "cleaning_product") {
          hiddenCleaningProducts.push({
            name,
            qty: item.quantity || 1,
            price: item.totalPrice || 0,
            reason: "name pattern (cascade)",
          });
          continue;
        }

        const basePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
        const unitPrice = item.priceOverride ?? basePrice;
        const quantity = item.quantity || 1;
        const itemTotal = item.totalPrice || (unitPrice * quantity);

        const dedupKey = normName(name);
        const existing = dedupMap.get(dedupKey);
        if (existing) {
          existing.quantity += quantity;
          existing.totalPrice += itemTotal;
          duplicatesInThisOrder.push(name);
        } else {
          dedupMap.set(dedupKey, {
            name,
            quantity,
            unitPrice,
            totalPrice: itemTotal,
            group,
          });
        }

        newTotal += itemTotal;
        if (group === "linen") linenSubtotal += itemTotal;
        else if (group === "kit_cortesia") kitSubtotal += itemTotal;
      }

      if (order.deliveryFee && order.deliveryFeeEnabled !== false) newTotal += order.deliveryFee;
      if (order.bedMaking && order.bedMakingFee) newTotal += order.bedMakingFee;

      const newItems = Array.from(dedupMap.values());

      // ─── DELTA ───
      const deltaEur = oldTotal - newTotal;
      const hasChanges = hiddenCleaningProducts.length > 0
        || idsResolvedInThisOrder.length > 0
        || duplicatesInThisOrder.length > 0
        || newItems.some(i => i.group === "kit_cortesia");

      if (hasChanges) totalWithChanges++;
      totalCleaningProductHidden += hiddenCleaningProducts.length;
      totalIdsResolved += idsResolvedInThisOrder.length;
      totalDuplicatesMerged += duplicatesInThisOrder.length;
      if (newItems.some(i => i.group === "kit_cortesia")) totalKitSeparated++;
      totalDeltaEur += deltaEur;

      if (showOnlyChanges && !hasChanges) continue;

      samples.push({
        orderId: doc.id,
        propertyId: order.propertyId,
        date: orderDate.toISOString().split("T")[0],
        old: {
          itemsCount: oldItems.length,
          total: Math.round(oldTotal * 100) / 100,
        },
        new: {
          linenItemsCount: newItems.filter(i => i.group === "linen").length,
          kitItemsCount: newItems.filter(i => i.group === "kit_cortesia").length,
          linenSubtotal: Math.round(linenSubtotal * 100) / 100,
          kitSubtotal: Math.round(kitSubtotal * 100) / 100,
          total: Math.round(newTotal * 100) / 100,
        },
        deltaEur: Math.round(deltaEur * 100) / 100,
        hiddenCleaningProducts,
        idsResolved: idsResolvedInThisOrder,
        duplicatesMerged: duplicatesInThisOrder,
      });
    }

    return NextResponse.json({
      summary: {
        scanRange: { from: cutoff.toISOString(), to: now.toISOString() },
        totalOrdersAnalyzed: totalAnalyzed,
        ordersWithChanges: totalWithChanges,
        totalCleaningProductsHidden: totalCleaningProductHidden,
        totalIdsResolvedToReadableNames: totalIdsResolved,
        totalDuplicatesMerged: totalDuplicatesMerged,
        ordersWithKitSeparated: totalKitSeparated,
        totalDeltaEurFromOldToNew: Math.round(totalDeltaEur * 100) / 100,
      },
      samplesShown: samples.length,
      samples,
    });
  } catch (error: any) {
    console.error("[simulate-pagamenti-fix-v1] errore:", error);
    return NextResponse.json({
      error: "Errore",
      message: error.message || String(error),
    }, { status: 500 });
  }
}
