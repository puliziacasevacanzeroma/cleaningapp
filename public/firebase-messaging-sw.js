/**
 * Firebase Messaging Service Worker
 * 
 * Questo file DEVE essere nella cartella public/ alla root del progetto
 * e viene registrato automaticamente da messaging.ts
 */

// Importa gli script Firebase necessari
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Configurazione Firebase (deve corrispondere a config.ts)
const firebaseConfig = {
  apiKey: "AIzaSyCskZjg2oOZ0gNdKEnvn680rYMaNdCdwmY",
  authDomain: "cleaningapp-38e4f.firebaseapp.com",
  projectId: "cleaningapp-38e4f",
  storageBucket: "cleaningapp-38e4f.firebasestorage.app",
  messagingSenderId: "458676800148",
  appId: "1:458676800148:web:efabefbc460c613b748281",
  measurementId: "G-BSYVG8WN8Q"
};

// Inizializza Firebase
firebase.initializeApp(firebaseConfig);

// Inizializza Messaging
const messaging = firebase.messaging();

// Gestisci notifiche in background
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Notifica in background ricevuta:', payload);

  const notificationTitle = payload.notification?.title || 'CleaningApp';
  const notificationOptions = {
    body: payload.notification?.body || 'Hai una nuova notifica',
    icon: payload.notification?.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.data?.notificationId || 'default',
    data: payload.data,
    // Azioni rapide (opzionali)
    actions: getNotificationActions(payload.data?.type),
    // Vibrazione per mobile
    vibrate: [200, 100, 200],
    // Mostra anche se l'utente sta usando un'altra app
    requireInteraction: payload.data?.priority === 'high',
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Gestisci click sulla notifica
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Click su notifica:', event);
  
  event.notification.close();

  // Determina URL da aprire
  const data = event.notification.data || {};
  let targetUrl = '/';

  // Se c'è un link specifico, usalo
  if (data.link) {
    targetUrl = data.link;
  } else {
    // Altrimenti, determina in base al tipo di notifica
    switch (data.type) {
      case 'NEW_PROPERTY':
      case 'PROPERTY_APPROVED':
      case 'PROPERTY_REJECTED':
        targetUrl = '/dashboard/proprieta';
        break;
      case 'CLEANING_ASSIGNED':
      case 'CLEANING_COMPLETED':
      case 'CLEANING_STARTED':
        targetUrl = data.userRole === 'OPERATORE_PULIZIE' 
          ? '/operatore' 
          : '/dashboard/calendario/pulizie';
        break;
      case 'LAUNDRY_NEW':
      case 'LAUNDRY_ASSIGNED':
      case 'LAUNDRY_DELIVERED':
        targetUrl = data.userRole === 'RIDER' 
          ? '/rider' 
          : '/dashboard/ordini';
        break;
      case 'PAYMENT_DUE':
      case 'PAYMENT_RECEIVED':
        targetUrl = '/dashboard/pagamenti';
        break;
      default:
        targetUrl = '/dashboard';
    }
  }

  // Gestisci azione specifica se cliccata
  if (event.action) {
    switch (event.action) {
      case 'view':
        // Apri dettaglio
        break;
      case 'dismiss':
        // Solo chiudi
        return;
      case 'accept':
        // Azione accetta (per assegnazioni)
        targetUrl += `?action=accept&id=${data.relatedEntityId}`;
        break;
    }
  }

  // Apri o focus sulla finestra dell'app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Cerca una finestra già aperta
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Se non c'è finestra aperta, aprine una nuova
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// Gestisci chiusura notifica
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notifica chiusa:', event);
  
  // Opzionale: traccia che l'utente ha chiuso la notifica senza interagire
  // Potresti inviare questa info al server per analytics
});

// Helper: determina le azioni in base al tipo di notifica
function getNotificationActions(type) {
  switch (type) {
    case 'CLEANING_ASSIGNED':
      return [
        { action: 'view', title: '👀 Visualizza', icon: '/icons/view.png' },
        { action: 'accept', title: '✅ Accetta', icon: '/icons/accept.png' },
      ];
    case 'NEW_PROPERTY':
      return [
        { action: 'view', title: '👀 Visualizza', icon: '/icons/view.png' },
      ];
    case 'LAUNDRY_ASSIGNED':
      return [
        { action: 'view', title: '👀 Dettagli', icon: '/icons/view.png' },
        { action: 'accept', title: '🚀 Inizia', icon: '/icons/start.png' },
      ];
    default:
      return [
        { action: 'view', title: '👀 Apri', icon: '/icons/view.png' },
        { action: 'dismiss', title: '❌ Chiudi', icon: '/icons/close.png' },
      ];
  }
}

// Gestisci installazione del service worker
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installato');
  self.skipWaiting(); // Attiva immediatamente
});

// Gestisci attivazione del service worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker attivato');
  event.waitUntil(clients.claim()); // Prendi controllo di tutte le pagine
});
