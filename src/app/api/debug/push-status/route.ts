/**
 * GET /api/debug/push-status?secret=XXXX
 * 
 * Mostra lo stato dei token push e testa l'invio.
 * Usa il CRON_SECRET per autenticazione.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getMessaging } from "firebase-admin/messaging";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    // 1. Tutti i documenti in userDevices
    const allDevices = await adminDb.collection("userDevices").get();
    results.totalDocuments = allDevices.size;

    // 2. Documenti attivi
    const activeDevices = await adminDb
      .collection("userDevices")
      .where("isActive", "==", true)
      .get();
    results.activeDocuments = activeDevices.size;

    // 3. Dettagli di tutti i documenti
    results.devices = allDevices.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        userId: d.userId,
        isActive: d.isActive,
        tokenPrefix: d.token ? d.token.substring(0, 30) + "..." : "MANCANTE",
        deviceType: d.deviceType,
        createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: d.updatedAt?.toDate?.()?.toISOString() || null,
        invalidatedReason: d.invalidatedReason || null,
      };
    });

    // 4. Lista utenti attivi
    const activeUsers = await adminDb
      .collection("users")
      .where("status", "==", "ACTIVE")
      .get();
    results.activeUsers = activeUsers.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      role: doc.data().role,
      email: doc.data().email,
    }));

    // 5. Verifica env
    results.env = {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "NON IMPOSTATA",
      CRON_SECRET: process.env.CRON_SECRET ? "OK" : "MANCANTE",
      FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID ? "OK" : "MANCANTE",
      NEXT_PUBLIC_FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ? "OK (" + (process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.length || 0) + " chars)" : "MANCANTE",
    };

    // 6. Test invio push se ci sono token attivi
    if (activeDevices.size > 0) {
      const firstDevice = activeDevices.docs[0].data();
      try {
        const messaging = getMessaging();
        const testResult = await messaging.send({
          data: {
            title: "🔔 Test Push",
            body: "Se vedi questo, le push funzionano!",
            type: "TEST",
          },
          token: firstDevice.token,
        });
        results.testPush = {
          success: true,
          messageId: testResult,
          sentToUser: firstDevice.userId,
        };
      } catch (pushErr: any) {
        results.testPush = {
          success: false,
          error: pushErr.message,
          code: pushErr.code,
          sentToUser: firstDevice.userId,
        };
      }
    } else {
      results.testPush = {
        success: false,
        error: "Nessun token attivo in userDevices - nessun dispositivo registrato",
        fix: "L'utente deve aprire l'app, accettare le notifiche, e il token verrà salvato in userDevices",
      };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack?.split("\n").slice(0, 5),
    }, { status: 500 });
  }
}
