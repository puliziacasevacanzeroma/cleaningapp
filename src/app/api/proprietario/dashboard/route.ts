import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // 1. Proprietà del proprietario (filtrata con where)
    const propsSnap = await adminDb.collection("properties").where("ownerId", "==", user.id).get();
    const properties = propsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
    const propertyIds = properties.map(p => p.id);

    if (propertyIds.length === 0) {
      return NextResponse.json({
        stats: { properties: 0, bookings: 0, cleaningsToday: 0, monthlyEarnings: 0 },
        upcomingCleanings: [],
      });
    }

    // 2. Date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // 3. Pulizie prossimi 7 giorni PER LE SUE PROPRIETÀ (query filtrata!)
    // Firestore "in" supporta max 30 elementi - un proprietario ne ha max ~15
    const cleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "in", propertyIds).where("scheduledDate", ">=", Timestamp.fromDate(today)).where("scheduledDate", "<=", Timestamp.fromDate(nextWeek)).get();
    const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // 4. Pulizie di oggi
    const todayStr = today.toISOString().split('T')[0];
    const cleaningsToday = cleanings.filter(c => {
      const d = c.scheduledDate?.toDate?.();
      return d && d.toISOString().split('T')[0] === todayStr;
    });

    // 5. Prossime 5 pulizie ordinate
    const upcomingCleanings = cleanings
      .sort((a: any, b: any) => {
        const da = a.scheduledDate?.toDate?.() || new Date(0);
        const db2 = b.scheduledDate?.toDate?.() || new Date(0);
        return da.getTime() - db2.getTime();
      })
      .slice(0, 5);

    // 6. Prenotazioni attive (con checkout futuro)
    const bookingsSnap = await adminDb.collection("bookings").where("propertyId", "in", propertyIds).where("checkOut", ">=", Timestamp.fromDate(today)).get();

    return NextResponse.json({
      stats: {
        properties: properties.length,
        bookings: bookingsSnap.size,
        cleaningsToday: cleaningsToday.length,
        monthlyEarnings: 0,
      },
      upcomingCleanings: upcomingCleanings.map((c: any) => {
        const property = properties.find((p: any) => p.id === c.propertyId) as any;
        return {
          id: c.id,
          date: c.scheduledDate?.toDate?.() || new Date(),
          time: c.scheduledTime || "10:00",
          property: c.propertyName || property?.name || "N/A",
          address: property?.address || "N/A",
          status: c.status,
          operator: c.operatorName || null,
        };
      }),
    });
  } catch (error) {
    console.error("Errore dashboard proprietario:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}
