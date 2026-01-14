const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Trova proprietà Lungotevere
  const property = await prisma.property.findFirst({
    where: { name: { contains: "Lungotevere" } }
  });
  
  if (!property) {
    console.log("Non trovata");
    return;
  }
  
  console.log(`Proprietà: ${property.name}\n`);
  
  const bookings = await prisma.booking.findMany({
    where: { propertyId: property.id },
    orderBy: { checkIn: 'asc' }
  });
  
  console.log(`Totale prenotazioni: ${bookings.length}\n`);
  
  bookings.forEach(b => {
    const checkIn = b.checkIn.toISOString().split('T')[0];
    const checkOut = b.checkOut.toISOString().split('T')[0];
    console.log(`ID: ${b.id} | ${b.guestName} | ${checkIn} - ${checkOut} | source: ${b.source}`);
  });
}

main().then(() => prisma.$disconnect());