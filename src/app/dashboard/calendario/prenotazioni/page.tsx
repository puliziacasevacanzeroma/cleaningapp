import { db } from "~/server/db";
import { CalendarioPrenotazioniClient } from "~/components/dashboard/CalendarioPrenotazioniClient";
import { CalendarioPrenotazioniMobile } from "~/components/dashboard/CalendarioPrenotazioniMobile";

export default async function CalendarioPrenotazioniPage() {
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

  const bookings = await db.booking.findMany({
    where: {
      OR: [
        { checkIn: { gte: startDate, lte: endDate } },
        { checkOut: { gte: startDate, lte: endDate } },
        { AND: [{ checkIn: { lte: startDate } }, { checkOut: { gte: endDate } }] }
      ]
    },
    select: {
      id: true,
      propertyId: true,
      guestName: true,
      checkIn: true,
      checkOut: true,
      status: true,
      source: true
    },
    orderBy: { checkIn: "asc" }
  });

  const serializedBookings = JSON.parse(JSON.stringify(bookings));
  const propertiesWithColor = properties.map(p => ({ ...p, color: "rose" }));

  return (
    <>
      {/* Desktop: Gantt Calendar originale */}
      <div className="hidden lg:block">
        <CalendarioPrenotazioniClient
          properties={propertiesWithColor}
          bookings={serializedBookings}
        />
      </div>
      
      {/* Mobile: Gantt ottimizzato con ricerca e filtro ordine */}
      <div className="lg:hidden">
        <CalendarioPrenotazioniMobile
          properties={propertiesWithColor}
          bookings={serializedBookings}
        />
      </div>
    </>
  );
}
