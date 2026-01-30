import { NextResponse } from "next/server";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

/**
 * API per pulire i duplicati nell'inventario
 * Mantiene solo il primo item per ogni key/nome
 */
export async function POST() {
  try {
    const snapshot = await getDocs(collection(db, "inventory"));
    
    const itemsByKey = new Map<string, { id: string; name: string; isSystemItem: boolean }[]>();
    
    // Raggruppa items per key
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const key = data.key || data.name?.toLowerCase().replace(/\s+/g, '_') || docSnap.id;
      
      if (!itemsByKey.has(key)) {
        itemsByKey.set(key, []);
      }
      itemsByKey.get(key)!.push({
        id: docSnap.id,
        name: data.name,
        isSystemItem: data.isSystemItem || false,
      });
    });
    
    const deleted: string[] = [];
    
    // Per ogni gruppo, elimina i duplicati (mantieni il primo o quello di sistema)
    for (const [key, items] of itemsByKey.entries()) {
      if (items.length > 1) {
        console.log(`🔍 Trovati ${items.length} duplicati per key "${key}":`, items.map(i => i.id));
        
        // Ordina: system items prima
        items.sort((a, b) => {
          if (a.isSystemItem && !b.isSystemItem) return -1;
          if (!a.isSystemItem && b.isSystemItem) return 1;
          return 0;
        });
        
        // Mantieni il primo, elimina gli altri
        const toKeep = items[0];
        const toDelete = items.slice(1);
        
        console.log(`   ✅ Mantengo: ${toKeep.id} (${toKeep.name})`);
        
        for (const item of toDelete) {
          console.log(`   🗑️ Elimino: ${item.id} (${item.name})`);
          await deleteDoc(doc(db, "inventory", item.id));
          deleted.push(`${item.name} (${item.id})`);
        }
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      deleted,
      message: deleted.length > 0 
        ? `Eliminati ${deleted.length} duplicati` 
        : "Nessun duplicato trovato"
    });
  } catch (error) {
    console.error("Errore cleanup inventario:", error);
    return NextResponse.json({ error: "Errore durante la pulizia" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const snapshot = await getDocs(collection(db, "inventory"));
    
    const itemsByKey = new Map<string, { id: string; name: string; isSystemItem: boolean }[]>();
    
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const key = data.key || data.name?.toLowerCase().replace(/\s+/g, '_') || docSnap.id;
      
      if (!itemsByKey.has(key)) {
        itemsByKey.set(key, []);
      }
      itemsByKey.get(key)!.push({
        id: docSnap.id,
        name: data.name,
        isSystemItem: data.isSystemItem || false,
      });
    });
    
    const duplicates: { key: string; items: { id: string; name: string }[] }[] = [];
    
    for (const [key, items] of itemsByKey.entries()) {
      if (items.length > 1) {
        duplicates.push({ key, items });
      }
    }
    
    return NextResponse.json({ 
      totalItems: snapshot.docs.length,
      duplicatesFound: duplicates.length,
      duplicates
    });
  } catch (error) {
    console.error("Errore analisi inventario:", error);
    return NextResponse.json({ error: "Errore durante l'analisi" }, { status: 500 });
  }
}
