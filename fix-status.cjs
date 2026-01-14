const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Aggiornamento proprietà in corso...');
  
  // Aggiorna tutte le proprietà a status "active"
  const result = await prisma.property.updateMany({
    data: { status: "active" }
  });
  
  console.log(`✅ Aggiornate ${result.count} proprietà a status "active"`);
  
  // Mostra quante proprietà ci sono ora
  const count = await prisma.property.count({ where: { status: "active" } });
  console.log(`📊 Totale proprietà attive: ${count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
