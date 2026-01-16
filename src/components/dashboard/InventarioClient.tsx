"use client";

import { useState, useMemo } from "react";
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

const colorMap: Record<string, { bg: string; light: string; text: string }> = {
  sky: { bg: "from-sky-500 to-blue-600", light: "bg-sky-50", text: "text-sky-600" },
  violet: { bg: "from-violet-500 to-purple-600", light: "bg-violet-50", text: "text-violet-600" },
  amber: { bg: "from-amber-500 to-orange-600", light: "bg-amber-50", text: "text-amber-600" },
  emerald: { bg: "from-emerald-500 to-teal-600", light: "bg-emerald-50", text: "text-emerald-600" },
  rose: { bg: "from-rose-500 to-pink-600", light: "bg-rose-50", text: "text-rose-600" },
  slate: { bg: "from-slate-500 to-slate-700", light: "bg-slate-50", text: "text-slate-600" },
};

export function InventarioClient({ categories, stats }: InventarioClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);

  const allItems = useMemo(() => categories.flatMap(c => c.items.map(item => ({ ...item, category: c }))), [categories]);

  const filteredItems = useMemo(() => {
    let filtered = allItems;
    
    if (activeCategory !== "ALL") {
      filtered = filtered.filter(item => item.categoryId === activeCategory);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        item.sku?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [allItems, activeCategory, searchTerm]);

  const getStockStatus = (item: InventoryItem) => {
    if (item.quantity === 0) return { status: "out", color: "bg-red-500", barColor: "bg-red-500", text: "Esaurito", percentage: 0 };
    const percentage = item.minQuantity > 0 ? (item.quantity / (item.minQuantity * 2)) * 100 : 100;
    if (item.quantity <= item.minQuantity) return { status: "low", color: "bg-amber-500", barColor: "bg-amber-500", text: "Scorta bassa", percentage: Math.min(percentage, 100) };
    return { status: "ok", color: "bg-emerald-500", barColor: "bg-emerald-500", text: "Disponibile", percentage: Math.min(percentage, 100) };
  };

  const getCategoryColor = (color: string) => colorMap[color] || colorMap.slate;

  const handleQuantityChange = async (itemId: string, delta: number) => {
    try {
      const response = await fetch("/api/inventory/update-quantity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, delta }),
      });
      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error("Errore aggiornamento quantità:", error);
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
      minQuantity: parseInt(formData.get("minQuantity") as string) || 5,
      sellPrice: parseFloat(formData.get("sellPrice") as string) || 0,
      costPrice: parseFloat(formData.get("costPrice") as string) || null,
      unit: formData.get("unit"),
      sku: formData.get("sku") || null,
      supplier: formData.get("supplier") || null,
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
      console.error("Errore salvataggio:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 pb-24">
      
      {/* ==================== MOBILE HEADER ==================== */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-3 py-3">
          {/* Titolo + Add */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📦</span>
              <h1 className="text-lg font-bold text-slate-800">Inventario</h1>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="w-10 h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-2 border border-slate-200">
              <p className="text-lg font-bold text-slate-700">{stats.totalItems}</p>
              <p className="text-[9px] text-slate-500 font-medium">Articoli</p>
            </div>
            <div className={`bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-2 border ${stats.lowStock > 0 ? 'border-amber-300 ring-1 ring-amber-200' : 'border-amber-100'}`}>
              <p className="text-lg font-bold text-amber-600">{stats.lowStock}</p>
              <p className="text-[9px] text-amber-600/70 font-medium">In esaurim.</p>
            </div>
            <div className={`bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-2 border ${stats.outOfStock > 0 ? 'border-red-300 ring-1 ring-red-200' : 'border-red-100'}`}>
              <p className="text-lg font-bold text-red-600">{stats.outOfStock}</p>
              <p className="text-[9px] text-red-600/70 font-medium">Esauriti</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-2 border border-emerald-100">
              <p className="text-sm font-bold text-emerald-600">€{stats.totalValue.toFixed(0)}</p>
              <p className="text-[9px] text-emerald-600/70 font-medium">Valore</p>
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
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-hide">
            <button
              onClick={() => setActiveCategory("ALL")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeCategory === "ALL"
                  ? "bg-slate-800 text-white shadow-md"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              <span>📦</span>
              <span>Tutti</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                activeCategory === "ALL" ? "bg-white/20" : "bg-slate-200"
              }`}>
                {allItems.length}
              </span>
            </button>
            {categories.map((cat) => {
              const colors = getCategoryColor(cat.color);
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    activeCategory === cat.id
                      ? `bg-gradient-to-r ${colors.bg} text-white shadow-md`
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    activeCategory === cat.id ? "bg-white/20" : "bg-slate-200"
                  }`}>
                    {cat.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ==================== DESKTOP HEADER ==================== */}
      <div className="hidden lg:block p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-2xl">📦</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Inventario</h1>
              <p className="text-slate-500">{stats.totalItems} articoli totali</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuovo Articolo
          </button>
        </div>

        {/* Desktop Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm text-slate-500">Articoli Totali</p>
            <p className="text-2xl font-bold text-slate-800">{stats.totalItems}</p>
          </div>
          <div className={`bg-white rounded-xl border p-4 shadow-sm ${stats.lowStock > 0 ? 'border-amber-300' : 'border-slate-200'}`}>
            <p className="text-sm text-slate-500">Scorta Bassa</p>
            <p className="text-2xl font-bold text-amber-600">{stats.lowStock}</p>
          </div>
          <div className={`bg-white rounded-xl border p-4 shadow-sm ${stats.outOfStock > 0 ? 'border-red-300' : 'border-slate-200'}`}>
            <p className="text-sm text-slate-500">Esauriti</p>
            <p className="text-2xl font-bold text-red-600">{stats.outOfStock}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm text-slate-500">Valore Totale</p>
            <p className="text-2xl font-bold text-emerald-600">€{stats.totalValue.toFixed(2)}</p>
          </div>
        </div>

        {/* Desktop Search */}
        <div className="relative max-w-md mb-6">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cerca per nome, SKU, descrizione..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* ==================== CONTENT ==================== */}
      <div className="px-3 lg:px-8 pt-4">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📦</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessun articolo trovato</h3>
            <p className="text-slate-500 mb-4">
              {searchTerm ? "Prova a modificare la ricerca" : "Inizia aggiungendo il tuo primo articolo"}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 transition-colors"
            >
              Aggiungi Articolo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredItems.map((item) => {
              const stockStatus = getStockStatus(item);
              const catColors = getCategoryColor((item as any).category?.color || "slate");
              
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Header con categoria */}
                  <div className={`h-2 bg-gradient-to-r ${catColors.bg}`} />
                  
                  <div className="p-4">
                    {/* Nome e Status */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{(item as any).category?.icon || "📦"}</span>
                          <h3 className="font-semibold text-slate-800 truncate">{item.name}</h3>
                        </div>
                        {item.sku && (
                          <p className="text-xs text-slate-400 mt-0.5">SKU: {item.sku}</p>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${
                        stockStatus.status === "out" ? "bg-red-100 text-red-700" :
                        stockStatus.status === "low" ? "bg-amber-100 text-amber-700" :
                        "bg-emerald-100 text-emerald-700"
                      }`}>
                        {stockStatus.text}
                      </span>
                    </div>

                    {/* Barra progresso */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Quantità: <strong className="text-slate-700">{item.quantity}</strong> {item.unit}</span>
                        <span>Min: {item.minQuantity}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${stockStatus.barColor} transition-all`}
                          style={{ width: `${stockStatus.percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Prezzo */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className="text-xs text-slate-400">Prezzo vendita</span>
                        <p className="text-lg font-bold text-slate-800">€{item.sellPrice.toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-400">Valore stock</span>
                        <p className="text-sm font-semibold text-emerald-600">€{(item.quantity * item.sellPrice).toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Azioni */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleQuantityChange(item.id, -1)}
                        disabled={item.quantity === 0}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-slate-700 font-bold transition-colors"
                      >
                        −
                      </button>
                      <span className="flex-1 text-center font-bold text-lg text-slate-800">{item.quantity}</span>
                      <button
                        onClick={() => handleQuantityChange(item.id, 1)}
                        className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white font-bold transition-colors"
                      >
                        +
                      </button>
                      <button
                        onClick={() => setEditingItem(item)}
                        className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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

      {/* ==================== ADD/EDIT MODAL ==================== */}
      {(showAddModal || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowAddModal(false); setEditingItem(null); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                {editingItem ? "Modifica Articolo" : "Nuovo Articolo"}
              </h2>
              <button
                onClick={() => { setShowAddModal(false); setEditingItem(null); }}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveItem} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingItem?.name}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="es. Lenzuola Matrimoniali"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoria *</label>
                <select
                  name="categoryId"
                  defaultValue={editingItem?.categoryId || categories[0]?.id}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantità</label>
                <input
                  type="number"
                  name="quantity"
                  defaultValue={editingItem?.quantity || 0}
                  min="0"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prezzo Vendita (€) *</label>
                  <input
                    type="number"
                    name="sellPrice"
                    defaultValue={editingItem?.sellPrice || 0}
                    min="0"
                    step="0.01"
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unità</label>
                  <select
                    name="unit"
                    defaultValue={editingItem?.unit || "pz"}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="pz">Pezzi</option>
                    <option value="set">Set</option>
                    <option value="kg">Kg</option>
                    <option value="lt">Litri</option>
                    <option value="rotoli">Rotoli</option>
                    <option value="conf">Confezioni</option>
                    <option value="capsule">Capsule</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-sky-50 rounded-lg">
                <input
                  type="checkbox"
                  name="isForLinen"
                  id="isForLinen"
                  defaultChecked={editingItem?.isForLinen || false}
                  className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                />
                <label htmlFor="isForLinen" className="text-sm text-slate-700">
                  <strong>Articolo per biancheria</strong>
                  <p className="text-xs text-slate-500">Mostra nel configuratore biancheria proprietà</p>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
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
                  {saving ? "Salvataggio..." : editingItem ? "Salva Modifiche" : "Aggiungi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
