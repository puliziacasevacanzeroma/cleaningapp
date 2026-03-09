"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface LinenConfig {
  id: string;
  guestsCount: number;
  [key: string]: any;
}

interface InventoryItem {
  id: string;
  key: string;
  name: string;
  categoryId: string;
  sellPrice: number;
  unit: string;
  isForLinen: boolean;
}

interface BiancheriaConfiguratorProps {
  propertyId: string;
  maxGuests: number;
  existingConfigs: LinenConfig[];
}

export function BiancheriaConfigurator({ propertyId, maxGuests, existingConfigs }: BiancheriaConfiguratorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  
  const [configs, setConfigs] = useState<{ [key: number]: { [key: string]: number } }>(() => {
    const initial: { [key: number]: { [key: string]: number } } = {};
    existingConfigs.forEach(cfg => {
      const { id, guestsCount, ...rest } = cfg;
      initial[guestsCount] = rest;
    });
    return initial;
  });

  const [expandedGuest, setExpandedGuest] = useState<number | null>(null);

  // Carica articoli dall'inventario
  useEffect(() => {
    async function loadInventory() {
      try {
        const res = await fetch("/api/inventory/list");
        const data = await res.json();
        
        // Prendi solo articoli biancheria (letto + bagno) con isForLinen = true
        const linenItems: InventoryItem[] = [];
        data.categories?.forEach((cat: any) => {
          if (cat.id === "biancheria_letto" || cat.id === "biancheria_bagno") {
            cat.items?.forEach((item: any) => {
              if (item.isForLinen !== false) {
                linenItems.push({
                  id: item.id,
                  key: item.key || item.id,
                  name: item.name,
                  categoryId: cat.id,
                  sellPrice: item.sellPrice || 0,
                  unit: item.unit || "pz",
                  isForLinen: true,
                });
              }
            });
          }
        });
        
        setInventoryItems(linenItems);
      } catch (err) {
        console.error("Errore caricamento inventario:", err);
      } finally {
        setLoadingItems(false);
      }
    }
    loadInventory();
  }, []);

  const itemsByCategory = {
    biancheria_letto: inventoryItems.filter(i => i.categoryId === "biancheria_letto"),
    biancheria_bagno: inventoryItems.filter(i => i.categoryId === "biancheria_bagno"),
  };

  const getDefaultConfig = () => {
    const config: { [key: string]: number } = {};
    inventoryItems.forEach(item => {
      config[item.key] = 0;
    });
    return config;
  };

  const handleChange = (guestCount: number, key: string, value: number) => {
    setConfigs(prev => ({
      ...prev,
      [guestCount]: {
        ...(prev[guestCount] || getDefaultConfig()),
        [key]: Math.max(0, value)
      }
    }));
  };

  const handleSave = async (guestCount: number) => {
    setLoading(guestCount);
    setError(null);

    try {
      const config = configs[guestCount] || getDefaultConfig();
      const response = await fetch(`/api/proprietario/properties/${propertyId}/linen-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestsCount: guestCount,
          ...config
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Errore durante il salvataggio");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (guestCount: number) => {
    if (!confirm("Sei sicuro di voler eliminare questa configurazione?")) return;

    setLoading(guestCount);
    setError(null);

    try {
      const response = await fetch(`/api/proprietario/properties/${propertyId}/linen-config?guestsCount=${guestCount}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Errore durante l'eliminazione");
      }

      setConfigs(prev => {
        const newConfigs = { ...prev };
        delete newConfigs[guestCount];
        return newConfigs;
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(null);
    }
  };

  const isConfigured = (guestCount: number) => {
    return existingConfigs.some(cfg => cfg.guestsCount === guestCount);
  };

  const calculateTotal = (guestCount: number) => {
    const config = configs[guestCount] || {};
    let total = 0;
    Object.entries(config).forEach(([key, qty]) => {
      const item = inventoryItems.find(i => i.key === key);
      if (item && qty > 0) {
        total += item.sellPrice * qty;
      }
    });
    return total;
  };

  if (loadingItems) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
        <span className="ml-3 text-slate-500">Caricamento articoli dall'inventario...</span>
      </div>
    );
  }

  if (inventoryItems.length === 0) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📦</span>
        </div>
        <h3 className="font-bold text-amber-800 mb-2">Nessun articolo biancheria</h3>
        <p className="text-sm text-amber-700 mb-4">
          Per configurare la biancheria, devi prima aggiungere gli articoli nell'inventario.
        </p>
        <a 
          href="/admin/inventario" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Vai all'Inventario
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
          {error}
        </div>
      )}

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
        <strong>💡 Suggerimento:</strong> Gli articoli mostrati qui provengono dall'inventario. 
        Per aggiungere nuovi articoli, vai alla sezione <a href="/admin/inventario" className="underline font-medium">Inventario</a>.
      </div>

      {Array.from({ length: maxGuests }, (_, i) => i + 1).map(guestCount => {
        const configured = isConfigured(guestCount);
        const expanded = expandedGuest === guestCount;
        const config = configs[guestCount] || getDefaultConfig();
        const total = calculateTotal(guestCount);

        return (
          <div
            key={guestCount}
            className={`bg-white rounded-2xl border overflow-hidden transition-all ${
              configured ? "border-emerald-200" : "border-slate-200"
            }`}
          >
            {/* Header */}
            <div
              className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-all ${
                configured ? "bg-emerald-50/50" : ""
              }`}
              onClick={() => setExpandedGuest(expanded ? null : guestCount)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold ${
                  configured
                    ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white"
                    : "bg-slate-100 text-slate-400"
                }`}>
                  {guestCount}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">
                    {guestCount} {guestCount === 1 ? "Ospite" : "Ospiti"}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {configured ? "✓ Configurato" : "○ Non configurato"}
                    {total > 0 && ` • €${total.toFixed(2)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {configured && (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-lg">
                    Attivo
                  </span>
                )}
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Content */}
            {expanded && (
              <div className="border-t border-slate-100 p-6">
                {/* Biancheria Letto */}
                {itemsByCategory.biancheria_letto.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                      <span className="text-lg">🛏️</span> Biancheria Letto
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {itemsByCategory.biancheria_letto.map(item => (
                        <div key={item.key} className="bg-sky-50 rounded-xl p-3 border border-sky-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700 truncate">{item.name}</span>
                            <span className="text-xs text-sky-600 ml-1">€{item.sellPrice}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleChange(guestCount, item.key, (config[item.key] || 0) - 1)}
                              className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={0}
                              value={config[item.key] || 0}
                              onChange={(e) => handleChange(guestCount, item.key, parseInt(e.target.value) || 0)}
                              className="w-14 h-8 text-center border border-slate-200 rounded-lg font-semibold text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => handleChange(guestCount, item.key, (config[item.key] || 0) + 1)}
                              className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center hover:bg-sky-600 font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Biancheria Bagno */}
                {itemsByCategory.biancheria_bagno.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                      <span className="text-lg">🛁</span> Biancheria Bagno
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {itemsByCategory.biancheria_bagno.map(item => (
                        <div key={item.key} className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700 truncate">{item.name}</span>
                            <span className="text-xs text-emerald-600 ml-1">€{item.sellPrice}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleChange(guestCount, item.key, (config[item.key] || 0) - 1)}
                              className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={0}
                              value={config[item.key] || 0}
                              onChange={(e) => handleChange(guestCount, item.key, parseInt(e.target.value) || 0)}
                              className="w-14 h-8 text-center border border-slate-200 rounded-lg font-semibold text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => handleChange(guestCount, item.key, (config[item.key] || 0) + 1)}
                              className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Totale */}
                {total > 0 && (
                  <div className="bg-slate-100 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-600">Totale biancheria per {guestCount} ospiti</span>
                      <span className="text-xl font-bold text-emerald-600">€{total.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  {configured && (
                    <button
                      type="button"
                      onClick={() => handleDelete(guestCount)}
                      disabled={loading === guestCount}
                      className="px-4 py-2 text-rose-600 hover:bg-rose-50 rounded-xl font-medium transition-all disabled:opacity-50"
                    >
                      Elimina configurazione
                    </button>
                  )}
                  <div className={configured ? "" : "w-full flex justify-end"}>
                    <button
                      type="button"
                      onClick={() => handleSave(guestCount)}
                      disabled={loading === guestCount}
                      className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium rounded-xl hover:shadow-lg disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      {loading === guestCount ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Salvataggio...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {configured ? "Aggiorna" : "Salva Configurazione"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
