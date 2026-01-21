"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, where, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import Link from "next/link";

export default function OperatoreDashboard() {
  const { user } = useAuth();
  const [cleanings, setCleanings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();

  // 🔥 REALTIME: usa onSnapshot invece di getDocs
  useEffect(() => {
    if (!user) return;

    console.log("🔴 Operatore Realtime: Avvio listener pulizie...");

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const q = query(
      collection(db, "cleanings"),
      where("scheduledDate", ">=", Timestamp.fromDate(todayStart)),
      where("scheduledDate", "<", Timestamp.fromDate(todayEnd))
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const allCleanings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filtra per operatore
      const filtered = allCleanings.filter((c: any) => {
        const operators = c.operators || [];
        const isInArray = operators.some((op: any) => op.id === user?.id);
        const isOperatorId = c.operatorId === user?.id;
        return isInArray || isOperatorId;
      });

      console.log("🔄 Operatore Pulizie: Aggiornate!", filtered.length);
      setCleanings(filtered);
      setLoading(false);
    });

    return () => {
      console.log("🔴 Operatore Realtime: Chiusura listener");
      unsub();
    };
  }, [user]);

  const completed = cleanings.filter(c => c.status === "COMPLETED").length;
  const pending = cleanings.filter(c => c.status !== "COMPLETED").length;

  return (
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
  );
}
