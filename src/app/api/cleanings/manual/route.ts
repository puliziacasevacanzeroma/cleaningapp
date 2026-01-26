import { NextResponse } from "next/server";
import { createCleaning, createOrder, getPropertyById } from "~/lib/firebase/firestore-data";
import { Timestamp, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNotification } from "~/lib/firebase/notifications";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      propertyId, 
      scheduledDate, 
      scheduledTime,
      guestsCount,
      notes,
      type = "MANUAL", // MANUAL, CHECKOUT, CHECKIN, DEEP_CLEAN
      createLinenOrder = true, // Se creare ordine biancheria
      linenOnly = false, // Se creare SOLO ordine biancheria (senza pulizia)
      customLinenItems, // Items personalizzati per biancheria
      cleaningPrice,
      linenPrice,
      totalPrice,
      urgency = "normal", // normal | urgent
    } = body;

    console.log("📥 Richiesta creazione pulizia:", { propertyId, scheduledDate, guestsCount, type, urgency });

    if (!propertyId) {
      return NextResponse.json({ error: "PropertyId richiesto" }, { status: 400 });
    }

    if (!scheduledDate) {
      return NextResponse.json({ error: "Data richiesta" }, { status: 400 });
    }

    if (!guestsCount || guestsCount <= 0) {
      return NextResponse.json({ error: "Numero ospiti richiesto" }, { status: 400 });
    }

    // Carica la proprietà
    const property = await getPropertyById(propertyId);
    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // IMPORTANTE: Crea la data corretta (mezzogiorno per evitare problemi timezone)
    const [year, month, day] = scheduledDate.split("-").map(Number);
    const cleaningDate = new Date(year, month - 1, day, 12, 0, 0);
    console.log("📅 Data pulizia creata:", cleaningDate.toISOString());

    // Prepara gli items per l'ordine biancheria
    let linenItems: { id: string; name: string; quantity: number; price?: number }[] = [];
    
    if (customLinenItems && customLinenItems.length > 0) {
      // Usa items personalizzati dal frontend
      linenItems = customLinenItems.map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price || 0,
      }));
    } else if (createLinenOrder || linenOnly) {
      // Usa serviceConfigs della proprietà se esistono
      const serviceConfigs = property.serviceConfigs as Record<number, any> | undefined;
      if (serviceConfigs && serviceConfigs[guestsCount]) {
        const config = serviceConfigs[guestsCount];
        
        // Biancheria letto - cerca sia 'all' che per ogni letto
        if (config.bl) {
          Object.entries(config.bl).forEach(([bedId, items]) => {
            if (typeof items === 'object') {
              Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                if (qty > 0) {
                  // Evita duplicati sommando quantità
                  const existing = linenItems.find(i => i.id === itemId);
                  if (existing) {
                    existing.quantity += qty;
                  } else {
                    linenItems.push({ id: itemId, name: itemId, quantity: qty });
                  }
                }
              });
            }
          });
        }
        
        // Biancheria bagno
        if (config.ba) {
          Object.entries(config.ba).forEach(([itemId, qty]) => {
            if ((qty as number) > 0) {
              linenItems.push({ id: itemId, name: itemId, quantity: qty as number });
            }
          });
        }
        
        // Kit cortesia
        if (config.ki) {
          Object.entries(config.ki).forEach(([itemId, qty]) => {
            if ((qty as number) > 0) {
              linenItems.push({ id: itemId, name: itemId, quantity: qty as number });
            }
          });
        }
      }
    }

    // Se richiesta solo biancheria (senza pulizia)
    if (linenOnly) {
      if (linenItems.length === 0) {
        return NextResponse.json({ error: "Nessun articolo selezionato" }, { status: 400 });
      }

      const orderId = await createOrder({
        propertyId,
        propertyName: property.name,
        propertyAddress: property.address,
        propertyCity: property.city || "",
        propertyPostalCode: property.postalCode || "",
        propertyFloor: property.floor || "",
        propertyApartment: property.apartment || "",
        propertyIntercom: property.intercom || "",
        propertyDoorCode: property.doorCode || "",
        propertyKeysLocation: property.keysLocation || "",
        propertyAccessNotes: property.accessNotes || "",
        propertyImages: property.images || undefined,
        status: "PENDING",
        type: "LINEN",
        scheduledDate: Timestamp.fromDate(cleaningDate),
        scheduledTime: scheduledTime || "10:00", // Ora consegna indicativa
        urgency: urgency || "normal",
        items: linenItems,
        notes: notes || "",
      });

      console.log("✅ Ordine biancheria creato:", orderId);

      // Se urgente, notifica tutti i rider
      if (urgency === "urgent") {
        await notifyAllRiders(property, orderId);
      }

      return NextResponse.json({
        success: true,
        orderId,
        message: urgency === "urgent" 
          ? "Ordine biancheria URGENTE creato - Notifica inviata ai rider"
          : "Ordine biancheria creato con successo",
      });
    }

    // Crea la pulizia
    const cleaningId = await createCleaning({
      propertyId,
      propertyName: property.name,
      propertyAddress: property.address,
      scheduledDate: Timestamp.fromDate(cleaningDate),
      scheduledTime: scheduledTime || "10:00",
      guestsCount: guestsCount,
      status: "SCHEDULED",
      type: type,
      notes: notes || "",
      price: cleaningPrice || property.cleaningPrice || 0,
    });

    console.log("✅ Pulizia creata:", cleaningId);

    let orderId: string | undefined;

    // Se richiesto, crea l'ordine biancheria per il rider
    if (createLinenOrder && linenItems.length > 0) {
      orderId = await createOrder({
        cleaningId,
        propertyId,
        propertyName: property.name,
        propertyAddress: property.address,
        propertyCity: property.city || "",
        propertyPostalCode: property.postalCode || "",
        propertyFloor: property.floor || "",
        propertyApartment: property.apartment || "",
        propertyIntercom: property.intercom || "",
        propertyDoorCode: property.doorCode || "",
        propertyKeysLocation: property.keysLocation || "",
        propertyAccessNotes: property.accessNotes || "",
        propertyImages: property.images || undefined,
        status: "PENDING",
        type: "LINEN",
        scheduledDate: Timestamp.fromDate(cleaningDate),
        scheduledTime: scheduledTime || "10:00",
        urgency: urgency || "normal",
        items: linenItems,
        notes: notes || "",
      });
      console.log("✅ Ordine biancheria creato:", orderId);

      // Se urgente, notifica tutti i rider
      if (urgency === "urgent") {
        await notifyAllRiders(property, orderId);
      }
    }

    return NextResponse.json({
      success: true,
      cleaningId,
      orderId,
      message: orderId 
        ? (urgency === "urgent" 
            ? "Pulizia e ordine biancheria URGENTE creati - Notifica inviata ai rider"
            : "Pulizia e ordine biancheria creati con successo")
        : "Pulizia creata con successo",
    });

  } catch (error) {
    console.error("❌ Errore creazione pulizia manuale:", error);
    return NextResponse.json(
      { error: "Errore nella creazione" },
      { status: 500 }
    );
  }
}

/**
 * Invia notifica a tutti i rider attivi
 */
async function notifyAllRiders(property: any, orderId: string) {
  try {
    const usersRef = collection(db, "users");
    const ridersQuery = query(usersRef, where("role", "==", "RIDER"));
    const ridersSnap = await getDocs(ridersQuery);

    let notificationsSent = 0;

    for (const riderDoc of ridersSnap.docs) {
      try {
        await createNotification({
          userId: riderDoc.id,
          type: "urgent_order",
          title: "🚨 ORDINE URGENTE",
          message: `Nuova consegna urgente: ${property.name}${property.address ? ` - ${property.address}` : ""}`,
          data: {
            orderId,
            propertyId: property.id,
            propertyName: property.name,
            propertyAddress: property.address,
          },
          read: false,
        });
        notificationsSent++;
      } catch (e) {
        console.error(`Errore notifica rider ${riderDoc.id}:`, e);
      }
    }

    console.log(`🔔 Notifiche urgenti inviate a ${notificationsSent} rider`);
  } catch (error) {
    console.error("❌ Errore invio notifiche rider:", error);
  }
}
