/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Check Cleaning Product Items v1
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/check-cleaning-product-items-v1?cronSecret=XXX
 *
 * Scansiona gli ordini biancheria recenti e analizza i loro `items`
 * per capire se il fix "nascondi prodotti pulizia al proprietario"
 * coprirà il 100% dei casi.
 *
 * Per ogni item analizza:
 *   - se ha campo `type` (cleaning_product / linen / altro)
 *   - se ha campo `categoryId` (prodotti_pulizia / kit_cortesia / biancheria_*)
 *   - se è "rilevabile" come cleaning_product dal nostro fix
 *   - se NON è rilevabile, è un caso da gestire diversamente
 *
 * Identifica anche:
 *   - items con nomi sospetti (anticalcare, prodotti pulizia)
 *     ma senza type/categoryId → CASI VECCHI da migrare
 *   - items duplicati (es. crema + cremaCorpo)
 *   - items con nome = id grezzo
 *
 * READ-ONLY: nessuna scrittura.
 *
 * Query params:
 *   cronSecret  (obbligatorio se CRON_SECRET è settato)
 *   monthsBack  (default 6, max 24) → quanti mesi indietro scansionare
 *   verbose     (default 0) → se 1, dump dettagliato di tutti gli items sospetti
 *
 * @file Da eliminare DOPO conferma fix funzionante.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { isCleaningProductItem } from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pattern di nomi che SUGGERISCONO un cleaning_product anche se mancano i flag
const SUSPICIOUS_NAMES = [
  /anticalcare/i,
  /sgrass/i,
  /detergente/i,
  /detersivo/i,
  /prodott[oi]\s*pulizi/i,
  /candeggina/i,
  /spray/i,
  /amuchina/i,
  /viakal/i,
  /cif/i,
  /lysoform/i,
  /vetril/i,
];

const KIT_CORTESIA_NAMES = [
  /shampoo/i,
  /saponetta/i,
  /sapone/i,
  /bagnoschiuma/i,
  /\bcrema\b/i,
  /cremacorpo/i,
  /balsamo/i,
];

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const monthsBack = Math.min(24, Math.max(1, parseInt(searchParams.get("monthsBack") || "6", 10)));
  const verbose = searchParams.get("verbose") === "1";

  try {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const cutoffTs = Timestamp.fromDate(cutoff);

    // ─── 1. CARICA INVENTARIO ─────────────────────────────────
    const invSnap = await adminDb.collection("inventory").get();
    const invByKey = new Map<string, { id: string; name: string; categoryId?: string; key?: string }>();
    invSnap.docs.forEach(d => {
      const data = d.data() as any;
      const entry = {
        id: d.id,
        name: data.name || "",
        categoryId: data.categoryId || data.category || undefined,
        key: data.key,
      };
      invByKey.set(d.id, entry);
      if (data.key) invByKey.set(data.key, entry);
      if (d.id.startsWith("item_")) invByKey.set(d.id.replace("item_", ""), entry);
    });

    // ─── 2. CARICA ORDINI RECENTI ─────────────────────────────
    const ordersSnap = await adminDb.collection("linenOrders")
      .where("createdAt", ">=", cutoffTs)
      .get();

    // ─── 3. ANALISI ───────────────────────────────────────────
    let totalOrders = 0;
    let totalItems = 0;
    let itemsWithType = 0;
    let itemsWithCategoryId = 0;
    let itemsWithoutFlags = 0;
    let detectedAsCleaningProduct = 0;
    let suspectedCleaningProductByName = 0;
    let suspectedKitCortesiaByName = 0;
    let itemsWithGrossId = 0;
    let itemsWithoutInventoryMatch = 0;

    const ordersWithMissedAnticalcare: any[] = [];
    const allSuspiciousItems: any[] = [];
    const idGrezziSamples: any[] = [];
    const noInventoryMatchSamples: any[] = [];
    const dedupCandidates: { [normName: string]: { names: Set<string>; orders: Set<string> } } = {};

    const grossIdRegex = /^[A-Za-z0-9_-]{12,}$/;
    const normName = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

    ordersSnap.docs.forEach(doc => {
      const order = doc.data() as any;
      if (!Array.isArray(order.items) || order.items.length === 0) return;
      totalOrders++;

      const orderId = doc.id;
      let orderHasMissedAnticalcare = false;

      order.items.forEach((item: any, idx: number) => {
        totalItems++;

        const hasType = !!item.type;
        const hasCategoryId = !!(item.categoryId || item.category);
        const isDetectedByFix = isCleaningProductItem(item as any);

        if (hasType) itemsWithType++;
        if (hasCategoryId) itemsWithCategoryId++;
        if (!hasType && !hasCategoryId) itemsWithoutFlags++;
        if (isDetectedByFix) detectedAsCleaningProduct++;

        // Inventario lookup
        const itemKey = item.itemId || item.id;
        const invItem = itemKey ? invByKey.get(itemKey) : undefined;

        if (!invItem) {
          itemsWithoutInventoryMatch++;
          if (noInventoryMatchSamples.length < 10) {
            noInventoryMatchSamples.push({
              orderId,
              itemKey,
              itemName: item.name || "(no name)",
              quantity: item.quantity,
            });
          }
        }

        // Sospetto cleaning_product per nome
        const itemName = item.name || invItem?.name || "";
        const isSuspectedCleaning = SUSPICIOUS_NAMES.some(re => re.test(itemName));
        const isSuspectedKit = KIT_CORTESIA_NAMES.some(re => re.test(itemName));

        if (isSuspectedCleaning) {
          suspectedCleaningProductByName++;
          // Se è sospetto MA il fix non lo rileva → CASO PROBLEMATICO
          if (!isDetectedByFix) {
            orderHasMissedAnticalcare = true;
            allSuspiciousItems.push({
              orderId,
              itemIdx: idx,
              itemKey,
              itemName,
              quantity: item.quantity,
              type: item.type || null,
              categoryId: item.categoryId || item.category || null,
              invCategoryId: invItem?.categoryId || null,
              issue: "Sospetto cleaning_product per nome ma il fix NON lo rileverebbe",
            });
          }
        }

        if (isSuspectedKit) suspectedKitCortesiaByName++;

        // Nome = ID grezzo
        if (item.name && grossIdRegex.test(item.name)) {
          itemsWithGrossId++;
          if (idGrezziSamples.length < 10) {
            idGrezziSamples.push({
              orderId,
              itemKey,
              rawName: item.name,
              hasInvMatch: !!invItem,
              invName: invItem?.name || null,
            });
          }
        }

        // Dedup candidates
        const dispName = item.name || invItem?.name;
        if (dispName) {
          const norm = normName(dispName);
          if (!dedupCandidates[norm]) {
            dedupCandidates[norm] = { names: new Set(), orders: new Set() };
          }
          dedupCandidates[norm].names.add(dispName);
          dedupCandidates[norm].orders.add(orderId);
        }
      });

      if (orderHasMissedAnticalcare) {
        ordersWithMissedAnticalcare.push({
          orderId,
          propertyId: order.propertyId,
          deliveredAt: order.deliveredAt?.toDate?.()?.toISOString() || null,
          createdAt: order.createdAt?.toDate?.()?.toISOString() || null,
          status: order.status,
        });
      }
    });

    // ─── 4. DEDUP ANALYSIS ────────────────────────────────────
    const realDuplicates = Object.entries(dedupCandidates)
      .filter(([_, v]) => v.names.size > 1)
      .map(([norm, v]) => ({
        normalizedName: norm,
        variants: Array.from(v.names),
        affectedOrdersCount: v.orders.size,
      }))
      .sort((a, b) => b.affectedOrdersCount - a.affectedOrdersCount);

    // ─── 5. RISULTATO ─────────────────────────────────────────
    const fixCoverage = totalItems > 0
      ? ((detectedAsCleaningProduct + (totalItems - suspectedCleaningProductByName)) / totalItems * 100).toFixed(1)
      : "100";

    const missingFixCoverage = ordersWithMissedAnticalcare.length;

    const verdict = missingFixCoverage === 0
      ? "✅ FIX COMPLETO: tutti gli ordini scansionati hanno cleaning_product correttamente flaggati"
      : `⚠️ FIX PARZIALE: ${missingFixCoverage} ordini hanno items sospetti come prodotti pulizia ma SENZA flag type/categoryId. Servirà migrazione dati.`;

    const result: any = {
      verdict,
      scanRange: {
        from: cutoff.toISOString(),
        to: now.toISOString(),
        monthsBack,
      },
      stats: {
        totalOrders,
        totalItems,
        itemsWithType,
        itemsWithCategoryId,
        itemsWithoutAnyFlag: itemsWithoutFlags,
        detectedAsCleaningProductByFix: detectedAsCleaningProduct,
        suspectedCleaningProductByName,
        suspectedKitCortesiaByName,
        itemsWithoutInventoryMatch,
        itemsWithGrossIdAsName: itemsWithGrossId,
      },
      coverage: {
        fixCoveragePercent: fixCoverage,
        ordersWithMissedAnticalcareCount: missingFixCoverage,
      },
      ordersToReview: ordersWithMissedAnticalcare.slice(0, 20),
      duplicateNamesAnalysis: realDuplicates.slice(0, 10),
      grossIdSamples: idGrezziSamples,
      noInventoryMatchSamples: noInventoryMatchSamples.slice(0, 10),
    };

    if (verbose) {
      result.allSuspiciousItems = allSuspiciousItems;
    } else {
      result.suspiciousItemsSample = allSuspiciousItems.slice(0, 10);
      result.suspiciousItemsTotal = allSuspiciousItems.length;
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[check-cleaning-product-items-v1] errore:", error);
    return NextResponse.json({
      error: "Errore durante l'analisi",
      message: error.message || String(error),
    }, { status: 500 });
  }
}
