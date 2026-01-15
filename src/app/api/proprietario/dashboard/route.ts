import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const userId = session.user.id;

    const propertiesCount = await db.property.count({
      where: { ownerId: userId }
    });

    const properties = await db.property.findMany({
      where: { ownerId: userId },
      select: { id: true }
    });

    const propertyIds = properties.map(p => p.id);

    const bookingsCount = await db.booking.count({
      where: {
        propertyId: { in: propertyIds },
        checkOut: { gte: new Date() }
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const cleaningsTodayCount = await db.cleaning.count({
      where: {
        propertyId: { in: propertyIds },
        scheduledDate: { gte: today, lt: tomorrow }
      }
    });

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const upcomingCleanings = await db.cleaning.findMany({
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
    });

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Errore dashboard proprietario:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
} 
