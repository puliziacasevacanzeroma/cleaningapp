/**
 * 🕐 CRON JOB - Sync automatico iCal v3.2 + Ordini Biancheria
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";
import { auditLog } from "~/lib/services/auditService";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

const CONFIG = {
  FETCH_TIMEOUT_MS: 8000,
  MAX_RETRIES: 1,
  DAYS_PAST_TO_KEEP: 30,
  BATCH_SIZE: 5,
  BATCH_DELAY_MS: 500,
};

// ==================== LOGICA BIANCHERIA ====================

interface LinenRequirement { lenzuoloMatrimoniale: number; lenzuoloSingolo: number; federa: number; }

function getLinenForBedType(bedType: string): LinenRequirement {
  switch (bedType) {
    case 'matr': case 'matrimoniale': return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'sing': case 'singolo': return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
    case 'divano': case 'divano_letto': return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'castello': return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 6, federa: 2 };
    default: return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
  }
}

function calculateFallbackLinen(guestsCount: number, bedrooms: number, bathrooms: number): { id: string; name: string; quantity: number }[] {
  const items: { id: string; name: string; quantity: number }[] = [];
  const matrimonialiNeeded = Math.min(bedrooms, Math.ceil(guestsCount / 2));
  const postiMatrimoniali = matrimonialiNeeded * 2;
  const singolariNeeded = Math.max(0, guestsCount - postiMatrimoniali);
  let totalLenzMatr = 0, totalLenzSing = 0, totalFedere = 0;
  for (let i = 0; i < matrimonialiNeeded; i++) { const req = getLinenForBedType('matr'); totalLenzMatr += req.lenzuoloMatrimoniale; totalFedere += req.federa; }
  for (let i = 0; i < singolariNeeded; i++) { const req = getLinenForBedType('sing'); totalLenzSing += req.lenzuoloSingolo; totalFedere += req.federa; }
  if (totalLenzMatr > 0) items.push({ id: 'doubleSheets', name: 'Lenzuola Matrimoniali', quantity: totalLenzMatr });
  if (totalLenzSing > 0) items.push({ id: 'singleSheets', name: 'Lenzuola Singole', quantity: totalLenzSing });
  if (totalFedere > 0) items.push({ id: 'pillowcases', name: 'Federe', quantity: totalFedere });
  items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Ospite/Bidet', quantity: guestsCount });
  if (bathrooms > 0) items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  return items;
}

// 🛡️ SAFETY NET: ID noti per lenzuola — usati come fallback se serviceConfig è incompleto
const LENZUOLA_MATR_IDS = ['doubleSheets', 'item_doubleSheets', 'lenzuola_matrimoniale'];
const LENZUOLA_SING_IDS = ['singleSheets', 'item_singleSheets', 'lenzuola_singolo'];
const FEDERE_IDS = ['pillowcases', 'item_pillowcases', 'federa'];

function hasItemByIds(items: { id: string }[], knownIds: string[]): boolean {
  return items.some(i => knownIds.includes(i.id) || knownIds.some(k => i.id.toLowerCase().includes(k.toLowerCase())));
}

function calculateLinenItemsForProperty(prop: any, guestsCount: number): { id: string; name: string; quantity: number }[] {
  let linenItems: { id: string; name: string; quantity: number }[] = [];
  if (prop.serviceConfigs) {
    const config = prop.serviceConfigs[guestsCount] || prop.serviceConfigs[String(guestsCount)];
    if (config) {
      if (config.bl) {
        const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
        if (hasAll) {
          Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
        } else {
          Object.entries(config.bl).forEach(([bedId, items]: [string, any]) => {
            if (bedId !== 'all' && typeof items === 'object') {
              Object.entries(items).forEach(([itemId, qty]: [string, any]) => {
                if (typeof qty === 'number' && qty > 0) {
                  const existing = linenItems.find(i => i.id === itemId);
                  if (existing) existing.quantity += qty;
                  else linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                }
              });
            }
          });
        }
      }
      if (config.ba) Object.entries(config.ba).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });
      if (config.ki) Object.entries(config.ki).forEach(([itemId, qty]: [string, any]) => { if (typeof qty === 'number' && qty > 0) linenItems.push({ id: itemId, name: getItemName(itemId), quantity: qty }); });

      // 🛡️ SAFETY NET: Verifica che la biancheria letto sia presente quando ha senso
      // Caso 1: Federe presenti ma lenzuola mancanti → config corrotta, bl['all'] incompleto
      // Caso 2: Solo ba/ki items ma zero bl items → bl era vuoto per race condition inventario
      const hasFedere = hasItemByIds(linenItems, FEDERE_IDS);
      const hasLenzMatr = hasItemByIds(linenItems, LENZUOLA_MATR_IDS);
      const hasLenzSing = hasItemByIds(linenItems, LENZUOLA_SING_IDS);
      const hasAnyBlItem = hasFedere || hasLenzMatr || hasLenzSing;
      const hasAnyBaKiItem = linenItems.length > 0 && !hasAnyBlItem;
      
      if ((hasFedere && !hasLenzMatr && !hasLenzSing) || (hasAnyBaKiItem && !hasAnyBlItem)) {
        console.warn(`⚠️ [SAFETY-NET] ${prop.name}: lenzuola MANCANTI in serviceConfig per ${guestsCount} ospiti (hasFedere=${hasFedere}, hasAnyBaKi=${hasAnyBaKiItem}) — inietto fallback`);
        const fallbackLinen = calculateFallbackLinen(guestsCount, prop.bedrooms || 1, prop.bathrooms || 1);
        for (const fb of fallbackLinen) {
          // Aggiungi tutti gli items biancheria letto mancanti dal fallback
          const isBlItem = fb.id === 'doubleSheets' || fb.id === 'singleSheets' || fb.id === 'pillowcases';
          const alreadyHas = linenItems.some(i => i.id === fb.id);
          if (isBlItem && !alreadyHas) {
            linenItems.push(fb);
          }
        }
      }
    }
  }
  if (linenItems.length === 0) linenItems = calculateFallbackLinen(guestsCount, prop.bedrooms || 1, prop.bathrooms || 1);
  return linenItems;
}

async function createLinenOrder(cleaningId: string, prop: any, scheduledDate: Date, linenItems: { id: string; name: string; quantity: number }[]): Promise<string | null> {
  if (linenItems.length === 0) return null;
  try {
    // Check 1: ordine già esistente per questo cleaningId
    const existingOrderSnap = await adminDb.collection('orders').where('cleaningId', '==', cleaningId).get();
    if (!existingOrderSnap.empty) {
      for (const orderDoc of existingOrderSnap.docs) {
        const order = orderDoc.data() as Record<string, any>;
        if (order.status !== 'CANCELLED') return orderDoc.id;
      }
      if (process.env.NODE_ENV !== "production") console.log(`ℹ️ Ordini esistenti per ${cleaningId} sono tutti CANCELLED, creo nuovo ordine`);
    }
    // Check 2: ordine già esistente per stessa proprietà + stessa data (anti-duplicato cross-cleaning)
    const dateStart = new Date(scheduledDate);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(scheduledDate);
    dateEnd.setUTCHours(23, 59, 59, 999);
    const existingByPropDate = await adminDb.collection('orders')
      .where('propertyId', '==', prop.id)
      .where('scheduledDate', '>=', Timestamp.fromDate(dateStart))
      .where('scheduledDate', '<=', Timestamp.fromDate(dateEnd))
      .limit(1).get();
    if (!existingByPropDate.empty) {
      const existOrder = existingByPropDate.docs[0];
      const existData = existOrder.data() as Record<string, any>;
      if (existData.status !== 'CANCELLED') {
        console.log(`📦 Ordine già presente per ${prop.name} data ${scheduledDate.toISOString().split('T')[0]} (order ${existOrder.id}) — skip creazione`);
        return existOrder.id;
      }
    }
    // Calcola pickup items usando Admin SDK (non client SDK — il cron è server-side)
    let pickupItems: { id: string; name: string; quantity: number }[] = [];
    let pickupFromOrders: string[] = [];
    try {
      const LINEN_KEYWORDS = ['lenzuol','feder','copri','telo','asciugaman','accappato','tappet','scendi','coperta','cuscin','singol','matrimonial','bagno','viso','bidet'];
      const EXCLUDE_KEYWORDS = ['sapone','shampoo','bagnoschiuma','crema','detersivo','spray','detergente','kit','cortesia'];
      const deliveredSnap = await adminDb.collection('orders')
        .where('propertyId', '==', prop.id)
        .where('status', '==', 'DELIVERED')
        .get();
      const pending = deliveredSnap.docs.filter(d => d.data().pickupCompleted !== true);
      if (pending.length > 0) {
        const itemMap = new Map<string, { id: string; name: string; quantity: number }>();
        pending.forEach(d => {
          const data = d.data() as Record<string, any>;
          pickupFromOrders.push(d.id);
          (data.items || []).forEach((item: any) => {
            const name = (item.name || '').toLowerCase();
            const isLinen = LINEN_KEYWORDS.some(k => name.includes(k)) && !EXCLUDE_KEYWORDS.some(k => name.includes(k));
            if (isLinen && item.quantity > 0) {
              const existing = itemMap.get(item.id);
              if (existing) existing.quantity += item.quantity;
              else itemMap.set(item.id, { id: item.id, name: item.name, quantity: item.quantity });
            }
          });
        });
        pickupItems = Array.from(itemMap.values());
      }
    } catch (pickupErr: any) {
      console.error(`⚠️ Errore calcolo pickup per ${prop.name}:`, pickupErr?.message);
      // Non bloccare — crea ordine senza pickup
    }
    const orderRef = await adminDb.collection('orders').add({
      cleaningId, propertyId: prop.id, propertyName: prop.name,
      propertyAddress: prop.address || '', propertyCity: prop.city || '',
      propertyPostalCode: prop.postalCode || '', propertyFloor: prop.floor || '',
      propertyApartment: prop.apartment || '', propertyIntercom: prop.intercom || '',
      propertyDoorCode: prop.doorCode || '', propertyKeysLocation: prop.keysLocation || '',
      propertyAccessNotes: prop.accessNotes || '',
      status: 'PENDING', type: 'LINEN',
      scheduledDate: Timestamp.fromDate(scheduledDate),
      scheduledTime: prop.checkOutTime || '10:00',
      urgency: 'normal', items: linenItems,
      includePickup: pickupItems.length > 0,
      pickupItems, pickupFromOrders,
      pickupCompleted: false, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
    if (process.env.NODE_ENV !== "production") console.log(`📦 Ordine biancheria creato per ${prop.name} (cleaning: ${cleaningId})`);
    return orderRef.id;
  } catch (err: any) {
    console.error(`⚠️ Errore createLinenOrder ${prop.name} (cleaning:${cleaningId}):`, err?.message || err);
    return null;
  }
}

// ==================== UTILITIES ====================

function simpleHash(str: string): string {
  // FNV-1a 32bit — meno collisioni di djb2
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0; // unsigned 32bit
  }
  // Includi lunghezza per ridurre ulteriormente le collisioni
  return h.toString(16) + '_' + str.length.toString(16);
}

function normalizeIcalForHash(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "")
    .split("\n").filter(line => {
      const key = line.split(":")[0]?.split(";")[0]?.toUpperCase();
      return !['DTSTAMP', 'LAST-MODIFIED', 'CREATED', 'SEQUENCE', 'X-LIC-ERROR'].includes(key || '');
    }).join("\n");
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getUTCFullYear() === d2.getUTCFullYear() && d1.getUTCMonth() === d2.getUTCMonth() && d1.getUTCDate() === d2.getUTCDate();
}

/**
 * 🔒 ANTI-DUPLICATO UNIVERSALE: cerca pulizia esistente per una data di checkout.
 * Copre TUTTI i casi: bookingId diretto, pulizia spostata (lockedFromSync), data esatta.
 * Usata in STEP 1.5, STEP 2 (existing booking), STEP 2 (new booking).
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
  //    originalScheduledDate corrisponde al checkout originale della prenotazione
  const byLocked = cleanings.find((c: any) => {
    if (c.lockedFromSync !== true || !c.originalScheduledDate) return false;
    const origD = c.originalScheduledDate?.toDate?.();
    if (!origD) return false;
    return origD.toISOString().split('T')[0] === checkoutDateStr;
  });
  if (byLocked) return byLocked;
  
  // 3. Data esatta scheduledDate — pulizia non spostata, stessa data di checkout
  const byDate = cleanings.find((c: any) => {
    const d = c.scheduledDate?.toDate?.();
    return d && isSameDay(d, checkoutDate);
  });
  if (byDate) return byDate;
  
  return null;
}

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
      // Skip prenotazioni con durata 0 o negativa (anomalie piattaforma)
      const durMs = e.dtend.getTime() - e.dtstart.getTime();
      if (durMs > 0) events.push(e as ICalEvent);
    }
  }
  return events;
}

function isBlock(e: ICalEvent, s: string): boolean {
  const sum = e.summary?.toLowerCase() || '';

  // 🔒 Booking.com: TUTTE le prenotazioni hanno summary "CLOSED - Not available"
  // Non è possibile distinguere blocchi da prenotazioni reali nel feed iCal di Booking.
  // Quindi NON filtrare MAI eventi Booking — sono tutti prenotazioni reali o blocchi
  // che corrispondono a prenotazioni su altre piattaforme (sincronizzate via channel manager).
  // Le eventuali duplicazioni vengono gestite dal cross-source matching in findExistingBooking.
  if (s === 'booking') return false;

  // Pattern blocco per gli altri source (Airbnb, Oktorate, etc.)
  const BLOCK_PATTERNS = ['not available', 'unavailable', 'blocked', 'closed', 'chiuso',
    'non disponibile', 'bloccata', 'bloccato', 'owner block', 'maintenance',
    'pulizie', 'manutenzione', 'owner', 'proprietario', 'stop sell', 'no vacancy'];
  if (BLOCK_PATTERNS.some(p => sum.includes(p))) return true;

  // Airbnb: "Reserved" senza link = blocco
  if (s === 'airbnb' && sum === 'reserved' && !e.description?.includes('/hosting/reservations/')) return true;

  return false;
}

function getGuestName(e: ICalEvent, s: string): string {
  const sum = e.summary?.toLowerCase() || '';
  // Nota: i blocchi Booking (closed/not available) vengono filtrati da isBlock prima di arrivare qui
  if (['reserved', 'prenotazione'].includes(sum)) {
    return { airbnb: 'Ospite Airbnb', booking: 'Ospite Booking', oktorate: 'Ospite Oktorate', inreception: 'Ospite InReception', krossbooking: 'Ospite KrossBooking' }[s] || 'Prenotazione';
  }
  // Octorate format: "Client Name (NomeCognome) Total (xxx) Period (...)"
  const octoMatch = e.summary?.match(/Client Name\s*\(([^)]+)\)/i);
  if (octoMatch) return octoMatch[1].trim();
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
    if (i < CONFIG.MAX_RETRIES - 1) await sleep(500);
  }
  return null;
}

function findExistingBooking(bookings: any[], e: ICalEvent, source: string): any {
  // 1. Match esatto per UID e source (caso normale)
  const byUid = bookings.find(b => b.icalUid === e.uid && b.source === source);
  if (byUid) return byUid;
  // 2. Match per date esatte stesso source
  const byExactDates = bookings.find(b => {
    if (b.source !== source) return false;
    const ci = b.checkIn?.toDate?.(), co = b.checkOut?.toDate?.();
    return ci && co && isSameDay(ci, e.dtstart) && isSameDay(co, e.dtend);
  });
  if (byExactDates) return byExactDates;
  // 3. Match cross-source: stesse date esatte da source diverso
  // Evita duplicati quando la stessa prenotazione appare in più feed
  // (es. Airbnb + Octorate che aggrega Airbnb)
  const byCrossSource = bookings.find(b => {
    if (b.source === source) return false; // già gestito sopra
    const ci = b.checkIn?.toDate?.(), co = b.checkOut?.toDate?.();
    return ci && co && isSameDay(ci, e.dtstart) && isSameDay(co, e.dtend);
  });
  if (byCrossSource) return byCrossSource; // stesso booking, source diverso → non duplicare
  // 4. Match approssimativo per date (UID cambiato da piattaforma)
  const byApproxDates = bookings.find(b => {
    if (b.icalUid || b.source !== source) return false;
    const ci = b.checkIn?.toDate?.();
    if (!ci) return false;
    return Math.abs(ci.getTime() - e.dtstart.getTime()) < 86400000 * 2;
  });
  if (byApproxDates) return byApproxDates;
  // 5. Match per checkIn stesso giorno, stesso source, UID diverso (UID rigenerato)
  const byCheckInWithDifferentUid = bookings.find(b => {
    if (b.source !== source || !b.icalUid) return false;
    const ci = b.checkIn?.toDate?.();
    if (!ci) return false;
    return isSameDay(ci, e.dtstart);
  });
  return byCheckInWithDifferentUid || null;
}

// ==================== HOLIDAY FEE ====================

function getHolidayFee(date: Date, basePrice: number, holidays: any[]): { fee: number; name: string | null } {
  const utcMonth = date.getUTCMonth() + 1;
  const utcDay = date.getUTCDate();
  const localMonth = date.getMonth() + 1;
  const localDay = date.getDate();

  for (const h of holidays) {
    if (!h.isActive) continue;
    let match = false;
    if (h.isRecurring && h.recurringMonth && h.recurringDay) {
      match = (utcMonth === h.recurringMonth && utcDay === h.recurringDay) ||
              (localMonth === h.recurringMonth && localDay === h.recurringDay);
    } else if (h.date) {
      const hd = h.date?.toDate?.() || (typeof h.date === 'string' ? new Date(h.date) : h.date);
      if (hd) {
        match = (hd.getUTCFullYear() === date.getUTCFullYear() && hd.getUTCMonth() === date.getUTCMonth() && hd.getUTCDate() === date.getUTCDate()) ||
                (hd.getFullYear() === date.getFullYear() && hd.getMonth() === date.getMonth() && hd.getDate() === date.getDate());
      }
    }
    if (match) {
      if (h.surchargeType === 'percentage' && h.surchargePercentage) {
        return { fee: Math.round(basePrice * (h.surchargePercentage / 100) * 100) / 100, name: h.name };
      } else if (h.surchargeType === 'fixed' && h.surchargeFixed) {
        return { fee: h.surchargeFixed, name: h.name };
      }
      return { fee: 0, name: h.name };
    }
  }
  return { fee: 0, name: null };
}

// ==================== MAIN ====================

/**
 * GET — Chiamato da cron-job.org ogni 30 minuti.
 * 
 * ARCHITETTURA SCALABILE (200+ proprietà):
 * cron-job.org ha timeout 30s, ma il sync può impiegare minuti.
 * Il GET risponde SUBITO con 200 OK e lancia il sync in background
 * chiamando il proprio POST endpoint internamente.
 * 
 * Il POST gira come request separata con maxDuration=300 (5 min),
 * indipendente dal timeout di cron-job.org.
 * 
 * Protezione anti-duplicato: se un sync è già in corso (lastIcalSync < 4 min),
 * il POST lo skippa automaticamente (logica già presente in runSync).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const urlSecret = req.nextUrl.searchParams.get('secret');
  const forceSync = req.nextUrl.searchParams.get('force') === 'true';
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // ?wait=true → esecuzione sincrona (per debug manuale nel browser)
  if (req.nextUrl.searchParams.get('wait') === 'true') {
    return runSync(forceSync);
  }
  
  // Lancia il sync in background via POST interno
  // USA LOCALHOST: Railway non può raggiungere il proprio URL pubblico dall'interno del container
  const baseUrl = 'http://localhost:' + (process.env.PORT || '3000');
  
  // Segna subito in Firestore che il sync è stato avviato (protezione anti-duplicato)
  try {
    await adminDb.collection('syncLogs').add({
      type: 'CRON_TRIGGER', timestamp: Timestamp.now(), trigger: 'GET', forceSync,
    });
  } catch {}
  
  // Fire-and-forget: il POST continuerà anche dopo che il GET ha risposto
  fetch(`${baseUrl}/api/cron/sync-ical`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ force: forceSync }),
    cache: 'no-store',
  }).catch(err => console.error('[CRON] Errore lancio sync POST:', err));
  
  // Risponde SUBITO a cron-job.org (~100ms)
  return NextResponse.json({ 
    success: true, 
    message: 'Sync avviato in background',
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST — Esegue il sync vero e proprio.
 * 
 * Chiamato dal GET interno o dal pulsante Sync nell'app.
 * Ha maxDuration=300 (5 min) — abbastanza per 200+ proprietà.
 * Non dipende dal timeout di cron-job.org.
 */
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
  if (process.env.NODE_ENV !== "production") console.log('\n🕐 CRON SYNC iCAL v3.2 - ' + new Date().toISOString() + (forceSync ? ' [FORCE]' : ''));

  try {
    const propsSnap = await adminDb.collection('properties').where('status', '==', 'ACTIVE').get();
    const properties = propsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

    // 🎉 Carica festività per maggiorazioni prezzo
    const holidaysSnap = await adminDb.collection('holidays').where('isActive', '==', true).get();
    const holidays = holidaysSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

    const pastLimit = new Date();
    pastLimit.setDate(pastLimit.getDate() - CONFIG.DAYS_PAST_TO_KEEP);

    const ALL_SOURCES = ['airbnb', 'booking', 'oktorate', 'inreception', 'krossbooking'];

    for (let i = 0; i < properties.length; i += CONFIG.BATCH_SIZE) {
      await Promise.all(properties.slice(i, i + CONFIG.BATCH_SIZE).map(async (prop: any) => {
        try {
          const sourceToLink: Record<string, string> = {
            airbnb: prop.icalAirbnb || '', booking: prop.icalBooking || '',
            oktorate: prop.icalOktorate || '', inreception: prop.icalInreception || '',
            krossbooking: prop.icalKrossbooking || '',
          };
          const activeSources = ALL_SOURCES.filter(s => sourceToLink[s].trim() !== '');

          const [bookingsSnap, cleaningsSnap, ordersSnap, exclusionsSnap] = await Promise.all([
            adminDb.collection('bookings').where('propertyId', '==', prop.id).get(),
            adminDb.collection('cleanings').where('propertyId', '==', prop.id).get(),
            adminDb.collection('orders').where('propertyId', '==', prop.id).get(),
            adminDb.collection('syncExclusions').where('propertyId', '==', prop.id).get(),
          ]);

          const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
          const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
          const existingOrders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

          const excludedDates = new Set<string>();
          exclusionsSnap.docs.forEach(d => {
            const data = d.data() as Record<string, any>;
            const origDate = data.originalDate?.toDate?.();
            if (origDate) excludedDates.add(origDate.toISOString().split('T')[0]);
          });

          const ordersByCleaningId = new Map<string, any>();
          const ordersByDateStr = new Map<string, any>();
          existingOrders.forEach(o => {
            // ⚠️ ESCLUDI CANCELLED: non bloccare la creazione di nuovi ordini
            if ((o as any).status === 'CANCELLED') return;
            // @ts-expect-error TODO-FIX: TS2339 Property 'cleaningId' does not exist on type '{ id: string; }'.
            if (o.cleaningId) ordersByCleaningId.set(o.cleaningId, o);
            // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
            const date = o.scheduledDate?.toDate?.();
            if (date) ordersByDateStr.set(date.toISOString().split('T')[0], o);
          });

          // FIX v3.2: Controlla pulizie esistenti senza ordini
          if (!prop.usesOwnLinen) {
            for (const cleaning of cleanings) {
              const c = cleaning as any;
              const cleaningDate = c.scheduledDate?.toDate?.();
              if (!cleaningDate || cleaningDate < pastLimit) continue;
              const validStatuses = ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS'];
              if (!validStatuses.includes(c.status)) continue;
              const dateStr = cleaningDate.toISOString().split('T')[0];
              if (excludedDates.has(dateStr)) continue;
              const existingOrderByCleaningId = ordersByCleaningId.get(c.id);
              const existingOrderByDate = ordersByDateStr.get(dateStr);
              
              // 🔥 FIX: Se l'ordine esistente è PRODUCTS-ONLY (solo prodotti pulizia),
              // dobbiamo aggiungere la biancheria, non saltare!
              const existingOrder = existingOrderByCleaningId || existingOrderByDate;
              const isProductsOnly = existingOrder && (existingOrder.type === 'PRODUCTS' || existingOrder.isProductsOnly === true);
              const hasNoLinenItems = existingOrder && (existingOrder.items || []).every((item: any) => 
                item.type === 'cleaning_product' || item.categoryId === 'prodotti_pulizia'
              );
              
              if (!existingOrder || (isProductsOnly || hasNoLinenItems)) {
                const guestsCount = c.guestsCount || prop.maxGuests || 2;
                const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                if (linenItems.length > 0) {
                  if (existingOrder && (isProductsOnly || hasNoLinenItems)) {
                    // MERGE: aggiungi biancheria all'ordine prodotti esistente
                    console.log(`📦 [SAFETY-NET] Ordine ${existingOrder.id} è products-only per ${prop.name} — aggiungo biancheria`);
                    const existingItems = existingOrder.items || [];
                    const mergedItems = [...linenItems, ...existingItems];
                    try {
                      await adminDb.collection('orders').doc(existingOrder.id).update({
                        items: mergedItems,
                        type: 'LINEN',
                        isProductsOnly: false,
                        guestsCount,
                        updatedAt: Timestamp.now(),
                      });
                      stats.missingOrdersFixed++;
                      console.log(`📦 [SAFETY-NET] ✅ Biancheria aggiunta a ordine ${existingOrder.id} per ${prop.name}`);
                      auditLog.safetyNetTriggered({ cleaningId: c.id, propertyId: prop.id, propertyName: prop.name, scheduledDate: dateStr, result: 'merged', orderId: existingOrder.id });
                    } catch (mergeErr: any) {
                      console.error(`⚠️ [SAFETY-NET] Errore merge biancheria ordine ${existingOrder.id}:`, mergeErr?.message);
                    }
                  } else {
                    // CREA: nessun ordine esistente
                    console.log(`📦 [SAFETY-NET] Pulizia ${c.id} (${prop.name}, ${dateStr}) senza ordine — tento creazione`);
                    console.log(`📦 [SAFETY-NET] ${linenItems.length} items calcolati per ${prop.name} (${guestsCount} ospiti) — chiamo createLinenOrder`);
                    const orderId = await createLinenOrder(c.id, prop, cleaningDate, linenItems);
                    if (orderId) {
                      stats.missingOrdersFixed++;
                      ordersByCleaningId.set(c.id, { id: orderId });
                      ordersByDateStr.set(dateStr, { id: orderId });
                      try {
                        await adminDb.collection('cleanings').doc(c.id).update({
                          laundryOrderId: orderId,
                          requiresLaundry: true,
                          updatedAt: Timestamp.now(),
                        });
                      } catch {}
                      console.log(`📦 [SAFETY-NET] ✅ Ordine ${orderId} creato per ${prop.name} data ${dateStr}`);
                      auditLog.safetyNetTriggered({ cleaningId: c.id, propertyId: prop.id, propertyName: prop.name, scheduledDate: dateStr, result: 'created', orderId });
                    } else {
                      console.error(`⚠️ [SAFETY-NET] createLinenOrder ritornato NULL per ${prop.name} cleaning:${c.id} data:${dateStr}`);
                      auditLog.safetyNetTriggered({ cleaningId: c.id, propertyId: prop.id, propertyName: prop.name, scheduledDate: dateStr, result: 'failed', error: 'createLinenOrder returned null' });
                    }
                  }
                } else {
                  console.error(`⚠️ [SAFETY-NET] linenItems vuoto per ${prop.name} cleaning:${c.id} guestsCount:${guestsCount}`);
                  auditLog.safetyNetTriggered({ cleaningId: c.id, propertyId: prop.id, propertyName: prop.name, scheduledDate: dateStr, result: 'failed', error: `linenItems empty (guests=${guestsCount})` });
                }
              }
            }
          }

          // STEP 1: Elimina prenotazioni di source senza link (solo future da domani)
          // Le prenotazioni passate E quelle con checkout oggi non si toccano mai
          // Usa UTC per coerenza con le date iCal (parsate in UTC)
          const step1Protect = new Date();
          step1Protect.setUTCDate(step1Protect.getUTCDate() + 1);
          step1Protect.setUTCHours(0, 0, 0, 0);
          for (const b of bookings as any[]) {
            if (!b.source) continue;
            if (b.isManual === true || b.source === 'manual' || b.source === 'direct' || b.source === 'phone') continue;
            if (b.historicBooking === true) continue; // mai cancellare storici
            const co = b.checkOut?.toDate?.();
            if (!co) continue;
            // Checkout oggi o passato: non toccare mai
            if (co < step1Protect) continue;
            if (!activeSources.includes(b.source)) {
              await adminDb.collection('bookings').doc(b.id).delete();
              stats.removedLinks++;
            }
          }

          if (activeSources.length === 0) { stats.skipped++; return; }

          // STEP 1.5: Verifica pulizie mancanti per prenotazioni esistenti
          const isBlockedName = (name: string, src?: string): boolean => {
            if (!name) return false;
            if (src === 'booking') return false;
            const lower = name.toLowerCase();
            return ['not available', 'no vacancy', 'stop sell', 'bloccata', 'bloccato', 'blocked', 'unavailable', 'chiuso', 'non disponibile', 'imported', 'closed', 'maintenance', 'owner'].some(p => lower.includes(p));
          };

          for (const b of bookings as any[]) {
            if (!b.source) continue;
            if (b.isManual === true || b.source === 'manual' || b.source === 'direct' || b.source === 'phone') continue;
            if (b.status === 'CANCELLED') continue;
            if (isBlockedName(b.guestName || '', b.source)) continue;
            const coDate = b.checkOut?.toDate?.();
            if (!coDate || coDate < pastLimit) continue;
            // 🔒 ANTI-DUPLICATO: usa funzione universale che copre bookingId, lockedFromSync, data
            const existingCleaning = findExistingCleaningForCheckout(cleanings, coDate, b.id);
            const coDateStr = coDate.toISOString().split('T')[0];
            if (excludedDates.has(coDateStr)) continue;
            if (existingCleaning) {
              console.log(`[STEP1.5] Pulizia trovata per booking ${b.id} (cleaning ${existingCleaning.id}) — skip`);
            }
            if (!existingCleaning) {
              // 🔒 ANTI-DUPLICATO DB: verifica direttamente su Firestore prima di creare
              const coDateStart = new Date(coDate);
              coDateStart.setUTCHours(0, 0, 0, 0);
              const coDateEnd = new Date(coDate);
              coDateEnd.setUTCHours(23, 59, 59, 999);
              const existingCleaningDb = await adminDb.collection('cleanings')
                .where('propertyId', '==', prop.id)
                .where('scheduledDate', '>=', Timestamp.fromDate(coDateStart))
                .where('scheduledDate', '<=', Timestamp.fromDate(coDateEnd))
                .limit(1).get();
              if (!existingCleaningDb.empty) {
                // Pulizia già esiste per questa data (creata da altro booking/source) → aggiorna bookingId e skip
                const existDoc = existingCleaningDb.docs[0];
                const existData = existDoc.data() as Record<string, any>;
                if (!existData.bookingId) {
                  await adminDb.collection('cleanings').doc(existDoc.id).update({ bookingId: b.id, updatedAt: Timestamp.now() });
                }
                console.log(`[STEP1.5] Pulizia già presente in DB per ${prop.name} data ${coDateStr} (cleaning ${existDoc.id}) — skip`);
                continue;
              }
              const guestsCount = b.guests || b.guestsCount || prop.maxGuests || 2;
              const cleaningPrice = prop.cleaningPrice || 0;
              const hol1 = getHolidayFee(coDate, cleaningPrice, holidays);
              const cleaningRef = await adminDb.collection('cleanings').add({
                propertyId: prop.id, propertyName: prop.name, propertyAddress: prop.address || '',
                scheduledDate: Timestamp.fromDate(coDate), scheduledTime: prop.checkOutTime || '10:00',
                status: 'SCHEDULED', bookingSource: b.source, bookingId: b.id,
                guestsCount, guestName: b.guestName || 'Ospite', price: cleaningPrice,
                contractPrice: cleaningPrice, serviceType: 'STANDARD', serviceTypeName: 'Pulizia Standard',
                type: 'CHECKOUT', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                hasLinenOrder: !prop.usesOwnLinen,
                ...(hol1.fee > 0 ? { holidayFee: hol1.fee, holidayName: hol1.name } : {}),
              });
              stats.cleanings++;
              cleanings.push({ id: cleaningRef.id, scheduledDate: Timestamp.fromDate(coDate), status: 'SCHEDULED' } as any);
              auditLog.cleaningCreated({ cleaningId: cleaningRef.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP1.5', scheduledDate: coDateStr, bookingId: b.id, guestsCount, guestName: b.guestName });
              if (!prop.usesOwnLinen) {
                const existingOrder = ordersByDateStr.get(coDateStr) || ordersByCleaningId.get(cleaningRef.id);
                if (!existingOrder) {
                  const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                  if (linenItems.length > 0) {
                    const orderId = await createLinenOrder(cleaningRef.id, prop, coDate, linenItems);
                    if (orderId) {
                      stats.linenOrders++; ordersByCleaningId.set(cleaningRef.id, { id: orderId }); ordersByDateStr.set(coDateStr, { id: orderId }); await adminDb.collection('cleanings').doc(cleaningRef.id).update({ laundryOrderId: orderId, requiresLaundry: true });
                      auditLog.orderCreated({ orderId, cleaningId: cleaningRef.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP1.5', scheduledDate: coDateStr, itemsCount: linenItems.length });
                    } else {
                      auditLog.orderFailed({ cleaningId: cleaningRef.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP1.5', scheduledDate: coDateStr, error: 'createLinenOrder returned null' });
                    }
                  } else {
                    auditLog.orderFailed({ cleaningId: cleaningRef.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP1.5', scheduledDate: coDateStr, error: 'linenItems empty' });
                  }
                }
              }
            }
          }

          // STEP 2: Sincronizza dai link attivi
          // Anti-race condition: se sync recente (< 4 min) e non forceSync → skip
          // Evita che due istanze del cron creino dati duplicati
          if (!forceSync && prop.lastIcalSync) {
            const lastSync = prop.lastIcalSync.toDate?.() || new Date(0);
            const minutesSinceLastSync = (Date.now() - lastSync.getTime()) / 60000;
            if (minutesSinceLastSync < 4) {
              stats.skipped++;
              return;
            }
          }

          const hashes = prop.feedHashes || {};
          const processed = new Set<string>();

          const refreshedBookingsSnap = await adminDb.collection('bookings').where('propertyId', '==', prop.id).get();
          const refreshedBookings = refreshedBookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

          for (const source of activeSources) {
            const url = sourceToLink[source];
            const data = await fetchIcal(url);
            if (!data) {
              // 🔒 Feed non raggiungibile — proteggi tutte le prenotazioni di questo source
              refreshedBookings.filter((b: any) => b.source === source).forEach((b: any) => processed.add(b.id));
              continue;
            }
            const normalizedData = normalizeIcalForHash(data);
            const hash = simpleHash(normalizedData);
            if (!forceSync && hash === hashes[source]) {
              refreshedBookings.filter((b: any) => b.source === source).forEach((b: any) => processed.add(b.id));
              continue;
            }
            hashes[source] = hash;

            // 🔒 Booking.com: filtra "contenitori" — eventi che contengono completamente altri eventi
            // Es: "CLOSED 18/03→01/05" che copre "CLOSED 23/03→27/03" = il primo è un blocco proprietario
            let events = parseICalData(data);
            if (source === 'booking') {
              const containerIds = new Set<string>();
              for (const outer of events) {
                for (const inner of events) {
                  if (outer.uid === inner.uid) continue;
                  if (outer.dtstart.getTime() <= inner.dtstart.getTime() && 
                      outer.dtend.getTime() >= inner.dtend.getTime() &&
                      !(outer.dtstart.getTime() === inner.dtstart.getTime() && outer.dtend.getTime() === inner.dtend.getTime())) {
                    containerIds.add(outer.uid);
                    break;
                  }
                }
              }
              if (containerIds.size > 0) {
                events = events.filter(e => !containerIds.has(e.uid));
              }
            }

            for (const e of events) {
              if (isBlock(e, source) || e.dtend < pastLimit) continue;
              const existing = findExistingBooking(refreshedBookings, e, source);
              if (existing) {
                processed.add(existing.id);
                const ci = existing.checkIn?.toDate?.(), co = existing.checkOut?.toDate?.();

                // 🔒 ANTI-DUPLICATO: usa funzione universale
                // Cerca sia per bookingId, sia per lockedFromSync+originalScheduledDate, sia per data
                // Inoltre: cerca ANCHE per la data dell'iCal (e.dtend), non solo per co (checkout nel DB)
                // perché co potrebbe essere diversa da e.dtend se il booking non è ancora stato aggiornato
                const cleaningForBooking = findExistingCleaningForCheckout(cleanings, co || e.dtend, existing.id)
                  || (co && !isSameDay(co, e.dtend) ? findExistingCleaningForCheckout(cleanings, e.dtend, existing.id) : null);
                
                if (!cleaningForBooking) {
                  const coDateStr2 = co ? co.toISOString().split('T')[0] : '';
                  const icalDateStr = e.dtend.toISOString().split('T')[0];
                  console.log(`[SYNC-DEBUG] Nessuna pulizia per booking ${existing.id} — coDateStr2=${coDateStr2} icalDate=${icalDateStr} excluded=${excludedDates.has(coDateStr2) || excludedDates.has(icalDateStr)}`);
                  // 🔒 Controlla excludedDates sia per data DB che per data iCal
                  if (coDateStr2 && !excludedDates.has(coDateStr2) && !excludedDates.has(icalDateStr) && co && co >= pastLimit) {
                    // 🔒 ANTI-DUPLICATO DB: verifica direttamente su Firestore
                    const cDateStart = new Date(co);
                    cDateStart.setUTCHours(0, 0, 0, 0);
                    const cDateEnd = new Date(co);
                    cDateEnd.setUTCHours(23, 59, 59, 999);
                    const existingCleaningDb2 = await adminDb.collection('cleanings')
                      .where('propertyId', '==', prop.id)
                      .where('scheduledDate', '>=', Timestamp.fromDate(cDateStart))
                      .where('scheduledDate', '<=', Timestamp.fromDate(cDateEnd))
                      .limit(1).get();
                    if (!existingCleaningDb2.empty) {
                      const existDoc2 = existingCleaningDb2.docs[0];
                      console.log(`[SYNC-DEBUG] Pulizia già in DB per ${prop.name} data ${coDateStr2} (cleaning ${existDoc2.id}) — skip`);
                    } else {
                    console.log(`[SYNC-DEBUG] CREO pulizia per booking ${existing.id} data ${coDateStr2}`);
                    const guestsCount2 = existing.guests || prop.maxGuests || 2;
                    const cp2 = prop.cleaningPrice || 0;
                    const hol2 = getHolidayFee(co, cp2, holidays);
                    const cleaningRef2 = await adminDb.collection('cleanings').add({
                      propertyId: prop.id, propertyName: prop.name, propertyAddress: prop.address || '',
                      scheduledDate: Timestamp.fromDate(co), scheduledTime: prop.checkOutTime || '10:00',
                      status: 'SCHEDULED', bookingSource: source, bookingId: existing.id,
                      guestsCount: guestsCount2, guestName: existing.guestName || getGuestName(e, source),
                      price: cp2, contractPrice: cp2,
                      serviceType: 'STANDARD', serviceTypeName: 'Pulizia Standard',
                      type: 'CHECKOUT', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                      hasLinenOrder: !prop.usesOwnLinen,
                      ...(hol2.fee > 0 ? { holidayFee: hol2.fee, holidayName: hol2.name } : {}),
                    });
                    stats.cleanings++;
                    cleanings.push({ id: cleaningRef2.id, scheduledDate: Timestamp.fromDate(co), status: 'SCHEDULED', bookingId: existing.id } as any);
                    console.log(`[SYNC-DEBUG] Pulizia creata: ${cleaningRef2.id}`);
                    auditLog.cleaningCreated({ cleaningId: cleaningRef2.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP2-existing', scheduledDate: coDateStr2, bookingId: existing.id, guestsCount: guestsCount2, guestName: existing.guestName });
                    // 📦 Crea ordine biancheria (era mancante — causa ordini non creati)
                    if (!prop.usesOwnLinen) {
                      const orderDateStr2 = co.toISOString().split('T')[0];
                      const existingOrder2 = ordersByDateStr.get(orderDateStr2) || ordersByCleaningId.get(cleaningRef2.id);
                      if (!existingOrder2 && !excludedDates.has(orderDateStr2)) {
                        const linenItems2 = calculateLinenItemsForProperty(prop, guestsCount2);
                        if (linenItems2.length > 0) {
                          const orderId2 = await createLinenOrder(cleaningRef2.id, prop, co, linenItems2);
                          if (orderId2) {
                            stats.linenOrders++;
                            ordersByCleaningId.set(cleaningRef2.id, { id: orderId2 });
                            ordersByDateStr.set(orderDateStr2, { id: orderId2 });
                            await adminDb.collection('cleanings').doc(cleaningRef2.id).update({ laundryOrderId: orderId2, requiresLaundry: true });
                            console.log(`📦 [STEP2-FIX] Ordine biancheria creato per ${prop.name} data ${orderDateStr2} (order ${orderId2})`);
                            auditLog.orderCreated({ orderId: orderId2, cleaningId: cleaningRef2.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP2-existing', scheduledDate: orderDateStr2, itemsCount: linenItems2.length });
                          } else {
                            auditLog.orderFailed({ cleaningId: cleaningRef2.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP2-existing', scheduledDate: orderDateStr2, error: 'createLinenOrder returned null' });
                          }
                        } else {
                          auditLog.orderFailed({ cleaningId: cleaningRef2.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP2-existing', scheduledDate: orderDateStr2, error: 'linenItems empty' });
                        }
                      }
                    }
                    } // close else (no existing cleaning in DB)
                  }
                } else {
                  console.log(`[SYNC-DEBUG] Pulizia esistente trovata per booking ${existing.id} (cleaning ${cleaningForBooking.id}, locked=${cleaningForBooking.lockedFromSync}) — skip creazione`);
                }

                if (!ci || !co || !isSameDay(ci, e.dtstart) || !isSameDay(co, e.dtend) || !existing.icalUid) {
                  const nowUpdate = new Date();
                  await adminDb.collection('bookings').doc(existing.id).update({
                    checkIn: Timestamp.fromDate(e.dtstart), checkOut: Timestamp.fromDate(e.dtend),
                    icalUid: e.uid, guestName: existing.guestName || getGuestName(e, source), updatedAt: Timestamp.now(),
                    historicBooking: e.dtstart < nowUpdate || e.dtend < nowUpdate,
                  });
                  stats.updated++;
                  if (co && !isSameDay(co, e.dtend)) {
                    const cleaningsForBookingSnap = await adminDb.collection('cleanings').where('bookingId', '==', existing.id).get();
                    for (const cDoc of cleaningsForBookingSnap.docs) {
                      const cData = cDoc.data() as Record<string, any>;
                      if (cData.status === 'COMPLETED' || cData.status === 'IN_PROGRESS') continue;
                      
                      // 🔒 PROTEZIONE: se la pulizia è stata spostata manualmente dall'utente,
                      // NON sovrascrivere la data — l'utente ha fatto una scelta consapevole.
                      // Aggiorna solo originalScheduledDate così il cron sa qual è il nuovo checkout.
                      if (cData.lockedFromSync === true) {
                        console.log(`[SYNC-DEBUG] Pulizia ${cDoc.id} lockedFromSync — checkout cambiato da ${co.toISOString().split('T')[0]} a ${e.dtend.toISOString().split('T')[0]} ma NON sposto (lock utente). Aggiorno solo originalScheduledDate.`);
                        await adminDb.collection('cleanings').doc(cDoc.id).update({
                          // Aggiorna originalScheduledDate al nuovo checkout
                          // così il cron saprà riconoscere questa pulizia nella prossima esecuzione
                          originalScheduledDate: Timestamp.fromDate(e.dtend),
                          updatedAt: Timestamp.now(),
                        });
                        continue;
                      }
                      
                      // Pulizia NON bloccata → aggiorna data al nuovo checkout
                      await adminDb.collection('cleanings').doc(cDoc.id).update({
                        scheduledDate: Timestamp.fromDate(e.dtend),
                        originalScheduledDate: Timestamp.fromDate(e.dtend),
                        updatedAt: Timestamp.now(),
                      });
                      // Aggiorna anche l'ordine biancheria collegato
                      if (cData.laundryOrderId) {
                        try {
                          await adminDb.collection('orders').doc(cData.laundryOrderId).update({
                            scheduledDate: Timestamp.fromDate(e.dtend),
                            updatedAt: Timestamp.now(),
                          });
                        } catch {}
                      }
                      // Notifica operatore se la pulizia era già assegnata
                      if (cData.status === 'ASSIGNED' && cData.assignedTo) {
                        try {
                          await adminDb.collection('notifications').add({
                            title: '📅 Data pulizia modificata',
                            message: `La pulizia di ${prop.name} è stata spostata al ${e.dtend.toLocaleDateString('it-IT')} (prenotazione ${existing.guestName || 'ospite'} ha cambiato le date).`,
                            type: 'INFO',
                            recipientRole: 'OPERATORE',
                            recipientId: cData.assignedTo,
                            senderId: 'system',
                            senderName: 'Sync iCal',
                            status: 'UNREAD',
                            createdAt: Timestamp.now(),
                            updatedAt: Timestamp.now(),
                          });
                        } catch {}
                      }
                    }
                  }
                }
              } else {
                const nowCreate = new Date();
                // Anti-duplicato: verifica che il booking non esista già nel DB (protezione race condition)
                const existingCheck = await adminDb.collection('bookings')
                  .where('propertyId', '==', prop.id)
                  .where('icalUid', '==', e.uid)
                  .where('source', '==', source)
                  .limit(1)
                  .get();
                
                if (!existingCheck.empty) {
                  // Booking già esiste (creato da altra istanza) → usa quello esistente
                  processed.add(existingCheck.docs[0].id);
                  continue;
                }

                const ref = await adminDb.collection('bookings').add({
                  propertyId: prop.id, propertyName: prop.name, guestName: getGuestName(e, source),
                  checkIn: Timestamp.fromDate(e.dtstart), checkOut: Timestamp.fromDate(e.dtend),
                  source, icalUid: e.uid, status: 'CONFIRMED', guests: prop.maxGuests || 2,
                  historicBooking: e.dtstart < nowCreate || e.dtend < nowCreate,
                  createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                });
                stats.newBookings++;
                processed.add(ref.id);

                // 🔒 ANTI-DUPLICATO: prima controlla excludedDates (pulizia spostata = data esclusa)
                const icalDateStr = e.dtend.toISOString().split('T')[0];
                if (excludedDates.has(icalDateStr)) {
                  console.log(`[SYNC-DEBUG] Nuovo booking ${ref.id} ma data ${icalDateStr} in excludedDates — skip creazione pulizia`);
                  continue;
                }

                const refreshedCleaningsSnap = await adminDb.collection('cleanings').where('propertyId', '==', prop.id).get();
                const currentCleanings = refreshedCleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
                
                // 🔒 ANTI-DUPLICATO: usa funzione universale che copre:
                // - bookingId diretto (ref.id — il nuovo booking appena creato)
                // - lockedFromSync + originalScheduledDate (pulizia spostata dall'utente)
                // - data esatta scheduledDate
                const existingCleaning = findExistingCleaningForCheckout(currentCleanings, e.dtend, ref.id);

                if (!existingCleaning) {
                  // Anti-duplicato: verifica DB diretto prima di creare pulizia (race condition)
                  const cleaningDateStart = new Date(e.dtend);
                  cleaningDateStart.setUTCHours(0, 0, 0, 0);
                  const cleaningDateEnd = new Date(e.dtend);
                  cleaningDateEnd.setUTCHours(23, 59, 59, 999);
                  const existingCleaningCheck = await adminDb.collection('cleanings')
                    .where('propertyId', '==', prop.id)
                    .where('scheduledDate', '>=', Timestamp.fromDate(cleaningDateStart))
                    .where('scheduledDate', '<=', Timestamp.fromDate(cleaningDateEnd))
                    .limit(1).get();
                  if (!existingCleaningCheck.empty) {
                    // Pulizia già esiste per questa data (creata da altra istanza) → aggiorna solo bookingId
                    await adminDb.collection('cleanings').doc(existingCleaningCheck.docs[0].id).update({
                      bookingId: ref.id, updatedAt: Timestamp.now()
                    });
                    continue;
                  }
                  const guestsCount = prop.maxGuests || 2;
                  const cleaningPrice = prop.cleaningPrice || 0;
                  const hol3 = getHolidayFee(e.dtend, cleaningPrice, holidays);
                  const cleaningRef = await adminDb.collection('cleanings').add({
                    propertyId: prop.id, propertyName: prop.name, propertyAddress: prop.address || '',
                    scheduledDate: Timestamp.fromDate(e.dtend), scheduledTime: prop.checkOutTime || '10:00',
                    status: 'SCHEDULED', bookingSource: source, bookingId: ref.id,
                    guestsCount, guestName: getGuestName(e, source), price: cleaningPrice,
                    contractPrice: cleaningPrice, serviceType: 'STANDARD', serviceTypeName: 'Pulizia Standard',
                    type: 'CHECKOUT', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                    hasLinenOrder: !prop.usesOwnLinen,
                    ...(hol3.fee > 0 ? { holidayFee: hol3.fee, holidayName: hol3.name } : {}),
                  });
                  stats.cleanings++;
                  auditLog.cleaningCreated({ cleaningId: cleaningRef.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP2-new', scheduledDate: e.dtend.toISOString().split('T')[0], bookingId: ref.id, guestsCount, guestName: getGuestName(e, source) });
                  const orderDateStr = e.dtend.toISOString().split('T')[0];
                  const existingOrder = ordersByDateStr.get(orderDateStr) || ordersByCleaningId.get(cleaningRef.id);
                  if (!prop.usesOwnLinen && !existingOrder && !excludedDates.has(orderDateStr)) {
                    const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                    if (linenItems.length > 0) {
                      const orderId = await createLinenOrder(cleaningRef.id, prop, e.dtend, linenItems);
                      if (orderId) {
                        stats.linenOrders++; ordersByCleaningId.set(cleaningRef.id, { id: orderId }); ordersByDateStr.set(orderDateStr, { id: orderId });
                        await adminDb.collection('cleanings').doc(cleaningRef.id).update({ laundryOrderId: orderId, requiresLaundry: true });
                        auditLog.orderCreated({ orderId, cleaningId: cleaningRef.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP2-new', scheduledDate: orderDateStr, itemsCount: linenItems.length });
                      } else {
                        auditLog.orderFailed({ cleaningId: cleaningRef.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP2-new', scheduledDate: orderDateStr, error: 'createLinenOrder returned null' });
                      }
                    } else {
                      auditLog.orderFailed({ cleaningId: cleaningRef.id, propertyId: prop.id, propertyName: prop.name, source: 'cron/sync-ical:STEP2-new', scheduledDate: orderDateStr, error: 'linenItems empty' });
                    }
                  }
                } else {
                  const orderDateStr = e.dtend.toISOString().split('T')[0];
                  const existingOrder = ordersByDateStr.get(orderDateStr) || ordersByCleaningId.get((existingCleaning as any).id);
                  
                  // Aggiorna guestName se la pulizia esistente ha un nome generico
                  const currentGuestName = (existingCleaning as any).guestName || '';
                  const newGuestName = getGuestName(e, source);
                  const isGenericName = ['ospite', 'ospite airbnb', 'ospite booking', 'ospite oktorate', 'ospite inreception', 'ospite krossbooking', 'prenotazione'].includes(currentGuestName.toLowerCase());
                  if (isGenericName && newGuestName && !isGenericName) {
                    try {
                      await adminDb.collection('cleanings').doc((existingCleaning as any).id).update({
                        guestName: newGuestName,
                        bookingId: (existingCleaning as any).bookingId || ref?.id,
                        bookingSource: source,
                        updatedAt: Timestamp.now(),
                      });
                    } catch {}
                  }
                  
                  if (!prop.usesOwnLinen && !existingOrder && !excludedDates.has(orderDateStr)) {
                    // 🔥 FIX ANTI-DUPLICATO: verifica direttamente su Firestore (le mappe locali possono essere stale)
                    const directCheck = await adminDb.collection('orders')
                      .where('cleaningId', '==', (existingCleaning as any).id)
                      .limit(1).get();
                    const hasNonCancelledOrder = !directCheck.empty && directCheck.docs.some(d => d.data().status !== 'CANCELLED');
                    
                    if (!hasNonCancelledOrder) {
                    const guestsCount = (existingCleaning as any).guestsCount || prop.maxGuests || 2;
                    const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                    if (linenItems.length > 0) {
                      const orderId = await createLinenOrder((existingCleaning as any).id, prop, e.dtend, linenItems);
                      if (orderId) {
                        stats.missingOrdersFixed++; ordersByCleaningId.set((existingCleaning as any).id, { id: orderId }); ordersByDateStr.set(orderDateStr, { id: orderId });
                        await adminDb.collection('cleanings').doc((existingCleaning as any).id).update({ laundryOrderId: orderId, requiresLaundry: true });
                      }
                    }
                    } else {
                      console.log(`📦 [STEP2-existing] Ordine già presente per cleaning ${(existingCleaning as any).id} (${prop.name}) — skip duplicato`);
                    }
                  }
                }
              }
            }
          }

          // Ricarica cleanings aggiornate (STEP2 potrebbe averne create di nuove)
          const updatedCleaningsSnap = await adminDb.collection('cleanings').where('propertyId', '==', prop.id).get();
          const updatedCleanings = updatedCleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

          // STEP 3: Gestisci prenotazioni non più nel feed
          // Prenotazioni PASSATE o IN CORSO OGGI: non toccare mai
          // Prenotazioni FUTURE sparite dal feed (da domani in poi): cancella
          // 
          // 🔥 FIX CRITICO: usare "inizio di domani" invece di "adesso" come soglia.
          // Problema: le piattaforme iCal rimuovono le prenotazioni dal feed dopo il checkout.
          // Se il cron gira alle 6:00 e il checkout è alle 10:00, la prenotazione sembrava
          // "futura" (10:00 > 6:00) → veniva cancellata dal DB → pulizia cancellata.
          // Con "inizio di domani", qualsiasi prenotazione con checkout oggi è protetta.
          // Usa UTC per coerenza con le date iCal (parsate in UTC)
          const tomorrowStart = new Date();
          tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
          tomorrowStart.setUTCHours(0, 0, 0, 0);
          
          for (const b of refreshedBookings as any[]) {
            if (processed.has(b.id)) continue;
            if (!b.source || !activeSources.includes(b.source)) continue;
            if (b.isManual === true || b.source === 'manual' || b.source === 'direct' || b.source === 'phone') continue;
            if (b.status === 'CANCELLED') continue;
            // Livello 1: flag storico esplicito → mai cancellare
            if (b.historicBooking === true) continue;
            const co = b.checkOut?.toDate?.();
            if (!co) continue;
            // Livello 2: checkout oggi o passato → preserva (piattaforme rimuovono dal feed)
            if (co < tomorrowStart) continue;
            // Livello 3: checkIn già avvenuto → prenotazione in corso → preserva sempre
            const ci = b.checkIn?.toDate?.();
            if (ci && ci < tomorrowStart) continue;
            // Superati tutti i livelli: prenotazione FUTURA sparita dal feed → cancella
            await adminDb.collection('bookings').doc(b.id).delete();
            stats.deleted++;
            
            // 🔧 FIX: Cancella anche pulizia e ordine biancheria collegati
            // Stessa logica del sync-all-ical
            const relCleaning = updatedCleanings.find((c: any) => {
              if (c.bookingId === b.id) return true;
              const d = c.scheduledDate?.toDate?.();
              return d && isSameDay(d, co) && c.bookingSource === b.source && 
                     c.status !== 'COMPLETED' && c.status !== 'IN_PROGRESS';
            });
            
            if (relCleaning && !(relCleaning as any).isManual) {
              // Cancella ordine biancheria collegato
              if ((relCleaning as any).laundryOrderId) {
                try {
                  await adminDb.collection('orders').doc((relCleaning as any).laundryOrderId).update({
                    status: 'CANCELLED', cancelReason: 'Prenotazione rimossa dal feed iCal',
                    cancelledAt: Timestamp.now(), updatedAt: Timestamp.now(),
                  });
                } catch {}
              }
              // Cancella anche ordini collegati tramite cleaningId
              try {
                const linkedOrders = await adminDb.collection('orders')
                  .where('cleaningId', '==', relCleaning.id).get();
                for (const oDoc of linkedOrders.docs) {
                  const oData = oDoc.data() as Record<string, any>;
                  if (!['IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(oData.status)) {
                    await adminDb.collection('orders').doc(oDoc.id).update({
                      status: 'CANCELLED', cancelReason: 'Prenotazione rimossa dal feed iCal',
                      cancelledAt: Timestamp.now(), updatedAt: Timestamp.now(),
                    });
                  }
                }
              } catch {}
              // Elimina la pulizia
              await adminDb.collection('cleanings').doc(relCleaning.id).delete();
            }
          }

          // STEP 4: Pulizia automatica ordini orfani per questa proprietà
          // Ordini PENDING il cui cleaningId punta a pulizie che non esistono più
          try {
            const currentCleaningsCheck = await adminDb.collection('cleanings')
              .where('propertyId', '==', prop.id).get();
            const validCleaningIds = new Set(currentCleaningsCheck.docs.map(d => d.id));
            
            const propertyOrdersCheck = await adminDb.collection('orders')
              .where('propertyId', '==', prop.id).get();
            
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
            console.error(`⚠️ Errore cleanup orfani ${prop.name}:`, cleanupErr);
          }

          await adminDb.collection('properties').doc(prop.id).update({
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

    // 🔴 CHECK SOVRAPPOSIZIONI: Cerca prenotazioni sovrapposte sulla stessa proprietà
    try {
      const bookingsSnap = await adminDb.collection('bookings')
        .where('checkOut', '>=', Timestamp.now())
        .get();
      
      // Raggruppa per proprietà
      const byProperty = new Map<string, { id: string; source: string; guestName: string; checkIn: Date; checkOut: Date }[]>();
      bookingsSnap.docs.forEach(d => {
        const data = d.data() as Record<string, any>;
        const propId = data.propertyId;
        if (!propId) return;
        const checkIn = data.checkIn?.toDate?.();
        const checkOut = data.checkOut?.toDate?.();
        if (!checkIn || !checkOut) return;
        if (!byProperty.has(propId)) byProperty.set(propId, []);
        byProperty.get(propId)!.push({
          id: d.id,
          source: data.source || 'unknown',
          guestName: data.guestName || 'Ospite',
          checkIn, checkOut,
        });
      });
      
      // Cerca sovrapposizioni
      const overlaps: string[] = [];
      byProperty.forEach((bookings, propId) => {
        if (bookings.length < 2) return;
        // Ordina per check-in
        bookings.sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
        for (let i = 0; i < bookings.length - 1; i++) {
          for (let j = i + 1; j < bookings.length; j++) {
            const a = bookings[i];
            const b = bookings[j];
            // Sovrapposizione: b check-in < a check-out E fonti diverse
            if (b.checkIn < a.checkOut && a.source !== b.source) {
              const propName = properties.find((p: any) => p.id === propId)?.name || propId;
              const fmtDate = (d: Date) => d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
              const msg = `🏠 ${propName}\n\n` +
                `1️⃣ ${a.source.toUpperCase()}: "${a.guestName}"\n   📅 ${fmtDate(a.checkIn)} → ${fmtDate(a.checkOut)}\n\n` +
                `2️⃣ ${b.source.toUpperCase()}: "${b.guestName}"\n   📅 ${fmtDate(b.checkIn)} → ${fmtDate(b.checkOut)}\n\n` +
                `⚠️ Le date si sovrappongono!`;
              overlaps.push(msg);
            }
          }
        }
      });
      
      // Invia notifica admin se ci sono sovrapposizioni (solo nuove, mai inviate prima)
      if (overlaps.length > 0) {
        for (const overlapMsg of overlaps.slice(0, 10)) {
          const overlapKey = 'overlap_' + overlapMsg.replace(/[^a-zA-Z0-9]/g, '').substring(0, 80);
          
          // Usa overlapKey come document ID per dedup naturale
          const existingDoc = await adminDb.collection('overlapAlerts').doc(overlapKey).get();
          
          if (!existingDoc.exists) {
            // Segna come inviato
            await adminDb.collection('overlapAlerts').doc(overlapKey).set({
              message: overlapMsg,
              createdAt: Timestamp.now(),
            });
            
            // Invia notifica a tutti gli admin (1 sola volta per overlap)
            const adminsSnap = await adminDb.collection('users').where('role', '==', 'ADMIN').get();
            for (const adminDoc of adminsSnap.docs) {
              await adminDb.collection('notifications').add({
                title: `⚠️ Prenotazioni sovrapposte`,
                message: overlapMsg,
                type: 'WARNING',
                recipientRole: 'ADMIN',
                recipientId: adminDoc.id,
                senderId: 'system',
                senderName: 'Sync iCal - Overlap',
                status: 'UNREAD',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
              });
            }
          }
        }
      }
    } catch (e: any) {
      console.error('Errore check sovrapposizioni:', e?.message);
    }

    const duration = Date.now() - start;

    await adminDb.collection('syncLogs').add({
      type: 'CRON', timestamp: Timestamp.now(), duration, stats, success: true,
    });

    if (process.env.NODE_ENV !== "production") console.log(`✅ CRON v3.2: ${stats.synced} prop, +${stats.newBookings} agg:${stats.updated} -${stats.deleted} linen:${stats.linenOrders} fixed:${stats.missingOrdersFixed}, ${(duration/1000).toFixed(1)}s`);

    return NextResponse.json({ success: true, stats, duration });
  } catch (error: any) {
    console.error('❌ CRON errore:', error);
    return NextResponse.json({ success: false, error: error.message, stats }, { status: 500 });
  }
}
