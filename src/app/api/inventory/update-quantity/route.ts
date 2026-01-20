import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, setDoc } from "firebase/firestore";
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

export async function POST(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id, quantity } = await req.json();
    
    if (!id) {
      return NextResponse.json({ error: "ID mancante" }, { status: 400 });
    }

    const docRef = doc(db, "inventory", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
    }

    // Usa setDoc con merge per essere sicuri
    await setDoc(docRef, {
      quantity: quantity,
      updatedAt: new Date()
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Errore aggiornamento quantità:", error);
    return NextResponse.json({ 
      error: error.message || "Errore server",
      details: error.code || "unknown"
    }, { status: 500 });
  }
}
