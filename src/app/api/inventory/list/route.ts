import { NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// ==================== ARTICOLI PREDEFINITI ====================
// ALLINEATI con il BiancheriaConfigurator
const DEFAULT_ITEMS = [
  // Biancheria Letto (stessi del configuratore)
  { id: "default_singleSheets", key: "singleSheets", name: "Lenzuola Singole", categoryId: "biancheria_letto", sellPrice: 5, unit: "set", isForLinen: true, isDefault: true },
  { id: "default_doubleSheets", key: "doubleSheets", name: "Lenzuola Matrimoniali", categoryId: "biancheria_letto", sellPrice: 8, unit: "set", isForLinen: true, isDefault: true },
  { id: "default_pillowcases", key: "pillowcases", name: "Federe", categoryId: "biancheria_letto", sellPrice: 2, unit: "pz", isForLinen: true, isDefault: true },
  
  // Biancheria Bagno (stessi del configuratore)
  { id: "default_towelsLarge", key: "towelsLarge", name: "Asciugamani Grandi", categoryId: "biancheria_bagno", sellPrice: 4, unit: "pz", isForLinen: true, isDefault: true },
  { id: "default_towelsSmall", key: "towelsSmall", name: "Asciugamani Piccoli", categoryId: "biancheria_bagno", sellPrice: 2, unit: "pz", isForLinen: true, isDefault: true },
  { id: "default_towelsFace", key: "towelsFace", name: "Asciugamani Viso", categoryId: "biancheria_bagno", sellPrice: 2, unit: "pz", isForLinen: true, isDefault: true },
  { id: "default_bathMats", key: "bathMats", name: "Tappetini Bagno", categoryId: "biancheria_bagno", sellPrice: 3, unit: "pz", isForLinen: true, isDefault: true },
  { id: "default_bathrobe", key: "bathrobe", name: "Accappatoi", categoryId: "biancheria_bagno", sellPrice: 6, unit: "pz", isForLinen: true, isDefault: true },
  
  // Kit Cortesia
  { id: "default_shampoo", key: "shampoo", name: "Shampoo", categoryId: "kit_cortesia", sellPrice: 1, unit: "pz", isForLinen: false, isDefault: true },
  { id: "default_bagnoschiuma", key: "bagnoschiuma", name: "Bagnoschiuma", categoryId: "kit_cortesia", sellPrice: 1, unit: "pz", isForLinen: false, isDefault: true },
  { id: "default_saponetta", key: "saponetta", name: "Saponetta", categoryId: "kit_cortesia", sellPrice: 0.5, unit: "pz", isForLinen: false, isDefault: true },
  { id: "default_crema", key: "crema", name: "Crema Corpo", categoryId: "kit_cortesia", sellPrice: 1.5, unit: "pz", isForLinen: false, isDefault: true },
  
  // Servizi Extra
  { id: "default_welcome", key: "welcome", name: "Welcome Kit", categoryId: "servizi_extra", sellPrice: 15, unit: "kit", isForLinen: false, isDefault: true },
  { id: "default_fiori", key: "fiori", name: "Fiori Freschi", categoryId: "servizi_extra", sellPrice: 20, unit: "pz", isForLinen: false, isDefault: true },
  { id: "default_frigo", key: "frigo", name: "Frigo Pieno", categoryId: "servizi_extra", sellPrice: 50, unit: "kit", isForLinen: false, isDefault: true },
];

// Categorie
const CATEGORIES = [
  { id: "biancheria_letto", name: "Biancheria Letto", icon: "🛏️", color: "sky", description: "Lenzuola, federe" },
  { id: "biancheria_bagno", name: "Biancheria Bagno", icon: "🛁", color: "emerald", description: "Asciugamani, tappetini, accappatoi" },
  { id: "kit_cortesia", name: "Kit Cortesia", icon: "🧴", color: "violet", description: "Shampoo, bagnoschiuma, saponette" },
  { id: "servizi_extra", name: "Servizi Extra", icon: "🎁", color: "amber", description: "Welcome kit, fiori, frigo pieno" },
  { id: "altro", name: "Altro", icon: "📦", color: "slate", description: "Altri articoli" },
];

export async function GET() {
  try {
    // 1. Leggi articoli dal database
    const snapshot = await getDocs(collection(db, "inventory"));
    const dbItems = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      isDefault: false,
    }));

    // 2. Merge: articoli predefiniti + quelli del database
    const dbItemNames = new Set(dbItems.map((item: any) => item.name?.toLowerCase()));
    
    const mergedItems = [
      // Prima gli articoli predefiniti (se non esistono nel DB)
      ...DEFAULT_ITEMS.filter(item => !dbItemNames.has(item.name.toLowerCase())).map(item => ({
        ...item,
        quantity: 100,
        minQuantity: 10,
      })),
      // Poi gli articoli dal database
      ...dbItems.map((item: any) => ({
        id: item.id,
        key: item.key || item.id,
        name: item.name || "Senza nome",
        categoryId: item.categoryId || item.category || "altro",
        quantity: item.quantity ?? 0,
        minQuantity: item.minQuantity ?? 5,
        sellPrice: item.sellPrice ?? 0,
        unit: item.unit || "pz",
        isForLinen: item.isForLinen ?? false,
        isDefault: false,
      })),
    ];

    // 3. Raggruppa per categoria
    const categoriesWithItems = CATEGORIES.map(cat => ({
      ...cat,
      items: mergedItems.filter(item => item.categoryId === cat.id),
    }));

    // 4. Calcola stats
    const allItems = mergedItems;
    const stats = {
      totalItems: allItems.length,
      lowStock: allItems.filter((i: any) => i.quantity > 0 && i.quantity <= i.minQuantity).length,
      outOfStock: allItems.filter((i: any) => i.quantity === 0).length,
      totalValue: allItems.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.sellPrice || 0)), 0),
    };

    return NextResponse.json({ categories: categoriesWithItems, stats });
  } catch (error) {
    console.error("Errore caricamento inventario:", error);
    return NextResponse.json({
      categories: CATEGORIES.map(cat => ({ 
        ...cat, 
        items: DEFAULT_ITEMS.filter(i => i.categoryId === cat.id).map(i => ({ ...i, quantity: 100, minQuantity: 10 }))
      })),
      stats: { totalItems: DEFAULT_ITEMS.length, lowStock: 0, outOfStock: 0, totalValue: 0 },
    });
  }
}
