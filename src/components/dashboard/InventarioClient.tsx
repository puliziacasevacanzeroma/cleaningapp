"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";

interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  quantity: number;
  minQuantity: number;
  sellPrice: number;
  costPrice?: number;
  unit: string;
  sku?: string;
  supplier?: string;
  imageUrl?: string;
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

const colorMap: Record<string, { bg: string; light: string; border: string }> = {
  sky: { bg: "bg-sky-500", light: "bg-sky-50", border: "border-sky-200" },
  violet: { bg: "bg-violet-500", light: "bg-violet-50", border: "border-violet-200" },
  amber: { bg: "bg-amber-500", light: "bg-amber-50", border: "border-amber-200" },
  emerald: { bg: "bg-emerald-500", light: "bg-emerald-50", border: "border-emerald-200" },
  rose: { bg: "bg-rose-500", light: "bg-rose-50", border: "border-rose-200" },
  slate: { bg: "bg-slate-500", light: "bg-slate-50", border: "border-slate-200" },
};

export function InventarioClient({ categories, stats }: InventarioClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);

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

  const getCategoryColor = (color: string) => colorMap[color] || colorMap.slate;

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
      
      {/* HEADER FISSO */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="px-4 py-4">
          {/* Titolo e Add */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Inventario</h1>
              <p className="text-sm text-slate-500">{stats.totalItems} articoli</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="h-10 px-4 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Nuovo</span>
            </button>
          </div>

          {/* Stats compatte */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-slate-700">{stats.totalItems}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Totali</p>
            </div>
            <div className={`rounded-lg p-2 text-center ${stats.lowStock > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
              <p className={`text-lg font-bold ${stats.lowStock > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{stats.lowStock}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Bassi</p>
            </div>
            <div className={`rounded-lg p-2 text-center ${stats.outOfStock > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
              <p className={`text-lg font-bold ${stats.outOfStock > 0 ? 'text-red-600' : 'text-slate-400'}`}>{stats.outOfStock}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Esauriti</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-emerald-600">€{stats.totalValue.toFixed(0)}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Valore</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cerca articolo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
            <button
              onClick={() => setActiveCategory("ALL")}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeCategory === "ALL"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Tutti ({allItems.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activeCategory === cat.id
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
                <span className={`text-xs ${activeCategory === cat.id ? 'text-slate-300' : 'text-slate-400'}`}>
                  ({cat.items.length})
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="px-4 py-4">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">Nessun articolo</h3>
            <p className="text-slate-500 text-sm mb-4">
              {searchTerm ? "Nessun risultato per la ricerca" : "Inizia aggiungendo il primo articolo"}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors"
            >
              Aggiungi Articolo
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const catColors = getCategoryColor((item as any).category?.color || "slate");
              const isLow = item.quantity <= item.minQuantity && item.quantity > 0;
              const isOut = item.quantity === 0;
              
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border ${isOut ? 'border-red-200' : isLow ? 'border-amber-200' : 'border-slate-200'} overflow-hidden`}
                >
                  <div className="flex items-center p-3">
                    {/* Icona categoria */}
                    <div className={`w-12 h-12 ${catColors.light} rounded-xl flex items-center justify-center flex-shrink-0 mr-3`}>
                      <span className="text-2xl">{(item as any).category?.icon || "📦"}</span>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 text-base">{item.name}</h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-sm text-slate-500">{(item as any).category?.name}</span>
                        <span className="text-sm font-medium text-emerald-600">€{item.sellPrice.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Quantità e azioni */}
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => handleQuantityChange(item.id, -1)}
                        disabled={item.quantity === 0}
                        className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                      </button>
                      <div className={`w-12 h-8 flex items-center justify-center rounded-lg font-bold text-sm ${
                        isOut ? 'bg-red-100 text-red-700' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {item.quantity}
                      </div>
                      <button
                        onClick={() => handleQuantityChange(item.id, 1)}
                        className="w-8 h-8 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setEditingItem(item)}
                        className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors ml-1"
                      >
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
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

      {/* MODAL NUOVO/MODIFICA ARTICOLO */}
      {(showAddModal || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowAddModal(false); setEditingItem(null); }} 
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">
                  {editingItem ? "Modifica Articolo" : "Nuovo Articolo"}
                </h2>
                <button
                  onClick={() => { setShowAddModal(false); setEditingItem(null); }}
                  className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Form */}
            <form onSubmit={handleSaveItem} className="p-5 space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Nome Articolo
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingItem?.name}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  placeholder="es. Lenzuola Matrimoniali"
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Categoria
                </label>
                <select
                  name="categoryId"
                  defaultValue={editingItem?.categoryId || categories[0]?.id}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Quantità e Prezzo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Quantità
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    defaultValue={editingItem?.quantity || 0}
                    min="0"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Prezzo (€)
                  </label>
                  <input
                    type="number"
                    name="sellPrice"
                    defaultValue={editingItem?.sellPrice || 0}
                    min="0"
                    step="0.01"
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Unità */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Unità di misura
                </label>
                <select
                  name="unit"
                  defaultValue={editingItem?.unit || "pz"}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                >
                  <option value="pz">Pezzi</option>
                  <option value="set">Set</option>
                  <option value="rotoli">Rotoli</option>
                  <option value="conf">Confezioni</option>
                  <option value="capsule">Capsule</option>
                </select>
              </div>

              {/* Checkbox biancheria - DEFAULT CHECKED */}
              <label className="flex items-center gap-3 p-3 bg-sky-50 border border-sky-100 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  name="isForLinen"
                  defaultChecked={editingItem?.isForLinen ?? true}
                  className="w-5 h-5 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-700">Articolo biancheria</span>
                  <p className="text-xs text-slate-500">Disponibile nel configuratore proprietà</p>
                </div>
              </label>

              {/* Buttons */}
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
                  className="flex-1 py-3 bg-sky-500 text-white rounded-xl font-semibold hover:bg-sky-600 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Salvataggio..." : editingItem ? "Salva" : "Aggiungi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
