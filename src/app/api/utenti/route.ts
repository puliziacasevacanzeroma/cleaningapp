import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { getUsers } from "~/lib/firebase/firestore-data";
import bcrypt from "bcryptjs";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

// GET - Lista utenti
export async function GET(request: Request) {
  const currentUser = await getFirebaseUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const users = await getUsers(role || undefined);

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Errore GET utenti:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// POST - Crea nuovo utente
export async function POST(request: Request) {
  const currentUser = await getFirebaseUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, surname, email, phone, role, password } = body;

    // Hash password
    const hashedPassword = await bcrypt.hash(password || "password123", 10);

    // Crea utente
    const docRef = await addDoc(collection(db, "users"), {
      name: name || "",
      surname: surname || "",
      email: email || "",
      phone: phone || "",
      role: role || "CLIENTE",
      status: "ACTIVE",
      password: hashedPassword,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ id: docRef.id, success: true }, { status: 201 });
  } catch (error) {
    console.error("Errore POST utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}