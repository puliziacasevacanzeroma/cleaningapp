import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyAuth } from "@/lib/firebase/api-auth";
import { FieldValue } from "firebase-admin/firestore";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request);
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id: orderId } = await params;
    const body = await request.json();
    const { itemId, quantity, unitPrice, reason } = body;

    if (!itemId || quantity === undefined || unitPrice === undefined) {
      return NextResponse.json(
        { error: "itemId, quantity e unitPrice sono obbligatori" },
        { status: 400 }
      );
    }

    // Carica l'ordine
    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return NextResponse.json(
        { error: "Ordine non trovato" },
        { status: 404 }
      );
    }

    const orderData = orderDoc.data();
    const items = orderData?.items || [];

    // Trova e aggiorna l'item
    let found = false;
    const updatedItems = items.map((item: any) => {
      if (item.id === itemId) {
        found = true;
        return {
          ...item,
          quantity: quantity,
          priceOverride: unitPrice,
          priceOverrideReason: reason || "Modifica manuale",
          priceOverrideAt: new Date().toISOString(),
          priceOverrideBy: user.uid,
        };
      }
      return item;
    });

    if (!found) {
      return NextResponse.json(
        { error: "Item non trovato nell'ordine" },
        { status: 404 }
      );
    }

    // Salva
    await orderRef.update({
      items: updatedItems,
      updatedAt: FieldValue.serverTimestamp(),
      lastModifiedBy: user.uid,
    });

    console.log(`✏️ Item ${itemId} modificato nell'ordine ${orderId}`);

    return NextResponse.json({
      success: true,
      message: "Item aggiornato",
    });
  } catch (error) {
    console.error("Errore aggiornamento item:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
