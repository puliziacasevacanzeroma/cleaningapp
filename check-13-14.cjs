const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const bookings = await prisma.booking.findMany({
    where: {
      checkIn: {
        gte: new Date('2026-01-13'),
        lt: new Date('2026-01-15')
      }
    },
    select: {
      guestName: true,
      checkIn: true,
      checkOut: true,
      source: true
    }
  });
  
  console.log(`Trovate ${bookings.length} prenotazioni dal 13-14 gennaio:\n`);
  bookings.forEach(b => {
    console.log(`Nome: ${b.guestName}`);
    console.log(`CheckIn: ${b.checkIn}`);
    console.log(`CheckOut: ${b.checkOut}`);
    console.log(`Source: ${b.source}`);
    console.log('---');
  });
}

main().then(() => prisma.$disconnect());