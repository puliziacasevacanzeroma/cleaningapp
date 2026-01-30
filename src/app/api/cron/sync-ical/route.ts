/**
 * 🕐 CRON JOB - Sync automatico iCal v3.2 + Ordini Biancheria
 * 
 * FIX v3.2: Crea ordine biancheria anche se la pulizia esiste già ma l'ordine manca
 * 
 * LOGICA BIANCHERIA (da linenCalculator.ts):
 * - Matrimoniale: 3 lenzuola matrimoniali + 2 federe
 * - Singolo: 3 lenzuola singole + 1 federa
 * - Divano Letto: 3 lenzuola matrimoniali + 2 federe
 * - Castello: 6 lenzuola singole + 2 federe
 * - Bagno: 1 telo doccia + 1 telo viso + 1 telo bidet per ospite, 1 scendi bagno per bagno
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { getItemName } from "~/lib/itemNames";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || 'cleaningapp-cron-2024';

// ==================== CONFIGURAZIONE ====================

const CONFIG = {
  FETCH_TIMEOUT_MS: 30000,
  MAX_RETRIES: 2,
  DAYS_PAST_TO_KEEP: 30,
  BATCH_SIZE: 3,
  BATCH_DELAY_MS: 500,
};

// ==================== LOGICA BIANCHERIA (da linenCalculator.ts) ====================

interface LinenRequirement {
  lenzuoloMatrimoniale: number;
  lenzuoloSingolo: number;
  federa: number;
}

/**
 * Calcola biancheria per tipo di letto - REGOLE UFFICIALI
 */
function getLinenForBedType(bedType: string): LinenRequirement {
  switch (bedType) {
    case 'matr':
    case 'matrimoniale':
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'sing':
    case 'singolo':
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
    case 'divano':
    case 'divano_letto':
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'castello':
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 6, federa: 2 };
    default:
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
  }
}

/**
 * FALLBACK per proprietà senza letti configurati
 */
function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number): { id: string; name: string; quantity: number }[] {
  const items: { id: string; name: string; quantity: number }[] = [];
  
  const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
  const postiMatrimoniali = matrimonialiNeeded * 2;
  const singolariNeeded = Math.max(0, guestsCount - postiMatrimoniali);
  
  let totalLenzMatr = 0;
  let totalLenzSing = 0;
  let totalFedere = 0;
  
  for (let i = 0; i < matrimonialiNeeded; i++) {
    const req = getLinenForBedType('matr');
    totalLenzMatr += req.lenzuoloMatrimoniale;
    totalFedere += req.federa;
  }
  
  for (let i = 0; i < singolariNeeded; i++) {
    const req = getLinenForBedType('sing');
    totalLenzSing += req.lenzuoloSingolo;
    totalFedere += req.federa;
  }
  
  if (totalLenzMatr > 0) {
    items.push({ id: 'lenzuola_matrimoniale', name: 'Lenzuola Matrimoniale', quantity: totalLenzMatr });
  }
  if (totalLenzSing > 0) {
    items.push({ id: 'lenzuola_singolo', name: 'Lenzuola Singolo', quantity: totalLenzSing });
  }
  if (totalFedere > 0) {
    items.push({ id: 'federa', name: 'Federa', quantity: totalFedere });
  }
  
  items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Ospite/Bidet', quantity: guestsCount });
  
  if (bathrooms > 0) {
    items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  }
  
  return items;
}

/**
 * 🆕 Funzione per calcolare gli items biancheria per una proprietà
 */

function calculateLinenItemsForProperty(prop: any, guestsCount: number): { id: string; name: string; quantity: number }[] {
  let linenItems: { id: string; name: string; quantity: number }[] = [];
  
  // CASO 1: Ha serviceConfigs → usa quelli
  if (prop.serviceConfigs) {
    const config = prop.serviceConfigs[guestsCount];
    
    if (config) {
      if (config.bl) {
        Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
          if (typeof items === 'object') {
            Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
              if (typeof qty === 'number' && qty > 0) {
                const existing = linenItems.find(i => i.id === itemId);
                if (existing) {
                  existing.quantity += qty;
                } else {
                  linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                }
              }
            });
          }
        });
      }
      
      if (config.ba) {
        Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === 'number' && qty > 0) {
            linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
          }
        });
      }
      
      if (config.ki) {
        Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => {
          if (typeof qty === 'number' && qty > 0) {
            linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
          }
        });
      }
    }
  }
  
  // CASO 2: Fallback con logica CORRETTA da linenCalculator.ts
  if (linenItems.length === 0) {
    const bedrooms = prop.bedrooms || 1;
    const bathrooms = prop.bathrooms || 1;
    linenItems = calculateFallbackLinen(guestsCount, bedrooms, bathrooms);
  }
  
  return linenItems;
}

/**
 * 🆕 Funzione per creare un ordine biancheria
 */
async function createLinenOrder(
  cleaningId: string,
  prop: any,
  scheduledDate: Date,
  linenItems: { id: string; name: string; quantity: number }[]
): Promise<string | null> {
  if (linenItems.length === 0) return null;
  
  try {
    const orderRef = await addDoc(collection(db, 'orders'), {
      cleaningId: cleaningId,
      propertyId: prop.id,
      propertyName: prop.name,
      propertyAddress: prop.address || '',
      propertyCity: prop.city || '',
      propertyPostalCode: prop.postalCode || '',
      propertyFloor: prop.floor || '',
      propertyApartment: prop.apartment || '',
      propertyIntercom: prop.intercom || '',
      propertyDoorCode: prop.doorCode || '',
      propertyKeysLocation: prop.keysLocation || '',
      propertyAccessNotes: prop.accessNotes || '',
      status: 'PENDING',
      type: 'LINEN',
      scheduledDate: Timestamp.fromDate(scheduledDate),
      scheduledTime: prop.checkOutTime || '10:00',
      urgency: 'normal',
      items: linenItems,
      includePickup: true,
      pickupItems: [],
      pickupFromOrders: [],
      pickupCompleted: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    console.log(`📦 Ordine biancheria creato per ${prop.name} (cleaning: ${cleaningId})`);
    return orderRef.id;
  } catch (err) {
    console.error(`⚠️ Errore creazione ordine biancheria per ${prop.name}:`, err);
    return null;
  }
}

// ==================== UTILITIES ====================

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) & 0xffffffff;
  return Math.abs(h).toString(16);
}

function normalizeIcalForHash(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter(line => {
      const key = line.split(":")[0]?.split(";")[0]?.toUpperCase();
      return !['DTSTAMP', 'LAST-MODIFIED', 'CREATED', 'SEQUENCE', 'X-LIC-ERROR'].includes(key || '');
    })
    .join("\n");
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
  
  // 🔥 FIX: Booking.com usa "CLOSED - Not available" per le prenotazioni REALI!
  // Non sono blocchi, sono prenotazioni vere e proprie
  if (s === 'booking') {
    // Per Booking, "CLOSED - Not available" è una prenotazione, non un blocco
    // Consideriamo blocco solo se esplicitamente marcato come "owner block" o simile
    if (sum.includes('owner') || sum.includes('proprietario')) return true;
    return false;
  }
  
  if (['not available', 'blocked', 'closed', 'chiuso', 'non disponibile'].some(p => sum.includes(p))) return true;
  if (s === 'airbnb' && sum === 'reserved' && !e.description?.includes('/hosting/reservations/')) return true;
  return false;
}

function getGuestName(e: ICalEvent, s: string): string {
  const sum = e.summary?.toLowerCase() || '';
  
  // 🔥 FIX: Booking.com usa "CLOSED - Not available" per tutte le prenotazioni
  if (s === 'booking' && (sum.includes('closed') || sum.includes('not available'))) {
    return 'Ospite Booking';
  }
  
  if (['reserved', 'prenotazione'].includes(sum)) {
    return { airbnb: 'Ospite Airbnb', booking: 'Ospite Booking', oktorate: 'Ospite Oktorate', inreception: 'Ospite InReception', krossbooking: 'Ospite KrossBooking' }[s] || 'Prenotazione';
  }
  return e.summary || 'Ospite';
}

async function fetchIcal(url: string): Promise<string | null> {
  for (let i = 0; i < CONFIG.MAX_RETRIES; i++) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), CONFIG.FETCH_TIMEOUT_MS);
      const res = await fetch(url, { headers: { 'User-Agent': 'CleaningApp-Cron/3.2' }, signal: ctrl.signal });
      if (res.ok) return await res.text();
    } catch {}
    await sleep(2000);
  }
  return null;
}

function findExistingBooking(bookings: any[], e: ICalEvent, source: string): any {
  const byUid = bookings.find(b => b.icalUid === e.uid && b.source === source);
  if (byUid) return byUid;
  
  const byExactDates = bookings.find(b => {
    if (b.source !== source) return false;
    const ci = b.checkIn?.toDate?.();
    const co = b.checkOut?.toDate?.();
    return ci && co && isSameDay(ci, e.dtstart) && isSameDay(co, e.dtend);
  });
  if (byExactDates) return byExactDates;
  
  const byApproxDates = bookings.find(b => {
    if (b.icalUid || b.source !== source) return false;
    const ci = b.checkIn?.toDate?.();
    if (!ci) return false;
    return Math.abs(ci.getTime() - e.dtstart.getTime()) < 86400000 * 2;
  });
  
  return byApproxDates || null;
}

// ==================== MAIN ====================

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const urlSecret = req.nextUrl.searchParams.get('secret');
  const forceSync = req.nextUrl.searchParams.get('force') === 'true';
  
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  return runSync(forceSync);
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const body = await req.json().catch(() => ({}));
  
  if (authHeader !== `Bearer ${CRON_SECRET}` && body.secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  return runSync(body.force === true);
}

async function runSync(forceSync: boolean = false): Promise<NextResponse> {
  const start = Date.now();
  const stats = { synced: 0, skipped: 0, errors: 0, newBookings: 0, updated: 0, deleted: 0, cleanings: 0, removedLinks: 0, linenOrders: 0, missingOrdersFixed: 0 };
  
  console.log('\n🕐 CRON SYNC iCAL v3.2 - ' + new Date().toISOString() + (forceSync ? ' [FORCE]' : ''));
  
  try {
    const propsSnap = await getDocs(query(collection(db, 'properties'), where('status', '==', 'ACTIVE')));
    const properties = propsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const pastLimit = new Date();
    pastLimit.setDate(pastLimit.getDate() - CONFIG.DAYS_PAST_TO_KEEP);
    
    const ALL_SOURCES = ['airbnb', 'booking', 'oktorate', 'inreception', 'krossbooking'];
    
    for (let i = 0; i < properties.length; i += CONFIG.BATCH_SIZE) {
      await Promise.all(properties.slice(i, i + CONFIG.BATCH_SIZE).map(async (prop: any) => {
        try {
          const sourceToLink: Record<string, string> = {
            airbnb: prop.icalAirbnb || '',
            booking: prop.icalBooking || '',
            oktorate: prop.icalOktorate || '',
            inreception: prop.icalInreception || '',
            krossbooking: prop.icalKrossbooking || '',
          };
          
          const activeSources = ALL_SOURCES.filter(s => sourceToLink[s].trim() !== '');
          
          const [bookingsSnap, cleaningsSnap, ordersSnap] = await Promise.all([
            getDocs(query(collection(db, 'bookings'), where('propertyId', '==', prop.id))),
            getDocs(query(collection(db, 'cleanings'), where('propertyId', '==', prop.id))),
            getDocs(query(collection(db, 'orders'), where('propertyId', '==', prop.id))),
          ]);
          
          const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const existingOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          // 🔴 FIX v3.2: Mappa ordini per cleaningId per check duplicati più preciso
          const ordersByCleaningId = new Map<string, any>();
          const ordersByDateStr = new Map<string, any>();
          existingOrders.forEach(o => {
            if (o.cleaningId) {
              ordersByCleaningId.set(o.cleaningId, o);
            }
            const date = o.scheduledDate?.toDate?.();
            if (date) {
              const dateStr = date.toISOString().split('T')[0];
              ordersByDateStr.set(dateStr, o);
            }
          });
          
          // 🔴 FIX v3.2: Controlla pulizie esistenti senza ordini e crea gli ordini mancanti
          if (!prop.usesOwnLinen) {
            for (const cleaning of cleanings) {
              const cleaningDate = cleaning.scheduledDate?.toDate?.();
              if (!cleaningDate || cleaningDate < pastLimit) continue;
              
              // Status validi per creare ordine (non completate, non cancellate)
              const validStatuses = ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS'];
              if (!validStatuses.includes(cleaning.status)) continue;
              
              // Controlla se esiste già un ordine per questa pulizia
              const existingOrderByCleaningId = ordersByCleaningId.get(cleaning.id);
              const dateStr = cleaningDate.toISOString().split('T')[0];
              const existingOrderByDate = ordersByDateStr.get(dateStr);
              
              // Se non esiste ordine né per cleaningId né per data, crealo
              if (!existingOrderByCleaningId && !existingOrderByDate) {
                const guestsCount = cleaning.guestsCount || prop.maxGuests || 2;
                const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                
                if (linenItems.length > 0) {
                  const orderId = await createLinenOrder(cleaning.id, prop, cleaningDate, linenItems);
                  if (orderId) {
                    stats.missingOrdersFixed++;
                    // Aggiorna mappe per evitare duplicati nello stesso run
                    ordersByCleaningId.set(cleaning.id, { id: orderId });
                    ordersByDateStr.set(dateStr, { id: orderId });
                    console.log(`🔧 Ordine biancheria mancante creato per pulizia esistente: ${prop.name} (${dateStr})`);
                  }
                }
              }
            }
          }
          
          // 🔴 STEP 1: Elimina prenotazioni di source senza link
          for (const b of bookings) {
            if (!b.source) continue;
            const co = b.checkOut?.toDate?.();
            if (!co || co < pastLimit) continue;
            if (!activeSources.includes(b.source)) {
              await deleteDoc(doc(db, 'bookings', b.id));
              stats.removedLinks++;
            }
          }
          
          if (activeSources.length === 0) {
            stats.skipped++;
            return;
          }
          
          // 🟢 STEP 2: Sincronizza dai link attivi
          const hashes = prop.feedHashes || {};
          const processed = new Set<string>();
          
          const refreshedBookingsSnap = await getDocs(query(collection(db, 'bookings'), where('propertyId', '==', prop.id)));
          const refreshedBookings = refreshedBookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          for (const source of activeSources) {
            const url = sourceToLink[source];
            const data = await fetchIcal(url);
            if (!data) continue;
            
            const normalizedData = normalizeIcalForHash(data);
            const hash = simpleHash(normalizedData);
            
            // 🔥 Se forceSync=true, bypassa il check dell'hash e rielabora tutto
            if (!forceSync && hash === hashes[source]) {
              refreshedBookings.filter(b => b.source === source).forEach(b => processed.add(b.id));
              continue;
            }
            hashes[source] = hash;
            
            for (const e of parseICalData(data)) {
              if (isBlock(e, source) || e.dtend < pastLimit) continue;
              
              const existing = findExistingBooking(refreshedBookings, e, source);
              
              if (existing) {
                processed.add(existing.id);
                const ci = existing.checkIn?.toDate?.();
                const co = existing.checkOut?.toDate?.();
                if (!ci || !co || !isSameDay(ci, e.dtstart) || !isSameDay(co, e.dtend) || !existing.icalUid) {
                  await updateDoc(doc(db, 'bookings', existing.id), {
                    checkIn: Timestamp.fromDate(e.dtstart),
                    checkOut: Timestamp.fromDate(e.dtend),
                    icalUid: e.uid,
                    guestName: existing.guestName || getGuestName(e, source),
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
                
                // Aggiorna lista cleanings per questo run
                const refreshedCleaningsSnap = await getDocs(query(collection(db, 'cleanings'), where('propertyId', '==', prop.id)));
                const currentCleanings = refreshedCleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                
                // Crea pulizia se non esiste per questa data
                const existingCleaning = currentCleanings.find(c => 
                  isSameDay(c.scheduledDate?.toDate?.() || new Date(0), e.dtend)
                );
                
                if (!existingCleaning) {
                  const guestsCount = prop.maxGuests || 2;
                  const cleaningPrice = prop.cleaningPrice || 0;
                  
                  const cleaningRef = await addDoc(collection(db, 'cleanings'), {
                    propertyId: prop.id, 
                    propertyName: prop.name,
                    propertyAddress: prop.address || '',
                    scheduledDate: Timestamp.fromDate(e.dtend),
                    scheduledTime: prop.checkOutTime || '10:00',
                    status: 'SCHEDULED', 
                    bookingSource: source, 
                    bookingId: ref.id,
                    guestsCount: guestsCount,
                    guestName: getGuestName(e, source),
                    price: cleaningPrice,
                    contractPrice: cleaningPrice,
                    serviceType: 'STANDARD',
                    serviceTypeName: 'Pulizia Standard',
                    type: 'CHECKOUT',
                    createdAt: Timestamp.now(), 
                    updatedAt: Timestamp.now(),
                  });
                  stats.cleanings++;
                  
                  // 🔴 CREA ORDINE BIANCHERIA SE necessario
                  const orderDateStr = e.dtend.toISOString().split('T')[0];
                  const existingOrder = ordersByDateStr.get(orderDateStr) || ordersByCleaningId.get(cleaningRef.id);
                  
                  if (!prop.usesOwnLinen && !existingOrder) {
                    const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                    
                    if (linenItems.length > 0) {
                      const orderId = await createLinenOrder(cleaningRef.id, prop, e.dtend, linenItems);
                      if (orderId) {
                        stats.linenOrders++;
                        // Aggiorna mappe per evitare duplicati nello stesso run
                        ordersByCleaningId.set(cleaningRef.id, { id: orderId });
                        ordersByDateStr.set(orderDateStr, { id: orderId });
                      }
                    }
                  }
                } else {
                  // 🔴 FIX v3.2: Se la pulizia esiste ma l'ordine no, crea l'ordine
                  const orderDateStr = e.dtend.toISOString().split('T')[0];
                  const existingOrder = ordersByDateStr.get(orderDateStr) || ordersByCleaningId.get(existingCleaning.id);
                  
                  if (!prop.usesOwnLinen && !existingOrder) {
                    const guestsCount = existingCleaning.guestsCount || prop.maxGuests || 2;
                    const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                    
                    if (linenItems.length > 0) {
                      const orderId = await createLinenOrder(existingCleaning.id, prop, e.dtend, linenItems);
                      if (orderId) {
                        stats.missingOrdersFixed++;
                        ordersByCleaningId.set(existingCleaning.id, { id: orderId });
                        ordersByDateStr.set(orderDateStr, { id: orderId });
                        console.log(`🔧 Ordine mancante creato per pulizia esistente durante sync: ${prop.name} (${orderDateStr})`);
                      }
                    }
                  }
                }
              }
            }
          }
          
          // 🟡 STEP 3: Elimina prenotazioni non più nel feed
          for (const b of refreshedBookings) {
            if (processed.has(b.id)) continue;
            if (!b.source || !activeSources.includes(b.source)) continue;
            
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
          console.error(`❌ Errore sync ${prop.name}:`, e);
          stats.errors++;
        }
      }));
      
      await sleep(CONFIG.BATCH_DELAY_MS);
    }
    
    const duration = Date.now() - start;
    
    await addDoc(collection(db, 'syncLogs'), {
      type: 'CRON', timestamp: Timestamp.now(), duration, stats, success: true,
    });
    
    console.log(`✅ CRON v3.2: ${stats.synced} prop, +${stats.newBookings} agg:${stats.updated} -${stats.deleted} linen:${stats.linenOrders} fixed:${stats.missingOrdersFixed}, ${(duration/1000).toFixed(1)}s`);
    
    return NextResponse.json({ success: true, stats, duration });
    
  } catch (error: any) {
    console.error('❌ CRON errore:', error);
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}
