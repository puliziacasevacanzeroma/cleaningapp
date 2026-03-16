/**
 * 🕐 CRON JOB - Sync automatico iCal v3.2 + Ordini Biancheria
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getItemName } from "~/lib/itemNames";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

const CONFIG = {
  FETCH_TIMEOUT_MS: 30000,
  MAX_RETRIES: 2,
  DAYS_PAST_TO_KEEP: 30,
  BATCH_SIZE: 3,
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
  if (totalLenzMatr > 0) items.push({ id: 'lenzuola_matrimoniale', name: 'Lenzuola Matrimoniale', quantity: totalLenzMatr });
  if (totalLenzSing > 0) items.push({ id: 'lenzuola_singolo', name: 'Lenzuola Singolo', quantity: totalLenzSing });
  if (totalFedere > 0) items.push({ id: 'federa', name: 'Federa', quantity: totalFedere });
  items.push({ id: 'telo_doccia', name: 'Telo Doccia', quantity: guestsCount });
  items.push({ id: 'asciugamano_viso', name: 'Asciugamano Viso', quantity: guestsCount });
  items.push({ id: 'asciugamano_ospite', name: 'Asciugamano Ospite/Bidet', quantity: guestsCount });
  if (bathrooms > 0) items.push({ id: 'tappetino_bagno', name: 'Tappetino Bagno', quantity: bathrooms });
  return items;
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
    }
  }
  if (linenItems.length === 0) linenItems = calculateFallbackLinen(guestsCount, prop.bedrooms || 1, prop.bathrooms || 1);
  return linenItems;
}

async function createLinenOrder(cleaningId: string, prop: any, scheduledDate: Date, linenItems: { id: string; name: string; quantity: number }[]): Promise<string | null> {
  if (linenItems.length === 0) return null;
  try {
    const existingOrderSnap = await adminDb.collection('orders').where('cleaningId', '==', cleaningId).get();
    if (!existingOrderSnap.empty) {
      for (const orderDoc of existingOrderSnap.docs) {
        const order = orderDoc.data() as Record<string, any>;
        if (order.status !== 'CANCELLED') return orderDoc.id;
      }
      if (process.env.NODE_ENV !== "production") console.log(`ℹ️ Ordini esistenti per ${cleaningId} sono tutti CANCELLED, creo nuovo ordine`);
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

  // Pattern universali — valgono per TUTTI i source incluso Booking
  const BLOCK_PATTERNS = ['not available', 'blocked', 'closed', 'chiuso', 'non disponibile',
    'bloccata', 'bloccato', 'owner block', 'maintenance', 'pulizie', 'manutenzione',
    'owner', 'proprietario'];
  if (BLOCK_PATTERNS.some(p => sum.includes(p))) return true;

  // Booking: le prenotazioni REALI hanno nome ospite o "reservation"
  // Se NON corrisponde ai pattern sopra e source è booking → è una prenotazione reale
  if (s === 'booking') {
    // "Reserved" senza altri dettagli = prenotazione reale su Booking
    return false;
  }

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
    await sleep(2000);
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
  if (process.env.NODE_ENV !== "production") console.log('\n🕐 CRON SYNC iCAL v3.2 - ' + new Date().toISOString() + (forceSync ? ' [FORCE]' : ''));

  try {
    const propsSnap = await adminDb.collection('properties').where('status', '==', 'ACTIVE').get();
    const properties = propsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

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
              if (!existingOrderByCleaningId && !existingOrderByDate) {
                const guestsCount = c.guestsCount || prop.maxGuests || 2;
                const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                if (linenItems.length > 0) {
                  const orderId = await createLinenOrder(c.id, prop, cleaningDate, linenItems);
                  if (orderId) {
                    stats.missingOrdersFixed++;
                    ordersByCleaningId.set(c.id, { id: orderId });
                    ordersByDateStr.set(dateStr, { id: orderId });
                    // Salva laundryOrderId sulla pulizia (mancava — causava ricreazione infinita)
                    try {
                      await adminDb.collection('cleanings').doc(c.id).update({
                        laundryOrderId: orderId,
                        requiresLaundry: true,
                        updatedAt: Timestamp.now(),
                      });
                    } catch {}
                  } else {
                    console.error(`⚠️ createLinenOrder fallito per ${prop.name} cleaning:${c.id} data:${dateStr}`);
                  }
                } else {
                  console.error(`⚠️ linenItems vuoto per ${prop.name} cleaning:${c.id} guestsCount:${guestsCount}`);
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
            const existingCleaning = cleanings.find((c: any) => { const d = c.scheduledDate?.toDate?.(); return d && isSameDay(d, coDate); });
            const coDateStr = coDate.toISOString().split('T')[0];
            if (excludedDates.has(coDateStr)) continue;
            if (!existingCleaning) {
              const guestsCount = b.guests || b.guestsCount || prop.maxGuests || 2;
              const cleaningPrice = prop.cleaningPrice || 0;
              const cleaningRef = await adminDb.collection('cleanings').add({
                propertyId: prop.id, propertyName: prop.name, propertyAddress: prop.address || '',
                scheduledDate: Timestamp.fromDate(coDate), scheduledTime: prop.checkOutTime || '10:00',
                status: 'SCHEDULED', bookingSource: b.source, bookingId: b.id,
                guestsCount, guestName: b.guestName || 'Ospite', price: cleaningPrice,
                contractPrice: cleaningPrice, serviceType: 'STANDARD', serviceTypeName: 'Pulizia Standard',
                type: 'CHECKOUT', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
              });
              stats.cleanings++;
              cleanings.push({ id: cleaningRef.id, scheduledDate: Timestamp.fromDate(coDate), status: 'SCHEDULED' } as any);
              if (!prop.usesOwnLinen) {
                const existingOrder = ordersByDateStr.get(coDateStr) || ordersByCleaningId.get(cleaningRef.id);
                if (!existingOrder) {
                  const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                  if (linenItems.length > 0) {
                    const orderId = await createLinenOrder(cleaningRef.id, prop, coDate, linenItems);
                    if (orderId) { stats.linenOrders++; ordersByCleaningId.set(cleaningRef.id, { id: orderId }); ordersByDateStr.set(coDateStr, { id: orderId }); await adminDb.collection('cleanings').doc(cleaningRef.id).update({ laundryOrderId: orderId, requiresLaundry: true }); }
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

            for (const e of parseICalData(data)) {
              if (isBlock(e, source) || e.dtend < pastLimit) continue;
              const existing = findExistingBooking(refreshedBookings, e, source);
              if (existing) {
                processed.add(existing.id);
                const ci = existing.checkIn?.toDate?.(), co = existing.checkOut?.toDate?.();
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
                      // Aggiorna anche pulizie ASSIGNED (data checkout cambiata)
                      await adminDb.collection('cleanings').doc(cDoc.id).update({
                        scheduledDate: Timestamp.fromDate(e.dtend),
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

                const refreshedCleaningsSnap = await adminDb.collection('cleanings').where('propertyId', '==', prop.id).get();
                const currentCleanings = refreshedCleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
                const existingCleaning = currentCleanings.find((c: any) => isSameDay(c.scheduledDate?.toDate?.() || new Date(0), e.dtend));

                if (!existingCleaning) {
                  const guestsCount = prop.maxGuests || 2;
                  const cleaningPrice = prop.cleaningPrice || 0;
                  const cleaningRef = await adminDb.collection('cleanings').add({
                    propertyId: prop.id, propertyName: prop.name, propertyAddress: prop.address || '',
                    scheduledDate: Timestamp.fromDate(e.dtend), scheduledTime: prop.checkOutTime || '10:00',
                    status: 'SCHEDULED', bookingSource: source, bookingId: ref.id,
                    guestsCount, guestName: getGuestName(e, source), price: cleaningPrice,
                    contractPrice: cleaningPrice, serviceType: 'STANDARD', serviceTypeName: 'Pulizia Standard',
                    type: 'CHECKOUT', createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
                  });
                  stats.cleanings++;
                  const orderDateStr = e.dtend.toISOString().split('T')[0];
                  const existingOrder = ordersByDateStr.get(orderDateStr) || ordersByCleaningId.get(cleaningRef.id);
                  if (!prop.usesOwnLinen && !existingOrder && !excludedDates.has(orderDateStr)) {
                    const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                    if (linenItems.length > 0) {
                      const orderId = await createLinenOrder(cleaningRef.id, prop, e.dtend, linenItems);
                      if (orderId) {
                        stats.linenOrders++; ordersByCleaningId.set(cleaningRef.id, { id: orderId }); ordersByDateStr.set(orderDateStr, { id: orderId });
                        await adminDb.collection('cleanings').doc(cleaningRef.id).update({ laundryOrderId: orderId, requiresLaundry: true });
                      }
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
                    const guestsCount = (existingCleaning as any).guestsCount || prop.maxGuests || 2;
                    const linenItems = calculateLinenItemsForProperty(prop, guestsCount);
                    if (linenItems.length > 0) {
                      const orderId = await createLinenOrder((existingCleaning as any).id, prop, e.dtend, linenItems);
                      if (orderId) {
                        stats.missingOrdersFixed++; ordersByCleaningId.set((existingCleaning as any).id, { id: orderId }); ordersByDateStr.set(orderDateStr, { id: orderId });
                        await adminDb.collection('cleanings').doc((existingCleaning as any).id).update({ laundryOrderId: orderId, requiresLaundry: true });
                      }
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
