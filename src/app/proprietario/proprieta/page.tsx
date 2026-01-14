import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";

export default async function ProprietaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;

  const properties = await db.property.findMany({
    where: { clientId: userId },
    include: {
      _count: {
        select: { bookings: true, cleanings: true }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const activeProperties = properties.filter(p => p.status === "active");
  const pendingProperties = properties.filter(p => p.status === "pending");

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Proprietà</h1>
          <p className="text-slate-500 mt-1">Gestisci le tue proprietà</p>
        </div>
        <Link
          href="/proprietario/proprieta/nuova"
          className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-medium rounded-xl hover:shadow-lg transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuova Proprietà
        </Link>
      </div>

      {/* Proprietà in attesa di approvazione */}
      {pendingProperties.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
            In attesa di approvazione ({pendingProperties.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingProperties.map((property) => (
              <div key={property.id} className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                <div className="h-32 bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center">
                  <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-slate-800">{property.name}</h3>
                    <span className="px-2 py-1 bg-amber-200 text-amber-800 text-xs font-medium rounded-lg">
                      In attesa
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{property.address}</p>
                  <p className="text-sm text-slate-500">{property.city}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proprietà attive */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
          Proprietà attive ({activeProperties.length})
        </h2>
        
        {activeProperties.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeProperties.map((property) => (
              <Link
                key={property.id}
                href={`/proprietario/proprieta/${property.id}`}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all"
              >
                <div className="h-40 bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                  <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                  </svg>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-slate-800">{property.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{property.address}</p>
                  <p className="text-sm text-slate-500">{property.city}</p>
                  <div className="mt-4 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1 text-slate-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />
                      </svg>
                      Max {property.maxGuests || "N/D"} ospiti
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>{property._count.bookings} prenotazioni</span>
                    <span>{property._count.cleanings} pulizie</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
              </svg>
            </div>
            <p className="text-slate-600 font-medium">Nessuna proprietà attiva</p>
            <p className="text-sm text-slate-500 mt-1">Aggiungi la tua prima proprietà</p>
            <Link
              href="/proprietario/proprieta/nuova"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-sky-500 text-white rounded-xl hover:bg-sky-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Aggiungi Proprietà
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

