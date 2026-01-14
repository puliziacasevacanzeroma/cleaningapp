import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

// POST - Assegna operatore a pulizia
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { operatorId } = await request.json();

    const cleaning = await db.cleaning.update({
      where: { id: params.id },
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
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Rimuovi operatore da pulizia
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const cleaning = await db.cleaning.update({
      where: { id: params.id },
      data: {
        operatorId: null,
        status: "not_assigned"
      },
      include: {
        property: true,
        operator: { select: { id: true, name: true } }
      }
    });

    return NextResponse.json(cleaning);
  } catch (error) {
    console.error("Errore rimozione operatore:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
