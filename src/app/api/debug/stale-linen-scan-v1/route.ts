/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Scan ordini biancheria STALE su tutta la flotta  (SOLO LETTURA)
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/stale-linen-scan-v1?cronSecret=XXX
 *
 * STALE = ordine ancora PENDING la cui PULIZIA collegata è già COMPLETED/VERIFIED.
 * Sono gli ordini "orfani" rimasti indietro nel ciclo di vita (Bug B): la
 * pulizia è stata completata da un percorso che NON ha confermato la consegna
 * (es. PUT generico su cleanings/[id], non il flusso operatore /complete).
 *
 * Conseguenze di ogni ordine STALE:
 *   - è ancora ricalcolabile dalla config → può generare acconti fantasma
 *     (ora bloccato dalla guardia in update-pending-orders, ma l'ordine resta orfano);
 *   - il magazzino NON è stato scalato per quella consegna (lo scarico avviene
 *     solo dentro /complete) → giacenze potenzialmente gonfiate.
 *
 * Per ogni STALE mostra: proprietà, proprietario, stato pulizia, date, totale,
 * e i flag itemsUpdatedFromConfig + updatedAt (se updatedAt è recente e config-driven
 * → è un ordine GIÀ mutato dopo la consegna, cioè un acconto fantasma già materializzato).
 * Raggruppa per proprietario per stimare chi è impattato.
 *
 * NON scrive nulla. Read-only puro.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { isCleaningDone } from "~/lib/linen/orderLifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const round = (n: number) => Math.round(n * 100) / 100;
const toDate = (d: any): Date | null => {
  if (!d) return null;
  if (typeof d.toDate === "function") { try { return d.toDate(); } catch { return null; } }
  if (d instanceof Date) return d;
  const p = new Date(d);
  return isNaN(p.getTime()) ? null : p;
};
const fmt = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // Inventory map (per il totale ordine)
    const invSnap = await adminDb.collection("inventory").get();
    const priceById = new Map<string, number>();
    invSnap.docs.forEach((d) => {
      const x = d.data() as any;
      const p = x.sellPrice || x.price || 0;
      priceById.set(d.id, p);
      if (x.key) priceById.set(x.key, p);
      if (d.id.startsWith("item_")) priceById.set(d.id.replace("item_", ""), p);
    });

    // Nomi proprietà + proprietari
    const propsSnap = await adminDb.collection("properties").get();
    const propName = new Map<string, string>();
    const propOwner = new Map<string, string>();
    propsSnap.docs.forEach((d) => {
      const x = d.data() as any;
      propName.set(d.id, x.name || d.id);
      propOwner.set(d.id, x.ownerName || x.ownerId || "—");
    });

    // Tutti gli ordini PENDING (è lo stesso insieme che la config ricalcolerebbe)
    const pendingSnap = await adminDb.collection("orders").where("status", "==", "PENDING").get();

    // Cache stato pulizia
    const cleaningCache = new Map<string, any | null>();
    const getCleaning = async (cid: string) => {
      if (cleaningCache.has(cid)) return cleaningCache.get(cid);
      try {
        const cs = await adminDb.collection("cleanings").doc(cid).get();
        const v = cs.exists ? cs.data() : null;
        cleaningCache.set(cid, v);
        return v;
      } catch {
        cleaningCache.set(cid, null);
        return null;
      }
    };

    const stale: any[] = [];
    const byOwner: Record<string, { count: number; giaMutatiDaConfig: number; totale: number; ordini: string[] }> = {};

    for (const orderDoc of pendingSnap.docs) {
      const o = orderDoc.data() as any;
      const cleaningId: string | undefined = o.cleaningId;
      if (!cleaningId) continue;

      const c = await getCleaning(cleaningId);
      const cleaningStatus = c ? (c.status ?? null) : null;
      if (!isCleaningDone(cleaningStatus)) continue; // non STALE

      // totale ordine (somma items × prezzo, esclusi importi a 0)
      let total = 0;
      if (Array.isArray(o.items)) {
        for (const it of o.items) {
          const key = it.itemId || it.id;
          const unit = it.priceOverride ?? it.unitPrice ?? it.price ?? priceById.get(key) ?? 0;
          total += (unit || 0) * (it.quantity ?? 1);
        }
      }
      total = round(total);

      const owner = propOwner.get(o.propertyId) || "—";
      const giaMutato = o.itemsUpdatedFromConfig === true;

      stale.push({
        orderId: orderDoc.id,
        proprieta: propName.get(o.propertyId) || o.propertyId,
        proprietario: owner,
        statoPulizia: cleaningStatus,
        cleaningId,
        scheduledDate: fmt(toDate(o.scheduledDate)),
        deliveredAt: fmt(toDate(o.deliveredAt)),
        updatedAt: fmt(toDate(o.updatedAt)),
        itemsUpdatedFromConfig: giaMutato || undefined,
        totaleOrdine: total,
        type: o.type ?? null,
      });

      if (!byOwner[owner]) byOwner[owner] = { count: 0, giaMutatiDaConfig: 0, totale: 0, ordini: [] };
      byOwner[owner].count++;
      if (giaMutato) byOwner[owner].giaMutatiDaConfig++;
      byOwner[owner].totale = round(byOwner[owner].totale + total);
      byOwner[owner].ordini.push(orderDoc.id);
    }

    // ordina i proprietari per numero di ordini STALE (peggiori prima)
    const ownerRanking = Object.entries(byOwner)
      .map(([proprietario, v]) => ({ proprietario, ...v }))
      .sort((a, b) => b.count - a.count);

    stale.sort((a, b) => (a.proprietario || "").localeCompare(b.proprietario || ""));

    return NextResponse.json({
      success: true,
      riepilogo: {
        ordiniPENDINGesaminati: pendingSnap.size,
        ordiniSTALE: stale.length,
        proprietariImpattati: ownerRanking.length,
        ordiniSTALE_giaMutatiDaConfig: stale.filter((s) => s.itemsUpdatedFromConfig).length,
        nota:
          "STALE = PENDING su pulizia COMPLETED/VERIFIED. 'giaMutatiDaConfig' = " +
          "quelli con itemsUpdatedFromConfig: hanno già subito un ricalcolo dopo la " +
          "consegna → candidati certi ad acconto fantasma. Gli altri sono bombe innescate " +
          "(diventano acconto alla prossima modifica config — ora bloccata dalla guardia).",
      },
      perProprietario: ownerRanking,
      ordini: stale,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Errore server", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
