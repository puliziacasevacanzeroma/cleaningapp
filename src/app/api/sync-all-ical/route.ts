import { NextResponse } from "next/server";
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ==================== INTERFACCE ====================

interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  description?: string;
}

// ==================== PARSER ICAL ====================

function parseICalDate(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  
  if (dateStr.length > 8 && dateStr.includes("T")) {
    // Data con orario - usa UTC
    const hour = parseInt(dateStr.substring(9, 11)) || 0;
    const minute = parseInt(dateStr.substring(11, 13)) || 0;
    const second = parseInt(dateStr.substring(13, 15)) || 0;
    
    // Se termina con Z è UTC, altrimenti tratta come locale
    if (dateStr.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
    return new Date(year, month, day, hour, minute, second);
  }
  
  // VALUE=DATE senza orario - crea data a mezzogiorno UTC per evitare 
  // problemi di timezone (mezzogiorno UTC è sempre lo stesso giorno in Europa)
  const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
  
  console.log(`📅 Parsing iCal date: ${dateStr} → ${date.toISOString()} (UTC giorno ${day})`);
  
  return date;
}

function parseICalData(icalText: string): ICalEvent[] {
  const events: ICalEvent[] = [];
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
      events.push(event as ICalEvent);
    }
  }
  
  return events;
}

// ==================== CLASSIFICAZIONE EVENTI ====================

function classifyAirbnbEvent(event: ICalEvent): 'BOOKING' | 'BLOCK' {
  const summary = event.summary?.toLowerCase().trim() || '';
  const description = event.description || '';
  
  if (summary.includes('not available')) {
    return 'BLOCK';
  }
  
  const isReserved = summary === 'reserved' || summary.includes('reserved');
  const hasReservationUrl = description.includes('Reservation URL:') || 
                            description.includes('/hosting/reservations/details/');
  
  if (isReserved && hasReservationUrl) {
    return 'BOOKING';
  }
  
  if (isReserved) {
    return 'BOOKING';
  }
  
  return 'BLOCK';
}

function classifyBookingEvent(event: ICalEvent): 'BOOKING' | 'BLOCK' {
  const summary = event.summary?.toLowerCase().trim() || '';
  
  if (summary === 'closed' || summary.startsWith('closed -') || summary.includes('not available')) {
    return 'BLOCK';
  }
  
  return 'BOOKING';
}

function classifyOtherEvent(event: ICalEvent): 'BOOKING' | 'BLOCK' {
  const summary = event.summary?.toLowerCase().trim() || '';
  
  const blockPatterns = [
    'not available', 'blocked', 'unavailable', 'closed', 'chiuso',
    'non disponibile', 'bloccato', 'bloccata', 'maintenance', 'owner', 'block'
  ];
  
  for (const pattern of blockPatterns) {
    if (summary.includes(pattern)) {
      return 'BLOCK';
    }
  }
  
  return 'BOOKING';
}

function classifyEvent(event: ICalEvent, source: string): 'BOOKING' | 'BLOCK' {
  switch (source) {
    case 'airbnb': return classifyAirbnbEvent(event);
    case 'booking': return classifyBookingEvent(event);
    default: return classifyOtherEvent(event);
  }
}

function extractAirbnbReservationCode(description?: string): string | null {
  if (!description) return null;
  const match = description.match(/\/hosting\/reservations\/details\/([A-Z0-9]+)/i);
  return match ? match[1] : null;
}

function getGuestName(event: ICalEvent, source: string): string {
  const summary = event.summary?.toLowerCase().trim() || '';
  
  if (summary === 'reserved' || summary === 'reservation' || summary === 'prenotazione') {
    switch (source) {
      case 'airbnb': return 'Ospite Airbnb';
      case 'booking': return 'Ospite Booking';
      case 'oktorate': return 'Ospite Octorate';
      case 'krossbooking': return 'Ospite Krossbooking';
      case 'inreception': return 'Ospite Inreception';
      default: return 'Prenotazione';
    }
  }
  
  if (source === 'booking' && /^\d+$/.test(event.summary.trim())) {
    return 'Ospite Booking';
  }
  
  const clientMatch = event.summary.match(/Client Name \(([^)]+)\)/i);
  if (clientMatch) return clientMatch[1].trim();
  
  return event.summary.trim() || 'Ospite';
}

async function fetchICalData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CleaningApp/1.0', 'Accept': 'text/calendar, */*' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    console.error(`Error fetching iCal:`, error);
    return null;
  }
}

// ==================== MAIN SYNC FUNCTION ====================

export async function POST() {
  const stats = {
    totalBookings: 0,
    totalBlocks: 0,
    totalNew: 0,
    totalUpdated: 0,
    totalDeleted: 0,
    totalCleaningsCreated: 0,
    totalCleaningsDeleted: 0,
    propertiesSynced: 0,
    errors: [] as string[],
  };
  
  try {
    console.log('\n🔄 ========================================');
    console.log('   SYNC TUTTE LE PROPRIETÀ - CON CANCELLAZIONE');
    console.log('========================================');
    
    const propertiesSnapshot = await getDocs(collection(db, 'properties'));
    const properties = propertiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
    
    console.log(`📋 Proprietà totali: ${properties.length}`);
    
    // Data limite per cancellazioni
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    for (const property of properties) {
      const icalLinks: { url: string; source: string }[] = [];
      
      if (property.icalAirbnb) icalLinks.push({ url: property.icalAirbnb, source: 'airbnb' });
      if (property.icalBooking) icalLinks.push({ url: property.icalBooking, source: 'booking' });
      if (property.icalOktorate) icalLinks.push({ url: property.icalOktorate, source: 'oktorate' });
      if (property.icalKrossbooking) icalLinks.push({ url: property.icalKrossbooking, source: 'krossbooking' });
      if (property.icalInreception) icalLinks.push({ url: property.icalInreception, source: 'inreception' });
      if (property.icalUrl && !icalLinks.some(l => l.url === property.icalUrl)) {
        icalLinks.push({ url: property.icalUrl, source: 'other' });
      }
      
      if (icalLinks.length === 0) continue;
      
      console.log(`\n🏠 "${property.name}"`);
      
      // Carica prenotazioni esistenti per questa proprietà
      const bookingsSnapshot = await getDocs(query(
        collection(db, 'bookings'), 
        where('propertyId', '==', property.id)
      ));
      
      const existingBookingsBySource = new Map<string, Map<string, any>>();
      
      bookingsSnapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.icalUid && data.source) {
          if (!existingBookingsBySource.has(data.source)) {
            existingBookingsBySource.set(data.source, new Map());
          }
          existingBookingsBySource.get(data.source)!.set(data.icalUid, { 
            id: docSnap.id, 
            ...data 
          });
        }
      });
      
      for (const { url, source } of icalLinks) {
        try {
          console.log(`   📅 ${source.toUpperCase()}`);
          const icalData = await fetchICalData(url);
          if (!icalData) {
            stats.errors.push(`${property.name}: impossibile caricare ${source}`);
            continue;
          }
          
          const events = parseICalData(icalData);
          
          // Set di UID delle prenotazioni REALI nel feed attuale
          const currentFeedUids = new Set<string>();
          
          for (const event of events) {
            const classification = classifyEvent(event, source);
            
            if (classification === 'BLOCK') {
              stats.totalBlocks++;
              continue;
            }
            
            stats.totalBookings++;
            currentFeedUids.add(event.uid);
            
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            if (event.dtend < thirtyDaysAgo) continue;
            
            const guestName = getGuestName(event, source);
            const reservationCode = source === 'airbnb' ? extractAirbnbReservationCode(event.description) : null;
            
            const existingForSource = existingBookingsBySource.get(source);
            const existing = existingForSource?.get(event.uid);
            
            const checkInStr = `${event.dtstart.getUTCDate()}/${event.dtstart.getUTCMonth() + 1}`;
            const checkOutStr = `${event.dtend.getUTCDate()}/${event.dtend.getUTCMonth() + 1}`;
            
            if (existing) {
              const existingCheckIn = existing.checkIn?.toDate?.();
              const existingCheckOut = existing.checkOut?.toDate?.();
              
              const needsUpdate = !existingCheckIn || !existingCheckOut ||
                existingCheckIn.getTime() !== event.dtstart.getTime() ||
                existingCheckOut.getTime() !== event.dtend.getTime();
              
              if (needsUpdate) {
                await updateDoc(doc(db, 'bookings', existing.id), {
                  checkIn: Timestamp.fromDate(event.dtstart),
                  checkOut: Timestamp.fromDate(event.dtend),
                  guestName,
                  ...(reservationCode && { airbnbReservationCode: reservationCode }),
                  updatedAt: Timestamp.now(),
                });
                stats.totalUpdated++;
                console.log(`      📝 "${guestName}" aggiornata`);
              }
            } else {
              const newBookingRef = await addDoc(collection(db, 'bookings'), {
                propertyId: property.id,
                propertyName: property.name,
                guestName,
                checkIn: Timestamp.fromDate(event.dtstart),
                checkOut: Timestamp.fromDate(event.dtend),
                source,
                icalUid: event.uid,
                ...(reservationCode && { airbnbReservationCode: reservationCode }),
                status: 'CONFIRMED',
                guests: property.maxGuests || 2,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
              });
              stats.totalNew++;
              console.log(`      ➕ "${guestName}" nuova: ${checkInStr} → ${checkOutStr}`);
              
              // Crea pulizia
              const cleaningDate = new Date(event.dtend);
              
              const cleaningQuery = query(collection(db, 'cleanings'), where('propertyId', '==', property.id));
              const existingCleanings = await getDocs(cleaningQuery);
              
              const cleaningExists = existingCleanings.docs.some(d => {
                const data = d.data();
                const schedDate = data.scheduledDate?.toDate?.();
                if (!schedDate) return false;
                return schedDate.getUTCFullYear() === cleaningDate.getUTCFullYear() &&
                       schedDate.getUTCMonth() === cleaningDate.getUTCMonth() &&
                       schedDate.getUTCDate() === cleaningDate.getUTCDate();
              });
              
              if (!cleaningExists) {
                await addDoc(collection(db, 'cleanings'), {
                  propertyId: property.id,
                  propertyName: property.name,
                  scheduledDate: Timestamp.fromDate(cleaningDate),
                  scheduledTime: property.checkOutTime || '10:00',
                  status: 'SCHEDULED',
                  guestsCount: property.maxGuests || 2,
                  bookingSource: source,
                  bookingId: newBookingRef.id,
                  createdAt: Timestamp.now(),
                  updatedAt: Timestamp.now(),
                });
                stats.totalCleaningsCreated++;
              }
            }
          }
          
          // ==================== CANCELLAZIONE PRENOTAZIONI RIMOSSE ====================
          const existingForSource = existingBookingsBySource.get(source);
          if (existingForSource) {
            for (const [uid, booking] of existingForSource) {
              if (!currentFeedUids.has(uid)) {
                const checkOut = booking.checkOut?.toDate?.();
                if (checkOut && checkOut > sevenDaysAgo) {
                  console.log(`      🗑️ "${booking.guestName}" eliminata (non più nel feed)`);
                  
                  await deleteDoc(doc(db, 'bookings', booking.id));
                  stats.totalDeleted++;
                  
                  // Elimina pulizia associata
                  const cleaningsQuery = query(
                    collection(db, 'cleanings'),
                    where('propertyId', '==', property.id),
                    where('bookingId', '==', booking.id)
                  );
                  const cleaningsToDelete = await getDocs(cleaningsQuery);
                  
                  for (const cleaningDoc of cleaningsToDelete.docs) {
                    await deleteDoc(doc(db, 'cleanings', cleaningDoc.id));
                    stats.totalCleaningsDeleted++;
                  }
                  
                  // Cerca anche per data se non ha bookingId
                  if (cleaningsToDelete.empty && checkOut) {
                    const cleaningsByDate = query(
                      collection(db, 'cleanings'),
                      where('propertyId', '==', property.id),
                      where('bookingSource', '==', source)
                    );
                    const cleaningsDocs = await getDocs(cleaningsByDate);
                    
                    for (const cleaningDoc of cleaningsDocs.docs) {
                      const cleaningData = cleaningDoc.data();
                      const schedDate = cleaningData.scheduledDate?.toDate?.();
                      if (schedDate && 
                          schedDate.getUTCFullYear() === checkOut.getUTCFullYear() &&
                          schedDate.getUTCMonth() === checkOut.getUTCMonth() &&
                          schedDate.getUTCDate() === checkOut.getUTCDate()) {
                        await deleteDoc(doc(db, 'cleanings', cleaningDoc.id));
                        stats.totalCleaningsDeleted++;
                      }
                    }
                  }
                }
              }
            }
          }
          
          // ==================== ELIMINAZIONE PRENOTAZIONI ORFANE (senza icalUid) ====================
          const allBookingsForProperty = bookingsSnapshot.docs;
          
          for (const bookingDoc of allBookingsForProperty) {
            const bookingData = bookingDoc.data();
            
            // Salta se ha icalUid (già gestita sopra) o source diversa
            if (bookingData.icalUid || bookingData.source !== source) continue;
            
            const bookingCheckIn = bookingData.checkIn?.toDate?.();
            const bookingCheckOut = bookingData.checkOut?.toDate?.();
            
            if (!bookingCheckIn || !bookingCheckOut) continue;
            if (bookingCheckOut < sevenDaysAgo) continue;
            
            // Verifica se questa prenotazione si sovrappone con una nel feed
            let isDuplicate = false;
            
            for (const event of events) {
              const classification = classifyEvent(event, source);
              if (classification === 'BLOCK') continue;
              
              const eventCheckIn = event.dtstart;
              const eventCheckOut = event.dtend;
              
              // Se le date sono molto simili (differenza max 2 giorni), è probabilmente un duplicato
              const checkInDiff = Math.abs(bookingCheckIn.getTime() - eventCheckIn.getTime()) / (1000 * 60 * 60 * 24);
              const checkOutDiff = Math.abs(bookingCheckOut.getTime() - eventCheckOut.getTime()) / (1000 * 60 * 60 * 24);
              
              if (checkInDiff <= 2 && checkOutDiff <= 2) {
                isDuplicate = true;
                break;
              }
            }
            
            if (isDuplicate) {
              console.log(`      🗑️ ORFANA: "${bookingData.guestName}" (duplicato senza icalUid)`);
              
              await deleteDoc(doc(db, 'bookings', bookingDoc.id));
              stats.totalDeleted++;
              
              // Elimina pulizia associata
              if (bookingCheckOut) {
                const orphanCleaningsQuery = query(
                  collection(db, 'cleanings'),
                  where('propertyId', '==', property.id),
                  where('bookingSource', '==', source)
                );
                const orphanCleanings = await getDocs(orphanCleaningsQuery);
                
                for (const cleaningDoc of orphanCleanings.docs) {
                  const cleaningData = cleaningDoc.data();
                  const schedDate = cleaningData.scheduledDate?.toDate?.();
                  if (schedDate && 
                      schedDate.getUTCFullYear() === bookingCheckOut.getUTCFullYear() &&
                      schedDate.getUTCMonth() === bookingCheckOut.getUTCMonth() &&
                      schedDate.getUTCDate() === bookingCheckOut.getUTCDate()) {
                    await deleteDoc(doc(db, 'cleanings', cleaningDoc.id));
                    stats.totalCleaningsDeleted++;
                  }
                }
              }
            }
          }
          
        } catch (error) {
          console.error(`Errore ${source} per ${property.name}:`, error);
          stats.errors.push(`${property.name} (${source}): ${error}`);
        }
      }
      
      await updateDoc(doc(db, 'properties', property.id), {
        lastIcalSync: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      stats.propertiesSynced++;
    }
    
    console.log('\n✅ ========================================');
    console.log('   SYNC COMPLETATA');
    console.log('========================================');
    console.log(`   Proprietà: ${stats.propertiesSynced}`);
    console.log(`   Prenotazioni trovate: ${stats.totalBookings}`);
    console.log(`   Blocchi ignorati: ${stats.totalBlocks}`);
    console.log(`   Nuove: ${stats.totalNew}`);
    console.log(`   Aggiornate: ${stats.totalUpdated}`);
    console.log(`   ❌ ELIMINATE: ${stats.totalDeleted}`);
    console.log(`   Pulizie create: ${stats.totalCleaningsCreated}`);
    console.log(`   Pulizie eliminate: ${stats.totalCleaningsDeleted}`);
    
    return NextResponse.json({
      success: true,
      stats,
      message: `Proprietà: ${stats.propertiesSynced}, Nuove: ${stats.totalNew}, Eliminate: ${stats.totalDeleted}, Blocchi: ${stats.totalBlocks}`,
    });
    
  } catch (error) {
    console.error('❌ Errore:', error);
    return NextResponse.json({ success: false, error: 'Errore durante la sincronizzazione', stats }, { status: 500 });
  }
}
