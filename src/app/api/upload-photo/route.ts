import { NextResponse } from "next/server";
import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';
// Sharp è una libreria nativa: serve runtime Node, non Edge.
export const runtime = 'nodejs';

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

// ═══════════════════════════════════════════════════════════════
// FORMAT DETECTION via MAGIC BYTES
// ═══════════════════════════════════════════════════════════════
// Non ci si può fidare di file.type né dell'estensione: l'iPhone
// può salvare HEIC con extension .jpg dopo upload, e i browser
// settano MIME inconsistenti. L'unica fonte di verità sono i bytes.
type DetectedFormat = "jpeg" | "png" | "webp" | "avif" | "gif" | "heic" | "heif" | "unknown";

function detectFormat(buf: Buffer): DetectedFormat {
  if (buf.length < 12) return "unknown";

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "png";

  // GIF: "GIF87a" o "GIF89a"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";

  // WebP: "RIFF....WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "webp";

  // ISO BMFF (HEIC, HEIF, AVIF): box "ftyp" a offset 4
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    // brand è a offset 8..11
    const brand = buf.toString("ascii", 8, 12).toLowerCase();
    // HEIC: heic, heix, hevc, hevx, heim, heis, hevm, hevs, mif1
    // HEIF generico: mif1, msf1
    // AVIF: avif, avis
    if (brand === "avif" || brand === "avis") return "avif";
    if (
      brand === "heic" || brand === "heix" || brand === "hevc" || brand === "hevx" ||
      brand === "heim" || brand === "heis" || brand === "hevm" || brand === "hevs"
    ) return "heic";
    if (brand === "mif1" || brand === "msf1") return "heif";
  }

  return "unknown";
}

// ═══════════════════════════════════════════════════════════════
// NORMALIZZAZIONE A JPEG VERO
// ═══════════════════════════════════════════════════════════════
// Qualunque cosa entri (HEIC iPhone, PNG, WebP, AVIF, JPEG corrotto)
// esce come JPEG decodificabile da qualsiasi browser.
async function normalizeToJpeg(input: Buffer): Promise<Buffer> {
  const format = detectFormat(input);

  // Step 1: se è HEIC/HEIF, converti prima con heic-convert (puro JS,
  // funziona su Railway senza dipendenze native extra).
  let intermediate: Buffer = input;
  let needsSharpReencode = true;

  if (format === "heic" || format === "heif") {
    try {
      // Import dinamico così non rompe il build se il modulo manca
      // su qualche edge case (e non viene caricato in produzione finché
      // non arriva una HEIC vera).
      const heicConvert = (await import("heic-convert")).default as (opts: {
        buffer: Buffer | ArrayBuffer | Uint8Array;
        format: "JPEG" | "PNG";
        quality?: number;
      }) => Promise<ArrayBuffer>;

      const out = await heicConvert({
        buffer: input,
        format: "JPEG",
        quality: 0.9,
      });
      intermediate = Buffer.from(out);
      // heic-convert produce già un JPEG valido. Sharp serve solo per
      // un eventuale resize finale (lo facciamo comunque, è economico).
    } catch (err) {
      console.error("⚠️ heic-convert fallito, provo fallback sharp:", err);
      // Fallback: sharp può supportare HEIC se il binding ha libheif.
      // In caso contrario, il catch successivo restituirà errore chiaro.
    }
  }

  // Step 2: passa per sharp per:
  // - normalizzare orientation EXIF (rotate auto)
  // - ridimensionare se troppo grande (max 2400px lato lungo)
  // - ri-encodare in JPEG quality 85 (peso ragionevole, qualità alta)
  if (needsSharpReencode) {
    try {
      const sharpModule = await import("sharp");
      const sharp = sharpModule.default;
      const pipeline = sharp(intermediate, { failOn: "none" })
        .rotate() // applica EXIF orientation e poi la rimuove
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, progressive: true, mozjpeg: true });

      return await pipeline.toBuffer();
    } catch (err) {
      console.error("❌ sharp ha fallito sulla normalizzazione:", err);
      // Ultimo fallback: se sharp esplode ma abbiamo l'intermediate
      // (post-heic-convert), torna quello — è già JPEG valido.
      if (format === "heic" || format === "heif") {
        if (intermediate !== input) return intermediate;
      }
      // Se era già JPEG di partenza, ritorna l'originale: il browser
      // lo decodifica comunque.
      if (format === "jpeg") return input;
      // Altrimenti rilancia: meglio errore chiaro che file rotto.
      throw err;
    }
  }

  return intermediate;
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

    // Verifica dimensione file (max 30MB grezzi: HEIC originali da iPhone
    // possono arrivare a ~5-8 MB ma alziamo il tetto per sicurezza,
    // tanto il file finale viene comunque ricompresso a ~500KB-1.5MB).
    const MAX_FILE_SIZE = 30 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      console.error("❌ File troppo grande:", file.size);
      return NextResponse.json({
        error: "File troppo grande. Massimo 30MB consentiti.",
      }, { status: 400 });
    }

    // Converti File in Buffer
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // ⭐ NORMALIZZA A JPEG VERO (gestisce HEIC, PNG, WebP, AVIF, ecc.)
    const detected = detectFormat(inputBuffer);
    if (process.env.NODE_ENV !== "production") {
      console.log(`📷 Foto in arrivo: formato rilevato=${detected}, size=${inputBuffer.length}`);
    }

    let outputBuffer: Buffer;
    try {
      outputBuffer = await normalizeToJpeg(inputBuffer);
      if (process.env.NODE_ENV !== "production") {
        console.log(`✅ Convertita a JPEG: size finale=${outputBuffer.length}`);
      }
    } catch (convErr: any) {
      console.error("❌ Conversione fallita:", convErr?.message || convErr);
      return NextResponse.json({
        error: "Formato foto non supportato. Riprova facendo una nuova foto.",
        details: convErr?.message,
      }, { status: 415 });
    }

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

    await fileRef.save(outputBuffer, {
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
        // Metadati custom per debug e per healing futuro
        metadata: {
          originalFormat: detected,
          originalSize: String(inputBuffer.length),
          finalSize: String(outputBuffer.length),
          uploadedBy: _user.id || '',
          normalizedAt: new Date().toISOString(),
        },
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
      meta: {
        originalFormat: detected,
        originalSize: inputBuffer.length,
        finalSize: outputBuffer.length,
      },
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
