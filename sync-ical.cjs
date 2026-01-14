const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncIcal() {
  const properties = await prisma.property.findMany({
    where: { icalUrl: { not: null } }
  });

  console.log('Trovate ' + properties.length + ' proprieta con iCal');

  for (const property of properties) {
    try {
      console.log('Sync: ' + property.name);
      const response = await fetch(property.icalUrl);
      const icalData = await response.text();
      
      const events = parseIcal(icalData);
      console.log('  Eventi trovati: ' + events.length);

      await prisma.booking.deleteMany({
        where: { propertyId: property.id }
      });

      for (const event of events) {
        if (event.start && event.end) {
          await prisma.booking.create({
            data: {
              propertyId: property.id,
              guestName: event.summary || 'Ospite',
              checkIn: event.start,
              checkOut: event.end,
              source: 'ICAL',
              status: 'confirmed'
            }
          });
        }
      }
      console.log('  Prenotazioni create: ' + events.length);
    } catch (error) {
      console.log('  Errore: ' + error.message);
    }
  }

  await prisma.$disconnect();
  console.log('Sincronizzazione completata!');
}

function parseIcal(data) {
  const events = [];
  const lines = data.split('\n');
  let currentEvent = null;

  for (let line of lines) {
    line = line.trim();
    
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      events.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith('DTSTART')) {
        currentEvent.start = parseIcalDate(line);
      } else if (line.startsWith('DTEND')) {
        currentEvent.end = parseIcalDate(line);
      } else if (line.startsWith('SUMMARY:')) {
        currentEvent.summary = line.substring(8);
      }
    }
  }

  return events;
}

function parseIcalDate(line) {
  const match = line.match(/(\d{8})(T(\d{6}))?/);
  if (match) {
    const dateStr = match[1];
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    
    if (match[3]) {
      const timeStr = match[3];
      const hour = parseInt(timeStr.substring(0, 2));
      const minute = parseInt(timeStr.substring(2, 4));
      return new Date(year, month, day, hour, minute);
    }
    return new Date(year, month, day);
  }
  return null;
}

syncIcal();
