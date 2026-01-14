import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";
import Image from "next/image";

export default async function ProprietarioDashboard() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;

  // Date per i filtri
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextMonth = new Date(today);
  nextMonth.setDate(nextMonth.getDate() + 30);

  // Recupera dati del proprietario
  const [properties, upcomingBookings, weekCleanings, pendingGuestCount] = await Promise.all([
    // Proprietà del proprietario
    db.property.findMany({
      where: { ownerId: userId, status: "active" },
      include: {
        bookings: {
          where: { checkOut: { gte: today } },
          orderBy: { checkIn: "asc" },
          take: 1
        }
      }
    }),
    // Prenotazioni prossime (prossimi 7 giorni)
    db.booking.findMany({
      where: {
        property: { ownerId: userId },
        checkOut: { gte: today, lte: nextWeek }
      },
      include: { property: true, cleaning: true },
      orderBy: { checkOut: "asc" },
      take: 10
    }),
    // Pulizie della settimana (come nel vecchio software)
    db.cleaning.findMany({
      where: {
        property: { ownerId: userId },
        date: { gte: today, lte: nextMonth }
      },
      include: { 
        property: true, 
        operator: true,
        booking: true
      },
      orderBy: { date: "asc" },
      take: 20
    }),
    // Prenotazioni senza numero ospiti (entro 7 giorni)
    db.booking.count({
      where: {
        property: { ownerId: userId },
        checkOut: { gte: today, lte: nextWeek },
        guestsCount: null
      }
    })
  ]);

  // Calcola statistiche
  const totalProperties = properties.length;
  const totalUpcoming = upcomingBookings.length;
  const needsGuestCount = pendingGuestCount;
  
  // Prenotazioni che richiedono attenzione (check-out domani senza ospiti)
  const urgentBookings = upcomingBookings.filter(b => {
    const checkOutDate = new Date(b.checkOut);
    checkOutDate.setHours(0, 0, 0, 0);
    const isCheckOutTomorrow = checkOutDate.getTime() === tomorrow.getTime();
    return isCheckOutTomorrow && !b.guestsCount;
  });

  // Funzione per ottenere colore badge operatore
  const getOperatorColor = (index: number) => {
    const colors = [
      "bg-emerald-500",
      "bg-sky-500", 
      "bg-violet-500",
      "bg-amber-500",
      "bg-rose-500",
      "bg-teal-500"
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
          Ciao, Bentornato 👋
        </h1>
        <p className="text-slate-500 mt-1">
          {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Alert urgente */}
      {urgentBookings.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800">Attenzione!</h3>
              <p className="text-sm text-amber-700 mt-1">
                Hai {urgentBookings.length} prenotazion{urgentBookings.length > 1 ? 'i' : 'e'} con check-out domani senza numero ospiti. 
                Inserisci il numero ospiti entro le 18:00 di oggi per permettere la preparazione della biancheria.
              </p>
              <Link 
                href="/proprietario/prenotazioni?filter=urgent"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-xl hover:bg-amber-600 transition-colors"
              >
                Gestisci ora
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Pulizie Settimana - Stile cards con immagini */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-800">Pulizie Settimana</h2>
          <Link href="/proprietario/pulizie" className="text-sm text-sky-600 hover:text-sky-700 font-medium">
            Vedi tutte →
          </Link>
        </div>

        {weekCleanings.length > 0 ? (
          <div className="space-y-4">
            {weekCleanings.map((cleaning, index) => {
              const cleaningDate = new Date(cleaning.date);
              const isToday = cleaningDate.toDateString() === today.toDateString();
              const isTomorrow = cleaningDate.toDateString() === tomorrow.toDateString();
              
              return (
                <Link
                  key={cleaning.id}
                  href={`/proprietario/pulizie/${cleaning.id}`}
                  className="flex gap-4 bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-lg transition-all group"
                >
                  {/* Immagine Proprietà */}
                  <div className="w-32 h-24 lg:w-40 lg:h-28 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0">
                    {cleaning.property.photos?.[0] ? (
                      <img
                        src={cleaning.property.photos[0]}
                        alt={cleaning.property.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info Pulizia */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 group-hover:text-sky-600 transition-colors">
                      {cleaning.property.name}
                    </h3>
                    <p className="text-sm text-slate-500 truncate">
                      {cleaning.property.address}, {cleaning.property.city || ""}
                    </p>
                    
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className={isToday ? "text-emerald-600 font-medium" : isTomorrow ? "text-amber-600 font-medium" : ""}>
                          {isToday ? "Oggi" : isTomorrow ? "Domani" : cleaningDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}, {cleaning.scheduledTime || "09:00"}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Ospiti - {cleaning.guestsCount ?? cleaning.booking?.guestsCount ?? "N/D"}
                      </span>
                    </div>

                    {/* Operatore */}
                    <div className="mt-3">
                      <p className="text-xs text-slate-500 mb-1">Operatori</p>
                      {cleaning.operator ? (
                        <span className={`inline-flex px-3 py-1 ${getOperatorColor(index)} text-white text-sm font-medium rounded-lg`}>
                          {cleaning.operator.name}
                        </span>
                      ) : (
                        <span className="inline-flex px-3 py-1 bg-slate-200 text-slate-600 text-sm font-medium rounded-lg">
                          Non assegnato
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <p className="text-slate-600 font-medium">Nessuna pulizia programmata</p>
            <p className="text-sm text-slate-500 mt-1">Le prossime pulizie appariranno qui</p>
          </div>
        )}
      </div>
    </div>
  );
}
