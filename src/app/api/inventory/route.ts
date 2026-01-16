import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { auth } from "~/server/auth";

// GET - Lista articoli
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const items = await db.inventoryItem.findMany({
    where: { isActive: true },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(items);
}

// POST - Crea nuovo articolo
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const data = await req.json();
    
    const item = await db.inventoryItem.create({
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

    // Crea movimento di carico iniziale se quantità > 0
    if (item.quantity > 0) {
      await db.inventoryMovement.create({
        data: {
          itemId: item.id,
          type: "IN",
          quantity: item.quantity,
          previousQty: 0,
          newQty: item.quantity,
          notes: "Carico iniziale",
          reason: "Carico iniziale",
          createdBy: session.user.id,
        },
      });
    }

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Errore creazione articolo:", error);
    return NextResponse.json({ error: "Errore creazione" }, { status: 500 });
  }
}
