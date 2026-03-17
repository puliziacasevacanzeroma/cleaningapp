import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { createLinenOrderForCleaning } from "~/lib/services/linenOrderService";
import { getApiUser } from "~/lib/api-auth";


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

/**
 * 🔒 ANTI-DUPLICATO UNIVERSALE: cerca pulizia esistente per una data di checkout.
 * Copre TUTTI i casi: bookingId diretto, pulizia spostata (lockedFromSync), data esatta.
 */
function findExistingCleaningForCheckout(
  cleanings: any[],
  checkoutDate: Date,
  bookingId?: string | null
): any | null {
  const checkoutDateStr = checkoutDate.toISOString().split('T')[0];
  
  // 1. Stesso bookingId → è la pulizia giusta (anche se spostata a data diversa)
  if (bookingId) {
    const byBookingId = cleanings.find((c: any) => c.bookingId === bookingId);
    if (byBookingId) return byBookingId;
  }
  
  // 2. lockedFromSync + originalScheduledDate: pulizia manualmente spostata dall'utente
  const byLocked = cleanings.find((c: any) => {
    if (c.lockedFromSync !== true || !c.originalScheduledDate) return false;
    const origD = c.originalScheduledDate?.toDate?.();
    if (!origD) return false;
    return origD.toISOString().split('T')[0] === checkoutDateStr;
  });
  if (byLocked) return byLocked;
  
  // 3. Data esatta scheduledDate
  const byDate = cleanings.find((c: any) => {
    const d = c.scheduledDate?.toDate?.();
    return d && isSameDay(d, checkoutDate);
  });
  if (byDate) return byDate;
  
  return null;
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
  
  // Per Booking, i "CLOSED - Not available" possono essere sia blocchi che prenotazioni vere.
  // Il filtro principale è filterBookingContainerBlocks() che rimuove i contenitori.
  if (source === 'booking') {
    if (summary.includes('owner') || summary.includes('proprietario')) return 'BLOCK';
    return 'BOOKING';
  }
  
  const blockPatterns = ['not available', 'blocked', 'unavailable', 'closed', 'chiuso', 
    'non disponibile', 'bloccato', 'bloccata', 'maintenance', 'owner', 'no vacancy', 'stop sell'];
  
  for (const p of blockPatterns) if (summary.includes(p)) return 'BLOCK';
  
  if (source === 'airbnb') {
    if (summary === 'reserved' && !desc.includes('/hosting/reservations/details/')) return 'BLOCK';
  }
  
  return 'BOOKING';
}

/**
 * 🔥 FIX Booking.com: Filtra i "blocchi contenitore"
 * 
 * Booking.com usa "CLOSED - Not available" sia per blocchi che per prenotazioni reali.
 * Un evento che CONTIENE completamente almeno un altro evento è un blocco del proprietario.
 */
function filterBookingContainerBlocks(events: ICalEvent[]): ICalEvent[] {
  if (events.length <= 1) return events;
  
  const containerIds = new Set<string>();
  
  for (const outer of events) {
    for (const inner of events) {
      if (outer.uid === inner.uid) continue;
      const outerStart = outer.dtstart.getTime();
      const outerEnd = outer.dtend.getTime();
      const innerStart = inner.dtstart.getTime();
      const innerEnd = inner.dtend.getTime();
      
      if (outerStart <= innerStart && outerEnd >= innerEnd &&
          !(outerStart === innerStart && outerEnd === innerEnd)) {
        containerIds.add(outer.uid);
        break;
      }
    }
  }
  
  return events.filter(e => !containerIds.has(e.uid));
}

function getGuestName(event: ICalEvent, source: string): string {
  const summary = event.summary?.toLowerCase() || '';
  
  if (source === 'booking' && (summary.includes('closed') || summary.includes('not available'))) {
    return 'Ospite Booking';
  }
  
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
    } catch (e) {
      if (i < CONFIG.MAX_RETRIES) await sleep(CONFIG.RETRY_DELAY_MS * i);
    }
  }
  return null;
}

// ==================== MATCHING ====================

function findMatch(event: ICalEvent, bookings: Record<string, unknown>[], source: string): Record<string, unknown> | null {
  // 1. Match esatto per icalUid
  const byUid = bookings.find(b => b.icalUid === event.uid && b.source === source);
  if (byUid) return byUid;
  
  // 2. Match per date approssimate (solo senza icalUid)
  for (const b of bookings) {
    if (b.icalUid || b.source !== source) continue;
    // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
    const ci = b.checkIn?.toDate?.();
    // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
    const co = b.checkOut?.toDate?.();
    if (ci && co && daysDifference(ci, event.dtstart) <= 1 && daysDifference(co, event.dtend) <= 1) return b;
  }
  
  // 3. 🔧 FIX: Match per checkIn esatto anche CON icalUid diverso (UID cambiato dal channel manager)
  for (const b of bookings) {
    if (b.source !== source || !b.icalUid) continue;
    // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
    const ci = b.checkIn?.toDate?.();
    if (ci && isSameDay(ci, event.dtstart)) return b;
  }
  
  return null;
}

// ==================== MAIN ====================

export async function POST() {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  // ─────────────────────────────────────────────────────

  const startTime = Date.now();
  
  const stats = {
    propertiesSynced: 0, propertiesSkipped: 0, propertiesError: 0,
    totalBookings: 0, totalBlocks: 0, totalNew: 0, totalUpdated: 0, totalDeleted: 0,
    totalCleaningsCreated: 0, totalCleaningsUpdated: 0, totalCleaningsDeleted: 0,
    linenOrdersCreated: 0,
    errors: [] as string[],
  };
  
  if (process.env.NODE_ENV !== "production") console.log('\n╔═══════════════════════════════════════════════════╗');
  if (process.env.NODE_ENV !== "production") console.log('║     🔄 SYNC GLOBALE iCAL - TUTTE LE PROPRIETÀ     ║');
  if (process.env.NODE_ENV !== "production") console.log('╚═══════════════════════════════════════════════════╝');
  
  try {
    // Carica proprietà attive con iCal
    const propsSnap = await adminDb.collection("properties").where("status", "==", 'ACTIVE').get();
    const properties = propsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })).filter((p: Record<string, unknown>) =>
      p.icalAirbnb || p.icalBooking || p.icalOktorate || p.icalKrossbooking || p.icalInreception || p.icalUrl
    );
    
    const pastLimit = new Date();
    pastLimit.setDate(pastLimit.getDate() - CONFIG.DAYS_PAST_TO_KEEP);
    
    // 🔥 FIX: Soglia per creazione pulizie — solo da oggi in poi
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    
    // Processa in batch
    for (let i = 0; i < properties.length; i += CONFIG.BATCH_SIZE) {
      const batch = properties.slice(i, i + CONFIG.BATCH_SIZE);
      
      await Promise.all(batch.map(async (property: Record<string, unknown>) => {
        try {
          if (process.env.NODE_ENV !== "production") console.log(`\n🏠 ${property.name}`);
          
          // Raccogli link
          const links: { url: string; source: string }[] = [];
          // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
          if (property.icalAirbnb) links.push({ url: property.icalAirbnb, source: 'airbnb' });
          // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
          if (property.icalBooking) links.push({ url: property.icalBooking, source: 'booking' });
          // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
          if (property.icalOktorate) links.push({ url: property.icalOktorate, source: 'oktorate' });
          // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
          if (property.icalKrossbooking) links.push({ url: property.icalKrossbooking, source: 'krossbooking' });
          // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
          if (property.icalInreception) links.push({ url: property.icalInreception, source: 'inreception' });
          
          if (links.length === 0) { stats.propertiesSkipped++; return; }
          
          // Carica dati
          const [bookingsSnap, cleaningsSnap, exclusionsSnap] = await Promise.all([
            adminDb.collection('bookings').where('propertyId', '==', property.id).get(),
            adminDb.collection('cleanings').where('propertyId', '==', property.id).get(),
            adminDb.collection('syncExclusions').where('propertyId', '==', property.id).get(),
          ]);
          
          const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
          const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
          const exclusions = exclusionsSnap.docs.map(d => d.data());
          
          const feedHashes = property.feedHashes || {};
          const processed = new Set<string>();
          
          // 🔴 STEP 0: Verifica pulizie mancanti per TUTTE le prenotazioni esistenti
          // Gira SEMPRE, indipendentemente dal hash del feed
          const isBlockedName = (name: string, src?: string): boolean => {
            if (!name) return false;
            if (src === 'booking') return false;
            const lower = name.toLowerCase();
            return ['not available', 'no vacancy', 'stop sell', 'bloccata', 'bloccato',
              'blocked', 'unavailable', 'chiuso', 'non disponibile', 'imported',
              'closed', 'maintenance', 'owner'].some(p => lower.includes(p));
          };
          
          for (const b of bookings) {
            // @ts-expect-error TODO-FIX: TS2339 Property 'source' does not exist on type '{ id: string; }'.
            if (!b.source) continue;
            // @ts-expect-error TODO-FIX: TS2339 Property 'isManual' does not exist on type '{ id: string; }'.
            if (b.isManual === true || b.source === 'manual' || b.source === 'direct' || b.source === 'phone') continue;
            // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
            if (b.status === 'CANCELLED') continue;
            // @ts-expect-error TODO-FIX: TS2339 Property 'guestName' does not exist on type '{ id: string; }'.
            if (isBlockedName(b.guestName || '', b.source)) continue;
            
            // @ts-expect-error TODO-FIX: TS2339 Property 'checkOut' does not exist on type '{ id: string; }'.
            const coDate = b.checkOut?.toDate?.();
            if (!coDate || coDate < pastLimit) continue;
            
            const isExcluded = exclusions.some((e: Record<string, unknown>) => {
              // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
              const ed = e.originalDate?.toDate?.();
              return ed && isSameDay(ed, coDate);
            });
            if (isExcluded) continue;
            
            const existingCleaning = findExistingCleaningForCheckout(cleanings, coDate, (b as any).id);
            
            if (!existingCleaning) {
              // 🔥 FIX: Non creare pulizie per checkout passati
              if (coDate < todayStart) continue;
              // @ts-expect-error TODO-FIX: TS2339 Property 'guests' does not exist on type '{ id: string; }'.
              const guestsCount = b.guests || b.guestsCount || property.maxGuests || 2;
              
              const cleaningRef = await adminDb.collection("cleanings").add( {
                propertyId: property.id, propertyName: property.name,
                scheduledDate: Timestamp.fromDate(coDate),
                scheduledTime: property.checkOutTime || '10:00',
                status: 'SCHEDULED', guestsCount,
                // @ts-expect-error TODO-FIX: TS2339 Property 'source' does not exist on type '{ id: string; }'.
                bookingSource: b.source, bookingId: b.id,
                // @ts-expect-error TODO-FIX: TS2339 Property 'guestName' does not exist on type '{ id: string; }'.
                guestName: b.guestName || 'Ospite',
                createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
              });
              stats.totalCleaningsCreated++;
              // @ts-expect-error TODO-FIX: TS2339 Property 'guestName' does not exist on type '{ id: string; }'.
              if (process.env.NODE_ENV !== "production") console.log(`🔧 STEP 0: Pulizia mancante creata per ${property.name} - ${b.guestName || 'Ospite'} (checkout: ${coDate.toISOString().split('T')[0]})`);
              
              // Aggiungi alla lista locale
              // @ts-expect-error TODO-FIX: TS2353 Object literal may only specify known properties, and 'scheduledDate' does not e...
              cleanings.push({ id: cleaningRef.id, scheduledDate: Timestamp.fromDate(coDate), status: 'SCHEDULED' });
              
              // Crea ordine biancheria
              const orderResult = await createLinenOrderForCleaning({
                cleaningId: cleaningRef.id,
                property,
                scheduledDate: coDate,
                guestsCount,
              });
              if (orderResult.success && !orderResult.skipped) {
                stats.linenOrdersCreated++;
              }
            }
          }
          
          // 🔴 STEP 0.5: Elimina pulizie con bookingId che punta a prenotazione inesistente
          // Questo gestisce il caso: prenotazione aggiornata nel feed iCal (date cambiate) 
          // → vecchia prenotazione rimossa → pulizia vecchia rimasta orfana
          const bookingIds = new Set(bookings.map((b: Record<string, unknown>) => b.id));
          
          for (const c of [...cleanings]) {
            // @ts-expect-error TODO-FIX: TS2339 Property 'bookingId' does not exist on type '{ id: string; }'.
            if (!c.bookingId) continue;
            // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
            if (c.status === 'COMPLETED' || c.status === 'IN_PROGRESS') continue; // non toccare pulizie completate
            // @ts-expect-error TODO-FIX: TS2339 Property 'bookingSource' does not exist on type '{ id: string; }'.
            if (!c.bookingSource || c.bookingSource === 'manual') continue; // non toccare pulizie manuali
            
            // @ts-expect-error TODO-FIX: TS2339 Property 'bookingId' does not exist on type '{ id: string; }'.
            if (!bookingIds.has(c.bookingId)) {
              // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
              const schedDate = c.scheduledDate?.toDate?.();
              if (!schedDate || schedDate < pastLimit) continue;
              
              // La prenotazione non esiste più → probabilmente aggiornata nel feed iCal
              // Verifica che non ci sia un'altra prenotazione per la stessa data (in quel caso la pulizia è semplicemente collegata male)
              const hasBookingOnSameDate = bookings.some((b: Record<string, unknown>) => {
                // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
                const co = b.checkOut?.toDate?.();
                return co && isSameDay(co, schedDate);
              });
              
              if (!hasBookingOnSameDate) {
                // Nessuna prenotazione ha checkout in questa data → pulizia orfana, elimina
                // Elimina anche ordine collegato
                // @ts-expect-error TODO-FIX: TS2339 Property 'laundryOrderId' does not exist on type '{ id: string; }'.
                if (c.laundryOrderId) {
                  try {
                    // @ts-expect-error TODO-FIX: TS2339 Property 'laundryOrderId' does not exist on type '{ id: string; }'.
                    await adminDb.collection("orders").doc(c.laundryOrderId).delete();
                  } catch (e) { /* ordine potrebbe non esistere */ }
                }
                
                await adminDb.collection("cleanings").doc(c.id).delete();
                // Rimuovi dalla lista locale
                const idx = cleanings.findIndex((cl: Record<string, unknown>) => cl['id'] === c.id);
                if (idx >= 0) cleanings.splice(idx, 1);
                
                stats.totalCleaningsDeleted = (stats.totalCleaningsDeleted || 0) + 1;
                // @ts-expect-error TODO-FIX: TS2339 Property 'guestName' does not exist on type '{ id: string; }'.
                if (process.env.NODE_ENV !== "production") console.log(`🗑️ STEP 0.5: Pulizia orfana ${c.id} eliminata (${c.guestName || 'N/A'} - ${schedDate.toISOString().split('T')[0]}) - prenotazione ${c.bookingId} non esiste`);
              }
            }
          }
          
          // Processa ogni feed
          for (const { url, source } of links) {
            const icalData = await fetchIcal(url);
            if (!icalData) {
              // 🔒 FIX: Feed down → proteggi prenotazioni di questo source
              // @ts-expect-error TODO-FIX: TS2339 Property 'source' does not exist on type '{ id: string; }'.
              bookings.filter(b => b.source === source).forEach(b => processed.add(b.id));
              continue;
            }
            
            const hash = simpleHash(icalData);
            // @ts-expect-error TODO-FIX: TS7053 Element implicitly has an 'any' type because expression of type 'string' can't b...
            if (hash === feedHashes[source]) {
              // @ts-expect-error TODO-FIX: TS2339 Property 'source' does not exist on type '{ id: string; }'.
              bookings.filter(b => b.source === source).forEach(b => processed.add(b.id));
              continue;
            }
            // @ts-expect-error TODO-FIX: TS7053 Element implicitly has an 'any' type because expression of type 'string' can't b...
            feedHashes[source] = hash;
            
            const rawEvents = parseICalData(icalData);
            // 🔥 FIX: Per Booking.com, filtra i blocchi contenitore
            const events = source === 'booking' ? filterBookingContainerBlocks(rawEvents) : rawEvents;
            
            for (const event of events) {
              if (classifyEvent(event, source) === 'BLOCK') { stats.totalBlocks++; continue; }
              if (event.dtend < pastLimit) continue;
              
              stats.totalBookings++;
              const guestName = getGuestName(event, source);
              const code = source === 'airbnb' ? extractAirbnbCode(event.description) : null;
              
              const existing = findMatch(event, bookings, source);
              
              if (existing) {
                // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
                processed.add(existing.id);
                
                // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
                const ci = existing.checkIn?.toDate?.();
                // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
                const co = existing.checkOut?.toDate?.();
                const changed = !ci || !co || !isSameDay(ci, event.dtstart) || !isSameDay(co, event.dtend);
                
                if (changed || !existing.icalUid) {
                  // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
                  await adminDb.collection("bookings").doc(existing.id).update( {
                    checkIn: Timestamp.fromDate(event.dtstart),
                    checkOut: Timestamp.fromDate(event.dtend),
                    guestName, icalUid: event.uid,
                    ...(code && { airbnbReservationCode: code }),
                    updatedAt: Timestamp.now(),
                  });
                  stats.totalUpdated++;
                  
                  // Aggiorna pulizia se checkout cambiato
                  if (co && !isSameDay(co, event.dtend)) {
                    // 🔧 FIX: Cerca pulizia per bookingId (più preciso) poi per data
                    const oldByBookingId = cleanings.find(c => 
                      // @ts-expect-error TODO-FIX: TS2339 Property 'bookingId' does not exist on type '{ id: string; }'.
                      c.bookingId === existing.id && 
                      // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
                      !CONFIG.PROTECTED_CLEANING_STATUSES.includes(c.status)
                    );
                    const oldByDate = !oldByBookingId ? cleanings.find(c => {
                      // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
                      const d = c.scheduledDate?.toDate?.();
                      // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
                      return d && isSameDay(d, co) && !CONFIG.PROTECTED_CLEANING_STATUSES.includes(c.status) && !c.isManual;
                    }) : null;
                    
                    const oldC = oldByBookingId || oldByDate;
                    
                    if (oldC) {
                      // 🔒 PROTEZIONE: se la pulizia è stata spostata manualmente, NON sovrascrivere
                      if ((oldC as any).lockedFromSync === true) {
                        console.log(`[SYNC-ALL] Pulizia ${oldC.id} lockedFromSync — checkout cambiato ma NON sposto (lock utente). Aggiorno solo originalScheduledDate.`);
                        await adminDb.collection("cleanings").doc(oldC.id).update({
                          originalScheduledDate: Timestamp.fromDate(event.dtend),
                          updatedAt: Timestamp.now(),
                        });
                      } else {
                        // Sposta la pulizia alla nuova data invece di eliminarla/ricrearla
                        await adminDb.collection("cleanings").doc(oldC.id).update( {
                          scheduledDate: Timestamp.fromDate(event.dtend),
                          originalScheduledDate: Timestamp.fromDate(event.dtend),
                          guestName,
                          updatedAt: Timestamp.now(),
                        });
                        // Aggiorna anche la data nell'array locale
                        // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
                        oldC.scheduledDate = Timestamp.fromDate(event.dtend);
                        stats.totalCleaningsUpdated++;
                        if (process.env.NODE_ENV !== "production") console.log(`📅 Pulizia ${oldC.id} spostata da ${co.toISOString().split('T')[0]} a ${event.dtend.toISOString().split('T')[0]}`);
                      }
                      
                      // Aggiorna anche ordine biancheria collegato (solo se non locked)
                      // @ts-expect-error TODO-FIX: TS2339 Property 'laundryOrderId' does not exist on type '{ id: string; }'.
                      if (oldC.laundryOrderId && (oldC as any).lockedFromSync !== true) {
                        try {
                          // @ts-expect-error TODO-FIX: TS2339 Property 'laundryOrderId' does not exist on type '{ id: string; }'.
                          await adminDb.collection("orders").doc(oldC.laundryOrderId).update( {
                            scheduledDate: Timestamp.fromDate(event.dtend),
                            updatedAt: Timestamp.now(),
                          });
                        } catch (err) { /* ordine potrebbe non esistere */ }
                      }
                    }
                  }
                }
                
                // Crea/aggiorna pulizia
                const isExcluded = exclusions.some((e: Record<string, unknown>) => {
                  // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
                  const ed = e.originalDate?.toDate?.();
                  return ed && isSameDay(ed, event.dtend);
                });
                
                if (!isExcluded) {
                  // 🔒 ANTI-DUPLICATO: usa funzione universale (bookingId, lockedFromSync, data)
                  const existingC = findExistingCleaningForCheckout(cleanings, event.dtend, existing.id);
                  
                  if (!existingC && event.dtend >= todayStart) {
                    const cleaningRef = await adminDb.collection("cleanings").add( {
                      propertyId: property.id, propertyName: property.name,
                      scheduledDate: Timestamp.fromDate(event.dtend),
                      scheduledTime: property.checkOutTime || '10:00',
                      status: 'SCHEDULED', guestsCount: property.maxGuests || 2,
                      bookingSource: source, bookingId: existing.id, guestName,
                      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                    });
                    stats.totalCleaningsCreated++;
                    
                    // 🔧 Crea ordine biancheria
                    const orderResult = await createLinenOrderForCleaning({
                      cleaningId: cleaningRef.id,
                      property,
                      scheduledDate: event.dtend,
                      // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'number'.
                      guestsCount: property.maxGuests || 2,
                    });
                    if (orderResult.success && !orderResult.skipped) {
                      stats.linenOrdersCreated++;
                    }
                  }
                }
                
              } else {
                // Nuova prenotazione
                const newRef = await adminDb.collection("bookings").add( {
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
                const isExcluded = exclusions.some((e: Record<string, unknown>) => {
                  // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
                  const ed = e.originalDate?.toDate?.();
                  return ed && isSameDay(ed, event.dtend);
                });
                
                if (!isExcluded) {
                  // 🔒 ANTI-DUPLICATO: usa funzione universale (bookingId, lockedFromSync, data)
                  const existingC = findExistingCleaningForCheckout(cleanings, event.dtend, newRef.id);
                  
                  if (!existingC && event.dtend >= todayStart) {
                    const cleaningRef = await adminDb.collection("cleanings").add( {
                      propertyId: property.id, propertyName: property.name,
                      scheduledDate: Timestamp.fromDate(event.dtend),
                      scheduledTime: property.checkOutTime || '10:00',
                      status: 'SCHEDULED', guestsCount: property.maxGuests || 2,
                      bookingSource: source, bookingId: newRef.id, guestName,
                      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                    });
                    stats.totalCleaningsCreated++;
                    
                    // 🔧 Crea ordine biancheria
                    const orderResult = await createLinenOrderForCleaning({
                      cleaningId: cleaningRef.id,
                      property,
                      scheduledDate: event.dtend,
                      // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'number'.
                      guestsCount: property.maxGuests || 2,
                    });
                    if (orderResult.success && !orderResult.skipped) {
                      stats.linenOrdersCreated++;
                    }
                  }
                }
              }
            }
          }
          
          // Elimina obsolete
          for (const b of bookings) {
            // @ts-expect-error TODO-FIX: TS2339 Property 'source' does not exist on type '{ id: string; }'.
            if (processed.has(b.id) || !b.source) continue;
            
            // 🔒 NON eliminare prenotazioni manuali!
            // @ts-expect-error TODO-FIX: TS2339 Property 'isManual' does not exist on type '{ id: string; }'.
            if (b.isManual === true || b.source === 'manual' || b.source === 'direct' || b.source === 'phone') {
              if (process.env.NODE_ENV !== "production") console.log(`   ⏭️ Skipped manual booking: ${b.id}`);
              continue;
            }
            
            // @ts-expect-error TODO-FIX: TS2339 Property 'checkOut' does not exist on type '{ id: string; }'.
            const co = b.checkOut?.toDate?.();
            if (!co || co < pastLimit) continue;
            
            await adminDb.collection("bookings").doc(b.id).delete();
            stats.totalDeleted++;
            
            // 🔧 FIX: Cerca pulizia per bookingId (più preciso) poi per data
            const relByBookingId = cleanings.find(c => 
              // @ts-expect-error TODO-FIX: TS2339 Property 'bookingId' does not exist on type '{ id: string; }'.
              c.bookingId === b.id && !CONFIG.PROTECTED_CLEANING_STATUSES.includes(c.status)
            );
            const relByDate = !relByBookingId ? cleanings.find(c => {
              // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
              const d = c.scheduledDate?.toDate?.();
              // @ts-expect-error TODO-FIX: TS2339 Property 'bookingSource' does not exist on type '{ id: string; }'.
              return d && isSameDay(d, co) && c.bookingSource === b.source &&
                     // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
                     !CONFIG.PROTECTED_CLEANING_STATUSES.includes(c.status);
            }) : null;
            
            const relC = relByBookingId || relByDate;
            
            // @ts-expect-error TODO-FIX: TS2339 Property 'isManual' does not exist on type '{ id: string; }'.
            if (relC && !relC.isManual) {
              // 🔧 FIX: Elimina anche ordine collegato
              // @ts-expect-error TODO-FIX: TS2339 Property 'laundryOrderId' does not exist on type '{ id: string; }'.
              if (relC.laundryOrderId) {
                try {
                  // @ts-expect-error TODO-FIX: TS2339 Property 'laundryOrderId' does not exist on type '{ id: string; }'.
                  await adminDb.collection("orders").doc(relC.laundryOrderId).delete();
                  // @ts-expect-error TODO-FIX: TS2339 Property 'laundryOrderId' does not exist on type '{ id: string; }'.
                  if (process.env.NODE_ENV !== "production") console.log(`🗑️ Ordine ${relC.laundryOrderId} eliminato (prenotazione rimossa dal feed)`);
                } catch (e) { /* ordine potrebbe non esistere */ }
              }
              await adminDb.collection("cleanings").doc(relC.id).delete();
              stats.totalCleaningsDeleted++;
            }
          }
          
          // Aggiorna proprietà
          // STEP 4: Pulizia automatica ordini orfani per questa proprietà
          try {
            const currentCleaningsCheck = await adminDb.collection('cleanings')
              .where('propertyId', '==', property.id).get();
            const validCleaningIds = new Set(currentCleaningsCheck.docs.map((d: any) => d.id));
            
            const propertyOrdersCheck = await adminDb.collection('orders')
              .where('propertyId', '==', property.id).get();
            
            for (const oDoc of propertyOrdersCheck.docs) {
              const oData = oDoc.data() as Record<string, any>;
              if (oData.status !== 'PENDING' || !oData.cleaningId) continue;
              if (validCleaningIds.has(oData.cleaningId)) continue;
              
              await adminDb.collection('orders').doc(oDoc.id).update({
                status: 'CANCELLED',
                cancelReason: 'Pulizia collegata non esistente (cleanup sync automatico)',
                cancelledAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
              });
            }
          } catch (cleanupErr) {
            console.error(`⚠️ Errore cleanup orfani ${property.name}:`, cleanupErr);
          }

          // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
          await adminDb.collection("properties").doc(property.id).update( {
            lastIcalSync: Timestamp.now(), feedHashes, updatedAt: Timestamp.now(),
          });
          
          stats.propertiesSynced++;
          
        } catch (error) {
          stats.propertiesError++;
          // @ts-expect-error TODO-FIX: TS18046 'error' is of type 'unknown'.
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
    await adminDb.collection("syncLogs").add( {
      type: 'GLOBAL', timestamp: Timestamp.now(), duration, stats, success: stats.errors.length === 0,
    });
    
    if (process.env.NODE_ENV !== "production") console.log('\n╔═══════════════════════════════════════════════════╗');
    if (process.env.NODE_ENV !== "production") console.log('║              ✅ SYNC GLOBALE COMPLETATA            ║');
    if (process.env.NODE_ENV !== "production") console.log('╠═══════════════════════════════════════════════════╣');
    if (process.env.NODE_ENV !== "production") console.log(`║ ⏱️  Durata: ${(duration/1000).toFixed(1)}s`);
    if (process.env.NODE_ENV !== "production") console.log(`║ 🏠 Proprietà: ${stats.propertiesSynced} sync, ${stats.propertiesSkipped} skip, ${stats.propertiesError} err`);
    if (process.env.NODE_ENV !== "production") console.log(`║ 📋 Prenotazioni: +${stats.totalNew} 📝${stats.totalUpdated} -${stats.totalDeleted}`);
    if (process.env.NODE_ENV !== "production") console.log(`║ 🧹 Pulizie: +${stats.totalCleaningsCreated} -${stats.totalCleaningsDeleted}`);
    if (process.env.NODE_ENV !== "production") console.log('╚═══════════════════════════════════════════════════╝');
    
    return NextResponse.json({ success: true, stats, duration });
    
  } catch (error) {
    console.error('❌ ERRORE:', error);
    // @ts-expect-error TODO-FIX: TS18046 'error' is of type 'unknown'.
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}
