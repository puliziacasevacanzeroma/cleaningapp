import { NextResponse } from "next/server";
import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

export const dynamic = 'force-dynamic';

// Configurazione Firebase Admin
const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// Inizializza Firebase Admin
function getFirebaseAdmin() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: 'cleaningapp-38e4f.firebasestorage.app',
    });
  }
  return getStorage();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const cleaningId = formData.get('cleaningId') as string;
    const index = formData.get('index') as string;

    if (!file || !cleaningId) {
      return NextResponse.json({ error: "File e cleaningId richiesti" }, { status: 400 });
    }

    // Converti File in Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Genera nome file unico
    const timestamp = Date.now();
    const fileName = `cleanings/${cleaningId}/photos/${timestamp}_${index}_photo.jpg`;

    // Upload su Firebase Storage
    const storage = getFirebaseAdmin();
    const bucket = storage.bucket();
    const fileRef = bucket.file(fileName);

    await fileRef.save(buffer, {
      metadata: {
        contentType: 'image/jpeg',
      },
    });

    // Rendi il file pubblico
    await fileRef.makePublic();

    // Ottieni URL pubblico
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    console.log("✅ Foto caricata:", publicUrl);

    return NextResponse.json({ 
      success: true, 
      url: publicUrl,
    });
  } catch (error) {
    console.error("❌ Errore upload foto:", error);
    return NextResponse.json({ error: "Errore upload" }, { status: 500 });
  }
}
