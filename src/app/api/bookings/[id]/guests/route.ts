import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

// Controlla se la modifica ospiti è ancora permessa (entro mezzanotte del giorno del checkout)
function canModifyGuests(checkoutDate: Date): { allowed: boolean; reason?: string } {
  const now = new Date();
  
  // Calcola mezzanotte del giorno del checkout
  const midnightCheckout = new Date(checkoutDate);
  midnightCheckout.setHours(0, 0, 0, 0);
  
  // Se siamo già al giorno del checkout o dopo, blocca
  if (now >= midnightCheckout) {
    return { 
      allowed: false, 
      reason: "Il termine per modificare il numero ospiti è scaduto (mezzanotte del giorno del check-out)" 
    };
  }
  
  return { allowed: true };
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const { adults, children, infants } = await req.json();
    
    await updateDoc(doc(db, "bookings", id), { 
      adults: adults || 0,
      children: children || 0,
      infants: infants || 0,
      updatedAt: new Date()
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore aggiornamento ospiti:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Usato da GuestCountForm del proprietario con blocco temporale
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const { guestsCount } = await req.json();
    
    if (!guestsCount || guestsCount < 1) {
      return NextResponse.json({ error: "Numero ospiti non valido" }, { status: 400 });
    }
    
    // Carica la prenotazione per verificare la data checkout
    const bookingRef = doc(db, "bookings", id);
    const bookingSnap = await getDoc(bookingRef);
    
    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: "Prenotazione non trovata" }, { status: 404 });
    }
    
    const bookingData = bookingSnap.data();
    
    // Verifica se l'utente può modificare (è proprietario della proprietà)
    if (user.role !== "ADMIN") {
      const propertyRef = doc(db, "properties", bookingData.propertyId);
      const propertySnap = await getDoc(propertyRef);
      if (!propertySnap.exists() || propertySnap.data().ownerId !== user.uid) {
        return NextResponse.json({ error: "Non autorizzato a modificare questa prenotazione" }, { status: 403 });
      }
    }
    
    // Calcola la data di checkout
    let checkoutDate: Date;
    if (bookingData.checkOut) {
      checkoutDate = bookingData.checkOut.toDate ? bookingData.checkOut.toDate() : new Date(bookingData.checkOut);
    } else if (bookingData.endDate) {
      checkoutDate = bookingData.endDate.toDate ? bookingData.endDate.toDate() : new Date(bookingData.endDate);
    } else {
      return NextResponse.json({ error: "Data checkout non trovata" }, { status: 400 });
    }
    
    // Verifica blocco temporale (solo per non-admin)
    if (user.role !== "ADMIN") {
      const canModify = canModifyGuests(checkoutDate);
      if (!canModify.allowed) {
        return NextResponse.json({ error: canModify.reason }, { status: 403 });
      }
    }
    
    // Aggiorna la prenotazione
    await updateDoc(bookingRef, { 
      guests: guestsCount,
      guestsCount: guestsCount,
      guestsConfirmed: true,
      guestsConfirmedAt: new Date(),
      updatedAt: new Date()
    });
    
    // Aggiorna anche la pulizia associata se esiste
    const cleaningsQuery = query(
      collection(db, "cleanings"),
      where("bookingId", "==", id)
    );
    const cleaningsSnap = await getDocs(cleaningsQuery);
    
    for (const cleaningDoc of cleaningsSnap.docs) {
      await updateDoc(doc(db, "cleanings", cleaningDoc.id), {
        guestsCount: guestsCount,
        updatedAt: new Date()
      });
      console.log(`📋 Aggiornata pulizia ${cleaningDoc.id} con ${guestsCount} ospiti`);
    }
    
    return NextResponse.json({ 
      success: true, 
      guestsCount,
      cleaningsUpdated: cleaningsSnap.size
    });
  } catch (error) {
    console.error("Errore aggiornamento ospiti:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// GET - Verifica se la modifica è ancora permessa
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    
    const bookingRef = doc(db, "bookings", id);
    const bookingSnap = await getDoc(bookingRef);
    
    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: "Prenotazione non trovata" }, { status: 404 });
    }
    
    const bookingData = bookingSnap.data();
    
    // Calcola la data di checkout
    let checkoutDate: Date;
    if (bookingData.checkOut) {
      checkoutDate = bookingData.checkOut.toDate ? bookingData.checkOut.toDate() : new Date(bookingData.checkOut);
    } else if (bookingData.endDate) {
      checkoutDate = bookingData.endDate.toDate ? bookingData.endDate.toDate() : new Date(bookingData.endDate);
    } else {
      return NextResponse.json({ canModify: false, reason: "Data checkout non trovata" });
    }
    
    // Admin può sempre modificare
    if (user.role === "ADMIN") {
      return NextResponse.json({ canModify: true });
    }
    
    const canModify = canModifyGuests(checkoutDate);
    return NextResponse.json({ 
      canModify: canModify.allowed, 
      reason: canModify.reason,
      checkoutDate: checkoutDate.toISOString()
    });
  } catch (error) {
    console.error("Errore verifica modifica ospiti:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}