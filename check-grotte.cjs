const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Trova la proprietà Grotte
  const property = await prisma.property.findFirst({
    where: { name: { contains: "Grotte" } }
  });
  
  if (!property) {
    console.log("Proprietà Grotte non trovata");
    return;
  }
  
  console.log(`Proprietà: ${property.name} (ID: ${property.id})\n`);
  
  // Trova tutte le prenotazioni per questa proprietà
  const bookings = await prisma.booking.findMany({
    where: { propertyId: property.id },
    orderBy: { checkIn: 'asc' }
  });
  
  console.log(`Totale prenotazioni: ${bookings.length}\n`);
  
  bookings.forEach(b => {
    console.log(`Nome: ${b.guestName}`);
    console.log(`CheckIn: ${b.checkIn.toLocaleDateString('it-IT')}`);
    console.log(`CheckOut: ${b.checkOut.toLocaleDateString('it-IT')}`);
    console.log(`Source: ${b.source}`);
    console.log('---');
  });
}

main().then(() => prisma.$disconnect());