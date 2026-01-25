import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, addDoc, getDocs, query, where, Timestamp, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNotification } from "~/lib/firebase/notifications";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// GET - Lista richieste prodotti
// ═══════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const status = searchParams.get("status");

    let q = query(
      collection(db, "productRequests"),
      orderBy("createdAt", "desc")
    );

    // Se specificato propertyId, filtra
    if (propertyId) {
      q = query(
        collection(db, "productRequests"),
        where("propertyId", "==", propertyId),
        orderBy("createdAt", "desc")
      );
    }

    const snapshot = await getDocs(q);
    let requests = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
      fulfilledAt: doc.data().fulfilledAt?.toDate?.()?.toISOString() || null,
    }));

    // Filtro status lato client (Firestore non permette orderBy + where su campi diversi senza indice)
    if (status) {
      requests = requests.filter(r => r.status === status);
    }

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Errore GET productRequests:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST - Crea nuova richiesta prodotti
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await req.json();
    const { propertyId, propertyName, propertyAddress, cleaningId, items, notes } = body;

    // Validazione
    if (!propertyId || !cleaningId || !items || items.length === 0) {
      return NextResponse.json({ 
        error: "Dati mancanti: propertyId, cleaningId e items sono obbligatori" 
      }, { status: 400 });
    }

    const now = Timestamp.now();

    // Crea la richiesta
    const docRef = await addDoc(collection(db, "productRequests"), {
      propertyId,
      propertyName: propertyName || "Proprietà",
      propertyAddress: propertyAddress || "",
      cleaningId,
      requestedBy: user.id,
      requestedByName: user.name || user.email || "Operatore",
      items: items.map((item: any) => ({
        itemId: item.itemId || item.id,
        name: item.name,
        quantity: item.quantity || 1,
        categoryId: item.categoryId || "prodotti_pulizia",
      })),
      notes: notes || "",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // Notifica admin
    await createNotification({
      title: "🧴 Richiesta Prodotti Pulizia",
      message: `${user.name || "Operatore"} ha richiesto ${items.length} prodotti per "${propertyName}"`,
      type: "PRODUCT_REQUEST",
      recipientRole: "ADMIN",
      senderId: user.id,
      senderName: user.name || user.email,
      relatedEntityId: docRef.id,
      relatedEntityType: "PRODUCT_REQUEST",
      relatedEntityName: propertyName,
      link: `/dashboard/ordini`,
    });

    console.log(`🧴 Richiesta prodotti creata: ${docRef.id} per ${propertyName}`);

    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      message: `Richiesta creata per ${items.length} prodotti`
    });
  } catch (error) {
    console.error("Errore POST productRequests:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
