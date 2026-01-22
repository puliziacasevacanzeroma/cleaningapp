import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCleanings, getProperties, createCleaning } from "~/lib/firebase/firestore-data";
import { Timestamp } from "firebase/firestore";

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

export async function GET(request: Request) {
  const user = await getFirebaseUser();
  
  if (!user) {
    console.log("❌ Cleanings API: Utente non autenticato");
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const status = searchParams.get("status");
    const propertyId = searchParams.get("propertyId");
    
    console.log("🔍 Cleanings API - Filtri:", { dateStr, status, propertyId });
    
    const filters: any = {};
    if (dateStr) filters.date = new Date(dateStr);
    if (status) filters.status = status;

    let cleanings = await getCleanings(filters);
    console.log("📦 Cleanings totali recuperati:", cleanings.length);
    
    // Filtra per propertyId se specificato
    if (propertyId) {
      cleanings = cleanings.filter((c: any) => c.propertyId === propertyId);
      console.log("📦 Cleanings dopo filtro propertyId:", cleanings.length);
    }
    
    const properties = await getProperties();

    const transformedCleanings = cleanings.map((cleaning: any) => {
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
        booking: {
          guestName: cleaning.guestName || "",
          guestsCount: cleaning.guestsCount || 2,
        },
      };
    });

    return NextResponse.json({ cleanings: transformedCleanings });
  } catch (error) {
    console.error("Errore fetch cleanings:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getFirebaseUser();
  
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { propertyId, propertyName, scheduledDate, scheduledTime, notes } = body;

    const id = await createCleaning({
      propertyId,
      propertyName: propertyName || "",
      scheduledDate: Timestamp.fromDate(new Date(scheduledDate)),
      scheduledTime: scheduledTime || "10:00",
      status: "SCHEDULED",
      notes: notes || "",
    });

    return NextResponse.json({ id, success: true });
  } catch (error) {
    console.error("Errore creazione cleaning:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}