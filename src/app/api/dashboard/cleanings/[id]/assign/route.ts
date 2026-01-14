import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

// POST - Assegna operatore a pulizia
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    
    const { id } = await params;
    const { operatorId } = await request.json();
    
    const cleaning = await db.cleaning.update({
      where: { id },
      data: {
        operatorId,
        status: "assigned"
      },
      include: {
        property: true,
        operator: { select: { id: true, name: true } }
      }
    });
    
    return NextResponse.json(cleaning);
  } catch (error) {
    console.error("Errore assegnazione:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}