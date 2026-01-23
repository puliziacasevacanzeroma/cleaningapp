import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, updateDoc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

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

// GET - Ottieni info ordine
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getFirebaseUser();
  
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const docRef = doc(db, "orders", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }

    const data = docSnap.data();
    
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
  const currentUser = await getFirebaseUser();
  
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { newPrice, reason, reset } = body;

    const docRef = doc(db, "orders", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }

    // Reset al prezzo originale
    if (reset) {
      await updateDoc(docRef, {
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

    await updateDoc(docRef, {
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
