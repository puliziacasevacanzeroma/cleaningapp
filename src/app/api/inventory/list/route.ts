import { NextResponse } from "next/server";
import { LINEN_ITEMS, LINEN_CATEGORIES } from "~/lib/linenItems";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Costruisci categorie con gli articoli standard
    const categories = LINEN_CATEGORIES.map(cat => {
      const items = LINEN_ITEMS
        .filter(item => item.category === cat.id)
        .map(item => ({
          id: item.id,
          name: item.name,
          categoryId: cat.id,
          quantity: 100, // Disponibilità default
          minQuantity: 10,
          sellPrice: 0,
          unit: item.unit,
          isForLinen: true,
          icon: item.icon,
        }));

      return {
        ...cat,
        items,
      };
    });

    // Stats
    const allItems = categories.flatMap(c => c.items);
    const stats = {
      totalItems: allItems.length,
      lowStock: 0,
      outOfStock: 0,
      totalValue: 0,
    };

    return NextResponse.json({ categories, stats });
  } catch (error) {
    console.error("Errore caricamento inventario:", error);
    return NextResponse.json({
      categories: [],
      stats: { totalItems: 0, lowStock: 0, outOfStock: 0, totalValue: 0 },
    });
  }
}
