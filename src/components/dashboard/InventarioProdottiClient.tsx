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

interface InventarioProdottiClientProps {
  categories: Category[];
  stats: Stats;
}

export function InventarioProdottiClient({ categories: initialCategories, stats: initialStats }: InventarioProdottiClientProps) {
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

  // Funzione per ricaricare i dati
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/list?type=prodotti");
      const data = await res.json();
      
      // Filtra solo prodotti_pulizia
      const prodottiCategories = (data.categories || []).filter(
        (cat: Category) => cat.id === "prodotti_pulizia"
      );
      setCategories(prodottiCategories);
      
      // Ricalcola stats
      let totalItems = 0, lowStock = 0, outOfStock = 0, totalValue = 0;
      prodottiCategories.forEach((cat: Category) => {
        cat.items.forEach((item: any) => {
          totalItems++;
          totalValue += item.quantity * item.sellPrice;
          if (item.quantity === 0) outOfStock++;
          else if (item.quantity <= item.minQuantity) lowStock++;
        });
      });
      setStats({ totalItems, lowStock, outOfStock, totalValue });
      setLocalQuantities({});
    } catch (error) {
      console.error("Errore caricamento:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Non blocchiamo più il body scroll - lasciamo che il modal gestisca da solo
    return () => {};
  }, [showAddModal, editingItem, quantityItem, deletingItem]);

  // Tutti i prodotti pulizia (appiattiti)
  const allProducts = useMemo(() => {
    return categories.flatMap(cat => cat.items);
  }, [categories]);

  // Filtra per ricerca
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return allProducts;
    const term = searchTerm.toLowerCase();
    return allProducts.filter(item => item.name.toLowerCase().includes(term));
  }, [allProducts, searchTerm]);

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
      categoryId: "prodotti_pulizia", // Sempre prodotti_pulizia
      quantity: parseInt(formData.get("quantity") as string) || 0,
      minQuantity: parseInt(formData.get("minQuantity") as string) || 5,
      sellPrice: parseFloat(formData.get("sellPrice") as string) || 0,
      unit: formData.get("unit"),
      isForLinen: false, // Mai per biancheria
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

  // Stats locali
  const localStats = useMemo(() => {
    let totalValue = 0, lowStock = 0, outOfStock = 0, totalItems = 0;
    allProducts.forEach(item => {
      totalItems++;
      const qty = getQuantity(item);
      totalValue += qty * item.sellPrice;
      if (qty === 0) outOfStock++;
      else if (qty <= item.minQuantity) lowStock++;
    });
    return { totalItems, totalValue, lowStock, outOfStock };
  }, [allProducts, localQuantities]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50 pb-24">
      {/* HEADER */}
      <div className="bg-white/80 backdrop-blur-lg px-4 pt-4 pb-4 border-b border-rose-100 sticky top-0 z-40">
        {/* Titolo */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
              <span className="text-2xl">🧹</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Prodotti Pulizia</h1>
              <p className="text-xs text-slate-500">Per gli operatori</p>
            </div>
          </div>
          <button
            onClick={() => { setShowAddModal(true); setError(null); }}
            className="h-10 px-5 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-full text-sm font-semibold flex items-center gap-2 shadow-lg shadow-rose-500/30 active:scale-95 transition-transform"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nuovo
          </button>
        </div>

        {/* Info Box */}
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">
          <p className="text-xs text-rose-700">
            <span className="font-semibold">💡 Come funziona:</span> Gli operatori possono richiedere questi prodotti durante le pulizie. 
            Le richieste vengono aggiunte automaticamente agli ordini per il rider.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-white rounded-xl p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-slate-800">{localStats.totalItems}</p>
            <p className="text-[9px] text-slate-500 font-medium">PRODOTTI</p>
          </div>
          <div className="bg-rose-100 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-rose-600">€{localStats.totalValue.toFixed(0)}</p>
            <p className="text-[9px] text-rose-600 font-medium">VALORE</p>
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
            placeholder="Cerca prodotto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-11 pl-11 pr-4 bg-white rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 border border-rose-100"
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="px-4 py-2">
          <div className="bg-rose-50 text-rose-700 text-sm px-4 py-2 rounded-xl flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Aggiornamento...
          </div>
        </div>
      )}

      {/* PRODOTTI */}
      <div className="px-4 py-4">
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-rose-300 p-8 text-center">
            <span className="text-5xl block mb-4">🧹</span>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              {searchTerm ? "Nessun prodotto trovato" : "Nessun prodotto pulizia"}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {searchTerm 
                ? "Prova con un termine di ricerca diverso"
                : "Aggiungi detergenti, saponi e altri prodotti che gli operatori possono richiedere durante le pulizie."
              }
            </p>
            {!searchTerm && (
              <button
                onClick={() => { setShowAddModal(true); setError(null); }}
                className="px-6 py-3 bg-gradient-to-r from-rose-500 to-pink-600 text-white rounded-xl font-semibold shadow-lg"
              >
                + Aggiungi Primo Prodotto
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((item) => {
              const qty = getQuantity(item);
              const isLow = qty > 0 && qty <= item.minQuantity;
              const isOut = qty === 0;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${
                    isOut ? 'border-red-200 bg-red-50/30' : isLow ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100'
                  }`}
                >
                  {/* Riga principale */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl ${
                        isOut ? 'bg-red-100' : isLow ? 'bg-amber-100' : 'bg-rose-100'
                      }`}>
                        🧴
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-base">{item.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            Min: {item.minQuantity}
                          </span>
                          {item.sellPrice > 0 && (
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              €{item.sellPrice.toFixed(2)}/{item.unit}
                            </span>
                          )}
                        </div>
                        {isOut && <p className="text-xs text-red-500 font-semibold mt-1">⚠️ Esaurito</p>}
                        {isLow && !isOut && <p className="text-xs text-amber-500 font-semibold mt-1">⚠️ Scorta bassa</p>}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setEditingItem(item); setShowAddModal(true); setError(null); }}
                          className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeletingItem(item)}
                          className="w-10 h-10 rounded-xl hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Controlli quantità - riga separata */}
                  <div className={`px-4 py-3 flex items-center justify-between ${
                    isOut ? 'bg-red-50' : isLow ? 'bg-amber-50' : 'bg-slate-50'
                  }`}>
                    <span className="text-sm font-medium text-slate-600">Quantità in magazzino</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleQuantityChange(item.id, -1, qty)}
                        className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-100 shadow-sm"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { setQuantityItem(item); setTempQuantity(qty); }}
                        className={`min-w-[60px] h-11 px-4 rounded-xl font-bold text-lg ${
                          isOut ? 'bg-red-100 text-red-600' : isLow ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {qty}
                      </button>
                      <button
                        onClick={() => handleQuantityChange(item.id, 1, qty)}
                        className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-100 shadow-sm"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════ */}

      {/* ADD/EDIT MODAL */}
      {showAddModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => { setShowAddModal(false); setEditingItem(null); }}
        >
          <div 
            className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl flex flex-col"
            style={{ maxHeight: 'calc(100vh - 60px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle per trascinamento */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-slate-300 rounded-full"></div>
            </div>

            {/* Header */}
            <div className="bg-gradient-to-r from-rose-500 to-pink-600 mx-4 px-5 py-4 flex items-center justify-between rounded-2xl flex-shrink-0">
              <h2 className="text-lg font-bold text-white">
                {editingItem ? "Modifica Prodotto" : "Nuovo Prodotto Pulizia"}
              </h2>
              <button 
                type="button"
                onClick={() => { setShowAddModal(false); setEditingItem(null); }} 
                className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form - con scroll */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <form onSubmit={handleSaveItem} className="p-4 space-y-4">
                {error && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Nome Prodotto *</label>
                  <input
                    name="name"
                    type="text"
                    required
                    defaultValue={editingItem?.name || ""}
                    placeholder="Es: Sapone pavimenti..."
                    className="w-full h-14 px-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-rose-500 text-base"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Quantità</label>
                    <input
                      name="quantity"
                      type="number"
                      min="0"
                      defaultValue={editingItem?.quantity || 0}
                      className="w-full h-14 px-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-rose-500 text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Qta Minima</label>
                    <input
                      name="minQuantity"
                      type="number"
                      min="0"
                      defaultValue={editingItem?.minQuantity || 5}
                      className="w-full h-14 px-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-rose-500 text-base"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Costo Ditta €</label>
                    <input
                      name="sellPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={editingItem?.sellPrice || 0}
                      placeholder="0.00"
                      className="w-full h-14 px-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-rose-500 text-base"
                    />
                    <p className="text-xs text-slate-400 mt-1">Per conteggi interni</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Unità</label>
                    <select
                      name="unit"
                      defaultValue={editingItem?.unit || "pz"}
                      className="w-full h-14 px-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-rose-500 bg-white text-base"
                    >
                      <option value="pz">Pezzo</option>
                      <option value="lt">Litro</option>
                      <option value="conf">Confezione</option>
                      <option value="rotolo">Rotolo</option>
                    </select>
                  </div>
                </div>

                {/* Bottone con padding per navbar */}
                <div className="pt-4 pb-20">
                  <button
                    type="submit"
                    disabled={saving}
                    className={`w-full h-14 rounded-2xl font-bold text-white text-lg ${
                      saving 
                        ? 'bg-slate-300' 
                        : 'bg-gradient-to-r from-rose-500 to-pink-600 shadow-lg active:scale-[0.98]'
                    }`}
                  >
                    {saving ? "Salvataggio..." : editingItem ? "✓ Salva Modifiche" : "✓ Aggiungi Prodotto"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )} 

      {/* SET QUANTITY MODAL */}
      {quantityItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setQuantityItem(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl w-full max-w-xs p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-4 text-center">Imposta Quantità</h3>
            <p className="text-sm text-slate-500 text-center mb-4">{quantityItem.name}</p>
            <input
              type="number"
              min="0"
              value={tempQuantity}
              onChange={(e) => setTempQuantity(parseInt(e.target.value) || 0)}
              className="w-full h-14 px-4 border border-slate-200 rounded-xl text-center text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setQuantityItem(null)}
                className="flex-1 h-12 rounded-xl border border-slate-200 font-medium text-slate-600"
              >
                Annulla
              </button>
              <button
                onClick={handleSetQuantity}
                className="flex-1 h-12 rounded-xl bg-rose-500 text-white font-medium"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDeletingItem(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl w-full max-w-xs p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Elimina Prodotto?</h3>
              <p className="text-sm text-slate-500 mb-4">{deletingItem.name}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeletingItem(null)}
                  disabled={deleting}
                  className="flex-1 h-12 rounded-xl border border-slate-200 font-medium text-slate-600"
                >
                  Annulla
                </button>
                <button
                  onClick={handleDeleteItem}
                  disabled={deleting}
                  className="flex-1 h-12 rounded-xl bg-red-500 text-white font-medium"
                >
                  {deleting ? "..." : "Elimina"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
