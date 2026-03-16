/**
 * GET /api/cron/health
 * Verifica che il cron iCal stia girando regolarmente.
 * Chiamato da Railway o da monitoring esterno ogni ora.
 * Se l'ultimo sync è > 25h → manda notifica admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_HOURS_WITHOUT_SYNC = 25; // alert se cron non gira da più di 25h

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Leggi l'ultimo log di sync
    const logsSnap = await adminDb.collection("syncLogs")
      .where("type", "==", "CRON")
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    const now = new Date();

    if (logsSnap.empty) {
      await sendAlert("Il cron iCal non ha mai girato. Verifica la configurazione Railway.");
      return NextResponse.json({ status: "never_run", alert: true });
    }

    const lastLog = logsSnap.docs[0].data() as Record<string, any>;
    const lastSync = lastLog.timestamp?.toDate?.() || new Date(0);
    const hoursSinceLastSync = (now.getTime() - lastSync.getTime()) / 3600000;

    if (hoursSinceLastSync > MAX_HOURS_WITHOUT_SYNC) {
      await sendAlert(
        `Il cron iCal non gira da ${Math.round(hoursSinceLastSync)} ore. ` +
        `Ultimo sync: ${lastSync.toLocaleString("it-IT")}. ` +
        `Verifica Railway e i log del server.`
      );
      return NextResponse.json({
        status: "stale",
        hoursSinceLastSync: Math.round(hoursSinceLastSync),
        lastSync: lastSync.toISOString(),
        alert: true,
      });
    }

    // Controlla anche se ci sono proprietà attive senza sync recente
    const propsSnap = await adminDb.collection("properties")
      .where("status", "==", "ACTIVE")
      .get();

    const staleProperies: string[] = [];
    for (const doc of propsSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const hasIcal = data.icalAirbnb || data.icalBooking || data.icalOktorate ||
                     data.icalInreception || data.icalKrossbooking;
      if (!hasIcal) continue; // proprietà senza feed iCal → ok

      const propLastSync = data.lastIcalSync?.toDate?.();
      if (!propLastSync) {
        staleProperies.push(`${data.name} (mai sincronizzata)`);
        continue;
      }
      const propHours = (now.getTime() - propLastSync.getTime()) / 3600000;
      if (propHours > MAX_HOURS_WITHOUT_SYNC) {
        staleProperies.push(`${data.name} (${Math.round(propHours)}h fa)`);
      }
    }

    if (staleProperies.length > 0) {
      await sendAlert(
        `Proprietà non sincronizzate da > ${MAX_HOURS_WITHOUT_SYNC}h: ${staleProperies.join(", ")}`
      );
    }

    return NextResponse.json({
      status: "ok",
      hoursSinceLastSync: Math.round(hoursSinceLastSync * 10) / 10,
      lastSync: lastSync.toISOString(),
      lastStats: lastLog.stats,
      staleProperties: staleProperies,
    });

  } catch (error: any) {
    console.error("Health check error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function sendAlert(message: string) {
  try {
    await adminDb.collection("notifications").add({
      title: "🚨 Cron iCal — Problema Rilevato",
      message,
      type: "ERROR",
      recipientRole: "ADMIN",
      senderId: "system",
      senderName: "Health Monitor",
      actionRequired: true,
      status: "UNREAD",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (e) {
    console.error("Errore invio alert:", e);
  }
}
