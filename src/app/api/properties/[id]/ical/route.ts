import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const docSnap = await adminDb.collection("properties").doc(id).get();
    
    if (!docSnap.exists) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    const data = docSnap.data() as Record<string, any>;
    return NextResponse.json({ 
      icalUrl: data.icalUrl || null,
      lastSync: data.lastIcalSync || null 
    });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}