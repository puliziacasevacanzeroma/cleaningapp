import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPropertiesByOwner } from "~/lib/firebase/firestore-data";
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

export async function POST() {
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const properties = await getPropertiesByOwner(user.id);
    
    for (const property of properties) {
      if (property.icalUrl) {
        await updateDoc(doc(db, "properties", property.id), { 
          lastIcalSync: new Date(),
          updatedAt: new Date()
        });
      }
    }
    
    return NextResponse.json({ success: true, synced: properties.length });
  } catch (error) {
    console.error("Errore sync iCal:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}