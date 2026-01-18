import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { getApiUser } from "~/lib/api-auth";

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { itemId, delta, newQuantity: directQuantity } = await req.json();

    // Trova l'articolo
    const item = await db.inventoryItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
    }

    // Se viene passata una quantità diretta, usala; altrimenti calcola con delta
    const newQuantity = directQuantity !== undefined 
      ? Math.max(0, directQuantity) 
      : Math.max(0, item.quantity + delta);
    
    const actualDelta = newQuantity - item.quantity;

    // Aggiorna quantità
    await db.inventoryItem.update({
      where: { id: itemId },
      data: { 
        quantity: newQuantity,
        lastRestocked: actualDelta > 0 ? new Date() : undefined,
      },
    });

    // Registra movimento solo se c'è una differenza
    if (actualDelta !== 0) {
      await db.inventoryMovement.create({
        data: {
          itemId: itemId,
          type: actualDelta > 0 ? "IN" : "OUT",
          quantity: Math.abs(actualDelta),
          previousQty: item.quantity,
          newQty: newQuantity,
          notes: actualDelta > 0 ? "Carico manuale" : "Scarico manuale",
          reason: "Modifica manuale",
          createdBy: user.id,
        },
      });
    }

    return NextResponse.json({ success: true, newQuantity });
  } catch (error) {
    console.error("Errore aggiornamento quantità:", error);
    return NextResponse.json({ error: "Errore aggiornamento" }, { status: 500 });
  }
}
