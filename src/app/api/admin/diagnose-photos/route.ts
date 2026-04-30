/**
 * GET/POST /api/admin/diagnose-photos
 *
 * v2 — supporta filtro per propertyName (es. "Santa Cecilia").
 *
 * Body (tutti opzionali):
 *   {
 *     propertyName?: string,   // es. "Santa Cecilia" — match case-insensitive contains
 *     operatorName?: string,   // match case-insensitive contains
 *     date?: string,           // YYYY-MM-DD, default oggi (Europe/Rome)
 *     anyDate?: boolean,       // se true, ignora il filtro data
 *     cleaningId?: string,     // se passato, ignora tutti gli altri filtri
 *     maxPhotos?: number       // default 3, max 10
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { adminDb, adminStorage } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ??
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
  "";

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

async function analyzeOnePhoto(photoUrl: string) {
  const bucket = adminStorage.bucket(STORAGE_BUCKET);
  const path = urlToStoragePath(photoUrl, bucket.name);

  if (!path) {
    return {
      photoUrl: photoUrl.substring(0, 200),
      error: "URL non parsabile come storage bucket (forse signed URL Firebase)",
    };
  }

  const fileRef = bucket.file(path);
  const [exists] = await fileRef.exists();
  if (!exists) {
    return { photoUrl: photoUrl.substring(0, 200), path, error: "File non esiste nel bucket" };
  }

  const [metadata] = await fileRef.getMetadata();
  const [buf] = await fileRef.download();
  const fmt = detectFormat(buf);

  const magic = Array.from(buf.slice(0, 16))
    .map(b => b.toString(16).padStart(2, "0"))
    .join(" ");

  const asciiPreview = Array.from(buf.slice(0, 16))
    .map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : ".")
    .join("");

  let httpStatus: number | string = "?";
  let httpContentType: string | null = "?";
  try {
    const r = await fetch(photoUrl, { method: "HEAD" });
    httpStatus = r.status;
    httpContentType = r.headers.get("content-type");
  } catch (e: any) {
    httpStatus = `FETCH_ERR: ${e?.message}`;
  }

  return {
    photoUrl: photoUrl.substring(0, 200),
    path,
    sizeBytes: buf.length,
    detectedFormat: fmt,
    magicBytesHex: magic,
    magicBytesAscii: asciiPreview,
    storageMetadata: {
      contentType: metadata.contentType,
      size: metadata.size,
      timeCreated: metadata.timeCreated,
      cacheControl: metadata.cacheControl,
      customMetadata: metadata.metadata || null,
    },
    httpHead: {
      status: httpStatus,
      contentType: httpContentType,
    },
  };
}

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  let body: {
    propertyName?: string;
    operatorName?: string;
    date?: string;
    anyDate?: boolean;
    cleaningId?: string;
    maxPhotos?: number;
  } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const propertyName = body.propertyName ?? "";
  const operatorName = body.operatorName ?? "";
  const maxPhotos = Math.min(Math.max(body.maxPhotos ?? 3, 1), 10);
  const anyDate = body.anyDate === true;

  const today = new Date();
  const dateStr = body.date ?? today.toISOString().slice(0, 10);
  const dayStart = new Date(`${dateStr}T00:00:00.000+02:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999+02:00`);

  const cleaningsCol = adminDb.collection("cleanings");
  let cleaningDocs: FirebaseFirestore.DocumentSnapshot[] = [];

  if (body.cleaningId) {
    const d = await cleaningsCol.doc(body.cleaningId).get();
    if (d.exists) cleaningDocs = [d];
  } else {
    // Carico fino a 500 pulizie completate, poi filtro lato server
    const snap = await cleaningsCol
      .where("status", "==", "COMPLETED")
      .limit(500)
      .get();

    const propNeedle = propertyName.toLowerCase();
    const opNeedle = operatorName.toLowerCase();

    cleaningDocs = snap.docs.filter((d) => {
      const data = d.data() as any;

      // Filtro data
      if (!anyDate) {
        const completedAt = data?.completedAt?.toDate?.() ?? null;
        if (!completedAt) return false;
        if (completedAt < dayStart || completedAt > dayEnd) return false;
      }

      // Filtro propertyName (varie possibili strutture)
      if (propNeedle) {
        const propName = (
          data?.propertyName ||
          data?.property?.name ||
          data?.propertyAddress ||
          ""
        ).toString().toLowerCase();
        if (!propName.includes(propNeedle)) return false;
      }

      // Filtro operatore
      if (opNeedle) {
        const opName = (
          data?.operatorName ||
          data?.assignedTo?.name ||
          data?.operator?.name ||
          data?.completedByName ||
          ""
        ).toString().toLowerCase();
        if (!opName.includes(opNeedle)) return false;
      }

      return true;
    });
  }

  const results: any[] = [];
  let processed = 0;

  for (const doc of cleaningDocs) {
    const data = doc.data() as any;
    const photos: string[] = Array.isArray(data?.photos) ? data.photos : [];
    if (photos.length === 0) continue;

    const cleaningInfo = {
      cleaningId: doc.id,
      propertyName: data?.propertyName || data?.property?.name || data?.propertyAddress || "?",
      operatorName: data?.operatorName || data?.assignedTo?.name || data?.operator?.name || data?.completedByName || "?",
      completedAt: data?.completedAt?.toDate?.()?.toISOString() ?? null,
      totalPhotos: photos.length,
    };

    for (const photoUrl of photos) {
      if (processed >= maxPhotos) break;
      processed++;
      const analysis = await analyzeOnePhoto(photoUrl);
      results.push({ ...cleaningInfo, photoIndex: processed, ...analysis });
    }
    if (processed >= maxPhotos) break;
  }

  return NextResponse.json({
    success: true,
    query: { propertyName, operatorName, date: anyDate ? "any" : dateStr, maxPhotos, cleaningId: body.cleaningId },
    cleaningsFound: cleaningDocs.length,
    photosAnalyzed: results.length,
    results,
  });
}

export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }
  return NextResponse.json({
    usage: "POST con body { propertyName?, operatorName?, date? (YYYY-MM-DD), anyDate?, cleaningId?, maxPhotos? }",
  });
}
