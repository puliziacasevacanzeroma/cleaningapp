import { NextResponse } from "next/server";
import { collection, getDocs, deleteDoc, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// Articoli di sistema OBBLIGATORI
const SYSTEM_ITEMS = [
  { id: "item_doubleSheets", key: "doubleSheets", name: "Lenzuola Matrimoniali", categoryId: "biancheria_letto", sellPrice: 8, unit: "set", isForLinen: true, isSystemItem: true, quantity: 100, minQuantity: 10 },
  { id: "item_singleSheets", key: "singleSheets", name: "Lenzuola Singole", categoryId: "biancheria_letto", sellPrice: 5, unit: "set", isForLinen: true, isSystemItem: true, quantity: 100, minQuantity: 10 },
  { id: "item_pillowcases", key: "pillowcases", name: "Federe", categoryId: "biancheria_letto", sellPrice: 2, unit: "pz", isForLinen: true, isSystemItem: true, quantity: 100, minQuantity: 10 },
  { id: "item_towelsLarge", key: "towelsLarge", name: "Telo Doccia", categoryId: "biancheria_bagno", sellPrice: 4, unit: "pz", isForLinen: true, isSystemItem: true, quantity: 100, minQuantity: 10 },
  { id: "item_towelsFace", key: "towelsFace", name: "Asciugamano Viso", categoryId: "biancheria_bagno", sellPrice: 2, unit: "pz", isForLinen: true, isSystemItem: true, quantity: 100, minQuantity: 10 },
  { id: "item_towelsSmall", key: "towelsSmall", name: "Asciugamano Bidet", categoryId: "biancheria_bagno", sellPrice: 1.5, unit: "pz", isForLinen: true, isSystemItem: true, quantity: 100, minQuantity: 10 },
  { id: "item_bathMats", key: "bathMats", name: "Tappetino Scendibagno", categoryId: "biancheria_bagno", sellPrice: 3, unit: "pz", isForLinen: true, isSystemItem: true, quantity: 100, minQuantity: 10 },
];

const SYSTEM_ITEM_IDS = new Set(SYSTEM_ITEMS.map(i => i.id));
const SYSTEM_ITEM_NAMES = new Set(SYSTEM_ITEMS.map(i => i.name.toLowerCase()));

// GET - Mostra stato attuale
export async function GET() {
  try {
    const snapshot = await getDocs(collection(db, "inventory"));
    
    const items = snapshot.docs.map(d => ({
      id: d.id,
      name: d.data().name,
      isSystemItem: d.data().isSystemItem,
      sellPrice: d.data().sellPrice,
    }));
    
    // Trova articoli di sistema mancanti
    const existingSystemIds = new Set(items.filter(i => SYSTEM_ITEM_IDS.has(i.id)).map(i => i.id));
    const missingSystemItems = SYSTEM_ITEMS.filter(i => !existingSystemIds.has(i.id));
    
    // Trova duplicati da eliminare (articoli con nome uguale a quelli di sistema ma ID diverso)
    const duplicatesToDelete = items.filter(i => {
      const nameLower = (i.name || '').toLowerCase();
      return SYSTEM_ITEM_NAMES.has(nameLower) && !SYSTEM_ITEM_IDS.has(i.id);
    });
    
    // Trova altri articoli non di sistema
    const otherItems = items.filter(i => {
      const nameLower = (i.name || '').toLowerCase();
      return !SYSTEM_ITEM_IDS.has(i.id) && !SYSTEM_ITEM_NAMES.has(nameLower);
    });
    
    return NextResponse.json({
      totalItems: items.length,
      systemItemsFound: existingSystemIds.size,
      systemItemsExpected: SYSTEM_ITEMS.length,
      missingSystemItems: missingSystemItems.map(i => i.name),
      duplicatesToDelete: duplicatesToDelete.map(i => ({ id: i.id, name: i.name, price: i.sellPrice })),
      otherItems: otherItems.map(i => ({ id: i.id, name: i.name })),
      hint: "Usa POST per riparare: elimina duplicati e ricrea articoli mancanti"
    });
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Ripara inventario
export async function POST() {
  try {
    const snapshot = await getDocs(collection(db, "inventory"));
    
    const items = snapshot.docs.map(d => ({
      id: d.id,
      name: d.data().name,
      data: d.data(),
    }));
    
    let deleted = 0;
    let created = 0;
    let updated = 0;
    const actions: string[] = [];
    
    // 1. ELIMINA DUPLICATI (articoli con nome di sistema ma ID sbagliato)
    for (const item of items) {
      const nameLower = (item.name || '').toLowerCase();
      if (SYSTEM_ITEM_NAMES.has(nameLower) && !SYSTEM_ITEM_IDS.has(item.id)) {
        await deleteDoc(doc(db, "inventory", item.id));
        actions.push(`❌ Eliminato duplicato: ${item.name} (${item.id})`);
        deleted++;
      }
    }
    
    // 2. CREA/AGGIORNA ARTICOLI DI SISTEMA
    for (const sysItem of SYSTEM_ITEMS) {
      const docRef = doc(db, "inventory", sysItem.id);
      const existing = await getDoc(docRef);
      
      if (!existing.exists()) {
        // Non esiste - crealo
        await setDoc(docRef, {
          ...sysItem,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        actions.push(`✅ Creato: ${sysItem.name}`);
        created++;
      } else {
        // Esiste - assicurati che abbia isSystemItem = true
        const data = existing.data();
        if (!data.isSystemItem) {
          await setDoc(docRef, {
            ...data,
            isSystemItem: true,
            updatedAt: new Date(),
          }, { merge: true });
          actions.push(`🔧 Aggiornato flag: ${sysItem.name}`);
          updated++;
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Riparazione completata!`,
      deleted,
      created,
      updated,
      actions
    });
    
  } catch (error: any) {
    console.error("Errore riparazione inventario:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
