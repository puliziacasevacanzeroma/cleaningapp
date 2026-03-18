/**
 * notifications-admin.ts
 * 
 * Versione Admin SDK delle funzioni di notifica per uso lato server (API routes).
 * Questo file è un mirror delle funzioni in notifications.ts ma usa firebase-admin
 * invece del Client SDK, per uso corretto nelle API routes.
 * 
 * Il file notifications.ts originale rimane invariato per il frontend (client-side).
 */

import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
// @ts-expect-error TODO-FIX: TS2305 Module '"~/types/notification"' has no exported member 'FirebaseNotification'.
import type { FirebaseNotification, NotificationType } from "~/types/notification";

const COLLECTION = "notifications";

// ─── Types ──────────────────────────────────────────────────────────

export interface CreateNotificationData {
  title: string;
  message: string;
  type: NotificationType | string;
  recipientRole: string;
  recipientId?: string;
  senderId?: string;
  senderName?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  relatedEntityName?: string;
  relatedType?: string;
  relatedId?: string;
  link?: string;
  actionRequired?: boolean;
  actionStatus?: string;
}

// ─── createNotification (Admin SDK) ─────────────────────────────────

export async function createNotification(data: CreateNotificationData): Promise<string> {
  const notificationData: Record<string, unknown> = {
    ...data,
    status: "UNREAD",
    actionRequired: data.actionRequired || false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  if (data.actionRequired) {
    notificationData.actionStatus = "PENDING";
  }

  const docRef = await adminDb.collection(COLLECTION).add(notificationData);

  // Invia push notification tramite API interna (non-blocking)
  try {
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

    fetch(`${baseUrl}/api/push/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-push-secret": process.env.CRON_SECRET || "",
      },
      body: JSON.stringify(pushPayload),
    })
      .then(res => res.json())
      .catch(err => console.warn("⚠️ Push fetch error:", err.message));
  } catch (pushError) {
    console.warn("⚠️ Errore push notification:", pushError);
  }

  return docRef.id;
}

// ─── createNewPropertyNotification (Admin SDK) ──────────────────────

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
    link: `/dashboard/proprieta/pending`,
  });
}

// ─── createDeletionRequestNotification (Admin SDK) ──────────────────

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
    relatedEntityId: propertyId,
    relatedEntityType: "PROPERTY",
    relatedEntityName: propertyName,
    actionRequired: true,
    link: `/dashboard/proprieta/${propertyId}`,
  });
}

// ─── createActionResultNotification (Admin SDK) ─────────────────────

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

// ─── getAdminNotifications (Admin SDK) ──────────────────────────────

export async function getAdminNotifications(
  limit_count: number = 50,
  includeArchived: boolean = false
): Promise<FirebaseNotification[]> {
  let q = adminDb.collection(COLLECTION)
    .where("recipientRole", "==", "ADMIN")
    .orderBy("createdAt", "desc")
    .limit(limit_count);

  if (!includeArchived) {
    q = adminDb.collection(COLLECTION)
      .where("recipientRole", "==", "ADMIN")
      .where("status", "!=", "ARCHIVED")
      .orderBy("createdAt", "desc")
      .limit(limit_count);
  }

  const snap = await q.get();
  return snap.docs.map(doc => ({
    id: doc.id,
    ...(doc.data() as Record<string, any>),
    createdAt: (doc.data() as Record<string, any>).createdAt?.toDate?.() || null,
    updatedAt: (doc.data() as Record<string, any>).updatedAt?.toDate?.() || null,
  })) as FirebaseNotification[];
}

// ─── getUserNotifications (Admin SDK) ───────────────────────────────

export async function getUserNotifications(
  userId: string,
  role: string,
  limit_count: number = 50,
  includeArchived: boolean = false
): Promise<FirebaseNotification[]> {
  // Notifiche personali (per recipientId)
  const personalSnap = await adminDb.collection(COLLECTION)
    .where("recipientId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(limit_count)
    .get();

  // Notifiche broadcast per ruolo
  const broadcastSnap = await adminDb.collection(COLLECTION)
    .where("recipientRole", "==", role)
    .orderBy("createdAt", "desc")
    .limit(limit_count)
    .get();

  const seen = new Set<string>();
  const all: FirebaseNotification[] = [];

  for (const doc of [...personalSnap.docs, ...broadcastSnap.docs]) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    const data = doc.data() as Record<string, any>;
    if (!includeArchived && data.status === "ARCHIVED") continue;
    all.push({
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || null,
      updatedAt: data.updatedAt?.toDate?.() || null,
    } as FirebaseNotification);
  }

  return all.sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bDate - aDate;
  }).slice(0, limit_count);
}

// ─── countUnreadNotifications (Admin SDK) ───────────────────────────

export async function countUnreadNotifications(
  userId: string,
  role: string
): Promise<number> {
  const snap = await adminDb.collection(COLLECTION)
    .where("recipientId", "==", userId)
    .where("status", "==", "UNREAD")
    .get();

  const broadcastSnap = await adminDb.collection(COLLECTION)
    .where("recipientRole", "==", role)
    .where("status", "==", "UNREAD")
    .get();

  const seen = new Set<string>();
  let count = 0;
  for (const doc of [...snap.docs, ...broadcastSnap.docs]) {
    if (!seen.has(doc.id)) {
      seen.add(doc.id);
      count++;
    }
  }
  return count;
}

// ─── countPendingRequests (Admin SDK) ───────────────────────────────

export async function countPendingRequests(): Promise<number> {
  const snap = await adminDb.collection(COLLECTION)
    .where("actionRequired", "==", true)
    .where("actionStatus", "==", "PENDING")
    .get();
  return snap.size;
}

// ─── getNotificationById (Admin SDK) ────────────────────────────────

export async function getNotificationById(id: string): Promise<FirebaseNotification | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return {
    id: doc.id,
    ...(doc.data() as Record<string, any>),
    createdAt: doc.data()?.createdAt?.toDate?.() || null,
    updatedAt: doc.data()?.updatedAt?.toDate?.() || null,
  } as FirebaseNotification;
}

// ─── markAsRead (Admin SDK) ─────────────────────────────────────────

export async function markAsRead(notificationId: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(notificationId).update({
    status: "READ",
    updatedAt: Timestamp.now(),
  });
}

// ─── markAllAsRead (Admin SDK) ──────────────────────────────────────

export async function markAllAsRead(
  userId: string,
  role: string
): Promise<void> {
  const snap = await adminDb.collection(COLLECTION)
    .where("recipientId", "==", userId)
    .where("status", "==", "UNREAD")
    .get();

  const broadcastSnap = await adminDb.collection(COLLECTION)
    .where("recipientRole", "==", role)
    .where("status", "==", "UNREAD")
    .get();

  const batch = adminDb.batch();
  const seen = new Set<string>();

  for (const doc of [...snap.docs, ...broadcastSnap.docs]) {
    if (!seen.has(doc.id)) {
      seen.add(doc.id);
      batch.update(doc.ref, { status: "READ", updatedAt: Timestamp.now() });
    }
  }

  await batch.commit();
}

// ─── archiveNotification (Admin SDK) ────────────────────────────────

export async function archiveNotification(notificationId: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(notificationId).update({
    status: "ARCHIVED",
    updatedAt: Timestamp.now(),
  });
}

// ─── deleteNotification (Admin SDK) ─────────────────────────────────

export async function deleteNotification(notificationId: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(notificationId).delete();
}

// ─── handleNotificationAction (Admin SDK) ───────────────────────────

export async function handleNotificationAction(
  notificationId: string,
  action: "approve" | "reject",
  adminNotes?: string
): Promise<{ notification: FirebaseNotification | null }> {
  const notifRef = adminDb.collection(COLLECTION).doc(notificationId);
  const notifSnap = await notifRef.get();

  if (!notifSnap.exists) {
    return { notification: null };
  }

  const data = notifSnap.data() as Record<string, any>;

  await notifRef.update({
    actionStatus: action === "approve" ? "APPROVED" : "REJECTED",
    actionResult: action,
    adminNotes: adminNotes || null,
    status: "READ",
    updatedAt: Timestamp.now(),
  });

  const updated = await notifRef.get();
  return {
    notification: {
      id: updated.id,
      ...(updated.data() as Record<string, any>),
      createdAt: updated.data()?.createdAt?.toDate?.() || null,
      updatedAt: updated.data()?.updatedAt?.toDate?.() || null,
    } as FirebaseNotification,
  };
}

// ─── deleteOldNotifications (Admin SDK) ─────────────────────────────

export async function deleteOldNotifications(daysOld: number = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  const cutoffTimestamp = Timestamp.fromDate(cutoff);

  const snap = await adminDb.collection(COLLECTION)
    .where("createdAt", "<", cutoffTimestamp)
    .get();

  const batch = adminDb.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  return snap.size;
}

// ─── createPropertyChangeRequestNotification (Admin SDK) ────────────

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
    link: `/dashboard/notifiche?tab=modifications`,
  });
}

// ─── createItemDiscontinuedNotification (Admin SDK) ─────────────────

export async function createItemDiscontinuedNotification(
  recipientId: string,
  itemName: string,
  propertyNames: string[],
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
