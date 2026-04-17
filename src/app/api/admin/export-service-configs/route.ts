import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * 📦 EXPORT SERVICE CONFIGS
 *
 * GET /api/admin/export-service-configs
 *   → Restituisce TUTTE le serviceConfigs di tutte le proprietà + l'inventario
 *     in un unico JSON. Solo Admin.
 *
 * GET /api/admin/export-service-configs?onlyCopripiumini=1
 *   → Restituisce solo le proprietà che hanno copripiumini configurati
 *     in almeno una serviceConfig (qty > 0), già analizzate.
 *
 * GET /api/admin/export-service-configs?download=1
 *   → Forza il download del JSON come file invece di mostrarlo nel browser.
 */

const COPRIPIUMINO_KEYWORDS = ['copripium', 'piumino', 'piumone', 'duvet', 'comforter'];

function isCopripiumino(s: string | null | undefined): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  return COPRIPIUMINO_KEYWORDS.some(kw => lower.includes(kw));
}

interface FlatItem {
  source: string;
  itemId: string;
  qty: number;
}

/**
 * `bl` può essere in 2 formati:
 *   FORMATO A (unificato): { 'all': { itemId: qty, ... } }
 *   FORMATO B (per letto):  { bedId: { itemId: qty, ... }, ... }
 */
function flattenBedLinen(bl: unknown): FlatItem[] {
  if (!bl || typeof bl !== 'object') return [];
  const result: FlatItem[] = [];
  for (const [source, items] of Object.entries(bl as Record<string, unknown>)) {
    if (!items || typeof items !== 'object') continue;
    for (const [itemId, qty] of Object.entries(items as Record<string, unknown>)) {
      const numQty = Number(qty);
      if (!isNaN(numQty) && numQty > 0) {
        result.push({ source, itemId, qty: numQty });
      }
    }
  }
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const onlyCopripiumini = searchParams.get("onlyCopripiumini") === "1";
    const forceDownload = searchParams.get("download") === "1";

    // ── 1. Carica inventario ──────────
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventory = inventorySnap.docs.map(doc => {
      const data = doc.data() as Record<string, any>;
      return {
        id: doc.id,
        name: data.name ?? null,
        key: data.key ?? null,
        category: data.category ?? null,
        sellPrice: data.sellPrice ?? null,
      };
    });
    const inventoryById: Record<string, { name: string | null }> = {};
    inventory.forEach(it => { inventoryById[it.id] = { name: it.name }; });

    // ── 2. Carica proprietà ──────────
    const propsSnap = await adminDb.collection("properties").get();
    const properties = propsSnap.docs.map(doc => {
      const data = doc.data() as Record<string, any>;
      return {
        id: doc.id,
        name: data.name ?? null,
        ownerId: data.ownerId ?? null,
        maxGuests: data.maxGuests ?? null,
        bedsConfig: data.bedsConfig ?? null,
        serviceConfigs: data.serviceConfigs ?? null,
        usesOwnLinen: data.usesOwnLinen ?? null,
      };
    });

    // ── 3. Se richiesto: analisi copripiumini ──────────
    let copripiuminiAnalysis: any = null;
    if (onlyCopripiumini) {
      const findings: any[] = [];

      for (const prop of properties) {
        if (!prop.serviceConfigs || typeof prop.serviceConfigs !== 'object') continue;
        const propFindings: any[] = [];

        for (const [guestsKey, cfg] of Object.entries(prop.serviceConfigs as Record<string, any>)) {
          if (!cfg || typeof cfg !== 'object') continue;
          const flatItems = flattenBedLinen(cfg.bl);

          for (const { source, itemId, qty } of flatItems) {
            const invItem = inventoryById[itemId];
            const itemName = invItem?.name ?? itemId;
            if (isCopripiumino(itemId) || isCopripiumino(itemName)) {
              propFindings.push({ guestsKey, source, itemId, itemName, qty });
            }
          }
        }

        if (propFindings.length > 0) {
          findings.push({
            propertyId: prop.id,
            propertyName: prop.name,
            ownerId: prop.ownerId,
            usesOwnLinen: prop.usesOwnLinen,
            findings: propFindings,
          });
        }
      }

      copripiuminiAnalysis = {
        totalPropertiesWithCopripiumini: findings.length,
        totalOccurrences: findings.reduce((s, f) => s + f.findings.length, 0),
        properties: findings,
      };
    }

    // ── 4. Build response ──────────
    const responseData: any = {
      exportedAt: new Date().toISOString(),
      counts: {
        inventory: inventory.length,
        properties: properties.length,
        propertiesWithConfigs: properties.filter(p => p.serviceConfigs && Object.keys(p.serviceConfigs).length > 0).length,
      },
    };

    if (onlyCopripiumini) {
      responseData.copripiuminiAnalysis = copripiuminiAnalysis;
    } else {
      responseData.inventory = inventory;
      responseData.properties = properties;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
    };
    if (forceDownload) {
      const filename = onlyCopripiumini ? "copripiumini-analysis.json" : "service-configs-export.json";
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }

    return new NextResponse(JSON.stringify(responseData, null, 2), { status: 200, headers });
  } catch (err: any) {
    console.error("[export-service-configs] Errore:", err);
    return NextResponse.json({ error: "Errore interno", details: err?.message ?? String(err) }, { status: 500 });
  }
}
