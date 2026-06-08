import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { calculateDotazioni } from "~/lib/calculateDotazioni";
import { getItemName } from "~/lib/itemNames";
import {
  buildExpectedItems,
  buildInvMap,
  resolveInv,
  type InventoryItem,
} from "~/lib/linen/linenCore";

export const dynamic = "force-dynamic";

/**
 * TEST DEFINITIVO READ-ONLY — card (calculateDotazioni REALE) vs linenCore,
 * eseguiti sulla STESSA config reale di ogni proprietà × n. ospiti.
 *
 * Confronta i totali per NOME articolo (entrambi risolvono via inventory) nelle
 * categorie letto/bagno/kit. 0 differenze => la card e linenCore calcolano la
 * stessa identica biancheria su tutte le config reali (con la FUNZIONE DI
 * PRODUZIONE, non una replica).
 *
 * Riporta inoltre le config con Servizi Extra (config.ex) attivi: linenCore/
 * builder standard NON inseriscono gli extra negli ordini (solo la modifica
 * pulizia lo fa), quindi è bene sapere quali config li hanno "di default".
 *
 * Uso: /api/debug/card-vs-linencore-realdata-v1?cronSecret=XXX
 *      [&propertyName=arya] [&includeOk=1]
 */

function totalsByName(items: any[]): Record<string, number> {
  const o: Record<string, number> = {};
  (items || []).forEach((it: any) => {
    const q = typeof it?.quantity === "number" ? it.quantity : 0;
    if (q <= 0) return;
    const name = String(it?.name ?? "").trim();
    if (!name) return;
    o[name] = (o[name] || 0) + q;
  });
  return o;
}

function diffMaps(a: Record<string, number>, b: Record<string, number>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  keys.forEach((k) => {
    if ((a[k] || 0) !== (b[k] || 0)) out.push(`${k}: card=${a[k] || 0} core=${b[k] || 0}`);
  });
  return out.sort();
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const propertyNameFilter = (req.nextUrl.searchParams.get("propertyName") || "").toLowerCase();
  const includeOk = req.nextUrl.searchParams.get("includeOk") === "1";

  try {
    const invSnap = await adminDb.collection("inventory").get();
    const inventory: InventoryItem[] = invSnap.docs.map((d) => {
      const x = d.data() as any;
      return { id: d.id, key: x.key ?? null, name: x.name, sellPrice: x.sellPrice, categoryId: x.categoryId ?? null };
    });
    const invMap = buildInvMap(inventory);

    const propSnap = await adminDb.collection("properties").get();

    let configsTested = 0;
    let coherent = 0;
    let divergent = 0;
    const mismatches: any[] = [];
    const configsWithExtras: any[] = [];

    for (const pd of propSnap.docs) {
      const property = { id: pd.id, ...(pd.data() as any) };
      const propertyName = property.name || "(senza nome)";
      if (propertyNameFilter && !String(propertyName).toLowerCase().includes(propertyNameFilter)) continue;

      const sc = property.serviceConfigs;
      if (!sc || typeof sc !== "object") continue;

      const propertyForCalc = {
        id: property.id,
        name: property.name,
        bedrooms: property.bedrooms || 1,
        bathrooms: property.bathrooms || 1,
        maxGuests: property.maxGuests || 2,
        cleaningPrice: property.cleaningPrice || 0,
        bedsConfig: property.bedsConfig || [],
        serviceConfigs: sc,
        usesOwnLinen: property.usesOwnLinen || false,
      };

      for (const guestsKey of Object.keys(sc)) {
        const config = sc[guestsKey];
        if (!config) continue;
        const guests = Number(guestsKey);
        configsTested++;

        // Extra di default?
        if (config.ex && Object.values(config.ex).some((v) => v === true)) {
          const active = Object.entries(config.ex)
            .filter(([, v]) => v === true)
            .map(([id]) => resolveInv(id, invMap)?.name || getItemName(id) || id);
          configsWithExtras.push({ propertyName, guests, extras: active });
        }

        // CARD reale
        let calc: any;
        try {
          calc = calculateDotazioni({ id: "test", guestsCount: guests } as any, propertyForCalc as any, inventory as any);
        } catch (e) {
          mismatches.push({ propertyName, guests, verdict: "CALC_ERROR", error: e instanceof Error ? e.message : String(e) });
          divergent++;
          continue;
        }
        const cardBed = totalsByName(calc.bedItems || []);
        const cardBath = totalsByName(calc.bathItems || []);
        const cardKit = totalsByName(calc.kitItems || []);

        // linenCore: buildExpectedItems → nome via inventory (stessa logica di naming)
        const coreBed: Record<string, number> = {};
        const coreBath: Record<string, number> = {};
        const coreKit: Record<string, number> = {};
        buildExpectedItems(config).forEach((e) => {
          const name = resolveInv(e.itemId, invMap)?.name || getItemName(e.itemId) || e.itemId;
          const bucket = e.categoryId === "biancheria_letto" ? coreBed : e.categoryId === "biancheria_bagno" ? coreBath : coreKit;
          bucket[name] = (bucket[name] || 0) + e.quantity;
        });

        const dBed = diffMaps(cardBed, coreBed);
        const dBath = diffMaps(cardBath, coreBath);
        const dKit = diffMaps(cardKit, coreKit);

        if (dBed.length === 0 && dBath.length === 0 && dKit.length === 0) {
          coherent++;
          if (includeOk) mismatches.push({ propertyName, guests, verdict: "OK" });
        } else {
          divergent++;
          mismatches.push({
            propertyName,
            guests,
            verdict: "DIVERGENT",
            ...(dBed.length ? { letto: dBed } : {}),
            ...(dBath.length ? { bagno: dBath } : {}),
            ...(dKit.length ? { kit: dKit } : {}),
          });
        }
      }
    }

    return NextResponse.json({
      readOnly: true,
      generatedAt: new Date().toISOString(),
      filters: { propertyName: propertyNameFilter || null, includeOk },
      summary: {
        configsTested,
        coherent,
        divergent,
        note:
          "Confronto card(calculateDotazioni REALE) vs linenCore su config reali, categorie letto/bagno/kit. divergent=0 => calcolo identico sul 100% delle config. Gli extra (config.ex) sono elencati a parte: NON entrano nei builder standard degli ordini.",
      },
      configsWithExtras,
      results: mismatches,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Errore", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
