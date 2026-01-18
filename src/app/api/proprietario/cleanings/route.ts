import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCleanings, getPropertiesByOwner } from "~/lib/firebase/firestore-data";

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
    const propertyIds = properties.map(p => p.id);
    
    const allCleanings = await getCleanings();
    const cleanings = allCleanings.filter(c => propertyIds.includes(c.propertyId));
    
    return NextResponse.json(cleanings.map(c => ({
      ...c,
      scheduledDate: c.scheduledDate?.toDate?.() || c.scheduledDate,
      property: properties.find(p => p.id === c.propertyId)
    })));
  } catch (error) {
    console.error("Errore pulizie proprietario:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}