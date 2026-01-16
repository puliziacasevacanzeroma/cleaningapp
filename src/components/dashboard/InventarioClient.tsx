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
  const [saving, setSaving] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Chiudi dropdown cliccando fuori
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilter(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Blocca scroll quando modal aperta
  useEffect(() => {
    if (showAddModal || editingItem) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showAddModal, editingItem]);

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
    ? "Tutte le categorie" 
    : categories.find(c => c.id === activeCategory)?.name || "Categoria";

  const handleQuantityChange = async (itemId: string, delta: number) => {
    try {
      const response = await fetch("/api/inventory/update-quantity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, delta }),
      });
      if (response.ok) router.refresh();
    } catch (error) {
      console.error("Errore:", error);
    }
  };

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

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        {/* Titolo e Add */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-900">Inventario</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="h-9 px-4 bg-slate-900 text-white rounded-full text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-slate-800 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            Nuovo
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-3 text-center border border-slate-200">
            <p className="text-2xl font-bold text-slate-800">{stats.totalItems}</p>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Articoli</p>
          </div>
          <div className={`bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-3 text-center border ${stats.lowStock > 0 ? 'border-amber-300' : 'border-amber-100'}`}>
            <p className={`text-2xl font-bold ${stats.lowStock > 0 ? 'text-amber-600' : 'text-amber-300'}`}>{stats.lowStock}</p>
            <p className="text-[10px] text-amber-600/70 font-medium uppercase tracking-wide">Bassi</p>
          </div>
          <div className={`bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-3 text-center border ${stats.outOfStock > 0 ? 'border-red-300' : 'border-red-100'}`}>
            <p className={`text-2xl font-bold ${stats.outOfStock > 0 ? 'text-red-600' : 'text-red-300'}`}>{stats.outOfStock}</p>
            <p className="text-[10px] text-red-600/70 font-medium uppercase tracking-wide">Esauriti</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-3 text-center border border-emerald-200">
            <p className="text-2xl font-bold text-emerald-600">€{stats.totalValue.toFixed(0)}</p>
            <p className="text-[10px] text-emerald-600/70 font-medium uppercase tracking-wide">Valore</p>
          </div>
        </div>

        {/* Search + Filter Button */}
        <div className="flex gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cerca..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-0 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {/* Filter Dropdown */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`h-10 px-4 rounded-full text-sm font-medium flex items-center gap-2 transition-all ${
                activeCategory !== "ALL" 
                  ? "bg-slate-900 text-white" 
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="hidden sm:inline">{activeCategory === "ALL" ? "Filtra" : activeCategoryName}</span>
              <svg className={`w-4 h-4 transition-transform ${showFilter ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showFilter && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Categoria</p>
                </div>
                
                <button
                  onClick={() => { setActiveCategory("ALL"); setShowFilter(false); }}
                  className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 transition-colors ${
                    activeCategory === "ALL" ? "bg-slate-50" : ""
                  }`}
                >
                  <span className="font-medium text-slate-700">Tutte le categorie</span>
                  {activeCategory === "ALL" && (
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveCategory(cat.id); setShowFilter(false); }}
                    className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      activeCategory === cat.id ? "bg-slate-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{cat.icon}</span>
                      <span className="font-medium text-slate-700">{cat.name}</span>
                      <span className="text-xs text-slate-400">({cat.items.length})</span>
                    </div>
                    {activeCategory === cat.id && (
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Active Filter Badge */}
        {activeCategory !== "ALL" && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-500">Filtro attivo:</span>
            <button
              onClick={() => setActiveCategory("ALL")}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 text-white text-xs font-medium rounded-full"
            >
              {categories.find(c => c.id === activeCategory)?.icon} {activeCategoryName}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* LISTA ARTICOLI */}
      <div className="px-4 py-4">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-slate-600 font-medium mb-1">Nessun articolo</p>
            <p className="text-sm text-slate-400 mb-4">
              {searchTerm ? "Prova a modificare la ricerca" : "Aggiungi il primo articolo"}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-5 py-2 bg-slate-900 text-white rounded-full text-sm font-medium"
            >
              + Nuovo Articolo
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const isLow = item.quantity <= item.minQuantity && item.quantity > 0;
              const isOut = item.quantity === 0;
              
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border p-4 flex items-center gap-4 transition-all ${
                    isOut ? 'border-red-200 bg-red-50/30' : isLow ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200'
                  }`}
                >
                  {/* Icona */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isOut ? 'bg-red-100' : isLow ? 'bg-amber-100' : 'bg-slate-100'
                  }`}>
                    <svg className={`w-6 h-6 ${isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-slate-500'}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800">{item.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">{(item as any).category?.name}</span>
                      <span className="text-xs text-slate-300">•</span>
                      <span className="text-xs font-semibold text-emerald-600">€{item.sellPrice.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Quantità e azioni */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleQuantityChange(item.id, -1)}
                      disabled={item.quantity === 0}
                      className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-bold disabled:opacity-30 transition-colors"
                    >
                      −
                    </button>
                    <div className={`min-w-[44px] h-8 flex items-center justify-center rounded-lg text-sm font-bold ${
                      isOut ? 'bg-red-500 text-white' : isLow ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {item.quantity}
                    </div>
                    <button
                      onClick={() => handleQuantityChange(item.id, 1)}
                      className="w-8 h-8 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white font-bold transition-colors"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setEditingItem(item)}
                      className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500 ml-1 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL */}
      {(showAddModal || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowAddModal(false); setEditingItem(null); }} 
          />
          
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">
                {editingItem ? "Modifica Articolo" : "Nuovo Articolo"}
              </h2>
              <button
                onClick={() => { setShowAddModal(false); setEditingItem(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Form */}
            <form onSubmit={handleSaveItem} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingItem?.name}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  placeholder="es. Lenzuola Matrimoniali"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Categoria</label>
                <select
                  name="categoryId"
                  defaultValue={editingItem?.categoryId || categories[0]?.id}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
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
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
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
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Unità</label>
                <select
                  name="unit"
                  defaultValue={editingItem?.unit || "pz"}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                >
                  <option value="pz">Pezzi</option>
                  <option value="set">Set</option>
                  <option value="rotoli">Rotoli</option>
                  <option value="conf">Confezioni</option>
                </select>
              </div>

              <label className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  name="isForLinen"
                  defaultChecked={editingItem?.isForLinen ?? true}
                  className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-700">Articolo biancheria</span>
                  <p className="text-xs text-slate-500">Disponibile nel configuratore</p>
                </div>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingItem(null); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {saving ? "..." : editingItem ? "Salva" : "Aggiungi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
