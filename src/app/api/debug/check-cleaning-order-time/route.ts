import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/check-cleaning-order-time?cleaningId=XXX
 * 
 * Diagnostico per verificare se cleaning.scheduledTime e order.scheduledTime
 * sono sincronizzati. Usalo dopo aver modificato un orario per capire
 * se il sync è funzionato.
 * 
 * Se non passi cleaningId, mostra le ultime 10 pulizie modificate
 * e indica quali hanno disallineamento orari con i loro ordini.
 */
export async function GET(req: NextRequest) {
  try {
    const cleaningId = req.nextUrl.searchParams.get('cleaningId');
    
    if (cleaningId) {
      // Modalità "controllo singolo cleaning"
      const cleaningDoc = await adminDb.collection("cleanings").doc(cleaningId).get();
      if (!cleaningDoc.exists) {
        return NextResponse.json({ error: "Cleaning non trovato" }, { status: 404 });
      }
      
      const cleaningData = cleaningDoc.data() as Record<string, any>;
      
      // Trova tutti gli ordini collegati
      const ordersSnap = await adminDb.collection("orders")
        .where("cleaningId", "==", cleaningId)
        .get();
      
      const orders = ordersSnap.docs.map((doc: any) => {
        const d = doc.data() as Record<string, any>;
        return {
          orderId: doc.id,
          status: d.status,
          scheduledTime: d.scheduledTime,
          scheduledDate: d.scheduledDate?.toDate?.()?.toISOString() || null,
          updatedAt: d.updatedAt?.toDate?.()?.toISOString() || null,
        };
      });
      
      const cleaningTime = cleaningData.scheduledTime;
      const allSynced = orders.every((o: any) => o.scheduledTime === cleaningTime);
      
      return NextResponse.json({
        cleaning: {
          id: cleaningId,
          scheduledTime: cleaningTime,
          scheduledDate: cleaningData.scheduledDate?.toDate?.()?.toISOString() || null,
          updatedAt: cleaningData.updatedAt?.toDate?.()?.toISOString() || null,
          status: cleaningData.status,
        },
        orders,
        diagnosis: {
          orderCount: orders.length,
          allSynced,
          mismatchDetails: allSynced ? null : orders
            .filter((o: any) => o.scheduledTime !== cleaningTime)
            .map((o: any) => `Order ${o.orderId}: order.scheduledTime="${o.scheduledTime}" ≠ cleaning.scheduledTime="${cleaningTime}"`),
        },
      });
    }
    
    // Modalità "ultime 10 modificate"
    const recentSnap = await adminDb.collection("cleanings")
      .orderBy("updatedAt", "desc")
      .limit(10)
      .get();
    
    const results: any[] = [];
    for (const cDoc of recentSnap.docs) {
      const cData = cDoc.data() as Record<string, any>;
      const ordersSnap = await adminDb.collection("orders")
        .where("cleaningId", "==", cDoc.id)
        .get();
      
      const orders = ordersSnap.docs.map((d: any) => {
        const dd = d.data() as Record<string, any>;
        return { id: d.id, status: dd.status, scheduledTime: dd.scheduledTime };
      });
      
      const cleaningTime = cData.scheduledTime;
      const mismatches = orders.filter((o: any) => o.scheduledTime !== cleaningTime);
      
      results.push({
        cleaningId: cDoc.id,
        cleaningTime,
        cleaningUpdatedAt: cData.updatedAt?.toDate?.()?.toISOString() || null,
        orders: orders.length,
        synced: mismatches.length === 0,
        mismatches: mismatches.length > 0 ? mismatches : undefined,
      });
    }
    
    return NextResponse.json({
      mode: "Ultime 10 pulizie modificate",
      results,
      summary: {
        total: results.length,
        synced: results.filter(r => r.synced).length,
        mismatched: results.filter(r => !r.synced).length,
      },
    });
    
  } catch (err: any) {
    return NextResponse.json({
      error: err?.message || String(err),
    }, { status: 500 });
  }
}
