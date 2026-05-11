/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Inventory Snapshot v1 — Verità dell'inventario e delle config
 * ════════════════════════════════════════════════════════════════════
 *
 * Read-only assoluta. Mostra:
 *   1. inventory: tutti gli articoli dell'inventario (id, name, categoryId, sellPrice)
 *   2. itemNamesMap: il contenuto attuale di ITEM_NAMES
 *   3. configIdsUsed: tutti gli ID distinti che appaiono nelle serviceConfigs
 *      delle proprietà (raggruppati per categoria bl/ba/ki)
 *   4. missingFromItemNames: ID configurati che NON sono in ITEM_NAMES
 *      → questi sono gli alias mancanti
 *   5. sampleConfigs: 5 proprietà con la loro serviceConfigs espansa (per ispezione)
 *
 * AUTH:
 *   - header: Authorization: Bearer <CRON_SECRET>
 *   - query:  ?cronSecret=<CRON_SECRET>
 *
 * QUERY PARAMS:
 *   - propertyLimit=5  (default 5, max 20) — quante proprietà mostrare in sampleConfigs
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { ITEM_NAMES } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────
  const CRON_SECRET = process.env.CRON_SECRET || "";
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET non configurato" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") || "";
  const urlSecret = req.nextUrl.searchParams.get("cronSecret") || "";
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  let propertyLimit = Number(sp.get("propertyLimit") || 5);
  if (!Number.isFinite(propertyLimit) || propertyLimit < 1) propertyLimit = 5;
  if (propertyLimit > 20) propertyLimit = 20;

  try {
    // ── 1. INVENTORY ─────────────────────────────────────
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventory = inventorySnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        name: data.name || null,
        nome: data.nome || null,
        key: data.key || null,
        categoryId: data.categoryId || null,
        categoryName: data.categoryName || null,
        sellPrice: typeof data.sellPrice === "number" ? data.sellPrice : null,
        price: typeof data.price === "number" ? data.price : null,
        unit: data.unit || null,
        isForLinen: data.isForLinen ?? null,
      };
    });

    // Index inventory by id e by name (lower) per il confronto
    const inventoryByIdLower = new Set(inventory.map((i) => i.id.toLowerCase()));
    const inventoryByNameLower = new Set(
      inventory.map((i) => (i.name || "").toLowerCase()).filter(Boolean)
    );

    // ── 2. ITEM_NAMES MAP ATTUALE ────────────────────────
    const itemNamesMap = { ...ITEM_NAMES };
    const itemNamesIds = new Set(Object.keys(itemNamesMap).map((k) => k.toLowerCase()));
    const itemNamesValuesLower = new Set(
      Object.values(itemNamesMap).map((v) => v.toLowerCase())
    );

    // ── 3. CARICA TUTTE LE PROPRIETÀ E ESTRAI ID USATI ───
    const propsSnap = await adminDb.collection("properties").get();
    const properties = propsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // Aggregazione: tutti gli ID usati nelle serviceConfigs, raggruppati per categoria
    type IdUsage = {
      id: string;
      category: "bl" | "ba" | "ki" | "extras" | "unknown";
      foundIn: string[]; // lista propertyName dove appare
      sampleQty: number; // quantità tipica
    };
    const idUsageMap = new Map<string, IdUsage>();

    function recordUsage(id: string, category: IdUsage["category"], propName: string, qty: number) {
      const key = `${id}|${category}`;
      const existing = idUsageMap.get(key);
      if (existing) {
        if (!existing.foundIn.includes(propName) && existing.foundIn.length < 5) {
          existing.foundIn.push(propName);
        }
      } else {
        idUsageMap.set(key, {
          id,
          category,
          foundIn: [propName],
          sampleQty: qty,
        });
      }
    }

    for (const prop of properties) {
      const propName = prop.name || prop.id;
      const sc = prop.serviceConfigs;
      if (!sc || typeof sc !== "object") continue;

      for (const [guestsKey, config] of Object.entries(sc as Record<string, any>)) {
        if (!config || typeof config !== "object") continue;

        // bl: biancheria letto (può avere 'all' o gruppi letto)
        if (config.bl && typeof config.bl === "object") {
          for (const [groupKey, items] of Object.entries(config.bl)) {
            if (items && typeof items === "object") {
              for (const [itemId, qty] of Object.entries(items as Record<string, any>)) {
                if (typeof qty === "number" && qty > 0) {
                  recordUsage(itemId, "bl", propName, qty);
                }
              }
            }
          }
        }

        // ba: biancheria bagno
        if (config.ba && typeof config.ba === "object") {
          for (const [itemId, qty] of Object.entries(config.ba)) {
            if (typeof qty === "number" && qty > 0) {
              recordUsage(itemId, "ba", propName, qty);
            }
          }
        }

        // ki: kit cortesia
        if (config.ki && typeof config.ki === "object") {
          for (const [itemId, qty] of Object.entries(config.ki)) {
            if (typeof qty === "number" && qty > 0) {
              recordUsage(itemId, "ki", propName, qty);
            }
          }
        }

        // extras / extra (per sicurezza)
        if (config.extras && typeof config.extras === "object") {
          for (const [itemId, qty] of Object.entries(config.extras)) {
            if (typeof qty === "number" && qty > 0) {
              recordUsage(itemId, "extras", propName, qty);
            }
          }
        }
      }
    }

    // Lista finale ordinata per categoria + alfabetica
    const configIdsUsed = Array.from(idUsageMap.values()).sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.id.localeCompare(b.id);
    });

    // ── 4. DIFF: ID usati ma NON in ITEM_NAMES ──────────
    const missingFromItemNames = configIdsUsed
      .filter((u) => {
        const idLower = u.id.toLowerCase();
        // Considera "presente" se è nella mappa ITEM_NAMES (case-insensitive)
        if (itemNamesIds.has(idLower)) return false;
        // ID che assomigliano a Firestore IDs (20+ alfanumerici) li skippo come "documenti inventario"
        if (/^[a-zA-Z0-9]{15,}$/.test(u.id)) return false;
        return true;
      })
      .map((u) => {
        // Suggerisco un possibile match con inventory.name
        const matchInInventoryById = inventory.find((i) => i.id === u.id);
        // Anche match approssimato per name (sostituendo underscore con spazio)
        const idAsName = u.id.replace(/_/g, " ").toLowerCase();
        const matchInInventoryByName = inventory.find(
          (i) => (i.name || "").toLowerCase() === idAsName
        );
        return {
          ...u,
          inventoryMatchById: matchInInventoryById
            ? { id: matchInInventoryById.id, name: matchInInventoryById.name }
            : null,
          inventoryMatchByApproxName: matchInInventoryByName
            ? { id: matchInInventoryByName.id, name: matchInInventoryByName.name }
            : null,
          // Suggerimento auto di nome italiano da aggiungere
          suggestedName: matchInInventoryById?.name ||
                         matchInInventoryByName?.name ||
                         // Capitalize first letter di ogni parola
                         u.id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        };
      });

    // ── 5. SAMPLE CONFIGS: prendi N proprietà ─────────────
    const sampleProps = properties.slice(0, propertyLimit).map((prop) => {
      const sc = prop.serviceConfigs || {};
      const guestsKeys = Object.keys(sc);
      // Prendi la config per maxGuests come campione
      const sampleGuests = prop.maxGuests
        ? sc[prop.maxGuests] || sc[String(prop.maxGuests)] || null
        : null;
      return {
        propertyId: prop.id,
        propertyName: prop.name || "(senza nome)",
        maxGuests: prop.maxGuests ?? null,
        bedrooms: prop.bedrooms ?? null,
        bathrooms: prop.bathrooms ?? null,
        usesOwnLinen: prop.usesOwnLinen ?? null,
        availableGuestsConfigs: guestsKeys,
        sampleConfigForMaxGuests: sampleGuests
          ? {
              beds: sampleGuests.beds || null,
              bl: sampleGuests.bl || null,
              ba: sampleGuests.ba || null,
              ki: sampleGuests.ki || null,
              extras: sampleGuests.extras || null,
            }
          : null,
      };
    });

    // ── RESPONSE ─────────────────────────────────────────
    return NextResponse.json({
      success: true,
      summary: {
        inventoryCount: inventory.length,
        itemNamesEntries: Object.keys(itemNamesMap).length,
        propertiesAnalyzed: properties.length,
        configIdsDistinct: configIdsUsed.length,
        missingFromItemNamesCount: missingFromItemNames.length,
      },
      inventory: inventory.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
      itemNamesMap,
      configIdsUsed,
      missingFromItemNames,
      sampleConfigs: sampleProps,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Errore lettura inventory",
        details: error?.message || String(error),
        stack: error?.stack || null,
      },
      { status: 500 }
    );
  }
}
