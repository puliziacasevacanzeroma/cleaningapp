import { NextRequest, NextResponse } from "next/server";
import { doc, updateDoc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { notifyOrderAssigned } from "~/lib/firebase/statusNotifications";
import { cookies } from "next/headers";

interface Params {
  params: Promise<{ id: string }>;
}

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

// POST - Assegna rider a un ordine
export async function POST(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { riderId, riderName } = body;
    const currentUser = await getFirebaseUser();

    if (!riderId) {
      return NextResponse.json(
        { error: "riderId è richiesto" },
        { status: 400 }
      );
    }

    const orderRef = doc(db, "orders", id);
    
    // Ottieni i dati dell'ordine per la notifica
    const orderSnap = await getDoc(orderRef);
    const orderData = orderSnap.exists() ? orderSnap.data() : null;
    
    await updateDoc(orderRef, {
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

    const orderRef = doc(db, "orders", id);
    
    await updateDoc(orderRef, {
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
