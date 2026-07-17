"use client";

import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { collection, onSnapshot, addDoc, Timestamp, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ==================== TIPI ====================

interface ToastNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  icon?: string;
  timestamp: Date;
  notificationType?: string; // Tipo originale per preferenze
}

interface NotificationPreferences {
  globalToastEnabled: boolean;
  globalSoundEnabled: boolean;
  types: Record<string, { enabled: boolean; showToast: boolean; playSound: boolean }>;
}

interface ToastContextType {
  toasts: ToastNotification[];
  addToast: (toast: Omit<ToastNotification, 'id' | 'timestamp'>) => void;
  addToastWithPreferences: (toast: Omit<ToastNotification, 'id' | 'timestamp'>, notificationType: string) => void;
  removeToast: (id: string) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  preferences: NotificationPreferences | null;
  setPreferences: (prefs: NotificationPreferences) => void;
}

// ==================== DEFAULT PREFERENCES ====================

const DEFAULT_PREFERENCES: NotificationPreferences = {
  globalToastEnabled: true,
  globalSoundEnabled: true,
  types: {},
};

// ==================== CONTEXT ====================

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

// ==================== TRACCIAMENTO VISIBILITÀ (anti-raffica) ====================
// PROBLEMA: quando l'app va in background (o viene "chiusa" ma resta sospesa) e
// poi la riapri, i listener Firestore consegnano IN BLOCCO tutte le notifiche
// accumulate nel frattempo. Quelle le hai gia' ricevute come PUSH: NON devono
// ricomparire come raffica di toast/modal all'apertura.
//
// SOLUZIONE ROBUSTA (non dipende dalla velocita' di riconnessione di Firestore):
// registriamo l'istante in cui l'app e' tornata in primo piano e mostriamo come
// toast SOLO le notifiche il cui createdAt e' SUCCESSIVO a quel momento. Il
// backlog (creato mentre l'app era chiusa) e' sempre piu' vecchio -> solo push.
// Cosi' non importa se la consegna del backlog arriva dopo 1s o dopo 30s: viene
// giudicata in base alla SUA data di creazione, non al cronometro.
let lastBecameVisibleAt = Date.now();

// Tolleranza per lo sfasamento tra orologio del client e timestamp del server
// (createdAt e' ora-server). 🔧 FIX raffica: era 60s e faceva passare come "vive"
// tutte le notifiche create nell'ultimo minuto PRIMA della riapertura. I telefoni
// sono sincronizzati NTP (skew tipico <2s): 10s bastano e chiudono il buco.
const CLOCK_SKEW_TOLERANCE_MS = 10_000;

// Grazia breve di base (rete di sicurezza per diff in blocco al risveglio).
const VISIBILITY_GRACE_MS = 1500;

// 🔧 FIX raffica — FINESTRA DI RIENTRO: la grazia di 1.5s non bastava, perche'
// su mobile la riconnessione Firestore dopo un resume puo' impiegare 2-10s e il
// backlog veniva consegnato A GRAZIA SCADUTA → cascata di toast.
// Ora: se l'app e' stata in background per un periodo REALE (>10s), al rientro
// apriamo una finestra di soppressione di 12s: tutto cio' che viene consegnato
// li' dentro (il backlog, quando arriva arriva) NON fa toast — resta campanella
// + push, come deve. Le micro-uscite (<10s, es. alt-tab) non attivano nulla:
// l'esperienza dentro l'app non cambia.
const MIN_HIDDEN_FOR_RESUME_MS = 10_000;
const RESUME_SUPPRESS_MS = 12_000;
let lastBecameHiddenAt: number | null = null;
let resumeSuppressUntil = 0;

/** Vero se siamo nella finestra di soppressione post-rientro. */
function inResumeSuppressionWindow(): boolean {
  return Date.now() < resumeSuppressUntil;
}

function markForeground() {
  if (typeof document === "undefined" || document.visibilityState === "visible") {
    const now = Date.now();
    // Rientro da un background "vero" → apri la finestra di soppressione
    if (lastBecameHiddenAt !== null && now - lastBecameHiddenAt >= MIN_HIDDEN_FOR_RESUME_MS) {
      resumeSuppressUntil = now + RESUME_SUPPRESS_MS;
    }
    lastBecameHiddenAt = null;
    lastBecameVisibleAt = now;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      markForeground();
    } else {
      // Registra QUANDO siamo andati in background (serve a distinguere
      // micro-uscite da assenze vere al rientro)
      if (lastBecameHiddenAt === null) lastBecameHiddenAt = Date.now();
    }
  });
  // Page Lifecycle (mobile/PWA): freeze puo' scattare senza visibilitychange
  document.addEventListener("freeze", () => {
    if (lastBecameHiddenAt === null) lastBecameHiddenAt = Date.now();
  });
  document.addEventListener("resume", markForeground);
}
if (typeof window !== "undefined") {
  // Mobile/PWA: a volte al risveglio scatta focus/pageshow invece di
  // visibilitychange. Aggiorniamo il riferimento anche in quei casi.
  window.addEventListener("focus", markForeground);
  window.addEventListener("pageshow", markForeground);
}

// 🔒 TAPPO DI FRESCHEZZA (fix definitivo raffica): una notifica può fare toast
// SOLO se creata negli ultimi 15 secondi. Le notifiche "vive" arrivano al
// listener entro 1-3s dalla creazione; il backlog accumulato mentre l'app era
// minimizzata/chiusa è per definizione più vecchio → mai toast, SEMPRE e solo
// campanella + push. Questo regge anche quando visibilitychange/freeze/pageshow
// non scattano (iOS PWA) e la finestra di soppressione non si apre.
const LIVE_MAX_AGE_MS = 15_000;

// Una notifica va mostrata come toast SOLO se:
// 1) e' stata creata DOPO l'ultimo ritorno in primo piano (con tolleranza skew), E
// 2) e' FRESCA (creata negli ultimi LIVE_MAX_AGE_MS).
// Tutto cio' che e' piu' vecchio = backlog -> niente toast, resta in campanella.
// Se manca il createdAt siamo permissivi (mostriamo): non vogliamo perdere nulla.
function isLiveNotification(createdAt: any): boolean {
  try {
    if (!createdAt || typeof createdAt.toMillis !== "function") return true;
    const ms = createdAt.toMillis();
    if (ms < lastBecameVisibleAt - CLOCK_SKEW_TOLERANCE_MS) return false;
    if (Date.now() - ms > LIVE_MAX_AGE_MS) return false; // backlog vecchio: mai toast
    return true;
  } catch {
    return true;
  }
}

// ==================== SUONO DOLCE A DUE NOTE ====================

// 🔇 THROTTLE SUONO: mai piu' di un suono ogni 2.5s. Anche se piu' toast
// arrivassero ravvicinati (raffica residua), l'utente sente UN suono solo.
let lastSoundPlayedAt = 0;
const SOUND_MIN_GAP_MS = 2_500;

function playNotificationSound() {
  try {
    const now = Date.now();
    if (now - lastSoundPlayedAt < SOUND_MIN_GAP_MS) return;
    lastSoundPlayedAt = now;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Prima nota - Do (C5)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    osc1.frequency.value = 523.25; // C5
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    osc1.start(audioContext.currentTime);
    osc1.stop(audioContext.currentTime + 0.3);

    // Seconda nota - Mi (E5) - leggermente dopo
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.frequency.value = 659.25; // E5
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0, audioContext.currentTime + 0.15);
    gain2.gain.linearRampToValueAtTime(0.25, audioContext.currentTime + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    osc2.start(audioContext.currentTime + 0.15);
    osc2.stop(audioContext.currentTime + 0.5);

    // Cleanup
    setTimeout(() => {
      audioContext.close();
    }, 600);
  } catch (e) {
  }
}

// ==================== SALVA NOTIFICA IN FIRESTORE ====================

async function saveNotificationToFirestore(
  toast: Omit<ToastNotification, 'id' | 'timestamp'>,
  recipientRole: 'ADMIN' | 'PROPRIETARIO',
  recipientId?: string,
  notificationType?: string
) {
  try {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: toast.title,
        message: toast.message,
        type: notificationType || toast.type.toUpperCase(),
        recipientRole,
        recipientId: recipientId || undefined,
        senderId: "system",
        senderName: "Sistema",
      }),
    });
  } catch (error) {
    console.error("Errore salvataggio notifica:", error);
  }
}

// ==================== PROVIDER ====================

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  // Carica preferenze da localStorage all'avvio
  useEffect(() => {
    const stored = localStorage.getItem("notification_preferences");
    if (stored) {
      try {
        setPreferences(JSON.parse(stored));
      } catch (e) {
        setPreferences(DEFAULT_PREFERENCES);
      }
    } else {
      setPreferences(DEFAULT_PREFERENCES);
    }
  }, []);

  // Controlla se deve mostrare toast per un tipo
  const shouldShowToast = useCallback((notificationType?: string): boolean => {
    if (!preferences) return true;
    if (!preferences.globalToastEnabled) return false;
    
    if (notificationType && preferences.types[notificationType]) {
      const typePref = preferences.types[notificationType];
      return typePref.enabled && typePref.showToast;
    }
    
    return true; // Default: mostra
  }, [preferences]);

  // Controlla se deve riprodurre suono
  const shouldPlaySound = useCallback((notificationType?: string): boolean => {
    if (!preferences) return soundEnabled;
    if (!preferences.globalSoundEnabled) return false;
    
    if (notificationType && preferences.types[notificationType]) {
      const typePref = preferences.types[notificationType];
      return typePref.enabled && typePref.playSound;
    }
    
    return soundEnabled;
  }, [preferences, soundEnabled]);

  const addToast = useCallback((toast: Omit<ToastNotification, 'id' | 'timestamp'>) => {
    const newToast: ToastNotification = {
      ...toast,
      id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    setToasts(prev => [newToast, ...prev].slice(0, 5)); // Max 5 toast
    
    // Suono dolce a due note - SOLO se l'app è visibile (in foreground)
    if (soundEnabled && shouldPlaySound(toast.notificationType) && document.visibilityState === 'visible') {
      playNotificationSound();
    }

    // Auto-remove dopo 5 secondi
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 5000);
  }, [soundEnabled, shouldPlaySound]);

  // Versione con controllo preferenze
  const addToastWithPreferences = useCallback((
    toast: Omit<ToastNotification, 'id' | 'timestamp'>,
    notificationType: string
  ) => {
    // 🔇 Non mostrare toast/suono se l'app è in background (la push notification gestisce tutto)
    if (document.visibilityState !== 'visible') {
      return;
    }

    // 🔇 Non mostrare il "backlog": quando l'app torna in primo piano dopo essere
    // stata in background/chiusa, i listener Firestore sputano in blocco le
    // notifiche accumulate. Quelle le hai già ricevute come push: NON devono
    // comparire come raffica di toast.
    // 🔧 FIX raffica: oltre alla grazia breve, rispettiamo la FINESTRA DI RIENTRO
    // (12s dopo un background reale) — copre anche le riconnessioni lente.
    if (inResumeSuppressionWindow() || Date.now() - lastBecameVisibleAt < VISIBILITY_GRACE_MS) {
      return;
    }
    
    // Controlla preferenze prima di mostrare
    if (!shouldShowToast(notificationType)) {
      return;
    }

    const newToast: ToastNotification = {
      ...toast,
      notificationType,
      id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    setToasts(prev => [newToast, ...prev].slice(0, 5));
    
    if (shouldPlaySound(notificationType) && document.visibilityState === 'visible') {
      playNotificationSound();
    }

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 5000);
  }, [shouldShowToast, shouldPlaySound]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ 
      toasts, 
      addToast, 
      addToastWithPreferences,
      removeToast, 
      soundEnabled, 
      setSoundEnabled,
      preferences,
      setPreferences,
    }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

// ==================== TOAST CONTAINER ====================

function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast, index) => (
        <ToastItem 
          key={toast.id} 
          toast={toast} 
          onClose={() => removeToast(toast.id)}
          index={index}
        />
      ))}
    </div>
  );
}

// ==================== TOAST ITEM ====================

interface ToastItemProps {
  toast: ToastNotification;
  onClose: () => void;
  index: number;
}

function ToastItem({ toast, onClose, index }: ToastItemProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger animazione entrata
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(onClose, 300);
  };

  const config = {
    success: {
      bg: 'from-emerald-500 to-teal-600',
      icon: '✅',
      glow: 'shadow-emerald-500/30',
    },
    info: {
      bg: 'from-blue-500 to-indigo-600',
      icon: 'ℹ️',
      glow: 'shadow-blue-500/30',
    },
    warning: {
      bg: 'from-amber-500 to-orange-600',
      icon: '⚠️',
      glow: 'shadow-amber-500/30',
    },
    error: {
      bg: 'from-red-500 to-rose-600',
      icon: '❌',
      glow: 'shadow-red-500/30',
    },
  };

  const { bg, icon, glow } = config[toast.type];

  return (
    <div
      className={`
        pointer-events-auto
        transform transition-all duration-300 ease-out
        ${isVisible && !isLeaving ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-full opacity-0 scale-95'}
      `}
      style={{ transitionDelay: `${index * 50}ms` }}
    >
      <div className={`
        relative overflow-hidden
        w-80 sm:w-96 
        bg-gradient-to-r ${bg}
        rounded-2xl shadow-2xl ${glow}
        p-4
      `}>
        {/* Shimmer effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
        
        <div className="relative flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
            <span className="text-xl">{toast.icon || icon}</span>
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-semibold text-sm">
              {toast.title}
            </h4>
            <p className="text-white/90 text-xs mt-0.5 line-clamp-2">
              {toast.message}
            </p>
            <span className="text-white/60 text-[10px] mt-1 block">
              {toast.timestamp.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          
          {/* Close button */}
          <button
            onClick={handleClose}
            className="w-6 h-6 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white/80 hover:text-white transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
          <div 
            className="h-full bg-white/50 rounded-full animate-progress"
            style={{ animationDuration: '5s' }}
          />
        </div>
      </div>
    </div>
  );
}

// ==================== REALTIME LISTENER FOR ADMIN (COMPLETO) ====================

export function useAdminRealtimeNotifications() {
  const { addToastWithPreferences } = useToast();
  const previousOrdersRef = useRef<Map<string, any>>(new Map());
  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const ordersInitializedRef = useRef(false);
  const notificationsInitializedRef = useRef(false);

  useEffect(() => {

    // ==================== LISTENER NOTIFICHE ADMIN ====================
    // 🚀 PERF v2 (14/05/2026): prima caricava TUTTE le notifiche ADMIN/ALL di
    //    sempre (migliaia). Ora carichiamo solo quelle create da quando l'utente
    //    apre la dashboard in poi (createdAt > now). Per mostrare toast NUOVI
    //    non serve la storia: le notifiche vecchie non devono apparire come pop-up.
    //    + limit(50) come safety net contro burst di notifiche.
    const sessionStart = Timestamp.now();
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientRole", "in", ["ADMIN", "ALL"]),
      where("createdAt", ">", sessionStart),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      // Prima volta: segna tutte le notifiche esistenti come già viste
      if (!notificationsInitializedRef.current) {
        snapshot.docs.forEach(doc => {
          seenNotificationsRef.current.add(doc.id);
        });
        notificationsInitializedRef.current = true;
        return;
      }

      // Mostra toast solo per NUOVE notifiche
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && !seenNotificationsRef.current.has(change.doc.id)) {
          const data = change.doc.data();

          // 🔇 ANTI-RAFFICA: se la notifica e' stata creata mentre l'app era in
          // background (backlog), l'hai gia' avuta come push -> niente toast.
          if (!isLiveNotification(data.createdAt)) {
            seenNotificationsRef.current.add(change.doc.id);
            return;
          }

          // Determina tipo toast in base al tipo notifica
          let toastType: 'success' | 'info' | 'warning' | 'error' = 'info';
          if (data.type?.includes('COMPLETED') || data.type?.includes('APPROVED') || data.type === 'SUCCESS' || data.type === 'NEW_PROPERTY') {
            toastType = 'success';
          } else if (data.type?.includes('NOT_COMPLETED') || data.type?.includes('OVERDUE') || data.type === 'ERROR') {
            toastType = 'error';
          } else if (data.type?.includes('WARNING') || data.type?.includes('REQUEST') || data.type?.includes('DUE')) {
            toastType = 'warning';
          }
          
          // Mostra il toast con controllo preferenze
          addToastWithPreferences({
            title: data.title || 'Nuova notifica',
            message: data.message || '',
            type: toastType,
            icon: getIconForType(data.type),
          }, data.type || 'INFO');
          
          // Segna come vista
          seenNotificationsRef.current.add(change.doc.id);
        }
      });
    });

    // ==================== LISTENER ORDINI (per cambi stato in tempo reale) ====================
    // 🚀 PERF v2 (14/05/2026): prima caricava TUTTI gli ordini di sempre (2758).
    //    Serve solo per intercettare cambi di stato → bastano gli ordini degli
    //    ultimi 7 giorni (gli unici che possono cambiare stato in tempo reale).
    const ordersRangeStart = new Date();
    ordersRangeStart.setDate(ordersRangeStart.getDate() - 7);
    ordersRangeStart.setHours(0, 0, 0, 0);
    const ordersQuery = query(
      collection(db, "orders"),
      where("scheduledDate", ">=", Timestamp.fromDate(ordersRangeStart))
    );

    const unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
      if (!ordersInitializedRef.current) {
        snapshot.docs.forEach(doc => {
          previousOrdersRef.current.set(doc.id, doc.data());
        });
        ordersInitializedRef.current = true;
        return;
      }

      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        const prevData = previousOrdersRef.current.get(change.doc.id);

        if (change.type === 'modified' && prevData && data.status !== prevData.status) {
          const statusConfig = getOrderStatusConfig(data.status, data.propertyName);
          if (statusConfig) {
            addToastWithPreferences(statusConfig.toast, statusConfig.notificationType);
          }
        }

        previousOrdersRef.current.set(change.doc.id, data);
      });
    });

    // ❌ RIMOSSO LISTENER PULIZIE
    // Le notifiche pulizie vengono già create dal CleaningWizard tramite notifyAdmin()
    // e il listener notifiche sopra le cattura. Avere anche il listener pulizie
    // causava DOPPIO TOAST e DOPPIO SUONO!

    return () => {
      unsubNotifications();
      unsubOrders();
    };
  }, [addToastWithPreferences]);
}

// ==================== HELPER FUNCTIONS ====================

function getIconForType(type: string): string {
  const icons: Record<string, string> = {
    CLEANING_ASSIGNED: '🧹',
    CLEANING_COMPLETED: '✨',
    CLEANING_NOT_COMPLETED: '⚠️',
    CLEANING_STARTED: '▶️',
    LAUNDRY_NEW: '📦',
    LAUNDRY_ASSIGNED: '🚚',
    LAUNDRY_IN_TRANSIT: '🚚',
    LAUNDRY_DELIVERED: '✅',
    NEW_PROPERTY: '🏠',
    DELETION_REQUEST: '🗑️',
    PROPERTY_APPROVED: '✅',
    PROPERTY_REJECTED: '❌',
    PAYMENT_DUE: '💰',
    PAYMENT_RECEIVED: '✅',
    PAYMENT_OVERDUE: '🚨',
    BOOKING_NEW: '📅',
    BOOKING_CANCELLED: '❌',
    WARNING: '⚠️',
    ERROR: '❌',
    SUCCESS: '✅',
    INFO: 'ℹ️',
  };
  return icons[type] || '🔔';
}

function getOrderStatusConfig(status: string, propertyName: string) {
  const configs: Record<string, { toast: Omit<ToastNotification, 'id' | 'timestamp'>; notificationType: string }> = {
    'PICKING': {
      toast: {
        title: '📦 Preparazione Ordine',
        message: `Rider sta preparando ordine per ${propertyName || 'proprietà'}`,
        type: 'info',
        icon: '📦'
      },
      notificationType: 'LAUNDRY_ASSIGNED'
    },
    'IN_TRANSIT': {
      toast: {
        title: '🚚 Consegna in Corso',
        message: `Consegna in corso per ${propertyName || 'destinazione'}`,
        type: 'warning',
        icon: '🚚'
      },
      notificationType: 'LAUNDRY_IN_TRANSIT'
    },
    'DELIVERED': {
      toast: {
        title: '✅ Consegna Completata',
        message: `Ordine per ${propertyName || 'proprietà'} consegnato!`,
        type: 'success',
        icon: '📦'
      },
      notificationType: 'LAUNDRY_DELIVERED'
    },
  };
  return configs[status];
}

function getCleaningStatusConfig(status: string, propertyName: string) {
  const configs: Record<string, { toast: Omit<ToastNotification, 'id' | 'timestamp'>; notificationType: string }> = {
    'ASSIGNED': {
      toast: {
        title: '🧹 Pulizia Assegnata',
        message: `Pulizia di ${propertyName || 'proprietà'} assegnata`,
        type: 'info',
        icon: '🧹'
      },
      notificationType: 'CLEANING_ASSIGNED'
    },
    'IN_PROGRESS': {
      toast: {
        title: '▶️ Pulizia Iniziata',
        message: `Pulizia di ${propertyName || 'proprietà'} iniziata`,
        type: 'warning',
        icon: '🧼'
      },
      notificationType: 'CLEANING_STARTED'
    },
    'COMPLETED': {
      toast: {
        title: '✨ Pulizia Completata',
        message: `Pulizia di ${propertyName || 'proprietà'} completata!`,
        type: 'success',
        icon: '✨'
      },
      notificationType: 'CLEANING_COMPLETED'
    },
  };
  return configs[status];
}

// ==================== REALTIME LISTENER FOR PROPRIETARIO ====================

export function useProprietarioRealtimeNotifications(userId: string, userPropertyIds: string[]) {
  const { addToastWithPreferences } = useToast();
  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      return;
    }


    // 🚀 PERF v2 (14/05/2026): solo notifiche da quando l'utente è loggato.
    //    Vedi commento dettagliato nel listener admin sopra.
    const sessionStart = Timestamp.now();
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", userId),
      where("createdAt", ">", sessionStart),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      // Prima volta: segna tutte le notifiche esistenti come già viste
      if (!initializedRef.current) {
        snapshot.docs.forEach(doc => {
          seenNotificationsRef.current.add(doc.id);
        });
        initializedRef.current = true;
        return;
      }

      // Mostra toast solo per NUOVE notifiche
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && !seenNotificationsRef.current.has(change.doc.id)) {
          const data = change.doc.data();
          
          // Filtra solo notifiche per proprietario
          if (data.recipientRole !== 'PROPRIETARIO') return;

          // 🔇 ANTI-RAFFICA: backlog creato in background -> solo push, niente toast
          if (!isLiveNotification(data.createdAt)) {
            seenNotificationsRef.current.add(change.doc.id);
            return;
          }
          
          
          // Determina tipo toast
          let toastType: 'success' | 'info' | 'warning' | 'error' = 'info';
          if (data.type?.includes('COMPLETED') || 
              data.type?.includes('APPROVED') || 
              data.type === 'SUCCESS' ||
              data.type === 'PAYMENT_RECEIVED' ||
              data.type === 'NEW_PROPERTY' ||
              data.type === 'PROPERTY_APPROVED') {
            toastType = 'success';
          } else if (data.type === 'ERROR') {
            toastType = 'error';
          } else if (data.type?.includes('WARNING') || 
                     data.type?.includes('DUE') || 
                     data.type === 'PAYMENT_OVERDUE') {
            toastType = 'warning';
          }
          
          // Mostra il toast
          addToastWithPreferences({
            title: data.title || 'Nuova notifica',
            message: data.message || '',
            type: toastType,
            icon: getIconForType(data.type),
          }, data.type || 'INFO');
          
          // Segna come vista
          seenNotificationsRef.current.add(change.doc.id);
        }
      });
    });

    return () => {
      unsubNotifications();
    };
  }, [addToastWithPreferences, userId]);
}

// ==================== HOOK PER OPERATORE REALTIME NOTIFICATIONS ====================

export function useOperatoreRealtimeNotifications(userId: string) {
  const { addToastWithPreferences } = useToast();
  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      return;
    }


    // 🚀 PERF v2: solo notifiche da quando loggato (vedi commento admin)
    const sessionStart = Timestamp.now();
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", userId),
      where("createdAt", ">", sessionStart),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      // Prima volta: segna tutte le notifiche esistenti come già viste
      if (!initializedRef.current) {
        snapshot.docs.forEach(doc => {
          seenNotificationsRef.current.add(doc.id);
        });
        initializedRef.current = true;
        return;
      }

      // Mostra toast solo per NUOVE notifiche
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && !seenNotificationsRef.current.has(change.doc.id)) {
          const data = change.doc.data();
          
          // Filtra solo notifiche per operatore
          if (data.recipientRole !== 'OPERATORE_PULIZIE' && data.recipientRole !== 'OPERATORE') return;

          // 🔇 ANTI-RAFFICA: backlog creato in background -> solo push, niente toast
          if (!isLiveNotification(data.createdAt)) {
            seenNotificationsRef.current.add(change.doc.id);
            return;
          }
          
          
          // Determina tipo toast
          let toastType: 'success' | 'info' | 'warning' | 'error' = 'info';
          if (data.type === 'CLEANING_ASSIGNED') {
            toastType = 'info'; // Nuova pulizia assegnata = info
          } else if (data.type?.includes('COMPLETED') || data.type === 'SUCCESS') {
            toastType = 'success';
          } else if (data.type === 'ERROR') {
            toastType = 'error';
          } else if (data.type?.includes('WARNING')) {
            toastType = 'warning';
          }
          
          // Mostra il toast
          addToastWithPreferences({
            title: data.title || 'Nuova notifica',
            message: data.message || '',
            type: toastType,
            icon: getIconForType(data.type),
          }, data.type || 'INFO');
          
          // Segna come vista
          seenNotificationsRef.current.add(change.doc.id);
        }
      });
    });

    return () => {
      unsubNotifications();
    };
  }, [addToastWithPreferences, userId]);
}

// ==================== HOOK PER RIDER REALTIME NOTIFICATIONS ====================

export function useRiderRealtimeNotifications(userId: string) {
  const { addToastWithPreferences } = useToast();
  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      return;
    }


    const processNotification = (docSnapshot: any) => {
      const docId = docSnapshot.id;
      const data = docSnapshot.data();
      
      // Ignora se già vista
      if (seenNotificationsRef.current.has(docId)) return;
      
      // Verifica che sia destinata a questo rider
      // - recipientId corrisponde a questo utente
      // - OPPURE recipientRole è RIDER e non c'è recipientId specifico
      const isForThisRider = 
        data.recipientId === userId || 
        (data.recipientRole === 'RIDER' && !data.recipientId);
      
      if (!isForThisRider) return;

      // 🔇 ANTI-RAFFICA: backlog creato in background -> solo push, niente toast
      if (!isLiveNotification(data.createdAt)) {
        seenNotificationsRef.current.add(docId);
        return;
      }
      
      
      // Determina tipo toast
      let toastType: 'success' | 'info' | 'warning' | 'error' = 'info';
      let icon = '🔔';
      
      // Configurazione basata sul tipo di notifica
      if (data.type === 'LAUNDRY_NEW' || data.type === 'LAUNDRY_ASSIGNED') {
        toastType = 'info';
        icon = '📦';
      } else if (data.type === 'CLEANING_STARTED') {
        toastType = 'warning';
        icon = '🧹';
      } else if (data.type === 'WARNING' || data.title?.includes('URGENTE')) {
        toastType = 'warning';
        icon = '🚨';
      } else if (data.type?.includes('COMPLETED') || data.type === 'SUCCESS') {
        toastType = 'success';
        icon = '✅';
      } else if (data.type === 'ERROR') {
        toastType = 'error';
        icon = '❌';
      }
      
      // Se è urgente, modifica il messaggio
      const isUrgent = data.urgency === 'urgent' || data.title?.includes('URGENTE');
      
      // Mostra il toast
      addToastWithPreferences({
        title: data.title || 'Nuova notifica',
        message: data.message || '',
        type: isUrgent ? 'warning' : toastType,
        icon: isUrgent ? '🚨' : icon,
      }, data.type || 'INFO');
      
      // Segna come vista
      seenNotificationsRef.current.add(docId);
    };

    // UNICO LISTENER: ascolta nuove notifiche per ruolo RIDER da quando loggato
    // 🚀 PERF v2: prima caricava TUTTE le notifiche RIDER di sempre. Ora solo
    //    quelle create da quando l'utente è loggato (vedi commento admin).
    const sessionStart = Timestamp.now();
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientRole", "==", "RIDER"),
      where("createdAt", ">", sessionStart),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      // Prima volta: segna tutte le notifiche esistenti come già viste
      if (!initializedRef.current) {
        snapshot.docs.forEach(doc => {
          seenNotificationsRef.current.add(doc.id);
        });
        initializedRef.current = true;
        return;
      }

      // Mostra toast solo per NUOVE notifiche
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          processNotification(change.doc);
        }
      });
    });

    return () => {
      unsubscribe();
    };
  }, [addToastWithPreferences, userId]);
}

// ==================== CSS per animazioni (da aggiungere al globals.css) ====================
/*
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}

@keyframes progress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

.animate-shimmer {
  animation: shimmer 2s infinite;
}

.animate-progress {
  animation: progress linear forwards;
}
*/
