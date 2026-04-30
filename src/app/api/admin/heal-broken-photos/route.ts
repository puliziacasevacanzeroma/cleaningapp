/**
 * POST /api/admin/heal-broken-photos
 *
 * Endpoint admin one-shot per riparare le foto delle pulizie completate
 * che sono state caricate prima del fix (HEIC mascherate da JPEG).
 *
 * Strategia:
 *  1. Itera sulle pulizie COMPLETED che hanno `photos: string[]`.
 *  2. Per ogni URL, scarica i bytes dal bucket Firebase Storage.
 *  3. Detect del formato dai magic bytes.
 *  4. Se NON è un vero JPEG/PNG/WebP/AVIF leggibile dai browser,
 *     lo converte in JPEG vero e RI-UPLOADA con lo STESSO path
 *     (overwrite). L'URL pubblico resta identico → niente da
 *     toccare in Firestore.
 *  5. Se il formato è già un JPEG valido, skip.
 *
 * Body opzionale: { cleaningId?: string, dryRun?: boolean, limit?: number }
 *   - cleaningId: ripara solo una pulizia specifica (es. "Santa Cecilia")
 *   - dryRun: true → rileva ma non sovrascrive (default false)
 *   - limit: max pulizie da processare (default 50, hard cap 200)
 *
 * Sicurezza: solo admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { adminDb, adminStorage } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minuti per processi lunghi

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ??
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
  "";

// ═══════════════════════════════════════════════════════════════
// FORMAT DETECTION (identico a /api/upload-photo per consistenza)
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

// "Browser-friendly" = decodificabile su Chrome/Edge/Firefox desktop
function isBrowserFriendly(fmt: DetectedFormat): boolean {
  return fmt === "jpeg" || fmt === "png" || fmt === "webp" || fmt === "avif" || fmt === "gif";
}

async function normalizeToJpeg(input: Buffer, fmt: DetectedFormat): Promise<Buffer> {
  let intermediate: Buffer = input;

  if (fmt === "heic" || fmt === "heif") {
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

  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  return await sharp(intermediate, { failOn: "none" })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, progressive: true, mozjpeg: true })
    .toBuffer();
}

// ═══════════════════════════════════════════════════════════════
// URL → STORAGE PATH
// ═══════════════════════════════════════════════════════════════
// Le foto sono nel formato:
//   https://storage.googleapis.com/{BUCKET}/cleanings/{id}/photos/{file}
function urlToStoragePath(url: string, bucketName: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "storage.googleapis.com") return null;
    // pathname: "/{bucketName}/cleanings/.../foo.jpg"
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
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  // Solo admin
  if (user.role !== "ADMIN" && user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  let body: { cleaningId?: string; dryRun?: boolean; limit?: number } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const dryRun = body.dryRun === true;
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);
  const onlyCleaningId = body.cleaningId;

  const bucket = adminStorage.bucket(STORAGE_BUCKET);

  // Trova le pulizie da scansionare
  const cleaningsCol = adminDb.collection("cleanings");
  let snapshot;
  if (onlyCleaningId) {
    const docRef = await cleaningsCol.doc(onlyCleaningId).get();
    snapshot = { docs: docRef.exists ? [docRef] : [] };
  } else {
    // Solo le completate, ordinate per data più recenti prima
    snapshot = await cleaningsCol
      .where("status", "==", "COMPLETED")
      .limit(limit)
      .get();
  }

  const report: Array<{
    cleaningId: string;
    photoUrl: string;
    detected: DetectedFormat;
    action: "skipped" | "healed" | "failed";
    error?: string;
  }> = [];

  let healedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const cleaningDoc of snapshot.docs) {
    const data = cleaningDoc.data() as { photos?: string[] } | undefined;
    if (!data) continue;
    const photos = Array.isArray(data.photos) ? data.photos : [];
    if (photos.length === 0) continue;

    for (const photoUrl of photos) {
      const path = urlToStoragePath(photoUrl, bucket.name);
      if (!path) {
        report.push({
          cleaningId: cleaningDoc.id,
          photoUrl,
          detected: "unknown",
          action: "skipped",
          error: "URL non riconosciuto come storage bucket",
        });
        skippedCount++;
        continue;
      }

      try {
        const fileRef = bucket.file(path);
        const [exists] = await fileRef.exists();
        if (!exists) {
          report.push({
            cleaningId: cleaningDoc.id,
            photoUrl,
            detected: "unknown",
            action: "skipped",
            error: "File non esiste nel bucket",
          });
          skippedCount++;
          continue;
        }

        const [buf] = await fileRef.download();
        const fmt = detectFormat(buf);

        if (isBrowserFriendly(fmt)) {
          // Già OK, salta
          report.push({
            cleaningId: cleaningDoc.id,
            photoUrl,
            detected: fmt,
            action: "skipped",
          });
          skippedCount++;
          continue;
        }

        // Foto rotta: HEIC/HEIF/unknown
        if (dryRun) {
          report.push({
            cleaningId: cleaningDoc.id,
            photoUrl,
            detected: fmt,
            action: "healed", // nel dry-run lo segniamo come "sarebbe healed"
          });
          healedCount++;
          continue;
        }

        const normalized = await normalizeToJpeg(buf, fmt);

        // Overwrite stesso path → URL pubblico resta identico
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

        // Assicurati che sia ancora pubblico
        await fileRef.makePublic();

        report.push({
          cleaningId: cleaningDoc.id,
          photoUrl,
          detected: fmt,
          action: "healed",
        });
        healedCount++;
      } catch (err: any) {
        console.error(`❌ Healing fallito per ${path}:`, err);
        report.push({
          cleaningId: cleaningDoc.id,
          photoUrl,
          detected: "unknown",
          action: "failed",
          error: err?.message || String(err),
        });
        failedCount++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    dryRun,
    cleaningsScanned: snapshot.docs.length,
    healedCount,
    skippedCount,
    failedCount,
    report,
  });
}

// GET: stats rapide (quante pulizie completate ci sono in totale).
// Utile per dimensionare le run.
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
        cleaningId: "(opzionale) ripara una sola pulizia",
        dryRun: "(opzionale) true = solo report, no scrittura",
        limit: "(opzionale) numero pulizie, default 50, max 200",
      },
    },
  });
}
