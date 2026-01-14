import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";
import { GuestCountForm } from "~/components/proprietario/GuestCountForm";
import { LinenConfigSelector } from "~/components/proprietario/LinenConfigSelector";

export default async function PrenotazioneDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;

  // Recupera prenotazione con proprietà e configurazioni biancheria
  const booking = await db.booking.findFirst({
    where: {
      id: params.id,
      property: { ownerId: userId }
    },
    include: {
      property: {
        include: {
          linenConfigs: {
            orderBy: { guestsCount: "asc" }
          }
        }
      },
      cleaning: {
        include: { operator: true }
      },
      orders: {
        include: { items: true }
      }
    }
  });

  if (!booking) {
    notFound();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const checkOutDate = new Date(booking.checkOut);
  checkOutDate.setHours(0, 0, 0, 0);
  
  const checkInDate = new Date(booking.checkIn);
  
  // Calcola deadline per modifica ospiti (18:00 del giorno prima del check-out)
  const deadline = new Date(checkOutDate);
  deadline.setDate(deadline.getDate() - 1);
  deadline.setHours(18, 0, 0, 0);
  
  const now = new Date();
  const canModifyGuests = now < deadline;
  const isUrgent = !booking.guestsCount && now >= new Date(deadline.getTime() - 24 * 60 * 60 * 1000);

  // Calcola costi
  const cleaningFee = booking.property.cleaningFee || 0;
  const linenOrder = booking.orders.find(o => o.items.some(i => i.type === "linen"));
  const linenCost = linenOrder?.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0) || 0;
  const totalCost = cleaningFee + linenCost;

  // Stato pagamento
  const paymentStatus = booking.isPaid ? "Pagato" : "In attesa";

  return (
    <div className="p-4 lg:p-8">
      {/* Back Button */}
      <Link
        href="/proprietario/prenotazioni"
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-6"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Torna alle prenotazioni
      </Link>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Riservazione</h1>
          <p className="text-slate-500 mt-1">
            {booking.property.name} - {booking.property.address}, {booking.property.city}
          </p>
        </div>
        
        {booking.status !== "cancelled" && (
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-rose-300 text-rose-600 rounded-xl hover:bg-rose-50 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Cancellare
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Data */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-600">Data</span>
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {checkOutDate.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </p>
          <p className="text-sm text-slate-500">Data di check-out</p>
        </div>

        {/* Totale Costi */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-600">Totale costi</span>
            <span className="text-slate-400">€</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{totalCost.toFixed(2)}€</p>
          <p className="text-sm text-slate-500">{cleaningFee}€ (Pulizia)</p>
        </div>

        {/* Pagamento */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-600">Pagamento</span>
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
          </div>
          <p className={`text-2xl font-bold ${booking.isPaid ? "text-emerald-600" : "text-amber-600"}`}>
            {paymentStatus}
          </p>
          <p className="text-sm text-slate-500">Stato del pagamento</p>
        </div>
      </div>

      {/* Alert Attenzione */}
      {canModifyGuests && (
        <div className={`mb-6 p-4 rounded-2xl border ${isUrgent ? "bg-amber-50 border-amber-200" : "bg-sky-50 border-sky-200"}`}>
          <div className="flex items-start gap-3">
            <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isUrgent ? "text-amber-500" : "text-sky-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className={`font-semibold ${isUrgent ? "text-amber-800" : "text-sky-800"}`}>Attenzione</h3>
              <p className={`text-sm ${isUrgent ? "text-amber-700" : "text-sky-700"}`}>
                Il numero di ospiti può essere modificato entro le ore 18 del giorno prima del check-out. 
                Dopo tale orario, il numero di ospiti non può essere modificato. 
                Verrà quindi preparata la proprietà per il numero di ospiti attualmente registrato, preimpostato a quello massimo.
              </p>
            </div>
          </div>
        </div>
      )}

      {!canModifyGuests && (
        <div className="mb-6 p-4 rounded-2xl border bg-slate-50 border-slate-200">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <div>
              <h3 className="font-semibold text-slate-800">Modifica bloccata</h3>
              <p className="text-sm text-slate-600">
                Il termine per la modifica del numero di ospiti è scaduto. La biancheria è già stata preparata.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Numero Ospiti */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Numero ospiti presenti</h2>
            <p className="text-sm text-slate-500 mt-1">
              {booking.guestsCount 
                ? `${booking.guestsCount} ospiti confermati`
                : "Inserisci il numero di ospiti per questa prenotazione"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {booking.guestsCount ? (
              <span className="text-4xl font-bold text-slate-800">{booking.guestsCount}</span>
            ) : (
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            )}
          </div>
        </div>
        
        {canModifyGuests && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <GuestCountForm 
              bookingId={booking.id}
              currentGuests={booking.guestsCount}
              maxGuests={booking.property.maxGuests || 10}
            />
          </div>
        )}
      </div>

      {/* Configurazione Biancheria */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Configurazione Biancheria Riservazione
        </h2>
        
        <LinenConfigSelector
          bookingId={booking.id}
          propertyId={booking.propertyId}
          currentGuestsCount={booking.guestsCount}
          linenConfigs={booking.property.linenConfigs}
          canModify={canModifyGuests}
          existingOrder={linenOrder}
        />
      </div>

      {/* Info Prenotazione */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Dettagli Prenotazione</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-slate-500">Ospite</p>
            <p className="font-medium text-slate-800">{booking.guestName}</p>
          </div>
          {booking.guestEmail && (
            <div>
              <p className="text-sm text-slate-500">Email</p>
              <p className="font-medium text-slate-800">{booking.guestEmail}</p>
            </div>
          )}
          {booking.guestPhone && (
            <div>
              <p className="text-sm text-slate-500">Telefono</p>
              <p className="font-medium text-slate-800">{booking.guestPhone}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-slate-500">Check-in</p>
            <p className="font-medium text-slate-800">
              {checkInDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Check-out</p>
            <p className="font-medium text-slate-800">
              {checkOutDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Fonte</p>
            <span className="inline-flex px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
              {booking.source || "Manuale"}
            </span>
          </div>
        </div>

        {booking.notes && (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-sm text-slate-500">Note</p>
            <p className="text-slate-700 mt-1">{booking.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
