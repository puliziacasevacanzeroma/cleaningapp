const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('demo123', 10);
  
  const demoUsers = [
    { email: 'proprietario@demo.com', name: 'Mario Rossi', role: 'OWNER' },
    { email: 'operatore@demo.com', name: 'Luigi Verdi', role: 'OPERATORE_PULIZIE' },
    { email: 'rider@demo.com', name: 'Paolo Bianchi', role: 'RIDER' },
  ];
  
  for (const user of demoUsers) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      console.log('Utente ' + user.email + ' esiste gia');
    } else {
      await prisma.user.create({
        data: {
          email: user.email,
          name: user.name,
          role: user.role,
          password: password
        }
      });
      console.log('Creato: ' + user.email);
    }
  }
  
  await prisma.user.update({
    where: { email: 'damianiariele@gmail.com' },
    data: { password: await bcrypt.hash('password123', 10) }
  });
  console.log('Password admin aggiornata');
}

main().then(function() { prisma.$disconnect(); });