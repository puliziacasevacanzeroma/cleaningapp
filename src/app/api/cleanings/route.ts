import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { revalidateTag } from "next/cache";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const data = await request.json();
    const { propertyId, date, scheduledTime, notes } = data;

    if (!propertyId || !date) {
      return NextResponse.json({ error: "Proprietà e data sono obbligatori" }, { status: 400 });
    }

    // Verifica che la proprietà appartenga al proprietario
    const property = await db.property.findFirst({
      where: { id: propertyId, clientId: session.user.id, status: "active" }
    });

    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // Crea la pulizia
    const cleaning = await db.cleaning.create({
      data: {
        propertyId,
        scheduledDate: new Date(date),
        scheduledTime: scheduledTime || "09:00",
        notes: notes || null,
        status: "SCHEDULED"
      }
    });

    // Invalida cache dashboard
    revalidateTag("dashboard");

    return NextResponse.json(cleaning);
  } catch (error) {
    console.error("Errore creazione pulizia:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}