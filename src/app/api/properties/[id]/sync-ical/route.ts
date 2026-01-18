import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const docSnap = await getDoc(doc(db, "properties", id));
    
    if (!docSnap.exists()) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    // Aggiorna timestamp sync
    await updateDoc(doc(db, "properties", id), { 
      lastIcalSync: new Date(),
      updatedAt: new Date()
    });
    
    return NextResponse.json({ success: true, message: "Sincronizzazione completata" });
  } catch (error) {
    console.error("Errore sync iCal:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}