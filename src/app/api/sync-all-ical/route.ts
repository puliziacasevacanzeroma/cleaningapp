import { NextResponse } from "next/server";
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
  description?: string;
}

// ==================== PARSER ICAL ====================

function parseICalDate(dateStr: string): Date {
  // Formato: YYYYMMDD o YYYYMMDDTHHmmssZ
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
  
  // Normalizza line endings
  const normalized = icalText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Unfold lines (linee che iniziano con spazio sono continuazione)
  const unfolded = normalized.replace(/\n[ \t]/g, "");
  
  // Split per VEVENT
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
      
      // Rimuovi parametri (es. DTSTART;VALUE=DATE:20240101)
      if (key.includes(";")) {
        key = key.split(";")[0];
      }
      
      switch (key) {
        case "UID":
          event.uid = value;
          break;
        case "SUMMARY":
          event.summary = value
            .replace(/\\,/g, ",")
            .replace(/\\;/g, ";")
            .replace(/\\n/g, " ")
            .replace(/\\N/g, " ")
            .trim();
          break;
        case "DTSTART":
          event.dtstart = parseICalDate(value);
          break;
        case "DTEND":
          event.dtend = parseICalDate(value);
          break;
        case "DESCRIPTION":
          event.description = value
            .replace(/\\n/g, "\n")
            .replace(/\\N/g, "\n")
            .trim();
          break;
      }
    }
    
    // Aggiungi solo se abbiamo i campi necessari
    if (event.uid && event.dtstart && event.dtend && event.summary !== undefined) {
      events.push(event as ICalEvent);
    }
  }
  
  return events;
}

// ==================== REGOLE PER PROVIDER ====================

function isBlockedEvent(summary: string, source: string): boolean {
  const lower = summary.toLowerCase().trim();
  
  // Pattern di blocco comuni a tutti i provider
  const blockPatterns = [
    "not available",
    "no vacancy", 
    "stop sell",
    "bloccata",
    "bloccato",
    "blocked",
    "unavailable",
    "chiuso",
    "non disponibile",
    "closed",
    "airbnb (not available)",
    "not available - airbnb",
    "booking.com (not available)",
  ];
  
  // Per Booking, "Closed" è un blocco
  if (source === "booking" && (lower === "closed" || lower.startsWith("closed -"))) {
    return true;
  }
  
  return blockPatterns.some(pattern => lower.includes(pattern));
}

function cleanGuestName(summary: string, source: string): string {
  if (!summary) return "Ospite";
  
  const lower = summary.toLowerCase().trim();
  
  // Nomi generici → formatta per source
  if (lower === "reserved" || lower === "reservation" || lower === "prenotazione") {
    switch (source) {
      case "airbnb": return "Ospite Airbnb";
      case "booking": return "Ospite Booking";
      case "oktorate": return "Prenotazione";
      case "krossbooking": return "Prenotazione";
      case "inreception": return "Prenotazione";
      default: return "Prenotazione";
    }
  }
  
  // Booking.com spesso mette solo numeri di conferma
  if (source === "booking" && /^\d+$/.test(summary.trim())) {
    return "Ospite Booking";
  }
  
  // Airbnb: estrai nome da "Client Name (Nome)" o simili
  const clientMatch = summary.match(/Client Name \(([^)]+)\)/i);
  if (clientMatch) {
    return clientMatch[1].trim();
  }
  
  // Pattern "Platform - Nome" (es. "Airbnb - Mario Rossi")
  const dashMatch = summary.match(/^(?:Airbnb|Booking|VRBO|Expedia)\s*[-–]\s*(.+)$/i);
  if (dashMatch) {
    return dashMatch[1].trim();
  }
  
  // Pattern "OTA: Nome" (es. "Booking.com: Mario Rossi")  
  const colonMatch = summary.match(/^(?:Airbnb|Booking\.com|Booking|VRBO):\s*(.+)$/i);
  if (colonMatch) {
    return colonMatch[1].trim();
  }
  
  // Nomi tutto maiuscolo → capitalizza
  if (summary === summary.toUpperCase() && summary.length > 3) {
    return summary.charAt(0).toUpperCase() + summary.slice(1).toLowerCase();
  }
  
  return summary.trim();
}

async function fetchICalData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "CleaningApp/1.0",
        "Accept": "text/calendar, */*",
      },
      signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch iCal from ${url}: ${response.status}`);
      return null;
    }
    
    const text = await response.text();
    return text;
  } catch (error) {
    console.error(`Error fetching iCal from ${url}:`, error);
    return null;
  }
}

// ==================== MAIN SYNC FUNCTION ====================

export async function POST() {
  const stats = {
    totalNew: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    totalCleaningsCreated: 0,
    propertiesSynced: 0,
    errors: [] as string[],
  };
  
  try {
    console.log("🔄 Inizio sincronizzazione iCal...");
    
    // Carica tutte le proprietà
    const propertiesSnapshot = await getDocs(collection(db, "properties"));
    const properties = propertiesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];
    
    console.log(`📋 Trovate ${properties.length} proprietà`);
    
    // Carica tutte le prenotazioni esistenti per confronto
    const bookingsSnapshot = await getDocs(collection(db, "bookings"));
    const existingBookings = new Map<string, any>();
    bookingsSnapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      // Chiave: propertyId + source + uid
      if (data.icalUid) {
        const key = `${data.propertyId}_${data.source || "manual"}_${data.icalUid}`;
        existingBookings.set(key, { id: docSnap.id, ...data });
      }
    });
    
    console.log(`📚 ${existingBookings.size} prenotazioni esistenti con icalUid`);
    
    // Processa ogni proprietà
    for (const property of properties) {
      const icalLinks: { url: string; source: string }[] = [];
      
      // Raccogli tutti i link iCal configurati
      if (property.icalAirbnb) icalLinks.push({ url: property.icalAirbnb, source: "airbnb" });
      if (property.icalBooking) icalLinks.push({ url: property.icalBooking, source: "booking" });
      if (property.icalOktorate) icalLinks.push({ url: property.icalOktorate, source: "oktorate" });
      if (property.icalKrossbooking) icalLinks.push({ url: property.icalKrossbooking, source: "krossbooking" });
      if (property.icalInreception) icalLinks.push({ url: property.icalInreception, source: "inreception" });
      if (property.icalUrl && !icalLinks.some(l => l.url === property.icalUrl)) {
        icalLinks.push({ url: property.icalUrl, source: "other" });
      }
      
      if (icalLinks.length === 0) continue;
      
      console.log(`🏠 Proprietà "${property.name}": ${icalLinks.length} link iCal`);
      
      for (const { url, source } of icalLinks) {
        try {
          // Fetch calendario iCal
          const icalData = await fetchICalData(url);
          if (!icalData) {
            stats.errors.push(`${property.name}: impossibile caricare ${source}`);
            continue;
          }
          
          // Parse eventi
          const events = parseICalData(icalData);
          console.log(`  📅 ${source}: ${events.length} eventi trovati`);
          
          for (const event of events) {
            // Salta eventi bloccati
            if (isBlockedEvent(event.summary, source)) {
              stats.totalSkipped++;
              continue;
            }
            
            // Salta eventi nel passato (più di 30 giorni fa)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            if (event.dtend < thirtyDaysAgo) {
              stats.totalSkipped++;
              continue;
            }
            
            const guestName = cleanGuestName(event.summary, source);
            const bookingKey = `${property.id}_${source}_${event.uid}`;
            
            const existing = existingBookings.get(bookingKey);
            
            if (existing) {
              // Aggiorna solo se le date sono cambiate
              const existingCheckIn = existing.checkIn?.toDate?.()?.getTime();
              const existingCheckOut = existing.checkOut?.toDate?.()?.getTime();
              
              if (existingCheckIn !== event.dtstart.getTime() || existingCheckOut !== event.dtend.getTime()) {
                await updateDoc(doc(db, "bookings", existing.id), {
                  checkIn: Timestamp.fromDate(event.dtstart),
                  checkOut: Timestamp.fromDate(event.dtend),
                  guestName,
                  updatedAt: Timestamp.now(),
                });
                stats.totalUpdated++;
              }
            } else {
              // Crea nuova prenotazione
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
              stats.totalNew++;
              
              // Crea anche la pulizia associata (checkout = giorno pulizia)
              const cleaningDate = new Date(event.dtend);
              cleaningDate.setHours(0, 0, 0, 0);
              
              // Verifica se esiste già una pulizia per questa data e proprietà
              const cleaningQuery = query(
                collection(db, "cleanings"),
                where("propertyId", "==", property.id)
              );
              const existingCleanings = await getDocs(cleaningQuery);
              
              const cleaningExists = existingCleanings.docs.some(d => {
                const data = d.data();
                const schedDate = data.scheduledDate?.toDate?.();
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
                stats.totalCleaningsCreated++;
              }
            }
          }
          
        } catch (error) {
          console.error(`Errore sync ${source} per ${property.name}:`, error);
          stats.errors.push(`${property.name} (${source}): ${error}`);
        }
      }
      
      // Aggiorna timestamp sync sulla proprietà
      await updateDoc(doc(db, "properties", property.id), {
        lastIcalSync: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      stats.propertiesSynced++;
    }
    
    console.log("✅ Sincronizzazione completata:", stats);
    
    return NextResponse.json({
      success: true,
      stats,
      message: `Sincronizzate ${stats.propertiesSynced} proprietà. Nuove: ${stats.totalNew}, Aggiornate: ${stats.totalUpdated}, Pulizie create: ${stats.totalCleaningsCreated}`,
    });
    
  } catch (error) {
    console.error("❌ Errore sync-all-ical:", error);
    return NextResponse.json({ 
      success: false,
      error: "Errore durante la sincronizzazione",
      stats 
    }, { status: 500 });
  }
}
