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
    
    if (cleaning.property.clientId !== session.user.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    
    return NextResponse.json(cleaning);
  } catch (error) {
    console.error("Errore GET pulizia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modific