import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
    
    const allProperties = await getPropertiesByOwner(user.id);
    
    // Escludi proprietà disattivate (INACTIVE) - quelle vanno solo in admin
    const properties = allProperties.filter(p => p.status !== "INACTIVE");
    
    // Dividi in attive e pending
    const activeProperties = properties.filter(p => p.status === "ACTIVE");
    const pendingProperties = properties.filter(p => p.status === "PENDING");
    
    return NextResponse.json({
      activeProperties,
      pendingProperties
    });
  } catch (error) {
    console.error("Errore lista proprietà:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}