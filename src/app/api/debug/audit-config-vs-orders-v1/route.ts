/**
 * 🔍 AUDIT config standard proprietà ↔ ordini reali (READ-ONLY, zero scritture).
 *
 * GET /api/debug/audit-config-vs-orders-v1?cronSecret=XXX
 * Opzionale: &propertyId=XXX (limita a una proprietà), &full=1 (mostra anche le proprietà tutte allineate)
 *
 * COSA FA: per OGNI proprietà attiva con biancheria gestita:
 *  1. Fotografa la config standard per ogni numero di ospiti configurato
 *     (serviceConfigs[g]): composizione letti (bl per gruppo-letto), bagno, kit,
 *     e la lista canonica di articoli attesi (buildExpectedItems — la stessa
 *     funzione usata dai flussi vivi).
 *  2. Confronta ogni ordine FUTURO attivo con quella config: gli articoli
 *     gestiti (letto+bagno+kit) devono corrispondere SEMPRE, tranne per le
 *     pulizie con biancheria personalizzata (badge, linenConfigModified=true),
 *     che vengono escluse dal confronto e solo contate.
 *  3. Raggruppa i disallineamenti per proprietà e per PATTERN (stessa differenza
 *     ripetuta = molto probabilmente config cambiata dopo la creazione degli
 *     ordini; differenze sparse = casi singoli da guardare uno a uno).
 *
 * NOTA: elenca anche ordini IN_TRANSIT/DELIVERED disallineati (per conoscenza),
 * ma li marca NON_MODIFICABILE: quelli non vanno mai toccati.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { buildExpectedItems, extractBed, extractFlat, isManagedByRecompute, buildInvMap } from "~/lib/linen/linenCore";
import { getItemName } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODIFIABLE = new Set(["PENDING", "ASSIGNED"]);
const ACTIVE_ORDER = new Set(["PENDING", "ASSIGNED", "IN_TRANSIT", "DELIVERED"]);

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const onlyProperty = searchParams.get("propertyId");
  const full = searchParams.get("full") === "1";

  try {
    const [propsSnap, cleanSnap, ordersSnap, invSnap] = await Promise.all([
      adminDb.collection("properties").get(),
      adminDb.collection("cleanings").get(),
      adminDb.collection("orders").get(),
      adminDb.collection("inventory").get(),
    ]);

    const inventory = invSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const invMap = buildInvMap(inventory as any);
    const nome = (id: string) => getItemName(id) || id;

    const cleaningById = new Map(cleanSnap.docs.map(d => [d.id, { id: d.id, ...(d.data() as any) }]));

    // ordini futuri attivi raggruppati per proprietà
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const ordersByProp = new Map<string, any[]>();
    ordersSnap.docs.forEach(d => {
      const o = { id: d.id, ...(d.data() as any) };
      if (!ACTIVE_ORDER.has(o.status)) return;
      const sd = o.scheduledDate?.toDate?.();
      if (!sd || sd < oggi) return;
      if (!ordersByProp.has(o.propertyId)) ordersByProp.set(o.propertyId, []);
      ordersByProp.get(o.propertyId)!.push(o);
    });

    // firma degli articoli gestiti di un ordine: id→qty
    const managedMap = (items: any[]): Map<string, number> => {
      const m = new Map<string, number>();
      (items || []).forEach((it: any) => {
        if (!isManagedByRecompute(it, invMap)) return;
        const key = String(it.itemId || it.id);
        m.set(key, (m.get(key) || 0) + (it.quantity || 0));
      });
      return m;
    };

    const diff = (attesi: Map<string, number>, reali: Map<string, number>): string[] => {
      const keys = new Set([...attesi.keys(), ...reali.keys()]);
      const out: string[] = [];
      for (const k of keys) {
        const a = attesi.get(k) || 0; const r = reali.get(k) || 0;
        if (a === r) continue;
        if (r === 0) out.push(`manca ${nome(k)} ×${a}`);
        else if (a === 0) out.push(`in più ${nome(k)} ×${r} (non in config)`);
        else out.push(`${nome(k)}: ordine ${r} vs config ${a}`);
      }
      return out.sort();
    };

    const report: any[] = [];
    let totOrdini = 0, totDisallineati = 0, totPersonalizzate = 0;

    for (const pDoc of propsSnap.docs) {
      const prop = pDoc.data() as any;
      if (onlyProperty && pDoc.id !== onlyProperty) continue;
      if (prop.status !== "ACTIVE") continue;
      if (prop.usesOwnLinen === true) continue;
      if (!prop.serviceConfigs || typeof prop.serviceConfigs !== "object") continue;

      // ── 1) fotografia config standard per ospiti ──
      const configPerOspiti: Record<string, any> = {};
      Object.entries(prop.serviceConfigs).forEach(([g, cfg]: [string, any]) => {
        if (!cfg || typeof cfg !== "object") return;
        const attesi = buildExpectedItems(cfg);
        const perLetto: Record<string, any> = {};
        if (cfg.bl && typeof cfg.bl === "object") {
          Object.entries(cfg.bl).forEach(([bedId, items]: [string, any]) => {
            if (items && typeof items === "object" && Object.keys(items).length > 0) {
              perLetto[bedId] = Object.fromEntries(
                Object.entries(items).filter(([, q]: any) => typeof q === "number" && q > 0)
                  .map(([id, q]: any) => [nome(id), q])
              );
            }
          });
        }
        configPerOspiti[g] = {
          letti: perLetto,                                    // composizione per gruppo-letto (bl)
          lettoTotale: Object.fromEntries(Object.entries(extractBed(cfg)).map(([id, q]) => [nome(id), q])),
          bagno: Object.fromEntries(Object.entries(extractFlat(cfg.ba)).map(([id, q]) => [nome(id), q])),
          kit: Object.fromEntries(Object.entries(extractFlat(cfg.ki)).map(([id, q]) => [nome(id), q])),
          articoliAttesiTotali: attesi.map(a => `${nome(a.itemId)} ×${a.quantity}`),
        };
      });

      // ── 2) confronto ordini ──
      const orders = ordersByProp.get(pDoc.id) || [];
      const disallineati: any[] = [];
      let allineati = 0, personalizzate = 0, senzaPulizia = 0, senzaConfigOspiti = 0;

      for (const o of orders) {
        totOrdini++;
        const c = o.cleaningId ? cleaningById.get(o.cleaningId) : null;
        if (!c) { senzaPulizia++; continue; }
        if ((c as any).linenConfigModified === true) { personalizzate++; totPersonalizzate++; continue; }
        const g = (c as any).guestsCount || (c as any).guests || 0;
        const cfg = prop.serviceConfigs[g] ?? prop.serviceConfigs[String(g)];
        if (!cfg) { senzaConfigOspiti++; continue; }

        const attesi = new Map(buildExpectedItems(cfg).map(a => [a.itemId, a.quantity]));
        const reali = managedMap(o.items || []);
        const differenze = diff(attesi as any, reali);
        if (differenze.length === 0) { allineati++; continue; }

        totDisallineati++;
        disallineati.push({
          orderId: o.id, cleaningId: o.cleaningId,
          data: o.scheduledDate?.toDate?.()?.toISOString()?.slice(0, 10),
          ospiti: g, statusOrdine: o.status,
          modificabile: MODIFIABLE.has(o.status) ? "SI" : "NON_MODIFICABILE",
          differenze,
        });
      }

      // pattern: stessa differenza ripetuta
      const patternCount = new Map<string, number>();
      disallineati.forEach(d => {
        const key = `[${d.ospiti} ospiti] ${d.differenze.join("; ")}`;
        patternCount.set(key, (patternCount.get(key) || 0) + 1);
      });
      const patterns = [...patternCount.entries()].sort((a, b) => b[1] - a[1])
        .map(([p, n]) => `${n}× → ${p}`);

      if (disallineati.length > 0 || full) {
        report.push({
          proprieta: prop.name, propertyId: pDoc.id, maxGuests: prop.maxGuests ?? null,
          configStandard: configPerOspiti,
          ordiniFuturi: orders.length, allineati, personalizzateEscluse: personalizzate,
          senzaPulizia, senzaConfigOspiti,
          disallineati: disallineati.length,
          pattern: patterns,
          dettaglio: disallineati.slice(0, 12),
        });
      }
    }

    // ordina: prima chi ha più disallineamenti
    report.sort((a, b) => (b.disallineati || 0) - (a.disallineati || 0));

    return NextResponse.json({
      generatoIl: new Date().toISOString(),
      riepilogo: {
        proprietaAnalizzate: propsSnap.docs.filter(d => (d.data() as any).status === "ACTIVE" && (d.data() as any).usesOwnLinen !== true).length,
        ordiniFuturiAnalizzati: totOrdini,
        ordiniDisallineati: totDisallineati,
        pulizieBadgePersonalizzatoEscluse: totPersonalizzate,
        proprietaConProblemi: report.filter(r => r.disallineati > 0).length,
      },
      legenda: {
        pattern: "Stessa differenza ripetuta N volte = quasi certamente la config è stata cambiata DOPO la creazione degli ordini (decidere quale delle due è giusta). Differenze sparse = casi singoli.",
        letti: "configStandard[g].letti mostra la composizione per gruppo-letto: confrontala con i letti veri della casa per capire se è la config a essere sbagliata o gli ordini.",
        modificabile: "NON_MODIFICABILE = ordine IN_TRANSIT/DELIVERED: mai toccato dal riallineo, solo segnalato.",
      },
      proprieta: report,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore audit", message: error?.message }, { status: 500 });
  }
}
