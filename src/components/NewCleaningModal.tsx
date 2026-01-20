"use client";

import { useState, useEffect, useMemo } from "react";
import { useProperties } from "~/lib/queries";

interface Property {
  id: string;
  name: string;
  address: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  usesOwnLinen?: boolean;
}

interface SelectedItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface InventoryItem {
  id: string;
  key: string;
  name: string;
  icon: string;
  category: string;
  sellPrice: number;
  defaultPerOspite?: number;
}

interface InventoryCategory {
  id: string;
  name: string;
  icon: string;
  items: InventoryItem[];
}

interface NewCleaningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedPropertyId?: string;
  userRole?: "ADMIN" | "PROPRIETARIO";
}

export default function NewCleaningModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedPropertyId,
  userRole = "ADMIN",
}: NewCleaningModalProps) {
  const [saving, setSaving] = useState(false);
  const { data: propertiesData, isLoading: loadingProperties } = useProperties();

  const [formData, setFormData] = useState({
    propertyId: preselectedPropertyId || "",
    scheduledDate: new Date().toISOString().split("T")[0],
    scheduledTime: "10:00",
    guestsCount: 2,
    notes: "",
    type: "MANUAL" as "MANUAL" | "CHECKOUT" | "CHECKIN" | "DEEP_CLEAN",
    requestType: "cleaning" as "cleaning" | "linen_only",
    createLinenOrder: true,
  });

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  
  // Stato per inventario caricato da API
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategory[]>([]);
  const [allInventoryItems, setAllInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);

  const properties = useMemo(() => {
    if (!propertiesData) return [];
    return propertiesData.activeProperties || propertiesData.properties || propertiesData || [];
  }, [propertiesData]);

  // Carica inventario da API
  useEffect(() => {
    async function loadInventory() {
      setLoadingInventory(true);
      try {
        const res = await fetch('/api/inventory/list');
        const data = await res.json();
        
        const categories: InventoryCategory[] = [];
        const allItems: InventoryItem[] = [];
        
        data.categories?.forEach((cat: any) => {
          const catItems: InventoryItem[] = [];
          cat.items?.forEach((item: any) => {
            const invItem: InventoryItem = {
              id: item.key || item.id,
              key: item.key || item.id,
              name: item.name,
              icon: getIconForCategory(cat.id),
              category: cat.id,
              sellPrice: item.sellPrice || 0,
              defaultPerOspite: item.defaultPerOspite || 1,
            };
            catItems.push(invItem);
            allItems.push(invItem);
          });
          
          if (catItems.length > 0) {
            categories.push({
              id: cat.id,
              name: cat.name,
              icon: getIconForCategory(cat.id),
              items: catItems,
            });
          }
        });
        
        setInventoryCategories(categories);
        setAllInventoryItems(allItems);
      } catch (err) {
        console.error('Errore caricamento inventario:', err);
      } finally {
        setLoadingInventory(false);
      }
    }
    
    if (isOpen) {
      loadInventory();
    }
  }, [isOpen]);

  function getIconForCategory(catId: string): string {
    switch (catId) {
      case 'biancheria_letto': return '🛏️';
      case 'biancheria_bagno': return '🛁';
      case 'kit_cortesia': return '🧴';
      case 'servizi_extra': return '🎁';
      default: return '📦';
    }
  }

  // Filtra articoli per categoria
  const filteredItems = useMemo(() => {
    if (activeCategory === "all") return allInventoryItems;
    return allInventoryItems.filter(item => item.category === activeCategory);
  }, [activeCategory, allInventoryItems]);

  // Reset quando si apre
  useEffect(() => {
    if (isOpen) {
      setSelectedItems([]);
      setActiveCategory("all");
      if (preselectedPropertyId) {
        const prop = properties.find((p: Property) => p.id === preselectedPropertyId);
        if (prop) {
          setSelectedProperty(prop);
          setFormData(prev => ({ ...prev, propertyId: prop.id }));
        }
      }
    }
  }, [isOpen, preselectedPropertyId, properties]);

  // Genera config default basata su inventario
  const getDefaultLinenConfig = (guestsCount: number): SelectedItem[] => {
    const defaultItems: SelectedItem[] = [];
    
    allInventoryItems.forEach(item => {
      let qty = 0;
      
      if (item.category === 'biancheria_letto') {
        qty = Math.ceil(guestsCount / 2) * (item.defaultPerOspite || 1);
      } else if (item.category === 'biancheria_bagno' || item.category === 'kit_cortesia') {
        qty = guestsCount * (item.defaultPerOspite || 1);
      }
      
      if (qty > 0) {
        defaultItems.push({
          id: item.id,
          name: item.name,
          quantity: qty,
          price: item.sellPrice,
        });
      }
    });
    
    return defaultItems;
  };

  const handlePropertyChange = (propertyId: string) => {
    const prop = properties.find((p: Property) => p.id === propertyId);
    setSelectedProperty(prop || null);
    setFormData(prev => ({
      ...prev,
      propertyId,
      guestsCount: prop?.maxGuests || 2,
      createLinenOrder: !prop?.usesOwnLinen,
    }));

    // Auto-seleziona articoli di default
    if (prop && allInventoryItems.length > 0) {
      const guestsCount = prop.maxGuests || 2;
      const defaultItems = getDefaultLinenConfig(guestsCount);
      setSelectedItems(defaultItems);
    }
  };

  const handleAddItem = (item: InventoryItem) => {
    const existing = selectedItems.find(i => i.id === item.id);
    if (existing) {
      setSelectedItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
      );
    } else {
      setSelectedItems(prev => [...prev, { id: item.id, name: item.name, quantity: 1, price: item.sellPrice }]);
    }
  };

  const handleItemQuantityChange = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setSelectedItems(prev => prev.filter(i => i.id !== itemId));
    } else {
      setSelectedItems(prev =>
        prev.map(i => i.id === itemId ? { ...i, quantity } : i)
      );
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems(prev => prev.filter(i => i.id !== itemId));
  };

  // Calcola totale
  const totalPrice = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [selectedItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.propertyId) {
      alert("Seleziona una proprietà");
      return;
    }

    if (formData.requestType === "linen_only" && selectedItems.length === 0) {
      alert("Seleziona almeno un articolo");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/cleanings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: formData.propertyId,
          scheduledDate: formData.scheduledDate,
          scheduledTime: formData.scheduledTime,
          guestsCount: formData.guestsCount,
          notes: formData.notes,
          type: formData.type,
          linenOnly: formData.requestType === "linen_only",
          createLinenOrder: formData.requestType === "cleaning" ? formData.createLinenOrder : true,
          customLinenItems: selectedItems.length > 0 ? selectedItems : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Errore nella creazione");

      alert(data.message || "Creato con successo!");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Errore:", error);
      alert(error.message || "Errore nella creazione");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Mostra sezione articoli se: linen_only OPPURE (cleaning + createLinenOrder + biancheria nostra)
  const showLinenSection = formData.requestType === "linen_only" ||
    (formData.requestType === "cleaning" && formData.createLinenOrder && selectedProperty && !selectedProperty.usesOwnLinen);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800">
              {formData.requestType === "linen_only" ? "🛏️ Richiedi Biancheria" : "🧹 Nuova Pulizia"}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Tipo di richiesta */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Cosa vuoi richiedere?</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, requestType: "cleaning" }))}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  formData.requestType === "cleaning"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="text-2xl block mb-1">🧹</span>
                <span className="font-medium">Pulizia</span>
                <span className="text-xs text-slate-500 block">+ biancheria se necessario</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, requestType: "linen_only" }))}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  formData.requestType === "linen_only"
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="text-2xl block mb-1">🛏️</span>
                <span className="font-medium">Solo Biancheria</span>
                <span className="text-xs text-slate-500 block">Consegna senza pulizia</span>
              </button>
            </div>
          </div>

          {/* Proprietà */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Proprietà *</label>
            {loadingProperties ? (
              <div className="animate-pulse bg-slate-100 h-12 rounded-xl"></div>
            ) : (
              <select
                value={formData.propertyId}
                onChange={(e) => handlePropertyChange(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                required
              >
                <option value="">Seleziona proprietà...</option>
                {properties.map((prop: Property) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.name} - {prop.address}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Info proprietà */}
          {selectedProperty && (
            <div className="bg-slate-50 rounded-xl p-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-slate-500">Camere:</span><span className="font-medium ml-1">{selectedProperty.bedrooms || 1}</span></div>
                <div><span className="text-slate-500">Bagni:</span><span className="font-medium ml-1">{selectedProperty.bathrooms || 1}</span></div>
                <div><span className="text-slate-500">Max ospiti:</span><span className="font-medium ml-1">{selectedProperty.maxGuests || 2}</span></div>
                <div><span className="text-slate-500">Biancheria:</span><span className={`font-medium ml-1 ${selectedProperty.usesOwnLinen ? "text-amber-600" : "text-emerald-600"}`}>{selectedProperty.usesOwnLinen ? "Propria" : "Nostra"}</span></div>
              </div>
            </div>
          )}

          {/* Data */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Data *</label>
            <input type="date" value={formData.scheduledDate} onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))} min={new Date().toISOString().split("T")[0]} className="w-full px-4 py-3 border border-slate-200 rounded-xl" required />
          </div>

          {/* Campi solo pulizia */}
          {formData.requestType === "cleaning" && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Orario</label>
                <input type="time" value={formData.scheduledTime} onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))} className="w-full px-4 py-3 border border-slate-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Numero ospiti</label>
                <input type="number" value={formData.guestsCount} onChange={(e) => setFormData(prev => ({ ...prev, guestsCount: parseInt(e.target.value) || 2 }))} min={1} max={20} className="w-full px-4 py-3 border border-slate-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo di pulizia</label>
                <select value={formData.type} onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))} className="w-full px-4 py-3 border border-slate-200 rounded-xl">
                  <option value="MANUAL">Pulizia Manuale</option>
                  <option value="CHECKOUT">Check-out</option>
                  <option value="CHECKIN">Check-in</option>
                  <option value="DEEP_CLEAN">Pulizia Profonda</option>
                </select>
              </div>
              {selectedProperty && !selectedProperty.usesOwnLinen && (
                <div className="flex items-center gap-3 p-4 bg-sky-50 rounded-xl">
                  <input type="checkbox" id="createLinenOrder" checked={formData.createLinenOrder} onChange={(e) => setFormData(prev => ({ ...prev, createLinenOrder: e.target.checked }))} className="w-5 h-5 text-sky-500 rounded" />
                  <label htmlFor="createLinenOrder" className="flex-1">
                    <span className="font-medium text-sky-800">Crea ordine biancheria</span>
                    <span className="text-sm text-sky-600 block">Consegnata dal rider</span>
                  </label>
                </div>
              )}
            </>
          )}

          {/* SEZIONE ARTICOLI - Sempre visibile per linen_only o quando createLinenOrder è attivo */}
          {showLinenSection && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <span>📦</span> Articoli da Consegnare
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Seleziona biancheria, kit cortesia e servizi extra</p>
                  </div>
                  {selectedItems.length > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Totale</p>
                      <p className="text-lg font-bold text-emerald-600">€{totalPrice.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              </div>

              {loadingInventory ? (
                <div className="p-8 text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full mx-auto"></div>
                  <p className="text-sm text-slate-500 mt-2">Caricamento inventario...</p>
                </div>
              ) : allInventoryItems.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-500">Nessun articolo nell'inventario</p>
                  <a href="/admin/inventario" className="text-sm text-sky-600 hover:underline mt-2 inline-block">Vai all'inventario →</a>
                </div>
              ) : (
                <>
                  {/* Filtri categoria */}
                  <div className="px-4 py-3 border-b border-slate-100 bg-white overflow-x-auto">
                    <div className="flex gap-2 min-w-max">
                      <button
                        type="button"
                        onClick={() => setActiveCategory("all")}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                          activeCategory === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        Tutti
                      </button>
                      {inventoryCategories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setActiveCategory(cat.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                            activeCategory === cat.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          <span>{cat.icon}</span> {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Items selezionati */}
                  {selectedItems.length > 0 && (
                    <div className="p-4 border-b border-slate-200 bg-emerald-50/50">
                      <p className="text-xs font-medium text-emerald-700 mb-3">✓ SELEZIONATI ({selectedItems.length})</p>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {selectedItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2 shadow-sm">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-slate-700 truncate block">{item.name}</span>
                              <span className="text-xs text-slate-400">€{item.price.toFixed(2)} cad.</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button type="button" onClick={() => handleItemQuantityChange(item.id, item.quantity - 1)} className="w-7 h-7 rounded-lg bg-slate-100 border flex items-center justify-center font-bold text-slate-600">−</button>
                              <span className="w-8 text-center font-bold text-emerald-700">{item.quantity}</span>
                              <button type="button" onClick={() => handleItemQuantityChange(item.id, item.quantity + 1)} className="w-7 h-7 rounded-lg bg-slate-100 border flex items-center justify-center font-bold text-slate-600">+</button>
                              <button type="button" onClick={() => handleRemoveItem(item.id)} className="w-7 h-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center ml-1">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lista articoli disponibili */}
                  <div className="p-4 bg-white">
                    <p className="text-xs font-medium text-slate-500 mb-3">AGGIUNGI ARTICOLI</p>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {filteredItems.map((item) => {
                        const isSelected = selectedItems.some(i => i.id === item.id);
                        const selectedQty = selectedItems.find(i => i.id === item.id)?.quantity || 0;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleAddItem(item)}
                            className={`p-3 rounded-lg border text-left transition-all ${
                              isSelected
                                ? "border-emerald-400 bg-emerald-50"
                                : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span>{item.icon}</span>
                              <span className="text-sm font-medium text-slate-700 truncate">{item.name}</span>
                            </div>
                            <span className="text-xs text-slate-400">€{item.sellPrice.toFixed(2)}</span>
                            {isSelected && <span className="text-xs text-emerald-600 block">✓ {selectedQty} selez.</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Note (opzionale)</label>
            <textarea value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))} rows={2} placeholder="Istruzioni speciali..." className="w-full px-4 py-3 border border-slate-200 rounded-xl resize-none" />
          </div>

          {/* Bottoni */}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50">Annulla</button>
            <button
              type="submit"
              disabled={saving || !formData.propertyId || (formData.requestType === "linen_only" && selectedItems.length === 0)}
              className={`flex-1 py-3 rounded-xl font-bold disabled:opacity-50 ${
                formData.requestType === "linen_only"
                  ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white"
                  : "bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
              }`}
            >
              {saving ? "Creazione..." : formData.requestType === "linen_only" ? "Richiedi Biancheria" : "Crea Pulizia"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
