import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, updateDoc, deleteDoc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
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

// GET - Ottieni singolo utente
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getFirebaseUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const docRef = doc(db, "users", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    const data = docSnap.data();
    return NextResponse.json({
      id: docSnap.id,
      name: data.name || "",
      surname: data.surname || "",
      email: data.email || "",
      phone: data.phone || "",
      role: data.role || "",
      status: data.status || "ACTIVE",
    });
  } catch (error) {
    console.error("Errore GET utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modifica utente
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getFirebaseUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, surname, email, phone, role, status, password } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (name !== undefined) updateData.name = name;
    if (surname !== undefined) updateData.surname = surname;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await updateDoc(doc(db, "users", id), updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore PATCH utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Elimina utente
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getFirebaseUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await deleteDoc(doc(db, "users", id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore DELETE utente:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}