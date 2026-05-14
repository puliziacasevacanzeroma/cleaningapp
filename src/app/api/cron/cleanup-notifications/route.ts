import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';
// 🚀 IMPORTANTE: cron-job.org free tier ha timeout MASSIMO 30 secondi.
//    Quindi anche se Railway accetta 60s, cron-job.org tronca prima.
//    Il codice DEVE finire in <30s. Optimizzazioni applicate:
//    - writeBatch (500 ops/round-trip) invece di delete() sequenziali
//    - Limite MAX_DELETIONS_PER_RUN per evitare run lunghi al primo cleanup
//      (la prima run dopo 3 mesi di inattività ha ~5000 docs da cancellare).
//      Le run successive avranno solo ~100-200 docs/giorno = velocissime.
export const maxDuration = 60; // cuscinetto Railway, ma cron-job.org tronca a 30s

// Limite di sicurezza: non cancelliamo più di N docs per singola esecuzione.
// La prima run dopo lunga inattività potrebbe avere migliaia di docs vecchi,
// così la spalmiamo su più run giornaliere senza rischio timeout.
const MAX_DELETIONS_PER_RUN = 5000;

/**
 * GET /api/cron/cleanup-notifications?secret=CRON_SECRET
 *
 * Chiamato da cron-job.org una volta al giorno per pulire notifiche vecchie.
 *
 * Regole:
 *   - Notifiche READ/ARCHIVED più vecchie di 30 giorni → eliminate
 *   - Notifiche UNREAD più vecchie di 60 giorni → eliminate
 *
 * 🚀 FIX v2 (14/05/2026):
 *   - Bug critico precedente: cercava il secret nell'header Authorization
 *     ma cron-job.org invia in query string come gli altri cron.
 *     Risultato: 401 sempre, cron disattivato dal 12/02.
 *   - Ora accetta secret sia in query string che in header (compatibilità).
 *   - writeBatch invece di delete() sequenziali (500 ops per round-trip)
 *   - maxDuration 10s → 60s per gestire >5000 notifiche.
 */
export async function GET(req: NextRequest) {
  try {
    // 🔧 FIX: accetta secret sia in query string che in header (era il bug!)
    const cronSecret = process.env.CRON_SECRET;
    const urlSecret = req.nextUrl.searchParams.get("secret");
    const authHeader = req.headers.get("authorization");
    const isAuthorized =
      !cronSecret ||
      urlSecret === cronSecret ||
      authHeader === `Bearer ${cronSecret}`;
    if (!isAuthorized) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const now = new Date();
    const thirtyDaysAgo = Timestamp.fromDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const sixtyDaysAgo = Timestamp.fromDate(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));
    const sixtyDaysAgoMs = sixtyDaysAgo.toMillis();

    // Query: tutte le notifiche più vecchie di 30 giorni
    // (filtraggio fine per status avviene in JS)
    const oldSnap = await adminDb.collection("notifications")
      .where("createdAt", "<", thirtyDaysAgo)
      .get();

    // 🚀 PERF: raccolgo ref da eliminare e applico in batch
    //    Limite di sicurezza: max MAX_DELETIONS_PER_RUN per esecuzione
    const toDelete: FirebaseFirestore.DocumentReference[] = [];
    let deletedRead = 0;
    let deletedUnread = 0;
    let reachedLimit = false;

    for (const docSnap of oldSnap.docs) {
      if (toDelete.length >= MAX_DELETIONS_PER_RUN) {
        reachedLimit = true;
        break;
      }
      try {
        const data = docSnap.data() as Record<string, any>;
        const status = data.status || "";
        const createdAt = data.createdAt;

        // READ/ARCHIVED più vecchi di 30 giorni → elimina
        if (status === "READ" || status === "ARCHIVED") {
          toDelete.push(docSnap.ref);
          deletedRead++;
          continue;
        }

        // UNREAD più vecchi di 60 giorni → elimina
        if (status === "UNREAD" && createdAt) {
          const createdMs = typeof createdAt?.toMillis === "function"
            ? createdAt.toMillis()
            : (createdAt?._seconds ? createdAt._seconds * 1000 : 0);
          if (createdMs > 0 && createdMs < sixtyDaysAgoMs) {
            toDelete.push(docSnap.ref);
            deletedUnread++;
          }
        }
      } catch (e) {
        console.error(`Errore parsing notifica ${docSnap.id}:`, e);
      }
    }

    // 🚀 PERF: writeBatch (500 ops/batch limite Firestore)
    // Prima: 9000 delete sequenziali → timeout 10s sicuro
    // Ora: 18 round-trip × batch da 500 = ~5 secondi
    const BATCH_SIZE = 500;
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const chunk = toDelete.slice(i, i + BATCH_SIZE);
      const batch = adminDb.batch();
      for (const ref of chunk) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    const totalDeleted = deletedRead + deletedUnread;

    return NextResponse.json({
      success: true,
      message: reachedLimit
        ? `Eliminate ${totalDeleted} notifiche vecchie (limite raggiunto, restano da pulire altre notifiche nelle prossime run)`
        : `Eliminate ${totalDeleted} notifiche vecchie`,
      timestamp: now.toISOString(),
      details: {
        readArchived: deletedRead,
        unreadOld: deletedUnread,
        total: totalDeleted,
        scanned: oldSnap.size,
        reachedLimit,
        maxDeletionsPerRun: MAX_DELETIONS_PER_RUN,
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ cleanup-notifications error:", error);
    return NextResponse.json({ success: false, error: "Errore server", details: errMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
