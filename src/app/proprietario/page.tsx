import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import Link from "next/link";

export default async function ProprietarioDashboard() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextMonth = new Date(today);
  nextMonth.setDate(nextMonth.getDate() + 30);

  const [properties, weekCleanings] = await Promise.all([
    db.property.findMany({
      where: { clientId: userId, status: "ACTIVE" },
    }),
    db.cleaning.findMany({
      where: {
        property: { clientId: userId },
        scheduledDate: { gte: today, lte: nextMonth }
      },
      include: {
        property: true,
        operator: true,
        booking: true
      },
      orderBy: { scheduledDate: "asc" },
      take: 20
    })
  ]);

  const getOperatorColor = (index: number) => {
    const colors = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500"];
    return colors[index % colors.length];
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Ciao, Bentornato 👋</h1>
        <p className="text-slate-500 mt-1">{today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{properties.length}</p>
              <p className="text-sm text-slate-500">Proprietà</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{weekCleanings.length}</p>
              <p className="text-sm text-slate-500">Pulizie</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{properties.length}</p>
              <p className="text-sm text-slate-500">Attive</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{weekCleanings.filter(c => c.status === "COMPLETED").length}</p>
              <p className="text-sm text-slate-500">Completate</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-800">Pulizie Settimana</h2>
          <Link href="/proprietario/calendario/pulizie" className="text-sm text-sky-600 hover:text-sky-700 font-medium">Vedi tutte →</Link>
        </div>

        {weekCleanings.length > 0 ? (
          <div className="space-y-4">
            {weekCleanings.slice(0, 5).map((cleaning, index) => {
              const cleaningDate = new Date(cleaning.scheduledDate);
              const isToday = cleaningDate.toDateString() === today.toDateString();
              const isTomorrow = cleaningDate.toDateString() === tomorrow.toDateString();

              return (
                <div key={cleaning.id} className="flex gap-4 bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-lg transition-all">
                  <div className="w-32 h-24 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0">
                    <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800">{cleaning.property.name}</h3>
                    <p className="text-sm text-slate-500 truncate">{cleaning.property.address}, {cleaning.property.city || ""}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span className={`font-medium ${isToday ? "text-emerald-600" : isTomorrow ? "text-amber-600" : ""}`}>
                        {isToday ? "Oggi" : isTomorrow ? "Domani" : cleaningDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}, {cleaning.scheduledTime || "09:00"}
                      </span>
                      <span>Ospiti: {cleaning.booking?.guestsCount ?? "N/D"}</span>
                    </div>
                    <div className="mt-2">
                      {cleaning.operator ? (
                        <span className={`inline-flex px-3 py-1 ${getOperatorColor(index)} text-white text-sm font-medium rounded-lg`}>{cleaning.operator.name}</span>
                      ) : (
                        <span className="inline-flex px-3 py-1 bg-slate-200 text-slate-600 text-sm font-medium rounded-lg">Non assegnato</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-slate-600 font-medium">Nessuna pulizia programmata</p>
          </div>
        )}
      </div>
    </div>
  );
}
