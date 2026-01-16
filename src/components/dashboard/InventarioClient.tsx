"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface InventoryItem {
  id: string;
  name: string;
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
  slug: string;
  icon: string;
  color: string;
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

export function InventarioClient({ categories, stats }: InventarioClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [showFilter, setShowFilter] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [quantityItem, setQuantityItem] = useState<InventoryItem | null>(null);
  const [tempQuantity, setTempQuantity] = useState(0);
  const [saving, setSaving] = useState(false);
  const [localQuantities, setLocalQuantities] = useState<Record<string, number>>({});
  const filterRef = useRef<HTMLDivElement>(null);

  // Click fuori chiude dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilter(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Blocca scroll con modal aperta
  useEffect(() => {
    if (showAddModal || editingItem || quantityItem) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showAddModal, editingItem, quantityItem]);

  const allItems = useMemo(() => categories.flatMap(c => c.items.map(item => ({ ...item, category: c }))), [categories]);

  const filteredItems = useMemo(() => {
    let filtered = allItems;
    if (activeCategory !== "ALL") {
      filtered = filtered.filter(item => item.categoryId === activeCategory);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item => item.name.toLowerCase().includes(term));
    }
    return filtered;
  }, [allItems, activeCategory, searchTerm]);

  const activeCategoryName = activeCategory === "ALL" 
    ? "Tutte" 
    : categories.find(c => c.id === activeCategory)?.name || "Categoria";

  // Ottiene quantità (locale se modificata, altrimenti originale)
  const getQuantity = (item: InventoryItem) => {
    return localQuantities[item.id] ?? item.quantity;
  };

  // Aggiornamento ottimistico quantità con +/-
  const handleQuantityChange = async (itemId: string, delta: number, currentQty: number) => {
    const newQty = Math.max(0, currentQty + delta);
    setLocalQuantities(prev => ({ ...prev, [itemId]: newQty }));
    
    try {
      await fetch("/api/inventory/update-quantity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, delta }),
      });
    } catch (error) {
      setLocalQuantities(prev => ({ ...prev, [itemId]: currentQty }));
      console.error("Errore:", error);
    }
  };

  // Salva quantità da modal
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
    } catch (error) {
      setLocalQuantities(prev => ({ ...prev, [quantityItem.id]: oldQty }));
      console.error("Errore:", error);
    }
  };

  // Apri modal quantità
  const openQuantityModal = (item: InventoryItem) => {
    setQuantityItem(item);
    setTempQuantity(getQuantity(item));
  };

  // Salva nuovo articolo
  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name"),
      categoryId: formData.get("categoryId"),
      quantity: parseInt(formData.get("quantity") as string) || 0,
      minQuantity: 5,
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
      if (response.ok) {
        setShowAddModal(false);
        setEditingItem(null);
        router.refresh();
      }
    } catch (error) {
      console.error("Errore:", error);
    } finally {
      setSaving(false);
    }
  };

  // Calcola stats locali
  const localStats = useMemo(() => {
    let totalValue = 0;
    let lowStock = 0;
    let outOfStock = 0;
    
    allItems.forEach(item => {
      const qty = getQuantity(item);
      totalValue += qty * item.sellPrice;
      if (qty === 0) outOfStock++;
      else if (qty <= item.minQuantity) lowStock++;
    });
    
    return { ...stats, totalValue, lowStock, outOfStock };
  }, [allItems, localQuantities, stats]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      
      {/* HEADER */}
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100">
        {/* Titolo e Nuovo */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-slate-900">Inventario</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="h-10 px-5 bg-slate-900 text-white rounded-full text-sm font-semibold flex items-center gap-2 shadow-lg shadow-slate-900/20 active:scale-95 transition-transform"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nuovo
          </button>
        </div>

        {/* Stats */}
        <div className="bg-slate-50 rounded-2xl p-4 mb-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800">{stats.totalItems}</p>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">ARTICOLI</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${localStats.lowStock > 0 ? 'text-amber-500' : 'text-slate-300'}`}>
                {localStats.lowStock}
              </p>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">BASSI</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${localStats.outOfStock > 0 ? 'text-red-500' : 'text-slate-300'}`}>
                {localStats.outOfStock}
              </p>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">ESAURITI</p>
            </div>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-medium">Valore totale magazzino</p>
              <p className="text-sm font-bold text-emerald-600">
                €{localStats.totalValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cerca articolo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-11 pl-11 pr-4 bg-slate-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          {/* Filter Button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`h-11 px-4 rounded-full text-sm font-medium flex items-center gap-2 transition-all ${
                activeCategory !== "ALL" 
                  ? "bg-slate-900 text-white" 
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <svg className={`w-3 h-3 transition-transform ${showFilter ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown */}
            {showFilter && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50">
                <p className="px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Categoria</p>
                
                <button
                  onClick={() => { setActiveCategory("ALL"); setShowFilter(false); }}
                  className={`w-full px-4 py-3 text-left flex items-center justify-between ${
                    activeCategory === "ALL" ? "bg-slate-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="text-sm font-medium text-slate-700">Tutte</span>
                  {activeCategory === "ALL" && (
                    <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveCategory(cat.id); setShowFilter(false); }}
                    className={`w-full px-4 py-3 text-left flex items-center justify-between ${
                      activeCategory === cat.id ? "bg-slate-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                      <span className="text-xs text-slate-400">{cat.items.length}</span>
                    </div>
                    {activeCategory === cat.id && (
                      <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Active Filter Tag */}
        {activeCategory !== "ALL" && (
          <div className="mt-3">
            <button
              onClick={() => setActiveCategory("ALL")}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-full"
            >
              {activeCategoryName}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* LISTA */}
      <div className="px-4 py-4">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-slate-700 font-medium mb-1">Nessun articolo</p>
            <p className="text-sm text-slate-400 mb-4">Inizia aggiungendo il primo</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-5 py-2.5 bg-slate-900 text-white rounded-full text-sm font-semibold"
            >
              + Aggiungi
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const qty = getQuantity(item);
              const isLow = qty <= item.minQuantity && qty > 0;
              const isOut = qty === 0;
              
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
                >
                  <div className="p-4">
                    {/* Nome e Prezzo */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-3">
                        <h3 className="font-semibold text-slate-800 text-base leading-tight">
                          {item.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                          {(item as any).category?.name}
                        </p>
                      </div>
                      <p className="text-base font-bold text-emerald-600 flex-shrink-0">
                        €{item.sellPrice.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    
                    {/* Status e Quantità */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isOut ? (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-full uppercase">
                            Esaurito
                          </span>
                        ) : isLow ? (
                          <span className="px-2 py-1 bg-amber-100 text-amber-600 text-[10px] font-bold rounded-full uppercase">
                            Scorta bassa
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-[10px] font-bold rounded-full uppercase">
                            Disponibile
                          </span>
                        )}
                      </div>

                      {/* Controlli */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleQuantityChange(item.id, -1, qty)}
                          disabled={qty === 0}
                          className="w-9 h-9 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 font-bold text-lg disabled:opacity-30 transition-colors active:scale-95"
                        >
                          −
                        </button>
                        <button
                          onClick={() => openQuantityModal(item)}
                          className={`min-w-[56px] h-9 px-2 flex items-center justify-center rounded-xl text-sm font-bold transition-colors active:scale-95 ${
                            isOut ? 'bg-red-500 text-white' : isLow ? 'bg-amber-500 text-white' : 'bg-slate-800 text-white'
                          }`}
                        >
                          {qty}
                        </button>
                        <button
                          onClick={() => handleQuantityChange(item.id, 1, qty)}
                          className="w-9 h-9 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white font-bold text-lg transition-colors active:scale-95"
                        >
                          +
                        </button>
                        <button
                          onClick={() => setEditingItem(item)}
                          className="w-9 h-9 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL NUOVO/MODIFICA */}
      {(showAddModal || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => { setShowAddModal(false); setEditingItem(null); }} 
          />
          
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">
                {editingItem ? "Modifica" : "Nuovo Articolo"}
              </h2>
              <button
                onClick={() => { setShowAddModal(false); setEditingItem(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveItem} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome articolo</label>
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
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Categoria</label>
                <select
                  name="categoryId"
                  defaultValue={editingItem?.categoryId || categories[0]?.id}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
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
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Prezzo €</label>
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
                  <option value="rotoli">Rotoli</option>
                  <option value="conf">Confezioni</option>
                </select>
              </div>

              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  name="isForLinen"
                  defaultChecked={editingItem?.isForLinen ?? true}
                  className="w-5 h-5 text-slate-900 rounded"
                />
                <span className="text-sm text-slate-700">Articolo biancheria</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingItem(null); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-semibold disabled:opacity-50"
                >
                  {saving ? "..." : editingItem ? "Salva" : "Aggiungi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL QUANTITÀ */}
      {quantityItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setQuantityItem(null)} 
          />
          
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xs p-6">
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">
              Modifica Quantità
            </h3>
            <p className="text-sm text-slate-500 text-center mb-6 truncate px-2">
              {quantityItem.name}
            </p>

            {/* Controlli */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <button
                onClick={() => setTempQuantity(Math.max(0, tempQuantity - 10))}
                className="w-11 h-11 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 font-bold text-xs transition-colors"
              >
                -10
              </button>
              <button
                onClick={() => setTempQuantity(Math.max(0, tempQuantity - 1))}
                className="w-11 h-11 flex items-center justify-center bg-slate-200 hover:bg-slate-300 rounded-xl text-slate-700 font-bold text-xl transition-colors"
              >
                −
              </button>
              <input
                type="number"
                value={tempQuantity}
                onChange={(e) => setTempQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 h-12 text-center text-xl font-bold text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
              />
              <button
                onClick={() => setTempQuantity(tempQuantity + 1)}
                className="w-11 h-11 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white font-bold text-xl transition-colors"
              >
                +
              </button>
              <button
                onClick={() => setTempQuantity(tempQuantity + 10)}
                className="w-11 h-11 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 rounded-xl text-white font-bold text-xs transition-colors"
              >
                +10
              </button>
            </div>

            {/* Differenza */}
            {tempQuantity !== getQuantity(quantityItem) && (
              <p className={`text-center text-sm font-medium mb-4 ${
                tempQuantity > getQuantity(quantityItem) ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {tempQuantity > getQuantity(quantityItem) ? '+' : ''}{tempQuantity - getQuantity(quantityItem)} rispetto a prima
              </p>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setQuantityItem(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold"
              >
                Annulla
              </button>
              <button
                onClick={handleSetQuantity}
                disabled={tempQuantity === getQuantity(quantityItem)}
                className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-semibold disabled:opacity-50"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
