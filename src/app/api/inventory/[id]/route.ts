import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const docSnap = await getDoc(doc(db, "inventory", id));
    if (!docSnap.exists()) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    return NextResponse.json({ id: docSnap.id, ...docSnap.data() });
  } catch (error) {
    console.error("Errore GET inventory:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const data = await req.json();
    
    // Rimuovi campi non modificabili
    delete data.id;
    delete data.createdAt;
    
    await updateDoc(doc(db, "inventory", id), { 
      ...data, 
      updatedAt: new Date() 
    });
    
    return NextResponse.json({ success: true, message: "Articolo aggiornato" });
  } catch (error) {
    console.error("Errore PUT inventory:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    await deleteDoc(doc(db, "inventory", id));
    
    return NextResponse.json({ success: true, message: "Articolo eliminato" });
  } catch (error) {
    console.error("Errore DELETE inventory:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
