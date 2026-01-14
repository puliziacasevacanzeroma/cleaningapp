const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const bookings = await prisma.booking.findMany({
    where: { source: "oktorate" },
    include: { property: { select: { name: true } } },
    orderBy: [{ property: { name: 'asc' } }, { checkIn: 'asc' }]
  });
  
  console.log(`Totale prenotazioni Octorate: ${bookings.length}\n`);
  
  let currentProperty = "";
  bookings.forEach(b => {
    if (b.property.name !== currentProperty) {
      currentProperty = b.property.name;
      console.log(`\n=== ${currentProperty} ===`);
    }
    const checkIn = b.checkIn.toLocaleDateString('it-IT');
    const checkOut = b.checkOut.toLocaleDateString('it-IT');
    console.log(`  ${b.guestName} | ${checkIn} - ${checkOut}`);
  });
}

main().then(() => prisma.$disconnect());