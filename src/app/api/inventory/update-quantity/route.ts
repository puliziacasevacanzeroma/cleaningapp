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

    const body = await req.json();
    
    // Accetta sia "id" che "itemId"
    const id = body.id || body.itemId;
    
    if (!id) {
      return NextResponse.json({ error: "ID mancante" }, { status: 400 });
    }

    const docRef = doc(db, "inventory", id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
    }

    // Calcola la nuova quantità
    let newQuantity: number;
    
    if (body.newQuantity !== undefined) {
      // Quantità assoluta
      newQuantity = body.newQuantity;
    } else if (body.quantity !== undefined) {
      // Quantità assoluta (altro nome)
      newQuantity = body.quantity;
    } else if (body.delta !== undefined) {
      // Delta: aggiungi/sottrai dalla quantità corrente
      const currentData = docSnap.data();
      const currentQty = currentData.quantity || 0;
      newQuantity = Math.max(0, currentQty + body.delta);
    } else {
      return NextResponse.json({ error: "Quantità mancante" }, { status: 400 });
    }

    // Aggiorna il documento
    await setDoc(docRef, {
      quantity: newQuantity,
      updatedAt: new Date()
    }, { merge: true });

    return NextResponse.json({ success: true, quantity: newQuantity });
  } catch (error: any) {
    console.error("Errore aggiornamento quantità:", error);
    return NextResponse.json({ 
      error: error.message || "Errore server",
      details: error.code || "unknown"
    }, { status: 500 });
  }
}
