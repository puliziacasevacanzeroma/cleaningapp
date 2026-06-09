import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
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

// ⚡ PERF + STABILITÀ PWA: initializeFirestore con cache persistente.
//
// 1) experimentalAutoDetectLongPolling — con un service worker attivo (notifiche
//    push) e certe reti/proxy, la connessione di Firestore può ricadere su
//    long-polling solo DOPO un timeout → attesa all'avvio. L'autodetect sceglie
//    subito il tipo di connessione giusto. (Invariato.)
//
// 2) persistentLocalCache (IndexedDB) — cache su disco: alla riapertura i listener
//    onSnapshot servono ISTANTANEAMENTE l'ultimo stato noto e poi sincronizzano
//    solo i delta in background. Dati reali in pochi ms, non in ~10s. (Invariato.)
//
// 3) ⚠️ tabManager: persistentSingleTabManager (PRIMA: persistentMultipleTabManager).
//    Il multi-tab manager condivide la cache IndexedDB tra più schede usando un
//    "primary lease" (lock). Su PWA INSTALLATA in standalone (soprattutto iOS) quel
//    lock può restare bloccato quando l'app va in background/ripresa o resta
//    un'istanza zombie → la prima operazione Firestore (getDocs/onSnapshot) resta
//    appesa all'infinito = splash bloccato e dati fermi. Su mobile/PWA non esistono
//    di fatto più schede, quindi il multi-tab non serve ma porta solo il rischio di
//    deadlock. Il single-tab manager mantiene la cache persistente SENZA la
//    negoziazione del lease, eliminando la causa di stallo.
//    Trade-off: su DESKTOP con più schede aperte contemporaneamente, solo una scheda
//    usa la cache su disco; le altre funzionano comunque (Firestore opera regolare)
//    ma senza cache condivisa. Nessun blocco — solo meno ottimizzazione su schede extra.
//
// Se Firestore è già inizializzato (hot reload / doppio import) o IndexedDB non è
// disponibile (es. modalità privata su alcuni browser), ricade su getFirestore.
export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager(undefined),
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
