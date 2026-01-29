import { NextResponse } from "next/server";
import { collection, getDocs, doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { getAllDefaultItems, SYSTEM_ITEM_IDS } from "~/lib/inventory/systemItems";

export const dynamic = 'force-dynamic';

// Usa gli articoli definiti nel file centralizzato
const DEFAULT_ITEMS = getAllDefaultItems();

export async function POST() {
  try {
    // Controlla quali articoli esistono già
    const snapshot = await getDocs(collection(db, "inventory"));
    const existingIds = new Set(snapshot.docs.map(doc => doc.id));
    
    let added = 0;
    let skipped = 0;
    let updated = 0;

    // Inserisci solo quelli che non esistono
    for (const item of DEFAULT_ITEMS) {
      const docRef = doc(db, "inventory", item.id);
      
      if (!existingIds.has(item.id)) {
        // Articolo non esiste, crealo
        await setDoc(docRef, {
          ...item,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        added++;
      } else {
        // Articolo esiste - se è di sistema, assicurati che abbia il flag
        if (SYSTEM_ITEM_IDS.has(item.id)) {
          const existingDoc = await getDoc(docRef);
          const existingData = existingDoc.data();
          
          // Se non ha il flag isSystemItem, aggiungilo
          if (!existingData?.isSystemItem) {
            await updateDoc(docRef, {
              isSystemItem: true,
              updatedAt: new Date(),
            });
            updated++;
            console.log(`🔒 Aggiornato flag isSystemItem per ${item.id}`);
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Seed completato: ${added} articoli aggiunti, ${updated} aggiornati, ${skipped} già esistenti`,
      added,
      updated,
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
    
    // Conta quanti articoli di sistema esistono e hanno il flag corretto
    let systemItemsCount = 0;
    let systemItemsWithFlag = 0;
    
    snapshot.docs.forEach(d => {
      if (SYSTEM_ITEM_IDS.has(d.id)) {
        systemItemsCount++;
        if (d.data().isSystemItem) {
          systemItemsWithFlag++;
        }
      }
    });
    
    return NextResponse.json({ 
      itemsInDb: snapshot.size,
      defaultItemsCount: DEFAULT_ITEMS.length,
      systemItemsExpected: SYSTEM_ITEM_IDS.size,
      systemItemsFound: systemItemsCount,
      systemItemsWithFlag,
      needsSeed: snapshot.size < DEFAULT_ITEMS.length,
      needsFlagUpdate: systemItemsWithFlag < systemItemsCount
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
