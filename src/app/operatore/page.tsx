import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";

export default async function OperatoreDashboard() {
  const session = await auth();
  if (!session) redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const cleanings = await db.cleaning.findMany({
    where: { operatorId: session.user.id, scheduledDate: { gte: today, lt: tomorrow } },
    include: { property: true, booking: true },
    orderBy: { scheduledTime: "asc" },
  });

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "COMPLETED": return { label: "Completata", bg: "bg-emerald-100", text: "text-emerald-700", gradient: "from-emerald-500 to-teal-600" };
      case "IN_PROGRESS": return { label: "In corso", bg: "bg-amber-100", text: "text-amber-700", gradient: "from-amber-500 to-orange-600" };
      default: return { label: "Da iniziare", bg: "bg-sky-100", text: "text-sky-700", gradient: "from-sky-500 to-blue-600" };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Ciao, {session.user.name?.split(" ")[0]}! 👋</h1>
          <p className="text-slate-500 mt-1">Ecco le tue pulizie per oggi, {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-bold text-slate-800">{cleanings.length}</p>
            <p className="text-sm text-slate-500">Totale</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-bold text-emerald-600">{cleanings.filter((c) => c.status === "COMPLETED").length}</p>
            <p className="text-sm text-slate-500">Completate</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-bold text-amber-600">{cleanings.filter((c) => c.status !== "COMPLETED").length}</p>
            <p className="text-sm text-slate-500">Da fare</p>
          </div>
        </div>

        <div className="space-y-4">
          {cleanings.map((cleaning) => {
            const statusConfig = getStatusConfig(cleaning.status);
            return (
              <Link key={cleaning.id} href={`/operatore/pulizie/${cleaning.id}`} className="block bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all overflow-hidden">
                <div className={`h-2 bg-gradient-to-r ${statusConfig.gradient}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">{cleaning.property.name}</h3>
                      <p className="text-slate-500 flex items-center gap-1 mt-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                        {cleaning.property.address}, {cleaning.property.city}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.text}`}>{statusConfig.label}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="font-medium">{cleaning.scheduledTime || "Da definire"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                      <span className="font-medium">{cleaning.booking?.guestsCount || "?"} ospiti</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {cleanings.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna pulizia per oggi!</h3>
              <p className="text-slate-500">Goditi la giornata 🎉</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
