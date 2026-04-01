import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { ITALIAN_HOLIDAYS } from "~/types/holiday";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const year = searchParams.get("year");

    const snapshot = await adminDb.collection("holidays").get();

    let holidays = snapshot.docs.map(doc => {
      const data = doc.data() as Record<string, any>;
      return { id: doc.id, ...data, date: data.date?.toDate?.() || null };
    }) as Record<string, unknown>[];

    if (activeOnly) holidays = holidays.filter(h => h.isActive);

    if (year) {
      const yearInt = parseInt(year);
      holidays = holidays.filter(h => {
        if (h.isRecurring) return true;
        if (!h.date) return false;
        return (h.date as Date).getFullYear() === yearInt;
      });
    }

    holidays.sort((a, b) => {
      const monthA = a.isRecurring ? (a.recurringMonth as number) : ((a.date as Date)?.getMonth() + 1) || 0;
      const monthB = b.isRecurring ? (b.recurringMonth as number) : ((b.date as Date)?.getMonth() + 1) || 0;
      const dayA = a.isRecurring ? (a.recurringDay as number) : (a.date as Date)?.getDate() || 0;
      const dayB = b.isRecurring ? (b.recurringDay as number) : (b.date as Date)?.getDate() || 0;
      if (monthA !== monthB) return monthA - monthB;
      return dayA - dayB;
    });

    return NextResponse.json({ holidays });
  } catch (error) {
    console.error("Errore GET holidays:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo admin può creare festività" }, { status: 403 });

    const body = await validateBody(req, GenericBodySchema);
    if (body instanceof Response) return body;
    const { name, date, type, isRecurring, recurringMonth, recurringDay,
      surchargeType, surchargePercentage, surchargeFixed,
      appliesToAllServices, applicableServiceTypes, notes } = body;

    if (!name) return NextResponse.json({ error: "Nome festività obbligatorio" }, { status: 400 });
    if (isRecurring && (!recurringMonth || !recurringDay)) return NextResponse.json({ error: "Per festività ricorrenti servono mese e giorno" }, { status: 400 });
    if (!isRecurring && !date) return NextResponse.json({ error: "Per festività non ricorrenti serve la data" }, { status: 400 });
    if (!surchargeType || (surchargeType === "percentage" && !surchargePercentage) || (surchargeType === "fixed" && !surchargeFixed)) {
      return NextResponse.json({ error: "Specificare tipo e valore maggiorazione" }, { status: 400 });
    }

    const now = Timestamp.now();
    const holidayData: Record<string, unknown> = {
      name, type: type || "custom", isRecurring: isRecurring || false,
      surchargeType, appliesToAllServices: appliesToAllServices ?? true,
      isActive: true, createdAt: now, updatedAt: now, createdBy: user.id,
    };

    if (isRecurring) {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
      holidayData.recurringMonth = parseInt(recurringMonth);
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
      holidayData.recurringDay = parseInt(recurringDay);
    } else {
      // @ts-expect-error TODO-FIX: TS2769 No overload matches this call.
      holidayData.date = Timestamp.fromDate(new Date(date));
    }

    if (surchargeType === "percentage") {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
      holidayData.surchargePercentage = parseFloat(surchargePercentage);
    } else {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
      holidayData.surchargeFixed = parseFloat(surchargeFixed);
    }

    if (!appliesToAllServices && applicableServiceTypes) holidayData.applicableServiceTypes = applicableServiceTypes;
    if (notes) holidayData.notes = notes;

    const docRef = await adminDb.collection("holidays").add(holidayData);

    // 🎉 Ricalcola holidayFee sulle pulizie SCHEDULED future che cadono in questa festività
    try {
      const nowDate = new Date();
      const futureCleaningsSnap = await adminDb.collection('cleanings')
        .where('scheduledDate', '>=', Timestamp.fromDate(nowDate))
        .get();
      
      let updated = 0;
      const hData = { ...holidayData, id: docRef.id } as Record<string, any>;
      
      for (const cDoc of futureCleaningsSnap.docs) {
        const c = cDoc.data() as Record<string, any>;
        if (!['SCHEDULED', 'ASSIGNED'].includes(c.status)) continue;
        const cDate = c.scheduledDate?.toDate?.();
        if (!cDate) continue;
        
        const basePrice = c.contractPrice || c.price || 0;
        // Check if this cleaning date matches the new holiday
        let match = false;
        if (hData.isRecurring && hData.recurringMonth && hData.recurringDay) {
          const utcMatch = (cDate.getUTCMonth() + 1) === hData.recurringMonth && cDate.getUTCDate() === hData.recurringDay;
          const localMatch = (cDate.getMonth() + 1) === hData.recurringMonth && cDate.getDate() === hData.recurringDay;
          match = utcMatch || localMatch;
        } else if (hData.date) {
          const hd = hData.date.toDate?.() || new Date(hData.date);
          const utcMatch = hd.getUTCFullYear() === cDate.getUTCFullYear() && hd.getUTCMonth() === cDate.getUTCMonth() && hd.getUTCDate() === cDate.getUTCDate();
          const localMatch = hd.getFullYear() === cDate.getFullYear() && hd.getMonth() === cDate.getMonth() && hd.getDate() === cDate.getDate();
          match = utcMatch || localMatch;
        }
        
        if (match && basePrice > 0) {
          let fee = 0;
          if (hData.surchargeType === 'percentage' && hData.surchargePercentage) {
            fee = Math.round(basePrice * (hData.surchargePercentage / 100) * 100) / 100;
          } else if (hData.surchargeType === 'fixed' && hData.surchargeFixed) {
            fee = hData.surchargeFixed;
          }
          if (fee > 0) {
            await adminDb.collection('cleanings').doc(cDoc.id).update({
              holidayFee: fee,
              holidayName: hData.name,
              updatedAt: Timestamp.now(),
            });
            updated++;
          }
        }
      }
      
      if (updated > 0) console.log(`🎉 Aggiornate ${updated} pulizie con maggiorazione festività "${name}"`);
    } catch (recalcErr: any) {
      console.error('Errore ricalcolo pulizie per festività:', recalcErr?.message);
      // Non bloccare la creazione della festività
    }

    return NextResponse.json({ success: true, id: docRef.id, message: `Festività "${name}" creata` });
  } catch (error) {
    console.error("Errore POST holidays:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const existingSnap = await adminDb.collection("holidays").get();
    if (existingSnap.docs.length > 0) {
      return NextResponse.json({ error: "Festività già presenti. Elimina prima quelle esistenti.", existing: existingSnap.docs.length }, { status: 400 });
    }

    const now = Timestamp.now();
    const currentYear = new Date().getFullYear();
    const created: string[] = [];

    for (const holiday of ITALIAN_HOLIDAYS) {
      const holidayData: Record<string, unknown> = { ...holiday, createdAt: now, updatedAt: now, createdBy: user.id };

      if (!holiday.isRecurring) {
        if (holiday.name === "Pasqua") holidayData.date = Timestamp.fromDate(new Date(currentYear, 3, 20));
        else if (holiday.name === "Pasquetta") holidayData.date = Timestamp.fromDate(new Date(currentYear, 3, 21));
      }

      await adminDb.collection("holidays").add(holidayData);
      created.push(holiday.name);
    }

    return NextResponse.json({ success: true, created: created.length, holidays: created, message: `${created.length} festività italiane create`, note: "Ricordati di aggiornare le date di Pasqua e Pasquetta ogni anno!" });
  } catch (error) {
    console.error("Errore PUT holidays (seed):", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
