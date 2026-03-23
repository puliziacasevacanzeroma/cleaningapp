/**
 * GET /api/debug/inventory-check?secret=XXX
 * Mostra tutti gli items con la loro categoryId reale dal database
 * 
 * GET /api/debug/inventory-check?secret=XXX&fix=true
 * Corregge le categoryId basandosi sul nome dell'item
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { invalidateCache } from "~/lib/cache";

export const dynamic = "force-dynamic";

// Mappa nomi → categoria corretta
const NAME_TO_CATEGORY: Record<string, string> = {
  // Kit Cortesia
  "shampoo": "kit_cortesia",
  "bagnoschiuma": "kit_cortesia",
  "balsamo": "kit_cortesia",
  "sapone mani": "kit_cortesia",
  "saponetta": "kit_cortesia",
  "cuffia doccia": "kit_cortesia",
  "kit cucito": "kit_cortesia",
  "ciabatte": "kit_cortesia",
  "spazzolino": "kit_cortesia",
  "dentifricio": "kit_cortesia",
  "cotton fioc": "kit_cortesia",
  "dischetti": "kit_cortesia",
  "crema corpo": "kit_cortesia",
  "sapone": "kit_cortesia",
  "gel doccia": "kit_cortesia",
  "cuffia": "kit_cortesia",
  "kit cortesia": "kit_cortesia",
  // Servizi Extra
  "welcome kit": "servizi_extra",
  "fiori": "servizi_extra",
  "bouquet": "servizi_extra",
  "frigo": "servizi_extra",
  "early check": "servizi_extra",
  "late check": "servizi_extra",
  "transfer": "servizi_extra",
  "culla": "servizi_extra",
  "seggiolone": "servizi_extra",
  "prosecco": "servizi_extra",
  "vino": "servizi_extra",
  "cioccolat": "servizi_extra",
  "welcome": "servizi_extra",
  "benvenuto": "servizi_extra",
};

function guessCategory(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [keyword, cat] of Object.entries(NAME_TO_CATEGORY)) {
    if (lower.includes(keyword)) return cat;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const fix = req.nextUrl.searchParams.get("fix") === "true";

  try {
    const snapshot = await adminDb.collection("inventory").get();
    const items = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name,
        categoryId: d.categoryId,
        category: d.category,
        isSystemItem: d.isSystemItem || false,
        sellPrice: d.sellPrice,
      };
    });

    // Raggruppa per categoryId attuale
    const byCategory: Record<string, any[]> = {};
    items.forEach(item => {
      const cat = item.categoryId || "senza_categoria";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({ id: item.id, name: item.name, isSystem: item.isSystemItem });
    });

    // Trova items con categoria probabilmente sbagliata
    const fixes: any[] = [];
    items.forEach(item => {
      if (item.isSystemItem) return;
      const guessed = guessCategory(item.name || "");
      if (guessed && guessed !== item.categoryId) {
        fixes.push({
          id: item.id,
          name: item.name,
          currentCategory: item.categoryId,
          suggestedCategory: guessed,
        });
      }
    });

    // Se fix=true, applica le correzioni
    if (fix && fixes.length > 0) {
      const batch = adminDb.batch();
      for (const f of fixes) {
        const ref = adminDb.collection("inventory").doc(f.id);
        batch.update(ref, {
          categoryId: f.suggestedCategory,
          category: f.suggestedCategory,
          updatedAt: Timestamp.now(),
        });
      }
      await batch.commit();
      await invalidateCache("inventory:list");
    }

    return NextResponse.json({
      totalItems: items.length,
      byCategory,
      suggestedFixes: fixes,
      fixApplied: fix && fixes.length > 0,
      fixCount: fix ? fixes.length : 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
