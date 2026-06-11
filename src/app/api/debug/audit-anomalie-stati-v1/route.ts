/**
 * ════════════════════════════════════════════════════════════════════
 * AUDIT PROBE F-15 / F-19 / F-20 / F-03 — Anomalie macchina a stati
 * ════════════════════════════════════════════════════════════════════
 * READ-ONLY. Nessuna scrittura. Gated da ?cronSecret=.
 *
 * Sezioni:
 *  A) STALE MUTATI (F-15): ordini PENDING su pulizia COMPLETED, con focus su
 *     quelli toccati DOPO il completamento della pulizia (updatedAt > completedAt)
 *     → prova che le porte laterali stanno riscrivendo importi di mesi chiusi.
 *  B) MIGRAZIONE MESE (F-19): ordini DELIVERED con mese(deliveredAt) ≠
 *     mese(scheduledDate) → ordini che fatturano in un mese diverso dal servizio.
 *     gapGiorni alto = sospetto re-edit da modal su pulizia vecchia.
 *  C) DELIVERED SENZA SCARICO (F-19): ordini DELIVERED con inventoryDeducted ≠ true
 *     → consegne che non hanno mai scalato il magazzino (via client SDK o legacy).
 *  D) ORDINE CONDIVISO (F-20): laundryOrderId puntato da PIÙ pulizie distinte.
 *  E) ORFANI (F-03): ordini non-CANCELLED il cui cleaningId non esiste più.
 *
 * Posizione: src/app/api/debug/audit-anomalie-stati-v1/route.ts
 * Uso: GET /api/debug/audit-anomalie-stati-v1?cronSecret=XXX
 *      parametri opzionali: &months=24
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function toDate(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d.toDate === "function") { try { return d.toDate(); } catch { return null; } }
  return null;
}
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const ym = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null);

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("cronSecret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const monthsBack = Math.min(36, Math.max(1, Number(req.nextUrl.searchParams.get("months") || 24)));
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const startTs = Timestamp.fromDate(rangeStart);

  // ── Tutte le pulizie (campi minimi) ──
  const cleaningsSnap = await adminDb.collection("cleanings")
    .select("status", "completedAt", "laundryOrderId", "propertyName", "scheduledDate")
    .get();
  const cleaningById = new Map<string, any>();
  const cleaningsByOrderId = new Map<string, { cleaningId: string; propertyName: string; scheduledDate: Date | null }[]>();
  for (const d of cleaningsSnap.docs) {
    const c = d.data() as any;
    cleaningById.set(d.id, c);
    if (c.laundryOrderId) {
      const arr = cleaningsByOrderId.get(c.laundryOrderId) || [];
      arr.push({ cleaningId: d.id, propertyName: c.propertyName || "?", scheduledDate: toDate(c.scheduledDate) });
      cleaningsByOrderId.set(c.laundryOrderId, arr);
    }
  }

  // ── Ordini nel range (campi minimi) ──
  const ordersSnap = await adminDb.collection("orders")
    .where("scheduledDate", ">=", startTs)
    .select("status", "cleaningId", "propertyName", "ownerName", "scheduledDate",
            "deliveredAt", "updatedAt", "createdAt", "inventoryDeducted", "calculatedTotal",
            "autoConfirmedByCleaningCompletion", "excludedFromBilling")
    .get();

  // A) Stale mutati
  const staleTotali: any[] = [];
  const staleMutatiDopoCompletamento: any[] = [];
  // B) Migrazione mese
  const meseMigrato: any[] = [];
  // C) Delivered senza scarico
  const deliveredSenzaScarico: any[] = [];
  // E) Orfani
  const orfani: any[] = [];

  for (const doc of ordersSnap.docs) {
    const o = doc.data() as any;
    const sched = toDate(o.scheduledDate);
    const deliv = toDate(o.deliveredAt);
    const upd = toDate(o.updatedAt);
    const base = {
      orderId: doc.id,
      property: o.propertyName || "?",
      owner: o.ownerName || "?",
      status: o.status,
      scheduledDate: ymd(sched),
    };

    // E) orfano
    if (o.status !== "CANCELLED" && o.cleaningId && !cleaningById.has(o.cleaningId)) {
      orfani.push({ ...base, cleaningId: o.cleaningId });
    }

    // A) stale
    if (o.status === "PENDING" && o.cleaningId) {
      const c = cleaningById.get(o.cleaningId);
      if (c?.status === "COMPLETED") {
        const completedAt = toDate(c.completedAt);
        const row = {
          ...base,
          completedAt: ymd(completedAt),
          orderUpdatedAt: ymd(upd),
          calculatedTotal: typeof o.calculatedTotal === "number" ? o.calculatedTotal : null,
        };
        staleTotali.push(row);
        // toccato DOPO il completamento (margine 10 min per escludere il write contestuale)
        if (completedAt && upd && upd.getTime() > completedAt.getTime() + 10 * 60 * 1000) {
          staleMutatiDopoCompletamento.push(row);
        }
      }
    }

    // B) migrazione mese
    if (o.status === "DELIVERED" && sched && deliv) {
      if (ym(sched) !== ym(deliv)) {
        const gapGiorni = Math.round((deliv.getTime() - sched.getTime()) / 86400000);
        meseMigrato.push({
          ...base,
          deliveredAt: ymd(deliv),
          meseServizio: ym(sched),
          meseFatturato: ym(deliv),
          gapGiorni,
          autoConfermato: o.autoConfirmedByCleaningCompletion === true,
          sospettoReEdit: Math.abs(gapGiorni) > 14,
        });
      }
    }

    // C) delivered senza scarico
    if (o.status === "DELIVERED" && o.inventoryDeducted !== true) {
      deliveredSenzaScarico.push({ ...base, deliveredAt: ymd(deliv) });
    }
  }

  // D) ordini condivisi tra più pulizie
  const condivisi = Array.from(cleaningsByOrderId.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([orderId, arr]) => ({
      orderId,
      pulizie: arr.map(x => ({ cleaningId: x.cleaningId, property: x.propertyName, data: ymd(x.scheduledDate) })),
    }));

  meseMigrato.sort((a, b) => Math.abs(b.gapGiorni) - Math.abs(a.gapGiorni));

  const cap = <T,>(arr: T[]) => ({ totale: arr.length, lista: arr.slice(0, 100), troncato: arr.length > 100 });

  return NextResponse.json({
    probe: "audit-anomalie-stati-v1",
    readOnly: true,
    finestraMesi: monthsBack,
    ordiniNelRange: ordersSnap.size,
    pulizieTotali: cleaningsSnap.size,
    A_stalePendingSuCompleted: {
      ...cap(staleTotali),
      diCuiMutatiDopoCompletamento: cap(staleMutatiDopoCompletamento),
    },
    B_ordiniConMeseFatturatoDiversoDalServizio: cap(meseMigrato),
    C_deliveredSenzaScaricoMagazzino: cap(deliveredSenzaScarico),
    D_ordiniCondivisiTraPiuPulizie: cap(condivisi),
    E_ordiniOrfaniPuliziaInesistente: cap(orfani),
  });
}
