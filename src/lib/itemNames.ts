/**
 * 🏷️ ITEM NAMES - Mapping centralizzato ID → Nome italiano
 * 
 * UNICA FONTE DI VERITÀ per i nomi degli articoli.
 * Usato quando si salvano ordini nel database.
 */

export const ITEM_NAMES: Record<string, string> = {
  // ═══════════════════════════════════════
  // BIANCHERIA LETTO
  // ═══════════════════════════════════════
  'doubleSheets': 'Lenzuola Matrimoniali',
  'singleSheets': 'Lenzuola Singole',
  'pillowcases': 'Federe',
  'copripiumino': 'Copripiumino',
  
  // Con prefisso item_
  'item_doubleSheets': 'Lenzuola Matrimoniali',
  'item_singleSheets': 'Lenzuola Singole',
  'item_pillowcases': 'Federe',
  'item_copripiumino': 'Copripiumino',
  
  // Alias italiani
  'lenzuola_matrimoniale': 'Lenzuola Matrimoniali',
  'lenzuola_singolo': 'Lenzuola Singole',
  'federa': 'Federe',
  
  // ═══════════════════════════════════════
  // BIANCHERIA BAGNO
  // ═══════════════════════════════════════
  'towelsLarge': 'Telo Doccia',
  'towelsSmall': 'Asciugamano Bidet',
  'towelsFace': 'Asciugamano Viso',
  'bathMats': 'Tappetino Scendibagno',
  
  // Con prefisso item_
  'item_towelsLarge': 'Telo Doccia',
  'item_towelsSmall': 'Asciugamano Bidet',
  'item_towelsFace': 'Asciugamano Viso',
  'item_bathMats': 'Tappetino Scendibagno',
  
  // Alias italiani
  'asciugamano_grande': 'Telo Doccia',
  'asciugamano_piccolo': 'Asciugamano Bidet',
  'asciugamano_viso': 'Asciugamano Viso',
  'asciugamano_ospite': 'Asciugamano Bidet',
  'telo_doccia': 'Telo Doccia',
  'tappetino_bagno': 'Tappetino Scendibagno',
  
  // ═══════════════════════════════════════
  // KIT CORTESIA
  // ═══════════════════════════════════════
  'shampoo': 'Shampoo',
  'bagnoschiuma': 'Bagnoschiuma',
  'sapone': 'Sapone',
  'crema': 'Crema Corpo',
};

/**
 * Ottiene il nome italiano di un articolo
 * @param itemId - ID dell'articolo
 * @returns Nome italiano o l'ID se non trovato
 */
export function getItemName(itemId: string): string {
  return ITEM_NAMES[itemId] || itemId;
}

/**
 * Traduce un array di items
 */
export function translateItems(items: Array<{id: string; name: string; quantity: number}>): Array<{id: string; name: string; quantity: number}> {
  return items.map(item => ({
    ...item,
    name: ITEM_NAMES[item.id] || ITEM_NAMES[item.name] || item.name
  }));
}
