import { NextResponse } from "next/server";
import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';
// Sharp è una libreria nativa: serve runtime Node, non Edge.
export const runtime = 'nodejs';

// ⚠️ IMPORTANTE: Bucket corretto (nuovo formato Firebase Storage)
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '';

// ═══════════════════════════════════════════════════════════════
// SOGLIE PER OTTIMIZZAZIONE FAST-PATH (v3)
// ═══════════════════════════════════════════════════════════════
// Se una foto è GIÀ JPEG VALIDO e di dimensione ragionevole, la
// salviamo direttamente senza ricomprimerla. Risparmio: ~100-200ms
// per foto. Caso normale (90% degli upload): operatori Android o
// iPhone "Più compatibile", + foto già passate da compressImage()
// lato client (output tipico ~200-700 KB).
//
// Sopra queste soglie, passa comunque per sharp per resize/ricompr.
// così non finiamo per servire foto da 8 MB ai proprietari.
const FAST_PATH_MAX_BYTES = 1.5 * 1024 * 1024;   // 1.5 MB
const FAST_PATH_MAX_DIMENSION = 2400;            // px lato lungo

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

  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";

  // WebP: "RIFF....WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "webp";

  // ISO BMFF (HEIC, HEIF, AVIF): box "ftyp" a offset 4
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.toString("ascii", 8, 12).toLowerCase();
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
// FAST-PATH: validazione JPEG + lettura dimensioni (no ricompressione)
// ═══════════════════════════════════════════════════════════════
// Ritorna le dimensioni se il buffer è un JPEG valido decodificabile,
// altrimenti null. È una verifica light: sharp legge solo l'header,
// non decodifica l'immagine intera. Costa ~5-15 ms.
async function tryReadJpegMetadata(buf: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    if (meta.format !== "jpeg") return null;
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SLOW-PATH: normalizzazione completa a JPEG
// ═══════════════════════════════════════════════════════════════
// Per HEIC, PNG, WebP, AVIF, JPEG troppo grande, JPEG corrotto.
// Stessa logica del v2 (testata e funzionante).
async function normalizeToJpeg(input: Buffer, format: DetectedFormat): Promise<Buffer> {
  let intermediate: Buffer = input;

  // Step 1: HEIC/HEIF → JPEG con heic-convert (puro JS)
  if (format === "heic" || format === "heif") {
    try {
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
    } catch (err) {
      console.error("⚠️ heic-convert fallito, provo fallback sharp:", err);
    }
  }

  // Step 2: sharp per resize + ricodifica JPEG + EXIF orientation
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    return await sharp(intermediate, { failOn: "none" })
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, progressive: true, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error("❌ sharp ha fallito sulla normalizzazione:", err);
    // Fallback finali (mantenuti dalla v2)
    if (format === "heic" || format === "heif") {
      if (intermediate !== input) return intermediate;
    }
    if (format === "jpeg") return input;
    throw err;
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

    // Detect formato
    const detected = detectFormat(inputBuffer);
    if (process.env.NODE_ENV !== "production") {
      console.log(`📷 Foto in arrivo: formato=${detected}, size=${inputBuffer.length}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // FAST-PATH: JPEG valido & piccolo → salva direttamente
    // ═══════════════════════════════════════════════════════════════
    // Risparmia ~100-200ms per foto. Si attiva solo se TUTTE le
    // condizioni sono vere:
    //  1. magic bytes = JPEG
    //  2. dimensione file ≤ 1.5 MB
    //  3. sharp.metadata() conferma che è davvero un JPEG decodificabile
    //  4. width e height ≤ 2400 px
    //
    // Se una qualsiasi fallisce, cade nel SLOW-PATH che ricomprime
    // (zero rischio: stessa logica di v2 testata in produzione).
    let outputBuffer: Buffer | null = null;
    let pathUsed: "fast" | "slow" = "slow";

    if (detected === "jpeg" && inputBuffer.length <= FAST_PATH_MAX_BYTES) {
      const meta = await tryReadJpegMetadata(inputBuffer);
      if (
        meta &&
        meta.width <= FAST_PATH_MAX_DIMENSION &&
        meta.height <= FAST_PATH_MAX_DIMENSION
      ) {
        // Tutte le condizioni soddisfatte: salva direttamente
        outputBuffer = inputBuffer;
        pathUsed = "fast";
        if (process.env.NODE_ENV !== "production") {
          console.log(`⚡ FAST-PATH: JPEG ${meta.width}x${meta.height}, ${inputBuffer.length} bytes — salvo originale`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SLOW-PATH: normalizzazione completa (HEIC, PNG, WebP, AVIF, JPEG grandi)
    // ═══════════════════════════════════════════════════════════════
    if (!outputBuffer) {
      try {
        outputBuffer = await normalizeToJpeg(inputBuffer, detected);
        pathUsed = "slow";
        if (process.env.NODE_ENV !== "production") {
          console.log(`🔧 SLOW-PATH: convertita a JPEG, size finale=${outputBuffer.length}`);
        }
      } catch (convErr: any) {
        console.error("❌ Conversione fallita:", convErr?.message || convErr);
        return NextResponse.json({
          error: "Formato foto non supportato. Riprova facendo una nuova foto.",
          details: convErr?.message,
        }, { status: 415 });
      }
    }

    // Safety check: se per qualche bizzarro motivo outputBuffer è vuoto, errore
    if (!outputBuffer || outputBuffer.length === 0) {
      console.error("❌ outputBuffer vuoto dopo processing");
      return NextResponse.json({
        error: "Errore interno processing foto",
      }, { status: 500 });
    }

    // Genera nome file unico
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const fileName = `cleanings/${cleaningId}/photos/${timestamp}_${index}_${randomId}.jpg`;

    // Upload su Firebase Storage
    const storage = getFirebaseAdminStorage();
    const bucket = storage.bucket(STORAGE_BUCKET);
    if (process.env.NODE_ENV !== "production") console.log("🪣 Bucket:", bucket.name);

    const fileRef = bucket.file(fileName);

    await fileRef.save(outputBuffer, {
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
        metadata: {
          originalFormat: detected,
          originalSize: String(inputBuffer.length),
          finalSize: String(outputBuffer.length),
          pathUsed,
          uploadedBy: _user.id || '',
          normalizedAt: new Date().toISOString(),
        },
      },
      resumable: false,
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
        pathUsed,
      },
    });
  } catch (error: any) {
    console.error("❌ Errore upload foto:", error);
    console.error("   Message:", error?.message);
    console.error("   Code:", error?.code);

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
