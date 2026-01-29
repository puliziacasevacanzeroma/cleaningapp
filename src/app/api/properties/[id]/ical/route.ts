import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const docSnap = await getDoc(doc(db, "properties", id));
    
    if (!docSnap.exists()) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    const data = docSnap.data();
    return NextResponse.json({ 
      icalUrl: data.icalUrl || null,
      lastSync: data.lastIcalSync || null 
    });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}