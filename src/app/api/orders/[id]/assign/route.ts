import { NextRequest, NextResponse } from "next/server";
import { doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface Params {
  params: Promise<{ id: string }>;
}

// POST - Assegna rider a un ordine
export async function POST(request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { riderId, riderName } = body;

    if (!riderId) {
      return NextResponse.json(
        { error: "riderId è richiesto" },
        { status: 400 }
      );
    }

    const orderRef = doc(db, "orders", id);
    
    await updateDoc(orderRef, {
      riderId,
      riderName: riderName || null,
      status: "ASSIGNED",
      assignedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

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
