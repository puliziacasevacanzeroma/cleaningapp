/**
 * GET /api/admin/diagnose-ical?propertyName=xxx
 * 
 * Diagnostica COMPLETA del sync iCal:
 * - Mostra eventi bloccati con dettagli
 * - Simula STEP 3 (cancellazione booking orfani)
 * - Mostra hash confronto
 * - Identifica booking che verrebbero cancellati dal cron
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
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

function fmt(d: Date): string { return d.toISOString().split('T')[0]; }

function simpleHash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16) + '_' + str.length.toString(16);
}

function normalizeIcalForHash(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "")
    .split("\n").filter(line => {
      const key = line.split(":")[0]?.split(";")[0]?.toUpperCase();
      return !['DTSTAMP', 'LAST-MODIFIED', 'CREATED', 'SEQUENCE', 'X-LIC-ERROR'].includes(key || '');
    }).join("\n");
}

async function fetchIcal(url: string): Promise<{ data: string | null; error?: string; timeMs: number }> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, { headers: { 'User-Agent': 'CleaningApp-Diagnose/2.0' }, signal: ctrl.signal });
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

    const propsSnap = await adminDb.collection("properties").where("status", "in", ["ACTIVE", "PENDING_SIGNATURE"]).get();
    let properties = propsSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Record<string, any>) }));

    if (propertyId) properties = properties.filter((p: any) => p.id === propertyId);
    if (propertyName) properties = properties.filter((p: any) => (p.name || "").toLowerCase().includes(propertyName));

    const ALL_SOURCES = ['airbnb', 'booking', 'oktorate', 'inreception', 'krossbooking'];
    const pastLimit = new Date();
    pastLimit.setDate(pastLimit.getDate() - 30);
    const tomorrowStart = new Date();
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
    tomorrowStart.setUTCHours(0, 0, 0, 0);

    const results: any[] = [];

    for (const prop of properties) {
      const propResult: any = {
        id: prop.id, name: prop.name, status: prop.status,
        sources: {}, bookingsInDb: 0, cleaningsInDb: 0, issues: [],
        simulatedStep3: { wouldDelete: [] as any[], protectedByHistory: 0, protectedByDate: 0, protectedByCheckIn: 0 },
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

      const [bookingsSnap, cleaningsSnap] = await Promise.all([
        adminDb.collection('bookings').where('propertyId', '==', prop.id).get(),
        adminDb.collection('cleanings').where('propertyId', '==', prop.id).get(),
      ]);

      const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      propResult.bookingsInDb = bookings.length;
      propResult.cleaningsInDb = cleanings.length;

      // Simula processed set come fa il cron
      const processed = new Set<string>();

      for (const source of activeSources) {
        const url = sourceToLink[source];
        const sourceResult: any = {
          url: url.substring(0, 80) + (url.length > 80 ? '...' : ''),
          fetchStatus: 'OK', totalEvents: 0, blockedEvents: 0,
          pastEvents: 0, validEvents: 0, matchedToDb: 0,
          newBookings: 0, missingFromDb: [],
          blockedDetails: [] as any[], icalEvents: [],
        };

        const { data, error, timeMs } = await fetchIcal(url);
        sourceResult.fetchTimeMs = timeMs;

        if (!data) {
          sourceResult.fetchStatus = `ERRORE: ${error}`;
          propResult.issues.push(`❌ ${source}: Feed non raggiungibile — ${error}`);
          // Come fa il cron: proteggi tutti i booking di questo source
          bookings.filter((b: any) => b.source === source).forEach((b: any) => processed.add(b.id));
          propResult.sources[source] = sourceResult;
          continue;
        }

        // Hash check
        const normalizedData = normalizeIcalForHash(data);
        const currentHash = simpleHash(normalizedData);
        const storedHash = (prop.feedHashes || {})[source];
        sourceResult.currentHash = currentHash;
        sourceResult.storedHash = storedHash || null;
        sourceResult.hashMatch = currentHash === storedHash;
        if (sourceResult.hashMatch) {
          sourceResult.hashNote = "⚠️ Hash UGUALE — cron SALTA questo feed (non modificato). Booking di questo source vengono aggiunti a processed.";
          bookings.filter((b: any) => b.source === source).forEach((b: any) => processed.add(b.id));
        }

        const events = parseICalData(data);
        sourceResult.totalEvents = events.length;

        for (const e of events) {
          const blocked = isBlock(e, source);
          const past = e.dtend < pastLimit;

          if (blocked) {
            sourceResult.blockedEvents++;
            sourceResult.blockedDetails.push({
              summary: e.summary?.substring(0, 60),
              checkIn: fmt(e.dtstart), checkOut: fmt(e.dtend),
              matchedPattern: ['not available', 'unavailable', 'blocked', 'closed', 'chiuso',
                'non disponibile', 'bloccata', 'bloccato', 'owner block', 'maintenance',
                'pulizie', 'manutenzione', 'owner', 'proprietario', 'stop sell', 'no vacancy']
                .find(p => (e.summary?.toLowerCase() || '').includes(p)) || 'airbnb-reserved-no-link',
            });
            continue;
          }
          if (past) { sourceResult.pastEvents++; continue; }

          sourceResult.validEvents++;
          sourceResult.icalEvents.push({
            uid: e.uid.substring(0, 50), summary: e.summary?.substring(0, 50),
            checkIn: fmt(e.dtstart), checkOut: fmt(e.dtend),
          });

          // Simula findExistingBooking
          const matchByUid = bookings.find((b: any) => b.icalUid === e.uid && b.source === source);
          const matchByDates = bookings.find((b: any) => {
            if (b.source !== source) return false;
            const ci = b.checkIn?.toDate?.(), co = b.checkOut?.toDate?.();
            return ci && co && isSameDay(ci, e.dtstart) && isSameDay(co, e.dtend);
          });
          const matchCross = bookings.find((b: any) => {
            const ci = b.checkIn?.toDate?.(), co = b.checkOut?.toDate?.();
            return ci && co && isSameDay(ci, e.dtstart) && isSameDay(co, e.dtend);
          });

          const match = matchByUid || matchByDates || matchCross;
          if (match) {
            processed.add(match.id);
            sourceResult.matchedToDb++;
          } else {
            sourceResult.newBookings++;
            sourceResult.missingFromDb.push({
              uid: e.uid.substring(0, 50), summary: e.summary?.substring(0, 50),
              checkIn: fmt(e.dtstart), checkOut: fmt(e.dtend),
            });
          }
        }

        if (sourceResult.missingFromDb.length > 0) {
          propResult.issues.push(`🆕 ${source}: ${sourceResult.missingFromDb.length} prenotazioni iCal da inserire`);
        }

        propResult.sources[source] = sourceResult;
      }

      // ===== SIMULA STEP 3: quali booking verrebbero CANCELLATI =====
      for (const b of bookings as any[]) {
        if (processed.has(b.id)) continue;
        if (!b.source || !activeSources.includes(b.source)) continue;
        if (b.isManual === true || b.source === 'manual' || b.source === 'direct' || b.source === 'phone') continue;
        if (b.status === 'CANCELLED') continue;
        
        const co = b.checkOut?.toDate?.();
        const ci = b.checkIn?.toDate?.();
        
        if (b.historicBooking === true) {
          propResult.simulatedStep3.protectedByHistory++;
          continue;
        }
        if (!co) continue;
        if (co < tomorrowStart) {
          propResult.simulatedStep3.protectedByDate++;
          continue;
        }
        if (ci && ci < tomorrowStart) {
          propResult.simulatedStep3.protectedByCheckIn++;
          continue;
        }

        // Questo booking verrebbe CANCELLATO!
        propResult.simulatedStep3.wouldDelete.push({
          id: b.id, source: b.source,
          guestName: b.guestName?.substring(0, 40),
          checkIn: ci ? fmt(ci) : null,
          checkOut: co ? fmt(co) : null,
          icalUid: b.icalUid?.substring(0, 50),
          reason: `Non trovato nel feed ${b.source} → STEP 3 lo cancellerebbe`,
        });
      }

      if (propResult.simulatedStep3.wouldDelete.length > 0) {
        propResult.issues.push(`🚨 STEP 3 cancellerebbe ${propResult.simulatedStep3.wouldDelete.length} booking!`);
      }

      // lastIcalSync check
      if (prop.lastIcalSync) {
        const last = prop.lastIcalSync.toDate?.();
        if (last) {
          propResult.lastSync = last.toISOString();
          const mins = (Date.now() - last.getTime()) / 60000;
          if (mins > 60) propResult.issues.push(`⚠️ Ultima sync ${Math.round(mins)} min fa`);
          if (mins < 4) propResult.issues.push(`⏳ Sync recente (${Math.round(mins)} min) — cron skipperebbe`);
        }
      } else {
        propResult.issues.push("⚠️ Mai sincronizzata");
      }

      results.push(propResult);
    }

    const summary = {
      totalProperties: results.length,
      propertiesWithIssues: results.filter(r => r.issues.length > 0).length,
      totalWouldDelete: results.reduce((a, r) => a + r.simulatedStep3.wouldDelete.length, 0),
      totalMissingBookings: results.reduce((acc, r) =>
        acc + Object.values(r.sources).reduce((a: number, s: any) => a + (s.missingFromDb?.length || 0), 0), 0),
    };

    return NextResponse.json({ summary, properties: results }, { status: 200 });
  } catch (error: any) {
    console.error("Errore diagnose-ical:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
