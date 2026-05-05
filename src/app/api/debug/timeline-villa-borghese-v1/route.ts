/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Timeline forense COMPLETA di Villa Borghese 5 maggio
 * ════════════════════════════════════════════════════════════════════
 *
 * GET /api/debug/timeline-villa-borghese-v1?cronSecret=XXX
 *
 * Ricostruisce TUTTA la storia di:
 *   - cleaning dUbcBv1xAyOR8s9bHra1
 *   - order   3hZHMOOQTBOw9dvjAQAp
 *   - booking collegato (via cleaning.bookingId)
 *   - tutti gli auditLog collegati a quei doc
 *
 * Output: dump grezzo + timeline cronologica unificata
 * READ-ONLY assoluto.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLEANING_ID = "dUbcBv1xAyOR8s9bHra1";
const ORDER_ID = "3hZHMOOQTBOw9dvjAQAp";
const PROPERTY_ID = "vPQOVTmnCRy0oGBvXUkh";

// Converte un Timestamp/Date/string a ISO string (gestisce tutti i casi)
function tsToIso(ts: any): string | null {
  if (!ts) return null;
  try {
    if (typeof ts === "object" && typeof ts.toDate === "function") {
      return ts.toDate().toISOString();
    }
    if (ts instanceof Date) return ts.toISOString();
    if (typeof ts === "string") return ts;
    if (typeof ts === "number") return new Date(ts).toISOString();
    if (typeof ts === "object" && "_seconds" in ts) {
      return new Date(ts._seconds * 1000 + (ts._nanoseconds || 0) / 1e6).toISOString();
    }
  } catch {}
  return null;
}

// Sanitizza ricorsivamente un documento Firestore: converte Timestamp in ISO
function sanitize(obj: any, depth = 0): any {
  if (depth > 10) return "[max-depth]";
  if (obj == null) return obj;
  if (typeof obj !== "object") return obj;

  // Timestamp Firestore
  if (typeof (obj as any).toDate === "function") {
    return tsToIso(obj);
  }
  // Array
  if (Array.isArray(obj)) {
    return obj.map((v) => sanitize(v, depth + 1));
  }
  // Oggetto plain
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = sanitize(v, depth + 1);
  }
  return out;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret") || searchParams.get("secret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // ─── 1. Dump grezzo dei tre documenti ───
    const [cleaningDoc, orderDoc, propertyDoc] = await Promise.all([
      adminDb.collection("cleanings").doc(CLEANING_ID).get(),
      adminDb.collection("orders").doc(ORDER_ID).get(),
      adminDb.collection("properties").doc(PROPERTY_ID).get(),
    ]);

    const cleaning = cleaningDoc.exists
      ? { id: cleaningDoc.id, ...sanitize(cleaningDoc.data()) }
      : null;
    const order = orderDoc.exists
      ? { id: orderDoc.id, ...sanitize(orderDoc.data()) }
      : null;
    const property = propertyDoc.exists
      ? { id: propertyDoc.id, ...sanitize(propertyDoc.data()) }
      : null;

    // ─── 2. Recupera booking collegato ───
    let booking: any = null;
    const bookingId = cleaning?.bookingId;
    if (bookingId) {
      const bSnap = await adminDb.collection("bookings").doc(bookingId).get();
      if (bSnap.exists) {
        booking = { id: bSnap.id, ...sanitize(bSnap.data()) };
      }
    }

    // ─── 3. Recupera TUTTI gli auditLog collegati ───
    // Strategy: cerca per ogni entityId conosciuto + per propertyId nello stesso periodo
    const auditEntries: any[] = [];

    // 3a. Per cleaningId come entityId
    const cleaningAudits = await adminDb
      .collection("auditLog")
      .where("entityId", "==", CLEANING_ID)
      .get();
    cleaningAudits.docs.forEach((d) => {
      auditEntries.push({ id: d.id, ...sanitize(d.data()), _matchedBy: "entityId=cleaningId" });
    });

    // 3b. Per orderId come entityId
    const orderAudits = await adminDb
      .collection("auditLog")
      .where("entityId", "==", ORDER_ID)
      .get();
    orderAudits.docs.forEach((d) => {
      auditEntries.push({ id: d.id, ...sanitize(d.data()), _matchedBy: "entityId=orderId" });
    });

    // 3c. Per cleaningId menzionato nei details (dove non è entityId)
    const detailsCleaningAudits = await adminDb
      .collection("auditLog")
      .where("details.cleaningId", "==", CLEANING_ID)
      .get();
    detailsCleaningAudits.docs.forEach((d) => {
      auditEntries.push({
        id: d.id,
        ...sanitize(d.data()),
        _matchedBy: "details.cleaningId",
      });
    });

    // 3d. Per bookingId nei details (se abbiamo il booking)
    if (bookingId) {
      const bookingAudits = await adminDb
        .collection("auditLog")
        .where("details.bookingId", "==", bookingId)
        .get();
      bookingAudits.docs.forEach((d) => {
        auditEntries.push({
          id: d.id,
          ...sanitize(d.data()),
          _matchedBy: "details.bookingId",
        });
      });
    }

    // 3e. Per propertyId in finestra ±5 giorni dalla scheduledDate (cattura eventi correlati)
    if (cleaning?.scheduledDate) {
      const sched = new Date(cleaning.scheduledDate);
      const winStart = new Date(sched);
      winStart.setDate(winStart.getDate() - 50);
      const winEnd = new Date(sched);
      winEnd.setDate(winEnd.getDate() + 5);
      // Niente filtro temporale qui: l'audit log non ha sempre un campo data
      // Estraiamo TUTTI quelli per propertyId, poi filtriamo per propertyId+rilevanza
      const propAudits = await adminDb
        .collection("auditLog")
        .where("propertyId", "==", PROPERTY_ID)
        .get();
      propAudits.docs.forEach((d) => {
        const data = d.data() as any;
        // Limita ai log che hanno una qualche relazione con questa pulizia
        const isRelated =
          data.entityId === CLEANING_ID ||
          data.entityId === ORDER_ID ||
          data.details?.cleaningId === CLEANING_ID ||
          data.details?.orderId === ORDER_ID ||
          data.details?.bookingId === bookingId;
        if (!isRelated) {
          // Includo comunque entry interessanti per la stessa proprietà nel periodo
          // (es. fix-missing-orders globale, sync iCal su tutta la proprietà)
          auditEntries.push({
            id: d.id,
            ...sanitize(d.data()),
            _matchedBy: "propertyId (correlato)",
            _correlatedOnly: true,
          });
        } else {
          auditEntries.push({
            id: d.id,
            ...sanitize(d.data()),
            _matchedBy: "propertyId+entityRelated",
          });
        }
      });
    }

    // 3f. Dedup per id
    const uniqAudit = new Map<string, any>();
    for (const e of auditEntries) {
      if (!uniqAudit.has(e.id)) uniqAudit.set(e.id, e);
    }
    const auditList = Array.from(uniqAudit.values());

    // 3g. Sort cronologico
    auditList.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });

    // ─── 4. Costruisci timeline cronologica unificata ───
    type TimelineEvent = {
      timestamp: string | null;
      kind: string;
      summary: string;
      raw: any;
    };
    const timeline: TimelineEvent[] = [];

    if (cleaning?.createdAt) {
      timeline.push({
        timestamp: cleaning.createdAt,
        kind: "cleaning.createdAt",
        summary: `Pulizia creata (guestsCount=${cleaning.guestsCount}, source=${cleaning.bookingSource || cleaning.source || "?"}, status=${cleaning.status})`,
        raw: { id: cleaning.id, createdAt: cleaning.createdAt },
      });
    }
    if (cleaning?.updatedAt && cleaning.updatedAt !== cleaning.createdAt) {
      timeline.push({
        timestamp: cleaning.updatedAt,
        kind: "cleaning.updatedAt",
        summary: `Pulizia aggiornata (snapshot finale: guestsCount=${cleaning.guestsCount}, status=${cleaning.status}, guestsConfirmed=${cleaning.guestsConfirmed}, guestsAppliedBySystem=${cleaning.guestsAppliedBySystem})`,
        raw: {
          guestsCount: cleaning.guestsCount,
          guestsConfirmed: cleaning.guestsConfirmed,
          guestsAppliedBySystem: cleaning.guestsAppliedBySystem,
          guestsAppliedAt: cleaning.guestsAppliedAt,
          adulti: cleaning.adulti,
          neonati: cleaning.neonati,
        },
      });
    }
    if (cleaning?.guestsAppliedAt) {
      timeline.push({
        timestamp: cleaning.guestsAppliedAt,
        kind: "cleaning.guestsAppliedAt",
        summary: `guestsAppliedAt timestamp (suggerisce che cron apply-default-guests ha settato gli ospiti automaticamente)`,
        raw: { guestsAppliedAt: cleaning.guestsAppliedAt },
      });
    }
    if (cleaning?.startedAt) {
      timeline.push({
        timestamp: cleaning.startedAt,
        kind: "cleaning.startedAt",
        summary: `Operatore inizia pulizia`,
        raw: { startedAt: cleaning.startedAt },
      });
    }
    if (cleaning?.completedAt) {
      timeline.push({
        timestamp: cleaning.completedAt,
        kind: "cleaning.completedAt",
        summary: `Pulizia completata`,
        raw: { completedAt: cleaning.completedAt },
      });
    }

    if (order?.createdAt) {
      timeline.push({
        timestamp: order.createdAt,
        kind: "order.createdAt",
        summary: `Ordine biancheria creato (status iniziale: PENDING)`,
        raw: { id: order.id, createdAt: order.createdAt },
      });
    }
    if (order?.updatedAt && order.updatedAt !== order.createdAt) {
      const items = (order.items || []) as any[];
      const itemsSummary = items
        .map((it: any) => `${it.id || it.itemId}:${it.quantity}`)
        .join(", ");
      timeline.push({
        timestamp: order.updatedAt,
        kind: "order.updatedAt",
        summary: `Ordine aggiornato (snapshot finale: status=${order.status}, configSource=${order.configSource || "null"}, itemsUpdatedFromConfig=${order.itemsUpdatedFromConfig}, items=[${itemsSummary}])`,
        raw: {
          status: order.status,
          configSource: order.configSource,
          itemsUpdatedFromConfig: order.itemsUpdatedFromConfig,
          guestsCount: order.guestsCount,
          assignedAt: order.assignedAt,
          assignedTo: order.assignedTo,
          deliveredAt: order.deliveredAt,
        },
      });
    }
    if (order?.assignedAt) {
      timeline.push({
        timestamp: order.assignedAt,
        kind: "order.assignedAt",
        summary: `Ordine assegnato a rider (passa a ASSIGNED)`,
        raw: { assignedAt: order.assignedAt, assignedTo: order.assignedTo },
      });
    }
    if (order?.deliveredAt) {
      timeline.push({
        timestamp: order.deliveredAt,
        kind: "order.deliveredAt",
        summary: `Ordine consegnato (passa a DELIVERED)`,
        raw: { deliveredAt: order.deliveredAt },
      });
    }

    if (booking?.createdAt) {
      timeline.push({
        timestamp: booking.createdAt,
        kind: "booking.createdAt",
        summary: `Booking creato (guests=${booking.guests}, source=${booking.source}, guestName=${booking.guestName})`,
        raw: { id: booking.id, guests: booking.guests, source: booking.source },
      });
    }
    if (booking?.updatedAt && booking.updatedAt !== booking.createdAt) {
      timeline.push({
        timestamp: booking.updatedAt,
        kind: "booking.updatedAt",
        summary: `Booking aggiornato (guests finale=${booking.guests})`,
        raw: { guests: booking.guests, status: booking.status },
      });
    }

    if (property?.updatedAt) {
      timeline.push({
        timestamp: property.updatedAt,
        kind: "property.updatedAt",
        summary: `Proprietà modificata (qualcuno ha cambiato la config). maxGuests attuale=${property.maxGuests}`,
        raw: { maxGuests: property.maxGuests, updatedAt: property.updatedAt },
      });
    }

    // Audit log come eventi
    for (const a of auditList) {
      timeline.push({
        timestamp: a.timestamp,
        kind: `audit.${a.action}`,
        summary: `[${a.source}] ${a.action} — entityType=${a.entityType}, entityId=${a.entityId} ${a._correlatedOnly ? "(correlato proprietà)" : ""}`,
        raw: a,
      });
    }

    // Sort timeline
    timeline.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ids: { cleaningId: CLEANING_ID, orderId: ORDER_ID, propertyId: PROPERTY_ID, bookingId: bookingId || null },
      cleaning,
      order,
      booking,
      property: property
        ? {
            id: property.id,
            name: property.name,
            maxGuests: property.maxGuests,
            updatedAt: property.updatedAt,
            createdAt: property.createdAt,
            usesOwnLinen: property.usesOwnLinen,
            serviceConfigsKeys: property.serviceConfigs
              ? Object.keys(property.serviceConfigs)
              : [],
            // INCLUDO le serviceConfigs complete per confronto
            serviceConfigs: property.serviceConfigs,
          }
        : null,
      auditLogTotal: auditList.length,
      auditLog: auditList,
      timeline,
    });
  } catch (error: any) {
    console.error("Errore timeline-villa-borghese-v1:", error);
    return NextResponse.json(
      {
        error: "Errore server",
        message: error?.message,
        stack: error?.stack?.split("\n").slice(0, 8).join("\n"),
      },
      { status: 500 },
    );
  }
}
