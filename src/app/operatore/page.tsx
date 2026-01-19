"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { getCleaningsByDate } from "~/lib/firebase/firestore-data";
import Link from "next/link";

export default function OperatoreDashboard() {
  const { user } = useAuth();
  const [cleanings, setCleanings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();

  useEffect(() => {
    async function loadCleanings() {
      try {
        const data = await getCleaningsByDate(today);
        // Filtra per operatore se non è admin
        const filtered = data.filter(c => 
          c.operatorId === user?.id || !c.operatorId
        );
        setCleanings(filtered);
      } catch (error) {
        console.error("Errore caricamento pulizie:", error);
      } finally {
        setLoading(false);
      }
    }
    if (user) loadCleanings();
  }, [user]);

  const completed = cleanings.filter(c => c.status === "COMPLETED").length;
  const pending = cleanings.filter(c => c.status !== "COMPLETED").length;

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Ciao, {user?.name?.split(" ")[0] || "Operatore"}! 👋</h1>
          <p className="text-slate-500 mt-1">Area Operatore - {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-bold text-slate-800">{cleanings.length}</p>
            <p className="text-sm text-slate-500">Pulizie Oggi</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-bold text-emerald-600">{completed}</p>
            <p className="text-sm text-slate-500">Completate</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
            <p className="text-3xl font-bold text-amber-600">{pending}</p>
            <p className="text-sm text-slate-500">Da Fare</p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto"></div>
          </div>
        ) : cleanings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🧹</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna pulizia per oggi!</h3>
            <p className="text-slate-500">Goditi il riposo 😊</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Pulizie di oggi</h2>
            {cleanings.map((cleaning) => (
              <Link 
                key={cleaning.id} 
                href={`/operatore/pulizie/${cleaning.id}`}
                className="block bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-slate-800">{cleaning.propertyName || "Proprietà"}</h3>
                    <p className="text-sm text-slate-500">{cleaning.scheduledTime || "10:00"}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    cleaning.status === "COMPLETED" 
                      ? "bg-emerald-100 text-emerald-700"
                      : cleaning.status === "IN_PROGRESS"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-700"
                  }`}>
                    {cleaning.status === "COMPLETED" ? "Completata" : 
                     cleaning.status === "IN_PROGRESS" ? "In Corso" : "Da Fare"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}