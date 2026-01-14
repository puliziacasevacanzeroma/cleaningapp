import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";
import { ApprovePropertyButton } from "../../../../_components/dashboard/ApprovePropertyButton";

export default async function ProprietaPendingPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const properties = await db.property.findMany({
    where: { status: "pending" },
    include: { owner: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/dashboard/proprieta" className="text-slate-500 hover:text-slate-700">Proprietà</Link>
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          <span className="text-slate-800 font-medium">In attesa</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Proprietà in Attesa</h1>
        <p className="text-slate-500 mt-1">{properties.length} proprietà da approvare</p>
      </div>

      {properties.length > 0 ? (
        <div className="space-y-4">
          {properties.map((property) => (
            <div key={property.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{property.name}</h3>
                      <p className="text-sm text-slate-500">{property.address}, {property.city}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                      {property.owner?.name || "Sconosciuto"}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                      {property.owner?.email}
                    </span>
                    {property.maxGuests && <span>👥 Max {property.maxGuests} ospiti</span>}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Link href={`/dashboard/proprieta/${property.id}`} className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors">
                    Dettagli
                  </Link>
                  <ApprovePropertyButton propertyId={property.id} action="reject" />
                  <ApprovePropertyButton propertyId={property.id} action="approve" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna proprietà in attesa</h3>
          <p className="text-slate-500">Tutte le proprietà sono state gestite</p>
        </div>
      )}
    </div>
  );
}
