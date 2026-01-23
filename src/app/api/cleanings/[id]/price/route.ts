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

// GET - Ottieni info pulizia
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
    const docRef = doc(db, "cleanings", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const data = docSnap.data();
    
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
  const currentUser = await getFirebaseUser();
  
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { newPrice, reason, reset } = body;

    const docRef = doc(db, "cleanings", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    // Reset al prezzo originale
    if (reset) {
      await updateDoc(docRef, {
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

    await updateDoc(docRef, {
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
