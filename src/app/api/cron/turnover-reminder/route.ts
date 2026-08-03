import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";
import { getModificationDeadline } from "~/lib/dateUtils";

export const dynamic = "force-dynamic";

/**
 * CRON — SOLLECITO DECISIONI TURNOVER NON PRESE
 *
 * Problema che risolve: la notifica "cambio ospiti o prolungamento?" veniva
 * inviata UNA VOLTA SOLA. Se nessuno premeva "Mantieni pulizia" / "Cancella
 * pulizia", la pulizia dubbia restava in programma senza che nessuno lo
 * ricordasse, e dopo 30 giorni cleanup-notifications cancellava pure la
 * notifica (lasciando la pulizia).
 *
 * Cosa fa: ogni giorno cerca le notifiche TURNOVER_DECISION ancora IRRISOLTE
 * la cui pulizia dubbia cade entro `days` giorni, e rimanda la notifica
 * (in-app + push) ad admin e proprietario. La notifica di sollecito porta gli
 * STESSI campi azione (actionKey, turnoverAction), quindi cliccandola si apre
 * il solito modal e la decisione risolve anche l'originale.
 *
 * Regole:
 *  - Max UN sollecito al giorno per decisione (guardia di idempotenza su
 *    `turnoverReminders/{actionKey}_{YYYY-MM-DD}`).
 *  - Se la pulizia non esiste più → la decisione si auto-chiude (qualcuno l'ha
 *    già cancellata per altra via): niente sollecito.
 *  - Al PROPRIETARIO non si manda più nulla oltre la deadline delle 20:00 del
 *    giorno prima: non potrebbe più agire. All'ADMIN sì, lui non ha limiti.
 *
 * NON crea, NON sposta e NON cancella pulizie. Tocca solo le notifiche.
 *
 * Uso (CRON-JOB.ORG, una volta al giorno):
 *   /api/cron/turnover-reminder?cronSecret=XXX
 *   [&days=3]     finestra di preavviso in giorni (default 3)
 *   [&dryRun=1]   simula senza scrivere nulla
 */

type AnyRec = Record<string, any>;

const fmtIt = (s: string) => {
  const p = String(s || "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
};

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const days = Math.max(1, Number(req.nextUrl.searchParams.get("days") || 3));
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0]!;
  const limitStr = new Date(today.getTime() + days * 86400000).toISOString().split("T")[0]!;

  const out: AnyRec = {
    dryRun,
    finestra: { da: todayStr, a: limitStr, giorni: days },
    esaminate: 0,
    solleciti: [] as AnyRec[],
    scartate: { risolte: 0, fuoriFinestra: 0, giaSollecitataOggi: 0, puliziaSparita: 0, senzaAzione: 0 },
    autoChiuse: [] as string[],
    errori: [] as string[],
  };

  try {
    // Equality su singolo campo: nessun indice composito richiesto.
    const snap = await adminDb.collection("notifications")
      .where("actionType", "==", "TURNOVER_DECISION").get();

    // Una decisione = un actionKey (admin + proprietario condividono la chiave).
    // Raggruppo per non mandare N solleciti per la stessa decisione.
    const byKey = new Map<string, { notif: AnyRec; id: string }[]>();
    for (const d of snap.docs) {
      const n = d.data() as AnyRec;
      out.esaminate++;
      if (n.actionResolved) { out.scartate.risolte++; continue; }
      const ta = n.turnoverAction;
      if (!ta?.cleaningId || !ta?.cleaningDate) { out.scartate.senzaAzione++; continue; }
      const key = n.actionKey || `nokey_${d.id}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push({ notif: n, id: d.id });
    }

    for (const [actionKey, group] of byKey) {
      const base = group[0]!.notif;
      const ta = base.turnoverAction as AnyRec;
      const cleaningDate: string = ta.cleaningDate;

      // Finestra: pulizia dubbia da oggi a oggi+days
      if (cleaningDate < todayStr || cleaningDate > limitStr) { out.scartate.fuoriFinestra++; continue; }

      // La pulizia esiste ancora?
      const cSnap = await adminDb.collection("cleanings").doc(ta.cleaningId).get();
      if (!cSnap.exists) {
        // Già sparita per altra via: chiudo la decisione, non ha più senso.
        out.scartate.puliziaSparita++;
        if (!dryRun) {
          for (const g of group) {
            await adminDb.collection("notifications").doc(g.id).update({
              actionResolved: "CANCEL",
              actionResolvedBy: "system",
              actionResolvedByRole: "SYSTEM",
              actionResolvedAt: Timestamp.now(),
              actionRequired: false,
              actionStatus: "DONE",
              autoResolvedReason: "Pulizia non più esistente al momento del sollecito",
              updatedAt: Timestamp.now(),
            });
          }
        }
        out.autoChiuse.push(actionKey);
        continue;
      }

      // Idempotenza: max un sollecito al giorno per decisione
      const guardId = `${actionKey}_${todayStr}`;
      const guardRef = adminDb.collection("turnoverReminders").doc(guardId);
      const guardSnap = await guardRef.get();
      if (guardSnap.exists) { out.scartate.giaSollecitataOggi++; continue; }

      const dl = getModificationDeadline(cleaningDate);
      const propertyName = ta.propertyName || "la tua casa";
      const giorniMancanti = Math.round(
        (new Date(`${cleaningDate}T12:00:00Z`).getTime() - new Date(`${todayStr}T12:00:00Z`).getTime()) / 86400000
      );
      const quando = giorniMancanti <= 0 ? "OGGI" : giorniMancanti === 1 ? "DOMANI" : `tra ${giorniMancanti} giorni`;

      const titolo = `⏰ Decisione in sospeso: pulizia del ${fmtIt(cleaningDate)} (${quando})`;
      const corpoBase =
        `🏠 ${propertyName}\n\n` +
        `Non hai ancora risposto alla domanda sul cambio ospiti del ${fmtIt(cleaningDate)}.\n\n` +
        `Ti ricordiamo la situazione: una prenotazione si era allungata` +
        (ta.newCleaningDate ? ` fino al ${fmtIt(ta.newCleaningDate)}` : "") +
        `, e Booking non ci dice se il ${fmtIt(cleaningDate)} entra un nuovo ospite o se è lo stesso che è rimasto.\n\n` +
        `⚠️ Se non premi né "Mantieni pulizia" né "Cancella pulizia", la pulizia del ${fmtIt(cleaningDate)} RESTA IN PROGRAMMA: verrà eseguita e fatturata.\n\n` +
        `👉 Apri questa notifica e scegli.`;

      const azione = {
        actionRequired: true,
        actionStatus: "PENDING",
        actionType: "TURNOVER_DECISION",
        actionKey,
        turnoverAction: ta,
        isReminder: true,
      };

      const inviati: string[] = [];

      if (!dryRun) {
        // ── ADMIN (sempre: non ha limiti di deadline) ──────────────
        const adminsSnap = await adminDb.collection("users").where("role", "==", "ADMIN").get();
        for (const aDoc of adminsSnap.docs) {
          await adminDb.collection("notifications").add({
            title: titolo,
            message: corpoBase,
            type: "WARNING",
            ...azione,
            recipientRole: "ADMIN", recipientId: aDoc.id,
            senderId: "system", senderName: "Promemoria Turnover",
            status: "UNREAD", createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
          });
          inviati.push(`ADMIN:${aDoc.id}`);
        }
        try {
          const { sendPushNotification } = await import("~/lib/notifications/sendPushNotification");
          await sendPushNotification(
            { title: titolo, body: `${propertyName}: decidi se la pulizia del ${fmtIt(cleaningDate)} va fatta o cancellata. Senza risposta resta in programma.` },
            { role: "ADMIN", priority: "high" }
          );
        } catch { /* push non bloccante */ }

        // ── PROPRIETARIO (solo se può ancora agire) ────────────────
        const ownerNotif = group.find(g => String(g.notif.recipientRole || "").toUpperCase() === "PROPRIETARIO");
        const ownerId = ownerNotif ? String(ownerNotif.notif.recipientId || "").trim() : "";
        if (ownerId && ownerId !== "pending") {
          if (dl.isPast) {
            inviati.push("PROPRIETARIO:saltato (deadline superata)");
          } else {
            await adminDb.collection("notifications").add({
              title: titolo,
              message: corpoBase + `\n\n⏳ Puoi cancellarla online fino alle ${dl.deadlineLabel}. Dopo, scrivici o chiamaci.`,
              type: "WARNING",
              ...azione,
              recipientRole: "PROPRIETARIO", recipientId: ownerId,
              senderId: "system", senderName: "Promemoria Turnover",
              status: "UNREAD", createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
            });
            inviati.push(`PROPRIETARIO:${ownerId}`);
            try {
              const { sendPushNotification } = await import("~/lib/notifications/sendPushNotification");
              await sendPushNotification(
                { title: titolo, body: `${propertyName}: manca la tua risposta sulla pulizia del ${fmtIt(cleaningDate)}. Senza risposta viene fatta e fatturata.` },
                { userId: ownerId, priority: "high" }
              );
            } catch { /* push non bloccante */ }
          }
        }

        await guardRef.set({
          actionKey, cleaningId: ta.cleaningId, cleaningDate,
          propertyId: ta.propertyId || null, propertyName: ta.propertyName || null,
          sentTo: inviati, sentAt: Timestamp.now(),
        });
      }

      out.solleciti.push({
        actionKey,
        propertyName: ta.propertyName || null,
        cleaningDate,
        giorniMancanti,
        deadlineProprietario: dl.deadlineLabel,
        deadlineSuperataPerProprietario: dl.isPast,
        destinatari: dryRun ? "(dry-run: nessun invio)" : inviati,
      });
    }

    return NextResponse.json({ success: true, ...out }, { status: 200 });
  } catch (e: any) {
    console.error("[turnover-reminder] errore:", e);
    return NextResponse.json({ error: e?.message || String(e), parziale: out }, { status: 500 });
  }
}
