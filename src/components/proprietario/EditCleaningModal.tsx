"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { doc, updateDoc, deleteDoc, collection, query, where, getDocs, getDoc, Timestamp, deleteField, addDoc} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { SGROSSO_REASONS} from "~/types/serviceType";
import { PhotoLightbox } from "~/components/ui/PhotoLightbox";
import SmartImage from "~/components/ui/SmartImage";
import CleaningRatingBadge from "~/components/cleaning/CleaningRatingBadge";
import { getItemName } from "~/lib/itemNames";
import { browserCacheGet, browserCacheSet } from "~/lib/browserCache";

// @ts-expect-error TODO-FIX: TS2305 Module '"~/types/cleaning"' has no exported member 'SgrossoReasonCode'.
import type { SgrossoReasonCode } from "~/types/cleaning";

// 🧺 Import dal modulo centralizzato biancheria
import { 
  generateAutoBeds as generateAutoBedsFromLib,
  getLinenForBedType as getLinenForBedTypeFromLib,
  mapBedLinenToInventory,
  calculateBathLinen,
  findItemByKeywords,
  ITEM_KEYWORDS,
  type PropertyBed
} from "~/lib/linen";

// ==================== BROWSER CACHE KEYS & TTL ====================
// Usa window.__appCache__ → sopravvive al lazy-loading dei moduli React
const CACHE_KEY_INVENTORY = 'modal:inventory';
const CACHE_KEY_SERVICE_TYPES = 'modal:serviceTypes';
const CACHE_TTL_INVENTORY = 10 * 60 * 1000;    // 10 minuti
const CACHE_TTL_SERVICE_TYPES = 10 * 60 * 1000; // 10 minuti
const CACHE_TTL_CLEANINGS = 60 * 1000;           // 60 secondi

// ==================== ICONS ====================
const I: { [key: string]: React.ReactNode } = {
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  bedSingle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M5 18V13C5 12 6 11 7 11H17C18 11 19 12 19 13V18M5 20V18M19 20V18M8 11V9C8 8 9 7 10 7H14C15 7 16 8 16 9V11"/><rect x="8" y="11" width="8" height="3" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  bedDouble: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/><path d="M12 10V7"/></svg>,
  sofa: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 12V10C4 9 5 8 6 8H18C19 8 20 9 20 10V12"/><rect x="4" y="12" width="16" height="5" rx="1" fill="currentColor" opacity="0.15"/><path d="M6 17V19M18 17V19"/></svg>,
  bunk: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 22V2M20 22V2M4 14H20M4 8H20"/><rect x="6" y="9" width="12" height="4" rx="1" fill="currentColor" opacity="0.1"/><rect x="6" y="15" width="12" height="4" rx="1" fill="currentColor" opacity="0.1"/></svg>,
  towel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="3" width="12" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M6 7H18M6 11H18"/></svg>,
  soap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="8" width="12" height="12" rx="2" fill="currentColor" opacity="0.1"/><path d="M10 8V6C10 5 11 4 12 4C13 4 14 5 14 6V8M9 12H15M9 15H13"/></svg>,
  gift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="8" width="18" height="13" rx="2" fill="currentColor" opacity="0.1"/><path d="M12 8V21M3 12H21M12 8C12 8 12 5 9.5 5C8 5 7 6 7 7C7 8 8 8 12 8M12 8C12 8 12 5 14.5 5C16 5 17 6 17 7C17 8 16 8 12 8"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full h-full"><path d="M5 13L9 17L19 7"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M12 5V19M5 12H19"/></svg>,
  minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M5 12H19"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M18 6L6 18M6 6L18 18"/></svg>,
  down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M6 9L12 15L18 9"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M3 10H21M8 2V6M16 2V6"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 6V12L16 14"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="9" cy="7" r="3" fill="currentColor" opacity="0.1"/><path d="M9 13C5 13 3 16 3 19H15C15 16 13 13 9 13Z" fill="currentColor" opacity="0.1"/><circle cx="17" cy="7" r="2.5"/><path d="M17 11.5C19 11.5 21 13.5 21 16H15"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 6H21M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6H19Z" fill="currentColor" opacity="0.1"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M11 4H4C2.9 4 2 4.9 2 6V20C2 21.1 2.9 22 4 22H18C19.1 22 20 21.1 20 20V13"/><path d="M18.5 2.5C19.3 1.7 20.7 1.7 21.5 2.5C22.3 3.3 22.3 4.7 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z"/></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 12L12 3L21 12" /><path d="M5 10V20C5 20.6 5.4 21 6 21H9V15H15V21H18C18.6 21 19 20.6 19 20V10" fill="currentColor" opacity="0.1"/></svg>,
};

const PersonIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <circle cx="12" cy="7" r="3.5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5.5 21C5.5 16.5 8 13 12 13S18.5 16.5 18.5 21" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ==================== TYPES ====================
interface Bed { id: string; type: string; name: string; loc: string; cap: number; }
interface Property { id: string; name: string; address?: string; maxGuests?: number; bedrooms?: number; bathrooms?: number; cleaningPrice?: number; bedsConfig?: Bed[]; serviceConfigs?: Record<number, GuestConfig>; }
interface GuestConfig { beds: string[]; bl: Record<string, Record<string, number>>; ba: Record<string, number>; ki: Record<string, number>; ex: Record<string, boolean>; }
interface Cleaning { 
  id: string; 
  propertyId: string; 
  propertyName?: string; 
  date: Date; 
  scheduledTime?: string; 
  status: string; 
  guestsCount?: number; 
  guestsConfirmed?: boolean; // 🆕 True se inserito manualmente
  notes?: string; 
  operatorNotes?: string;
  price?: number;
  // Nuovi campi per tipo servizio
  serviceType?: string;
  serviceTypeName?: string;
  sgrossoReason?: SgrossoReasonCode;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  contractPrice?: number;
  priceModified?: boolean;
  priceChangeReason?: string;
  // Campi per tracciamento modifica data
  originalDate?: Date;
  dateModifiedAt?: Date;
  // Campi per tempo e foto
  startedAt?: any;
  completedAt?: any;
  photos?: string[];
  // Campi per valutazione
  ratingScore?: number | null;
  ratingId?: string | null;
  // Servizi extra aggiunti
  extraServices?: {name: string; price: number}[];
  // Campi per deadline mancata
  missedDeadline?: boolean;
  missedDeadlineAt?: any;
  manuallyCompletedBy?: string;
  manuallyCompletedAt?: any;
  // 🔧 FIX: Configurazione biancheria personalizzata salvata
  customLinenConfig?: any;
  // 🔥 Flag per indicare se la config è stata modificata manualmente
  linenConfigModified?: boolean;
  // 🔥 Flag per indicare se ha ordine biancheria collegato
  hasLinenOrder?: boolean;
}
interface LinenItem { id: string; n: string; p: number; d: number; }
interface ServiceType { id: string; name: string; code: string; icon: string; color: string; adminOnly: boolean; }
interface EditCleaningModalProps { 
  isOpen: boolean; 
  onClose: () => void; 
  cleaning: Cleaning; 
  property: Property; 
  onSuccess?: () => void;
  userRole?: "ADMIN" | "PROPRIETARIO" | "OPERATORE";
}

// ==================== UTILITY FUNCTIONS ====================
const formatPrice = (price: number): string => Number.isInteger(price) ? price.toString() : price.toFixed(2);

const getBedIcon = (type: string) => {
  switch(type) { case 'matr': return I.bedDouble; case 'sing': return I.bedSingle; case 'divano': return I.sofa; case 'castello': return I.bunk; default: return I.bed; }
};

// 🧺 Usa funzioni dal modulo centralizzato
function generateAutoBeds(maxGuests: number, bedrooms: number): Bed[] {
  const libBeds = generateAutoBedsFromLib(maxGuests, bedrooms);
  // Converti al formato locale Bed
  return libBeds.map(b => ({
    id: b.id,
    type: b.type || b.tipo || 'sing',
    name: b.name || b.nome || 'Letto',
    loc: b.loc || b.stanza || 'Camera',
    cap: b.cap || b.capacita || 1
  }));
}

function getLinenForBedType(t: string): { m: number; s: number; f: number } {
  const req = getLinenForBedTypeFromLib(t);
  return { 
    m: req.lenzuolaMatrimoniali, 
    s: req.lenzuolaSingole, 
    f: req.federe 
  };
}

function calcLinenForBeds(beds: Bed[]): { m: number; s: number; f: number } {
  const t = { m: 0, s: 0, f: 0 };
  beds.forEach(b => { const r = getLinenForBedType(b.type); t.m += r.m; t.s += r.s; t.f += r.f; });
  return t;
}

function mapLinenToInv(req: { m: number; s: number; f: number }, inv: LinenItem[]): Record<string, number> {
  const r: Record<string, number> = {};
  // Usa keyword matching migliorato
  const findByKeywords = (kwType: keyof typeof ITEM_KEYWORDS) => {
    const kws = ITEM_KEYWORDS[kwType];
    return inv.find(i => kws.some(k => i.n.toLowerCase().includes(k.toLowerCase())));
  };
  
  const lm = findByKeywords('lenzuolaMatrimoniali'); 
  if (lm && req.m > 0) r[lm.id] = req.m;
  
  const ls = findByKeywords('lenzuolaSingole'); 
  if (ls && req.s > 0) r[ls.id] = req.s;
  
  const fe = findByKeywords('federe'); 
  if (fe && req.f > 0) r[fe.id] = req.f;
  
  return r;
}

const calcArr = (obj: Record<string, number | boolean>, arr: { id: string; p: number }[]): number => 
  arr.reduce((t, item) => {
    // Usa findValueByAliases per cercare il valore
    const q = findValueByAliases(obj as Record<string, number>, item.id);
    // Se è boolean, converti
    const val = typeof obj[item.id] === 'boolean' ? (obj[item.id] ? 1 : 0) : q;
    return t + (item.p * val);
  }, 0);

// 🔥 FIX: Mapping alias per normalizzare gli ID degli item tra vari formati
const ID_ALIASES: Record<string, string[]> = {
  // Biancheria Letto
  'doubleSheets': ['item_doubleSheets', 'lenzuola_matr', 'lenzuolaMatr', 'lenzuola_matrimoniale', 'lenzuolaMatrimoniali', 'Lenzuola Matrimoniali'],
  'singleSheets': ['item_singleSheets', 'lenzuola_sing', 'lenzuolaSing', 'lenzuola_singolo', 'lenzuolaSingole', 'Lenzuola Singole'],
  'pillowcases': ['item_pillowcases', 'federa', 'federe', 'Federe'],
  // Biancheria Bagno
  'towelsLarge': ['item_towelsLarge', 'telo_corpo', 'teloCorpo', 'telo_doccia', 'asciugamano_grande', 'Telo Doccia'],
  'towelsFace': ['item_towelsFace', 'telo_viso', 'teloViso', 'asciugamano_viso', 'Asciugamano Viso'],
  'towelsSmall': ['item_towelsSmall', 'telo_bidet', 'teloBidet', 'asciugamano_bidet', 'Asciugamano Bidet'],
  'bathMats': ['item_bathMats', 'scendi_bagno', 'scendiBagno', 'tappetino_bagno', 'Tappetino Scendibagno'],
};

// Helper: trova il valore in un oggetto cercando per vari alias
const findValueByAliases = (obj: Record<string, number> | undefined, primaryId: string): number => {
  if (!obj) return 0;
  
  // 1. Cerca per ID primario
  if (obj[primaryId] !== undefined) return obj[primaryId];
  
  // 2. Cerca per alias
  const aliases = ID_ALIASES[primaryId];
  if (aliases) {
    for (const alias of aliases) {
      if (obj[alias] !== undefined) return obj[alias];
    }
  }
  
  // 3. Cerca inverso: primaryId potrebbe essere un alias di un altro ID
  for (const [canonical, aliasList] of Object.entries(ID_ALIASES)) {
    if (aliasList.includes(primaryId) && obj[canonical] !== undefined) {
      return obj[canonical];
    }
  }
  
  return 0;
};

// 🔥 Helper: ottiene quantità biancheria da bl
// PRIORITÀ: se esiste 'all' E contiene l'item, usa quello. Altrimenti somma dai letti.
const getLinenQtyFromBl = (bl: Record<string, Record<string, number>> | undefined, itemId: string): number => {
  if (!bl) return 0;
  
  // Helper per cercare item con alias
  const findInItems = (items: Record<string, number>): number | null => {
    // Cerca per ID diretto
    if (items[itemId] !== undefined) return items[itemId];
    // Cerca per alias
    const aliases = ID_ALIASES[itemId];
    if (aliases) {
      for (const alias of aliases) {
        if (items[alias] !== undefined) return items[alias];
      }
    }
    return null;
  };
  
  // 🔥 PRIORITÀ 1: Se esiste 'all' E contiene l'item, usa quello
  if (bl['all']) {
    const valueFromAll = findInItems(bl['all']);
    if (valueFromAll !== null) return valueFromAll;
  }
  
  // 🔥 PRIORITÀ 2: Somma da tutte le chiavi letto (escluso 'all')
  let total = 0;
  Object.entries(bl).forEach(([bedKey, items]) => {
    if (bedKey !== 'all' && items && typeof items === 'object') {
      const value = findInItems(items);
      if (value !== null) total += value;
    }
  });
  
  return total;
};

// ═══════════════════════════════════════════════════════════════
// 🆕 VALIDAZIONE MINIMO BIANCHERIA PER LETTI
// ═══════════════════════════════════════════════════════════════

/**
 * Calcola il MINIMO di lenzuola richiesto in base ai letti selezionati
 * - Letto matrimoniale/divano letto → 2 lenzuola matrimoniali
 * - Letto singolo/piazza e mezza → 2 lenzuola singole
 * - Letto a castello → 4 lenzuola singole (2 letti singoli)
 */
const calculateMinimumLinenForBeds = (beds: Bed[]): { matrimoniali: number; singole: number } => {
  let matrimoniali = 0;
  let singole = 0;

  if (!beds || beds.length === 0) return { matrimoniali, singole };

  beds.forEach(bed => {
    const tipo = (bed.type || '').toLowerCase();
    
    // Letti che richiedono lenzuola matrimoniali (2 per letto)
    if (tipo === 'matr' || tipo === 'matrimoniale' || tipo === 'divano') {
      matrimoniali += 2;
    }
    // Letti a castello (2 letti singoli = 4 lenzuola singole)
    else if (tipo === 'castello') {
      singole += 4;
    }
    // Letti singoli o piazza e mezza (2 per letto)
    else if (tipo === 'sing' || tipo === 'singolo' || tipo === 'piazza_mezza') {
      singole += 2;
    }
  });

  return { matrimoniali, singole };
};

/**
 * Conta le lenzuola e federe attualmente selezionate dall'utente
 */
const countCurrentLinenFromBl = (
  bl: Record<string, Record<string, number>> | undefined, 
  invLinen: LinenItem[]
): { matrimoniali: number; singole: number; federe: number } => {
  let matrimoniali = 0;
  let singole = 0;
  let federe = 0;

  if (!bl || !invLinen || invLinen.length === 0) return { matrimoniali, singole, federe };

  invLinen.forEach(item => {
    const qty = getLinenQtyFromBl(bl, item.id);
    const nameLower = (item.n || '').toLowerCase();
    const idLower = (item.id || '').toLowerCase();

    // Identifica FEDERE
    if (nameLower.includes('feder') || idLower.includes('pillow')) {
      federe += qty;
    }
    // Identifica lenzuola matrimoniali
    else if (
      nameLower.includes('matrimonial') || 
      idLower.includes('double') || 
      idLower.includes('matr')
    ) {
      matrimoniali += qty;
    }
    // Identifica lenzuola singole (deve contenere sia "singol/sing" che "lenzuol/sheet")
    else if (
      (nameLower.includes('singol') || idLower.includes('single') || idLower.includes('sing'))
    ) {
      // Verifica che sia effettivamente lenzuola e non altro (es. asciugamano singolo)
      if (nameLower.includes('lenzuol') || idLower.includes('sheet') || idLower.includes('lenz') || 
          nameLower.includes('letto') || idLower.includes('bed')) {
        singole += qty;
      }
    }
  });

  return { matrimoniali, singole, federe };
};

/**
 * Interfaccia per il risultato della validazione
 */
interface LinenValidationResult {
  isValid: boolean;
  missingMatrimoniali: number;
  missingSingole: number;
  missingFedere: number;
  requiredMatrimoniali: number;
  requiredSingole: number;
  requiredFedere: number;
  currentMatrimoniali: number;
  currentSingole: number;
  currentFedere: number;
}

/**
 * Valida se la biancheria inserita soddisfa il minimo richiesto
 * - Lenzuola: 2 per letto
 * - Federe: 1 per ospite
 */
const validateLinenForBeds = (
  beds: Bed[], 
  bl: Record<string, Record<string, number>> | undefined,
  invLinen: LinenItem[],
  guestsCount: number = 0
): LinenValidationResult => {
  const required = calculateMinimumLinenForBeds(beds);
  const current = countCurrentLinenFromBl(bl, invLinen);
  
  // Federe: 1 per ospite
  const requiredFedere = guestsCount > 0 ? guestsCount : beds.reduce((sum, b) => sum + (b.cap || 1), 0);
  
  const missingMatrimoniali = Math.max(0, required.matrimoniali - current.matrimoniali);
  const missingSingole = Math.max(0, required.singole - current.singole);
  const missingFedere = Math.max(0, requiredFedere - current.federe);
  
  return {
    isValid: missingMatrimoniali === 0 && missingSingole === 0 && missingFedere === 0,
    missingMatrimoniali,
    missingSingole,
    missingFedere,
    requiredMatrimoniali: required.matrimoniali,
    requiredSingole: required.singole,
    requiredFedere,
    currentMatrimoniali: current.matrimoniali,
    currentSingole: current.singole,
    currentFedere: current.federe,
  };
};

// ==================== SMALL COMPONENTS ====================
const Cnt = ({ v, onChange }: { v: number; onChange: (v: number) => void }) => (
  <div className="flex items-center gap-1">
    <button onClick={() => onChange(Math.max(0, v - 1))} className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center active:scale-95"><div className="w-3.5 h-3.5 text-slate-500">{I.minus}</div></button>
    <span className="w-6 text-center text-sm font-semibold">{v}</span>
    <button onClick={() => onChange(v + 1)} className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center active:scale-95"><div className="w-3.5 h-3.5 text-white">{I.plus}</div></button>
  </div>
);

const Section = ({ title, icon, price, expanded, onToggle, children }: { title: string; icon: React.ReactNode; price: number; expanded: boolean; onToggle: () => void; children: React.ReactNode; }) => (
  <div className={`rounded-xl border ${expanded ? 'border-slate-300 shadow-sm' : 'border-slate-200'} overflow-hidden mb-2 transition-all bg-white`}>
    <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between active:bg-slate-50">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${expanded ? 'bg-slate-900' : 'bg-slate-100'} flex items-center justify-center transition-colors`}>
          <div className={`w-5 h-5 ${expanded ? 'text-white' : 'text-slate-600'}`}>{icon}</div>
        </div>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold">€{formatPrice(price)}</span>
        <div className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>{I.down}</div>
      </div>
    </button>
    <div className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">{children}</div>
    </div>
  </div>
);

const GuestSelector = ({ value, onChange, max = 7, disabled = false, lockedMessage, showMessage = false }: { value: number; onChange: (n: number) => void; max?: number; disabled?: boolean; lockedMessage?: string; showMessage?: boolean }) => (
  <div className="bg-slate-100 rounded-xl p-3">
    {disabled && lockedMessage && (
      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-10V7a4 4 0 00-8 0v4h12V7a4 4 0 00-4-4z" />
          </svg>
          <span className="text-xs font-medium text-red-700">{lockedMessage}</span>
        </div>
      </div>
    )}
    
    {/* Messaggio motivazionale */}
    {showMessage && !disabled && (
      <div className={`mb-3 p-3 rounded-lg border ${value > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'}`}>
        <div className="flex items-center gap-2">
          {value > 0 ? (
            <>
              <span className="text-lg">✅</span>
              <span className="text-xs font-medium text-emerald-700">
                Perfetto! Prepareremo la casa per <strong>{value}</strong> {value === 1 ? 'ospite' : 'ospiti'}
              </span>
            </>
          ) : (
            <>
              <span className="text-lg">⚠️</span>
              <span className="text-xs font-medium text-orange-700">
                Inserisci il numero di ospiti per calcolare la biancheria necessaria
              </span>
            </>
          )}
        </div>
      </div>
    )}
    
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-medium text-slate-500">Seleziona numero ospiti</span>
      <span className="text-base font-bold text-slate-800">{value} {value === 1 ? 'ospite' : 'ospiti'}</span>
    </div>
    <div className={`flex gap-1 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button key={n} onClick={() => !disabled && onChange(n)} disabled={disabled} className={`flex-1 flex flex-col items-center py-1.5 rounded-lg transition-all active:scale-95 ${n === value ? 'bg-slate-800 shadow-lg' : 'bg-white border border-slate-200'} ${disabled ? 'cursor-not-allowed' : ''}`}>
          <div className={`w-4 h-4 mb-0.5 ${n === value ? 'text-white' : n <= value ? 'text-slate-600' : 'text-slate-300'}`}><PersonIcon filled={n <= value} /></div>
          <span className={`text-[10px] font-bold ${n === value ? 'text-white' : 'text-slate-600'}`}>{n}</span>
        </button>
      ))}
    </div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function EditCleaningModal({ isOpen, onClose, cleaning, property, onSuccess, userRole = "PROPRIETARIO" }: EditCleaningModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'service' | 'linen'>('details');
  const [g, setG] = useState(cleaning?.guestsCount || 2);
  const [sec, setSec] = useState<string | null>('beds');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Ref per scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Funzione per cambiare tab e scrollare in cima
  const handleTabChange = (tab: 'details' | 'service' | 'linen' | 'photos') => {
    // @ts-expect-error TODO-FIX: TS2345 Argument of type '"details" | "service" | "linen" | "photos"' is not assignable ...
    setActiveTab(tab);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Service type state
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(true);
  const [selectedServiceType, setSelectedServiceType] = useState<string>("STANDARD");
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [priceChangeReason, setPriceChangeReason] = useState<string>("");
  const [sgrossoReason, setSgrossoReason] = useState<SgrossoReasonCode | "">("");
  const [sgrossoNotes, setSgrossoNotes] = useState<string>("");
  
  // Date change confirmation
  const [showDateConfirm, setShowDateConfirm] = useState(false);
  const [pendingDate, setPendingDate] = useState<string>("");
  const [originalDate, setOriginalDate] = useState<string>("");
  const [dateHasChanged, setDateHasChanged] = useState(false);
  
  // 🔥 Modal conferma spostamento pulizia IN_PROGRESS
  const [showInProgressConfirm, setShowInProgressConfirm] = useState(false);
  const [inProgressPendingSave, setInProgressPendingSave] = useState(false);
  
  // Modal conferma modifica pulizia completata (solo admin)
  const [showCompletedEditConfirm, setShowCompletedEditConfirm] = useState(false);
  const [completedEditType, setCompletedEditType] = useState<'date' | 'guests' | 'dotazioni' | null>(null);
  const [isEditingCompleted, setIsEditingCompleted] = useState(false);
  
  // Gestione eliminazione foto (admin)
  const [showDeletePhotoConfirm, setShowDeletePhotoConfirm] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<number | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [localPhotos, setLocalPhotos] = useState<string[]>([]);
  
  // 📋 Issues/segnalazioni legati a questa pulizia
  const [cleaningIssues, setCleaningIssues] = useState<any[]>([]);
  
  // 📸 Photo Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  // Conteggio pulizie per timeline approfondita
  const [cleaningCount, setCleaningCount] = useState<number>(0);
  const [loadingCount, setLoadingCount] = useState(true);

  // ═══════════════════════════════════════════════════════════════
  // ADMIN: Modifica prezzo/servizio pulizie completate
  // ═══════════════════════════════════════════════════════════════
  const [showPriceServiceModal, setShowPriceServiceModal] = useState(false);
  const [editingServiceType, setEditingServiceType] = useState<string>("");
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [editingSgrossoReason, setEditingSgrossoReason] = useState<SgrossoReasonCode | "">("");
  const [editingSgrossoNotes, setEditingSgrossoNotes] = useState<string>("");
  const [savingPriceService, setSavingPriceService] = useState(false);
  
  // Servizi Extra (aggiunti durante pulizia)
  const [extraServices, setExtraServices] = useState<{name: string; price: number}[]>([]);
  const [showAddExtraModal, setShowAddExtraModal] = useState(false);
  const [newExtraName, setNewExtraName] = useState("");
  const [newExtraPrice, setNewExtraPrice] = useState<number>(0);

  // ═══════════════════════════════════════════════════════════════
  // ADMIN: Completa Manualmente (con foto opzionali)
  // ═══════════════════════════════════════════════════════════════
  const [showManualCompleteSection, setShowManualCompleteSection] = useState(false);
  const [manualCompletePhotos, setManualCompletePhotos] = useState<string[]>([]);
  const [uploadingManualPhotos, setUploadingManualPhotos] = useState(false);
  const [completingManually, setCompletingManually] = useState(false);
  const [showManualCompleteConfirm, setShowManualCompleteConfirm] = useState(false);
  const manualPhotoInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = userRole === "ADMIN";
  const isReadOnly = userRole === "OPERATORE";
  const isCompleted = cleaning?.status === "COMPLETED" || cleaning?.status === "completed" || cleaning?.status === "VERIFIED" || cleaning?.status === "verified";

  // ═══════════════════════════════════════════════════════════════
  // BLOCCO TOTALE MODAL: dopo le 20:00 del giorno prima, il
  // proprietario può solo leggere — nessuna modifica possibile
  // ═══════════════════════════════════════════════════════════════
  const isModalLocked = useMemo(() => {
    if (isAdmin) return false; // Admin può sempre modificare
    if (!cleaning?.date) return false;
    const cleaningDate = cleaning.date instanceof Date ? cleaning.date : new Date(cleaning.date);
    const now = new Date();
    const deadline = new Date(cleaningDate);
    deadline.setDate(deadline.getDate() - 1);
    deadline.setHours(20, 0, 0, 0);
    return now >= deadline;
  }, [cleaning?.date, isAdmin]);

  // ═══════════════════════════════════════════════════════════════
  // BLOCCO MODIFICA OSPITI: dopo le 20:00 del giorno prima
  // ═══════════════════════════════════════════════════════════════
  const isGuestsLocked = useMemo(() => {
    if (isAdmin) return false; // Admin può sempre modificare
    if (!cleaning?.date) return false;
    
    const cleaningDate = cleaning.date instanceof Date ? cleaning.date : new Date(cleaning.date);
    const now = new Date();
    
    // Calcola le 20:00 del giorno PRIMA della pulizia
    const deadlineDate = new Date(cleaningDate);
    deadlineDate.setDate(deadlineDate.getDate() - 1); // Giorno prima
    deadlineDate.setHours(20, 0, 0, 0); // Alle 20:00
    
    return now >= deadlineDate;
  }, [cleaning?.date, isAdmin]);

  const guestsLockedMessage = isGuestsLocked 
    ? "Modifica non disponibile: il termine è scaduto (ore 20:00 del giorno prima della pulizia)" 
    : undefined;

  // ⏱️ Countdown live per deadline ospiti
  const [countdownText, setCountdownText] = useState("");
  useEffect(() => {
    if (!cleaning?.date || isGuestsLocked || isAdmin) return;
    
    const cleaningDate = cleaning.date instanceof Date ? cleaning.date : new Date(cleaning.date);
    const deadline = new Date(cleaningDate);
    deadline.setDate(deadline.getDate() - 1);
    deadline.setHours(20, 0, 0, 0);
    
    const updateCountdown = () => {
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();
      if (diff <= 0) {
        setCountdownText("Tempo scaduto");
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}g`);
      if (hours > 0) parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);
      setCountdownText(parts.join(" "));
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [cleaning?.date, isGuestsLocked, isAdmin]);

  const [cfgs, setCfgs] = useState<Record<number, GuestConfig>>({});
  const [invLinen, setInvLinen] = useState<LinenItem[]>([]);
  const [invBath, setInvBath] = useState<LinenItem[]>([]);
  const [invKit, setInvKit] = useState<LinenItem[]>([]);
  const [invExtras, setInvExtras] = useState<{ id: string; n: string; p: number; desc: string }[]>([]);
  // 🔥 Flag per tracciare se la configurazione biancheria è stata modificata manualmente
  const [linenConfigModified, setLinenConfigModified] = useState(false);
  // 🔥 Toggle per attivare/disattivare biancheria (false = solo pulizia, true = pulizia + biancheria)
  const [linenEnabled, setLinenEnabled] = useState<boolean>(true);
  
  // 🔥 Dialog conferma cambio ospiti quando biancheria è personalizzata
  const [showGuestChangeDialog, setShowGuestChangeDialog] = useState(false);
  const [pendingGuestCount, setPendingGuestCount] = useState<number | null>(null);
  // 🔥 Flag per indicare che l'utente ha scelto "usa standard" - evita che il dialog riappaia
  const [forcedStandard, setForcedStandard] = useState(false);

  const currentBeds = useMemo(() => {
    if (property?.bedsConfig && property.bedsConfig.length > 0) {
      // 🔥 FIX: Normalizza i campi dei letti (cap/capacita, type/tipo, etc.)
      return property.bedsConfig.map((b: any) => ({
        id: b.id,
        type: b.type || b.tipo || 'sing',
        name: b.name || b.nome || 'Letto',
        loc: b.loc || b.stanza || 'Camera',
        cap: b.cap || b.capacita || (b.type === 'matr' || b.tipo === 'matr' ? 2 : 1)
      }));
    }
    
    // 🔧 FIX: Se bedsConfig non esiste ma serviceConfigs ha IDs letti, ricostruiscili
    if (property?.serviceConfigs) {
      const allBedIds = new Set<string>();
      Object.values(property.serviceConfigs).forEach((cfg: any) => {
        if (cfg?.beds && Array.isArray(cfg.beds)) {
          cfg.beds.forEach((id: string) => allBedIds.add(id));
        }
      });
      
      if (allBedIds.size > 0) {
        const reconstructedBeds: Bed[] = [];
        allBedIds.forEach(id => {
          // Estrai tipo dall'ID (formato: stanza_123_matrimoniale_0)
          const parts = id.split('_');
          let type = 'sing';
          let name = 'Letto';
          let cap = 1;
          
          if (parts.length >= 3) {
            const typeStr = parts[2].toLowerCase();
            if (typeStr.includes('matrim')) {
              type = 'matr';
              name = 'Letto Matrimoniale';
              cap = 2;
            } else if (typeStr.includes('singol')) {
              type = 'sing';
              name = 'Letto Singolo';
              cap = 1;
            } else if (typeStr.includes('divano')) {
              type = 'divano';
              name = 'Divano Letto';
              cap = 2;
            } else if (typeStr.includes('castell')) {
              type = 'castle';
              name = 'Letto a Castello';
              cap = 2;
            }
          }
          
          reconstructedBeds.push({ id, type, name, loc: 'Camera', cap });
        });
        return reconstructedBeds;
      }
    }
    
    return generateAutoBeds(property?.maxGuests || 6, property?.bedrooms || 2);
  }, [property]);

  useEffect(() => {
    if (isOpen && cleaning) {
      const d = cleaning.date instanceof Date ? cleaning.date : new Date(cleaning.date);
      const dateStr = d.toISOString().split('T')[0];
      setDate(dateStr);
      setOriginalDate(dateStr); // Salva data originale
      setDateHasChanged(false); // Reset flag cambio data
      setTime(cleaning.scheduledTime || '10:00');
      
      // 🔥 FIX: Se termine scaduto e ospiti NON confermati → applica il massimo
      const cleaningDate = d;
      const now = new Date();
      const deadlineDate = new Date(cleaningDate);
      deadlineDate.setDate(deadlineDate.getDate() - 1);
      deadlineDate.setHours(20, 0, 0, 0);
      const isLocked = now >= deadlineDate && !isAdmin;
      const maxG = property?.maxGuests || 6;
      
      if (isLocked && !cleaning.guestsConfirmed) {
        // Termine scaduto, ospiti non confermati → imposta il massimo
        setG(maxG);
      } else {
        setG(cleaning.guestsCount || 2);
      }
      
      setNotes(cleaning.notes || '');
      
      // 🔥 Inizializza toggle biancheria: true se ha ordine o è legacy (undefined)
      // false SOLO se esplicitamente false
      setLinenEnabled(cleaning.hasLinenOrder !== false);
      
      // 🔥 NOTA: cfgs viene settato nel secondo useEffect che carica l'inventario
      // Questo evita race condition tra gli useEffect
      
      // Inizializza campi servizio dalla cleaning esistente
      setSelectedServiceType(cleaning.serviceType || "STANDARD");
      setCustomPrice(cleaning.priceModified ? (cleaning.price || null) : null);
      setPriceChangeReason(cleaning.priceChangeReason || "");
      setSgrossoReason(cleaning.sgrossoReason || "");
      setSgrossoNotes(cleaning.sgrossoNotes || "");
      
      // Inizializza stati per modifica admin
      setEditingServiceType(cleaning.serviceType || "STANDARD");
      setEditingPrice(cleaning.price || null);
      setEditingSgrossoReason(cleaning.sgrossoReason || "");
      setEditingSgrossoNotes(cleaning.sgrossoNotes || "");
      setExtraServices(cleaning.extraServices || []);
      
      // Reset conferma data
      setShowDateConfirm(false);
      setPendingDate("");
      
      // Inizializza foto locali
      setLocalPhotos(cleaning.photos || []);
      
      // 📋 Carica issues/segnalazioni legate a questa pulizia
      if (isCompleted && cleaning.id) {
        fetch(`/api/issues?cleaningId=${cleaning.id}`)
          .then(res => res.ok ? res.json() : { issues: [] })
          .then(data => setCleaningIssues(data.issues || []))
          .catch(() => setCleaningIssues([]));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cleaning?.id]);

  // Carica Service Types (con cache browser globale)
  useEffect(() => {
    async function loadServiceTypes() {
      // 🚀 Controlla cache window-level prima di fare la chiamata
      const cached = browserCacheGet<any[]>(CACHE_KEY_SERVICE_TYPES);
      if (cached) {
        setServiceTypes(cached);
        setLoadingServiceTypes(false);
        return;
      }
      try {
        const res = await fetch("/api/service-types?activeOnly=true");
        const data = await res.json();
        const types = data.serviceTypes || [];
        browserCacheSet(CACHE_KEY_SERVICE_TYPES, types, CACHE_TTL_SERVICE_TYPES);
        setServiceTypes(types);
      } catch (error) {
        console.error("Errore caricamento tipi servizio:", error);
      } finally {
        setLoadingServiceTypes(false);
      }
    }
    
    if (isOpen) {
      loadServiceTypes();
    }
  }, [isOpen]);

  useEffect(() => {
    async function load() {
      if (!isOpen) return;
      setLoading(true);
      try {
        // 🚀 Controlla cache window-level prima di fare la chiamata API (risparmia 4-6 secondi)
        interface InvCacheData {
          linen: LinenItem[]; bath: LinenItem[]; kit: LinenItem[];
          extras: { id: string; n: string; p: number; desc: string }[];
        }
        let linen: LinenItem[], bath: LinenItem[], kit: LinenItem[], extras: { id: string; n: string; p: number; desc: string }[];
        const cached = browserCacheGet<InvCacheData>(CACHE_KEY_INVENTORY);
        if (cached) {
          linen = cached.linen; bath = cached.bath; kit = cached.kit; extras = cached.extras;
        } else {
          linen = []; bath = []; kit = []; extras = [];
          const res = await fetch('/api/inventory/list');
          const data = await res.json();
          data.categories?.forEach((cat: { id: string; items: { key?: string; id: string; name: string; sellPrice?: number; description?: string }[] }) => {
            cat.items?.forEach((item) => {
              const m = { id: item.key || item.id, n: item.name, p: item.sellPrice || 0, d: 1 };
              if (cat.id === 'biancheria_letto') linen.push(m);
              else if (cat.id === 'biancheria_bagno') bath.push(m);
              else if (cat.id === 'kit_cortesia') kit.push(m);
              else if (cat.id === 'servizi_extra') extras.push({ ...m, desc: item.description || '' });
            });
          });
          browserCacheSet(CACHE_KEY_INVENTORY, { linen, bath, kit, extras }, CACHE_TTL_INVENTORY);
        }
        setInvLinen(linen); setInvBath(bath); setInvKit(kit); setInvExtras(extras);
        
        // 🔍 DEBUG CRITICO: Mostra stato della pulizia
        
        // 🔥 FIX CRITICO: Rispetta linenConfigModified
        // Se la pulizia ha customLinenConfig con dati validi, usa quella
        // (anche se linenConfigModified non è settato correttamente)
        // 🔧 FIX COERENZA: Usa STESSA logica di calculateDotazioni
        // customLinenConfig viene usata SOLO se linenConfigModified è ESPLICITAMENTE true
        // Questo garantisce coerenza tra card e modal
        const hasCustomConfig = cleaning?.customLinenConfig && 
          cleaning.customLinenConfig.bl && 
          Object.keys(cleaning.customLinenConfig.bl).length > 0;
        // 🔥 IMPORTANTE: Usa AND, non OR - deve essere ESPLICITAMENTE modificata
        const hasModifiedConfig = cleaning?.linenConfigModified === true && hasCustomConfig;
        const hasServiceConfigs = property?.serviceConfigs && Object.keys(property.serviceConfigs).length > 0;
        
        
        if (hasModifiedConfig && cleaning?.customLinenConfig) {
          // La pulizia ha una config modificata manualmente - usa quella
          const gCount = cleaning?.guestsCount || 2;
          setCfgs(prev => ({ ...prev, [gCount]: cleaning.customLinenConfig }));
          setLinenConfigModified(true);
          return;
        }
        
        if (hasServiceConfigs) {
          // 🔥 FIX: Usa DIRETTAMENTE serviceConfigs dalla proprietà
          // IMPORTANTE: Normalizza le chiavi da stringa a numero!
          // Firestore salva le chiavi come stringhe ("1", "2", "3") ma cfgs[g] usa numeri (1, 2, 3)
          
          // Normalizza le chiavi da stringa a numero
          const normalizedCfgs: Record<number, GuestConfig> = {};
          // @ts-expect-error TODO-FIX: TS2769 No overload matches this call.
          Object.entries(property.serviceConfigs).forEach(([key, value]) => {
            const numKey = parseInt(key);
            if (!isNaN(numKey)) {
              normalizedCfgs[numKey] = value as GuestConfig;
            }
          });
          
          
          // 🔍 DEBUG: Mostra contenuto config per il numero ospiti corrente
          const guestCount = cleaning?.guestsCount || 2;
          const currentConfig = normalizedCfgs[guestCount];
          if (currentConfig?.bl?.['all']) {
          }
          
          setCfgs(normalizedCfgs);
          setLinenConfigModified(false);
          return;
        }
        
        // Nessuna config esistente - genera da zero
        const newC: Record<number, GuestConfig> = {};
        const maxG = property?.maxGuests || 6;
        for (let i = 1; i <= maxG; i++) {
          const beds = generateAutoBeds(i, property?.bedrooms || 1);
          const sel = beds.slice(0, Math.ceil(i / 2));
          const ids = sel.map(b => b.id);
          const lr = calcLinenForBeds(sel);
          const ml = mapLinenToInv(lr, linen);
          const ba: Record<string, number> = {}; bath.forEach(it => { const n = it.n.toLowerCase(); if (n.includes('corpo') || n.includes('viso') || n.includes('bidet')) ba[it.id] = i; else if (n.includes('scendi')) ba[it.id] = property?.bathrooms || 1; });
          const ki: Record<string, number> = {}; kit.forEach(it => { ki[it.id] = 0; });
          const ex: Record<string, boolean> = {}; extras.forEach(it => { ex[it.id] = false; });
          newC[i] = { beds: ids, bl: { 'all': ml }, ba, ki, ex };
        }
        setCfgs(newC);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cleaning?.id, property?.id]);

  // Conta pulizie standard completate dopo l'ultima approfondita
  useEffect(() => {
    async function countCleanings() {
      if (!isOpen || !property?.id) {
        setLoadingCount(false);
        return;
      }

      // 🚀 Controlla cache browser prima di fare la query Firestore
      const cacheKey = `modal:cleaningsCount:${property.id}`;
      const cached = browserCacheGet<{ standardAfterApprofondita: number }>(cacheKey);
      if (cached) {
        setCleaningCount(cached.standardAfterApprofondita % 5);
        setLoadingCount(false);
        return;
      }
      
      try {
        const cleaningsQuery = query(
          collection(db, "cleanings"),
          where("propertyId", "==", property.id)
        );
        
        const cleaningsSnap = await getDocs(cleaningsQuery);
        const allCleanings = cleaningsSnap.docs.map(doc => ({
          ...(doc.data() as Record<string, any>),
          id: doc.id
        }));
        
        const completedCleanings = allCleanings.filter(c => 
          // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
          c.status === "COMPLETED" || c.status === "completed"
        );
        
        const approfonditaCleanings = completedCleanings
          // @ts-expect-error TODO-FIX: TS2339 Property 'serviceType' does not exist on type '{ id: string; }'.
          .filter(c => c.serviceType === "APPROFONDITA")
          .sort((a, b) => {
            // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
            const dateA = a.scheduledDate?.toDate?.() || new Date(0);
            // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
            const dateB = b.scheduledDate?.toDate?.() || new Date(0);
            return dateB.getTime() - dateA.getTime();
          });
        
        const lastApprofonditaDate = approfonditaCleanings.length > 0
          // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
          ? approfonditaCleanings[0].scheduledDate?.toDate?.() || null
          : null;
        
        let standardCount = 0;
        if (lastApprofonditaDate) {
          standardCount = completedCleanings.filter(c => {
            // @ts-expect-error TODO-FIX: TS2339 Property 'scheduledDate' does not exist on type '{ id: string; }'.
            const cleaningDate = c.scheduledDate?.toDate?.() || new Date(0);
            // @ts-expect-error TODO-FIX: TS2339 Property 'serviceType' does not exist on type '{ id: string; }'.
            const isStandard = !c.serviceType || c.serviceType === "STANDARD";
            return isStandard && cleaningDate > lastApprofonditaDate;
          }).length;
        } else {
          standardCount = completedCleanings.filter(c => 
            // @ts-expect-error TODO-FIX: TS2339 Property 'serviceType' does not exist on type '{ id: string; }'.
            !c.serviceType || c.serviceType === "STANDARD"
          ).length;
        }

        // Salva in cache browser per 60 secondi
        browserCacheSet(
          `modal:cleaningsCount:${property.id}`,
          { standardAfterApprofondita: standardCount },
          CACHE_TTL_CLEANINGS
        );
        
        setCleaningCount(standardCount % 5);
      } catch (error) {
        console.error("Errore conteggio pulizie:", error);
        setCleaningCount(0);
      } finally {
        setLoadingCount(false);
      }
    }
    
    countCleanings();
  }, [isOpen, property?.id]);

  // 🔥 FIX: Quando cambia numero ospiti, usa sempre serviceConfigs se disponibile
  // Normalizza anche qui le chiavi stringa/numero come in calculateDotazioni
  const c = useMemo(() => {
    // 1. Prima prova cfgs[g] (config locale) - prova sia numero che stringa
    // @ts-expect-error TODO-FIX: TS7015 Element implicitly has an 'any' type because index expression is not of type 'nu...
    const localConfig = cfgs[g] || cfgs[String(g)];
    if (localConfig) {
      return localConfig;
    }
    
    // 2. Prova serviceConfigs della proprietà (con normalizzazione chiavi)
    if (property?.serviceConfigs) {
      // Prova numero
      if (property.serviceConfigs[g]) {
        return property.serviceConfigs[g];
      }
      // Prova stringa
      const stringKey = String(g);
      // @ts-expect-error TODO-FIX: TS7015 Element implicitly has an 'any' type because index expression is not of type 'nu...
      if (property.serviceConfigs[stringKey]) {
        // @ts-expect-error TODO-FIX: TS7015 Element implicitly has an 'any' type because index expression is not of type 'nu...
        return property.serviceConfigs[stringKey];
      }
    }
    
    // 3. Fallback: oggetto vuoto (l'utente deve configurare)
    return { beds: [], bl: {}, ba: {}, ki: {}, ex: {} };
  }, [cfgs, g, property?.serviceConfigs]);
  
  const selectedBedIds = c.beds || [];
  const selectedBedsData = currentBeds.filter(b => selectedBedIds.includes(b.id));
  // 🔥 FIX: Calcolo robusto della capacità con fallback per tipo letto
  const totalCap = selectedBedsData.reduce((s, b) => {
    const cap = typeof b.cap === 'number' && !isNaN(b.cap) ? b.cap : 
                (b.type === 'matr' || b.type === 'matrimoniale' ? 2 : 1);
    return s + cap;
  }, 0);
  const warn = totalCap < g;

  // ═══════════════════════════════════════════════════════════════
  // 🆕 VALIDAZIONE MINIMO BIANCHERIA
  // Verifica che ci siano abbastanza lenzuola per i letti selezionati
  // ═══════════════════════════════════════════════════════════════
  const linenValidation = useMemo((): LinenValidationResult => {
    // Se biancheria disabilitata, validazione sempre OK
    if (!linenEnabled) {
      return { 
        isValid: true, 
        missingMatrimoniali: 0, 
        missingSingole: 0, 
        missingFedere: 0,
        requiredMatrimoniali: 0, 
        requiredSingole: 0, 
        requiredFedere: 0,
        currentMatrimoniali: 0, 
        currentSingole: 0,
        currentFedere: 0
      };
    }
    // Se non ci sono letti selezionati, validazione sempre OK
    if (!selectedBedsData || selectedBedsData.length === 0) {
      return { 
        isValid: true, 
        missingMatrimoniali: 0, 
        missingSingole: 0, 
        missingFedere: 0,
        requiredMatrimoniali: 0, 
        requiredSingole: 0, 
        requiredFedere: 0,
        currentMatrimoniali: 0, 
        currentSingole: 0,
        currentFedere: 0
      };
    }
    // Se inventario non ancora caricato, validazione OK (temporaneamente)
    if (!invLinen || invLinen.length === 0) {
      return { 
        isValid: true, 
        missingMatrimoniali: 0, 
        missingSingole: 0, 
        missingFedere: 0,
        requiredMatrimoniali: 0, 
        requiredSingole: 0, 
        requiredFedere: 0,
        currentMatrimoniali: 0, 
        currentSingole: 0,
        currentFedere: 0
      };
    }
    return validateLinenForBeds(selectedBedsData, c.bl, invLinen, g);
  }, [linenEnabled, selectedBedsData, c.bl, invLinen, g]);

  const toggleBed = (bedId: string) => {
    setLinenConfigModified(true); // 🔥 Marca la config come modificata
    setCfgs(prev => {
      const cur = prev[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} };
      const isSel = cur.beds.includes(bedId);
      const newBeds = isSel ? cur.beds.filter(id => id !== bedId) : [...cur.beds, bedId];
      const newSelBeds = currentBeds.filter(b => newBeds.includes(b.id));
      const lr = calcLinenForBeds(newSelBeds);
      const ml = mapLinenToInv(lr, invLinen);
      return { ...prev, [g]: { ...cur, beds: newBeds, bl: { 'all': ml } } };
    });
  };

  // 🔥 Funzioni di aggiornamento - settano linenConfigModified a true
  // FIX: Preserva tutti i valori esistenti, aggiorna solo l'item specifico
  const updL = (id: string, v: number) => { 
    setLinenConfigModified(true); 
    setCfgs(p => {
      const currentConfig = p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} };
      const currentBl = currentConfig.bl || {};
      
      
      // Calcola i totali esistenti da tutti i gruppi (all, b1, b2, etc.)
      const existingTotals: Record<string, number> = {};
      Object.entries(currentBl).forEach(([groupKey, items]) => {
        if (items && typeof items === 'object') {
          Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
            existingTotals[itemId] = (existingTotals[itemId] || 0) + qty;
          });
        }
      });
      
      
      // Aggiorna il valore specifico (questo è un delta, non un totale)
      existingTotals[id] = v;
      
      
      // Salva tutto in bl['all'] (formato standard per modifiche manuali)
      return { 
        ...p, 
        [g]: { 
          ...currentConfig, 
          bl: { 'all': existingTotals } 
        } 
      };
    }); 
  };
  const updB = (id: string, v: number) => { setLinenConfigModified(true); setCfgs(p => ({ ...p, [g]: { ...(p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }), ba: { ...(p[g]?.ba || {}), [id]: v } } })); };
  const updK = (id: string, v: number) => { setLinenConfigModified(true); setCfgs(p => ({ ...p, [g]: { ...(p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }), ki: { ...(p[g]?.ki || {}), [id]: v } } })); };
  const togE = (id: string) => { setLinenConfigModified(true); setCfgs(p => ({ ...p, [g]: { ...(p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }), ex: { ...(p[g]?.ex || {}), [id]: !(p[g]?.ex?.[id]) } } })); };

  // 🔥 Gestione cambio numero ospiti con dialog se biancheria personalizzata
  const handleGuestChange = (newGuests: number) => {
    
    // Se l'utente ha già scelto "usa standard" in questa sessione, non mostrare più il dialog
    if (forcedStandard) {
      setG(newGuests);
      return;
    }
    
    // Controlla anche se la pulizia ha customLinenConfig (oltre allo stato locale)
    const hasCustomConfig = linenConfigModified || 
      (cleaning?.customLinenConfig && Object.keys(cleaning.customLinenConfig.bl || {}).length > 0);
    
    
    // Se non c'è biancheria personalizzata, cambia direttamente
    if (!hasCustomConfig) {
      setG(newGuests);
      return;
    }
    
    // Se la biancheria è stata personalizzata, mostra dialog di conferma
    setPendingGuestCount(newGuests);
    setShowGuestChangeDialog(true);
  };
  
  // Conferma cambio ospiti con reset biancheria a standard
  const handleGuestChangeUseStandard = () => {
    if (pendingGuestCount === null) return;
    setLinenConfigModified(false); // Reset flag - userà serviceConfigs
    setForcedStandard(true); // 🔥 Evita che il dialog riappaia per il resto della sessione
    setG(pendingGuestCount);
    setShowGuestChangeDialog(false);
    setPendingGuestCount(null);
  };
  
  // Conferma cambio ospiti mantenendo biancheria personalizzata
  const handleGuestChangeKeepCustom = () => {
    if (pendingGuestCount === null) return;
    // Mantieni linenConfigModified=true
    setG(pendingGuestCount);
    setShowGuestChangeDialog(false);
    setPendingGuestCount(null);
  };

  const bedP = invLinen.reduce((s, i) => s + i.p * getLinenQtyFromBl(c.bl, i.id), 0);
  const bathP = calcArr(c.ba || {}, invBath);
  const kitP = calcArr(c.ki || {}, invKit);
  const exP = calcArr((c.ex || {}) as Record<string, boolean>, invExtras);
  // FIX: Cerca il prezzo in tutti i posti possibili
  const contractPrice = property?.cleaningPrice || cleaning?.contractPrice || cleaning?.price || 0;
  // 🔥 FIX: Se biancheria disabilitata, dotazioni = 0 (solo exP per servizi extra)
  const totalDotazioni = linenEnabled ? (bedP + bathP + kitP + exP) : exP;
  
  // Calcolo prezzo effettivo
  const selectedType = serviceTypes.find(st => st.code === selectedServiceType);
  const isSgrosso = selectedServiceType === "SGROSSO";
  const effectiveCleaningPrice = customPrice !== null ? customPrice : contractPrice;
  const priceIsModified = customPrice !== null && customPrice !== contractPrice;
  const extraServicesTotal = extraServices.reduce((sum, e) => sum + e.price, 0);
  const totalPrice = effectiveCleaningPrice + totalDotazioni + extraServicesTotal;

  // Funzione per eliminare una foto (Admin)
  const handleDeletePhoto = async () => {
    if (photoToDelete === null || !cleaning?.id) return;
    
    setDeletingPhoto(true);
    try {
      // Aggiorna array locale
      const newPhotos = localPhotos.filter((_, i) => i !== photoToDelete);
      setLocalPhotos(newPhotos);
      
      // Aggiorna Firestore
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        photos: newPhotos,
        updatedAt: Timestamp.now(),
      });
      
      setShowDeletePhotoConfirm(false);
      setPhotoToDelete(null);
    } catch (error) {
      console.error("❌ Errore eliminazione foto:", error);
      alert("Errore durante l'eliminazione della foto");
    } finally {
      setDeletingPhoto(false);
    }
  };

  const handleSave = async (forceInProgress = false) => {
    
    // @ts-expect-error TODO-FIX: TS7015 Element implicitly has an 'any' type because index expression is not of type 'nu...
    if (cfgs[g] || cfgs[String(g)]) {
      // @ts-expect-error TODO-FIX: TS7015 Element implicitly has an 'any' type because index expression is not of type 'nu...
      const cfg = cfgs[g] || cfgs[String(g)];
    }
    
    
    // Validazioni
    if (isAdmin && priceIsModified && !priceChangeReason.trim()) {
      alert("Inserisci la motivazione del cambio prezzo");
      return;
    }
    
    if (isAdmin && isSgrosso && !sgrossoReason) {
      alert("Seleziona il motivo dello sgrosso");
      return;
    }
    
    if (isAdmin && sgrossoReason === "ALTRO" && !sgrossoNotes.trim()) {
      alert("Per 'Altro' devi specificare il motivo nelle note");
      return;
    }
    
    // 🔥 Controllo IN_PROGRESS: se la data è cambiata e la pulizia è in corso, chiedi conferma
    const cleaningOriginalDate = cleaning.date instanceof Date ? cleaning.date : new Date(cleaning.date);
    const cleaningOriginalDateStr = cleaningOriginalDate.toISOString().split('T')[0];
    const isDateChanged = date !== cleaningOriginalDateStr;
    const isInProgress = cleaning.status === "IN_PROGRESS" || cleaning.status === "in_progress";
    
    if (isDateChanged && isInProgress && !forceInProgress) {
      setShowInProgressConfirm(true);
      return;
    }

    setSaving(true);
    try {
      // Prepara dati base
      const updateData: Record<string, unknown> = {
        scheduledDate: new Date(date), 
        guestsCount: g,
        guestsConfirmed: true,
        notes, 
        updatedAt: new Date(),
      };
      
      // Se la data è cambiata, blocca la pulizia dal sync iCal
      // lockedFromSync = true → il cron non ricrea mai questa pulizia nella vecchia data
      // originalScheduledDate = data originale del checkout → usata dal cron per il match
      const origDateForFlag = cleaning.date instanceof Date ? cleaning.date : new Date(cleaning.date);
      const origDateStrForFlag = origDateForFlag.toISOString().split('T')[0];
      if (date !== origDateStrForFlag) {
        updateData.lockedFromSync = true;
        updateData.manuallyMoved = true;
        // Preserva originalScheduledDate originale se già presente (doppio spostamento)
        // Così il cron trova sempre il checkout originale del booking
        if (!(cleaning as any).originalScheduledDate) {
          updateData.originalScheduledDate = Timestamp.fromDate(origDateForFlag);
        }
      }
      
      // 🔥 Se la pulizia era IN_PROGRESS e la data è cambiata, resetta lo status
      const cleaningOriginalDateCheck = cleaning.date instanceof Date ? cleaning.date : new Date(cleaning.date);
      const cleaningOriginalDateStrCheck = cleaningOriginalDateCheck.toISOString().split('T')[0];
      const isDateChangedCheck = date !== cleaningOriginalDateStrCheck;
      const wasInProgress = cleaning.status === "IN_PROGRESS" || cleaning.status === "in_progress";
      
      if (isDateChangedCheck && wasInProgress) {
        // Resetta status: se ha operatore → ASSIGNED, altrimenti → SCHEDULED
        // @ts-expect-error TODO-FIX: TS2339 Property 'operatorId' does not exist on type 'Cleaning'.
        const hasOperator = cleaning.operatorId || (cleaning.operators && cleaning.operators.length > 0);
        updateData.status = hasOperator ? "ASSIGNED" : "SCHEDULED";
        updateData.startedAt = null; // Rimuovi timestamp inizio
        updateData.wasInProgressBeforeMove = true; // Flag per tracking
      }
      
      // 🔥 FIX: Salva customLinenConfig SOLO se è stata modificata manualmente
      // Così gli aggiornamenti dal configuratore proprietà si propagano alle pulizie
      if (linenConfigModified) {
        // @ts-expect-error TODO-FIX: TS7015 Element implicitly has an 'any' type because index expression is not of type 'nu...
        updateData.customLinenConfig = cfgs[g] || cfgs[String(g)];
        updateData.linenConfigModified = true;
      } else {
        // 🔥 Se l'utente ha scelto "Usa standard" o non ha modificato nulla,
        // RIMUOVI customLinenConfig da Firestore per usare serviceConfigs della proprietà
        updateData.linenConfigModified = false;
        // Nota: customLinenConfig verrà rimosso con un update separato
      }
      
      // 🔥 Rimuovi customLinenConfig se non più necessario (update separato per deleteField)
      // ANCHE se biancheria viene disattivata, rimuovi la config personalizzata
      const shouldRemoveCustomConfig = (!linenConfigModified && cleaning?.customLinenConfig) || !linenEnabled;
      
      // 🔥 Salva stato toggle biancheria
      updateData.hasLinenOrder = linenEnabled;
      
      // 🔥 Se biancheria disattivata, resetta anche linenConfigModified
      if (!linenEnabled) {
        updateData.linenConfigModified = false;
      }
      
      // Traccia modifica data se è stata cambiata
      const cleaningOriginalDate = cleaning.date instanceof Date ? cleaning.date : new Date(cleaning.date);
      const cleaningOriginalDateStr = cleaningOriginalDate.toISOString().split('T')[0];
      if (date !== cleaningOriginalDateStr && !cleaning.dateModifiedAt) {
        // Prima modifica della data - salva la data originale
        updateData.originalDate = cleaningOriginalDate;
        updateData.dateModifiedAt = new Date();
      } else if (date !== cleaningOriginalDateStr && cleaning.dateModifiedAt) {
        // Data già modificata in precedenza - aggiorna solo dateModifiedAt
        updateData.dateModifiedAt = new Date();
      }
      
      // Se admin, aggiungi campi servizio e orario
      if (isAdmin) {
        updateData.scheduledTime = time; // Admin può modificare orario
        updateData.serviceType = selectedServiceType;
        updateData.serviceTypeName = selectedType?.name || "Pulizia Standard";
        
        if (priceIsModified) {
          updateData.price = effectiveCleaningPrice;
          updateData.priceModified = true;
          updateData.priceChangeReason = priceChangeReason;
          updateData.contractPrice = contractPrice;
        }
        
        if (isSgrosso) {
          updateData.sgrossoReason = sgrossoReason;
          updateData.sgrossoNotes = sgrossoNotes || null;
          const reasonObj = SGROSSO_REASONS.find(r => r.code === sgrossoReason);
          updateData.sgrossoReasonLabel = reasonObj?.label || "";
        } else {
          // Pulisci campi SGROSSO se cambio tipo
          updateData.sgrossoReason = null;
          updateData.sgrossoNotes = null;
          updateData.sgrossoReasonLabel = null;
        }
      }
      
      await updateDoc(doc(db, "cleanings", cleaning.id), updateData);

      // 🔒 Se la data è cambiata:
      // 1. Crea syncExclusion per la data originale
      // 2. Aggiorna il booking collegato con la nuova data checkout
      const cleaningBookingSource = (cleaning as any).bookingSource || (cleaning as any).source;
      const cleaningBookingId = (cleaning as any).bookingId;
      if (date !== originalDate && cleaningBookingSource && 
          !['manual', 'direct', 'phone'].includes(cleaningBookingSource)) {
        try {
          // 1. SyncExclusion per data originale
          await addDoc(collection(db, "syncExclusions"), {
            propertyId: cleaning.propertyId,
            originalDate: Timestamp.fromDate(new Date(originalDate)),
            bookingSource: cleaningBookingSource,
            bookingId: cleaningBookingId || null,
            reason: "MOVED",
            newDate: Timestamp.fromDate(new Date(date)),
            cleaningId: cleaning.id,
            createdAt: Timestamp.now(),
            createdBy: user?.id || "unknown",
          });
        } catch (excErr) {
          console.error("Errore creazione syncExclusion:", excErr);
        }

        // Nota: NON aggiorniamo il booking checkout — il checkout dell'ospite è invariato
      }
      
      // 🔥 Se l'utente ha scelto "Usa standard", rimuovi customLinenConfig con deleteField()
      if (shouldRemoveCustomConfig) {
        await updateDoc(doc(db, "cleanings", cleaning.id), {
          customLinenConfig: deleteField()
        });
      }
      
      // 🔥 GESTIONE ORDINE BIANCHERIA basata su linenEnabled
      try {
        
        // Cerca l'ordine esistente - prima per cleaningId, poi per propertyId + data
        let orderDoc = null;
        
        // 1. Cerca per cleaningId
        const ordersQuery1 = query(
          collection(db, "orders"),
          where("cleaningId", "==", cleaning.id)
        );
        const ordersSnapshot1 = await getDocs(ordersQuery1);
        
        if (!ordersSnapshot1.empty) {
          orderDoc = ordersSnapshot1.docs[0];
        } else {
          // 🔥 SEMPLIFICATO: Non cerchiamo per propertyId + data (richiede indice)
          // Se non c'è ordine per cleaningId, ne creeremo uno nuovo
        }
        
        // 🔥 Se biancheria DISABILITATA → elimina ordine esistente
        if (!linenEnabled) {
          if (orderDoc) {
            await deleteDoc(doc(db, "orders", orderDoc.id));
          } else {
          }
        } else {
          // 🔥 Se biancheria ABILITATA → aggiorna/crea ordine
          // 🔧 FIX: Prova sia con numero che con stringa (Firestore salva chiavi come stringhe)
          // @ts-expect-error TODO-FIX: TS7015 Element implicitly has an 'any' type because index expression is not of type 'nu...
          const currentConfig = cfgs[g] || cfgs[String(g)];
          
          // 🔥 Calcola pickupItems da ordini precedenti (usato sia per create che update)
          let pickupData: { pickupItems: any[], pickupFromOrders: string[] } = { pickupItems: [], pickupFromOrders: [] };
          try {
            const pickupRes = await fetch(`/api/orders/calculate-pickup?propertyId=${property.id}`);
            if (pickupRes.ok) {
              pickupData = await pickupRes.json();
            }
          } catch (e) { console.error("Errore calcolo pickup:", e); }
          
          if (currentConfig) {
            
            // Genera items dall'attuale configurazione
            const orderItems: Array<{itemId: string; id: string; name: string; quantity: number; unitPrice: number; totalPrice: number; categoryName: string}> = [];
            
            // 🔧 FIX: Biancheria Letto - USA SEMPRE 'all' SE PRESENTE
            if (currentConfig.bl) {
              const hasAll = currentConfig.bl['all'] && typeof currentConfig.bl['all'] === 'object' && Object.keys(currentConfig.bl['all']).length > 0;
              
              if (hasAll) {
                // USA SOLO 'all' - contiene i totali configurati
                Object.entries(currentConfig.bl['all']).forEach(([itemId, qty]) => {
                  if (typeof qty === 'number' && qty > 0) {
                    const invItem = invLinen.find(i => i.id === itemId);
                    const unitPrice = invItem?.p || 0;
                    orderItems.push({
                      itemId: itemId,
                      id: itemId,
                      name: invItem?.n || getItemName(itemId),
                      quantity: qty,
                      unitPrice: unitPrice,
                      totalPrice: qty * unitPrice,
                      categoryName: "Biancheria Letto"
                    });
                  }
                });
              } else {
                // Fallback: somma da gruppi letto (escludendo 'all')
                Object.entries(currentConfig.bl).forEach(([bedKey, bedItems]) => {
                  if (bedKey !== 'all' && typeof bedItems === 'object' && bedItems !== null) {
                    Object.entries(bedItems).forEach(([itemId, qty]) => {
                      if (typeof qty === 'number' && qty > 0) {
                        const invItem = invLinen.find(i => i.id === itemId);
                        const unitPrice = invItem?.p || 0;
                        const existing = orderItems.find(o => o.itemId === itemId || o.id === itemId);
                        if (existing) {
                          existing.quantity += qty;
                          existing.totalPrice = existing.quantity * (existing.unitPrice || unitPrice);
                        } else {
                          orderItems.push({
                            itemId: itemId,
                            id: itemId,
                            name: invItem?.n || getItemName(itemId),
                            quantity: qty,
                            unitPrice: unitPrice,
                            totalPrice: qty * unitPrice,
                            categoryName: "Biancheria Letto"
                          });
                        }
                      }
                    });
                  }
                });
              }
            }
            
            // Biancheria Bagno
            if (currentConfig.ba) {
              Object.entries(currentConfig.ba).forEach(([itemId, qty]) => {
                if (typeof qty === 'number' && qty > 0) {
                  const invItem = invBath.find(i => i.id === itemId);
                  const unitPrice = invItem?.p || 0;
                  orderItems.push({
                    itemId: itemId,
                    id: itemId,
                    name: invItem?.n || getItemName(itemId),
                    quantity: qty,
                    unitPrice: unitPrice,
                    totalPrice: qty * unitPrice,
                    categoryName: "Biancheria Bagno"
                  });
                }
              });
            }
            
            // Kit Cortesia
            if (currentConfig.ki) {
              Object.entries(currentConfig.ki).forEach(([itemId, qty]) => {
                if (typeof qty === 'number' && qty > 0) {
                  const invItem = invKit.find(i => i.id === itemId);
                  const unitPrice = invItem?.p || 0;
                  orderItems.push({
                    itemId: itemId,
                    id: itemId,
                    name: invItem?.n || getItemName(itemId),
                    quantity: qty,
                    unitPrice: unitPrice,
                    totalPrice: qty * unitPrice,
                    categoryName: "Kit Cortesia"
                  });
                }
              });
            }
            
            orderItems.forEach((item, i) => {
            });
            
            if (orderDoc) {
              // Aggiorna l'ordine esistente
              // 🔥 FIX: Se la pulizia è completata, setta anche l'ordine come DELIVERED
              const orderUpdateData: any = {
                items: orderItems,
                cleaningId: cleaning.id,
                scheduledDate: Timestamp.fromDate(new Date(date)),
                updatedAt: Timestamp.now()
              };
              
              // Aggiorna anche pickup se mancano
              if (pickupData.pickupItems.length > 0) {
                orderUpdateData.includePickup = true;
                orderUpdateData.pickupItems = pickupData.pickupItems;
                orderUpdateData.pickupFromOrders = pickupData.pickupFromOrders;
              }
              
              // Se la pulizia è completata, l'ordine deve essere DELIVERED
              if (isCompleted || cleaning.status === "COMPLETED") {
                orderUpdateData.status = "DELIVERED";
                orderUpdateData.deliveredAt = Timestamp.now();
              }
              
              await updateDoc(doc(db, "orders", orderDoc.id), orderUpdateData);
            } else if (orderItems.length > 0) {
              // Crea nuovo ordine se non esiste e ci sono items
              
              // 🔥 FIX: Se pulizia completata, crea ordine già DELIVERED
              const orderStatus = (isCompleted || cleaning.status === "COMPLETED") ? "DELIVERED" : "PENDING";
              
              const { createOrder } = await import("~/lib/firebase/firestore-data");
              const newOrderId = await createOrder({
                cleaningId: cleaning.id,
                propertyId: property.id,
                propertyName: property.name,
                propertyAddress: property.address || "",
                propertyCity: (property as any).city || "",
                propertyPostalCode: (property as any).postalCode || "",
                propertyFloor: (property as any).floor || "",
                propertyApartment: (property as any).apartment || "",
                propertyIntercom: (property as any).intercom || "",
                propertyDoorCode: (property as any).doorCode || "",
                propertyKeysLocation: (property as any).keysLocation || "",
                propertyAccessNotes: (property as any).accessNotes || "",
                status: orderStatus,
                // @ts-expect-error TODO-FIX: TS2322 Type 'Timestamp | null' is not assignable to type 'Timestamp | undefined'.
                deliveredAt: orderStatus === "DELIVERED" ? Timestamp.now() : null,
                type: "LINEN",
                scheduledDate: Timestamp.fromDate(new Date(date)),
                scheduledTime: time || "10:00",
                urgency: "normal",
                items: orderItems,
                includePickup: (pickupData.pickupItems || []).length > 0,
                pickupItems: pickupData.pickupItems || [],
                pickupFromOrders: pickupData.pickupFromOrders || [],
                pickupCompleted: false,
                notes: ""
              });
            } else {
            }
          } else {
            // currentConfig è undefined - proviamo a usare serviceConfigs della proprietà
            
            if (property.serviceConfigs) {
              // @ts-expect-error TODO-FIX: TS7015 Element implicitly has an 'any' type because index expression is not of type 'nu...
              const propConfig = property.serviceConfigs[g] || property.serviceConfigs[String(g)];
              if (propConfig && propConfig.bl) {
                const orderItems: Array<{itemId: string; id: string; name: string; quantity: number; unitPrice: number; totalPrice: number; categoryName: string}> = [];
                
                // Usa bl['all'] o somma da gruppi
                const blAll = propConfig.bl['all'] || {};
                Object.entries(blAll).forEach(([itemId, qty]) => {
                  if (typeof qty === 'number' && qty > 0) {
                    const invItem = invLinen.find(i => i.id === itemId);
                    const unitPrice = invItem?.p || 0;
                    orderItems.push({
                      itemId: itemId,
                      id: itemId,
                      name: invItem?.n || getItemName(itemId),
                      quantity: qty,
                      unitPrice: unitPrice,
                      totalPrice: qty * unitPrice,
                      categoryName: "Biancheria Letto"
                    });
                  }
                });
                
                // Bagno
                if (propConfig.ba) {
                  Object.entries(propConfig.ba).forEach(([itemId, qty]) => {
                    if (typeof qty === 'number' && qty > 0) {
                      const invItem = invBath.find(i => i.id === itemId);
                      const unitPrice = invItem?.p || 0;
                      orderItems.push({
                        itemId: itemId,
                        id: itemId,
                        name: invItem?.n || getItemName(itemId),
                        quantity: qty,
                        unitPrice: unitPrice,
                        totalPrice: qty * unitPrice,
                        categoryName: "Biancheria Bagno"
                      });
                    }
                  });
                }
                
                // Kit
                if (propConfig.ki) {
                  Object.entries(propConfig.ki).forEach(([itemId, qty]) => {
                    if (typeof qty === 'number' && qty > 0) {
                      const invItem = invKit.find(i => i.id === itemId);
                      const unitPrice = invItem?.p || 0;
                      orderItems.push({
                        itemId: itemId,
                        id: itemId,
                        name: invItem?.n || getItemName(itemId),
                        quantity: qty,
                        unitPrice: unitPrice,
                        totalPrice: qty * unitPrice,
                        categoryName: "Kit Cortesia"
                      });
                    }
                  });
                }
                
                if (orderItems.length > 0) {
                  // 🔥 FIX: Se pulizia completata, crea ordine già DELIVERED
                  const fallbackOrderStatus = (isCompleted || cleaning.status === "COMPLETED") ? "DELIVERED" : "PENDING";
                  
                  const { createOrder } = await import("~/lib/firebase/firestore-data");
                  const newOrderId = await createOrder({
                    cleaningId: cleaning.id,
                    propertyId: property.id,
                    propertyName: property.name,
                    propertyAddress: property.address || "",
                    propertyCity: (property as any).city || "",
                    propertyPostalCode: (property as any).postalCode || "",
                    propertyFloor: (property as any).floor || "",
                    propertyApartment: (property as any).apartment || "",
                    propertyIntercom: (property as any).intercom || "",
                    propertyDoorCode: (property as any).doorCode || "",
                    propertyKeysLocation: (property as any).keysLocation || "",
                    propertyAccessNotes: (property as any).accessNotes || "",
                    status: fallbackOrderStatus,
                    // @ts-expect-error TODO-FIX: TS2322 Type 'Timestamp | null' is not assignable to type 'Timestamp | undefined'.
                    deliveredAt: fallbackOrderStatus === "DELIVERED" ? Timestamp.now() : null,
                    type: "LINEN",
                    scheduledDate: Timestamp.fromDate(new Date(date)),
                    scheduledTime: time || "10:00",
                    urgency: "normal",
                    items: orderItems,
                    includePickup: (pickupData?.pickupItems || []).length > 0,
                    pickupItems: pickupData?.pickupItems || [],
                    pickupFromOrders: pickupData?.pickupFromOrders || [],
                    pickupCompleted: false,
                    notes: ""
                  });
                }
              } else {
              }
            }
          }
        }
      } catch (orderError) {
        console.error("❌ [Save] ERRORE GESTIONE ORDINE:");
        console.error("   Error message:", (orderError as Error)?.message);
        console.error("   Error:", orderError);
        // Non bloccare il salvataggio se la gestione ordine fallisce
      }
      
      onSuccess?.(); onClose();
    } catch (e) { console.error(e); alert('Errore nel salvataggio'); } finally { setSaving(false); }
  };

  // ═══════════════════════════════════════════════════════════════
  // ADMIN: Upload foto manuali (via API server-side per bypassare Storage Rules)
  // ═══════════════════════════════════════════════════════════════
  const handleManualPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploadingManualPhotos(true);
    const newUrls: string[] = [];
    
    try {
      for (const file of Array.from(files)) {
        // Comprimi immagine prima dell'upload
        const compressedFile = await compressImageFile(file);
        
        // Converti a base64 per invio via API
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(compressedFile);
        });
        
        const timestamp = Date.now();
        const fileName = `${timestamp}_manual_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        
        // Upload via API server-side (bypassa Storage Rules)
        const res = await fetch("/api/cleanings/upload-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cleaningId: cleaning.id,
            imageBase64: base64,
            fileName,
          }),
        });
        
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Upload fallito (${res.status})`);
        }
        
        const data = await res.json();
        newUrls.push(data.url);
      }
      
      setManualCompletePhotos(prev => [...prev, ...newUrls]);
    } catch (error) {
      console.error("Errore upload foto:", error);
      alert("Errore durante il caricamento delle foto");
    } finally {
      setUploadingManualPhotos(false);
      if (manualPhotoInputRef.current) {
        manualPhotoInputRef.current.value = '';
      }
    }
  };
  
  // Funzione helper per comprimere immagini
  const compressImageFile = async (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Max 1200px per lato
        const maxSize = 1200;
        let { width, height } = img;
        
        if (width > height && width > maxSize) {
          height = (height / width) * maxSize;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width / height) * maxSize;
          height = maxSize;
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => resolve(blob || file),
          'image/jpeg',
          0.8
        );
      };
      
      img.src = URL.createObjectURL(file);
    });
  };
  
  // Rimuovi foto dalla lista manuale
  const handleRemoveManualPhoto = (index: number) => {
    setManualCompletePhotos(prev => prev.filter((_, i) => i !== index));
  };
  
  // ═══════════════════════════════════════════════════════════════
  // ADMIN: Completa manualmente la pulizia
  // ═══════════════════════════════════════════════════════════════
  const handleManualComplete = async () => {
    setCompletingManually(true);
    try {
      const now = new Date();
      
      // Aggiorna la pulizia su Firebase
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        status: "COMPLETED",
        completedAt: Timestamp.fromDate(now),
        startedAt: Timestamp.fromDate(now), // Se non c'era startedAt, usa ora
        photos: manualCompletePhotos.length > 0 ? manualCompletePhotos : [],
        manuallyCompletedBy: "ADMIN",
        manuallyCompletedAt: Timestamp.fromDate(now),
        notes: notes ? `${notes}\n\n[Completata manualmente da admin il ${now.toLocaleDateString('it-IT')}]` : `[Completata manualmente da admin il ${now.toLocaleDateString('it-IT')}]`,
        updatedAt: now,
      });
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Errore completamento manuale:", error);
      alert("Errore durante il completamento manuale");
    } finally {
      setCompletingManually(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { 
      // Usa l'API /cancel per gestire correttamente esclusioni sync e notifiche
      const res = await fetch(`/api/cleanings/${cleaning.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Eliminata da utente",
          deleteCompletely: isAdmin, // Solo admin può eliminare completamente
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore durante la cancellazione");
      }
      
      onSuccess?.(); 
      onClose(); 
    } catch (e) { 
      console.error(e); 
      alert(e instanceof Error ? e.message : 'Errore durante la cancellazione'); 
    } finally { 
      setDeleting(false); 
    }
  };

  if (!isOpen) return null;

  if (showDeleteConfirm) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-red-500 to-rose-400"></div>
          <div className="p-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center"><div className="w-7 h-7 text-red-500">{I.trash}</div></div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Eliminare la prenotazione?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">Questa azione non può essere annullata.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl" disabled={deleting}>Annulla</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl disabled:opacity-50">{deleting ? 'Elimino...' : 'Elimina'}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Modal conferma cambio data
  // 🔥 Modal conferma spostamento pulizia IN_PROGRESS
  if (showInProgressConfirm) {
    // @ts-expect-error TODO-FIX: TS2339 Property 'operatorName' does not exist on type 'Cleaning'.
    const operatorName = cleaning.operatorName || cleaning.operators?.[0]?.name || "L'operatore";
    
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
          <div className="bg-amber-500 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-xl">⚠️</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Pulizia in corso!</h3>
                <p className="text-amber-100 text-sm">Richiesta conferma</p>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <p className="text-gray-700 mb-4">
              <strong>{operatorName}</strong> ha già iniziato questa pulizia.
            </p>
            <p className="text-gray-600 mb-6">
              Se la sposti, il lavoro verrà interrotto e l'operatore dovrà ricominciare nella nuova data.
            </p>
            
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-amber-800 text-sm">
                <strong>Nota:</strong> L'operatore riceverà una notifica di avviso.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowInProgressConfirm(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  setShowInProgressConfirm(false);
                  handleSave(true); // Forza il salvataggio
                }}
                disabled={saving}
                className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Sposta comunque</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showDateConfirm) {
    const formatDateIT = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };
    
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-amber-500 to-orange-400"></div>
          <div className="p-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
              <div className="w-7 h-7 text-amber-600">{I.calendar}</div>
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Conferma cambio data</h3>
            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-500">Data attuale:</span>
                <span className="text-sm font-semibold text-slate-700">{formatDateIT(originalDate)}</span>
              </div>
              <div className="flex items-center justify-center my-2">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Nuova data:</span>
                <span className="text-sm font-bold text-amber-600">{formatDateIT(pendingDate)}</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 text-center mb-4">Vuoi spostare questa pulizia alla nuova data?</p>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowDateConfirm(false);
                  setPendingDate("");
                }} 
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl"
              >
                Annulla
              </button>
              <button 
                onClick={() => {
                  setDate(pendingDate);
                  setDateHasChanged(true);
                  setShowDateConfirm(false);
                  setPendingDate("");
                }} 
                className="flex-1 py-3 bg-amber-500 text-white font-semibold rounded-xl"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 🔥 Modal conferma cambio numero ospiti con biancheria personalizzata
  if (showGuestChangeDialog && pendingGuestCount !== null) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
          <div className="p-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Biancheria personalizzata</h3>
            <div className="bg-blue-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-slate-600 text-center mb-3">
                Hai modificato la biancheria per <strong>{g} ospiti</strong>.
              </p>
              <p className="text-sm text-slate-600 text-center">
                Vuoi usare la biancheria <strong>standard</strong> per <strong>{pendingGuestCount} ospiti</strong> o <strong>mantenere</strong> la tua personalizzazione?
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleGuestChangeUseStandard}
                className="w-full py-3 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Usa standard per {pendingGuestCount} ospiti
              </button>
              <button 
                onClick={handleGuestChangeKeepCustom}
                className="w-full py-3 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Mantieni personalizzata
              </button>
              <button 
                onClick={() => {
                  setShowGuestChangeDialog(false);
                  setPendingGuestCount(null);
                }}
                className="w-full py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (<div className="fixed inset-0 z-50 flex flex-col bg-white items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div><p className="mt-3 text-slate-500">Caricamento...</p></div>);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 bg-white pt-12 px-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">
                {isCompleted ? "Dettaglio Pulizia Completata" : "Modifica Servizio"}
              </h2>
              {/* Badge SCADUTA per pulizie non completate oltre deadline */}
              {!isCompleted && cleaning.missedDeadline && (
                <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full animate-pulse">
                  ⚠️ SCADUTA
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">{property?.name}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-95">
            <div className="w-5 h-5 text-slate-500">{I.close}</div>
          </button>
        </div>

        {/* Tab Navigation - Diverse per completate */}
        {isCompleted ? (
          <div className="flex bg-emerald-50 rounded-xl p-1">
            <button
              onClick={() => handleTabChange('details')}
              className={`flex-1 py-2.5 px-2 rounded-lg font-semibold text-xs transition-all ${activeTab === 'details' ? 'bg-white text-emerald-700 shadow-sm' : 'text-emerald-600'}`}
            >
              📋 Riepilogo
            </button>
            <button
              onClick={() => handleTabChange('linen')}
              className={`flex-1 py-2.5 px-2 rounded-lg font-semibold text-xs transition-all ${activeTab === 'linen' ? 'bg-white text-emerald-700 shadow-sm' : 'text-emerald-600'}`}
            >
              🛏️ Dotazioni
            </button>
            <button
              onClick={() => handleTabChange('photos')}
              // @ts-expect-error TODO-FIX: TS2367 This comparison appears to be unintentional because the types '"details" | "serv...
              className={`flex-1 py-2.5 px-2 rounded-lg font-semibold text-xs transition-all ${activeTab === 'photos' ? 'bg-white text-emerald-700 shadow-sm' : 'text-emerald-600'}`}
            >
              📷 Foto ({cleaning.photos?.length || 0})
            </button>
          </div>
        ) : (
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => handleTabChange('details')}
              className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-xs transition-all ${activeTab === 'details' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              Dettagli
            </button>
            <button
              onClick={() => handleTabChange('service')}
              className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-xs transition-all ${activeTab === 'service' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              Servizio
            </button>
            <button
              onClick={() => handleTabChange('linen')}
              className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-xs transition-all ${activeTab === 'linen' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              Biancheria
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3">
        {/* ==================== TAB DETTAGLI ==================== */}
        {activeTab === 'details' && (
          <>
            {/* Proprietà */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-blue-600">{I.home}</div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">{property?.name}</span>
                    {property?.address && <p className="text-xs text-slate-500">{property.address}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* CONTENUTO PER PULIZIE NON COMPLETATE                              */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {!isCompleted && (
              <>
                {/* Timeline Pulizia Approfondita - SOLO ADMIN */}
                {isAdmin && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 overflow-hidden shadow-sm mb-3">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs font-semibold text-indigo-800">Ciclo pulizia approfondita</span>
                    </div>
                    <span className="text-xs font-bold text-indigo-600">{cleaningCount}/5</span>
                  </div>
                  
                  {loadingCount ? (
                    <div className="flex justify-center py-2">
                      <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <>
                      {/* Barra progresso semplice */}
                      <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-400 to-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${(cleaningCount / 5) * 100}%` }}
                        ></div>
                      </div>
                      
                      {/* Info */}
                      <div className="text-center mt-2">
                        {cleaningCount === 4 ? (
                          <p className="text-xs text-indigo-700 font-medium">
                            🎯 La prossima sarà <span className="font-bold">Approfondita</span>!
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            {cleaningCount} completate • {5 - cleaningCount} alla prossima approfondita
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Data */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-slate-600">{I.calendar}</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">Data Pulizia</span>
                </div>
                <input 
                  type="date" 
                  value={date} 
                  onChange={(e) => {
                    const newDate = e.target.value;
                    if (newDate !== originalDate) {
                      // 🔒 Blocco proprietario: non può spostare a una data con deadline scaduta
                      if (!isAdmin) {
                        const targetDate = new Date(newDate);
                        targetDate.setHours(12, 0, 0, 0);
                        const deadline = new Date(targetDate);
                        deadline.setDate(deadline.getDate() - 1);
                        deadline.setHours(20, 0, 0, 0);
                        if (new Date() >= deadline) {
                          alert('Non puoi spostare la pulizia a questa data: il termine di modifica è scaduto (ore 20:00 del giorno prima).');
                          return;
                        }
                      }
                      setPendingDate(newDate);
                      setShowDateConfirm(true);
                    } else {
                      setDate(newDate);
                      setDateHasChanged(false); // Tornato a data originale
                    }
                  }} 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"
                />
                
                {/* Avviso: premi salva per applicare modifiche */}
                {dateHasChanged && (
                  <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs font-semibold text-emerald-800">
                        Data modificata! Premi <span className="text-emerald-700">"Salva Modifiche"</span> per applicare.
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Mostra se la data è stata modificata (storico) */}
                {!dateHasChanged && cleaning.dateModifiedAt && cleaning.originalDate && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-amber-800">Data pulizia modificata</p>
                        <p className="text-xs text-amber-700 mt-1">
                          Data originale: <span className="font-medium">
                            {(cleaning.originalDate instanceof Date ? cleaning.originalDate : new Date(cleaning.originalDate)).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          Modificata il: {(cleaning.dateModifiedAt instanceof Date ? cleaning.dateModifiedAt : new Date(cleaning.dateModifiedAt)).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Orario - Modificabile per Admin */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-sky-600">{I.clock}</div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Orario</span>
                    {!isAdmin && <p className="text-xs text-slate-400">Assegnato dall'amministratore</p>}
                  </div>
                </div>
                {isAdmin ? (
                  <input 
                    type="time" 
                    value={time} 
                    onChange={(e) => setTime(e.target.value)} 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-center"
                  />
                ) : (
                  <div className="px-4 py-3 bg-slate-100 rounded-xl text-center">
                    <span className="text-lg font-bold text-slate-700">{time || 'Da assegnare'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Numero Ospiti */}
            <div className={`bg-white rounded-2xl border overflow-hidden shadow-sm mb-3 ${!cleaning?.guestsConfirmed && !isGuestsLocked ? 'border-orange-300 ring-2 ring-orange-200' : 'border-slate-200'}`}>
              <div className="p-4">
                {/* 🚨 AVVISO SE NON CONFERMATO */}
                {!cleaning?.guestsConfirmed && !isGuestsLocked && (
                  <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <p className="font-semibold text-orange-800 text-sm">Inserisci il numero di ospiti!</p>
                        <div className="flex items-center gap-2 mt-1 bg-orange-100 rounded-lg px-2.5 py-1">
                          <span className="text-sm">⏱️</span>
                          <p className="text-xs font-semibold text-orange-700 tabular-nums">
                            Tempo rimasto: <span className="text-orange-900">{countdownText}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 🔒 AVVISO SE APPLICATO AUTOMATICAMENTE (dopo deadline, non confermato) */}
                {!cleaning?.guestsConfirmed && isGuestsLocked && !isAdmin && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🔒</span>
                      <div>
                        <p className="font-semibold text-amber-800 text-sm">Ospiti applicati automaticamente</p>
                        <p className="text-xs text-amber-600">È stato applicato il massimo ({property?.maxGuests || 6} ospiti). Solo admin può modificare.</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-slate-600">{I.users}</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">Numero Ospiti</span>
                  {cleaning?.guestsConfirmed && (
                    <span className="ml-auto px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">✓ Confermato</span>
                  )}
                </div>
                <GuestSelector value={g} onChange={handleGuestChange} max={property?.maxGuests || 6} disabled={isGuestsLocked} lockedMessage={guestsLockedMessage} />
              </div>
            </div>

            {/* Note */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-slate-600">{I.edit}</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">Note (opzionale)</span>
                </div>
                <textarea value={notes} onChange={(e) => !isModalLocked && setNotes(e.target.value)} placeholder="Aggiungi note..." rows={3} readOnly={isModalLocked} className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none ${isModalLocked ? 'opacity-60 cursor-not-allowed' : ''}`}/>
              </div>
            </div>

            {/* Riepilogo Prezzi */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">💰</span>
                  <span className="text-sm font-semibold text-slate-800">Riepilogo</span>
                </div>
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">
                      Pulizia {selectedType?.name ? `(${selectedType.name})` : ""}
                      {priceIsModified && <span className="text-amber-500 ml-1">*</span>}
                    </span>
                    <span className={`text-sm font-bold ${priceIsModified ? 'text-amber-600' : 'text-slate-800'}`}>
                      €{effectiveCleaningPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-sm text-slate-500">Dotazioni</span><span className="text-sm font-bold text-slate-800">€{totalDotazioni.toFixed(2)}</span></div>
                </div>
                <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Totale</span>
                  <span className="text-xl font-bold text-emerald-600">€{totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ADMIN: Sezione Completa Manualmente                              */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {isAdmin && !isCompleted && (
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 overflow-hidden shadow-sm mb-3">
                <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
                <div className="p-4">
                  {/* Header con toggle */}
                  <button 
                    onClick={() => setShowManualCompleteSection(!showManualCompleteSection)}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <span className="text-lg">✅</span>
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-semibold text-emerald-800">Completa Manualmente</span>
                        <p className="text-xs text-emerald-600">Segna come completata (Admin)</p>
                      </div>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showManualCompleteSection ? 'bg-emerald-500 rotate-180' : 'bg-emerald-200'}`}>
                      <svg className={`w-4 h-4 ${showManualCompleteSection ? 'text-white' : 'text-emerald-700'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  
                  {/* Contenuto espanso */}
                  {showManualCompleteSection && (
                    <div className="mt-4 pt-4 border-t border-emerald-200">
                      {/* Badge pulizia scaduta */}
                      {cleaning.missedDeadline && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">⚠️</span>
                            <div>
                              <p className="text-sm font-semibold text-red-700">Pulizia Scaduta</p>
                              <p className="text-xs text-red-600">Non completata entro le 18:00</p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Upload Foto (Opzionale) */}
                      <div className="mb-4">
                        <p className="text-xs font-medium text-emerald-700 mb-2">📸 Aggiungi Foto (opzionale)</p>
                        
                        {/* Input file nascosto */}
                        <input
                          ref={manualPhotoInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleManualPhotoUpload}
                          className="hidden"
                        />
                        
                        {/* Bottone upload */}
                        <button
                          onClick={() => manualPhotoInputRef.current?.click()}
                          disabled={uploadingManualPhotos}
                          className="w-full py-3 border-2 border-dashed border-emerald-300 rounded-xl text-emerald-600 font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {uploadingManualPhotos ? (
                            <>
                              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                              <span>Caricamento...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              <span>Aggiungi Foto</span>
                            </>
                          )}
                        </button>
                        
                        {/* Preview foto caricate */}
                        {manualCompletePhotos.length > 0 && (
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            {manualCompletePhotos.map((url, index) => (
                              <div key={index} className="relative aspect-square rounded-lg overflow-hidden">
                                <img src={url} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                                <button
                                  onClick={() => handleRemoveManualPhoto(index)}
                                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <p className="text-[10px] text-emerald-500 mt-2 text-center">
                          Le foto sono opzionali • Puoi completare anche senza
                        </p>
                      </div>
                      
                      {/* Bottone Completa - apre modal conferma */}
                      <button
                        onClick={() => setShowManualCompleteConfirm(true)}
                        disabled={completingManually || uploadingManualPhotos}
                        className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <span className="text-lg">✅</span>
                        <span>Segna come Completata</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Elimina Prenotazione - Solo per pulizie NON completate */}
            {!isReadOnly && !isCompleted && (
              <button onClick={() => setShowDeleteConfirm(true)} className="w-full py-3.5 bg-red-50 border border-red-200 text-red-600 font-semibold rounded-xl flex items-center justify-center gap-2 mb-4">
                <div className="w-5 h-5">{I.trash}</div>
                <span>Elimina Prenotazione</span>
              </button>
            )}
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* RIEPILOGO COMPLETO PER PULIZIE COMPLETATE (nel tab Riepilogo)   */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {isCompleted && (
              <>
                {/* Card Tempo + Status */}
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-4 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <span className="text-2xl">✅</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-800">Pulizia Completata</p>
                        {cleaning.manuallyCompletedBy === "ADMIN" && (
                          <p className="text-xs text-amber-600 font-medium mt-1">
                            👤 Confermata da Admin
                          </p>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleTabChange('photos')}
                      className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-colors"
                    >
                      📷 Foto ({cleaning.photos?.length || 0})
                    </button>
                  </div>
                </div>

                {/* Data - Editabile da Admin */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                          <div className="w-5 h-5 text-amber-600">{I.calendar}</div>
                        </div>
                        <span className="text-sm font-semibold text-slate-800">Data</span>
                      </div>
                      {isAdmin && !isEditingCompleted && (
                        <button
                          onClick={() => {
                            setCompletedEditType('date');
                            setShowCompletedEditConfirm(true);
                          }}
                          className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-200 transition-colors"
                        >
                          ✏️ Modifica
                        </button>
                      )}
                    </div>
                    {isAdmin && isEditingCompleted && completedEditType === 'date' ? (
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full px-4 py-3 bg-amber-50 border-2 border-amber-300 rounded-xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    ) : (
                      <div className="px-4 py-3 bg-slate-50 rounded-xl text-center">
                        <span className="text-lg font-bold text-slate-700">
                          {new Date(date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Orario - Read Only */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                        <div className="w-5 h-5 text-sky-600">{I.clock}</div>
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-800">Orario</span>
                        <p className="text-xs text-slate-400">Non modificabile</p>
                      </div>
                    </div>
                    <div className="px-4 py-3 bg-slate-50 rounded-xl text-center">
                      <span className="text-lg font-bold text-slate-700">{time || 'Non specificato'}</span>
                    </div>
                  </div>
                </div>

                {/* Numero Ospiti - Editabile da Admin */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                          <div className="w-5 h-5 text-purple-600">{I.users}</div>
                        </div>
                        <span className="text-sm font-semibold text-slate-800">Numero Ospiti</span>
                      </div>
                      {isAdmin && !isEditingCompleted && (
                        <button
                          onClick={() => {
                            setCompletedEditType('guests');
                            setShowCompletedEditConfirm(true);
                          }}
                          className="px-3 py-1.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-lg hover:bg-purple-200 transition-colors"
                        >
                          ✏️ Modifica
                        </button>
                      )}
                    </div>
                    {isAdmin && isEditingCompleted && completedEditType === 'guests' ? (
                      <GuestSelector value={g} onChange={handleGuestChange} max={property?.maxGuests || 6} disabled={isGuestsLocked} lockedMessage={guestsLockedMessage} />
                    ) : (
                      <div className="px-4 py-3 bg-slate-50 rounded-xl text-center">
                        <span className="text-lg font-bold text-slate-700">{g} ospiti</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Configurazione Letti */}
                {selectedBedsData.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                            <div className="w-5 h-5 text-blue-600">{I.bed}</div>
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-slate-800">Configurazione Letti</span>
                            <p className="text-xs text-slate-500">{selectedBedsData.length} letti • {totalCap} posti</p>
                          </div>
                        </div>
                        {isAdmin && !isEditingCompleted && (
                          <button
                            onClick={() => {
                              setCompletedEditType('dotazioni');
                              setShowCompletedEditConfirm(true);
                            }}
                            className="px-3 py-1.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-200 transition-colors"
                          >
                            ✏️ Modifica
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedBedsData.map(bed => (
                          <div key={bed.id} className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                            <div className="w-6 h-6 text-blue-600">{getBedIcon(bed.type)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-700 truncate">{bed.name}</p>
                              <p className="text-[10px] text-slate-500">{bed.loc} • {bed.cap}p</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* TIPO SERVIZIO E PREZZO - con modifica admin                       */}
                {/* ═══════════════════════════════════════════════════════════════ */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
                  <div className="h-1 bg-gradient-to-r from-sky-400 to-blue-500"></div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🧹</span>
                        <span className="text-sm font-semibold text-slate-800">Tipo Servizio</span>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => setShowPriceServiceModal(true)}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-200 transition-colors"
                        >
                          ✏️ Modifica
                        </button>
                      )}
                    </div>
                    
                    {/* Tipo servizio attuale */}
                    <div className={`p-3 rounded-xl mb-3 ${
                      selectedServiceType === 'SGROSSO' ? 'bg-purple-50 border border-purple-200' :
                      selectedServiceType === 'APPROFONDITA' ? 'bg-amber-50 border border-amber-200' :
                      'bg-emerald-50 border border-emerald-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {selectedServiceType === 'SGROSSO' ? '🔧' : selectedServiceType === 'APPROFONDITA' ? '✨' : '🧹'}
                        </span>
                        <div>
                          <p className={`font-semibold ${
                            selectedServiceType === 'SGROSSO' ? 'text-purple-700' :
                            selectedServiceType === 'APPROFONDITA' ? 'text-amber-700' :
                            'text-emerald-700'
                          }`}>
                            {selectedServiceType === 'SGROSSO' ? 'Sgrosso' : 
                             selectedServiceType === 'APPROFONDITA' ? 'Pulizia Approfondita' : 
                             'Pulizia Standard'}
                          </p>
                          {selectedServiceType === 'SGROSSO' && sgrossoReason && (
                            <p className="text-xs text-purple-600 mt-0.5">
                              {SGROSSO_REASONS.find(r => r.code === sgrossoReason)?.label || sgrossoReason}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Riepilogo Prezzi */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">💰</span>
                        <span className="text-sm font-semibold text-slate-800">Riepilogo Prezzi</span>
                      </div>
                      {isAdmin && !isEditingCompleted && (
                        <button
                          onClick={() => {
                            setCompletedEditType('dotazioni');
                            setShowCompletedEditConfirm(true);
                          }}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-200 transition-colors"
                        >
                          🛏️ Modifica Dotazioni
                        </button>
                      )}
                    </div>
                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500">
                          Pulizia {selectedType?.name ? `(${selectedType.name})` : ""}
                        </span>
                        <span className={`text-sm font-bold ${cleaning?.priceModified ? 'text-amber-600' : 'text-slate-800'}`}>
                          €{effectiveCleaningPrice.toFixed(2)}
                          {cleaning?.priceModified && <span className="ml-1 text-amber-500">*</span>}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Biancheria Letto</span>
                        <span className="text-sm font-bold text-slate-800">€{bedP.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Biancheria Bagno</span>
                        <span className="text-sm font-bold text-slate-800">€{bathP.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Kit Cortesia</span>
                        <span className="text-sm font-bold text-slate-800">€{kitP.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Servizi Extra Dotazioni</span>
                        <span className="text-sm font-bold text-slate-800">€{exP.toFixed(2)}</span>
                      </div>
                      
                      {/* Servizi Extra Aggiunti */}
                      {extraServices.length > 0 && (
                        <div className="pt-2 border-t border-dashed border-slate-200 mt-2">
                          <p className="text-xs text-slate-400 mb-2">Servizi Extra Aggiunti:</p>
                          {extraServices.map((extra, idx) => (
                            <div key={idx} className="flex justify-between items-center">
                              <span className="text-sm text-slate-500">{extra.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-800">€{extra.price.toFixed(2)}</span>
                                {isAdmin && (
                                  <button
                                    onClick={() => setExtraServices(prev => prev.filter((_, i) => i !== idx))}
                                    className="text-rose-500 hover:text-rose-700 text-xs"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Aggiungi Servizio Extra (solo admin) */}
                      {isAdmin && (
                        <button
                          onClick={() => setShowAddExtraModal(true)}
                          className="w-full mt-2 py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
                        >
                          + Aggiungi Servizio Extra
                        </button>
                      )}
                    </div>
                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-800">Totale</span>
                      <span className="text-xl font-bold text-emerald-600">
                        €{totalPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* VALUTAZIONE OPERATORE - nel tab Riepilogo                        */}
                {/* ═══════════════════════════════════════════════════════════════ */}
                <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm mb-3">
                  <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500"></div>
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                        <span className="text-lg">⭐</span>
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-slate-800">Valutazione Operatore</span>
                        <p className="text-xs text-slate-500">Feedback sulla proprietà</p>
                      </div>
                    </div>
                    {cleaning?.ratingScore ? (
                      <CleaningRatingBadge 
                        // @ts-expect-error TODO-FIX: TS2339 Property 'cleaningId' does not exist on type 'Cleaning'.
                        cleaningId={cleaning.id || cleaning.cleaningId || ''} 
                        ratingScore={cleaning.ratingScore}
                        compact={false}
                        showDetails={true}
                      />
                    ) : (
                      <div className="text-center py-6 bg-slate-50 rounded-xl">
                        <span className="text-3xl block mb-2">📋</span>
                        <p className="text-sm font-medium text-slate-600">Nessuna valutazione</p>
                        <p className="text-xs text-slate-400 mt-1">L'operatore non ha inserito una valutazione per questa pulizia</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* NOTE OPERATORE                                                  */}
                {/* ═══════════════════════════════════════════════════════════════ */}
                {cleaning?.operatorNotes && cleaning.operatorNotes.trim() !== "" && (
                  <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden shadow-sm mb-3">
                    <div className="h-1 bg-gradient-to-r from-blue-400 to-sky-500"></div>
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                          <span className="text-lg">📝</span>
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-semibold text-slate-800">Note Operatore</span>
                          <p className="text-xs text-slate-500">Annotazioni lasciate durante la pulizia</p>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{cleaning.operatorNotes}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* SEGNALAZIONI URGENTI                                            */}
                {/* ═══════════════════════════════════════════════════════════════ */}
                {cleaningIssues.filter((i: any) => i.isUrgent || i.severity === 'critical').length > 0 && (
                  <div className="bg-white rounded-2xl border border-red-300 overflow-hidden shadow-sm mb-3">
                    <div className="h-1.5 bg-gradient-to-r from-red-500 to-rose-500"></div>
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                          <span className="text-lg">🚨</span>
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-bold text-red-800">Segnalazioni Urgenti</span>
                          <p className="text-xs text-red-500">Problemi critici segnalati dall'operatore</p>
                        </div>
                        <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                          {cleaningIssues.filter((i: any) => i.isUrgent || i.severity === 'critical').length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {cleaningIssues
                          .filter((i: any) => i.isUrgent || i.severity === 'critical')
                          .map((issue: any) => (
                            <div key={issue.id} className="bg-red-50 rounded-xl p-3 border border-red-100">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <p className="text-sm font-bold text-red-800">{issue.title?.replace('🚨 URGENTE: ', '')}</p>
                                <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  issue.resolved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {issue.resolved ? '✓ Risolto' : 'Aperto'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mb-2">{issue.description}</p>
                              {issue.photos && issue.photos.length > 0 && (
                                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                                  {issue.photos.map((photo: string, idx: number) => (
                                    <SmartImage
                                      key={idx}
                                      src={photo}
                                      maxSize={200}
                                      className="w-16 h-16 rounded-lg flex-shrink-0"
                                      onClick={() => { setLightboxIndex(0); setLightboxOpen(true); }}
                                    />
                                  ))}
                                </div>
                              )}
                              {issue.reportedByName && (
                                <p className="text-[10px] text-slate-400 mt-1.5">
                                  Segnalato da {issue.reportedByName}
                                  {issue.reportedAt && ` · ${new Date(issue.reportedAt).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                                </p>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* SEGNALAZIONI PROBLEMI (non urgenti)                             */}
                {/* ═══════════════════════════════════════════════════════════════ */}
                {cleaningIssues.filter((i: any) => !i.isUrgent && i.severity !== 'critical').length > 0 && (
                  <div className="bg-white rounded-2xl border border-orange-200 overflow-hidden shadow-sm mb-3">
                    <div className="h-1 bg-gradient-to-r from-orange-400 to-amber-500"></div>
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                          <span className="text-lg">⚠️</span>
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-semibold text-slate-800">Segnalazioni</span>
                          <p className="text-xs text-slate-500">Problemi riscontrati durante la pulizia</p>
                        </div>
                        <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                          {cleaningIssues.filter((i: any) => !i.isUrgent && i.severity !== 'critical').length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {cleaningIssues
                          .filter((i: any) => !i.isUrgent && i.severity !== 'critical')
                          .map((issue: any) => {
                            const severityColors: Record<string, string> = {
                              low: 'bg-blue-100 text-blue-700',
                              medium: 'bg-amber-100 text-amber-700',
                              high: 'bg-orange-100 text-orange-700',
                            };
                            const severityLabels: Record<string, string> = {
                              low: 'Bassa',
                              medium: 'Media',
                              high: 'Alta',
                            };
                            const typeLabels: Record<string, string> = {
                              damage: '🔨 Danno',
                              missing_item: '📦 Mancante',
                              maintenance: '🔧 Manutenzione',
                              cleanliness: '🧹 Pulizia',
                              safety: '🛡️ Sicurezza',
                              other: '📋 Altro',
                            };
                            return (
                              <div key={issue.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-sm font-semibold text-slate-800">{issue.title}</p>
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${severityColors[issue.severity] || 'bg-slate-100 text-slate-600'}`}>
                                        {severityLabels[issue.severity] || issue.severity}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-0.5">{typeLabels[issue.type] || issue.type}</p>
                                  </div>
                                  <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    issue.resolved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {issue.resolved ? '✓ Risolto' : 'Aperto'}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600">{issue.description}</p>
                                {issue.photos && issue.photos.length > 0 && (
                                  <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-hide">
                                    {issue.photos.map((photo: string, idx: number) => (
                                      <SmartImage
                                        key={idx}
                                        src={photo}
                                        maxSize={200}
                                        className="w-14 h-14 rounded-lg flex-shrink-0"
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ==================== TAB SERVIZIO ==================== */}
        {activeTab === 'service' && (
          <>
            {/* Tipo Servizio */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="h-1 bg-gradient-to-r from-sky-400 to-blue-500"></div>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                    <span className="text-lg">🧹</span>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Tipo di Servizio</span>
                    {!isAdmin && <p className="text-xs text-slate-400">Solo visualizzazione</p>}
                  </div>
                </div>
                
                {loadingServiceTypes ? (
                  <div className="animate-pulse bg-slate-100 h-24 rounded-xl"></div>
                ) : isAdmin ? (
                  <div className="grid grid-cols-3 gap-2">
                    {serviceTypes.map(st => (
                      <button
                        key={st.code}
                        type="button"
                        onClick={() => {
                          setSelectedServiceType(st.code);
                          if (st.code !== "SGROSSO") {
                            setSgrossoReason("");
                            setSgrossoNotes("");
                          }
                        }}
                        className={`p-3 rounded-xl border-2 transition-all text-center ${
                          selectedServiceType === st.code
                            ? "border-sky-500 bg-sky-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span className="text-xl block mb-1">{st.icon}</span>
                        <span className="text-[10px] font-medium text-slate-700">{st.name}</span>
                        {st.adminOnly && (
                          <span className="text-[8px] text-amber-600 block">Solo Admin</span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <span className="text-2xl">{selectedType?.icon || "🧹"}</span>
                    <div>
                      <span className="font-medium text-slate-800">{cleaning.serviceTypeName || selectedType?.name || "Standard"}</span>
                      {cleaning.priceModified && (
                        <p className="text-xs text-amber-600">Prezzo personalizzato</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Motivo SGROSSO */}
            {isSgrosso && (
              <div className="bg-white rounded-2xl border border-red-200 overflow-hidden shadow-sm mb-3">
                <div className="h-1 bg-gradient-to-r from-red-400 to-rose-500"></div>
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                      <span className="text-lg">⚠️</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">Motivo Sgrosso</span>
                  </div>
                  
                  {isAdmin ? (
                    <>
                      <select
                        value={sgrossoReason}
                        onChange={(e) => setSgrossoReason(e.target.value as SgrossoReasonCode)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium mb-2"
                      >
                        <option value="">Seleziona motivo...</option>
                        {SGROSSO_REASONS.map(reason => (
                          <option key={reason.code} value={reason.code}>
                            {reason.icon} {reason.label}
                          </option>
                        ))}
                      </select>
                      {sgrossoReason === "ALTRO" && (
                        <textarea
                          value={sgrossoNotes}
                          onChange={(e) => setSgrossoNotes(e.target.value)}
                          placeholder="Specifica il motivo..."
                          rows={2}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none"
                        />
                      )}
                    </>
                  ) : (
                    <div className="p-3 bg-red-50 rounded-xl">
                      <p className="font-medium text-red-800">{cleaning.sgrossoReasonLabel || "Non specificato"}</p>
                      {cleaning.sgrossoNotes && (
                        <p className="text-sm text-red-600 mt-1">{cleaning.sgrossoNotes}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Prezzo */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className={`h-1 ${priceIsModified ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500'}`}></div>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${priceIsModified ? 'bg-amber-100' : 'bg-emerald-100'} flex items-center justify-center`}>
                    <span className="text-lg">💰</span>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Prezzo Pulizia</span>
                    <p className="text-xs text-slate-400">Contratto: €{contractPrice.toFixed(2)}</p>
                  </div>
                </div>
                
                {isAdmin ? (
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={customPrice !== null ? customPrice : contractPrice}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCustomPrice(val === contractPrice ? null : val);
                      }}
                      className={`w-full pl-8 pr-4 py-3 border rounded-xl text-lg font-bold ${
                        priceIsModified ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {priceIsModified && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-600 text-xs font-medium">
                        Modificato
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-2xl font-bold text-slate-800">€{effectiveCleaningPrice.toFixed(2)}</span>
                    {cleaning.priceModified && (
                      <span className="text-sm text-slate-500 ml-2">(era €{contractPrice.toFixed(2)})</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Motivazione Cambio Prezzo */}
            {(priceIsModified || cleaning.priceChangeReason) && (
              <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm mb-3">
                <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500"></div>
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                      <span className="text-lg">📝</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">Motivazione Cambio Prezzo</span>
                  </div>
                  
                  {isAdmin && priceIsModified ? (
                    <textarea
                      value={priceChangeReason}
                      onChange={(e) => setPriceChangeReason(e.target.value)}
                      placeholder="Es: Pulizia extra accurata richiesta, intervento su macchie difficili..."
                      rows={2}
                      className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm resize-none"
                    />
                  ) : cleaning.priceChangeReason ? (
                    <div className="p-3 bg-amber-50 rounded-xl">
                      <p className="text-sm text-amber-800">{cleaning.priceChangeReason}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </>
        )}

        {/* ==================== TAB BIANCHERIA ==================== */}
        {activeTab === 'linen' && (
          <>
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* VERSIONE READ-ONLY PER PROPRIETARIO SU PULIZIE COMPLETATE       */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {(isCompleted && !isAdmin) || isModalLocked ? (
              <>
                {/* Header: messaggio diverso per completata vs locked */}
                <div className={`rounded-2xl border p-4 mb-4 ${isCompleted ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isCompleted ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                      <span className="text-lg">{isCompleted ? '📋' : '🔒'}</span>
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${isCompleted ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {isCompleted ? 'Riepilogo Dotazioni' : 'Modifica non disponibile'}
                      </p>
                      <p className={`text-xs ${isCompleted ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {isCompleted
                          ? 'Dettaglio della pulizia completata'
                          : 'Il termine per modificare biancheria e letti è scaduto (ore 20:00 del giorno prima)'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Ospiti */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                        <div className="w-4 h-4 text-purple-600">{I.users}</div>
                      </div>
                      <span className="text-sm font-medium text-slate-700">Numero Ospiti</span>
                    </div>
                    <span className="text-lg font-bold text-slate-800">{g}</span>
                  </div>
                </div>

                {/* Letti Preparati */}
                {selectedBedsData.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <div className="w-4 h-4 text-blue-600">{I.bed}</div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-slate-700">Letti Preparati</span>
                        <p className="text-xs text-slate-500">{selectedBedsData.length} letti • {totalCap} posti</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedBedsData.map(bed => (
                        <div key={bed.id} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                          <div className="w-5 h-5 text-blue-600">{getBedIcon(bed.type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">{bed.name}</p>
                            <p className="text-[10px] text-slate-500">{bed.cap}p</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Biancheria Letto */}
                {bedP > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <span className="text-sm">🛏️</span>
                        </div>
                        <span className="text-sm font-medium text-slate-700">Biancheria Letto</span>
                      </div>
                      <span className="text-sm font-bold text-blue-600">€{bedP.toFixed(2)}</span>
                    </div>
                    <div className="space-y-1">
                      {invLinen.filter(item => getLinenQtyFromBl(c.bl, item.id) > 0).map(item => (
                        <div key={item.id} className="flex justify-between text-xs">
                          <span className="text-slate-600">{item.n}</span>
                          <span className="font-medium text-slate-700">x{getLinenQtyFromBl(c.bl, item.id)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Biancheria Bagno */}
                {bathP > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                          <span className="text-sm">🛁</span>
                        </div>
                        <span className="text-sm font-medium text-slate-700">Biancheria Bagno</span>
                      </div>
                      <span className="text-sm font-bold text-purple-600">€{bathP.toFixed(2)}</span>
                    </div>
                    <div className="space-y-1">
                      {invBath.filter(i => findValueByAliases(c.ba, i.id) > 0).map(i => (
                        <div key={i.id} className="flex justify-between text-xs">
                          <span className="text-slate-600">{i.n}</span>
                          <span className="font-medium text-slate-700">x{findValueByAliases(c.ba, i.id)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Kit Cortesia */}
                {kitP > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                          <span className="text-sm">🧴</span>
                        </div>
                        <span className="text-sm font-medium text-slate-700">Kit Cortesia</span>
                      </div>
                      <span className="text-sm font-bold text-amber-600">€{kitP.toFixed(2)}</span>
                    </div>
                    <div className="space-y-1">
                      {invKit.filter(i => findValueByAliases(c.ki, i.id) > 0).map(i => (
                        <div key={i.id} className="flex justify-between text-xs">
                          <span className="text-slate-600">{i.n}</span>
                          <span className="font-medium text-slate-700">x{findValueByAliases(c.ki, i.id)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Servizi Extra */}
                {exP > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                          <span className="text-sm">✨</span>
                        </div>
                        <span className="text-sm font-medium text-slate-700">Servizi Extra</span>
                      </div>
                      <span className="text-sm font-bold text-rose-600">€{exP.toFixed(2)}</span>
                    </div>
                    <div className="space-y-1">
                      {invExtras.filter(i => c.ex?.[i.id]).map(i => (
                        <div key={i.id} className="flex justify-between text-xs">
                          <span className="text-slate-600">{i.n}</span>
                          <span className="font-medium text-slate-700">€{i.p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Valutazione Operatore - sempre visibile */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                      <span className="text-sm">⭐</span>
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-700">Valutazione Operatore</span>
                      <p className="text-xs text-slate-500">Feedback sulla proprietà</p>
                    </div>
                  </div>
                  {cleaning?.ratingScore ? (
                    <CleaningRatingBadge 
                      // @ts-expect-error TODO-FIX: TS2339 Property 'cleaningId' does not exist on type 'Cleaning'.
                      cleaningId={cleaning.id || cleaning.cleaningId || ''} 
                      ratingScore={cleaning.ratingScore}
                      compact={false}
                      showDetails={true}
                    />
                  ) : (
                    <div className="text-center py-4 bg-slate-50 rounded-xl">
                      <span className="text-2xl block mb-1">📋</span>
                      <p className="text-sm text-slate-500">Nessuna valutazione disponibile</p>
                      <p className="text-xs text-slate-400 mt-1">L'operatore non ha inserito una valutazione per questa pulizia</p>
                    </div>
                  )}
                </div>

                {/* Totale */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-4 shadow-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-white">Totale Dotazioni</span>
                    <span className="text-2xl font-bold text-white">€{totalDotazioni.toFixed(2)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* VERSIONE EDITABILE (ADMIN, o proprietario prima delle 20:00)    */}
                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* Guest Selector */}
                <div className="mb-3">
                  <GuestSelector value={g} onChange={handleGuestChange} max={property?.maxGuests || 6} disabled={isGuestsLocked} lockedMessage={guestsLockedMessage} />
                  {warn && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      <p className="text-xs text-amber-700">⚠️ Capacità letti ({totalCap}) inferiore a {g} ospiti</p>
                    </div>
                  )}
                </div>

                {/* 🔥 Toggle Biancheria */}
                <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                        {I.bed}
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-700">Biancheria</span>
                        <p className="text-[10px] text-slate-500">
                          {linenEnabled ? "Inclusa nella pulizia" : "Solo pulizia, senza biancheria"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinenEnabled(!linenEnabled)}
                      className={`relative w-14 h-8 rounded-full p-1 transition-all duration-300 ${
                        linenEnabled 
                          ? 'bg-sky-500 shadow-lg shadow-sky-200' 
                          : 'bg-slate-300'
                      }`}
                    >
                      <div 
                        className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                          linenEnabled ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Biancheria Letto */}
                {linenEnabled && (
            <Section title="Biancheria Letto" icon={I.bed} price={bedP} expanded={sec === 'beds'} onToggle={() => setSec(sec === 'beds' ? null : 'beds')}>
              {currentBeds.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun letto configurato</p></div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">🛏️ Seleziona i letti da preparare per {g} ospiti:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {currentBeds.map(bed => {
                        const isSel = selectedBedIds.includes(bed.id);
                        return (
                          <button key={bed.id} onClick={() => toggleBed(bed.id)} className={`p-2.5 rounded-lg border-2 text-left transition-all ${isSel ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                            <div className="flex items-center gap-2">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSel ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                                {isSel && <div className="w-3 h-3 text-white">{I.check}</div>}
                              </div>
                              <div className="w-6 h-6 text-slate-500">{getBedIcon(bed.type)}</div>
                            </div>
                            <p className="text-xs font-medium mt-1">{bed.name}</p>
                            <p className="text-[10px] text-slate-500">{bed.loc} • {bed.cap}p</p>
                          </button>
                        );
                      })}
                    </div>
                    {selectedBedsData.length > 0 && (
                      <div className="mt-2 p-2 bg-blue-50 rounded-lg"><p className="text-xs text-blue-700">✓ {selectedBedsData.length} letti selezionati = {totalCap} posti</p></div>
                    )}
                  </div>
                  {invLinen.length > 0 && selectedBedsData.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">📦 Biancheria necessaria (calcolata automaticamente):</p>
                      <div className="space-y-2">
                        {invLinen.map(item => (
                          <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-blue-100">
                            <span className="text-xs text-slate-700 font-medium">{item.n} <span className="text-blue-500">€{(item.p || 0).toFixed(2)}</span></span>
                            <Cnt v={getLinenQtyFromBl(c.bl, item.id)} onChange={v => updL(item.id, v)} />
                          </div>
                        ))}
                      </div>
                      
                      {/* 🆕 MESSAGGIO VALIDAZIONE MINIMO BIANCHERIA */}
                      {!linenValidation.isValid && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                          <div className="flex items-start gap-2">
                            <span className="text-lg flex-shrink-0">⚠️</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-red-700">Biancheria insufficiente</p>
                              <p className="text-xs text-red-600 mt-1">
                                Per {g} ospiti servono almeno:
                              </p>
                              <ul className="text-xs text-red-600 mt-1 space-y-0.5">
                                {linenValidation.requiredMatrimoniali > 0 && (
                                  <li>
                                    • <strong>{linenValidation.requiredMatrimoniali}</strong> lenzuola matrimoniali 
                                    (hai: <strong>{linenValidation.currentMatrimoniali}</strong>
                                    {linenValidation.missingMatrimoniali > 0 && (
                                      <span className="text-red-700 font-bold"> → mancano {linenValidation.missingMatrimoniali}</span>
                                    )})
                                  </li>
                                )}
                                {linenValidation.requiredSingole > 0 && (
                                  <li>
                                    • <strong>{linenValidation.requiredSingole}</strong> lenzuola singole 
                                    (hai: <strong>{linenValidation.currentSingole}</strong>
                                    {linenValidation.missingSingole > 0 && (
                                      <span className="text-red-700 font-bold"> → mancano {linenValidation.missingSingole}</span>
                                    )})
                                  </li>
                                )}
                                {linenValidation.requiredFedere > 0 && (
                                  <li>
                                    • <strong>{linenValidation.requiredFedere}</strong> federe (1 per ospite)
                                    (hai: <strong>{linenValidation.currentFedere}</strong>
                                    {linenValidation.missingFedere > 0 && (
                                      <span className="text-red-700 font-bold"> → mancano {linenValidation.missingFedere}</span>
                                    )})
                                  </li>
                                )}
                              </ul>
                              <p className="text-[10px] text-red-500 mt-2 font-medium">
                                ❌ Non puoi salvare finché non inserisci il minimo richiesto
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <p className="text-[10px] text-slate-400 mt-2 italic">Quantità calcolate in base ai letti selezionati. Puoi modificarle manualmente.</p>
                    </div>
                  )}
                </div>
              )}
            </Section>
            )}

            {/* Biancheria Bagno */}
            {linenEnabled && (
            <Section title="Biancheria Bagno" icon={I.towel} price={bathP} expanded={sec === 'bath'} onToggle={() => setSec(sec === 'bath' ? null : 'bath')}>
              {invBath.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun articolo</p></div>
              ) : (
                <div className="space-y-2">
                  {invBath.map(i => (
                    <div key={i.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-purple-100">
                      <span className="text-xs text-slate-700 font-medium">{i.n} <span className="text-purple-500">€{(i.p || 0).toFixed(2)}</span></span>
                      <Cnt v={findValueByAliases(c.ba, i.id)} onChange={v => updB(i.id, v)} />
                    </div>
                  ))}
                </div>
              )}
            </Section>
            )}

            {/* Kit Cortesia - solo se biancheria abilitata */}
            {linenEnabled && (
            <Section title="Kit Cortesia" icon={I.soap} price={kitP} expanded={sec === 'kit'} onToggle={() => setSec(sec === 'kit' ? null : 'kit')}>
              {invKit.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun articolo</p></div>
              ) : (
                <div className="space-y-2">
                  {invKit.map(i => (
                    <div key={i.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-amber-100">
                      <span className="text-xs text-slate-700 font-medium">{i.n} <span className="text-amber-600">€{i.p}</span></span>
                      <Cnt v={findValueByAliases(c.ki, i.id)} onChange={v => updK(i.id, v)} />
                    </div>
                  ))}
                </div>
              )}
            </Section>
            )}

            {/* Servizi Extra */}
            <Section title="Servizi Extra" icon={I.gift} price={exP} expanded={sec === 'extra'} onToggle={() => setSec(sec === 'extra' ? null : 'extra')}>
              {invExtras.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun servizio</p></div>
              ) : (
                <div className="space-y-2">
                  {invExtras.map(i => (
                    <div key={i.id} onClick={() => togE(i.id)} className={`rounded-lg p-2.5 border-2 transition-all cursor-pointer ${c.ex?.[i.id] ? 'border-slate-400 bg-white shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${c.ex?.[i.id] ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                            {c.ex?.[i.id] && <div className="w-3 h-3 text-white">{I.check}</div>}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{i.n}</p>
                            {i.desc && <p className="text-[10px] text-slate-500">{i.desc}</p>}
                          </div>
                        </div>
                        <span className="text-sm font-bold">€{i.p}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Totale Dotazioni */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-4 shadow-lg mt-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-white">Totale Dotazioni</span>
                <span className="text-2xl font-bold text-white">€{totalDotazioni.toFixed(2)}</span>
              </div>
            </div>
              </>
            )}
          </>
        )}

        {/* ==================== TAB FOTO (SOLO PER COMPLETATE) ==================== */}
        {/* @ts-expect-error TODO-FIX */}
        {activeTab === 'photos' && isCompleted && (
          <>
            {/* Galleria Foto — v3 con lazy loading */}
            {localPhotos && localPhotos.length > 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <span className="text-lg">📷</span>
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-800">Foto della Pulizia</span>
                        <p className="text-xs text-slate-500">{localPhotos.length} foto caricate</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <span className="text-xs text-red-400 font-medium">Tieni premuto per eliminare</span>
                    )}
                  </div>

                  {/* Hero: prima foto grande */}
                  <div 
                    className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden mb-2 cursor-pointer active:scale-[0.98] transition-transform"
                    onClick={() => { setLightboxIndex(0); setLightboxOpen(true); }}
                  >
                    <SmartImage
                      src={localPhotos[0]}
                      alt="Foto principale"
                      maxSize={800}
                      quality={0.8}
                      loading="eager"
                      className="w-full h-full"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    <div className="absolute bottom-2.5 left-3 flex items-center gap-2">
                      <div className="bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        <span className="text-white text-xs font-medium">1/{localPhotos.length}</span>
                      </div>
                    </div>
                    {/* Admin delete */}
                    {isAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPhotoToDelete(0); setShowDeletePhotoConfirm(true); }}
                        className="absolute top-2.5 right-2.5 w-8 h-8 bg-red-500/90 backdrop-blur-sm text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Grid: restanti foto — 3 colonne, lazy loaded */}
                  {localPhotos.length > 1 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {localPhotos.slice(1).map((photo: string, i: number) => {
                        const index = i + 1;
                        return (
                          <div
                            key={index}
                            className="relative aspect-square rounded-xl overflow-hidden cursor-pointer active:scale-95 transition-transform"
                            onClick={() => { setLightboxIndex(index); setLightboxOpen(true); }}
                          >
                            <SmartImage
                              src={photo}
                              alt={`Foto ${index + 1}`}
                              maxSize={300}
                              quality={0.7}
                              className="w-full h-full"
                            />
                            {/* Overlay con numero */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                            <div className="absolute bottom-1 left-1 bg-black/50 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded-md font-medium">
                              {index + 1}
                            </div>
                            {/* Admin delete */}
                            {isAdmin && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setPhotoToDelete(index); setShowDeletePhotoConfirm(true); }}
                                className="absolute top-1 right-1 w-6 h-6 bg-red-500/90 backdrop-blur-sm text-white rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Hint swipe */}
                  <p className="text-[11px] text-slate-400 text-center mt-3 flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                    Tocca per aprire a schermo intero · Scorri per navigare
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">📭</span>
                </div>
                <p className="text-lg font-semibold text-slate-600 mb-1">Nessuna foto</p>
                <p className="text-sm text-slate-400">L&apos;operatore non ha caricato foto per questa pulizia</p>
              </div>
            )}
          </>
        )}

        <div className="h-4"></div>
      </div>

      {/* Footer - Diverso per pulizie completate vs non completate */}
      {!isCompleted ? (
        isModalLocked ? (
          /* 🔒 Footer sola lettura per proprietario dopo le 20:00 */
          <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-slate-200 bg-slate-50" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
            <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-xl">
              <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Modifica non disponibile</p>
                <p className="text-xs text-slate-500">Il termine per modificare è scaduto (ore 20:00 del giorno prima)</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-slate-200" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Totale per <strong>{g}</strong> ospiti</span>
              <span className="text-2xl font-bold">€{formatPrice(totalPrice)}</span>
            </div>
            {/* 🆕 Messaggio errore validazione biancheria nel footer */}
            {!linenValidation.isValid && linenEnabled && (
              <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-600 text-center font-medium">
                  ⚠️ Inserisci il minimo di biancheria richiesto per salvare
                </p>
              </div>
            )}
            <button 
              onClick={() => handleSave()} 
              disabled={saving || (!linenValidation.isValid && linenEnabled)} 
              className={`w-full py-3.5 text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-transform shadow-md disabled:opacity-50 ${
                !linenValidation.isValid && linenEnabled 
                  ? 'bg-gradient-to-r from-red-400 to-red-500' 
                  : 'bg-gradient-to-r from-slate-600 to-slate-800'
              }`}
            >
              {saving ? 'Salvataggio...' : (!linenValidation.isValid && linenEnabled ? '⚠️ Biancheria insufficiente' : 'Salva Modifiche')}
            </button>
          </div>
        ) /* fine ternario isModalLocked */
      ) : isAdmin && isEditingCompleted ? (
        /* Footer per Admin in modalità editing su pulizia completata */
        <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-amber-700">⚠️ Stai modificando una pulizia completata</span>
            <span className="text-xl font-bold text-amber-800">€{formatPrice(totalPrice)}</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                setIsEditingCompleted(false);
                setCompletedEditType(null);
              }} 
              className="flex-1 py-3 bg-white border border-amber-300 text-amber-700 text-sm font-bold rounded-xl active:scale-[0.98] transition-transform"
            >
              Annulla
            </button>
            <button 
              onClick={() => handleSave()} 
              disabled={saving || (!linenValidation.isValid && linenEnabled)} 
              className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-transform shadow-md disabled:opacity-50"
            >
              {saving ? 'Salvataggio...' : '✓ Conferma Modifiche'}
            </button>
          </div>
        </div>
      ) : isAdmin && activeTab === 'linen' ? (
        /* 🆕 Footer per Admin nel tab Dotazioni di pulizia completata - permette modifiche dirette */
        <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-700">💡 Admin: puoi modificare le dotazioni</span>
            <span className="text-xl font-bold text-blue-800">€{formatPrice(totalPrice)}</span>
          </div>
          <button 
            onClick={() => handleSave()} 
            disabled={saving || (!linenValidation.isValid && linenEnabled)} 
            className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-sky-500 text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-transform shadow-md disabled:opacity-50"
          >
            {saving ? 'Salvataggio...' : '💾 Salva Modifiche Dotazioni'}
          </button>
        </div>
      ) : (
        /* Footer normale per pulizia completata (non in editing) */
        <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <span className="text-lg">✅</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Pulizia Completata</p>
              <p className="text-xs text-emerald-600">
                {cleaning.completedAt && (
                  (cleaning.completedAt?.toDate?.() ?? new Date(cleaning.completedAt)).toLocaleDateString('it-IT', { 
                    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' 
                  })
                )}
              </p>
              {cleaning.manuallyCompletedBy === "ADMIN" && (
                <p className="text-xs text-amber-600 font-medium mt-1">
                  👤 Confermata manualmente da Admin
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL CONFERMA MODIFICA PULIZIA COMPLETATA                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showCompletedEditConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-center">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">⚠️</span>
              </div>
              <h3 className="text-lg font-bold text-white">Conferma Modifica</h3>
            </div>
            <div className="p-6">
              <p className="text-slate-600 text-center mb-4">
                Stai per modificare {completedEditType === 'date' ? <strong>la data</strong> : completedEditType === 'guests' ? <strong>il numero di ospiti</strong> : <strong>le dotazioni e letti</strong>} di una pulizia <strong>già completata</strong>.
              </p>
              <p className="text-amber-600 text-sm text-center mb-6 bg-amber-50 p-3 rounded-xl">
                ⚠️ Questa azione modificherà i dati storici. Sei sicuro di voler procedere?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCompletedEditConfirm(false);
                    setCompletedEditType(null);
                  }}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={() => {
                    setShowCompletedEditConfirm(false);
                    setIsEditingCompleted(true);
                    // Se modifica dotazioni, vai al tab linen
                    if (completedEditType === 'dotazioni') {
                      handleTabChange('linen');
                    }
                  }}
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 transition-colors"
                >
                  Sì, Modifica
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL CONFERMA ELIMINAZIONE FOTO                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showDeletePhotoConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-rose-500 px-6 py-5 text-center">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">🗑️</span>
              </div>
              <h3 className="text-lg font-bold text-white">Elimina Foto</h3>
            </div>
            <div className="p-6">
              {photoToDelete !== null && localPhotos[photoToDelete] && (
                <div className="mb-4">
                  <SmartImage 
                    src={localPhotos[photoToDelete]} 
                    alt="Foto da eliminare" 
                    maxSize={300}
                    className="w-32 h-32 rounded-xl mx-auto shadow-md"
                  />
                </div>
              )}
              <p className="text-slate-600 text-center mb-4">
                Sei sicuro di voler eliminare la <strong>Foto #{(photoToDelete || 0) + 1}</strong>?
              </p>
              <p className="text-red-600 text-sm text-center mb-6 bg-red-50 p-3 rounded-xl">
                ⚠️ Questa azione è irreversibile. La foto verrà eliminata definitivamente.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeletePhotoConfirm(false);
                    setPhotoToDelete(null);
                  }}
                  disabled={deletingPhoto}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  onClick={handleDeletePhoto}
                  disabled={deletingPhoto}
                  className="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-xl font-semibold hover:from-red-600 hover:to-rose-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deletingPhoto ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Eliminazione...
                    </>
                  ) : (
                    '🗑️ Elimina'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL MODIFICA TIPO SERVIZIO E PREZZO (ADMIN)                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showPriceServiceModal && isAdmin && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-2xl">💰</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Modifica Servizio</h3>
                  <p className="text-white/80 text-sm">Tipo servizio e prezzo</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Tipo Servizio */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo Servizio</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { code: 'STANDARD', label: 'Standard', icon: '🧹', color: 'emerald' },
                    { code: 'APPROFONDITA', label: 'Approfondita', icon: '✨', color: 'amber' },
                    { code: 'SGROSSO', label: 'Sgrosso', icon: '🔧', color: 'purple' },
                  ].map(st => {
                    const isSelected = editingServiceType === st.code;
                    const selectedClasses = st.code === 'STANDARD' ? 'border-emerald-500 bg-emerald-50' :
                                           st.code === 'APPROFONDITA' ? 'border-amber-500 bg-amber-50' :
                                           'border-purple-500 bg-purple-50';
                    const textClasses = st.code === 'STANDARD' ? 'text-emerald-700' :
                                       st.code === 'APPROFONDITA' ? 'text-amber-700' :
                                       'text-purple-700';
                    return (
                    <button
                      key={st.code}
                      onClick={() => {
                        setEditingServiceType(st.code);
                        if (st.code === 'SGROSSO') {
                          setEditingPrice(null); // Prezzo vuoto per sgrosso
                        } else {
                          // Recupera prezzo dal tipo servizio
                          const typeData = serviceTypes.find(t => t.code === st.code);
                          // @ts-expect-error TODO-FIX: TS2339 Property 'basePrice' does not exist on type 'ServiceType'.
                          setEditingPrice(typeData?.basePrice || contractPrice);
                        }
                      }}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        isSelected ? selectedClasses : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-2xl block mb-1">{st.icon}</span>
                      <span className={`text-xs font-semibold ${isSelected ? textClasses : 'text-slate-600'}`}>
                        {st.label}
                      </span>
                    </button>
                  );})}
                </div>
              </div>

              {/* Motivo Sgrosso (solo se SGROSSO) */}
              {editingServiceType === 'SGROSSO' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Motivo Sgrosso *</label>
                  <select
                    value={editingSgrossoReason}
                    onChange={(e) => setEditingSgrossoReason(e.target.value as SgrossoReasonCode)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">Seleziona motivo...</option>
                    {SGROSSO_REASONS.map(r => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                  {editingSgrossoReason === 'ALTRO' && (
                    <textarea
                      value={editingSgrossoNotes}
                      onChange={(e) => setEditingSgrossoNotes(e.target.value)}
                      placeholder="Specifica il motivo..."
                      className="w-full mt-2 px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      rows={2}
                    />
                  )}
                </div>
              )}

              {/* Prezzo */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Prezzo Pulizia {editingServiceType === 'SGROSSO' && <span className="text-rose-500">*</span>}
                </label>
                {editingServiceType === 'SGROSSO' ? (
                  <div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingPrice ?? ''}
                        onChange={(e) => setEditingPrice(e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="Inserisci prezzo manualmente"
                        className="w-full pl-8 pr-4 py-3 border border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-purple-50"
                      />
                    </div>
                    <p className="text-xs text-purple-600 mt-1">⚠️ Per lo sgrosso il prezzo deve essere inserito manualmente</p>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingPrice ?? contractPrice}
                        onChange={(e) => setEditingPrice(parseFloat(e.target.value))}
                        className="w-full pl-8 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Prezzo contratto: €{contractPrice.toFixed(2)}</p>
                  </div>
                )}
              </div>

              {/* Bottoni */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowPriceServiceModal(false);
                    // Reset agli stati originali
                    setEditingServiceType(cleaning?.serviceType || "STANDARD");
                    setEditingPrice(cleaning?.price || null);
                    setEditingSgrossoReason(cleaning?.sgrossoReason || "");
                    setEditingSgrossoNotes(cleaning?.sgrossoNotes || "");
                  }}
                  disabled={savingPriceService}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  onClick={async () => {
                    // Validazione
                    if (editingServiceType === 'SGROSSO') {
                      if (!editingSgrossoReason) {
                        alert('Seleziona un motivo per lo sgrosso');
                        return;
                      }
                      if (editingSgrossoReason === 'ALTRO' && !editingSgrossoNotes.trim()) {
                        alert('Specifica il motivo dello sgrosso');
                        return;
                      }
                      if (editingPrice === null || editingPrice <= 0) {
                        alert('Inserisci un prezzo valido per lo sgrosso');
                        return;
                      }
                    }

                    try {
                      setSavingPriceService(true);
                      // @ts-expect-error TODO-FIX: TS2339 Property 'cleaningId' does not exist on type 'Cleaning'.
                      const cleaningId = cleaning?.id || cleaning?.cleaningId;
                      if (!cleaningId) throw new Error('ID pulizia mancante');

                      const { doc, updateDoc } = await import('firebase/firestore');
                      const cleaningRef = doc(db, 'cleanings', cleaningId);
                      
                      const updateData: any = {
                        serviceType: editingServiceType,
                        serviceTypeName: editingServiceType === 'SGROSSO' ? 'Sgrosso' : 
                                         editingServiceType === 'APPROFONDITA' ? 'Pulizia Approfondita' : 'Pulizia Standard',
                        price: editingPrice || contractPrice,
                        priceModified: editingPrice !== contractPrice,
                        updatedAt: new Date(),
                      };

                      if (editingServiceType === 'SGROSSO') {
                        updateData.sgrossoReason = editingSgrossoReason;
                        updateData.sgrossoNotes = editingSgrossoNotes;
                      } else {
                        updateData.sgrossoReason = "";
                        updateData.sgrossoNotes = "";
                      }

                      await updateDoc(cleaningRef, updateData);

                      // Aggiorna stati locali
                      setSelectedServiceType(editingServiceType);
                      setCustomPrice(editingPrice);
                      setSgrossoReason(editingSgrossoReason);
                      setSgrossoNotes(editingSgrossoNotes);

                      setShowPriceServiceModal(false);
                      alert('✅ Servizio e prezzo aggiornati!');
                    } catch (error) {
                      console.error('Errore salvataggio:', error);
                      alert('❌ Errore nel salvataggio');
                    } finally {
                      setSavingPriceService(false);
                    }
                  }}
                  disabled={savingPriceService || (editingServiceType === 'SGROSSO' && (editingPrice === null || editingPrice <= 0))}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-indigo-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingPriceService ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Salvataggio...
                    </>
                  ) : (
                    '💾 Salva Modifiche'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL AGGIUNGI SERVIZIO EXTRA (ADMIN)                           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showAddExtraModal && isAdmin && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-2xl">➕</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Aggiungi Servizio Extra</h3>
                  <p className="text-white/80 text-sm">Servizio richiesto durante la pulizia</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nome Servizio *</label>
                <input
                  type="text"
                  value={newExtraName}
                  onChange={(e) => setNewExtraName(e.target.value)}
                  placeholder="Es: Lavaggio tende, Stiratura..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Prezzo *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newExtraPrice || ''}
                    onChange={(e) => setNewExtraPrice(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAddExtraModal(false);
                    setNewExtraName("");
                    setNewExtraPrice(0);
                  }}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={async () => {
                    if (!newExtraName.trim()) {
                      alert('Inserisci il nome del servizio');
                      return;
                    }
                    if (newExtraPrice <= 0) {
                      alert('Inserisci un prezzo valido');
                      return;
                    }

                    const newExtra = { name: newExtraName.trim(), price: newExtraPrice };
                    const updatedExtras = [...extraServices, newExtra];
                    setExtraServices(updatedExtras);

                    // Salva su Firestore
                    try {
                      // @ts-expect-error TODO-FIX: TS2339 Property 'cleaningId' does not exist on type 'Cleaning'.
                      const cleaningId = cleaning?.id || cleaning?.cleaningId;
                      if (cleaningId) {
                        const { doc, updateDoc } = await import('firebase/firestore');
                        const cleaningRef = doc(db, 'cleanings', cleaningId);
                        await updateDoc(cleaningRef, { 
                          extraServices: updatedExtras,
                          updatedAt: new Date()
                        });
                      }
                    } catch (error) {
                      console.error('Errore salvataggio extra:', error);
                    }

                    setShowAddExtraModal(false);
                    setNewExtraName("");
                    setNewExtraPrice(0);
                  }}
                  disabled={!newExtraName.trim() || newExtraPrice <= 0}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-600 transition-colors disabled:opacity-50"
                >
                  ➕ Aggiungi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL CONFERMA COMPLETAMENTO MANUALE                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showManualCompleteConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 text-center">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">✅</span>
              </div>
              <h3 className="text-lg font-bold text-white">Conferma Completamento</h3>
            </div>
            
            {/* Content */}
            <div className="p-6">
              <p className="text-slate-600 text-center mb-4">
                Stai per completare manualmente la pulizia di:
              </p>
              
              {/* Info pulizia */}
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-lg">📍</span>
                  <span className="font-semibold text-slate-800">{property?.name}</span>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-lg">📅</span>
                  <span className="text-slate-600">
                    {new Date(date).toLocaleDateString('it-IT', { 
                      weekday: 'long', 
                      day: 'numeric', 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg">📸</span>
                  <span className="text-slate-600">
                    {manualCompletePhotos.length > 0 
                      ? `${manualCompletePhotos.length} foto caricate` 
                      : 'Nessuna foto caricata'}
                  </span>
                </div>
              </div>
              
              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6">
                <p className="text-amber-700 text-sm text-center">
                  ⚠️ Questa azione non può essere annullata
                </p>
              </div>
              
              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowManualCompleteConfirm(false)}
                  disabled={completingManually}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  onClick={async () => {
                    await handleManualComplete();
                    setShowManualCompleteConfirm(false);
                  }}
                  disabled={completingManually}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {completingManually ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Completo...</span>
                    </>
                  ) : (
                    <>
                      <span>✅</span>
                      <span>Conferma</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📸 Photo Lightbox */}
      <PhotoLightbox
        photos={localPhotos}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        propertyName={property?.name}
      />
    </div>
  );
}
