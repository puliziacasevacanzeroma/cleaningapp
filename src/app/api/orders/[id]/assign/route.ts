import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { notifyOrderAssigned } from "~/lib/firebase/statusNotifications";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, AssignRiderSchema } from "~/lib/validation/schemas";
import {
  checkPlannedAvailability,
  forceShiftOnException,
  dateKeyFromScheduled,
} from "~/lib/shifts/plannedAvailability";

interface Params {
  params: Promise<{ id: string }>;
}

// POST - Assegna rider a un ordine
export async function POST(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const body = await validateBody(request, AssignRiderSchema);
    if (body instanceof Response) return body;
    const { riderId, riderName, force, forceReason } = body;
    const currentUser = await getApiUser();

    if (!riderId) {
      return NextResponse.json(
        { error: "riderId è richiesto" },
        { status: 400 }
      );
    }

    const orderRef = adminDb.collection("orders").doc(id);
    
    // Ottieni i dati dell'ordine per la notifica
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }
    const orderData = orderSnap.data() ?? null;

    // ─── CHECK TURNO PIANIFICATO (pagina Turni) ───
    // Se il rider non è in turno il giorno della consegna: 409 SHIFT_UNAVAILABLE.
    // Con force=true si procede e si crea l'eccezione "ON" (urgenza) + notifica.
    const shiftDateKey = dateKeyFromScheduled(orderData?.scheduledDate);
    if (shiftDateKey) {
      const avail = await checkPlannedAvailability(riderId, shiftDateKey);
      if (!avail.available) {
        const displayName = riderName || "Il rider";
        if (!force) {
          const dateLabel = new Date(shiftDateKey + "T12:00:00Z").toLocaleDateString("it-IT", {
            timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long",
          });
          return NextResponse.json({
            error: `${displayName} non è in turno ${dateLabel}`,
            code: "SHIFT_UNAVAILABLE",
            conflicts: [{ userId: riderId, userName: displayName, dateKey: shiftDateKey }],
          }, { status: 409 });
        }
        await forceShiftOnException({
          userId: riderId,
          userName: displayName,
          userRole: "RIDER",
          dateKey: shiftDateKey,
          createdBy: {
            id: currentUser?.id || "system",
            name: currentUser?.name || "Admin",
          },
          reason: forceReason,
          contextLabel: orderData?.propertyName,
        });
      }
    }
        
    await orderRef.update({
      riderId,
      riderName: riderName || null,
      status: "ASSIGNED",
      assignedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Invia notifica automatica
    try {
      await notifyOrderAssigned(
        id,
        orderData?.propertyName || 'Proprietà',
        riderId,
        riderName || 'Rider',
        currentUser?.id || 'system',
        currentUser?.name || 'Sistema'
      );
    } catch (notifyError) {
      console.error("Errore invio notifica:", notifyError);
      // Non bloccare l'operazione se la notifica fallisce
    }

    return NextResponse.json({ 
      success: true, 
      message: "Rider assegnato con successo",
      orderId: id,
      riderId,
      riderName
    });
  } catch (error) {
    console.error("Errore assegnazione rider:", error);
    return NextResponse.json(
      { error: "Errore durante l'assegnazione del rider" },
      { status: 500 }
    );
  }
}

// DELETE - Rimuovi rider da un ordine
export async function DELETE(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    const orderRef = adminDb.collection("orders").doc(id);
    
    await orderRef.update({
      riderId: null,
      riderName: null,
      status: "PENDING",
      assignedAt: null,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ 
      success: true, 
      message: "Rider rimosso con successo",
      orderId: id
    });
  } catch (error) {
    console.error("Errore rimozione rider:", error);
    return NextResponse.json(
      { error: "Errore durante la rimozione del rider" },
      { status: 500 }
    );
  }
}
