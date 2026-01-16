import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { ProprietaClient } from "~/components/dashboard/ProprietaClient";
import { unstable_cache } from "next/cache";

// Cache delle proprietà - si aggiorna ogni 30 secondi
const getProperties = unstable_cache(
  async () => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [activeProperties, pendingProperties, suspendedProperties] = await Promise.all([
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

    return { activeProperties: propertiesWithMonthlyTotal, pendingProperties, suspendedProperties };
  },
  ["properties-list"],
  { revalidate: 30, tags: ["properties"] }
);

export default async function ProprietaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { activeProperties, pendingProperties, suspendedProperties } = await getProperties();

  return (
    <ProprietaClient
      activeProperties={JSON.parse(JSON.stringify(activeProperties))}
      pendingProperties={JSON.parse(JSON.stringify(pendingProperties))}
      suspendedProperties={JSON.parse(JSON.stringify(suspendedProperties))}
    />
  );
}