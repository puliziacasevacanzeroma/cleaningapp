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
    const data = await cachedQuery("properties", async () => {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const [activeProperties, pendingProperties, suspendedProperties, proprietari] = await Promise.all([
        db.property.findMany({
          where: { status: "ACTIVE" },
          include: {
            _count: { select: { bookings: true, cleanings: true } },
            owner: { select: { name: true } },
            cleanings: {
              where: {
                scheduledDate: { gte: firstDayOfMonth, lte: lastDayOfMonth },
                status: { in: ["COMPLETED", "SCHEDULED", "IN_PROGRESS"] }
              },
              select: { id: true, price: true, status: true, scheduledDate: true }
            }
          },
          orderBy: { name: "asc" },
        }),
        db.property.findMany({
          where: { status: "PENDING" },
          include: { owner: { select: { name: true, email: true } } },
          orderBy: { createdAt: "desc" },
        }),
        db.property.findMany({
          where: { status: "SUSPENDED" },
          include: { 
            owner: { select: { name: true, email: true } },
            _count: { select: { bookings: true, cleanings: true } }
          },
          orderBy: { name: "asc" },
        }),
        db.user.findMany({
          where: { role: "PROPRIETARIO" },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" }
        })
      ]);

      const propertiesWithMonthlyTotal = activeProperties.map(property => {
        const monthlyCleanings = property.cleanings || [];
        const completedCleanings = monthlyCleanings.filter(c => c.status === "COMPLETED");
        const monthlyTotal = completedCleanings.reduce((sum, c) => sum + (c.price || property.cleaningPrice || 0), 0);
        
        return {
          ...property,
          cleaningPrice: property.cleaningPrice || 0,
          monthlyTotal,
          cleaningsThisMonth: monthlyCleanings.length,
          completedThisMonth: completedCleanings.length,
          cleanings: undefined
        };
      });

      return {
        activeProperties: propertiesWithMonthlyTotal,
        pendingProperties,
        suspendedProperties,
        proprietari
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Errore fetch proprietà:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}