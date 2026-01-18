import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { cachedQuery } from "~/lib/cache";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // ⚡ USA CACHE REDIS - risposta 10x più veloce!
    const data = await cachedQuery("dashboard", async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - 7);

      const [cleaningsToday, operatorsActive, propertiesTotal, checkinsWeek, cleaningsOfToday, operators] = await Promise.all([
        db.cleaning.count({ where: { scheduledDate: { gte: today, lt: tomorrow } } }),
        db.user.count({ where: { role: "OPERATORE_PULIZIE" } }),
        db.property.count({ where: { status: "ACTIVE" } }),
        db.booking.count({ where: { checkIn: { gte: weekStart, lt: tomorrow } } }),
        db.cleaning.findMany({
          where: { scheduledDate: { gte: today, lt: tomorrow } },
          include: { 
            property: true, 
            operator: { select: { id: true, name: true } }, 
            booking: { select: { guestName: true } } 
          },
          orderBy: { scheduledTime: "asc" }
        }),
        db.user.findMany({
          where: { role: "OPERATORE_PULIZIE" },
          select: { id: true, name: true },
          orderBy: { name: "asc" }
        })
      ]);

      return {
        stats: { cleaningsToday, operatorsActive, propertiesTotal, checkinsWeek },
        cleanings: cleaningsOfToday,
        operators
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Errore fetch dashboard:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}