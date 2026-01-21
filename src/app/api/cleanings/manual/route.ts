import { NextResponse } from "next/server";
import { createCleaning, createOrder, getPropertyById } from "~/lib/firebase/firestore-data";
import { Timestamp } from "firebase/firestore";

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
    } = body;

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
        
        // Biancheria letto
        if (config.bl && config.bl['all']) {
          Object.entries(config.bl['all']).forEach(([itemId, qty]) => {
            if ((qty as number) > 0) {
              linenItems.push({ id: itemId, name: itemId, quantity: qty as number });
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
        status: "PENDING",
        type: "LINEN",
        scheduledDate: Timestamp.fromDate(new Date(scheduledDate)),
        items: linenItems,
        notes: notes || "",
      });

      return NextResponse.json({
        success: true,
        orderId,
        message: "Ordine biancheria creato con successo",
      });
    }

    // Crea la pulizia
    const cleaningId = await createCleaning({
      propertyId,
      propertyName: property.name,
      propertyAddress: property.address,
      scheduledDate: Timestamp.fromDate(new Date(scheduledDate)),
      scheduledTime: scheduledTime || "10:00",
      guestsCount: guestsCount,
      status: "SCHEDULED",
      type: type,
      notes: notes || "",
      price: cleaningPrice || property.cleaningPrice || 0,
    });

    let orderId: string | undefined;

    // Se richiesto, crea l'ordine biancheria per il rider
    if (createLinenOrder && linenItems.length > 0) {
      orderId = await createOrder({
        cleaningId,
        propertyId,
        propertyName: property.name,
        propertyAddress: property.address,
        status: "PENDING",
        type: "LINEN",
        scheduledDate: Timestamp.fromDate(new Date(scheduledDate)),
        items: linenItems,
        notes: notes || "",
      });
    }

    return NextResponse.json({
      success: true,
      cleaningId,
      orderId,
      message: orderId 
        ? "Pulizia e ordine biancheria creati con successo"
        : "Pulizia creata con successo (senza biancheria)",
    });

  } catch (error) {
    console.error("Errore creazione pulizia manuale:", error);
    return NextResponse.json(
      { error: "Errore nella creazione" },
      { status: 500 }
    );
  }
}
