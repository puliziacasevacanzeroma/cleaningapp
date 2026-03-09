"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

const CATEGORIES = [
  { value: "camera", label: "🛏 Camera", color: "bg-blue-100 text-blue-700" },
  { value: "bagno", label: "🚿 Bagno", color: "bg-cyan-100 text-cyan-700" },
  { value: "cucina", label: "🍳 Cucina", color: "bg-orange-100 text-orange-700" },
  { value: "soggiorno", label: "🛋 Soggiorno", color: "bg-purple-100 text-purple-700" },
  { value: "generale", label: "🏠 Generale", color: "bg-slate-100 text-slate-600" },
];

const DEFAULT_CHECKLIST = [
  { id: "1", text: "Cambiare lenzuola e federe", category: "camera" },
  { id: "2", text: "Rifare i letti", category: "camera" },
  { id: "3", text: "Cambiare asciugamani", category: "bagno" },
  { id: "4", text: "Pulire e disinfettare bagno", category: "bagno" },
  { id: "5", text: "Pulire specchi", category: "bagno" },
  { id: "6", text: "Aspirare pavimenti", category: "generale" },
  { id: "7", text: "Lavare pavimenti", category: "generale" },
  { id: "8", text: "Pulire cucina", category: "cucina" },
  { id: "9", text: "Pulire elettrodomestici", category: "cucina" },
  { id: "10", text: "Svuotare frigorifero", category: "cucina" },
  { id: "11", text: "Svuotare cestini", category: "generale" },
  { id: "12", text: "Controllare scorte", category: "generale" },
];

type ChecklistItem = { id: string; text: string; category: string };
type Property = { id: string; name: string; address?: string };

export default function AdminChecklistPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState("generale");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(query(collection(db, "properties"), where("status", "==", "ACTIVE")));
        const list: Property[] = snap.docs.map(d => {
          const data = d.data() as Record<string, string>;
          return {
            id: d.id,
            name: data.name ?? d.id,
            address: data.address ?? "",
          };
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setProperties(list);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function selectProperty(prop: Property) {
    setSelectedProperty(prop);
    setSaved(false);
    setEditingId(null);
    try {
      const res = await fetch(`/api/admin/checklist?propertyId=${prop.id}`);
      const data = await res.json() as { checklist?: ChecklistItem[] };
      if (data.checklist && data.checklist.length > 0) {
        setChecklist(data.checklist);
        setIsCustom(true);
      } else {
        setChecklist(DEFAULT_CHECKLIST.map(i => ({ ...i })));
        setIsCustom(false);
      }
    } catch {
      setChecklist(DEFAULT_CHECKLIST.map(i => ({ ...i })));
      setIsCustom(false);
    }
  }

  async function save() {
    if (!selectedProperty) return;
    setSaving(true);
    try {
      await fetch("/api/admin/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: selectedProperty.id, checklist }),
      });
      setIsCustom(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  function addItem() {
    if (!newText.trim()) return;
    setChecklist(prev => [...prev, { id: Date.now().toString(), text: newText.trim(), category: newCategory }]);
    setNewText("");
    setNewCategory("generale");
  }

  function removeItem(id: string) {
    setChecklist(prev => prev.filter(i => i.id !== id));
  }

  function moveItem(id: string, dir: "up" | "down") {
    setChecklist(prev => {
      const idx = prev.findIndex(i => i.id === id);
      if (idx < 0) return prev;
      if (dir === "up" && idx === 0) return prev;
      if (dir === "down" && idx === prev.length - 1) return prev;
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function resetToDefault() {
    if (confirm("Ripristinare la checklist standard aziendale? Le modifiche non salvate andranno perse.")) {
      setChecklist(DEFAULT_CHECKLIST.map(i => ({ ...i })));
      setIsCustom(false);
    }
  }

  const getCatStyle = (cat: string) => CATEGORIES.find(c => c.value === cat)?.color ?? "bg-slate-100 text-slate-600";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">✅ Checklist Pulizie</h1>
          <p className="text-sm text-slate-500">Configura le attività per ogni proprietà — visibile solo agli operatori</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl flex items-center gap-2">
            <span className="font-bold">{properties.length} proprietà</span>
          </div>
        </div>
      </div>

      {/* Selezione proprietà */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Seleziona Proprietà</label>
        <select
          className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50"
          value={selectedProperty?.id ?? ""}
          onChange={e => {
            const prop = properties.find(p => p.id === e.target.value);
            if (prop) void selectProperty(prop);
          }}
        >
          <option value="">— Scegli una casa —</option>
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.address ? ` · ${p.address}` : ""}</option>
          ))}
        </select>
      </div>

      {selectedProperty && (
        <>
          {/* Stato + Salva */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${isCustom ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {isCustom ? "✓ Personalizzata" : "Standard aziendale"}
              </span>
              <span className="text-sm text-slate-400">{checklist.length} voci</span>
              {isCustom && (
                <button onClick={resetToDefault} className="text-xs text-slate-400 hover:text-red-500 underline">
                  Ripristina default
                </button>
              )}
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvataggio...</>
              ) : saved ? (
                <>✓ Salvato!</>
              ) : (
                <>💾 Salva Checklist</>
              )}
            </button>
          </div>

          {/* Lista voci */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase">Voci — {selectedProperty.name}</p>
              <p className="text-xs text-slate-400">Clicca su una voce per modificarla</p>
            </div>

            {checklist.length === 0 ? (
              <div className="p-10 text-center">
                <span className="text-4xl block mb-3">📋</span>
                <p className="text-slate-400 text-sm">Nessuna voce. Aggiungine una qui sotto.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {checklist.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group">
                    <span className="text-xs text-slate-300 w-5 text-right shrink-0 font-mono">{idx + 1}</span>

                    <div className="flex-1 min-w-0">
                      {editingId === item.id ? (
                        <input
                          autoFocus
                          className="w-full border border-sky-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onBlur={() => {
                            if (editText.trim()) {
                              setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, text: editText.trim() } : i));
                            }
                            setEditingId(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                      ) : (
                        <span
                          className="text-sm text-slate-800 cursor-pointer hover:text-sky-600 transition-colors"
                          onClick={() => { setEditingId(item.id); setEditText(item.text); }}
                        >
                          {item.text}
                        </span>
                      )}
                    </div>

                    <select
                      value={item.category}
                      onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, category: e.target.value } : i))}
                      className={`text-xs font-medium px-2 py-1 rounded-lg border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-400 ${getCatStyle(item.category)}`}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => moveItem(item.id, "up")} disabled={idx === 0} className="p-1.5 text-slate-300 hover:text-slate-600 disabled:opacity-20 rounded-lg hover:bg-slate-100">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                      </button>
                      <button onClick={() => moveItem(item.id, "down")} disabled={idx === checklist.length - 1} className="p-1.5 text-slate-300 hover:text-slate-600 disabled:opacity-20 rounded-lg hover:bg-slate-100">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      <button onClick={() => removeItem(item.id)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Aggiungi voce */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs font-bold text-slate-500 uppercase mb-3">Aggiungi voce</p>
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <input
                type="text"
                placeholder="Es: Pulire terrazzo, Controllare aria condizionata..."
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50 min-w-0"
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addItem()}
              />
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-slate-50"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <button
                onClick={addItem}
                disabled={!newText.trim()}
                className="bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-40 transition-colors"
              >
                + Aggiungi
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm text-amber-800">
              <span className="font-bold">💡 Come funziona:</span> Clicca su una voce per modificarla inline. Usa le frecce per riordinare. Premi Salva per confermare. Se non configuri una checklist personalizzata, gli operatori vedono la checklist standard con {DEFAULT_CHECKLIST.length} voci.
            </p>
          </div>
        </>
      )}

      {!selectedProperty && (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
          <span className="text-5xl block mb-4">🏠</span>
          <p className="text-slate-500 font-medium">Seleziona una proprietà per gestire la sua checklist</p>
          <p className="text-slate-400 text-sm mt-1">{properties.length} proprietà attive disponibili</p>
        </div>
      )}
    </div>
  );
}
