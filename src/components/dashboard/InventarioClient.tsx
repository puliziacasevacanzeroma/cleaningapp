"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

const SYSTEM_ITEM_IDS = new Set([
  "item_doubleSheets", "item_singleSheets", "item_pillowcases",
  "item_towelsLarge", "item_towelsFace", "item_towelsSmall", "item_bathMats",
]);
function isSystemItem(id: string): boolean { return SYSTEM_ITEM_IDS.has(id); }

// SVG Icons
const I = {
  package: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M21 16V8L12 3L3 8V16L12 21L21 16Z" fill="currentColor" opacity="0.1"/><path d="M12 12V21M3 8L12 12L21 8"/></svg>,
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  bath: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 12H20V16C20 18 18 20 16 20H8C6 20 4 18 4 16V12Z" fill="currentColor" opacity="0.1"/><path d="M4 12H20"/></svg>,
  soap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="8" width="12" height="12" rx="2" fill="currentColor" opacity="0.1"/><path d="M10 8V6C10 5 11 4 12 4C13 4 14 5 14 6V8M9 12H15M9 15H13"/></svg>,
  gift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="8" width="18" height="13" rx="2" fill="currentColor" opacity="0.1"/><path d="M12 8V21M3 12H21M12 8C12 8 12 5 9.5 5C8 5 7 6 7 7C7 8 8 8 12 8M12 8C12 8 12 5 14.5 5C16 5 17 6 17 7C17 8 16 8 12 8"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M12 5V19M5 12H19"/></svg>,
  minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M5 12H19"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M18 6L6 18M6 6L18 18"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>,
  money: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 6V18M15 9C15 8 14 7 12 7S9 8 9 10C9 11 10 12 12 12S15 13 15 15C15 17 14 17 12 17S9 16 9 15"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M11 4H4C2.9 4 2 4.9 2 6V20C2 21.1 2.9 22 4 22H18C19.1 22 20 21.1 20 20V13"/><path d="M18.5 2.5C19.3 1.7 20.7 1.7 21.5 2.5C22.3 3.3 22.3 4.7 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 6H21M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6H19Z" fill="currentColor" opacity="0.1"/></svg>,
  lock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M12 15V17M6 21H18C19 21 20 20 20 19V13C20 12 19 11 18 11H6C5 11 4 12 4 13V19C4 20 5 21 6 21ZM16 11V7A4 4 0 008 7V11H16Z"/></svg>,
};

const CAT_ICONS: Record<string, React.ReactNode> = {
  biancheria_letto: I.bed, biancheria_bagno: I.bath, kit_cortesia: I.soap, servizi_extra: I.gift, altro: I.package,
};

interface InventoryItem { id: string; name: string; key?: string; categoryId: string; quantity: number; minQuantity: number; sellPrice: number; unit: string; isForLinen: boolean; isSystemItem?: boolean; }
interface Category { id: string; name: string; icon: string; color: string; description?: string; items: InventoryItem[]; }
interface Stats { totalItems: number; lowStock: number; outOfStock: number; totalValue: number; }
interface InventarioClientProps { categories: Category[]; stats: Stats; }

export function InventarioClient({ categories: initialCategories, stats: initialStats }: InventarioClientProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories || []);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [quantityItem, setQuantityItem] = useState<InventoryItem | null>(null);
  const [tempQuantity, setTempQuantity] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localQuantities, setLocalQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/list");
      const data = await res.json();
      if (data.categories) setCategories(data.categories.filter((c: any) => c.id !== "prodotti_pulizia"));
      if (data.stats) setStats(data.stats);
      setLocalQuantities({});
    } catch (error) { console.error("Errore caricamento:", error); }
    finally { setLoading(false); }
  }, []);

  const isFirstSnapshot = useRef(true);
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), () => {
      if (isFirstSnapshot.current) { isFirstSnapshot.current = false; return; }
      fetchData();
    });
    return () => unsubscribe();
  }, [fetchData]);

  useEffect(() => {
    if (showAddModal || editingItem || quantityItem || deletingItem) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [showAddModal, editingItem, quantityItem, deletingItem]);

  const filteredCategories = useMemo(() => {
    if (!searchTerm) return categories;
    const term = searchTerm.toLowerCase();
    return categories.map(cat => ({ ...cat, items: cat.items.filter(item => item.name.toLowerCase().includes(term)) })).filter(cat => cat.items.length > 0);
  }, [categories, searchTerm]);

  const getQuantity = (item: InventoryItem) => localQuantities[item.id] ?? item.quantity;

  const handleQuantityChange = async (itemId: string, delta: number, currentQty: number) => {
    const newQty = Math.max(0, currentQty + delta);
    setLocalQuantities(prev => ({ ...prev, [itemId]: newQty }));
    try {
      const res = await fetch("/api/inventory/update-quantity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, delta }) });
      if (!res.ok) setLocalQuantities(prev => ({ ...prev, [itemId]: currentQty }));
    } catch { setLocalQuantities(prev => ({ ...prev, [itemId]: currentQty })); }
  };

  const handleSetQuantity = async () => {
    if (!quantityItem) return;
    const oldQty = getQuantity(quantityItem);
    setLocalQuantities(prev => ({ ...prev, [quantityItem.id]: tempQuantity }));
    setQuantityItem(null);
    try {
      await fetch("/api/inventory/update-quantity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: quantityItem.id, newQuantity: tempQuantity }) });
    } catch { setLocalQuantities(prev => ({ ...prev, [quantityItem.id]: oldQty })); }
  };

  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setSaving(true); setError(null);
    const formData = new FormData(e.currentTarget);
    const isSysItem = editingItem && (isSystemItem(editingItem.id) || editingItem.isSystemItem);
    const data = {
      name: isSysItem ? editingItem.name : formData.get("name"),
      categoryId: isSysItem ? editingItem.categoryId : formData.get("categoryId"),
      quantity: parseInt(formData.get("quantity") as string) || 0,
      minQuantity: parseInt(formData.get("minQuantity") as string) || 5,
      sellPrice: parseFloat(formData.get("sellPrice") as string) || 0,
      unit: formData.get("unit"),
      isForLinen: formData.get("isForLinen") === "on",
      isSystemItem: isSysItem ? true : undefined,
    };
    try {
      const url = editingItem ? `/api/inventory/${editingItem.id}` : "/api/inventory";
      const response = await fetch(url, { method: editingItem ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Errore durante il salvataggio"); setSaving(false); return; }
      setShowAddModal(false); setEditingItem(null); setError(null);
      setTimeout(() => fetchData(), 1000);
    } catch (error: any) { setError(error.message || "Errore di connessione"); }
    finally { setSaving(false); }
  };

  const handleDeleteItem = async () => {
    if (!deletingItem) return; setDeleting(true); setError(null);
    try {
      const response = await fetch(`/api/inventory/${deletingItem.id}?confirm=true`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Errore durante l'eliminazione"); setDeleting(false); return; }
      setCategories(prev => prev.map(cat => ({ ...cat, items: cat.items.filter(i => i.id !== deletingItem.id) })));
      setDeletingItem(null);
      setTimeout(() => fetchData(), 1500);
    } catch (error: any) { setError(error.message || "Errore di connessione"); }
    finally { setDeleting(false); }
  };

  const localStats = useMemo(() => {
    let totalValue = 0, lowStock = 0, outOfStock = 0, totalItems = 0;
    categories.forEach(cat => { cat.items.forEach(item => { totalItems++; const qty = getQuantity(item); totalValue += qty * item.sellPrice; if (qty === 0) outOfStock++; else if (qty <= item.minQuantity) lowStock++; }); });
    return { totalItems, totalValue, lowStock, outOfStock };
  }, [categories, localQuantities]);

  const totalPieces = useMemo(() => {
    let total = 0;
    categories.forEach(cat => { cat.items.forEach(item => { total += getQuantity(item); }); });
    return total;
  }, [categories, localQuantities]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* HEADER */}
      <div className="bg-white px-4 py-3.5 border-b border-slate-200 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 text-slate-500">{I.package}</div>
            <h1 className="text-[17px] font-bold text-slate-900">Magazzino</h1>
          </div>
          <button onClick={() => { setShowAddModal(true); setError(null); }} className="h-9 px-3.5 bg-slate-900 text-white rounded-[10px] text-xs font-bold flex items-center gap-1.5">
            <div className="w-3.5 h-3.5">{I.plus}</div> Nuovo
          </button>
        </div>
      </div>

      {/* BANNER */}
      <div className="mx-4 mt-4 rounded-2xl p-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #334155 100%)' }}>
        <div className="absolute -top-8 -right-5 w-36 h-36 rounded-full" style={{ background: 'rgba(99,102,241,0.08)' }} />
        <div className="absolute -bottom-12 left-[30%] w-44 h-24 rounded-full" style={{ background: 'rgba(99,102,241,0.05)' }} />
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[11px] text-white/50 font-semibold tracking-wide mb-1">Valore Magazzino</p>
              <p className="text-[32px] font-black text-white leading-none">€ {localStats.totalValue.toFixed(0)}</p>
            </div>
            <div className="flex items-center gap-1.5 bg-white/[0.08] border border-white/[0.1] rounded-lg px-2.5 py-1.5">
              <div className="w-3 h-3 text-white/70">{I.package}</div>
              <span className="text-[10px] font-bold text-white/70">{localStats.totalItems} articoli</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/[0.06] border border-white/[0.06] rounded-[10px] py-2.5 text-center">
              <p className="text-xl font-black text-emerald-300 leading-none">{totalPieces.toLocaleString('it-IT')}</p>
              <p className="text-[8px] font-bold text-white/40 mt-1 tracking-wider">PEZZI TOTALI</p>
            </div>
            <div className="bg-white/[0.06] border border-white/[0.06] rounded-[10px] py-2.5 text-center">
              <p className="text-xl font-black text-amber-300 leading-none">{localStats.lowStock}</p>
              <p className="text-[8px] font-bold text-white/40 mt-1 tracking-wider">SCORTA BASSA</p>
            </div>
            <div className="bg-white/[0.06] border border-white/[0.06] rounded-[10px] py-2.5 text-center">
              <p className="text-xl font-black text-red-300 leading-none">{localStats.outOfStock}</p>
              <p className="text-[8px] font-bold text-white/40 mt-1 tracking-wider">ESAURITI</p>
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH */}
      <div className="mx-4 mt-4 mb-4 relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400">{I.search}</div>
        <input type="text" placeholder="Cerca articolo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-[42px] pl-10 pr-4 bg-white border border-slate-200 rounded-xl text-[13px] outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/10 text-slate-700 placeholder:text-slate-400" />
      </div>

      {/* LOADING */}
      {loading && (
        <div className="mx-4 mb-3 bg-blue-50 text-blue-700 text-xs px-4 py-2 rounded-xl flex items-center gap-2">
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
          Aggiornamento...
        </div>
      )}

      {/* CATEGORIES — always expanded */}
      <div className="px-4 space-y-5">
        {filteredCategories.map((category) => {
          const catIcon = CAT_ICONS[category.id] || I.package;
          const categoryItems = category.items;
          const catValue = categoryItems.reduce((sum, i) => sum + getQuantity(i) * i.sellPrice, 0);
          const lowCount = categoryItems.filter(i => { const q = getQuantity(i); return q > 0 && q <= i.minQuantity; }).length;
          const outCount = categoryItems.filter(i => getQuantity(i) === 0).length;

          return (
            <div key={category.id}>
              {/* Section header */}
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-[9px] bg-slate-900 flex items-center justify-center">
                  <div className="w-4 h-4 text-white">{catIcon}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-slate-800">{category.name}</span>
                    <span className="text-[11px] text-slate-400">{categoryItems.length} articoli</span>
                  </div>
                </div>
                {outCount > 0 && <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[9px] font-bold rounded-md border border-red-200">{outCount} esauriti</span>}
                {lowCount > 0 && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-bold rounded-md border border-amber-200">{lowCount} bassi</span>}
                <span className="text-xs font-extrabold text-slate-500">€{catValue.toFixed(0)}</span>
              </div>

              {/* Items card */}
              <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden">
                {categoryItems.map((item, idx) => {
                  const qty = getQuantity(item);
                  const isLow = qty > 0 && qty <= item.minQuantity;
                  const isOut = qty === 0;
                  const isSysItem = isSystemItem(item.id) || item.isSystemItem;

                  return (
                    <div key={item.id} className={`flex items-center gap-2 px-3.5 py-2.5 ${idx < categoryItems.length - 1 ? 'border-b border-slate-100' : ''} ${isOut ? 'bg-red-50/50' : isLow ? 'bg-amber-50/30' : ''}`}>
                      {/* Status bar */}
                      <div className={`w-[3px] h-[30px] rounded-full flex-shrink-0 ${isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'}`} />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-semibold text-slate-800">{item.name}</span>
                          {isSysItem && <span className="px-1 py-px bg-slate-100 text-slate-500 border border-slate-300 rounded text-[7px] font-extrabold tracking-wide">SISTEMA</span>}
                          {isLow && <span className="px-1 py-px bg-amber-100 text-amber-700 rounded text-[7px] font-extrabold">BASSO</span>}
                          {isOut && <span className="px-1 py-px bg-red-100 text-red-600 rounded text-[7px] font-extrabold">ESAURITO</span>}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">€{item.sellPrice.toFixed(2)}/{item.unit} · min {item.minQuantity}</p>
                      </div>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-[3px] flex-shrink-0">
                        <button onClick={() => handleQuantityChange(item.id, -1, qty)} disabled={qty === 0}
                          className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center disabled:opacity-20 active:scale-95 transition-transform">
                          <div className="w-3.5 h-3.5 text-slate-500">{I.minus}</div>
                        </button>
                        <button onClick={() => { setQuantityItem(item); setTempQuantity(qty); }}
                          className="min-w-[32px] h-7 px-1 text-center text-[13px] font-bold text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                          {qty}
                        </button>
                        <button onClick={() => handleQuantityChange(item.id, 1, qty)}
                          className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center active:scale-95 transition-transform">
                          <div className="w-3.5 h-3.5 text-white">{I.plus}</div>
                        </button>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-[3px] flex-shrink-0">
                        {isSysItem ? (
                          <>
                            <button onClick={() => { setEditingItem(item); setError(null); }} className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50" title="Modifica prezzo">
                              <div className="w-3.5 h-3.5 text-slate-400">{I.money}</div>
                            </button>
                            <span className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center opacity-25 cursor-not-allowed" title="Non eliminabile">
                              <div className="w-3.5 h-3.5 text-slate-400">{I.lock}</div>
                            </span>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingItem(item); setError(null); }} className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50">
                              <div className="w-3.5 h-3.5 text-slate-400">{I.edit}</div>
                            </button>
                            <button onClick={() => { setDeletingItem(item); setError(null); }} className="w-7 h-7 rounded-lg border border-red-200 bg-white flex items-center justify-center hover:bg-red-50">
                              <div className="w-3.5 h-3.5 text-red-400">{I.trash}</div>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL NUOVO/MODIFICA */}
      {(showAddModal || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowAddModal(false); setEditingItem(null); setError(null); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-slate-100 rounded-t-2xl">
              <h2 className="text-base font-bold text-slate-800">{editingItem ? "Modifica Articolo" : "Nuovo Articolo"}</h2>
              <button onClick={() => { setShowAddModal(false); setEditingItem(null); setError(null); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
                <div className="w-5 h-5 text-slate-400">{I.close}</div>
              </button>
            </div>

            {editingItem && (isSystemItem(editingItem.id) || editingItem.isSystemItem) && (
              <div className="mx-5 mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 text-slate-500">{I.lock}</div>
                  <div><p className="font-semibold text-slate-700 text-xs">Articolo di sistema</p><p className="text-[10px] text-slate-500">Nome e categoria non modificabili.</p></div>
                </div>
              </div>
            )}

            {error && <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">⚠️ {error}</div>}

            <form onSubmit={handleSaveItem} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome articolo *</label>
                <input type="text" name="name" defaultValue={editingItem?.name} required
                  // @ts-expect-error TODO-FIX
                  disabled={editingItem && (isSystemItem(editingItem.id) || editingItem.isSystemItem)}
                  className={`w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 ${editingItem && (isSystemItem(editingItem.id) || editingItem.isSystemItem) ? 'bg-slate-100 cursor-not-allowed text-slate-500' : 'bg-white'}`}
                  placeholder="es. Lenzuola Matrimoniali" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Categoria *</label>
                <select name="categoryId" defaultValue={editingItem?.categoryId || "biancheria_letto"} required
                  // @ts-expect-error TODO-FIX
                  disabled={editingItem && (isSystemItem(editingItem.id) || editingItem.isSystemItem)}
                  className={`w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400 ${editingItem && (isSystemItem(editingItem.id) || editingItem.isSystemItem) ? 'bg-slate-100 cursor-not-allowed text-slate-500' : 'bg-white'}`}>
                  <option value="biancheria_letto">Biancheria Letto</option>
                  <option value="biancheria_bagno">Biancheria Bagno</option>
                  <option value="kit_cortesia">Kit Cortesia</option>
                  <option value="servizi_extra">Servizi Extra</option>
                  <option value="altro">Altro</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Quantità</label>
                  <input type="number" name="quantity" defaultValue={editingItem?.quantity || 0} min="0" className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Scorta minima</label>
                  <input type="number" name="minQuantity" defaultValue={editingItem?.minQuantity || 5} min="0" className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Prezzo € *</label>
                  <input type="number" name="sellPrice" defaultValue={editingItem?.sellPrice || 0} min="0" step="0.01" required className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Unità</label>
                  <select name="unit" defaultValue={editingItem?.unit || "pz"} className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400">
                    <option value="pz">Pezzi</option><option value="set">Set</option><option value="kit">Kit</option><option value="conf">Confezioni</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl cursor-pointer border border-slate-200">
                <input type="checkbox" name="isForLinen" defaultChecked={editingItem?.isForLinen ?? true} className="w-4 h-4 text-slate-900 rounded" />
                <div><span className="text-xs font-semibold text-slate-700">Articolo biancheria</span><p className="text-[10px] text-slate-500">Visibile nel configuratore</p></div>
              </label>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowAddModal(false); setEditingItem(null); setError(null); }} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold">Annulla</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> Salvataggio...</> : (editingItem ? "Salva" : "Aggiungi")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ELIMINA */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeletingItem(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-14 h-14 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <div className="w-7 h-7 text-red-500">{I.trash}</div>
            </div>
            <h3 className="text-base font-bold text-slate-800 text-center mb-2">Elimina Articolo</h3>
            <p className="text-sm text-slate-500 text-center mb-1">Sei sicuro di voler eliminare</p>
            <p className="text-sm font-semibold text-slate-800 text-center mb-5">&quot;{deletingItem.name}&quot;?</p>
            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">⚠️ {error}</div>}
            <div className="flex gap-3">
              <button onClick={() => setDeletingItem(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold">Annulla</button>
              <button onClick={handleDeleteItem} disabled={deleting} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg> : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QUANTITÀ */}
      {quantityItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setQuantityItem(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
            <h3 className="text-base font-bold text-slate-800 text-center mb-1">Modifica Quantità</h3>
            <p className="text-sm text-slate-500 text-center mb-5 truncate">{quantityItem.name}</p>
            <div className="flex items-center justify-center gap-2 mb-5">
              <button onClick={() => setTempQuantity(Math.max(0, tempQuantity - 10))} className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl text-slate-600 font-bold text-xs border border-slate-200">-10</button>
              <button onClick={() => setTempQuantity(Math.max(0, tempQuantity - 1))} className="w-10 h-10 flex items-center justify-center bg-slate-200 rounded-xl text-slate-700 font-bold text-xl">−</button>
              <input type="number" value={tempQuantity} onChange={(e) => setTempQuantity(Math.max(0, parseInt(e.target.value) || 0))} className="w-16 h-12 text-center text-xl font-bold text-slate-800 bg-white border-2 border-slate-200 rounded-xl outline-none focus:border-slate-400" />
              <button onClick={() => setTempQuantity(tempQuantity + 1)} className="w-10 h-10 flex items-center justify-center bg-slate-900 rounded-xl text-white font-bold text-xl">+</button>
              <button onClick={() => setTempQuantity(tempQuantity + 10)} className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-xl text-white font-bold text-xs">+10</button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setQuantityItem(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold">Annulla</button>
              <button onClick={handleSetQuantity} disabled={tempQuantity === getQuantity(quantityItem)} className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold disabled:opacity-50">Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
