const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.booking.deleteMany({
    where: { source: "ICAL" }
  });
  console.log(`Eliminate ${deleted.count} prenotazioni ICAL`);
}

main().then(() => prisma.$disconnect());