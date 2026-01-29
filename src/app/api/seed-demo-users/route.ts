/**
 * API: POST /api/seed-demo-users
 * 
 * Crea gli utenti demo per test:
 * - admin@demo.com (ADMIN)
 * - proprietario@demo.com (PROPRIETARIO)
 * - operatore@demo.com (OPERATORE_PULIZIE)
 * - rider@demo.com (RIDER)
 * 
 * Password per tutti: demo123
 * 
 * ATTENZIONE: Chiamare UNA SOLA VOLTA per popolare il database!
 */

import { NextRequest, NextResponse } from "next/server";
import { collection, query, where, getDocs, addDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import bcrypt from "bcryptjs";

const demoUsers = [
  {
    email: "admin@demo.com",
    name: "Admin Demo",
    phone: "+39 333 1234567",
    role: "ADMIN",
    status: "ACTIVE",
  },
  {
    email: "proprietario@demo.com",
    name: "Mario Rossi",
    phone: "+39 333 2345678",
    role: "PROPRIETARIO",
    status: "ACTIVE",
  },
  {
    email: "operatore@demo.com",
    name: "Lucia Bianchi",
    phone: "+39 333 3456789",
    role: "OPERATORE_PULIZIE",
    status: "ACTIVE",
  },
  {
    email: "rider@demo.com",
    name: "Giuseppe Verdi",
    phone: "+39 333 4567890",
    role: "RIDER",
    status: "ACTIVE",
  },
];

export async function POST(request: NextRequest) {
  try {
    const results: any[] = [];
    const password = "demo123";
    
    // Hash password una volta sola
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    for (const user of demoUsers) {
      // Verifica se esiste già
      const existingQuery = query(
        collection(db, "users"),
        where("email", "==", user.email)
      );
      const existing = await getDocs(existingQuery);

      if (!existing.empty) {
        results.push({
          email: user.email,
          status: "ALREADY_EXISTS",
          id: existing.docs[0].id,
        });
        continue;
      }

      // Crea utente
      const userData = {
        email: user.email,
        name: user.name,
        phone: user.phone,
        password: hashedPassword,
        role: user.role,
        status: user.status,
        contractAccepted: true,
        billingCompleted: true,
        registrationMethod: "demo",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(collection(db, "users"), userData);
      
      results.push({
        email: user.email,
        status: "CREATED",
        id: docRef.id,
        role: user.role,
      });

      console.log(`✅ Creato utente demo: ${user.email} (${user.role})`);
    }

    return NextResponse.json({
      success: true,
      message: "Utenti demo creati/verificati",
      results,
      credentials: {
        password: "demo123",
        users: demoUsers.map(u => ({ email: u.email, role: u.role })),
      },
    });

  } catch (error) {
    console.error("❌ Errore creazione utenti demo:", error);
    return NextResponse.json(
      { error: "Errore durante la creazione degli utenti demo" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    info: "Chiama POST /api/seed-demo-users per creare gli utenti demo",
    users: demoUsers.map(u => ({ email: u.email, role: u.role })),
    password: "demo123",
  });
}
