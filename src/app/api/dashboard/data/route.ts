import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDashboardStats, getProperties } from "~/lib/firebase/firestore-data";

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
    const data = await getDashboardStats();
    const properties = await getProperties("ACTIVE");
    
    // Trasforma le pulizie nel formato atteso dal componente
    const transformedCleanings = data.cleanings.map((cleaning: any) => {
      // Trova la proprietà corrispondente
      const property = properties.find(p => p.id === cleaning.propertyId);
      
      return {
        id: cleaning.id,
        date: cleaning.scheduledDate?.toDate?.() || new Date(),
        scheduledTime: cleaning.scheduledTime || "10:00",
        status: cleaning.status || "pending",
        guestsCount: cleaning.guestsCount || 2,
        property: {
          id: cleaning.propertyId || "",
          name: cleaning.propertyName || property?.name || "Proprietà",
          address: property?.address || "",
          imageUrl: null,
        },
        operator: cleaning.operatorId ? {
          id: cleaning.operatorId,
          name: cleaning.operatorName || "Operatore",
        } : null,
        operators: [],
        booking: {
          guestName: cleaning.guestName || "",
          guestsCount: cleaning.guestsCount || 2,
        },
      };
    });

    // Trasforma gli operatori
    const transformedOperators = data.operators.map((op: any) => ({
      id: op.id,
      name: op.name || "Operatore",
    }));

    return NextResponse.json({
      stats: {
        cleaningsToday: data.cleaningsToday,
        operatorsActive: data.operatorsActive,
        propertiesTotal: data.propertiesTotal,
        checkinsWeek: 0,
      },
      cleanings: transformedCleanings,
      operators: transformedOperators,
    });
  } catch (error) {
    console.error("Errore fetch dashboard:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}