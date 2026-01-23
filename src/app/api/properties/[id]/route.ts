import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPropertyById, updateProperty, deletePropertyWithCascade } from "~/lib/firebase/firestore-data";

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

// GET - Ottieni singola proprietà
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getFirebaseUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const property = await getPropertyById(id);

    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    return NextResponse.json({
      ...property,
      createdAt: property.createdAt?.toDate?.() || new Date(),
      updatedAt: property.updatedAt?.toDate?.() || new Date(),
    });
  } catch (error) {
    console.error("Errore GET property:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modifica proprietà
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getFirebaseUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    // Verifica che la proprietà esista
    const property = await getPropertyById(id);
    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // Verifica permessi (admin o proprietario)
    if (currentUser.role !== "ADMIN" && property.ownerId !== currentUser.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    await updateProperty(id, body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore PATCH property:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Elimina proprietà CON CASCATA (pulizie, ordini, prenotazioni)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getFirebaseUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Verifica che la proprietà esista
    const property = await getPropertyById(id);
    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // Verifica permessi (admin o proprietario)
    if (currentUser.role !== "ADMIN" && property.ownerId !== currentUser.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // 🔥 USA ELIMINAZIONE A CASCATA
    // Elimina proprietà + tutte le pulizie, ordini, prenotazioni collegate
    const result = await deletePropertyWithCascade(id);

    console.log(`✅ Proprietà ${property.name} eliminata con cascata:`, result);

    return NextResponse.json({ 
      success: true,
      deleted: {
        property: property.name,
        cleanings: result.deletedCleanings,
        orders: result.deletedOrders,
        bookings: result.deletedBookings,
        notifications: result.deletedNotifications
      }
    });
  } catch (error) {
    console.error("Errore DELETE property:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
