import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, OrderItemsUpdateSchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// PATCH - Aggiorna gli items di un ordine
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getApiUser();
    const _body = await validateBody(request, OrderItemsUpdateSchema);
    if (_body instanceof Response) return _body;
    const { items, forceUpdate } = _body;
    const { id: orderId } = await params;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Items array richiesto" },
        { status: 400 }
      );
    }

    // Verifica che l'ordine esista
    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json(
        { error: "Ordine non trovato" },
        { status: 404 }
      );
    }

    const orderData = orderSnap.data();

    // Se l'ordine è già consegnato, permetti modifica SOLO agli admin
    // (per la sezione pagamenti/contabilità)
    // @ts-expect-error TODO-FIX: TS18048 'orderData' is possibly 'undefined'.
    if (orderData.status === "DELIVERED" || orderData.status === "COMPLETED") {
      if (!currentUser || currentUser.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Solo gli admin possono modificare ordini già consegnati" },
          { status: 403 }
        );
      }
      // Admin può modificare, ma logghiamo
    }

    // Filtra items con quantity > 0
    const validItems = items.filter((item: any) => item.quantity > 0).map((item: any) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      // Mantieni eventuali altri campi esistenti
      ...(item.categoryName && { categoryName: item.categoryName }),
      ...(item.priceOverride !== undefined && { priceOverride: item.priceOverride }),
    }));

    // Ricalcola il totale
    const newTotal = validItems.reduce((sum: number, item: any) => {
      const price = item.priceOverride ?? item.price ?? 0;
      return sum + (price * item.quantity);
    }, 0);

    // Aggiorna l'ordine
    await orderRef.update({
      items: validItems,
      totalPrice: newTotal,
      updatedAt: Timestamp.now(),
      ...(currentUser && { lastModifiedBy: currentUser.id }),
    });

    return NextResponse.json({ 
      success: true, 
      message: "Items aggiornati",
      itemsCount: validItems.length,
      newTotal,
    });
  } catch (error) {
    console.error("Errore aggiornamento items:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
