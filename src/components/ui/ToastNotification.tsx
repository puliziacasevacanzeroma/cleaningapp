"use client";

import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { collection, onSnapshot, addDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ==================== TIPI ====================

interface ToastNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  icon?: string;
  timestamp: Date;
}

interface ToastContextType {
  toasts: ToastNotification[];
  addToast: (toast: Omit<ToastNotification, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
}

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
  recipientId?: string
) {
  try {
    await addDoc(collection(db, "notifications"), {
      title: toast.title,
      message: toast.message,
      type: toast.type.toUpperCase(),
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

// Trova il proprietario di una proprietà e invia notifica
async function notifyPropertyOwner(
  propertyId: string,
  toast: Omit<ToastNotification, 'id' | 'timestamp'>
) {
  try {
    const { doc: docFn, getDoc } = await import("firebase/firestore");
    const propertyRef = docFn(db, "properties", propertyId);
    const propertySnap = await getDoc(propertyRef);
    
    if (propertySnap.exists()) {
      const propertyData = propertySnap.data();
      const ownerId = propertyData.ownerId;
      
      if (ownerId) {
        console.log("📬 Invio notifica al proprietario:", ownerId);
        await saveNotificationToFirestore(toast, 'PROPRIETARIO', ownerId);
      }
    }
  } catch (error) {
    console.error("Errore invio notifica proprietario:", error);
  }
}

// ==================== PROVIDER ====================

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const addToast = useCallback((toast: Omit<ToastNotification, 'id' | 'timestamp'>) => {
    const newToast: ToastNotification = {
      ...toast,
      id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    setToasts(prev => [newToast, ...prev].slice(0, 5)); // Max 5 toast
    
    // Suono dolce a due note
    if (soundEnabled) {
      playNotificationSound();
    }

    // Auto-remove dopo 5 secondi
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 5000);
  }, [soundEnabled]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, soundEnabled, setSoundEnabled }}>
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
        backdrop-blur-xl
        border border-white/20
      `}>
        {/* Shimmer effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
        
        {/* Content */}
        <div className="relative flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-xl flex-shrink-0">
            {toast.icon || icon}
          </div>
          
          {/* Text */}
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-white text-sm">
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

// ==================== REALTIME LISTENER FOR ADMIN ====================

export function useAdminRealtimeNotifications() {
  const { addToast } = useToast();
  const previousOrdersRef = useRef<Map<string, any>>(new Map());
  const previousCleaningsRef = useRef<Map<string, any>>(new Map());
  const ordersInitializedRef = useRef(false);
  const cleaningsInitializedRef = useRef(false);

  useEffect(() => {
    console.log("🔔 Admin Toast Listener: AVVIATO");

    // Listener per ordini
    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      console.log("🔔 Orders snapshot ricevuto, initialized:", ordersInitializedRef.current);
      
      if (!ordersInitializedRef.current) {
        snapshot.docs.forEach(doc => {
          previousOrdersRef.current.set(doc.id, doc.data());
        });
        ordersInitializedRef.current = true;
        console.log("🔔 Orders inizializzati:", previousOrdersRef.current.size);
        return;
      }

      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        const prevData = previousOrdersRef.current.get(change.doc.id);

        console.log("🔔 Order change:", change.type, change.doc.id, "prev:", prevData?.status, "new:", data.status);

        if (change.type === 'modified' && prevData && data.status !== prevData.status) {
          const statusMessages: Record<string, { title: string; message: string; type: 'success' | 'info' | 'warning'; icon: string }> = {
            'PICKING': {
              title: '📦 Preparazione Ordine',
              message: `Rider sta preparando ordine per ${data.propertyName || 'proprietà'}`,
              type: 'info',
              icon: '📦'
            },
            'IN_TRANSIT': {
              title: '🚚 Consegna in Corso',
              message: `Consegna in corso per ${data.propertyName || 'destinazione'}`,
              type: 'warning',
              icon: '🚚'
            },
            'DELIVERED': {
              title: '✅ Consegna Completata',
              message: `Ordine per ${data.propertyName || 'proprietà'} consegnato!`,
              type: 'success',
              icon: '📦'
            },
          };

          const statusConfig = statusMessages[data.status];
          if (statusConfig) {
            console.log("🔔 TOAST ORDINE:", statusConfig.title);
            addToast(statusConfig);
            // Salva anche nella campanella
            saveNotificationToFirestore(statusConfig, 'ADMIN');
          }
        }

        previousOrdersRef.current.set(change.doc.id, data);
      });
    });

    // Listener per pulizie
    const unsubCleanings = onSnapshot(collection(db, "cleanings"), (snapshot) => {
      console.log("🔔 Cleanings snapshot ricevuto, initialized:", cleaningsInitializedRef.current);
      
      if (!cleaningsInitializedRef.current) {
        snapshot.docs.forEach(doc => {
          previousCleaningsRef.current.set(doc.id, doc.data());
        });
        cleaningsInitializedRef.current = true;
        console.log("🔔 Cleanings inizializzati:", previousCleaningsRef.current.size);
        return;
      }

      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        const prevData = previousCleaningsRef.current.get(change.doc.id);

        console.log("🔔 Cleaning change:", change.type, change.doc.id, "prev:", prevData?.status, "new:", data.status);

        if (change.type === 'modified' && prevData && data.status !== prevData.status) {
          // Messaggi per ADMIN
          const adminMessages: Record<string, { title: string; message: string; type: 'success' | 'info' | 'warning'; icon: string }> = {
            'ASSIGNED': {
              title: '🧹 Pulizia Assegnata',
              message: `Pulizia di ${data.propertyName || 'proprietà'} assegnata`,
              type: 'info',
              icon: '🧹'
            },
            'IN_PROGRESS': {
              title: '▶️ Pulizia Iniziata',
              message: `Pulizia di ${data.propertyName || 'proprietà'} iniziata`,
              type: 'warning',
              icon: '🧼'
            },
            'COMPLETED': {
              title: '✨ Pulizia Completata',
              message: `Pulizia di ${data.propertyName || 'proprietà'} completata!`,
              type: 'success',
              icon: '✨'
            },
          };

          // Messaggi per PROPRIETARIO (più personali)
          const ownerMessages: Record<string, { title: string; message: string; type: 'success' | 'info' | 'warning'; icon: string }> = {
            'IN_PROGRESS': {
              title: '🧹 Pulizia Iniziata',
              message: `La pulizia della tua proprietà "${data.propertyName || ''}" è iniziata`,
              type: 'info',
              icon: '🧼'
            },
            'COMPLETED': {
              title: '✨ Pulizia Completata!',
              message: `La tua proprietà "${data.propertyName || ''}" è stata pulita`,
              type: 'success',
              icon: '✨'
            },
          };

          const adminConfig = adminMessages[data.status];
          if (adminConfig) {
            console.log("🔔 TOAST PULIZIA:", adminConfig.title);
            addToast(adminConfig);
            // Salva nella campanella admin
            saveNotificationToFirestore(adminConfig, 'ADMIN');
          }

          // Invia notifica anche al proprietario (IN_PROGRESS e COMPLETED)
          const ownerConfig = ownerMessages[data.status];
          if (ownerConfig && data.propertyId) {
            console.log("🔔 Invio notifica al proprietario per pulizia");
            notifyPropertyOwner(data.propertyId, ownerConfig);
          }
        }

        previousCleaningsRef.current.set(change.doc.id, data);
      });
    });

    return () => {
      console.log("🔔 Admin Toast Listener: CHIUSO");
      unsubOrders();
      unsubCleanings();
    };
  }, [addToast]);
}

// ==================== REALTIME LISTENER FOR PROPRIETARIO ====================
// Questo listener mostra solo il TOAST al proprietario quando è loggato
// Le notifiche nella campanella vengono salvate dal listener admin

export function useProprietarioRealtimeNotifications(userId: string, userPropertyIds: string[]) {
  const { addToast } = useToast();
  const previousCleaningsRef = useRef<Map<string, any>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!userId || userPropertyIds.length === 0) return;

    console.log('🏠 Proprietario Toast Listener: AVVIATO per proprietà:', userPropertyIds);

    // Listener SOLO per pulizie delle proprietà del proprietario
    const unsubCleanings = onSnapshot(collection(db, "cleanings"), (snapshot) => {
      console.log("🏠 Cleanings snapshot ricevuto, initialized:", initializedRef.current);
      
      if (!initializedRef.current) {
        snapshot.docs.forEach(doc => {
          previousCleaningsRef.current.set(doc.id, doc.data());
        });
        initializedRef.current = true;
        console.log("🏠 Cleanings inizializzati:", previousCleaningsRef.current.size);
        return;
      }

      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        const prevData = previousCleaningsRef.current.get(change.doc.id);

        // Filtra solo le pulizie delle proprietà del proprietario
        if (!userPropertyIds.includes(data.propertyId)) {
          previousCleaningsRef.current.set(change.doc.id, data);
          return;
        }

        console.log("🏠 Cleaning change per mia proprietà:", change.type, "prev:", prevData?.status, "new:", data.status);

        if (change.type === 'modified' && prevData && data.status !== prevData.status) {
          const statusMessages: Record<string, { title: string; message: string; type: 'success' | 'info' | 'warning'; icon: string }> = {
            'IN_PROGRESS': {
              title: '🧹 Pulizia Iniziata',
              message: `La pulizia di "${data.propertyName || 'la tua proprietà'}" è iniziata`,
              type: 'info',
              icon: '🧼'
            },
            'COMPLETED': {
              title: '✨ Pulizia Completata!',
              message: `La pulizia di "${data.propertyName || 'la tua proprietà'}" è stata completata`,
              type: 'success',
              icon: '✨'
            },
          };

          const statusConfig = statusMessages[data.status];
          if (statusConfig) {
            console.log("🏠 TOAST PROPRIETARIO:", statusConfig.title);
            addToast(statusConfig);
            // NON salviamo qui - lo fa già il listener admin via notifyPropertyOwner()
          }
        }

        previousCleaningsRef.current.set(change.doc.id, data);
      });
    });

    return () => {
      console.log("🏠 Proprietario Toast Listener: CHIUSO");
      unsubCleanings();
    };
  }, [addToast, userId, userPropertyIds]);
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
