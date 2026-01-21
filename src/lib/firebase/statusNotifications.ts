import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// Tipi di notifica per cambio stato
type StatusChangeType = 
  | 'CLEANING_ASSIGNED'
  | 'CLEANING_STARTED'
  | 'CLEANING_COMPLETED'
  | 'ORDER_ASSIGNED'
  | 'ORDER_IN_PROGRESS'
  | 'ORDER_DELIVERED';

interface NotificationRecipient {
  id: string;
  role: string;
}

interface StatusChangeData {
  entityId: string;
  entityType: 'CLEANING' | 'ORDER';
  entityName: string;
  oldStatus: string;
  newStatus: string;
  actorId: string;
  actorName: string;
  propertyName?: string;
  additionalInfo?: string;
}

// Mappa stati a tipi notifica
function getNotificationType(entityType: string, newStatus: string): StatusChangeType | null {
  if (entityType === 'CLEANING') {
    switch (newStatus) {
      case 'ASSIGNED': return 'CLEANING_ASSIGNED';
      case 'IN_PROGRESS': return 'CLEANING_STARTED';
      case 'COMPLETED': return 'CLEANING_COMPLETED';
      default: return null;
    }
  }
  
  if (entityType === 'ORDER') {
    switch (newStatus) {
      case 'ASSIGNED': return 'ORDER_ASSIGNED';
      case 'IN_PROGRESS': return 'ORDER_IN_PROGRESS';
      case 'DELIVERED': return 'ORDER_DELIVERED';
      default: return null;
    }
  }
  
  return null;
}

// Genera titolo e messaggio per la notifica
function generateNotificationContent(type: StatusChangeType, data: StatusChangeData): { title: string; message: string } {
  const propertyInfo = data.propertyName ? ` per ${data.propertyName}` : '';
  
  switch (type) {
    case 'CLEANING_ASSIGNED':
      return {
        title: '🧹 Nuova Pulizia Assegnata',
        message: `Ti è stata assegnata una pulizia${propertyInfo}. ${data.additionalInfo || ''}`
      };
    case 'CLEANING_STARTED':
      return {
        title: '▶️ Pulizia Iniziata',
        message: `${data.actorName} ha iniziato la pulizia${propertyInfo}`
      };
    case 'CLEANING_COMPLETED':
      return {
        title: '✅ Pulizia Completata',
        message: `${data.actorName} ha completato la pulizia${propertyInfo}`
      };
    case 'ORDER_ASSIGNED':
      return {
        title: '📦 Nuovo Ordine Assegnato',
        message: `Ti è stato assegnato un ordine di consegna${propertyInfo}`
      };
    case 'ORDER_IN_PROGRESS':
      return {
        title: '🚚 Consegna in Corso',
        message: `${data.actorName} ha iniziato la consegna${propertyInfo}`
      };
    case 'ORDER_DELIVERED':
      return {
        title: '✅ Consegna Completata',
        message: `${data.actorName} ha completato la consegna${propertyInfo}`
      };
    default:
      return {
        title: 'Aggiornamento',
        message: `Stato aggiornato a ${data.newStatus}`
      };
  }
}

// Determina i destinatari della notifica
function getRecipients(type: StatusChangeType, data: StatusChangeData): NotificationRecipient[] {
  const recipients: NotificationRecipient[] = [];
  
  // L'admin riceve SEMPRE notifiche per cambi di stato importanti
  recipients.push({ id: 'all-admins', role: 'ADMIN' });
  
  // Notifiche specifiche per tipo
  switch (type) {
    case 'CLEANING_ASSIGNED':
      // L'operatore assegnato riceve la notifica
      // (il recipientId verrà passato separatamente)
      break;
    case 'CLEANING_STARTED':
    case 'CLEANING_COMPLETED':
      // Admin già incluso
      break;
    case 'ORDER_ASSIGNED':
      // Il rider assegnato riceve la notifica
      break;
    case 'ORDER_IN_PROGRESS':
    case 'ORDER_DELIVERED':
      // Admin già incluso
      break;
  }
  
  return recipients;
}

// ==================== FUNZIONE PRINCIPALE ====================

export async function createStatusChangeNotification(
  data: StatusChangeData,
  specificRecipientId?: string // ID specifico (es: operatore o rider assegnato)
): Promise<string[]> {
  const notificationType = getNotificationType(data.entityType, data.newStatus);
  
  if (!notificationType) {
    console.log('Nessuna notifica necessaria per questo cambio stato');
    return [];
  }
  
  const { title, message } = generateNotificationContent(notificationType, data);
  const recipients = getRecipients(notificationType, data);
  
  // Se c'è un destinatario specifico, aggiungilo
  if (specificRecipientId) {
    const role = data.entityType === 'CLEANING' ? 'OPERATORE_PULIZIE' : 'RIDER';
    recipients.push({ id: specificRecipientId, role });
  }
  
  const createdIds: string[] = [];
  
  // Crea una notifica per ogni destinatario
  for (const recipient of recipients) {
    try {
      const notificationData = {
        type: notificationType,
        title,
        message,
        recipientId: recipient.id === 'all-admins' ? undefined : recipient.id,
        recipientRole: recipient.role,
        senderId: data.actorId,
        senderName: data.actorName,
        relatedEntityId: data.entityId,
        relatedEntityType: data.entityType,
        relatedEntityName: data.entityName,
        actionRequired: false,
        status: 'UNREAD',
        link: data.entityType === 'CLEANING' 
          ? `/dashboard/pulizie/${data.entityId}`
          : `/dashboard/consegne/${data.entityId}`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      
      const docRef = await addDoc(collection(db, "notifications"), notificationData);
      createdIds.push(docRef.id);
      
      console.log(`📬 Notifica creata per ${recipient.role}:`, docRef.id);
    } catch (error) {
      console.error(`Errore creazione notifica per ${recipient.role}:`, error);
    }
  }
  
  return createdIds;
}

// ==================== HELPERS SPECIFICI ====================

// Notifica pulizia assegnata
export async function notifyCleaningAssigned(
  cleaningId: string,
  propertyName: string,
  operatorId: string,
  operatorName: string,
  adminId: string,
  adminName: string
): Promise<string[]> {
  return createStatusChangeNotification({
    entityId: cleaningId,
    entityType: 'CLEANING',
    entityName: `Pulizia ${propertyName}`,
    oldStatus: 'PENDING',
    newStatus: 'ASSIGNED',
    actorId: adminId,
    actorName: adminName,
    propertyName,
  }, operatorId);
}

// Notifica pulizia iniziata
export async function notifyCleaningStarted(
  cleaningId: string,
  propertyName: string,
  operatorId: string,
  operatorName: string
): Promise<string[]> {
  return createStatusChangeNotification({
    entityId: cleaningId,
    entityType: 'CLEANING',
    entityName: `Pulizia ${propertyName}`,
    oldStatus: 'ASSIGNED',
    newStatus: 'IN_PROGRESS',
    actorId: operatorId,
    actorName: operatorName,
    propertyName,
  });
}

// Notifica pulizia completata
export async function notifyCleaningCompleted(
  cleaningId: string,
  propertyName: string,
  operatorId: string,
  operatorName: string
): Promise<string[]> {
  return createStatusChangeNotification({
    entityId: cleaningId,
    entityType: 'CLEANING',
    entityName: `Pulizia ${propertyName}`,
    oldStatus: 'IN_PROGRESS',
    newStatus: 'COMPLETED',
    actorId: operatorId,
    actorName: operatorName,
    propertyName,
  });
}

// Notifica ordine assegnato
export async function notifyOrderAssigned(
  orderId: string,
  propertyName: string,
  riderId: string,
  riderName: string,
  adminId: string,
  adminName: string
): Promise<string[]> {
  return createStatusChangeNotification({
    entityId: orderId,
    entityType: 'ORDER',
    entityName: `Consegna ${propertyName}`,
    oldStatus: 'PENDING',
    newStatus: 'ASSIGNED',
    actorId: adminId,
    actorName: adminName,
    propertyName,
  }, riderId);
}

// Notifica ordine in consegna
export async function notifyOrderInProgress(
  orderId: string,
  propertyName: string,
  riderId: string,
  riderName: string
): Promise<string[]> {
  return createStatusChangeNotification({
    entityId: orderId,
    entityType: 'ORDER',
    entityName: `Consegna ${propertyName}`,
    oldStatus: 'ASSIGNED',
    newStatus: 'IN_PROGRESS',
    actorId: riderId,
    actorName: riderName,
    propertyName,
  });
}

// Notifica ordine consegnato
export async function notifyOrderDelivered(
  orderId: string,
  propertyName: string,
  riderId: string,
  riderName: string
): Promise<string[]> {
  return createStatusChangeNotification({
    entityId: orderId,
    entityType: 'ORDER',
    entityName: `Consegna ${propertyName}`,
    oldStatus: 'IN_PROGRESS',
    newStatus: 'DELIVERED',
    actorId: riderId,
    actorName: riderName,
    propertyName,
  });
}
