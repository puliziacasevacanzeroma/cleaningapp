/**
 * GET /api/admin/diagnose-ical
 * 
 * Script diagnostico che analizza TUTTE le proprietà:
 * - Legge ogni feed iCal
 * - Confronta con prenotazioni in Firestore
 * - Mostra: eventi iCal non presenti come booking, booking senza match iCal,
 *   eventi bloccati/filtrati, feed non raggiungibili, hash invariato, etc.
 * 
 * Query params:
 *   ?propertyId=xxx  — analizza solo una proprietà specifica
 *   ?propertyName=xxx — filtra per nome (parziale)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FETCH_TIMEOUT = 8000;

function parseICalDate(s: string): Date {
  const y = parseInt(s.substring(0, 4)), m = parseInt(s.substring(4, 6)) - 1, d = parseInt(s.substring(6, 8));
  if (s.includes("T")) {
    const h = parseInt(s.substring(9, 11)) || 0, mi = parseInt(s.substring(11, 13)) || 0;
    if (s.endsWith('Z')) return new Date(Date.UTC(y, m, d, h, mi));
    return new Date(y, m, d, h, mi);
  }
  return new Date(Date.UTC(y, m, d, 12, 0, 0));
}

interface ICalEvent { uid: string; summary: string; dtstart: Date; dtend: Date; description?: string; }

function parseICalData(text: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
  for (const block of normalized.split("BEGIN:VEVENT").slice(1)) {
    const e: Partial<ICalEvent> = {};
    for (const line of block.split("END:VEVENT")[0]?.split("\n") || []) {
      const ci = line.indexOf(":");
      if (ci === -1) continue;
      const k = line.substring(0, ci).split(";")[0], v = line.substring(ci + 1).trim();
      if (k === "UID") e.uid = v;
      if (k === "SUMMARY") e.summary = v.replace(/\\[,;nN]/g, " ").trim();
      if (k === "DTSTART") e.dtstart = parseICalDate(v);
      if (k === "DTEND") e.dtend = parseICalDate(v);
      if (k === "DESCRIPTION") e.description = v;
    }
    if (e.uid && e.dtstart && e.dtend) {
      const durMs = e.dtend.getTime() - e.dtstart.getTime();
      if (durMs > 0) events.push(e as ICalEvent);
    }
  }
  return events;
}

function isBlock(e: ICalEvent, s: string): boolean {
  const sum = e.summary?.toLowerCase() || '';
  const BLOCK_PATTERNS = ['not available', 'unavailable', 'blocked', 'closed', 'chiuso',
    'non disponibile', 'bloccata', 'bloccato', 'owner block', 'maintenance',
    'pulizie', 'manutenzione', 'owner', 'proprietario', 'stop sell', 'no vacancy'];
  if (BLOCK_PATTERNS.some(p => sum.includes(p))) return true;
  if (s === 'booking') return false;
  if (s === 'airbnb' && sum === 'reserved' && !e.description?.includes('/hosting/reservations/')) return true;
  return false;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toISOString().split('T')[0] === b.toISOString().split('T')[0];
}

function fmt(d: Date): string { return d.toISOString().split('T')[0]; }

async function fetchIcal(url: string): Promise<{ data: string | null; error?: string; timeMs: number }> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, { headers: { 'User-Agent': 'CleaningApp-Diagnose/1.0' }, signal: ctrl.signal });
    const timeMs = Date.now() - start;
    if (!res.ok) return { data: null, error: `HTTP ${res.status} ${res.statusText}`, timeMs };
    return { data: await res.text(), timeMs };
  } catch (err: any) {
    return { data: null, error: err.name === 'AbortError' ? 'TIMEOUT' : err.message, timeMs: Date.now() - start };
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const propertyId = req.nextUrl.searchParams.get("propertyId");
    const propertyName = req.nextUrl.searchParams.get("propertyName")?.toLowerCase();

    // Carica proprietà
    let propsQuery: any = adminDb.collection("properties").where("status", "in", ["ACTIVE", "PENDING_SIGNATURE"]);
    const propsSnap = await propsQuery.get();
    let properties = propsSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Record<string, any>) }));

    if (propertyId) {
      properties = properties.filter((p: any) => p.id === propertyId);
    }
    if (propertyName) {
      properties = properties.filter((p: any) => (p.name || "").toLowerCase().includes(propertyName));
    }

    const ALL_SOURCES = ['airbnb', 'booking', 'oktorate', 'inreception', 'krossbooking'];
    const pastLimit = new Date();
    pastLimit.setDate(pastLimit.getDate() - 30);

    const results: any[] = [];

    for (const prop of properties) {
      const propResult: any = {
        id: prop.id,
        name: prop.name,
        status: prop.status,
        sources: {},
        bookingsInDb: 0,
        cleaningsInDb: 0,
        issues: [],
      };

      const sourceToLink: Record<string, string> = {
        airbnb: prop.icalAirbnb || '', booking: prop.icalBooking || '',
        oktorate: prop.icalOktorate || '', inreception: prop.icalInreception || '',
        krossbooking: prop.icalKrossbooking || '',
      };
      const activeSources = ALL_SOURCES.filter(s => sourceToLink[s].trim() !== '');

      if (activeSources.length === 0) {
        propResult.issues.push("⚠️ Nessun link iCal configurato");
        results.push(propResult);
        continue;
      }

      // Carica bookings e cleanings da DB
      const [bookingsSnap, cleaningsSnap] = await Promise.all([
        adminDb.collection('bookings').where('propertyId', '==', prop.id).get(),
        adminDb.collection('cleanings').where('propertyId', '==', prop.id).get(),
      ]);

      const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

      propResult.bookingsInDb = bookings.length;
      propResult.cleaningsInDb = cleanings.length;

      // Bookings futuri per confronto
      const futureBookings = bookings.filter((b: any) => {
        const co = b.checkOut?.toDate?.();
        return co && co >= pastLimit;
      });

      for (const source of activeSources) {
        const url = sourceToLink[source];
        const sourceResult: any = {
          url: url.substring(0, 80) + (url.length > 80 ? '...' : ''),
          fetchStatus: 'OK',
          totalEvents: 0,
          blockedEvents: 0,
          pastEvents: 0,
          validEvents: 0,
          matchedToDb: 0,
          missingFromDb: [],
          icalEvents: [],
        };

        const { data, error, timeMs } = await fetchIcal(url);
        sourceResult.fetchTimeMs = timeMs;

        if (!data) {
          sourceResult.fetchStatus = `ERRORE: ${error}`;
          propResult.issues.push(`❌ ${source}: Feed non raggiungibile — ${error}`);
          propResult.sources[source] = sourceResult;
          continue;
        }

        const events = parseICalData(data);
        sourceResult.totalEvents = events.length;

        for (const e of events) {
          const blocked = isBlock(e, source);
          const past = e.dtend < pastLimit;

          if (blocked) {
            sourceResult.blockedEvents++;
            continue;
          }
          if (past) {
            sourceResult.pastEvents++;
            continue;
          }

          sourceResult.validEvents++;
          sourceResult.icalEvents.push({
            uid: e.uid.substring(0, 40),
            summary: e.summary?.substring(0, 50),
            checkIn: fmt(e.dtstart),
            checkOut: fmt(e.dtend),
          });

          // Cerca match nel DB
          const matchByUid = futureBookings.find((b: any) => b.icalUid === e.uid && b.source === source);
          const matchByDates = futureBookings.find((b: any) => {
            if (b.source !== source) return false;
            const ci = b.checkIn?.toDate?.(), co = b.checkOut?.toDate?.();
            return ci && co && isSameDay(ci, e.dtstart) && isSameDay(co, e.dtend);
          });
          // Cross-source match
          const matchCross = futureBookings.find((b: any) => {
            const ci = b.checkIn?.toDate?.(), co = b.checkOut?.toDate?.();
            return ci && co && isSameDay(ci, e.dtstart) && isSameDay(co, e.dtend);
          });

          if (matchByUid || matchByDates) {
            sourceResult.matchedToDb++;
          } else if (matchCross) {
            sourceResult.matchedToDb++;
            // Nota: potrebbe essere un duplicato cross-source
          } else {
            sourceResult.missingFromDb.push({
              uid: e.uid.substring(0, 40),
              summary: e.summary?.substring(0, 50),
              checkIn: fmt(e.dtstart),
              checkOut: fmt(e.dtend),
              reason: "❌ NON TROVATA nel DB",
            });
          }
        }

        if (sourceResult.missingFromDb.length > 0) {
          propResult.issues.push(`❌ ${source}: ${sourceResult.missingFromDb.length} prenotazioni iCal NON presenti nel DB`);
        }

        // Controlla hash (potrebbe essere il motivo per cui non sincronizza)
        const hashes = prop.feedHashes || {};
        if (hashes[source]) {
          sourceResult.hasStoredHash = true;
          // Calcoliamo il hash come fa sync-ical
          const normalizedForHash = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
            .split("\n").filter((l: string) => !l.startsWith("DTSTAMP")).join("\n");
          let h = 0x811c9dc5;
          for (let i = 0; i < normalizedForHash.length; i++) {
            h ^= normalizedForHash.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
          }
          const currentHash = (h >>> 0).toString(36);
          sourceResult.hashMatch = currentHash === hashes[source];
          if (sourceResult.hashMatch) {
            sourceResult.hashNote = "Hash uguale — sync-ical SALTA questo feed (non modificato)";
          }
        }

        propResult.sources[source] = sourceResult;
      }

      // Controlla bookings nel DB senza match iCal
      const icalBookings = futureBookings.filter((b: any) => 
        b.source && !['manual', 'direct', 'phone'].includes(b.source) && !b.isManual
      );
      const orphanBookings = icalBookings.filter((b: any) => {
        // Verifica se questo booking ha un match in qualsiasi feed iCal
        return !Object.values(propResult.sources).some((s: any) => 
          s.icalEvents?.some((e: any) => 
            e.uid === b.icalUid || 
            (e.checkIn === fmt(b.checkIn?.toDate?.()) && e.checkOut === fmt(b.checkOut?.toDate?.()))
          )
        );
      });

      if (orphanBookings.length > 0) {
        propResult.orphanBookingsInDb = orphanBookings.map((b: any) => ({
          id: b.id,
          source: b.source,
          guestName: b.guestName,
          checkIn: b.checkIn?.toDate ? fmt(b.checkIn.toDate()) : null,
          checkOut: b.checkOut?.toDate ? fmt(b.checkOut.toDate()) : null,
          icalUid: b.icalUid?.substring(0, 40),
        }));
        propResult.issues.push(`⚠️ ${orphanBookings.length} booking nel DB senza corrispondenza nel feed iCal`);
      }

      // Controlla lastIcalSync
      if (prop.lastIcalSync) {
        const last = prop.lastIcalSync.toDate?.();
        if (last) {
          propResult.lastSync = last.toISOString();
          const mins = (Date.now() - last.getTime()) / 60000;
          if (mins > 60) {
            propResult.issues.push(`⚠️ Ultima sync ${Math.round(mins)} minuti fa (possibile cron fallito)`);
          }
        }
      } else {
        propResult.issues.push("⚠️ lastIcalSync mancante — proprietà mai sincronizzata");
      }

      results.push(propResult);
    }

    // Summary
    const summary = {
      totalProperties: results.length,
      propertiesWithIssues: results.filter(r => r.issues.length > 0).length,
      totalMissingBookings: results.reduce((acc, r) => 
        acc + Object.values(r.sources).reduce((a: number, s: any) => a + (s.missingFromDb?.length || 0), 0), 0
      ),
    };

    return NextResponse.json({ summary, properties: results }, { status: 200 });
  } catch (error: any) {
    console.error("Errore diagnose-ical:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
