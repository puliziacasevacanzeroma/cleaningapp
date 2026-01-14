import { db } from "~/server/db";
import { CalendarioPulizieClient } from "~/components/dashboard/CalendarioPulizieAdminClient";

export default async function CalendarioPuliziePage() {
  const properties = await db.property.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      address: true,
    },
    orderBy: { name: "asc" }
  });

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const cleanings = await db.cleaning.findMany({
    where: {
      scheduledDate: { gte: startDate, lte: endDate }
    },
    select: {
      id: true,
      propertyId: true,
      scheduledDate: true,
      status: true,
      scheduledTime: true,
      operator: {
        select: { id: true, name: true }
      }
    },
    orderBy: { scheduledDate: "asc" }
  });

  const operators = await db.user.findMany({
    where: { role: "OPERATORE_PULIZIE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  return (
    <CalendarioPulizieClient
      properties={properties}
      cleanings={JSON.parse(JSON.stringify(cleanings))}
      operators={operators}
    />
  );
}