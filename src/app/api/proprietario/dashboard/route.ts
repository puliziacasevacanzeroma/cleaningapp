import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPropertiesByOwner, getCleanings, getBookings } from "~/lib/firebase/firestore-data";

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
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const userId = user.id;

    // Ottieni proprietà del proprietario
    const properties = await getPropertiesByOwner(userId);
    const propertyIds = properties.map(p => p.id);

    // Date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Ottieni tutte le pulizie e prenotazioni
    const [allCleanings, allBookings] = await Promise.all([
      getCleanings(),
      getBookings(),
    ]);

    // Filtra per proprietà del proprietario
    const myCleanings = allCleanings.filter(c => propertyIds.includes(c.propertyId));
    const myBookings = allBookings.filter(b => propertyIds.includes(b.propertyId));

    // Pulizie di oggi
    const todayStr = today.toISOString().split('T')[0];
    const cleaningsToday = myCleanings.filter(c => {
      const cleaningDate = c.scheduledDate?.toDate?.()?.toISOString().split('T')[0];
      return cleaningDate === todayStr;
    });

    // Pulizie prossimi 7 giorni
    const upcomingCleanings = myCleanings
      .filter(c => {
        const cleaningDate = c.scheduledDate?.toDate?.();
        return cleaningDate && cleaningDate >= today && cleaningDate < nextWeek;
      })
      .sort((a, b) => {
        const dateA = a.scheduledDate?.toDate?.() || new Date(0);
        const dateB = b.scheduledDate?.toDate?.() || new Date(0);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 5);

    // Prenotazioni attive
    const activeBookings = myBookings.filter(b => {
      const checkOut = b.checkOut?.toDate?.();
      return checkOut && checkOut >= new Date();
    });

    return NextResponse.json({
      stats: {
        properties: properties.length,
        bookings: activeBookings.length,
        cleaningsToday: cleaningsToday.length,
        monthlyEarnings: 0
      },
      upcomingCleanings: upcomingCleanings.map(c => {
        const property = properties.find(p => p.id === c.propertyId);
        return {
          id: c.id,
          date: c.scheduledDate?.toDate?.() || new Date(),
          time: c.scheduledTime || "10:00",
          property: c.propertyName || property?.name || "N/A",
          address: property?.address || "N/A",
          status: c.status,
          operator: c.operatorName || null
        };
      })
    });
  } catch (error) {
    console.error("Errore dashboard proprietario:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}