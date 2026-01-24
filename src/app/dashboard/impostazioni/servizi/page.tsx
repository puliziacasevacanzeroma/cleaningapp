"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

// Servizi CORE che NON possono essere eliminati o disattivati
const CORE_SERVICE_CODES = ["STANDARD", "APPROFONDITA", "SGROSSO"];

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface ServiceType {
  id: string;
  name: string;
  description: string;
  code: string;
  baseSurcharge: number;
  requiresManualPrice: boolean;
  estimatedDuration: number;
  extraDuration?: number;
  minPhotosRequired: number;
  requiresRating: boolean;
  adminOnly: boolean;
  clientCanRequest: boolean;
  requiresApproval: boolean;
  requiresReason: boolean;
  autoAssignEveryN?: number;
  sortOrder: number;
  icon: string;
  color: string;
  availableForManual: boolean;
  availableForAuto: boolean;
  isActive: boolean;
}

// ═══════════════════════════════════════════════════════════════
// INFO TOOLTIP COMPONENT
// ═══════════════════════════════════════════════════════════════

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center hover:bg-slate-300 ml-1"
      >
        ?
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg">
          {text}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

export default function ServiziPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Stati
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tab attivo
  const [activeTab, setActiveTab] = useState<"pulizie" | "extra" | "all">("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<ServiceType | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    code: "EXTRA" as string,
    baseSurcharge: 0,
    requiresManualPrice: false,
    estimatedDuration: 90,
    extraDuration: 0,
    minPhotosRequired: 10,
    requiresRating: true,
    adminOnly: false,
    clientCanRequest: true,
    requiresApproval: false,
    requiresReason: false,
    autoAssignEveryN: 0,
    sortOrder: 99,
    icon: "🧹",
    color: "#3B82F6",
    availableForManual: true,
    availableForAuto: false,
  });

  // ─── HELPER: È un servizio core? ───
  const isCoreService = (service: ServiceType) => CORE_SERVICE_CODES.includes(service.code);

  // ─── CARICA SERVIZI ───
  const loadServiceTypes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/service-types");
      const data = await response.json();

      if (response.ok) {
        setServiceTypes(data.serviceTypes || []);
      } else {
        setError(data.error || "Errore caricamento");
      }
    } catch {
      setError("Errore di connessione");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user?.role === "ADMIN") {
      loadServiceTypes();
    }
  }, [authLoading, user, loadServiceTypes]);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "ADMIN")) {
      router.push("/dashboard");
    }
  }, [authLoading, user, router]);

  // ─── SEED SERVIZI PREDEFINITI ───
  const handleSeed = async () => {
    try {
      setSaving(true);
      const response = await fetch("/api/service-types", { method: "PUT" });
      const data = await response.json();

      if (response.ok) {
        setSuccess("Servizi predefiniti creati!");
        loadServiceTypes();
      } else {
        setError(data.error);
      }
    } catch {
      setError("Errore creazione servizi");
    } finally {
      setSaving(false);
    }
  };

  // ─── TOGGLE ATTIVO ───
  const handleToggleActive = async (service: ServiceType) => {
    // Blocca toggle per servizi core
    if (isCoreService(service)) {
      setError(`Il servizio "${service.name}" è un servizio base e non può essere disattivato`);
      return;
    }

    try {
      const response = await fetch(`/api/service-types/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !service.isActive }),
      });

      if (response.ok) {
        setServiceTypes(prev =>
          prev.map(s => (s.id === service.id ? { ...s, isActive: !s.isActive } : s))
        );
      }
    } catch {
      setError("Errore aggiornamento");
    }
  };

  // ─── ELIMINA SERVIZIO ───
  const handleDelete = async (service: ServiceType) => {
    // Blocca eliminazione per servizi core
    if (isCoreService(service)) {
      setError(`Il servizio "${service.name}" è un servizio base e non può essere eliminato`);
      return;
    }

    if (!confirm(`Sei sicuro di voler eliminare "${service.name}"?\n\nQuesta azione è irreversibile.`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/service-types/${service.id}?force=true`, { 
        method: "DELETE" 
      });

      if (response.ok) {
        setServiceTypes(prev => prev.filter(s => s.id !== service.id));
        setSuccess("Servizio eliminato");
      } else {
        const data = await response.json();
        setError(data.error);
      }
    } catch {
      setError("Errore eliminazione");
    }
  };

  // ─── APRI MODAL ───
  const openModal = (service?: ServiceType) => {
    if (service) {
      setEditingService(service);
      setFormData({
        name: service.name,
        description: service.description,
        code: service.code,
        baseSurcharge: service.baseSurcharge,
        requiresManualPrice: service.requiresManualPrice,
        estimatedDuration: service.estimatedDuration,
        extraDuration: service.extraDuration || 0,
        minPhotosRequired: service.minPhotosRequired,
        requiresRating: service.requiresRating,
        adminOnly: service.adminOnly,
        clientCanRequest: service.clientCanRequest,
        requiresApproval: service.requiresApproval,
        requiresReason: service.requiresReason,
        autoAssignEveryN: service.autoAssignEveryN || 0,
        sortOrder: service.sortOrder,
        icon: service.icon,
        color: service.color,
        availableForManual: service.availableForManual,
        availableForAuto: service.availableForAuto,
      });
    } else {
      setEditingService(null);
      setFormData({
        name: "",
        description: "",
        code: "EXTRA",
        baseSurcharge: 0,
        requiresManualPrice: false,
        estimatedDuration: 90,
        extraDuration: 0,
        minPhotosRequired: 10,
        requiresRating: true,
        adminOnly: false,
        clientCanRequest: true,
        requiresApproval: false,
        requiresReason: false,
        autoAssignEveryN: 0,
        sortOrder: 99,
        icon: "✨",
        color: "#3B82F6",
        availableForManual: true,
        availableForAuto: false,
      });
    }
    setShowModal(true);
  };

  // ─── SALVA SERVIZIO ───
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError("Nome obbligatorio");
      return;
    }

    try {
      setSaving(true);
      
      const payload = {
        ...formData,
        autoAssignEveryN: formData.autoAssignEveryN || null,
        extraDuration: formData.extraDuration || null,
      };

      const url = editingService ? `/api/service-types/${editingService.id}` : "/api/service-types";
      const method = editingService ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(editingService ? "Servizio aggiornato" : "Servizio creato");
        setShowModal(false);
        loadServiceTypes();
      } else {
        setError(data.error);
      }
    } catch {
      setError("Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // ─── FILTRA PER TAB ───
  const filteredServices = serviceTypes.filter(s => {
    if (activeTab === "all") return true;
    if (activeTab === "pulizie") return CORE_SERVICE_CODES.includes(s.code);
    if (activeTab === "extra") return !CORE_SERVICE_CODES.includes(s.code);
    return true;
  });

  // ─── FORMATTA DURATA ───
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // ─── LOADING ───
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push("/dashboard/impostazioni")}
            className="text-sm text-slate-500 hover:text-slate-700 mb-2"
          >
            ← Torna alle impostazioni
          </button>
          <h1 className="text-2xl font-bold text-slate-800">🧹 Tipi di Servizio</h1>
          <p className="text-slate-500 text-sm mt-1">
            Configura i servizi disponibili e i relativi parametri
          </p>
        </div>

        <div className="flex gap-2">
          {serviceTypes.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={saving}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-medium"
            >
              🚀 Crea servizi predefiniti
            </button>
          )}
          <button
            onClick={() => openModal()}
            className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 text-sm font-medium"
          >
            + Nuovo servizio extra
          </button>
        </div>
      </div>

      {/* ─── MESSAGGI ─── */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex justify-between items-center">
          <span>❌ {error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold text-lg">×</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm flex justify-between items-center">
          <span>✅ {success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700 font-bold text-lg">×</button>
        </div>
      )}

      {/* ─── INFO BOX ─── */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
          ℹ️ Informazioni sui Servizi
        </h3>
        <div className="text-sm text-blue-700 space-y-1">
          <p>• I servizi <strong>Standard</strong>, <strong>Approfondita</strong> e <strong>Sgrosso</strong> sono servizi base e non possono essere eliminati o disattivati.</p>
          <p>• Puoi creare servizi extra personalizzati che possono essere attivati/disattivati liberamente.</p>
          <p>• La durata stimata viene utilizzata per la pianificazione e può essere aggiornata automaticamente dalla sezione &quot;Durate Automatiche&quot;.</p>
        </div>
      </div>

      {/* ─── TABS ─── */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { id: "all", label: "📋 Tutti", count: serviceTypes.length },
          { id: "pulizie", label: "🧹 Pulizie Base", count: serviceTypes.filter(s => CORE_SERVICE_CODES.includes(s.code)).length },
          { id: "extra", label: "✨ Extra", count: serviceTypes.filter(s => !CORE_SERVICE_CODES.includes(s.code)).length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-sky-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* ─── LISTA SERVIZI ─── */}
      {filteredServices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 mb-4">Nessun tipo di servizio configurato</p>
          <button
            onClick={handleSeed}
            disabled={saving}
            className="px-6 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium"
          >
            🚀 Crea servizi predefiniti
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredServices.map(service => {
            const isCore = isCoreService(service);
            
            return (
              <div
                key={service.id}
                className={`bg-white rounded-xl border-2 p-4 transition-all ${
                  isCore 
                    ? "border-sky-200 bg-sky-50/30" 
                    : !service.isActive 
                    ? "border-slate-200 opacity-50" 
                    : "border-slate-200"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Info principale */}
                  <div className="flex items-start gap-3 flex-1">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                      style={{ backgroundColor: `${service.color}20` }}
                    >
                      {service.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800">{service.name}</h3>
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{ backgroundColor: `${service.color}20`, color: service.color }}
                        >
                          {service.code}
                        </span>
                        {isCore && (
                          <span className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded text-xs font-medium flex items-center gap-1">
                            🔒 Base
                          </span>
                        )}
                        {service.adminOnly && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                            Solo Admin
                          </span>
                        )}
                        {service.requiresApproval && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                            Approvazione
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                        {service.description}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex flex-wrap gap-4 lg:gap-6 text-sm">
                    <div className="text-center">
                      <div className="font-semibold text-slate-800">
                        {service.requiresManualPrice ? "Manuale" : service.baseSurcharge > 0 ? `+€${service.baseSurcharge}` : "Da contratto"}
                      </div>
                      <div className="text-xs text-slate-500">Prezzo</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-slate-800">
                        {formatDuration(service.estimatedDuration)}
                      </div>
                      <div className="text-xs text-slate-500">Durata</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-slate-800">{service.minPhotosRequired}</div>
                      <div className="text-xs text-slate-500">Foto min</div>
                    </div>
                    {service.autoAssignEveryN && service.autoAssignEveryN > 0 && (
                      <div className="text-center">
                        <div className="font-semibold text-purple-600">ogni {service.autoAssignEveryN}</div>
                        <div className="text-xs text-slate-500">Auto</div>
                      </div>
                    )}
                  </div>

                  {/* Azioni */}
                  <div className="flex items-center gap-3 lg:ml-4">
                    {/* Toggle - disabilitato per servizi core */}
                    <button
                      onClick={() => handleToggleActive(service)}
                      disabled={isCore}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        isCore 
                          ? "bg-emerald-500 cursor-not-allowed" 
                          : service.isActive 
                          ? "bg-emerald-500 hover:bg-emerald-600" 
                          : "bg-slate-300 hover:bg-slate-400"
                      }`}
                      title={isCore ? "I servizi base sono sempre attivi" : service.isActive ? "Disattiva" : "Attiva"}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          service.isActive || isCore ? "translate-x-6" : "translate-x-0.5"
                        }`}
                      />
                      {isCore && (
                        <span className="absolute -top-1 -right-1 text-xs">🔒</span>
                      )}
                    </button>
                    
                    {/* Modifica */}
                    <button
                      onClick={() => openModal(service)}
                      className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                      title="Modifica"
                    >
                      ✏️
                    </button>
                    
                    {/* Elimina - disabilitato per servizi core */}
                    <button
                      onClick={() => handleDelete(service)}
                      disabled={isCore}
                      className={`p-2 rounded-lg transition-colors ${
                        isCore 
                          ? "text-slate-300 cursor-not-allowed" 
                          : "text-red-600 hover:bg-red-50"
                      }`}
                      title={isCore ? "I servizi base non possono essere eliminati" : "Elimina"}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Flags */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                  {service.availableForManual && (
                    <span className="px-2 py-1 bg-sky-50 text-sky-700 rounded text-xs">
                      ✋ Creazione manuale
                    </span>
                  )}
                  {service.availableForAuto && (
                    <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                      🤖 Auto da iCal
                    </span>
                  )}
                  {service.clientCanRequest && (
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs">
                      👤 Richiedibile dal cliente
                    </span>
                  )}
                  {service.requiresRating && (
                    <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">
                      ⭐ Richiede valutazione
                    </span>
                  )}
                  {service.requiresReason && (
                    <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs">
                      📝 Richiede motivo
                    </span>
                  )}
                  {service.requiresManualPrice && (
                    <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs">
                      💰 Prezzo manuale
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL CREA/MODIFICA */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {editingService ? `✏️ Modifica "${editingService.name}"` : "➕ Nuovo Servizio Extra"}
                </h2>
                <p className="text-sm text-slate-500">
                  {editingService && isCoreService(editingService) 
                    ? "🔒 Servizio base - alcune opzioni non modificabili" 
                    : "Compila i campi per configurare il servizio"}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-200 rounded-lg text-slate-500"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-6">
                
                {/* ─── SEZIONE: INFO BASE ─── */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    📋 Informazioni Base
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center text-sm font-medium text-slate-700 mb-1">
                        Nome servizio *
                        <InfoTooltip text="Il nome che verrà mostrato agli utenti. Scegli un nome chiaro e descrittivo." />
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                        placeholder="es. Pulizia Vetri"
                      />
                    </div>
                    <div>
                      <label className="flex items-center text-sm font-medium text-slate-700 mb-1">
                        Codice
                        <InfoTooltip text="Codice unico per identificare il servizio. Per i nuovi servizi usa 'EXTRA' o un codice personalizzato." />
                      </label>
                      <input
                        type="text"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        disabled={editingService && isCoreService(editingService)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                        placeholder="EXTRA"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex items-center text-sm font-medium text-slate-700 mb-1">
                        Descrizione
                        <InfoTooltip text="Descrivi cosa include questo servizio. Sarà visibile a operatori e proprietari." />
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                        rows={2}
                        placeholder="Descrizione del servizio..."
                      />
                    </div>
                    <div>
                      <label className="flex items-center text-sm font-medium text-slate-700 mb-1">
                        Icona
                        <InfoTooltip text="Scegli un emoji che rappresenti il servizio. Apparirà nelle liste e nei calendari." />
                      </label>
                      <input
                        type="text"
                        value={formData.icon}
                        onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-2xl text-center"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="flex items-center text-sm font-medium text-slate-700 mb-1">
                        Colore tema
                        <InfoTooltip text="Il colore usato per identificare visivamente questo servizio nell'interfaccia." />
                      </label>
                      <input
                        type="color"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="w-full h-10 px-1 py-1 border border-slate-300 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* ─── SEZIONE: PREZZO E DURATA ─── */}
                <div className="bg-emerald-50 rounded-xl p-4">
                  <h3 className="font-semibold text-emerald-800 mb-3 flex items-center gap-2">
                    💰 Prezzo e Durata
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="flex items-center text-sm font-medium text-slate-700 mb-1">
                        Sovrapprezzo (€)
                        <InfoTooltip text="Importo aggiuntivo rispetto al prezzo base del contratto. Metti 0 se non c'è sovrapprezzo." />
                      </label>
                      <input
                        type="number"
                        value={formData.baseSurcharge}
                        onChange={(e) => setFormData({ ...formData, baseSurcharge: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        min="0"
                        step="0.5"
                      />
                    </div>
                    <div>
                      <label className="flex items-center text-sm font-medium text-slate-700 mb-1">
                        Durata stimata (min)
                        <InfoTooltip text="Tempo medio per completare questo servizio. Usato per la pianificazione. Può essere aggiornato automaticamente." />
                      </label>
                      <input
                        type="number"
                        value={formData.estimatedDuration}
                        onChange={(e) => setFormData({ ...formData, estimatedDuration: parseInt(e.target.value) || 90 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        min="15"
                        step="15"
                      />
                    </div>
                    <div>
                      <label className="flex items-center text-sm font-medium text-slate-700 mb-1">
                        Foto minime
                        <InfoTooltip text="Numero minimo di foto che l'operatore deve caricare per completare il servizio." />
                      </label>
                      <input
                        type="number"
                        value={formData.minPhotosRequired}
                        onChange={(e) => setFormData({ ...formData, minPhotosRequired: parseInt(e.target.value) || 5 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        min="0"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.requiresManualPrice}
                        onChange={(e) => setFormData({ ...formData, requiresManualPrice: e.target.checked })}
                        className="w-4 h-4 text-emerald-500 rounded"
                      />
                      <span className="text-sm text-slate-700">Richiede prezzo manuale</span>
                      <InfoTooltip text="Se attivo, l'admin dovrà inserire manualmente il prezzo ogni volta. Utile per servizi con costo variabile (es. Sgrosso)." />
                    </label>
                  </div>
                </div>

                {/* ─── SEZIONE: PERMESSI ─── */}
                <div className="bg-amber-50 rounded-xl p-4">
                  <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
                    🔐 Permessi e Visibilità
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-amber-100/50">
                      <input
                        type="checkbox"
                        checked={formData.adminOnly}
                        onChange={(e) => setFormData({ ...formData, adminOnly: e.target.checked })}
                        className="w-4 h-4 text-amber-500 rounded"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">Solo Admin</span>
                        <InfoTooltip text="Solo gli amministratori possono creare o assegnare questo servizio." />
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-amber-100/50">
                      <input
                        type="checkbox"
                        checked={formData.clientCanRequest}
                        onChange={(e) => setFormData({ ...formData, clientCanRequest: e.target.checked })}
                        className="w-4 h-4 text-amber-500 rounded"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">Cliente può richiederlo</span>
                        <InfoTooltip text="Il proprietario può richiedere questo servizio dalla sua area." />
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-amber-100/50">
                      <input
                        type="checkbox"
                        checked={formData.requiresApproval}
                        onChange={(e) => setFormData({ ...formData, requiresApproval: e.target.checked })}
                        className="w-4 h-4 text-amber-500 rounded"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">Richiede approvazione</span>
                        <InfoTooltip text="Se richiesto dal cliente, serve l'approvazione dell'admin prima di essere confermato." />
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-amber-100/50">
                      <input
                        type="checkbox"
                        checked={formData.requiresReason}
                        onChange={(e) => setFormData({ ...formData, requiresReason: e.target.checked })}
                        className="w-4 h-4 text-amber-500 rounded"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">Richiede motivo</span>
                        <InfoTooltip text="Chi crea il servizio deve specificare un motivo (es. per Sgrosso: bambini, animali, ecc.)." />
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-amber-100/50">
                      <input
                        type="checkbox"
                        checked={formData.requiresRating}
                        onChange={(e) => setFormData({ ...formData, requiresRating: e.target.checked })}
                        className="w-4 h-4 text-amber-500 rounded"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">Richiede valutazione</span>
                        <InfoTooltip text="L'operatore deve dare una valutazione della proprietà al termine del servizio." />
                      </div>
                    </label>
                  </div>
                </div>

                {/* ─── SEZIONE: AUTOMAZIONE ─── */}
                <div className="bg-purple-50 rounded-xl p-4">
                  <h3 className="font-semibold text-purple-800 mb-3 flex items-center gap-2">
                    🤖 Automazione
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-purple-100/50">
                      <input
                        type="checkbox"
                        checked={formData.availableForManual}
                        onChange={(e) => setFormData({ ...formData, availableForManual: e.target.checked })}
                        className="w-4 h-4 text-purple-500 rounded"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">Creazione manuale</span>
                        <InfoTooltip text="Il servizio può essere creato manualmente da admin o proprietario." />
                      </div>
                    </label>
                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg cursor-pointer hover:bg-purple-100/50">
                      <input
                        type="checkbox"
                        checked={formData.availableForAuto}
                        onChange={(e) => setFormData({ ...formData, availableForAuto: e.target.checked })}
                        className="w-4 h-4 text-purple-500 rounded"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">Auto da iCal</span>
                        <InfoTooltip text="Il servizio può essere assegnato automaticamente dalla sincronizzazione iCal." />
                      </div>
                    </label>
                  </div>
                  <div className="mt-3">
                    <label className="flex items-center text-sm font-medium text-slate-700 mb-1">
                      Auto-assegna ogni N pulizie
                      <InfoTooltip text="Se > 0, questo servizio sostituisce automaticamente il servizio standard ogni N pulizie sulla stessa proprietà. Es: 5 = ogni 5 pulizie diventa Approfondita." />
                    </label>
                    <input
                      type="number"
                      value={formData.autoAssignEveryN}
                      onChange={(e) => setFormData({ ...formData, autoAssignEveryN: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      min="0"
                      placeholder="0 = disabilitato"
                    />
                  </div>
                </div>

                {/* ─── SEZIONE: ORDINAMENTO ─── */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    📊 Ordinamento
                  </h3>
                  <div>
                    <label className="flex items-center text-sm font-medium text-slate-700 mb-1">
                      Posizione nella lista
                      <InfoTooltip text="Numero più basso = appare prima nella lista. I servizi base hanno 1, 2, 3. Usa numeri alti (es. 99) per i servizi extra." />
                    </label>
                    <input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 99 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      min="1"
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 font-medium"
              >
                {saving ? "⏳ Salvando..." : editingService ? "💾 Salva modifiche" : "✅ Crea servizio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
