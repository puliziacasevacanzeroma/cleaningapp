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
    const thirtyDaysAgo = Timestamp.fromDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const sixtyDaysAgo = Timestamp.fromDate(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));

    // Query semplice: prendi tutte le notifiche più vecchie di 60 giorni
    // (nessun indice composto necessario - usa solo createdAt)
    const oldSnap = await adminDb.collection("notifications")
      .where("createdAt", "<", thirtyDaysAgo)
      .get();

    let deletedRead = 0;
    let deletedUnread = 0;

    for (const docSnap of oldSnap.docs) {
      try {
        const data = docSnap.data() as Record<string, any>;
        const status = data.status || "";
        const createdAt = data.createdAt;

        // Notifiche READ/ARCHIVED più vecchie di 30 giorni → elimina
        if (status === "READ" || status === "ARCHIVED") {
          await docSnap.ref.delete();
          deletedRead++;
          continue;
        }

        // Notifiche UNREAD più vecchie di 60 giorni → elimina
        if (status === "UNREAD" && createdAt && createdAt < sixtyDaysAgo) {
          await docSnap.ref.delete();
          deletedUnread++;
          continue;
        }
      } catch (e) {
        console.error(`Errore eliminazione notifica ${docSnap.id}:`, e);
      }
    }

    const totalDeleted = deletedRead + deletedUnread;

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
