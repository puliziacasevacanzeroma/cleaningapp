import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCskZjg2oOZ0gNdKEnvn680rYMaNdCdwmY",
  authDomain: "cleaningapp-38e4f.firebaseapp.com",
  projectId: "cleaningapp-38e4f",
  storageBucket: "cleaningapp-38e4f.firebasestorage.app",
  messagingSenderId: "458676800148",
  appId: "1:458676800148:web:efabefbc460c613b748281",
  measurementId: "G-BSYVG8WN8Q"
};

// Initialize Firebase (evita inizializzazione multipla)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Esporta i servizi
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Imposta persistenza LOCAL - la sessione rimane anche dopo chiusura browser
// Si cancella SOLO con logout manuale o pulizia cache/localStorage
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Errore impostazione persistenza:", error);
  });
}

export default app;
