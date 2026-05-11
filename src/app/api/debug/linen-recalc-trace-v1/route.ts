/**
 * ════════════════════════════════════════════════════════════════════
 * DEBUG: Linen Recalc Trace v1 — viewer dei log LINEN_ORDER_RECALCULATED
 * ════════════════════════════════════════════════════════════════════
 *
 * Trappola forense per il bug Villa Borghese (serviceConfigs[1] anomalo).
 * Mostra OGNI chiamata a /api/cleanings/[id]/update-linen-order
 * tracciata da auditLog.linenOrderRecalculated().
 *
 * AUTH (uno qualsiasi):
 *   - header: Authorization: Bearer <CRON_SECRET>
 *   - query:  ?cronSecret=<CRON_SECRET>
 *
 * QUERY PARAMS (tutti opzionali, AND fra loro):
 *   - cleaningId=XXX          filtra su una pulizia specifica
 *   - orderId=XXX             filtra su un ordine specifico
 *   - propertyId=XXX          filtra su una proprietà
 *   - propertyName=foo        match case-insensitive su propertyName (contiene)
 *   - userEmail=foo@bar       chi ha chiamato l'API
 *   - userRole=PROPRIETARIO   ADMIN | PROPRIETARIO | OPERATORE_PULIZIE | RIDER
 *   - guestsCount=1           filtra per snapshot.cleaningGuestsCount esatto
 *   - suspiciousOnly=1        solo entry marcate isSuspicious=true
 *   - days=7                  finestra temporale (default 30, max 90)
 *   - limit=50                max risultati (default 100, max 500)
 *
 * OUTPUT: JSON con summary + entries ordinate per timestamp DESC.
 * READ-ONLY assoluto.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tsToIso(ts: any): string | null {
  if (!ts) return null;
  try {
    if (typeof ts === "object" && typeof ts.toDate === "function") return ts.toDate().toISOString();
    if (ts instanceof Date) return ts.toISOString();
    if (typeof ts === "string") return ts;
    if (typeof ts === "number") return new Date(ts).toISOString();
    if (typeof ts === "object" && "_seconds" in ts) {
      return new Date(ts._seconds * 1000 + (ts._nanoseconds || 0) / 1e6).toISOString();
    }
  } catch {}
  return null;
}

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────
  const CRON_SECRET = process.env.CRON_SECRET || "";
  if (!CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET non configurato lato server" },
      { status: 500 }
    );
  }
  const authHeader = req.headers.get("authorization") || "";
  const urlSecret = req.nextUrl.searchParams.get("cronSecret") || "";
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Filtri ────────────────────────────────────────────
  const sp = req.nextUrl.searchParams;
  const cleaningIdFilter = sp.get("cleaningId");
  const orderIdFilter = sp.get("orderId");
  const propertyIdFilter = sp.get("propertyId");
  const propertyNameFilter = (sp.get("propertyName") || "").toLowerCase();
  const userEmailFilter = (sp.get("userEmail") || "").toLowerCase();
  const userRoleFilter = sp.get("userRole");
  const guestsCountFilter = sp.get("guestsCount") ? Number(sp.get("guestsCount")) : null;
  const suspiciousOnly = sp.get("suspiciousOnly") === "1" || sp.get("suspiciousOnly") === "true";

  let days = Number(sp.get("days") || 30);
  if (!Number.isFinite(days) || days < 1) days = 30;
  if (days > 90) days = 90;

  let limit = Number(sp.get("limit") || 100);
  if (!Number.isFinite(limit) || limit < 1) limit = 100;
  if (limit > 500) limit = 500;

  // ── Query Firestore ───────────────────────────────────
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceTs = Timestamp.fromDate(since);

  // Costruisco la query base. Usiamo timestamp DESC + action.
  // Filtri server-side che hanno indici nativi (action, timestamp).
  // Tutto il resto è filtrato in memoria (volumi bassi).
  let query: FirebaseFirestore.Query = adminDb.collection("auditLog")
    .where("action", "==", "LINEN_ORDER_RECALCULATED")
    .where("timestamp", ">=", sinceTs)
    .orderBy("timestamp", "desc")
    .limit(Math.min(limit * 4, 2000)); // sovracarica per consentire filtri in-memory

  // Se ho propertyId esatto posso aggiungerlo (composite index potrebbe servire — fallback ok)
  if (propertyIdFilter) {
    query = adminDb.collection("auditLog")
      .where("action", "==", "LINEN_ORDER_RECALCULATED")
      .where("propertyId", "==", propertyIdFilter)
      .where("timestamp", ">=", sinceTs)
      .orderBy("timestamp", "desc")
      .limit(Math.min(limit * 4, 2000));
  }

  let snap: FirebaseFirestore.QuerySnapshot;
  try {
    snap = await query.get();
  } catch (e: any) {
    // Se manca l'indice composito, fallback senza propertyId e filtro in memoria
    if (propertyIdFilter && e?.code === 9 /* FAILED_PRECONDITION */) {
      const fallback = await adminDb.collection("auditLog")
        .where("action", "==", "LINEN_ORDER_RECALCULATED")
        .where("timestamp", ">=", sinceTs)
        .orderBy("timestamp", "desc")
        .limit(2000)
        .get();
      snap = fallback;
    } else {
      return NextResponse.json(
        { error: "Query Firestore fallita", details: e?.message || String(e) },
        { status: 500 }
      );
    }
  }

  // ── Filtri in-memory ──────────────────────────────────
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const filtered = all.filter((entry: any) => {
    const details = entry.details || {};
    const snapshot = details.snapshot || {};
    const caller = details.caller || {};
    const suspicious = details.suspicious || {};

    if (cleaningIdFilter && details.cleaningId !== cleaningIdFilter) return false;
    if (orderIdFilter && entry.entityId !== orderIdFilter) return false;
    if (propertyIdFilter && entry.propertyId !== propertyIdFilter) return false;
    if (propertyNameFilter && !(String(entry.propertyName || "").toLowerCase().includes(propertyNameFilter))) return false;
    if (userEmailFilter && !(String(caller.userEmail || "").toLowerCase().includes(userEmailFilter))) return false;
    if (userRoleFilter && caller.userRole !== userRoleFilter) return false;
    if (guestsCountFilter !== null && snapshot.cleaningGuestsCount !== guestsCountFilter) return false;
    if (suspiciousOnly && suspicious.isSuspicious !== true) return false;
    return true;
  });

  const limited = filtered.slice(0, limit);

  // ── Shape della response ──────────────────────────────
  const entries = limited.map((entry: any) => {
    const details = entry.details || {};
    const snapshot = details.snapshot || {};
    const result = details.result || {};
    const caller = details.caller || {};
    const suspicious = details.suspicious || {};
    return {
      auditLogId: entry.id,
      timestamp: tsToIso(entry.timestamp),
      cleaningId: details.cleaningId,
      orderId: entry.entityId,
      propertyId: entry.propertyId,
      propertyName: entry.propertyName,
      snapshot: {
        guestsCount: snapshot.cleaningGuestsCount,
        adulti: snapshot.cleaningAdulti,
        neonati: snapshot.cleaningNeonati,
        guestsConfirmed: snapshot.cleaningGuestsConfirmed,
        guestsAppliedBySystem: snapshot.cleaningGuestsAppliedBySystem,
        linenConfigModified: snapshot.cleaningLinenConfigModified,
        propertyMaxGuests: snapshot.propertyMaxGuests,
      },
      result: {
        configSource: result.configSource,
        itemsCountBefore: result.itemsCountBefore,
        itemsCountAfter: result.itemsCountAfter,
        itemsBefore: result.itemsBefore,
        itemsAfter: result.itemsAfter,
      },
      caller: {
        userId: caller.userId,
        userEmail: caller.userEmail,
        userRole: caller.userRole,
        userAgent: caller.userAgent,
        ip: caller.ip,
      },
      suspicious: {
        isSuspicious: suspicious.isSuspicious,
        reasons: suspicious.reasons || [],
      },
    };
  });

  // Aggregazioni utili
  const byUserEmail: Record<string, number> = {};
  const byUserRole: Record<string, number> = {};
  const byPropertyName: Record<string, number> = {};
  const byConfigSource: Record<string, number> = {};
  let suspiciousCount = 0;
  for (const e of filtered) {
    const c = (e.details && e.details.caller) || {};
    const r = (e.details && e.details.result) || {};
    const s = (e.details && e.details.suspicious) || {};
    const email = c.userEmail || "(none)";
    const role = c.userRole || "(none)";
    const propName = e.propertyName || "(none)";
    const cfg = r.configSource || "(none)";
    byUserEmail[email] = (byUserEmail[email] || 0) + 1;
    byUserRole[role] = (byUserRole[role] || 0) + 1;
    byPropertyName[propName] = (byPropertyName[propName] || 0) + 1;
    byConfigSource[cfg] = (byConfigSource[cfg] || 0) + 1;
    if (s.isSuspicious === true) suspiciousCount++;
  }

  return NextResponse.json({
    success: true,
    query: {
      cleaningId: cleaningIdFilter,
      orderId: orderIdFilter,
      propertyId: propertyIdFilter,
      propertyName: propertyNameFilter || null,
      userEmail: userEmailFilter || null,
      userRole: userRoleFilter,
      guestsCount: guestsCountFilter,
      suspiciousOnly,
      days,
      limit,
    },
    summary: {
      totalMatched: filtered.length,
      returned: entries.length,
      suspiciousCount,
      byUserEmail,
      byUserRole,
      byPropertyName,
      byConfigSource,
    },
    entries,
  });
}
