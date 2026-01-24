import { NextResponse } from "next/server";
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, getDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minuti per sync globale

// ==================== CONFIGURAZIONE ====================

const CONFIG = {
  FETCH_TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,
  DAYS_PAST_TO_KEEP: 30,
  BATCH_SIZE: 5, // Proprietà in parallelo
  BATCH_DELAY_MS: 1000, // Pausa tra batch
  PROTECTED_CLEANING_STATUSES: ['COMPLETED', 'IN_PROGRESS'],
  DATE_MATCH_TOLERANCE_DAYS: 1,
};

// ==================== INTERFACCE ====================

interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  description?: string;
}

// ==================== UTILITIES ====================

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getUTCFullYear() === d2.getUTCFullYear() &&
         d1.getUTCMonth() === d2.getUTCMonth() &&
         d1.getUTCDate() === d2.getUTCDate();
}

function daysDifference(d1: Date, d2: Date): number {
  return Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateShort(d: Date): string {
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

// ==================== PARSER ICAL ====================

function parseICalDate(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  
  if (dateStr.length > 8 && dateStr.includes("T")) {
    const hour = parseInt(dateStr.substring(9, 11)) || 0;
    const minute = parseInt(dateStr.substring(11, 13)) || 0;
    const second = parseInt(dateStr.substring(13, 15)) || 0;
    if (dateStr.endsWith('Z')) return new Date(Date.UTC(year, month, day, hour, minute, second));
    return new Date(year, month, day, hour, minute, second);
  }
  
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

function parseICalData(icalText: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const normalized = icalText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
  const eventBlocks = normalized.split("BEGIN:VEVENT");
  
  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split("END:VEVENT")[0];
    if (!block) continue;
    
    const event: Partial<ICalEvent> = {};
    for (const line of block.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      
      let key = line.substring(0, colonIdx);
      const value = line.substring(colonIdx + 1).trim();
      if (key.includes(";")) key = key.split(";")[0];
      
      switch (key) {
        case "UID": event.uid = value; break;
        case "SUMMARY": event.summary = value.replace(/\\[,;nN]/g, " ").trim(); break;
        case "DTSTART": event.dtstart = parseICalDate(value); break;
        case "DTEND": event.dtend = parseICalDate(value); break;
        case "DESCRIPTION": event.description = value.replace(/\\[nN]/g, "\n").trim(); break;
      }
    }
    
    if (event.uid && event.dtstart && event.dtend && event.dtend >= event.dtstart) {
      events.push(event as ICalEvent);
    }
  }
  
  return events;
}

// ==================== CLASSIFICAZIONE ====================

function classifyEvent(event: ICalEvent, source: string): 'BOOKING' | 'BLOCK' {
  const summary = event.summary?.toLowerCase() || '';
  const desc = (event.description || '').toLowerCase();
  
  const blockPatterns = ['not available', 'blocked', 'unavailable', 'closed', 'chiuso', 
    'non disponibile', 'bloccato', 'maintenance', 'owner', 'no vacancy', 'stop sell'];
  
  for (const p of blockPatterns) if (summary.includes(p)) return 'BLOCK';
  
  if (source === 'airbnb') {
    if (summary === 'reserved' && !desc.includes('/hosting/reservations/details/')) return 'BLOCK';
  }
  if (source === 'booking' && (summary === 'closed' || summary.startsWith('closed -'))) return 'BLOCK';
  
  return 'BOOKING';
}

function getGuestName(event: ICalEvent, source: string): string {
  const summary = event.summary?.toLowerCase() || '';
  if (['reserved', 'reservation', 'prenotazione'].includes(summary)) {
    return { airbnb: 'Ospite Airbnb', booking: 'Ospite Booking', oktorate: 'Ospite Octorate' }[source] || 'Prenotazione';
  }
  if (source === 'booking' && /^\d+$/.test(event.summary)) return 'Ospite Booking';
  const match = event.summary?.match(/Client Name \(([^)]+)\)/i);
  return match ? match[1] : (event.summary || 'Ospite');
}

function extractAirbnbCode(desc?: string): string | null {
  if (!desc) return null;
  const m = desc.match(/\/hosting\/reservations\/details\/([A-Z0-9]+)/i);
  return m ? m[1] : null;
}

// ==================== FETCH ====================

async function fetchIcal(url: string): Promise<string | null> {
  for (let i = 1; i <= CONFIG.MAX_RETRIES; i++) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);
      
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CleaningApp/2.0', 'Accept': 'text/calendar', 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Invalid iCal');
      return text;
    } catch (e: any) {
      if (i < CONFIG.MAX_RETRIES) await sleep(CONFIG.RETRY_DELAY_MS * i);
    }
  }
  return null;
}

// ==================== MATCHING ====================

function findMatch(event: ICalEvent, bookings: any[], source: string): any | null {
  const byUid = bookings.find(b => b.icalUid === event.uid && b.source === source);
  if (byUid) return byUid;
  
  for (const b of bookings) {
    if (b.icalUid || b.source !== source) continue;
    const ci = b.checkIn?.toDate?.();
    const co = b.checkOut?.toDate?.();
    if (ci && co && daysDifference(ci, event.dtstart) <= 1 && daysDifference(co, event.dtend) <= 1) return b;
  }
  return null;
}

// ==================== MAIN ====================

export async function POST() {
  const startTime = Date.now();
  
  const stats = {
    propertiesSynced: 0, propertiesSkipped: 0, propertiesError: 0,
    totalBookings: 0, totalBlocks: 0, totalNew: 0, totalUpdated: 0, totalDeleted: 0,
    totalCleaningsCreated: 0, totalCleaningsUpdated: 0, totalCleaningsDeleted: 0,
    errors: [] as string[],
  };
  
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║     🔄 SYNC GLOBALE iCAL - TUTTE LE PROPRIETÀ     ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  
  try {
    // Carica proprietà attive con iCal
    const propsSnap = await getDocs(query(collection(db, 'properties'), where('status', '==', 'ACTIVE')));
    const properties = propsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p: any) =>
      p.icalAirbnb || p.icalBooking || p.icalOktorate || p.icalKrossbooking || p.icalInreception || p.icalUrl
    );
    
    console.log(`📍 Proprietà con iCal: ${properties.length}`);
    
    const pastLimit = new Date();
    pastLimit.setDate(pastLimit.getDate() - CONFIG.DAYS_PAST_TO_KEEP);
    
    // Processa in batch
    for (let i = 0; i < properties.length; i += CONFIG.BATCH_SIZE) {
      const batch = properties.slice(i, i + CONFIG.BATCH_SIZE);
      
      await Promise.all(batch.map(async (property: any) => {
        try {
          console.log(`\n🏠 ${property.name}`);
          
          // Raccogli link
          const links: { url: string; source: string }[] = [];
          if (property.icalAirbnb) links.push({ url: property.icalAirbnb, source: 'airbnb' });
          if (property.icalBooking) links.push({ url: property.icalBooking, source: 'booking' });
          if (property.icalOktorate) links.push({ url: property.icalOktorate, source: 'oktorate' });
          if (property.icalKrossbooking) links.push({ url: property.icalKrossbooking, source: 'krossbooking' });
          if (property.icalInreception) links.push({ url: property.icalInreception, source: 'inreception' });
          
          if (links.length === 0) { stats.propertiesSkipped++; return; }
          
          // Carica dati
          const [bookingsSnap, cleaningsSnap, exclusionsSnap] = await Promise.all([
            getDocs(query(collection(db, 'bookings'), where('propertyId', '==', property.id))),
            getDocs(query(collection(db, 'cleanings'), where('propertyId', '==', property.id))),
            getDocs(query(collection(db, 'syncExclusions'), where('propertyId', '==', property.id))),
          ]);
          
          const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const exclusions = exclusionsSnap.docs.map(d => d.data());
          
          const feedHashes = property.feedHashes || {};
          const processed = new Set<string>();
          
          // Processa ogni feed
          for (const { url, source } of links) {
            const icalData = await fetchIcal(url);
            if (!icalData) continue;
            
            const hash = simpleHash(icalData);
            if (hash === feedHashes[source]) {
              bookings.filter(b => b.source === source).forEach(b => processed.add(b.id));
              continue;
            }
            feedHashes[source] = hash;
            
            const events = parseICalData(icalData);
            
            for (const event of events) {
              if (classifyEvent(event, source) === 'BLOCK') { stats.totalBlocks++; continue; }
              if (event.dtend < pastLimit) continue;
              
              stats.totalBookings++;
              const guestName = getGuestName(event, source);
              const code = source === 'airbnb' ? extractAirbnbCode(event.description) : null;
              
              const existing = findMatch(event, bookings, source);
              
              if (existing) {
                processed.add(existing.id);
                
                const ci = existing.checkIn?.toDate?.();
                const co = existing.checkOut?.toDate?.();
                const changed = !ci || !co || !isSameDay(ci, event.dtstart) || !isSameDay(co, event.dtend);
                
                if (changed || !existing.icalUid) {
                  await updateDoc(doc(db, 'bookings', existing.id), {
                    checkIn: Timestamp.fromDate(event.dtstart),
                    checkOut: Timestamp.fromDate(event.dtend),
                    guestName, icalUid: event.uid,
                    ...(code && { airbnbReservationCode: code }),
                    updatedAt: Timestamp.now(),
                  });
                  stats.totalUpdated++;
                  
                  // Aggiorna pulizia se checkout cambiato
                  if (co && !isSameDay(co, event.dtend)) {
                    const oldC = cleanings.find(c => {
                      const d = c.scheduledDate?.toDate?.();
                      return d && isSameDay(d, co) && !CONFIG.PROTECTED_CLEANING_STATUSES.includes(c.status);
                    });
                    if (oldC) {
                      await deleteDoc(doc(db, 'cleanings', oldC.id));
                      stats.totalCleaningsDeleted++;
                    }
                  }
                }
                
                // Crea/aggiorna pulizia
                const isExcluded = exclusions.some((e: any) => {
                  const ed = e.originalDate?.toDate?.();
                  return ed && isSameDay(ed, event.dtend);
                });
                
                if (!isExcluded) {
                  const existingC = cleanings.find(c => {
                    const d = c.scheduledDate?.toDate?.();
                    return d && isSameDay(d, event.dtend);
                  });
                  
                  if (!existingC) {
                    await addDoc(collection(db, 'cleanings'), {
                      propertyId: property.id, propertyName: property.name,
                      scheduledDate: Timestamp.fromDate(event.dtend),
                      scheduledTime: property.checkOutTime || '10:00',
                      status: 'SCHEDULED', guestsCount: property.maxGuests || 2,
                      bookingSource: source, bookingId: existing.id, guestName,
                      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                    });
                    stats.totalCleaningsCreated++;
                  }
                }
                
              } else {
                // Nuova prenotazione
                const newRef = await addDoc(collection(db, 'bookings'), {
                  propertyId: property.id, propertyName: property.name,
                  guestName, checkIn: Timestamp.fromDate(event.dtstart),
                  checkOut: Timestamp.fromDate(event.dtend),
                  source, icalUid: event.uid,
                  ...(code && { airbnbReservationCode: code }),
                  status: 'CONFIRMED', guests: property.maxGuests || 2,
                  createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                });
                stats.totalNew++;
                processed.add(newRef.id);
                
                // Crea pulizia
                const isExcluded = exclusions.some((e: any) => {
                  const ed = e.originalDate?.toDate?.();
                  return ed && isSameDay(ed, event.dtend);
                });
                
                if (!isExcluded) {
                  const existingC = cleanings.find(c => {
                    const d = c.scheduledDate?.toDate?.();
                    return d && isSameDay(d, event.dtend);
                  });
                  
                  if (!existingC) {
                    await addDoc(collection(db, 'cleanings'), {
                      propertyId: property.id, propertyName: property.name,
                      scheduledDate: Timestamp.fromDate(event.dtend),
                      scheduledTime: property.checkOutTime || '10:00',
                      status: 'SCHEDULED', guestsCount: property.maxGuests || 2,
                      bookingSource: source, bookingId: newRef.id, guestName,
                      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                    });
                    stats.totalCleaningsCreated++;
                  }
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
            stats.totalDeleted++;
            
            const relC = cleanings.find(c => {
              const d = c.scheduledDate?.toDate?.();
              return d && isSameDay(d, co) && c.bookingSource === b.source &&
                     !CONFIG.PROTECTED_CLEANING_STATUSES.includes(c.status);
            });
            if (relC) {
              await deleteDoc(doc(db, 'cleanings', relC.id));
              stats.totalCleaningsDeleted++;
            }
          }
          
          // Aggiorna proprietà
          await updateDoc(doc(db, 'properties', property.id), {
            lastIcalSync: Timestamp.now(), feedHashes, updatedAt: Timestamp.now(),
          });
          
          stats.propertiesSynced++;
          
        } catch (error: any) {
          stats.propertiesError++;
          stats.errors.push(`${property.name}: ${error.message}`);
        }
      }));
      
      // Pausa tra batch
      if (i + CONFIG.BATCH_SIZE < properties.length) {
        await sleep(CONFIG.BATCH_DELAY_MS);
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Salva log globale
    await addDoc(collection(db, 'syncLogs'), {
      type: 'GLOBAL', timestamp: Timestamp.now(), duration, stats, success: stats.errors.length === 0,
    });
    
    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log('║              ✅ SYNC GLOBALE COMPLETATA            ║');
    console.log('╠═══════════════════════════════════════════════════╣');
    console.log(`║ ⏱️  Durata: ${(duration/1000).toFixed(1)}s`);
    console.log(`║ 🏠 Proprietà: ${stats.propertiesSynced} sync, ${stats.propertiesSkipped} skip, ${stats.propertiesError} err`);
    console.log(`║ 📋 Prenotazioni: +${stats.totalNew} 📝${stats.totalUpdated} -${stats.totalDeleted}`);
    console.log(`║ 🧹 Pulizie: +${stats.totalCleaningsCreated} -${stats.totalCleaningsDeleted}`);
    console.log('╚═══════════════════════════════════════════════════╝');
    
    return NextResponse.json({ success: true, stats, duration });
    
  } catch (error: any) {
    console.error('❌ ERRORE:', error);
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}
