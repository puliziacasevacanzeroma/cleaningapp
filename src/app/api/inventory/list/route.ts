import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { cachedQuery } from "~/lib/cache";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // ⚡ USA CACHE REDIS - risposta 10x più veloce!
    const data = await cachedQuery("inventory", async () => {
      const categories = await db.inventoryCategory.findMany({
        where: { isActive: true },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { name: "asc" }
          }
        },
        orderBy: { order: "asc" }
      });

      // Calcola statistiche
      const allItems = categories.flatMap(c => c.items);
      const stats = {
        totalItems: allItems.length,
        lowStock: allItems.filter(i => i.quantity <= i.minQuantity && i.quantity > 0).length,
        outOfStock: allItems.filter(i => i.quantity === 0).length,
        totalValue: allItems.reduce((sum, i) => sum + (i.quantity * i.sellPrice), 0)
      };

      return { categories, stats };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Errore fetch inventario:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}