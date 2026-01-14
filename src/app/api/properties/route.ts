import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const data = await request.json();

    const { name, address, city, zip, floor, intern, maxGuests, cleaningFee, icalUrl, notes } = data;

    if (!name || !address || !city) {
      return NextResponse.json({ error: "Nome, indirizzo e città sono obbligatori" }, { status: 400 });
    }

    const property = await db.property.create({
      data: {
        ownerId: session.user.id,
        name,
        address,
        city,
        zip: zip || null,
        floor: floor || null,
        intern: intern || null,
        maxGuests: maxGuests || 4,
        cleaningFee: cleaningFee || 0,
        icalUrl: icalUrl || null,
        notes: notes || null,
        status: "pending", // In attesa di approvazione
      }
    });

    return NextResponse.json(property);
  } catch (error) {
    console.error("Errore creazione proprietà:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const properties = await db.property.findMany({
      where: { ownerId: session.user.id },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(properties);
  } catch (error) {
    console.error("Errore recupero proprietà:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}
