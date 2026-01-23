/**
 * Template per tutti i tipi di notifica
 * Ogni template ha titolo, messaggio con variabili {placeholder} e priorità
 */

import type { NotificationType, NotificationRecipientRole } from "~/lib/firebase/types";

// ==================== TIPI ====================

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface NotificationTemplate {
  title: string;
  message: string;
  priority: NotificationPriority;
  recipientRoles: NotificationRecipientRole[];
  icon?: string;
}

export interface NotificationVariables {
  propertyName?: string;
  propertyAddress?: string;
  operatorName?: string;
  riderName?: string;
  date?: string;
  time?: string;
  amount?: string;
  month?: string;
  year?: string;
  totalDue?: string;
  previousDebt?: string;
  currentMonth?: string;
  guestCount?: number;
  [key: string]: string | number | undefined;
}

// ==================== TEMPLATES ====================

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  // ========== PULIZIE ==========
  
  CLEANING_ASSIGNED: {
    title: "Nuova pulizia assegnata",
    message: "Ti è stata assegnata la pulizia di {propertyName} per il {date}",
    priority: "normal",
    recipientRoles: ["OPERATORE_PULIZIE"],
    icon: "🧹",
  },

  CLEANING_ASSIGNED_OWNER: {
    title: "Pulizia programmata",
    message: "La pulizia della tua proprietà {propertyName} è stata programmata per il {date}",
    priority: "normal",
    recipientRoles: ["PROPRIETARIO"],
    icon: "🧹",
  },

  CLEANING_COMPLETED: {
    title: "Pulizia completata",
    message: "La pulizia di {propertyName} è stata completata da {operatorName}",
    priority: "normal",
    recipientRoles: ["ADMIN", "PROPRIETARIO"],
    icon: "✨",
  },

  CLEANING_NOT_COMPLETED: {
    title: "⚠️ Pulizia non completata",
    message: "ATTENZIONE: La pulizia di {propertyName} programmata per oggi non è stata completata entro le 18:00",
    priority: "urgent",
    recipientRoles: ["ADMIN"], // Solo admin, non proprietario
    icon: "⚠️",
  },

  CLEANING_STARTED: {
    title: "Pulizia iniziata",
    message: "La pulizia di {propertyName} è iniziata",
    priority: "normal",
    recipientRoles: ["ADMIN"],
    icon: "▶️",
  },

  // ========== BIANCHERIA ==========

  LAUNDRY_NEW: {
    title: "Nuovo ordine biancheria",
    message: "Nuovo ordine biancheria disponibile per {propertyAddress}",
    priority: "high",
    recipientRoles: ["ADMIN", "RIDER"],
    icon: "📦",
  },

  LAUNDRY_ASSIGNED: {
    title: "Consegna assegnata",
    message: "Ti è stata assegnata la consegna per {propertyAddress}",
    priority: "normal",
    recipientRoles: ["RIDER"],
    icon: "🚚",
  },

  LAUNDRY_IN_TRANSIT: {
    title: "Consegna in corso",
    message: "La biancheria per {propertyAddress} è in consegna",
    priority: "normal",
    recipientRoles: ["ADMIN"],
    icon: "🚚",
  },

  LAUNDRY_DELIVERED: {
    title: "Consegna completata",
    message: "La biancheria per {propertyAddress} è stata consegnata da {riderName}",
    priority: "normal",
    recipientRoles: ["ADMIN"], // Solo admin, non proprietario
    icon: "✅",
  },

  // ========== PAGAMENTI ==========

  PAYMENT_DUE: {
    title: "💰 Riepilogo pagamento mensile",
    message: "Il totale da pagare per {currentMonth} è di €{totalDue}.{previousDebt} La scadenza è il 10 del mese.",
    priority: "high",
    recipientRoles: ["PROPRIETARIO"],
    icon: "💰",
  },

  PAYMENT_REMINDER: {
    title: "⏰ Promemoria pagamento",
    message: "Ricorda che hai un pagamento di €{amount} in scadenza. Mancano {daysLeft} giorni.",
    priority: "high",
    recipientRoles: ["PROPRIETARIO"],
    icon: "⏰",
  },

  PAYMENT_OVERDUE: {
    title: "🚨 Pagamento scaduto",
    message: "Il pagamento di €{amount} per {month} risulta scaduto. Ti preghiamo di regolarizzare la posizione.",
    priority: "urgent",
    recipientRoles: ["PROPRIETARIO"],
    icon: "🚨",
  },

  PAYMENT_RECEIVED: {
    title: "✅ Pagamento ricevuto",
    message: "Abbiamo ricevuto il tuo pagamento di €{amount}. Grazie!",
    priority: "normal",
    recipientRoles: ["PROPRIETARIO"],
    icon: "✅",
  },

  // ========== PROPRIETÀ ==========

  NEW_PROPERTY: {
    title: "Nuova proprietà da approvare",
    message: "{ownerName} ha aggiunto una nuova proprietà: {propertyName}",
    priority: "normal",
    recipientRoles: ["ADMIN"],
    icon: "🏠",
  },

  PROPERTY_APPROVED: {
    title: "✅ Proprietà approvata",
    message: "La tua proprietà {propertyName} è stata approvata ed è ora attiva.",
    priority: "normal",
    recipientRoles: ["PROPRIETARIO"],
    icon: "✅",
  },

  PROPERTY_REJECTED: {
    title: "❌ Proprietà non approvata",
    message: "La tua proprietà {propertyName} non è stata approvata.{rejectReason}",
    priority: "normal",
    recipientRoles: ["PROPRIETARIO"],
    icon: "❌",
  },

  DELETION_REQUEST: {
    title: "Richiesta disattivazione proprietà",
    message: "{ownerName} ha richiesto la disattivazione della proprietà {propertyName}",
    priority: "normal",
    recipientRoles: ["ADMIN"],
    icon: "🗑️",
  },

  DELETION_APPROVED: {
    title: "Proprietà disattivata",
    message: "La tua richiesta di disattivazione per {propertyName} è stata approvata.",
    priority: "normal",
    recipientRoles: ["PROPRIETARIO"],
    icon: "✅",
  },

  DELETION_REJECTED: {
    title: "Richiesta disattivazione rifiutata",
    message: "La richiesta di disattivazione per {propertyName} è stata rifiutata.{rejectReason}",
    priority: "normal",
    recipientRoles: ["PROPRIETARIO"],
    icon: "❌",
  },

  // ========== PRENOTAZIONI ==========

  BOOKING_NEW: {
    title: "Nuova prenotazione",
    message: "Nuova prenotazione per {propertyName} dal {checkIn} al {checkOut}",
    priority: "normal",
    recipientRoles: ["PROPRIETARIO", "ADMIN"],
    icon: "📅",
  },

  BOOKING_CANCELLED: {
    title: "Prenotazione cancellata",
    message: "La prenotazione per {propertyName} dal {checkIn} è stata cancellata",
    priority: "normal",
    recipientRoles: ["PROPRIETARIO", "ADMIN"],
    icon: "❌",
  },

  // ========== SISTEMA ==========

  SYSTEM: {
    title: "Notifica di sistema",
    message: "{message}",
    priority: "normal",
    recipientRoles: ["ALL"],
    icon: "ℹ️",
  },

  INFO: {
    title: "Informazione",
    message: "{message}",
    priority: "low",
    recipientRoles: ["ALL"],
    icon: "ℹ️",
  },

  WARNING: {
    title: "⚠️ Attenzione",
    message: "{message}",
    priority: "high",
    recipientRoles: ["ALL"],
    icon: "⚠️",
  },

  SUCCESS: {
    title: "✅ Operazione completata",
    message: "{message}",
    priority: "normal",
    recipientRoles: ["ALL"],
    icon: "✅",
  },

  ERROR: {
    title: "❌ Errore",
    message: "{message}",
    priority: "urgent",
    recipientRoles: ["ALL"],
    icon: "❌",
  },
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Sostituisce le variabili {placeholder} nel template con i valori effettivi
 */
export function replaceVariables(text: string, variables: NotificationVariables): string {
  let result = text;
  
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(placeholder, String(value));
    }
  }
  
  // Rimuovi placeholder non sostituiti
  result = result.replace(/\{[^}]+\}/g, '');
  
  return result.trim();
}

/**
 * Ottiene il contenuto della notifica con le variabili sostituite
 */
export function getNotificationContent(
  type: string,
  variables: NotificationVariables
): { title: string; message: string; priority: NotificationPriority; icon?: string } {
  const template = NOTIFICATION_TEMPLATES[type];
  
  if (!template) {
    console.warn(`Template non trovato per tipo: ${type}`);
    return {
      title: "Notifica",
      message: variables.message || "Nuova notifica",
      priority: "normal",
    };
  }
  
  return {
    title: replaceVariables(template.title, variables),
    message: replaceVariables(template.message, variables),
    priority: template.priority,
    icon: template.icon,
  };
}

/**
 * Formatta l'importo in euro
 */
export function formatAmount(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

/**
 * Formatta la data in italiano
 */
export function formatDateIT(date: Date): string {
  return date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Ottiene il nome del mese in italiano
 */
export function getMonthName(month: number): string {
  const months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  return months[month] || '';
}

/**
 * Costruisce il messaggio per PAYMENT_DUE con debiti pregressi
 */
export function buildPaymentDueMessage(
  currentMonthTotal: number,
  previousDebt: number,
  monthName: string
): NotificationVariables {
  const totalDue = currentMonthTotal + previousDebt;
  
  let previousDebtText = '';
  if (previousDebt > 0) {
    previousDebtText = ` (Include €${formatAmount(previousDebt)} di debito pregresso.)`;
  }
  
  return {
    currentMonth: monthName,
    totalDue: formatAmount(totalDue),
    previousDebt: previousDebtText,
  };
}
