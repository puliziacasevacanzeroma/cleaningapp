import { NextResponse } from "next/server";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

/**
 * INVENTARIO COMPLETO - ARTICOLI PER BIANCHERIA
 * 
 * IMPORTANTE: I nomi devono contenere le keyword cercate nel PropertyServiceConfig:
 * 
 * BIANCHERIA LETTO:
 * - "matrimoniale" o "matr" → per lenzuola matrimoniali
 * - "singolo" o "sing" → per lenzuola singole  
 * - "federa" → per federe
 * 
 * BIANCHERIA BAGNO:
 * - "corpo", "doccia", "grande" → per asciugamani grandi/teli doccia
 * - "viso" → per asciugamani viso
 * - "bidet", "piccoli" → per asciugamani piccoli/bidet
 * - "tappetino", "scendi" → per tappetini/scendibagno
 */

const DEFAULT_ITEMS = [
  // ==================== BIANCHERIA LETTO ====================
  { 
    id: "lenzuola_matrimoniali", 
    key: "doubleSheets", 
    name: "Set Lenzuola Matrimoniali", // contiene "matrimoniali"
    categoryId: "biancheria_letto", 
    sellPrice: 8, 
    unit: "set", 
    isForLinen: true, 
    quantity: 100, 
    minQuantity: 10,
    description: "Set completo: lenzuolo sotto + lenzuolo sopra + copripiumino per letto matrimoniale"
  },
  { 
    id: "lenzuola_singole", 
    key: "singleSheets", 
    name: "Set Lenzuola Singole", // contiene "singole"
    categoryId: "biancheria_letto", 
    sellPrice: 5, 
    unit: "set", 
    isForLinen: true, 
    quantity: 100, 
    minQuantity: 10,
    description: "Set completo: lenzuolo sotto + lenzuolo sopra + copripiumino per letto singolo"
  },
  { 
    id: "federe", 
    key: "pillowcases", 
    name: "Federe Cuscino", // contiene "federe"
    categoryId: "biancheria_letto", 
    sellPrice: 2, 
    unit: "pz", 
    isForLinen: true, 
    quantity: 200, 
    minQuantity: 20,
    description: "Federa per cuscino standard"
  },
  
  // ==================== BIANCHERIA BAGNO ====================
  { 
    id: "telo_doccia", 
    key: "towelsLarge", 
    name: "Telo Doccia Grande", // contiene "doccia" e "grande"
    categoryId: "biancheria_bagno", 
    sellPrice: 4, 
    unit: "pz", 
    isForLinen: true, 
    quantity: 100, 
    minQuantity: 10,
    description: "Telo doccia/corpo grande 70x140cm"
  },
  { 
    id: "asciugamano_viso", 
    key: "towelsFace", 
    name: "Asciugamano Viso", // contiene "viso"
    categoryId: "biancheria_bagno", 
    sellPrice: 2, 
    unit: "pz", 
    isForLinen: true, 
    quantity: 100, 
    minQuantity: 10,
    description: "Asciugamano viso medio 50x100cm"
  },
  { 
    id: "asciugamano_bidet", 
    key: "towelsSmall", 
    name: "Asciugamano Piccolo Bidet", // contiene "piccolo" e "bidet"
    categoryId: "biancheria_bagno", 
    sellPrice: 2, 
    unit: "pz", 
    isForLinen: true, 
    quantity: 100, 
    minQuantity: 10,
    description: "Asciugamano piccolo per bidet 40x60cm"
  },
  { 
    id: "tappetino_bagno", 
    key: "bathMats", 
    name: "Tappetino Scendibagno", // contiene "tappetino" e "scendi"
    categoryId: "biancheria_bagno", 
    sellPrice: 3, 
    unit: "pz", 
    isForLinen: true, 
    quantity: 50, 
    minQuantity: 10,
    description: "Tappetino/scendibagno antiscivolo"
  },
  { 
    id: "accappatoio", 
    key: "bathrobe", 
    name: "Accappatoio", 
    categoryId: "biancheria_bagno", 
    sellPrice: 6, 
    unit: "pz", 
    isForLinen: true, 
    quantity: 50, 
    minQuantity: 10,
    description: "Accappatoio in spugna taglia unica"
  },
  
  // ==================== KIT CORTESIA ====================
  { 
    id: "shampoo", 
    key: "shampoo", 
    name: "Shampoo Monodose", 
    categoryId: "kit_cortesia", 
    sellPrice: 1, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 200, 
    minQuantity: 50,
    description: "Shampoo monodose 30ml"
  },
  { 
    id: "bagnoschiuma", 
    key: "bagnoschiuma", 
    name: "Bagnoschiuma Monodose", 
    categoryId: "kit_cortesia", 
    sellPrice: 1, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 200, 
    minQuantity: 50,
    description: "Bagnoschiuma monodose 30ml"
  },
  { 
    id: "saponetta", 
    key: "saponetta", 
    name: "Saponetta", 
    categoryId: "kit_cortesia", 
    sellPrice: 0.5, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 200, 
    minQuantity: 50,
    description: "Saponetta profumata 20g"
  },
  { 
    id: "crema_corpo", 
    key: "crema", 
    name: "Crema Corpo", 
    categoryId: "kit_cortesia", 
    sellPrice: 1.5, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 100, 
    minQuantity: 30,
    description: "Crema corpo monodose 30ml"
  },
  { 
    id: "cuffia_doccia", 
    key: "cuffia", 
    name: "Cuffia Doccia", 
    categoryId: "kit_cortesia", 
    sellPrice: 0.3, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 100, 
    minQuantity: 30,
    description: "Cuffia doccia monouso"
  },
  { 
    id: "kit_cucito", 
    key: "cucito", 
    name: "Kit Cucito", 
    categoryId: "kit_cortesia", 
    sellPrice: 0.5, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 50, 
    minQuantity: 20,
    description: "Mini kit cucito di emergenza"
  },
  
  // ==================== PRODOTTI PULIZIA ====================
  { 
    id: "detergente_multiuso", 
    key: "multiuso", 
    name: "Detergente Multiuso", 
    categoryId: "prodotti_pulizia", 
    sellPrice: 3, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 50, 
    minQuantity: 10,
    description: "Detergente multiuso spray 750ml"
  },
  { 
    id: "anticalcare", 
    key: "anticalcare", 
    name: "Anticalcare Bagno", 
    categoryId: "prodotti_pulizia", 
    sellPrice: 3.5, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 30, 
    minQuantity: 10,
    description: "Anticalcare spray 750ml"
  },
  { 
    id: "sapone_pavimenti", 
    key: "pavimenti", 
    name: "Sapone Pavimenti", 
    categoryId: "prodotti_pulizia", 
    sellPrice: 4, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 20, 
    minQuantity: 5,
    description: "Detergente pavimenti 1L"
  },
  { 
    id: "sgrassatore", 
    key: "sgrassatore", 
    name: "Sgrassatore Cucina", 
    categoryId: "prodotti_pulizia", 
    sellPrice: 3.5, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 30, 
    minQuantity: 10,
    description: "Sgrassatore spray 750ml"
  },
  
  // ==================== SERVIZI EXTRA ====================
  { 
    id: "welcome_kit", 
    key: "welcome", 
    name: "Welcome Kit", 
    categoryId: "servizi_extra", 
    sellPrice: 15, 
    unit: "kit", 
    isForLinen: false, 
    quantity: 20, 
    minQuantity: 5,
    description: "Kit benvenuto con snack e bevande"
  },
  { 
    id: "fiori_freschi", 
    key: "fiori", 
    name: "Fiori Freschi", 
    categoryId: "servizi_extra", 
    sellPrice: 20, 
    unit: "pz", 
    isForLinen: false, 
    quantity: 10, 
    minQuantity: 5,
    description: "Bouquet fiori freschi"
  },
  { 
    id: "frigo_pieno", 
    key: "frigo", 
    name: "Frigo Pieno", 
    categoryId: "servizi_extra", 
    sellPrice: 50, 
    unit: "kit", 
    isForLinen: false, 
    quantity: 5, 
    minQuantity: 2,
    description: "Frigorifero rifornito con prodotti base"
  },
  { 
    id: "colazione", 
    key: "colazione", 
    name: "Kit Colazione", 
    categoryId: "servizi_extra", 
    sellPrice: 12, 
    unit: "kit", 
    isForLinen: false, 
    quantity: 15, 
    minQuantity: 5,
    description: "Kit colazione con caffè, tè, biscotti e marmellate"
  },
];

// POST - Seed inventario (aggiunge solo articoli mancanti)
export async function POST() {
  try {
    // Controlla quali articoli esistono già
    const snapshot = await getDocs(collection(db, "inventory"));
    const existingIds = new Set(snapshot.docs.map(doc => doc.id));
    
    let added = 0;
    let skipped = 0;
    const addedItems: string[] = [];
    const skippedItems: string[] = [];

    // Inserisci solo quelli che non esistono
    for (const item of DEFAULT_ITEMS) {
      if (!existingIds.has(item.id)) {
        await setDoc(doc(db, "inventory", item.id), {
          ...item,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        added++;
        addedItems.push(item.name);
      } else {
        skipped++;
        skippedItems.push(item.name);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Seed completato: ${added} articoli aggiunti, ${skipped} già esistenti`,
      added,
      skipped,
      total: DEFAULT_ITEMS.length,
      addedItems,
      skippedItems: skipped > 0 ? skippedItems : undefined
    });
  } catch (error: any) {
    console.error("Errore seed inventario:", error);
    return NextResponse.json({ error: error.message || "Errore durante il seed" }, { status: 500 });
  }
}

// GET - Verifica stato inventario
export async function GET() {
  try {
    const snapshot = await getDocs(collection(db, "inventory"));
    const existingItems = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      category: doc.data().categoryId
    }));
    
    // Trova articoli mancanti
    const existingIds = new Set(snapshot.docs.map(doc => doc.id));
    const missingItems = DEFAULT_ITEMS.filter(item => !existingIds.has(item.id));
    
    return NextResponse.json({ 
      itemsInDb: snapshot.size,
      defaultItemsCount: DEFAULT_ITEMS.length,
      needsSeed: missingItems.length > 0,
      missingCount: missingItems.length,
      missingItems: missingItems.map(i => ({ id: i.id, name: i.name, category: i.categoryId })),
      existingItems
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Reset completo inventario (ATTENZIONE: cancella tutto e ricrea)
export async function DELETE() {
  try {
    // Cancella tutti gli articoli esistenti
    const snapshot = await getDocs(collection(db, "inventory"));
    let deleted = 0;
    
    for (const docSnap of snapshot.docs) {
      await deleteDoc(doc(db, "inventory", docSnap.id));
      deleted++;
    }
    
    // Ricrea tutti gli articoli di default
    let added = 0;
    for (const item of DEFAULT_ITEMS) {
      await setDoc(doc(db, "inventory", item.id), {
        ...item,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      added++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Reset completato: ${deleted} articoli eliminati, ${added} articoli creati`,
      deleted,
      added
    });
  } catch (error: any) {
    console.error("Errore reset inventario:", error);
    return NextResponse.json({ error: error.message || "Errore durante il reset" }, { status: 500 });
  }
}
