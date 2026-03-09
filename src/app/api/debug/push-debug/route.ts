import { NextRequest, NextResponse } from "next/server";
import { getMessaging } from "firebase-admin/messaging";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  if (secret !== (process.env.CRON_SECRET )) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  try {
    const body = await validateBody(req, GenericBodySchema);
    if (body instanceof Response) return body;
    const { token, userId, mode } = body;
    if (!token) return NextResponse.json({ error: "Token mancante" }, { status: 400 });
    const results: Record<string, unknown> = {};

    // Salva token con il VERO userId
    if (userId) {
      try {
        // @ts-expect-error TODO-FIX: TS2769 No overload matches this call.
        const tokenHash = Buffer.from(token).toString('base64').substring(0, 20);
        const docId = `${userId}_${tokenHash}`;
        await adminDb.collection("userDevices").doc(docId).set( {
          userId, token, deviceType: "web",
          deviceInfo: { userAgent: body.userAgent || "unknown", platform: "android", language: "it" },
          isActive: true, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
        });
        results.saved = { success: true, docId };
      } catch (saveErr: any) {
        results.saved = { success: false, error: saveErr.message };
      }
    }

    // Invia push
    try {
      const messaging = getMessaging();
      const sendResult = await messaging.send({
        data: {
          title: "🔔 Push Test",
          body: "Push inviata a userId: " + (userId || "sconosciuto"),
          type: "TEST",
          timestamp: new Date().toISOString(),
        },
        webpush: { headers: { Urgency: "high" } },
        // @ts-expect-error TODO-FIX: TS2322 Type '{}' is not assignable to type 'string'.
        token: token,
      });
      results.push = { success: true, messageId: sendResult };
    } catch (pushErr: any) {
      results.push = { success: false, error: pushErr.message, code: pushErr.code };
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  if (secret !== (process.env.CRON_SECRET )) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";
  
  // Prendi tutti i dispositivi per il report
  let devicesInfo = "loading...";
  try {
    const snap = await adminDb.collection("userDevices").get();
    const devices = snap.docs.map(d => ({
      id: d.id,
      userId: (d.data() as Record<string, any>).userId,
      isActive: (d.data() as Record<string, any>).isActive,
      token: ((d.data() as Record<string, any>).token || "").substring(0, 15) + "...",
    }));
    devicesInfo = JSON.stringify(devices, null, 2);
  } catch(e) {
    devicesInfo = "error";
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Push Debug v4</title>
  <style>
    body { font-family: sans-serif; padding: 12px; font-size: 13px; }
    .log { background: #f0f0f0; padding: 6px 8px; margin: 3px 0; border-radius: 4px; word-break: break-all; font-size: 12px; }
    .ok { background: #d4edda; }
    .err { background: #f8d7da; }
    .warn { background: #fff3cd; }
    button { display: block; width: 100%; padding: 14px; font-size: 15px; margin: 6px 0; border-radius: 8px; border: none; color: white; cursor: pointer; background: #0066ff; }
    pre { background: #f5f5f5; padding: 8px; font-size: 11px; overflow-x: auto; border-radius: 4px; }
  </style>
</head>
<body>
  <h2>🔍 Push Debug v4 - Deep Analysis</h2>
  
  <button onclick="simulateAppInit()">🔬 Simula PushNotificationInit (come fa l'app)</button>
  <button onclick="testSWDirect()" style="background:#009900">✅ Test SW Diretto (funziona)</button>
  
  <h3>Dispositivi registrati:</h3>
  <pre>${devicesInfo}</pre>
  
  <div id="logs"></div>

  <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js"></script>
  <script>
    const VAPID_KEY = "${vapidKey}";
    // Config letta da variabili d'ambiente (non hardcoded)
    const firebaseConfig = {
      apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
      authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
      projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
      storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
      appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    };

    function log(msg, type) {
      const d = document.createElement('div');
      d.className = 'log ' + (type || '');
      d.textContent = new Date().toLocaleTimeString() + ' - ' + msg;
      document.getElementById('logs').appendChild(d);
    }

    async function testSWDirect() {
      document.getElementById('logs').innerHTML = '';
      try {
        const reg = await navigator.serviceWorker.register('/api/firebase-sw');
        await navigator.serviceWorker.ready;
        await reg.showNotification('✅ SW OK', { body: 'Funziona!', icon: '/favicon.ico', tag: 'sw-' + Date.now() });
        log('✅ Notifica SW inviata', 'ok');
      } catch(e) { log('❌ ' + e.message, 'err'); }
    }

    // Simula ESATTAMENTE quello che fa PushNotificationInit + messaging.ts
    async function simulateAppInit() {
      document.getElementById('logs').innerHTML = '';
      log('=== SIMULAZIONE PushNotificationInit ===');
      
      // Step 0: Simula useAuth - ottieni userId dal cookie/localStorage
      log('Step 0: Cerco userId...');
      let userId = null;
      
      // Prova a leggere da cookie auth
      try {
        const cookies = document.cookie.split(';').map(c => c.trim());
        log('Cookies trovati: ' + cookies.length);
        for (const c of cookies) {
          log('Cookie: ' + c.substring(0, 50) + '...');
        }
      } catch(e) { log('Cookie error: ' + e.message, 'warn'); }
      
      // Prova a leggere da localStorage
      try {
        const keys = Object.keys(localStorage);
        log('localStorage keys: ' + keys.length);
        for (const k of keys) {
          if (k.includes('user') || k.includes('auth') || k.includes('firebase')) {
            const val = localStorage.getItem(k);
            log('LS[' + k + ']: ' + (val || '').substring(0, 80) + '...'); 
          }
        }
      } catch(e) { log('localStorage error: ' + e.message, 'warn'); }

      // Prova a ottenere l'utente da Firebase Auth
      try {
        const app = firebase.app();
        log('Firebase app: ' + app.name);
      } catch(e) {
        try { firebase.initializeApp(firebaseConfig); log('Firebase inizializzato'); } catch(e2) {}
      }
      
      // Prova IndexedDB per Firebase Auth
      try {
        const dbs = await indexedDB.databases();
        log('IndexedDB databases: ' + dbs.map(d => d.name).join(', '));
      } catch(e) { log('IndexedDB: ' + e.message, 'warn'); }

      // Per ora chiedi manualmente
      userId = prompt('Inserisci il tuo userId (es: AmpfljZxI3ebfjtwN5xcD51tWRn2):');
      if (!userId) {
        log('❌ userId non inserito - STOP', 'err');
        log('QUESTO È IL PROBLEMA: PushNotificationInit usa user?.id da useAuth()', 'err');
        log('Se useAuth() non restituisce user.id sul mobile, il componente non fa nulla', 'err');
        return;
      }
      log('userId: ' + userId, 'ok');

      // Step 1: isNotificationSupported
      log('Step 1: Check supporto...');
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        log('❌ Non supportato', 'err'); return;
      }
      log('✅ Supportato', 'ok');

      // Step 2: Registra SW e aspetta attivazione
      log('Step 2: Registro Service Worker...');
      try {
        const registration = await navigator.serviceWorker.register('/api/firebase-sw');
        log('SW registrato, stato: installing=' + !!registration.installing + ' waiting=' + !!registration.waiting + ' active=' + !!registration.active);
        
        if (registration.installing) {
          log('SW sta installando, aspetto...');
          await new Promise((resolve) => {
            registration.installing.addEventListener('statechange', (e) => {
              log('SW state change: ' + e.target.state);
              if (e.target.state === 'activated') resolve();
            });
          });
        } else if (registration.waiting) {
          log('SW in attesa, aspetto...');
          await new Promise((resolve) => {
            registration.waiting.addEventListener('statechange', (e) => {
              log('SW state change: ' + e.target.state);
              if (e.target.state === 'activated') resolve();
            });
          });
        }
        
        const swReady = await navigator.serviceWorker.ready;
        log('✅ SW ready, scope: ' + swReady.scope, 'ok');
      } catch(swErr) {
        log('❌ SW errore: ' + swErr.message, 'err'); return;
      }

      // Step 3: Check permesso
      log('Step 3: Permesso notifiche...');
      const permission = Notification.permission;
      log('Permesso attuale: ' + permission);
      if (permission === 'denied') { log('❌ NEGATO', 'err'); return; }
      if (permission === 'default') {
        const result = await Notification.requestPermission();
        log('Risultato richiesta: ' + result);
        if (result !== 'granted') { log('❌ Non concesso', 'err'); return; }
      }
      log('✅ Permesso OK', 'ok');

      // Step 4: VAPID key
      log('Step 4: VAPID key...');
      if (!VAPID_KEY) { log('❌ VAPID_KEY vuota!', 'err'); return; }
      log('✅ VAPID_KEY: ' + VAPID_KEY.substring(0, 20) + '...', 'ok');

      // Step 5: getToken (come fa messaging.ts)
      log('Step 5: Ottengo token FCM...');
      try {
        const messaging = firebase.messaging();
        const swReg = await navigator.serviceWorker.ready;
        
        const token = await messaging.getToken({
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });
        
        if (!token) { log('❌ Token null', 'err'); return; }
        log('✅ Token: ' + token.substring(0, 30) + '...', 'ok');

        // Step 6: Salva token in Firestore (come fa messaging.ts saveDeviceToken)
        log('Step 6: Salvo token in Firestore...');
        try {
          const resp = await fetch('/api/debug/push-debug?secret=CRON_SECRET_VALUE', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, userId, userAgent: navigator.userAgent }),
          });
          const data = await resp.json();
          
          if (data.saved?.success) {
            log('✅ Token salvato: ' + data.saved.docId, 'ok');
          } else {
            log('❌ Salvataggio fallito: ' + JSON.stringify(data.saved), 'err');
          }

          if (data.push?.success) {
            log('✅ Push test inviata!', 'ok');
            log('📱 Minimizza il browser per vedere la notifica!', 'warn');
          }
        } catch(saveErr) {
          log('❌ Errore salvataggio: ' + saveErr.message, 'err');
        }

        // Step 7: Foreground handler
        log('Step 7: Registro foreground handler...');
        messaging.onMessage((payload) => {
          log('📩 FOREGROUND: ' + JSON.stringify(payload), 'warn');
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(
              payload.notification?.title || payload.data?.title || 'Notifica',
              { body: payload.notification?.body || payload.data?.body || '', icon: '/favicon.ico', tag: 'fg-' + Date.now() }
            );
          });
        });
        log('✅ Foreground handler registrato', 'ok');

      } catch(tokenErr) {
        log('❌ Token errore: ' + tokenErr.message, 'err');
        log('Stack: ' + tokenErr.stack, 'err');
      }

      log('=== FINE SIMULAZIONE ===');
    }
  </script>
</body>
</html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
