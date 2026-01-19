import { NextResponse } from "next/server";
import { getInventory } from "~/lib/firebase/firestore-data";

export const dynamic = 'force-dynamic';

// Categorie predefinite
const defaultCategories = [
  { id: "biancheria", name: "Biancheria", slug: "biancheria", icon: "🛏️", color: "sky" },
  { id: "pulizia", name: "Prodotti Pulizia", slug: "pulizia", icon: "🧹", color: "emerald" },
  { id: "consumabili", name: "Consumabili", slug: "consumabili", icon: "📦", color: "amber" },
  { id: "altro", name: "Altro", slug: "altro", icon: "📋", color: "slate" },
];

export async function GET() {
  try {
    const items = await getInventory();
    
    // Raggruppa items per categoria
    const categoriesMap = new Map<string, any>();
    
    // Inizializza categorie
    defaultCategories.forEach(cat => {
      categoriesMap.set(cat.id, { ...cat, items: [] });
    });
    
    // Stats
    let totalItems = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let totalValue = 0;
    
    // Processa items
    items.forEach((item: any) => {
      totalItems++;
      
      const quantity = item.quantity || 0;
      const minQuantity = item.minQuantity || 5;
      const sellPrice = item.sellPrice || item.price || 0;
      
      if (quantity === 0) {
        outOfStock++;
      } else if (quantity <= minQuantity) {
        lowStock++;
      }
      
      totalValue += quantity * sellPrice;
      
      // Determina categoria
      let categoryId = item.category || item.categoryId || "altro";
      
      // Normalizza categoria
      const categoryLower = categoryId.toLowerCase();
      if (categoryLower.includes("biancheria") || categoryLower.includes("linen") || categoryLower.includes("tessil")) {
        categoryId = "biancheria";
      } else if (categoryLower.includes("puliz") || categoryLower.includes("deterg")) {
        categoryId = "pulizia";
      } else if (categoryLower.includes("consum")) {
        categoryId = "consumabili";
      } else if (!categoriesMap.has(categoryId)) {
        categoryId = "altro";
      }
      
      // Aggiungi item alla categoria
      const category = categoriesMap.get(categoryId);
      if (category) {
        category.items.push({
          id: item.id,
          name: item.name || "Articolo",
          categoryId: categoryId,
          quantity: quantity,
          minQuantity: minQuantity,
          sellPrice: sellPrice,
          unit: item.unit || "pz",
          isForLinen: categoryId === "biancheria" || item.isForLinen || false,
        });
      }
    });
    
    // Converti map in array e rimuovi categorie vuote (opzionale)
    const categories = Array.from(categoriesMap.values());
    
    return NextResponse.json({
      categories,
      stats: {
        totalItems,
        lowStock,
        outOfStock,
        totalValue,
      },
    });
  } catch (error) {
    console.error("Errore caricamento inventario:", error);
    return NextResponse.json({
      categories: defaultCategories.map(c => ({ ...c, items: [] })),
      stats: { totalItems: 0, lowStock: 0, outOfStock: 0, totalValue: 0 },
    });
  }
}
