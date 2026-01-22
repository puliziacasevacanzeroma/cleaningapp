import { collection, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { CalendarioPrenotazioniClient } from "~/components/dashboard/CalendarioPrenotazioniClient";
import { CalendarioPrenotazioniMobile } from "~/components/dashboard/CalendarioPrenotazioniMobile";

export const dynamic = 'force-dynamic';

export default async function CalendarioPrenotazioniPage() {
  // Carica proprietà da Firestore
  const propertiesSnapshot = await getDocs(
    query(
      collection(db, "properties"),
      where("status", "==", "ACTIVE"),
      orderBy("name", "asc")
    )
  );
  
  const properties = propertiesSnapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name || "Senza nome",
    address: doc.data().address || "",
    color: "rose"
  }));
  
  console.log(`📋 Calendario: ${properties.length} proprietà caricate da Firestore`);

  // Carica prenotazioni da Firestore
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const bookingsSnapshot = await getDocs(collection(db, "bookings"));
  
  const bookings = bookingsSnapshot.docs
    .map(doc => {
      const data = doc.data();
      const checkIn = data.checkIn?.toDate?.() || new Date(data.checkIn);
      const checkOut = data.checkOut?.toDate?.() || new Date(data.checkOut);
      
      return {
        id: doc.id,
        propertyId: data.propertyId,
        guestName: data.guestName || "Ospite",
        checkIn,
        checkOut,
        status: data.status || "CONFIRMED",
        source: data.source
      };
    })
    .filter(b => {
      // Filtra prenotazioni nel range di date
      return (b.checkIn >= startDate && b.checkIn <= endDate) ||
             (b.checkOut >= startDate && b.checkOut <= endDate) ||
             (b.checkIn <= startDate && b.checkOut >= endDate);
    })
    .sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());

  console.log(`📅 Calendario: ${bookings.length} prenotazioni caricate da Firestore`);

  // Serializza le date per il client
  const serializedBookings = bookings.map(b => ({
    ...b,
    checkIn: b.checkIn.toISOString(),
    checkOut: b.checkOut.toISOString()
  }));

  return (
    <>
      {/* Desktop: Gantt Calendar originale */}
      <div className="hidden lg:block">
        <CalendarioPrenotazioniClient
          properties={properties}
          bookings={serializedBookings}
        />
      </div>
      
      {/* Mobile: Gantt ottimizzato con ricerca e filtro ordine */}
      <div className="lg:hidden">
        <CalendarioPrenotazioniMobile
          properties={properties}
          bookings={serializedBookings}
        />
      </div>
    </>
  );
}
