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

    if (process.env.NODE_ENV !== "production") console.log("🧹 Cron cleanup-notifications: Inizio pulizia...");

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // 1. Elimina notifiche READ/ARCHIVED più vecchie di 30 giorni
    const readOldSnap = await adminDb.collection("notifications")
      .where("status", "in", ["READ", "ARCHIVED"])
      .where("createdAt", "<", Timestamp.fromDate(thirtyDaysAgo))
      .get();

    let deletedRead = 0;
    for (const docSnap of readOldSnap.docs) {
      try {
        await docSnap.ref.delete();
        deletedRead++;
      } catch (e) {
        console.error(`Errore eliminazione notifica ${docSnap.id}:`, e);
      }
    }

    // 2. Elimina notifiche UNREAD più vecchie di 60 giorni
    const unreadOldSnap = await adminDb.collection("notifications")
      .where("status", "==", "UNREAD")
      .where("createdAt", "<", Timestamp.fromDate(sixtyDaysAgo))
      .get();

    let deletedUnread = 0;
    for (const docSnap of unreadOldSnap.docs) {
      try {
        await docSnap.ref.delete();
        deletedUnread++;
      } catch (e) {
        console.error(`Errore eliminazione notifica ${docSnap.id}:`, e);
      }
    }

    const totalDeleted = deletedRead + deletedUnread;
    if (process.env.NODE_ENV !== "production") console.log(`🧹 Cleanup completato: ${totalDeleted} notifiche eliminate`);

    return NextResponse.json({
      success: true,
      message: `Eliminate ${totalDeleted} notifiche vecchie`,
      timestamp: now.toISOString(),
      details: { readArchived: deletedRead, unreadOld: deletedUnread, total: totalDeleted },
    });
  } catch (error) {
    console.error("❌ Errore cron cleanup-notifications:", error);
    return NextResponse.json({ success: false, error: "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
