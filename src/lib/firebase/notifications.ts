import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./config";
import type { 
  FirebaseNotification, 
  NotificationType, 
  NotificationRecipientRole,
  NotificationActionStatus 
} from "./types";

const COLLECTION = "notifications";

// ==================== CREATE ====================

export interface CreateNotificationData {
  title: string;
  message: string;
  type: NotificationType;
  recipientRole: NotificationRecipientRole;
  recipientId?: string;
  senderId: string;
  senderName: string;
  senderEmail?: string;
  relatedEntityId?: string;
  relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER";
  relatedEntityName?: string;
  actionRequired?: boolean;
  link?: string;
}

export async function createNotification(data: CreateNotificationData): Promise<string> {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...data,
    status: "UNREAD",
    actionRequired: data.actionRequired || false,
    actionStatus: data.actionRequired ? "PENDING" : undefined,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  
  console.log("📬 Notifica creata:", docRef.id);
  return docRef.id;
}

// Helper per creare notifica richiesta cancellazione proprietà
export async function createDeletionRequestNotification(
  propertyId: string,
  propertyName: string,
  senderId: string,
  senderName: string,
  senderEmail?: string
): Promise<string> {
  return createNotification({
    title: "Richiesta Disattivazione Proprietà",
    message: `${senderName} ha richiesto la disattivazione della proprietà "${propertyName}"`,
    type: "DELETION_REQUEST",
    recipientRole: "ADMIN",
    senderId,
    senderName,
    senderEmail,
    relatedEntityId: propertyId,
    relatedEntityType: "PROPERTY",
    relatedEntityName: propertyName,
    actionRequired: true,
    link: `/dashboard/proprieta/${propertyId}`,
  });
}

// Helper per creare notifica nuova proprietà da approvare
export async function createNewPropertyNotification(
  propertyId: string,
  propertyName: string,
  senderId: string,
  senderName: string
): Promise<string> {
  return createNotification({
    title: "Nuova Proprietà da Approvare",
    message: `${senderName} ha aggiunto una nuova proprietà: "${propertyName}"`,
    type: "NEW_PROPERTY",
    recipientRole: "ADMIN",
    senderId,
    senderName,
    relatedEntityId: propertyId,
    relatedEntityType: "PROPERTY",
    relatedEntityName: propertyName,
    actionRequired: true,
    link: `/dashboard/proprieta/${propertyId}`,
  });
}

// Helper per notificare risultato azione al proprietario
export async function createActionResultNotification(
  recipientId: string,
  propertyName: string,
  approved: boolean,
  adminNote?: string
): Promise<string> {
  return createNotification({
    title: approved ? "Richiesta Approvata" : "Richiesta Rifiutata",
    message: approved 
      ? `La tua richiesta per "${propertyName}" è stata approvata.${adminNote ? ` Note: ${adminNote}` : ''}`
      : `La tua richiesta per "${propertyName}" è stata rifiutata.${adminNote ? ` Motivo: ${adminNote}` : ''}`,
    type: approved ? "SUCCESS" : "WARNING",
    recipientRole: "PROPRIETARIO",
    recipientId,
    senderId: "system",
    senderName: "Sistema",
    relatedEntityType: "PROPERTY",
    relatedEntityName: propertyName,
    actionRequired: false,
  });
}

// ==================== READ ====================

export async function getNotificationById(id: string): Promise<FirebaseNotification | null> {
  const docRef = doc(db, COLLECTION, id);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as FirebaseNotification;
}

// Ottieni notifiche per admin (tutte quelle destinate ad ADMIN)
export async function getAdminNotifications(
  options?: { 
    unreadOnly?: boolean; 
    actionRequired?: boolean;
    limitCount?: number;
  }
): Promise<FirebaseNotification[]> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  
  let notifications = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as FirebaseNotification))
    .filter(n => n.recipientRole === "ADMIN" || n.recipientRole === "ALL");
  
  if (options?.unreadOnly) {
    notifications = notifications.filter(n => n.status === "UNREAD");
  }
  
  if (options?.actionRequired) {
    notifications = notifications.filter(n => n.actionRequired && n.actionStatus === "PENDING");
  }
  
  // Ordina per data decrescente
  notifications.sort((a, b) => {
    const dateA = a.createdAt?.toDate?.() || new Date(0);
    const dateB = b.createdAt?.toDate?.() || new Date(0);
    return dateB.getTime() - dateA.getTime();
  });
  
  if (options?.limitCount) {
    notifications = notifications.slice(0, options.limitCount);
  }
  
  return notifications;
}

// Ottieni notifiche per un utente specifico (per ruolo o ID)
export async function getUserNotifications(
  userId: string,
  userRole: string,
  options?: { 
    unreadOnly?: boolean; 
    limitCount?: number;
  }
): Promise<FirebaseNotification[]> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  
  let notifications = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as FirebaseNotification))
    .filter(n => 
      n.recipientId === userId || 
      n.recipientRole === userRole.toUpperCase() ||
      n.recipientRole === "ALL"
    );
  
  if (options?.unreadOnly) {
    notifications = notifications.filter(n => n.status === "UNREAD");
  }
  
  // Ordina per data decrescente
  notifications.sort((a, b) => {
    const dateA = a.createdAt?.toDate?.() || new Date(0);
    const dateB = b.createdAt?.toDate?.() || new Date(0);
    return dateB.getTime() - dateA.getTime();
  });
  
  if (options?.limitCount) {
    notifications = notifications.slice(0, options.limitCount);
  }
  
  return notifications;
}

// Conta notifiche non lette
export async function countUnreadNotifications(
  recipientRole: string,
  recipientId?: string
): Promise<number> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  
  const unreadCount = snapshot.docs
    .map(doc => doc.data() as Omit<FirebaseNotification, 'id'>)
    .filter(n => 
      n.status === "UNREAD" &&
      (n.recipientId === recipientId || 
       n.recipientRole === recipientRole.toUpperCase() ||
       n.recipientRole === "ALL")
    ).length;
  
  return unreadCount;
}

// Conta richieste pendenti (per badge admin)
export async function countPendingRequests(): Promise<number> {
  const snapshot = await getDocs(collection(db, COLLECTION));
  
  const pendingCount = snapshot.docs
    .map(doc => doc.data() as Omit<FirebaseNotification, 'id'>)
    .filter(n => 
      n.actionRequired && 
      n.actionStatus === "PENDING" &&
      n.recipientRole === "ADMIN"
    ).length;
  
  return pendingCount;
}

// ==================== UPDATE ====================

export async function markAsRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, notificationId), {
    status: "READ",
    readAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function markAllAsRead(
  recipientRole: string,
  recipientId?: string
): Promise<void> {
  const notifications = await getUserNotifications(
    recipientId || "", 
    recipientRole, 
    { unreadOnly: true }
  );
  
  const updates = notifications.map(n => 
    updateDoc(doc(db, COLLECTION, n.id), {
      status: "READ",
      readAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  );
  
  await Promise.all(updates);
}

export async function archiveNotification(notificationId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, notificationId), {
    status: "ARCHIVED",
    updatedAt: Timestamp.now(),
  });
}

// Gestisci azione su notifica (approva/rifiuta)
export async function handleNotificationAction(
  notificationId: string,
  action: "APPROVED" | "REJECTED",
  adminId: string,
  note?: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, notificationId), {
    actionStatus: action,
    actionNote: note || null,
    actionBy: adminId,
    actionAt: Timestamp.now(),
    status: "READ",
    readAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

// ==================== DELETE ====================

export async function deleteNotification(notificationId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, notificationId));
}

// Elimina notifiche vecchie (più di X giorni)
export async function deleteOldNotifications(daysOld: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const snapshot = await getDocs(collection(db, COLLECTION));
  
  const oldNotifications = snapshot.docs.filter(doc => {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate?.();
    return createdAt && createdAt < cutoffDate && data.status !== "UNREAD";
  });
  
  await Promise.all(oldNotifications.map(doc => deleteDoc(doc.ref)));
  
  return oldNotifications.length;
}

// ==================== REAL-TIME LISTENER ====================

export function subscribeToNotifications(
  recipientRole: string,
  recipientId: string | undefined,
  callback: (notifications: FirebaseNotification[]) => void
): Unsubscribe {
  // Listener real-time sulla collezione
  return onSnapshot(
    collection(db, COLLECTION),
    (snapshot) => {
      const notifications = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as FirebaseNotification))
        .filter(n => 
          n.recipientId === recipientId || 
          n.recipientRole === recipientRole.toUpperCase() ||
          n.recipientRole === "ALL"
        )
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
      
      callback(notifications);
    },
    (error) => {
      console.error("Errore listener notifiche:", error);
    }
  );
}

// Listener specifico per admin
export function subscribeToAdminNotifications(
  callback: (notifications: FirebaseNotification[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, COLLECTION),
    (snapshot) => {
      const notifications = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as FirebaseNotification))
        .filter(n => n.recipientRole === "ADMIN" || n.recipientRole === "ALL")
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
      
      callback(notifications);
    },
    (error) => {
      console.error("Errore listener notifiche admin:", error);
    }
  );
}
