"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";

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
    code: "STANDARD" as "STANDARD" | "APPROFONDITA" | "SGROSSO",
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
    } catch (err) {
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

  // ─── REDIRECT SE NON ADMIN ───
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "ADMIN")) {
      router.push("/dashboard");
    }
  }, [authLoading, user, router]);

  // ─── SEED SERVIZI PREDEFINITI ───
  const handleSeed = async () => {
    if (!confirm("Vuoi creare i tipi di servizio predefiniti (Standard, Approfondita, Sgrosso)?")) return;

    try {
      setSaving(true);
      const response = await fetch("/api/service-types", { method: "PUT" });
      const data = await response.json();

      if (response.ok) {
        setSuccess(`✅ ${data.created} tipi servizio creati!`);
        loadServiceTypes();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Errore seed");
    } finally {
      setSaving(false);
    }
  };

  // ─── TOGGLE ATTIVO ───
  const handleToggleActive = async (service: ServiceType) => {
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
    } catch (err) {
      setError("Errore aggiornamento");
    }
  };

  // ─── ELIMINA SERVIZIO ───
  const handleDelete = async (service: ServiceType) => {
    const action = confirm(
      `Vuoi disattivare o eliminare definitivamente "${service.name}"?\n\n` +
      `OK = Disattiva (consigliato)\nAnnulla poi premi Elimina = Elimina definitivamente`
    );
    
    try {
      const url = action 
        ? `/api/service-types/${service.id}` 
        : `/api/service-types/${service.id}?force=true`;
      
      const response = await fetch(url, { method: "DELETE" });

      if (response.ok) {
        if (action) {
          setServiceTypes(prev =>
            prev.map(s => (s.id === service.id ? { ...s, isActive: false } : s))
          );
          setSuccess("Servizio disattivato");
        } else {
          setServiceTypes(prev => prev.filter(s => s.id !== service.id));
          setSuccess("Servizio eliminato");
        }
      } else {
        const data = await response.json();
        setError(data.error);
      }
    } catch (err) {
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
        code: service.code as any,
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
        code: "STANDARD",
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
    } catch (err) {
      setError("Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // ─── FILTRA PER TAB ───
  const filteredServices = serviceTypes.filter(s => {
    if (activeTab === "all") return true;
    if (activeTab === "pulizie") return ["STANDARD", "APPROFONDITA", "SGROSSO"].includes(s.code);
    if (activeTab === "extra") return !["STANDARD", "APPROFONDITA", "SGROSSO"].includes(s.code);
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
            + Nuovo servizio
          </button>
        </div>
      </div>

      {/* ─── MESSAGGI ─── */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
          ❌ {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2 font-bold">×</button>
        </div>
      )}

      {/* ─── TABS ─── */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {[
          { id: "all", label: "📋 Tutti", count: serviceTypes.length },
          { id: "pulizie", label: "🧹 Pulizie", count: serviceTypes.filter(s => ["STANDARD", "APPROFONDITA", "SGROSSO"].includes(s.code)).length },
          { id: "extra", label: "✨ Extra", count: serviceTypes.filter(s => !["STANDARD", "APPROFONDITA", "SGROSSO"].includes(s.code)).length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
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
          {filteredServices.map(service => (
            <div
              key={service.id}
              className={`bg-white rounded-xl border border-slate-200 p-4 ${
                !service.isActive ? "opacity-50" : ""
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
                      {service.baseSurcharge > 0 ? `+€${service.baseSurcharge}` : "Base"}
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
                  {service.autoAssignEveryN && (
                    <div className="text-center">
                      <div className="font-semibold text-purple-600">ogni {service.autoAssignEveryN}</div>
                      <div className="text-xs text-slate-500">Auto</div>
                    </div>
                  )}
                </div>

                {/* Azioni */}
                <div className="flex items-center gap-3 lg:ml-4">
                  <button
                    onClick={() => handleToggleActive(service)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      service.isActive ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        service.isActive ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => openModal(service)}
                    className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(service)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
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
                  <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs">
                    📝 Richiede motivo
                  </span>
                )}
                {service.requiresManualPrice && (
                  <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs">
                    💰 Prezzo manuale
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL CREA/MODIFICA */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">
                {editingService ? "✏️ Modifica Servizio" : "➕ Nuovo Tipo Servizio"}
              </h2>
            </div>

            <div className="p-4 space-y-4">
              {/* Row 1: Nome e Codice */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nome *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                    placeholder="es. Pulizia Standard"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Codice *
                  </label>
                  <select
                    value={formData.code}
                    onChange={e => setFormData(prev => ({ ...prev, code: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                    disabled={!!editingService}
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="APPROFONDITA">APPROFONDITA</option>
                    <option value="SGROSSO">SGROSSO</option>
                  </select>
                </div>
              </div>

              {/* Descrizione */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Descrizione
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 resize-none"
                  rows={2}
                />
              </div>

              {/* Row 2: Icona, Colore, Ordine */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Icona
                  </label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={e => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-center text-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Colore
                  </label>
                  <input
                    type="color"
                    value={formData.color}
                    onChange={e => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full h-10 border border-slate-300 rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Ordine
                  </label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={e => setFormData(prev => ({ ...prev, sortOrder: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Row 3: Durata, Foto, Sovrapprezzo */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Durata (min)
                  </label>
                  <input
                    type="number"
                    value={formData.estimatedDuration}
                    onChange={e => setFormData(prev => ({ ...prev, estimatedDuration: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Foto minime
                  </label>
                  <input
                    type="number"
                    value={formData.minPhotosRequired}
                    onChange={e => setFormData(prev => ({ ...prev, minPhotosRequired: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Sovrapprezzo €
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.baseSurcharge}
                    onChange={e => setFormData(prev => ({ ...prev, baseSurcharge: parseFloat(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Auto-assign */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Auto-assegna ogni N pulizie (0 = disattivato)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.autoAssignEveryN}
                  onChange={e => setFormData(prev => ({ ...prev, autoAssignEveryN: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  placeholder="es. 5 per ogni 5 pulizie"
                />
              </div>

              {/* Checkbox flags */}
              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-700 mb-3">Opzioni</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "availableForManual", label: "✋ Creazione manuale" },
                    { key: "availableForAuto", label: "🤖 Auto da iCal" },
                    { key: "clientCanRequest", label: "👤 Cliente può richiedere" },
                    { key: "requiresApproval", label: "✅ Richiede approvazione" },
                    { key: "requiresRating", label: "⭐ Richiede valutazione" },
                    { key: "requiresReason", label: "📝 Richiede motivo" },
                    { key: "requiresManualPrice", label: "💰 Prezzo manuale" },
                    { key: "adminOnly", label: "🔒 Solo admin" },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={(formData as any)[opt.key]}
                        onChange={e =>
                          setFormData(prev => ({ ...prev, [opt.key]: e.target.checked }))
                        }
                        className="w-4 h-4 text-sky-600 rounded"
                      />
                      <span className="text-sm text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium"
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-sky-500 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {saving ? "Salvataggio..." : editingService ? "Aggiorna" : "Crea"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
