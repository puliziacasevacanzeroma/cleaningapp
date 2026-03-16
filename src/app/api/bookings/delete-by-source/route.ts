/**
 * POST /api/bookings/delete-by-source
 * Elimina tutte le prenotazioni future di un source specifico per una proprietà.
 * Usato quando si rimuove un link iCal dalla proprietà.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

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

    // Carica prenotazioni future di questo source per questa proprietà
    const bookingsSnap = await adminDb.collection("bookings")
      .where("propertyId", "==", propertyId)
      .where("source", "==", source)
      .get();

    let deleted = 0;
    let skipped = 0;

    for (const doc of bookingsSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const checkOut = data.checkOut?.toDate?.();

      // Non cancellare prenotazioni passate o in corso
      if (!checkOut || checkOut < now) {
        skipped++;
        continue;
      }

      // Non cancellare prenotazioni manuali
      if (data.isManual === true || data.source === "manual") {
        skipped++;
        continue;
      }

      // Cancella la pulizia collegata se esiste e non è completata
      if (data.cleaningId) {
        try {
          const cleaningSnap = await adminDb.collection("cleanings").doc(data.cleaningId).get();
          if (cleaningSnap.exists) {
            const cleaning = cleaningSnap.data() as Record<string, any>;
            if (!["COMPLETED", "IN_PROGRESS"].includes(cleaning.status)) {
              await adminDb.collection("cleanings").doc(data.cleaningId).delete();
            }
          }
        } catch {}
      }

      await doc.ref.delete();
      deleted++;
    }

    return NextResponse.json({ success: true, deleted, skipped });

  } catch (error: any) {
    console.error("Errore delete-by-source:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
