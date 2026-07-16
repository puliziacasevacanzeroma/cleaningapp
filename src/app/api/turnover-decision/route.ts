import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * TURNOVER DECISION — risolve il dubbio "cambio ospiti o prolungamento?"
 *
 * Chiamata dal modal che si apre cliccando la notifica "🔁 Turnover recuperato"
 * (notifiche con actionType TURNOVER_DECISION, create dal sync iCal quando un
 * blocco Booking si estende).
 *
 * POST body: { notificationId: string, decision: 'KEEP' | 'CANCEL' }
 *  - KEEP   → la pulizia del vecchio checkout resta (era un vero cambio ospiti):
 *             viene marcata turnoverConfirmed.
 *  - CANCEL → l'ospite ha prolungato: la pulizia viene ELIMINATA e gli ordini
 *             biancheria collegati ANNULLATI (mai se IN_TRANSIT/DELIVERED/COMPLETED).
 *
 * Autorizzazione: ADMIN sempre; PROPRIETARIO solo per notifiche indirizzate a
 * lui E su proprietà di cui è owner.
 * Tutte le notifiche gemelle (stesso actionKey, cioè admin + proprietario) vengono
 * risolte insieme; la controparte riceve una notifica con l'esito.
 */

const PROTECTED_STATUSES = ["COMPLETED", "IN_PROGRESS"];
const PROTECTED_ORDER_STATUSES = ["IN_TRANSIT", "DELIVERED", "COMPLETED", "CANCELLED"];

const fmtIt = (s: string) => {
  const parts = String(s || "").split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : s;
};

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const role = (user.role || "").toUpperCase();
  if (!["ADMIN", "PROPRIETARIO", "OWNER", "CLIENTE"].includes(role)) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body non valido" }, { status: 400 }); }
  const { notificationId, decision } = body || {};
  if (!notificationId || !["KEEP", "CANCEL"].includes(decision)) {
    return NextResponse.json({ error: "Parametri non validi (notificationId, decision KEEP|CANCEL)" }, { status: 400 });
  }

  try {
    const notifRef = adminDb.collection("notifications").doc(notificationId);
    const notifSnap = await notifRef.get();
    if (!notifSnap.exists) return NextResponse.json({ error: "Notifica non trovata" }, { status: 404 });
    const notif = notifSnap.data() as any;

    if (notif.actionType !== "TURNOVER_DECISION" || !notif.turnoverAction?.cleaningId) {
      return NextResponse.json({ error: "Questa notifica non prevede azioni" }, { status: 400 });
    }
    if (notif.actionResolved) {
      return NextResponse.json({ error: `Già gestita: ${notif.actionResolved === "CANCEL" ? "pulizia cancellata" : "pulizia mantenuta"}`, alreadyResolved: notif.actionResolved }, { status: 409 });
    }

    const ta = notif.turnoverAction as { cleaningId: string; cleaningDate: string; newCleaningDate?: string; propertyId: string; propertyName: string };
    const isAdminUser = role === "ADMIN";

    // Autorizzazione proprietario: la notifica deve essere sua E la proprietà deve essere sua
    if (!isAdminUser) {
      if (notif.recipientId !== user.id) {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
      }
      const propSnap = await adminDb.collection("properties").doc(ta.propertyId).get();
      const ownerId = propSnap.exists ? (propSnap.data() as any).ownerId : null;
      if (!ownerId || ownerId !== user.id) {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
      }
    }

    const cleaningRef = adminDb.collection("cleanings").doc(ta.cleaningId);
    const cleaningSnap = await cleaningRef.get();
    const cleaning = cleaningSnap.exists ? (cleaningSnap.data() as any) : null;

    let resultMsg = "";

    if (decision === "CANCEL") {
      if (!cleaning) {
        resultMsg = "La pulizia era già stata rimossa.";
      } else if (PROTECTED_STATUSES.includes(cleaning.status)) {
        return NextResponse.json({ error: `Impossibile cancellare: la pulizia è ${cleaning.status === "COMPLETED" ? "già completata" : "in corso"}. Contatta l'amministratore.` }, { status: 409 });
      } else {
        // Annulla ordini collegati (per cleaningId e per laundryOrderId)
        const cancelledOrders = new Set<string>();
        const linkedOrders = await adminDb.collection("orders").where("cleaningId", "==", ta.cleaningId).get();
        for (const oDoc of linkedOrders.docs) {
          const oData = oDoc.data() as any;
          if (PROTECTED_ORDER_STATUSES.includes(oData.status)) continue;
          await adminDb.collection("orders").doc(oDoc.id).update({
            status: "CANCELLED",
            cancelReason: "Prolungamento ospite confermato (turnover-decision)",
            cancelledAt: Timestamp.now(), updatedAt: Timestamp.now(),
          });
          cancelledOrders.add(oDoc.id);
        }
        if (cleaning.laundryOrderId && !cancelledOrders.has(cleaning.laundryOrderId)) {
          try {
            const oSnap = await adminDb.collection("orders").doc(cleaning.laundryOrderId).get();
            if (oSnap.exists && !PROTECTED_ORDER_STATUSES.includes((oSnap.data() as any).status)) {
              await adminDb.collection("orders").doc(cleaning.laundryOrderId).update({
                status: "CANCELLED",
                cancelReason: "Prolungamento ospite confermato (turnover-decision)",
                cancelledAt: Timestamp.now(), updatedAt: Timestamp.now(),
              });
            }
          } catch {}
        }
        await cleaningRef.delete();
        resultMsg = `Pulizia del ${fmtIt(ta.cleaningDate)} cancellata e ordine biancheria annullato.`;
      }
    } else {
      // KEEP
      if (cleaning) {
        await cleaningRef.update({ turnoverConfirmed: true, updatedAt: Timestamp.now() });
      }
      resultMsg = `Pulizia del ${fmtIt(ta.cleaningDate)} confermata: resta in programma.`;
    }

    // Risolvi TUTTE le notifiche gemelle (stesso actionKey: admin + proprietario)
    const resolvedAt = Timestamp.now();
    if (notif.actionKey) {
      const twins = await adminDb.collection("notifications").where("actionKey", "==", notif.actionKey).get();
      for (const tDoc of twins.docs) {
        await adminDb.collection("notifications").doc(tDoc.id).update({
          actionResolved: decision,
          actionResolvedBy: user.name || user.id,
          actionResolvedByRole: role,
          actionResolvedAt: resolvedAt,
          actionRequired: false,
          updatedAt: resolvedAt,
        });
      }
    } else {
      await notifRef.update({
        actionResolved: decision, actionResolvedBy: user.name || user.id,
        actionResolvedByRole: role, actionResolvedAt: resolvedAt,
        actionRequired: false, updatedAt: resolvedAt,
      });
    }

    // Avvisa la controparte dell'esito
    try {
      const outcomeTitle = decision === "CANCEL" ? "🗑️ Pulizia cancellata (prolungamento)" : "✅ Pulizia confermata (cambio ospiti)";
      const outcomeMsg = `🏠 ${ta.propertyName}\n\n${user.name || "Un utente"} (${isAdminUser ? "amministrazione" : "proprietario"}) ha verificato su Booking: ${decision === "CANCEL" ? `l'ospite ha PROLUNGATO il soggiorno → la pulizia del ${fmtIt(ta.cleaningDate)} è stata cancellata e l'ordine biancheria annullato.` : `il ${fmtIt(ta.cleaningDate)} c'è un vero cambio ospiti → la pulizia resta in programma.`}`;
      if (isAdminUser) {
        // Admin ha deciso → avvisa il proprietario (se esiste)
        const propSnap2 = await adminDb.collection("properties").doc(ta.propertyId).get();
        const ownerId2 = propSnap2.exists ? String((propSnap2.data() as any).ownerId || "").trim() : "";
        if (ownerId2 && ownerId2 !== "pending" && ownerId2 !== user.id) {
          await adminDb.collection("notifications").add({
            title: outcomeTitle, message: outcomeMsg, type: decision === "CANCEL" ? "INFO" : "SUCCESS",
            recipientRole: "PROPRIETARIO", recipientId: ownerId2,
            senderId: user.id, senderName: user.name || "Admin",
            status: "UNREAD", createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
          });
        }
      } else {
        // Proprietario ha deciso → avvisa tutti gli ADMIN (+ push)
        const adminsSnap = await adminDb.collection("users").where("role", "==", "ADMIN").get();
        for (const aDoc of adminsSnap.docs) {
          await adminDb.collection("notifications").add({
            title: outcomeTitle, message: outcomeMsg, type: decision === "CANCEL" ? "WARNING" : "SUCCESS",
            recipientRole: "ADMIN", recipientId: aDoc.id,
            senderId: user.id, senderName: user.name || "Proprietario",
            status: "UNREAD", createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
          });
        }
        try {
          const { sendPushNotification } = await import("~/lib/notifications/sendPushNotification");
          await sendPushNotification(
            { title: outcomeTitle, body: `${ta.propertyName}: decisione del proprietario — ${decision === "CANCEL" ? `pulizia del ${fmtIt(ta.cleaningDate)} cancellata` : `pulizia del ${fmtIt(ta.cleaningDate)} confermata`}.` },
            { role: "ADMIN", priority: "high" }
          );
        } catch {}
      }
    } catch {}

    return NextResponse.json({ success: true, decision, message: resultMsg });
  } catch (e: any) {
    console.error("[turnover-decision] errore:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
