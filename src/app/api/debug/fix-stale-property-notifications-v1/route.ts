import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * fix-stale-property-notifications-v1
 *
 * CONTESTO: approvare una proprietà dalla pagina Proprietà (PATCH → status
 * PENDING_SIGNATURE/ACTIVE) non chiudeva la notifica admin "Nuova Proprietà
 * da Approvare", che restava con i bottoni Approva/Rifiuta attivi per sempre.
 * Il bug è stato corretto alla fonte (PATCH /api/properties/[id]); questa
 * route ripara le notifiche storiche rimaste incagliate.
 *
 * COSA TROVA: notifiche type=NEW_PROPERTY con actionStatus=PENDING la cui
 * proprietà collegata NON è più in stato PENDING (decisione già presa) o
 * non esiste più (rifiutata/cancellata).
 *
 * USO (gated da cronSecret):
 *   GET ...?cronSecret=XXX           → DRY-RUN (default)
 *   GET ...?cronSecret=XXX&apply=1   → risolve (APPROVED se proprietà avanzata,
 *                                       REJECTED se proprietà inesistente)
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cronSecret = searchParams.get("cronSecret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const apply = searchParams.get("apply") === "1";

  try {
    const snap = await adminDb
      .collection("notifications")
      .where("type", "==", "NEW_PROPERTY")
      .where("actionStatus", "==", "PENDING")
      .get();

    const stale: Array<Record<string, any>> = [];
    const stillPending: Array<Record<string, any>> = [];

    for (const d of snap.docs) {
      const n = d.data() as Record<string, any>;
      const propertyId = n.relatedEntityId;
      if (!propertyId) {
        stale.push({ id: d.id, propertyName: n.relatedEntityName || null, reason: "senza relatedEntityId", resolveAs: "REJECTED" });
        continue;
      }
      const propSnap = await adminDb.collection("properties").doc(propertyId).get();
      if (!propSnap.exists) {
        stale.push({ id: d.id, propertyId, propertyName: n.relatedEntityName || null, reason: "proprietà inesistente (rifiutata/cancellata)", resolveAs: "REJECTED" });
        continue;
      }
      const status = (propSnap.data() as Record<string, any>).status;
      if (status !== "PENDING") {
        stale.push({ id: d.id, propertyId, propertyName: n.relatedEntityName || null, reason: `proprietà già decisa (status: ${status})`, resolveAs: "APPROVED" });
      } else {
        stillPending.push({ id: d.id, propertyId, propertyName: n.relatedEntityName || null });
      }
    }

    let repaired = 0;
    if (apply && stale.length > 0) {
      const now = Timestamp.now();
      for (const s of stale) {
        await adminDb.collection("notifications").doc(s.id).update({
          actionStatus: s.resolveAs,
          actionBy: "system",
          actionNote: `Riparazione automatica: ${s.reason}`,
          actionAt: now,
          status: "READ",
          readAt: now,
          updatedAt: now,
        });
        repaired++;
      }
    }

    return NextResponse.json({
      mode: apply ? "APPLY" : "DRY-RUN",
      totalPendingNotifications: snap.size,
      staleFound: stale.length,
      stale,
      repaired,
      stillPendingLegit: stillPending.length,
      stillPending,
      note: apply
        ? "Riparate: notifiche chiuse coerentemente con lo stato reale della proprietà."
        : "Nessuna scrittura eseguita. Aggiungi &apply=1 per riparare.",
    });
  } catch (e) {
    console.error("fix-stale-property-notifications-v1 errore:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
