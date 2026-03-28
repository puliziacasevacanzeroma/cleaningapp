import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { createLinenOrderForCleaning } from "~/lib/services/linenOrderService";
import { getApiUser } from "~/lib/api-auth";


export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ==================== CONFIGURAZIONE ====================

const CONFIG = {
  // Rate limiting - 30 secondi per sync singola proprietà
  // (il sync di TUTTE le proprietà via cron ha un suo rate limit separato)
  MIN_SYNC_INTERVAL_MS: 30 * 1000, // 30 secondi minimo tra sync
  
  // Timeout e retry
  FETCH_TIMEOUT_MS: 30000, // 30 secondi timeout fetch
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000, // 5 secondi tra retry
  
  // Limiti temporali
  DAYS_PAST_TO_KEEP: 30, // Non eliminare prenotazioni con checkout > 30 giorni fa
  DAYS_FUTURE_TO_SYNC: 365, // Sync prenotazioni fino a 1 anno nel futuro
  
  // Protezione pulizie
  PROTECTED_CLEANING_STATUSES: ['COMPLETED', 'IN_PROGRESS'],
  
  // Tolleranza date per match duplicati
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

interface SyncExclusion {
  propertyId: string;
  originalDate: Timestamp;
  bookingSource?: string;
  reason: 'DELETED' | 'MOVED';
}

interface SyncStats {
  totalBookings: number;
  totalBlocks: number;
  totalNew: number;
  totalUpdated: number;
  totalDeleted: number;
  totalOrphansDeleted: number;
  totalCleaningsCreated: number;
  totalCleaningsUpdated: number;
  totalCleaningsDeleted: number;
  totalCleaningsProtected: number;
  totalExcluded: number;
  totalSkippedSameDay: number;
  linenOrdersCreated: number;
  feedUnchanged: boolean;
  errors: string[];
  warnings: string[];
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Genera hash semplice per confronto feed
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Sleep utility per retry
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Confronta due date ignorando l'orario - FIX TIMEZONE
 * Normalizza entrambe le date al giorno locale (Italia = UTC+1/+2)
 */
function isSameDay(date1: Date, date2: Date): boolean {
  // Normalizza entrambe le date: se ore >= 22 UTC, è probabilmente il giorno dopo in Italia
  const normalize = (d: Date): string => {
    const hours = d.getUTCHours();
    let year = d.getUTCFullYear();
    let month = d.getUTCMonth();
    let day = d.getUTCDate();
    
    // Se è >= 22:00 UTC, in Italia è già il giorno dopo
    if (hours >= 22) {
      const nextDay = new Date(Date.UTC(year, month, day + 1));
      year = nextDay.getUTCFullYear();
      month = nextDay.getUTCMonth();
      day = nextDay.getUTCDate();
    }
    
    return `${year}-${month}-${day}`;
  };
  
  return normalize(date1) === normalize(date2);
}

/**
 * Calcola differenza in giorni tra due date
 */
function daysDifference(date1: Date, date2: Date): number {
  const d1 = new Date(Date.UTC(date1.getUTCFullYear(), date1.getUTCMonth(), date1.getUTCDate()));
  const d2 = new Date(Date.UTC(date2.getUTCFullYear(), date2.getUTCMonth(), date2.getUTCDate()));
  return Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Formatta data per log (DD/MM)
 */
function formatDateShort(date: Date): string {
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}`;
}

// ==================== PARSER ICAL ====================

/**
 * Parse data iCal - ROBUSTO per timezone
 */
function parseICalDate(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    console.error(`❌ Data iCal invalida: "${dateStr}"`);
    return new Date();
  }
  
  // Se ha orario (contiene T)
  if (dateStr.length > 8 && dateStr.includes("T")) {
    const hour = parseInt(dateStr.substring(9, 11)) || 0;
    const minute = parseInt(dateStr.substring(11, 13)) || 0;
    const second = parseInt(dateStr.substring(13, 15)) || 0;
    
    if (dateStr.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
    return new Date(year, month, day, hour, minute, second);
  }
  
  // VALUE=DATE: usa mezzogiorno UTC per evitare problemi timezone
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

/**
 * Parse completo file iCal
 */
function parseICalData(icalText: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  
  try {
    const normalized = icalText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const unfolded = normalized.replace(/\n[ \t]/g, "");
    const eventBlocks = unfolded.split("BEGIN:VEVENT");
    
    for (let i = 1; i < eventBlocks.length; i++) {
      const block = eventBlocks[i].split("END:VEVENT")[0];
      if (!block) continue;
      
      const lines = block.split("\n");
      const event: Partial<ICalEvent> = {};
      
      for (const line of lines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;
        
        let key = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1).trim();
        
        if (key.includes(";")) key = key.split(";")[0];
        
        switch (key) {
          case "UID": event.uid = value; break;
          case "SUMMARY":
            event.summary = value.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ").replace(/\\N/g, " ").trim();
            break;
          case "DTSTART": event.dtstart = parseICalDate(value); break;
          case "DTEND": event.dtend = parseICalDate(value); break;
          case "DESCRIPTION": 
            event.description = value.replace(/\\n/g, "\n").replace(/\\N/g, "\n").trim(); 
            break;
        }
      }
      
      if (event.uid && event.dtstart && event.dtend && event.summary !== undefined) {
        if (event.dtend >= event.dtstart) {
          events.push(event as ICalEvent);
        }
      }
    }
  } catch (error) {
    console.error("❌ Errore parsing iCal:", error);
  }
  
  return events;
}

// ==================== CLASSIFICAZIONE ====================

function classifyEvent(event: ICalEvent, source: string): 'BOOKING' | 'BLOCK' {
  const summary = event.summary?.toLowerCase().trim() || '';
  const description = (event.description || '').toLowerCase();
  
  // Per Booking, i "CLOSED - Not available" possono essere sia blocchi che prenotazioni vere.
  // Il filtro principale è filterBookingContainerBlocks() che rimuove i contenitori.
  if (source === 'booking') {
    if (summary.includes('owner') || summary.includes('proprietario')) return 'BLOCK';
    return 'BOOKING';
  }
  
  const blockPatterns = [
    'not available', 'blocked', 'unavailable', 'closed', 'chiuso',
    'non disponibile', 'bloccato', 'bloccata', 'maintenance', 'owner',
    'block', 'no vacancy', 'stop sell'
  ];
  
  for (const pattern of blockPatterns) {
    if (summary.includes(pattern)) return 'BLOCK';
  }
  
  if (source === 'airbnb') {
    const isReserved = summary === 'reserved' || summary.includes('reserved');
    const hasReservationUrl = description.includes('reservation url:') || 
                              description.includes('/hosting/reservations/details/');
    if (isReserved && hasReservationUrl) return 'BOOKING';
    if (summary === 'reserved' && !hasReservationUrl) return 'BLOCK';
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

function extractAirbnbReservationCode(description?: string): string | null {
  if (!description) return null;
  const match = description.match(/\/hosting\/reservations\/details\/([A-Z0-9]+)/i);
  return match ? match[1] : null;
}

function getGuestName(event: ICalEvent, source: string): string {
  const summary = event.summary?.toLowerCase().trim() || '';
  
  // 🔥 FIX: Booking.com usa "CLOSED - Not available" per le prenotazioni
  if (source === 'booking' && (summary.includes('closed') || summary.includes('not available'))) {
    return 'Ospite Booking';
  }
  
  if (summary === 'reserved' || summary === 'reservation' || summary === 'prenotazione') {
    const names: Record<string, string> = {
      'airbnb': 'Ospite Airbnb', 'booking': 'Ospite Booking',
      'oktorate': 'Ospite Octorate', 'krossbooking': 'Ospite Krossbooking',
      'inreception': 'Ospite Inreception'
    };
    return names[source] || 'Prenotazione';
  }
  
  if (source === 'booking' && /^\d+$/.test(event.summary.trim())) return 'Ospite Booking';
  
  const clientMatch = event.summary.match(/Client Name \(([^)]+)\)/i);
  if (clientMatch) return clientMatch[1].trim();
  
  return event.summary.trim() || 'Ospite';
}

// ==================== FETCH CON RETRY ====================

async function fetchICalWithRetry(url: string, stats: SyncStats): Promise<string | null> {
  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);
      
      const response = await fetch(url, {
        headers: { 
          'User-Agent': 'CleaningApp/2.0',
          'Accept': 'text/calendar, */*',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const text = await response.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Non è un file iCal');
      
      return text;
    } catch (error: any) {
      console.warn(`   ⚠️ Tentativo ${attempt}/${CONFIG.MAX_RETRIES}: ${error.message}`);
      if (attempt < CONFIG.MAX_RETRIES) await sleep(CONFIG.RETRY_DELAY_MS * attempt);
    }
  }
  
  stats.errors.push(`Fetch fallito dopo ${CONFIG.MAX_RETRIES} tentativi`);
  return null;
}

// ==================== MATCHING INTELLIGENTE ====================

function findMatchingBooking(event: ICalEvent, existingBookings: any[], source: string): any | null {
  // 1. Match per UID esatto
  const byUid = existingBookings.find(b => b.icalUid === event.uid && b.source === source);
  if (byUid) return byUid;
  
  // 2. Match per date simili (prenotazioni senza UID)
  for (const booking of existingBookings) {
    if (booking.icalUid || booking.source !== source) continue;
    
    const bCheckIn = booking.checkIn?.toDate?.();
    const bCheckOut = booking.checkOut?.toDate?.();
    if (!bCheckIn || !bCheckOut) continue;
    
    const checkInDiff = daysDifference(bCheckIn, event.dtstart);
    const checkOutDiff = daysDifference(bCheckOut, event.dtend);
    
    if (checkInDiff <= CONFIG.DATE_MATCH_TOLERANCE_DAYS && 
        checkOutDiff <= CONFIG.DATE_MATCH_TOLERANCE_DAYS) {
      return booking;
    }
  }
  
  return null;
}

// ==================== ESCLUSIONI ====================

function isDateExcluded(propertyId: string, date: Date, source: string, exclusions: SyncExclusion[]): boolean {
  return exclusions.some(excl => {
    if (excl.propertyId !== propertyId) return false;
    const exclDate = excl.originalDate?.toDate?.();
    if (!exclDate) return false;
    if (!isSameDay(exclDate, date)) return false;
    if (excl.bookingSource && excl.bookingSource !== source) return false;
    return true;
  });
}

// ==================== GESTIONE PULIZIE ====================

async function handleCleaning(
  propertyId: string, propertyName: string, checkoutDate: Date,
  source: string, bookingId: string, guestName: string,
  property: any, exclusions: SyncExclusion[], existingCleanings: any[], stats: SyncStats
): Promise<void> {
  
  // 🔥 FIX: Non creare pulizie per checkout passati
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  if (checkoutDate < todayStart) return;
  
  // Esclusa?
  if (isDateExcluded(propertyId, checkoutDate, source, exclusions)) {
    stats.totalExcluded++;
    return;
  }
  
  // 🔒 ANTI-DUPLICATO 1: Cerca pulizia con stesso bookingId (anche se spostata a data diversa)
  if (bookingId) {
    const byBookingId = existingCleanings.find(c => c.bookingId === bookingId);
    if (byBookingId) {
      // La pulizia esiste già (magari spostata) — non creare duplicato
      if (!CONFIG.PROTECTED_CLEANING_STATUSES.includes(byBookingId.status)) {
        if (byBookingId.bookingSource !== source) {
          await adminDb.collection("cleanings").doc(byBookingId.id).update({
            bookingSource: source, guestName, updatedAt: Timestamp.now(),
          });
          stats.totalCleaningsUpdated++;
        }
      }
      return;
    }
  }

  // 🔒 ANTI-DUPLICATO 2: Cerca pulizia spostata manualmente (lockedFromSync + originalScheduledDate)
  const byLocked = existingCleanings.find(c => {
    if (c.lockedFromSync !== true || !c.originalScheduledDate) return false;
    const origD = c.originalScheduledDate?.toDate?.();
    if (!origD) return false;
    return isSameDay(origD, checkoutDate);
  });
  if (byLocked) {
    // Pulizia spostata dall'utente — NON ricreare per la data originale
    return;
  }

  // Esiste già? Cerca per data (con tolleranza timezone) E stessa proprietà
  const existing = existingCleanings.find(c => {
    const d = c.scheduledDate?.toDate?.();
    if (!d) return false;
    
    // Confronta date con fix timezone
    if (!isSameDay(d, checkoutDate)) return false;
    
    // ✅ Match esatto: stesso bookingId
    if (c.bookingId && c.bookingId === bookingId) return true;
    
    // ✅ Match: pulizia senza bookingId (vecchia) - la aggiorniamo
    if (!c.bookingId) return true;
    
    // ✅ Match: stessa fonte (evita duplicati dalla stessa fonte)
    if (c.bookingSource === source) return true;
    
    // ❌ Fonte diversa = potrebbero essere prenotazioni diverse
    return false;
  });
  
  if (existing) {
    // Protetta?
    if (CONFIG.PROTECTED_CLEANING_STATUSES.includes(existing.status)) {
      stats.totalCleaningsProtected++;
      return;
    }
    
    // Aggiorna se serve
    if (existing.bookingId !== bookingId || existing.bookingSource !== source) {
      await adminDb.collection("cleanings").doc(existing.id).update( {
        bookingId, bookingSource: source, guestName, updatedAt: Timestamp.now(),
      });
      stats.totalCleaningsUpdated++;
    }
    return;
  }
  
  // Crea nuova
  const cleaningRef = await adminDb.collection("cleanings").add( {
    propertyId, propertyName,
    scheduledDate: Timestamp.fromDate(checkoutDate),
    scheduledTime: property.checkOutTime || '10:00',
    status: 'SCHEDULED',
    guestsCount: property.maxGuests || 2,
    price: property.cleaningPrice || 0,
    bookingSource: source, bookingId, guestName,
    linenConfigModified: false, // 🔥 Usa serviceConfigs dalla proprietà
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
  
  stats.totalCleaningsCreated++;
  
  // 🔧 Crea ordine biancheria
  const orderResult = await createLinenOrderForCleaning({
    cleaningId: cleaningRef.id,
    property,
    scheduledDate: checkoutDate,
    guestsCount: property.maxGuests || 2,
  });
  if (orderResult.success && !orderResult.skipped) {
    stats.linenOrdersCreated++;
  }
}

// ==================== MAIN SYNC ====================

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────

  const startTime = Date.now();
  
  // 🔥 FIX: Supporto parametro force per bypassare hash check
  // Leggi sia da query param (?forceSync=true) che da body ({force: true})
  let forceSync = false;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('forceSync') === 'true') {
      forceSync = true;
    }
    if (!forceSync) {
      const body = await req.json().catch(() => ({}));
      forceSync = body.force === true;
    }
  } catch {}
  
  const stats: SyncStats = {
    totalBookings: 0, totalBlocks: 0, totalNew: 0, totalUpdated: 0,
    totalDeleted: 0, totalOrphansDeleted: 0,
    totalCleaningsCreated: 0, totalCleaningsUpdated: 0, totalCleaningsDeleted: 0,
    totalCleaningsProtected: 0, totalExcluded: 0, totalSkippedSameDay: 0,
    linenOrdersCreated: 0,
    feedUnchanged: false, errors: [], warnings: [],
  };
  
  try {
    const { id } = await params;
    
    
    // Carica proprietà
    const docSnap = await adminDb.collection("properties").doc(id).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Proprietà non trovata' }, { status: 404 });
    }
    
    const property = { id: docSnap.id, ...docSnap.data() } as any;
    
    // Rate limiting
    const lastSync = property.lastIcalSync?.toDate?.();
    if (lastSync) {
      const elapsed = Date.now() - lastSync.getTime();
      if (elapsed < CONFIG.MIN_SYNC_INTERVAL_MS) {
        const wait = Math.ceil((CONFIG.MIN_SYNC_INTERVAL_MS - elapsed) / 1000);
        return NextResponse.json({ 
          success: false, error: `Attendi ${wait}s`, retryAfter: wait 
        }, { status: 429 });
      }
    }
    
    // Raccogli link iCal
    const icalLinks: { url: string; source: string }[] = [];
    if (property.icalAirbnb) icalLinks.push({ url: property.icalAirbnb, source: 'airbnb' });
    if (property.icalBooking) icalLinks.push({ url: property.icalBooking, source: 'booking' });
    if (property.icalOktorate) icalLinks.push({ url: property.icalOktorate, source: 'oktorate' });
    if (property.icalKrossbooking) icalLinks.push({ url: property.icalKrossbooking, source: 'krossbooking' });
    if (property.icalInreception) icalLinks.push({ url: property.icalInreception, source: 'inreception' });
    if (property.icalUrl && !icalLinks.some(l => l.url === property.icalUrl)) {
      icalLinks.push({ url: property.icalUrl, source: 'other' });
    }
    
    // 🔥 FIX: Identifica quali fonti sono configurate
    const configuredSources = new Set(icalLinks.map(l => l.source));
    
    if (icalLinks.length === 0) {
      return NextResponse.json({ success: true, message: 'Nessun link iCal', stats });
    }
    
    // Carica dati esistenti
    const [exclusionsSnap, bookingsSnap, cleaningsSnap] = await Promise.all([
      adminDb.collection('syncExclusions').where('propertyId', '==', id).get(),
      adminDb.collection('bookings').where('propertyId', '==', id).get(),
      adminDb.collection('cleanings').where('propertyId', '==', id).get(),
    ]);
    
    const exclusions: SyncExclusion[] = exclusionsSnap.docs.map(d => d.data() as SyncExclusion);
    const existingBookings = bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
    const existingCleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
    
    
    const feedHashes = property.feedHashes || {};
    const pastLimit = new Date(); pastLimit.setDate(pastLimit.getDate() - CONFIG.DAYS_PAST_TO_KEEP);
    const processedBookingIds = new Set<string>();
    
    // 🔥 FIX: Proteggi prenotazioni di fonti che NON hanno più link configurato
    // (link rimosso = prenotazioni mantenute, non cancellate)
    for (const booking of existingBookings) {
      // @ts-expect-error TODO-FIX: TS2339 Property 'source' does not exist on type '{ id: string; }'.
      if (booking.source && !configuredSources.has(booking.source)) {
        // Questa fonte non ha più link configurato - PROTEGGI la prenotazione
        processedBookingIds.add(booking.id);
      }
    }
    
    // Processa ogni feed
    for (const { url, source } of icalLinks) {
      
      try {
        const icalData = await fetchICalWithRetry(url, stats);
        
        // 🔥 FIX CRITICO: Se fetch fallisce, PROTEGGI le prenotazioni esistenti
        // Non cancellarle solo perché il feed non è raggiungibile!
        if (!icalData) {
          // @ts-expect-error TODO-FIX: TS2339 Property 'source' does not exist on type '{ id: string; }'.
          existingBookings.filter(b => b.source === source).forEach(b => {
            processedBookingIds.add(b.id);
          });
          stats.warnings.push(`${source}: Feed non raggiungibile - prenotazioni esistenti mantenute`);
          continue;
        }
        
        // Cache hash
        const hash = simpleHash(icalData);
        // 🔥 Se forceSync=true, bypassa il check dell'hash
        if (!forceSync && hash === feedHashes[source]) {
          // @ts-expect-error TODO-FIX: TS2339 Property 'source' does not exist on type '{ id: string; }'.
          existingBookings.filter(b => b.source === source).forEach(b => processedBookingIds.add(b.id));
          continue;
        }
        feedHashes[source] = hash;
        
        const rawEvents = parseICalData(icalData);
        
        // 🔥 FIX Booking.com: filtra blocchi contenitore
        const events = source === 'booking' ? filterBookingContainerBlocks(rawEvents) : rawEvents;
        
        // 🔥 FIX: Protezione feed vuoto
        // Se il feed ha 0 eventi ma abbiamo prenotazioni esistenti,
        // potrebbe essere un errore dell'OTA - NON cancellare tutto!
        // @ts-expect-error TODO-FIX: TS2339 Property 'source' does not exist on type '{ id: string; }'.
        const existingForSource = existingBookings.filter(b => b.source === source);
        const futureExisting = existingForSource.filter(b => {
          // @ts-expect-error TODO-FIX: TS2339 Property 'checkOut' does not exist on type '{ id: string; }'.
          const co = b.checkOut?.toDate?.();
          return co && co > new Date();
        });
        
        if (events.length === 0 && futureExisting.length > 0) {
          existingForSource.forEach(b => processedBookingIds.add(b.id));
          stats.warnings.push(`${source}: Feed vuoto - ${futureExisting.length} prenotazioni future protette`);
          continue;
        }
        
        for (const event of events) {
          if (classifyEvent(event, source) === 'BLOCK') { stats.totalBlocks++; continue; }
          if (event.dtend < pastLimit) continue;
          
          stats.totalBookings++;
          
          const guestName = getGuestName(event, source);
          const reservationCode = source === 'airbnb' ? extractAirbnbReservationCode(event.description) : null;
          
          const existing = findMatchingBooking(event, existingBookings, source);
          
          if (existing) {
            processedBookingIds.add(existing.id);
            
            const eCheckIn = existing.checkIn?.toDate?.();
            const eCheckOut = existing.checkOut?.toDate?.();
            const changed = !eCheckIn || !eCheckOut || !isSameDay(eCheckIn, event.dtstart) || !isSameDay(eCheckOut, event.dtend);
            
            if (changed || !existing.icalUid) {
              await adminDb.collection("bookings").doc(existing.id).update( {
                checkIn: Timestamp.fromDate(event.dtstart),
                checkOut: Timestamp.fromDate(event.dtend),
                guestName, icalUid: event.uid,
                ...(reservationCode && { airbnbReservationCode: reservationCode }),
                updatedAt: Timestamp.now(),
              });
              stats.totalUpdated++;
              
              // Se checkout cambiato, elimina vecchia pulizia
              if (eCheckOut && !isSameDay(eCheckOut, event.dtend)) {
                const oldC = existingCleanings.find(c => {
                  // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
                  const d = c.scheduledDate?.toDate?.();
                  // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
                  return d && isSameDay(d, eCheckOut) && !CONFIG.PROTECTED_CLEANING_STATUSES.includes(c.status);
                });
                if (oldC) {
                  await adminDb.collection("cleanings").doc(oldC.id).delete();
                  stats.totalCleaningsDeleted++;
                }
              }
            }
            
            await handleCleaning(id, property.name, event.dtend, source, existing.id, guestName, property, exclusions, existingCleanings, stats);
            
          } else {
            // Nuova prenotazione
            const newRef = await adminDb.collection("bookings").add( {
              propertyId: id, propertyName: property.name,
              guestName, checkIn: Timestamp.fromDate(event.dtstart), checkOut: Timestamp.fromDate(event.dtend),
              source, icalUid: event.uid,
              ...(reservationCode && { airbnbReservationCode: reservationCode }),
              status: 'CONFIRMED', guests: property.maxGuests || 2,
              createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
            });
            
            stats.totalNew++;
            processedBookingIds.add(newRef.id);
            
            await handleCleaning(id, property.name, event.dtend, source, newRef.id, guestName, property, exclusions, existingCleanings, stats);
          }
        }
        
      } catch (error: any) {
        stats.errors.push(`${source}: ${error.message}`);
      }
    }
    
    // Elimina prenotazioni obsolete (solo FUTURE che non sono più nel feed)
    const todayStart = new Date(); 
    todayStart.setHours(0, 0, 0, 0);
    
    for (const booking of existingBookings) {
      if (processedBookingIds.has(booking.id)) continue;
      // @ts-expect-error TODO-FIX: TS2339 Property 'source' does not exist on type '{ id: string; }'.
      if (!booking.source) continue; // Manuale
      
      // @ts-expect-error TODO-FIX: TS2339 Property 'checkOut' does not exist on type '{ id: string; }'.
      const co = booking.checkOut?.toDate?.();
      if (!co || co < pastLimit) continue;
      
      // NON cancellare prenotazioni con checkout oggi o passato
      // (il feed iCal potrebbe non includerle più, ma sono comunque valide)
      if (co <= todayStart) {
        continue;
      }
      
      // Solo prenotazioni FUTURE che non sono nel feed vengono cancellate
      await adminDb.collection("bookings").doc(booking.id).delete();
      stats.totalDeleted++;
      
      // Elimina pulizia correlata (solo se non protetta)
      const relC = existingCleanings.find(c => {
        // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
        const d = c.scheduledDate?.toDate?.();
        // @ts-expect-error TODO-FIX: TS2339 Property 'bookingSource' does not exist on type '{ id: string; }'.
        return d && isSameDay(d, co) && c.bookingSource === booking.source && 
               // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
               !CONFIG.PROTECTED_CLEANING_STATUSES.includes(c.status);
      });
      if (relC) {
        await adminDb.collection("cleanings").doc(relC.id).delete();
        stats.totalCleaningsDeleted++;
      }
    }
    
    // Aggiorna proprietà
    await adminDb.collection("properties").doc(id).update( {
      lastIcalSync: Timestamp.now(), feedHashes, updatedAt: Timestamp.now(),
    });
    
    // Salva log
    const duration = Date.now() - startTime;
    await adminDb.collection("syncLogs").add( {
      propertyId: id, propertyName: property.name, timestamp: Timestamp.now(),
      duration, stats, success: stats.errors.length === 0,
    });
    
    
    return NextResponse.json({ success: true, stats, duration });
    
  } catch (error: any) {
    console.error('❌ ERRORE:', error);
    stats.errors.push(error.message);
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}
