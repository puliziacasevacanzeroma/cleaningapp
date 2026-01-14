const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Trova tutte le prenotazioni Booking.com senza pulizia
  const bookingReservations = await prisma.booking.findMany({
    where: { source: 'booking' },
    include: { 
      property: true,
      cleaning: true 
    }
  });

  console.log(`Trovate ${bookingReservations.length} prenotazioni Booking.com`);

  let created = 0;
  let skipped = 0;

  for (const booking of bookingReservations) {
    // Se ha già una pulizia, skip
    if (booking.cleaning) {
      skipped++;
      continue;
    }

    // Crea pulizia per il giorno del checkout
    await prisma.cleaning.create({
      data: {
        propertyId: booking.propertyId,
        bookingId: booking.id,
        scheduledDate: booking.checkOut,
        scheduledTime: '10:00',
        status: 'PENDING',
        type: 'CHECKOUT',
        price: booking.property.cleaningPrice || 50,
        checklistDone: false
      }
    });

    created++;
    console.log(`Creata pulizia: ${booking.property.name} - ${booking.checkOut.toISOString().slice(0,10)}`);
  }

  console.log(`\n=== COMPLETATO ===`);
  console.log(`Pulizie create: ${created}`);
  console.log(`Saltate (già esistenti): ${skipped}`);
}

main().then(() => prisma.$disconnect());