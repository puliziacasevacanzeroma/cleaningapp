import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

function getHolidayFee(date: Date, basePrice: number, holidays: any[]): { fee: number; name: string | null } {
  const utcMonth = date.getUTCMonth() + 1;
  const utcDay = date.getUTCDate();
  const localMonth = date.getMonth() + 1;
  const localDay = date.getDate();

  for (const h of holidays) {
    if (!h.isActive) continue;
    let match = false;
    if (h.isRecurring && h.recurringMonth && h.recurringDay) {
      match = (utcMonth === h.recurringMonth && utcDay === h.recurringDay) ||
              (localMonth === h.recurringMonth && localDay === h.recurringDay);
    } else if (h.date) {
      const hd = h.date?.toDate?.() || (typeof h.date === "string" ? new Date(h.date) : h.date);
      if (hd) {
        match = (hd.getUTCFullYear() === date.getUTCFullYear() && hd.getUTCMonth() === date.getUTCMonth() && hd.getUTCDate() === date.getUTCDate()) ||
                (hd.getFullYear() === date.getFullYear() && hd.getMonth() === date.getMonth() && hd.getDate() === date.getDate());
      }
    }
    if (match) {
      if (h.surchargeType === "percentage" && h.surchargePercentage) {
        return { fee: Math.round(basePrice * (h.surchargePercentage / 100) * 100) / 100, name: h.name };
      } else if (h.surchargeType === "fixed" && h.surchargeFixed) {
        return { fee: h.surchargeFixed, name: h.name };
      }
      return { fee: 0, name: h.name };
    }
  }
  return { fee: 0, name: null };
}

export async function POST() {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin" }, { status: 403 });
    }

    // Carica holidays
    const holSnap = await adminDb.collection("holidays").where("isActive", "==", true).get();
    const holidays = holSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Carica proprietà per cleaningPrice
    const propSnap = await adminDb.collection("properties").get();
    const propPrices = new Map<string, number>();
    propSnap.docs.forEach(d => {
      const p = d.data();
      propPrices.set(d.id, (p as any).cleaningPrice || (p as any).contractPrice || 0);
    });

    // Trova pulizie SCHEDULED o ASSIGNED senza price o senza holidayFee verificato
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cleanSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", Timestamp.fromDate(today))
      .get();

    let fixed = 0;
    let skipped = 0;
    let alreadyOk = 0;
    const details: string[] = [];

    for (const doc of cleanSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const status = (data.status || "").toUpperCase();
      if (status === "COMPLETED" || status === "CANCELLED") { skipped++; continue; }

      const propId = data.propertyId;
      const cleaningPrice = propPrices.get(propId) || 0;
      const scheduledDate = data.scheduledDate?.toDate?.();
      if (!scheduledDate) { skipped++; continue; }

      // Calcola holiday fee
      const hol = getHolidayFee(scheduledDate, cleaningPrice, holidays);

      // Controlla se serve aggiornare
      const currentPrice = data.price;
      const currentHolidayFee = data.holidayFee;
      const needsPriceUpdate = currentPrice === undefined || currentPrice === null || currentPrice === 0;
      const needsHolidayUpdate = hol.fee > 0 && (currentHolidayFee === undefined || currentHolidayFee === null || currentHolidayFee === 0);

      if (!needsPriceUpdate && !needsHolidayUpdate) {
        alreadyOk++;
        continue;
      }

      // Aggiorna
      const update: Record<string, any> = { updatedAt: Timestamp.now() };

      if (needsPriceUpdate && cleaningPrice > 0) {
        update.price = cleaningPrice;
        update.contractPrice = cleaningPrice;
      }

      if (needsHolidayUpdate) {
        update.holidayFee = hol.fee;
        update.holidayName = hol.name;
      }

      // Se nessun campo da aggiornare realmente, skip
      if (Object.keys(update).length <= 1) { skipped++; continue; }

      await adminDb.collection("cleanings").doc(doc.id).update(update);
      fixed++;

      const dateStr = scheduledDate.toISOString().split("T")[0];
      const propName = data.propertyName || propId;
      const parts: string[] = [];
      if (needsPriceUpdate && cleaningPrice > 0) parts.push(`price:€${cleaningPrice}`);
      if (needsHolidayUpdate) parts.push(`${hol.name}:€${hol.fee}`);
      details.push(`${dateStr} ${propName} → ${parts.join(", ")}`);
    }

    return NextResponse.json({
      success: true,
      message: `${fixed} pulizie aggiornate, ${alreadyOk} già OK, ${skipped} skippate`,
      fixed,
      alreadyOk,
      skipped,
      totalScanned: cleanSnap.docs.length,
      holidaysActive: holidays.length,
      details: details.slice(0, 50), // max 50 dettagli
    });
  } catch (error) {
    console.error("❌ Errore fix-holiday-fees:", error);
    return NextResponse.json(
      { error: "Errore", details: error instanceof Error ? error.message : "?" },
      { status: 500 }
    );
  }
}
