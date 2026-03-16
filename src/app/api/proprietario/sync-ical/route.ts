import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createLinenOrderForCleaning } from "~/lib/services/linenOrderService";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ==================== INTERFACCE ====================

interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
}

// ==================== AUTH ====================

// ==================== PARSER ICAL ====================

function parseICalDate(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  
  if (dateStr.length > 8 && dateStr.includes("T")) {
    const hour = parseInt(dateStr.substring(9, 11)) || 0;
    const minute = parseInt(dateStr.substring(11, 13)) || 0;
    const second = parseInt(dateStr.substring(13, 15)) || 0;
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
  
  return new Date(year, month, day);
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
        case "SUMMARY": event.summary = value.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ").trim(); break;
        case "DTSTART": event.dtstart = parseICalDate(value); break;
        case "DTEND": event.dtend = parseICalDate(value); break;
      }
    }
    
    if (event.uid && event.dtstart && event.dtend && event.summary !== undefined) {
      events.push(event as ICalEvent);
    }
  }
  
  return events;
}

// ==================== REGOLE PER PROVIDER ====================

function isBlockedEvent(summary: string, source: string): boolean {
  const lower = summary.toLowerCase().trim();
  
  // 🔥 FIX: Booking.com usa "CLOSED - Not available" per le prenotazioni REALI!
  // Non sono blocchi, sono prenotazioni vere e proprie
  if (source === "booking") {
    // Per Booking, solo "owner block" o simile è un vero blocco
    if (lower.includes("owner") || lower.includes("proprietario")) return true;
    return false;
  }
  
  const blockPatterns = [
    "not available", "no vacancy", "stop sell", "bloccata", "bloccato",
    "blocked", "unavailable", "chiuso", "non disponibile", "closed",
    "airbnb (not available)", "not available - airbnb", "maintenance", "owner",
  ];
  return blockPatterns.some(pattern => lower.includes(pattern));
}

/**
 * 🔥 FIX Booking.com: Filtra i "blocchi contenitore"
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

function cleanGuestName(summary: string, source: string): string {
  if (!summary) return "Ospite";
  const lower = summary.toLowerCase().trim();
  
  if (lower === "reserved" || lower === "reservation" || lower === "prenotazione") {
    switch (source) {
      case "airbnb": return "Ospite Airbnb";
      case "booking": return "Ospite Booking";
      default: return "Prenotazione";
    }
  }
  
  if (source === "booking" && /^\d+$/.test(summary.trim())) return "Ospite Booking";
  
  const clientMatch = summary.match(/Client Name \(([^)]+)\)/i);
  if (clientMatch) return clientMatch[1].trim();
  
  return summary.trim();
}

async function fetchICalData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "CleaningApp/1.0", "Accept": "text/calendar, */*" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch { return null; }
}

// ==================== MAIN SYNC FUNCTION ====================

export async function POST() {
  const stats = {
    bookings: { imported: 0, updated: 0 },
    cleanings: { created: 0 },
    linenOrdersCreated: 0,
    propertiesSynced: 0,
    errors: [] as string[],
  };
  
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    // Carica proprietà del proprietario
    const propsQuery = adminDb.collection("properties").where("ownerId", "==", user.id);
    const propsSnapshot = await propsQuery.get();
    const properties = propsSnapshot.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as any[];
    
    // Carica prenotazioni esistenti
    const bookingsSnapshot = await adminDb.collection("bookings").get();
    const existingBookings = new Map<string, any>();
    bookingsSnapshot.docs.forEach(d => {
      const data = d.data() as Record<string, any>;
      if (data.icalUid) {
        existingBookings.set(`${data.propertyId}_${data.source}_${data.icalUid}`, { id: d.id, ...data });
      }
    });
    
    // 🔒 Carica syncExclusions per evitare di ricreare pulizie cancellate
    const exclusionsSnap = await adminDb.collection("syncExclusions").get();
    const allExclusions = exclusionsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as any[];
    
    for (const property of properties) {
      const icalLinks: { url: string; source: string }[] = [];
      if (property.icalAirbnb) icalLinks.push({ url: property.icalAirbnb, source: "airbnb" });
      if (property.icalBooking) icalLinks.push({ url: property.icalBooking, source: "booking" });
      if (property.icalOktorate) icalLinks.push({ url: property.icalOktorate, source: "oktorate" });
      if (property.icalKrossbooking) icalLinks.push({ url: property.icalKrossbooking, source: "krossbooking" });
      if (property.icalInreception) icalLinks.push({ url: property.icalInreception, source: "inreception" });
      
      if (icalLinks.length === 0) continue;
      
      for (const { url, source } of icalLinks) {
        try {
          const icalData = await fetchICalData(url);
          if (!icalData) {
            stats.errors.push(`${property.name}: impossibile caricare ${source}`);
            continue;
          }
          
          const rawEvents = parseICalData(icalData);
          // 🔥 FIX: Per Booking.com, filtra i blocchi contenitore
          const events = source === 'booking' ? filterBookingContainerBlocks(rawEvents) : rawEvents;
          if (process.env.NODE_ENV !== "production") console.log(`  📅 ${source}: ${rawEvents.length} eventi (${events.length} dopo filtro blocchi)`);
          
          for (const event of events) {
            if (isBlockedEvent(event.summary, source)) continue;
            
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            if (event.dtend < thirtyDaysAgo) continue;
            
            const guestName = cleanGuestName(event.summary, source);
            const bookingKey = `${property.id}_${source}_${event.uid}`;
            const existing = existingBookings.get(bookingKey);
            
            if (existing) {
              const existingCheckIn = existing.checkIn?.toDate?.()?.getTime();
              const existingCheckOut = existing.checkOut?.toDate?.()?.getTime();
              
              if (existingCheckIn !== event.dtstart.getTime() || existingCheckOut !== event.dtend.getTime()) {
                await adminDb.collection("bookings").doc(existing.id).update({
                  checkIn: Timestamp.fromDate(event.dtstart),
                  checkOut: Timestamp.fromDate(event.dtend),
                  guestName,
                  updatedAt: Timestamp.now(),
                });
                stats.bookings.updated++;
              }
            } else {
              await adminDb.collection("bookings").add({
                propertyId: property.id,
                propertyName: property.name,
                guestName,
                checkIn: Timestamp.fromDate(event.dtstart),
                checkOut: Timestamp.fromDate(event.dtend),
                source,
                icalUid: event.uid,
                status: "CONFIRMED",
                guests: property.maxGuests || 2,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
              });
              stats.bookings.imported++;
              
              // Crea pulizia
              const cleaningDate = new Date(event.dtend);
              cleaningDate.setHours(0, 0, 0, 0);
              
              // 🔒 Controlla se questa data è esclusa (pulizia cancellata/spostata)
              const propExclusions = allExclusions.filter((e: any) => e.propertyId === property.id);
              const isExcluded = propExclusions.some((excl: any) => {
                const exclDate = excl.originalDate?.toDate?.();
                if (!exclDate) return false;
                const ed = new Date(exclDate);
                ed.setHours(0, 0, 0, 0);
                return ed.getTime() === cleaningDate.getTime();
              });
              
              if (isExcluded) {
                if (process.env.NODE_ENV !== "production") console.log(`🔒 Pulizia esclusa per ${property.name} il ${cleaningDate.toISOString().split('T')[0]}`);
              } else {
              const cleaningQuery = adminDb.collection("cleanings").where("propertyId", "==", property.id);
              const existingCleanings = await cleaningQuery.get();
              
              const cleaningExists = existingCleanings.docs.some(d => {
                const schedDate = (d.data() as Record<string, any>).scheduledDate?.toDate?.();
                if (!schedDate) return false;
                schedDate.setHours(0, 0, 0, 0);
                return schedDate.getTime() === cleaningDate.getTime();
              });
              
              if (!cleaningExists) {
                const cleaningRef = await adminDb.collection("cleanings").add({
                  propertyId: property.id,
                  propertyName: property.name,
                  scheduledDate: Timestamp.fromDate(cleaningDate),
                  scheduledTime: property.checkOutTime || "10:00",
                  status: "SCHEDULED",
                  guestsCount: property.maxGuests || 2,
                  bookingSource: source,
                  createdAt: Timestamp.now(),
                  updatedAt: Timestamp.now(),
                });
                stats.cleanings.created++;
                
                // 🔧 Crea ordine biancheria
                const orderResult = await createLinenOrderForCleaning({
                  cleaningId: cleaningRef.id,
                  property,
                  scheduledDate: cleaningDate,
                  guestsCount: property.maxGuests || 2,
                });
                if (orderResult.success && !orderResult.skipped) {
                  stats.linenOrdersCreated++;
                }
              }
              }
            }
          }
        } catch (error) {
          stats.errors.push(`${property.name} (${source}): ${error}`);
        }
      }
      
      await adminDb.collection("properties").doc(property.id).update({
        lastIcalSync: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      stats.propertiesSynced++;
    }
    
    return NextResponse.json({
      success: true,
      ...stats,
      message: `Importate: ${stats.bookings.imported}, Aggiornate: ${stats.bookings.updated}, Pulizie: ${stats.cleanings.created}`,
    });
    
  } catch (error) {
    console.error("❌ Errore sync:", error);
    return NextResponse.json({ error: "Errore durante la sincronizzazione", ...stats }, { status: 500 });
  }
}
