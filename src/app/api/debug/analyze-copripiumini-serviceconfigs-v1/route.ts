/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Analisi Copripiumini in serviceConfigs (READ-ONLY)
 * ════════════════════════════════════════════════════════════════════
 *
 * Per ogni property, analizza tutte le serviceConfigs[N] e rileva:
 *   - Quali ID effettivamente salvati nel bl di ogni config
 *   - Presenza di doubleSheets / singleSheets / pillowcases (canonici)
 *   - Presenza di copripiumino / copripiumino_matrimoniale / copripiumino_singolo / variants item_*
 *   - Convivenza dei due (entrambi presenti)
 *   - Sostituzioni sospette (solo copripiumino senza lenzuolo)
 *
 * Output:
 *   - propertiesWithCopripiumini: lista properties dove appare un copripiumino salvato
 *   - propertiesWithBoth: properties dove convivono entrambi
 *   - propertiesSubstituted: properties dove c'è copripiumino MA NON lenzuolo (=sostituzione)
 *   - inventoryAnalysis: cosa contiene l'inventario per categoria biancheria_letto
 *
 * NON SCRIVE NULLA. Solo report.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COPRIPIUMINO_IDS = [
  "copripiumino",
  "copripiumino_matrimoniale",
  "copripiumino_singolo",
  "item_copripiumino",
  "item_copripiumino_matrimoniale",
  "item_copripiumino_singolo",
];

const LENZUOLO_MATR_IDS = [
  "doubleSheets",
  "item_doubleSheets",
  "lenzuola_matrimoniale",
  "lenzuolo_matrimoniale",
];

const LENZUOLO_SING_IDS = [
  "singleSheets",
  "item_singleSheets",
  "lenzuola_singolo",
  "lenzuolo_singolo",
];

function isCopripiuminoId(id: string | undefined | null): boolean {
  if (!id || typeof id !== "string") return false;
  const idLower = id.toLowerCase();
  return COPRIPIUMINO_IDS.some(c => idLower === c.toLowerCase())
    || idLower.includes("copripium")
    || idLower.includes("duvet");
}

function isLenzuoloMatrId(id: string | undefined | null): boolean {
  if (!id || typeof id !== "string") return false;
  const idLower = id.toLowerCase();
  return LENZUOLO_MATR_IDS.some(c => idLower === c.toLowerCase());
}

function isLenzuoloSingId(id: string | undefined | null): boolean {
  if (!id || typeof id !== "string") return false;
  const idLower = id.toLowerCase();
  return LENZUOLO_SING_IDS.some(c => idLower === c.toLowerCase());
}

export async function GET(req: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET || "";
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET non configurato" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") || "";
  const urlSecret = req.nextUrl.searchParams.get("cronSecret") || "";
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── 1. Inventario: cosa ha l'utente in biancheria_letto ──
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryItems: Array<{ key: string; name: string; categoryId: string; sellPrice?: number }> = [];

    for (const doc of inventorySnap.docs) {
      const data = doc.data() as any;
      // L'inventario può essere strutturato in vari modi; cerchiamo "items" o "categories"
      if (Array.isArray(data.items)) {
        for (const it of data.items) {
          inventoryItems.push({
            key: it.key || it.id || doc.id,
            name: it.name || "(no name)",
            categoryId: data.id || doc.id,
            sellPrice: it.sellPrice,
          });
        }
      } else if (Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          if (Array.isArray(cat.items)) {
            for (const it of cat.items) {
              inventoryItems.push({
                key: it.key || it.id || "?",
                name: it.name || "(no name)",
                categoryId: cat.id || "?",
                sellPrice: it.sellPrice,
              });
            }
          }
        }
      } else {
        // Fallback: il doc stesso è un item
        inventoryItems.push({
          key: data.key || data.id || doc.id,
          name: data.name || "(no name)",
          categoryId: data.categoryId || data.category || "?",
          sellPrice: data.sellPrice,
        });
      }
    }

    const inventoryBiancheriaLetto = inventoryItems.filter(i => {
      const cat = (i.categoryId || "").toString().toLowerCase();
      return cat.includes("biancheria_letto") || cat.includes("biancheria-letto") || cat === "biancheria_letto";
    });

    const inventoryAnalysis = {
      totalItems: inventoryItems.length,
      biancheriaLetto: inventoryBiancheriaLetto.map(i => ({
        id: i.key || "(undefined)",
        name: i.name || "(no name)",
        isCopripiumino: isCopripiuminoId(i.key),
        isLenzuoloMatr: isLenzuoloMatrId(i.key),
        isLenzuoloSing: isLenzuoloSingId(i.key),
      })),
      // Mostra anche TUTTI gli items dell'inventario per debug, qualunque categoria
      allItemsRaw: inventoryItems.map(i => ({
        id: i.key || "(undefined)",
        name: i.name || "(no name)",
        categoryId: i.categoryId || "(undefined)",
      })),
    };

    // ── 2. Properties: scansiona serviceConfigs ──
    const propertiesSnap = await adminDb.collection("properties").get();
    const allReports: any[] = [];
    const propertiesWithCopripiumini: any[] = [];
    const propertiesWithBoth: any[] = [];
    const propertiesSubstituted: any[] = [];

    for (const doc of propertiesSnap.docs) {
      const data = doc.data() as any;
      const propId = doc.id;
      const propName = data.name || "(no name)";

      if (!data.serviceConfigs || typeof data.serviceConfigs !== "object") continue;

      const configsScan: any[] = [];

      for (const [guestKey, cfg] of Object.entries(data.serviceConfigs)) {
        if (!cfg || typeof cfg !== "object") continue;
        const c = cfg as any;

        // Raccogli tutti gli items distinti dal bl (sia da 'all' che da gruppi letto)
        const blIds = new Set<string>();
        if (c.bl && typeof c.bl === "object") {
          for (const [groupKey, items] of Object.entries(c.bl)) {
            if (items && typeof items === "object") {
              for (const [itemId, qty] of Object.entries(items as Record<string, any>)) {
                if (typeof qty === "number" && qty > 0) {
                  blIds.add(itemId);
                }
              }
            }
          }
        }

        const copripiuminiFound: string[] = [];
        const lenzMatrFound: string[] = [];
        const lenzSingFound: string[] = [];
        for (const id of blIds) {
          if (isCopripiuminoId(id)) copripiuminiFound.push(id);
          if (isLenzuoloMatrId(id)) lenzMatrFound.push(id);
          if (isLenzuoloSingId(id)) lenzSingFound.push(id);
        }

        if (copripiuminiFound.length > 0 || lenzMatrFound.length > 0 || lenzSingFound.length > 0) {
          configsScan.push({
            guests: guestKey,
            blItemsRaw: Array.from(blIds),
            copripiuminiFound,
            lenzMatrFound,
            lenzSingFound,
            hasCopripiumino: copripiuminiFound.length > 0,
            hasLenzuoloMatr: lenzMatrFound.length > 0,
            hasLenzuoloSing: lenzSingFound.length > 0,
            // Caso sostituzione: copripiumino presente MA lenzuolo NO
            isSubstituted: copripiuminiFound.length > 0 && lenzMatrFound.length === 0 && lenzSingFound.length === 0,
            // Caso convivenza
            hasBoth: copripiuminiFound.length > 0 && (lenzMatrFound.length > 0 || lenzSingFound.length > 0),
          });
        }
      }

      if (configsScan.length === 0) continue;

      const propReport = {
        propertyId: propId,
        propertyName: propName,
        bedrooms: data.bedrooms || null,
        maxGuests: data.maxGuests || null,
        configs: configsScan,
      };

      allReports.push(propReport);

      const anyCopripiumino = configsScan.some(c => c.hasCopripiumino);
      const anyBoth = configsScan.some(c => c.hasBoth);
      const anySubstituted = configsScan.some(c => c.isSubstituted);

      if (anyCopripiumino) propertiesWithCopripiumini.push(propReport);
      if (anyBoth) propertiesWithBoth.push(propReport);
      if (anySubstituted) propertiesSubstituted.push(propReport);
    }

    return NextResponse.json({
      summary: {
        totalProperties: propertiesSnap.size,
        propertiesWithCopripiuminiCount: propertiesWithCopripiumini.length,
        propertiesWithBothCount: propertiesWithBoth.length,
        propertiesSubstitutedCount: propertiesSubstituted.length,
        inventoryHasCopripiumino: inventoryBiancheriaLetto.some(i => isCopripiuminoId(i.id)),
        inventoryHasDoubleSheets: inventoryBiancheriaLetto.some(i => isLenzuoloMatrId(i.id)),
      },
      inventoryAnalysis,
      propertiesSubstituted,
      propertiesWithBoth,
      propertiesWithCopripiumini,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Errore analisi", details: err?.message, stack: err?.stack },
      { status: 500 }
    );
  }
}
