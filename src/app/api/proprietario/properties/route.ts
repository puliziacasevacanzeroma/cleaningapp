import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { getPropertiesByOwner } from "~/lib/firebase/firestore-data";

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
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const properties = await getPropertiesByOwner(user.id);
    return NextResponse.json(properties);
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const data = await req.json();
    
    const docRef = await addDoc(collection(db, "properties"), {
      ...data,
      ownerId: user.id,
      ownerName: user.name || user.email,
      ownerEmail: user.email,
      status: "PENDING",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    return NextResponse.json({ id: docRef.id, success: true });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}