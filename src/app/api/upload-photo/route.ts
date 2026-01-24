import { NextResponse } from "next/server";
import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

export const dynamic = 'force-dynamic';

// Inizializza Firebase Admin una sola volta
function getFirebaseAdminStorage() {
  try {
    if (getApps().length === 0) {
      const serviceAccount: ServiceAccount = {
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };
      
      console.log("🔧 Inizializzazione Firebase Admin...");
      console.log("   Project ID:", process.env.FIREBASE_ADMIN_PROJECT_ID);
      console.log("   Client Email:", process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.substring(0, 20) + "...");
      
      initializeApp({
        credential: cert(serviceAccount),
        storageBucket: 'cleaningapp-38e4f.appspot.com',
      });
      
      console.log("✅ Firebase Admin inizializzato");
    }
    return getStorage();
  } catch (error) {
    console.error("❌ Errore inizializzazione Firebase Admin:", error);
    throw error;
  }
}

export async function POST(request: Request) {
  console.log("📥 Richiesta upload foto ricevuta");
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const cleaningId = formData.get('cleaningId') as string;
    const index = formData.get('index') as string;

    console.log("📋 Parametri:", { cleaningId, index, fileSize: file?.size });

    if (!file || !cleaningId) {
      console.error("❌ Parametri mancanti");
      return NextResponse.json({ error: "File e cleaningId richiesti" }, { status: 400 });
    }

    // Converti File in Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log("📦 Buffer creato, dimensione:", buffer.length);

    // Genera nome file unico
    const timestamp = Date.now();
    const fileName = `cleanings/${cleaningId}/photos/${timestamp}_${index}_photo.jpg`;
    console.log("📁 Nome file:", fileName);

    // Upload su Firebase Storage
    const storage = getFirebaseAdminStorage();
    const bucket = storage.bucket();
    console.log("🪣 Bucket:", bucket.name);
    
    const fileRef = bucket.file(fileName);

    await fileRef.save(buffer, {
      metadata: {
        contentType: 'image/jpeg',
      },
    });
    console.log("💾 File salvato su Storage");

    // Rendi il file pubblico
    await fileRef.makePublic();
    console.log("🌐 File reso pubblico");

    // Ottieni URL pubblico
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    console.log("✅ URL pubblico:", publicUrl);

    return NextResponse.json({ 
      success: true, 
      url: publicUrl,
    });
  } catch (error: any) {
    console.error("❌ Errore upload foto:", error);
    console.error("   Message:", error?.message);
    console.error("   Stack:", error?.stack);
    return NextResponse.json({ 
      error: "Errore upload: " + (error?.message || "Sconosciuto"),
      details: error?.stack 
    }, { status: 500 });
  }
}
