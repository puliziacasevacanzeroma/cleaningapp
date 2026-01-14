import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export default async function ProfiloPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { billingData: true }
  });

  if (!user) redirect("/login");

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Profilo</h1>
        <p className="text-slate-500 mt-1">Gestisci le tue informazioni personali</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Dati Personali */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Dati Personali</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Nome</label>
              <p className="font-medium text-slate-800">{user.name}</p>
            </div>
            {user.surname && (
              <div>
                <label className="block text-sm text-slate-500 mb-1">Cognome</label>
                <p className="font-medium text-slate-800">{user.surname}</p>
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-500 mb-1">Email</label>
              <p className="font-medium text-slate-800">{user.email}</p>
            </div>
            {user.phone && (
              <div>
                <label className="block text-sm text-slate-500 mb-1">Telefono</label>
                <p className="font-medium text-slate-800">{user.phone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Dati Fatturazione */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Dati Fatturazione</h2>
          
          {user.billingData ? (
            <div className="space-y-4">
              {user.billingData.companyName && (
                <div>
                  <label className="block text-sm text-slate-500 mb-1">Ragione Sociale</label>
                  <p className="font-medium text-slate-800">{user.billingData.companyName}</p>
                </div>
              )}
              {user.billingData.vatNumber && (
                <div>
                  <label className="block text-sm text-slate-500 mb-1">Partita IVA</label>
                  <p className="font-medium text-slate-800">{user.billingData.vatNumber}</p>
                </div>
              )}
              {user.billingData.address && (
                <div>
                  <label className="block text-sm text-slate-500 mb-1">Indirizzo</label>
                  <p className="font-medium text-slate-800">{user.billingData.address}</p>
                </div>
              )}
              {(user.billingData.city || user.billingData.zip) && (
                <div>
                  <label className="block text-sm text-slate-500 mb-1">Città</label>
                  <p className="font-medium text-slate-800">
                    {user.billingData.zip} {user.billingData.city}
                  </p>
                </div>
              )}
              {user.billingData.pec && (
                <div>
                  <label className="block text-sm text-slate-500 mb-1">PEC</label>
                  <p className="font-medium text-slate-800">{user.billingData.pec}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-slate-600 font-medium">Nessun dato di fatturazione</p>
              <p className="text-sm text-slate-500 mt-1">Contatta l'amministratore per aggiungere i dati</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
