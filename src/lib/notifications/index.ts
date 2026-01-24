/**
 * Sistema Notifiche - Export centralizzato
 * 
 * Uso:
 * import { notifyUser, notifyRole, NOTIFICATION_TEMPLATES } from "~/lib/notifications";
 */

// Template e helper
export {
  NOTIFICATION_TEMPLATES,
  getNotificationContent,
  replaceVariables,
  formatAmount,
  formatDateIT,
  getMonthName,
  buildPaymentDueMessage,
  type NotificationTemplate,
  type NotificationVariables,
  type NotificationPriority,
} from "./notificationTemplates";

// Creazione notifiche
export {
  createNotification,
  createNotificationDirect,
  createNotificationAPI,
  type CreateNotificationParams,
  type NotificationResult,
} from "./createNotification";

// Notifica singolo utente
export {
  notifyUser,
  notifyOwner,
  notifyOperator,
  notifyRider,
  // Helper specifici
  notifyOwnerCleaningAssigned,
  notifyOwnerCleaningCompleted,
  notifyOwnerPaymentDue,
  notifyOwnerPaymentReceived,
  notifyOperatorCleaningAssigned,
  notifyRiderDeliveryAssigned,
  type NotifyUserParams,
} from "./notifyUser";

// Notifica per ruolo
export {
  notifyRole,
  notifyAllAdmins,
  notifyAllRiders,
  notifyAllOperators,
  // Helper specifici
  notifyAdminCleaningNotCompleted,
  notifyNewLaundryOrder,
  notifyAdminDeliveryCompleted,
  notifyAdminCleaningCompleted,
  type NotifyRoleParams,
  type NotifyRoleResult,
} from "./notifyRole";

// Push Notifications
export {
  sendPushNotification,
  sendPushToUser,
  sendPushToRole,
  // Helper specifici per push
  notifyCleaningAssigned,
  notifyNewProperty,
  notifyDeliveryAssigned,
  notifyCleaningCompleted,
  type PushNotificationPayload,
  type SendPushOptions,
  type SendPushResult,
} from "./sendPushNotification";
