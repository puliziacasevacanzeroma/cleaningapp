import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";

export default async function ProprietaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;

  const properties = await db.property.findMany({
    where: { ownerId: userId, status: "active" },
    include: {
      bookings: {
        where: { checkOut: { gte: new Date() } },
        orderBy: { checkIn: "asc" },
        take: 1
      }
    },
    orderBy: { name: "asc" }
  });

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Proprietà Attive</h1>
        <p className="text-slate-500 mt-1">Lista delle proprietà attive</p>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="Cerca Proprietà"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <svg className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Table */}
      {properties.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Proprietario</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Indirizzo</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Città</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Proprietà</th>
                  <th className="text-center py-4 px-6 text-sm font-semibold text-slate-600">-</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {properties.map((property) => (
                  <tr key={property.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="w-24 h-16 rounded-lg overflow-hidden bg-slate-200">
                        {property.photos?.[0] ? (
                          <img src={property.photos[0]} alt={property.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-700">{property.address}</td>
                    <td className="py-4 px-6 text-slate-700">{property.city || "-"}</td>
                    <td className="py-4 px-6 font-medium text-slate-800">{property.name}</td>
                    <td className="py-4 px-6 text-center">
                      <Link
                        href={`/proprietario/proprieta/${property.id}`}
                        className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-sky-600 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
            </svg>
          </div>
          <p className="text-slate-600 font-medium">Nessuna proprietà</p>
          <p className="text-sm text-slate-500 mt-1">Contatta l'amministratore per aggiungere proprietà</p>
        </div>
      )}
    </div>
  );
}
