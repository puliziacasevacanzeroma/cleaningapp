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

    // Verifica permessi (admin o proprietario) - case insensitive
    const isAdmin = currentUser.role?.toUpperCase() === "ADMIN";
    const isOwner = property.ownerId === currentUser.id;
    
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // 🔥 FIX: Detecta cambiamenti ai link iCal e resetta feedHashes
    const icalFields = ['icalAirbnb', 'icalBooking', 'icalOktorate', 'icalInreception', 'icalKrossbooking'];
    const icalSourceMap: Record<string, string> = {
      'icalAirbnb': 'airbnb',
      'icalBooking': 'booking',
      'icalOktorate': 'oktorate',
      'icalInreception': 'inreception',
      'icalKrossbooking': 'krossbooking',
    };
    
    const changedSources: string[] = [];
    for (const field of icalFields) {
      if (field in body) {
        const oldValue = (property as any)[field] || '';
        const newValue = body[field] || '';
        if (oldValue !== newValue) {
          changedSources.push(icalSourceMap[field]);
          console.log(`🔄 iCal ${field} cambiato: "${oldValue.substring(0, 30)}..." → "${newValue.substring(0, 30)}..."`);
        }
      }
    }
    
    // Se ci sono cambiamenti ai link iCal, resetta i feedHashes per quelle fonti
    if (changedSources.length > 0) {
      const currentHashes = (property as any).feedHashes || {};
      const newHashes = { ...currentHashes };
      
      for (const source of changedSources) {
        delete newHashes[source];
        console.log(`🗑️ Reset feedHash per: ${source}`);
      }
      
      body.feedHashes = newHashes;
      console.log(`✅ feedHashes resettati per: ${changedSources.join(', ')}`);
    }

    await updateProperty(id, body);

    return NextResponse.json({ 
      success: true,
      feedHashesReset: changedSources.length > 0 ? changedSources : undefined
    });
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

    // Verifica permessi (admin o proprietario) - case insensitive
    const isAdmin = currentUser.role?.toUpperCase() === "ADMIN";
    const isOwner = property.ownerId === currentUser.id;
    
    console.log("🗑️ DELETE richiesto - user:", currentUser.id, "role:", currentUser.role, "isAdmin:", isAdmin, "isOwner:", isOwner);
    
    if (!isAdmin && !isOwner) {
      console.log("❌ DELETE negato");
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
