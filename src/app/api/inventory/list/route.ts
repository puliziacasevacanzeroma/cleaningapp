import { NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// ==================== ARTICOLI PREDEFINITI ====================
// Stessi articoli del configuratore biancheria in PropertyServiceConfig
const DEFAULT_ITEMS = [
  // Biancheria Letto
  { id: "default_ls", name: "Lenzuolo Sotto", categoryId: "biancheria_letto", sellPrice: 6, unit: "pz", isForLinen: true, isDefault: true },
  { id: "default_lso", name: "Lenzuolo Sopra", categoryId: "biancheria_letto", sellPrice: 6, unit: "pz", isForLinen: true, isDefault: true },
  { id: "default_cp", name: "Copripiumino", categoryId: "biancheria_letto", sellPrice: 12, unit: "pz", isForLinen: true, isDefault: true },
  { id: "default_fed", name: "Federa", categoryId: "biancheria_letto", sellPrice: 2, unit: "pz", isForLinen: true, isDefault: true },
  
  // Biancheria Bagno
  { id: "default_av", name: "Asciugamano Viso", categoryId: "biancheria_bagno", sellPrice: 2, unit: "pz", isForLinen: true, isDefault: true },
  { id: "default_ao", name: "Asciugamano Ospite", categoryId: "biancheria_bagno", sellPrice: 1.5, unit: "pz", isForLinen: true, isDefault: true },
  { id: "default_td", name: "Telo Doccia", categoryId: "biancheria_bagno", sellPrice: 4, unit: "pz", isForLinen: true, isDefault: true },
  { id: "default_ac", name: "Accappatoio", categoryId: "biancheria_bagno", sellPrice: 6, unit: "pz", isForLinen: true, isDefault: true },
  
  // Kit Cortesia
  { id: "default_sh", name: "Shampoo", categoryId: "kit_cortesia", sellPrice: 1, unit: "pz", isForLinen: false, isDefault: true },
  { id: "default_bg", name: "Bagnoschiuma", categoryId: "kit_cortesia", sellPrice: 1, unit: "pz", isForLinen: false, isDefault: true },
  { id: "default_sp", name: "Saponetta", categoryId: "kit_cortesia", sellPrice: 0.5, unit: "pz", isForLinen: false, isDefault: true },
  { id: "default_cr", name: "Crema Corpo", categoryId: "kit_cortesia", sellPrice: 1.5, unit: "pz", isForLinen: false, isDefault: true },
  
  // Servizi Extra
  { id: "default_welcome", name: "Welcome Kit", categoryId: "servizi_extra", sellPrice: 15, unit: "kit", isForLinen: false, isDefault: true },
  { id: "default_fiori", name: "Fiori Freschi", categoryId: "servizi_extra", sellPrice: 20, unit: "pz", isForLinen: false, isDefault: true },
  { id: "default_frigo", name: "Frigo Pieno", categoryId: "servizi_extra", sellPrice: 50, unit: "kit", isForLinen: false, isDefault: true },
];

// Categorie
const CATEGORIES = [
  { id: "biancheria_letto", name: "Biancheria Letto", icon: "🛏️", color: "sky", description: "Lenzuola, copripiumini, federe" },
  { id: "biancheria_bagno", name: "Biancheria Bagno", icon: "🛁", color: "emerald", description: "Asciugamani, teli, accappatoi" },
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
    // Gli articoli del DB sovrascrivono quelli predefiniti con lo stesso nome
    const dbItemNames = new Set(dbItems.map((item: any) => item.name?.toLowerCase()));
    
    const mergedItems = [
      // Prima gli articoli predefiniti (se non esistono nel DB)
      ...DEFAULT_ITEMS.filter(item => !dbItemNames.has(item.name.toLowerCase())).map(item => ({
        ...item,
        quantity: 100, // Quantità default per articoli predefiniti
        minQuantity: 10,
      })),
      // Poi gli articoli dal database
      ...dbItems.map((item: any) => ({
        id: item.id,
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
