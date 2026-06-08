import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * DIAGNOSTICA READ-ONLY — Classifica il formato della biancheria letto (bl)
 * di tutte le proprietà, per numero di ospiti.
 *
 * NON scrive NULLA. Serve solo a sapere quante proprietà usano:
 *  - "all"    → formato nuovo/unificato (bl = { all: {...} })
 *  - "groups" → vecchio formato a gruppi-letto (bl = { b1:{...}, b2:{...} })
 *  - "hybrid" → entrambi (all + gruppi): viene gestito col merge
 *  - "empty"  → bl assente o senza voci valide
 *
 * Le proprietà "groups" e "hybrid" sono quelle che, passando da un percorso
 * NON-merge, perderebbero biancheria. Con linenCore (merge) sono comunque coperte.
 *
 * Uso: /api/debug/analyze-bl-format-v1?cronSecret=XXX
 *      &onlyLegacy=1   (opzionale: elenca solo groups+hybrid)
 */

type Fmt = "all" | "groups" | "hybrid" | "empty";

function classifyBl(bl: any): { fmt: Fmt; keys: string[]; allKeys: number; groupKeys: number } {
  if (!bl || typeof bl !== "object") return { fmt: "empty", keys: [], allKeys: 0, groupKeys: 0 };
  const keys = Object.keys(bl);
  const hasAll =
    bl["all"] && typeof bl["all"] === "object" && Object.keys(bl["all"]).length > 0;
  const groupKeys = keys.filter((k) => {
    if (k === "all") return false;
    const v = bl[k];
    return v && typeof v === "object" && Object.keys(v).length > 0;
  });
  let fmt: Fmt;
  if (hasAll && groupKeys.length > 0) fmt = "hybrid";
  else if (hasAll) fmt = "all";
  else if (groupKeys.length > 0) fmt = "groups";
  else fmt = "empty";
  return {
    fmt,
    keys,
    allKeys: hasAll ? Object.keys(bl["all"]).length : 0,
    groupKeys: groupKeys.length,
  };
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const onlyLegacy = req.nextUrl.searchParams.get("onlyLegacy") === "1";

  try {
    const snap = await adminDb.collection("properties").get();

    // Conteggi a livello di CONFIG (proprietà × numero-ospiti)
    const configTotals: Record<Fmt, number> = { all: 0, groups: 0, hybrid: 0, empty: 0 };
    // Conteggi a livello di PROPRIETÀ (peggior caso tra le sue config:
    // groups > hybrid > all > empty, per evidenziare il rischio)
    const propTotals: Record<Fmt, number> = { all: 0, groups: 0, hybrid: 0, empty: 0 };

    const rank: Record<Fmt, number> = { groups: 3, hybrid: 2, all: 1, empty: 0 };
    const legacyProps: Array<{
      propertyId: string;
      propertyName: string;
      worstFmt: Fmt;
      configs: Array<{ guests: string; fmt: Fmt; blKeys: string[]; allKeys: number; groupKeys: number }>;
    }> = [];

    let propertiesWithoutServiceConfigs = 0;

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, any>;
      const sc = data.serviceConfigs;
      if (!sc || typeof sc !== "object" || Object.keys(sc).length === 0) {
        propertiesWithoutServiceConfigs++;
        continue;
      }

      const perConfig: Array<{ guests: string; fmt: Fmt; blKeys: string[]; allKeys: number; groupKeys: number }> = [];
      let worst: Fmt = "empty";

      for (const guests of Object.keys(sc)) {
        const cfg = sc[guests];
        const c = classifyBl(cfg?.bl);
        configTotals[c.fmt]++;
        perConfig.push({ guests, fmt: c.fmt, blKeys: c.keys, allKeys: c.allKeys, groupKeys: c.groupKeys });
        if (rank[c.fmt] > rank[worst]) worst = c.fmt;
      }

      propTotals[worst]++;

      if (worst === "groups" || worst === "hybrid") {
        legacyProps.push({
          propertyId: doc.id,
          propertyName: data.name || "(senza nome)",
          worstFmt: worst,
          configs: perConfig,
        });
      }
    }

    legacyProps.sort((a, b) => rank[b.worstFmt] - rank[a.worstFmt] || a.propertyName.localeCompare(b.propertyName));

    return NextResponse.json({
      readOnly: true,
      generatedAt: new Date().toISOString(),
      summary: {
        totalProperties: snap.size,
        propertiesWithoutServiceConfigs,
        // per-proprietà (peggior caso): quante sono "a rischio" vecchio formato
        byPropertyWorstCase: propTotals,
        // per-config (proprietà × ospiti): granularità fine
        byConfig: configTotals,
        note:
          "groups+hybrid = proprietà che perderebbero biancheria solo se passassero da un percorso NON-merge. Con linenCore (merge) sono coperte. Per 'bonificarle' al formato 'all' basta riaprirle e risalvarle dal configuratore.",
      },
      legacyProperties: onlyLegacy ? legacyProps : legacyProps,
      ...(onlyLegacy ? {} : { hint: "Aggiungi &onlyLegacy=1 per avere solo l'elenco da bonificare." }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Errore", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
