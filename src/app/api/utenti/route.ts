import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getUsers } from "~/lib/firebase/firestore-data-admin";
import bcrypt from "bcryptjs";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, UserCreateSchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// GET - Lista utenti
export async function GET(request: Request) {
  const currentUser = await getApiUser();
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
  const currentUser = await getApiUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const body = await validateBody(request, UserCreateSchema);
    if (body instanceof Response) return body;
    const { name, surname, email, phone, role, password } = body;

    // Hash password
    const hashedPassword = await bcrypt.hash(password || "password123", 10);

    // Crea utente
    const docRef = await adminDb.collection("users").add({
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