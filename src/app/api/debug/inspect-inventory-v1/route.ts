/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Inspect Inventory v1
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/inspect-inventory-v1?cronSecret=XXX
 *
 * Dump dell'inventario con focus su anomalie:
 *   - Doc id vs name (se id="shampoo" ma name="Set di Cortesia")
 *   - Doc senza categoryId
 *   - Doc duplicati (stesso name su id diversi)
 *
 * READ-ONLY.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const filterIds = searchParams.get("ids")?.split(",").map(s => s.trim()) || null;

  try {
    const invSnap = await adminDb.collection("inventory").get();

    const allDocs: any[] = [];
    const anomalies: any[] = [];
    const duplicateNames = new Map<string, string[]>();

    invSnap.docs.forEach(doc => {
      const d = doc.data() as any;
      const entry = {
        id: doc.id,
        name: d.name || "(no name)",
        key: d.key || null,
        categoryId: d.categoryId || null,
        category: d.category || null,
        sellPrice: d.sellPrice ?? null,
        price: d.price ?? null,
      };

      if (!filterIds || filterIds.includes(doc.id)) {
        allDocs.push(entry);
      }

      // Anomalia: id ≠ name (suggerisce rinominazione errata)
      // Esempi: id="shampoo" name="Set di Cortesia"
      const idLower = doc.id.replace("item_", "").toLowerCase();
      const nameNorm = (d.name || "").toLowerCase().replace(/[\s_-]+/g, "");
      if (d.name && idLower && !nameNorm.includes(idLower) && !idLower.includes(nameNorm.substring(0, Math.min(5, nameNorm.length)))) {
        anomalies.push({
          ...entry,
          issue: `Possibile rinominazione errata: id "${doc.id}" non corrisponde semanticamente a name "${d.name}"`,
        });
      }

      // Track duplicate names
      const nameKey = (d.name || "").toLowerCase().trim();
      if (nameKey) {
        if (!duplicateNames.has(nameKey)) duplicateNames.set(nameKey, []);
        duplicateNames.get(nameKey)!.push(doc.id);
      }
    });

    // Trova i veri duplicati (stesso name, id diversi)
    const realDuplicates: any[] = [];
    duplicateNames.forEach((ids, name) => {
      if (ids.length > 1) {
        realDuplicates.push({ name, ids });
      }
    });

    return NextResponse.json({
      totalInventoryDocs: invSnap.docs.length,
      shownDocs: allDocs.length,
      anomalies,
      duplicateNames: realDuplicates,
      allDocs: allDocs.sort((a, b) => a.id.localeCompare(b.id)),
    });
  } catch (error: any) {
    console.error("[inspect-inventory-v1] errore:", error);
    return NextResponse.json({
      error: "Errore",
      message: error.message || String(error),
    }, { status: 500 });
  }
}
