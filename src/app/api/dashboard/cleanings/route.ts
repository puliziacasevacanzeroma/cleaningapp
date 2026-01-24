import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCleaningsByDate, getProperties } from "~/lib/firebase/firestore-data";

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
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    
    const date = dateStr ? new Date(dateStr) : new Date();
    
    const cleanings = await getCleaningsByDate(date);
    const properties = await getProperties();

    const transformedCleanings = cleanings.map((cleaning: any) => {
      const property = properties.find(p => p.id === cleaning.propertyId);
      return {
        id: cleaning.id,
        date: cleaning.scheduledDate?.toDate?.() || new Date(),
        scheduledTime: cleaning.scheduledTime || "10:00",
        status: cleaning.status || "pending",
        guestsCount: cleaning.guestsCount || 2,
        // Prezzi
        price: cleaning.price || cleaning.manualPrice || property?.cleaningPrice || 0,
        contractPrice: property?.cleaningPrice || 0,
        priceModified: cleaning.priceModified || false,
        priceChangeReason: cleaning.priceChangeReason || null,
        // Tipo servizio
        serviceType: cleaning.serviceType || "STANDARD",
        serviceTypeName: cleaning.serviceTypeName || "Pulizia Standard",
        sgrossoReason: cleaning.sgrossoReason || null,
        sgrossoReasonLabel: cleaning.sgrossoReasonLabel || null,
        sgrossoNotes: cleaning.sgrossoNotes || null,
        notes: cleaning.notes || "",
        property: {
          id: cleaning.propertyId || "",
          name: cleaning.propertyName || property?.name || "Proprietà",
          address: property?.address || "",
          imageUrl: null,
          maxGuests: property?.maxGuests || 10,
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

    return NextResponse.json({ cleanings: transformedCleanings });
  } catch (error) {
    console.error("Errore fetch cleanings:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}