"use client";

import { useState, useMemo, useEffect, useCallback } from "react";

interface InventoryItem {
  id: string;
  name: string;
  key?: string;
  categoryId: string;
  quantity: number;
  minQuantity: number;
  sellPrice: number;
  unit: string;
  isForLinen: boolean;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  description?: string;
  items: InventoryItem[];
}

interface Stats {
  totalItems: number;
  lowStock: number;
  outOfStock: number;
  totalValue: number;
}

interface InventarioClientProps {
  categories: Category[];
  stats: Stats;
}

const colorClasses: Record<string, { bg: string; bgLight: string; text: string; border: string }> = {
  sky: { bg: "bg-sky-500", bgLight: "bg-sky-50", text: "text-sky-600", border: "border-sky-200" },
  emerald: { bg: "bg-emerald-500", bgLight: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  violet: { bg: "bg-violet-500", bgLight: "bg-violet-50", text: "text-violet-600", border: "border-violet-200" },
  rose: { bg: "bg-rose-500", bgLight: "bg-rose-50", text: "text-rose-600", border: "border-rose-200" },
  amber: { bg: "bg-amber-500", bgLight: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  slate: { bg: "bg-slate-500", bgLight: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
};

export function InventarioClient({ categories: initialCategories, stats: initialStats }: InventarioClientProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories || []);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
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

  // Funzione per ricaricare i dati
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/list");
      const data = await res.json();
      if (data.categories) setCategories(data.categories);
      if (data.stats) setStats(data.stats);
      setLocalQuantities({});
    } catch (error) {
      console.error("Errore caricamento:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showAddModal || editingItem || quantityItem || deletingItem) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showAddModal, editingItem, quantityItem, deletingItem]);

  // Filtra per ricerca
  const filteredCategories = useMemo(() => {
    if (!searchTerm) return categories;
    const term = searchTerm.toLowerCase();
    return categories.map(cat => ({
      ...cat,
      items: cat.items.filter(item => item.name.toLowerCase().includes(term))
    })).filter(cat => cat.items.length > 0);
  }, [categories, searchTerm]);

  const getQuantity = (item: InventoryItem) => localQuantities[item.id] ?? item.quantity;

  const handleQuantityChange = async (itemId: string, delta: number, currentQty: number) => {
    const newQty = Math.max(0, currentQty + delta);
    setLocalQuantities(prev => ({ ...prev, [itemId]: newQty }));

    try {
      const res = await fetch("/api/inventory/update-quantity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, delta }),
      });
      if (!res.ok) setLocalQuantities(prev => ({ ...prev, [itemId]: currentQty }));
    } catch {
      setLocalQuantities(prev => ({ ...prev, [itemId]: currentQty }));
    }
  };

  const handleSetQuantity = async () => {
    if (!quantityItem) return;
    const oldQty = getQuantity(quantityItem);
    setLocalQuantities(prev => ({ ...prev, [quantityItem.id]: tempQuantity }));
    setQuantityItem(null);

    try {
      await fetch("/api/inventory/update-quantity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: quantityItem.id, newQuantity: tempQuantity }),
      });
    } catch {
      setLocalQuantities(prev => ({ ...prev, [quantityItem.id]: oldQty }));
    }
  };

  // SALVA ARTICOLO
  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name"),
      categoryId: formData.get("categoryId"),
      quantity: parseInt(formData.get("quantity") as string) || 0,
      minQuantity: parseInt(formData.get("minQuantity") as string) || 5,
      sellPrice: parseFloat(formData.get("sellPrice") as string) || 0,
      unit: formData.get("unit"),
      isForLinen: formData.get("isForLinen") === "on",
    };

    try {
      const url = editingItem ? `/api/inventory/${editingItem.id}` : "/api/inventory";
      const response = await fetch(url, {
        method: editingItem ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      
      if (!response.ok) {
        setError(result.error || "Errore durante il salvataggio");
        setSaving(false);
        return;
      }

      setShowAddModal(false);
      setEditingItem(null);
      setError(null);
      await fetchData();
    } catch (error: any) {
      setError(error.message || "Errore di connessione");
    } finally {
      setSaving(false);
    }
  };

  // ELIMINA ARTICOLO
  const handleDeleteItem = async () => {
    if (!deletingItem) return;
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/inventory/${deletingItem.id}`, { method: "DELETE" });
      const result = await response.json();
      
      if (!response.ok) {
        setError(result.error || "Errore durante l'eliminazione");
        setDeleting(false);
        return;
      }

      setDeletingItem(null);
      await fetchData();
    } catch (error: any) {
      setError(error.message || "Errore di connessione");
    } finally {
      setDeleting(false);
    }
  };

  const localStats = useMemo(() => {
    let totalValue = 0, lowStock = 0, outOfStock = 0, totalItems = 0;
    categories.forEach(cat => {
      cat.items.forEach(item => {
        totalItems++;
        const qty = getQuantity(item);
        totalValue += qty * item.sellPrice;
        if (qty === 0) outOfStock++;
        else if (qty <= item.minQuantity) lowStock++;
      });
    });
    return { totalItems, totalValue, lowStock, outOfStock };
  }, [categories, localQuantities]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* HEADER */}
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100 sticky top-0 z-40">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-900">🛏️ Biancheria & Dotazioni</h1>
          <button
            onClick={() => { setShowAddModal(true); setError(null); }}
            className="h-10 px-5 bg-slate-900 text-white rounded-full text-sm font-semibold flex items-center gap-2 shadow-lg active:scale-95 transition-transform"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nuovo
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-slate-100 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-slate-800">{localStats.totalItems}</p>
            <p className="text-[9px] text-slate-500 font-medium">ARTICOLI</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-emerald-600">€{localStats.totalValue.toFixed(0)}</p>
            <p className="text-[9px] text-emerald-600 font-medium">VALORE</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-amber-600">{localStats.lowStock}</p>
            <p className="text-[9px] text-amber-600 font-medium">BASSI</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-red-500">{localStats.outOfStock}</p>
            <p className="text-[9px] text-red-500 font-medium">ESAURITI</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cerca articolo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-11 pl-11 pr-4 bg-slate-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="px-4 py-2">
          <div className="bg-blue-50 text-blue-700 text-sm px-4 py-2 rounded-xl flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Aggiornamento...
          </div>
        </div>
      )}

      {/* CATEGORIE */}
      <div className="px-4 py-4 space-y-3">
        {filteredCategories.map((category) => {
          const colors = colorClasses[category.color] || colorClasses.slate;
          const isExpanded = expandedCategory === category.id;
          const categoryItems = category.items;
          const lowStockCount = categoryItems.filter(i => { const qty = getQuantity(i); return qty > 0 && qty <= i.minQuantity; }).length;
          const outOfStockCount = categoryItems.filter(i => getQuantity(i) === 0).length;

          return (
            <div key={category.id} className={`bg-white rounded-2xl border overflow-hidden transition-all ${isExpanded ? colors.border : 'border-slate-100'}`}>
              {/* Header categoria */}
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                className={`w-full px-4 py-4 flex items-center justify-between transition-colors ${isExpanded ? colors.bgLight : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center text-2xl text-white shadow-lg`}>
                    {category.icon}
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-slate-800">{category.name}</h3>
                    <p className="text-xs text-slate-500">{categoryItems.length} articoli</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {outOfStockCount > 0 && <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-full">{outOfStockCount} esauriti</span>}
                  {lowStockCount > 0 && <span className="px-2 py-1 bg-amber-100 text-amber-600 text-[10px] font-bold rounded-full">{lowStockCount} bassi</span>}
                  <svg className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Items */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {categoryItems.map((item) => {
                      const qty = getQuantity(item);
                      const isLow = qty <= item.minQuantity && qty > 0;
                      const isOut = qty === 0;

                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl p-3 border transition-all ${
                            isOut ? 'bg-red-50 border-red-200' : isLow ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-slate-800 text-sm leading-tight">{item.name}</h4>
                              <p className="text-xs text-slate-500 mt-0.5">€{item.sellPrice.toFixed(2)}/{item.unit}</p>
                            </div>
                          </div>

                          {/* Controlli quantità */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleQuantityChange(item.id, -1, qty)}
                                disabled={qty === 0}
                                className="w-7 h-7 flex items-center justify-center bg-white rounded-lg text-slate-600 font-bold disabled:opacity-30 border border-slate-200"
                              >
                                −
                              </button>
                              <button
                                onClick={() => { setQuantityItem(item); setTempQuantity(qty); }}
                                className={`min-w-[40px] h-7 px-2 flex items-center justify-center rounded-lg text-xs font-bold ${
                                  isOut ? 'bg-red-500 text-white' : isLow ? 'bg-amber-500 text-white' : 'bg-slate-800 text-white'
                                }`}
                              >
                                {qty}
                              </button>
                              <button
                                onClick={() => handleQuantityChange(item.id, 1, qty)}
                                className="w-7 h-7 flex items-center justify-center bg-emerald-500 rounded-lg text-white font-bold"
                              >
                                +
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setEditingItem(item); setError(null); }}
                                className="w-7 h-7 flex items-center justify-center bg-white rounded-lg text-slate-400 border border-slate-200 hover:bg-slate-100"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => { setDeletingItem(item); setError(null); }}
                                className="w-7 h-7 flex items-center justify-center bg-red-50 rounded-lg text-red-400 border border-red-200 hover:bg-red-100"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MODAL NUOVO/MODIFICA */}
      {(showAddModal || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowAddModal(false); setEditingItem(null); setError(null); }} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-slate-100 rounded-t-3xl">
              <h2 className="text-lg font-bold text-slate-800">{editingItem ? "✏️ Modifica Articolo" : "➕ Nuovo Articolo"}</h2>
              <button onClick={() => { setShowAddModal(false); setEditingItem(null); setError(null); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">⚠️ {error}</div>
            )}

            <form onSubmit={handleSaveItem} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome articolo *</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingItem?.name}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="es. Lenzuola Matrimoniali"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Categoria *</label>
                <select
                  name="categoryId"
                  defaultValue={editingItem?.categoryId || "biancheria_letto"}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="biancheria_letto">🛏️ Biancheria Letto</option>
                  <option value="biancheria_bagno">🛁 Biancheria Bagno</option>
                  <option value="kit_cortesia">🧴 Kit Cortesia</option>
                  <option value="servizi_extra">🎁 Servizi Extra</option>
                  <option value="altro">📦 Altro</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Quantità</label>
                  <input
                    type="number"
                    name="quantity"
                    defaultValue={editingItem?.quantity || 0}
                    min="0"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Scorta minima</label>
                  <input
                    type="number"
                    name="minQuantity"
                    defaultValue={editingItem?.minQuantity || 5}
                    min="0"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Prezzo € *</label>
                  <input
                    type="number"
                    name="sellPrice"
                    defaultValue={editingItem?.sellPrice || 0}
                    min="0"
                    step="0.01"
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Unità</label>
                  <select
                    name="unit"
                    defaultValue={editingItem?.unit || "pz"}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="pz">Pezzi</option>
                    <option value="set">Set</option>
                    <option value="kit">Kit</option>
                    <option value="conf">Confezioni</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  name="isForLinen"
                  defaultChecked={editingItem?.isForLinen ?? true}
                  className="w-5 h-5 text-slate-900 rounded"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">Articolo biancheria</span>
                  <p className="text-xs text-slate-500">Visibile nel configuratore biancheria</p>
                </div>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingItem(null); setError(null); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Salvataggio...
                    </>
                  ) : (editingItem ? "Salva" : "Aggiungi")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFERMA ELIMINAZIONE */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeletingItem(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Elimina Articolo</h3>
            <p className="text-sm text-slate-500 text-center mb-1">Sei sicuro di voler eliminare</p>
            <p className="text-base font-semibold text-slate-800 text-center mb-6">"{deletingItem.name}"?</p>

            {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">⚠️ {error}</div>}

            <div className="flex gap-3">
              <button onClick={() => setDeletingItem(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold">Annulla</button>
              <button
                onClick={handleDeleteItem}
                disabled={deleting}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QUANTITÀ */}
      {quantityItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setQuantityItem(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xs p-6">
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Modifica Quantità</h3>
            <p className="text-sm text-slate-500 text-center mb-6 truncate">{quantityItem.name}</p>

            <div className="flex items-center justify-center gap-2 mb-6">
              <button onClick={() => setTempQuantity(Math.max(0, tempQuantity - 10))} className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl text-slate-600 font-bold text-xs">-10</button>
              <button onClick={() => setTempQuantity(Math.max(0, tempQuantity - 1))} className="w-10 h-10 flex items-center justify-center bg-slate-200 rounded-xl text-slate-700 font-bold text-xl">−</button>
              <input
                type="number"
                value={tempQuantity}
                onChange={(e) => setTempQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 h-12 text-center text-xl font-bold text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-xl"
              />
              <button onClick={() => setTempQuantity(tempQuantity + 1)} className="w-10 h-10 flex items-center justify-center bg-emerald-500 rounded-xl text-white font-bold text-xl">+</button>
              <button onClick={() => setTempQuantity(tempQuantity + 10)} className="w-10 h-10 flex items-center justify-center bg-emerald-600 rounded-xl text-white font-bold text-xs">+10</button>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setQuantityItem(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold">Annulla</button>
              <button onClick={handleSetQuantity} disabled={tempQuantity === getQuantity(quantityItem)} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-semibold disabled:opacity-50">Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
