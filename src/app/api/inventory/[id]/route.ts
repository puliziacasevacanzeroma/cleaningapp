import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { getApiUser } from "~/lib/api-auth";

// PUT - Aggiorna articolo
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const data = await req.json();
    
    const item = await db.inventoryItem.update({
      where: { id: params.id },
      data: {
        name: data.name,
        categoryId: data.categoryId,
        quantity: data.quantity || 0,
        minQuantity: data.minQuantity || 5,
        sellPrice: data.sellPrice || 0,
        unit: data.unit || "pz",
        isForLinen: data.isForLinen ?? true,
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Errore aggiornamento articolo:", error);
    return NextResponse.json({ error: "Errore aggiornamento" }, { status: 500 });
  }
}

// DELETE - Disattiva articolo (soft delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    await db.inventoryItem.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore eliminazione articolo:", error);
    return NextResponse.json({ error: "Errore eliminazione" }, { status: 500 });
  }
}
