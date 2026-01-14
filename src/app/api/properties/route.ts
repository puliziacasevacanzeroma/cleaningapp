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
    const { name, address, city, postalCode, maxGuests, cleaningPrice, description } = data;

    if (!name || !address) {
      return NextResponse.json({ error: "Nome e indirizzo sono obbligatori" }, { status: 400 });
    }

    const property = await db.property.create({
      data: {
        clientId: session.user.id,
        name,
        address,
        city: city || "",
        postalCode: postalCode || null,
        maxGuests: maxGuests || 4,
        cleaningPrice: cleaningPrice || 0,
        description: description || null,
        status: "PENDING",
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
      where: { clientId: session.user.id },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(properties);
  } catch (error) {
    console.error("Errore recupero proprietà:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}