import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import Link from "next/link";
import { GuestCountForm } from "~/components/proprietario/GuestCountForm";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export default async function PrenotazioneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getFirebaseUser();
  if (!user) redirect("/login");

  const { id } = await params;

  // Carica prenotazione da Firestore
  const bookingSnap = await getDoc(doc(db, "bookings", id));
  if (!bookingSnap.exists()) notFound();
  
  const bookingData = bookingSnap.data();
  
  // Verifica che la proprietà appartenga all'utente (se è proprietario)
  if (user.role?.toUpperCase() === "PROPRIETARIO") {
    const propertySnap = await getDoc(doc(db, "properties", bookingData.propertyId));
    if (!propertySnap.exists() || propertySnap.data().ownerId !== user.id) {
      notFound();
    }
  }
  
  // Carica proprietà
  const propertySnap = await getDoc(doc(db, "properties", bookingData.propertyId));
  const propertyData = propertySnap.exists() ? propertySnap.data() : {};

  const booking = {
    id: bookingSnap.id,
    ...bookingData,
    checkIn: bookingData.checkIn?.toDate?.() || new Date(bookingData.checkIn),
    checkOut: bookingData.checkOut?.toDate?.() || new Date(bookingData.checkOut),
    property: {
      name: propertyData.name || bookingData.propertyName || "Proprietà",
      address: propertyData.address || "",
      cleaningFee: propertyData.cleaningPrice || 0,
      maxGuests: propertyData.maxGuests || 6
    }
  };

  const checkOutDate = new Date(booking.checkOut);
  const checkInDate = new Date(booking.checkIn);
  
  // Deadline: mezzanotte del giorno del checkout
  const deadline = new Date(checkOutDate);
  deadline.setHours(0, 0, 0, 0);
  
  const canModifyGuests = new Date() < deadline;
  const cleaningFee = booking.property.cleaningFee || 0;

  return (
    <div className="p-4 lg:p-8">
      <Link href="/proprietario/prenotazioni" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-6">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Torna alle prenotazioni
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Riservazione</h1>
        <p className="text-slate-500 mt-1">{booking.property.name} - {booking.property.address}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-600">Data</span>
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <p className="text-xl font-bold text-slate-800">{checkOutDate.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
          <p className="text-sm text-slate-500">Data di check-out</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-600">Totale costi</span>
            <span className="text-slate-400">€</span>
          </div>
          <p className="text-xl font-bold text-slate-800">{cleaningFee.toFixed(2)}€</p>
          <p className="text-sm text-slate-500">{cleaningFee}€ (Pulizia)</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-600">Pagamento</span>
          </div>
          <p className={`text-xl font-bold ${booking.isPaid ? "text-emerald-600" : "text-amber-600"}`}>
            {booking.isPaid ? "Pagato" : "In attesa"}
          </p>
          <p className="text-sm text-slate-500">Stato del pagamento</p>
        </div>
      </div>

      {canModifyGuests && (
        <div className="mb-6 p-4 rounded-2xl border bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-semibold text-amber-800">Importante</h3>
              <p className="text-sm text-amber-700">Il numero di ospiti può essere modificato <strong>entro mezzanotte del giorno del check-out</strong>. Dopo questo termine, la biancheria sarà preparata per il numero massimo di ospiti della proprietà ({booking.property.maxGuests}).</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Numero ospiti presenti</h2>
            <p className="text-sm text-slate-500 mt-1">{booking.guestsCount ? `${booking.guestsCount} ospiti confermati` : "Inserisci il numero di ospiti"}</p>
          </div>
          {booking.guestsCount && (
            <span className="text-4xl font-bold text-slate-800">{booking.guestsCount}</span>
          )}
        </div>
        {canModifyGuests && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <GuestCountForm bookingId={booking.id} currentGuests={booking.guestsCount} maxGuests={booking.property.maxGuests || 6} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Dettagli Prenotazione</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-500">Ospite</p>
            <p className="font-medium text-slate-800">{booking.guestName}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Check-in</p>
            <p className="font-medium text-slate-800">{checkInDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Check-out</p>
            <p className="font-medium text-slate-800">{checkOutDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Fonte</p>
            <span className="inline-flex px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">{booking.source || "Manuale"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}