import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB-y-I63RPhbDr15FdNSMxnZgKPBzUBpqI",
  authDomain: "gestionalepvc.firebaseapp.com",
  projectId: "gestionalepvc",
  storageBucket: "gestionalepvc.firebasestorage.app",
  messagingSenderId: "579736427418",
  appId: "1:579736427418:web:5288ff348be565cb4cf823",
  measurementId: "G-MKND27DDPJ"
};

// Initialize Firebase (evita inizializzazione multipla)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Esporta i servizi
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Imposta persistenza LOCAL
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Errore impostazione persistenza:", error);
  });
}

export default app;