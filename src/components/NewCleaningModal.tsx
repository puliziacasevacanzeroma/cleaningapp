"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { SGROSSO_REASONS} from "~/types/serviceType";
// @ts-expect-error TODO-FIX: TS2305 Module '"~/types/cleaning"' has no exported member 'SgrossoReasonCode'.
import type { SgrossoReasonCode } from "~/types/cleaning";

interface Property {
  id: string;
  name: string;
  address: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  usesOwnLinen?: boolean;
  cleaningPrice?: number;
  ownerId?: string;
  imageUrl?: string;
  checkOutTime?: string;
  bedsConfig?: { id: string; type: string; name: string; location: string; capacity: number }[];
}

interface SelectedItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  category?: string;
}

interface InventoryItem {
  id: string;
  key: string;
  name: string;
  icon: string;
  category: string;
  sellPrice: number;
}

interface InventoryCategory {
  id: string;
  name: string;
  icon: string;
  items: InventoryItem[];
}

interface GuestConfig {
  beds: string[];
  bl: Record<string, Record<string, number>>;
  ba: Record<string, number>;
  ki: Record<string, number>;
  ex: Record<string, boolean>;
}

// 🆕 Interface per letto
interface Bed {
  id: string;
  type: string;
  name: string;
  cap: number;
  loc?: string;  // 🆕 Stanza/Location
}

// 🆕 Interface per risultato validazione
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

// 🆕 Calcola il MINIMO di lenzuola richiesto in base ai letti
const calculateMinimumLinenForBeds = (beds: Bed[]): { matrimoniali: number; singole: number } => {
  let matrimoniali = 0;
  let singole = 0;

  if (!beds || beds.length === 0) return { matrimoniali, singole };

  beds.forEach(bed => {
    const tipo = (bed.type || '').toLowerCase();
    
    if (tipo === 'matr' || tipo === 'matrimoniale' || tipo === 'divano') {
      matrimoniali += 2;
    } else if (tipo === 'castello') {
      singole += 4;
    } else if (tipo === 'sing' || tipo === 'singolo' || tipo === 'piazza_mezza') {
      singole += 2;
    }
  });

  return { matrimoniali, singole };
};

// 🆕 Conta lenzuola e federe in selectedItems
const countLinenFromSelectedItems = (items: SelectedItem[]): { matrimoniali: number; singole: number; federe: number } => {
  let matrimoniali = 0;
  let singole = 0;
  let federe = 0;

  items.forEach(item => {
    const nameLower = (item.name || '').toLowerCase();
    const idLower = (item.id || '').toLowerCase();

    // Identifica FEDERE
    if (nameLower.includes('feder') || idLower.includes('pillow')) {
      federe += item.quantity;
    }
    // Identifica lenzuola matrimoniali
    else if (
      nameLower.includes('matrimonial') || 
      idLower.includes('double') || 
      idLower.includes('matr')
    ) {
      if (nameLower.includes('lenzuol') || idLower.includes('sheet') || idLower.includes('lenz') || 
          nameLower.includes('letto') || idLower.includes('bed') || 
          !nameLower.includes('copri') && !nameLower.includes('cover')) {
        matrimoniali += item.quantity;
      }
    }
    // Identifica lenzuola singole
    else if (
      (nameLower.includes('singol') || idLower.includes('single') || idLower.includes('sing'))
    ) {
      if (nameLower.includes('lenzuol') || idLower.includes('sheet') || idLower.includes('lenz') || 
          nameLower.includes('letto') || idLower.includes('bed')) {
        singole += item.quantity;
      }
    }
  });

  return { matrimoniali, singole, federe };
};

// 🆕 Valida se biancheria soddisfa il minimo (lenzuola: 2 per letto, federe: 1 per ospite)
const validateLinenForBeds = (beds: Bed[], items: SelectedItem[], guestsCount: number = 0): LinenValidationResult => {
  const required = calculateMinimumLinenForBeds(beds);
  const current = countLinenFromSelectedItems(items);
  
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

interface ServiceType {
  id: string;
  name: string;
  code: string;
  icon: string;
  color: string;
  adminOnly: boolean;
  clientCanRequest: boolean;
  requiresApproval: boolean;
  requiresReason: boolean;
  requiresManualPrice: boolean;
  baseSurcharge?: number;
}

interface NewCleaningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedPropertyId?: string;
  userRole?: "ADMIN" | "PROPRIETARIO";
  ownerId?: string;
  defaultRequestType?: "cleaning" | "linen_only";
}

const formatPrice = (price: number): string => price.toFixed(2);

// ═══════════════════════════════════════════════════════════════
// 🛏️ FUNZIONI CALCOLO BIANCHERIA DAI LETTI
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// 🎨 SVG ICONS (stile identico a EditCleaningModal)
// ═══════════════════════════════════════════════════════════════
const I: { [key: string]: React.ReactNode } = {
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  bedDouble: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/><path d="M12 10V7"/></svg>,
  bedSingle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M5 18V13C5 12 6 11 7 11H17C18 11 19 12 19 13V18M5 20V18M19 20V18M8 11V9C8 8 9 7 10 7H14C15 7 16 8 16 9V11"/><rect x="8" y="11" width="8" height="3" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  sofa: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 12V10C4 9 5 8 6 8H18C19 8 20 9 20 10V12"/><rect x="4" y="12" width="16" height="5" rx="1" fill="currentColor" opacity="0.15"/><path d="M6 17V19M18 17V19"/></svg>,
  bunk: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 22V2M20 22V2M4 14H20M4 8H20"/><rect x="6" y="9" width="12" height="4" rx="1" fill="currentColor" opacity="0.1"/><rect x="6" y="15" width="12" height="4" rx="1" fill="currentColor" opacity="0.1"/></svg>,
  towel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="3" width="12" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M6 7H18M6 11H18"/></svg>,
  soap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="8" width="12" height="12" rx="2" fill="currentColor" opacity="0.1"/><path d="M10 8V6C10 5 11 4 12 4C13 4 14 5 14 6V8M9 12H15M9 15H13"/></svg>,
  gift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="8" width="18" height="13" rx="2" fill="currentColor" opacity="0.1"/><path d="M12 8V21M3 12H21M12 8C12 8 12 5 9.5 5C8 5 7 6 7 7C7 8 8 8 12 8M12 8C12 8 12 5 14.5 5C16 5 17 6 17 7C17 8 16 8 12 8"/></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 12L12 3L21 12" /><path d="M5 10V20C5 20.6 5.4 21 6 21H9V15H15V21H18C18.6 21 19 20.6 19 20V10" fill="currentColor" opacity="0.1"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M3 10H21M8 2V6M16 2V6"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 6V12L16 14"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="9" cy="7" r="3" fill="currentColor" opacity="0.1"/><path d="M9 13C5 13 3 16 3 19H15C15 16 13 13 9 13Z" fill="currentColor" opacity="0.1"/><circle cx="17" cy="7" r="2.5"/><path d="M17 11.5C19 11.5 21 13.5 21 16H15"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full h-full"><path d="M5 13L9 17L19 7"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M12 5V19M5 12H19"/></svg>,
  minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M5 12H19"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M18 6L6 18M6 6L18 18"/></svg>,
  down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M6 9L12 15L18 9"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M11 4H4C2.9 4 2 4.9 2 6V20C2 21.1 2.9 22 4 22H18C19.1 22 20 21.1 20 20V13"/><path d="M18.5 2.5C19.3 1.7 20.7 1.7 21.5 2.5C22.3 3.3 22.3 4.7 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="11" cy="11" r="7"/><path d="M21 21L16.5 16.5"/></svg>,
  wrench: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="currentColor" opacity="0.1"/></svg>,
  star: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" opacity="0.1"/></svg>,
};

// PersonIcon per GuestSelector
const PersonIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <circle cx="12" cy="8" r="3.5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5.5 21C5.5 16.5 8 13 12 13S18.5 16.5 18.5 21" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// Counter component (identico a EditCleaningModal)
const Cnt = ({ v, onChange }: { v: number; onChange: (v: number) => void }) => (
  <div className="flex items-center gap-1">
    <button type="button" onClick={() => onChange(Math.max(0, v - 1))} className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center active:scale-95"><div className="w-3.5 h-3.5 text-slate-500">{I.minus}</div></button>
    <span className="w-6 text-center text-sm font-semibold">{v}</span>
    <button type="button" onClick={() => onChange(v + 1)} className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center active:scale-95"><div className="w-3.5 h-3.5 text-white">{I.plus}</div></button>
  </div>
);

// Section accordion (identico a EditCleaningModal)
const Section = ({ title, icon, price, expanded, onToggle, children }: { title: string; icon: React.ReactNode; price: number; expanded: boolean; onToggle: () => void; children: React.ReactNode }) => (
  <div className={`rounded-xl border ${expanded ? 'border-slate-300 shadow-sm' : 'border-slate-200'} overflow-hidden mb-2 transition-all bg-white`}>
    <button type="button" onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between active:bg-slate-50">
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

// GuestSelector (identico a EditCleaningModal)
const GuestSelectorNew = ({ value, onChange, max = 6 }: { value: number; onChange: (n: number) => void; max?: number }) => (
  <div className="bg-slate-100 rounded-xl p-3">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-medium text-slate-500">Seleziona numero ospiti</span>
      <span className="text-base font-bold text-slate-800">{value} {value === 1 ? 'ospite' : 'ospiti'}</span>
    </div>
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button key={n} type="button" onClick={() => onChange(n)} className={`flex-1 flex flex-col items-center py-1.5 rounded-lg transition-all active:scale-95 ${n === value ? 'bg-slate-800 shadow-lg' : 'bg-white border border-slate-200'}`}>
          <div className={`w-4 h-4 mb-0.5 ${n === value ? 'text-white' : n <= value ? 'text-slate-600' : 'text-slate-300'}`}><PersonIcon filled={n <= value} /></div>
          <span className={`text-[10px] font-bold ${n === value ? 'text-white' : 'text-slate-600'}`}>{n}</span>
        </button>
      ))}
    </div>
  </div>
);

// SVG getBedIcon (sostituisce emoji)
// Icone per tipo letto
const getBedIcon = (type: string): React.ReactNode => {
  switch (type) {
    case 'matr':
    case 'matrimoniale':
      return I.bedDouble;
    case 'sing':
    case 'singolo':
    case 'piazza_mezza':
      return I.bedSingle;
    case 'divano':
    case 'divano_letto':
      return I.sofa;
    case 'castello':
      return I.bunk;
    default:
      return I.bed;
  }
};

// Calcola biancheria necessaria per tipo letto
const getLinenForBedType = (type: string): { m: number; s: number; f: number } => {
  const t = (type || '').toLowerCase();
  if (t === 'matr' || t === 'matrimoniale') return { m: 3, s: 0, f: 2 }; // 3 lenzuola matr, 2 federe
  if (t === 'divano' || t === 'divano_letto') return { m: 3, s: 0, f: 2 }; // come matrimoniale
  if (t === 'castello') return { m: 0, s: 6, f: 2 }; // 6 lenzuola singole (3 per letto), 2 federe
  // Default singolo/piazza_mezza
  return { m: 0, s: 3, f: 1 }; // 3 lenzuola singole, 1 federa
};

// Calcola totale biancheria per array di letti
const calcLinenForBeds = (beds: Bed[]): { m: number; s: number; f: number } => {
  const total = { m: 0, s: 0, f: 0 };
  beds.forEach(bed => {
    const req = getLinenForBedType(bed.type);
    total.m += req.m;
    total.s += req.s;
    total.f += req.f;
  });
  return total;
};

// Mappa biancheria calcolata agli item dell'inventario
const mapLinenToItems = (
  req: { m: number; s: number; f: number },
  inventoryItems: InventoryItem[]
): SelectedItem[] => {
  const result: SelectedItem[] = [];
  
  // Helper per trovare item
  const findItem = (keywords: string[]) => {
    return inventoryItems.find(item => {
      const nameLower = (item.name || '').toLowerCase();
      const idLower = (item.id || item.key || '').toLowerCase();
      return keywords.some(kw => nameLower.includes(kw) || idLower.includes(kw));
    });
  };
  
  // Lenzuola matrimoniali
  if (req.m > 0) {
    const item = findItem(['matrimonial', 'double', 'matr']);
    if (item) {
      result.push({
        id: item.id || item.key,
        name: item.name,
        quantity: req.m,
        price: item.sellPrice || 0,
        category: item.category
      });
    }
  }
  
  // Lenzuola singole
  if (req.s > 0) {
    const item = findItem(['singol', 'single', 'sing']);
    if (item && !item.name.toLowerCase().includes('feder')) {
      result.push({
        id: item.id || item.key,
        name: item.name,
        quantity: req.s,
        price: item.sellPrice || 0,
        category: item.category
      });
    }
  }
  
  // Federe
  if (req.f > 0) {
    const item = findItem(['feder', 'pillow']);
    if (item) {
      result.push({
        id: item.id || item.key,
        name: item.name,
        quantity: req.f,
        price: item.sellPrice || 0,
        category: item.category
      });
    }
  }
  
  return result;
};

// Genera letti automatici se la proprietà non li ha configurati
const generateAutoBeds = (maxGuests: number, bedrooms: number): Bed[] => {
  const beds: Bed[] = [];
  const numBeds = Math.ceil(maxGuests / 2);
  
  for (let i = 0; i < numBeds && i < bedrooms; i++) {
    beds.push({
      id: `auto_b${i + 1}`,
      type: 'matr',
      name: `Matrimoniale ${i + 1}`,
      loc: `Camera ${i + 1}`,
      cap: 2
    });
  }
  
  // Se serve capacità extra
  const currentCap = beds.length * 2;
  if (currentCap < maxGuests) {
    beds.push({
      id: `auto_div`,
      type: 'divano',
      name: 'Divano Letto',
      loc: 'Soggiorno',
      cap: maxGuests - currentCap
    });
  }
  
  return beds;
};

// ═══════════════════════════════════════════════════════════════
// TIPI SERVIZIO HARDCODED (fallback se Firestore vuoto)
// ═══════════════════════════════════════════════════════════════
const DEFAULT_SERVICE_TYPES: ServiceType[] = [
  {
    id: "standard",
    name: "Standard",
    code: "STANDARD",
    icon: "🧹",
    color: "#10B981",
    adminOnly: false,
    clientCanRequest: true,
    requiresApproval: false,
    requiresReason: false,
    requiresManualPrice: false,
    baseSurcharge: 0,
  },
  {
    id: "approfondita",
    name: "Approfondita",
    code: "APPROFONDITA",
    icon: "✨",
    color: "#F59E0B",
    adminOnly: true,        // 🔒 Solo Admin
    clientCanRequest: false, // Proprietario NON può richiederla
    requiresApproval: false,
    requiresReason: false,
    requiresManualPrice: false,
    baseSurcharge: 0,
  },
  {
    id: "sgrosso",
    name: "Sgrosso",
    code: "SGROSSO",
    icon: "🔧",
    color: "#8B5CF6",
    adminOnly: false,        // Entrambi possono crearla
    clientCanRequest: true,  // Proprietario può RICHIEDERE
    requiresApproval: true,  // ⚠️ Richiede approvazione (se proprietario)
    requiresReason: true,    // Richiede motivo
    requiresManualPrice: true,
    baseSurcharge: 0,
  },
];

export default function NewCleaningModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedPropertyId,
  userRole = "ADMIN",
  ownerId,
  defaultRequestType = "cleaning",
}: NewCleaningModalProps) {
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [sec, setSec] = useState<string | null>('beds'); // Accordion section
  
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [propertySearch, setPropertySearch] = useState("");
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 🔄 Helper: data corrente nel fuso orario di Roma
  const getRomeDate = () => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }); // formato YYYY-MM-DD
  };

  const [formData, setFormData] = useState({
    propertyId: preselectedPropertyId || "",
    scheduledDate: getRomeDate(),
    scheduledTime: "10:00",
    guestsCount: 2,
    notes: "",
    type: "MANUAL" as const,
    requestType: defaultRequestType as "cleaning" | "linen_only",
    createLinenOrder: true,
    urgency: "normal" as "normal" | "urgent",
    includePickup: true,
    applyDeliveryFee: true, // 💰 Costo consegna €10 (admin può disattivare)
    bedMaking: false, // 🛏️ Preparazione letti (€5/letto)
  });

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [isModified, setIsModified] = useState(false);
  
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategory[]>([]);
  const [allInventoryItems, setAllInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  
  const [propertyConfigs, setPropertyConfigs] = useState<Record<number, GuestConfig>>({});
  const [propertyBeds, setPropertyBeds] = useState<Bed[]>([]); // 🆕 Letti della proprietà
  const [selectedBedIds, setSelectedBedIds] = useState<string[]>([]); // 🆕 Letti selezionati
  const [cleaningPrice, setCleaningPrice] = useState<number>(0);
  const [loadingConfig, setLoadingConfig] = useState(false);
  
  // ═══════════════════════════════════════════════════════════════
  // SERVICE TYPE STATE - LOGICA CORRETTA
  // ═══════════════════════════════════════════════════════════════
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>(DEFAULT_SERVICE_TYPES);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(false); // FALSE per mostrare subito i default
  const [selectedServiceType, setSelectedServiceType] = useState<string>("STANDARD");
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [sgrossoReason, setSgrossoReason] = useState<SgrossoReasonCode | "">("");
  const [sgrossoNotes, setSgrossoNotes] = useState<string>("");

  // Stato per modal successo
  const [successModal, setSuccessModal] = useState<{
    show: boolean;
    message: string;
    isPending?: boolean;
  } | null>(null);

  // Stato per errore duplicato
  const [duplicateError, setDuplicateError] = useState<{
    show: boolean;
    message: string;
    existingId: string;
    existingType: "cleaning" | "order";
    existingStatus: string;
    propertyName: string;
    date: string;
  } | null>(null);

  const isAdmin = userRole === "ADMIN";
  const isProprietario = userRole === "PROPRIETARIO";

  // Listener proprietà
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "properties"), orderBy("name", "asc")),
      (snapshot) => {
        const props = snapshot.docs
          .filter(doc => {
            const data = doc.data() as Record<string, any>;
            if (data.status !== "ACTIVE") return false;
            if (userRole === "PROPRIETARIO" && ownerId) return data.ownerId === ownerId;
            return true;
          })
          .map(doc => {
            const data = doc.data() as Record<string, any>;
            return {
              id: doc.id,
              name: data.name || "",
              address: data.address || "",
              bedrooms: data.bedrooms,
              bathrooms: data.bathrooms,
              maxGuests: data.maxGuests || 6,
              usesOwnLinen: data.usesOwnLinen || false,
              cleaningPrice: data.cleaningPrice || 0,
              ownerId: data.ownerId,
              imageUrl: data.imageUrl || "",
              checkOutTime: data.checkOutTime || "10:00",
              bedsConfig: data.bedsConfig || [],
            };
          });
        setProperties(props);
        setLoadingProperties(false);
      },
      () => setLoadingProperties(false)
    );
    return () => unsubscribe();
  }, [userRole, ownerId]);

  useEffect(() => {
    if (isOpen) {
      // 🔄 Reset COMPLETO del form
      setFormData(prev => ({ 
        ...prev, 
        requestType: defaultRequestType,
        scheduledDate: getRomeDate(),
        propertyId: preselectedPropertyId || "",
        guestsCount: 2,
        notes: "",
        scheduledTime: "10:00",
        urgency: "normal" as "normal" | "urgent",
        applyDeliveryFee: true,
        createLinenOrder: true, // Reset a true, verrà sovrascritto se proprietà ha usesOwnLinen
        includePickup: true,
        bedMaking: false,
      }));
      setSelectedItems([]);
      setActiveCategory("all");
      setIsModified(false);
      setPropertyConfigs({});
      setPropertyBeds([]);
      setSelectedBedIds([]);
      setCurrentStep(1);
      setShowPropertyDropdown(false);
      
      if (preselectedPropertyId) {
        const prop = properties.find(p => p.id === preselectedPropertyId);
        if (prop) {
          setSelectedProperty(prop);
          setFormData(prev => ({ 
            ...prev, 
            propertyId: prop.id, 
            scheduledTime: prop.checkOutTime || "10:00",
            createLinenOrder: !prop.usesOwnLinen,
          }));
          setPropertySearch(prop.name);
          loadPropertyConfig(prop.id);
        }
      } else {
        setSelectedProperty(null);
        setPropertySearch("");
      }
    }
  }, [isOpen, defaultRequestType, preselectedPropertyId, properties]);

  // Carica Service Types da Firestore (con fallback ROBUSTO)
  useEffect(() => {
    async function loadServiceTypes() {
      try {
        const res = await fetch("/api/service-types?activeOnly=true");
        const data = await res.json();
        
        if (data.serviceTypes && Array.isArray(data.serviceTypes) && data.serviceTypes.length > 0) {
          // Verifica che abbiano i campi necessari
          const validTypes = data.serviceTypes.filter((st: any) => st.code && st.name);
          if (validTypes.length > 0) {
            setServiceTypes(validTypes);
          } else {
            setServiceTypes(DEFAULT_SERVICE_TYPES);
          }
        } else {
          // Array vuoto o risposta non valida - usa default
          setServiceTypes(DEFAULT_SERVICE_TYPES);
        }
      } catch (error) {
        console.error("❌ Errore caricamento tipi servizio:", error);
        setServiceTypes(DEFAULT_SERVICE_TYPES);
      } finally {
        setLoadingServiceTypes(false);
      }
    }
    if (isOpen) {
      // Imposta subito i default per evitare flash vuoto
      setServiceTypes(DEFAULT_SERVICE_TYPES);
      loadServiceTypes();
      setSelectedServiceType("STANDARD");
      setCustomPrice(null);
      setSgrossoReason("");
      setSgrossoNotes("");
    }
  }, [isOpen]);

  useEffect(() => {
    async function loadInventory() {
      setLoadingInventory(true);
      try {
        const res = await fetch('/api/inventory/list');
        const data = await res.json();
        const categories: InventoryCategory[] = [];
        const allItems: InventoryItem[] = [];
        const seenIds = new Set<string>();
        
        data.categories?.forEach((cat: any) => {
          const catItems: InventoryItem[] = [];
          cat.items?.forEach((item: any) => {
            const itemId = item.key || item.id;
            if (seenIds.has(itemId)) return;
            seenIds.add(itemId);
            const icon = cat.id === 'biancheria_letto' ? '🛏️' : cat.id === 'biancheria_bagno' ? '🛁' : cat.id === 'kit_cortesia' ? '🧴' : '📦';
            const invItem = { id: itemId, key: itemId, name: item.name, icon, category: cat.id, sellPrice: item.sellPrice || 0 };
            catItems.push(invItem);
            allItems.push(invItem);
          });
          if (catItems.length > 0) {
            const icon = cat.id === 'biancheria_letto' ? '🛏️' : cat.id === 'biancheria_bagno' ? '🛁' : cat.id === 'kit_cortesia' ? '🧴' : '📦';
            categories.push({ id: cat.id, name: cat.name, icon, items: catItems });
          }
        });
        setInventoryCategories(categories);
        setAllInventoryItems(allItems);
      } catch (err) {
        console.error('Errore caricamento inventario:', err);
      } finally {
        setLoadingInventory(false);
      }
    }
    if (isOpen) loadInventory();
  }, [isOpen]);

  const loadPropertyConfig = async (propertyId: string) => {
    setLoadingConfig(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}`);
      if (res.ok) {
        const data = await res.json();
        setCleaningPrice(data.cleaningPrice || 65);
        
        if (data.serviceConfigs && typeof data.serviceConfigs === 'object' && Object.keys(data.serviceConfigs).length > 0) {
          setPropertyConfigs(data.serviceConfigs);
        } else {
          setPropertyConfigs({});
        }
        
        // 🆕 Carica letti della proprietà per validazione
        const bedsData = data.bedsConfig || data.beds || [];
        if (Array.isArray(bedsData) && bedsData.length > 0) {
          setPropertyBeds(bedsData.map((b: any) => ({
            id: b.id || b.name || '',
            type: b.type || b.tipo || 'matr',
            name: b.name || b.nome || 'Letto',
            loc: b.loc || b.stanza || 'Camera',
            cap: b.cap || b.capacity || b.capacita || (b.type === 'matr' || b.tipo === 'matr' ? 2 : 1)
          })));
        } else {
          // 🆕 Genera letti automatici se non configurati
          const autoBeds = generateAutoBeds(data.maxGuests || 6, data.bedrooms || 2);
          setPropertyBeds(autoBeds);
        }
      }
    } catch (err) {
      console.error('Errore caricamento config:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  const applyStandardConfig = async (guestsCount: number) => {
    if (guestsCount <= 0) {
      setSelectedItems([]);
      setSelectedBedIds([]);
      return;
    }
    
    // @ts-expect-error TODO-FIX: TS7015 Element implicitly has an 'any' type because index expression is not of type 'nu...
    const config = propertyConfigs[guestsCount] || propertyConfigs[String(guestsCount)];
    
    if (config) {
      // 🆕 Inizializza letti selezionati dalla config
      const bedIds = config.beds || [];
      setSelectedBedIds(bedIds);
      
      const { configToSelectedItems } = await import('~/lib/linenCalculator');
      const items = configToSelectedItems(config, allInventoryItems);
      setSelectedItems(items);
      setIsModified(false);
      return;
    }
    
    // 🆕 Se non c'è config, seleziona automaticamente i letti necessari
    if (propertyBeds.length > 0) {
      let capacitySoFar = 0;
      const autoSelectedBeds: string[] = [];
      for (const bed of propertyBeds) {
        if (capacitySoFar >= guestsCount) break;
        autoSelectedBeds.push(bed.id);
        capacitySoFar += bed.cap || 1;
      }
      setSelectedBedIds(autoSelectedBeds);
      
      // Calcola biancheria per i letti selezionati
      const selectedBedsData = propertyBeds.filter(b => autoSelectedBeds.includes(b.id));
      const linenReq = calcLinenForBeds(selectedBedsData);
      const items = mapLinenToItems(linenReq, allInventoryItems);
      setSelectedItems(items);
      setIsModified(false);
      return;
    }
    
    setSelectedItems([]);
    setSelectedBedIds([]);
  };

  useEffect(() => {
    const shouldApply = formData.guestsCount > 0 && !isModified && (
      formData.requestType === "linen_only" || 
      (formData.requestType === "cleaning" && formData.createLinenOrder)
    );
    
    if (shouldApply) {
      applyStandardConfig(formData.guestsCount);
    }
  }, [formData.guestsCount, formData.createLinenOrder, formData.requestType, allInventoryItems, propertyConfigs, isModified]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      setTimeout(() => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setShowPropertyDropdown(false);
        }
      }, 100);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePropertySelect = (prop: Property) => {
    setSelectedProperty(prop);
    setFormData(prev => ({ 
      ...prev, 
      propertyId: prop.id, 
      guestsCount: 2, 
      scheduledTime: prop.checkOutTime || "10:00",
      createLinenOrder: !prop.usesOwnLinen, // Auto-disattiva biancheria se proprietà usa propria
    }));
    setPropertySearch(prop.name);
    setShowPropertyDropdown(false);
    loadPropertyConfig(prop.id);
    setSelectedItems([]);
    setSelectedBedIds([]);
    setIsModified(false);
  };

  const handleGuestsChange = (value: number) => {
    setFormData(prev => ({ ...prev, guestsCount: value }));
    if (!isModified && formData.createLinenOrder) applyStandardConfig(value);
  };

  // 🆕 Toggle selezione letto
  const toggleBed = (bedId: string) => {
    setIsModified(true);
    const isSel = selectedBedIds.includes(bedId);
    const newBedIds = isSel 
      ? selectedBedIds.filter(id => id !== bedId) 
      : [...selectedBedIds, bedId];
    
    setSelectedBedIds(newBedIds);
    
    // Ricalcola biancheria letto in base ai letti selezionati
    const newSelectedBeds = propertyBeds.filter(b => newBedIds.includes(b.id));
    const linenReq = calcLinenForBeds(newSelectedBeds);
    const newLinenItems = mapLinenToItems(linenReq, allInventoryItems);
    
    // Mantieni gli item non-letto (bagno, kit) e sostituisci solo biancheria letto
    setSelectedItems(prev => {
      const nonBedItems = prev.filter(item => 
        item.category !== 'biancheria_letto' && 
        !['doubleSheets', 'singleSheets', 'pillowcases', 'item_doubleSheets', 'item_singleSheets', 'item_pillowcases']
          .includes(item.id) &&
        !item.name.toLowerCase().includes('lenzuol') &&
        !item.name.toLowerCase().includes('feder')
      );
      return [...nonBedItems, ...newLinenItems];
    });
  };

  // 🆕 Dati letti selezionati
  const selectedBedsData = useMemo(() => {
    return propertyBeds.filter(b => selectedBedIds.includes(b.id));
  }, [propertyBeds, selectedBedIds]);

  // 🆕 Capacità totale letti selezionati
  const totalBedCapacity = useMemo(() => {
    return selectedBedsData.reduce((sum, bed) => sum + (bed.cap || 1), 0);
  }, [selectedBedsData]);

  // 🆕 Warning se capacità insufficiente
  const capacityWarning = totalBedCapacity < formData.guestsCount && selectedBedIds.length > 0;

  const handleAddItem = (item: InventoryItem) => {
    setIsModified(true);
    setSelectedItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: item.id, name: item.name, quantity: 1, price: item.sellPrice, category: item.category }];
    });
  };

  const handleItemQuantityChange = (itemId: string, newQty: number) => {
    setIsModified(true);
    if (newQty <= 0) setSelectedItems(prev => prev.filter(i => i.id !== itemId));
    else setSelectedItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: newQty } : i));
  };

  const handleRemoveItem = (itemId: string) => {
    setIsModified(true);
    setSelectedItems(prev => prev.filter(i => i.id !== itemId));
  };

  const filteredProperties = useMemo(() => {
    if (!propertySearch.trim()) return properties;
    const search = propertySearch.toLowerCase();
    return properties.filter(p => p.name.toLowerCase().includes(search) || p.address.toLowerCase().includes(search));
  }, [properties, propertySearch]);

  // ═══════════════════════════════════════════════════════════════
  // LOGICA TIPI SERVIZIO DISPONIBILI
  // ═══════════════════════════════════════════════════════════════
  // Admin: vede tutti (Standard, Approfondita, Sgrosso)
  // Proprietario: vede solo Standard e Sgrosso (NO Approfondita)
  const availableServiceTypes = useMemo(() => {
    if (isAdmin) {
      // Admin vede tutti
      return serviceTypes.filter(st => 
        st.code === "STANDARD" || st.code === "APPROFONDITA" || st.code === "SGROSSO"
      );
    } else {
      // Proprietario: solo Standard e Sgrosso
      return serviceTypes.filter(st => 
        st.code === "STANDARD" || st.code === "SGROSSO"
      );
    }
  }, [serviceTypes, isAdmin]);

  const selectedType = useMemo(() => serviceTypes.find(st => st.code === selectedServiceType), [serviceTypes, selectedServiceType]);
  const isSgrosso = selectedServiceType === "SGROSSO";
  const isApprofondita = selectedServiceType === "APPROFONDITA";
  
  // ═══════════════════════════════════════════════════════════════
  // LOGICA PREZZO
  // ═══════════════════════════════════════════════════════════════
  // - Sgrosso da Admin: prezzo manuale (customPrice)
  // - Sgrosso da Proprietario: nessun prezzo (va in pending)
  // - Standard/Approfondita: prezzo da contratto + baseSurcharge
  const effectivePrice = useMemo(() => {
    if (isSgrosso) {
      if (isAdmin) {
        // Admin: usa prezzo personalizzato o 0 se non inserito
        return customPrice !== null ? customPrice : 0;
      } else {
        // Proprietario: prezzo 0 (verrà definito da admin dopo approvazione)
        return 0;
      }
    }
    // Standard e Approfondita: prezzo contratto + sovrapprezzo (se c'è)
    const surcharge = selectedType?.baseSurcharge || 0;
    return cleaningPrice + surcharge;
  }, [customPrice, selectedType, cleaningPrice, isSgrosso, isAdmin]);

  const priceIsModified = customPrice !== null && customPrice !== cleaningPrice;
  const linenTotal = useMemo(() => selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0), [selectedItems]);
  
  // 💰 Costo consegna: €10 per richieste solo biancheria (senza pulizia)
  const DELIVERY_FEE = 10;
  const hasDeliveryFee = formData.requestType === "linen_only" && formData.applyDeliveryFee;
  
  // 🛏️ Costo preparazione letti: €5 per ogni letto selezionato
  const BED_MAKING_FEE_PER_BED = 5;
  const bedMakingCount = formData.bedMaking ? selectedBedIds.length : 0;
  const bedMakingFee = bedMakingCount * BED_MAKING_FEE_PER_BED;
  
  const totalPrice = useMemo(() => {
    if (formData.requestType === "linen_only") return linenTotal + (formData.applyDeliveryFee ? DELIVERY_FEE : 0) + bedMakingFee;
    // Per sgrosso da proprietario, mostra solo biancheria (prezzo pulizia TBD)
    if (isSgrosso && isProprietario) return linenTotal;
    return effectivePrice + (formData.createLinenOrder ? linenTotal : 0);
  }, [effectivePrice, linenTotal, formData.requestType, formData.createLinenOrder, formData.applyDeliveryFee, isSgrosso, isProprietario, bedMakingFee]);

  const filteredItems = useMemo(() => activeCategory === "all" ? allInventoryItems : allInventoryItems.filter(item => item.category === activeCategory), [allInventoryItems, activeCategory]);
  const canProceedToStep2 = formData.propertyId && formData.scheduledDate && (formData.requestType === "linen_only" ? !selectedProperty?.usesOwnLinen : selectedServiceType);
  const guestsValid = formData.guestsCount > 0;

  // 🆕 Calcola validazione biancheria
  const linenValidation = useMemo(() => {
    // Se biancheria disabilitata o nessun item, non validare
    if (!formData.createLinenOrder && formData.requestType !== "linen_only") {
      return { isValid: true, missingMatrimoniali: 0, missingSingole: 0, missingFedere: 0, requiredMatrimoniali: 0, requiredSingole: 0, requiredFedere: 0, currentMatrimoniali: 0, currentSingole: 0, currentFedere: 0 };
    }
    if (selectedItems.length === 0) {
      return { isValid: true, missingMatrimoniali: 0, missingSingole: 0, missingFedere: 0, requiredMatrimoniali: 0, requiredSingole: 0, requiredFedere: 0, currentMatrimoniali: 0, currentSingole: 0, currentFedere: 0 };
    }
    
    // Trova i letti selezionati dalla config per questo numero di ospiti
    // @ts-expect-error TODO-FIX: TS7015 Element implicitly has an 'any' type because index expression is not of type 'nu...
    const config = propertyConfigs[formData.guestsCount] || propertyConfigs[String(formData.guestsCount)];
    const selectedBedIds = config?.beds || [];
    const selectedBeds = propertyBeds.filter(b => selectedBedIds.includes(b.id));
    
    // Se non ci sono letti configurati, usa tutti i letti della proprietà (fallback)
    const bedsToValidate = selectedBeds.length > 0 ? selectedBeds : propertyBeds;
    
    if (bedsToValidate.length === 0) {
      // Nessun letto configurato - non validare
      return { isValid: true, missingMatrimoniali: 0, missingSingole: 0, missingFedere: 0, requiredMatrimoniali: 0, requiredSingole: 0, requiredFedere: 0, currentMatrimoniali: 0, currentSingole: 0, currentFedere: 0 };
    }
    
    return validateLinenForBeds(bedsToValidate, selectedItems, formData.guestsCount);
  }, [selectedItems, propertyConfigs, propertyBeds, formData.guestsCount, formData.createLinenOrder, formData.requestType]);

  // 🆕 Flag per bloccare submit se biancheria insufficiente e modificata
  const linenInsufficientBlocking = isModified && !linenValidation.isValid && 
    (formData.createLinenOrder || formData.requestType === "linen_only");

  // ═══════════════════════════════════════════════════════════════
  // SUBMIT - LOGICA COMPLETA
  // ═══════════════════════════════════════════════════════════════
  const handleSubmit = async () => {
    if (saving) return;
    
    // 🆕 Validazione biancheria minima
    if (linenInsufficientBlocking) {
      alert("Biancheria insufficiente! Aggiungi le lenzuola e federe mancanti prima di salvare.");
      return;
    }
    
    // Validazione Sgrosso
    if (isSgrosso) {
      if (!sgrossoReason) { 
        alert("Seleziona il motivo dello sgrosso"); 
        return; 
      }
      if (sgrossoReason === "ALTRO" && !sgrossoNotes.trim()) { 
        alert("Specifica il motivo nelle note"); 
        return; 
      }
      // Solo Admin deve inserire prezzo per Sgrosso
      if (isAdmin && (customPrice === null || customPrice <= 0)) {
        alert("Inserisci un prezzo valido per lo sgrosso");
        return;
      }
    }

    setSaving(true);
    try {
      const sgrossoReasonObj = SGROSSO_REASONS.find(r => r.code === sgrossoReason);
      
      // ═══════════════════════════════════════════════════════════════
      // DETERMINA STATO E TIPO PULIZIA
      // ═══════════════════════════════════════════════════════════════
      // - Sgrosso da Proprietario → PENDING_APPROVAL
      // - Tutto il resto → SCHEDULED (attivo)
      const isPendingApproval = isSgrosso && isProprietario;
      
      const apiData = {
        propertyId: formData.propertyId,
        scheduledDate: formData.scheduledDate,
        scheduledTime: formData.scheduledTime,
        guestsCount: formData.guestsCount,
        notes: formData.notes,
        // Tipo servizio
        serviceType: selectedServiceType,
        serviceTypeName: selectedType?.name || "Pulizia Standard",
        type: selectedServiceType === "SGROSSO" ? "SGROSSO" : "MANUAL",
        // Biancheria
        createLinenOrder: formData.createLinenOrder && !isPendingApproval, // No ordine biancheria se pending
        linenOnly: formData.requestType === "linen_only",
        customLinenItems: selectedItems.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price || 0,
        })),
        // 🆕 Letti selezionati - FONDAMENTALE per EditCleaningModal
        selectedBedIds: selectedBedIds,
        // 🔥 NUOVO: Flag per indicare se la config biancheria è stata modificata manualmente
        linenConfigModified: isModified,
        // Prezzo
        cleaningPrice: effectivePrice,
        priceModified: priceIsModified,
        // Urgenza e ritiro
        urgency: formData.urgency,
        includePickup: formData.includePickup && !isPendingApproval,
        // 💰 Costo consegna (solo per linen_only)
        applyDeliveryFee: formData.requestType === "linen_only" ? formData.applyDeliveryFee : false,
        // 🛏️ Preparazione letti
        bedMaking: formData.requestType === "linen_only" ? formData.bedMaking : false,
        bedMakingCount: formData.requestType === "linen_only" && formData.bedMaking ? selectedBedIds.length : 0,
        bedMakingFee: formData.requestType === "linen_only" && formData.bedMaking ? selectedBedIds.length * 5 : 0,
        // Dati Sgrosso
        sgrossoReason: isSgrosso ? sgrossoReason : null,
        sgrossoReasonLabel: isSgrosso && sgrossoReasonObj ? sgrossoReasonObj.label : null,
        sgrossoNotes: isSgrosso ? sgrossoNotes : null,
        // ⭐ NUOVO: Stato richiesta
        requestedByRole: userRole,
        isPendingApproval: isPendingApproval,
      };
      
      const response = await fetch("/api/cleanings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiData),
      });
      const data = await response.json();
      
      // Gestione errore duplicato
      if (response.status === 409 && (data.error === "DUPLICATE_CLEANING" || data.error === "DUPLICATE_ORDER")) {
        setDuplicateError({
          show: true,
          message: data.message,
          existingId: data.existingId,
          existingType: data.existingType,
          existingStatus: data.existingStatus,
          propertyName: data.propertyName,
          date: data.date,
        });
        return;
      }
      
      if (!response.ok) throw new Error(data.error || "Errore nella creazione");
      
      // Mostra modal successo
      onSuccess();
      if (isPendingApproval) {
        setSuccessModal({ show: true, message: "Richiesta sgrosso inviata! L'admin approverà e definirà il prezzo.", isPending: true });
      } else {
        setSuccessModal({ show: true, message: data.message || "Pulizia creata con successo!" });
      }
    } catch (error: any) {
      console.error("Errore:", error);
      alert(error.message || "Errore nella creazione");
    } finally {
      setSaving(false);
    }
  };

  // Calcola prezzi per categoria (per accordion) - DEVE essere prima del return condizionale
  const bedPrice = useMemo(() => selectedItems.filter(i => i.category === 'biancheria_letto').reduce((s, i) => s + i.price * i.quantity, 0), [selectedItems]);
  const bathPrice = useMemo(() => selectedItems.filter(i => i.category === 'biancheria_bagno').reduce((s, i) => s + i.price * i.quantity, 0), [selectedItems]);
  const kitPrice = useMemo(() => selectedItems.filter(i => i.category === 'kit_cortesia').reduce((s, i) => s + i.price * i.quantity, 0), [selectedItems]);
  const extraPrice = useMemo(() => selectedItems.filter(i => !['biancheria_letto','biancheria_bagno','kit_cortesia'].includes(i.category || '')).reduce((s, i) => s + i.price * i.quantity, 0), [selectedItems]);

  // Items per categoria
  const bedItems = useMemo(() => selectedItems.filter(i => i.category === 'biancheria_letto'), [selectedItems]);
  const bathItems = useMemo(() => selectedItems.filter(i => i.category === 'biancheria_bagno'), [selectedItems]);
  const kitItems = useMemo(() => selectedItems.filter(i => i.category === 'kit_cortesia'), [selectedItems]);
  const extraItems = useMemo(() => selectedItems.filter(i => !['biancheria_letto','biancheria_bagno','kit_cortesia'].includes(i.category || '')), [selectedItems]);

  // Inventory items per categoria
  const invBed = useMemo(() => allInventoryItems.filter(i => i.category === 'biancheria_letto'), [allInventoryItems]);
  const invBath = useMemo(() => allInventoryItems.filter(i => i.category === 'biancheria_bagno'), [allInventoryItems]);
  const invKit = useMemo(() => allInventoryItems.filter(i => i.category === 'kit_cortesia'), [allInventoryItems]);
  const invExtra = useMemo(() => allInventoryItems.filter(i => !['biancheria_letto','biancheria_bagno','kit_cortesia'].includes(i.category || '')), [allInventoryItems]);

  if (!isOpen) return null;

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">

      {/* ═══ HEADER ═══ */}
      <div className="flex-shrink-0 bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <div className="w-5 h-5 text-white">{formData.requestType === "linen_only" ? I.bed : I.home}</div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{formData.requestType === "linen_only" ? "Richiedi Biancheria" : "Nuova Pulizia"}</h2>
              <p className="text-xs text-white/80">Step {currentStep} di 2 • {currentStep === 1 ? "Proprietà e Servizio" : "Ospiti e Dotazioni"}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30">
            <div className="w-4 h-4 text-white">{I.close}</div>
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <div className={`h-1 flex-1 rounded-full ${currentStep >= 1 ? 'bg-white' : 'bg-white/30'}`}></div>
          <div className={`h-1 flex-1 rounded-full ${currentStep >= 2 ? 'bg-white' : 'bg-white/30'}`}></div>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STEP 1: Proprietà e Servizio                                   */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <>
            {/* Tipo Richiesta */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <div className="w-4 h-4 text-slate-600">{I.gift}</div>
                </div>
                <span className="text-sm font-semibold text-slate-800">Cosa vuoi richiedere?</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, requestType: "cleaning" }))}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${formData.requestType === "cleaning" ? "border-slate-800 bg-slate-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${formData.requestType === "cleaning" ? 'bg-slate-200' : 'bg-slate-100'}`}>
                    <div className={`w-5 h-5 ${formData.requestType === "cleaning" ? 'text-slate-700' : 'text-slate-500'}`}>{I.home}</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">Pulizia</span>
                </button>
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, requestType: "linen_only" }))}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${formData.requestType === "linen_only" ? "border-slate-800 bg-slate-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${formData.requestType === "linen_only" ? 'bg-slate-200' : 'bg-slate-100'}`}>
                    <div className={`w-5 h-5 ${formData.requestType === "linen_only" ? 'text-slate-700' : 'text-slate-500'}`}>{I.bed}</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">Solo Biancheria</span>
                </button>
              </div>
            </div>

            {/* Avviso biancheria propria + solo biancheria */}
            {formData.requestType === "linen_only" && selectedProperty?.usesOwnLinen && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center gap-2">
                <span>⚠️</span>
                <p className="text-xs text-amber-700 font-medium">Questa proprietà usa biancheria propria. Non è possibile creare ordini solo biancheria.</p>
              </div>
            )}

            {/* Proprietà */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <div className="w-4 h-4 text-blue-600">{I.home}</div>
                </div>
                <span className="text-sm font-semibold text-slate-800">Proprietà <span className="text-red-500">*</span></span>
              </div>
              <div ref={dropdownRef} className="relative">
                {loadingProperties ? (
                  <div className="animate-pulse bg-slate-100 h-12 rounded-xl"></div>
                ) : selectedProperty ? (
                  /* Card proprietà selezionata con X */
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white shadow-sm overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {selectedProperty.imageUrl ? <img src={selectedProperty.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-6 h-6 text-blue-400">{I.home}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{selectedProperty.name}</p>
                        <p className="text-xs text-slate-500 truncate">{selectedProperty.address}</p>
                        <div className="flex gap-3 mt-1 text-[10px] text-slate-500">
                          <span>{selectedProperty.bedsConfig && selectedProperty.bedsConfig.length > 0 ? selectedProperty.bedsConfig.length : (selectedProperty.bedrooms || 1)} letti</span>
                          <span>•</span>
                          <span>Max {selectedProperty.maxGuests}</span>
                          <span>•</span>
                          <span>€{selectedProperty.cleaningPrice || 0}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => { setSelectedProperty(null); setFormData(prev => ({ ...prev, propertyId: "" })); setPropertySearch(""); }} className="w-9 h-9 rounded-full bg-white border border-red-200 flex items-center justify-center hover:bg-red-50 transition-colors flex-shrink-0 shadow-sm">
                        <div className="w-4 h-4 text-red-400">{I.close}</div>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="w-4 h-4 text-slate-400 flex-shrink-0">{I.search}</div>
                      <input type="text" value={propertySearch}
                        onChange={(e) => { setPropertySearch(e.target.value); setShowPropertyDropdown(true); if (!e.target.value) { setSelectedProperty(null); setFormData(prev => ({ ...prev, propertyId: "" })); } }}
                        onFocus={() => setShowPropertyDropdown(true)}
                        placeholder="Cerca proprietà..."
                        className="flex-1 bg-transparent outline-none text-sm" />
                    </div>
                    {showPropertyDropdown && filteredProperties.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                        {filteredProperties.map(prop => (
                          <button key={prop.id} type="button" onClick={() => handlePropertySelect(prop)}
                            // @ts-expect-error TODO-FIX: TS2339 Property 'id' does not exist on type 'never'.
                            className={`w-full p-3 flex items-center gap-3 hover:bg-blue-50 text-left border-b border-slate-100 last:border-0 ${selectedProperty?.id === prop.id ? 'bg-blue-50' : ''}`}>
                            <div className="w-12 h-12 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
                              {prop.imageUrl ? <img src={prop.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 text-slate-400">{I.home}</div></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 truncate">{prop.name}</p>
                              <p className="text-xs text-slate-500 truncate">{prop.address}</p>
                              <p className="text-[10px] text-slate-400">Max {prop.maxGuests} ospiti</p>
                            </div>
                            {/* @ts-expect-error TODO-FIX */}
                            {selectedProperty?.id === prop.id && <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center"><div className="w-3 h-3 text-white">{I.check}</div></div>}
                          </button>
                        ))}
                      </div>
                    )}
                    {showPropertyDropdown && propertySearch && filteredProperties.length === 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 text-center text-sm text-slate-500">
                        Nessuna proprietà trovata per &quot;{propertySearch}&quot;
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Data */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <div className="w-4 h-4 text-slate-600">{I.calendar}</div>
                </div>
                <span className="text-sm font-semibold text-slate-800">Data <span className="text-red-500">*</span></span>
              </div>
              <input type="date" value={formData.scheduledDate} onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))} min={isAdmin ? undefined : getRomeDate()} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-400 outline-none" required />
            </div>

            {/* Orario */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <div className="w-4 h-4 text-slate-600">{I.clock}</div>
                </div>
                <span className="text-sm font-semibold text-slate-800">{formData.requestType === "linen_only" ? "Ora Consegna" : "Orario"}</span>
              </div>
              {isAdmin ? (
                <select value={formData.scheduledTime} onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-400 outline-none">
                  {["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <div className="px-4 py-3 bg-slate-50 rounded-xl text-center">
                  <span className="text-sm text-slate-600">Checkout: <strong>{selectedProperty?.checkOutTime || "10:00"}</strong> — {formData.requestType === "linen_only" ? "Orario consegna assegnato dall'admin" : "Orario e operatore assegnati dall'admin"}</span>
                </div>
              )}
            </div>

            {/* Urgenza - Solo Admin */}
            {isAdmin && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <span className="text-sm">🚨</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">Priorità</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={(e) => { e.preventDefault(); setFormData(prev => ({ ...prev, urgency: "normal" })); }}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${formData.urgency === "normal" ? "border-slate-800 bg-slate-50" : "border-slate-200"}`}>
                    <span className="text-sm font-semibold text-slate-700">📦 Normale</span>
                  </button>
                  <button type="button" onClick={(e) => { e.preventDefault(); setFormData(prev => ({ ...prev, urgency: "urgent" })); }}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${formData.urgency === "urgent" ? "border-red-500 bg-red-50" : "border-slate-200"}`}>
                    <span className="text-sm font-semibold text-red-600">🚨 URGENTE</span>
                  </button>
                </div>
              </div>
            )}

            {/* 💰 Costo Consegna - Solo Admin, solo per richiesta biancheria standalone */}
            {isAdmin && formData.requestType === "linen_only" && (
              <div className="bg-white rounded-xl border border-amber-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                      <span className="text-sm">🚚</span>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-800">Costo Consegna €{DELIVERY_FEE}</span>
                      <p className="text-[11px] text-slate-500">Applicato automaticamente per consegne standalone</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setFormData(prev => ({ ...prev, applyDeliveryFee: !prev.applyDeliveryFee })); }}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      formData.applyDeliveryFee ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      formData.applyDeliveryFee ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {/* Tipo Servizio */}
            {formData.requestType === "cleaning" && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <div className="w-4 h-4 text-slate-600">{I.home}</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">Tipo di Servizio</span>
                </div>
                <div className={`grid gap-2 ${availableServiceTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {(availableServiceTypes.length > 0 ? availableServiceTypes : DEFAULT_SERVICE_TYPES.filter(st => !st.adminOnly || isAdmin)).map(st => {
                    const isSelected = selectedServiceType === st.code;
                    return (
                      <button key={st.code} type="button" onClick={() => { setSelectedServiceType(st.code); if (st.code !== "SGROSSO") { setSgrossoReason(""); setSgrossoNotes(""); setCustomPrice(null); } }}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${isSelected ? "border-slate-800 bg-slate-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                        <div className={`w-10 h-10 rounded-xl mx-auto mb-1.5 flex items-center justify-center ${isSelected ? 'bg-slate-200' : 'bg-slate-100'}`}>
                          <div className={`w-5 h-5 ${isSelected ? 'text-slate-700' : 'text-slate-500'}`}>
                            {st.code === 'STANDARD' ? I.home : st.code === 'APPROFONDITA' ? I.star : I.wrench}
                          </div>
                        </div>
                        <span className={`text-xs font-semibold ${isSelected ? 'text-slate-800' : 'text-slate-600'}`}>{st.name}</span>
                        {st.code === "APPROFONDITA" && <span className="text-[9px] text-slate-400 block">Solo Admin</span>}
                        {st.code === "SGROSSO" && isProprietario && <span className="text-[9px] text-slate-400 block">Richiede approv.</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Sgrosso Details */}
                {isSgrosso && (
                  <div className="mt-3 bg-purple-50 p-4 rounded-xl border border-purple-200 space-y-3">
                    <div>
                      <label className="block text-sm font-semibold text-purple-700 mb-2">Motivo Sgrosso *</label>
                      <select value={sgrossoReason} onChange={(e) => setSgrossoReason(e.target.value as SgrossoReasonCode)} className="w-full px-4 py-3 border border-purple-200 rounded-xl bg-white text-sm">
                        <option value="">Seleziona motivo...</option>
                        {SGROSSO_REASONS.map(r => (<option key={r.code} value={r.code}>{r.icon} {r.label}</option>))}
                      </select>
                      {sgrossoReason === "ALTRO" && (
                        <textarea value={sgrossoNotes} onChange={(e) => setSgrossoNotes(e.target.value)} placeholder="Specifica il motivo..." rows={2} className="w-full mt-2 px-4 py-3 border border-purple-200 rounded-xl bg-white text-sm resize-none" />
                      )}
                    </div>
                    {isAdmin && (
                      <div>
                        <label className="block text-sm font-semibold text-purple-700 mb-2">💰 Prezzo Sgrosso *</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                          <input type="number" step="0.01" min="0" value={customPrice ?? ''} onChange={(e) => setCustomPrice(e.target.value ? parseFloat(e.target.value) : null)} placeholder="Inserisci prezzo..." className="w-full pl-8 pr-4 py-3 border border-purple-200 rounded-xl bg-white text-sm" />
                        </div>
                      </div>
                    )}
                    {isProprietario && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p className="text-sm font-semibold text-amber-800">⏳ Richiesta in attesa</p>
                        <p className="text-xs text-amber-700 mt-0.5">La richiesta sarà inviata all&apos;admin che approverà e definirà il prezzo.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STEP 2: Ospiti e Dotazioni                                     */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <>
            {/* Guest Selector */}
            <GuestSelectorNew value={formData.guestsCount} onChange={handleGuestsChange} max={selectedProperty?.maxGuests || 6} />
            {!guestsValid && <p className="text-xs text-amber-600 text-center">⚠️ Seleziona il numero di ospiti</p>}

            {/* Toggle Biancheria */}
            {formData.requestType === "cleaning" && !(isSgrosso && isProprietario) && (
              <div className={`p-3 rounded-xl border ${selectedProperty?.usesOwnLinen ? 'bg-amber-50/50 border-amber-200' : 'bg-gradient-to-r from-white to-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedProperty?.usesOwnLinen ? 'bg-amber-100' : 'bg-sky-100'}`}>
                      <div className={`w-5 h-5 ${selectedProperty?.usesOwnLinen ? 'text-amber-600' : 'text-sky-600'}`}>{I.bed}</div>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-700">Biancheria</span>
                      <p className="text-[10px] text-slate-500">
                        {selectedProperty?.usesOwnLinen 
                          ? (formData.createLinenOrder ? "⚠️ Attivata manualmente (proprietà usa propria)" : "Disattivata — proprietà usa biancheria propria")
                          : (formData.createLinenOrder ? "Inclusa nella pulizia" : "Solo pulizia, senza biancheria")
                        }
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, createLinenOrder: !prev.createLinenOrder }))}
                    className={`relative w-14 h-8 rounded-full p-1 transition-all duration-300 ${formData.createLinenOrder ? 'bg-sky-500 shadow-lg shadow-sky-200' : 'bg-slate-300'}`}>
                    <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300 ${formData.createLinenOrder ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </button>
                </div>
              </div>
            )}

            {/* Sgrosso Pending Info */}
            {isSgrosso && isProprietario && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <p className="font-semibold text-purple-800">📋 Richiesta Sgrosso</p>
                <p className="text-xs text-purple-600">La biancheria sarà gestita dopo l&apos;approvazione</p>
              </div>
            )}

            {/* ═══ ACCORDION SECTIONS (Biancheria) ═══ */}
            {guestsValid && (formData.requestType === "linen_only" || (formData.requestType === "cleaning" && formData.createLinenOrder)) && !(isSgrosso && isProprietario) && (
              <>
                {(loadingInventory || loadingConfig) ? (
                  <div className="p-8 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full mx-auto mb-2"></div>
                    <p className="text-xs text-slate-500">Caricamento dotazioni...</p>
                  </div>
                ) : (
                  <>
                {/* Biancheria Letto */}
                <Section title="Biancheria Letto" icon={I.bed} price={bedPrice} expanded={sec === 'beds'} onToggle={() => setSec(sec === 'beds' ? null : 'beds')}>
                  {propertyBeds.length > 0 && (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-2">🛏️ Seleziona i letti da preparare per {formData.guestsCount} ospiti:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {propertyBeds.map(bed => {
                            const isSel = selectedBedIds.includes(bed.id);
                            return (
                              <button key={bed.id} type="button" onClick={() => toggleBed(bed.id)} className={`p-2.5 rounded-lg border-2 text-left transition-all ${isSel ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
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
                          <div className="mt-2 p-2 bg-blue-50 rounded-lg"><p className="text-xs text-blue-700">✓ {selectedBedsData.length} letti selezionati = {totalBedCapacity} posti</p></div>
                        )}
                        {capacityWarning && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg"><p className="text-xs text-amber-700">⚠️ Capacità letti ({totalBedCapacity}) inferiore a {formData.guestsCount} ospiti</p></div>
                        )}
                      </div>
                      {bedItems.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2">📦 Biancheria necessaria:</p>
                          <div className="space-y-2">
                            {bedItems.map(item => (
                              <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-blue-100">
                                <span className="text-xs text-slate-700 font-medium">{item.name} <span className="text-blue-500">€{formatPrice(item.price)}</span></span>
                                <Cnt v={item.quantity} onChange={v => handleItemQuantityChange(item.id, v)} />
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-2 italic">Quantità calcolate in base ai letti selezionati. Puoi modificarle manualmente.</p>
                        </div>
                      )}
                    </div>
                  )}
                  {propertyBeds.length === 0 && (
                    <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun letto configurato</p></div>
                  )}
                </Section>

                {/* 🛏️ PREPARAZIONE LETTI — solo per linen_only */}
                {formData.requestType === "linen_only" && selectedBedIds.length > 0 && (
                  <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-xl">🛏️</div>
                        <div>
                          <span className="text-sm font-semibold text-slate-800">Preparazione Letti</span>
                          <p className="text-[10px] text-slate-500">
                            {formData.bedMaking 
                              ? `${selectedBedIds.length} ${selectedBedIds.length === 1 ? 'letto' : 'letti'} × €${BED_MAKING_FEE_PER_BED} = €${bedMakingFee}`
                              : "Solo consegna biancheria, senza fare i letti"
                            }
                          </p>
                        </div>
                      </div>
                      <button type="button" onClick={() => setFormData(prev => ({ ...prev, bedMaking: !prev.bedMaking }))}
                        className={`relative w-14 h-8 rounded-full p-1 transition-all duration-300 ${formData.bedMaking ? 'bg-violet-500 shadow-lg shadow-violet-200' : 'bg-slate-300'}`}>
                        <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300 ${formData.bedMaking ? 'translate-x-6' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                    {formData.bedMaking && (
                      <div className="mt-3 pt-3 border-t border-violet-200">
                        <div className="space-y-1.5">
                          {selectedBedsData.map(bed => (
                            <div key={bed.id} className="flex items-center justify-between py-1.5 px-3 bg-white rounded-lg border border-violet-100">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{bed.type === 'matrimoniale' ? '🛏️' : bed.type === 'singolo' ? '🛌' : '🛏️'}</span>
                                <span className="text-xs font-medium text-slate-700">{bed.name}</span>
                                <span className="text-[10px] text-slate-400">{bed.loc}</span>
                              </div>
                              <span className="text-xs font-bold text-violet-600">€{BED_MAKING_FEE_PER_BED}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex justify-end">
                          <span className="text-sm font-bold text-violet-700">Totale letti: €{bedMakingFee}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Biancheria Bagno */}
                <Section title="Biancheria Bagno" icon={I.towel} price={bathPrice} expanded={sec === 'bath'} onToggle={() => setSec(sec === 'bath' ? null : 'bath')}>
                  <div className="space-y-2">
                    {invBath.map(item => {
                      const sel = selectedItems.find(i => i.id === (item.id || item.key));
                      return (
                        <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-slate-100">
                          <span className="text-xs text-slate-700 font-medium">{item.name} <span className="text-blue-500">€{formatPrice(item.sellPrice)}</span></span>
                          <Cnt v={sel?.quantity || 0} onChange={v => {
                            if (v === 0) { handleRemoveItem(item.id || item.key); }
                            else if (sel) { handleItemQuantityChange(item.id || item.key, v); }
                            else { handleAddItem(item); if (v > 1) handleItemQuantityChange(item.id || item.key, v); }
                            setIsModified(true);
                          }} />
                        </div>
                      );
                    })}
                    {invBath.length === 0 && <p className="text-xs text-slate-500 text-center py-2">Nessun articolo bagno disponibile</p>}
                  </div>
                </Section>

                {/* Kit Cortesia */}
                <Section title="Kit Cortesia" icon={I.soap} price={kitPrice} expanded={sec === 'kit'} onToggle={() => setSec(sec === 'kit' ? null : 'kit')}>
                  <div className="space-y-2">
                    {invKit.map(item => {
                      const sel = selectedItems.find(i => i.id === (item.id || item.key));
                      return (
                        <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-slate-100">
                          <span className="text-xs text-slate-700 font-medium">{item.name} <span className="text-blue-500">€{formatPrice(item.sellPrice)}</span></span>
                          <Cnt v={sel?.quantity || 0} onChange={v => {
                            if (v === 0) { handleRemoveItem(item.id || item.key); }
                            else if (sel) { handleItemQuantityChange(item.id || item.key, v); }
                            else { handleAddItem(item); if (v > 1) handleItemQuantityChange(item.id || item.key, v); }
                            setIsModified(true);
                          }} />
                        </div>
                      );
                    })}
                    {invKit.length === 0 && <p className="text-xs text-slate-500 text-center py-2">Nessun kit disponibile</p>}
                  </div>
                </Section>

                {/* Servizi Extra */}
                {invExtra.length > 0 && (
                  <Section title="Servizi Extra" icon={I.gift} price={extraPrice} expanded={sec === 'extra'} onToggle={() => setSec(sec === 'extra' ? null : 'extra')}>
                    <div className="space-y-2">
                      {invExtra.map(item => {
                        const sel = selectedItems.find(i => i.id === (item.id || item.key));
                        return (
                          <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-slate-100">
                            <span className="text-xs text-slate-700 font-medium">{item.name} <span className="text-blue-500">€{formatPrice(item.sellPrice)}</span></span>
                            <Cnt v={sel?.quantity || 0} onChange={v => {
                              if (v === 0) { handleRemoveItem(item.id || item.key); }
                              else if (sel) { handleItemQuantityChange(item.id || item.key, v); }
                              else { handleAddItem(item); if (v > 1) handleItemQuantityChange(item.id || item.key, v); }
                              setIsModified(true);
                            }} />
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}
                  </>
                )}
              </>
            )}

            {/* Note */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <div className="w-4 h-4 text-slate-600">{I.edit}</div>
                </div>
                <span className="text-sm font-semibold text-slate-800">Note (opzionale)</span>
              </div>
              <textarea value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))} rows={2} placeholder="Istruzioni speciali..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl resize-none text-sm focus:border-blue-400 outline-none" />
            </div>

            {/* Totale */}
            {(guestsValid || formData.requestType === "linen_only") && (
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-4 shadow-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs text-slate-400">Totale per {formData.guestsCount} ospiti</span>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {formData.requestType === "cleaning" && (
                        <span className="text-sm text-slate-300">
                          {isSgrosso && isProprietario ? "In approvazione" : `Pulizia €${formatPrice(effectivePrice)}`}
                        </span>
                      )}
                      {(formData.createLinenOrder || formData.requestType === "linen_only") && selectedItems.length > 0 && !(isSgrosso && isProprietario) && (
                        <span className="text-sm text-slate-300">Dotazioni €{formatPrice(linenTotal)}</span>
                      )}
                      {hasDeliveryFee && (
                        <span className="text-sm text-amber-400">+ 🚚 Consegna €{formatPrice(DELIVERY_FEE)}</span>
                      )}
                      {formData.bedMaking && bedMakingFee > 0 && (
                        <span className="text-sm text-violet-400">+ 🛏️ Letti €{formatPrice(bedMakingFee)}</span>
                      )}
                    </div>
                  </div>
                  {isSgrosso && isProprietario ? (
                    <span className="text-lg font-bold text-purple-400">Da definire</span>
                  ) : (
                    <span className="text-2xl font-bold text-white">€{formatPrice(totalPrice)}</span>
                  )}
                </div>
                {/* Avviso costo consegna per proprietario */}
                {hasDeliveryFee && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400 text-sm mt-0.5">ℹ️</span>
                      <p className="text-xs text-slate-400">
                        Alla richiesta di sola biancheria viene applicato un <strong className="text-amber-400">costo di consegna di €{formatPrice(DELIVERY_FEE)}</strong> oltre al costo degli articoli.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ LINEN WARNING ═══ */}
      {currentStep === 2 && linenInsufficientBlocking && (
        <div className="flex-shrink-0 mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-2">
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Biancheria insufficiente</p>
              <p className="text-xs text-red-600 mt-1">Per {formData.guestsCount} ospiti servono almeno:</p>
              <ul className="text-xs text-red-600 mt-1 space-y-0.5">
                {linenValidation.requiredMatrimoniali > 0 && <li>• <strong>{linenValidation.requiredMatrimoniali}</strong> lenzuola matrimoniali (hai: <strong>{linenValidation.currentMatrimoniali}</strong>{linenValidation.missingMatrimoniali > 0 && <span className="text-red-700 font-bold"> → mancano {linenValidation.missingMatrimoniali}</span>})</li>}
                {linenValidation.requiredSingole > 0 && <li>• <strong>{linenValidation.requiredSingole}</strong> lenzuola singole (hai: <strong>{linenValidation.currentSingole}</strong>{linenValidation.missingSingole > 0 && <span className="text-red-700 font-bold"> → mancano {linenValidation.missingSingole}</span>})</li>}
                {linenValidation.requiredFedere > 0 && <li>• <strong>{linenValidation.requiredFedere}</strong> federe (hai: <strong>{linenValidation.currentFedere}</strong>{linenValidation.missingFedere > 0 && <span className="text-red-700 font-bold"> → mancano {linenValidation.missingFedere}</span>})</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ═══ FOOTER ═══ */}
      <div className="flex-shrink-0 px-4 py-4 border-t border-slate-200 bg-white" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
        <div className="flex gap-3">
          {currentStep === 1 ? (
            <>
              <button type="button" onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-100">Annulla</button>
              <button type="button" onClick={() => setCurrentStep(2)} disabled={!canProceedToStep2} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25">
                Avanti <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setCurrentStep(1)} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-100 flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg> Indietro
              </button>
              <button type="button" onClick={handleSubmit} disabled={saving || linenInsufficientBlocking || (formData.requestType === "cleaning" && !guestsValid) || (formData.requestType === "linen_only" && selectedItems.length === 0)}
                className={`flex-1 py-3 rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg ${isSgrosso && isProprietario ? 'bg-purple-600 text-white shadow-purple-500/25' : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/25'}`}>
                {saving ? "Creazione..." : isSgrosso && isProprietario ? "📤 Invia Richiesta" : "✓ Crea Pulizia"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ═══ DUPLICATE ERROR MODAL ═══ */}
      {duplicateError?.show && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center mb-4">
              <span className="text-4xl">⚠️</span>
              <h3 className="text-lg font-bold text-slate-800 mt-2">Servizio già esistente</h3>
            </div>
            <p className="text-sm text-slate-600 text-center mb-4">{duplicateError.message}</p>
            <div className="bg-amber-50 rounded-xl p-3 mb-4 text-center">
              <p className="text-xs text-amber-700"><strong>{duplicateError.propertyName}</strong> — {duplicateError.date}</p>
              <p className="text-xs text-amber-600 mt-1">Stato: {duplicateError.existingStatus}</p>
            </div>
            <div className="flex gap-3">
              {/* @ts-expect-error TODO-FIX */}
              <button onClick={() => setDuplicateError({ show: false, message: '', existingId: '', existingType: '', existingStatus: '', propertyName: '', date: '' })} className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-600">
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SUCCESS MODAL (Variante 2 - Gradient + Dettagli) ═══ */}
      {successModal?.show && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" style={{ animation: 'scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
            {/* Top gradient */}
            <div className={`px-6 pt-8 pb-12 text-center relative ${successModal.isPending ? 'bg-gradient-to-br from-purple-500 to-purple-700' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur mx-auto flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 50, strokeDashoffset: 50, animation: 'checkDraw 0.5s ease 0.3s forwards' }} />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white" style={{ animation: 'fadeIn 0.4s ease 0.5s both' }}>
                {successModal.isPending ? 'Richiesta Inviata!' : 'Tutto Pronto!'}
              </h3>
              <p className="text-sm text-white/80 mt-1" style={{ animation: 'fadeIn 0.4s ease 0.65s both' }}>
                {successModal.isPending ? 'In attesa di approvazione' : 'La pulizia è stata programmata'}
              </p>
            </div>
            {/* Bottom white */}
            <div className="bg-white px-6 pt-6 pb-6 -mt-4 rounded-t-3xl relative">
              <div className="space-y-3" style={{ animation: 'slideUp 0.5s ease 0.3s both' }}>
                {/* Proprietà con immagine */}
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {selectedProperty?.imageUrl ? (
                      <img src={selectedProperty.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 text-blue-600">{I.home}</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{selectedProperty?.name || 'Proprietà'}</p>
                    <p className="text-xs text-slate-500 truncate">{selectedProperty?.address || ''}</p>
                  </div>
                </div>
                {/* Dettagli */}
                <div className="flex gap-2">
                  <div className="flex-1 p-3 bg-slate-50 rounded-xl text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Data</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">
                      {formData.scheduledDate ? new Date(formData.scheduledDate + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '—'}
                    </p>
                  </div>
                  <div className="flex-1 p-3 bg-slate-50 rounded-xl text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Ospiti</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{formData.guestsCount}</p>
                  </div>
                  <div className={`flex-1 p-3 rounded-xl text-center ${successModal.isPending ? 'bg-purple-50' : 'bg-emerald-50'}`}>
                    <p className={`text-[10px] uppercase tracking-wide ${successModal.isPending ? 'text-purple-500' : 'text-emerald-500'}`}>Totale</p>
                    <p className={`text-sm font-bold mt-0.5 ${successModal.isPending ? 'text-purple-700' : 'text-emerald-700'}`}>
                      {successModal.isPending ? 'Da definire' : `€${formatPrice(totalPrice)}`}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setSuccessModal(null); onClose(); }}
                className={`w-full mt-4 py-3.5 text-white rounded-xl font-bold shadow-lg transition-colors ${successModal.isPending ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/25' : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/25'}`}
                style={{ animation: 'fadeIn 0.4s ease 0.8s both' }}
              >
                Perfetto!
              </button>
            </div>
          </div>
          <style>{`
            @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            @keyframes checkDraw { from { stroke-dashoffset: 50; } to { stroke-dashoffset: 0; } }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          `}</style>
        </div>
      )}
    </div>
  );
}
