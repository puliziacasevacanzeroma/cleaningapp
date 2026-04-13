import { adminDb } from "~/lib/firebase/admin";

/**
 * Carica l'inventario e crea una mappa di risoluzione robusta.
 * Risolve QUALSIASI formato di ID: doc.id, key, name, name lowercase.
 * 
 * Usato da:
 * - /api/orders/[id]/deliver (scarico rider)
 * - /api/cleanings/[id]/complete (scarico pulizia completata)
 * - /api/cron/apply-laundry-inventory (carico lavanderia)
 */
export async function loadInventoryResolver(): Promise<{
  resolveToDocId: (itemIdOrName: string) => string | null;
  nameToDocId: Map<string, string>;
}> {
  const inventorySnap = await adminDb.collection("inventory").get();
  const resolveMap = new Map<string, string>(); // qualsiasi formato → doc.id

  inventorySnap.docs.forEach(doc => {
    const data = doc.data();
    
    // Match esatto per doc.id
    resolveMap.set(doc.id, doc.id);
    
    // Match per key (es. "towelsFace" → "item_towelsFace")
    if (data.key) {
      resolveMap.set(data.key, doc.id);
    }
    
    // Match per name (esatto e lowercase)
    if (data.name) {
      resolveMap.set(data.name, doc.id);
      resolveMap.set(data.name.toLowerCase(), doc.id);
    }
  });

  // Mappa semplice name → docId per retrocompatibilità
  const nameToDocId = new Map<string, string>();
  inventorySnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.name) {
      nameToDocId.set(data.name, doc.id);
      nameToDocId.set(data.name.toLowerCase(), doc.id);
    }
  });

  const resolveToDocId = (itemIdOrName: string): string | null => {
    if (!itemIdOrName) return null;
    // 1. Match esatto
    const exact = resolveMap.get(itemIdOrName);
    if (exact) return exact;
    // 2. Match lowercase
    const lower = resolveMap.get(itemIdOrName.toLowerCase());
    if (lower) return lower;
    // 3. Match con prefisso item_ aggiunto
    const withPrefix = resolveMap.get('item_' + itemIdOrName);
    if (withPrefix) return withPrefix;
    // 4. Match con prefisso item_ rimosso
    if (itemIdOrName.startsWith('item_')) {
      const withoutPrefix = resolveMap.get(itemIdOrName.replace('item_', ''));
      if (withoutPrefix) return withoutPrefix;
    }
    return null;
  };

  return { resolveToDocId, nameToDocId };
}
