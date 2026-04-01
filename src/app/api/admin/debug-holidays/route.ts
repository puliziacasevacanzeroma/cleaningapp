import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const urlSecret = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // 1. Carica holidays
    const holidaysSnap = await adminDb.collection('holidays').where('isActive', '==', true).get();
    const holidays = holidaysSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
    
    // 2. Carica pulizie future
    const cleaningsSnap = await adminDb.collection('cleanings')
      .where('scheduledDate', '>=', Timestamp.now())
      .get();
    
    const results: any[] = [];
    let updated = 0;
    
    for (const cDoc of cleaningsSnap.docs) {
      const c = cDoc.data() as Record<string, any>;
      if (!['SCHEDULED', 'ASSIGNED'].includes(c.status)) continue;
      
      const cDate = c.scheduledDate?.toDate?.();
      if (!cDate) continue;
      
      const basePrice = c.contractPrice ?? c.price ?? 0;
      
      // Match holidays
      let matchedFee = 0, matchedName: string | null = null;
      for (const h of holidays) {
        let match = false;
        if (h.isRecurring && h.recurringMonth && h.recurringDay) {
          const utcMatch = (cDate.getUTCMonth() + 1) === h.recurringMonth && cDate.getUTCDate() === h.recurringDay;
          const localMatch = (cDate.getMonth() + 1) === h.recurringMonth && cDate.getDate() === h.recurringDay;
          match = utcMatch || localMatch;
        } else if (h.date) {
          const hd = h.date.toDate?.() || new Date(h.date);
          const utcMatch = hd.getUTCFullYear() === cDate.getUTCFullYear() && hd.getUTCMonth() === cDate.getUTCMonth() && hd.getUTCDate() === cDate.getUTCDate();
          const localMatch = hd.getFullYear() === cDate.getFullYear() && hd.getMonth() === cDate.getMonth() && hd.getDate() === cDate.getDate();
          match = utcMatch || localMatch;
        }
        
        if (match) {
          matchedName = h.name;
          if (h.surchargeType === 'percentage' && h.surchargePercentage) {
            matchedFee = Math.round(basePrice * (h.surchargePercentage / 100) * 100) / 100;
          } else if (h.surchargeType === 'fixed' && h.surchargeFixed) {
            matchedFee = h.surchargeFixed;
          }
          break;
        }
      }
      
      if (matchedFee > 0) {
        // Apply!
        const apply = req.nextUrl.searchParams.get('apply') === 'true';
        if (apply) {
          await adminDb.collection('cleanings').doc(cDoc.id).update({
            holidayFee: matchedFee,
            holidayName: matchedName,
            updatedAt: Timestamp.now(),
          });
          updated++;
        }
        
        results.push({
          cleaningId: cDoc.id,
          propertyName: c.propertyName,
          date: cDate.toISOString(),
          utcDay: cDate.getUTCDate(),
          utcMonth: cDate.getUTCMonth() + 1,
          localDay: cDate.getDate(),
          localMonth: cDate.getMonth() + 1,
          basePrice,
          contractPrice: c.contractPrice,
          price: c.price,
          currentHolidayFee: c.holidayFee || 0,
          newHolidayFee: matchedFee,
          holidayName: matchedName,
          status: c.status,
          applied: apply,
        });
      }
    }
    
    return NextResponse.json({
      totalCleanings: cleaningsSnap.size,
      holidaysCount: holidays.length,
      matchedCleanings: results.length,
      updated,
      holidays: holidays.map(h => ({ name: h.name, month: h.recurringMonth, day: h.recurringDay, pct: h.surchargePercentage })),
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
