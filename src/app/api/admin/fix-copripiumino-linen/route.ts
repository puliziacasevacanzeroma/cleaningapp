/**
 * 🛠️ RIPARAZIONE CONFIG BIANCHERIA — copripiumino usato al posto del lenzuolo
 *
 * Corregge le serviceConfigs delle proprietà dove un letto è "vestito" con il
 * copripiumino invece del lenzuolo, e dove mancano del tutto le lenzuola.
 * Riconosce le lenzuola custom (es. "Lenzuola king size") tramite l'inventario,
 * quindi NON fa falsi rabbocchi.
 *
 * SOLO LETTURA di default (dry-run): mostra il diff senza scrivere.
 *   GET /api/admin/fix-copripiumino-linen?secret=CRON_SECRET                 → dry-run TUTTE
 *   GET /api/admin/fix-copripiumino-linen?secret=CRON_SECRET&propertyId=XXX  → dry-run una
 *   GET /api/admin/fix-copripiumino-linen?secret=CRON_SECRET&propertyId=XXX&apply=true → SCRIVE una
 *   GET /api/admin/fix-copripiumino-linen?secret=CRON_SECRET&apply=true      → SCRIVE tutte
 *
 * NON tocca gli ordini (né DELIVERED né altro): agisce solo su properties.serviceConfigs.
 * Gli ordini futuri vanno riallineati separatamente dopo aver corretto le config.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
const CRON_SECRET = process.env.CRON_SECRET;

// Chiavi canoniche delle lenzuola (quelle giuste)
const CANON_MATR = "doubleSheets";
const CANON_SING = "singleSheets";

type Kind = "lenz_matr" | "lenz_sing" | "copri_matr" | "copri_sing" | "federa" | "other";

// Classificazione di un id articolo usando nome+id dall'inventario
function makeClassifier(invById: Map<string, { name: string; cat: string }>) {
  return (id: string): Kind => {
    const inv = invById.get(id);
    const n = (inv?.name || id).toLowerCase();
    const isFed = n.includes("feder") || id === "pillowcases";
    if (isFed) return "federa";
    const isCopri = n.includes("copripium") || n.includes("duvet") || n.includes("copri ");
    const isLenz = n.includes("lenzuol");
    const isSing = n.includes("singol") || n.includes("single");
    // matr riconosce anche king size e formati doppi
    const isMatr =
      n.includes("matrimon") || n.includes("king") || n.includes("matr") ||
      n.includes("double") || n.includes("2 piazze") || n.includes("due piazze");
    if (isCopri) return isSing ? "copri_sing" : "copri_matr";
    if (isLenz || id === CANON_MATR || id === CANON_SING) return isSing ? "lenz_sing" : "lenz_matr";
    if (isMatr && !isFed) return "lenz_matr"; // fallback prudente per articoli letto custom
    return "other";
  };
}

function countBedMinimums(beds: any[]): { minMatr: number; minSing: number } {
  let minMatr = 0, minSing = 0;
  for (const bed of beds || []) {
    const t = (bed.type || bed.tipo || "").toLowerCase();
    if (t === "matr" || t === "matrimoniale" || t === "divano" || t === "divano_letto") minMatr += 2;
    else if (t === "castello") minSing += 4;
    else minSing += 2;
  }
  return { minMatr, minSing };
}

// Inferisce il tipo letto dalla chiave per-letto (es. "stanza_..._matrimoniale_0")
function bedTypeFromKey(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("matrimoniale") || k.includes("matr")) return "matr";
  if (k.includes("divano")) return "divano";
  if (k.includes("castello")) return "castello";
  return "sing";
}

// Ripara un singolo contenitore biancheria { itemId: qty } dati i minimi richiesti.
function repairContainer(
  container: Record<string, number>,
  minMatr: number,
  minSing: number,
  classify: (id: string) => Kind
): { out: Record<string, number>; changes: string[] } {
  const out: Record<string, number> = { ...container };
  const changes: string[] = [];

  // 1) copripiumino → lenzuolo (preserva le quantità, fonde se già presente)
  for (const [id, qty] of Object.entries(container)) {
    if (typeof qty !== "number" || qty <= 0) continue;
    const k = classify(id);
    if (k === "copri_matr") {
      out[CANON_MATR] = (out[CANON_MATR] || 0) + qty;
      delete out[id];
      changes.push(`${id}(${qty}) → ${CANON_MATR}`);
    } else if (k === "copri_sing") {
      out[CANON_SING] = (out[CANON_SING] || 0) + qty;
      delete out[id];
      changes.push(`${id}(${qty}) → ${CANON_SING}`);
    }
  }

  // 2) conta lenzuola effettive (king size incluso) e rabbocca al minimo
  let haveMatr = 0, haveSing = 0;
  for (const [id, qty] of Object.entries(out)) {
    if (typeof qty !== "number" || qty <= 0) continue;
    const k = classify(id);
    if (k === "lenz_matr") haveMatr += qty;
    else if (k === "lenz_sing") haveSing += qty;
  }
  if (minMatr > 0 && haveMatr < minMatr) {
    const add = minMatr - haveMatr;
    out[CANON_MATR] = (out[CANON_MATR] || 0) + add;
    changes.push(`+${add} ${CANON_MATR} (min ${minMatr}, presenti ${haveMatr})`);
  }
  if (minSing > 0 && haveSing < minSing) {
    const add = minSing - haveSing;
    out[CANON_SING] = (out[CANON_SING] || 0) + add;
    changes.push(`+${add} ${CANON_SING} (min ${minSing}, presenti ${haveSing})`);
  }
  return { out, changes };
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${CRON_SECRET}` && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apply = req.nextUrl.searchParams.get("apply") === "true";
  const filterPropertyId = req.nextUrl.searchParams.get("propertyId");

  try {
    // Inventario → classificatore
    const invSnap = await adminDb.collection("inventory").get();
    const invById = new Map<string, { name: string; cat: string }>();
    invSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, any>;
      const name = data.name || "";
      const cat = data.categoryId || "";
      invById.set(d.id, { name, cat });
      if (data.key) invById.set(data.key, { name, cat });
    });
    const classify = makeClassifier(invById);

    // Proprietà
    let propDocs;
    if (filterPropertyId) {
      const doc = await adminDb.collection("properties").doc(filterPropertyId).get();
      propDocs = doc.exists ? [doc] : [];
    } else {
      const snap = await adminDb.collection("properties").where("status", "==", "ACTIVE").get();
      propDocs = snap.docs;
    }

    const report: any[] = [];
    let propertiesChanged = 0;

    for (const propDoc of propDocs) {
      const prop = { id: propDoc.id, ...(propDoc.data() as Record<string, any>) } as Record<string, any>;
      if (prop.usesOwnLinen) continue;
      const beds = prop.beds || [];
      const cfgs = prop.serviceConfigs;
      if (!cfgs || typeof cfgs !== "object") continue;

      const newCfgs = JSON.parse(JSON.stringify(cfgs));
      const propChanges: any[] = [];
      let propTouched = false;

      const maxGuests = prop.maxGuests || 2;
      for (let g = 1; g <= maxGuests; g++) {
        const cfg = newCfgs[g] || newCfgs[String(g)];
        if (!cfg || !cfg.bl) continue;
        const key = newCfgs[g] ? g : String(g);

        const selectedBeds = beds.filter((b: any) => (cfg.beds || []).includes(b.id));

        const bl = cfg.bl;
        const hasAll = bl["all"] && typeof bl["all"] === "object" && Object.keys(bl["all"]).length > 0;

        if (hasAll) {
          const mins = countBedMinimums(selectedBeds);
          const { out, changes } = repairContainer(bl["all"], mins.minMatr, mins.minSing, classify);
          if (changes.length > 0) {
            propChanges.push({ ospiti: g, formato: "all", before: { ...bl["all"] }, after: out, changes });
            newCfgs[key].bl["all"] = out;
            propTouched = true;
          }
        } else {
          // formato per-letto: ripara ogni gruppo con il minimo del suo letto
          for (const bedKey of Object.keys(bl)) {
            if (bedKey === "all" || typeof bl[bedKey] !== "object" || bl[bedKey] === null) continue;
            const t = bedTypeFromKey(bedKey);
            const mins = countBedMinimums([{ type: t }]);
            const { out, changes } = repairContainer(bl[bedKey], mins.minMatr, mins.minSing, classify);
            if (changes.length > 0) {
              propChanges.push({ ospiti: g, formato: `per-letto:${bedKey}`, before: { ...bl[bedKey] }, after: out, changes });
              newCfgs[key].bl[bedKey] = out;
              propTouched = true;
            }
          }
        }
      }

      if (propTouched) {
        report.push({ id: prop.id, name: prop.name, changes: propChanges });
        if (apply) {
          await adminDb.collection("properties").doc(prop.id).update({
            serviceConfigs: newCfgs,
            updatedAt: Timestamp.now(),
          });
          propertiesChanged++;
        }
      }
    }

    return NextResponse.json({
      mode: apply ? "APPLIED ✍️" : "DRY-RUN 👀 (nessuna scrittura)",
      propertiesScanned: propDocs.length,
      propertiesToFix: report.length,
      propertiesWritten: apply ? propertiesChanged : 0,
      note: "Agisce solo su serviceConfigs. Gli ordini vanno riallineati a parte. Riesegui senza apply per il dry-run.",
      report,
    });
  } catch (e: any) {
    console.error("fix-copripiumino-linen error:", e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
