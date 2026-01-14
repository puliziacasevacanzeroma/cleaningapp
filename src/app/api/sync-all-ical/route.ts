import { NextResponse } from "next/server";
import { db } from "~/server/db";

function parseIcalDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const cleanStr = dateStr.replace("VALUE=DATE:", "").trim();

    if (/^\d{8}$/.test(cleanStr)) {
      const year = parseInt(cleanStr.slice(0, 4));
      const month = parseInt(cleanStr.slice(4, 6)) - 1;
      const day = parseInt(cleanStr.slice(6, 8));
      return new Date(year, month, day, 12, 0, 0);
    }

    if (/^\d{8}T\d{6}Z?$/.test(cleanStr)) {
      const year = parseInt(cleanStr.slice(0, 4));
      const month = parseInt(cleanStr.slice(4, 6)) - 1;
      const day = parseInt(cleanStr.slice(6, 8));
      return new Date(year, month, day, 12, 0, 0);
    }

    return null;
  } catch {
    return null;
  }
}

// Verifica se è un blocco (NON una vera prenotazione)
// IMPORTANTE: Booking.com NON viene mai filtrato - tutte le sue entry sono vere prenotazioni
function isBlockedEntry(guestName: string, source: string): boolean {
  if (!guestName) return false;
  
  // Booking.com: TUTTE le entry sono vere prenotazioni, MAI blocchi
  if (source === "booking") return false;
  
  const lower = guestName.toLowerCase();

  // Pattern che indicano BLOCCHI (non soggiorni reali) - solo per altri OTA
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
    "imported",
  ];

  return blockPatterns.some(pattern => lower.includes(pattern));
}

async function parseIcal(url: string, source: string) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "CleaningApp/1.0" }
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${source}: ${response.status}`);
      return [];
    }

    const text = await response.text();
    const events: any[] = [];
    const vevents = text.split("BEGIN:VEVENT");

    for (let i = 1; i < vevents.length; i++) {
      const eventBlock = vevents[i].split("END:VEVENT")[0];
      const lines = eventBlock.split(/\r?\n/);

      let checkIn: Date | null = null;
      let checkOut: Date | null = null;
      let guestName = "Ospite";
      let externalUid = "";

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith("DTSTART")) {
          const value = trimmedLine.split(":").pop() || "";
          checkIn = parseIcalDate(value);
        } else if (trimmedLine.startsWith("DTEND")) {
          const value = trimmedLine.split(":").pop() || "";
          checkOut = parseIcalDate(value);
        } else if (trimmedLine.startsWith("SUMMARY")) {
          guestName = trimmedLine.split(":").slice(1).join(":").trim() || "Ospite";
        } else if (trimmedLine.startsWith("UID")) {
          externalUid = trimmedLine.split(":").slice(1).join(":").trim();
        }
      }

      if (checkIn && checkOut && checkIn < checkOut) {
        events.push({ checkIn, checkOut, guestName, externalUid, source });
      }
    }

    console.log(`Parsed ${events.length} events from ${source}`);
    return events;
  } catch (error) {
    console.error(`Error parsing iCal from ${source}:`, error);
    return [];
  }
}

export async function POST() {
  try {
    const properties = await db.property.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        cleaningPrice: true,
        icalAirbnb: true,
        icalBooking: true,
        icalOktorate: true,
        icalInreception: true,
        icalKrossbooking: true,
      },
    });

    let totalNew = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalCleaningsCreated = 0;

    for (const property of properties) {
      const allEvents: any[] = [];

      if (property.icalAirbnb) {
        const events = await parseIcal(property.icalAirbnb, "airbnb");
        allEvents.push(...events);
      }
      if (property.icalBooking) {
        const events = await parseIcal(property.icalBooking, "booking");
        allEvents.push(...events);
      }
      if (property.icalOktorate) {
        const events = await parseIcal(property.icalOktorate, "oktorate");
        allEvents.push(...events);
      }
      if (property.icalInreception) {
        const events = await parseIcal(property.icalInreception, "inreception");
        allEvents.push(...events);
      }
      if (property.icalKrossbooking) {
        const events = await parseIcal(property.icalKrossbooking, "krossbooking");
        allEvents.push(...events);
      }

      for (const event of allEvents) {
        if (!event.checkIn || !event.checkOut) {
          totalSkipped++;
          continue;
        }

        // Salta i blocchi (ma NON per Booking.com)
        if (isBlockedEntry(event.guestName, event.source)) {
          totalSkipped++;
          continue;
        }

        const existing = await db.booking.findFirst({
          where: {
            propertyId: property.id,
            OR: [
              { externalUid: event.externalUid },
              { checkIn: event.checkIn, checkOut: event.checkOut }
            ]
          },
        });

        if (existing) {
          await db.booking.update({
            where: { id: existing.id },
            data: {
              guestName: event.guestName || existing.guestName,
              source: event.source,
              syncedAt: new Date(),
            },
          });
          totalUpdated++;
          
          // Verifica se esiste già una pulizia per questa prenotazione
          const existingCleaning = await db.cleaning.findFirst({
            where: { bookingId: existing.id }
          });
          
          // Se non esiste, creala
          if (!existingCleaning) {
            await db.cleaning.create({
              data: {
                propertyId: property.id,
                bookingId: existing.id,
                scheduledDate: event.checkOut,
                scheduledTime: "10:00",
                status: "PENDING",
                type: "CHECKOUT",
                price: property.cleaningPrice || 50,
                checklistDone: false,
              },
            });
            totalCleaningsCreated++;
            console.log(`Pulizia creata per prenotazione esistente: ${property.name} - ${event.checkOut.toISOString().slice(0,10)}`);
          }
        } else {
          // Crea nuova prenotazione
          const newBooking = await db.booking.create({
            data: {
              propertyId: property.id,
              checkIn: event.checkIn,
              checkOut: event.checkOut,
              guestName: event.guestName,
              source: event.source,
              externalUid: event.externalUid,
              status: "CONFIRMED",
              guestsCount: 2,
              syncedAt: new Date(),
            },
          });
          totalNew++;

          // Crea automaticamente la pulizia per il checkout
          await db.cleaning.create({
            data: {
              propertyId: property.id,
              bookingId: newBooking.id,
              scheduledDate: event.checkOut,
              scheduledTime: "10:00",
              status: "PENDING",
              type: "CHECKOUT",
              price: property.cleaningPrice || 50,
              checklistDone: false,
            },
          });
          totalCleaningsCreated++;
          console.log(`Nuova prenotazione + pulizia: ${property.name} - ${event.checkOut.toISOString().slice(0,10)}`);
        }
      }

      await db.property.update({
        where: { id: property.id },
        data: { lastSync: new Date() },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Sincronizzazione completata",
      stats: { 
        properties: properties.length, 
        totalNew, 
        totalUpdated, 
        totalSkipped,
        totalCleaningsCreated 
      },
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: "Errore sincronizzazione" }, { status: 500 });
  }
}

