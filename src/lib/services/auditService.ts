/**
 * AUDIT LOG SERVICE
 * 
 * Traccia OGNI operazione su pulizie e ordini biancheria in una collection Firestore `auditLog`.
 * Ogni entry contiene:
 * - Cosa è successo (action)
 * - Chi l'ha fatto (source: quale file/funzione)
 * - Quando (timestamp)
 * - Su cosa (entityType, entityId)
 * - Dettagli completi (before/after, motivo, contesto)
 * 
 * Usare così:
 *   import { auditLog } from '~/lib/services/auditService';
 *   await auditLog.cleaningCreated({ cleaningId, propertyName, source: 'cron/sync-ical:STEP2', ... });
 *   await auditLog.orderCreated({ orderId, cleaningId, source: 'cron/sync-ical:safety-net', ... });
 *   await auditLog.orderFailed({ cleaningId, propertyName, source: 'cron/sync-ical:STEP2', error: '...' });
 * 
 * Consultare:
 *   GET /api/admin/audit-log?entity=cleaning&entityId=XXX
 *   GET /api/admin/audit-log?propertyName=vittoria&days=7
 *   GET /api/admin/audit-log?action=ORDER_CREATE_FAILED&days=1
 */

import { adminDb } from '~/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

// ── Types ──────────────────────────────────────────────

interface AuditEntry {
  action: string;
  entityType: 'cleaning' | 'order' | 'booking';
  entityId: string | null;
  propertyId: string;
  propertyName: string;
  source: string;       // es: "cron/sync-ical:STEP2", "cron/sync-ical:safety-net", "sync-all-ical", "fix-missing-orders"
  details: Record<string, any>;
  timestamp: any;       // Firestore Timestamp
}

// ── Helper: write to Firestore (fire-and-forget, never throws) ──

async function writeLog(entry: Omit<AuditEntry, 'timestamp'>) {
  try {
    await adminDb.collection('auditLog').add({
      ...entry,
      timestamp: Timestamp.now(),
    });
  } catch (err: any) {
    // Never let audit logging break the main flow
    console.error(`[AUDIT] Failed to write log: ${err?.message || err}`);
  }
}

// ── Public API ──────────────────────────────────────────

export const auditLog = {

  // ═══════════════════════════════════════════════
  // CLEANING EVENTS
  // ═══════════════════════════════════════════════

  async cleaningCreated(params: {
    cleaningId: string;
    propertyId: string;
    propertyName: string;
    source: string;
    scheduledDate: string;
    bookingId?: string;
    guestsCount?: number;
    guestName?: string;
  }) {
    await writeLog({
      action: 'CLEANING_CREATED',
      entityType: 'cleaning',
      entityId: params.cleaningId,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      source: params.source,
      details: {
        scheduledDate: params.scheduledDate,
        bookingId: params.bookingId || null,
        guestsCount: params.guestsCount || null,
        guestName: params.guestName || null,
      },
    });
  },

  async cleaningDeleted(params: {
    cleaningId: string;
    propertyId: string;
    propertyName: string;
    source: string;
    scheduledDate: string;
    reason: string;
    bookingId?: string;
  }) {
    await writeLog({
      action: 'CLEANING_DELETED',
      entityType: 'cleaning',
      entityId: params.cleaningId,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      source: params.source,
      details: {
        scheduledDate: params.scheduledDate,
        reason: params.reason,
        bookingId: params.bookingId || null,
      },
    });
  },

  // ═══════════════════════════════════════════════
  // ORDER EVENTS
  // ═══════════════════════════════════════════════

  async orderCreated(params: {
    orderId: string;
    cleaningId: string;
    propertyId: string;
    propertyName: string;
    source: string;
    scheduledDate: string;
    itemsCount: number;
  }) {
    await writeLog({
      action: 'ORDER_CREATED',
      entityType: 'order',
      entityId: params.orderId,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      source: params.source,
      details: {
        cleaningId: params.cleaningId,
        scheduledDate: params.scheduledDate,
        itemsCount: params.itemsCount,
      },
    });
  },

  async orderSkipped(params: {
    cleaningId: string;
    propertyId: string;
    propertyName: string;
    source: string;
    scheduledDate: string;
    reason: string;
    existingOrderId?: string;
  }) {
    await writeLog({
      action: 'ORDER_SKIPPED',
      entityType: 'order',
      entityId: params.existingOrderId || null,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      source: params.source,
      details: {
        cleaningId: params.cleaningId,
        scheduledDate: params.scheduledDate,
        reason: params.reason,
        existingOrderId: params.existingOrderId || null,
      },
    });
  },

  async orderFailed(params: {
    cleaningId: string;
    propertyId: string;
    propertyName: string;
    source: string;
    scheduledDate: string;
    error: string;
    step?: string;
  }) {
    await writeLog({
      action: 'ORDER_CREATE_FAILED',
      entityType: 'order',
      entityId: null,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      source: params.source,
      details: {
        cleaningId: params.cleaningId,
        scheduledDate: params.scheduledDate,
        error: params.error,
        step: params.step || null,
      },
    });
  },

  async orderCancelled(params: {
    orderId: string;
    propertyId: string;
    propertyName: string;
    source: string;
    reason: string;
    cleaningId?: string;
  }) {
    await writeLog({
      action: 'ORDER_CANCELLED',
      entityType: 'order',
      entityId: params.orderId,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      source: params.source,
      details: {
        reason: params.reason,
        cleaningId: params.cleaningId || null,
      },
    });
  },

  // ═══════════════════════════════════════════════
  // BOOKING EVENTS
  // ═══════════════════════════════════════════════

  async bookingDeleted(params: {
    bookingId: string;
    propertyId: string;
    propertyName: string;
    source: string;
    reason: string;
    guestName?: string;
    checkIn?: string;
    checkOut?: string;
  }) {
    await writeLog({
      action: 'BOOKING_DELETED',
      entityType: 'booking',
      entityId: params.bookingId,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      source: params.source,
      details: {
        reason: params.reason,
        guestName: params.guestName || null,
        checkIn: params.checkIn || null,
        checkOut: params.checkOut || null,
      },
    });
  },

  // ═══════════════════════════════════════════════
  // SAFETY NET EVENTS
  // ═══════════════════════════════════════════════

  async safetyNetTriggered(params: {
    cleaningId: string;
    propertyId: string;
    propertyName: string;
    scheduledDate: string;
    result: 'created' | 'failed' | 'skipped';
    orderId?: string;
    error?: string;
    reason?: string;
  }) {
    await writeLog({
      action: 'SAFETY_NET_' + params.result.toUpperCase(),
      entityType: 'order',
      entityId: params.orderId || null,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      source: 'cron/sync-ical:safety-net',
      details: {
        cleaningId: params.cleaningId,
        scheduledDate: params.scheduledDate,
        result: params.result,
        orderId: params.orderId || null,
        error: params.error || null,
        reason: params.reason || null,
      },
    });
  },

  // ═══════════════════════════════════════════════
  // CRON LIFECYCLE
  // ═══════════════════════════════════════════════

  async cronPropertyStart(params: {
    propertyId: string;
    propertyName: string;
    activeSources: string[];
    cleaningsCount: number;
    ordersCount: number;
  }) {
    await writeLog({
      action: 'CRON_PROPERTY_START',
      entityType: 'cleaning',
      entityId: null,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      source: 'cron/sync-ical',
      details: {
        activeSources: params.activeSources,
        cleaningsCount: params.cleaningsCount,
        ordersCount: params.ordersCount,
      },
    });
  },

  async cronPropertySkipped(params: {
    propertyId: string;
    propertyName: string;
    reason: string;
  }) {
    await writeLog({
      action: 'CRON_PROPERTY_SKIPPED',
      entityType: 'cleaning',
      entityId: null,
      propertyId: params.propertyId,
      propertyName: params.propertyName,
      source: 'cron/sync-ical',
      details: { reason: params.reason },
    });
  },
};
