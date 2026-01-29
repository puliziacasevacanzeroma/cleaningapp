import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc } from "firebase/firestore";
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const docSnap = await getDoc(doc(db, "cleanings", id));
    
    if (!docSnap.exists()) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    const data = docSnap.data();
    return NextResponse.json({
      id: docSnap.id,
      ...data,
      scheduledDate: data.scheduledDate?.toDate?.() || data.scheduledDate
    });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}