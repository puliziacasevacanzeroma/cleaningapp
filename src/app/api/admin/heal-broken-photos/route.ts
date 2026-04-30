/**
 * POST /api/admin/heal-broken-photos
 *
 * v2 — Versione chirurgica con logging aggressivo e limiti stretti.
 *
 * Body opzionale:
 *   { propertyName?: string, cleaningId?: string, dryRun?: boolean, maxPhotos?: number }
 *
 *   - propertyName: cerca le pulizie per nome proprietà che CONTIENE questa stringa
 *                   (es. "Santa Cecilia"). Più comodo dell'ID.
 *   - cleaningId: ripara solo una pulizia specifica
 *   - dryRun: true = solo report, default false
 *   - maxPhotos: tetto duro al numero di foto processate per chiamata (default 10).
 *                Le 32 foto del Santa Cecilia richiedono 4 chiamate da 10.
 *
 * Risposta minimale per evitare timeout: solo numeri, no array enormi.
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { adminDb, adminStorage } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ??
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
  "";

function log(...args: any[]) {
  console.log("[HEAL]", ...args);
}

// ═══════════════════════════════════════════════════════════════
// FORMAT DETECTION via MAGIC BYTES
// ═══════════════════════════════════════════════════════════════
type DetectedFormat =
  | "jpeg" | "png" | "webp" | "avif" | "gif"
  | "heic" | "heif" | "unknown";

function detectFormat(buf: Buffer): DetectedFormat {
  if (buf.length < 12) return "unknown";

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";

  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "png";

  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";

  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "webp";

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

function isBrowserFriendly(fmt: DetectedFormat): boolean {
  return fmt === "jpeg" || fmt === "png" || fmt === "webp" || fmt === "avif" || fmt === "gif";
}

async function normalizeToJpeg(input: Buffer, fmt: DetectedFormat): Promise<Buffer> {
  let intermediate: Buffer = input;

  if (fmt === "heic" || fmt === "heif") {
    log("  → conversione HEIC con heic-convert...");
    try {
      const heicConvertModule: any = await import("heic-convert");
      const heicConvert = heicConvertModule.default || heicConvertModule;

      const out = await heicConvert({
        buffer: input,
        format: "JPEG",
        quality: 0.9,
      });
      intermediate = Buffer.from(out);
      log(`  ✓ heic-convert OK (output: ${intermediate.length} bytes)`);
    } catch (err: any) {
      log(`  ✗ heic-convert fallito: ${err?.message || err}`);
      // continuiamo con sharp che potrebbe avere libheif
    }
  }

  log("  → ricompressione con sharp...");
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  const result = await sharp(intermediate, { failOn: "none" })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, progressive: true, mozjpeg: true })
    .toBuffer();
  log(`  ✓ sharp OK (output finale: ${result.length} bytes)`);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// URL → STORAGE PATH
// ═══════════════════════════════════════════════════════════════
function urlToStoragePath(url: string, bucketName: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "storage.googleapis.com") return null;
    const prefix = `/${bucketName}/`;
    if (!u.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(u.pathname.substring(prefix.length));
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  log("=== START heal-broken-photos ===");
  const t0 = Date.now();

  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  let body: { propertyName?: string; cleaningId?: string; dryRun?: boolean; maxPhotos?: number } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const dryRun = body.dryRun === true;
  const maxPhotos = Math.min(Math.max(body.maxPhotos ?? 10, 1), 50);
  log(`Params: dryRun=${dryRun}, maxPhotos=${maxPhotos}, propertyName=${body.propertyName}, cleaningId=${body.cleaningId}`);

  const bucket = adminStorage.bucket(STORAGE_BUCKET);
  log(`Bucket: ${bucket.name}`);

  // ═══ TROVA PULIZIE ═══
  const cleaningsCol = adminDb.collection("cleanings");
  let cleaningDocs: FirebaseFirestore.QueryDocumentSnapshot[] | FirebaseFirestore.DocumentSnapshot[] = [];

  try {
    if (body.cleaningId) {
      log(`Cerco cleaning specifica: ${body.cleaningId}`);
      const docRef = await cleaningsCol.doc(body.cleaningId).get();
      if (docRef.exists) cleaningDocs = [docRef];
    } else if (body.propertyName) {
      // Cerco le pulizie completate e filtro lato server per nome proprietà
      log(`Cerco pulizie completate per propertyName CONTIENE "${body.propertyName}"`);
      const snap = await cleaningsCol.where("status", "==", "COMPLETED").limit(100).get();
      const needle = body.propertyName.toLowerCase();
      cleaningDocs = snap.docs.filter((d) => {
        const data = d.data() as any;
        const name = (data?.propertyName || data?.property?.name || "").toString().toLowerCase();
        return name.includes(needle);
      });
      log(`Trovate ${cleaningDocs.length} pulizie matching`);
    } else {
      log("Nessun filtro: prendo le ultime 5 completate");
      const snap = await cleaningsCol.where("status", "==", "COMPLETED").limit(5).get();
      cleaningDocs = snap.docs;
    }
  } catch (err: any) {
    log(`✗ Errore query Firestore: ${err?.message}`);
    return NextResponse.json({ error: "Errore query Firestore", details: err?.message }, { status: 500 });
  }

  log(`Pulizie da scansionare: ${cleaningDocs.length}`);

  // ═══ ITERA SULLE FOTO ═══
  let healedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let processedPhotos = 0;
  const failedDetails: Array<{ photoUrl: string; error: string }> = [];
  const healedFormats: Record<string, number> = {};

  outer: for (const cleaningDoc of cleaningDocs) {
    const data = cleaningDoc.data() as { photos?: string[] } | undefined;
    if (!data) continue;
    const photos = Array.isArray(data.photos) ? data.photos : [];
    if (photos.length === 0) continue;

    log(`Cleaning ${cleaningDoc.id}: ${photos.length} foto`);

    for (let i = 0; i < photos.length; i++) {
      if (processedPhotos >= maxPhotos) {
        log(`⏹ Raggiunto maxPhotos=${maxPhotos}, esco`);
        break outer;
      }

      const photoUrl = photos[i];
      processedPhotos++;
      log(`[${processedPhotos}/${maxPhotos}] ${cleaningDoc.id} foto ${i + 1}/${photos.length}`);

      const path = urlToStoragePath(photoUrl, bucket.name);
      if (!path) {
        log(`  ✗ URL non parsabile: ${photoUrl.substring(0, 80)}`);
        skippedCount++;
        continue;
      }

      try {
        const fileRef = bucket.file(path);
        const [exists] = await fileRef.exists();
        if (!exists) {
          log("  ✗ File non esiste nel bucket");
          skippedCount++;
          continue;
        }

        log("  → download...");
        const [buf] = await fileRef.download();
        const fmt = detectFormat(buf);
        log(`  → formato rilevato: ${fmt} (${buf.length} bytes)`);

        if (isBrowserFriendly(fmt)) {
          log("  ✓ già browser-friendly, skip");
          skippedCount++;
          continue;
        }

        if (dryRun) {
          log(`  ✓ [DRY-RUN] avrei riparato (${fmt})`);
          healedCount++;
          healedFormats[fmt] = (healedFormats[fmt] || 0) + 1;
          continue;
        }

        log(`  → normalizzazione (era ${fmt})...`);
        const normalized = await normalizeToJpeg(buf, fmt);

        log("  → upload (overwrite stesso path)...");
        await fileRef.save(normalized, {
          metadata: {
            contentType: "image/jpeg",
            cacheControl: "public, max-age=31536000",
            metadata: {
              healedFrom: fmt,
              healedAt: new Date().toISOString(),
              healedBy: user.id || "",
            },
          },
          resumable: false,
        });
        await fileRef.makePublic();
        log("  ✓ HEALED");
        healedCount++;
        healedFormats[fmt] = (healedFormats[fmt] || 0) + 1;
      } catch (err: any) {
        log(`  ✗ ERRORE: ${err?.message || err}`);
        failedCount++;
        failedDetails.push({
          photoUrl: photoUrl.substring(0, 120),
          error: err?.message || String(err),
        });
      }
    }
  }

  const elapsed = Date.now() - t0;
  log(`=== END heal-broken-photos in ${elapsed}ms ===`);
  log(`Stats: healed=${healedCount}, skipped=${skippedCount}, failed=${failedCount}`);

  return NextResponse.json({
    success: true,
    dryRun,
    cleaningsScanned: cleaningDocs.length,
    photosProcessed: processedPhotos,
    healedCount,
    skippedCount,
    failedCount,
    healedFormats,
    failedDetails: failedDetails.slice(0, 5), // max 5 dettagli per non gonfiare
    elapsedMs: elapsed,
  });
}

// GET: stats rapide (quante pulizie completate ci sono in totale).
export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const completedSnap = await adminDb
    .collection("cleanings")
    .where("status", "==", "COMPLETED")
    .count()
    .get();

  return NextResponse.json({
    success: true,
    completedCleanings: completedSnap.data().count,
    bucket: STORAGE_BUCKET,
    usage: {
      method: "POST",
      body: {
        propertyName: '(opzionale) es: "Santa Cecilia"',
        cleaningId: "(opzionale) ID specifico",
        dryRun: "(opzionale) true = solo report",
        maxPhotos: "(opzionale) max foto per chiamata, default 10, max 50",
      },
    },
  });
}
