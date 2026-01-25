import { NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// Categorie (solo struttura, articoli vengono dal DB)
const CATEGORIES = [
  { id: "biancheria_letto", name: "Biancheria Letto", icon: "🛏️", color: "sky", description: "Lenzuola, federe" },
  { id: "biancheria_bagno", name: "Biancheria Bagno", icon: "🛁", color: "emerald", description: "Asciugamani, tappetini, accappatoi" },
  { id: "kit_cortesia", name: "Kit Cortesia", icon: "🧴", color: "violet", description: "Shampoo, bagnoschiuma, saponette" },
  { id: "prodotti_pulizia", name: "Prodotti Pulizia", icon: "🧹", color: "rose", description: "Detergenti, anticalcare, sapone pavimenti" },
  { id: "servizi_extra", name: "Servizi Extra", icon: "🎁", color: "amber", description: "Welcome kit, fiori, frigo pieno" },
  { id: "altro", name: "Altro", icon: "📦", color: "slate", description: "Altri articoli" },
];

export async function GET() {
  try {
    // Leggi SOLO dal database - nessun articolo hardcoded
    const snapshot = await getDocs(collection(db, "inventory"));
    
    const items = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        key: data.key || docSnap.id,
        name: data.name || "Senza nome",
        categoryId: data.categoryId || "altro",
        quantity: data.quantity ?? 0,
        minQuantity: data.minQuantity ?? 5,
        sellPrice: data.sellPrice ?? 0,
        unit: data.unit || "pz",
        isForLinen: data.isForLinen ?? false,
      };
    });

    // Raggruppa per categoria
    const categoriesWithItems = CATEGORIES.map(cat => ({
      ...cat,
      items: items.filter(item => item.categoryId === cat.id),
    }));

    // Calcola stats
    const stats = {
      totalItems: items.length,
      lowStock: items.filter(i => i.quantity > 0 && i.quantity <= i.minQuantity).length,
      outOfStock: items.filter(i => i.quantity === 0).length,
      totalValue: items.reduce((sum, i) => sum + (i.quantity * i.sellPrice), 0),
    };

    return NextResponse.json({ categories: categoriesWithItems, stats });
  } catch (error) {
    console.error("Errore caricamento inventario:", error);
    return NextResponse.json({
      categories: CATEGORIES.map(cat => ({ ...cat, items: [] })),
      stats: { totalItems: 0, lowStock: 0, outOfStock: 0, totalValue: 0 },
    });
  }
}
