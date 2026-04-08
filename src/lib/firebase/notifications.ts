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
} from "firebase/firestore";
import { db } from "./config";
import type { Unsubscribe } from "firebase/firestore";
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
  relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER" | "ORDER" | "PAYMENT" | "ISSUE" | string;
  relatedEntityName?: string;
  actionRequired?: boolean;
  link?: string;
}

export async function createNotification(data: CreateNotificationData): Promise<string> {
  const notificationData: any = {
    ...data,
    status: "UNREAD",
    actionRequired: data.actionRequired || false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  
  // Aggiungi actionStatus solo se actionRequired è true
  if (data.actionRequired) {
    notificationData.actionStatus = "PENDING";
  }
  
  const docRef = await addDoc(collection(db, COLLECTION), notificationData);
  

  // Invia push notification tramite API interna
  try {
    const isServer = typeof window === "undefined";
    
    if (isServer) {
      const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "http://localhost:3000";
      const pushPayload = {
        title: data.title,
        body: data.message,
        recipientId: data.recipientId || null,
        recipientRole: data.recipientRole,
        data: {
          type: data.type,
          notificationId: docRef.id,
          ...(data.relatedEntityId && { relatedEntityId: data.relatedEntityId }),
          ...(data.link && { link: data.link }),
        },
      };

      // Chiama API interna per inviare push (non-blocking)
      fetch(`${baseUrl}/api/push/send`, {
        method: "POST",
        // @ts-expect-error TODO-FIX: TS2769 No overload matches this call.
        headers: { 
          "Content-Type": "application/json",
          "x-push-secret": process.env.CRON_SECRET ,
        },
        body: JSON.stringify(pushPayload),
      })
        .then(res => res.json())
        .catch(err => console.warn("⚠️ Push fetch error:", err.message));
    }
  } catch (pushError) {
    console.warn("⚠️ Errore push notification:", pushError);
  }

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
  changesDescription?: string,
  adminNote?: string
): Promise<string> {
  let message: string;
  
  if (approved) {
    message = changesDescription 
      ? `La tua richiesta per "${propertyName}" è stata approvata. Modifiche applicate: ${changesDescription}.`
      : `La tua richiesta per "${propertyName}" è stata approvata.`;
    if (adminNote) message += ` Note: ${adminNote}`;
  } else {
    message = `La tua richiesta per "${propertyName}" è stata rifiutata.`;
    if (adminNote) message += ` Motivo: ${adminNote}`;
  }
  
  return createNotification({
    title: approved ? "Richiesta Approvata ✅" : "Richiesta Rifiutata ❌",
    message,
    type: approved ? "SUCCESS" : "WARNING",
    recipientRole: "PROPRIETARIO",
    recipientId,
    senderId: "system",
    senderName: "Sistema",
    relatedEntityType: "PROPERTY",
    relatedEntityName: propertyName,
    actionRequired: false,
    link: `/proprietario/proprieta`,
  });
}

// 🆕 Helper per richiesta modifica ospiti/letti
export async function createPropertyChangeRequestNotification(
  propertyId: string,
  propertyName: string,
  senderId: string,
  senderName: string,
  changeType: "MAX_GUESTS" | "BEDS" | "PROPERTY_UPDATE",
  currentValue: string,
  requestedValue: string,
  reason?: string
): Promise<string> {
  let changeTypeLabel: string;
  let titleLabel: string;
  
  if (changeType === "MAX_GUESTS") {
    changeTypeLabel = "numero ospiti";
    titleLabel = "Ospiti";
  } else if (changeType === "BEDS") {
    changeTypeLabel = "configurazione letti";
    titleLabel = "Letti";
  } else {
    // PROPERTY_UPDATE - identifica cosa è cambiato dal confronto valori
    changeTypeLabel = "configurazione proprietà";
    titleLabel = "Proprietà";
  }
  
  return createNotification({
    title: `Richiesta Modifica ${titleLabel}`,
    message: `${senderName} ha richiesto la modifica della ${changeTypeLabel} per "${propertyName}": da ${currentValue} a ${requestedValue}${reason ? `. Motivo: ${reason}` : ''}`,
    type: "PROPERTY_CHANGE_REQUEST",
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

// 🆕 Helper per notifica articolo fuori produzione
export async function createItemDiscontinuedNotification(
  recipientId: string,
  itemName: string,
  propertyNames: string[]
): Promise<string> {
  return createNotification({
    title: "Articolo non più disponibile",
    message: `L'articolo "${itemName}" è stato rimosso dal catalogo ed è stato eliminato dalla configurazione delle seguenti proprietà: ${propertyNames.join(", ")}`,
    type: "WARNING",
    recipientRole: "PROPRIETARIO",
    recipientId,
    senderId: "system",
    senderName: "Sistema",
    actionRequired: false,
    link: `/proprietario/proprieta`,
  });
}

// ==================== READ ====================

export async function getNotificationById(id: string): Promise<FirebaseNotification | null> {
  const docRef = doc(db, COLLECTION, id);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...(docSnap.data() as Record<string, any>) } as FirebaseNotification;
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
    .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as FirebaseNotification))
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
    .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as FirebaseNotification))
    .filter(n => {
      // Se la notifica ha un recipientId specifico, mostrala SOLO a quell'utente
      if (n.recipientId) {
        return n.recipientId === userId;
      }
      // Se non ha recipientId, mostrala a tutti gli utenti del ruolo corrispondente
      return n.recipientRole === userRole.toUpperCase() || n.recipientRole === "ALL";
    });
  
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
  const isAdmin = recipientRole.toUpperCase() === "ADMIN";
  
  const unreadCount = snapshot.docs
    .map(doc => doc.data() as Omit<FirebaseNotification, 'id'>)
    .filter(n => {
      if (n.status !== "UNREAD") return false;
      
      // Per ADMIN: stessa logica di subscribeToAdminNotifications
      if (isAdmin) {
        return n.recipientRole === "ADMIN" || n.recipientRole === "ALL";
      }
      
      // Per altri ruoli: se la notifica ha un recipientId specifico, contala SOLO per quell'utente
      if (n.recipientId) {
        return n.recipientId === recipientId;
      }
      // Se non ha recipientId, contala per tutti gli utenti del ruolo corrispondente
      return n.recipientRole === recipientRole.toUpperCase() || n.recipientRole === "ALL";
    }).length;
  
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
  // Per ADMIN: usa la stessa logica del listener subscribeToAdminNotifications
  // che mostra TUTTE le notifiche destinate ad ADMIN (con o senza recipientId).
  // getUserNotifications non le trova tutte perché filtra per recipientId esatto,
  // escludendo quelle con recipientId di un altro admin.
  const isAdmin = recipientRole.toUpperCase() === "ADMIN";
  
  let notifications: FirebaseNotification[];
  
  if (isAdmin) {
    notifications = await getAdminNotifications({ unreadOnly: true });
  } else {
    notifications = await getUserNotifications(
      recipientId || "", 
      recipientRole, 
      { unreadOnly: true }
    );
  }
  
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
): Promise<{ type?: string; relatedEntityId?: string }> {
  // Prima leggo la notifica per ottenere i dati
  const notificationDoc = await getDoc(doc(db, COLLECTION, notificationId));
  const notificationData = notificationDoc.data();
  
  // Se è una richiesta di disattivazione, aggiorna la proprietà
  if (notificationData?.type === "DELETION_REQUEST" && notificationData?.propertyId) {
    const propertyRef = doc(db, "properties", notificationData.propertyId);
    
    if (action === "APPROVED") {
      await updateDoc(propertyRef, {
        status: "INACTIVE",
        deactivationRequested: false,
        deactivatedAt: Timestamp.now(),
        deactivatedBy: adminId,
      });
    } else {
      await updateDoc(propertyRef, {
        deactivationRequested: false,
      });
    }
  }
  
  // Aggiorna la notifica
  await updateDoc(doc(db, COLLECTION, notificationId), {
    actionStatus: action,
    actionNote: note || null,
    actionBy: adminId,
    actionAt: Timestamp.now(),
    status: "READ",
    readAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // Ritorna info per permettere al chiamante di gestire PROPERTY_CHANGE_REQUEST
  return {
    type: notificationData?.type,
    relatedEntityId: notificationData?.relatedEntityId,
  };
}

// ==================== DELETE ====================

export async function deleteNotification(notificationId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, notificationId));
}

// 🗑️ Elimina TUTTE le notifiche per un utente/ruolo
export async function deleteAllNotifications(
  recipientRole: string,
  recipientId?: string
): Promise<number> {
  // Per ADMIN: usa getAdminNotifications (stessa logica del listener)
  const isAdmin = recipientRole.toUpperCase() === "ADMIN";
  
  const notifications = isAdmin
    ? await getAdminNotifications()
    : await getUserNotifications(recipientId || "", recipientRole);
  
  await Promise.all(notifications.map(n => deleteDoc(doc(db, COLLECTION, n.id))));
  
  return notifications.length;
}

// Elimina notifiche vecchie (più di X giorni)
export async function deleteOldNotifications(daysOld: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const snapshot = await getDocs(collection(db, COLLECTION));
  
  const oldNotifications = snapshot.docs.filter(doc => {
    const data = doc.data() as Record<string, any>;
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
        .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as FirebaseNotification))
        .filter(n => {
          // Se la notifica ha un recipientId specifico, mostrala SOLO a quell'utente
          if (n.recipientId) {
            return n.recipientId === recipientId;
          }
          // Se non ha recipientId, mostrala a tutti gli utenti del ruolo corrispondente
          return n.recipientRole === recipientRole.toUpperCase() || n.recipientRole === "ALL";
        })
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
        .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as FirebaseNotification))
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
