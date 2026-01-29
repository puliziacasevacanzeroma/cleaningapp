/**
 * Utility per notificare tutti gli utenti con un determinato ruolo
 */

import { 
  collection, 
  getDocs, 
  query, 
  where 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNotification, type NotificationResult } from "./createNotification";
import type { NotificationVariables } from "./notificationTemplates";
import type { NotificationRecipientRole } from "~/lib/firebase/types";

// ==================== INTERFACCE ====================

export interface NotifyRoleParams {
  role: NotificationRecipientRole;
  type: string;
  variables?: NotificationVariables;
  senderId?: string;
  senderName?: string;
  relatedEntityId?: string;
  relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER" | "ORDER" | "PAYMENT";
  relatedEntityName?: string;
  link?: string;
  customTitle?: string;
  customMessage?: string;
  // Se true, crea una notifica per ogni utente. Se false, crea una sola notifica per ruolo.
  individualNotifications?: boolean;
}

export interface NotifyRoleResult {
  success: boolean;
  totalUsers: number;
  notificationsSent: number;
  errors: string[];
}

// ==================== FUNZIONI ====================

/**
 * Ottiene tutti gli utenti attivi con un determinato ruolo
 */
async function getUsersByRole(role: NotificationRecipientRole): Promise<Array<{ id: string; name: string; email: string }>> {
  try {
    const usersRef = collection(db, "users");
    const q = query(
      usersRef,
      where("role", "==", role),
      where("status", "==", "ACTIVE")
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name || "Utente",
      email: doc.data().email || "",
    }));
  } catch (error) {
    console.error(`Errore recupero utenti con ruolo ${role}:`, error);
    return [];
  }
}

/**
 * Notifica tutti gli utenti con un determinato ruolo
 * 
 * @param params - Parametri della notifica
 * @returns Risultato dell'operazione con statistiche
 */
export async function notifyRole(params: NotifyRoleParams): Promise<NotifyRoleResult> {
  const {
    role,
    type,
    variables,
    senderId = "system",
    senderName = "Sistema",
    relatedEntityId,
    relatedEntityType,
    relatedEntityName,
    link,
    customTitle,
    customMessage,
    individualNotifications = false,
  } = params;

  const result: NotifyRoleResult = {
    success: true,
    totalUsers: 0,
    notificationsSent: 0,
    errors: [],
  };

  try {
    // Se non serve notifica individuale, crea una sola notifica per ruolo
    if (!individualNotifications) {
      const notificationResult = await createNotification({
        type,
        recipientRole: role,
        senderId,
        senderName,
        variables,
        relatedEntityId,
        relatedEntityType,
        relatedEntityName,
        link,
        customTitle,
        customMessage,
      });

      if (notificationResult.success) {
        result.notificationsSent = 1;
        console.log(`📬 Notifica [${type}] creata per ruolo ${role}`);
      } else {
        result.success = false;
        result.errors.push(notificationResult.error || "Errore sconosciuto");
      }

      return result;
    }

    // Altrimenti, crea una notifica per ogni utente con quel ruolo
    const users = await getUsersByRole(role);
    result.totalUsers = users.length;

    if (users.length === 0) {
      console.log(`⚠️ Nessun utente attivo con ruolo ${role}`);
      return result;
    }

    // Crea notifiche in parallelo (con limite per evitare sovraccarico)
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      
      const promises = batch.map(user => 
        createNotification({
          type,
          recipientRole: role,
          recipientId: user.id,
          senderId,
          senderName,
          variables,
          relatedEntityId,
          relatedEntityType,
          relatedEntityName,
          link,
          customTitle,
          customMessage,
        })
      );

      const results = await Promise.all(promises);

      results.forEach((res, index) => {
        if (res.success) {
          result.notificationsSent++;
        } else {
          result.errors.push(`Utente ${batch[index].id}: ${res.error}`);
        }
      });
    }

    console.log(`📬 Notifiche [${type}] inviate: ${result.notificationsSent}/${result.totalUsers} per ruolo ${role}`);

    if (result.errors.length > 0) {
      result.success = result.notificationsSent > 0;
    }

  } catch (error) {
    console.error("Errore notifyRole:", error);
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : "Errore sconosciuto");
  }

  return result;
}

// ==================== HELPER SPECIFICI ====================

/**
 * Notifica tutti gli admin
 */
export async function notifyAllAdmins(
  type: string,
  variables?: NotificationVariables,
  options?: {
    relatedEntityId?: string;
    relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER" | "ORDER" | "PAYMENT";
    relatedEntityName?: string;
    link?: string;
  }
): Promise<NotifyRoleResult> {
  return notifyRole({
    role: "ADMIN",
    type,
    variables,
    ...options,
  });
}

/**
 * Notifica tutti i rider attivi
 */
export async function notifyAllRiders(
  type: string,
  variables?: NotificationVariables,
  options?: {
    relatedEntityId?: string;
    relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER" | "ORDER" | "PAYMENT";
    relatedEntityName?: string;
    link?: string;
    individualNotifications?: boolean;
  }
): Promise<NotifyRoleResult> {
  return notifyRole({
    role: "RIDER",
    type,
    variables,
    ...options,
  });
}

/**
 * Notifica tutti gli operatori attivi
 */
export async function notifyAllOperators(
  type: string,
  variables?: NotificationVariables,
  options?: {
    relatedEntityId?: string;
    relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER" | "ORDER" | "PAYMENT";
    relatedEntityName?: string;
    link?: string;
    individualNotifications?: boolean;
  }
): Promise<NotifyRoleResult> {
  return notifyRole({
    role: "OPERATORE_PULIZIE",
    type,
    variables,
    ...options,
  });
}

// ==================== NOTIFICHE SPECIFICHE ====================

/**
 * Notifica admin che una pulizia non è stata completata (urgente)
 */
export async function notifyAdminCleaningNotCompleted(
  propertyName: string,
  cleaningId: string,
  propertyId: string
): Promise<NotifyRoleResult> {
  return notifyAllAdmins("CLEANING_NOT_COMPLETED", {
    propertyName,
  }, {
    relatedEntityId: cleaningId,
    relatedEntityType: "CLEANING",
    relatedEntityName: propertyName,
    link: `/dashboard/calendario/pulizie`,
  });
}

/**
 * Notifica admin e rider di un nuovo ordine biancheria
 */
export async function notifyNewLaundryOrder(
  propertyAddress: string,
  orderId: string
): Promise<{ admin: NotifyRoleResult; riders: NotifyRoleResult }> {
  const [adminResult, ridersResult] = await Promise.all([
    notifyAllAdmins("LAUNDRY_NEW", {
      propertyAddress,
    }, {
      relatedEntityId: orderId,
      relatedEntityType: "ORDER",
      relatedEntityName: propertyAddress,
      link: `/dashboard/ordini/${orderId}`,
    }),
    notifyAllRiders("LAUNDRY_NEW", {
      propertyAddress,
    }, {
      relatedEntityId: orderId,
      relatedEntityType: "ORDER",
      relatedEntityName: propertyAddress,
      link: `/rider`,
    }),
  ]);

  return {
    admin: adminResult,
    riders: ridersResult,
  };
}

/**
 * Notifica admin che una consegna è stata completata
 */
export async function notifyAdminDeliveryCompleted(
  propertyAddress: string,
  riderName: string,
  orderId: string
): Promise<NotifyRoleResult> {
  return notifyAllAdmins("LAUNDRY_DELIVERED", {
    propertyAddress,
    riderName,
  }, {
    relatedEntityId: orderId,
    relatedEntityType: "ORDER",
    relatedEntityName: propertyAddress,
    link: `/dashboard/ordini/${orderId}`,
  });
}

/**
 * Notifica admin che la pulizia è stata completata
 */
export async function notifyAdminCleaningCompleted(
  propertyName: string,
  operatorName: string,
  cleaningId: string
): Promise<NotifyRoleResult> {
  return notifyAllAdmins("CLEANING_COMPLETED", {
    propertyName,
    operatorName,
  }, {
    relatedEntityId: cleaningId,
    relatedEntityType: "CLEANING",
    relatedEntityName: propertyName,
    link: `/dashboard/calendario/pulizie`,
  });
}
