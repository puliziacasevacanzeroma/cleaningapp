import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

/**
 * DIAGNOSI: Chi cancella gli ordini biancheria e perché?
 * 
 * Cerca tutti gli ordini CANCELLED degli ultimi 30 giorni
 * e analizza cancelReason, cancelledAt, per capire la fonte.
 */

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // Ultimi 30 giorni
    const since = new Date();
    since.setDate(since.getDate() - 30);

    // Carica ordini CANCELLED — query semplice solo su status, no compositi
    const snap = await adminDb.collection("orders")
      .where("status", "==", "CANCELLED")
      .get();

    const cancelled = snap.docs
      .map(d => ({ id: d.id, ...d.data() as any }))
      .filter(o => {
        // Filtra solo ultimi 30 giorni in memoria
        const cancelledAt = o.cancelledAt?.toDate?.();
        const scheduledDate = o.scheduledDate?.toDate?.();
        const ref = cancelledAt || scheduledDate;
        return ref && ref >= since;
      });

    // Raggruppa per cancelReason
    const byReason: Record<string, number> = {};
    const byDay: Record<string, any[]> = {};

    for (const o of cancelled) {
      const reason = o.cancelReason || "Nessun motivo specificato";
      byReason[reason] = (byReason[reason] || 0) + 1;

      // Raggruppa per giorno schedulato
      const scheduled = o.scheduledDate?.toDate?.();
      if (scheduled) {
        const dayKey = `${scheduled.getFullYear()}-${String(scheduled.getMonth()+1).padStart(2,'0')}-${String(scheduled.getDate()).padStart(2,'0')}`;
        if (!byDay[dayKey]) byDay[dayKey] = [];
        byDay[dayKey].push({
          orderId: o.id,
          propertyId: o.propertyId,
          type: o.type,
          cancelReason: reason,
          cancelledAt: o.cancelledAt?.toDate?.()?.toISOString() || null,
          scheduledDate: scheduled.toISOString(),
          createdAt: o.createdAt?.toDate?.()?.toISOString() || null,
          cancelledBy: o.cancelledBy || null,
          cleaningId: o.cleaningId || null,
        });
      }
    }

    // Ordina i giorni
    const daysSorted = Object.entries(byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, orders]) => ({
        day,
        count: orders.length,
        reasons: orders.reduce((acc: Record<string,number>, o) => {
          acc[o.cancelReason] = (acc[o.cancelReason] || 0) + 1;
          return acc;
        }, {}),
        orders,
      }));

    return NextResponse.json({
      summary: {
        total: cancelled.length,
        byReason,
        // Quanti sono cancellati dal cron iCal vs manuale vs altro
        fromIcal: cancelled.filter(o => o.cancelReason?.includes('iCal')).length,
        fromManual: cancelled.filter(o => !o.cancelReason || o.cancelReason === 'Nessun motivo specificato').length,
        fromOrphan: cancelled.filter(o => o.cancelReason?.includes('orphan') || o.cancelReason?.includes('non esistente')).length,
      },
      days: daysSorted,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
