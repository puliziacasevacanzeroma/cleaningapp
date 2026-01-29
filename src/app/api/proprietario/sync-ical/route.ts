import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, getDocs, doc, updateDoc, addDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

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

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
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
  const blockPatterns = [
    "not available", "no vacancy", "stop sell", "bloccata", "bloccato",
    "blocked", "unavailable", "chiuso", "non disponibile", "closed",
    "airbnb (not available)", "not available - airbnb",
  ];
  if (source === "booking" && (lower === "closed" || lower.startsWith("closed -"))) return true;
  return blockPatterns.some(pattern => lower.includes(pattern));
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
    propertiesSynced: 0,
    errors: [] as string[],
  };
  
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    console.log("🔄 Sync iCal per proprietario:", user.id);
    
    // Carica proprietà del proprietario
    const propsQuery = query(collection(db, "properties"), where("ownerId", "==", user.id));
    const propsSnapshot = await getDocs(propsQuery);
    const properties = propsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    
    console.log(`📋 Trovate ${properties.length} proprietà`);
    
    // Carica prenotazioni esistenti
    const bookingsSnapshot = await getDocs(collection(db, "bookings"));
    const existingBookings = new Map<string, any>();
    bookingsSnapshot.docs.forEach(d => {
      const data = d.data();
      if (data.icalUid) {
        existingBookings.set(`${data.propertyId}_${data.source}_${data.icalUid}`, { id: d.id, ...data });
      }
    });
    
    for (const property of properties) {
      const icalLinks: { url: string; source: string }[] = [];
      if (property.icalAirbnb) icalLinks.push({ url: property.icalAirbnb, source: "airbnb" });
      if (property.icalBooking) icalLinks.push({ url: property.icalBooking, source: "booking" });
      if (property.icalOktorate) icalLinks.push({ url: property.icalOktorate, source: "oktorate" });
      if (property.icalKrossbooking) icalLinks.push({ url: property.icalKrossbooking, source: "krossbooking" });
      if (property.icalInreception) icalLinks.push({ url: property.icalInreception, source: "inreception" });
      
      if (icalLinks.length === 0) continue;
      
      console.log(`🏠 ${property.name}: ${icalLinks.length} link`);
      
      for (const { url, source } of icalLinks) {
        try {
          const icalData = await fetchICalData(url);
          if (!icalData) {
            stats.errors.push(`${property.name}: impossibile caricare ${source}`);
            continue;
          }
          
          const events = parseICalData(icalData);
          console.log(`  📅 ${source}: ${events.length} eventi`);
          
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
                await updateDoc(doc(db, "bookings", existing.id), {
                  checkIn: Timestamp.fromDate(event.dtstart),
                  checkOut: Timestamp.fromDate(event.dtend),
                  guestName,
                  updatedAt: Timestamp.now(),
                });
                stats.bookings.updated++;
              }
            } else {
              await addDoc(collection(db, "bookings"), {
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
              
              const cleaningQuery = query(collection(db, "cleanings"), where("propertyId", "==", property.id));
              const existingCleanings = await getDocs(cleaningQuery);
              
              const cleaningExists = existingCleanings.docs.some(d => {
                const schedDate = d.data().scheduledDate?.toDate?.();
                if (!schedDate) return false;
                schedDate.setHours(0, 0, 0, 0);
                return schedDate.getTime() === cleaningDate.getTime();
              });
              
              if (!cleaningExists) {
                await addDoc(collection(db, "cleanings"), {
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
              }
            }
          }
        } catch (error) {
          stats.errors.push(`${property.name} (${source}): ${error}`);
        }
      }
      
      await updateDoc(doc(db, "properties", property.id), {
        lastIcalSync: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      stats.propertiesSynced++;
    }
    
    console.log("✅ Sync completata:", stats);
    
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
