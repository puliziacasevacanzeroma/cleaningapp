import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// GET - Ottieni info pulizia
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
    const docRef = adminDb.collection("cleanings").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const data = docSnap.data() as Record<string, any>;
    
    return NextResponse.json({
      success: true,
      cleaning: {
        id: docSnap.id,
        propertyName: data.propertyName,
        scheduledDate: data.scheduledDate?.toDate?.(),
        originalPrice: data.cleaningPrice || 0,
        currentPrice: data.priceOverride ?? data.cleaningPrice ?? 0,
        hasOverride: data.priceOverride !== undefined && data.priceOverride !== null,
        overrideReason: data.priceOverrideReason,
        overrideAt: data.priceOverrideAt?.toDate?.(),
      },
    });
  } catch (error) {
    console.error("Errore GET cleaning price:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modifica prezzo pulizia
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
    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { newPrice, reason, reset } = body;

    const docRef = adminDb.collection("cleanings").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    // Reset al prezzo originale
    if (reset) {
      await docRef.update({
        priceOverride: null,
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
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{} | null' is not assignable to parameter of type 'string'.
      priceOverride: parseFloat(newPrice),
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
    console.error("Errore PATCH cleaning price:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
