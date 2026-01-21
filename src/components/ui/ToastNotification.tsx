"use client";

import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
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

// ==================== PROVIDER ====================

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Inizializza audio
  useEffect(() => {
    // Crea un suono usando Web Audio API (più affidabile)
    audioRef.current = new Audio();
    // Suono di notifica gentile (base64 encoded)
    audioRef.current.src = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2LkZeWk42Ff3l3d3Z4foSNlZuempiUjoeCfXl2dnl+hIyUnJ+gnpqVj4mDfnp3d3l9g4qSmp6hoJ2Yl5KMh4J+enl5e3+EipGXnaChnpuXk46JhYF+fHt8f4OIjpSZnZ6dnJmVkYyIhIB+fX1+gYWKj5SYm5ycm5mWko6KhoOBf39/gYSHi4+TlpiZmZiWk5CMiYWCgH9/gIGEh4uOkpWXmJiXlZKPi4iFgoB/f4CBhIeLjpGUlpeXlpSRjoqHhIKAgICBg4aJjI+Sk5WVlZSSj4yJhoSCgYGBgoSGiYyOkJKTlJSTkY+MiYaEgoGBgYKEhoiLjY+RkpOTkpCOi4mGhIKBgYGChIaIioyOkJGSkpGQjo2KiIWDgoGBgoOFh4mLjY6QkZGRkI6NiomHhYOCgoKDhIaIiYuNjpCQkI+OjYuJh4WEg4KCg4OFh4iKi42Oj4+Pjo2LioiGhYSDg4OEhYaIiYuMjY6Ojo6NjIqJh4aFhIODhIWGh4iKi4yNjY2NjIuKiYeGhYSEhIWGh4iJiouMjIyMi4uKiYiHhoWFhYWGhoeIiYqLi4uLi4qKiYiHhoaFhYWGhoeIiImKioqKioqJiYiHh4aGhoaGh4eIiImJiYmJiYmIiIeHh4aGhoaHh4eIiIiJiYmJiIiIh4eHh4aGhoeHh4eIiIiIiYmJiIiIh4eHh4eHh4eHh4eIiIiIiIiIiIiHh4eHh4eHh4eHh4eIiIiIiIiIiIeHh4eHh4eHh4eHh4iIiIiIiIiHh4eHh4eHh4eHh4eHiIiIiIiIh4eHh4eHh4eHh4eHh4eIiIiIiIeHh4eHh4eHh4eHh4eHiIiIiIeHh4eHh4eHh4eHh4eHh4iIiIeHh4eHh4eHh4eHh4eHh4eIiIeHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4c=";
    audioRef.current.volume = 0.5;
  }, []);

  const playSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Ignore autoplay errors
      });
    }
  }, [soundEnabled]);

  const addToast = useCallback((toast: Omit<ToastNotification, 'id' | 'timestamp'>) => {
    const newToast: ToastNotification = {
      ...toast,
      id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    setToasts(prev => [newToast, ...prev].slice(0, 5)); // Max 5 toast
    playSound();

    // Auto-remove dopo 5 secondi
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 5000);
  }, [playSound]);

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
  const previousDataRef = useRef<Map<string, any>>(new Map());
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    // Listener per ordini
    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      if (isFirstLoadRef.current) {
        // Prima volta: salva lo stato iniziale senza notifiche
        snapshot.docs.forEach(doc => {
          previousDataRef.current.set(`order-${doc.id}`, doc.data());
        });
        return;
      }

      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        const prevData = previousDataRef.current.get(`order-${change.doc.id}`);

        if (change.type === 'modified' && prevData) {
          // Controlla cambio stato
          if (data.status !== prevData.status) {
            const statusMessages: Record<string, { title: string; message: string; type: 'success' | 'info' | 'warning'; icon: string }> = {
              'ASSIGNED': {
                title: '🚴 Ordine Assegnato',
                message: `Ordine per ${data.propertyName || 'proprietà'} assegnato a ${data.riderName || 'rider'}`,
                type: 'info',
                icon: '🚴'
              },
              'IN_PROGRESS': {
                title: '🚚 Consegna in Corso',
                message: `${data.riderName || 'Rider'} sta consegnando a ${data.propertyName || 'destinazione'}`,
                type: 'warning',
                icon: '🚚'
              },
              'DELIVERED': {
                title: '✅ Consegna Completata',
                message: `Ordine per ${data.propertyName || 'proprietà'} consegnato con successo!`,
                type: 'success',
                icon: '📦'
              },
            };

            const statusConfig = statusMessages[data.status];
            if (statusConfig) {
              addToast(statusConfig);
            }
          }
        }

        // Aggiorna stato precedente
        previousDataRef.current.set(`order-${change.doc.id}`, data);
      });
    });

    // Listener per pulizie
    const unsubCleanings = onSnapshot(collection(db, "cleanings"), (snapshot) => {
      if (isFirstLoadRef.current) {
        snapshot.docs.forEach(doc => {
          previousDataRef.current.set(`cleaning-${doc.id}`, doc.data());
        });
        isFirstLoadRef.current = false; // Dopo entrambi i listener
        return;
      }

      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        const prevData = previousDataRef.current.get(`cleaning-${change.doc.id}`);

        if (change.type === 'modified' && prevData) {
          if (data.status !== prevData.status) {
            const statusMessages: Record<string, { title: string; message: string; type: 'success' | 'info' | 'warning'; icon: string }> = {
              'ASSIGNED': {
                title: '🧹 Pulizia Assegnata',
                message: `Pulizia di ${data.propertyName || 'proprietà'} assegnata a ${data.operatorName || 'operatore'}`,
                type: 'info',
                icon: '🧹'
              },
              'IN_PROGRESS': {
                title: '▶️ Pulizia Iniziata',
                message: `${data.operatorName || 'Operatore'} ha iniziato la pulizia di ${data.propertyName || 'proprietà'}`,
                type: 'warning',
                icon: '🧼'
              },
              'COMPLETED': {
                title: '✨ Pulizia Completata',
                message: `Pulizia di ${data.propertyName || 'proprietà'} completata con successo!`,
                type: 'success',
                icon: '✨'
              },
            };

            const statusConfig = statusMessages[data.status];
            if (statusConfig) {
              addToast(statusConfig);
            }
          }
        }

        previousDataRef.current.set(`cleaning-${change.doc.id}`, data);
      });
    });

    // Listener per nuovi utenti
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && !isFirstLoadRef.current) {
          const data = change.doc.data();
          addToast({
            type: 'info',
            title: '👤 Nuovo Utente',
            message: `${data.name} ${data.surname || ''} si è registrato come ${data.role}`,
            icon: '👋'
          });
        }
      });
    });

    return () => {
      unsubOrders();
      unsubCleanings();
      unsubUsers();
    };
  }, [addToast]);
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
