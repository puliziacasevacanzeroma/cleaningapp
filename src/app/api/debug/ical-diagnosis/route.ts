/**
 * 🔍 DEBUG ENDPOINT — Diagnostica sincronizzazione iCal
 * 
 * Confronta le prenotazioni presenti nel/nei feed iCal di una proprietà
 * con quelle salvate nel DB Firestore, evidenziando discrepanze.
 * 
 * URL:
 *   - Singola proprietà per nome:  /api/debug/ical-diagnosis?secret=XXX&propertyName=Domus Enea
 *   - Singola proprietà per ID:    /api/debug/ical-diagnosis?secret=XXX&propertyId=abc123
 *   - Tutte le proprietà:          /api/debug/ical-diagnosis?secret=XXX&all=true
 *   - Formato HTML (più leggibile): aggiungere &format=html
 * 
 * Per ogni proprietà riporta 3 categorie di discrepanze:
 *   - IN_DB_NOT_IN_FEED: prenotazioni residue nel DB ma sparite dal feed
 *     (candidate a cancellazione, tipicamente prenotazioni cancellate su piattaforma
 *      che non sono state rimosse dal DB)
 *   - IN_FEED_NOT_IN_DB: prenotazioni nel feed ma mai arrivate al DB
 *     (sync-ical non le ha importate — bug o filtri)
 *   - DATE_MISMATCH: stessa prenotazione ma date diverse tra feed e DB
 *     (es: ospite ha modificato soggiorno ma cron non ha aggiornato)
 * 
 * Da rimuovere dopo aver risolto il bug.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;

// ============================================================
// Parser iCal MINIMALE (copia delle stesse regole del cron ufficiale
// per poter confrontare like-for-like).
// ============================================================

interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  description?: string;
}

function parseICalDate(s: string): Date {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/);
  if (!m) return new Date(NaN);
  const [, yy, mo, dd, hh, mi] = m;
  const y = parseInt(yy);
  const m0 = parseInt(mo) - 1;
  const d = parseInt(dd);
  const h = hh ? parseInt(hh) : 12;
  const mm = mi ? parseInt(mi) : 0;
  if (s.includes("T") && s.endsWith("Z")) {
    return new Date(Date.UTC(y, m0, d, h, mm));
  }
  if (s.includes("T")) {
    return new Date(y, m0, d, h, mm);
  }
  // Pure date (senza orario) → mezzogiorno UTC per coerenza con cron
  return new Date(Date.UTC(y, m0, d, 12, 0, 0));
}

function parseICal(text: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
  for (const block of normalized.split("BEGIN:VEVENT").slice(1)) {
    const e: Partial<ICalEvent> = {};
    for (const line of block.split("END:VEVENT")[0]?.split("\n") || []) {
      const ci = line.indexOf(":");
      if (ci === -1) continue;
      const k = line.substring(0, ci).split(";")[0];
      const v = line.substring(ci + 1).trim();
      if (k === "UID") e.uid = v;
      if (k === "SUMMARY") e.summary = v.replace(/\\[,;nN]/g, " ").trim();
      if (k === "DTSTART") e.dtstart = parseICalDate(v);
      if (k === "DTEND") e.dtend = parseICalDate(v);
      if (k === "DESCRIPTION") e.description = v;
    }
    if (e.uid && e.dtstart && e.dtend && (e.dtend.getTime() - e.dtstart.getTime()) > 0) {
      events.push(e as ICalEvent);
    }
  }
  return events;
}

// Stessa logica di isBlock() del cron
function isBlock(e: ICalEvent, source: string): boolean {
  const sum = (e.summary || "").toLowerCase();
  if (source === "booking") return false;
  const BLOCK_PATTERNS = [
    "not available", "unavailable", "blocked", "closed", "chiuso",
    "non disponibile", "bloccata", "bloccato", "owner block", "maintenance",
    "pulizie", "manutenzione", "owner", "proprietario", "stop sell", "no vacancy",
  ];
  if (BLOCK_PATTERNS.some((p) => sum.includes(p))) return true;
  if (source === "airbnb" && sum === "reserved" && !e.description?.includes("/hosting/reservations/")) return true;
  return false;
}

async function fetchIcal(url: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, {
      headers: { "User-Agent": "CleaningApp-Debug/1.0" },
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, text: await res.text() };
  } catch (err: any) {
    return { ok: false, error: err?.message || "fetch failed" };
  }
}

// Util: formatta data come YYYY-MM-DD
function fmtDate(d: Date | null | undefined): string {
  if (!d || isNaN(d.getTime())) return "—";
  return d.toISOString().split("T")[0];
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// ============================================================
// Diagnostica per una singola proprietà
// ============================================================

async function diagnoseProperty(prop: any): Promise<any> {
  const sourceToLink: Record<string, string> = {
    airbnb: prop.icalAirbnb || "",
    booking: prop.icalBooking || "",
    oktorate: prop.icalOktorate || "",
    inreception: prop.icalInreception || "",
    krossbooking: prop.icalKrossbooking || "",
  };
  const activeSources = Object.entries(sourceToLink)
    .filter(([, url]) => url.trim() !== "")
    .map(([src]) => src);

  const feedsResult: Record<string, any> = {};
  const allFeedEvents: Array<{ source: string; e: ICalEvent; isBlock: boolean }> = [];

  for (const source of activeSources) {
    const url = sourceToLink[source];
    const fetched = await fetchIcal(url);
    if (!fetched.ok || !fetched.text) {
      feedsResult[source] = { ok: false, error: fetched.error, url: url.substring(0, 80) + "..." };
      continue;
    }
    const events = parseICal(fetched.text);
    const reservations = events.filter((e) => !isBlock(e, source));
    const blocks = events.filter((e) => isBlock(e, source));
    for (const e of events) allFeedEvents.push({ source, e, isBlock: isBlock(e, source) });
    feedsResult[source] = {
      ok: true,
      totalEvents: events.length,
      reservations: reservations.length,
      blocks: blocks.length,
      reservationsList: reservations
        .map((e) => ({
          uid: e.uid,
          checkIn: fmtDate(e.dtstart),
          checkOut: fmtDate(e.dtend),
          summary: e.summary,
        }))
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    };
  }

  // Bookings dal DB per questa proprietà
  const bookingsSnap = await adminDb.collection("bookings").where("propertyId", "==", prop.id).get();
  const dbBookings = bookingsSnap.docs.map((d: any) => {
    const data = d.data() as Record<string, any>;
    return {
      id: d.id,
      source: data.source || "?",
      icalUid: data.icalUid || null,
      checkIn: data.checkIn?.toDate?.() || null,
      checkOut: data.checkOut?.toDate?.() || null,
      status: data.status || "?",
      isManual: data.isManual === true,
      historicBooking: data.historicBooking === true,
      guestName: data.guestName || "?",
    };
  });

  // ============================================================
  // Confronto DB ↔ feeds (solo prenotazioni reali, non blocchi)
  // ============================================================

  const feedReservations = allFeedEvents.filter((x) => !x.isBlock);
  const feedUidSet = new Set(feedReservations.map((x) => x.e.uid));

  // IN_DB_NOT_IN_FEED: prenotazioni nel DB con source attivo ma non più nel feed
  const inDbNotInFeed: any[] = [];
  // DATE_MISMATCH
  const dateMismatch: any[] = [];

  for (const b of dbBookings) {
    if (b.isManual) continue; // le manuali non si cancellano mai via cron
    if (b.historicBooking) continue;
    if (b.status === "CANCELLED") continue;
    if (!activeSources.includes(b.source)) continue; // source non attivo → non diagnosticabile
    if (!b.checkIn || !b.checkOut) continue;

    // Match per UID
    if (b.icalUid && feedUidSet.has(b.icalUid)) {
      // Trovato! Controllo le date
      const feedEv = feedReservations.find((x) => x.e.uid === b.icalUid);
      if (feedEv) {
        const feedCi = feedEv.e.dtstart;
        const feedCo = feedEv.e.dtend;
        if (!sameDay(b.checkIn, feedCi) || !sameDay(b.checkOut, feedCo)) {
          dateMismatch.push({
            dbId: b.id,
            guestName: b.guestName,
            source: b.source,
            icalUid: b.icalUid,
            db: { checkIn: fmtDate(b.checkIn), checkOut: fmtDate(b.checkOut) },
            feed: { checkIn: fmtDate(feedCi), checkOut: fmtDate(feedCo) },
          });
        }
      }
      continue;
    }

    // Match per date esatte (UID rigenerato o mancante) — stesso source
    const dateMatch = feedReservations.find(
      (x) => x.source === b.source && sameDay(x.e.dtstart, b.checkIn!) && sameDay(x.e.dtend, b.checkOut!),
    );
    if (dateMatch) continue;

    // Match cross-source per date
    const crossSourceMatch = feedReservations.find(
      (x) => sameDay(x.e.dtstart, b.checkIn!) && sameDay(x.e.dtend, b.checkOut!),
    );
    if (crossSourceMatch) continue;

    // Non trovato né per UID né per date → candidato residuo
    inDbNotInFeed.push({
      dbId: b.id,
      guestName: b.guestName,
      source: b.source,
      icalUid: b.icalUid,
      checkIn: fmtDate(b.checkIn),
      checkOut: fmtDate(b.checkOut),
      status: b.status,
    });
  }

  // IN_FEED_NOT_IN_DB: eventi reali nel feed ma non nel DB
  const inFeedNotInDb: any[] = [];
  const dbUidSet = new Set(dbBookings.map((b: any) => b.icalUid).filter(Boolean));
  for (const fe of feedReservations) {
    if (dbUidSet.has(fe.e.uid)) continue;
    // Match per date stesso source
    const dateMatch = dbBookings.find(
      (b: any) =>
        b.source === fe.source &&
        b.checkIn &&
        b.checkOut &&
        sameDay(b.checkIn, fe.e.dtstart) &&
        sameDay(b.checkOut, fe.e.dtend),
    );
    if (dateMatch) continue;
    // Match cross-source per date
    const anyDateMatch = dbBookings.find(
      (b: any) =>
        b.checkIn &&
        b.checkOut &&
        sameDay(b.checkIn, fe.e.dtstart) &&
        sameDay(b.checkOut, fe.e.dtend),
    );
    if (anyDateMatch) continue;

    inFeedNotInDb.push({
      source: fe.source,
      uid: fe.e.uid,
      checkIn: fmtDate(fe.e.dtstart),
      checkOut: fmtDate(fe.e.dtend),
      summary: fe.e.summary,
    });
  }

  return {
    property: {
      id: prop.id,
      name: prop.name,
      activeSources,
    },
    feeds: feedsResult,
    dbStats: {
      totalBookings: dbBookings.length,
      byStatus: dbBookings.reduce<Record<string, number>>((acc: Record<string, number>, b: any) => {
        acc[b.status] = (acc[b.status] || 0) + 1;
        return acc;
      }, {}),
      bySource: dbBookings.reduce<Record<string, number>>((acc: Record<string, number>, b: any) => {
        acc[b.source] = (acc[b.source] || 0) + 1;
        return acc;
      }, {}),
      manualCount: dbBookings.filter((b: any) => b.isManual).length,
      historicCount: dbBookings.filter((b: any) => b.historicBooking).length,
    },
    discrepancies: {
      inDbNotInFeed: {
        count: inDbNotInFeed.length,
        description: "Nel DB ma NON nel feed → residue da cancellare",
        items: inDbNotInFeed.sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
      },
      inFeedNotInDb: {
        count: inFeedNotInDb.length,
        description: "Nel feed ma NON nel DB → sync non le ha importate",
        items: inFeedNotInDb.sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
      },
      dateMismatch: {
        count: dateMismatch.length,
        description: "Presenti in entrambi ma con date diverse",
        items: dateMismatch,
      },
    },
  };
}

// ============================================================
// Rendering HTML (versione leggibile)
// ============================================================

function renderHtml(results: any[]): string {
  const style = `
    <style>
      body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f8fafc; padding:20px; color:#0f172a; }
      h1 { color:#0f172a; }
      h2 { margin-top: 28px; padding: 10px 14px; background: linear-gradient(90deg,#6366f1,#8b5cf6); color:white; border-radius:8px; }
      h3 { margin-top: 18px; color:#334155; border-bottom:2px solid #e2e8f0; padding-bottom:6px; }
      table { width:100%; border-collapse: collapse; background:white; margin:10px 0; border-radius:8px; overflow:hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
      th, td { padding: 8px 12px; text-align:left; border-bottom:1px solid #e2e8f0; font-size:13px; }
      th { background:#f1f5f9; font-weight:600; }
      .ok { color:#059669; font-weight:600; }
      .warn { color:#d97706; font-weight:600; }
      .err { color:#dc2626; font-weight:600; }
      .pill { display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; }
      .pill-red { background:#fee2e2; color:#991b1b; }
      .pill-green { background:#d1fae5; color:#065f46; }
      .pill-yellow { background:#fef3c7; color:#92400e; }
      .pill-blue { background:#dbeafe; color:#1e40af; }
      .empty { color:#64748b; font-style:italic; padding:10px; }
      code { background:#f1f5f9; padding:1px 6px; border-radius:4px; font-size:12px; }
      .section-ok { border-left:4px solid #059669; padding-left:12px; }
      .section-warn { border-left:4px solid #d97706; padding-left:12px; }
      .section-err { border-left:4px solid #dc2626; padding-left:12px; }
      details { margin: 6px 0; }
      summary { cursor: pointer; font-weight:600; padding: 4px 0; }
    </style>
  `;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>iCal Diagnosis</title>${style}</head><body>`;
  html += `<h1>🔍 Diagnostica sincronizzazione iCal</h1>`;
  html += `<p>Analizzate <b>${results.length}</b> proprietà — ${new Date().toLocaleString("it-IT")}</p>`;

  for (const r of results) {
    const disc = r.discrepancies;
    const totalDiscrep = disc.inDbNotInFeed.count + disc.inFeedNotInDb.count + disc.dateMismatch.count;
    const headerClass = totalDiscrep === 0 ? "pill-green" : totalDiscrep > 3 ? "pill-red" : "pill-yellow";

    html += `<h2>${r.property.name} <span class="pill ${headerClass}">${totalDiscrep} discrepanze</span></h2>`;

    // Feeds
    html += `<h3>Feed iCal</h3>`;
    if (r.property.activeSources.length === 0) {
      html += `<p class="empty">Nessun feed iCal configurato per questa proprietà</p>`;
    } else {
      html += `<table><tr><th>Source</th><th>Stato</th><th>Eventi totali</th><th>Prenotazioni</th><th>Blocchi</th></tr>`;
      for (const src of r.property.activeSources) {
        const f = r.feeds[src];
        if (f.ok) {
          html += `<tr><td><b>${src}</b></td><td class="ok">OK</td><td>${f.totalEvents}</td><td>${f.reservations}</td><td>${f.blocks}</td></tr>`;
        } else {
          html += `<tr><td><b>${src}</b></td><td class="err">ERRORE: ${f.error}</td><td colspan="3">—</td></tr>`;
        }
      }
      html += `</table>`;

      // Lista prenotazioni per ogni source
      for (const src of r.property.activeSources) {
        const f = r.feeds[src];
        if (!f.ok || !f.reservationsList.length) continue;
        html += `<details><summary>📋 Prenotazioni nel feed ${src} (${f.reservationsList.length})</summary>`;
        html += `<table><tr><th>Check-in</th><th>Check-out</th><th>Summary</th><th>UID</th></tr>`;
        for (const r2 of f.reservationsList) {
          html += `<tr><td>${r2.checkIn}</td><td>${r2.checkOut}</td><td>${r2.summary}</td><td><code>${r2.uid.substring(0, 40)}...</code></td></tr>`;
        }
        html += `</table></details>`;
      }
    }

    // DB Stats
    html += `<h3>DB Firestore</h3>`;
    html += `<p>Totale prenotazioni salvate: <b>${r.dbStats.totalBookings}</b> `;
    html += `(${r.dbStats.manualCount} manuali, ${r.dbStats.historicCount} storiche)</p>`;
    const statusStr = Object.entries(r.dbStats.byStatus).map(([k, v]) => `${k}: ${v}`).join(", ");
    const sourceStr = Object.entries(r.dbStats.bySource).map(([k, v]) => `${k}: ${v}`).join(", ");
    html += `<p><small>Per status: ${statusStr || "—"}</small></p>`;
    html += `<p><small>Per source: ${sourceStr || "—"}</small></p>`;

    // Discrepanze
    html += `<h3>🎯 Discrepanze</h3>`;

    // IN_DB_NOT_IN_FEED (residui)
    html += `<div class="${disc.inDbNotInFeed.count > 0 ? "section-err" : "section-ok"}">`;
    html += `<p><b>⚠️ Nel DB ma NON nel feed: ${disc.inDbNotInFeed.count}</b><br>`;
    html += `<small>Candidate a cancellazione — prenotazioni residue dopo cancellazione sulla piattaforma</small></p>`;
    if (disc.inDbNotInFeed.count > 0) {
      html += `<table><tr><th>Check-in</th><th>Check-out</th><th>Ospite</th><th>Source</th><th>Status</th><th>DB ID</th><th>iCal UID</th></tr>`;
      for (const it of disc.inDbNotInFeed.items) {
        html += `<tr><td>${it.checkIn}</td><td>${it.checkOut}</td><td>${it.guestName}</td><td>${it.source}</td><td>${it.status}</td><td><code>${it.dbId}</code></td><td>${it.icalUid ? `<code>${it.icalUid.substring(0, 30)}...</code>` : "—"}</td></tr>`;
      }
      html += `</table>`;
    }
    html += `</div>`;

    // IN_FEED_NOT_IN_DB (mancanti)
    html += `<div class="${disc.inFeedNotInDb.count > 0 ? "section-err" : "section-ok"}">`;
    html += `<p><b>❌ Nel feed ma NON nel DB: ${disc.inFeedNotInDb.count}</b><br>`;
    html += `<small>sync-ical non le ha importate — possibile bug di parser o filtri</small></p>`;
    if (disc.inFeedNotInDb.count > 0) {
      html += `<table><tr><th>Check-in</th><th>Check-out</th><th>Source</th><th>Summary</th><th>UID</th></tr>`;
      for (const it of disc.inFeedNotInDb.items) {
        html += `<tr><td>${it.checkIn}</td><td>${it.checkOut}</td><td>${it.source}</td><td>${it.summary}</td><td><code>${it.uid.substring(0, 40)}...</code></td></tr>`;
      }
      html += `</table>`;
    }
    html += `</div>`;

    // DATE_MISMATCH
    html += `<div class="${disc.dateMismatch.count > 0 ? "section-warn" : "section-ok"}">`;
    html += `<p><b>📅 Date diverse tra DB e feed: ${disc.dateMismatch.count}</b><br>`;
    html += `<small>Ospite ha modificato il soggiorno ma il cron non ha aggiornato il DB</small></p>`;
    if (disc.dateMismatch.count > 0) {
      html += `<table><tr><th>DB checkIn</th><th>DB checkOut</th><th>Feed checkIn</th><th>Feed checkOut</th><th>Ospite</th><th>DB ID</th></tr>`;
      for (const it of disc.dateMismatch.items) {
        html += `<tr><td>${it.db.checkIn}</td><td>${it.db.checkOut}</td><td>${it.feed.checkIn}</td><td>${it.feed.checkOut}</td><td>${it.guestName}</td><td><code>${it.dbId}</code></td></tr>`;
      }
      html += `</table>`;
    }
    html += `</div>`;
  }

  html += `</body></html>`;
  return html;
}

// ============================================================
// Handler GET
// ============================================================

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const propertyId = req.nextUrl.searchParams.get("propertyId") || "";
  const propertyName = req.nextUrl.searchParams.get("propertyName") || "";
  const all = req.nextUrl.searchParams.get("all") === "true";
  const format = req.nextUrl.searchParams.get("format") || "json";

  if (!propertyId && !propertyName && !all) {
    return NextResponse.json(
      {
        error: "Fornire uno tra: propertyId, propertyName (match parziale case-insensitive), oppure all=true",
        examples: [
          "/api/debug/ical-diagnosis?secret=XXX&propertyName=Domus Enea",
          "/api/debug/ical-diagnosis?secret=XXX&propertyId=abc123",
          "/api/debug/ical-diagnosis?secret=XXX&all=true&format=html",
        ],
      },
      { status: 400 },
    );
  }

  // Carica proprietà da analizzare
  const propsSnap = await adminDb.collection("properties").where("status", "==", "ACTIVE").get();
  let properties = propsSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Record<string, any>) }));

  if (propertyId) {
    properties = properties.filter((p: any) => p.id === propertyId);
  } else if (propertyName) {
    const needle = propertyName.toLowerCase();
    properties = properties.filter((p: any) => (p.name || "").toLowerCase().includes(needle));
  }

  if (properties.length === 0) {
    return NextResponse.json({ error: "Nessuna proprietà trovata con i criteri forniti" }, { status: 404 });
  }

  // Esegui diagnosi per ogni proprietà (serial, per evitare troppe fetch parallele)
  const results: any[] = [];
  for (const p of properties) {
    try {
      const r = await diagnoseProperty(p);
      results.push(r);
    } catch (err: any) {
      results.push({
        property: { id: (p as any).id, name: (p as any).name || "?" },
        error: err?.message || "Errore sconosciuto durante la diagnosi",
      });
    }
  }

  if (format === "html") {
    return new NextResponse(renderHtml(results), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    propertiesAnalyzed: results.length,
    results,
  });
}
