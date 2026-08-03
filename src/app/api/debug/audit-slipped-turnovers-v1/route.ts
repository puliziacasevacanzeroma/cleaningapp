import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * AUDIT READ-ONLY — pulizie di turnover "scivolate" (bug pre-TURNOVER-RECOVERY).
 *
 * NON SCRIVE NULLA.
 *
 * IL BUG: prima che esistesse la turnover recovery, quando un blocco Booking si
 * allungava (perché il feed fonde due prenotazioni contigue), il sync SPOSTAVA
 * la pulizia dal vecchio checkout al nuovo. Se in mezzo c'era un vero cambio
 * ospiti, quella pulizia spariva in silenzio.
 *
 * L'IMPRONTA: l'auditLog registra CLEANING_CREATED con lo `scheduledDate` di
 * allora. Se oggi quella pulizia sta a un'altra data (o non esiste più) e
 * NESSUNA pulizia copre più la data originale, è un candidato.
 *
 * IL FILTRO ANTI-RUMORE: si segnalano SOLO le date che oggi cadono DENTRO un
 * blocco Booking attivo (checkIn < data < checkOut, source=booking). È la firma
 * esatta della fusione. Se la data non è coperta da nessun blocco, la
 * prenotazione è stata semplicemente cancellata: non è questo bug.
 *
 * ⚠️ L'output è una LISTA DI CANDIDATI DA VERIFICARE SU BOOKING, non una verità.
 * Un blocco lungo può essere un ospite solo che ha prolungato (nessuna pulizia
 * dovuta) oppure due prenotazioni attaccate (pulizia dovuta). Il gestionale non
 * può distinguerli: serve l'occhio umano sull'extranet.
 *
 * Uso:
 *   /api/debug/audit-slipped-turnovers-v1?cronSecret=XXX
 *   [&from=YYYY-MM-DD]  data minima da considerare (default: oggi)
 *   [&to=YYYY-MM-DD]    data massima (default: oggi + 365gg)
 *   [&property=poerio]  filtra per nome proprietà
 */

type AnyRec = Record<string, any>;

const dayOf = (t: any): string | null => {
  try {
    const d = typeof t?.toDate === "function" ? t.toDate() : t instanceof Date ? t : null;
    return d ? d.toISOString().split("T")[0]! : null;
  } catch { return null; }
};
const isoOf = (t: any): string | null => {
  try {
    const d = typeof t?.toDate === "function" ? t.toDate() : t instanceof Date ? t : null;
    return d ? d.toISOString() : null;
  } catch { return null; }
};

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().split("T")[0]!;
  const fromStr = (sp.get("from") || today).trim();
  const toStr = (sp.get("to") || new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0]!).trim();
  const propFilter = (sp.get("property") || "").trim().toLowerCase();

  try {
    const stats: AnyRec = {};

    // ── 1. Proprietà ────────────────────────────────────────────
    const propsSnap = await adminDb.collection("properties").get();
    const propById = new Map<string, AnyRec>();
    propsSnap.docs.forEach(d => {
      const p = { id: d.id, ...(d.data() as AnyRec) };
      if (propFilter && !String(p.name || "").toLowerCase().includes(propFilter)) return;
      propById.set(d.id, p);
    });
    stats.propertiesConsidered = propById.size;

    // ── 2. Pulizie attuali dalla data `from` in poi ─────────────
    //    (mappa per id + set "propertyId|data" per sapere cosa è coperto oggi)
    const cleanSnap = await adminDb.collection("cleanings").get();
    const cleaningById = new Map<string, { date: string | null; status: string | null; propertyId: string }>();
    const coveredDates = new Set<string>();
    cleanSnap.docs.forEach(d => {
      const c = d.data() as AnyRec;
      const date = dayOf(c.scheduledDate);
      cleaningById.set(d.id, { date, status: c.status || null, propertyId: c.propertyId || "" });
      if (date && c.status !== "CANCELLED") coveredDates.add(`${c.propertyId}|${date}`);
    });
    stats.cleaningsScanned = cleanSnap.size;

    // ── 3. Blocchi Booking attivi che ATTRAVERSANO una data ─────
    const bookSnap = await adminDb.collection("bookings").get();
    const blocksByProp = new Map<string, AnyRec[]>();
    bookSnap.docs.forEach(d => {
      const b = d.data() as AnyRec;
      const src = String(b.source || b.bookingSource || "").toLowerCase();
      if (src !== "booking") return; // solo Booking: è l'unico feed che fonde
      if (String(b.status || "").toLowerCase() === "cancelled") return;
      const ci = dayOf(b.checkIn);
      const co = dayOf(b.checkOut);
      if (!ci || !co) return;
      const pid = b.propertyId || "";
      if (!blocksByProp.has(pid)) blocksByProp.set(pid, []);
      blocksByProp.get(pid)!.push({ id: d.id, checkIn: ci, checkOut: co, guestName: b.guestName || null });
    });
    stats.bookingBlocksScanned = Array.from(blocksByProp.values()).reduce((a, v) => a + v.length, 0);

    // ── 4. auditLog: CLEANING_CREATED (equality su singolo campo) ─
    const logSnap = await adminDb.collection("auditLog").where("action", "==", "CLEANING_CREATED").get();
    stats.auditEntriesScanned = logSnap.size;

    // ── 5. Incrocio ─────────────────────────────────────────────
    const seen = new Set<string>();
    const findings: AnyRec[] = [];
    let skippedNotInWindow = 0;
    let skippedCovered = 0;
    let skippedNoBlock = 0;
    let skippedStillThere = 0;

    for (const d of logSnap.docs) {
      const a = d.data() as AnyRec;
      const pid = a.propertyId || "";
      if (!propById.has(pid)) continue;

      const loggedDate: string | undefined = a.details?.scheduledDate;
      if (!loggedDate || loggedDate < fromStr || loggedDate > toStr) { skippedNotInWindow++; continue; }

      const key = `${pid}|${loggedDate}`;
      if (seen.has(key)) continue;

      // (a) Oggi quella data è coperta da una pulizia? → nessun buco
      if (coveredDates.has(key)) { skippedStillThere++; seen.add(key); continue; }

      // (b) La data cade DENTRO un blocco Booking attivo? (firma della fusione)
      const blocks = blocksByProp.get(pid) || [];
      const block = blocks.find(b => b.checkIn < loggedDate && loggedDate < b.checkOut);
      if (!block) { skippedNoBlock++; continue; }

      // (c) Che fine ha fatto la pulizia loggata?
      const cid = a.entityId as string | null;
      const cur = cid ? cleaningById.get(cid) : undefined;
      let esito: string;
      if (!cur) esito = "CANCELLATA (la pulizia loggata non esiste più)";
      else if (cur.date === loggedDate) esito = "ANOMALIA: esiste ancora alla data ma risulta scoperta — verifica lo status";
      else esito = `SPOSTATA al ${cur.date} (status ${cur.status})`;

      seen.add(key);
      skippedCovered += 0;
      findings.push({
        propertyId: pid,
        propertyName: propById.get(pid)!.name,
        usesOwnLinen: propById.get(pid)!.usesOwnLinen === true,
        dataScoperta: loggedDate,
        esitoPuliziaOriginale: esito,
        cleaningIdLoggato: cid,
        loggataIl: isoOf(a.timestamp),
        sourceLog: a.source || null,
        bloccoBookingCheAttraversa: {
          bookingId: block.id,
          checkIn: block.checkIn,
          checkOut: block.checkOut,
          notti: Math.round((new Date(block.checkOut).getTime() - new Date(block.checkIn).getTime()) / 86400000),
        },
        daVerificareSuBooking: `Il ${loggedDate} entra un nuovo ospite? Se sì la pulizia manca. Se è lo stesso che prolunga, è corretto così.`,
      });
    }

    findings.sort((a, b) => String(a.dataScoperta).localeCompare(String(b.dataScoperta)));

    // Raggruppa per proprietà per lettura rapida
    const byProperty: AnyRec = {};
    findings.forEach(f => {
      if (!byProperty[f.propertyName]) byProperty[f.propertyName] = [];
      byProperty[f.propertyName].push(f.dataScoperta);
    });

    return NextResponse.json({
      readOnly: true,
      avvertenza: "LISTA DI CANDIDATI DA VERIFICARE SU BOOKING, non un elenco di errori certi. Un blocco lungo può essere un solo ospite che prolunga (nessuna pulizia dovuta) o due prenotazioni fuse (pulizia dovuta).",
      query: { from: fromStr, to: toStr, property: propFilter || "(tutte)" },
      stats: {
        ...stats,
        scartati: {
          fuoriFinestra: skippedNotInWindow,
          giaCoperteDaUnaPulizia: skippedStillThere,
          nessunBloccoBookingCheAttraversa: skippedNoBlock,
        },
      },
      totaleCandidati: findings.length,
      riepilogoPerProprieta: byProperty,
      dettaglio: findings,
    }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
