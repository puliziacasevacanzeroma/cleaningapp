import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, updateDoc, addDoc, collection, getDocs, query, where, Timestamp } from "firebase/firestore";
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

/**
 * Parsa una data iCal e la converte in Date
 * IMPORTANTE: Per date senza orario (VALUE=DATE), impostiamo a mezzogiorno UTC
 * per evitare problemi di timezone che causano shift di un giorno
 */
function parseICalDate(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  
  if (dateStr.length > 8 && dateStr.includes("T")) {
    // Data con orario (es: 20260206T140000Z)
    const hour = parseInt(dateStr.substring(9, 11)) || 0;
    const minute = parseInt(dateStr.substring(11, 13)) || 0;
    const second = parseInt(dateStr.substring(13, 15)) || 0;
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
  
  // Data senza orario (VALUE=DATE) - impostiamo a mezzogiorno UTC
  // Questo evita problemi di timezone che potrebbero shiftare la data di un giorno
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
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
        case "DESCRIPTION": event.description = value.replace(/\\n/g, "\n").replace(/\\N/g, "\n").trim(); break;
      }
    }
    
    if (event.uid && event.dtstart && event.dtend && event.summary !== undefined) {
      events.push(event as ICalEvent);
    }
  }
  
  return events;
}

// ==================== REGOLE PER PROVIDER ====================

/**
 * Verifica se un evento è un blocco/indisponibilità e NON una prenotazione reale
 * Questi eventi NON devono essere importati come prenotazioni
 */
function isBlockedEvent(summary: string, source: string): boolean {
  const lower = summary.toLowerCase().trim();
  
  // Pattern che indicano blocchi/indisponibilità (NON prenotazioni)
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
    "(not available)",
    "maintenance",
    "manutenzione",
    "owner block",
    "proprietario",
  ];
  
  // Booking.com usa "Closed" per i blocchi
  if (source === "booking" && (lower === "closed" || lower.startsWith("closed -"))) {
    return true;
  }
  
  // Verifica se il summary contiene uno dei pattern di blocco
  return blockPatterns.some(pattern => lower.includes(pattern));
}

/**
 * Verifica se un evento è una prenotazione reale
 * Deve avere un summary valido che indica una prenotazione
 */
function isValidReservation(summary: string, source: string): boolean {
  if (!summary) return false;
  
  const lower = summary.toLowerCase().trim();
  
  // Se è un blocco, non è una prenotazione valida
  if (isBlockedEvent(summary, source)) {
    return false;
  }
  
  // Pattern che indicano prenotazioni reali
  const reservationPatterns = [
    "reserved",
    "reservation", 
    "prenotazione",
    "booking",
    "guest",
    "ospite",
  ];
  
  // Se il summary contiene un pattern di prenotazione, è valido
  if (reservationPatterns.some(pattern => lower.includes(pattern))) {
    return true;
  }
  
  // Se il summary sembra un nome (non è un pattern di blocco), è probabilmente una prenotazione
  // es: "Mario Rossi", "John Smith", etc.
  if (lower.length > 0 && !isBlockedEvent(summary, source)) {
    return true;
  }
  
  return false;
}

function cleanGuestName(summary: string, source: string): string {
  if (!summary) return "Ospite";
  const lower = summary.toLowerCase().trim();
  
  // Se è "Reserved" o simile, usa il nome del provider
  if (lower === "reserved" || lower === "reservation" || lower === "prenotazione") {
    switch (source) {
      case "airbnb": return "Ospite Airbnb";
      case "booking": return "Ospite Booking";
      case "oktorate": return "Ospite Octorate";
      case "krossbooking": return "Ospite Krossbooking";
      case "inreception": return "Ospite Inreception";
      default: return "Prenotazione";
    }
  }
  
  // Booking.com a volte usa solo numeri
  if (source === "booking" && /^\d+$/.test(summary.trim())) {
    return "Ospite Booking";
  }
  
  // Estrai nome da pattern "Client Name (Nome)"
  const clientMatch = summary.match(/Client Name \(([^)]+)\)/i);
  if (clientMatch) return clientMatch[1].trim();
  
  // Estrai nome da pattern "Provider - Nome"
  const dashMatch = summary.match(/^(?:Airbnb|Booking|VRBO|Expedia)\s*[-–]\s*(.+)$/i);
  if (dashMatch) return dashMatch[1].trim();
  
  // Estrai nome da pattern "Provider: Nome"
  const colonMatch = summary.match(/^(?:Airbnb|Booking\.com|Booking|VRBO):\s*(.+)$/i);
  if (colonMatch) return colonMatch[1].trim();
  
  // Se è tutto maiuscolo, normalizza
  if (summary === summary.toUpperCase() && summary.length > 3) {
    return summary.charAt(0).toUpperCase() + summary.slice(1).toLowerCase();
  }
  
  return summary.trim();
}

async function fetchICalData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "CleaningApp/1.0", "Accept": "text/calendar, */*" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      console.error(`Failed to fetch iCal from ${url}: ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error(`Error fetching iCal from ${url}:`, error);
    return null;
  }
}

// ==================== MAIN SYNC FUNCTION ====================

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const stats = {
    totalNew: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    totalBlocked: 0,
    totalCleaningsCreated: 0,
    errors: [] as string[],
  };
  
  try {
    const { id } = await params;
    console.log("🔄 Inizio sincronizzazione iCal per proprietà:", id);
    
    // Carica la proprietà
    const docSnap = await getDoc(doc(db, "properties", id));
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }
    
    const property = { id: docSnap.id, ...docSnap.data() } as any;
    console.log(`🏠 Proprietà "${property.name}"`);
    
    // Raccogli tutti i link iCal configurati
    const icalLinks: { url: string; source: string }[] = [];
    if (property.icalAirbnb) icalLinks.push({ url: property.icalAirbnb, source: "airbnb" });
    if (property.icalBooking) icalLinks.push({ url: property.icalBooking, source: "booking" });
    if (property.icalOktorate) icalLinks.push({ url: property.icalOktorate, source: "oktorate" });
    if (property.icalKrossbooking) icalLinks.push({ url: property.icalKrossbooking, source: "krossbooking" });
    if (property.icalInreception) icalLinks.push({ url: property.icalInreception, source: "inreception" });
    if (property.icalUrl && !icalLinks.some(l => l.url === property.icalUrl)) {
      icalLinks.push({ url: property.icalUrl, source: "other" });
    }
    
    if (icalLinks.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "Nessun link iCal configurato per questa proprietà",
        stats 
      });
    }
    
    console.log(`📅 ${icalLinks.length} link iCal trovati`);
    
    // Carica prenotazioni esistenti per questa proprietà
    const bookingsSnapshot = await getDocs(query(collection(db, "bookings"), where("propertyId", "==", id)));
    const existingBookings = new Map<string, any>();
    bookingsSnapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.icalUid) {
        const key = `${data.source || "manual"}_${data.icalUid}`;
        existingBookings.set(key, { id: docSnap.id, ...data });
      }
    });
    
    console.log(`📚 ${existingBookings.size} prenotazioni esistenti con icalUid`);
    
    // Processa ogni link iCal
    for (const { url, source } of icalLinks) {
      try {
        console.log(`\n📥 Fetching ${source}: ${url.substring(0, 50)}...`);
        const icalData = await fetchICalData(url);
        if (!icalData) {
          stats.errors.push(`Impossibile caricare ${source}`);
          continue;
        }
        
        const events = parseICalData(icalData);
        console.log(`  📅 ${source}: ${events.length} eventi totali trovati`);
        
        for (const event of events) {
          // FILTRO 1: Salta gli eventi di blocco/indisponibilità
          if (isBlockedEvent(event.summary, source)) {
            console.log(`  ⛔ BLOCCO SALTATO: "${event.summary}" (${event.dtstart.toISOString().split('T')[0]} - ${event.dtend.toISOString().split('T')[0]})`);
            stats.totalBlocked++;
            continue;
          }
          
          // FILTRO 2: Verifica che sia una prenotazione valida
          if (!isValidReservation(event.summary, source)) {
            console.log(`  ⚠️ NON VALIDO: "${event.summary}"`);
            stats.totalSkipped++;
            continue;
          }
          
          // FILTRO 3: Salta prenotazioni troppo vecchie (più di 30 giorni fa)
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          if (event.dtend < thirtyDaysAgo) {
            stats.totalSkipped++;
            continue;
          }
          
          const guestName = cleanGuestName(event.summary, source);
          const bookingKey = `${source}_${event.uid}`;
          const existing = existingBookings.get(bookingKey);
          
          // Log per debug
          console.log(`  ✅ PRENOTAZIONE: "${guestName}" - Check-in: ${event.dtstart.toISOString().split('T')[0]}, Check-out: ${event.dtend.toISOString().split('T')[0]}`);
          
          if (existing) {
            // Aggiorna prenotazione esistente se le date sono cambiate
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
              console.log(`    📝 Aggiornata`);
            }
          } else {
            // Crea nuova prenotazione
            await addDoc(collection(db, "bookings"), {
              propertyId: id,
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
            console.log(`    ➕ Nuova prenotazione creata`);
            
            // Crea pulizia per checkout
            const cleaningDate = new Date(event.dtend);
            cleaningDate.setUTCHours(12, 0, 0, 0); // Mezzogiorno UTC per evitare problemi timezone
            
            const cleaningQuery = query(collection(db, "cleanings"), where("propertyId", "==", id));
            const existingCleanings = await getDocs(cleaningQuery);
            
            // Verifica se esiste già una pulizia per questa data
            const cleaningExists = existingCleanings.docs.some(d => {
              const data = d.data();
              const schedDate = data.scheduledDate?.toDate?.();
              if (!schedDate) return false;
              
              // Confronta solo anno, mese, giorno
              return schedDate.getUTCFullYear() === cleaningDate.getUTCFullYear() &&
                     schedDate.getUTCMonth() === cleaningDate.getUTCMonth() &&
                     schedDate.getUTCDate() === cleaningDate.getUTCDate();
            });
            
            if (!cleaningExists) {
              await addDoc(collection(db, "cleanings"), {
                propertyId: id,
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
              console.log(`    🧹 Pulizia creata per ${cleaningDate.toISOString().split('T')[0]}`);
            }
          }
        }
      } catch (error) {
        console.error(`Errore sync ${source}:`, error);
        stats.errors.push(`${source}: ${error}`);
      }
    }
    
    // Aggiorna timestamp sync
    await updateDoc(doc(db, "properties", id), {
      lastIcalSync: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    console.log("\n✅ Sincronizzazione completata:", stats);
    
    return NextResponse.json({
      success: true,
      stats,
      message: `Nuove: ${stats.totalNew}, Aggiornate: ${stats.totalUpdated}, Blocchi saltati: ${stats.totalBlocked}, Pulizie: ${stats.totalCleaningsCreated}`,
    });
    
  } catch (error) {
    console.error("❌ Errore sync-ical:", error);
    return NextResponse.json({ success: false, error: "Errore durante la sincronizzazione", stats }, { status: 500 });
  }
}
