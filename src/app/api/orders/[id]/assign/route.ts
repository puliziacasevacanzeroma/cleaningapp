import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { notifyOrderAssigned } from "~/lib/firebase/statusNotifications";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, AssignRiderSchema } from "~/lib/validation/schemas";

interface Params {
  params: Promise<{ id: string }>;
}

// POST - Assegna rider a un ordine
export async function POST(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const body = await validateBody(request, AssignRiderSchema);
    if (body instanceof Response) return body;
    const { riderId, riderName } = body;
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
    const orderData = orderSnap.exists ? orderSnap.data() : null;
    
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
