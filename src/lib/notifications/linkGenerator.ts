/**
 * Link Generator per Notifiche
 * 
 * Genera link di navigazione corretti per ogni tipo di notifica e ruolo.
 * Questo è il SINGLE SOURCE OF TRUTH per tutti i link delle notifiche.
 */

export interface NotificationLinkParams {
  role: "ADMIN" | "PROPRIETARIO" | "OPERATORE_PULIZIE" | "RIDER";
  cleaningId?: string;
  propertyId?: string;
  orderId?: string;
  issueId?: string;
  date?: string;  // formato YYYY-MM-DD
}

// ========== ADMIN LINKS ==========

export function adminCleaningLink(cleaningId: string): string {
  return `/dashboard?openCleaning=${cleaningId}`;
}

export function adminCalendarLink(date?: string): string {
  return `/dashboard/calendario/pulizie${date ? `?date=${date}` : ''}`;
}

export function adminOrderLink(orderId?: string): string {
  return orderId ? `/dashboard/ordini/${orderId}` : `/dashboard/ordini`;
}

export function adminPropertyLink(propertyId?: string): string {
  return propertyId ? `/dashboard/proprieta/${propertyId}` : `/dashboard/proprieta`;
}

export function adminPendingLink(): string {
  return `/dashboard/proprieta/pending`;
}

export function adminIssueLink(issueId?: string): string {
  return `/dashboard/segnalazioni${issueId ? `?id=${issueId}` : ''}`;
}

export function adminUsersLink(): string {
  return `/dashboard/utenti`;
}

export function adminDashboardLink(): string {
  return `/dashboard`;
}

// ========== PROPRIETARIO LINKS ==========

export function ownerCleaningLink(cleaningId: string): string {
  return `/proprietario/pulizie?id=${cleaningId}`;
}

export function ownerPropertyLink(propertyId?: string): string {
  return propertyId ? `/proprietario/proprieta/${propertyId}` : `/proprietario/proprieta`;
}

export function ownerPropertyGuestsLink(propertyId: string): string {
  return `/proprietario/proprieta/${propertyId}?editGuests=true`;
}

export function ownerPaymentsLink(): string {
  return `/proprietario/pagamenti`;
}

export function ownerIssueLink(issueId?: string): string {
  return `/proprietario/segnalazioni${issueId ? `?id=${issueId}` : ''}`;
}

export function ownerDashboardLink(): string {
  return `/proprietario`;
}

// ========== OPERATORE LINKS ==========

export function operatorCleaningLink(cleaningId: string): string {
  return `/operatore/pulizie/${cleaningId}`;
}

export function operatorDashboardLink(): string {
  return `/operatore`;
}

// ========== RIDER LINKS ==========

export function riderOrderLink(orderId?: string): string {
  return `/rider${orderId ? `?order=${orderId}` : ''}`;
}

export function riderDashboardLink(): string {
  return `/rider`;
}

// ========== LINK RESOLVER ==========

/**
 * Risolve il link di una notifica dal campo `link` salvato.
 * Se non c'è un link, genera un fallback basato su tipo e ruolo.
 */
export function resolveNotificationLink(notification: {
  link?: string;
  type?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  relatedType?: string;
  relatedId?: string;
  recipientRole?: string;
}): string {
  // Se c'è un link esplicito, usalo
  if (notification.link) {
    return notification.link;
  }

  // Fallback: genera link dal tipo e dai dati
  const entityId = notification.relatedEntityId || notification.relatedId || '';
  const entityType = notification.relatedEntityType || notification.relatedType || '';
  const role = notification.recipientRole || '';
  const type = notification.type || '';

  // Basato su entityType
  if (entityType === 'CLEANING' || entityType === 'cleaning') {
    if (role === 'ADMIN') return entityId ? adminCleaningLink(entityId) : adminCalendarLink();
    if (role === 'PROPRIETARIO') return entityId ? ownerCleaningLink(entityId) : ownerDashboardLink();
    if (role === 'OPERATORE_PULIZIE') return entityId ? operatorCleaningLink(entityId) : operatorDashboardLink();
  }

  if (entityType === 'ORDER' || entityType === 'order') {
    if (role === 'ADMIN') return adminOrderLink(entityId);
    if (role === 'RIDER') return riderOrderLink(entityId);
  }

  if (entityType === 'PROPERTY' || entityType === 'property') {
    if (role === 'ADMIN') return adminPropertyLink(entityId);
    if (role === 'PROPRIETARIO') return ownerPropertyLink(entityId);
  }

  if (entityType === 'issue') {
    if (role === 'ADMIN') return adminIssueLink(entityId);
    if (role === 'PROPRIETARIO') return ownerIssueLink(entityId);
  }

  if (entityType === 'PAYMENT' || entityType === 'payment') {
    if (role === 'PROPRIETARIO') return ownerPaymentsLink();
  }

  // Fallback per tipo notifica
  if (type.includes('PAYMENT') || type.includes('payment')) {
    return role === 'PROPRIETARIO' ? ownerPaymentsLink() : adminDashboardLink();
  }

  if (type.includes('CLEANING') || type.includes('cleaning') || type.includes('pulizia')) {
    if (role === 'ADMIN') return adminCalendarLink();
    if (role === 'PROPRIETARIO') return ownerDashboardLink();
    if (role === 'OPERATORE_PULIZIE') return operatorDashboardLink();
  }

  if (type.includes('ORDER') || type.includes('LAUNDRY') || type.includes('LINEN')) {
    if (role === 'ADMIN') return adminOrderLink();
    if (role === 'RIDER') return riderDashboardLink();
  }

  // Fallback finale per ruolo
  switch (role) {
    case 'ADMIN': return adminDashboardLink();
    case 'PROPRIETARIO': return ownerDashboardLink();
    case 'OPERATORE_PULIZIE': return operatorDashboardLink();
    case 'RIDER': return riderDashboardLink();
    default: return '/';
  }
}
