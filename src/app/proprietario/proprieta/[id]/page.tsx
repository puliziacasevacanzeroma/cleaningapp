import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";

export default async function ProprietaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const property = await db.property.findFirst({
    where: { id: id, ownerId: session.user.id },
    include: {
      _count: { select: { bookings: true, cleanings: true } },
      bookings: {
        orderBy: { checkIn: "desc" },
        take: 5,
        include: { cleaning: true }
      },
      cleanings: {
        where: { status: "completed" },
        orderBy: { date: "desc" },
        take: 1
      },
      linenConfigs: true
    }
  });

  if (!property) notFound();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextBooking = await db.booking.findFirst({
    where: { propertyId: property.id, checkIn: { gte: today } },
    orderBy: { checkIn: "asc" }
  });

  const completedCleanings = await db.cleaning.count({
    where: { propertyId: property.id, status: "completed" }
  });

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
        <Link href="/proprietario/proprieta" className="hover:text-slate-700">Proprietà</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-slate-800 font-medium">{property.name}</span>
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600 rounded-3xl p-6 lg:p-8 mb-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold">{property.name}</h1>
                  <p className="text-white/80">{property.address}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {property.city && (
                  <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-sm font-medium">
                    📍 {property.city}
                  </span>
                )}
                {property.maxGuests && (
                  <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-sm font-medium">
                    👥 Max {property.maxGuests} ospiti
                  </span>
                )}
                {property.cleaningFee && (
                  <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-sm font-medium">
                    💰 €{property.cleaningFee} pulizia
                  </span>
                )}
                {property.icalUrl && (
                  <span className="px-3 py-1 bg-emerald-400/30 backdrop-blur rounded-full text-sm font-medium">
                    📅 iCal Attivo
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/proprietario/proprieta/${property.id}/modifica`}
                className="px-4 py-2.5 bg-white/20 backdrop-blur hover:bg-white/30 rounded-xl font-medium transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Modifica
              </Link>
              <Link
                href={`/proprietario/proprieta/${property.id}/biancheria`}
                className="px-4 py-2.5 bg-white text-blue-600 hover:bg-white/90 rounded-xl font-medium transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Configura Biancheria
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg transition-all">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{property._count.bookings}</p>
              <p className="text-sm text-slate-500">Prenotazioni</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg transition-all">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{completedCleanings}</p>
              <p className="text-sm text-slate-500">Pulizie fatte</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg transition-all">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{property.linenConfigs?.length || 0}</p>
              <p className="text-sm text-slate-500">Config. Biancheria</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg transition-all">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              {nextBooking ? (
                <>
                  <p className="text-lg font-bold text-slate-800">
                    {new Date(nextBooking.checkIn).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                  </p>
                  <p className="text-sm text-slate-500">Prossimo arrivo</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-slate-500">-</p>
                  <p className="text-sm text-slate-500">Nessun arrivo</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Info Proprietà */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            Dettagli Proprietà
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between py-3 border-b border-slate-100">
              <span className="text-slate-500">Indirizzo</span>
              <span className="font-medium text-slate-800 text-right">{property.address}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-slate-100">
              <span className="text-slate-500">Città</span>
              <span className="font-medium text-slate-800">{property.city || "-"}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-slate-100">
              <span className="text-slate-500">CAP</span>
              <span className="font-medium text-slate-800">{property.zip || "-"}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-slate-100">
              <span className="text-slate-500">Piano / Interno</span>
              <span className="font-medium text-slate-800">
                {property.floor || "-"} / {property.intern || "-"}
              </span>
            </div>
            <div className="flex justify-between py-3 border-b border-slate-100">
              <span className="text-slate-500">Max Ospiti</span>
              <span className="font-medium text-slate-800">{property.maxGuests || "-"}</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-slate-500">Costo Pulizia</span>
              <span className="font-medium text-emerald-600">€{property.cleaningFee || 0}</span>
            </div>
          </div>
        </div>

        {/* Ultime Prenotazioni */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              Ultime Prenotazioni
            </h2>
            <Link href="/proprietario/prenotazioni" className="text-sm text-sky-600 hover:text-sky-700 font-medium">
              Vedi tutte →
            </Link>
          </div>

          {property.bookings.length > 0 ? (
            <div className="space-y-3">
              {property.bookings.map((booking) => {
                const checkIn = new Date(booking.checkIn);
                const checkOut = new Date(booking.checkOut);
                const isPast = checkOut < today;

                return (
                  <Link
                    key={booking.id}
                    href={`/proprietario/prenotazioni/${booking.id}`}
                    className={`block p-4 rounded-xl border transition-all hover:shadow-md ${
                      isPast ? "bg-slate-50 border-slate-200" : "bg-sky-50 border-sky-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{booking.guestName}</p>
                        <p className="text-sm text-slate-500">
                          {checkIn.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })} → {checkOut.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                        </p>
                      </div>
                      <div className="text-right">
                        {booking.guestsCount ? (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-lg">
                            {booking.guestsCount} ospiti
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-lg">
                            Ospiti N/D
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
                </svg>
              </div>
              <p className="text-slate-500">Nessuna prenotazione</p>
            </div>
          )}
        </div>
      </div>

      {/* iCal Info */}
      {property.icalUrl && (
        <div className="mt-6 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-emerald-800">Sincronizzazione iCal Attiva</h3>
              <p className="text-sm text-emerald-600">Le prenotazioni vengono sincronizzate automaticamente</p>
            </div>
          </div>
          <div className="bg-white/50 rounded-xl p-3 overflow-x-auto">
            <code className="text-xs text-slate-600 break-all">{property.icalUrl}</code>
          </div>
        </div>
      )}

      {/* Notes */}
      {property.notes && (
        <div className="mt-6 bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            Note
          </h3>
          <p className="text-slate-600">{property.notes}</p>
        </div>
      )}
    </div>
  );
}
