import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/audit-log
 * 
 * Query params:
 *   ?action=ORDER_CREATE_FAILED     - filtra per azione
 *   ?entityId=XXX                   - filtra per ID entità
 *   ?propertyName=vittoria          - filtra per nome proprietà (partial match)
 *   ?propertyId=XXX                 - filtra per ID proprietà
 *   ?source=cron/sync-ical          - filtra per source
 *   ?days=1                         - ultimi N giorni (default: 1)
 *   ?limit=100                      - max risultati (default: 100)
 *   ?entityType=order               - filtra per tipo entità
 * 
 * Esempi:
 *   /api/admin/audit-log?action=ORDER_CREATE_FAILED&days=1
 *   → Mostra tutti i tentativi falliti di creazione ordine nelle ultime 24h
 * 
 *   /api/admin/audit-log?propertyName=vittoria&days=3
 *   → Mostra tutto ciò che è successo a Vittoria's Home negli ultimi 3 giorni
 * 
 *   /api/admin/audit-log?entityId=PpxQ4gspF2mmm7oc93ov
 *   → Mostra tutto ciò che riguarda questa pulizia/ordine
 * 
 *   /api/admin/audit-log?action=SAFETY_NET_CREATED&days=7
 *   → Mostra tutti gli ordini creati dal safety net nell'ultima settimana
 * 
 *   /api/admin/audit-log?action=CRON_PROPERTY_SKIPPED&days=1
 *   → Mostra proprietà skippate dal cron nelle ultime 24h
 */

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const entityId = url.searchParams.get("entityId");
  const propertyName = url.searchParams.get("propertyName")?.toLowerCase();
  const propertyId = url.searchParams.get("propertyId");
  const source = url.searchParams.get("source");
  const entityType = url.searchParams.get("entityType");
  const days = parseInt(url.searchParams.get("days") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Build query - Firestore allows only one inequality, so we filter in-memory for some params
  let query: FirebaseFirestore.Query = adminDb.collection("auditLog")
    .where("timestamp", ">=", Timestamp.fromDate(since))
    .orderBy("timestamp", "desc")
    .limit(limit * 3); // fetch more to filter in-memory

  // Add equality filters that Firestore can handle
  if (action) query = query.where("action", "==", action);
  if (propertyId) query = query.where("propertyId", "==", propertyId);
  if (entityType) query = query.where("entityType", "==", entityType);

  const snap = await query.get();

  let results = snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      propertyId: data.propertyId,
      propertyName: data.propertyName,
      source: data.source,
      details: data.details,
      timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
    };
  });

  // In-memory filters
  if (entityId) {
    results = results.filter(r => r.entityId === entityId || r.details?.cleaningId === entityId);
  }
  if (propertyName) {
    results = results.filter(r => (r.propertyName || "").toLowerCase().includes(propertyName));
  }
  if (source) {
    results = results.filter(r => (r.source || "").includes(source));
  }

  // Trim to limit
  results = results.slice(0, limit);

  // Summary stats
  const actionCounts: Record<string, number> = {};
  results.forEach(r => {
    actionCounts[r.action] = (actionCounts[r.action] || 0) + 1;
  });

  return NextResponse.json({
    total: results.length,
    period: `${days} giorni (da ${since.toISOString().split("T")[0]})`,
    actionCounts,
    results,
  });
}
