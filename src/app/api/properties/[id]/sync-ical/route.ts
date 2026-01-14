import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";

async function parseIcal(url: string) {
  const response = await fetch(url);
  const text = await response.text();
  const events: { checkIn: Date; checkOut: Date; guestName: string; externalUid: string }[] = [];
  
  const lines = text.split(/\r?\n/);
  let inEvent = false;
  let currentEvent: Record<string, unknown> = {};
  
  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      inEvent = true;
      currentEvent = {}; 
    } else if (line.startsWith("END:VEVENT") && inEvent) {
      if (currentEvent.dtstart && currentEvent.dtend) {
        events.push({
          checkIn: currentEvent.dtstart as Date,
          checkOut: currentEvent.dtend as Date,
          guestName: (currentEvent.summary as string) || "Prenotazione",
          externalUid: (currentEvent.uid as string) || "",
        });
      }
      inEvent = false;
    } else if (inEvent) {
      if (line.startsWith("DTSTART")) {
        const dateStr = line.split(":")[1]?.replace(/[^0-9]/g, "").slice(0, 8);
        if (dateStr) currentEvent.dtstart = new Date(dateStr.slice(0, 4) + "-" + dateStr.slice(4, 6) + "-" + dateStr.slice(6, 8));
      } else if (line.startsWith("DTEND")) {
        const dateStr = line.split(":")[1]?.replace(/[^0-9]/g, "").slice(0, 8);
        if (dateStr) currentEvent.dtend = new Date(dateStr.slice(0, 4) + "-" + dateStr.slice(4, 6) + "-" + dateStr.slice(6, 8));
      } else if (line.startsWith("SUMMARY")) {
        currentEvent.summary = line.split(":").slice(1).join(":").trim();
      } else if (line.startsWith("UID")) {
        currentEvent.uid = line.split(":").slice(1).join(":").trim();
      }
    }
  }
  return events;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const property = await db.property.findUnique({ where: { id } });
    if (!property) return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    
    const urls = [property.icalAirbnb, property.icalBooking, property.icalOktorate, property.icalInreception, property.icalKrossbooking].filter(Boolean);
    
    let totalCreated = 0;
    
    for (const url of urls) {
      try {
        const events = await parseIcal(url!);
        
        for (const event of events) {
          const existing = await db.booking.findFirst({ where: { propertyId: id, externalUid: event.externalUid } });
          
          if (!existing) {
            await db.booking.create({
              data: {
                propertyId: id,
                checkIn: event.checkIn,
                checkOut: event.checkOut,
                guestName: event.guestName,
                guestsCount: property.maxGuests,
                source: "ICAL",
                externalUid: event.externalUid,
              },
            });
            
            await db.cleaning.create({
              data: {
                propertyId: id,
                scheduledDate: event.checkOut,
                scheduledTime: "10:00",
                status: "SCHEDULED",
              },
            });
            
            totalCreated++;
          }
        }
      } catch (e) {
        console.error("Errore parsing iCal:", url, e);
      }
    }
    return NextResponse.json({ success: true, count: totalCreated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Errore sincronizzazione" }, { status: 500 });
  }
}