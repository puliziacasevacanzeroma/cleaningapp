# CleaningApp Setup Script
# Esegui questo script nella cartella del progetto T3

Write-Host "🚀 Configurazione CleaningApp in corso..." -ForegroundColor Cyan

# 1. File .env
$envContent = @"
DATABASE_URL="mongodb+srv://damianiariele_db_user:CleaningApp2024@cleaningapp-test.mgwxylc.mongodb.net/cleaningapp?retryWrites=true&w=majority"
NEXTAUTH_SECRET="cleaningapp-secret-key-2024-super-secure"
NEXTAUTH_URL="http://localhost:3000"
"@
Set-Content -Path ".env" -Value $envContent
Write-Host "✅ .env creato" -ForegroundColor Green

# 2. Schema Prisma
$prismaSchema = @"
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  email         String    @unique
  password      String
  name          String
  surname       String?
  role          String    @default("operator")
  phone         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  assignedCleanings Cleaning[] @relation("AssignedOperator")
  properties        Property[] @relation("PropertyOwner")
}

model Property {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  name        String
  address     String
  city        String?
  type        String?
  bedrooms    Int?
  bathrooms   Int?
  maxGuests   Int?
  icalUrl     String?
  notes       String?
  ownerId     String?  @db.ObjectId
  owner       User?    @relation("PropertyOwner", fields: [ownerId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  bookings    Booking[]
  cleanings   Cleaning[]
}

model Booking {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  propertyId  String   @db.ObjectId
  property    Property @relation(fields: [propertyId], references: [id])
  guestName   String
  guestEmail  String?
  guestPhone  String?
  checkIn     DateTime
  checkOut    DateTime
  guests      Int?
  source      String?
  status      String   @default("confirmed")
  notes       String?
  externalId  String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  cleaning    Cleaning?
}

model Cleaning {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  propertyId  String   @db.ObjectId
  property    Property @relation(fields: [propertyId], references: [id])
  bookingId   String?  @unique @db.ObjectId
  booking     Booking? @relation(fields: [bookingId], references: [id])
  operatorId  String?  @db.ObjectId
  operator    User?    @relation("AssignedOperator", fields: [operatorId], references: [id])
  date        DateTime
  time        String?
  status      String   @default("pending")
  type        String   @default("checkout")
  duration    Int?
  notes       String?
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
"@
Set-Content -Path "prisma/schema.prisma" -Value $prismaSchema
Write-Host "✅ schema.prisma creato" -ForegroundColor Green

# 3. Crea cartelle necessarie
New-Item -ItemType Directory -Force -Path "src/app/login" | Out-Null
New-Item -ItemType Directory -Force -Path "src/app/dashboard" | Out-Null
New-Item -ItemType Directory -Force -Path "src/app/dashboard/calendario-prenotazioni" | Out-Null
New-Item -ItemType Directory -Force -Path "src/app/dashboard/calendario-pulizie" | Out-Null
New-Item -ItemType Directory -Force -Path "src/app/dashboard/proprieta" | Out-Null
New-Item -ItemType Directory -Force -Path "src/app/dashboard/operatori" | Out-Null
New-Item -ItemType Directory -Force -Path "src/app/dashboard/report" | Out-Null
New-Item -ItemType Directory -Force -Path "src/app/dashboard/impostazioni" | Out-Null
New-Item -ItemType Directory -Force -Path "src/components" | Out-Null
New-Item -ItemType Directory -Force -Path "src/app/api/auth/[...nextauth]" | Out-Null
Write-Host "✅ Cartelle create" -ForegroundColor Green

# 4. Auth Config
$authConfig = @'
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "~/server/db";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
}

export const authConfig = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        const user = await db.user.findUnique({
          where: { email: credentials.email as string }
        });
        if (!user) {
          return null;
        }
        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!isPasswordValid) {
          return null;
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      }
    })
  ],
  callbacks: {
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub,
        role: token.role as string,
      },
    }),
    jwt: ({ token, user }) => {
      if (user) {
        token.role = (user as unknown as { role: string }).role;
      }
      return token;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
} satisfies NextAuthConfig;
'@
Set-Content -Path "src/server/auth/config.ts" -Value $authConfig
Write-Host "✅ auth/config.ts creato" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 Setup base completato!" -ForegroundColor Cyan
Write-Host "Ora esegui: npx prisma generate && npx prisma db push" -ForegroundColor Yellow
