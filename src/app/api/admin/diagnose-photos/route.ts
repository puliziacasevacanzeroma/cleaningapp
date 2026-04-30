/**
 * GET/POST /api/admin/diagnose-photos
 *
 * Endpoint diagnostico PURO (no scrittura) per capire ESATTAMENTE
 * cosa c'è dentro le foto caricate da uno specifico operatore in
 * una specifica data.
 *
 * Body:
 *   { operatorName?: string, date?: string (YYYY-MM-DD), maxPhotos?: number }
 *
 * Default: operatorName="Nuri", date=oggi, maxPhotos=3
 *
 * Per ogni foto stampa:
 *  - magic bytes (primi 16 byte hex)
 *  - formato rilevato
 *  - dimensione
 *  - content-type del metadata di Firebase Storage
 *  - se si tratta di un signed URL Firebase o di un URL pubblico Google
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
      photoUrl: photoUrl.substring(0, 150),
      error: "URL non parsabile come storage bucket",
    };
  }

  const fileRef = bucket.file(path);
  const [exists] = await fileRef.exists();
  if (!exists) {
    return { photoUrl: photoUrl.substring(0, 150), path, error: "File non esiste nel bucket" };
  }

  // 1. Metadata di Firebase Storage
  const [metadata] = await fileRef.getMetadata();

  // 2. Download bytes per analisi magic bytes
  const [buf] = await fileRef.download();
  const fmt = detectFormat(buf);

  // 3. Magic bytes in hex (primi 16 byte)
  const magic = Array.from(buf.slice(0, 16))
    .map(b => b.toString(16).padStart(2, "0"))
    .join(" ");

  // 4. ASCII dei primi 16 byte (per HEIC vediamo il "ftyp...heic")
  const asciiPreview = Array.from(buf.slice(0, 16))
    .map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : ".")
    .join("");

  // 5. Test fetch HTTP pubblico
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

  let body: { operatorName?: string; date?: string; maxPhotos?: number; cleaningId?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const operatorName = body.operatorName ?? "Nuri";
  const maxPhotos = Math.min(Math.max(body.maxPhotos ?? 3, 1), 10);

  // Date range = giorno richiesto (default oggi) timezone Europe/Rome
  const today = new Date();
  const dateStr = body.date ?? today.toISOString().slice(0, 10); // YYYY-MM-DD

  const dayStart = new Date(`${dateStr}T00:00:00.000+02:00`); // Italia
  const dayEnd = new Date(`${dateStr}T23:59:59.999+02:00`);

  // Cerca pulizie completate nel range
  const cleaningsCol = adminDb.collection("cleanings");

  let cleaningDocs: FirebaseFirestore.DocumentSnapshot[] = [];

  if (body.cleaningId) {
    const d = await cleaningsCol.doc(body.cleaningId).get();
    if (d.exists) cleaningDocs = [d];
  } else {
    // Filtro lato server per status, lato client per data e operatore
    const snap = await cleaningsCol
      .where("status", "==", "COMPLETED")
      .limit(200)
      .get();

    const needle = operatorName.toLowerCase();
    cleaningDocs = snap.docs.filter((d) => {
      const data = d.data() as any;
      const completedAt = data?.completedAt?.toDate?.() ?? null;
      if (!completedAt) return false;
      if (completedAt < dayStart || completedAt > dayEnd) return false;

      // Match operatore: prova vari campi
      const opName = (
        data?.operatorName ||
        data?.assignedTo?.name ||
        data?.operator?.name ||
        ""
      ).toString().toLowerCase();
      return opName.includes(needle);
    });
  }

  // Limita le foto totali analizzate
  const results: any[] = [];
  let processed = 0;

  for (const doc of cleaningDocs) {
    const data = doc.data() as any;
    const photos: string[] = Array.isArray(data?.photos) ? data.photos : [];
    if (photos.length === 0) continue;

    const cleaningInfo = {
      cleaningId: doc.id,
      propertyName: data?.propertyName || data?.property?.name || "?",
      operatorName: data?.operatorName || data?.assignedTo?.name || data?.operator?.name || "?",
      completedAt: data?.completedAt?.toDate?.()?.toISOString() ?? null,
      totalPhotos: photos.length,
    };

    for (const photoUrl of photos) {
      if (processed >= maxPhotos) break;
      processed++;
      const analysis = await analyzeOnePhoto(photoUrl);
      results.push({ ...cleaningInfo, ...analysis });
    }
    if (processed >= maxPhotos) break;
  }

  return NextResponse.json({
    success: true,
    query: { operatorName, date: dateStr, maxPhotos, cleaningId: body.cleaningId },
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
    usage: "POST con body { operatorName?, date? (YYYY-MM-DD), maxPhotos?, cleaningId? }",
    defaults: { operatorName: "Nuri", date: "oggi", maxPhotos: 3 },
  });
}
