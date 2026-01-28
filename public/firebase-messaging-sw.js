importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyB-y-I63RPhbDr15FdNSMxnZgKPBzUBpqI",
  authDomain: "gestionalepvc.firebaseapp.com",
  projectId: "gestionalepvc",
  storageBucket: "gestionalepvc.firebasestorage.app",
  messagingSenderId: "579736427418",
  appId: "1:579736427418:web:5288ff348be565cb4cf823"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'CleaningApp';
  const notificationOptions = {
    body: payload.notification?.body || 'Hai una nuova notifica',
    icon: '/favicon.ico'
  };
  return self.registration.showNotification(notificationTitle, notificationOptions);
});
