import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    let categories = await db.inventoryCategory.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { name: "asc" }
        }
      }
    });

    // Se non ci sono categorie, creale di default
    if (categories.length === 0) {
      const defaultCategories = [
        { name: "Biancheria", slug: "biancheria", icon: "🛏️", color: "sky", order: 0 },
        { name: "Kit Cortesia", slug: "cortesia", icon: "🧴", color: "violet", order: 1 },
        { name: "Caffetteria", slug: "caffe", icon: "☕", color: "amber", order: 2 },
        { name: "Carta", slug: "carta", icon: "📄", color: "emerald", order: 3 },
      ];

      for (const cat of defaultCategories) {
        await db.inventoryCategory.create({ data: cat });
      }

      categories = await db.inventoryCategory.findMany({
        where: { isActive: true },
        orderBy: { order: "asc" },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { name: "asc" }
          }
        }
      });
    }

    const allItems = categories.flatMap(c => c.items);
    const stats = {
      totalItems: allItems.length,
      lowStock: allItems.filter(i => i.quantity <= i.minQuantity && i.quantity > 0).length,
      outOfStock: allItems.filter(i => i.quantity === 0).length,
      totalValue: allItems.reduce((sum, i) => sum + (i.quantity * i.sellPrice), 0),
    };

    return NextResponse.json({ categories, stats });
  } catch (error) {
    console.error("Errore fetch inventario:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
