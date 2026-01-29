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
      
      // 🔥 LEGGI l'array operators dal database (struttura: [{id, name}])
      let operatorsFromDb: Array<{id: string, name: string}> = [];
      
      // Caso 1: operators è un array
      if (Array.isArray(cleaning.operators) && cleaning.operators.length > 0) {
        operatorsFromDb = cleaning.operators.filter((op: any) => op && op.id);
      }
      // Caso 2: solo operatorId singolo (vecchio formato)
      else if (cleaning.operatorId) {
        operatorsFromDb = [{
          id: cleaning.operatorId,
          name: cleaning.operatorName || "Operatore"
        }];
      }

      console.log(`📋 ${cleaning.propertyName}: ${operatorsFromDb.length} operatori dal DB`);

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
          maxGuests: property?.maxGuests || 10,
        },
        // Singolo operatore per retrocompatibilità
        operator: operatorsFromDb[0] ? {
          id: operatorsFromDb[0].id,
          name: operatorsFromDb[0].name,
        } : null,
        // 🔥 STRUTTURA CHE IL COMPONENTE SI ASPETTA: [{id, operator: {id, name}}]
        operators: operatorsFromDb.map(op => ({
          id: op.id,
          operator: { id: op.id, name: op.name }
        })),
        booking: {
          guestName: cleaning.guestName || "",
          guestsCount: cleaning.guestsCount || 2,
        },
      };
    });

    // Trasforma gli operatori disponibili
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
