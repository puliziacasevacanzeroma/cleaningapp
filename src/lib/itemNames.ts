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
  'copripiumino_matrimoniale': 'Copripiumino Matrimoniale',
  'copripiumino_singolo': 'Copripiumino Singolo',
  
  // Con prefisso item_
  'item_doubleSheets': 'Lenzuola Matrimoniali',
  'item_singleSheets': 'Lenzuola Singole',
  'item_pillowcases': 'Federe',
  'item_copripiumino': 'Copripiumino',
  'item_copripiumino_matrimoniale': 'Copripiumino Matrimoniale',
  'item_copripiumino_singolo': 'Copripiumino Singolo',
  
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
 * 🔍 Controlla se una stringa sembra un Document ID Firestore
 * I Firestore auto-generated IDs sono 20 caratteri alfanumerici (a-zA-Z0-9)
 */
export function looksLikeFirestoreId(value: string | undefined | null): boolean {
  if (!value) return false;
  // Firestore auto-IDs: esattamente 20 chars, solo lettere e numeri
  // Alcuni possono essere leggermente diversi, usiamo >= 15 chars alfanumerici come soglia
  return /^[a-zA-Z0-9]{15,}$/.test(value);
}

/**
 * Ottiene il nome italiano di un articolo
 * @param itemId - ID dell'articolo
 * @returns Nome italiano o l'ID se non trovato
 */
export function getItemName(itemId: string): string {
  return ITEM_NAMES[itemId] || itemId;
}

/**
 * 🏷️ Risolve il nome visualizzabile di un item, SENZA MAI mostrare un ID Firestore
 * 
 * Strategia:
 * 1. Prova getItemName(id) → se traduce, usa quello
 * 2. Prova getItemName(name) → se traduce, usa quello
 * 3. Se name è un nome leggibile (non un ID Firestore), usa name
 * 4. Se id è un nome leggibile (non un ID Firestore), usa id  
 * 5. Ultimo fallback: "Articolo"
 */
export function resolveItemDisplayName(id?: string | null, name?: string | null): string {
  // 1. Prova traduzione dell'id
  if (id && ITEM_NAMES[id]) {
    return ITEM_NAMES[id];
  }
  
  // 2. Prova traduzione del name (potrebbe essere un key come "towelsLarge")
  if (name && ITEM_NAMES[name]) {
    return ITEM_NAMES[name];
  }
  
  // 3. Se name esiste e NON sembra un Firestore ID, usalo come nome leggibile
  if (name && !looksLikeFirestoreId(name)) {
    return name;
  }
  
  // 4. Se id esiste e NON sembra un Firestore ID, usalo come nome leggibile
  if (id && !looksLikeFirestoreId(id)) {
    return id;
  }
  
  // 5. Ultimo fallback
  return 'Articolo';
}

/**
 * Traduce un array di items
 */
export function translateItems(items: Array<{id: string; name: string; quantity: number}>): Array<{id: string; name: string; quantity: number}> {
  return items.map(item => ({
    ...item,
    name: resolveItemDisplayName(item.id, item.name)
  }));
}
