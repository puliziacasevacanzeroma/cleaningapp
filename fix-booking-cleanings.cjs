const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Per Booking.com: CLOSED = prenotazione (non blocco!)
// Per Airbnb: "Not available" = blocco, "Reserved" = prenotazione
// Per Octorate/Krossbooking: "NO VACANCY", "Stop Sell", "Bloccata" = blocco
function isRealBooking(guestName, source) {
  if (!guestName) return false;
  const lower = guestName.toLowerCase();
  
  // Booking.com: CLOSED è una prenotazione!
  if (source === 'booking') {
    return true; // Tutto da Booking è prenotazione
  }
  
  // Airbnb
  if (source === 'airbnb') {
    if (lower.includes('not available')) return false;
    return true; // "Reserved" è prenotazione
  }
  
  // Oktorate, Krossbooking, altri
  const blockPatterns = [
    "not available", "no vacancy", "stop sell",
    "bloccata", "bloccato", "blocked", "unavailable",
    "chiuso", "non disponibile", "imported"
  ];
  return !blockPatterns.some(pattern => lower.includes(pattern));
}

async function main() {
  // Elimina tutte le pulizie esistenti
  await prisma.cleaning.deleteMany({});
  console.log('Pulizie eliminate');
  
  // Trova tutte le prenotazioni
  const bookings = await prisma.booking.findMany({
    include: { property: true }
  });
  
  console.log(`Prenotazioni totali: ${bookings.length}`);
  
  let created = 0;
  let skipped = 0;
  
  for (const booking of bookings) {
    const isReal = isRealBooking(booking.guestName, booking.source);
    
    if (!isReal) {
      skipped++;
      continue;
    }
    
    // La pulizia è il giorno del checkout
    const cleaningDate = new Date(booking.checkOut);
    cleaningDate.setHours(10, 0, 0, 0);
    
    // Determina il nome da mostrare
    let displayName = booking.guestName;
    if (booking.source === 'booking' && booking.guestName?.toLowerCase().includes('closed')) {
      displayName = 'Prenotazione Booking';
    }
    
    await prisma.cleaning.create({
      data: {
        propertyId: booking.propertyId,
        bookingId: booking.id,
        scheduledDate: cleaningDate,
        scheduledTime: "10:00",
        status: "PENDING",
        notes: `Checkout: ${displayName}`
      }
    });
    
    created++;
  }
  
  console.log(`\nPulizie create: ${created}`);
  console.log(`Blocchi saltati: ${skipped}`);
  
  // Mostra pulizie gennaio
  const janCleanings = await prisma.cleaning.findMany({
    where: {
      scheduledDate: {
        gte: new Date('2026-01-14'),
        lt: new Date('2026-01-25')
      }
    },
    include: { property: { select: { name: true } } },
    orderBy: { scheduledDate: 'asc' }
  });
  
  console.log('\n--- Pulizie 14-24 Gennaio ---');
  janCleanings.forEach(c => {
    console.log(c.scheduledDate.toISOString().split('T')[0], '|', c.property.name, '|', c.notes);
  });
}

main().then(() => prisma.$disconnect());