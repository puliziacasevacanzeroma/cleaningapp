import { redirect } from "next/navigation";
import { auth } from "~/server/auth";

export default async function RiderDashboard() {
  const session = await auth();
  if (!session) redirect("/login");

  const today = new Date();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30 p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Ciao, {session.user.name?.split(" ")[0]}! 👋</h1>
          <p className="text-slate-500 mt-1">Area Rider - {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-bold text-slate-800">0</p>
            <p className="text-sm text-slate-500">Consegne Oggi</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-bold text-emerald-600">0</p>
            <p className="text-sm text-slate-500">Completate</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-bold text-amber-600">0</p>
            <p className="text-sm text-slate-500">In Attesa</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna consegna per oggi!</h3>
          <p className="text-slate-500">La funzionalità consegne biancheria sarà disponibile a breve 🚗</p>
        </div>
      </div>
    </div>
  );
}
