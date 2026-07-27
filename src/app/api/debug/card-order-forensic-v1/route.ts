/**
 * DEBUG FORENSE: perché la CARD mostra dotazioni diverse dal MODAL?
 * GET /api/debug/card-order-forensic-v1?cronSecret=XXX&property=Trastevere&date=2026-07-27
 *
 * READ-ONLY (nessuna scrittura). Per ogni pulizia della proprietà nel giorno:
 *  1. PULIZIA: guestsCount, hasLinenOrder, linenConfigModified, customLinenConfig RAW, customLinenItems
 *  2. PROPRIETÀ: usesOwnLinen, bedsConfig RAW (per verificare anche il bug capacity/cap),
 *     serviceConfigs[ospiti] RAW
 *  3. ORDINE collegato: items RAW con TUTTI i campi (itemId, id, categoryId, categoryName,
 *     unitPrice, price, type)
 *  4. SIMULAZIONE CARD: replica ESATTA di deriveDotazioniFromOrder (DashboardContent) item
 *     per item → in che bucket finisce o perché viene SCARTATO (è il sospetto n.1: item
 *     presenti nell'ordine ma non classificabili → spariscono dalla card e dal prezzo)
 *  5. ATTESO DA CONFIG: buildExpectedItems(linenCore) sulla config effettiva
 *     (customLinenConfig se linenConfigModified===true, altrimenti serviceConfigs[ospiti])
 *     → è quello che mostra il modal
 *  6. DIFF ordine vs atteso
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { buildExpectedItems } from "~/lib/linen/linenCore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const propertyQ = searchParams.get("property");
  const dateQ = searchParams.get("date"); // YYYY-MM-DD opzionale (default: oggi ±3)
  if (!propertyQ) return NextResponse.json({ error: "Passa &property= (parte del nome)" }, { status: 400 });

  try {
    // ── proprietà ──────────────────────────────────────────────────────────
    const propsSnap = await adminDb.collection("properties").get();
    const prop = propsSnap.docs.find(d => (d.data().name || "").toLowerCase().includes(propertyQ.toLowerCase()));
    if (!prop) return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    const p = prop.data() as any;

    // ── inventario (mappa IDENTICA alla card: solo id + key, senza item_ strip) ──
    const invSnap = await adminDb.collection("inventory").get();
    const inventory = invSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const cardInvMap = new Map<string, any>();
    inventory.forEach((it: any) => {
      if (it?.id) cardInvMap.set(it.id, it);
      if (it?.key) cardInvMap.set(it.key, it);
    });

    // ── replica ESATTA di resolveCat della card (DashboardContent) ─────────
    const cardResolveCat = (item: any, inv: any): string | null => {
      if (item?.categoryId) return item.categoryId;
      const cn = String(item?.categoryName || "").toLowerCase();
      if (cn.includes("letto")) return "biancheria_letto";
      if (cn.includes("bagno")) return "biancheria_bagno";
      if (cn.includes("kit") || cn.includes("cortesia")) return "kit_cortesia";
      if (cn.includes("extra")) return "servizi_extra";
      return inv?.categoryId || null;
    };

    // ── range data ─────────────────────────────────────────────────────────
    let start: Date, end: Date;
    if (dateQ) {
      start = new Date(dateQ + "T00:00:00"); end = new Date(dateQ + "T23:59:59");
    } else {
      start = new Date(); start.setDate(start.getDate() - 3); start.setHours(0, 0, 0, 0);
      end = new Date(); end.setDate(end.getDate() + 3); end.setHours(23, 59, 59, 999);
    }

    const cleanSnap = await adminDb.collection("cleanings")
      .where("propertyId", "==", prop.id)
      .where("scheduledDate", ">=", Timestamp.fromDate(start))
      .where("scheduledDate", "<=", Timestamp.fromDate(end))
      .get();

    const ordSnap = await adminDb.collection("orders")
      .where("propertyId", "==", prop.id)
      .where("scheduledDate", ">=", Timestamp.fromDate(start))
      .where("scheduledDate", "<=", Timestamp.fromDate(end))
      .get();
    const orders = ordSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const report = cleanSnap.docs.map(cd => {
      const c = cd.data() as any;
      const g = c.guestsCount || c.guests || 0;
      const svcCfg = p.serviceConfigs
        ? (p.serviceConfigs[g] ?? p.serviceConfigs[String(g)] ?? null)
        : null;

      // config EFFETTIVA (stessa regola del modal)
      const usesCustom = c.linenConfigModified === true && c.customLinenConfig
        && c.customLinenConfig.bl && Object.keys(c.customLinenConfig.bl).length > 0;
      const effectiveConfig = usesCustom ? c.customLinenConfig : svcCfg;

      // ordine collegato (stessa ricerca della card: cleaningId, poi laundryOrderId)
      const ord =
        orders.find(o => o.cleaningId === cd.id && o.status !== "CANCELLED") ||
        (c.laundryOrderId ? orders.find(o => o.id === c.laundryOrderId && o.status !== "CANCELLED") : undefined) ||
        null;

      // ── SIMULAZIONE CARD item per item ──────────────────────────────────
      const cardSim = (ord?.items || []).map((item: any) => {
        const qty = typeof item?.quantity === "number" ? item.quantity : 0;
        const inv = cardInvMap.get(item?.itemId) || cardInvMap.get(item?.id);
        const cat = cardResolveCat(item, inv);
        const managed = ["biancheria_letto", "biancheria_bagno", "kit_cortesia", "servizi_extra"].includes(String(cat));
        const price = typeof item?.unitPrice === "number" ? item.unitPrice : (inv?.sellPrice ?? inv?.price ?? 0);
        let esito = "OK_IN_CARD";
        if (qty <= 0) esito = "SCARTATO_qty<=0";
        else if (!managed) esito = "SCARTATO_categoria_non_risolta";
        return {
          name: item?.name, itemId: item?.itemId ?? null, id: item?.id ?? null,
          quantity: item?.quantity, categoryId: item?.categoryId ?? null,
          categoryName: item?.categoryName ?? null, type: item?.type ?? null,
          unitPrice: item?.unitPrice ?? null, price: item?.price ?? null,
          invTrovato: inv ? { id: inv.id, key: inv.key ?? null, categoryId: inv.categoryId ?? null } : "NESSUN_MATCH_IN_INVENTARIO",
          categoriaRisolta: cat, prezzoUsatoDallaCard: price, ESITO: esito,
        };
      });
      const dotazioniCard = cardSim
        .filter((s: any) => s.ESITO === "OK_IN_CARD")
        .reduce((sum: number, s: any) => sum + s.prezzoUsatoDallaCard * (s.quantity || 0), 0);

      // ── ATTESO dal modal (linenCore su config effettiva) ────────────────
      const atteso = effectiveConfig ? buildExpectedItems(effectiveConfig) : [];
      const idsOrdine = new Set((ord?.items || []).map((i: any) => String(i.itemId || i.id)));
      const attesiMancantiNellOrdine = atteso.filter(a => !idsOrdine.has(String(a.itemId)));

      return {
        cleaningId: cd.id,
        data: c.scheduledDate?.toDate?.()?.toISOString()?.slice(0, 16),
        status: c.status,
        guestsCount: g,
        hasLinenOrder: c.hasLinenOrder ?? null,
        linenConfigModified: c.linenConfigModified ?? null,
        configUsata: usesCustom ? "customLinenConfig" : (svcCfg ? `serviceConfigs[${g}]` : "NESSUNA"),
        customLinenConfig_RAW: c.customLinenConfig ?? null,
        customLinenItems_RAW: c.customLinenItems ?? null,
        ordine: ord ? {
          orderId: ord.id, status: ord.status, cleaningId: ord.cleaningId ?? null,
          updatedAt: ord.updatedAt?.toDate?.()?.toISOString?.() ?? null,
          items_RAW: ord.items ?? [],
        } : "NESSUN_ORDINE_COLLEGATO",
        SIMULAZIONE_CARD: cardSim,
        dotazioniPrezzoCard: Math.round(dotazioniCard * 100) / 100,
        ATTESO_DA_CONFIG_linenCore: atteso,
        ATTESI_MANCANTI_NELL_ORDINE: attesiMancantiNellOrdine,
      };
    });

    return NextResponse.json({
      success: true,
      proprieta: {
        id: prop.id, name: p.name,
        usesOwnLinen: p.usesOwnLinen ?? null,
        bedsConfig_RAW: p.bedsConfig ?? null, // verifica anche il bug capacity vs cap
        serviceConfigsKeys: p.serviceConfigs ? Object.keys(p.serviceConfigs) : null,
      },
      pulizie: report,
      legenda: {
        SCARTATO_categoria_non_risolta: "item presente nell'ordine ma la card non riesce a categorizzarlo → NON appare nella card e NON conta nel prezzo dotazioni",
        ATTESI_MANCANTI_NELL_ORDINE: "item che la config effettiva (= modal) prevede ma che NON esistono nell'ordine → l'ordine non è mai stato allineato alla config",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
