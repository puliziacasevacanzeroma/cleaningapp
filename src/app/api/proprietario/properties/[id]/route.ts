import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }
    const { id } = await params;
, { status: 401 });
    }

    // Verifica che la proprietà appartenga all'utente
    const existingProperty = await db.property.findFirst({
      where: { id: id, ownerId: session.user.id }
    });

    if (!existingProperty) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const data = await request.json();
    const { name, address, city, zip, floor, intern, maxGuests, cleaningFee, icalUrl, notes } = data;

    const property = await db.property.update({
      where: { id: id },
      data: {
        name,
        address,
        city: city || null,
        zip: zip || null,
        floor: floor || null,
        intern: intern || null,
        maxGuests: maxGuests || null,
        cleaningFee: cleaningFee || null,
        icalUrl: icalUrl || null,
        notes: notes || null
      }
    });

    return NextResponse.json(property);
  } catch (error) {
    console.error("Errore aggiornamento proprietà:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }
    const { id } = await params;
, { status: 401 });
    }

    const property = await db.property.findFirst({
      where: { id: id, ownerId: session.user.id },
      include: {
        _count: { select: { bookings: true, cleanings: true } },
        linenConfigs: true
      }
    });

    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    return NextResponse.json(property);
  } catch (error) {
    console.error("Errore recupero proprietà:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}
