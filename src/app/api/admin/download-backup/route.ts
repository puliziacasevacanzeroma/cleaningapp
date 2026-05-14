/**
 * 🆘 BACKUP ON-DEMAND — Scarica direttamente nel browser
 *
 * Endpoint di emergenza che esporta TUTTO il database Firestore e lo
 * restituisce come download diretto. NON usa Firebase Storage, NON usa
 * Resend. Quindi NON può fallire silenziosamente come il cron normale.
 *
 * USAGE:
 *   Apri nel browser:
 *   https://gestionale.puliziacasevacanze.it/api/admin/download-backup?secret=CRON_SECRET
 *
 *   Il browser ti chiederà dove salvare il file. Salvalo SUBITO sul PC
 *   in una cartella tipo C:\Backup-CleaningApp\
 *
 * Tempo esecuzione atteso: ~30-60 secondi
 * Dimensione file atteso: ~40-50 MB
 *
 * SICUREZZA:
 *   - Read-only: zero scritture al DB
 *   - Protetto da CRON_SECRET
 *   - Streaming opzionale per file grossi (qui usiamo buffer perché ~50MB sta ok)
 *
 * Lascia questo endpoint sempre disponibile come fallback di emergenza,
 * anche dopo aver fixato il cron automatico.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minuti

const CRON_SECRET = process.env.CRON_SECRET;

// Stesse collection del cron-job backup-database
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

export async function GET(req: NextRequest) {
  // ─── Autenticazione ───
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (!CRON_SECRET || urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const startTime = Date.now();
    const backup: Record<string, Record<string, unknown>[]> = {};
    const stats: Record<string, number> = {};
    let totalDocs = 0;
    const errors: Array<{ collection: string; error: string }> = [];

    // ─── Esporta ogni collection ───
    for (const collectionName of COLLECTIONS_TO_BACKUP) {
      try {
        const snapshot = await adminDb.collection(collectionName).get();
        if (snapshot.empty) {
          backup[collectionName] = [];
          stats[collectionName] = 0;
          continue;
        }
        backup[collectionName] = snapshot.docs.map((doc) => {
          const data = doc.data() as Record<string, any>;
          const serialized = serializeFirestoreData(data);
          return { _id: doc.id, ...serialized };
        });
        stats[collectionName] = snapshot.size;
        totalDocs += snapshot.size;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push({ collection: collectionName, error: errMsg });
        backup[collectionName] = [];
        stats[collectionName] = 0;
      }
    }

    // ─── Metadati del backup ───
    const now = new Date();
    const meta = {
      _backup_meta: {
        createdAt: now.toISOString(),
        createdAtLocal: now.toLocaleString("it-IT", { timeZone: "Europe/Rome" }),
        totalDocuments: totalDocs,
        totalCollections: COLLECTIONS_TO_BACKUP.length,
        durationSeconds: ((Date.now() - startTime) / 1000).toFixed(1),
        stats,
        errors: errors.length > 0 ? errors : undefined,
        source: "manual-download-backup",
      },
    };

    // Mette i metadati come PRIMA chiave del JSON (utile in debug)
    const fullBackup = { ...meta, ...backup };
    const jsonData = JSON.stringify(fullBackup, null, 2);
    const jsonBuffer = Buffer.from(jsonData, "utf-8");

    // ─── Nome file con data ───
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toISOString().split("T")[1].split(".")[0].replace(/:/g, "-");
    const fileName = `cleaningapp-backup-${dateStr}_${timeStr}.json`;

    // ─── Risposta: download diretto ───
    return new NextResponse(jsonBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": jsonBuffer.length.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Errore durante backup",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
