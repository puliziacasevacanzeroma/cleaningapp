import { NextResponse } from "next/server";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    
    const q = query(collection(db, "users"), where("email", "==", email));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }
    
    const userDoc = snapshot.docs[0];
    await updateDoc(doc(db, "users", userDoc.id), { role: "ADMIN" });
    
    return NextResponse.json({ success: true, message: "Utente promosso ad admin" });
  } catch (error) {
    console.error("Errore make-admin:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}