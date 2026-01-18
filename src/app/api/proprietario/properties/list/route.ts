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
    const data = await cachedQuery(`proprietario-properties-${userId}`, async () => {
      const properties = await db.property.findMany({
        where: { clientId: userId },
        include: {
          _count: {
            select: { bookings: true, cleanings: true }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      const activeProperties = properties.filter(p => p.status === "ACTIVE" || p.status === "active");
      const pendingProperties = properties.filter(p => p.status === "PENDING" || p.status === "pending");

      return {
        activeProperties,
        pendingProperties
      };
    }, 300);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Errore lista proprietà:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}