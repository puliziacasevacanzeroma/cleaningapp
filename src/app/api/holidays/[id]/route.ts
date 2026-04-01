import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const docSnap = await adminDb.collection("holidays").doc(id).get();
    if (!docSnap.exists) return NextResponse.json({ error: "Festività non trovata" }, { status: 404 });

    const data = docSnap.data()!;
    return NextResponse.json({ holiday: { id: docSnap.id, ...data, date: data.date?.toDate?.() || null } });
  } catch (error) {
    console.error("Errore GET holiday:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo admin può modificare festività" }, { status: 403 });

    const { id } = await params;
    const body = await validateBody(req, GenericBodySchema);
    if (body instanceof Response) return body;

    const docRef = adminDb.collection("holidays").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return NextResponse.json({ error: "Festività non trovata" }, { status: 404 });

    const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    if (body.isRecurring !== undefined) {
      updateData.isRecurring = body.isRecurring;
      if (body.isRecurring) {
        // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
        if (body.recurringMonth) updateData.recurringMonth = parseInt(body.recurringMonth);
        // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
        if (body.recurringDay) updateData.recurringDay = parseInt(body.recurringDay);
        updateData.date = null;
      }
    }

    if (body.date !== undefined && !body.isRecurring) {
      // @ts-expect-error TODO-FIX: TS2769 No overload matches this call.
      updateData.date = Timestamp.fromDate(new Date(body.date));
    }

    if (body.surchargeType !== undefined) {
      updateData.surchargeType = body.surchargeType;
      if (body.surchargeType === "percentage") {
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
        updateData.surchargePercentage = parseFloat(body.surchargePercentage);
        updateData.surchargeFixed = null;
      } else {
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
        updateData.surchargeFixed = parseFloat(body.surchargeFixed);
        updateData.surchargePercentage = null;
      }
    } else if (body.surchargePercentage !== undefined) {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{} | null' is not assignable to parameter of type 'string'.
      updateData.surchargePercentage = parseFloat(body.surchargePercentage);
    } else if (body.surchargeFixed !== undefined) {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{} | null' is not assignable to parameter of type 'string'.
      updateData.surchargeFixed = parseFloat(body.surchargeFixed);
    }

    if (body.appliesToAllServices !== undefined) updateData.appliesToAllServices = body.appliesToAllServices;
    if (body.applicableServiceTypes !== undefined) updateData.applicableServiceTypes = body.applicableServiceTypes;

    await docRef.update(updateData);

    // 🎉 Ricalcola holidayFee su pulizie future dopo modifica festività
    try {
      const allHolidaysSnap = await adminDb.collection('holidays').where('isActive', '==', true).get();
      const allHolidays = allHolidaysSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      
      const futureCleaningsSnap = await adminDb.collection('cleanings')
        .where('scheduledDate', '>=', Timestamp.now())
        .get();
      
      for (const cDoc of futureCleaningsSnap.docs) {
        const c = cDoc.data() as Record<string, any>;
        if (!['SCHEDULED', 'ASSIGNED'].includes(c.status)) continue;
        const cDate = c.scheduledDate?.toDate?.();
        if (!cDate) continue;
        const basePrice = c.contractPrice || c.price || 0;
        if (basePrice <= 0) continue;
        
        // Find matching holiday
        let matchedFee = 0, matchedName: string | null = null;
        for (const h of allHolidays) {
          let match = false;
          if (h.isRecurring && h.recurringMonth && h.recurringDay) {
            // Match sia UTC che locale per timezone safety
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
            if (h.surchargeType === 'percentage' && h.surchargePercentage) matchedFee = Math.round(basePrice * (h.surchargePercentage / 100) * 100) / 100;
            else if (h.surchargeType === 'fixed' && h.surchargeFixed) matchedFee = h.surchargeFixed;
            break;
          }
        }
        
        const currentFee = c.holidayFee || 0;
        const currentName = c.holidayName || null;
        if (matchedFee !== currentFee || matchedName !== currentName) {
          const upd: Record<string, any> = { updatedAt: Timestamp.now() };
          if (matchedFee > 0) { upd.holidayFee = matchedFee; upd.holidayName = matchedName; }
          else { upd.holidayFee = 0; upd.holidayName = null; }
          await adminDb.collection('cleanings').doc(cDoc.id).update(upd);
        }
      }
    } catch (e: any) { console.error('Errore ricalcolo festività:', e?.message); }

    return NextResponse.json({ success: true, message: "Festività aggiornata" });
  } catch (error) {
    console.error("Errore PATCH holiday:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo admin può eliminare festività" }, { status: 403 });

    const { id } = await params;
    const docRef = adminDb.collection("holidays").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return NextResponse.json({ error: "Festività non trovata" }, { status: 404 });

    const holiday = docSnap.data()!;
    await docRef.delete();

    // 🎉 Rimuovi holidayFee dalle pulizie future che avevano questa festività
    try {
      const cleaningsWithHoliday = await adminDb.collection('cleanings')
        .where('holidayName', '==', holiday.name)
        .where('status', 'in', ['SCHEDULED', 'ASSIGNED'])
        .get();
      for (const cDoc of cleaningsWithHoliday.docs) {
        await adminDb.collection('cleanings').doc(cDoc.id).update({
          holidayFee: 0, holidayName: null, updatedAt: Timestamp.now(),
        });
      }
    } catch (e: any) { console.error('Errore rimozione holidayFee:', e?.message); }

    return NextResponse.json({ success: true, message: `Festività "${holiday.name}" eliminata` });
  } catch (error) {
    console.error("Errore DELETE holiday:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
