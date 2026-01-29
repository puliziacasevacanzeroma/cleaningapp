import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { deletePropertyWithCascade } from "~/lib/firebase/firestore-data";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const docSnap = await getDoc(doc(db, "properties", id));
    
    if (!docSnap.exists()) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    // Verifica che il proprietario sia il proprietario di questa proprietà
    const propertyData = docSnap.data();
    if (propertyData.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    
    return NextResponse.json({ id: docSnap.id, ...propertyData });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    
    // Verifica proprietà
    const docSnap = await getDoc(doc(db, "properties", id));
    if (!docSnap.exists()) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    const propertyData = docSnap.data();
    if (propertyData.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    
    const data = await req.json();
    
    // 🛡️ PROTEZIONE CRITICA: Non sovrascrivere i link iCal con stringhe vuote
    const protectedFields = ['icalAirbnb', 'icalBooking', 'icalOktorate', 'icalInreception', 'icalKrossbooking'];
    const filteredData = { ...data };
    for (const field of protectedFields) {
      if (field in filteredData && filteredData[field] === '') {
        delete filteredData[field];
        console.log(`🛡️ Protezione iCal: ignorato tentativo di svuotare ${field}`);
      }
    }
    
    await updateDoc(doc(db, "properties", id), { ...filteredData, updatedAt: new Date() });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// 🔥 DELETE con CASCATA - elimina anche pulizie, ordini, prenotazioni
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    
    // Verifica proprietà
    const docSnap = await getDoc(doc(db, "properties", id));
    if (!docSnap.exists()) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    
    const propertyData = docSnap.data();
    if (propertyData.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    
    // 🔥 USA ELIMINAZIONE A CASCATA
    const result = await deletePropertyWithCascade(id);
    
    console.log(`✅ Proprietà ${propertyData.name} eliminata con cascata da proprietario ${user.email}:`, result);
    
    return NextResponse.json({ 
      success: true,
      deleted: {
        property: propertyData.name,
        cleanings: result.deletedCleanings,
        orders: result.deletedOrders,
        bookings: result.deletedBookings,
        notifications: result.deletedNotifications
      }
    });
  } catch (error) {
    console.error("Errore DELETE property proprietario:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
