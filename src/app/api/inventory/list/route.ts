import { NextResponse } from "next/server";
import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// 🔒 ARTICOLI DI SISTEMA - BLINDATI - RICREATI AUTOMATICAMENTE SE MANCANO
const SYSTEM_ITEMS = [
  { id: "item_doubleSheets", key: "doubleSheets", name: "Lenzuola Matrimoniali", categoryId: "biancheria_letto", sellPrice: 8, unit: "set", isForLinen: true },
  { id: "item_singleSheets", key: "singleSheets", name: "Lenzuola Singole", categoryId: "biancheria_letto", sellPrice: 5, unit: "set", isForLinen: true },
  { id: "item_pillowcases", key: "pillowcases", name: "Federe", categoryId: "biancheria_letto", sellPrice: 2, unit: "pz", isForLinen: true },
  { id: "item_towelsLarge", key: "towelsLarge", name: "Telo Doccia", categoryId: "biancheria_bagno", sellPrice: 4, unit: "pz", isForLinen: true },
  { id: "item_towelsFace", key: "towelsFace", name: "Asciugamano Viso", categoryId: "biancheria_bagno", sellPrice: 2, unit: "pz", isForLinen: true },
  { id: "item_towelsSmall", key: "towelsSmall", name: "Asciugamano Bidet", categoryId: "biancheria_bagno", sellPrice: 1.5, unit: "pz", isForLinen: true },
  { id: "item_bathMats", key: "bathMats", name: "Tappetino Scendibagno", categoryId: "biancheria_bagno", sellPrice: 3, unit: "pz", isForLinen: true },
];

// Categorie (solo struttura, articoli vengono dal DB)
const CATEGORIES = [
  { id: "biancheria_letto", name: "Biancheria Letto", icon: "🛏️", color: "sky", description: "Lenzuola, federe" },
  { id: "biancheria_bagno", name: "Biancheria Bagno", icon: "🛁", color: "emerald", description: "Asciugamani, tappetini, accappatoi" },
  { id: "kit_cortesia", name: "Kit Cortesia", icon: "🧴", color: "violet", description: "Shampoo, bagnoschiuma, saponette" },
  { id: "prodotti_pulizia", name: "Prodotti Pulizia", icon: "🧹", color: "rose", description: "Detergenti, anticalcare, sapone pavimenti" },
  { id: "servizi_extra", name: "Servizi Extra", icon: "🎁", color: "amber", description: "Welcome kit, fiori, frigo pieno" },
  { id: "altro", name: "Altro", icon: "📦", color: "slate", description: "Altri articoli" },
];

// 🔒 AUTO-REPAIR: Ricrea articoli di sistema mancanti o corrotti
async function ensureSystemItemsExist() {
  const recreated: string[] = [];
  const fixed: string[] = [];
  
  for (const sysItem of SYSTEM_ITEMS) {
    const docRef = doc(db, "inventory", sysItem.id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      // 🔒 ARTICOLO MANCANTE - RICREA AUTOMATICAMENTE
      await setDoc(docRef, {
        id: sysItem.id,
        key: sysItem.key,
        name: sysItem.name,
        categoryId: sysItem.categoryId,
        sellPrice: sysItem.sellPrice,
        unit: sysItem.unit,
        isForLinen: sysItem.isForLinen,
        isSystemItem: true,
        quantity: 100,
        minQuantity: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      recreated.push(sysItem.name);
      console.log(`🔒 AUTO-REPAIR: Ricreato articolo di sistema "${sysItem.name}"`);
    } else {
      // 🔒 ARTICOLO ESISTE - VERIFICA CHE SIA CORRETTO
      const data = docSnap.data();
      const needsFix = 
        data.name !== sysItem.name || 
        data.categoryId !== sysItem.categoryId ||
        !data.isSystemItem ||
        data.name === 'Senza nome';
      
      if (needsFix) {
        // FIX articolo corrotto
        await setDoc(docRef, {
          ...data,
          id: sysItem.id,
          key: sysItem.key,
          name: sysItem.name,
          categoryId: sysItem.categoryId,
          isForLinen: sysItem.isForLinen,
          isSystemItem: true,
          unit: sysItem.unit,
          sellPrice: data.sellPrice || sysItem.sellPrice,
          quantity: data.quantity ?? 100,
          minQuantity: data.minQuantity ?? 10,
          updatedAt: new Date(),
        }, { merge: false });
        fixed.push(sysItem.name);
        console.log(`🔧 AUTO-REPAIR: Fixato articolo corrotto "${sysItem.name}"`);
      }
    }
  }
  
  return { recreated, fixed };
}

export async function GET() {
  try {
    // 🔒 PRIMA DI TUTTO: Assicurati che tutti gli articoli di sistema esistano e siano corretti
    const repairResult = await ensureSystemItemsExist();
    if (repairResult.recreated.length > 0) {
      console.log(`🔒 AUTO-REPAIR: Ricreati ${repairResult.recreated.length} articoli:`, repairResult.recreated);
    }
    if (repairResult.fixed.length > 0) {
      console.log(`🔧 AUTO-REPAIR: Fixati ${repairResult.fixed.length} articoli corrotti:`, repairResult.fixed);
    }
    
    // Leggi dal database
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
        isSystemItem: data.isSystemItem ?? false,
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

    return NextResponse.json({ categories: categoriesWithItems, stats, autoRepair: repairResult });
  } catch (error) {
    console.error("Errore caricamento inventario:", error);
    return NextResponse.json({
      categories: CATEGORIES.map(cat => ({ ...cat, items: [] })),
      stats: { totalItems: 0, lowStock: 0, outOfStock: 0, totalValue: 0 },
    });
  }
}
