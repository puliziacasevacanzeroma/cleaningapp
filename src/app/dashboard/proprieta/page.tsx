import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { ProprietaClient } from "~/components/dashboard/ProprietaClient";

export default async function ProprietaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Calcola primo e ultimo giorno del mese corrente
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [activeProperties, pendingProperties] = await Promise.all([
    db.property.findMany({
      where: { status: "ACTIVE" },
      include: {
        _count: { select: { bookings: true, cleanings: true } },
        owner: { select: { name: true } },
        cleanings: {
          where: {
            scheduledDate: {
              gte: firstDayOfMonth,
              lte: lastDayOfMonth
            },
            status: { in: ["COMPLETED", "SCHEDULED", "IN_PROGRESS"] }
          },
          select: {
            id: true,
            price: true,
            status: true,
            scheduledDate: true
          }
        }
      },
      orderBy: { name: "asc" },
    }),
    db.property.findMany({
      where: { status: "PENDING" },
      include: { owner: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    })
  ]);

  // Calcola totale mensile per ogni proprietà
  const propertiesWithMonthlyTotal = activeProperties.map(property => {
    const monthlyCleanings = property.cleanings || [];
    const completedCleanings = monthlyCleanings.filter(c => c.status === "COMPLETED");
    const monthlyTotal = completedCleanings.reduce((sum, c) => sum + (c.price || property.cleaningPrice || 0), 0);
    const cleaningsThisMonth = monthlyCleanings.length;
    const completedThisMonth = completedCleanings.length;
    
    return {
      ...property,
      cleaningPrice: property.cleaningPrice || 0,
      monthlyTotal,
      cleaningsThisMonth,
      completedThisMonth,
      cleanings: undefined // Rimuovi array per ridurre payload
    };
  });

  return (
    <ProprietaClient
      activeProperties={JSON.parse(JSON.stringify(propertiesWithMonthlyTotal))}
      pendingProperties={JSON.parse(JSON.stringify(pendingProperties))}
    />
  );
}