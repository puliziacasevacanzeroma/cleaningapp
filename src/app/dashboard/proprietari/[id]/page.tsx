import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";

export default async function ProprietarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");
  const { id } = await params;

  const proprietario = await db.user.findUnique({
    where: { id },
    include: {
      properties: { include: { _count: { select: { bookings: true, cleanings: true } }, cleanings: { where: { status: "completed" } } } },
      billingData: true,
    },
  });

  if (!proprietario) notFound();

  const totaleDovuto = proprietario.properties.reduce((sum, p) => sum + (p.cleanings.length * (p.cleaningFee || 0)), 0);

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/proprietari" className="p-2 hover:bg-slate-100 rounded-lg">
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">{proprietario.name} {proprietario.surname}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${proprietario.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {proprietario.status === "active" ? "Attivo" : "In attesa"}
            </span>
          </div>
          <p className="text-slate-500">{proprietario.email}</p>
        </div>
        {proprietario.status === "pending" && (
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">✓ Approva</button>
            <button className="px-4 py-2 bg-gradient-to-r from-rose-500 to-red-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">✗ Rifiuta</button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-800">{proprietario.properties.length}</p>
              <p className="text-slate-500">Proprietà</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-800">{proprietario.properties.reduce((s, p) => s + p.cleanings.length, 0)}</p>
              <p className="text-slate-500">Pulizie Completate</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.25 7.756a4.5 4.5 0 100 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-800">€{totaleDovuto.toFixed(2)}</p>
              <p className="text-slate-500">Totale Dovuto</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Proprietà</h2>
          </div>
          <div className="space-y-3">
            {proprietario.properties.map((prop) => (
              <Link key={prop.id} href={`/dashboard/proprieta/${prop.id}`} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                <div>
                  <p className="font-semibold text-slate-800">{prop.name}</p>
                  <p className="text-sm text-slate-500">{prop.address}, {prop.city}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">€{(prop.cleanings.length * (prop.cleaningFee || 0)).toFixed(2)}</p>
                  <p className="text-xs text-slate-500">{prop.cleanings.length} pulizie</p>
                </div>
              </Link>
            ))}
            {proprietario.properties.length === 0 && <p className="text-slate-500 text-center py-4">Nessuna proprietà</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Dati Fatturazione</h2>
            <button className="text-sm text-sky-600 hover:text-sky-700 font-medium">Modifica</button>
          </div>
          {proprietario.billingData ? (
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Ragione Sociale</span>
                <span className="font-medium text-slate-800">{proprietario.billingData.companyName || "-"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">P.IVA</span>
                <span className="font-medium text-slate-800">{proprietario.billingData.vatNumber || "-"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Indirizzo</span>
                <span className="font-medium text-slate-800">{proprietario.billingData.address || "-"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Città</span>
                <span className="font-medium text-slate-800">{proprietario.billingData.city || "-"}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">PEC</span>
                <span className="font-medium text-slate-800">{proprietario.billingData.pec || "-"}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-500 mb-4">Nessun dato di fatturazione</p>
              <button className="px-4 py-2 bg-sky-100 text-sky-700 rounded-xl font-medium hover:bg-sky-200 transition-colors">+ Aggiungi dati</button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex gap-4">
        <button className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-emerald-500/30 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          Esporta Report Excel
        </button>
      </div>
    </div>
  );
}
