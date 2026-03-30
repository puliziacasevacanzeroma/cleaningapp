/**
 * POST /api/bookings/delete-by-source
 * Elimina tutte le prenotazioni future di un source specifico per una proprietà.
 * Elimina anche le pulizie e ordini biancheria collegati.
 * Usato quando si rimuove un link iCal dalla proprietà.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getUTCFullYear() === d2.getUTCFullYear() && d1.getUTCMonth() === d2.getUTCMonth() && d1.getUTCDate() === d2.getUTCDate();
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json();
    const { propertyId, source } = body;

    if (!propertyId || !source) {
      return NextResponse.json({ error: "propertyId e source obbligatori" }, { status: 400 });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Carica prenotazioni di questo source per questa proprietà
    const bookingsSnap = await adminDb.collection("bookings")
      .where("propertyId", "==", propertyId)
      .where("source", "==", source)
      .get();

    // 🔥 Carica tutte le pulizie della proprietà e filtra per bookingSource in-memory
    // (evita necessità di indice composito propertyId+bookingSource)
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("propertyId", "==", propertyId)
      .get();

    const allCleanings = cleaningsSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }))
      .filter(c => c.bookingSource === source);

    let deletedBookings = 0;
    let deletedCleanings = 0;
    let cancelledOrders = 0;
    let skipped = 0;

    // Set per tracciare pulizie già cancellate (evita duplicati)
    const deletedCleaningIds = new Set<string>();

    // STEP 1: Cancella booking future + pulizie collegate
    for (const doc of bookingsSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const checkOut = data.checkOut?.toDate?.();

      // Non cancellare prenotazioni passate
      if (!checkOut || checkOut < now) {
        skipped++;
        continue;
      }

      // Non cancellare prenotazioni manuali
      if (data.isManual === true || data.source === "manual") {
        skipped++;
        continue;
      }

      // Cancella pulizia collegata tramite cleaningId sulla booking
      if (data.cleaningId && !deletedCleaningIds.has(data.cleaningId)) {
        try {
          const cleaningSnap = await adminDb.collection("cleanings").doc(data.cleaningId).get();
          if (cleaningSnap.exists) {
            const cleaning = cleaningSnap.data() as Record<string, any>;
            if (!["COMPLETED", "IN_PROGRESS"].includes(cleaning.status)) {
              cancelledOrders += await cancelLinenOrders(data.cleaningId);
              await adminDb.collection("cleanings").doc(data.cleaningId).delete();
              deletedCleaningIds.add(data.cleaningId);
              deletedCleanings++;
            }
          }
        } catch {}
      }

      // 🔥 Cerca pulizia anche per bookingId (match sulla pulizia)
      const byBookingId = allCleanings.find(c =>
        c.bookingId === doc.id &&
        !["COMPLETED", "IN_PROGRESS"].includes(c.status) &&
        !deletedCleaningIds.has(c.id)
      );
      if (byBookingId) {
        cancelledOrders += await cancelLinenOrders(byBookingId.id);
        await adminDb.collection("cleanings").doc(byBookingId.id).delete();
        deletedCleaningIds.add(byBookingId.id);
        deletedCleanings++;
      }

      // 🔥 Cerca pulizia per data checkout + bookingSource (come fa la sync)
      if (checkOut) {
        const byDate = allCleanings.find(c => {
          if (deletedCleaningIds.has(c.id)) return false;
          if (["COMPLETED", "IN_PROGRESS"].includes(c.status)) return false;
          const d = c.scheduledDate?.toDate?.();
          return d && isSameDay(d, checkOut);
        });
        if (byDate) {
          cancelledOrders += await cancelLinenOrders(byDate.id);
          await adminDb.collection("cleanings").doc(byDate.id).delete();
          deletedCleaningIds.add(byDate.id);
          deletedCleanings++;
        }
      }

      await doc.ref.delete();
      deletedBookings++;
    }

    // 🔥 STEP 2: Cancella pulizie orfane rimaste con questo bookingSource (future, non completate)
    for (const cleaning of allCleanings) {
      if (deletedCleaningIds.has(cleaning.id)) continue;
      if (["COMPLETED", "IN_PROGRESS"].includes(cleaning.status)) continue;
      if (cleaning.isManual === true) continue;

      const cleaningDate = cleaning.scheduledDate?.toDate?.();
      if (!cleaningDate || cleaningDate < now) continue;

      // Pulizia futura con questo bookingSource → cancella
      cancelledOrders += await cancelLinenOrders(cleaning.id);
      await adminDb.collection("cleanings").doc(cleaning.id).delete();
      deletedCleaningIds.add(cleaning.id);
      deletedCleanings++;
    }

    return NextResponse.json({
      success: true,
      deleted: deletedBookings,
      deletedCleanings,
      cancelledOrders,
      skipped,
    });

  } catch (error: any) {
    console.error("Errore delete-by-source:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Cancella/annulla tutti gli ordini biancheria collegati a una pulizia
 */
async function cancelLinenOrders(cleaningId: string): Promise<number> {
  let cancelled = 0;
  try {
    const ordersSnap = await adminDb.collection("orders")
      .where("cleaningId", "==", cleaningId)
      .get();

    for (const oDoc of ordersSnap.docs) {
      const oData = oDoc.data() as Record<string, any>;
      if (["IN_TRANSIT", "DELIVERED", "COMPLETED", "CANCELLED"].includes(oData.status)) continue;
      await adminDb.collection("orders").doc(oDoc.id).update({
        status: "CANCELLED",
        cancelReason: "Link iCal rimosso - pulizia eliminata",
        cancelledAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      cancelled++;
    }
  } catch (err) {
    console.error(`⚠️ Errore cancellazione ordini per cleaning ${cleaningId}:`, err);
  }
  return cancelled;
}
