import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/**
 * CRON: Alert turni non ancora chiusi (schedulato per le 20:00 Europe/Rome).
 *
 * Cerca workSessions con status="OPEN" aperti da più di 8 ore (o da giorni precedenti)
 * e invia notifica:
 *   - al dipendente: "Ricordati di chiudere il turno"
 *   - a ciascun admin: "[userName] ha il turno aperto da N ore"
 *
 * Il flag `alertedAt` sulla sessione evita notifiche duplicate se il cron gira più volte.
 *
 * IMPORTANTE: usa lo schema notifications esistente
 *   (title, message, type, recipientRole, recipientId, senderId, senderName,
 *    relatedEntityId, relatedEntityType, status: "UNREAD", createdAt, updatedAt)
 *
 * NON chiude automaticamente i turni: decide l'admin.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const now = Timestamp.now();
    const nowMs = now.toMillis();

    // Cerca SOLO sessioni OPEN. Filtro alertedAt in JS per evitare problemi
    // con documenti che non hanno il campo (query "== null" non li vede).
    const snap = await adminDb.collection("workSessions").where("status", "==", "OPEN").get();

    if (snap.empty) {
      return NextResponse.json({ success: true, message: "Nessuna sessione OPEN", alerted: 0 });
    }

    // Carica tutti gli admin (per notifiche)
    const adminSnap = await adminDb.collection("users").where("role", "==", "ADMIN").get();
    const admins = adminSnap.docs.map((d) => ({ id: d.id, name: d.data().name || d.data().email || "Admin" }));

    let alertedCount = 0;
    const errors: string[] = [];
    const batch = adminDb.batch();

    for (const sessionDoc of snap.docs) {
      const session = sessionDoc.data();

      // Salta se già segnalato
      if (session.alertedAt) continue;

      // Salta sessioni aperte da meno di 8 ore (troppo presto)
      const startMs = session.startAt?.toMillis?.() || 0;
      if (!startMs) continue;
      const hoursOpen = (nowMs - startMs) / 3600000;
      if (hoursOpen < 8) continue;

      const startTimeStr = new Date(startMs).toLocaleTimeString("it-IT", {
        timeZone: "Europe/Rome",
        hour: "2-digit",
        minute: "2-digit",
      });

      const hoursOpenRounded = Math.floor(hoursOpen);

      // Notifica al dipendente
      const dipNotifRef = adminDb.collection("notifications").doc();
      batch.set(dipNotifRef, {
        title: "⏰ Turno ancora aperto",
        message: `Hai un turno iniziato alle ${startTimeStr} (${hoursOpenRounded}h fa). Ricordati di chiuderlo quando hai finito di lavorare.`,
        type: "WARNING",
        recipientRole: session.userRole || "OPERATORE_PULIZIE",
        recipientId: session.userId,
        senderId: "system",
        senderName: "Sistema Turni",
        senderEmail: null,
        relatedEntityId: sessionDoc.id,
        relatedEntityType: "SHIFT",
        relatedEntityName: `Turno ${session.dateKey}`,
        actionRequired: true,
        actionStatus: "PENDING",
        link: session.userRole === "RIDER" ? "/rider" : "/operatore",
        status: "UNREAD",
        createdAt: now,
        updatedAt: now,
      });

      // Notifica agli admin
      for (const admin of admins) {
        const adminNotifRef = adminDb.collection("notifications").doc();
        batch.set(adminNotifRef, {
          title: `⚠️ Turno aperto: ${session.userName}`,
          message: `${session.userName} ha il turno aperto da ${hoursOpenRounded}h (iniziato alle ${startTimeStr} del ${session.dateKey}). Potrebbe essersi dimenticato di chiuderlo.`,
          type: "WARNING",
          recipientRole: "ADMIN",
          recipientId: admin.id,
          senderId: "system",
          senderName: "Sistema Turni",
          senderEmail: null,
          relatedEntityId: sessionDoc.id,
          relatedEntityType: "SHIFT",
          relatedEntityName: `Turno ${session.userName}`,
          actionRequired: true,
          actionStatus: "PENDING",
          link: "/dashboard/orari-lavoro",
          status: "UNREAD",
          createdAt: now,
          updatedAt: now,
        });
      }

      // Marca sessione come segnalata
      batch.update(sessionDoc.ref, { alertedAt: now, updatedAt: now });
      alertedCount++;
    }

    if (alertedCount === 0) {
      return NextResponse.json({
        success: true,
        message: "Nessuna sessione da segnalare (tutte < 8h o già segnalate)",
        alerted: 0,
      });
    }

    try {
      await batch.commit();
    } catch (e: any) {
      errors.push(`Batch commit error: ${e.message}`);
      console.error("Errore batch commit cron check-open-shifts:", e);
    }

    return NextResponse.json({
      success: true,
      alerted: alertedCount,
      admins: admins.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Errore cron check-open-shifts:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
