import { db } from "~/server/db";
import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { CalendarioPrenotazioniProprietario } from "~/components/proprietario/CalendarioPrenotazioniProprietario";

export default async function CalendarioPrenotazioniPage() {
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

  // Carica prenotazioni del mese corrente e prossimo
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const propertyIds = properties.map(p => p.id);

  const bookings = await db.booking.findMany({
    where: {
      propertyId: { in: propertyIds },
      OR: [
        {
          checkIn: { gte: startDate, lte: endDate }
        },
        {
          checkOut: { gte: startDate, lte: endDate }
        },
        {
          AND: [
            { checkIn: { lte: startDate } },
            { checkOut: { gte: endDate } }
          ]
        }
      ]
    },
    select: {
      id: true,
      propertyId: true,
      guestName: true,
      checkIn: true,
      checkOut: true,
      status: true
    },
    orderBy: { checkIn: "asc" }
  });

  return (
    <CalendarioPrenotazioniProprietario 
      properties={properties}
      bookings={JSON.parse(JSON.stringify(bookings))}
    />
  );
}

