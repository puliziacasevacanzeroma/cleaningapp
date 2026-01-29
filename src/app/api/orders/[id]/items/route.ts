import { NextRequest, NextResponse } from "next/server";
import { db } from "~/lib/firebase/config";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";

// PATCH - Aggiorna gli items di un ordine
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { items } = await request.json();
    const orderId = params.id;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Items array richiesto" },
        { status: 400 }
      );
    }

    // Verifica che l'ordine esista
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      return NextResponse.json(
        { error: "Ordine non trovato" },
        { status: 404 }
      );
    }

    const orderData = orderSnap.data();

    // Non permettere modifica se già consegnato
    if (orderData.status === "DELIVERED" || orderData.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Non puoi modificare un ordine già consegnato" },
        { status: 400 }
      );
    }

    // Filtra items con quantity > 0
    const validItems = items.filter((item: any) => item.quantity > 0);

    // Aggiorna l'ordine
    await updateDoc(orderRef, {
      items: validItems,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ 
      success: true, 
      message: "Items aggiornati",
      itemsCount: validItems.length 
    });
  } catch (error) {
    console.error("Errore aggiornamento items:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
