const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('test123', 10);
  
  // Crea Rider
  const rider = await prisma.user.upsert({
    where: { email: 'rider@cleaningapp.it' },
    update: {},
    create: {
      email: 'rider@cleaningapp.it',
      password: password,
      name: 'Mario Rider',
      role: 'operator',
      operatorType: 'delivery',
      status: 'active'
    }
  });
  console.log('Rider creato:', rider.email);
  
  // Crea Operatore Pulizie
  const operatore = await prisma.user.upsert({
    where: { email: 'operatore@cleaningapp.it' },
    update: {},
    create: {
      email: 'operatore@cleaningapp.it',
      password: password,
      name: 'Luigi Pulizie',
      role: 'operator',
      operatorType: 'cleaning',
      status: 'active'
    }
  });
  console.log('Operatore creato:', operatore.email);
  
  // Crea Proprietario
  const proprietario = await prisma.user.upsert({
    where: { email: 'proprietario@cleaningapp.it' },
    update: {},
    create: {
      email: 'proprietario@cleaningapp.it',
      password: password,
      name: 'Giuseppe Rossi',
      surname: 'Rossi',
      phone: '+39 333 1234567',
      role: 'user',
      status: 'active'
    }
  });
  console.log('Proprietario creato:', proprietario.email);
  
  // Aggiorna proprietà a status active
  const props = await prisma.property.updateMany({
    data: { status: 'active' }
  });
  console.log('Proprietà aggiornate:', props.count);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());