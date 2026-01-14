import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { configId, guestsCount } = await request.json();

    if (!configId || !guestsCount) {
      return NextResponse.json(
        { error: "Configurazione non valida" },
        { status: 400 }
      );
    }

    // Verifica che la prenotazione appartenga al proprietario
    const booking = await db.booking.findFirst({
      where: {
        id: params.id,
        property: { ownerId: session.user.id }
      },
      include: { 
        property: true,
        cleaning: true,
        orders: true
      }
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Prenotazione non trovata" },
        { status: 404 }
      );
    }

    // Verifica che non sia oltre la deadline
    const checkOutDate = new Date(booking.checkOut);
    checkOutDate.setHours(0, 0, 0, 0);
    
    const deadline = new Date(checkOutDate);
    deadline.setDate(deadline.getDate() - 1);
    deadline.setHours(18, 0, 0, 0);

    if (new Date() >= deadline) {
      return NextResponse.json(
        { error: "Il termine per la creazione dell'ordine biancheria è scaduto" },
        { status: 400 }
      );
    }

    // Verifica se esiste già un ordine biancheria
    const existingLinenOrder = booking.orders.find(o => 
      o.items?.some((i: any) => i.type === "linen")
    );

    if (existingLinenOrder) {
      return NextResponse.json(
        { error: "Esiste già un ordine biancheria per questa prenotazione" },
        { status: 400 }
      );
    }

    // Recupera la configurazione biancheria
    const linenConfig = await db.linenConfig.findUnique({
      where: { id: configId }
    });

    if (!linenConfig || linenConfig.propertyId !== booking.propertyId) {
      return NextResponse.json(
        { error: "Configurazione biancheria non valida" },
        { status: 400 }
      );
    }

    // Recupera i prezzi della biancheria
    const linenPricing = await db.linenPricing.findMany({
      where: { isActive: true }
    });

    const priceMap = new Map(linenPricing.map(p => [p.itemType, p]));

    // Crea gli articoli dell'ordine
    const orderItems: Array<{
      type: string;
      name: string;
      sku?: string;
      quantity: number;
      unitPrice: number;
    }> = [];

    const linenFields = [
      { key: "lenzuoloMatrimoniale", name: "Lenzuolo Matrimoniale" },
      { key: "lenzuoloSingolo", name: "Lenzuolo Singolo" },
      { key: "federa", name: "Federa" },
      { key: "copriletto", name: "Copriletto" },
      { key: "copripiumino", name: "Copripiumino" },
      { key: "teloDoccia", name: "Telo Doccia" },
      { key: "teloViso", name: "Telo Viso" },
      { key: "teloBidet", name: "Telo Bidet" },
      { key: "teloOspite", name: "Telo Ospite" },
      { key: "scendiBagno", name: "Scendi Bagno" },
      { key: "accappatoio", name: "Accappatoio" },
      { key: "strofinaccio", name: "Strofinaccio" },
      { key: "tovaglia", name: "Tovaglia" },
      { key: "tovagliolo", name: "Tovagliolo" },
    ];

    for (const field of linenFields) {
      const quantity = (linenConfig as any)[field.key];
      if (quantity && quantity > 0) {
        const pricing = priceMap.get(field.key);
        orderItems.push({
          type: "linen",
          name: field.name,
          sku: pricing?.sku || undefined,
          quantity,
          unitPrice: pricing?.externalPrice || 0,
        });
      }
    }

    // Crea l'ordine con gli articoli
    const order = await db.order.create({
      data: {
        propertyId: booking.propertyId,
        bookingId: booking.id,
        cleaningId: booking.cleaning?.id,
        status: "pending",
        scheduledDate: booking.checkOut,
        items: {
          create: orderItems
        }
      },
      include: { items: true }
    });

    // Aggiorna il numero ospiti nella prenotazione se diverso
    if (booking.guestsCount !== guestsCount) {
      await db.booking.update({
        where: { id: params.id },
        data: { guestsCount }
      });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("Errore creazione ordine biancheria:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
