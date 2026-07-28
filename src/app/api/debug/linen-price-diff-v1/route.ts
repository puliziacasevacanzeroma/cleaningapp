/**
 * FORENSE disallineamento card-proprietario vs ordine.
 * GET /api/debug/linen-price-diff-v1?cronSecret=XXX&cleaningId=XXX
 *
 * Spacchetta UNA pulizia e mostra, articolo per articolo:
 *  - cosa c'è nell'ORDINE (order.items): id, quantità, unitPrice CONGELATO, categoria
 *  - cosa dice la CONFIG standard oggi (buildExpectedItems): id, quantità attesa
 *  - il prezzo CORRENTE dell'inventario (sellPrice) per ogni articolo
 *  - il confronto: dove nasce la differenza (quantità diversa? prezzo diverso?
 *    articolo presente in uno ma non nell'altro?)
 *
 * READ-ONLY. Serve a capire PERCHÉ ordine e ricalcolo divergono, prima di
 * decidere se è un bug o un prezzo aggiornato legittimamente.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { buildExpectedItems } from "~/lib/linen/linenCore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const cleaningId = searchParams.get("cleaningId");
  if (!cleaningId) return NextResponse.json({ error: "Passa &cleaningId=" }, { status: 400 });

  try {
    const cSnap = await adminDb.collection("cleanings").doc(cleaningId).get();
    if (!cSnap.exists) return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    const c = cSnap.data() as any;

    const pSnap = await adminDb.collection("properties").doc(c.propertyId).get();
    const prop = pSnap.exists ? (pSnap.data() as any) : null;

    // inventario: mappa id + key → dato (con prezzo corrente)
    const invSnap = await adminDb.collection("inventory").get();
    const invMap = new Map<string, any>();
    invSnap.docs.forEach(d => {
      const it = { id: d.id, ...(d.data() as any) };
      if (it.id) invMap.set(it.id, it);
      if ((it as any).key) invMap.set((it as any).key, it);
      // anche senza prefisso item_
      if (it.id?.startsWith("item_")) invMap.set(it.id.slice(5), it);
    });

    // ordine attivo collegato
    const oSnap = await adminDb.collection("orders").where("cleaningId", "==", cleaningId).get();
    const orderDoc = oSnap.docs.find(d => (d.data() as any).status !== "CANCELLED");
    const order = orderDoc ? { id: orderDoc.id, ...(orderDoc.data() as any) } : null;

    const g = c.guestsCount || c.guests || 0;
    const std = prop?.serviceConfigs ? (prop.serviceConfigs[g] ?? prop.serviceConfigs[String(g)]) : null;
    const attesi = std ? buildExpectedItems(std) : [];

    // ── ORDINE: riga per riga ──
    const invPrice = (key: string) => {
      const inv = invMap.get(key);
      return inv ? (inv.sellPrice ?? inv.price ?? 0) : null;
    };

    const righeOrdine = (order?.items || []).map((item: any) => {
      const key = item.itemId || item.id;
      const invNow = invMap.get(key);
      const prezzoCongelato = typeof item.unitPrice === "number" ? item.unitPrice : null;
      const prezzoInvOggi = invNow ? (invNow.sellPrice ?? invNow.price ?? 0) : null;
      return {
        id: key,
        nome: item.name,
        quantita: item.quantity,
        categoria: item.categoryId || item.categoryName || null,
        prezzoCongelatoNellOrdine: prezzoCongelato,
        prezzoInventarioOggi: prezzoInvOggi,
        prezzoCambiato: prezzoCongelato !== null && prezzoInvOggi !== null && Math.abs(prezzoCongelato - prezzoInvOggi) > 0.001,
      };
    });

    // ── CONFIG STANDARD: riga per riga (quantità attese) ──
    const righeConfig = attesi.map((e: any) => ({
      id: e.itemId,
      categoria: e.categoryId,
      quantitaAttesa: e.quantity,
      prezzoInventarioOggi: invPrice(e.itemId),
    }));

    // ── CONFRONTO per articolo (unione delle chiavi) ──
    const idsOrdine = new Map(righeOrdine.map((r: any) => [String(r.id), r]));
    const idsConfig = new Map(righeConfig.map((r: any) => [String(r.id), r]));
    const tutteLeChiavi = new Set([...idsOrdine.keys(), ...idsConfig.keys()]);
    const confronto: any[] = [];
    for (const k of tutteLeChiavi) {
      const o = idsOrdine.get(k);
      const cf = idsConfig.get(k);
      const qtyOrd = o?.quantita ?? 0;
      const qtyCfg = cf?.quantitaAttesa ?? 0;
      const prezzo = (cf?.prezzoInventarioOggi ?? o?.prezzoInventarioOggi ?? 0);
      let nota = "";
      if (!o) nota = "SOLO nella config (manca nell'ordine)";
      else if (!cf) nota = "SOLO nell'ordine (non previsto dalla config standard)";
      else if (qtyOrd !== qtyCfg) nota = `QUANTITÀ diversa: ordine ${qtyOrd} vs config ${qtyCfg}`;
      else if (o.prezzoCambiato) nota = `PREZZO cambiato: ordine congelato ${o.prezzoCongelatoNellOrdine} vs inventario oggi ${o.prezzoInventarioOggi}`;
      else nota = "coincide";
      confronto.push({
        id: k, quantitaOrdine: qtyOrd, quantitaConfig: qtyCfg,
        prezzoCongelato: o?.prezzoCongelatoNellOrdine ?? null,
        prezzoInvOggi: prezzo, nota,
      });
    }

    // somma prezzi per capire lo scarto
    const MANAGED = ["biancheria_letto", "biancheria_bagno", "kit_cortesia", "servizi_extra"];
    const totOrdine = righeOrdine.reduce((s: number, r: any) => {
      const cat = String(r.categoria || "").toLowerCase();
      const inManaged = MANAGED.some(m => cat.includes(m.replace("biancheria_", "").replace("_", "")) ) || MANAGED.includes(r.categoria);
      const price = r.prezzoCongelatoNellOrdine ?? 0;
      return s + (inManaged ? price * (r.quantita || 0) : 0);
    }, 0);
    const totConfig = righeConfig.reduce((s: number, r: any) => s + (r.prezzoInventarioOggi ?? 0) * (r.quantitaAttesa || 0), 0);

    return NextResponse.json({
      pulizia: {
        cleaningId, proprieta: prop?.name, data: c.scheduledDate?.toDate?.()?.toISOString()?.slice(0, 10),
        ospiti: g, status: c.status, linenConfigModified: c.linenConfigModified ?? false,
        configStandardUsata: std ? `serviceConfigs[${g}]` : "ASSENTE",
      },
      totali: {
        prezzoDaOrdine: Math.round(totOrdine * 100) / 100,
        prezzoDaConfigRicalcolo: Math.round(totConfig * 100) / 100,
        differenza: Math.round((totOrdine - totConfig) * 100) / 100,
      },
      CONFRONTO_ARTICOLO_PER_ARTICOLO: confronto,
      dettaglioOrdine: righeOrdine,
      dettaglioConfig: righeConfig,
      legenda: "Guarda la colonna 'nota' del CONFRONTO: dice per ogni articolo se lo scarto viene da quantità diversa, prezzo cambiato, o articolo presente in uno solo dei due.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
