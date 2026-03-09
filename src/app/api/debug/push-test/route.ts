import { NextRequest, NextResponse } from "next/server";
import { getMessaging } from "firebase-admin/messaging";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  
  if (secret !== (process.env.CRON_SECRET )) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    // 1. Controlla quanti token ci sono in userDevices
    const devicesSnap = await adminDb.collection("userDevices").get();
    results.totalDevices = devicesSnap.size;
    results.devices = devicesSnap.docs.map(doc => ({
      id: doc.id,
      userId: (doc.data() as Record<string, any>).userId,
      isActive: (doc.data() as Record<string, any>).isActive,
      token: (doc.data() as Record<string, any>).token?.substring(0, 20) + "...",
      createdAt: (doc.data() as Record<string, any>).createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: (doc.data() as Record<string, any>).updatedAt?.toDate?.()?.toISOString() || null,
    }));

    // 2. Controlla token attivi
    const activeSnap = await adminDb.collection("userDevices").where("isActive", "==", true).get();
    results.activeDevices = activeSnap.size;
    results.activeTokens = activeSnap.docs.map(doc => ({
      userId: (doc.data() as Record<string, any>).userId,
      token: (doc.data() as Record<string, any>).token?.substring(0, 30) + "...",
    }));

    // 3. Prova a inviare una push di test al primo token attivo
    if (activeSnap.size > 0) {
      const firstDevice = activeSnap.docs[0].data();
      const testToken = firstDevice.token;
      
      try {
        const messaging = getMessaging();
        
        const message = {
          notification: {
            title: "🔔 Test Push Notification",
            body: "Se vedi questo messaggio, le push funzionano!",
          },
          data: {
            type: "TEST",
            timestamp: new Date().toISOString(),
          },
          webpush: {
            notification: {
              icon: "/favicon.ico",
              badge: "/favicon.ico",
            },
            fcmOptions: {
              link: "/dashboard",
            },
          },
          token: testToken,
        };

        const sendResult = await messaging.send(message);
        results.testPush = {
          success: true,
          messageId: sendResult,
          sentTo: firstDevice.userId,
          token: testToken.substring(0, 20) + "...",
        };
      } catch (pushError: any) {
        results.testPush = {
          success: false,
          error: pushError.message,
          code: pushError.code,
          sentTo: firstDevice.userId,
          token: testToken.substring(0, 20) + "...",
        };
      }
    } else {
      results.testPush = {
        success: false,
        error: "Nessun token attivo trovato - nessun dispositivo registrato",
      };
    }

    // 4. Info Firebase Admin
    results.firebaseAdmin = {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || "non configurato",
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL ? "configurato" : "mancante",
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY ? "configurato" : "mancante",
    };

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack?.split("\n").slice(0, 5),
    }, { status: 500 });
  }
}
