const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Trova tutti i booking
  const bookings = await prisma.booking.findMany({
    orderBy: [{ propertyId: 'asc' }, { guestName: 'asc' }, { createdAt: 'asc' }]
  });
  
  // Raggruppa per propertyId + guestName (indipendentemente dalla source)
  const groups = {};
  for (const b of bookings) {
    const key = `${b.propertyId}-${b.guestName}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  }
  
  const toDelete = [];
  
  // Per ogni gruppo con più di 1 elemento, tieni solo l'ultimo (più recente)
  for (const key in groups) {
    const group = groups[key];
    if (group.length > 1) {
      // Ordina per createdAt, elimina tutti tranne l'ultimo
      group.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      for (let i = 0; i < group.length - 1; i++) {
        toDelete.push(group[i].id);
        console.log(`Elimino: ${group[i].guestName} | ${group[i].source}`);
      }
    }
  }
  
  console.log(`\nTrovati ${toDelete.length} duplicati da eliminare`);
  
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