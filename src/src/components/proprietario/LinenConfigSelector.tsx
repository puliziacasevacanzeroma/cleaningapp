"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface LinenConfig {
  id: string;
  guestsCount: number;
  lenzuoloMatrimoniale: number;
  lenzuoloSingolo: number;
  federa: number;
  copriletto: number;
  copripiumino: number;
  teloDoccia: number;
  teloViso: number;
  teloBidet: number;
  teloOspite: number;
  scendiBagno: number;
  accappatoio: number;
  strofinaccio: number;
  tovaglia: number;
  tovagliolo: number;
}

interface LinenConfigSelectorProps {
  bookingId: string;
  propertyId: string;
  currentGuestsCount: number | null;
  linenConfigs: LinenConfig[];
  canModify: boolean;
  existingOrder?: any;
}

const LINEN_LABELS: Record<string, string> = {
  lenzuoloMatrimoniale: "Lenzuolo Matrimoniale",
  lenzuoloSingolo: "Lenzuolo Singolo",
  federa: "Federa",
  copriletto: "Copriletto",
  copripiumino: "Copripiumino",
  teloDoccia: "Telo Doccia",
  teloViso: "Telo Viso",
  teloBidet: "Telo Bidet",
  teloOspite: "Telo Ospite",
  scendiBagno: "Scendi Bagno",
  accappatoio: "Accappatoio",
  strofinaccio: "Strofinaccio",
  tovaglia: "Tovaglia",
  tovagliolo: "Tovagliolo",
};

export function LinenConfigSelector({
  bookingId,
  propertyId,
  currentGuestsCount,
  linenConfigs,
  canModify,
  existingOrder,
}: LinenConfigSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedConfig, setSelectedConfig] = useState<string>(
    currentGuestsCount 
      ? linenConfigs.find(c => c.guestsCount === currentGuestsCount)?.id || ""
      : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Trova la configurazione selezionata
  const currentConfig = linenConfigs.find(c => c.id === selectedConfig);

  // Estrai gli articoli dalla configurazione (escludendo campi non biancheria)
  const getLinenItems = (config: LinenConfig) => {
    const excludeKeys = ["id", "propertyId", "guestsCount"];
    return Object.entries(config)
      .filter(([key, value]) => !excludeKeys.includes(key) && typeof value === "number" && value > 0)
      .map(([key, value]) => ({
        key,
        label: LINEN_LABELS[key] || key,
        quantity: value as number,
      }));
  };

  const handleConfirm = async () => {
    if (!selectedConfig || !currentConfig) return;
    
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/linen-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId: selectedConfig,
          guestsCount: currentConfig.guestsCount,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Errore durante la creazione dell'ordine");
      }

      setSuccess(true);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    }
  };

  if (linenConfigs.length === 0) {
    return (
      <div className="p-4 bg-slate-50 rounded-xl text-center">
        <p className="text-slate-600">Nessuna configurazione biancheria disponibile per questa proprietà.</p>
        <p className="text-sm text-slate-500 mt-1">Contatta l'amministratore per configurare la biancheria.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Dropdown selezione */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Seleziona configurazione per numero ospiti
        </label>
        <select
          value={selectedConfig}
          onChange={(e) => setSelectedConfig(e.target.value)}
          disabled={!canModify || isPending}
          className="w-full px-4 py-3 bg-slate-700 text-white border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">Seleziona</option>
          {linenConfigs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.guestsCount} Ospiti
            </option>
          ))}
        </select>
      </div>

      {/* Preview configurazione */}
      {currentConfig && (
        <div className="p-4 bg-slate-50 rounded-xl">
          <h4 className="font-medium text-slate-800 mb-3">
            Biancheria per {currentConfig.guestsCount} ospiti:
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {getLinenItems(currentConfig).map((item) => (
              <div key={item.key} className="flex items-center justify-between p-2 bg-white rounded-lg">
                <span className="text-sm text-slate-600">{item.label}</span>
                <span className="font-semibold text-slate-800">{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ordine esistente */}
      {existingOrder && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium text-emerald-800">Ordine biancheria già creato</span>
          </div>
          <p className="text-sm text-emerald-700">
            Stato: {existingOrder.status === "pending" ? "In attesa" : existingOrder.status === "prepared" ? "Preparato" : "Consegnato"}
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          Ordine biancheria creato con successo!
        </div>
      )}

      {/* Bottone conferma */}
      {canModify && !existingOrder && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending || !selectedConfig}
          className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none transition-all"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Creazione ordine...
            </span>
          ) : (
            "Conferma biancheria"
          )}
        </button>
      )}
    </div>
  );
}
