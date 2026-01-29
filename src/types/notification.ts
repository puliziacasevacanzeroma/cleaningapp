// Tipi di notifica
export type NotificationType =
  | 'CLEANING_ASSIGNED'      // Pulizia assegnata a operatore
  | 'CLEANING_STARTED'       // Pulizia iniziata
  | 'CLEANING_COMPLETED'     // Pulizia completata
  | 'CLEANING_ISSUE'         // Problema durante pulizia
  | 'ORDER_CREATED'          // Nuovo ordine biancheria
  | 'ORDER_ASSIGNED'         // Ordine assegnato a rider
  | 'ORDER_IN_PROGRESS'      // Rider in consegna
  | 'ORDER_DELIVERED'        // Consegna completata
  | 'USER_CREATED'           // Nuovo utente creato
  | 'USER_SUSPENDED'         // Utente sospeso
  | 'PROPERTY_ADDED'         // Nuova proprietà aggiunta
  | 'BOOKING_NEW'            // Nuova prenotazione (da iCal)
  | 'SYSTEM_ALERT';          // Avviso di sistema

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationStatus = 'unread' | 'read' | 'archived';

export type RelatedEntityType = 'cleaning' | 'order' | 'property' | 'user' | 'booking';

export interface Notification {
  id: string;
  type: NotificationType;
  recipientId: string;
  recipientRole: string;
  senderId?: string;
  senderName?: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  relatedEntityType?: RelatedEntityType;
  relatedEntityId?: string;
  actionUrl?: string;
  status: NotificationStatus;
  createdAt: Date;
  readAt?: Date | null;
  pushSent?: boolean;
  pushSentAt?: Date | null;
}

// Configurazione icone e colori per tipo notifica
export const notificationConfig: Record<NotificationType, {
  icon: string;
  color: string;
  bgColor: string;
  label: string;
}> = {
  CLEANING_ASSIGNED: {
    icon: '🧹',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    label: 'Pulizia Assegnata'
  },
  CLEANING_STARTED: {
    icon: '▶️',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    label: 'Pulizia Iniziata'
  },
  CLEANING_COMPLETED: {
    icon: '✅',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
    label: 'Pulizia Completata'
  },
  CLEANING_ISSUE: {
    icon: '⚠️',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    label: 'Problema Pulizia'
  },
  ORDER_CREATED: {
    icon: '📦',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    label: 'Nuovo Ordine'
  },
  ORDER_ASSIGNED: {
    icon: '🚴',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    label: 'Ordine Assegnato'
  },
  ORDER_IN_PROGRESS: {
    icon: '🚚',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    label: 'In Consegna'
  },
  ORDER_DELIVERED: {
    icon: '✅',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    label: 'Consegnato'
  },
  USER_CREATED: {
    icon: '👤',
    color: 'text-violet-600',
    bgColor: 'bg-violet-100',
    label: 'Nuovo Utente'
  },
  USER_SUSPENDED: {
    icon: '🚫',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    label: 'Utente Sospeso'
  },
  PROPERTY_ADDED: {
    icon: '🏠',
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
    label: 'Nuova Proprietà'
  },
  BOOKING_NEW: {
    icon: '📅',
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
    label: 'Nuova Prenotazione'
  },
  SYSTEM_ALERT: {
    icon: '🔔',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
    label: 'Avviso Sistema'
  }
};
