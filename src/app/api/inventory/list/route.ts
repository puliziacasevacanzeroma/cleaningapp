import { NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// Categorie predefinite
const DEFAULT_CATEGORIES = [
  { id: "biancheria_letto", name: "Biancheria Letto", icon: "🛏️", color: "sky" },
  { id: "biancheria_bagno", name: "Biancheria Bagno", icon: "🛁", color: "emerald" },
  { id: "kit_cortesia", name: "Kit Cortesia", icon: "🧴", color: "violet" },
  { id: "servizi_extra", name: "Servizi Extra", icon: "🎁", color: "amber" },
  { id: "altro", name: "Altro", icon: "📦", color: "slate" },
];

export async function GET() {
  try {
    // Leggi articoli dal database
    const snapshot = await getDocs(collection(db, "inventory"));
    const dbItems = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Raggruppa per categoria
    const categoriesMap = new Map<string, any[]>();
    
    // Inizializza tutte le categorie
    DEFAULT_CATEGORIES.forEach(cat => {
      categoriesMap.set(cat.id, []);
    });

    // Assegna articoli alle categorie
    dbItems.forEach((item: any) => {
      const catId = item.categoryId || item.category || "altro";
      if (!categoriesMap.has(catId)) {
        categoriesMap.set(catId, []);
      }
      categoriesMap.get(catId)?.push({
        id: item.id,
        name: item.name || "Senza nome",
        categoryId: catId,
        quantity: item.quantity ?? 0,
        minQuantity: item.minQuantity ?? 5,
        sellPrice: item.sellPrice ?? 0,
        unit: item.unit || "pz",
        isForLinen: item.isForLinen ?? false,
      });
    });

    // Costruisci risposta con categorie
    const categories = DEFAULT_CATEGORIES.map(cat => ({
      ...cat,
      items: categoriesMap.get(cat.id) || [],
    })).filter(cat => cat.items.length > 0 || ["biancheria_letto", "biancheria_bagno", "kit_cortesia", "servizi_extra"].includes(cat.id));

    // Calcola stats
    const allItems = Array.from(categoriesMap.values()).flat();
    const stats = {
      totalItems: allItems.length,
      lowStock: allItems.filter((i: any) => i.quantity > 0 && i.quantity <= i.minQuantity).length,
      outOfStock: allItems.filter((i: any) => i.quantity === 0).length,
      totalValue: allItems.reduce((sum: number, i: any) => sum + (i.quantity * i.sellPrice), 0),
    };

    return NextResponse.json({ categories, stats });
  } catch (error) {
    console.error("Errore caricamento inventario:", error);
    return NextResponse.json({
      categories: DEFAULT_CATEGORIES.map(cat => ({ ...cat, items: [] })),
      stats: { totalItems: 0, lowStock: 0, outOfStock: 0, totalValue: 0 },
    });
  }
}
