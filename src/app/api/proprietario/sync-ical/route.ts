import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

// Parser semplice per iCal
function parseIcal(icalData: string) {
  const events: Array<{
    uid: string;
    summary: string;
    dtstart: Date;
    dtend: Date;
    description?: string;
  }> = [];

  const lines = icalData.split(/\r?\n/);
  let currentEvent: Record<string, string> = {};
  let inEvent = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] || "";
    
    // Handle line folding (lines starting with space are continuations)
    while (i + 1 < lines.length && (lines[i + 1]?.startsWith(" ") || lines[i + 1]?.startsWith("\t"))) {
      i++;
      line += (lines[i] || "").substring(1);
    }

    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      currentEvent = {};
    } else if (line === "END:VEVENT") {
      inEvent = false;
      
      if (currentEvent.UID && currentEvent.DTSTART && currentEvent.DTEND) {
        events.push({
          uid: currentEvent.UID,
          summary: currentEvent.SUMMARY || "Prenotazione",
          dtstart: parseIcalDate(currentEvent.DTSTART),
          dtend: parseIcalDate(currentEvent.DTEND),
          description: currentEvent.DESCRIPTION
        });
      }
    } else if (inEvent && line.includes(":")) {
      const colonIndex = line.indexOf(":");
      let key = line.substring(0, colonIndex);
      const value = line.substring(colonIndex + 1);
      
      // Remove parameters like ;VALUE=DATE
      if (key.includes(";")) {
        key = key.split(";")[0] || key;
      }
      
      currentEvent[key] = value;
    }
  }

  return events;
}

function parseIcalDate(dateStr: string): Date {
  // Format: 20240115 or 20240115T100000 or 20240115T100000Z
  const clean = dateStr.replace(/[^0-9TZ]/g, "");
  
  if (clean.length === 8) {
    // Date only: YYYYMMDD
    const year = parseInt(clean.substring(0, 4));
    const month = parseInt(clean.substring(4, 6)) - 1;
    const day = parseInt(clean.substring(6, 8));
    return new Date(year, month, day);
  } else {
    // DateTime: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
    const year = parseInt(clean.substring(0, 4));
    const month = parseInt(clean.substring(4, 6)) - 1;
    const day = parseInt(clean.substring(6, 8));
    const hour = parseInt(clean.substring(9, 11)) || 0;
    const minute = parseInt(clean.substring(11, 13)) || 0;
    
    if (clean.endsWith("Z")) {
      return new Date(Date.UTC(year, month, day, hour, minute));
    }
    return new Date(year, month, day, hour, minute);
  }
}

export async function POST() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Prendi tutte le proprietà dell'utente
    const properties = await db.property.findMany({
      where: { ownerId: session.user.id, status: "active" }
    });

    let totalBookingsImported = 0;
    let totalBookingsUpdated = 0;
    let totalCleaningsCreated = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    for (const property of properties) {
      // Raccogli tutti i link iCal della proprietà
      const icalLinks: { source: string; url: string }[] = [];
      
      if (property.icalAirbnb) icalLinks.push({ source: "airbnb", url: property.icalAirbnb });
      if (property.icalBooking) icalLinks.push({ source: "booking", url: property.icalBooking });
      if (property.icalOktorate) icalLinks.push({ source: "oktorate", url: property.icalOktorate });
      if (property.icalInreception) icalLinks.push({ source: "inreception", url: property.icalInreception });
      if (property.icalKrossbooking) icalLinks.push({ source: "krossbooking", url: property.icalKrossbooking });
      if (property.icalUrl) icalLinks.push({ source: "other", url: property.icalUrl });

      for (const { source, url } of icalLinks) {
        try {
          // Scarica il file iCal
          const response = await fetch(url, {
            headers: {
              "User-Agent": "CleaningApp/1.0"
            }
          });

          if (!response.ok) {
            errors.push(`${property.name} (${source}): HTTP ${response.status}`);
            continue;
          }

          const icalData = await response.text();
          const events = parseIcal(icalData);

          for (const event of events) {
            // Cerca se esiste già una prenotazione con questo externalId
            const existingBooking = await db.booking.findFirst({
              where: {
                propertyId: property.id,
                externalId: event.uid
              }
            });

            let bookingId: string;

            if (existingBooking) {
              // Aggiorna se le date sono cambiate
              if (
                existingBooking.checkIn.getTime() !== event.dtstart.getTime() ||
                existingBooking.checkOut.getTime() !== event.dtend.getTime()
              ) {
                await db.booking.update({
                  where: { id: existingBooking.id },
                  data: {
                    checkIn: event.dtstart,
                    checkOut: event.dtend,
                    guestName: event.summary || existingBooking.guestName
                  }
                });
                totalBookingsUpdated++;
                
                // Aggiorna anche la data della pulizia collegata se esiste
                const existingCleaning = await db.cleaning.findFirst({
                  where: { bookingId: existingBooking.id }
                });
                
                if (existingCleaning) {
                  await db.cleaning.update({
                    where: { id: existingCleaning.id },
                    data: { date: event.dtend } // Checkout = data pulizia
                  });
                }
              } else {
                totalSkipped++;
              }
              bookingId = existingBooking.id;
            } else {
              // Crea nuova prenotazione
              const newBooking = await db.booking.create({
                data: {
                  propertyId: property.id,
                  externalId: event.uid,
                  checkIn: event.dtstart,
                  checkOut: event.dtend,
                  guestName: event.summary || "Ospite",
                  source: source,
                  status: "confirmed"
                }
              });
              totalBookingsImported++;
              bookingId = newBooking.id;
            }

            // ========================================
            // CREA PULIZIA AUTOMATICA AL CHECKOUT
            // ========================================
            
            // Verifica se esiste già una pulizia per questa prenotazione
            const existingCleaning = await db.cleaning.findFirst({
              where: { bookingId: bookingId }
            });

            if (!existingCleaning) {
              // Crea nuova pulizia per il giorno del checkout
              await db.cleaning.create({
                data: {
                  propertyId: property.id,
                  bookingId: bookingId,
                  date: event.dtend, // Data checkout = data pulizia
                  scheduledTime: "10:00", // Orario default
                  status: "not_assigned",
                  notes: `Pulizia automatica - Checkout ${event.summary || "Ospite"}`
                }
              });
              totalCleaningsCreated++;
            }
          }
        } catch (err) {
          errors.push(`${property.name} (${source}): ${err instanceof Error ? err.message : "Errore"}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      bookings: {
        imported: totalBookingsImported,
        updated: totalBookingsUpdated,
        skipped: totalSkipped
      },
      cleanings: {
        created: totalCleaningsCreated
      },
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("Errore sincronizzazione iCal:", error);
    return NextResponse.json(
      { error: "Errore durante la sincronizzazione" },
      { status: 500 }
    );
  }
}

