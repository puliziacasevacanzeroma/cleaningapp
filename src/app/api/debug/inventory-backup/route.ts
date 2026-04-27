import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/inventory-backup
 * 
 * Esporta tutta la collection inventory (e opzionalmente orders) come JSON
 * scaricabile. Da fare PRIMA di qualsiasi migrazione, così se qualcosa va
 * storto possiamo ripristinare tutto.
 * 
 * Query params:
 * - withOrders = 'true' → include anche tutti gli ordini (per backup completo)
 */
export async function GET(req: NextRequest) {
  try {
    const includeOrders = req.nextUrl.searchParams.get('withOrders') === 'true';

    // 1. Backup inventario
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryItems: any[] = [];
    for (const doc of inventorySnap.docs) {
      inventoryItems.push({
        docId: doc.id,
        data: doc.data(),
      });
    }

    const backup: any = {
      backupCreatedAt: new Date().toISOString(),
      collectionCounts: {
        inventory: inventoryItems.length,
      },
      inventory: inventoryItems,
    };

    // 2. Se richiesto, backup anche orders (può essere grosso)
    if (includeOrders) {
      const ordersSnap = await adminDb.collection("orders").get();
      const orders: any[] = [];
      for (const doc of ordersSnap.docs) {
        const d: any = doc.data();
        orders.push({
          docId: doc.id,
          data: {
            ...d,
            // Converto Timestamp in ISO string
            scheduledDate: d.scheduledDate?.toDate?.()?.toISOString?.() || null,
            deliveredAt: d.deliveredAt?.toDate?.()?.toISOString?.() || null,
            createdAt: d.createdAt?.toDate?.()?.toISOString?.() || null,
            updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() || null,
          },
        });
      }
      backup.collectionCounts.orders = orders.length;
      backup.orders = orders;
    }

    // Restituisco come JSON scaricabile
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="backup-inventory-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (err: any) {
    console.error("[inventory-backup] errore:", err);
    return NextResponse.json({
      error: "Errore durante il backup",
      message: err?.message || String(err),
    }, { status: 500 });
  }
}
