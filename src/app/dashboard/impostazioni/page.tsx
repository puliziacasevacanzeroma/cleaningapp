"use client";

import { useState, useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { 
  useNotificationPreferences, 
  NOTIFICATION_TYPE_LABELS, 
  NOTIFICATION_CATEGORIES,
  type NotificationPreferences 
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
    savePreferences,
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Pulizie']));

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
      const response = await fetch("/api/cleanup-orphaned", {
        method: "POST",
      });

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
        body: JSON.stringify({ 
          action, 
          cleaningIds: targetIds.length > 0 ? targetIds : undefined 
        }),
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

  // Toggle switch component
  const Toggle = ({ checked, onChange, disabled = false }: { checked: boolean; onChange: (val: boolean) => void; disabled?: boolean }) => (
    <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <input 
        type="checkbox" 
        checked={checked} 
        onChange={(e) => !disabled && onChange(e.target.checked)} 
        className="sr-only peer" 
        disabled={disabled}
      />
      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
    </label>
  );

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Impostazioni</h1>
        <p className="text-slate-500 mt-1">Gestisci le impostazioni del tuo account</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
            <nav className="p-2">
              <a href="#profilo" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profilo
              </a>
              <a href="#notifiche" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-sky-50 text-sky-600 font-medium">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Notifiche
              </a>
              <a href="#sicurezza" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Sicurezza
              </a>
              <a href="#manutenzione" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Manutenzione
                {ghostCleanings.length > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {ghostCleanings.length}
                  </span>
                )}
              </a>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Section */}
          <div id="profilo" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Informazioni Profilo</h2>
            
            <div className="flex items-center gap-4 mb-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-lg">
                <span className="text-2xl font-bold text-white">
                  {user?.name?.split(" ").map((n: string) => n[0]).join("") || "U"}
                </span>
              </div>
              <div>
                <button className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition-colors text-sm">
                  Cambia foto
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Nome</label>
                <input
                  type="text"
                  defaultValue={user?.name || ""}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Email</label>
                <input
                  type="email"
                  defaultValue={user?.email || ""}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Telefono</label>
                <input
                  type="tel"
                  placeholder="+39 123 456 7890"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Ruolo</label>
                <input
                  type="text"
                  defaultValue={user?.role || ""}
                  disabled
                  className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-sky-500/30 transition-all">
                Salva modifiche
              </button>
            </div>
          </div>

          {/* 🔔 NOTIFICATIONS SECTION - NUOVA */}
          <div id="notifiche" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Preferenze Notifiche</h2>
                <p className="text-sm text-slate-500 mt-1">Scegli quali notifiche ricevere e come</p>
              </div>
              {preferencesSaving && (
                <span className="text-xs text-sky-600 flex items-center gap-1">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Salvataggio...
                </span>
              )}
            </div>

            {preferencesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
              </div>
            ) : preferences && (
              <>
                {/* Impostazioni Globali */}
                <div className="p-4 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-xl mb-6">
                  <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="text-xl">⚙️</span>
                    Impostazioni Globali
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Toast Popup Globale */}
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium text-slate-800">Notifiche Popup (Toast)</p>
                        <p className="text-sm text-slate-500">Mostra popup temporanei in alto a destra</p>
                      </div>
                      <Toggle 
                        checked={preferences.globalToastEnabled} 
                        onChange={toggleGlobalToast}
                      />
                    </div>

                    {/* Suoni Globale */}
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium text-slate-800">Suoni Notifica</p>
                        <p className="text-sm text-slate-500">Riproduci un suono per le nuove notifiche</p>
                      </div>
                      <Toggle 
                        checked={preferences.globalSoundEnabled} 
                        onChange={toggleGlobalSound}
                      />
                    </div>
                  </div>
                </div>

                {/* Nota: Campanella sempre attiva */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-6 text-sm">
                  <p className="text-amber-800">
                    <span className="font-semibold">🔔 Nota:</span> Le notifiche nella campanella sono sempre attive. 
                    Qui puoi scegliere se ricevere anche i popup toast per ogni tipo di notifica.
                  </p>
                </div>

                {/* Categorie Notifiche */}
                <div className="space-y-4">
                  {NOTIFICATION_CATEGORIES.map((category) => (
                    <div key={category.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* Header Categoria */}
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{category.icon}</span>
                          <span className="font-semibold text-slate-800">{category.id}</span>
                          <span className="text-xs text-slate-500">({category.types.length} tipi)</span>
                        </div>
                        <svg 
                          className={`w-5 h-5 text-slate-400 transition-transform ${expandedCategories.has(category.id) ? 'rotate-180' : ''}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Tipi di Notifica */}
                      {expandedCategories.has(category.id) && (
                        <div className="divide-y divide-slate-100">
                          {category.types.map((type) => {
                            const typeInfo = NOTIFICATION_TYPE_LABELS[type];
                            const typePref = preferences.types[type as keyof typeof preferences.types] || { enabled: true, showToast: true, playSound: true };
                            
                            return (
                              <div key={type} className="px-4 py-3 hover:bg-slate-50">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-3 flex-1">
                                    <span className="text-lg mt-0.5">{typeInfo?.icon || '🔔'}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-slate-800 text-sm">{typeInfo?.label || type}</p>
                                      <p className="text-xs text-slate-500 mt-0.5">{typeInfo?.description || ''}</p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 flex-shrink-0">
                                    {/* Toast Toggle */}
                                    <div className="flex flex-col items-center gap-1">
                                      <span className="text-[10px] text-slate-400 uppercase tracking-wide">Popup</span>
                                      <Toggle 
                                        checked={typePref.showToast}
                                        onChange={(val) => updateTypePreference(type as any, 'showToast', val)}
                                        disabled={!preferences.globalToastEnabled}
                                      />
                                    </div>
                                    
                                    {/* Sound Toggle */}
                                    <div className="flex flex-col items-center gap-1">
                                      <span className="text-[10px] text-slate-400 uppercase tracking-wide">Suono</span>
                                      <Toggle 
                                        checked={typePref.playSound}
                                        onChange={(val) => updateTypePreference(type as any, 'playSound', val)}
                                        disabled={!preferences.globalSoundEnabled}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Reset Button */}
                <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => {
                      if (confirm('Sei sicuro di voler ripristinare le impostazioni predefinite?')) {
                        resetToDefaults();
                      }
                    }}
                    className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Ripristina impostazioni predefinite
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Security Section */}
          <div id="sicurezza" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Sicurezza</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Password attuale</label>
                <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Nuova password</label>
                <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">Conferma password</label>
                <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all" />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all">
                Cambia password
              </button>
            </div>
          </div>

          {/* 🔥 SEZIONE MANUTENZIONE DATABASE */}
          <div id="manutenzione" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Manutenzione Database</h2>
            <p className="text-sm text-slate-500 mb-6">Strumenti per la manutenzione e pulizia del database</p>
            
            <div className="space-y-6">
              
              {/* 👻 PULIZIE FANTASMA */}
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <span className="text-xl">👻</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-800">Pulizie Fantasma</h3>
                      <button onClick={loadGhostCleanings} disabled={loadingGhosts} className="text-purple-600 hover:text-purple-700 text-sm font-medium">
                        {loadingGhosts ? "Caricamento..." : "🔄 Aggiorna"}
                      </button>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">Pulizie passate ancora in stato "da fare" o "in corso"</p>
                  </div>
                </div>

                {ghostResult && (
                  <div className={`mb-4 p-3 rounded-lg ${ghostResult.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                    <p className={`text-sm ${ghostResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                      {ghostResult.success ? '✅' : '❌'} {ghostResult.message || ghostResult.error}
                    </p>
                  </div>
                )}

                {loadingGhosts ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                  </div>
                ) : ghostCleanings.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <span className="text-4xl mb-2 block">✨</span>
                    <p className="font-medium">Nessuna pulizia fantasma!</p>
                    <p className="text-sm">Tutto in ordine negli ultimi 30 giorni</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-purple-200">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={selectedGhosts.size === ghostCleanings.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
                        <span className="text-sm text-slate-600">{selectedGhosts.size > 0 ? `${selectedGhosts.size} selezionate` : "Seleziona tutte"}</span>
                      </label>
                      
                      <div className="flex gap-2">
                        <button onClick={() => handleGhostAction("complete")} disabled={processingGhosts} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50">
                          ✓ Completa {selectedGhosts.size > 0 ? `(${selectedGhosts.size})` : "tutte"}
                        </button>
                        <button onClick={() => handleGhostAction("cancel")} disabled={processingGhosts} className="px-3 py-1.5 bg-slate-500 text-white text-xs font-medium rounded-lg hover:bg-slate-600 disabled:opacity-50">
                          ✕ Annulla {selectedGhosts.size > 0 ? `(${selectedGhosts.size})` : "tutte"}
                        </button>
                        <button onClick={() => handleGhostAction("delete")} disabled={processingGhosts} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">
                          🗑 Elimina {selectedGhosts.size > 0 ? `(${selectedGhosts.size})` : "tutte"}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {ghostCleanings.map((ghost) => (
                        <div key={ghost.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${selectedGhosts.has(ghost.id) ? 'bg-purple-100 border-purple-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                          <input type="checkbox" checked={selectedGhosts.has(ghost.id)} onChange={() => toggleGhostSelection(ghost.id)} className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
                          
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 truncate">{ghost.propertyName}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>{formatDate(ghost.scheduledDate)}</span>
                              <span>•</span>
                              <span>{ghost.scheduledTime}</span>
                              {ghost.operatorName && (<><span>•</span><span>{ghost.operatorName}</span></>)}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${ghost.daysOverdue > 7 ? 'bg-red-100 text-red-700' : ghost.daysOverdue > 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                              {ghost.daysOverdue}g fa
                            </span>
                            
                            <div className="flex gap-1">
                              <button onClick={() => handleSingleGhostAction(ghost.id, "complete")} disabled={processingGhosts} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Marca come completata">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              </button>
                              <button onClick={() => handleSingleGhostAction(ghost.id, "cancel")} disabled={processingGhosts} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded" title="Annulla">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                              <button onClick={() => handleSingleGhostAction(ghost.id, "delete")} disabled={processingGhosts} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Elimina">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-slate-500 mt-3">
                      💡 <strong>Completa</strong> = marca come fatta | <strong>Annulla</strong> = non era necessaria | <strong>Elimina</strong> = rimuovi dal database
                    </p>
                  </>
                )}
              </div>

              {/* 🗑️ PULIZIA DATI ORFANI */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">Pulisci dati orfani</h3>
                    <p className="text-sm text-slate-600 mt-1">Elimina pulizie, ordini e prenotazioni che fanno riferimento a proprietà eliminate.</p>
                    <p className="text-xs text-amber-700 mt-2 font-medium">⚠️ Questa operazione è irreversibile</p>

                    {cleanResult && (
                      <div className={`mt-3 p-3 rounded-lg ${cleanResult.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                        {cleanResult.success ? (
                          <div>
                            <p className="text-emerald-700 font-medium text-sm">✅ Pulizia completata!</p>
                            <ul className="text-xs text-emerald-600 mt-1 space-y-0.5">
                              <li>• {cleanResult.deleted?.cleanings || 0} pulizie eliminate</li>
                              <li>• {cleanResult.deleted?.orders || 0} ordini eliminati</li>
                              <li>• {cleanResult.deleted?.bookings || 0} prenotazioni eliminate</li>
                              <li className="font-semibold pt-1 border-t border-emerald-200 mt-1">Totale: {cleanResult.deleted?.total || 0} record rimossi</li>
                            </ul>
                          </div>
                        ) : (
                          <p className="text-red-700 text-sm">❌ {cleanResult.error}</p>
                        )}
                      </div>
                    )}

                    <button onClick={handleCleanOrphanedData} disabled={cleaning} className={`mt-4 px-4 py-2 rounded-lg font-medium text-sm transition-all ${cleaning ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-amber-500 text-white hover:bg-amber-600 hover:shadow-lg hover:shadow-amber-500/30'}`}>
                      {cleaning ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                          Pulizia in corso...
                        </span>
                      ) : 'Avvia pulizia dati orfani'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <h4 className="font-medium text-slate-700 text-sm mb-2">ℹ️ Informazioni</h4>
                <ul className="text-xs text-slate-600 space-y-1">
                  <li>• <strong>Pulizie fantasma:</strong> pulizie passate mai completate o annullate</li>
                  <li>• <strong>Dati orfani:</strong> record che fanno riferimento a proprietà eliminate</li>
                  <li>• Esegui queste verifiche periodicamente per mantenere il database pulito</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
