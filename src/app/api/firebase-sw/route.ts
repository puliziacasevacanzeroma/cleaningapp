/**
 * GET /api/firebase-sw
 *
 * Serve il Firebase Messaging Service Worker con le variabili d'ambiente
 * iniettate a runtime. I service worker sono file statici e non possono
 * leggere process.env — questo endpoint risolve il problema generando
 * il file JS dinamicamente lato server.
 *
 * Il client lo registra come:
 *   navigator.serviceWorker.register('/api/firebase-sw')
 *
 * Il browser lo tratta come un normale service worker grazie all'header
 * Content-Type: application/javascript e Service-Worker-Allowed: /
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? "",
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? "",
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? "",
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? "",
    measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID     ?? "",
  };

  // Legge il corpo del SW dal file statico e inietta la config
  // IMPORTANTE: JSON.stringify è safe per l'iniezione — nessun rischio XSS
  // perché il contenuto è sempre proveniente da variabili d'ambiente server.
  const swContent = `
/**
 * Firebase Messaging Service Worker — generato dinamicamente da /api/firebase-sw
 * Le credenziali vengono iniettate dal server, non hardcoded.
 */

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

const firebaseConfig = ${JSON.stringify(config)};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Gestione messaggi in background (data-only per evitare notifiche duplicate)
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || 'CleaningApp';
  const body = data.body || 'Hai una nuova notifica';

  return self.registration.showNotification(title, {
    body: body,
    icon: '/Favicon_192.png',
    badge: '/badge-icon.png',
    tag: 'fcm-' + (data.notificationId || Date.now()),
    data: data,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    renotify: true,
  });
});

// Click sulla notifica — naviga alla sezione appropriata
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.click_action || data.link || '/';

  if (!data.click_action && !data.link) {
    switch (data.type) {
      case 'NEW_PROPERTY':
      case 'PROPERTY_APPROVED':
      case 'PROPERTY_REJECTED':
        targetUrl = '/dashboard/proprieta';
        break;
      case 'CLEANING_ASSIGNED':
      case 'CLEANING_COMPLETED':
      case 'CLEANING_STARTED':
        targetUrl = '/dashboard/calendario/pulizie';
        break;
      case 'LAUNDRY_NEW':
      case 'LAUNDRY_ASSIGNED':
      case 'LAUNDRY_DELIVERED':
        targetUrl = '/dashboard/ordini';
        break;
      default:
        targetUrl = '/dashboard';
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));
`;

  return new NextResponse(swContent, {
    headers: {
      // Questi header sono OBBLIGATORI perché il browser tratti questa response
      // come un service worker valido
      "Content-Type": "application/javascript; charset=utf-8",
      // Permette al SW di controllare tutto il sito (root scope)
      "Service-Worker-Allowed": "/",
      // Cache breve: vogliamo che i cambi alle variabili si propaghino rapidamente
      "Cache-Control": "public, max-age=3600",
    },
  });
}
