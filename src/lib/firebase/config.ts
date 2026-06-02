import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;

// ⚡ PERF: initializeFirestore con due ottimizzazioni chiave.
//
// 1) experimentalAutoDetectLongPolling — con un service worker attivo (notifiche
//    push) e certe reti/proxy, la connessione WebSocket di Firestore può fallire
//    e ricadere su long-polling solo DOPO un timeout di ~10-15s → attesa all'avvio.
//    L'autodetect sceglie subito il tipo di connessione giusto.
//
// 2) persistentLocalCache (IndexedDB) — QUESTA è la chiave della latenza alla
//    RIAPERTURA. Senza cache persistente, ad ogni apertura dell'app TUTTI i
//    listener onSnapshot riscaricano i dati dal server da zero (~10s). Con la
//    cache persistente, onSnapshot serve ISTANTANEAMENTE l'ultimo stato noto dal
//    disco e poi sincronizza in background solo i delta. Risultato: dati reali
//    visibili in pochi ms, non in 10 secondi. persistentMultipleTabManager evita
//    conflitti quando l'app è aperta in più schede contemporaneamente.
//
// Se Firestore è già inizializzato (hot reload / doppio import) o IndexedDB non è
// disponibile (es. modalità privata su alcuni browser), ricade su getFirestore.
export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    return getFirestore(app);
  }
})();
export const auth = getAuth(app);
export const storage = getStorage(app);

if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Errore impostazione persistenza:", error);
  });
}

export default app;
