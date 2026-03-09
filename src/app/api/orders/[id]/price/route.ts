import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, OrderPriceSchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// GET - Ottieni info ordine
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const docRef = adminDb.collection("orders").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }

    const data = docSnap.data() as Record<string, any>;
    
    return NextResponse.json({
      success: true,
      order: {
        id: docSnap.id,
        propertyName: data.propertyName,
        deliveryDate: data.deliveryDate?.toDate?.() || data.createdAt?.toDate?.(),
        originalPrice: data.totalPrice || 0,
        currentPrice: data.totalPriceOverride ?? data.totalPrice ?? 0,
        hasOverride: data.totalPriceOverride !== undefined && data.totalPriceOverride !== null,
        overrideReason: data.priceOverrideReason,
        overrideAt: data.priceOverrideAt?.toDate?.(),
        items: data.items || [],
      },
    });
  } catch (error) {
    console.error("Errore GET order price:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modifica prezzo ordine
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await validateBody(request, OrderPriceSchema);
    if (body instanceof Response) return body;
    const { newPrice, reason, reset } = body;

    const docRef = adminDb.collection("orders").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }

    // Reset al prezzo originale
    if (reset) {
      await docRef.update({
        totalPriceOverride: null,
        priceOverrideReason: null,
        priceOverrideAt: null,
        priceOverrideBy: null,
        updatedAt: Timestamp.now(),
      });

      return NextResponse.json({
        success: true,
        message: "Prezzo ripristinato al valore originale",
      });
    }

    // Modifica prezzo
    if (newPrice === undefined || !reason) {
      return NextResponse.json({ 
        error: "Nuovo prezzo e motivo sono obbligatori" 
      }, { status: 400 });
    }

    await docRef.update({
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'number' is not assignable to parameter of type 'string'.
      totalPriceOverride: parseFloat(newPrice),
      priceOverrideReason: reason,
      priceOverrideAt: Timestamp.now(),
      priceOverrideBy: currentUser.id,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: `Prezzo modificato a €${newPrice}`,
    });
  } catch (error) {
    console.error("Errore PATCH order price:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
