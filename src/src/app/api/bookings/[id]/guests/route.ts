import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { guestsCount } = await request.json();

    if (!guestsCount || guestsCount < 1) {
      return NextResponse.json(
        { error: "Numero ospiti non valido" },
        { status: 400 }
      );
    }

    // Verifica che la prenotazione appartenga al proprietario
    const booking = await db.booking.findFirst({
      where: {
        id: params.id,
        property: { ownerId: session.user.id }
      },
      include: { property: true }
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Prenotazione non trovata" },
        { status: 404 }
      );
    }

    // Verifica che non sia oltre la deadline (18:00 del giorno prima del check-out)
    const checkOutDate = new Date(booking.checkOut);
    checkOutDate.setHours(0, 0, 0, 0);
    
    const deadline = new Date(checkOutDate);
    deadline.setDate(deadline.getDate() - 1);
    deadline.setHours(18, 0, 0, 0);

    if (new Date() >= deadline) {
      return NextResponse.json(
        { error: "Il termine per la modifica del numero ospiti è scaduto" },
        { status: 400 }
      );
    }

    // Verifica che non superi il massimo
    if (booking.property.maxGuests && guestsCount > booking.property.maxGuests) {
      return NextResponse.json(
        { error: `Il numero massimo di ospiti è ${booking.property.maxGuests}` },
        { status: 400 }
      );
    }

    // Aggiorna la prenotazione
    const updatedBooking = await db.booking.update({
      where: { id: params.id },
      data: { guestsCount }
    });

    // Aggiorna anche la pulizia collegata se esiste
    if (booking.cleaning) {
      await db.cleaning.updateMany({
        where: { bookingId: params.id },
        data: { guestsCount }
      });
    }

    return NextResponse.json(updatedBooking);
  } catch (error) {
    console.error("Errore aggiornamento ospiti:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
