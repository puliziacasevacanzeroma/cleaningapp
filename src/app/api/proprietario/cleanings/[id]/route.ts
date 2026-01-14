import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

// GET singola pulizia
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    
    const cleaning = await db.cleaning.findUnique({
      where: { id },
      include: {
        property: true,
        operator: { select: { id: true, name: true } },
        booking: true
      }
    });
    
    if (!cleaning) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    // Verifica che la proprietà appartenga all'utente
    if (cleaning.property.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    
    return NextResponse.json(cleaning);
  } catch (error) {
    console.error("Errore GET pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modifica pulizia
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    
    const cleaning = await db.cleaning.findUnique({
      where: { id },
      include: { property: true }
    });
    
    if (!cleaning) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    // Verifica che la proprietà appartenga all'utente
    if (cleaning.property.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    
    const body = await request.json();
    const { scheduledTime, guestsCount, notes, status, operatorId, date } = body;
    
    const updateData: Record<string, unknown> = {};
    if (scheduledTime !== undefined) updateData.scheduledTime = scheduledTime;
    if (guestsCount !== undefined) updateData.guestsCount = guestsCount;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;
    if (operatorId !== undefined) updateData.operatorId = operatorId;
    if (date !== undefined) updateData.date = new Date(date);
    
    const updatedCleaning = await db.cleaning.update({
      where: { id },
      data: updateData,
      include: {
        property: true,
        operator: { select: { id: true, name: true } },
        booking: true
      }
    });
    
    return NextResponse.json(updatedCleaning);
  } catch (error) {
    console.error("Errore PATCH pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Elimina pulizia
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    
    const cleaning = await db.cleaning.findUnique({
      where: { id },
      include: { property: true }
    });
    
    if (!cleaning) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }
    
    // Verifica che la proprietà appartenga all'utente
    if (cleaning.property.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    
    await db.cleaning.delete({
      where: { id }
    });
    
    return NextResponse.json({ success: true, message: "Pulizia eliminata" });
  } catch (error) {
    console.error("Errore DELETE pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}