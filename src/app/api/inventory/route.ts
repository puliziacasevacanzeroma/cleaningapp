import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, addDoc, getDocs, Timestamp } from "firebase/firestore";
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

export async function GET() {
  try {
    const snapshot = await getDocs(collection(db, "inventory"));
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(items);
  } catch (error) {
    console.error("Errore inventario:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const data = await req.json();
    const docRef = await addDoc(collection(db, "inventory"), {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    return NextResponse.json({ id: docRef.id, ...data });
  } catch (error) {
    console.error("Errore creazione inventario:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}