"use client";
import { useState } from "react";
import Link from "next/link";

const linenItemDefs = [
  { key: "lenzuoloMatrimoniale", name: "Lenzuolo Matr.", icon: "🛏️" },
  { key: "lenzuoloSingolo", name: "Lenzuolo Sing.", icon: "🛏️" },
  { key: "federa", name: "Federa", icon: "🛋️" },
  { key: "copriletto", name: "Copriletto", icon: "🛌" },
  { key: "copripiumino", name: "Copripiumino", icon: "❄️" },
  { key: "teloDoccia", name: "Telo Doccia", icon: "🛁" },
  { key: "teloViso", name: "Telo Viso", icon: "🧴" },
  { key: "teloBidet", name: "Telo Bidet", icon: "🚿" },
  { key: "teloOspite", name: "Telo Ospite", icon: "🧺" },
  { key: "scendiBagno", name: "Scendi Bagno", icon: "🚿" },
  { key: "accappatoio", name: "Accappatoio", icon: "🥋" },
  { key: "strofinaccio", name: "Strofinaccio", icon: "🧹" },
  { key: "tovaglia", name: "Tovaglia", icon: "🍽️" },
  { key: "tovagliolo", name: "Tovagliolo", icon: "🧻" },
];

export default function PropertyDetailClient({ property, operators, linenItems, stats, isAdmin }: any) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [cleaningFee, setCleaningFee] = useState(property.cleaningFee?.toString() || "");
  const [ownerLinens, setOwnerLinens] = useState(property.ownerLinens);
  const [selectedPax, setSelectedPax] = useState(1);
  const [icalUrls, setIcalUrls] = useState({ airbnb: property.icalAirbnb || "", booking: property.icalBooking || "", oktorate: property.icalOktorate || "", inreception: property.icalInreception || "", krossbooking: property.icalKrossbooking || "" });
  const [checklistItems, setChecklistItems] = useState(property.checklist || []);
  const [newChecklistItem, setNewChecklistItem] = useState("");

  const maxGuests = property.maxGuests || 4;
  const [linenConfigs, setLinenConfigs] = useState<Record<number, Record<string, number>>>(() => {
    const configs: Record<number, Record<string, number>> = {};
    for (let i = 1; i <= maxGuests; i++) {
      const existing = property.linenConfigs?.find((c: any) => c.guestsCount === i);
      configs[i] = linenItemDefs.reduce((acc, item) => ({ ...acc, [item.key]: existing?.[item.key] || 0 }), {});
    }
    return configs;
  });

  const updateLinen = (pax: number, key: string, delta: number) => {
    setLinenConfigs((prev) => ({ ...prev, [pax]: { ...prev[pax], [key]: Math.max(0, (prev[pax]?.[key] || 0) + delta) } }));
  };

  const saveLinen = async () => {
    setSaving(true);
    try {
      await fetch(`/api/properties/${property.id}/linen-config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ configs: linenConfigs }) });
      setMessage("Configurazione salvata!");
    } catch { setMessage("Errore"); }
    setSaving(false);
    setTimeout(() => setMessage(""), 3000);
  };

  const saveIcal = async () => {
    setSaving(true);
    try {
      await fetch(`/api/properties/${property.id}/ical`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(icalUrls) });
      setMessage("Link iCal salvati!");
    } catch { setMessage("Errore"); }
    setSaving(false);
    setTimeout(() => setMessage(""), 3000);
  };

  const syncIcal = async () => {
    setSaving(true);
    setMessage("Sincronizzazione...");
    try {
      const res = await fetch(`/api/properties/${property.id}/sync-ical`, { method: "POST" });
      const data = await res.json();
      setMessage(`Sincronizzate ${data.count || 0} prenotazioni!`);
    } catch { setMessage("Errore sync"); }
    setSaving(false);
    setTimeout(() => setMessage(""), 5000);
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    setChecklistItems([...checklistItems, { id: Date.now().toString(), text: newChecklistItem, order: checklistItems.length }]);
    setNewChecklistItem("");
  };

  const removeChecklistItem = (id: string) => setChecklistItems(checklistItems.filter((i: any) => i.id !== id));

  const tabs = [
    { id: "dashboard", name: "Dashboard", icon: "📊" },
    { id: "biancheria", name: "Biancheria", icon: "🛏️" },
    { id: "storico", name: "Storico", icon: "📋" },
    { id: "impostazioni", name: "Impostazioni", icon: "⚙️" },
  ];

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/proprieta" className="p-2 hover:bg-slate-100 rounded-lg"><svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 19.5L8.25 12l7.5-7.5" /></svg></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">{property.name}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${property.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{property.status === "active" ? "Attiva" : "In attesa"}</span>
          </div>
          <p className="text-slate-500">{property.address}, {property.city}</p>
        </div>
      </div>

      {message && <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-xl text-sky-700">{message}</div>}

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium whitespace-nowrap transition-all ${activeTab === tab.id ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"}`}>
            <span>{tab.icon}</span>{tab.name}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        {activeTab === "dashboard" && (
          <div className="p-6">
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gradient-to-br from-sky-50 to-blue-50 rounded-xl p-4"><p className="text-sm text-sky-600 font-medium">Max Ospiti</p><p className="text-3xl font-bold text-sky-700">{property.maxGuests || "-"}</p></div>
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4"><p className="text-sm text-emerald-600 font-medium">Pulizie</p><p className="text-3xl font-bold text-emerald-700">{stats.completedCleanings}</p></div>
              <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4"><p className="text-sm text-violet-600 font-medium">Fatturato</p><p className="text-3xl font-bold text-violet-700">€{stats.totalRevenue.toFixed(2)}</p></div>
            </div>
            {isAdmin && (
              <div className="mb-8 p-4 bg-slate-50 rounded-xl">
                <label className="block text-sm font-medium text-slate-700 mb-2">Prezzo Pulizia (€)</label>
                <div className="flex gap-3">
                  <input type="number" value={cleaningFee} onChange={(e) => setCleaningFee(e.target.value)} className="w-32 px-4 py-2 border border-slate-200 rounded-xl" placeholder="0.00" />
                  <button className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium">Salva</button>
                </div>
              </div>
            )}
            <div className="mb-8">
              <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div><p className="font-semibold text-amber-800">Biancheria propria?</p><p className="text-sm text-amber-600">Se attivo, no ordini automatici</p></div>
                <button onClick={() => setOwnerLinens(!ownerLinens)} className={`relative w-14 h-7 rounded-full transition-colors ${ownerLinens ? "bg-amber-500" : "bg-slate-300"}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${ownerLinens ? "left-8" : "left-1"}`} /></button>
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Prenotazioni Recenti</h3>
            <div className="space-y-2">
              {property.bookings.slice(0, 5).map((b: any) => (
                <div key={b.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div><p className="font-medium text-slate-800">{b.guestName}</p><p className="text-sm text-slate-500">{new Date(b.checkIn).toLocaleDateString("it-IT")} → {new Date(b.checkOut).toLocaleDateString("it-IT")}</p></div>
                  <span className={`px-3 py-1 rounded-lg text-xs font-medium ${b.isPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{b.isPaid ? "Pagato" : "Da pagare"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "biancheria" && (
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Configuratore Biancheria</h2>
            <p className="text-slate-500 mb-6">Configura la dotazione per ogni numero di ospiti</p>
            <div className="mb-6">
              <p className="text-sm font-medium text-slate-600 mb-3">Seleziona numero ospiti:</p>
              <div className="flex gap-2 flex-wrap">
                {Array.from({ length: maxGuests }, (_, i) => i + 1).map((num) => (
                  <button key={num} onClick={() => setSelectedPax(num)} className={`w-12 h-12 rounded-xl font-bold transition-all ${selectedPax === num ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{num}</button>
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
              {linenItemDefs.map((item) => (
                <div key={item.key} className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-3"><span className="text-xl">{item.icon}</span><span className="font-medium text-slate-800 text-sm">{item.name}</span></div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => updateLinen(selectedPax, item.key, -1)} className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 font-bold text-slate-600">−</button>
                    <span className="text-2xl font-bold text-slate-800 w-12 text-center">{linenConfigs[selectedPax]?.[item.key] || 0}</span>
                    <button onClick={() => updateLinen(selectedPax, item.key, 1)} className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 font-bold text-slate-600">+</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={saveLinen} disabled={saving} className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50">💾 Salva</button>
          </div>
        )}

        {activeTab === "storico" && (
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Storico Prenotazioni</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-slate-200"><th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Ospite</th><th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Check-in</th><th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Check-out</th><th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">PAX</th><th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Stato</th></tr></thead>
                <tbody>
                  {property.bookings.map((b: any) => (
                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-800">{b.guestName}</td>
                      <td className="py-3 px-4 text-slate-600">{new Date(b.checkIn).toLocaleDateString("it-IT")}</td>
                      <td className="py-3 px-4 text-slate-600">{new Date(b.checkOut).toLocaleDateString("it-IT")}</td>
                      <td className="py-3 px-4 text-slate-600">{b.guestsCount || "-"}</td>
                      <td className="py-3 px-4"><span className={`px-2 py-1 rounded-lg text-xs font-medium ${b.isPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{b.isPaid ? "Pagato" : "Da pagare"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "impostazioni" && (
          <div className="p-6 space-y-8">
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-4">Checklist Pulizia</h3>
              <div className="space-y-2 mb-4">
                {checklistItems.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-700">{item.text}</span>
                    <button onClick={() => removeChecklistItem(item.id)} className="p-1 text-rose-500 hover:bg-rose-50 rounded"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newChecklistItem} onChange={(e) => setNewChecklistItem(e.target.value)} placeholder="Nuova voce..." className="flex-1 px-4 py-2 border border-slate-200 rounded-xl" />
                <button onClick={addChecklistItem} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200">+ Aggiungi</button>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-4">Link iCal</h3>
              <div className="space-y-4">
                {["airbnb", "booking", "oktorate", "inreception", "krossbooking"].map((ota) => (
                  <div key={ota}><label className="block text-sm font-medium text-slate-600 mb-1 capitalize">{ota}</label><input type="url" value={icalUrls[ota as keyof typeof icalUrls]} onChange={(e) => setIcalUrls({ ...icalUrls, [ota]: e.target.value })} placeholder={`https://${ota}.com/calendar/ical/...`} className="w-full px-4 py-2 border border-slate-200 rounded-xl" /></div>
                ))}
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={saveIcal} disabled={saving} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 disabled:opacity-50">Salva Link</button>
                <button onClick={syncIcal} disabled={saving} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50">🔄 Sincronizza</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
