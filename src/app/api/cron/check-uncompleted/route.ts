import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const snapshot = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", Timestamp.fromDate(todayStart))
      .where("scheduledDate", "<=", Timestamp.fromDate(todayEnd))
      .get();

    const uncompletedCleanings = snapshot.docs
      .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }))
      .filter((cleaning: any) =>
        cleaning.status !== "COMPLETED" &&
        cleaning.status !== "CANCELLED" &&
        cleaning.status !== "completed" &&
        cleaning.status !== "cancelled"
      );

    if (uncompletedCleanings.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Tutte le pulizie di oggi sono completate",
        total: snapshot.docs.length,
        uncompleted: 0,
      });
    }

    const results = [];
    const nowTimestamp = Timestamp.now();

    for (const cleaning of uncompletedCleanings) {
      const c = cleaning as any;
      try {
        await adminDb.collection("cleanings").doc(c.id).update({
          missedDeadline: true,
          missedDeadlineAt: nowTimestamp,
          updatedAt: nowTimestamp,
        });

        await adminDb.collection("notifications").add({
          title: "⚠️ Pulizia non completata",
          message: `La pulizia di "${c.propertyName}" non è stata completata entro le 18:00. ${c.operatorName ? `Operatore: ${c.operatorName}` : "Nessun operatore assegnato"}`,
          type: "URGENT",
          recipientRole: "ADMIN",
          recipientId: null,
          senderId: "system",
          senderName: "Sistema Automatico",
          status: "UNREAD",
          actionRequired: true,
          relatedEntityId: c.id,
          relatedEntityType: "CLEANING",
          relatedEntityName: c.propertyName,
          link: `/dashboard/calendario/pulizie`,
          createdAt: nowTimestamp,
          updatedAt: nowTimestamp,
        });

        if (c.operatorId) {
          await adminDb.collection("notifications").add({
            title: "⚠️ Pulizia non completata",
            message: `La pulizia di "${c.propertyName}" risulta non completata. Se l'hai completata, verifica lo stato nell'app.`,
            type: "WARNING",
            recipientRole: "OPERATORE_PULIZIE",
            recipientId: c.operatorId,
            senderId: "system",
            senderName: "Sistema Automatico",
            status: "UNREAD",
            actionRequired: true,
            relatedEntityId: c.id,
            relatedEntityType: "CLEANING",
            link: `/operatore`,
            createdAt: nowTimestamp,
            updatedAt: nowTimestamp,
          });
        }

        results.push({ id: c.id, propertyName: c.propertyName, status: c.status, operatorName: c.operatorName || "Non assegnato", notified: true });
        if (process.env.NODE_ENV !== "production") console.log(`⚠️ Pulizia ${c.id} (${c.propertyName}) marcata come non completata`);
      } catch (error) {
        console.error(`Errore processamento pulizia ${c.id}:`, error);
        results.push({ id: c.id, propertyName: c.propertyName, error: true });
      }
    }

    return NextResponse.json({
      success: true,
      message: `${uncompletedCleanings.length} pulizie non completate trovate e notificate`,
      timestamp: now.toISOString(),
      total: snapshot.docs.length,
      uncompleted: uncompletedCleanings.length,
      results,
    });
  } catch (error) {
    console.error("❌ Errore cron check-uncompleted:", error);
    return NextResponse.json({ success: false, error: "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
