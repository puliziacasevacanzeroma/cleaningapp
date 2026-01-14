const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function parseIcalDate(dateStr) {
  // Rimuove VALUE=DATE: se presente
  const clean = dateStr.replace('VALUE=DATE:', '').trim();
  // Parse YYYYMMDD
  const year = parseInt(clean.substring(0, 4));
  const month = parseInt(clean.substring(4, 6)) - 1;
  const day = parseInt(clean.substring(6, 8));
  return new Date(year, month, day, 12, 0, 0);
}

async function syncBookingIcal(property) {
  if (!property.icalBooking) return 0;
  
  console.log(`\nSyncing ${property.name}...`);
  console.log(`URL: ${property.icalBooking}`);
  
  try {
    const response = await fetch(property.icalBooking);
    const text = await response.text();
    
    // Parse eventi
    const events = [];
    const eventBlocks = text.split('BEGIN:VEVENT');
    
    for (let i = 1; i < eventBlocks.length; i++) {
      const block = eventBlocks[i];
      const endIndex = block.indexOf('END:VEVENT');
      const eventText = block.substring(0, endIndex);
      
      let dtstart = null, dtend = null, summary = '';
      
      for (const line of eventText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('DTSTART')) {
          const value = trimmed.split(':')[1];
          if (value) dtstart = await parseIcalDate(value);
        } else if (trimmed.startsWith('DTEND')) {
          const value = trimmed.split(':')[1];
          if (value) dtend = await parseIcalDate(value);
        } else if (trimmed.startsWith('SUMMARY')) {
          summary = trimmed.substring(8);
        }
      }
      
      if (dtstart && dtend) {
        events.push({ dtstart, dtend, summary });
      }
    }
    
    console.log(`Found ${events.length} events in feed`);
    
    // Elimina vecchie prenotazioni Booking per questa proprietà
    const deleted = await prisma.booking.deleteMany({
      where: { propertyId: property.id, source: 'booking' }
    });
    console.log(`Deleted ${deleted.count} old booking entries`);
    
    // Crea nuove prenotazioni
    let created = 0;
    for (const event of events) {
      // Salta se checkIn >= checkOut
      if (event.dtstart >= event.dtend) continue;
      
      // Crea prenotazione
      await prisma.booking.create({
        data: {
          propertyId: property.id,
          checkIn: event.dtstart,
          checkOut: event.dtend,
          guestName: 'Booking.com Guest',
          source: 'booking',
          status: 'CONFIRMED',
          guestsCount: 2,
          syncedAt: new Date()
        }
      });
      created++;
      console.log(`  Created: ${event.dtstart.toISOString().slice(0,10)} - ${event.dtend.toISOString().slice(0,10)}`);
    }
    
    return created;
  } catch (err) {
    console.error(`Error syncing ${property.name}:`, err.message);
    return 0;
  }
}

async function main() {
  // Trova tutte le proprietà con iCal Booking
  const properties = await prisma.property.findMany({
    where: { icalBooking: { not: null } }
  });
  
  console.log(`Found ${properties.length} properties with Booking.com iCal`);
  
  let totalCreated = 0;
  for (const property of properties) {
    const count = await syncBookingIcal(property);
    totalCreated += count;
  }
  
  console.log(`\n===== DONE =====`);
  console.log(`Total Booking.com reservations created: ${totalCreated}`);
}

main().then(() => prisma.$disconnect());