const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Verifica se è un blocco (non una vera prenotazione)
function isBlockedEntry(guestName) {
  if (!guestName) return false;
  const lower = guestName.toLowerCase();
  const blockPatterns = [
    "not available", "closed", "no vacancy", "stop sell",
    "bloccata", "bloccato", "blocked", "unavailable",
    "chiuso", "non disponibile", "imported"
  ];
  return blockPatterns.some(pattern => lower.includes(pattern));
}

async function main() {
  // Trova tutte le prenotazioni valide (non blocchi)
  const bookings = await prisma.booking.findMany({
    include: { property: true }
  });
  
  const validBookings = bookings.filter(b => !isBlockedEntry(b.guestName));
  
  console.log(`Prenotazioni totali: ${bookings.length}`);
  console.log(`Prenotazioni valide (non blocchi): ${validBookings.length}`);
  
  let created = 0;
  let skipped = 0;
  
  for (const booking of validBookings) {
    // La pulizia è il giorno del checkout
    const cleaningDate = new Date(booking.checkOut);
    cleaningDate.setHours(10, 0, 0, 0); // Default ore 10:00
    
    // Verifica se esiste già una pulizia per questa proprietà in questa data
    const existing = await prisma.cleaning.findFirst({
      where: {
        propertyId: booking.propertyId,
        scheduledDate: cleaningDate,
        bookingId: booking.id
      }
    });
    
    if (existing) {
      skipped++;
      continue;
    }
    
    // Crea la pulizia
    await prisma.cleaning.create({
      data: {
        propertyId: booking.propertyId,
        bookingId: booking.id,
        scheduledDate: cleaningDate,
        scheduledTime: "10:00",
        status: "PENDING",
        notes: `Checkout: ${booking.guestName || 'Ospite'}`
      }
    });
    
    created++;
  }
  
  console.log(`\nPulizie create: ${created}`);
  console.log(`Pulizie già esistenti (saltate): ${skipped}`);
  
  const total = await prisma.cleaning.count();
  console.log(`Totale pulizie nel DB: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });