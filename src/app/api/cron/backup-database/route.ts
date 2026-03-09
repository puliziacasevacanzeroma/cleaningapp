import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getStorage } from "firebase-admin/storage";
import { resend, FROM_EMAIL } from "~/lib/email/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ═══════════════════════════════════════════════════════════════
// CRON JOB: Backup automatico database Firestore
// 
// 1. Esporta tutte le collections in JSON
// 2. Salva su Firebase Storage (cartella backups/)
// 3. Invia il file via email come allegato
//
// URL: /api/cron/backup-database?secret=CRON_SECRET_VALUE
// Frequenza: ogni giorno alle 03:00
// ═══════════════════════════════════════════════════════════════

const CRON_SECRET = process.env.CRON_SECRET ;

// Email destinatario backup
const BACKUP_EMAIL = process.env.BACKUP_EMAIL || "puliziacasevacanzeroma@gmail.com";

// Collections da esportare
const COLLECTIONS_TO_BACKUP = [
  "users",
  "properties",
  "bookings",
  "cleanings",
  "orders",
  "inventory",
  "notifications",
  "payments",
  "paymentOverrides",
  "operatorPayments",
  "clientBalances",
  "extraCharges",
  "serviceTypes",
  "serviceConfigs",
  "holidays",
  "issues",
  "cleaningIssues",
  "propertyRatings",
  "productRequests",
  "deletionRequests",
  "syncExclusions",
  "syncLogs",
  "icalSyncLog",
  "regulationDocuments",
  "contractAcceptances",
  "registrationHistory",
  "cancelledCleanings",
  "appSettings",
  "userDevices",
  "userSettings",
  "linen_orders",
  "inventoryCategories",
];

const MAX_BACKUPS = 30;

export async function GET(req: NextRequest) {
  try {
    // Verifica secret
    const { searchParams } = new URL(req.url);
    const urlSecret = searchParams.get("secret");

    if (urlSecret !== CRON_SECRET) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const startTime = Date.now();
    const backup: Record<string, Record<string, unknown>[]> = {};
    let totalDocs = 0;

    // Esporta ogni collection
    for (const collectionName of COLLECTIONS_TO_BACKUP) {
      try {
        const snapshot = await adminDb.collection(collectionName).get();
        
        if (snapshot.empty) {
          backup[collectionName] = [];
          continue;
        }

        backup[collectionName] = snapshot.docs.map((doc) => {
          const data = doc.data() as Record<string, any>;
          const serialized = serializeFirestoreData(data);
          return {
            _id: doc.id,
            ...serialized,
          };
        });

        totalDocs += snapshot.size;
        if (process.env.NODE_ENV !== "production") console.log(`   📄 ${collectionName}: ${snapshot.size} documenti`);
      } catch (err) {
        console.error(`   ❌ Errore ${collectionName}:`, err);
        backup[collectionName] = [];
      }
    }

    // Genera il file JSON
    const jsonData = JSON.stringify(backup, null, 2);
    const jsonBuffer = Buffer.from(jsonData, "utf-8");
    const sizeMB = (jsonBuffer.length / 1024 / 1024).toFixed(2);

    // Genera nome file con data
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toISOString().split("T")[1].split(".")[0].replace(/:/g, "-");
    const fileName = `backups/firestore-backup-${dateStr}_${timeStr}.json`;
    const fileNameShort = `firestore-backup-${dateStr}.json`;

    // ═══════════════════════════════════════════════════════
    // 1. Salva su Firebase Storage
    // ═══════════════════════════════════════════════════════
    let storageSaved = false;
    let deletedCount = 0;
    try {
      const bucket = getStorage().bucket();
      const file = bucket.file(fileName);

      await file.save(jsonBuffer, {
        contentType: "application/json",
        metadata: {
          metadata: {
            totalDocuments: totalDocs.toString(),
            collections: COLLECTIONS_TO_BACKUP.length.toString(),
            sizeBytes: jsonBuffer.length.toString(),
            createdAt: now.toISOString(),
          },
        },
      });

      storageSaved = true;
      if (process.env.NODE_ENV !== "production") console.log(`   💾 Storage: ${fileName} (${sizeMB} MB)`);

      // Pulizia backup vecchi
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Bucket' is not assignable to parameter of type '(name?: string...
      deletedCount = await cleanupOldBackups(bucket);
    } catch (err) {
      console.error("   ❌ Errore salvataggio Storage:", err);
    }

    // ═══════════════════════════════════════════════════════
    // 2. Invia via email come allegato
    // ═══════════════════════════════════════════════════════
    let emailSent = false;
    if (resend) {
      try {
        // Resend accetta allegati in base64
        const base64Content = jsonBuffer.toString("base64");

        await resend.emails.send({
          from: FROM_EMAIL,
          to: BACKUP_EMAIL,
          subject: `💾 Backup Database CleaningApp - ${dateStr}`,
          html: `
            <h2>Backup Database CleaningApp</h2>
            <p>Backup automatico completato con successo.</p>
            <table style="border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>Data</strong></td><td style="padding: 4px 12px; border: 1px solid #ddd;">${dateStr}</td></tr>
              <tr><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>Documenti totali</strong></td><td style="padding: 4px 12px; border: 1px solid #ddd;">${totalDocs.toLocaleString("it-IT")}</td></tr>
              <tr><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>Collections</strong></td><td style="padding: 4px 12px; border: 1px solid #ddd;">${COLLECTIONS_TO_BACKUP.length}</td></tr>
              <tr><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>Dimensione</strong></td><td style="padding: 4px 12px; border: 1px solid #ddd;">${sizeMB} MB</td></tr>
              <tr><td style="padding: 4px 12px; border: 1px solid #ddd;"><strong>Storage</strong></td><td style="padding: 4px 12px; border: 1px solid #ddd;">${storageSaved ? "✅ Salvato" : "❌ Errore"}</td></tr>
            </table>
            <p>Il file JSON è allegato a questa email. Conservalo in un posto sicuro.</p>
            <p style="color: #888; font-size: 12px;">Backup automatico - CleaningApp</p>
          `,
          attachments: [
            {
              filename: fileNameShort,
              content: base64Content,
            },
          ],
        });

        emailSent = true;
        if (process.env.NODE_ENV !== "production") console.log(`   📧 Email inviata a ${BACKUP_EMAIL}`);
      } catch (err) {
        console.error("   ❌ Errore invio email:", err);
      }
    } else {
      if (process.env.NODE_ENV !== "production") console.log("   ⚠️ Resend non configurato, email non inviata");
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      success: true,
      fileName,
      totalDocuments: totalDocs,
      totalCollections: COLLECTIONS_TO_BACKUP.length,
      sizeMB: parseFloat(sizeMB),
      durationSeconds: parseFloat(duration),
      storageSaved,
      emailSent,
      emailTo: BACKUP_EMAIL,
      oldBackupsDeleted: deletedCount,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("❌ Cron backup-database: Errore:", error);
    return NextResponse.json(
      {
        error: "Errore durante il backup",
        details: error instanceof Error ? error.message : "Errore sconosciuto",
      },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

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

async function cleanupOldBackups(bucket: ReturnType<typeof getStorage>["bucket"]): Promise<number> {
  try {
    // @ts-expect-error TODO-FIX: TS2339 Property 'getFiles' does not exist on type '(name?: string | undefined) => Bucke...
    const [files] = await bucket.getFiles({ prefix: "backups/firestore-backup-" });

    if (files.length <= MAX_BACKUPS) {
      return 0;
    }

    // @ts-expect-error TODO-FIX: TS7006 Parameter 'a' implicitly has an 'any' type.
    const sorted = files.sort((a, b) => a.name.localeCompare(b.name));
    const toDelete = sorted.slice(0, sorted.length - MAX_BACKUPS);
    let deleted = 0;

    for (const file of toDelete) {
      try {
        await file.delete();
        deleted++;
        if (process.env.NODE_ENV !== "production") console.log(`   🗑️ Eliminato backup vecchio: ${file.name}`);
      } catch (err) {
        console.error(`   ⚠️ Errore eliminazione ${file.name}:`, err);
      }
    }

    return deleted;
  } catch (err) {
    console.error("   ⚠️ Errore pulizia backup vecchi:", err);
    return 0;
  }
}
