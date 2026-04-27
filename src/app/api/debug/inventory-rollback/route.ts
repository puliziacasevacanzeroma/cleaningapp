import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minuti per processi lunghi

/**
 * POST /api/debug/inventory-rollback
 * 
 * Ripristina la collection inventory + orders allo stato del backup.
 * 
 * Body JSON: il contenuto completo del file di backup (creato da inventory-backup).
 * 
 * Query params:
 * - dryRun = 'false' per eseguire (default: true)
 * - secret = secret per autorizzare l'esecuzione
 * - skipOrders = 'true' per fare rollback solo dell'inventory (più veloce per test)
 */
export async function POST(req: NextRequest) {
  try {
    const dryRun = req.nextUrl.searchParams.get('dryRun') !== 'false';
    const secret = req.nextUrl.searchParams.get('secret');
    const skipOrders = req.nextUrl.searchParams.get('skipOrders') === 'true';

    if (!dryRun) {
      const expected = process.env.MIGRATION_SECRET || process.env.CRON_SECRET;
      if (expected && secret !== expected) {
        return NextResponse.json({
          error: "Non autorizzato. Aggiungi &secret=XXX per eseguire.",
        }, { status: 401 });
      }
    }

    // Leggo il backup dal body
    const backup: any = await req.json();
    if (!backup || !backup.inventory || !Array.isArray(backup.inventory)) {
      return NextResponse.json({
        error: "Body non valido. Aspettavo il JSON di backup con campo 'inventory'.",
      }, { status: 400 });
    }

    const backupInventory: { docId: string; data: any }[] = backup.inventory;
    const backupOrders: { docId: string; data: any }[] = backup.orders || [];
    const backupInventoryDocIds = new Set(backupInventory.map(i => i.docId));

    // ─── ANALISI INVENTORY ─────────────────────────────────────
    const currentInventorySnap = await adminDb.collection("inventory").get();
    const currentInventoryDocIds = new Set<string>(currentInventorySnap.docs.map((d: any) => d.id));

    // Documenti da DELETE: presenti ora ma NON nel backup
    const toDelete: string[] = [];
    currentInventoryDocIds.forEach((docId) => {
      if (!backupInventoryDocIds.has(docId)) {
        toDelete.push(docId);
      }
    });

    // Documenti da RESTORE: presenti nel backup, scrivo i loro dati originali
    const toRestore: { docId: string; data: any; reason: string }[] = [];
    for (const item of backupInventory) {
      const currentDoc = currentInventorySnap.docs.find((d: any) => d.id === item.docId);
      if (!currentDoc) {
        toRestore.push({ docId: item.docId, data: item.data, reason: "Mancante dopo migrazione, ripristino" });
      } else {
        // Verifico se i dati sono cambiati rispetto al backup
        const currentData = currentDoc.data();
        const fieldsChanged: string[] = [];
        for (const k of Object.keys(item.data)) {
          if (JSON.stringify(currentData[k]) !== JSON.stringify(item.data[k])) {
            fieldsChanged.push(k);
          }
        }
        // Verifico anche campi aggiunti dalla migrazione che non erano nel backup
        for (const k of Object.keys(currentData)) {
          if (!(k in item.data)) {
            fieldsChanged.push(`${k} (aggiunto dopo backup)`);
          }
        }
        if (fieldsChanged.length > 0) {
          toRestore.push({
            docId: item.docId,
            data: item.data,
            reason: `Campi modificati: ${fieldsChanged.slice(0, 5).join(", ")}${fieldsChanged.length > 5 ? '...' : ''}`,
          });
        }
      }
    }

    // ─── ANALISI ORDERS ────────────────────────────────────────
    let orderUpdatesPlanned = 0;
    const orderUpdates: { docId: string; itemsCount: number }[] = [];
    let orderUpdatesExecuted = 0;

    if (!skipOrders) {
      for (const o of backupOrders) {
        const items = o.data?.items;
        if (Array.isArray(items)) {
          orderUpdatesPlanned++;
          if (orderUpdates.length < 5) {
            // Salvo solo i primi 5 esempi per il report
            orderUpdates.push({ docId: o.docId, itemsCount: items.length });
          }
        }
      }
    }

    // ─── ESECUZIONE ─────────────────────────────────────────────
    let inventoryDeleted = 0;
    let inventoryRestored = 0;

    if (!dryRun) {
      // 1. INVENTORY: delete + restore in batch
      const BATCH_SIZE = 400;

      // Delete
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = adminDb.batch();
        const slice = toDelete.slice(i, i + BATCH_SIZE);
        for (const docId of slice) {
          batch.delete(adminDb.collection("inventory").doc(docId));
          inventoryDeleted++;
        }
        await batch.commit();
      }

      // Restore: uso set() che sovrascrive completamente il documento
      for (let i = 0; i < toRestore.length; i += BATCH_SIZE) {
        const batch = adminDb.batch();
        const slice = toRestore.slice(i, i + BATCH_SIZE);
        for (const item of slice) {
          batch.set(adminDb.collection("inventory").doc(item.docId), item.data);
          inventoryRestored++;
        }
        await batch.commit();
      }

      // 2. ORDERS: ripristino solo i campi items[]
      if (!skipOrders) {
        for (let i = 0; i < backupOrders.length; i += BATCH_SIZE) {
          const batch = adminDb.batch();
          const slice = backupOrders.slice(i, i + BATCH_SIZE);
          for (const o of slice) {
            const items = o.data?.items;
            if (Array.isArray(items)) {
              batch.update(adminDb.collection("orders").doc(o.docId), { items });
              orderUpdatesExecuted++;
            }
          }
          await batch.commit();
        }
      }
    }

    return NextResponse.json({
      mode: dryRun ? "DRY RUN (nessuna modifica)" : "ESEGUITO",
      summary: {
        inventory: {
          currentCount: currentInventoryDocIds.size,
          backupCount: backupInventoryDocIds.size,
          toDelete: toDelete.length,
          toRestore: toRestore.length,
          deleted: inventoryDeleted,
          restored: inventoryRestored,
        },
        orders: {
          backupCount: backupOrders.length,
          updatesPlanned: orderUpdatesPlanned,
          updatesExecuted: orderUpdatesExecuted,
          skipped: skipOrders,
        },
      },
      detail: {
        toDeleteList: toDelete,
        toRestoreSample: toRestore.slice(0, 10).map(r => ({ docId: r.docId, reason: r.reason })),
        sampleOrderUpdates: orderUpdates,
      },
      nextSteps: dryRun
        ? "Se ok, rilancia con &dryRun=false&secret=TUO_SECRET (POST con stesso body) per eseguire davvero"
        : "Rollback completato. Lancia /api/debug/inventory-audit per verificare.",
    });
  } catch (err: any) {
    console.error("[inventory-rollback] errore:", err);
    return NextResponse.json({
      error: "Errore durante il rollback",
      message: err?.message || String(err),
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
    }, { status: 500 });
  }
}
