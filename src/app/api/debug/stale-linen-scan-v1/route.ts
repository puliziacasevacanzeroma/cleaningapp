/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Scan ordini biancheria STALE su tutta la flotta  (SOLO LETTURA)
 * v2 — letture in BATCH (getAll a blocchi), niente N+1 → niente timeout.
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/stale-linen-scan-v1?cronSecret=XXX
 *
 * STALE = ordine ancora PENDING la cui PULIZIA collegata è già COMPLETED/VERIFIED.
 * Orfani rimasti indietro nel ciclo di vita (Bug B): la pulizia è stata completata
 * da un percorso che NON ha confermato la consegna (es. PUT generico cleanings/[id],
 * non il flusso operatore /complete).
 *
 * Conseguenze per ogni STALE:
 *   - ancora ricalcolabile dalla config → acconti fantasma (ora bloccato dalla guardia);
 *   - magazzino NON scalato (lo scarico è solo in /complete) → giacenze gonfiate.
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

/** Esegue una getAll a blocchi (Firestore getAll regge molti ref, ma chunkiamo per sicurezza). */
async function batchGet(coll: string, ids: string[], chunkSize = 250) {
  const result = new Map<string, any>();
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    if (slice.length === 0) continue;
    const refs = slice.map((id) => adminDb.collection(coll).doc(id));
    // @ts-ignore — adminDb.getAll(...refs) è supportato da firebase-admin Firestore
    const snaps = await adminDb.getAll(...refs);
    snaps.forEach((s: any) => result.set(s.id, s.exists ? s.data() : null));
  }
  return result;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // Caricamenti in parallelo (niente N+1): inventory, properties, ordini PENDING
    const [invSnap, propsSnap, pendingSnap] = await Promise.all([
      adminDb.collection("inventory").get(),
      adminDb.collection("properties").get(),
      adminDb.collection("orders").where("status", "==", "PENDING").get(),
    ]);

    // Prezzi
    const priceById = new Map<string, number>();
    invSnap.docs.forEach((d) => {
      const x = d.data() as any;
      const p = x.sellPrice || x.price || 0;
      priceById.set(d.id, p);
      if (x.key) priceById.set(x.key, p);
      if (d.id.startsWith("item_")) priceById.set(d.id.replace("item_", ""), p);
    });

    // Nomi proprietà / proprietari
    const propName = new Map<string, string>();
    const propOwner = new Map<string, string>();
    propsSnap.docs.forEach((d) => {
      const x = d.data() as any;
      propName.set(d.id, x.name || d.id);
      propOwner.set(d.id, x.ownerName || x.ownerId || "—");
    });

    // Raccogli i cleaningId unici degli ordini PENDING e leggili in BATCH
    const cleaningIds = Array.from(
      new Set(
        pendingSnap.docs
          .map((o) => (o.data() as any).cleaningId)
          .filter((c): c is string => !!c),
      ),
    );
    const cleaningById = await batchGet("cleanings", cleaningIds);

    // Iterazione in memoria (zero await nel loop)
    const stale: any[] = [];
    const byOwner: Record<string, { count: number; giaMutatiDaConfig: number; totale: number; ordini: string[] }> = {};

    for (const orderDoc of pendingSnap.docs) {
      const o = orderDoc.data() as any;
      const cleaningId: string | undefined = o.cleaningId;
      if (!cleaningId) continue;

      const c = cleaningById.get(cleaningId);
      const cleaningStatus = c ? (c.status ?? null) : null;
      if (!isCleaningDone(cleaningStatus)) continue; // non STALE

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

    const ownerRanking = Object.entries(byOwner)
      .map(([proprietario, v]) => ({ proprietario, ...v }))
      .sort((a, b) => b.count - a.count);

    stale.sort((a, b) => (a.proprietario || "").localeCompare(b.proprietario || ""));

    return NextResponse.json({
      success: true,
      riepilogo: {
        ordiniPENDINGesaminati: pendingSnap.size,
        cleaningLetteInBatch: cleaningIds.length,
        ordiniSTALE: stale.length,
        proprietariImpattati: ownerRanking.length,
        ordiniSTALE_giaMutatiDaConfig: stale.filter((s) => s.itemsUpdatedFromConfig).length,
        nota:
          "STALE = PENDING su pulizia COMPLETED/VERIFIED. 'giaMutatiDaConfig' = già " +
          "ricalcolati dopo la consegna → candidati certi ad acconto fantasma. Gli altri " +
          "sono bombe innescate (acconto alla prossima modifica config, ora bloccata dalla guardia).",
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
