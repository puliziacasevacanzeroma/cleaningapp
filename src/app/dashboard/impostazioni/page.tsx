"use client";

import { useState, useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { 
  useNotificationPreferences, 
  NOTIFICATION_TYPE_LABELS, 
  NOTIFICATION_CATEGORIES,
} from "~/hooks/useNotificationPreferences";

interface GhostCleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  operatorName: string | null;
  guestName: string | null;
  daysOverdue: number;
}

export default function ImpostazioniPage() {
  const { user } = useAuth();
  
  // Hook preferenze notifiche
  const {
    preferences,
    loading: preferencesLoading,
    saving: preferencesSaving,
    updateTypePreference,
    toggleGlobalToast,
    toggleGlobalSound,
    resetToDefaults,
  } = useNotificationPreferences();
  
  // Stati pulizia dati orfani
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{
    success: boolean;
    deleted?: { cleanings: number; orders: number; bookings: number; total: number };
    error?: string;
  } | null>(null);

  // Stati pulizie fantasma
  const [ghostCleanings, setGhostCleanings] = useState<GhostCleaning[]>([]);
  const [loadingGhosts, setLoadingGhosts] = useState(false);
  const [processingGhosts, setProcessingGhosts] = useState(false);
  const [ghostResult, setGhostResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
  } | null>(null);
  const [selectedGhosts, setSelectedGhosts] = useState<Set<string>>(new Set());

  // Stato espansione categorie notifiche
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Tab attiva su mobile
  const [activeTab, setActiveTab] = useState<'profilo' | 'notifiche' | 'manutenzione'>('profilo');

  // Carica pulizie fantasma all'avvio
  useEffect(() => {
    loadGhostCleanings();
  }, []);

  const loadGhostCleanings = async () => {
    setLoadingGhosts(true);
    try {
      const response = await fetch("/api/ghost-cleanings?days=30");
      const data = await response.json();
      if (data.success) {
        setGhostCleanings(data.cleanings || []);
      }
    } catch (error) {
      console.error("Errore caricamento pulizie fantasma:", error);
    } finally {
      setLoadingGhosts(false);
    }
  };

  const handleCleanOrphanedData = async () => {
    if (!confirm("⚠️ Attenzione!\n\nQuesta operazione eliminerà DEFINITIVAMENTE:\n- Pulizie di proprietà non più esistenti\n- Ordini biancheria di proprietà non più esistenti\n- Prenotazioni di proprietà non più esistenti\n\nL'operazione è IRREVERSIBILE.\n\nVuoi continuare?")) {
      return;
    }

    setCleaning(true);
    setCleanResult(null);

    try {
      const response = await fetch("/api/cleanup-orphaned", { method: "POST" });
      const data = await response.json();

      if (response.ok) {
        setCleanResult({ success: true, deleted: data.deleted });
      } else {
        setCleanResult({ success: false, error: data.error || "Errore durante la pulizia" });
      }
    } catch (error) {
      setCleanResult({ success: false, error: "Errore di connessione" });
    } finally {
      setCleaning(false);
    }
  };

  const handleGhostAction = async (action: "complete" | "cancel" | "delete", ids?: string[]) => {
    const actionText = action === "complete" ? "completare" : action === "cancel" ? "annullare" : "eliminare";
    const targetIds = ids || Array.from(selectedGhosts);
    const count = targetIds.length || ghostCleanings.length;

    if (!confirm(`⚠️ Stai per ${actionText} ${count} pulizie.\n\nVuoi continuare?`)) {
      return;
    }

    setProcessingGhosts(true);
    setGhostResult(null);

    try {
      const response = await fetch("/api/ghost-cleanings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cleaningIds: targetIds.length > 0 ? targetIds : undefined }),
      });

      const data = await response.json();

      if (response.ok) {
        setGhostResult({ success: true, message: data.message });
        await loadGhostCleanings();
        setSelectedGhosts(new Set());
      } else {
        setGhostResult({ success: false, error: data.error });
      }
    } catch (error) {
      setGhostResult({ success: false, error: "Errore di connessione" });
    } finally {
      setProcessingGhosts(false);
    }
  };

  const handleSingleGhostAction = async (cleaningId: string, action: "complete" | "cancel" | "delete") => {
    setProcessingGhosts(true);
    try {
      const response = await fetch("/api/ghost-cleanings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleaningId, action }),
      });

      if (response.ok) {
        await loadGhostCleanings();
      }
    } catch (error) {
      console.error("Errore:", error);
    } finally {
      setProcessingGhosts(false);
    }
  };

  const toggleGhostSelection = (id: string) => {
    const newSelected = new Set(selectedGhosts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedGhosts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedGhosts.size === ghostCleanings.length) {
      setSelectedGhosts(new Set());
    } else {
      setSelectedGhosts(new Set(ghostCleanings.map(g => g.id)));
    }
  };

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  // Toggle compatto
  const Toggle = ({ checked, onChange, disabled = false }: { checked: boolean; onChange: (val: boolean) => void; disabled?: boolean }) => (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-6 rounded-full transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-sky-500' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`} />
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <h1 className="text-xl font-bold text-slate-800">Impostazioni</h1>
        <p className="text-sm text-slate-500">Gestisci il tuo account</p>
      </div>

      {/* Tab Navigation Mobile */}
      <div className="bg-white border-b border-slate-200 px-2 py-2 flex gap-1 overflow-x-auto lg:hidden">
        <button
          onClick={() => setActiveTab('profilo')}
          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'profilo' ? 'bg-sky-100 text-sky-700' : 'text-slate-600'
          }`}
        >
          👤 Profilo
        </button>
        <button
          onClick={() => setActiveTab('notifiche')}
          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'notifiche' ? 'bg-sky-100 text-sky-700' : 'text-slate-600'
          }`}
        >
          🔔 Notifiche
        </button>
        <button
          onClick={() => setActiveTab('manutenzione')}
          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
            activeTab === 'manutenzione' ? 'bg-amber-100 text-amber-700' : 'text-slate-600'
          }`}
        >
          🔧 Manutenzione
          {ghostCleanings.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {ghostCleanings.length}
            </span>
          )}
        </button>
      </div>

      <div className="p-4 max-w-4xl mx-auto">

        {/* ==================== CONFIGURAZIONE ADMIN ==================== */}
        {user?.role === 'ADMIN' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <h2 className="text-lg font-bold text-slate-800 mb-4">⚙️ Configurazione Sistema</h2>
            <p className="text-sm text-slate-500 mb-4">Gestisci le impostazioni globali dell&apos;applicazione</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Festività */}
              <a 
                href="/dashboard/impostazioni/festivita"
                className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-sky-300 hover:bg-sky-50 transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  🎄
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Festività</p>
                  <p className="text-xs text-slate-500">Maggiorazioni giorni festivi</p>
                </div>
                <svg className="w-5 h-5 text-slate-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Tipi di Servizio */}
              <a 
                href="/dashboard/impostazioni/servizi"
                className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-sky-300 hover:bg-sky-50 transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  🧹
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Tipi di Servizio</p>
                  <p className="text-xs text-slate-500">Standard, Approfondita, Sgrosso</p>
                </div>
                <svg className="w-5 h-5 text-slate-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Durate Automatiche */}
              <a 
                href="/dashboard/impostazioni/durate-automatiche"
                className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50 transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  📊
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Durate Automatiche</p>
                  <p className="text-xs text-slate-500">Stime basate su dati reali</p>
                </div>
                <svg className="w-5 h-5 text-slate-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        )}
        
        {/* ==================== PROFILO ==================== */}
        {(activeTab === 'profilo' || typeof window !== 'undefined' && window.innerWidth >= 1024) && (
          <div className={`bg-white rounded-xl border border-slate-200 p-4 mb-4 ${activeTab !== 'profilo' ? 'hidden lg:block' : ''}`}>
            <h2 className="text-lg font-bold text-slate-800 mb-4">👤 Profilo</h2>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
                <span className="text-xl font-bold text-white">
                  {user?.name?.split(" ").map((n: string) => n[0]).join("") || "U"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{user?.name || "Utente"}</p>
                <p className="text-sm text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Nome</label>
                <input
                  type="text"
                  defaultValue={user?.name || ""}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  defaultValue={user?.email || ""}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Telefono</label>
                <input
                  type="tel"
                  placeholder="+39 123 456 7890"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            </div>

            <button className="mt-4 w-full py-2.5 bg-sky-500 text-white rounded-lg font-medium text-sm">
              Salva modifiche
            </button>
          </div>
        )}

        {/* ==================== NOTIFICHE ==================== */}
        {(activeTab === 'notifiche' || typeof window !== 'undefined' && window.innerWidth >= 1024) && (
          <div className={`bg-white rounded-xl border border-slate-200 p-4 mb-4 ${activeTab !== 'notifiche' ? 'hidden lg:block' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">🔔 Notifiche</h2>
              {preferencesSaving && (
                <span className="text-xs text-sky-600">Salvataggio...</span>
              )}
            </div>

            {preferencesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500"></div>
              </div>
            ) : preferences && (
              <div className="space-y-4">
                {/* Impostazioni Globali */}
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                  <p className="font-semibold text-slate-800 text-sm mb-3">⚙️ Globali</p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Popup Toast</span>
                      <Toggle 
                        checked={preferences.globalToastEnabled} 
                        onChange={toggleGlobalToast}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">Suoni</span>
                      <Toggle 
                        checked={preferences.globalSoundEnabled} 
                        onChange={toggleGlobalSound}
                      />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg">
                  🔔 Le notifiche nella campanella sono sempre attive. Qui gestisci i popup e i suoni.
                </p>

                {/* Categorie */}
                <div className="space-y-2">
                  {NOTIFICATION_CATEGORIES.map((category) => (
                    <div key={category.id} className="border border-slate-200 rounded-lg overflow-hidden">
                      {/* Header */}
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 text-left"
                      >
                        <span className="font-medium text-slate-800 text-sm">
                          {category.icon} {category.id}
                        </span>
                        <svg 
                          className={`w-4 h-4 text-slate-400 transition-transform ${expandedCategories.has(category.id) ? 'rotate-180' : ''}`} 
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Tipi */}
                      {expandedCategories.has(category.id) && (
                        <div className="divide-y divide-slate-100">
                          {category.types.map((type) => {
                            const typeInfo = NOTIFICATION_TYPE_LABELS[type];
                            const typePref = preferences.types[type as keyof typeof preferences.types] || { enabled: true, showToast: true, playSound: true };
                            
                            return (
                              <div key={type} className="p-3">
                                <p className="text-sm font-medium text-slate-700 mb-2">
                                  {typeInfo?.icon} {typeInfo?.label || type}
                                </p>
                                <div className="flex items-center gap-4">
                                  <label className="flex items-center gap-2">
                                    <Toggle 
                                      checked={typePref.showToast}
                                      onChange={(val) => updateTypePreference(type as any, 'showToast', val)}
                                      disabled={!preferences.globalToastEnabled}
                                    />
                                    <span className="text-xs text-slate-500">Popup</span>
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <Toggle 
                                      checked={typePref.playSound}
                                      onChange={(val) => updateTypePreference(type as any, 'playSound', val)}
                                      disabled={!preferences.globalSoundEnabled}
                                    />
                                    <span className="text-xs text-slate-500">Suono</span>
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Reset */}
                <button
                  onClick={() => confirm('Ripristinare le impostazioni predefinite?') && resetToDefaults()}
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-700"
                >
                  Ripristina predefinite
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== MANUTENZIONE ==================== */}
        {(activeTab === 'manutenzione' || typeof window !== 'undefined' && window.innerWidth >= 1024) && (
          <div className={`bg-white rounded-xl border border-slate-200 p-4 ${activeTab !== 'manutenzione' ? 'hidden lg:block' : ''}`}>
            <h2 className="text-lg font-bold text-slate-800 mb-4">🔧 Manutenzione</h2>

            {/* Pulizie Fantasma */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-slate-800 text-sm">👻 Pulizie Fantasma</p>
                <button 
                  onClick={loadGhostCleanings} 
                  disabled={loadingGhosts}
                  className="text-xs text-purple-600"
                >
                  {loadingGhosts ? "..." : "🔄"}
                </button>
              </div>

              {ghostResult && (
                <div className={`mb-3 p-2 rounded-lg text-xs ${ghostResult.success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {ghostResult.success ? '✅' : '❌'} {ghostResult.message || ghostResult.error}
                </div>
              )}

              {loadingGhosts ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mx-auto"></div>
                </div>
              ) : ghostCleanings.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">✨ Nessuna pulizia fantasma</p>
              ) : (
                <>
                  <div className="flex gap-2 mb-3">
                    <button 
                      onClick={() => handleGhostAction("complete")} 
                      disabled={processingGhosts}
                      className="flex-1 py-2 bg-emerald-500 text-white text-xs rounded-lg"
                    >
                      ✓ Completa
                    </button>
                    <button 
                      onClick={() => handleGhostAction("delete")} 
                      disabled={processingGhosts}
                      className="flex-1 py-2 bg-red-500 text-white text-xs rounded-lg"
                    >
                      🗑 Elimina
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {ghostCleanings.map((ghost) => (
                      <div key={ghost.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                        <input 
                          type="checkbox" 
                          checked={selectedGhosts.has(ghost.id)} 
                          onChange={() => toggleGhostSelection(ghost.id)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{ghost.propertyName}</p>
                          <p className="text-xs text-slate-500">{formatDate(ghost.scheduledDate)} • {ghost.daysOverdue}g fa</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Dati Orfani */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="font-semibold text-slate-800 text-sm mb-2">🗑️ Dati Orfani</p>
              <p className="text-xs text-slate-600 mb-3">Elimina record di proprietà non più esistenti</p>

              {cleanResult && (
                <div className={`mb-3 p-2 rounded-lg text-xs ${cleanResult.success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {cleanResult.success ? (
                    <span>✅ Eliminati: {cleanResult.deleted?.total || 0} record</span>
                  ) : (
                    <span>❌ {cleanResult.error}</span>
                  )}
                </div>
              )}

              <button
                onClick={handleCleanOrphanedData}
                disabled={cleaning}
                className="w-full py-2 bg-amber-500 text-white text-sm rounded-lg font-medium disabled:opacity-50"
              >
                {cleaning ? "Pulizia in corso..." : "Avvia pulizia"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
