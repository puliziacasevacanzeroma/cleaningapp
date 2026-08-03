import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/**
 * FORENSE READ-ONLY — "perché manca la pulizia del giorno X?"
 *
 * NON SCRIVE NULLA. Ricostruisce la timeline completa di una proprietà attorno
 * a una data e prova a dare un verdetto su chi/cosa ha fatto sparire la pulizia.
 *
 * Perché serve: `auditLog.cleaningDeleted()` esiste ma non è chiamato da nessuna
 * rotta, e tutte le cancellazioni sono hard-delete. L'unica traccia che
 * sopravvive sono i "fossili": ordini biancheria CANCELLED con `cancelReason`
 * diverso a seconda del percorso, e le notifiche TURNOVER_DECISION risolte
 * (che conservano actionResolvedBy / actionResolvedByRole).
 *
 * Uso:
 *   /api/debug/forensic-cleaning-missing-v1?cronSecret=XXX&property=poerio&date=2026-08-04
 *   [&window=10]   giorni prima/dopo da ispezionare (default 10)
 *   [&days=60]     finestra per notifiche/auditLog (default 60)
 */

type AnyRec = Record<string, any>;

const toISO = (t: any): string | null => {
  try {
    const d = typeof t?.toDate === "function" ? t.toDate() : t instanceof Date ? t : null;
    return d ? d.toISOString() : null;
  } catch { return null; }
};
const toDay = (t: any): string | null => {
  const iso = toISO(t);
  return iso ? iso.split("T")[0]! : null;
};

// Impronte digitali dei percorsi di cancellazione (vedi tabella nel commento)
function classifyCancelReason(reason: string): { path: string; blame: string } {
  const r = (reason || "").toLowerCase();
  if (r.includes("turnover-decision") || r.includes("prolungamento ospite confermato"))
    return { path: "TURNOVER_DECISION", blame: "DECISIONE UMANA nel modal turnover (vedi notifiche: actionResolvedByRole)" };
  if (r.startsWith("pulizia eliminata:"))
    return { path: "CLEANINGS_CANCEL_ROUTE", blame: "DECISIONE UMANA dal calendario (vedi cancelledBy)" };
  if (r.includes("cancellata via assistente") || r === "pulizia cancellata")
    return { path: "PROPRIETARIO_ASSISTANT", blame: "DECISIONE UMANA via assistente proprietario" };
  if (r.includes("prenotazione rimossa dal feed"))
    return { path: "SYNC_FEED_REMOVAL", blame: "AUTOMATICO: la prenotazione è sparita dal feed iCal di Booking" };
  if (r.includes("link ical rimosso"))
    return { path: "ICAL_LINK_REMOVED", blame: "AUTOMATICO: rimosso il link iCal della proprietà" };
  if (r.includes("non esistente"))
    return { path: "ORPHAN_CLEANUP", blame: "CONSEGUENZA (non causa): cleanup ordini orfani dopo che la pulizia era già sparita" };
  if (r.includes("cancellazione massiva admin"))
    return { path: "ADMIN_BULK", blame: "DECISIONE UMANA: cancellazione massiva admin" };
  if (r.includes("proprietà cancellata"))
    return { path: "PROPERTY_DELETED", blame: "AUTOMATICO: proprietà cancellata" };
  return { path: "UNKNOWN", blame: "Motivo non riconosciuto" };
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const qProperty = (req.nextUrl.searchParams.get("property") || "").trim().toLowerCase();
  const qDate = (req.nextUrl.searchParams.get("date") || "").trim();
  const windowDays = Number(req.nextUrl.searchParams.get("window") || 10);
  const lookbackDays = Number(req.nextUrl.searchParams.get("days") || 60);

  if (!qProperty) return NextResponse.json({ error: "Manca ?property=" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(qDate)) return NextResponse.json({ error: "Manca ?date=YYYY-MM-DD" }, { status: 400 });

  try {
    const target = new Date(`${qDate}T12:00:00.000Z`);
    const from = new Date(target.getTime() - windowDays * 86400000);
    const to = new Date(target.getTime() + windowDays * 86400000);
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);
    const lookbackFrom = Timestamp.fromDate(new Date(Date.now() - lookbackDays * 86400000));

    // ── 1. Proprietà ──────────────────────────────────────────
    const propsSnap = await adminDb.collection("properties").get();
    const props = propsSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as AnyRec) }))
      .filter(p => String(p.name || "").toLowerCase().includes(qProperty));

    if (props.length === 0) {
      return NextResponse.json({ error: `Nessuna proprietà con nome contenente "${qProperty}"` }, { status: 404 });
    }

    const report: AnyRec[] = [];

    for (const prop of props) {
      const block: AnyRec = {
        property: { id: prop.id, name: prop.name, usesOwnLinen: prop.usesOwnLinen === true, ownerId: prop.ownerId || null },
        targetDate: qDate,
      };

      // ── 2. Pulizie nella finestra ───────────────────────────
      const cleanSnap = await adminDb.collection("cleanings")
        .where("propertyId", "==", prop.id)
        .where("scheduledDate", ">=", Timestamp.fromDate(from))
        .where("scheduledDate", "<=", Timestamp.fromDate(to))
        .get();
      const cleanings = cleanSnap.docs.map(d => {
        const c = d.data() as AnyRec;
        return {
          id: d.id,
          scheduledDate: toDay(c.scheduledDate),
          originalScheduledDate: toDay(c.originalScheduledDate),
          status: c.status || null,
          bookingId: c.bookingId || null,
          lockedFromSync: c.lockedFromSync === true,
          turnoverRecovered: c.turnoverRecovered === true,
          turnoverConfirmed: c.turnoverConfirmed === true,
          hasLinenOrder: typeof c.hasLinenOrder === "boolean" ? c.hasLinenOrder : null,
          laundryOrderId: c.laundryOrderId || null,
          createdAt: toISO(c.createdAt),
          updatedAt: toISO(c.updatedAt),
        };
      }).sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));

      const onTarget = cleanings.filter(c => c.scheduledDate === qDate);
      const movedAway = cleanings.filter(c => c.scheduledDate !== qDate && c.originalScheduledDate === qDate);
      block.cleanings = cleanings;
      block.cleaningOnTargetDate = onTarget;
      block.cleaningsMovedFromTargetDate = movedAway;

      // ── 3. Ordini nella finestra (i fossili) ────────────────
      const ordSnap = await adminDb.collection("orders")
        .where("propertyId", "==", prop.id)
        .where("scheduledDate", ">=", Timestamp.fromDate(from))
        .where("scheduledDate", "<=", Timestamp.fromDate(to))
        .get();
      const cleaningIds = new Set(cleanings.map(c => c.id));
      const orders: AnyRec[] = [];
      for (const d of ordSnap.docs) {
        const o = d.data() as AnyRec;
        const entry: AnyRec = {
          id: d.id,
          scheduledDate: toDay(o.scheduledDate),
          status: o.status || null,
          cleaningId: o.cleaningId || null,
          cleaningStillExists: o.cleaningId ? cleaningIds.has(o.cleaningId) : null,
          cancelReason: o.cancelReason || null,
          cancelledAt: toISO(o.cancelledAt),
          cancelledBy: o.cancelledBy || null,
          createdAt: toISO(o.createdAt),
        };
        if (o.cancelReason) entry.classified = classifyCancelReason(String(o.cancelReason));
        orders.push(entry);
      }
      orders.sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));
      block.orders = orders;
      block.ordersOnTargetDate = orders.filter(o => o.scheduledDate === qDate);

      // Risolvi i nomi di chi ha cancellato
      const userIds = new Set<string>(orders.map(o => o.cancelledBy).filter(Boolean) as string[]);
      const userMap: AnyRec = {};
      for (const uid of userIds) {
        try {
          const uSnap = await adminDb.collection("users").doc(uid).get();
          if (uSnap.exists) {
            const u = uSnap.data() as AnyRec;
            userMap[uid] = { name: u.name || null, email: u.email || null, role: u.role || null };
          }
        } catch {}
      }
      block.usersResolved = userMap;

      // ── 4. Prenotazioni che coprono la data ─────────────────
      const bookSnap = await adminDb.collection("bookings").where("propertyId", "==", prop.id).get();
      const bookings = bookSnap.docs.map(d => {
        const b = d.data() as AnyRec;
        return {
          id: d.id,
          checkIn: toDay(b.checkIn),
          checkOut: toDay(b.checkOut),
          source: b.source || b.bookingSource || null,
          status: b.status || null,
          icalUid: b.icalUid || null,
          guestName: b.guestName || null,
          originalCheckIn: toDay(b.originalCheckIn),
          feedStart: toDay(b.feedStart),
          clipGuardAt: toISO(b.clipGuardAt),
          mergedCheckpoints: Array.isArray(b.mergedCheckpoints)
            ? b.mergedCheckpoints.map((m: AnyRec) => ({ boundary: m.boundary, extendedTo: m.extendedTo, detectedAt: toISO(m.detectedAt) }))
            : [],
          updatedAt: toISO(b.updatedAt),
        };
      }).filter(b => {
        if (!b.checkIn || !b.checkOut) return false;
        return b.checkOut >= toDay(Timestamp.fromDate(from))! && b.checkIn <= toDay(Timestamp.fromDate(to))!;
      }).sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)));
      block.bookings = bookings;
      block.bookingsWithExtensionOnTarget = bookings.filter(b =>
        b.mergedCheckpoints.some((m: AnyRec) => m.boundary === qDate));

      // ── 5. turnoverAlerts ───────────────────────────────────
      const taSnap = await adminDb.collection("turnoverAlerts").where("propertyId", "==", prop.id).get();
      block.turnoverAlerts = taSnap.docs.map(d => {
        const t = d.data() as AnyRec;
        return {
          key: d.id, type: t.type || "TURNOVER", bookingId: t.bookingId || null,
          boundary: t.boundary || null, extendedTo: t.extendedTo || null,
          oldCheckIn: t.oldCheckIn || null, newFeedStart: t.newFeedStart || null,
          createdAt: toISO(t.createdAt),
        };
      }).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

      // ── 6. Notifiche TURNOVER_DECISION (la prova decisiva) ──
      const notifSnap = await adminDb.collection("notifications")
        .where("actionType", "==", "TURNOVER_DECISION").get();
      const turnoverNotifs = notifSnap.docs.map(d => {
        const n = d.data() as AnyRec;
        return {
          id: d.id,
          propertyId: n.turnoverAction?.propertyId || null,
          propertyName: n.turnoverAction?.propertyName || null,
          cleaningId: n.turnoverAction?.cleaningId || null,
          cleaningDate: n.turnoverAction?.cleaningDate || null,
          newCleaningDate: n.turnoverAction?.newCleaningDate || null,
          recipientRole: n.recipientRole || null,
          actionKey: n.actionKey || null,
          actionRequired: n.actionRequired === true,
          actionStatus: n.actionStatus ?? "(assente — bug noto: non entra nei filtri 'da gestire')",
          actionResolved: n.actionResolved || null,
          actionResolvedBy: n.actionResolvedBy || null,
          actionResolvedByRole: n.actionResolvedByRole || null,
          actionResolvedAt: toISO(n.actionResolvedAt),
          createdAt: toISO(n.createdAt),
        };
      }).filter(n => n.propertyId === prop.id);
      block.turnoverNotifications = turnoverNotifs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      block.turnoverNotificationsOnTargetDate = turnoverNotifs.filter(n => n.cleaningDate === qDate);

      // ── 7. auditLog della proprietà nella finestra ──────────
      try {
        const alSnap = await adminDb.collection("auditLog")
          .where("propertyId", "==", prop.id).get();
        block.auditLog = alSnap.docs.map(d => {
          const a = d.data() as AnyRec;
          return {
            action: a.action, entityType: a.entityType, entityId: a.entityId,
            source: a.source, details: a.details, timestamp: toISO(a.timestamp),
          };
        })
          .filter(a => a.timestamp && a.timestamp >= toISO(lookbackFrom)!)
          .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
      } catch (e: any) {
        block.auditLog = { error: e?.message || String(e) };
      }
      block.auditLogNota = "auditLog.cleaningDeleted() NON è mai chiamato nel progetto: qui NON troverai cancellazioni.";

      // ── 8. VERDETTO ─────────────────────────────────────────
      const verdict: AnyRec = { conclusione: null, prove: [] as string[] };

      if (onTarget.length > 0) {
        verdict.conclusione = "NESSUN MISTERO: una pulizia alla data target esiste.";
        verdict.prove.push(`Pulizia ${onTarget[0]!.id} presente il ${qDate} (status ${onTarget[0]!.status}).`);
      } else {
        const decided = block.turnoverNotificationsOnTargetDate.filter((n: AnyRec) => n.actionResolved === "CANCEL");
        const cancelledOrders = block.ordersOnTargetDate.filter((o: AnyRec) => o.status === "CANCELLED");

        if (decided.length > 0) {
          const who = decided[0];
          verdict.conclusione = `CANCELLATA A MANO dal modal turnover da un utente con ruolo ${who.actionResolvedByRole}.`;
          verdict.prove.push(`Notifica ${who.id}: actionResolved=CANCEL, da "${who.actionResolvedBy}" (${who.actionResolvedByRole}) il ${who.actionResolvedAt}.`);
          verdict.responsabile = who.actionResolvedByRole === "ADMIN" ? "AMMINISTRAZIONE" : "PROPRIETARIO";
        } else if (cancelledOrders.length > 0) {
          const o = cancelledOrders[0];
          verdict.conclusione = `Pulizia sparita via percorso ${o.classified?.path}: ${o.classified?.blame}`;
          verdict.prove.push(`Ordine ${o.id} CANCELLED il ${o.cancelledAt}, motivo: "${o.cancelReason}".`);
          if (o.cancelledBy) verdict.prove.push(`cancelledBy=${o.cancelledBy} → ${JSON.stringify(userMap[o.cancelledBy] || "utente non trovato")}`);
          verdict.responsabile = o.classified?.blame?.startsWith("DECISIONE UMANA") ? "UMANO (vedi sopra)" : "AUTOMATICO/GESTIONALE";
        } else if (movedAway.length > 0) {
          verdict.conclusione = `NON cancellata ma SPOSTATA: la pulizia con originalScheduledDate=${qDate} ora è al ${movedAway[0]!.scheduledDate}.`;
          verdict.prove.push(`Pulizia ${movedAway[0]!.id}, lockedFromSync=${movedAway[0]!.lockedFromSync}.`);
          verdict.responsabile = movedAway[0]!.lockedFromSync ? "UMANO (spostata a mano, lock attivo)" : "GESTIONALE (sync)";
        } else if (block.ordersOnTargetDate.length === 0 && prop.usesOwnLinen !== true) {
          verdict.conclusione = "MAI CREATA: nessuna pulizia e nessun ordine (nemmeno cancellato) alla data target. Da indagare: excludedDates, guardia anti-duplicato del sync, o prenotazione mai arrivata nel feed.";
          verdict.responsabile = "DA DETERMINARE — guarda i turnoverAlerts e mergedCheckpoints qui sopra";
        } else {
          verdict.conclusione = "Pulizia assente, nessun fossile utile trovato nella finestra. Serve allargare ?window= o ?days=.";
          verdict.responsabile = "DA DETERMINARE";
        }
      }
      block.VERDETTO = verdict;
      report.push(block);
    }

    return NextResponse.json({
      readOnly: true,
      query: { property: qProperty, date: qDate, windowDays, lookbackDays },
      propertiesMatched: props.length,
      report,
    }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
