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
  writeBatch,
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

// 🚀 PERF: numero massimo di notifiche caricate nel feed/campanella.
// Prima i listener scaricavano TUTTA la collezione (migliaia di doc, ~14 MB)
// ad ogni apertura: saturava la connessione Firestore e bloccava la dashboard.
// La campanella mostra solo le più recenti, quindi un limit è più che sufficiente.
const NOTIFICATION_FEED_LIMIT = 100;

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
// 🚀 PERF: filtro server-side per recipientRole + ordinamento, invece di scaricare
//   l'intera collezione e filtrare in memoria. Il limit si applica SOLO se richiesto
//   (così "segna tutte come lette" / "elimina tutte" continuano a vedere l'elenco
//   completo delle notifiche admin, ma comunque filtrate per ruolo e non tutta la
//   collezione). Indice composito presente: recipientRole + createdAt DESC.
export async function getAdminNotifications(
  options?: { 
    unreadOnly?: boolean; 
    actionRequired?: boolean;
    limitCount?: number;
  }
): Promise<FirebaseNotification[]> {
  const base = query(
    collection(db, COLLECTION),
    where("recipientRole", "in", ["ADMIN", "ALL"]),
    orderBy("createdAt", "desc")
  );
  const q = options?.limitCount ? query(base, limit(options.limitCount)) : base;
  const snapshot = await getDocs(q);
  
  let notifications = snapshot.docs
    .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as FirebaseNotification));
  
  if (options?.unreadOnly) {
    notifications = notifications.filter(n => n.status === "UNREAD");
  }
  
  if (options?.actionRequired) {
    notifications = notifications.filter(n => n.actionRequired && n.actionStatus === "PENDING");
  }
  
  // Già ordinate dal server (createdAt desc). Nessun sort/limit client necessario.
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
    // 🔁 Coerente col listener: un admin segna come lette SOLO le notifiche
    //    broadcast e le proprie, non le copie fan-out degli altri admin
    //    (altrimenti le marcava lette prima ancora che le vedessero).
    if (recipientId) {
      notifications = notifications.filter(n => !n.recipientId || n.recipientId === recipientId);
    }
  } else {
    notifications = await getUserNotifications(
      recipientId || "", 
      recipientRole, 
      { unreadOnly: true }
    );
  }
  
  if (notifications.length === 0) return;
  
  // 🚀 PERF: writeBatch invece di N updateDoc paralleli
  //    - Prima: 99 round-trip a Firestore in parallelo → 30-40 sec di attesa,
  //      throttling lato client, possibile crash UI con grandi volumi
  //    - Ora: 1 round-trip per ogni batch di max 500 ops (limite Firestore)
  //      → tipicamente 1 round-trip totale, completamento in ~500ms
  const now = Timestamp.now();
  const BATCH_SIZE = 500; // Limite massimo writeBatch Firestore
  
  for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
    const chunk = notifications.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const n of chunk) {
      batch.update(doc(db, COLLECTION, n.id), {
        status: "READ",
        readAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
  }
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

// 🚀 PERF: prima anche questo faceva onSnapshot sull'intera collezione e filtrava
//   in memoria (recipientId OR ruolo). Ora due query bounded server-side che
//   coprono esattamente la stessa logica, unite client-side:
//     Q1: notifiche indirizzate proprio a questo utente (recipientId == userId)
//     Q2: notifiche di ruolo/ALL SENZA recipientId specifico
//   Entrambe ordinate per createdAt desc + limit. Indici già presenti:
//   recipientId+createdAt e recipientRole+createdAt.
export function subscribeToNotifications(
  recipientRole: string,
  recipientId: string | undefined,
  callback: (notifications: FirebaseNotification[]) => void
): Unsubscribe {
  const roleUpper = recipientRole.toUpperCase();

  let targeted: FirebaseNotification[] = [];
  let byRole: FirebaseNotification[] = [];

  const emit = () => {
    // Unisci, deduplica per id, ordina e taglia al limite
    const map = new Map<string, FirebaseNotification>();
    for (const n of targeted) map.set(n.id, n);
    for (const n of byRole) if (!map.has(n.id)) map.set(n.id, n);

    const merged = Array.from(map.values()).sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });

    callback(merged.slice(0, NOTIFICATION_FEED_LIMIT));
  };

  const unsubs: Unsubscribe[] = [];

  // Q1 — notifiche indirizzate a questo utente specifico
  if (recipientId) {
    unsubs.push(
      onSnapshot(
        query(
          collection(db, COLLECTION),
          where("recipientId", "==", recipientId),
          orderBy("createdAt", "desc"),
          limit(NOTIFICATION_FEED_LIMIT)
        ),
        (snapshot) => {
          targeted = snapshot.docs.map(
            doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as FirebaseNotification)
          );
          emit();
        },
        (error) => console.error("Errore listener notifiche (targeted):", error)
      )
    );
  }

  // Q2 — notifiche di ruolo o ALL. Teniamo solo quelle SENZA recipientId:
  //   una notifica con recipientId va mostrata SOLO al destinatario (gestita da Q1).
  unsubs.push(
    onSnapshot(
      query(
        collection(db, COLLECTION),
        where("recipientRole", "in", [roleUpper, "ALL"]),
        orderBy("createdAt", "desc"),
        limit(NOTIFICATION_FEED_LIMIT)
      ),
      (snapshot) => {
        byRole = snapshot.docs
          .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as FirebaseNotification))
          .filter(n => !n.recipientId);
        emit();
      },
      (error) => console.error("Errore listener notifiche (ruolo):", error)
    )
  );

  return () => unsubs.forEach(fn => fn());
}

// Listener specifico per admin
// 🚀 PERF (root cause latenza dashboard): prima questo listener faceva
//   onSnapshot(collection(db, "notifications")) SENZA filtri → scaricava l'INTERA
//   collezione (tutta la storia, ~14 MB) ad ogni apertura dell'app. Su una
//   connessione Firestore condivisa con gli altri listener della dashboard,
//   questo download enorme saturava il canale: ecco perché "tutto si aggiornava
//   insieme" solo dopo ~10s, quando finiva di arrivare la campanella.
//   ORA: filtro server-side (recipientRole in [ADMIN, ALL]) + ordinamento +
//   limit. Si scaricano solo le ~100 notifiche più recenti (pochi KB).
//   Indice composito già presente: notifications.recipientRole + createdAt DESC.
export function subscribeToAdminNotifications(
  callback: (notifications: FirebaseNotification[]) => void,
  adminUserId?: string
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COLLECTION),
      where("recipientRole", "in", ["ADMIN", "ALL"]),
      orderBy("createdAt", "desc"),
      limit(NOTIFICATION_FEED_LIMIT)
    ),
    (snapshot) => {
      // Già filtrate e ordinate dal server per ruolo.
      let notifications = snapshot.docs.map(
        doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as FirebaseNotification)
      );
      // 🔁 FIX DUPLICATI (03/08/2026): quasi tutte le route fanno FAN-OUT, cioè
      //    creano UNA notifica PER OGNI utente ADMIN, ciascuna col proprio
      //    recipientId. Questo listener però filtrava solo per recipientRole,
      //    quindi ogni admin vedeva TUTTE le copie: con 4 admin in anagrafica,
      //    la stessa notifica compariva 4 volte.
      //    Ora si tiene solo: (a) le notifiche broadcast, cioè SENZA
      //    recipientId (destinate a tutti gli admin), e (b) quelle indirizzate
      //    proprio a questo admin. Nessun contenuto va perso: la copia di ogni
      //    admin resta visibile al suo destinatario.
      //    Se adminUserId non è passato, il comportamento resta quello vecchio.
      if (adminUserId) {
        notifications = notifications.filter(
          n => !n.recipientId || n.recipientId === adminUserId
        );
      }
      callback(notifications);
    },
    (error) => {
      console.error("Errore listener notifiche admin:", error);
    }
  );
}
