/**
 * Utility per notificare un singolo utente
 */

import { createNotification, type CreateNotificationParams, type NotificationResult } from "./createNotification";
import type { NotificationVariables } from "./notificationTemplates";
import type { NotificationRecipientRole } from "~/lib/firebase/types";

// ==================== INTERFACCE ====================

export interface NotifyUserParams {
  userId: string;
  userRole: NotificationRecipientRole;
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
}

// ==================== FUNZIONE PRINCIPALE ====================

/**
 * Notifica un singolo utente specifico
 */
export async function notifyUser(params: NotifyUserParams): Promise<NotificationResult> {
  return createNotification({
    type: params.type,
    recipientRole: params.userRole,
    recipientId: params.userId,
    senderId: params.senderId || "system",
    senderName: params.senderName || "Sistema",
    variables: params.variables,
    relatedEntityId: params.relatedEntityId,
    relatedEntityType: params.relatedEntityType,
    relatedEntityName: params.relatedEntityName,
    link: params.link,
    customTitle: params.customTitle,
    customMessage: params.customMessage,
  });
}

// ==================== HELPER SPECIFICI PER TIPO UTENTE ====================

/**
 * Notifica un proprietario specifico
 */
export async function notifyOwner(
  ownerId: string,
  type: string,
  variables?: NotificationVariables,
  options?: {
    relatedEntityId?: string;
    relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER" | "ORDER" | "PAYMENT";
    relatedEntityName?: string;
    link?: string;
  }
): Promise<NotificationResult> {
  return notifyUser({
    userId: ownerId,
    userRole: "PROPRIETARIO",
    type,
    variables,
    ...options,
  });
}

/**
 * Notifica un operatore specifico
 */
export async function notifyOperator(
  operatorId: string,
  type: string,
  variables?: NotificationVariables,
  options?: {
    relatedEntityId?: string;
    relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER" | "ORDER" | "PAYMENT";
    relatedEntityName?: string;
    link?: string;
  }
): Promise<NotificationResult> {
  return notifyUser({
    userId: operatorId,
    userRole: "OPERATORE_PULIZIE",
    type,
    variables,
    ...options,
  });
}

/**
 * Notifica un rider specifico
 */
export async function notifyRider(
  riderId: string,
  type: string,
  variables?: NotificationVariables,
  options?: {
    relatedEntityId?: string;
    relatedEntityType?: "PROPERTY" | "CLEANING" | "BOOKING" | "USER" | "ORDER" | "PAYMENT";
    relatedEntityName?: string;
    link?: string;
  }
): Promise<NotificationResult> {
  return notifyUser({
    userId: riderId,
    userRole: "RIDER",
    type,
    variables,
    ...options,
  });
}

// ==================== NOTIFICHE SPECIFICHE ====================

/**
 * Notifica proprietario che la pulizia è stata assegnata
 */
export async function notifyOwnerCleaningAssigned(
  ownerId: string,
  propertyName: string,
  date: string,
  propertyId: string
): Promise<NotificationResult> {
  return notifyOwner(ownerId, "CLEANING_ASSIGNED_OWNER", {
    propertyName,
    date,
  }, {
    relatedEntityId: propertyId,
    relatedEntityType: "PROPERTY",
    relatedEntityName: propertyName,
    link: `/proprietario/proprieta/${propertyId}`,
  });
}

/**
 * Notifica proprietario che la pulizia è stata completata
 */
export async function notifyOwnerCleaningCompleted(
  ownerId: string,
  propertyName: string,
  operatorName: string,
  cleaningId: string
): Promise<NotificationResult> {
  return notifyOwner(ownerId, "CLEANING_COMPLETED", {
    propertyName,
    operatorName,
  }, {
    relatedEntityId: cleaningId,
    relatedEntityType: "CLEANING",
    relatedEntityName: propertyName,
    link: `/proprietario/pulizie`,
  });
}

/**
 * Notifica proprietario del pagamento dovuto (inizio mese)
 */
export async function notifyOwnerPaymentDue(
  ownerId: string,
  totalDue: string,
  previousDebt: string,
  currentMonth: string
): Promise<NotificationResult> {
  return notifyOwner(ownerId, "PAYMENT_DUE", {
    totalDue,
    previousDebt,
    currentMonth,
  }, {
    relatedEntityType: "PAYMENT",
    link: `/proprietario/pagamenti`,
  });
}

/**
 * Notifica proprietario del pagamento ricevuto
 */
export async function notifyOwnerPaymentReceived(
  ownerId: string,
  amount: string
): Promise<NotificationResult> {
  return notifyOwner(ownerId, "PAYMENT_RECEIVED", {
    amount,
  }, {
    relatedEntityType: "PAYMENT",
    link: `/proprietario/pagamenti`,
  });
}

/**
 * Notifica operatore che gli è stata assegnata una pulizia
 */
export async function notifyOperatorCleaningAssigned(
  operatorId: string,
  propertyName: string,
  date: string,
  cleaningId: string
): Promise<NotificationResult> {
  return notifyOperator(operatorId, "CLEANING_ASSIGNED", {
    propertyName,
    date,
  }, {
    relatedEntityId: cleaningId,
    relatedEntityType: "CLEANING",
    relatedEntityName: propertyName,
    link: `/operatore/pulizie/${cleaningId}`,
  });
}

/**
 * Notifica rider che gli è stata assegnata una consegna
 */
export async function notifyRiderDeliveryAssigned(
  riderId: string,
  propertyAddress: string,
  orderId: string
): Promise<NotificationResult> {
  return notifyRider(riderId, "LAUNDRY_ASSIGNED", {
    propertyAddress,
  }, {
    relatedEntityId: orderId,
    relatedEntityType: "ORDER",
    relatedEntityName: propertyAddress,
    link: `/rider`,
  });
}
