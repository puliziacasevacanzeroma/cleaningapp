import { NextResponse } from "next/server";
import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getApiUser } from "~/lib/api-auth";


export const dynamic = 'force-dynamic';

// ⚠️ IMPORTANTE: Bucket corretto (nuovo formato Firebase Storage)
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '';

// Inizializza Firebase Admin una sola volta
function getFirebaseAdminStorage() {
  try {
    if (getApps().length === 0) {
      const serviceAccount: ServiceAccount = {
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };
      if (process.env.NODE_ENV !== "production") console.log("   Project ID:", process.env.FIREBASE_ADMIN_PROJECT_ID);
      if (process.env.NODE_ENV !== "production") console.log("   Client Email:", process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.substring(0, 20) + "...");
      if (process.env.NODE_ENV !== "production") console.log("   Storage Bucket:", STORAGE_BUCKET);
      
      initializeApp({
        credential: cert(serviceAccount),
        storageBucket: STORAGE_BUCKET,
      });
    }
    return getStorage();
  } catch (error) {
    console.error("❌ Errore inizializzazione Firebase Admin:", error);
    throw error;
  }
}

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  // ─────────────────────────────────────────────────────
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const cleaningId = formData.get('cleaningId') as string;
    const index = formData.get('index') as string;

    if (!file || !cleaningId) {
      console.error("❌ Parametri mancanti");
      return NextResponse.json({ error: "File e cleaningId richiesti" }, { status: 400 });
    }

    // Verifica dimensione file (max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      console.error("❌ File troppo grande:", file.size);
      return NextResponse.json({ 
        error: "File troppo grande. Massimo 10MB consentiti.",
      }, { status: 400 });
    }

    // Converti File in Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Genera nome file unico
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const fileName = `cleanings/${cleaningId}/photos/${timestamp}_${index}_${randomId}.jpg`;

    // Upload su Firebase Storage
    const storage = getFirebaseAdminStorage();
    // ⚠️ USA IL BUCKET ESPLICITO (non il default)
    const bucket = storage.bucket(STORAGE_BUCKET);
    if (process.env.NODE_ENV !== "production") console.log("🪣 Bucket:", bucket.name);
    
    const fileRef = bucket.file(fileName);

    await fileRef.save(buffer, {
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
      },
      resumable: false, // Più veloce per file piccoli
    });

    // Rendi il file pubblico
    await fileRef.makePublic();

    // Ottieni URL pubblico
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    return NextResponse.json({ 
      success: true, 
      url: publicUrl,
    });
  } catch (error: any) {
    console.error("❌ Errore upload foto:", error);
    console.error("   Message:", error?.message);
    console.error("   Code:", error?.code);
    
    // Gestisci errori specifici
    let userMessage = "Errore durante il caricamento";
    let statusCode = 500;
    
    if (error?.code === 404 || error?.message?.includes("bucket does not exist")) {
      userMessage = "Storage non configurato correttamente. Contatta l'amministratore.";
    } else if (error?.code === 403 || error?.message?.includes("permission")) {
      userMessage = "Permessi insufficienti per il caricamento.";
      statusCode = 403;
    } else if (error?.message?.includes("network") || error?.message?.includes("ECONNRESET")) {
      userMessage = "Errore di rete. Riprova.";
      statusCode = 503;
    }
    
    return NextResponse.json({ 
      error: userMessage,
      details: error?.message
    }, { status: statusCode });
  }
}
