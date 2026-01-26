import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, updateDoc, addDoc, collection, Timestamp, query, where, getDocs } from "firebase/firestore";
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    
    // Carica la pulizia
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);
    
    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    const cleaning = cleaningSnap.data();
    
    // ─── VERIFICA STATO ───
    const validStatuses = ["SCHEDULED", "ASSIGNED", "assigned", "pending"];
    if (!validStatuses.includes(cleaning.status)) {
      return NextResponse.json({ 
        error: `Impossibile iniziare: stato attuale "${cleaning.status}"` 
      }, { status: 400 });
    }
    
    // ─── VERIFICA OPERATORE ───
    // L'operatore può iniziare solo se è assegnato a questa pulizia
    const isAdmin = user.role === "ADMIN";
    const isAssignedOperator = 
      cleaning.operatorId === user.id ||
      (cleaning.operators || []).some((op: { id: string }) => op.id === user.id);
    
    if (!isAdmin && !isAssignedOperator) {
      return NextResponse.json({ 
        error: "Non sei assegnato a questa pulizia" 
      }, { status: 403 });
    }
    
    // ─── AGGIORNA PULIZIA ───
    const now = Timestamp.now();
    await updateDoc(cleaningRef, { 
      status: "IN_PROGRESS",
      startedAt: now,
      startedBy: user.id,
      updatedAt: now
    });
    
    // ─── NOTIFICA ADMIN ───
    try {
      const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short"
      }) || "oggi";
      
      await createNotification({
        title: "🧹 Pulizia iniziata",
        message: `${user.name || user.email} ha iniziato la pulizia di "${cleaning.propertyName}" (${dateStr})`,
        type: "CLEANING_STARTED",
        recipientRole: "ADMIN",
        senderId: user.id,
        senderName: user.name || user.email,
        relatedEntityId: id,
        relatedEntityType: "CLEANING",
        relatedEntityName: cleaning.propertyName,
        link: `/dashboard/calendario/pulizie`,
      });
    } catch (notifError) {
      console.error("Errore notifica admin:", notifError);
    }
    
    // ─── NOTIFICA PROPRIETARIO ───
    if (cleaning.ownerId) {
      try {
        await createNotification({
          title: "🧹 Pulizia in corso",
          message: `La pulizia di "${cleaning.propertyName}" è iniziata`,
          type: "CLEANING_STARTED",
          recipientRole: "PROPRIETARIO",
          recipientId: cleaning.ownerId,
          senderId: "system",
          senderName: "Sistema",
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          relatedEntityName: cleaning.propertyName,
          link: `/proprietario/pulizie`,
        });
      } catch (notifError) {
        console.error("Errore notifica proprietario:", notifError);
      }
    }
    
    // ─── NOTIFICA RIDER (pulizia iniziata = consegna imminente) ───
    try {
      // Cerca l'ordine biancheria collegato a questa pulizia
      const ordersRef = collection(db, "orders");
      const ordersQuery = query(ordersRef, where("cleaningId", "==", id));
      const ordersSnap = await getDocs(ordersQuery);
      
      console.log(`🔍 Ordini collegati alla pulizia ${id}: ${ordersSnap.size}`);
      
      if (!ordersSnap.empty) {
        // C'è un ordine biancheria collegato - notifica i rider
        const usersRef = collection(db, "users");
        const ridersQuery = query(usersRef, where("role", "==", "RIDER"));
        const ridersSnap = await getDocs(ridersQuery);
        
        console.log(`🚴 Rider trovati: ${ridersSnap.size}`);
        
        let notifSent = 0;
        for (const riderDoc of ridersSnap.docs) {
          try {
            await createNotification({
              title: "🧹 Pulizia iniziata",
              message: `Pulizia di "${cleaning.propertyName}" in corso - preparati per la consegna`,
              type: "CLEANING_STARTED",
              recipientRole: "RIDER",
              recipientId: riderDoc.id,
              senderId: user.id,
              senderName: user.name || user.email || "Sistema",
              relatedEntityId: id,
              relatedEntityType: "CLEANING",
              relatedEntityName: cleaning.propertyName,
              link: `/rider`,
            });
            notifSent++;
          } catch (e) {
            console.error(`Errore notifica rider ${riderDoc.id}:`, e);
          }
        }
        console.log(`🔔 Notifica pulizia iniziata inviata a ${notifSent} rider`);
      } else {
        console.log(`⚠️ Nessun ordine biancheria collegato alla pulizia ${id} - nessuna notifica rider`);
      }
    } catch (riderNotifError) {
      console.error("Errore notifica rider:", riderNotifError);
    }
    
    // ─── AUTO-GENERA ORDINE BIANCHERIA (se configurato) ───
    let laundryOrderId = null;
    
    if (cleaning.propertyId) {
      try {
        const propertyRef = doc(db, "properties", cleaning.propertyId);
        const propertySnap = await getDoc(propertyRef);
        
        if (propertySnap.exists()) {
          const property = propertySnap.data();
          
          // Controlla se la proprietà ha auto-generazione biancheria attiva
          // e non usa biancheria propria
          if (property.autoGenerateLaundry && !property.usesOwnLinen) {
            // Verifica che non esista già un ordine per questa pulizia
            const existingOrderId = cleaning.laundryOrderId;
            
            if (!existingOrderId) {
              // Crea ordine biancheria automatico
              const linenConfig = property.linenConfig || [];
              
              // 🧴 CONTROLLA RICHIESTE PRODOTTI PENDING PER QUESTA PROPRIETÀ
              let cleaningProductItems: any[] = [];
              let productRequestIds: string[] = [];
              
              try {
                const productRequestsRef = collection(db, "productRequests");
                const pendingRequestsSnapshot = await getDocs(
                  query(
                    productRequestsRef,
                    where("propertyId", "==", cleaning.propertyId),
                    where("status", "==", "pending")
                  )
                );
                
                // Aggrega tutti i prodotti dalle richieste pending
                const productAggregation: Record<string, { itemId: string; name: string; quantity: number }> = {};
                
                pendingRequestsSnapshot.docs.forEach(requestDoc => {
                  const requestData = requestDoc.data();
                  productRequestIds.push(requestDoc.id);
                  
                  (requestData.items || []).forEach((item: any) => {
                    const key = item.itemId || item.name;
                    if (productAggregation[key]) {
                      productAggregation[key].quantity += item.quantity;
                    } else {
                      productAggregation[key] = {
                        itemId: item.itemId,
                        name: item.name,
                        quantity: item.quantity,
                      };
                    }
                  });
                });
                
                cleaningProductItems = Object.values(productAggregation).map(item => ({
                  ...item,
                  type: "cleaning_product",
                }));
                
                console.log(`🧴 Trovate ${pendingRequestsSnapshot.docs.length} richieste prodotti pending con ${cleaningProductItems.length} prodotti totali`);
              } catch (productError) {
                console.error("Errore lettura richieste prodotti:", productError);
              }
              
              // Crea ordine solo se ci sono items (biancheria o prodotti)
              if (linenConfig.length > 0 || cleaningProductItems.length > 0) {
                const linenItems = linenConfig.map((item: { itemId: string; itemName: string; quantity: number }) => ({
                  itemId: item.itemId,
                  name: item.itemName,
                  quantity: item.quantity,
                  type: "linen",
                }));
                
                // Determina il tipo ordine
                let orderType = "LINEN";
                if (linenItems.length > 0 && cleaningProductItems.length > 0) {
                  orderType = "MIXED";
                } else if (cleaningProductItems.length > 0) {
                  orderType = "PRODUCTS";
                }
                
                const orderRef = await addDoc(collection(db, "orders"), {
                  propertyId: cleaning.propertyId,
                  propertyName: cleaning.propertyName,
                  propertyAddress: cleaning.propertyAddress || property.address,
                  cleaningId: id,
                  type: orderType,
                  status: "PENDING",
                  scheduledDate: cleaning.scheduledDate,
                  // Items combinati per retrocompatibilità
                  items: [...linenItems, ...cleaningProductItems],
                  // Items separati per nuova UI
                  linenItems: linenItems,
                  cleaningProducts: cleaningProductItems,
                  // Riferimenti alle richieste prodotti evase
                  productRequestIds: productRequestIds,
                  autoGenerated: true,
                  createdAt: now,
                  updatedAt: now,
                });
                
                laundryOrderId = orderRef.id;
                
                // Aggiorna pulizia con riferimento ordine
                await updateDoc(cleaningRef, {
                  laundryOrderId: laundryOrderId,
                  requiresLaundry: true,
                });
                
                // 🧴 SEGNA LE RICHIESTE PRODOTTI COME EVASE
                if (productRequestIds.length > 0) {
                  for (const requestId of productRequestIds) {
                    await updateDoc(doc(db, "productRequests", requestId), {
                      status: "fulfilled",
                      fulfilledAt: now,
                      fulfilledInOrderId: laundryOrderId,
                      fulfilledInCleaningId: id,
                      updatedAt: now,
                    });
                  }
                  console.log(`🧴 Segnate ${productRequestIds.length} richieste come evase`);
                }
                
                console.log(`📦 Ordine ${orderType} auto-generato: ${laundryOrderId} (${linenItems.length} biancheria + ${cleaningProductItems.length} prodotti)`);
                
                // Notifica admin del nuovo ordine
                const notificationMessage = cleaningProductItems.length > 0
                  ? `Ordine automatico per "${cleaning.propertyName}" (biancheria + ${cleaningProductItems.length} prodotti pulizia)`
                  : `Ordine automatico per "${cleaning.propertyName}"`;
                  
                await createNotification({
                  title: cleaningProductItems.length > 0 ? "📦🧴 Nuovo ordine misto" : "📦 Nuovo ordine biancheria",
                  message: notificationMessage,
                  type: "LAUNDRY_NEW",
                  recipientRole: "ADMIN",
                  senderId: "system",
                  senderName: "Sistema",
                  relatedEntityId: laundryOrderId,
                  relatedEntityType: "CLEANING",
                  relatedEntityName: cleaning.propertyName,
                  link: `/dashboard/ordini/${laundryOrderId}`,
                });
                
                // 🚴 NOTIFICA RIDER per ordine auto-generato
                try {
                  const usersRefAuto = collection(db, "users");
                  const ridersQueryAuto = query(usersRefAuto, where("role", "==", "RIDER"));
                  const ridersSnapAuto = await getDocs(ridersQueryAuto);
                  
                  let riderNotifSent = 0;
                  for (const riderDoc of ridersSnapAuto.docs) {
                    try {
                      await createNotification({
                        title: "🧹 Pulizia iniziata - Consegna richiesta",
                        message: `Pulizia di "${cleaning.propertyName}" in corso - preparati per la consegna biancheria`,
                        type: "CLEANING_STARTED",
                        recipientRole: "RIDER",
                        recipientId: riderDoc.id,
                        senderId: user.id,
                        senderName: user.name || user.email || "Sistema",
                        relatedEntityId: laundryOrderId,
                        relatedEntityType: "CLEANING",
                        relatedEntityName: cleaning.propertyName,
                        link: `/rider`,
                      });
                      riderNotifSent++;
                    } catch (e) {
                      console.error(`Errore notifica rider ${riderDoc.id}:`, e);
                    }
                  }
                  console.log(`🔔 Notifica ordine auto-generato inviata a ${riderNotifSent} rider`);
                } catch (riderAutoNotifError) {
                  console.error("Errore notifica rider per ordine auto:", riderAutoNotifError);
                }
              }
            }
          }
        }
      } catch (laundryError) {
        console.error("Errore auto-generazione biancheria:", laundryError);
      }
    }
    
    return NextResponse.json({ 
      success: true,
      startedAt: now.toDate().toISOString(),
      laundryOrderId,
      message: laundryOrderId 
        ? "Pulizia iniziata e ordine biancheria creato" 
        : "Pulizia iniziata"
    });
  } catch (error) {
    console.error("Errore inizio pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
