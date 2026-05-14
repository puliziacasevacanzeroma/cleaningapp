/**
 * 🔄 CRON BACKUP DATABASE — v2 robusto
 *
 * URL: /api/cron/backup-database?secret=CRON_SECRET
 * Frequenza: ogni notte alle 03:00 (configurato su cron-job.org)
 *
 * STRATEGIA CHIAVE: compressione gzip
 *   Backup JSON raw: ~40 MB → supera limiti Gmail (25 MB) e vicino limite Resend (40 MB)
 *   Backup .json.gz: ~14 MB → sempre sotto soglia, sempre allegabile via email
 *   Rapporto di compressione tipico: 3x (verificato su backup reale)
 *
 * TRIPLA RIDONDANZA:
 *   1. Allegato email .json.gz (sempre, ~14MB)
 *   2. File su Firebase Storage (con signed URL valido 30 giorni)
 *   3. Log su Firestore collezione `backupLog` (per audit)
 *
 * Differenze rispetto a v1 (che falliva silenziosamente):
 *
 * 1. LOGGING ESPLICITO su Firestore collezione `backupLog`
 *    Ogni run scrive un documento con TUTTI gli step e gli errori.
 *
 * 2. VERIFICA file Storage dopo save
 *    Dopo `bucket.file().save()` chiamiamo `file.exists()` per essere CERTI
 *    che il file sia davvero lì.
 *
 * 3. COMPRESSIONE gzip
 *    Sempre. Riduce drasticamente le dimensioni. File apribili con un
 *    doppio click (Mac) o "Estrai tutto" (Windows).
 *
 * 4. DOPPIO DESTINATARIO EMAIL
 *    Email a puliziacasevacanzeroma@gmail.com + damianiariele@gmail.com
 *    Ridondanza: se una casella ha problemi, l'altra arriva.
 *
 * 5. RITORNO HONEST
 *    Il vecchio codice metteva sempre `success:true emailSent:true storageSaved:true`.
 *    Ora se Storage o email falliscono, il flag è false E nel log Firestore si vede.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "~/lib/firebase/admin";
import { resend, FROM_EMAIL } from "~/lib/email/config";
import { Timestamp } from "firebase-admin/firestore";
import { gzipSync } from "zlib";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min

const CRON_SECRET = process.env.CRON_SECRET;

// Destinatari email (entrambi, per ridondanza)
const BACKUP_RECIPIENTS = [
  process.env.BACKUP_EMAIL || "puliziacasevacanzeroma@gmail.com",
  "damianiariele@gmail.com",
];

// Quanti backup tenere su Storage (i più vecchi vengono cancellati)
const MAX_BACKUPS = 30;

// Collezioni da esportare
const COLLECTIONS_TO_BACKUP = [
  "users", "properties", "bookings", "cleanings", "orders", "inventory",
  "notifications", "payments", "paymentOverrides", "operatorPayments",
  "clientBalances", "extraCharges", "serviceTypes", "serviceConfigs",
  "holidays", "issues", "cleaningIssues", "propertyRatings", "productRequests",
  "deletionRequests", "syncExclusions", "syncLogs", "icalSyncLog",
  "regulationDocuments", "contractAcceptances", "registrationHistory",
  "cancelledCleanings", "appSettings", "userDevices", "userSettings",
  "linen_orders", "inventoryCategories",
];

// ─── Tipi per il log strutturato ──────────────────────────────────
type StepLog = {
  step: string;
  ok: boolean;
  durationMs?: number;
  details?: any;
  error?: string;
};

type BackupLogEntry = {
  startedAt: Timestamp;
  finishedAt?: Timestamp;
  durationSeconds?: number;
  success: boolean;
  totalDocuments?: number;
  sizeMB?: number;
  fileName?: string;
  storageSaved: boolean;
  emailSent: boolean;
  emailRecipients: string[];
  signedUrl?: string;
  steps: StepLog[];
  errors: string[];
};

// ─── Serialization helper ─────────────────────────────────────────
function serializeFirestoreData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      result[key] = value;
    } else if (
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof (value as { toDate: () => Date }).toDate === "function"
    ) {
      result[key] = (value as { toDate: () => Date }).toDate().toISOString();
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? serializeFirestoreData(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === "object") {
      result[key] = serializeFirestoreData(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Main handler ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const log: BackupLogEntry = {
    startedAt: Timestamp.now(),
    success: false,
    storageSaved: false,
    emailSent: false,
    emailRecipients: [...BACKUP_RECIPIENTS],
    steps: [],
    errors: [],
  };

  const recordStep = (step: string, ok: boolean, opts: { durationMs?: number; details?: any; error?: string } = {}) => {
    log.steps.push({ step, ok, ...opts });
    if (!ok && opts.error) log.errors.push(`${step}: ${opts.error}`);
  };

  const saveLog = async () => {
    try {
      log.finishedAt = Timestamp.now();
      log.durationSeconds = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
      await adminDb.collection("backupLog").add(log as any);
    } catch (err) {
      console.error("[backup] Errore salvataggio log:", err);
    }
  };

  try {
    // ─── 1. Autenticazione ─────────────────────────────────────
    const urlSecret = req.nextUrl.searchParams.get("secret");
    if (!CRON_SECRET || urlSecret !== CRON_SECRET) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // ─── 2. Esporta collezioni ─────────────────────────────────
    const t0 = Date.now();
    const backup: Record<string, Record<string, unknown>[]> = {};
    const stats: Record<string, number> = {};
    let totalDocs = 0;

    for (const collectionName of COLLECTIONS_TO_BACKUP) {
      try {
        const snapshot = await adminDb.collection(collectionName).get();
        backup[collectionName] = snapshot.empty ? [] : snapshot.docs.map((doc) => {
          const data = doc.data() as Record<string, any>;
          return { _id: doc.id, ...serializeFirestoreData(data) };
        });
        stats[collectionName] = snapshot.size;
        totalDocs += snapshot.size;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        recordStep(`export-${collectionName}`, false, { error: errMsg });
        backup[collectionName] = [];
        stats[collectionName] = 0;
      }
    }

    log.totalDocuments = totalDocs;
    recordStep("export-all", true, { durationMs: Date.now() - t0, details: { totalDocs, collections: COLLECTIONS_TO_BACKUP.length } });

    // ─── 3. Serializza JSON + COMPRIMI con gzip ────────────────
    // Il backup tipico è ~40MB, sopra il limite Gmail (25MB) e vicino al limite
    // Resend (40MB). Con gzip riduciamo a ~14MB → sempre sotto soglia, sempre
    // allegabile all'email senza problemi. Il file .json.gz è apribile in 1
    // click su Windows (decomprime in JSON normale).
    const tSerialize = Date.now();
    const jsonData = JSON.stringify(backup, null, 2);
    const jsonBufferUncompressed = Buffer.from(jsonData, "utf-8");
    const jsonBuffer = gzipSync(jsonBufferUncompressed, { level: 9 });
    const sizeMB = parseFloat((jsonBuffer.length / 1024 / 1024).toFixed(2));
    const sizeMBUncompressed = parseFloat((jsonBufferUncompressed.length / 1024 / 1024).toFixed(2));
    log.sizeMB = sizeMB;
    recordStep("serialize-gzip", true, {
      durationMs: Date.now() - tSerialize,
      details: { sizeMB, sizeMBUncompressed, compressionRatio: (sizeMBUncompressed / sizeMB).toFixed(1) + "x" },
    });

    // ─── 4. Nome file ──────────────────────────────────────────
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toISOString().split("T")[1].split(".")[0].replace(/:/g, "-");
    const fileName = `backups/firestore-backup-${dateStr}_${timeStr}.json.gz`;
    const fileNameShort = `firestore-backup-${dateStr}.json.gz`;
    log.fileName = fileName;

    // ─── 5. SALVA SU STORAGE + verifica esplicita ──────────────
    let signedUrl: string | undefined;
    try {
      const tStorage = Date.now();
      const bucket = adminStorage.bucket();
      const file = bucket.file(fileName);

      // Save
      await file.save(jsonBuffer, {
        contentType: "application/gzip",
        resumable: false, // forza upload sincrono per file < 100MB
        metadata: {
          metadata: {
            totalDocuments: totalDocs.toString(),
            collections: COLLECTIONS_TO_BACKUP.length.toString(),
            sizeBytesCompressed: jsonBuffer.length.toString(),
            sizeBytesUncompressed: jsonBufferUncompressed.length.toString(),
            compression: "gzip",
            createdAt: now.toISOString(),
          },
        },
      });

      // Verifica esplicita che il file ESISTA davvero
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error("File save completato ma file.exists() ritorna false");
      }

      // Verifica metadata (dimensione)
      const [metadata] = await file.getMetadata();
      const actualSize = parseInt(String(metadata.size || "0"), 10);
      if (actualSize !== jsonBuffer.length) {
        throw new Error(`Dimensione file Storage (${actualSize}) ≠ buffer (${jsonBuffer.length})`);
      }

      // Genera signed URL valido 30 giorni
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 giorni
      });
      signedUrl = url;
      log.signedUrl = url;
      log.storageSaved = true;

      recordStep("storage-save", true, {
        durationMs: Date.now() - tStorage,
        details: { fileName, sizeBytes: actualSize, bucket: bucket.name },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      recordStep("storage-save", false, { error: errMsg });
      // Continua comunque: proveremo a mandare email con allegato
    }

    // ─── 6. Pulizia backup vecchi (best effort) ────────────────
    try {
      const bucket = adminStorage.bucket();
      const [files] = await bucket.getFiles({ prefix: "backups/firestore-backup-" });
      if (files.length > MAX_BACKUPS) {
        const sorted = files.sort((a, b) => a.name.localeCompare(b.name));
        const toDelete = sorted.slice(0, sorted.length - MAX_BACKUPS);
        for (const file of toDelete) {
          try { await file.delete(); } catch {}
        }
        recordStep("cleanup-old", true, { details: { deleted: toDelete.length } });
      }
    } catch (err) {
      recordStep("cleanup-old", false, { error: err instanceof Error ? err.message : String(err) });
    }

    // ─── 7. INVIA EMAIL ────────────────────────────────────────
    if (!resend) {
      recordStep("email-send", false, { error: "Resend non configurato" });
    } else {
      const tEmail = Date.now();
      const emailHtml = `
        <h2>Backup Database CleaningApp</h2>
        <p>Backup automatico completato.</p>
        <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>Data</strong></td><td style="padding: 4px 12px; border: 1px solid #ddd;">${dateStr}</td></tr>
          <tr><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>Documenti totali</strong></td><td style="padding: 4px 12px; border: 1px solid #ddd;">${totalDocs.toLocaleString("it-IT")}</td></tr>
          <tr><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>Collezioni</strong></td><td style="padding: 4px 12px; border: 1px solid #ddd;">${COLLECTIONS_TO_BACKUP.length}</td></tr>
          <tr><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>Dimensione (compressa)</strong></td><td style="padding: 4px 12px; border: 1px solid #ddd;">${sizeMB} MB <span style="color:#888">(${sizeMBUncompressed} MB non compresso)</span></td></tr>
          <tr><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>Storage</strong></td><td style="padding: 4px 12px; border: 1px solid #ddd;">${log.storageSaved ? "✅ Salvato" : "❌ Fallito (controlla allegato)"}</td></tr>
        </table>
        <p>📎 <strong>Il backup è ALLEGATO a questa email</strong> (formato .json.gz, decomprimibile con Windows/Mac).</p>
        ${signedUrl ? `
          <p>Oppure scarica dal cloud (link valido 30 giorni):</p>
          <p><a href="${signedUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">📥 Scarica backup da Storage</a></p>
        ` : ""}
        <p style="color: #666; font-size: 12px; margin-top: 16px;"><strong>Come aprire il file:</strong></p>
        <p style="color: #666; font-size: 12px;">
          • Windows: tasto destro → "Estrai tutto" oppure usa 7-Zip<br>
          • Mac: doppio click<br>
          • Risultato: file .json contenente tutto il database
        </p>
        <hr style="margin: 24px 0; border: 0; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 11px;">Backup automatico CleaningApp — non rispondere a questa email.</p>
      `;

      // Allega SEMPRE il file gzippato (è piccolo: ~14MB sotto qualsiasi limite)
      const attachments = [{ filename: fileNameShort, content: jsonBuffer.toString("base64") }];

      try {
        const result = await resend.emails.send({
          from: FROM_EMAIL,
          to: BACKUP_RECIPIENTS,
          subject: `💾 Backup CleaningApp - ${dateStr} (${sizeMB} MB gz)`,
          html: emailHtml,
          attachments,
        });

        // Verifica esplicita del response Resend
        if ((result as any)?.error) {
          throw new Error(`Resend error: ${JSON.stringify((result as any).error)}`);
        }
        const emailId = (result as any)?.data?.id || (result as any)?.id;
        if (!emailId) {
          throw new Error("Resend non ha ritornato un ID email valido");
        }

        log.emailSent = true;
        recordStep("email-send", true, {
          durationMs: Date.now() - tEmail,
          details: {
            recipients: BACKUP_RECIPIENTS,
            emailId,
            attachmentSizeMB: sizeMB,
            hasStorageLink: !!signedUrl,
          },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        recordStep("email-send", false, { error: errMsg });
      }
    }

    // ─── 8. Risposta finale ────────────────────────────────────
    log.success = log.storageSaved || log.emailSent; // success se almeno una delle due ha funzionato
    await saveLog();

    return NextResponse.json({
      success: log.success,
      fileName: log.fileName,
      totalDocuments: totalDocs,
      totalCollections: COLLECTIONS_TO_BACKUP.length,
      sizeMB,
      durationSeconds: log.durationSeconds,
      storageSaved: log.storageSaved,
      emailSent: log.emailSent,
      emailRecipients: BACKUP_RECIPIENTS,
      signedUrl: log.signedUrl,
      errors: log.errors,
      steps: log.steps.map(s => ({ step: s.step, ok: s.ok, error: s.error })),
      timestamp: now.toISOString(),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.errors.push(`fatal: ${errMsg}`);
    await saveLog();
    return NextResponse.json(
      { success: false, error: "Errore fatale backup", details: errMsg, log },
      { status: 500 }
    );
  }
}
