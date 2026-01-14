const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Trova tutti i booking
  const bookings = await prisma.booking.findMany({
    orderBy: [{ propertyId: 'asc' }, { checkIn: 'asc' }, { createdAt: 'asc' }]
  });
  
  const seen = new Set();
  const toDelete = [];
  
  for (const b of bookings) {
    // Chiave univoca: propertyId + checkIn + checkOut + guestName
    const key = `${b.propertyId}-${b.checkIn.toISOString()}-${b.checkOut.toISOString()}-${b.guestName}`;
    
    if (seen.has(key)) {
      toDelete.push(b.id);
    } else {
      seen.add(key);
    }
  }
  
  console.log(`Trovati ${toDelete.length} duplicati da eliminare`);
  
  if (toDelete.length > 0) {
    const result = await prisma.booking.deleteMany({
      where: { id: { in: toDelete } }
    });
    console.log(`Eliminati ${result.count} duplicati`);
  }
  
  const remaining = await prisma.booking.count();
  console.log(`Prenotazioni rimanenti: ${remaining}`);
}

main().then(() => prisma.$disconnect());