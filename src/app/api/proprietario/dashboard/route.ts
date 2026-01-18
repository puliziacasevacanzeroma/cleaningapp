import { NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { db } from "~/server/db";
import { cachedQuery } from "~/lib/cache";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const userId = user.id;

    // ⚡ USA CACHE REDIS - cache per utente specifico
    const data = await cachedQuery(`proprietario-dashboard-${userId}`, async () => {
      const propertiesCount = await db.property.count({
        where: { clientId: userId }
      });

      const properties = await db.property.findMany({
        where: { clientId: userId },
        select: { id: true }
      });

      const propertyIds = properties.map(p => p.id);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const [bookingsCount, cleaningsTodayCount, upcomingCleanings] = await Promise.all([
        db.booking.count({
          where: {
            propertyId: { in: propertyIds },
            checkOut: { gte: new Date() }
          }
        }),
        db.cleaning.count({
          where: {
            propertyId: { in: propertyIds },
            scheduledDate: { gte: today, lt: tomorrow }
          }
        }),
        db.cleaning.findMany({
          where: {
            propertyId: { in: propertyIds },
            scheduledDate: { gte: today, lt: nextWeek }
          },
          include: {
            property: { select: { name: true, address: true } },
            operator: { select: { name: true } }
          },
          orderBy: { scheduledDate: "asc" },
          take: 5
        })
      ]);

      return {
        stats: {
          properties: propertiesCount,
          bookings: bookingsCount,
          cleaningsToday: cleaningsTodayCount,
          monthlyEarnings: 0
        },
        upcomingCleanings: upcomingCleanings.map(c => ({
          id: c.id,
          date: c.scheduledDate,
          time: c.scheduledTime,
          property: c.property?.name || "N/A",
          address: c.property?.address || "N/A",
          status: c.status,
          operator: c.operator?.name || null
        }))
      };
    }, 60);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Errore dashboard proprietario:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}