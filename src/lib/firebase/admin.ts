import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Configurazione Firebase Admin
const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  // La private key viene salvata con \n escaped, dobbiamo convertirla
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// Inizializza Firebase Admin solo se non è già inizializzato
function getFirebaseAdmin() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
  
  return {
    auth: getAuth(),
    db: getFirestore(),
  };
}

export const adminAuth = getFirebaseAdmin().auth;
export const adminDb = getFirebaseAdmin().db;

// Helper per creare utente in Firebase Auth
export async function createAuthUser(email: string, password: string, displayName: string) {
  const auth = getAuth();
  
  const userRecord = await auth.createUser({
    email,
    password,
    displayName,
    emailVerified: false,
  });
  
  return userRecord;
}

// Helper per disabilitare utente (sospensione)
export async function disableAuthUser(uid: string) {
  const auth = getAuth();
  await auth.updateUser(uid, { disabled: true });
}

// Helper per riabilitare utente
export async function enableAuthUser(uid: string) {
  const auth = getAuth();
  await auth.updateUser(uid, { disabled: false });
}

// Helper per eliminare utente da Firebase Auth
export async function deleteAuthUser(uid: string) {
  const auth = getAuth();
  await auth.deleteUser(uid);
}

// Helper per aggiornare password utente
export async function updateAuthUserPassword(uid: string, newPassword: string) {
  const auth = getAuth();
  await auth.updateUser(uid, { password: newPassword });
}
