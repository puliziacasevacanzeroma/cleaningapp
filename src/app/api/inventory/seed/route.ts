import { NextResponse } from "next/server";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// Articoli predefiniti da inserire nel database
const DEFAULT_ITEMS = [
  // Biancheria Letto
  { id: "item_singleSheets", key: "singleSheets", name: "Lenzuola Singole", categoryId: "biancheria_letto", sellPrice: 5, unit: "set", isForLinen: true, quantity: 100, minQuantity: 10 },
  { id: "item_doubleSheets", key: "doubleSheets", name: "Lenzuola Matrimoniali", categoryId: "biancheria_letto", sellPrice: 8, unit: "set", isForLinen: true, quantity: 100, minQuantity: 10 },
  { id: "item_pillowcases", key: "pillowcases", name: "Federe", categoryId: "biancheria_letto", sellPrice: 2, unit: "pz", isForLinen: true, quantity: 100, minQuantity: 10 },
  
  // Biancheria Bagno
  { id: "item_towelsLarge", key: "towelsLarge", name: "Asciugamani Grandi", categoryId: "biancheria_bagno", sellPrice: 4, unit: "pz", isForLinen: true, quantity: 100, minQuantity: 10 },
  { id: "item_towelsSmall", key: "towelsSmall", name: "Asciugamani Piccoli", categoryId: "biancheria_bagno", sellPrice: 2, unit: "pz", isForLinen: true, quantity: 100, minQuantity: 10 },
  { id: "item_towelsFace", key: "towelsFace", name: "Asciugamani Viso", categoryId: "biancheria_bagno", sellPrice: 2, unit: "pz", isForLinen: true, quantity: 100, minQuantity: 10 },
  { id: "item_bathMats", key: "bathMats", name: "Tappetini Bagno", categoryId: "biancheria_bagno", sellPrice: 3, unit: "pz", isForLinen: true, quantity: 100, minQuantity: 10 },
  { id: "item_bathrobe", key: "bathrobe", name: "Accappatoi", categoryId: "biancheria_bagno", sellPrice: 6, unit: "pz", isForLinen: true, quantity: 100, minQuantity: 10 },
  
  // Kit Cortesia
  { id: "item_shampoo", key: "shampoo", name: "Shampoo", categoryId: "kit_cortesia", sellPrice: 1, unit: "pz", isForLinen: false, quantity: 100, minQuantity: 20 },
  { id: "item_bagnoschiuma", key: "bagnoschiuma", name: "Bagnoschiuma", categoryId: "kit_cortesia", sellPrice: 1, unit: "pz", isForLinen: false, quantity: 100, minQuantity: 20 },
  { id: "item_saponetta", key: "saponetta", name: "Saponetta", categoryId: "kit_cortesia", sellPrice: 0.5, unit: "pz", isForLinen: false, quantity: 100, minQuantity: 20 },
  { id: "item_crema", key: "crema", name: "Crema Corpo", categoryId: "kit_cortesia", sellPrice: 1.5, unit: "pz", isForLinen: false, quantity: 100, minQuantity: 20 },
  
  // Servizi Extra
  { id: "item_welcome", key: "welcome", name: "Welcome Kit", categoryId: "servizi_extra", sellPrice: 15, unit: "kit", isForLinen: false, quantity: 50, minQuantity: 10 },
  { id: "item_fiori", key: "fiori", name: "Fiori Freschi", categoryId: "servizi_extra", sellPrice: 20, unit: "pz", isForLinen: false, quantity: 20, minQuantity: 5 },
  { id: "item_frigo", key: "frigo", name: "Frigo Pieno", categoryId: "servizi_extra", sellPrice: 50, unit: "kit", isForLinen: false, quantity: 10, minQuantity: 5 },
];

export async function POST() {
  try {
    // Controlla quali articoli esistono già
    const snapshot = await getDocs(collection(db, "inventory"));
    const existingIds = new Set(snapshot.docs.map(doc => doc.id));
    
    let added = 0;
    let skipped = 0;

    // Inserisci solo quelli che non esistono
    for (const item of DEFAULT_ITEMS) {
      if (!existingIds.has(item.id)) {
        await setDoc(doc(db, "inventory", item.id), {
          ...item,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        added++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Seed completato: ${added} articoli aggiunti, ${skipped} già esistenti`,
      added,
      skipped,
      total: DEFAULT_ITEMS.length
    });
  } catch (error: any) {
    console.error("Errore seed inventario:", error);
    return NextResponse.json({ error: error.message || "Errore durante il seed" }, { status: 500 });
  }
}

// GET per verificare stato
export async function GET() {
  try {
    const snapshot = await getDocs(collection(db, "inventory"));
    return NextResponse.json({ 
      itemsInDb: snapshot.size,
      defaultItemsCount: DEFAULT_ITEMS.length,
      needsSeed: snapshot.size < DEFAULT_ITEMS.length
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
