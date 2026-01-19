"use client";

import { useAuth } from "~/lib/firebase/AuthContext";

export default function RiderDashboard() {
  const { user } = useAuth();
  const today = new Date();

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Ciao, {user?.name?.split(" ")[0] || "Rider"}! 👋</h1>
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
            <span className="text-3xl">🚴</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna consegna per oggi!</h3>
          <p className="text-slate-500">La funzionalità consegne biancheria sarà disponibile a breve 🚗</p>
        </div>
      </div>
    </div>
  );
}