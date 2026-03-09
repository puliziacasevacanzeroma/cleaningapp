import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// GET - Lista richieste prodotti
// ═══════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const status     = searchParams.get("status");

    let q: FirebaseFirestore.Query = adminDb
      .collection("productRequests")
      .orderBy("createdAt", "desc");

    if (propertyId) {
      q = adminDb
        .collection("productRequests")
        .where("propertyId", "==", propertyId)
        .orderBy("createdAt", "desc");
    }

    const snapshot = await q.get();
    let requests = snapshot.docs.map(d => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
      createdAt:   (d.data() as Record<string, any>).createdAt?.toDate?.()?.toISOString()   ?? null,
      updatedAt:   (d.data() as Record<string, any>).updatedAt?.toDate?.()?.toISOString()   ?? null,
      fulfilledAt: (d.data() as Record<string, any>).fulfilledAt?.toDate?.()?.toISOString() ?? null,
    }));

    if (status) requests = requests.filter((r: any) => r.status === status);

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Errore GET productRequests:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST - Crea richiesta prodotti e la collega SUBITO all'ordine
//        della prossima pulizia (creandolo se non esiste).
//
// FLUSSO:
//  1. Salva productRequest con status "pending"
//  2. Cerca la prossima pulizia futura per questa proprietà
//  3. Cerca se esiste già un ordine per quella pulizia
//     a) Esiste → aggiunge i prodotti all'ordine (merge, evita duplicati)
//     b) Non esiste → crea un nuovo ordine con solo i prodotti
//  4. Segna la richiesta come "fulfilled" con ref all'ordine
//  5. Notifica admin + rider
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const body = await validateBody(req, GenericBodySchema);
    if (body instanceof Response) return body;

    const {
      propertyId,
      propertyName,
      propertyAddress,
      cleaningId,
      items,
      notes,
    } = body as {
      propertyId?:      string;
      propertyName?:    string;
      propertyAddress?: string;
      cleaningId?:      string;
      items?:           Array<{ itemId?: string; id?: string; name?: string; quantity?: number }>;
      notes?:           string;
    };

    if (!propertyId || !cleaningId || !items || items.length === 0) {
      return NextResponse.json({
        error: "Dati mancanti: propertyId, cleaningId e items sono obbligatori",
      }, { status: 400 });
    }

    const now = Timestamp.now();

    // Normalizza items con type e categoryId espliciti
    const productItems = items.map(item => ({
      id:         item.itemId ?? item.id ?? item.name ?? "",
      itemId:     item.itemId ?? item.id ?? item.name ?? "",
      name:       item.name ?? "Prodotto",
      quantity:   item.quantity ?? 1,
      type:       "cleaning_product" as const,
      categoryId: "prodotti_pulizia" as const,
    }));

    // ─── 1. SALVA RICHIESTA ──────────────────────────────────────
    const docRef = await adminDb.collection("productRequests").add({
      propertyId,
      propertyName:    propertyName  ?? "Proprietà",
      propertyAddress: propertyAddress ?? "",
      cleaningId,
      requestedBy:     user.id,
      requestedByName: user.name ?? user.email ?? "Operatore",
      items:           productItems,
      notes:           notes ?? "",
      status:          "pending",
      createdAt:       now,
      updatedAt:       now,
    });

    console.log(`🧴 Richiesta prodotti ${docRef.id} per "${propertyName}"`);

    // ─── 2. CERCA PROSSIMA PULIZIA ───────────────────────────────
    // Usa la pulizia corrente come riferimento temporale minimo
    let nextCleaningId: string | null = null;
    let nextCleaningDate = "alla prossima pulizia";
    let nextCleaningScheduledDate: FirebaseFirestore.Timestamp | null = null;

    try {
      const currentCleaningSnap = await adminDb
        .collection("cleanings")
        .doc(cleaningId)
        .get();
      const currentScheduledDate = currentCleaningSnap.exists
        ? (currentCleaningSnap.data() as Record<string, any>).scheduledDate ?? now
        : now;

      const nextSnap = await adminDb
        .collection("cleanings")
        .where("propertyId", "==", propertyId)
        .where("scheduledDate", ">=", currentScheduledDate)
        .where("status", "in", ["ASSIGNED", "PENDING", "SCHEDULED", "assigned", "pending", "scheduled"])
        .orderBy("scheduledDate", "asc")
        .limit(5)
        .get();

      // Scegli la prima pulizia che NON è quella corrente
      for (const snap of nextSnap.docs) {
        if (snap.id !== cleaningId) {
          nextCleaningId = snap.id;
          const d = snap.data() as Record<string, any>;
          nextCleaningScheduledDate = d.scheduledDate ?? null;
          const dateObj: Date | undefined = d.scheduledDate?.toDate?.();
          if (dateObj) nextCleaningDate = dateObj.toLocaleDateString("it-IT");
          break;
        }
      }
    } catch (e) {
      console.error("Errore ricerca prossima pulizia:", e);
    }

    // ─── 3. COLLEGA ALL'ORDINE ──────────────────────────────────
    let linkedOrderId: string | null = null;

    if (nextCleaningId) {
      try {
        // 3a. Cerca ordine esistente per quella pulizia
        const existingOrdersSnap = await adminDb
          .collection("orders")
          .where("cleaningId", "==", nextCleaningId)
          .get();

        if (!existingOrdersSnap.empty) {
          // ── Ordine già esiste → merge prodotti ──────────────────
          const existingDoc = existingOrdersSnap.docs[0];
          const existingData = existingDoc.data() as Record<string, any>;
          const existingItems: any[] = existingData.items ?? [];

          // Rimuovi prodotti già aggiunti da richieste precedenti, poi riaggiungi freschi
          const filteredItems = existingItems.filter(
            (i: any) => i.type !== "cleaning_product"
          );
          const mergedItems = [...filteredItems, ...productItems];

          // Aggiorna anche cleaningProducts separato per le notifiche
          const existingCleaningProducts: any[] = (existingData.cleaningProducts ?? []).filter(
            (i: any) => i.categoryId === "prodotti_pulizia"
          );
          // Merge per itemId
          const productMap = new Map<string, any>();
          for (const p of existingCleaningProducts) productMap.set(p.itemId ?? p.id, p);
          for (const p of productItems) productMap.set(p.itemId ?? p.id, p);
          const mergedCleaningProducts = Array.from(productMap.values());

          await adminDb.collection("orders").doc(existingDoc.id).update({
            items:               mergedItems,
            cleaningProducts:    mergedCleaningProducts,
            hasCleaningProducts: true,
            productRequestIds:   [
              ...(existingData.productRequestIds ?? []),
              docRef.id,
            ],
            updatedAt: now,
          });

          linkedOrderId = existingDoc.id;
          console.log(`🧴 Prodotti aggiunti a ordine esistente ${linkedOrderId}`);

        } else {
          // ── Nessun ordine → crea ordine PRODUCTS-ONLY ──────────
          // Carica dati proprietà per l'ordine
          let propAddress = propertyAddress ?? "";
          let propCity = "";
          let propPostalCode = "";
          let propFloor = "";
          try {
            const propDoc = await adminDb.collection("properties").doc(propertyId).get();
            if (propDoc.exists) {
              const pd = propDoc.data() as Record<string, any>;
              propAddress    = pd.address      ?? propAddress;
              propCity       = pd.city         ?? "";
              propPostalCode = pd.postalCode   ?? "";
              propFloor      = pd.floor        ?? "";
            }
          } catch { /* non critico */ }

          const newOrderRef = await adminDb.collection("orders").add({
            propertyId,
            propertyName:     propertyName    ?? "Proprietà",
            propertyAddress:  propAddress,
            propertyCity:     propCity,
            propertyPostalCode: propPostalCode,
            propertyFloor:    propFloor,
            cleaningId:       nextCleaningId,
            type:             "PRODUCTS",
            status:           "PENDING",
            scheduledDate:    nextCleaningScheduledDate,
            items:            productItems,
            linenItems:       [],
            cleaningProducts: productItems,
            productRequestIds: [docRef.id],
            hasCleaningProducts: true,
            isProductsOnly:   true,
            autoGenerated:    true,
            createdAt:        now,
            updatedAt:        now,
          });

          linkedOrderId = newOrderRef.id;
          console.log(`🧴 Nuovo ordine prodotti ${linkedOrderId} per pulizia ${nextCleaningId}`);
        }

        // ── Segna richiesta come fulfilled ─────────────────────
        await adminDb.collection("productRequests").doc(docRef.id).update({
          status:               "fulfilled",
          fulfilledAt:          now,
          fulfilledInOrderId:   linkedOrderId,
          fulfilledInCleaningId: nextCleaningId,
          updatedAt:            now,
        });

      } catch (orderError) {
        console.error("Errore collegamento ordine:", orderError);
        // La richiesta rimane "pending" — la /start la raccoglierà
      }
    }

    // ─── 4. NOTIFICHE ────────────────────────────────────────────
    await createNotification({
      title:   "🧴 Richiesta Prodotti Pulizia",
      message: linkedOrderId
        ? `${user.name ?? "Operatore"} ha richiesto ${productItems.length} prodotti per "${propertyName ?? ""}". Aggiunti all'ordine del ${nextCleaningDate}.`
        : `${user.name ?? "Operatore"} ha richiesto ${productItems.length} prodotti per "${propertyName ?? ""}". Verranno consegnati ${nextCleaningDate}.`,
      type:    "PRODUCT_REQUEST",
      recipientRole:     "ADMIN",
      senderId:          user.id,
      senderName:        user.name ?? user.email,
      relatedEntityId:   docRef.id,
      relatedEntityType: "PRODUCT_REQUEST",
      relatedEntityName: propertyName,
      link: linkedOrderId ? `/dashboard/ordini/${linkedOrderId}` : `/dashboard/ordini`,
    });

    // Notifica riders se c'è un ordine collegato
    if (linkedOrderId) {
      try {
        const ridersSnap = await adminDb
          .collection("users")
          .where("role", "==", "RIDER")
          .get();
        for (const riderDoc of ridersSnap.docs) {
          await createNotification({
            title:   "🧴 Prodotti aggiunti a un ordine",
            message: `Prodotti pulizia per "${propertyName ?? ""}" aggiunti all'ordine del ${nextCleaningDate}`,
            type:    "PRODUCT_REQUEST",
            recipientRole: "RIDER",
            recipientId:   riderDoc.id,
            senderId:      user.id,
            senderName:    user.name ?? user.email,
            relatedEntityId:   linkedOrderId,
            relatedEntityType: "ORDER",
            relatedEntityName: propertyName,
            link: `/rider`,
          });
        }
      } catch { /* non critico */ }
    }

    return NextResponse.json({
      success: true,
      id:          docRef.id,
      linkedOrderId,
      message: linkedOrderId
        ? `Richiesta creata e collegata all'ordine del ${nextCleaningDate}.`
        : `Richiesta salvata. Sarà inclusa alla prossima pulizia.`,
    });

  } catch (error) {
    console.error("Errore POST productRequests:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
