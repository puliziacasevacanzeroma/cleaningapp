"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { getCleaningsByDate } from "~/lib/firebase/firestore-data";
import Link from "next/link";

export default function OperatoreDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [cleanings, setCleanings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const today = new Date();

  useEffect(() => {
    async function loadCleanings() {
      try {
        const data = await getCleaningsByDate(today);
        
        // Filtra: cerca nell'array operators OPPURE nel vecchio operatorId
        const filtered = data.filter(c => {
          const operators = (c as any).operators || [];
          const isInArray = operators.some((op: any) => op.id === user?.id);
          const isOperatorId = c.operatorId === user?.id;
          return isInArray || isOperatorId;
        });
        
        setCleanings(filtered);
      } catch (error) {
        console.error("Errore caricamento pulizie:", error);
      } finally {
        setLoading(false);
      }
    }
    if (user) loadCleanings();
  }, [user]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Errore logout:", error);
      setLoggingOut(false);
    }
  };

  const completed = cleanings.filter(c => c.status === "COMPLETED").length;
  const pending = cleanings.filter(c => c.status !== "COMPLETED").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Header con Logout */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center">
                <span className="text-white text-lg">🧹</span>
              </div>
              <div>
                <h1 className="font-bold text-slate-800">Area Operatore</h1>
                <p className="text-sm text-slate-500">{user?.name || "Operatore"}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl transition-all disabled:opacity-50"
            >
              {loggingOut ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              )}
              <span className="font-medium">Esci</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
              Ciao, {user?.name?.split(" ")[0] || "Operatore"}! 👋
            </h1>
            <p className="text-slate-500 mt-1">
              {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
              <p className="text-3xl font-bold text-slate-800">{cleanings.length}</p>
              <p className="text-sm text-slate-500">Pulizie Oggi</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
              <p className="text-3xl font-bold text-emerald-600">{completed}</p>
              <p className="text-sm text-slate-500">Completate</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
              <p className="text-3xl font-bold text-amber-600">{pending}</p>
              <p className="text-sm text-slate-500">Da Fare</p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border p-8 text-center shadow-sm">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto"></div>
              <p className="text-slate-500 mt-3">Caricamento pulizie...</p>
            </div>
          ) : cleanings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🧹</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna pulizia assegnata per oggi!</h3>
              <p className="text-slate-500">Controlla con l'admin se ci sono pulizie da fare 😊</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">Le tue pulizie di oggi</h2>
              {cleanings.map((cleaning) => (
                <Link
                  key={cleaning.id}
                  href={`/operatore/pulizie/${cleaning.id}`}
                  className="block bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-all hover:border-emerald-200"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-800">{cleaning.propertyName || "Proprietà"}</h3>
                      <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {cleaning.scheduledTime || "10:00"}
                      </p>
                      {cleaning.propertyAddress && (
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {cleaning.propertyAddress}
                        </p>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      cleaning.status === "COMPLETED"
                        ? "bg-emerald-100 text-emerald-700"
                        : cleaning.status === "IN_PROGRESS"
                        ? "bg-amber-100 text-amber-700"
                        : cleaning.status === "ASSIGNED"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-700"
                    }`}>
                      {cleaning.status === "COMPLETED" ? "✓ Completata" :
                       cleaning.status === "IN_PROGRESS" ? "In Corso" :
                       cleaning.status === "ASSIGNED" ? "Assegnata" : "Da Fare"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
