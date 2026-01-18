import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getProperties } from "~/lib/firebase/firestore-data";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getFirebaseUser();
  
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const [activeProperties, pendingProperties, suspendedProperties] = await Promise.all([
      getProperties("ACTIVE"),
      getProperties("PENDING"),
      getProperties("SUSPENDED"),
    ]);

    // Aggiungi dati extra per compatibilità
    const propertiesWithExtras = activeProperties.map(prop => ({
      ...prop,
      cleaningPrice: prop.cleaningPrice || 0,
      monthlyTotal: 0,
      cleaningsThisMonth: 0,
      completedThisMonth: 0,
      _count: { bookings: 0, cleanings: 0 },
      owner: { name: prop.ownerName || "" },
    }));

    return NextResponse.json({
      activeProperties: propertiesWithExtras,
      pendingProperties: pendingProperties.map(p => ({
        ...p,
        owner: { name: p.ownerName || "", email: "" }
      })),
      suspendedProperties: suspendedProperties.map(p => ({
        ...p,
        owner: { name: p.ownerName || "", email: "" },
        _count: { bookings: 0, cleanings: 0 }
      })),
      proprietari: [],
    });
  } catch (error) {
    console.error("Errore fetch proprietà:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}