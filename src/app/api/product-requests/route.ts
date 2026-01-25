import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  Timestamp, 
  orderBy,
  doc,
  getDoc,
  updateDoc,
  limit
} from "firebase/firestore";
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
    let requests = snapshot.docs.map(docData => ({
      id: docData.id,
      ...docData.data(),
      createdAt: docData.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: docData.data().updatedAt?.toDate?.()?.toISOString() || null,
      fulfilledAt: docData.data().fulfilledAt?.toDate?.()?.toISOString() || null,
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
// POST - Crea nuova richiesta prodotti E associa a ordine rider
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
    const nowDate = now.toDate();

    // Prepara items prodotti
    const productItems = items.map((item: any) => ({
      itemId: item.itemId || item.id,
      name: item.name,
      quantity: item.quantity || 1,
      categoryId: "prodotti_pulizia",
      type: "cleaning_product", // Flag per distinguere da biancheria
    }));

    // ═══════════════════════════════════════════════════════════════
    // 1. CREA RICHIESTA PRODOTTI
    // ═══════════════════════════════════════════════════════════════
    const docRef = await addDoc(collection(db, "productRequests"), {
      propertyId,
      propertyName: propertyName || "Proprietà",
      propertyAddress: propertyAddress || "",
      cleaningId,
      requestedBy: user.id,
      requestedByName: user.name || user.email || "Operatore",
      items: productItems,
      notes: notes || "",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    console.log(`🧴 Richiesta prodotti creata: ${docRef.id} per ${propertyName}`);

    // ═══════════════════════════════════════════════════════════════
    // 2. CERCA PROSSIMO ORDINE BIANCHERIA PER QUESTA PROPRIETÀ
    // ═══════════════════════════════════════════════════════════════
    let linkedOrderId: string | null = null;
    let linkedOrderMessage = "";

    try {
      // Cerca ordini futuri non completati per questa proprietà
      const ordersQuery = query(
        collection(db, "orders"),
        where("propertyId", "==", propertyId),
        where("status", "in", ["PENDING", "ASSIGNED", "pending", "assigned"]),
        orderBy("scheduledDate", "asc"),
        limit(1)
      );

      const ordersSnapshot = await getDocs(ordersQuery);

      if (!ordersSnapshot.empty) {
        // ─── ORDINE ESISTENTE: Aggiungi prodotti ───
        const existingOrder = ordersSnapshot.docs[0];
        const existingOrderData = existingOrder.data();
        
        // Aggiungi prodotti pulizia all'ordine esistente
        const existingItems = existingOrderData.items || [];
        const updatedItems = [
          ...existingItems,
          ...productItems.map((item: any) => ({
            ...item,
            addedFrom: "product_request",
            addedAt: nowDate.toISOString(),
          }))
        ];

        // Aggiorna ordine
        await updateDoc(doc(db, "orders", existingOrder.id), {
          items: updatedItems,
          hasCleaningProducts: true,
          productRequestId: docRef.id,
          updatedAt: now,
          notes: existingOrderData.notes 
            ? `${existingOrderData.notes}\n🧴 Aggiunti ${productItems.length} prodotti pulizia` 
            : `🧴 Aggiunti ${productItems.length} prodotti pulizia`,
        });

        linkedOrderId = existingOrder.id;
        linkedOrderMessage = `Prodotti aggiunti all'ordine esistente (${existingOrderData.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT") || "prossima consegna"})`;
        
        console.log(`📦 Prodotti aggiunti all'ordine esistente: ${existingOrder.id}`);

        // Aggiorna anche la richiesta prodotti con il riferimento all'ordine
        await updateDoc(doc(db, "productRequests", docRef.id), {
          linkedOrderId: existingOrder.id,
          status: "linked_to_order",
          updatedAt: now,
        });

      } else {
        // ─── NESSUN ORDINE: Cerca prossima pulizia per creare ordine ───
        const nextCleaningQuery = query(
          collection(db, "cleanings"),
          where("propertyId", "==", propertyId),
          where("scheduledDate", ">", now),
          where("status", "in", ["ASSIGNED", "PENDING", "assigned", "pending"]),
          orderBy("scheduledDate", "asc"),
          limit(1)
        );

        const nextCleaningSnapshot = await getDocs(nextCleaningQuery);

        if (!nextCleaningSnapshot.empty) {
          const nextCleaning = nextCleaningSnapshot.docs[0];
          const nextCleaningData = nextCleaning.data();

          // Carica dati proprietà
          let propertyData: any = { 
            name: propertyName, 
            address: propertyAddress 
          };
          
          try {
            const propertyDoc = await getDoc(doc(db, "properties", propertyId));
            if (propertyDoc.exists()) {
              propertyData = propertyDoc.data();
            }
          } catch (e) {
            console.error("Errore caricamento proprietà:", e);
          }

          // Crea nuovo ordine con solo prodotti pulizia
          const newOrderRef = await addDoc(collection(db, "orders"), {
            propertyId,
            propertyName: propertyData.name || propertyName,
            propertyAddress: propertyData.address || propertyAddress,
            propertyCity: propertyData.city || "",
            propertyPostalCode: propertyData.postalCode || "",
            propertyFloor: propertyData.floor || "",
            cleaningId: nextCleaning.id,
            scheduledDate: nextCleaningData.scheduledDate,
            items: productItems.map((item: any) => ({
              ...item,
              addedFrom: "product_request",
              addedAt: nowDate.toISOString(),
            })),
            hasCleaningProducts: true,
            isProductsOnly: true, // Flag: ordine solo prodotti
            productRequestId: docRef.id,
            status: "PENDING",
            riderId: null,
            riderName: null,
            notes: `🧴 Ordine prodotti pulizia (creato automaticamente)`,
            createdAt: now,
            updatedAt: now,
          });

          linkedOrderId = newOrderRef.id;
          linkedOrderMessage = `Nuovo ordine creato per ${nextCleaningData.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT") || "prossima pulizia"}`;

          console.log(`📦 Nuovo ordine prodotti creato: ${newOrderRef.id}`);

          // Aggiorna richiesta con riferimento ordine
          await updateDoc(doc(db, "productRequests", docRef.id), {
            linkedOrderId: newOrderRef.id,
            status: "linked_to_order",
            updatedAt: now,
          });

        } else {
          linkedOrderMessage = "Nessuna pulizia futura trovata. I prodotti saranno consegnati alla prossima occasione.";
          console.log(`⚠️ Nessuna pulizia futura per ${propertyName}, prodotti in attesa`);
        }
      }

    } catch (orderError) {
      console.error("Errore associazione ordine:", orderError);
      linkedOrderMessage = "Richiesta creata, associazione ordine in sospeso";
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. NOTIFICA ADMIN
    // ═══════════════════════════════════════════════════════════════
    await createNotification({
      title: "🧴 Richiesta Prodotti Pulizia",
      message: `${user.name || "Operatore"} ha richiesto ${items.length} prodotti per "${propertyName}". ${linkedOrderMessage}`,
      type: "PRODUCT_REQUEST",
      recipientRole: "ADMIN",
      senderId: user.id,
      senderName: user.name || user.email,
      relatedEntityId: docRef.id,
      relatedEntityType: "PRODUCT_REQUEST",
      relatedEntityName: propertyName,
      link: linkedOrderId ? `/dashboard/ordini/${linkedOrderId}` : `/dashboard/ordini`,
    });

    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      linkedOrderId,
      message: `Richiesta creata per ${items.length} prodotti. ${linkedOrderMessage}`
    });

  } catch (error) {
    console.error("Errore POST productRequests:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
