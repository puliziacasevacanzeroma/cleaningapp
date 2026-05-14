/**
 * 🚀 MIGRAZIONE PROPERTY IMAGES — base64 → Firebase Storage
 *
 * URL: /api/cron/migrate-property-images?secret=CRON_SECRET
 *
 * MODALITÀ:
 *   GET → migra fino a BATCH_SIZE proprietà per esecuzione (default 5)
 *   GET ?batchSize=10 → personalizza il batch
 *   GET ?dryRun=true → mostra cosa migrerebbe SENZA toccare nulla
 *
 * COSA FA:
 *   1. Trova le proprietà con imageUrl che inizia con "data:image/"
 *      (salta quelle già migrate o senza foto)
 *   2. Per ognuna fino a BATCH_SIZE:
 *      a. Decodifica base64
 *      b. Upload su Storage `properties/{id}/cover.{ext}`
 *      c. makePublic
 *      d. Verifica con file.exists()
 *      e. Salva vecchia base64 in imageUrlBackup
 *      f. Aggiorna imageUrl con URL Storage
 *   3. Log dettagliato su Firestore `migrationLog`
 *
 * SICUREZZA:
 *   - Idempotente: rilanciabile più volte senza danni
 *   - imageUrlBackup salva la vecchia base64 per rollback
 *   - Verifica esplicita post-upload (file.exists())
 *   - Limita a BATCH_SIZE per evitare timeout 30s di cron-job.org
 *
 * USO TIPICO:
 *   - Per migrare tutte le 71 proprietà: chiama 15 volte (5 × 15 = 75)
 *   - Oppure batchSize=10 → 8 chiamate
 *   - Risposta indica `remaining` per sapere quante ancora mancano
 *
 * ROLLBACK (in caso di problemi):
 *   Lo script lascia `imageUrlBackup` con la vecchia base64. Se serve
 *   ripristinare una proprietà, basta copiare imageUrlBackup → imageUrl.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Railway può, cron-job.org tronca a 30s

const CRON_SECRET = process.env.CRON_SECRET;
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

type MigrationResult = {
  propertyId: string;
  name: string;
  ok: boolean;
  reason?: string;
  sizeBytesBase64?: number;
  sizeBytesUploaded?: number;
  storageUrl?: string;
  durationMs?: number;
};

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  // Auth
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (!CRON_SECRET || urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
  const batchSizeParam = parseInt(req.nextUrl.searchParams.get("batchSize") || "", 10);
  const batchSize = Math.min(
    Math.max(1, isNaN(batchSizeParam) ? DEFAULT_BATCH_SIZE : batchSizeParam),
    MAX_BATCH_SIZE
  );

  try {
    // 1. Carica tutte le proprietà
    const snap = await adminDb.collection("properties").get();

    // 2. Filtra solo quelle con base64
    const candidates: { id: string; name: string; imageUrl: string }[] = [];
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, any>;
      if (typeof data.imageUrl === "string" && data.imageUrl.startsWith("data:image/")) {
        candidates.push({ id: doc.id, name: data.name || "?", imageUrl: data.imageUrl });
      }
    }

    const totalToMigrate = candidates.length;
    const toProcess = candidates.slice(0, batchSize);
    const remaining = Math.max(0, totalToMigrate - toProcess.length);

    // ─── DRY RUN ───
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        totalToMigrate,
        wouldProcess: toProcess.length,
        remaining,
        sample: toProcess.map(c => ({
          id: c.id,
          name: c.name,
          sizeBytesBase64: c.imageUrl.length,
        })),
      });
    }

    // ─── ESECUZIONE REALE ───
    const results: MigrationResult[] = [];
    const bucket = adminStorage.bucket();

    for (const candidate of toProcess) {
      const t0 = Date.now();
      const result: MigrationResult = {
        propertyId: candidate.id,
        name: candidate.name,
        ok: false,
        sizeBytesBase64: candidate.imageUrl.length,
      };

      try {
        // Parse base64
        const match = candidate.imageUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (!match) {
          result.reason = "formato base64 non valido";
          results.push(result);
          continue;
        }
        const contentType = match[1]!;
        const base64Data = match[2]!;
        const buffer = Buffer.from(base64Data, "base64");

        if (buffer.length > MAX_PHOTO_SIZE_BYTES) {
          result.reason = `foto troppo grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`;
          results.push(result);
          continue;
        }

        // Upload su Storage
        const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
        const filePath = `properties/${candidate.id}/cover.${ext}`;
        const file = bucket.file(filePath);

        await file.save(buffer, {
          contentType,
          resumable: false,
          metadata: {
            cacheControl: "public, max-age=86400",
            metadata: {
              propertyId: candidate.id,
              migratedFromBase64: "true",
              migratedAt: new Date().toISOString(),
              sizeBytes: buffer.length.toString(),
            },
          },
        });

        // Verifica esplicita
        const [exists] = await file.exists();
        if (!exists) {
          result.reason = "file.exists() = false dopo save";
          results.push(result);
          continue;
        }

        // makePublic (best effort)
        try {
          await file.makePublic();
        } catch (err) {
          console.warn(`makePublic failed for ${candidate.id}:`, err);
        }

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        // Update Firestore: salva backup + aggiorna URL
        await adminDb.collection("properties").doc(candidate.id).update({
          imageUrl: publicUrl,
          imageUrlBackup: candidate.imageUrl,
          imageUrlUpdatedAt: Timestamp.now(),
          imageUrlMigratedAt: Timestamp.now(),
        });

        result.ok = true;
        result.sizeBytesUploaded = buffer.length;
        result.storageUrl = publicUrl;
      } catch (err) {
        result.reason = err instanceof Error ? err.message : String(err);
      } finally {
        result.durationMs = Date.now() - t0;
        results.push(result);
      }
    }

    // 3. Log su Firestore migrationLog
    const successCount = results.filter(r => r.ok).length;
    const failCount = results.length - successCount;
    const totalDuration = Date.now() - startTime;

    try {
      await adminDb.collection("migrationLog").add({
        type: "property-images-base64-to-storage",
        executedAt: Timestamp.now(),
        durationMs: totalDuration,
        batchSize,
        attempted: results.length,
        succeeded: successCount,
        failed: failCount,
        results,
        remainingAfter: remaining,
      });
    } catch (err) {
      console.warn("Errore salvataggio migrationLog:", err);
    }

    return NextResponse.json({
      success: true,
      attempted: results.length,
      succeeded: successCount,
      failed: failCount,
      remaining,
      durationMs: totalDuration,
      results: results.map(r => ({
        id: r.propertyId,
        name: r.name,
        ok: r.ok,
        reason: r.reason,
        sizeBytesBase64: r.sizeBytesBase64,
        sizeBytesUploaded: r.sizeBytesUploaded,
        durationMs: r.durationMs,
      })),
      nextStep: remaining > 0
        ? `Restano ${remaining} proprietà da migrare. Rilancia l'endpoint.`
        : "Migrazione completata!",
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ migrate-property-images error:", error);
    return NextResponse.json(
      { success: false, error: "Errore", details: errMsg },
      { status: 500 }
    );
  }
}
