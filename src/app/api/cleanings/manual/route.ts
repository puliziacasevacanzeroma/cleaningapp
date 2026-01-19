import { NextResponse } from "next/server";
import { createCleaningWithLinenOrder, createLinenOnlyOrder, getPropertyById } from "~/lib/firebase/firestore-data";
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
      customLinenItems // Items personalizzati per biancheria
    } = body;

    if (!propertyId) {
      return NextResponse.json({ error: "PropertyId richiesto" }, { status: 400 });
    }

    if (!scheduledDate) {
      return NextResponse.json({ error: "Data richiesta" }, { status: 400 });
    }

    // Carica la proprietà
    const property = await getPropertyById(propertyId);
    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // Se richiesta solo biancheria
    if (linenOnly) {
      const orderId = await createLinenOnlyOrder(
        propertyId,
        new Date(scheduledDate),
        customLinenItems
      );

      return NextResponse.json({
        success: true,
        orderId,
        message: "Ordine biancheria creato con successo",
      });
    }

    // Crea pulizia (con o senza ordine biancheria)
    const shouldCreateLinenOrder = createLinenOrder && !property.usesOwnLinen;

    const result = await createCleaningWithLinenOrder(
      {
        propertyId,
        propertyName: property.name,
        propertyAddress: property.address,
        scheduledDate: Timestamp.fromDate(new Date(scheduledDate)),
        scheduledTime: scheduledTime || "10:00",
        guestsCount: guestsCount || property.maxGuests || 2,
        status: "SCHEDULED",
        type: type,
        notes: notes || "",
        price: property.cleaningPrice || 0,
      },
      shouldCreateLinenOrder
    );

    return NextResponse.json({
      success: true,
      cleaningId: result.cleaningId,
      orderId: result.orderId,
      message: result.orderId 
        ? "Pulizia e ordine biancheria creati con successo"
        : "Pulizia creata con successo",
    });

  } catch (error) {
    console.error("Errore creazione pulizia manuale:", error);
    return NextResponse.json(
      { error: "Errore nella creazione" },
      { status: 500 }
    );
  }
}
