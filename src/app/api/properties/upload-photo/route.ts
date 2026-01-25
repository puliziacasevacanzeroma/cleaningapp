import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// API UPLOAD FOTO PROPRIETÀ - Per foto porta/palazzo
// ═══════════════════════════════════════════════════════════════

// Bucket Firebase Storage
const STORAGE_BUCKET = 'cleaningapp-38e4f.firebasestorage.app';

// Inizializza Firebase Admin
function getFirebaseAdminStorage() {
  try {
    if (getApps().length === 0) {
      const serviceAccount: ServiceAccount = {
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };
      
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

// Ottiene l'utente dal cookie
async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { 
    return null; 
  }
}

export async function POST(request: Request) {
  console.log("📥 Upload foto proprietà ricevuto");
  
  try {
    // 1. Verifica autenticazione
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // 2. Leggi form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const propertyId = formData.get('propertyId') as string;
    const photoType = formData.get('photoType') as string; // "door" | "building"

    console.log("📋 Parametri:", { propertyId, photoType, fileSize: file?.size, userId: user.id });

    // 3. Validazione
    if (!file || !propertyId || !photoType) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
    }

    if (!["door", "building"].includes(photoType)) {
      return NextResponse.json({ error: "Tipo foto non valido" }, { status: 400 });
    }

    // 4. Verifica proprietà e permessi
    const propertyDoc = await getDoc(doc(db, "properties", propertyId));
    if (!propertyDoc.exists()) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const propertyData = propertyDoc.data();
    if (propertyData.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato a modificare questa proprietà" }, { status: 403 });
    }

    // 5. Verifica dimensione file (max 5MB già compressa)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: "File troppo grande. Massimo 5MB." 
      }, { status: 400 });
    }

    // 6. Converti File in Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 7. Genera nome file unico
    const timestamp = Date.now();
    const fileName = `properties/${propertyId}/${photoType}_${timestamp}.jpg`;
    console.log("📁 Nome file:", fileName);

    // 8. Upload su Firebase Storage
    const storage = getFirebaseAdminStorage();
    const bucket = storage.bucket(STORAGE_BUCKET);
    const fileRef = bucket.file(fileName);

    await fileRef.save(buffer, {
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
        metadata: {
          propertyId,
          photoType,
          uploadedBy: user.id,
          uploadedAt: new Date().toISOString(),
        }
      },
      resumable: false,
    });

    // 9. Rendi il file pubblico
    await fileRef.makePublic();

    // 10. Ottieni URL pubblico
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    console.log("✅ Foto caricata:", publicUrl);

    // 11. Aggiorna Firestore con il nuovo URL
    const currentImages = propertyData.images || {};
    const updatedImages = {
      ...currentImages,
      [photoType]: publicUrl,
    };

    await updateDoc(doc(db, "properties", propertyId), {
      images: updatedImages,
      updatedAt: new Date(),
    });

    console.log("✅ Firestore aggiornato con images:", updatedImages);

    // 12. Se c'era una foto precedente, prova a eliminarla
    const oldPhotoUrl = currentImages[photoType];
    if (oldPhotoUrl && oldPhotoUrl.includes(STORAGE_BUCKET)) {
      try {
        // Estrai il path dal vecchio URL
        const oldPath = oldPhotoUrl.split(`${STORAGE_BUCKET}/`)[1];
        if (oldPath) {
          await bucket.file(oldPath).delete();
          console.log("🗑️ Vecchia foto eliminata:", oldPath);
        }
      } catch (deleteError) {
        // Non bloccare se la cancellazione fallisce
        console.warn("⚠️ Impossibile eliminare vecchia foto:", deleteError);
      }
    }

    return NextResponse.json({ 
      success: true, 
      url: publicUrl,
      photoType,
    });

  } catch (error: unknown) {
    console.error("❌ Errore upload foto proprietà:", error);
    
    const err = error as { code?: number; message?: string };
    let userMessage = "Errore durante il caricamento";
    let statusCode = 500;
    
    if (err?.code === 404 || err?.message?.includes("bucket does not exist")) {
      userMessage = "Storage non configurato. Contatta l'amministratore.";
    } else if (err?.code === 403 || err?.message?.includes("permission")) {
      userMessage = "Permessi insufficienti per il caricamento.";
      statusCode = 403;
    }
    
    return NextResponse.json({ 
      error: userMessage,
      details: err?.message
    }, { status: statusCode });
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE - Rimuove una foto dalla proprietà
// ═══════════════════════════════════════════════════════════════

export async function DELETE(request: Request) {
  console.log("🗑️ Richiesta eliminazione foto proprietà");
  
  try {
    // 1. Verifica autenticazione
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // 2. Leggi parametri
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const photoType = searchParams.get('photoType');

    if (!propertyId || !photoType) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
    }

    // 3. Verifica proprietà e permessi
    const propertyDoc = await getDoc(doc(db, "properties", propertyId));
    if (!propertyDoc.exists()) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const propertyData = propertyDoc.data();
    if (propertyData.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // 4. Rimuovi URL da Firestore
    const currentImages = propertyData.images || {};
    const photoUrl = currentImages[photoType];
    
    // Rimuovi il campo
    delete currentImages[photoType];
    
    await updateDoc(doc(db, "properties", propertyId), {
      images: currentImages,
      updatedAt: new Date(),
    });

    // 5. Elimina file da Storage
    if (photoUrl && photoUrl.includes(STORAGE_BUCKET)) {
      try {
        const storage = getFirebaseAdminStorage();
        const bucket = storage.bucket(STORAGE_BUCKET);
        const filePath = photoUrl.split(`${STORAGE_BUCKET}/`)[1];
        if (filePath) {
          await bucket.file(filePath).delete();
          console.log("✅ Foto eliminata da Storage:", filePath);
        }
      } catch (deleteError) {
        console.warn("⚠️ Impossibile eliminare file da Storage:", deleteError);
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    console.error("❌ Errore eliminazione foto:", error);
    return NextResponse.json({ error: "Errore durante l'eliminazione" }, { status: 500 });
  }
}
