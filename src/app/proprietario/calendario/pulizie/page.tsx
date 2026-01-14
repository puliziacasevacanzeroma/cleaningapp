import { db } from "~/server/db";
import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { CalendarioPulizieProprietario } from "~/components/proprietario/CalendarioPulizieProprietario";

export default async function CalendarioPuliziePage() {
  const session = await auth();
  
  if (!session) {
    redirect("/login");
  }

  // Carica proprietà dell'owner
  const properties = await db.property.findMany({
    where: { 
      clientId: session.user.id,
      status: "ACTIVE"
    },
    select: {
      id: true,
      name: true,
      address: true,
    },
    orderBy: { name: "asc" }
  });

  // Carica pulizie del mese corrente e prossimo
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const propertyIds = properties.map(p => p.id);

  const cleanings = await db.cleaning.findMany({
    where: {
      propertyId: { in: propertyIds },
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

  return (
    <CalendarioPulizieProprietario 
      properties={properties}
      cleanings={JSON.parse(JSON.stringify(cleanings))}
    />
  );
}

