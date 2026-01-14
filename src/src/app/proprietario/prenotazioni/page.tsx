import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";

export default async function PrenotazioniPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const filter = searchParams.filter;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Base query
  let whereClause: any = {
    property: { ownerId: userId },
    checkOut: { gte: today }
  };

  // Filtro urgenti (check-out domani senza ospiti)
  if (filter === "urgent") {
    whereClause = {
      property: { ownerId: userId },
      checkOut: { gte: today, lt: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000) },
      guestsCount: null
    };
  }

  const bookings = await db.booking.findMany({
    where: whereClause,
    include: { 
      property: true, 
      cleaning: { include: { operator: true } }
    },
    orderBy: { checkOut: "asc" }
  });

  // Conta prenotazioni senza ospiti
  const pendingGuestsCount = bookings.filter(b => !b.guestsCount).length;

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Prenotazioni</h1>
        <p className="text-slate-500 mt-1">Gestisci le prenotazioni delle tue proprietà</p>
      </div>

      {/* Filtri */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/proprietario/prenotazioni"
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            !filter
              ? "bg-sky-500 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:border-sky-300"
          }`}
        >
          Tutte ({bookings.length})
        </Link>
        <Link
          href="/proprietario/prenotazioni?filter=urgent"
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            filter === "urgent"
              ? "bg-amber-500 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:border-amber-300"
          }`}
        >
          ⚠️ Ospiti da inserire ({pendingGuestsCount})
        </Link>
      </div>

      {/* Alert se ci sono prenotazioni urgenti */}
      {pendingGuestsCount > 0 && !filter && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-amber-700">
              Hai <strong>{pendingGuestsCount}</strong> prenotazioni senza numero ospiti. Inseriscili per permettere la preparazione della biancheria.
            </p>
          </div>
        </div>
      )}

      {/* Lista Prenotazioni */}
      {bookings.length > 0 ? (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const checkOutDate = new Date(booking.checkOut);
            const checkInDate = new Date(booking.checkIn);
            const isToday = checkOutDate.toDateString() === today.toDateString();
            const isTomorrow = checkOutDate.toDateString() === tomorrow.toDateString();
            const needsGuests = !booking.guestsCount;
            const isUrgent = needsGuests && (isToday || isTomorrow);

            return (
              <Link
                key={booking.id}
                href={`/proprietario/prenotazioni/${booking.id}`}
                className={`block bg-white rounded-2xl border p-4 hover:shadow-lg transition-all ${
                  isUrgent ? "border-amber-300 bg-amber-50/50" : "border-slate-200"
                }`}
              >
                <div className="flex gap-4">
                  {/* Immagine */}
                  <div className="w-28 h-20 lg:w-36 lg:h-24 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0">
                    {booking.property.photos?.[0] ? (
                      <img
                        src={booking.property.photos[0]}
                        alt={booking.property.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-slate-800">{booking.property.name}</h3>
                        <p className="text-sm text-slate-500">{booking.property.address}</p>
                      </div>
                      {isUrgent && (
                        <span className="px-2 py-1 bg-amber-500 text-white text-xs font-medium rounded-lg flex-shrink-0">
                          Urgente
                        </span>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-slate-400 text-xs">Check-in</p>
                        <p className="text-slate-700 font-medium">
                          {checkInDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">Check-out</p>
                        <p className={`font-medium ${isToday ? "text-rose-600" : isTomorrow ? "text-amber-600" : "text-slate-700"}`}>
                          {isToday ? "Oggi" : isTomorrow ? "Domani" : checkOutDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">Ospite</p>
                        <p className="text-slate-700 font-medium truncate">{booking.guestName}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">N. Ospiti</p>
                        {needsGuests ? (
                          <p className="text-amber-600 font-medium flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                            </svg>
                            Da inserire
                          </p>
                        ) : (
                          <p className="text-emerald-600 font-medium">{booking.guestsCount} ospiti</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">
            {filter === "urgent" ? "Nessuna prenotazione urgente" : "Nessuna prenotazione"}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {filter === "urgent" ? "Tutte le prenotazioni hanno il numero ospiti" : "Le prenotazioni appariranno qui"}
          </p>
        </div>
      )}
    </div>
  );
}
