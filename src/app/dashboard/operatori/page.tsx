"use client";

import { useState, useEffect } from "react";

interface Operator {
  id: string;
  name: string;
  email: string;
  status: string;
  operatorType?: string;
  assignedCleanings: any[];
  _count: { assignedCleanings: number; assignedOrders: number };
}

export default function OperatoriPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/utenti?role=OPERATORE_PULIZIE")
      .then(res => res.json())
      .then(data => {
        setOperators(data.users || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="h-48 bg-slate-200 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const cleaningOperators = operators.filter((o) => o.operatorType === "cleaning" || !o.operatorType);
  const riders = operators.filter((o) => o.operatorType === "delivery");

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Operatori</h1>
          <p className="text-slate-500 mt-1">{operators.length} operatori registrati</p>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-sky-500/30 hover:scale-105 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nuovo Operatore
        </button>
      </div>

      {/* Operatori Pulizie */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
          </div>
          Operatori Pulizie ({cleaningOperators.length})
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cleaningOperators.map((op) => (
            <div key={op.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                    <span className="text-sm font-bold text-white">{op.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{op.name}</p>
                    <p className="text-xs text-slate-500">{op.email}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${op.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {op.status === "ACTIVE" ? "Attivo" : "Inattivo"}
                </span>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="flex-1 py-2 text-sm bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors">Modifica</button>
                <button className="flex-1 py-2 text-sm bg-sky-100 text-sky-600 rounded-xl font-medium hover:bg-sky-200 transition-colors">Vedi pulizie</button>
              </div>
            </div>
          ))}
          {cleaningOperators.length === 0 && (
            <div className="col-span-full text-center py-8 bg-white rounded-2xl border border-slate-200">
              <p className="text-slate-500">Nessun operatore pulizie</p>
            </div>
          )}
        </div>
      </div>

      {/* Rider */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>
          </div>
          Rider ({riders.length})
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {riders.map((rider) => (
            <div key={rider.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md">
                    <span className="text-sm font-bold text-white">{rider.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{rider.name}</p>
                    <p className="text-xs text-slate-500">{rider.email}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${rider.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {rider.status === "ACTIVE" ? "Attivo" : "Inattivo"}
                </span>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2 text-sm bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors">Modifica</button>
                <button className="flex-1 py-2 text-sm bg-amber-100 text-amber-600 rounded-xl font-medium hover:bg-amber-200 transition-colors">Vedi consegne</button>
              </div>
            </div>
          ))}
          {riders.length === 0 && (
            <div className="col-span-full text-center py-8 bg-white rounded-2xl border border-slate-200">
              <p className="text-slate-500">Nessun rider</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}