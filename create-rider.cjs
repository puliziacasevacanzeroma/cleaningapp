const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('rider123', 10);
  
  const rider = await prisma.user.create({
    data: {
      email: 'rider@cleaningapp.it',
      password: password,
      name: 'Mario Rider',
      role: 'operator',
      operatorType: 'delivery',
      status: 'active'
    }
  });
  
  console.log('Rider creato:', rider.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());