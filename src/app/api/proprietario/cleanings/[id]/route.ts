import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const docSnap = await adminDb.collection("cleanings").doc(id).get();
    
    if (!docSnap.exists) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    const data = docSnap.data() as Record<string, any>;
    return NextResponse.json({
      id: docSnap.id,
      ...data,
      scheduledDate: data.scheduledDate?.toDate?.() || data.scheduledDate
    });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}