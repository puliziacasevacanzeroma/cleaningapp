"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { useAuth } from "~/lib/firebase/AuthContext";

// ==================== TIPI ====================

export interface NotificationPreference {
  enabled: boolean;      // Ricevi questa notifica?
  showToast: boolean;    // Mostra toast popup?
  playSound: boolean;    // Riproduci suono?
}

export interface NotificationPreferences {
  // Impostazioni globali
  globalToastEnabled: boolean;
  globalSoundEnabled: boolean;
  
  // Preferenze per tipo di notifica
  types: {
    // Pulizie
    CLEANING_ASSIGNED: NotificationPreference;
    CLEANING_COMPLETED: NotificationPreference;
    CLEANING_NOT_COMPLETED: NotificationPreference;
    CLEANING_STARTED: NotificationPreference;
    
    // Biancheria
    LAUNDRY_NEW: NotificationPreference;
    LAUNDRY_ASSIGNED: NotificationPreference;
    LAUNDRY_IN_TRANSIT: NotificationPreference;
    LAUNDRY_DELIVERED: NotificationPreference;
    
    // Proprietà
    NEW_PROPERTY: NotificationPreference;
    DELETION_REQUEST: NotificationPreference;
    PROPERTY_APPROVED: NotificationPreference;
    PROPERTY_REJECTED: NotificationPreference;
    
    // Pagamenti
    PAYMENT_DUE: NotificationPreference;
    PAYMENT_RECEIVED: NotificationPreference;
    PAYMENT_OVERDUE: NotificationPreference;
    
    // Prenotazioni
    BOOKING_NEW: NotificationPreference;
    BOOKING_CANCELLED: NotificationPreference;
    
    // Sistema
    SYSTEM: NotificationPreference;
    WARNING: NotificationPreference;
    ERROR: NotificationPreference;
  };
}

// ==================== DEFAULTS ====================

const DEFAULT_PREFERENCE: NotificationPreference = {
  enabled: true,
  showToast: true,
  playSound: true,
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  globalToastEnabled: true,
  globalSoundEnabled: true,
  types: {
    // Pulizie
    CLEANING_ASSIGNED: { ...DEFAULT_PREFERENCE },
    CLEANING_COMPLETED: { ...DEFAULT_PREFERENCE },
    CLEANING_NOT_COMPLETED: { ...DEFAULT_PREFERENCE, playSound: true }, // Sempre con suono
    CLEANING_STARTED: { ...DEFAULT_PREFERENCE },
    
    // Biancheria
    LAUNDRY_NEW: { ...DEFAULT_PREFERENCE },
    LAUNDRY_ASSIGNED: { ...DEFAULT_PREFERENCE },
    LAUNDRY_IN_TRANSIT: { ...DEFAULT_PREFERENCE, showToast: false }, // Solo campanella di default
    LAUNDRY_DELIVERED: { ...DEFAULT_PREFERENCE },
    
    // Proprietà
    NEW_PROPERTY: { ...DEFAULT_PREFERENCE },
    DELETION_REQUEST: { ...DEFAULT_PREFERENCE },
    PROPERTY_APPROVED: { ...DEFAULT_PREFERENCE },
    PROPERTY_REJECTED: { ...DEFAULT_PREFERENCE },
    
    // Pagamenti
    PAYMENT_DUE: { ...DEFAULT_PREFERENCE },
    PAYMENT_RECEIVED: { ...DEFAULT_PREFERENCE },
    PAYMENT_OVERDUE: { ...DEFAULT_PREFERENCE },
    
    // Prenotazioni
    BOOKING_NEW: { ...DEFAULT_PREFERENCE },
    BOOKING_CANCELLED: { ...DEFAULT_PREFERENCE },
    
    // Sistema
    SYSTEM: { ...DEFAULT_PREFERENCE, showToast: false },
    WARNING: { ...DEFAULT_PREFERENCE },
    ERROR: { ...DEFAULT_PREFERENCE },
  },
};

// ==================== LABELS PER UI ====================

export const NOTIFICATION_TYPE_LABELS: Record<string, { label: string; description: string; category: string; icon: string }> = {
  // Pulizie
  CLEANING_ASSIGNED: { 
    label: "Pulizia assegnata", 
    description: "Quando una pulizia viene assegnata a un operatore",
    category: "Pulizie",
    icon: "🧹"
  },
  CLEANING_COMPLETED: { 
    label: "Pulizia completata", 
    description: "Quando un operatore completa una pulizia",
    category: "Pulizie",
    icon: "✨"
  },
  CLEANING_NOT_COMPLETED: { 
    label: "Pulizia non completata", 
    description: "Pulizia non completata entro le 18:00 (urgente)",
    category: "Pulizie",
    icon: "⚠️"
  },
  CLEANING_STARTED: { 
    label: "Pulizia iniziata", 
    description: "Quando un operatore inizia una pulizia",
    category: "Pulizie",
    icon: "▶️"
  },
  
  // Biancheria
  LAUNDRY_NEW: { 
    label: "Nuovo ordine biancheria", 
    description: "Quando viene creato un nuovo ordine",
    category: "Biancheria",
    icon: "📦"
  },
  LAUNDRY_ASSIGNED: { 
    label: "Consegna assegnata", 
    description: "Quando un ordine viene assegnato a un rider",
    category: "Biancheria",
    icon: "🚚"
  },
  LAUNDRY_IN_TRANSIT: { 
    label: "Consegna in corso", 
    description: "Quando la consegna è in transito",
    category: "Biancheria",
    icon: "🚚"
  },
  LAUNDRY_DELIVERED: { 
    label: "Consegna completata", 
    description: "Quando la consegna è stata effettuata",
    category: "Biancheria",
    icon: "✅"
  },
  
  // Proprietà
  NEW_PROPERTY: { 
    label: "Nuova proprietà", 
    description: "Quando un proprietario aggiunge una nuova proprietà",
    category: "Proprietà",
    icon: "🏠"
  },
  DELETION_REQUEST: { 
    label: "Richiesta disattivazione", 
    description: "Quando un proprietario richiede la disattivazione",
    category: "Proprietà",
    icon: "🗑️"
  },
  PROPERTY_APPROVED: { 
    label: "Proprietà approvata", 
    description: "Conferma approvazione proprietà",
    category: "Proprietà",
    icon: "✅"
  },
  PROPERTY_REJECTED: { 
    label: "Proprietà rifiutata", 
    description: "Notifica rifiuto proprietà",
    category: "Proprietà",
    icon: "❌"
  },
  
  // Pagamenti
  PAYMENT_DUE: { 
    label: "Pagamento dovuto", 
    description: "Riepilogo mensile pagamenti",
    category: "Pagamenti",
    icon: "💰"
  },
  PAYMENT_RECEIVED: { 
    label: "Pagamento ricevuto", 
    description: "Conferma ricezione pagamento",
    category: "Pagamenti",
    icon: "✅"
  },
  PAYMENT_OVERDUE: { 
    label: "Pagamento scaduto", 
    description: "Avviso pagamento non ricevuto",
    category: "Pagamenti",
    icon: "🚨"
  },
  
  // Prenotazioni
  BOOKING_NEW: { 
    label: "Nuova prenotazione", 
    description: "Quando arriva una nuova prenotazione",
    category: "Prenotazioni",
    icon: "📅"
  },
  BOOKING_CANCELLED: { 
    label: "Prenotazione cancellata", 
    description: "Quando una prenotazione viene cancellata",
    category: "Prenotazioni",
    icon: "❌"
  },
  
  // Sistema
  SYSTEM: { 
    label: "Notifiche di sistema", 
    description: "Messaggi generali del sistema",
    category: "Sistema",
    icon: "ℹ️"
  },
  WARNING: { 
    label: "Avvisi", 
    description: "Avvisi importanti",
    category: "Sistema",
    icon: "⚠️"
  },
  ERROR: { 
    label: "Errori", 
    description: "Notifiche di errore",
    category: "Sistema",
    icon: "❌"
  },
};

// Raggruppa per categoria
export const NOTIFICATION_CATEGORIES = [
  { id: "Pulizie", icon: "🧹", types: ["CLEANING_ASSIGNED", "CLEANING_COMPLETED", "CLEANING_NOT_COMPLETED", "CLEANING_STARTED"] },
  { id: "Biancheria", icon: "📦", types: ["LAUNDRY_NEW", "LAUNDRY_ASSIGNED", "LAUNDRY_IN_TRANSIT", "LAUNDRY_DELIVERED"] },
  { id: "Proprietà", icon: "🏠", types: ["NEW_PROPERTY", "DELETION_REQUEST", "PROPERTY_APPROVED", "PROPERTY_REJECTED"] },
  { id: "Pagamenti", icon: "💰", types: ["PAYMENT_DUE", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE"] },
  { id: "Prenotazioni", icon: "📅", types: ["BOOKING_NEW", "BOOKING_CANCELLED"] },
  { id: "Sistema", icon: "⚙️", types: ["SYSTEM", "WARNING", "ERROR"] },
];

// ==================== STORAGE KEYS ====================

const STORAGE_KEY = "notification_preferences";

// ==================== HOOK ====================

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Carica preferenze all'avvio
  useEffect(() => {
    loadPreferences();
  }, [user?.id]);

  // Carica da localStorage prima, poi da Firestore
  const loadPreferences = useCallback(async () => {
    setLoading(true);
    
    try {
      // 1. Prova localStorage (più veloce)
      const localData = localStorage.getItem(STORAGE_KEY);
      if (localData) {
        const parsed = JSON.parse(localData);
        setPreferences(mergeWithDefaults(parsed));
      }

      // 2. Se utente loggato, carica da Firestore
      if (user?.id) {
        const docRef = doc(db, "userSettings", user.id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const firestoreData = docSnap.data().notificationPreferences;
          if (firestoreData) {
            const merged = mergeWithDefaults(firestoreData);
            setPreferences(merged);
            // Aggiorna localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          }
        }
      }
    } catch (error) {
      console.error("Errore caricamento preferenze:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Merge con defaults per gestire nuovi tipi di notifica
  const mergeWithDefaults = (data: Partial<NotificationPreferences>): NotificationPreferences => {
    return {
      globalToastEnabled: data.globalToastEnabled ?? DEFAULT_PREFERENCES.globalToastEnabled,
      globalSoundEnabled: data.globalSoundEnabled ?? DEFAULT_PREFERENCES.globalSoundEnabled,
      types: {
        ...DEFAULT_PREFERENCES.types,
        ...(data.types || {}),
      },
    };
  };

  // Salva preferenze
  const savePreferences = useCallback(async (newPreferences: NotificationPreferences) => {
    setSaving(true);
    
    try {
      // 1. Salva in localStorage (immediato)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences));
      setPreferences(newPreferences);

      // 2. Salva in Firestore (persistente)
      if (user?.id) {
        const docRef = doc(db, "userSettings", user.id);
        await setDoc(docRef, {
          notificationPreferences: newPreferences,
          updatedAt: new Date(),
        }, { merge: true });
      }

      console.log("✅ Preferenze notifiche salvate");
    } catch (error) {
      console.error("Errore salvataggio preferenze:", error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [user?.id]);

  // Helper: Aggiorna singola preferenza
  const updateTypePreference = useCallback((
    type: keyof NotificationPreferences["types"],
    field: keyof NotificationPreference,
    value: boolean
  ) => {
    const newPreferences = {
      ...preferences,
      types: {
        ...preferences.types,
        [type]: {
          ...preferences.types[type],
          [field]: value,
        },
      },
    };
    savePreferences(newPreferences);
  }, [preferences, savePreferences]);

  // Helper: Toggle globale toast
  const toggleGlobalToast = useCallback((enabled: boolean) => {
    const newPreferences = {
      ...preferences,
      globalToastEnabled: enabled,
    };
    savePreferences(newPreferences);
  }, [preferences, savePreferences]);

  // Helper: Toggle globale suono
  const toggleGlobalSound = useCallback((enabled: boolean) => {
    const newPreferences = {
      ...preferences,
      globalSoundEnabled: enabled,
    };
    savePreferences(newPreferences);
  }, [preferences, savePreferences]);

  // Helper: Abilita/disabilita tutti i toast per una categoria
  const toggleCategoryToast = useCallback((category: string, enabled: boolean) => {
    const categoryConfig = NOTIFICATION_CATEGORIES.find(c => c.id === category);
    if (!categoryConfig) return;

    const newTypes = { ...preferences.types };
    categoryConfig.types.forEach(type => {
      if (newTypes[type as keyof typeof newTypes]) {
        newTypes[type as keyof typeof newTypes] = {
          ...newTypes[type as keyof typeof newTypes],
          showToast: enabled,
        };
      }
    });

    savePreferences({
      ...preferences,
      types: newTypes,
    });
  }, [preferences, savePreferences]);

  // Helper: Controlla se deve mostrare toast per un tipo
  const shouldShowToast = useCallback((type: string): boolean => {
    if (!preferences.globalToastEnabled) return false;
    
    const typePref = preferences.types[type as keyof typeof preferences.types];
    if (!typePref) return true; // Default: mostra
    
    return typePref.enabled && typePref.showToast;
  }, [preferences]);

  // Helper: Controlla se deve riprodurre suono
  const shouldPlaySound = useCallback((type: string): boolean => {
    if (!preferences.globalSoundEnabled) return false;
    
    const typePref = preferences.types[type as keyof typeof preferences.types];
    if (!typePref) return true; // Default: suona
    
    return typePref.enabled && typePref.playSound;
  }, [preferences]);

  // Helper: Controlla se notifica è abilitata
  const isNotificationEnabled = useCallback((type: string): boolean => {
    const typePref = preferences.types[type as keyof typeof preferences.types];
    if (!typePref) return true; // Default: abilitata
    
    return typePref.enabled;
  }, [preferences]);

  // Reset alle impostazioni predefinite
  const resetToDefaults = useCallback(() => {
    savePreferences(DEFAULT_PREFERENCES);
  }, [savePreferences]);

  return {
    preferences,
    loading,
    saving,
    
    // Azioni
    savePreferences,
    updateTypePreference,
    toggleGlobalToast,
    toggleGlobalSound,
    toggleCategoryToast,
    resetToDefaults,
    
    // Helper
    shouldShowToast,
    shouldPlaySound,
    isNotificationEnabled,
  };
}

// Export per uso in altri componenti
export { DEFAULT_PREFERENCES };
