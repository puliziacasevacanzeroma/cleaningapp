import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, updateDoc } from "firebase/firestore";
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    const { id } = await params;
    const { status } = await req.json();
    
    await updateDoc(doc(db, "properties", id), { 
      status: status || "ACTIVE",
      updatedAt: new Date()
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore approvazione:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}