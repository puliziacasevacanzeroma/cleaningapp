"use client";

import { useState, useMemo, useEffect } from "react";
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
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        {/* Titolo */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-900">Inventario</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="h-9 px-4 bg-slate-900 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span>
            Nuovo
          </button>
        </div>

        {/* Stats inline */}
        <div className="flex items-center justify-between text-center mb-4 py-3 bg-slate-50 rounded-xl">
          <div className="flex-1">
            <p className="text-xl font-bold text-slate-800">{stats.totalItems}</p>
            <p className="text-[10px] text-slate-500 uppercase">Articoli</p>
          </div>
          <div className="w-px h-8 bg-slate-200"></div>
          <div className="flex-1">
            <p className={`text-xl font-bold ${stats.lowStock > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{stats.lowStock}</p>
            <p className="text-[10px] text-slate-500 uppercase">Bassi</p>
          </div>
          <div className="w-px h-8 bg-slate-200"></div>
          <div className="flex-1">
            <p className={`text-xl font-bold ${stats.outOfStock > 0 ? 'text-red-500' : 'text-slate-300'}`}>{stats.outOfStock}</p>
            <p className="text-[10px] text-slate-500 uppercase">Esauriti</p>
          </div>
          <div className="w-px h-8 bg-slate-200"></div>
          <div className="flex-1">
            <p className="text-xl font-bold text-emerald-600">€{stats.totalValue.toFixed(0)}</p>
            <p className="text-[10px] text-slate-500 uppercase">Valore</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Cerca articolo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-4 py-2.5 bg-slate-100 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        {/* Filtri categoria - INLINE, NO SCROLL */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory("ALL")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeCategory === "ALL"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Tutti
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeCategory === cat.id
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* LISTA ARTICOLI */}
      <div className="px-4 py-3">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-slate-200 mt-2">
            <p className="text-slate-500 mb-3">Nessun articolo</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium"
            >
              Aggiungi
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
                  className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3"
                >
                  {/* Icona monocromatica */}
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                    <p className="text-xs text-slate-500">{(item as any).category?.name} · €{item.sellPrice.toFixed(2)}</p>
                  </div>

                  {/* Quantità */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleQuantityChange(item.id, -1)}
                      disabled={item.quantity === 0}
                      className="w-7 h-7 flex items-center justify-center bg-slate-100 rounded-md text-slate-600 disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className={`w-10 h-7 flex items-center justify-center rounded-md text-sm font-bold ${
                      isOut ? 'bg-red-100 text-red-600' : isLow ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => handleQuantityChange(item.id, 1)}
                      className="w-7 h-7 flex items-center justify-center bg-slate-800 rounded-md text-white"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setEditingItem(item)}
                      className="w-7 h-7 flex items-center justify-center bg-slate-100 rounded-md text-slate-500 ml-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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

      {/* MODAL - CENTRATA */}
      {(showAddModal || editingItem) && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ padding: '16px' }}
        >
          {/* Overlay */}
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => { setShowAddModal(false); setEditingItem(null); }} 
          />
          
          {/* Modal Box - Centrata */}
          <div 
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-[340px] mx-auto"
            style={{ maxHeight: 'calc(100vh - 120px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
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
            
            {/* Form */}
            <form onSubmit={handleSaveItem} className="p-4 space-y-3">
              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nome</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingItem?.name}
                  required
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="es. Lenzuola Matrimoniali"
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Categoria</label>
                <select
                  name="categoryId"
                  defaultValue={editingItem?.categoryId || categories[0]?.id}
                  required
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Quantità e Prezzo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Quantità</label>
                  <input
                    type="number"
                    name="quantity"
                    defaultValue={editingItem?.quantity || 0}
                    min="0"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Prezzo €</label>
                  <input
                    type="number"
                    name="sellPrice"
                    defaultValue={editingItem?.sellPrice || 0}
                    min="0"
                    step="0.01"
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
              </div>

              {/* Unità */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Unità</label>
                <select
                  name="unit"
                  defaultValue={editingItem?.unit || "pz"}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="pz">Pezzi</option>
                  <option value="set">Set</option>
                  <option value="rotoli">Rotoli</option>
                  <option value="conf">Confezioni</option>
                </select>
              </div>

              {/* Checkbox */}
              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  name="isForLinen"
                  defaultChecked={editingItem?.isForLinen ?? true}
                  className="w-4 h-4 text-slate-800 rounded"
                />
                <span className="text-sm text-slate-700">Articolo biancheria</span>
              </label>

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingItem(null); }}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
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
