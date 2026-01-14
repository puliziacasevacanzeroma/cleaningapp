"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface LinenConfig {
  id: string;
  guestsCount: number;
  singleSheets: number;
  doubleSheets: number;
  pillowcases: number;
  towelsLarge: number;
  towelsSmall: number;
  towelsFace: number;
  bathMats: number;
  bathrobe: number;
}

interface BiancheriaConfiguratorProps {
  propertyId: string;
  maxGuests: number;
  existingConfigs: LinenConfig[];
}

const defaultConfig = {
  singleSheets: 0,
  doubleSheets: 1,
  pillowcases: 2,
  towelsLarge: 2,
  towelsSmall: 2,
  towelsFace: 2,
  bathMats: 1,
  bathrobe: 0
};

export function BiancheriaConfigurator({ propertyId, maxGuests, existingConfigs }: BiancheriaConfiguratorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configs, setConfigs] = useState<{ [key: number]: typeof defaultConfig }>(
    existingConfigs.reduce((acc, cfg) => ({
      ...acc,
      [cfg.guestsCount]: {
        singleSheets: cfg.singleSheets,
        doubleSheets: cfg.doubleSheets,
        pillowcases: cfg.pillowcases,
        towelsLarge: cfg.towelsLarge,
        towelsSmall: cfg.towelsSmall,
        towelsFace: cfg.towelsFace,
        bathMats: cfg.bathMats,
        bathrobe: cfg.bathrobe
      }
    }), {})
  );

  const [expandedGuest, setExpandedGuest] = useState<number | null>(null);

  const items = [
    { key: "singleSheets", label: "Lenzuola Singole", icon: "🛏️" },
    { key: "doubleSheets", label: "Lenzuola Matrimoniali", icon: "🛏️" },
    { key: "pillowcases", label: "Federe", icon: "🛏️" },
    { key: "towelsLarge", label: "Asciugamani Grandi", icon: "🛁" },
    { key: "towelsSmall", label: "Asciugamani Piccoli", icon: "🛁" },
    { key: "towelsFace", label: "Asciugamani Viso", icon: "🛁" },
    { key: "bathMats", label: "Tappetini Bagno", icon: "🛁" },
    { key: "bathrobe", label: "Accappatoi", icon: "👘" }
  ];

  const handleChange = (guestCount: number, key: string, value: number) => {
    setConfigs(prev => ({
      ...prev,
      [guestCount]: {
        ...(prev[guestCount] || defaultConfig),
        [key]: value
      }
    }));
  };

  const handleSave = async (guestCount: number) => {
    setLoading(guestCount);
    setError(null);

    try {
      const config = configs[guestCount] || defaultConfig;
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

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
          {error}
        </div>
      )}

      {Array.from({ length: maxGuests }, (_, i) => i + 1).map(guestCount => {
        const configured = isConfigured(guestCount);
        const expanded = expandedGuest === guestCount;
        const config = configs[guestCount] || defaultConfig;

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
                    {configured ? "✅ Configurato" : "⚪ Non configurato"}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {items.map(item => (
                    <div key={item.key} className="bg-slate-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-sm font-medium text-slate-700">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleChange(guestCount, item.key, Math.max(0, (config[item.key as keyof typeof config] || 0) - 1))}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={config[item.key as keyof typeof config] || 0}
                          onChange={(e) => handleChange(guestCount, item.key, parseInt(e.target.value) || 0)}
                          className="w-16 h-8 text-center border border-slate-200 rounded-lg font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => handleChange(guestCount, item.key, (config[item.key as keyof typeof config] || 0) + 1)}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

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
