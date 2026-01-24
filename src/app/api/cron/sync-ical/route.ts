/**
 * 🕐 CRON JOB - Sync automatico iCal
 * 
 * Endpoint chiamato ogni 30 minuti da:
 * - Railway Cron
 * - cron-job.org
 * - GitHub Actions
 * 
 * Protezione con API Key per evitare abusi
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Chiave segreta per proteggere l'endpoint
const CRON_SECRET = process.env.CRON_SECRET || 'cleaningapp-cron-2024';

// ==================== CONFIGURAZIONE ====================

const CONFIG = {
  FETCH_TIMEOUT_MS: 30000,
  MAX_RETRIES: 2,
  DAYS_PAST_TO_KEEP: 30,
  BATCH_SIZE: 3,
  BATCH_DELAY_MS: 500,
  PROTECTED_STATUSES: ['COMPLETED', 'IN_PROGRESS'],
};

// ==================== UTILITIES ====================

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) & 0xffffffff;
  return Math.abs(h).toString(16);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getUTCFullYear() === d2.getUTCFullYear() &&
         d1.getUTCMonth() === d2.getUTCMonth() &&
         d1.getUTCDate() === d2.getUTCDate();
}

function parseICalDate(s: string): Date {
  const y = parseInt(s.substring(0, 4));
  const m = parseInt(s.substring(4, 6)) - 1;
  const d = parseInt(s.substring(6, 8));
  if (s.includes("T")) {
    const h = parseInt(s.substring(9, 11)) || 0;
    const mi = parseInt(s.substring(11, 13)) || 0;
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
      const k = line.substring(0, ci).split(";")[0];
      const v = line.substring(ci + 1).trim();
      if (k === "UID") e.uid = v;
      if (k === "SUMMARY") e.summary = v.replace(/\\[,;nN]/g, " ").trim();
      if (k === "DTSTART") e.dtstart = parseICalDate(v);
      if (k === "DTEND") e.dtend = parseICalDate(v);
      if (k === "DESCRIPTION") e.description = v;
    }
    if (e.uid && e.dtstart && e.dtend) events.push(e as ICalEvent);
  }
  return events;
}

function isBlock(e: ICalEvent, s: string): boolean {
  const sum = e.summary?.toLowerCase() || '';
  if (['not available', 'blocked', 'closed', 'chiuso', 'non disponibile'].some(p => sum.includes(p))) return true;
  if (s === 'airbnb' && sum === 'reserved' && !e.description?.includes('/hosting/reservations/')) return true;
  return false;
}

function getGuestName(e: ICalEvent, s: string): string {
  const sum = e.summary?.toLowerCase() || '';
  if (['reserved', 'prenotazione'].includes(sum)) {
    return { airbnb: 'Ospite Airbnb', booking: 'Ospite Booking' }[s] || 'Prenotazione';
  }
  return e.summary || 'Ospite';
}

async function fetchIcal(url: string): Promise<string | null> {
  for (let i = 0; i < CONFIG.MAX_RETRIES; i++) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), CONFIG.FETCH_TIMEOUT_MS);
      const res = await fetch(url, { headers: { 'User-Agent': 'CleaningApp-Cron/2.0' }, signal: ctrl.signal });
      if (res.ok) return await res.text();
    } catch {}
    await sleep(2000);
  }
  return null;
}

// ==================== MAIN ====================

export async function GET(req: NextRequest) {
  // Verifica autorizzazione
  const authHeader = req.headers.get('authorization');
  const urlSecret = req.nextUrl.searchParams.get('secret');
  
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  return runSync();
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const body = await req.json().catch(() => ({}));
  
  if (authHeader !== `Bearer ${CRON_SECRET}` && body.secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  return runSync();
}

async function runSync(): Promise<NextResponse> {
  const start = Date.now();
  const stats = { synced: 0, skipped: 0, errors: 0, newBookings: 0, updated: 0, deleted: 0, cleanings: 0 };
  
  console.log('\n🕐 CRON SYNC iCAL - ' + new Date().toISOString());
  
  try {
    const propsSnap = await getDocs(query(collection(db, 'properties'), where('status', '==', 'ACTIVE')));
    const properties = propsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p: any) =>
      p.icalAirbnb || p.icalBooking || p.icalOktorate || p.icalKrossbooking
    );
    
    const pastLimit = new Date();
    pastLimit.setDate(pastLimit.getDate() - CONFIG.DAYS_PAST_TO_KEEP);
    
    for (let i = 0; i < properties.length; i += CONFIG.BATCH_SIZE) {
      await Promise.all(properties.slice(i, i + CONFIG.BATCH_SIZE).map(async (prop: any) => {
        try {
          const links: { url: string; source: string }[] = [];
          if (prop.icalAirbnb) links.push({ url: prop.icalAirbnb, source: 'airbnb' });
          if (prop.icalBooking) links.push({ url: prop.icalBooking, source: 'booking' });
          if (prop.icalOktorate) links.push({ url: prop.icalOktorate, source: 'oktorate' });
          if (prop.icalKrossbooking) links.push({ url: prop.icalKrossbooking, source: 'krossbooking' });
          
          if (!links.length) { stats.skipped++; return; }
          
          const [bookingsSnap, cleaningsSnap] = await Promise.all([
            getDocs(query(collection(db, 'bookings'), where('propertyId', '==', prop.id))),
            getDocs(query(collection(db, 'cleanings'), where('propertyId', '==', prop.id))),
          ]);
          
          const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const hashes = prop.feedHashes || {};
          const processed = new Set<string>();
          
          for (const { url, source } of links) {
            const data = await fetchIcal(url);
            if (!data) continue;
            
            const hash = simpleHash(data);
            if (hash === hashes[source]) {
              bookings.filter(b => b.source === source).forEach(b => processed.add(b.id));
              continue;
            }
            hashes[source] = hash;
            
            for (const e of parseICalData(data)) {
              if (isBlock(e, source) || e.dtend < pastLimit) continue;
              
              const existing = bookings.find(b => b.icalUid === e.uid && b.source === source) ||
                bookings.find(b => !b.icalUid && b.source === source && 
                  Math.abs((b.checkIn?.toDate?.()?.getTime() || 0) - e.dtstart.getTime()) < 86400000 * 2);
              
              if (existing) {
                processed.add(existing.id);
                const ci = existing.checkIn?.toDate?.();
                const co = existing.checkOut?.toDate?.();
                if (!ci || !co || !isSameDay(ci, e.dtstart) || !isSameDay(co, e.dtend) || !existing.icalUid) {
                  await updateDoc(doc(db, 'bookings', existing.id), {
                    checkIn: Timestamp.fromDate(e.dtstart),
                    checkOut: Timestamp.fromDate(e.dtend),
                    icalUid: e.uid,
                    guestName: getGuestName(e, source),
                    updatedAt: Timestamp.now(),
                  });
                  stats.updated++;
                }
              } else {
                const ref = await addDoc(collection(db, 'bookings'), {
                  propertyId: prop.id, propertyName: prop.name,
                  guestName: getGuestName(e, source),
                  checkIn: Timestamp.fromDate(e.dtstart),
                  checkOut: Timestamp.fromDate(e.dtend),
                  source, icalUid: e.uid,
                  status: 'CONFIRMED', guests: prop.maxGuests || 2,
                  createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                });
                stats.newBookings++;
                processed.add(ref.id);
                
                // Crea pulizia
                if (!cleanings.some(c => isSameDay(c.scheduledDate?.toDate?.() || new Date(0), e.dtend))) {
                  await addDoc(collection(db, 'cleanings'), {
                    propertyId: prop.id, propertyName: prop.name,
                    scheduledDate: Timestamp.fromDate(e.dtend),
                    scheduledTime: prop.checkOutTime || '10:00',
                    status: 'SCHEDULED', bookingSource: source, bookingId: ref.id,
                    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                  });
                  stats.cleanings++;
                }
              }
            }
          }
          
          // Elimina obsolete
          for (const b of bookings) {
            if (processed.has(b.id) || !b.source) continue;
            const co = b.checkOut?.toDate?.();
            if (!co || co < pastLimit) continue;
            await deleteDoc(doc(db, 'bookings', b.id));
            stats.deleted++;
          }
          
          await updateDoc(doc(db, 'properties', prop.id), {
            lastIcalSync: Timestamp.now(), feedHashes: hashes, updatedAt: Timestamp.now(),
          });
          
          stats.synced++;
        } catch (e) {
          stats.errors++;
        }
      }));
      
      await sleep(CONFIG.BATCH_DELAY_MS);
    }
    
    const duration = Date.now() - start;
    
    // Log
    await addDoc(collection(db, 'syncLogs'), {
      type: 'CRON', timestamp: Timestamp.now(), duration, stats, success: true,
    });
    
    console.log(`✅ CRON completato: ${stats.synced} prop, +${stats.newBookings} -${stats.deleted}, ${(duration/1000).toFixed(1)}s`);
    
    return NextResponse.json({ success: true, stats, duration });
    
  } catch (error: any) {
    console.error('❌ CRON errore:', error);
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}
