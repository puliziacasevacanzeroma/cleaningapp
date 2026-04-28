/**
 * 🔧 Endpoint diagnostico una-tantum per riallineare scheduledTime
 * tra cleanings e orders collegati.
 *
 * Utilità: dopo il deploy del fix sync, questo endpoint fa il backfill
 * sui dati storici già disallineati.
 *
 * USO:
 *  - GET /api/debug/sync-orders-times              → dryRun (mostra quanti, non modifica)
 *  - GET /api/debug/sync-orders-times?execute=true&secret=<CRON_SECRET> → modifica DB
 *
 * SICUREZZA: il modo execute richiede CRON_SECRET per evitare modifiche accidentali.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const execute = req.nextUrl.searchParams.get("execute") === "true";
  const secret = req.nextUrl.searchParams.get("secret");

  // Se è execute, richiedo secret valido
  if (execute && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized: execute richiede secret valido" }, { status: 401 });
  }

  const startTime = Date.now();
  const stats = {
    cleaningsChecked: 0,
    ordersChecked: 0,
    ordersMismatch: 0,
    ordersFixed: 0,
    skipped: 0,
    errors: [] as string[],
  };
  const samples: any[] = [];

  try {
    // 1. Carico tutti i cleanings
    const cleaningsSnap = await adminDb.collection("cleanings").get();
    stats.cleaningsChecked = cleaningsSnap.docs.length;

    // 2. Mappa cleaningId → { scheduledTime, scheduledDate }
    const cleaningMap = new Map<string, { scheduledTime: string; scheduledDate: any }>();
    for (const doc of cleaningsSnap.docs) {
      const data = doc.data();
      cleaningMap.set(doc.id, {
        scheduledTime: data.scheduledTime || "",
        scheduledDate: data.scheduledDate,
      });
    }

    // 3. Scorro tutti gli orders con cleaningId valorizzato
    const ordersSnap = await adminDb.collection("orders")
      .where("cleaningId", "!=", null)
      .get();
    stats.ordersChecked = ordersSnap.docs.length;

    // 4. Per ognuno, confronto scheduledTime
    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data();
      const cleaningId = order.cleaningId;
      const cleaning = cleaningMap.get(cleaningId);

      if (!cleaning) {
        stats.skipped++;
        continue;
      }

      const cleaningTime = cleaning.scheduledTime;
      const orderTime = order.scheduledTime || "";

      // Disallineamento: cleaning ha un orario e order ne ha uno diverso
      if (cleaningTime && cleaningTime !== orderTime) {
        stats.ordersMismatch++;

        // Conserva campione per il report
        if (samples.length < 20) {
          samples.push({
            orderId: orderDoc.id,
            cleaningId,
            orderStatus: order.status,
            orderTime,
            cleaningTime,
            action: execute ? "FIXED" : "WOULD_FIX",
          });
        }

        if (execute) {
          try {
            await adminDb.collection("orders").doc(orderDoc.id).update({
              scheduledTime: cleaningTime,
              updatedAt: Timestamp.now(),
              syncedFromCleaning: true,
              syncedAt: Timestamp.now(),
            });
            stats.ordersFixed++;
          } catch (err: any) {
            stats.errors.push(`Order ${orderDoc.id}: ${err?.message || String(err)}`);
          }
        }
      }
    }

    return NextResponse.json({
      mode: execute ? "EXECUTE (DB modificato)" : "DRY RUN (nessuna modifica)",
      durationMs: Date.now() - startTime,
      stats,
      samples,
      hint: execute
        ? "Tutti gli ordini disallineati sono stati riallineati. Il rider vedrà gli orari corretti dopo refresh."
        : "Per applicare le modifiche, aggiungi &execute=true&secret=<CRON_SECRET>",
    });
  } catch (err: any) {
    return NextResponse.json({
      error: "Errore globale",
      message: err?.message || String(err),
      stats,
      durationMs: Date.now() - startTime,
    }, { status: 500 });
  }
}
