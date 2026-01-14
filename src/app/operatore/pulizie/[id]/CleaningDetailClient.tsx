"use client";
import { useState } from "react";
import Link from "next/link";

export default function CleaningDetailClient({ cleaning }: { cleaning: any }) {
  const [activeTab, setActiveTab] = useState("home");
  const [checkedItems, setCheckedItems] = useState<string[]>(cleaning.checklistCompleted || []);
  const [notes, setNotes] = useState(cleaning.notes || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const toggleChecklist = (id: string) => {
    setCheckedItems((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const startCleaning = async () => {
    setSaving(true);
    try {
      await fetch(`/api/cleanings/${cleaning.id}/start`, { method: "POST" });
      setMessage("Pulizia iniziata!");
      window.location.reload();
    } catch { setMessage("Errore"); }
    setSaving(false);
  };

  const completeCleaning = async () => {
    if (checkedItems.length < cleaning.property.checklist.length) {
      setMessage("Completa prima tutta la checklist!");
      return;
    }
    setSaving(true);
    try {
      await fetch(`/api/cleanings/${cleaning.id}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checklistCompleted: checkedItems, notes }) });
      setMessage("Pulizia completata!");
      window.location.reload();
    } catch { setMessage("Errore"); }
    setSaving(false);
  };

  const tabs = [
    { id: "home", name: "Info", icon: "🏠" },
    { id: "ordini", name: "Ordini", icon: "📦" },
    { id: "note", name: "Note/Foto", icon: "📷" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/operatore" className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50">
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl lg:text-2xl font-bold text-slate-800">{cleaning.property.name}</h1>
            <p className="text-slate-500">{cleaning.property.address}, {cleaning.property.city}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${cleaning.status === "completed" ? "bg-emerald-100 text-emerald-700" : cleaning.status === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
            {cleaning.status === "completed" ? "Completata" : cleaning.status === "in_progress" ? "In corso" : "Da iniziare"}
          </span>
        </div>

        {message && <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-xl text-sky-700">{message}</div>}

        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${activeTab === tab.id ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg" : "bg-white text-slate-600 border border-slate-200"}`}>
              <span>{tab.icon}</span>{tab.name}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          {activeTab === "home" && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-sm text-slate-500">Orario</p>
                  <p className="text-xl font-bold text-slate-800">{cleaning.scheduledTime || "Da definire"}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-sm text-slate-500">Ospiti</p>
                  <p className="text-xl font-bold text-slate-800">{cleaning.guestsCount || "?"}</p>
                </div>
              </div>

              {cleaning.status === "assigned" && (
                <button onClick={startCleaning} disabled={saving} className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold text-lg hover:shadow-xl hover:shadow-emerald-500/30 transition-all disabled:opacity-50">
                  🚀 INIZIA PULIZIA
                </button>
              )}

              {cleaning.status === "in_progress" && (
                <>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-4">✅ Checklist</h3>
                    <div className="space-y-2">
                      {cleaning.property.checklist.map((item: any) => (
                        <button key={item.id} onClick={() => toggleChecklist(item.id)} className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all ${checkedItems.includes(item.id) ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200 hover:bg-slate-50"}`}>
                          <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${checkedItems.includes(item.id) ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
                            {checkedItems.includes(item.id) && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                          <span className={`font-medium ${checkedItems.includes(item.id) ? "text-emerald-700" : "text-slate-700"}`}>{item.text}</span>
                        </button>
                      ))}
                      {cleaning.property.checklist.length === 0 && <p className="text-slate-500 text-center py-4">Nessuna voce in checklist</p>}
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="font-semibold text-amber-800">Progresso: {checkedItems.length}/{cleaning.property.checklist.length}</p>
                    <div className="w-full bg-amber-200 rounded-full h-2 mt-2">
                      <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${(checkedItems.length / Math.max(cleaning.property.checklist.length, 1)) * 100}%` }} />
                    </div>
                  </div>

                  <button onClick={completeCleaning} disabled={saving || checkedItems.length < cleaning.property.checklist.length} className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-bold text-lg hover:shadow-xl hover:shadow-violet-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    ✅ COMPLETA PULIZIA
                  </button>
                </>
              )}

              {cleaning.status === "completed" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-emerald-800">Pulizia Completata!</h3>
                  <p className="text-emerald-600">Ottimo lavoro 🎉</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "ordini" && (
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Ordini Biancheria</h3>
              {cleaning.orders.length > 0 ? (
                <div className="space-y-4">
                  {cleaning.orders.map((order: any) => (
                    <div key={order.id} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${order.status === "delivered" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{order.status}</span>
                      </div>
                      <div className="space-y-2">
                        {order.items.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">{item.name}</span>
                            <span className="font-medium text-slate-800">x{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">Nessun ordine per questa pulizia</p>
              )}
            </div>
          )}

          {activeTab === "note" && (
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4">Note</h3>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Aggiungi note sulla pulizia..." className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-sky-500 outline-none resize-none" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4">Foto</h3>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                  <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                  <p className="text-slate-500 mb-2">Scatta o carica foto</p>
                  <button className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium">📷 Carica Foto</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
