"use client";

import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { collection, onSnapshot, addDoc, Timestamp, query, where } from "firebase/firestore";
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

// ==================== SUONO DOLCE A DUE NOTE ====================

function playNotificationSound() {
  try {
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
    console.log("Audio not supported");
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
    await addDoc(collection(db, "notifications"), {
      title: toast.title,
      message: toast.message,
      type: notificationType || toast.type.toUpperCase(),
      recipientRole,
      recipientId: recipientId || null,
      senderId: "system",
      senderName: "Sistema",
      status: "UNREAD",
      actionRequired: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log("📬 Notifica salvata in Firestore per", recipientRole, recipientId || "");
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
    
    // Suono dolce a due note
    if (soundEnabled && shouldPlaySound(toast.notificationType)) {
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
    // Controlla preferenze prima di mostrare
    if (!shouldShowToast(notificationType)) {
      console.log(`🔕 Toast disabilitato per tipo: ${notificationType}`);
      return;
    }

    const newToast: ToastNotification = {
      ...toast,
      notificationType,
      id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    setToasts(prev => [newToast, ...prev].slice(0, 5));
    
    if (shouldPlaySound(notificationType)) {
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
    console.log("🔔 Admin Toast Listener: AVVIATO (con preferenze)");

    // ==================== LISTENER NOTIFICHE ADMIN ====================
    // Ascolta TUTTE le nuove notifiche destinate all'admin
    // NOTA: Le notifiche pulizie (iniziata/completata) vengono create dal CleaningWizard
    // quindi NON serve un listener separato sulle pulizie (evita doppio toast!)
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientRole", "in", ["ADMIN", "ALL"])
    );

    const unsubNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      // Prima volta: segna tutte le notifiche esistenti come già viste
      if (!notificationsInitializedRef.current) {
        snapshot.docs.forEach(doc => {
          seenNotificationsRef.current.add(doc.id);
        });
        notificationsInitializedRef.current = true;
        console.log("🔔 Notifiche admin inizializzate:", seenNotificationsRef.current.size);
        return;
      }

      // Mostra toast solo per NUOVE notifiche
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && !seenNotificationsRef.current.has(change.doc.id)) {
          const data = change.doc.data();
          console.log("🔔 NUOVA NOTIFICA ADMIN:", data.title, "tipo:", data.type);
          
          // Determina tipo toast in base al tipo notifica
          let toastType: 'success' | 'info' | 'warning' | 'error' = 'info';
          if (data.type?.includes('COMPLETED') || data.type?.includes('APPROVED') || data.type === 'SUCCESS') {
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
    // Gli ordini NON hanno notifiche automatiche create altrove, quindi il listener serve
    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
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
      console.log("🔔 Admin Toast Listener: CHIUSO");
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
      console.log('🏠 Proprietario Toast Listener: NESSUN userId');
      return;
    }

    console.log('🏠 Proprietario Toast Listener: AVVIATO per userId:', userId);

    // Ascolta le notifiche destinate a questo proprietario (senza indice composito)
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", userId)
    );

    const unsubNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      // Prima volta: segna tutte le notifiche esistenti come già viste
      if (!initializedRef.current) {
        snapshot.docs.forEach(doc => {
          seenNotificationsRef.current.add(doc.id);
        });
        initializedRef.current = true;
        console.log("🏠 Notifiche inizializzate:", seenNotificationsRef.current.size);
        return;
      }

      // Mostra toast solo per NUOVE notifiche
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && !seenNotificationsRef.current.has(change.doc.id)) {
          const data = change.doc.data();
          
          // Filtra solo notifiche per proprietario
          if (data.recipientRole !== 'PROPRIETARIO') return;
          
          console.log("🏠 NUOVA NOTIFICA:", data.title, "tipo:", data.type);
          
          // Determina tipo toast
          let toastType: 'success' | 'info' | 'warning' | 'error' = 'info';
          if (data.type?.includes('COMPLETED') || 
              data.type?.includes('APPROVED') || 
              data.type === 'SUCCESS' ||
              data.type === 'PAYMENT_RECEIVED') {
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
      console.log("🏠 Proprietario Toast Listener: CHIUSO");
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
      console.log('🧹 Operatore Toast Listener: NESSUN userId');
      return;
    }

    console.log('🧹 Operatore Toast Listener: AVVIATO per userId:', userId);

    // Ascolta le notifiche destinate a questo operatore
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", userId)
    );

    const unsubNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      // Prima volta: segna tutte le notifiche esistenti come già viste
      if (!initializedRef.current) {
        snapshot.docs.forEach(doc => {
          seenNotificationsRef.current.add(doc.id);
        });
        initializedRef.current = true;
        console.log("🧹 Notifiche operatore inizializzate:", seenNotificationsRef.current.size);
        return;
      }

      // Mostra toast solo per NUOVE notifiche
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && !seenNotificationsRef.current.has(change.doc.id)) {
          const data = change.doc.data();
          
          // Filtra solo notifiche per operatore
          if (data.recipientRole !== 'OPERATORE_PULIZIE' && data.recipientRole !== 'OPERATORE') return;
          
          console.log("🧹 NUOVA NOTIFICA OPERATORE:", data.title, "tipo:", data.type);
          
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
      console.log("🧹 Operatore Toast Listener: CHIUSO");
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
      console.log('🚴 Rider Toast Listener: NESSUN userId');
      return;
    }

    console.log('🚴 Rider Toast Listener: AVVIATO per userId:', userId);

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
      
      console.log("🚴 NUOVA NOTIFICA RIDER:", data.title, "tipo:", data.type);
      
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

    // UNICO LISTENER: ascolta TUTTE le notifiche per ruolo RIDER
    // (include sia quelle con recipientId specifico che quelle broadcast)
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientRole", "==", "RIDER")
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      // Prima volta: segna tutte le notifiche esistenti come già viste
      if (!initializedRef.current) {
        snapshot.docs.forEach(doc => {
          seenNotificationsRef.current.add(doc.id);
        });
        initializedRef.current = true;
        console.log("🚴 Notifiche rider inizializzate:", seenNotificationsRef.current.size);
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
      console.log("🚴 Rider Toast Listener: CHIUSO");
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
