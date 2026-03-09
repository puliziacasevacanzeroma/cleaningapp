import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * POST /api/properties/[id]/cancel-future
 * Cancella tutte le pulizie e ordini FUTURI di una proprietà disattivata
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  if (!currentUser || currentUser.role?.toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id: propertyId } = await params;
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const nowTimestamp = Timestamp.fromDate(now);

    let deletedCleanings = 0;
    let deletedOrders = 0;

    // 1. Cancella pulizie future (SCHEDULED, ASSIGNED, PENDING_APPROVAL)
    const cleaningsSnapshot = await adminDb.collection("cleanings").where("propertyId", "==", propertyId).where("scheduledDate", ">=", nowTimestamp).get();
    
    const cleaningIds: string[] = [];
    for (const docSnap of cleaningsSnapshot.docs) {
      const data = docSnap.data() as Record<string, any>;
      const status = data.status?.toUpperCase();
      // Non eliminare pulizie già completate o in corso
      if (status !== "COMPLETED" && status !== "IN_PROGRESS") {
        cleaningIds.push(docSnap.id);
        await adminDb.collection("cleanings").doc(docSnap.id).delete();
        deletedCleanings++;
      }
    }

    // 2. Cancella ordini futuri per propertyId
    const ordersSnapshot = await adminDb.collection("orders").where("propertyId", "==", propertyId).where("scheduledDate", ">=", nowTimestamp).get();
    
    for (const docSnap of ordersSnapshot.docs) {
      const data = docSnap.data() as Record<string, any>;
      const status = data.status?.toUpperCase();
      if (status !== "COMPLETED" && status !== "DELIVERED") {
        await adminDb.collection("orders").doc(docSnap.id).delete();
        deletedOrders++;
      }
    }

    // 3. Cancella anche ordini collegati alle pulizie eliminate (per cleaningId)
    if (cleaningIds.length > 0) {
      for (let i = 0; i < cleaningIds.length; i += 30) {
        const chunk = cleaningIds.slice(i, i + 30);
        try {
          const linkedOrders = await adminDb.collection("orders").where("cleaningId", "in", chunk).get();
          for (const docSnap of linkedOrders.docs) {
            const data = docSnap.data() as Record<string, any>;
            const status = data.status?.toUpperCase();
            if (status !== "COMPLETED" && status !== "DELIVERED") {
              try {
                await adminDb.collection("orders").doc(docSnap.id).delete();
                deletedOrders++;
              } catch (e) {
                // Già eliminato, ignora
              }
            }
          }
        } catch (e) {
          console.warn("⚠️ Errore query ordini linked:", e);
        }
      }
    }

    // 4. Cancella prenotazioni future
    let deletedBookings = 0;
    try {
      const bookingsSnapshot = await adminDb.collection("bookings").where("propertyId", "==", propertyId).where("checkIn", ">=", nowTimestamp).get();
      for (const docSnap of bookingsSnapshot.docs) {
        await adminDb.collection("bookings").doc(docSnap.id).delete();
        deletedBookings++;
      }
    } catch (e) {
      console.warn("⚠️ Errore cancellazione prenotazioni future:", e);
    }

    return NextResponse.json({
      success: true,
      deletedCleanings,
      deletedOrders,
      deletedBookings,
    });
  } catch (error) {
    console.error("Errore cancel-future:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
