import { NextResponse } from "next/server";
import { ALL_INVENTORY_ITEMS, INVENTORY_CATEGORIES, getItemsByCategory } from "~/lib/linenItems";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Costruisci categorie con gli articoli standard
    const categories = INVENTORY_CATEGORIES.map(cat => {
      const items = getItemsByCategory(cat.id).map(item => ({
        id: item.id,
        name: item.name,
        categoryId: cat.id,
        quantity: 100, // Disponibilità default
        minQuantity: 10,
        sellPrice: item.defaultPrice,
        unit: item.unit,
        isForLinen: cat.id === "biancheria_letto" || cat.id === "biancheria_bagno",
        icon: item.icon,
        key: item.key,
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
      totalValue: allItems.reduce((sum, item) => sum + (item.quantity * item.sellPrice), 0),
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
