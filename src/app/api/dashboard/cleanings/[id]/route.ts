import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

// PATCH - Modifica pulizia (orario, ospiti, etc)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const body = await request.json();
    const { scheduledTime, guestsCount, status, notes } = body;
    
    const updateData: Record<string, unknown> = {};
    if (scheduledTime !== undefined) updateData.scheduledTime = scheduledTime;
    if (guestsCount !== undefined) updateData.guestsCount = guestsCount;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    
    const cleaning = await db.cleaning.update({
      where: { id },
      data: updateData,
      include: {
        property: true,
        operator: { select: { id: true, name: true } }
      }
    });
    
    return NextResponse.json(cleaning);
  } catch (error) {
    console.error("Errore PATCH cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// GET - Ottieni singola pulizia
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
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
    
    return NextResponse.json(cleanin