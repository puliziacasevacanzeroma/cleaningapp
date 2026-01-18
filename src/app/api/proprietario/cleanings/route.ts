import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { db } from "~/server/db";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const data = await request.json();
    const { propertyId, date, scheduledTime, notes } = data;

    if (!propertyId || !date) {
      return NextResponse.json({ error: "Proprietà e data sono obbligatori" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, clientId: user.id, status: "ACTIVE" }
    });

    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const cleaning = await db.cleaning.create({
      data: {
        propertyId,
        scheduledDate: new Date(date),
        scheduledTime: scheduledTime || "09:00",
        notes: notes || null,
        status: "SCHEDULED"
      }
    });

    return NextResponse.json(cleaning);
  } catch (error) {
    console.error("Errore creazione pulizia:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}