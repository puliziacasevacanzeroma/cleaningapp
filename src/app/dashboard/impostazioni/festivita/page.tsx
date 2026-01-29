"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Holiday {
  id: string;
  name: string;
  date: string | null;
  type: string;
  isRecurring: boolean;
  recurringMonth?: number;
  recurringDay?: number;
  surchargeType: "percentage" | "fixed";
  surchargePercentage?: number;
  surchargeFixed?: number;
  appliesToAllServices: boolean;
  applicableServiceTypes?: string[];
  isActive: boolean;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

export default function FestivitaPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Stati
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [formData, setFormData] = useState({
    name: "",
    type: "national",
    isRecurring: true,
    recurringMonth: 1,
    recurringDay: 1,
    date: "",
    surchargeType: "percentage" as "percentage" | "fixed",
    surchargePercentage: 50,
    surchargeFixed: 20,
    appliesToAllServices: true,
    notes: "",
  });

  // ─── CARICA FESTIVITÀ ───
  const loadHolidays = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/holidays");
      const data = await response.json();

      if (response.ok) {
        setHolidays(data.holidays || []);
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
      loadHolidays();
    }
  }, [authLoading, user, loadHolidays]);

  // ─── REDIRECT SE NON ADMIN ───
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "ADMIN")) {
      router.push("/dashboard");
    }
  }, [authLoading, user, router]);

  // ─── SEED FESTIVITÀ ITALIANE ───
  const handleSeed = async () => {
    if (!confirm("Vuoi popolare il database con le festività italiane predefinite?")) return;

    try {
      setSaving(true);
      const response = await fetch("/api/holidays", { method: "PUT" });
      const data = await response.json();

      if (response.ok) {
        setSuccess(`✅ ${data.created} festività create!`);
        loadHolidays();
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
  const handleToggleActive = async (holiday: Holiday) => {
    try {
      const response = await fetch(`/api/holidays/${holiday.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !holiday.isActive }),
      });

      if (response.ok) {
        setHolidays(prev =>
          prev.map(h => (h.id === holiday.id ? { ...h, isActive: !h.isActive } : h))
        );
      }
    } catch (err) {
      setError("Errore aggiornamento");
    }
  };

  // ─── ELIMINA FESTIVITÀ ───
  const handleDelete = async (holiday: Holiday) => {
    if (!confirm(`Eliminare "${holiday.name}"?`)) return;

    try {
      const response = await fetch(`/api/holidays/${holiday.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setHolidays(prev => prev.filter(h => h.id !== holiday.id));
        setSuccess("Festività eliminata");
      } else {
        const data = await response.json();
        setError(data.error);
      }
    } catch (err) {
      setError("Errore eliminazione");
    }
  };

  // ─── APRI MODAL ───
  const openModal = (holiday?: Holiday) => {
    if (holiday) {
      setEditingHoliday(holiday);
      setFormData({
        name: holiday.name || "",
        type: holiday.type || "national",
        isRecurring: holiday.isRecurring ?? true,
        recurringMonth: holiday.recurringMonth ?? 1,
        recurringDay: holiday.recurringDay ?? 1,
        date: holiday.date ? new Date(holiday.date).toISOString().split("T")[0] : "",
        surchargeType: holiday.surchargeType || "percentage",
        surchargePercentage: holiday.surchargePercentage ?? 50,
        surchargeFixed: holiday.surchargeFixed ?? 20,
        appliesToAllServices: holiday.appliesToAllServices ?? true,
        notes: holiday.notes || "",
      });
    } else {
      setEditingHoliday(null);
      setFormData({
        name: "",
        type: "national",
        isRecurring: true,
        recurringMonth: 1,
        recurringDay: 1,
        date: "",
        surchargeType: "percentage",
        surchargePercentage: 50,
        surchargeFixed: 20,
        appliesToAllServices: true,
        notes: "",
      });
    }
    setShowModal(true);
  };

  // ─── SALVA FESTIVITÀ ───
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError("Nome obbligatorio");
      return;
    }

    if (formData.isRecurring && (!formData.recurringMonth || !formData.recurringDay)) {
      setError("Mese e giorno obbligatori per festività ricorrenti");
      return;
    }

    if (!formData.isRecurring && !formData.date) {
      setError("Data obbligatoria per festività non ricorrenti");
      return;
    }

    try {
      setSaving(true);
      
      const payload = {
        name: formData.name,
        type: formData.type,
        isRecurring: formData.isRecurring,
        ...(formData.isRecurring
          ? { recurringMonth: formData.recurringMonth, recurringDay: formData.recurringDay }
          : { date: formData.date }),
        surchargeType: formData.surchargeType,
        ...(formData.surchargeType === "percentage"
          ? { surchargePercentage: formData.surchargePercentage }
          : { surchargeFixed: formData.surchargeFixed }),
        appliesToAllServices: formData.appliesToAllServices,
        notes: formData.notes,
      };

      const url = editingHoliday ? `/api/holidays/${editingHoliday.id}` : "/api/holidays";
      const method = editingHoliday ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(editingHoliday ? "Festività aggiornata" : "Festività creata");
        setShowModal(false);
        loadHolidays();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // ─── FORMATTA DATA ───
  const formatDate = (holiday: Holiday) => {
    if (holiday.isRecurring) {
      const months = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
      return `${holiday.recurringDay} ${months[holiday.recurringMonth || 0]}`;
    }
    if (holiday.date) {
      return new Date(holiday.date).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
      });
    }
    return "-";
  };

  // ─── FORMATTA MAGGIORAZIONE ───
  const formatSurcharge = (holiday: Holiday) => {
    if (holiday.surchargeType === "percentage") {
      return `+${holiday.surchargePercentage}%`;
    }
    return `+€${holiday.surchargeFixed}`;
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
          <h1 className="text-2xl font-bold text-slate-800">🎄 Gestione Festività</h1>
          <p className="text-slate-500 text-sm mt-1">
            Configura le maggiorazioni per i giorni festivi
          </p>
        </div>

        <div className="flex gap-2">
          {holidays.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={saving}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-medium"
            >
              🇮🇹 Carica festività italiane
            </button>
          )}
          <button
            onClick={() => openModal()}
            className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 text-sm font-medium"
          >
            + Aggiungi festività
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

      {/* ─── LISTA FESTIVITÀ ─── */}
      {holidays.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 mb-4">Nessuna festività configurata</p>
          <button
            onClick={handleSeed}
            disabled={saving}
            className="px-6 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium"
          >
            🇮🇹 Carica festività italiane predefinite
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Nome</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Data</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Tipo</th>
                  <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Maggiorazione</th>
                  <th className="text-center px-4 py-3 text-sm font-semibold text-slate-600">Attiva</th>
                  <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.map(holiday => (
                  <tr key={holiday.id} className={!holiday.isActive ? "opacity-50 bg-slate-50" : ""}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{holiday.name}</div>
                      {holiday.isRecurring && (
                        <div className="text-xs text-slate-500">🔄 Ricorrente</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(holiday)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        holiday.type === "national" ? "bg-red-100 text-red-700" :
                        holiday.type === "regional" ? "bg-orange-100 text-orange-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {holiday.type === "national" ? "Nazionale" :
                         holiday.type === "regional" ? "Regionale" :
                         holiday.type === "local" ? "Locale" :
                         holiday.type === "special" ? "Speciale" : "Personalizzato"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-emerald-600">{formatSurcharge(holiday)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(holiday)}
                        className={`w-12 h-6 rounded-full transition-colors ${
                          holiday.isActive ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          holiday.isActive ? "translate-x-6" : "translate-x-0.5"
                        }`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openModal(holiday)}
                        className="text-sky-600 hover:text-sky-800 mr-3"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(holiday)}
                        className="text-red-600 hover:text-red-800"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden divide-y divide-slate-100">
            {holidays.map(holiday => (
              <div key={holiday.id} className={`p-4 ${!holiday.isActive ? "opacity-50 bg-slate-50" : ""}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium text-slate-800">{holiday.name}</div>
                    <div className="text-sm text-slate-500">{formatDate(holiday)}</div>
                  </div>
                  <button
                    onClick={() => handleToggleActive(holiday)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      holiday.isActive ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      holiday.isActive ? "translate-x-6" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-emerald-600">{formatSurcharge(holiday)}</span>
                    {holiday.isRecurring && <span className="text-xs text-slate-500">🔄</span>}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => openModal(holiday)}
                      className="text-sky-600"
                    >
                      ✏️ Modifica
                    </button>
                    <button
                      onClick={() => handleDelete(holiday)}
                      className="text-red-600"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL CREA/MODIFICA */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">
                {editingHoliday ? "✏️ Modifica Festività" : "➕ Nuova Festività"}
              </h2>
            </div>

            <div className="p-4 space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nome festività *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  placeholder="es. Natale"
                />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tipo
                </label>
                <select
                  value={formData.type}
                  onChange={e => setFormData(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                >
                  <option value="national">🇮🇹 Nazionale</option>
                  <option value="regional">📍 Regionale</option>
                  <option value="local">🏘️ Locale</option>
                  <option value="special">⭐ Speciale</option>
                  <option value="custom">📝 Personalizzato</option>
                </select>
              </div>

              {/* Ricorrente */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isRecurring"
                  checked={formData.isRecurring}
                  onChange={e => setFormData(prev => ({ ...prev, isRecurring: e.target.checked }))}
                  className="w-4 h-4 text-sky-600"
                />
                <label htmlFor="isRecurring" className="text-sm text-slate-700">
                  🔄 Ricorrente ogni anno
                </label>
              </div>

              {/* Data */}
              {formData.isRecurring ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Giorno
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.recurringDay || ""}
                      onChange={e => setFormData(prev => ({ ...prev, recurringDay: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Mese
                    </label>
                    <select
                      value={formData.recurringMonth}
                      onChange={e => setFormData(prev => ({ ...prev, recurringMonth: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                    >
                      <option value={1}>Gennaio</option>
                      <option value={2}>Febbraio</option>
                      <option value={3}>Marzo</option>
                      <option value={4}>Aprile</option>
                      <option value={5}>Maggio</option>
                      <option value={6}>Giugno</option>
                      <option value={7}>Luglio</option>
                      <option value={8}>Agosto</option>
                      <option value={9}>Settembre</option>
                      <option value={10}>Ottobre</option>
                      <option value={11}>Novembre</option>
                      <option value={12}>Dicembre</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Data specifica
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              )}

              {/* Maggiorazione */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tipo maggiorazione
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, surchargeType: "percentage" }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                      formData.surchargeType === "percentage"
                        ? "bg-sky-500 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    % Percentuale
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, surchargeType: "fixed" }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                      formData.surchargeType === "fixed"
                        ? "bg-sky-500 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    € Fisso
                  </button>
                </div>
                {formData.surchargeType === "percentage" ? (
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={formData.surchargePercentage ?? ""}
                      onChange={e => setFormData(prev => ({ ...prev, surchargePercentage: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">€</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={formData.surchargeFixed ?? ""}
                      onChange={e => setFormData(prev => ({ ...prev, surchargeFixed: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 pl-8"
                    />
                  </div>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Note (opzionale)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 resize-none"
                  rows={2}
                  placeholder="es. Data mobile - aggiornare ogni anno"
                />
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
                {saving ? "Salvataggio..." : editingHoliday ? "Aggiorna" : "Crea"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
