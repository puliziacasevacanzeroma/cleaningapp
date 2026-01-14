const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Trova tutti i diversi guestName
  const bookings = await prisma.booking.findMany({
    select: {
      guestName: true,
      source: true,
    }
  });
  
  // Conta per guestName
  const names = {};
  const sources = {};
  
  bookings.forEach(b => {
    const name = b.guestName || "null";
    const source = b.source || "null";
    names[name] = (names[name] || 0) + 1;
    sources[source] = (sources[source] || 0) + 1;
  });
  
  console.log("\n=== SOURCES (provider) ===");
  Object.entries(sources).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => {
    console.log(`${k}: ${v}`);
  });
  
  console.log("\n=== GUEST NAMES (top 30) ===");
  Object.entries(names).sort((a,b) => b[1] - a[1]).slice(0, 30).forEach(([k,v]) => {
    console.log(`${k}: ${v}`);
  });
}

main().then(() => prisma.$disconnect());