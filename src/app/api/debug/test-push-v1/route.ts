/**
 * TEST PUSH: invia una notifica push di prova al tuo utente + diagnostica token.
 * GET /api/debug/test-push-v1?cronSecret=XXX&userId=YYY
 *
 * Apri questo link DAL TELEFONO con l'app CHIUSA:
 *  - se ti arriva la notifica push → il sistema push funziona ✅
 *  - se non arriva → guarda "diagnostica" qui sotto per capire perché
 *
 * Mostra anche quanti token FCM ha registrato l'utente (se 0 = nessun
 * dispositivo registrato, ecco perché non arrivano push).
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { sendPushToUser } from "~/lib/notifications/sendPushNotification";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Passa &userId= (l'ID del tuo utente)" }, { status: 400 });
  }

  try {
    // 1. Diagnostica: l'utente esiste? quanti token ha?
    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "Utente non trovato con questo userId", userId }, { status: 404 });
    }
    const userData = userDoc.data()!;

    // I token possono essere salvati in collection deviceTokens o sul doc user.
    // Provo entrambe le fonti comuni.
    const tokensSnap = await adminDb.collection("deviceTokens")
      .where("userId", "==", userId)
      .get()
      .catch(() => null);

    const tokensFromCollection = tokensSnap
      ? tokensSnap.docs.map(d => ({ id: d.id, isActive: d.data().isActive, deviceType: d.data().deviceType, tokenPreview: (d.data().token || "").slice(0, 20) + "..." }))
      : [];

    const tokenOnUser = userData.fcmToken || userData.deviceToken || null;

    // 2. Invia la push di prova
    const result = await sendPushToUser(
      userId,
      "🔔 Test notifica push",
      "Se vedi questa notifica, le push funzionano correttamente! ✅",
      { type: "TEST", timestamp: String(Date.now()) }
    );

    return NextResponse.json({
      success: true,
      messaggio: "Push di prova inviata. Controlla il telefono (anche con app chiusa).",
      risultatoInvio: result,
      diagnostica: {
        utente: userData.name || userData.email,
        tokenInCollectionDeviceTokens: tokensFromCollection.length,
        dettaglioToken: tokensFromCollection,
        tokenSulDocUtente: tokenOnUser ? (tokenOnUser.slice(0, 20) + "...") : "nessuno",
        nota: tokensFromCollection.length === 0 && !tokenOnUser
          ? "⚠️ NESSUN TOKEN registrato per questo utente → ecco perché le push non arrivano. Il dispositivo non si è registrato. Causa probabile: permessi notifiche negati, o PushInit non ha completato la registrazione."
          : "Token presente/i. Se la push non arriva comunque, il problema è nella consegna (FCM/service worker), non nella registrazione.",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore invio push", message: error?.message, stack: error?.stack?.slice(0, 400) }, { status: 500 });
  }
}
