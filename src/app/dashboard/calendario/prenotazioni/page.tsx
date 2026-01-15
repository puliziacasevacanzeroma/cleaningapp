import { db } from "~/server/db";
import { CalendarioPrenotazioniClient } from "~/components/dashboard/CalendarioPrenotazioniClient";
import { CalendarioPrenotazioniMobile } from "~/components/dashboard/CalendarioPrenotazioniMobile";
import { headers } from "next/headers";

function isMobileUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const mobileKeywords = [
    'Android', 'webOS', 'iPhone', 'iPad', 'iPod', 'BlackBerry', 
    'Windows Phone', 'Opera Mini', 'IEMobile', 'Mobile'
  ];
  return mobileKeywords.some(keyword => userAgent.includes(keyword));
}

export default async function CalendarioPrenotazioniPage() {
  const headersList = await headers();
  const userAgent = headersList.get('user-agent');
  const isMobile = isMobileUserAgent(userAgent);

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

  // Il componente client gestirà il responsive design internamente
  // Ma forniamo entrambi i componenti per SSR ottimale
  return (
    <>
      {/* Desktop: Gantt Calendar */}
      <div className="hidden lg:block">
        <CalendarioPrenotazioniClient
          properties={propertiesWithColor}
          bookings={serializedBookings}
        />
      </div>
      
      {/* Mobile: Ottimizzato per touch */}
      <div className="lg:hidden">
        <CalendarioPrenotazioniMobile
          properties={propertiesWithColor}
          bookings={serializedBookings}
        />
      </div>
    </>
  );
}
