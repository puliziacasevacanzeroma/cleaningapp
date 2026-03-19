"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot, getDocs, doc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import EditCleaningModal from "~/components/proprietario/EditCleaningModal";
import PropertyDurationStats from "~/components/dashboard/PropertyDurationStats";
import PropertyAccessCard from "~/components/property/PropertyAccessCard";
import PropertyRatingsSection from "~/components/cleaning/PropertyRatingsSection";
import PropertyServicesSection from "~/components/dashboard/PropertyServicesSection";
import { isSameDay } from "~/lib/dateUtils";

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
  right: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M9 18L15 12L9 6"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="9" cy="7" r="3" fill="currentColor" opacity="0.15"/><path d="M2 19C2 16 5 14 9 14S16 16 16 19"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.15"/><path d="M4 20C4 17 8 14 12 14S20 17 20 20"/></svg>,
  clean: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M12 2V8M9 8H15L14 22H10L9 8Z" fill="currentColor" opacity="0.1"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.15"/><path d="M12 1v3m0 16v3m-9-10h3m13 0h3"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" opacity="0.2"/><rect x="10" y="8" width="4" height="13" rx="1" fill="currentColor" opacity="0.3"/><rect x="17" y="4" width="4" height="17" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  money: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 6V18M15 9C15 8 14 7 12 7S9 8 9 10C9 11 10 12 12 12S15 13 15 15C15 17 14 17 12 17S9 16 9 15"/></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M15 18L9 12L15 6"/></svg>,
  bath: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 12H20V16C20 18 18 20 16 20H8C6 20 4 18 4 16V12Z" fill="currentColor" opacity="0.1"/><path d="M4 12H20"/></svg>,
  package: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M21 16V8L12 3L3 8V16L12 21L21 16Z" fill="currentColor" opacity="0.1"/><path d="M12 12V21M3 8L12 12L21 8"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 6V12L16 14"/></svg>,
  warn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M12 3L2 21H22L12 3Z" fill="currentColor" opacity="0.1"/><path d="M12 9V13M12 17H12.01"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M3 10H21M8 2V6M16 2V6"/></svg>,
  star: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M12 2L15 8.5L22 9.5L17 14.5L18 21.5L12 18L6 21.5L7 14.5L2 9.5L9 8.5L12 2Z" fill="currentColor" opacity="0.15"/></svg>,
  mail: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="2" y="4" width="20" height="16" rx="2" fill="currentColor" opacity="0.1"/><path d="M2 7L12 13L22 7"/></svg>,
  phone: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M22 16.9V19.9C22 20.5 21.5 21 20.9 21C10.5 20.4 2 11.4 2 1C2 0.4 2.5 0 3 0H6.1C6.6 0 7 0.4 7.1 0.9C7.3 2.5 7.7 4.1 8.4 5.5L6.1 7.8C7.5 10.6 10 13.1 12.8 14.5L15.1 12.2C16.5 12.9 18.1 13.3 19.7 13.5C20.2 13.6 20.6 14 20.6 14.5V17.6"/></svg>,
  trend: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M23 6L13.5 15.5L8.5 10.5L1 18"/><path d="M17 6H23V12"/></svg>,
  trendDown: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M23 18L13.5 8.5L8.5 13.5L1 6"/><path d="M17 18H23V12"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M11 4H4C2.9 4 2 4.9 2 6V20C2 21.1 2.9 22 4 22H18C19.1 22 20 21.1 20 20V13"/><path d="M18.5 2.5C19.3 1.7 20.7 1.7 21.5 2.5C22.3 3.3 22.3 4.7 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 6H21M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6H19Z" fill="currentColor" opacity="0.1"/></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"/></svg>,
  pencil: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M17 3C17.5 2.5 18.2 2.2 19 2.2C19.8 2.2 20.5 2.5 21 3C21.5 3.5 21.8 4.2 21.8 5C21.8 5.8 21.5 6.5 21 7L7.5 20.5L2 22L3.5 16.5L17 3Z" fill="currentColor" opacity="0.1"/></svg>,
  camera: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="currentColor" opacity="0.1"/><circle cx="12" cy="13" r="4"/></svg>,
  image: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.1"/><path d="M12 16V12M12 8H12.01"/></svg>,
};

const PersonIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <circle cx="12" cy="7" r="3.5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5.5 21C5.5 16.5 8 13 12 13S18.5 16.5 18.5 21" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ==================== TYPES ====================
interface Bed { id: string; type: string; name: string; loc: string; cap: number; }
interface LinenItem { id: string; n: string; p: number; d: number; }
interface ServiceBedConfig { id: string; type: string; name: string; isDefault: boolean; }
interface Service { 
  id: string; 
  date: string; 
  time: string; 
  op: string; 
  guests: number; 
  edit: boolean; 
  bedsConfig: ServiceBedConfig[]; 
  isModified: boolean; 
  status?: 'confirmed' | 'pending';
  // Campi aggiuntivi per EditCleaningModal
  propertyId?: string;
  propertyName?: string;
  scheduledTime?: string;
  guestsCount?: number;
  notes?: string;
  price?: number;
  serviceType?: string;
  serviceTypeName?: string;
  sgrossoReason?: string;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  contractPrice?: number;
  priceModified?: boolean;
  priceChangeReason?: string;
  originalDate?: Date;
  dateModifiedAt?: Date;
  // Campi per pulizie completate
  photos?: string[];
  startedAt?: any;
  completedAt?: any;
  // Campi per valutazione
  ratingScore?: any;
  ratingId?: string;
  ratingNotes?: string;
  extraServices?: {name: string; price: number}[];
  // 🔧 FIX: Campi per biancheria personalizzata
  customLinenConfig?: any;
  linenConfigModified?: boolean;
}
interface GuestConfig { beds: string[]; bl: Record<string, Record<string, number>>; ba: Record<string, number>; ki: Record<string, number>; ex: Record<string, boolean>; }
interface Operator { id: string; name: string; phone: string; email: string; rating: number; services: number; primary: boolean; }
interface UpcomingCleaning { id: string; date: string; time: string; op: string; guests: number; }
interface MonthlyStat { month: string; services: number; revenue: number; }
interface PropertyData { id: string; name: string; addr: string; apartment?: string; floor?: string; intercom?: string; city?: string; postalCode?: string; cleanPrice: number; maxGuests: number; bathrooms: number; bedrooms: number; checkIn: string; checkOut: string; icalAirbnb?: string; icalBooking?: string; icalOktorate?: string; icalInreception?: string; icalKrossbooking?: string; doorCode?: string; keysLocation?: string; accessNotes?: string; images?: { door?: string; building?: string; }; ownerId?: string; }
interface ICalLinks { icalAirbnb: string; icalBooking: string; icalOktorate: string; icalInreception: string; icalKrossbooking: string; }

// ==================== ALGORITMO GENERAZIONE LETTI AUTOMATICA ====================
/**
 * Genera automaticamente la configurazione letti basandosi su:
 * - maxGuests: numero massimo di ospiti
 * - bedrooms: numero di camere da letto
 * 
 * Logica:
 * 1. Per ogni camera da letto → 1 letto matrimoniale (2 posti)
 * 2. Se ospiti rimanenti >= 2 → aggiungi divano letto (2 posti)
 * 3. Se ospiti rimanenti = 1 → aggiungi letto singolo
 * 4. Se ancora ospiti rimanenti → aggiungi letto a castello (2 posti)
 */
function generateAutoBeds(maxGuests: number, bedrooms: number): Bed[] {
  const generatedBeds: Bed[] = [];
  let remainingGuests = maxGuests;
  let bedId = 1;
  
  // 1. Aggiungi un matrimoniale per ogni camera
  for (let i = 0; i < bedrooms && remainingGuests > 0; i++) {
    generatedBeds.push({
      id: `b${bedId++}`,
      type: 'matr',
      name: 'Matrimoniale',
      loc: `Camera ${i + 1}`,
      cap: 2
    });
    remainingGuests -= 2;
  }
  
  // 2. Se rimangono ospiti, aggiungi divano letto in soggiorno
  if (remainingGuests >= 2) {
    generatedBeds.push({
      id: `b${bedId++}`,
      type: 'divano',
      name: 'Divano Letto',
      loc: 'Soggiorno',
      cap: 2
    });
    remainingGuests -= 2;
  }
  
  // 3. Se rimane 1 ospite, aggiungi singolo
  if (remainingGuests === 1) {
    generatedBeds.push({
      id: `b${bedId++}`,
      type: 'sing',
      name: 'Singolo',
      loc: bedrooms > 1 ? 'Cameretta' : 'Camera',
      cap: 1
    });
    remainingGuests -= 1;
  }
  
  // 4. Se ancora rimangono ospiti, aggiungi letti a castello
  while (remainingGuests >= 2) {
    generatedBeds.push({
      id: `b${bedId++}`,
      type: 'castello',
      name: 'Letto a Castello',
      loc: 'Cameretta',
      cap: 2
    });
    remainingGuests -= 2;
  }
  
  // Se ancora rimane 1, aggiungi un altro singolo
  if (remainingGuests === 1) {
    generatedBeds.push({
      id: `b${bedId++}`,
      type: 'sing',
      name: 'Singolo',
      loc: 'Cameretta',
      cap: 1
    });
  }
  
  return generatedBeds;
}

// ==================== CALCOLO BIANCHERIA PER TIPO LETTO ====================
/**
 * Calcola la biancheria necessaria per ogni tipo di letto
 * 
 * REGOLE (confermate dall'utente):
 * - Matrimoniale: 3 lenzuola matrimoniali + 2 federe
 * - Singolo: 3 lenzuola singole + 1 federa
 * 
 * ARTICOLI INVENTARIO:
 * - "Lenzuolo Matrimoniale" o simile (contiene "matr")
 * - "Lenzuolo Singolo" o simile (contiene "sing")  
 * - "Federa"
 * 
 * Derivati:
 * - Divano Letto: come matrimoniale (3 lenz matr + 2 federe)
 * - Castello: 2 × singolo (6 lenz sing + 2 federe)
 */
interface LinenRequirementByType {
  lenzuoloMatrimoniale: number;
  lenzuoloSingolo: number;
  federa: number;
}

function getLinenForBedType(bedType: string): LinenRequirementByType {
  switch (bedType) {
    case 'matr':
      // Matrimoniale: 2 lenzuola matrimoniali + 2 federe
      return { lenzuoloMatrimoniale: 2, lenzuoloSingolo: 0, federa: 2 };
    
    case 'sing':
      // Singolo: 2 lenzuola singole + 1 federa
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 2, federa: 1 };
    
    case 'divano':
      // Divano letto: come matrimoniale
      return { lenzuoloMatrimoniale: 2, lenzuoloSingolo: 0, federa: 2 };
    
    case 'castello':
      // Castello: 2 letti singoli = 4 lenzuola singole + 2 federe
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 4, federa: 2 };
    
    default:
      // Default: come singolo
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 2, federa: 1 };
  }
}

/**
 * Calcola il totale biancheria per una lista di letti selezionati
 */
function calculateTotalLinenForBeds(selectedBeds: Bed[]): LinenRequirementByType {
  const total: LinenRequirementByType = { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 0, federa: 0 };
  
  selectedBeds.forEach(bed => {
    const req = getLinenForBedType(bed.type);
    total.lenzuoloMatrimoniale += req.lenzuoloMatrimoniale;
    total.lenzuoloSingolo += req.lenzuoloSingolo;
    total.federa += req.federa;
  });
  
  return total;
}

/**
 * Mappa i requisiti biancheria agli ID degli articoli dell'inventario
 * Cerca articoli per nome (case insensitive, partial match)
 */
function mapLinenToInventoryItems(
  linenReq: LinenRequirementByType, 
  inventoryItems: LinenItem[]
): Record<string, number> {
  const result: Record<string, number> = {};
  
  // Funzione helper per cercare articoli
  const findItem = (keywords: string[]): LinenItem | undefined => {
    return inventoryItems.find(item => {
      const name = (item.n || '').toLowerCase();
      const id = (item.id || '').toLowerCase();
      return keywords.some(kw => name.includes(kw.toLowerCase()) || id.includes(kw.toLowerCase()));
    });
  };
  
  // Cerca lenzuolo matrimoniale
  const lenzMatr = findItem(['matrimoniale', 'matr', 'lenz_matr', 'lenzuolo_matr']);
  if (lenzMatr && linenReq.lenzuoloMatrimoniale > 0) {
    result[lenzMatr.id] = linenReq.lenzuoloMatrimoniale;
  }
  
  // Cerca lenzuolo singolo
  const lenzSing = findItem(['singolo', 'sing', 'lenz_sing', 'lenzuolo_sing']);
  if (lenzSing && linenReq.lenzuoloSingolo > 0) {
    result[lenzSing.id] = linenReq.lenzuoloSingolo;
  }
  
  // Cerca federa
  const federa = findItem(['federa', 'federe']);
  if (federa && linenReq.federa > 0) {
    result[federa.id] = linenReq.federa;
  }
  
  return result;
}

// ==================== CALCOLO BIANCHERIA BAGNO ====================
/**
 * Calcola la biancheria bagno necessaria
 * 
 * REGOLE:
 * - Per OSPITE: 1 telo corpo, 1 telo viso, 1 telo bidet
 * - Per BAGNO: 1 scendi bagno
 */
interface BathRequirement {
  teloCorpo: number;
  teloViso: number;
  teloBidet: number;
  scendiBagno: number;
}

function calculateBathLinen(guestsCount: number, bathroomsCount: number): BathRequirement {
  return {
    teloCorpo: guestsCount,      // 1 per ospite
    teloViso: guestsCount,       // 1 per ospite
    teloBidet: guestsCount,      // 1 per ospite
    scendiBagno: bathroomsCount  // 1 per bagno
  };
}

/**
 * Mappa i requisiti biancheria bagno agli ID degli articoli dell'inventario
 */
function mapBathToInventoryItems(
  bathReq: BathRequirement,
  inventoryItems: LinenItem[]
): Record<string, number> {
  const result: Record<string, number> = {};
  
  // Funzione helper per cercare articoli
  const findItem = (keywords: string[]): LinenItem | undefined => {
    return inventoryItems.find(item => {
      const name = (item.n || '').toLowerCase();
      const id = (item.id || '').toLowerCase();
      return keywords.some(kw => name.includes(kw.toLowerCase()) || id.includes(kw.toLowerCase()));
    });
  };
  
  // Cerca telo corpo (anche "telo doccia", "asciugamano grande")
  const teloCorpo = findItem(['telo corpo', 'telo_corpo', 'telocorpo', 'telo doccia', 'asciugamano grande']);
  if (teloCorpo && bathReq.teloCorpo > 0) {
    result[teloCorpo.id] = bathReq.teloCorpo;
  }
  
  // Cerca telo viso (anche "asciugamano viso", "asciugamano piccolo")
  const teloViso = findItem(['telo viso', 'telo_viso', 'teloviso', 'asciugamano viso']);
  if (teloViso && bathReq.teloViso > 0) {
    result[teloViso.id] = bathReq.teloViso;
  }
  
  // Cerca telo bidet
  const teloBidet = findItem(['telo bidet', 'telo_bidet', 'telobidet', 'bidet']);
  if (teloBidet && bathReq.teloBidet > 0) {
    result[teloBidet.id] = bathReq.teloBidet;
  }
  
  // Cerca scendi bagno (anche "tappetino", "scendidoccia")
  const scendiBagno = findItem(['scendi bagno', 'scendi_bagno', 'scendibagno', 'tappetino', 'scendidoccia', 'bathMats', 'bath_mats', 'bathmats']);
  if (scendiBagno && bathReq.scendiBagno > 0) {
    result[scendiBagno.id] = bathReq.scendiBagno;
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════
// 🆕 VALIDAZIONE MINIMO BIANCHERIA PER LETTI (2 lenzuola per letto)
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

  // Helper per ottenere quantità da bl (supporta formato 'all' e formato per-letto)
  const getQty = (itemId: string): number => {
    if (!bl) return 0;
    // Formato 'all'
    if (bl['all'] && bl['all'][itemId]) {
      return bl['all'][itemId];
    }
    // Formato per-letto (somma da tutte le chiavi)
    let total = 0;
    Object.entries(bl).forEach(([key, items]) => {
      if (key !== 'all' && items && typeof items === 'object' && items[itemId]) {
        total += items[itemId];
      }
    });
    return total;
  };

  invLinen.forEach(item => {
    const qty = getQty(item.id);
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

/**
 * Genera la configurazione di default per un numero di ospiti
 * basandosi sui letti della proprietà e numero bagni
 */
function generateDefaultConfig(
  guestsCount: number, 
  propertyBeds: Bed[], 
  bathroomsCount: number = 1,
  inventoryLinen: LinenItem[] = [],
  inventoryBath: LinenItem[] = []
): GuestConfig {
  // Seleziona i letti necessari per coprire gli ospiti
  const selectedBeds: string[] = [];
  let remainingGuests = guestsCount;
  
  for (const bed of propertyBeds) {
    if (remainingGuests <= 0) break;
    selectedBeds.push(bed.id);
    remainingGuests -= bed.cap;
  }
  
  // 🔥 FIX: Calcola biancheria totale e salvala con chiave 'all'
  const selectedBedsData = propertyBeds.filter(b => selectedBeds.includes(b.id));
  const linenReq = calculateTotalLinenForBeds(selectedBedsData);
  const mappedLinen = mapLinenToInventoryItems(linenReq, inventoryLinen);
  
  // Usa formato unificato con chiave 'all'
  const bl: Record<string, Record<string, number>> = {
    'all': mappedLinen
  };
  
  // Calcola biancheria BAGNO
  const bathReq = calculateBathLinen(guestsCount, bathroomsCount);
  const mappedBath = mapBathToInventoryItems(bathReq, inventoryBath);
  
  // Kit cortesia: vuoto (utente configura manualmente)
  const ki: Record<string, number> = {};
  
  // Extra: tutti a false
  const ex: Record<string, boolean> = {};
  
  return { beds: selectedBeds, bl, ba: mappedBath, ki, ex };
}

/**
 * Genera tutte le configurazioni per ogni numero di ospiti (1 a maxGuests)
 */
function generateAllConfigs(
  maxGuests: number, 
  propertyBeds: Bed[], 
  bathroomsCount: number = 1,
  inventoryLinen: LinenItem[] = [],
  inventoryBath: LinenItem[] = []
): Record<number, GuestConfig> {
  const configs: Record<number, GuestConfig> = {};
  
  for (let i = 1; i <= maxGuests; i++) {
    configs[i] = generateDefaultConfig(i, propertyBeds, bathroomsCount, inventoryLinen, inventoryBath);
  }
  
  return configs;
}

// ==================== DATA ====================
// I letti ora sono dinamici e vengono caricati/generati nel componente
let beds: Bed[] = [];

// Articoli di default (vuoti - verranno caricati dall'inventario)
let linen: Record<string, LinenItem[]> = { matr: [], sing: [], divano: [] };
let bathItems: LinenItem[] = [];
let kitItems: LinenItem[] = [];
let extras: { id: string; n: string; p: number; desc: string }[] = [];

const servicesData: Service[] = [];

const monthlyStats: MonthlyStat[] = [
  { month: 'Feb', services: 6, revenue: 520 }, { month: 'Mar', services: 8, revenue: 720 }, { month: 'Apr', services: 10, revenue: 890 },
  { month: 'Mag', services: 12, revenue: 1080 }, { month: 'Giu', services: 14, revenue: 1250 }, { month: 'Lug', services: 18, revenue: 1620 },
  { month: 'Ago', services: 20, revenue: 1800 }, { month: 'Set', services: 15, revenue: 1350 }, { month: 'Ott', services: 12, revenue: 1080 },
  { month: 'Nov', services: 10, revenue: 950 }, { month: 'Dic', services: 15, revenue: 1420 }, { month: 'Gen', services: 5, revenue: 571 },
];

const operators: Operator[] = [];

const prop: PropertyData = { id: 'prop1', name: 'Proprietà', addr: '', apartment: '', floor: '', intercom: '', city: '', postalCode: '', cleanPrice: 65, maxGuests: 4, bathrooms: 1, bedrooms: 1, checkIn: '15:00', checkOut: '10:00' };

// ==================== UTILITY FUNCTIONS ====================

// Formatta i prezzi con massimo 2 decimali
const formatPrice = (price: number): string => {
  // Se è un numero intero, mostra senza decimali
  if (Number.isInteger(price)) return price.toString();
  // Altrimenti mostra con max 2 decimali
  return price.toFixed(2);
};

// Funzione dinamica che usa i letti correnti
const genCfgDynamic = (g: number, currentBeds: Bed[]): GuestConfig => {
  const sel: string[] = []; let rem = g;
  currentBeds.forEach(bed => { if (rem > 0) { sel.push(bed.id); rem -= bed.cap; } });
  const bl: Record<string, Record<string, number>> = {};
  sel.forEach(id => { const b = currentBeds.find(x => x.id === id); bl[id] = {}; (linen[b?.type || ''] || []).forEach(i => { bl[id][i.id] = i.d; }); });
  const ba: Record<string, number> = {}, ki: Record<string, number> = {}, ex: Record<string, boolean> = {};
  bathItems.forEach(i => { ba[i.id] = i.d * g; }); kitItems.forEach(i => { ki[i.id] = i.d * g; }); extras.forEach(i => { ex[i.id] = false; });
  return { beds: sel, bl, ba, ki, ex };
};

const genCfg = (g: number): GuestConfig => genCfgDynamic(g, beds);

const initCfgsDynamic = (maxGuests: number, currentBeds: Bed[]): Record<number, GuestConfig> => { 
  const c: Record<number, GuestConfig> = {}; 
  for (let i = 1; i <= maxGuests; i++) c[i] = genCfgDynamic(i, currentBeds); 
  return c; 
};

const initCfgs = (): Record<number, GuestConfig> => { const c: Record<number, GuestConfig> = {}; for (let i = 1; i <= 7; i++) c[i] = genCfg(i); return c; };
// 🔥 FIX: Supporta sia formato 'all' che vecchio formato bedId
// 🔧 FIX: Calcola prezzo biancheria letto - USA SEMPRE 'all' SE PRESENTE
const calcBL = (bl: Record<string, Record<string, number>>, inventoryLinen: LinenItem[] = []): number => { 
  let t = 0; 
  
  // Controlla se 'all' esiste e ha valori
  const hasAll = bl['all'] && typeof bl['all'] === 'object' && Object.keys(bl['all']).length > 0;
  
  if (hasAll) {
    // USA SOLO 'all' - contiene i totali configurati dall'utente
    Object.entries(bl['all']).forEach(([itemId, qty]) => {
      const item = inventoryLinen.find(i => i.id === itemId);
      if (item && qty > 0) {
        t += item.p * qty;
      }
    });
  } else {
    // Fallback: somma dai gruppi letto (escludendo 'all')
    Object.entries(bl).forEach(([key, items]) => { 
      if (key !== 'all') {
        // Vecchio formato: bedId -> items
        const b = beds.find(x => x.id === key); 
        (linen[b?.type || ''] || []).forEach(i => { t += i.p * (items[i.id] || 0); }); 
      }
    }); 
  }
  
  return t; 
};
const calcArr = (obj: Record<string, number | boolean>, arr: { id: string; p: number }[]): number => Object.entries(obj).reduce((t, [id, q]) => { const i = arr.find(x => x.id === id); return t + (i ? i.p * (typeof q === 'boolean' ? (q ? 1 : 0) : q) : 0); }, 0);
const calcCapDynamic = (ids: string[], currentBeds: Bed[]): number => ids.reduce((t, id) => t + (currentBeds.find(b => b.id === id)?.cap || 0), 0);
const calcCap = (ids: string[]): number => calcCapDynamic(ids, beds);
const getBedIcon = (type: string) => { switch(type) { case 'matr': return I.bedDouble; case 'sing': return I.bedSingle; case 'divano': return I.sofa; case 'castello': return I.bunk; default: return I.bed; } };
const getBedLabel = (type: string) => { switch(type) { case 'matr': return 'Matr.'; case 'sing': return 'Sing.'; case 'divano': return 'Divano'; case 'castello': return 'Castello'; default: return 'Letto'; } };

// ==================== SMALL COMPONENTS ====================
const Cnt = ({ v, onChange }: { v: number; onChange: (v: number) => void }) => (
  <div className="flex items-center gap-1">
    <button onClick={() => onChange(Math.max(0, v - 1))} className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center active:scale-95"><div className="w-3.5 h-3.5 text-slate-500">{I.minus}</div></button>
    <span className="w-6 text-center text-sm font-semibold">{v}</span>
    <button onClick={() => onChange(v + 1)} className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center active:scale-95"><div className="w-3.5 h-3.5 text-white">{I.plus}</div></button>
  </div>
);

const Section = ({ title, icon, price, expanded, onToggle, children }: { title: string; icon: React.ReactNode; price: number; expanded: boolean; onToggle: () => void; children: React.ReactNode; }) => {
  return (
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
      <div className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">{children}</div>
      </div>
    </div>
  );
};

const MiniChart = ({ data }: { data: MonthlyStat[] }) => {
  const maxVal = Math.max(...data.map(d => d.revenue));
  return (<div className="flex items-end gap-1 h-20">{data.map((d, i) => (<div key={i} className="flex-1 flex flex-col items-center gap-1"><div className="w-full bg-gradient-to-t from-slate-300 to-slate-200 rounded-t hover:from-slate-400 hover:to-slate-300 cursor-pointer" style={{ height: `${(d.revenue / maxVal) * 100}%`, minHeight: '4px' }} title={`${d.month}: €${d.revenue}`} /><span className="text-[7px] text-slate-400 font-medium">{d.month.substring(0, 1)}</span></div>))}</div>);
};

const GuestSelector = ({ value, onChange, max = 7 }: { value: number; onChange: (n: number) => void; max?: number }) => {
  return (
    <div className="bg-slate-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500">Seleziona numero ospiti</span>
        <span className="text-base font-bold text-slate-800">{value} {value === 1 ? 'ospite' : 'ospiti'}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`flex-1 flex flex-col items-center py-1.5 rounded-lg transition-all active:scale-95 ${
              n === value
                ? 'bg-slate-800 shadow-lg'
                : 'bg-white border border-slate-200'
            }`}
          >
            <div className={`w-4 h-4 mb-0.5 ${n === value ? 'text-white' : n <= value ? 'text-slate-600' : 'text-slate-300'}`}>
              <PersonIcon filled={n <= value} />
            </div>
            <span className={`text-[10px] font-bold ${n === value ? 'text-white' : 'text-slate-600'}`}>{n}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ==================== ICAL CONFIG MODAL ====================
function ICalConfigModal({
  icalLinks,
  propertyId,
  onClose,
  onSave,
}: {
  icalLinks: ICalLinks;
  propertyId?: string;
  onClose: () => void;
  onSave: (links: ICalLinks) => void;
}) {
  const [airbnb, setAirbnb] = useState(icalLinks.icalAirbnb || "");
  const [booking, setBooking] = useState(icalLinks.icalBooking || "");
  const [oktorate, setOktorate] = useState(icalLinks.icalOktorate || "");
  const [inreception, setInreception] = useState(icalLinks.icalInreception || "");
  const [krossbooking, setKrossbooking] = useState(icalLinks.icalKrossbooking || "");
  const [showSuccess, setShowSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedOta, setExpandedOta] = useState<string | null>(null);
  
  // 🔥 NUOVO: Stato per conferma eliminazione prenotazioni
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [removedSources, setRemovedSources] = useState<{source: string; name: string; count: number}[]>([]);
  const [deleteBookings, setDeleteBookings] = useState<Record<string, boolean>>({});

  const otaConfig = [
    { id: "airbnb", name: "Airbnb", desc: "Link iCal di Airbnb", value: airbnb, setValue: setAirbnb, color: "from-red-500 to-red-600", icon: "🏠", fieldName: "icalAirbnb" },
    { id: "booking", name: "Booking.com", desc: "Link iCal di Booking.com", value: booking, setValue: setBooking, color: "from-blue-500 to-blue-600", icon: "📘", fieldName: "icalBooking" },
    { id: "oktorate", name: "Oktorate", desc: "Link iCal di Oktorate", value: oktorate, setValue: setOktorate, color: "from-purple-500 to-purple-600", icon: "📱", fieldName: "icalOktorate" },
    { id: "inreception", name: "InReception", desc: "Link iCal di InReception", value: inreception, setValue: setInreception, color: "from-green-500 to-green-600", icon: "🔔", fieldName: "icalInreception" },
    { id: "krossbooking", name: "KrossBooking", desc: "Link iCal di KrossBooking", value: krossbooking, setValue: setKrossbooking, color: "from-orange-500 to-orange-600", icon: "🗓️", fieldName: "icalKrossbooking" },
  ];

  // 🔥 Funzione per controllare link rimossi e contare prenotazioni
  const checkRemovedLinks = async () => {
    if (!propertyId) return [];
    
    const removed: {source: string; name: string; count: number}[] = [];
    
    // Controlla quali link sono stati rimossi
    const checks = [
      { old: icalLinks.icalAirbnb, new: airbnb, source: 'airbnb', name: 'Airbnb' },
      { old: icalLinks.icalBooking, new: booking, source: 'booking', name: 'Booking.com' },
      { old: icalLinks.icalOktorate, new: oktorate, source: 'oktorate', name: 'Oktorate' },
      { old: icalLinks.icalInreception, new: inreception, source: 'inreception', name: 'InReception' },
      { old: icalLinks.icalKrossbooking, new: krossbooking, source: 'krossbooking', name: 'KrossBooking' },
    ];
    
    for (const check of checks) {
      // Link rimosso = aveva valore prima, ora è vuoto
      if (check.old && check.old.trim() && (!check.new || !check.new.trim())) {
        try {
          // Conta prenotazioni per questa fonte
          const res = await fetch(`/api/bookings/count?propertyId=${propertyId}&source=${check.source}`);
          const data = await res.json();
          if (data.count > 0) {
            removed.push({ source: check.source, name: check.name, count: data.count });
          }
        } catch (e) {
          console.warn(`Errore conteggio prenotazioni ${check.source}:`, e);
        }
      }
    }
    
    return removed;
  };

  const handleSave = async () => {
    setSaving(true);
    
    // 🔥 Prima controlla se ci sono link rimossi con prenotazioni
    const removed = await checkRemovedLinks();
    
    if (removed.length > 0) {
      // Mostra dialog di conferma
      setRemovedSources(removed);
      // Default: NON eliminare (mantieni prenotazioni)
      const defaultDelete: Record<string, boolean> = {};
      removed.forEach(r => { defaultDelete[r.source] = false; });
      setDeleteBookings(defaultDelete);
      setShowDeleteConfirm(true);
      setSaving(false);
      return;
    }
    
    // Nessun link rimosso con prenotazioni - procedi normalmente
    await doSave([]);
  };
  
  const doSave = async (sourcesToDelete: string[]) => {
    setSaving(true);
    const newLinks: ICalLinks = { icalAirbnb: airbnb, icalBooking: booking, icalOktorate: oktorate, icalInreception: inreception, icalKrossbooking: krossbooking };
    
    if (propertyId) {
      try {
        // 🔥 Se ci sono fonti da cui eliminare prenotazioni, prima elimina
        if (sourcesToDelete.length > 0) {
          for (const source of sourcesToDelete) {
            try {
              await fetch(`/api/bookings/delete-by-source`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ propertyId, source }),
              });
            } catch (e) {
              console.error(`❌ Errore eliminazione prenotazioni ${source}:`, e);
            }
          }
        }
        
        const response = await fetch(`/api/properties/${propertyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newLinks),
        });
        if (!response.ok) {
          console.error("Failed to save iCal links");
          setSaving(false);
          return;
        }
        
        // 🚀 Sync iCal in BACKGROUND - non blocca la chiusura della modal
        const hasAnyLink = airbnb || booking || oktorate || inreception || krossbooking;
        if (hasAnyLink) {
          // Fire-and-forget: non aspettiamo la risposta
          fetch(`/api/properties/${propertyId}/sync-ical?forceSync=true`, {
            method: "POST",
          }).then(async (syncResponse) => {
            const syncData = await syncResponse.json();
          }).catch((syncError) => {
            console.warn("⚠️ Sync background fallito (verrà ritentato dal cron):", syncError);
          });
        }
        
      } catch (error) {
        console.error("Error saving iCal links:", error);
        setSaving(false);
        return;
      }
    }
    // ✅ Chiude subito la modal senza aspettare il sync
    onSave(newLinks);
    setSaving(false);
    setShowSuccess(true);
  };

  // 🔥 Dialog conferma eliminazione prenotazioni
  if (showDeleteConfirm) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold text-center mb-2">Link Rimossi</h2>
          <p className="text-sm text-slate-500 text-center mb-4">
            Hai rimosso alcuni link iCal. Cosa vuoi fare con le prenotazioni esistenti?
          </p>
          
          <div className="space-y-3 mb-6">
            {removedSources.map(src => (
              <div key={src.source} className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-700">{src.name}</span>
                  <span className="text-sm text-slate-500">{src.count} prenotazioni</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteBookings(prev => ({ ...prev, [src.source]: false }))}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      !deleteBookings[src.source]
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    ✓ Mantieni
                  </button>
                  <button
                    onClick={() => setDeleteBookings(prev => ({ ...prev, [src.source]: true }))}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      deleteBookings[src.source]
                        ? 'bg-red-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    🗑️ Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-3 bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl"
            >
              Annulla
            </button>
            <button
              onClick={() => {
                const toDelete = Object.entries(deleteBookings)
                  .filter(([, del]) => del)
                  .map(([source]) => source);
                setShowDeleteConfirm(false);
                doSave(toDelete);
              }}
              disabled={saving}
              className="flex-1 py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
            >
              {saving ? "Salvataggio..." : "Conferma"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center"><div className="w-8 h-8 text-emerald-600">{I.check}</div></div>
          <h2 className="text-lg font-semibold text-center mb-2">Link Salvati</h2>
          <p className="text-sm text-slate-500 text-center mb-6">I link iCal sono stati aggiornati con successo. La sincronizzazione inizierà automaticamente.</p>
          <button onClick={onClose} className="w-full py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl active:scale-[0.98]">Chiudi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex-shrink-0 bg-white pt-12 px-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Configura Link iCal</h2>
            <p className="text-xs text-slate-500">Aggiungi i link di sincronizzazione da Airbnb, Booking e altri OTA</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-95 active:bg-slate-200">
            <div className="w-5 h-5 text-slate-500">{I.close}</div>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-2">
          {otaConfig.map((ota) => (
            <div key={ota.id} className={`rounded-xl border overflow-hidden transition-all ${expandedOta === ota.id ? "border-slate-300 shadow-sm" : "border-slate-200"} bg-white`}>
              <button onClick={() => setExpandedOta(expandedOta === ota.id ? null : ota.id)} className="w-full px-4 py-3 flex items-center justify-between active:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${ota.color} flex items-center justify-center text-xl`}>{ota.icon}</div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-800">{ota.name}</p>
                    <p className="text-xs text-slate-500">{ota.value ? "✓ Configurato" : "Non configurato"}</p>
                  </div>
                </div>
                <div className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expandedOta === ota.id ? "rotate-180" : ""}`}>{I.down}</div>
              </button>
              <div className={`overflow-hidden transition-all duration-200 ${expandedOta === ota.id ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 space-y-2">
                  <p className="text-xs text-slate-600 mb-2">Incolla il link iCal di {ota.name} qui sotto:</p>
                  <textarea value={ota.value} onChange={(e) => ota.setValue(e.target.value)} placeholder={`Es: https://www.airbnb.com/calendar/ical/...`} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:border-blue-400 focus:outline-none text-xs font-mono resize-none" rows={4} />
                  {ota.value && (<button onClick={() => ota.setValue("")} className="w-full py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 active:scale-95">Rimuovi Link</button>)}
                  <p className="text-[10px] text-slate-500 italic">Dove trovarlo: Accedi a {ota.name}, vai alle impostazioni calendario e copia l'URL iCal</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700"><strong>💡 Suggerimento:</strong> Una volta aggiunto un link, il sistema sincronizzerà automaticamente le prenotazioni dal calendario dell'OTA.</p>
        </div>
        <div className="h-4"></div>
      </div>
      <div className="flex-shrink-0 px-4 pt-3 pb-20 border-t border-slate-200 bg-white">
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl active:scale-[0.98]">Annulla</button>
          <button onClick={handleSave} disabled={saving || (!airbnb && !booking && !oktorate && !inreception && !krossbooking)} className={`flex-1 py-3 text-white text-sm font-semibold rounded-xl active:scale-[0.98] transition-all ${saving || (!airbnb && !booking && !oktorate && !inreception && !krossbooking) ? "bg-slate-400 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-blue-700"}`}>{saving ? "Salvataggio..." : "Salva Link"}</button>
        </div>
      </div>
    </div>
  );
}

// ==================== CONFIG MODAL ====================
function CfgModal({ cfgs, setCfgs, onClose, onSave, maxGuests = 7, propertyBeds = [], submitLabel = 'Salva Configurazione', embedded = false, onBack, preloadedLinen, preloadedBath, preloadedKit, preloadedExtras }: { 
  cfgs: Record<number, GuestConfig>; 
  setCfgs: React.Dispatch<React.SetStateAction<Record<number, GuestConfig>>>; 
  onClose: () => void;
  onSave: (configs: Record<number, GuestConfig>) => void | Promise<void>;
  maxGuests?: number;
  propertyBeds?: Bed[];
  submitLabel?: string;
  embedded?: boolean;
  onBack?: () => void;
  preloadedLinen?: LinenItem[];
  preloadedBath?: LinenItem[];
  preloadedKit?: LinenItem[];
  preloadedExtras?: { id: string; n: string; p: number; desc: string }[];
}) {
  // Inizializza g con un valore valido (minimo tra 4 e maxGuests, o 1 se maxGuests < 1)
  const initialG = Math.min(4, maxGuests) || 1;
  const [g, setG] = useState(initialG);
  const [sec, setSec] = useState<string | null>('beds');
  const [loading, setLoading] = useState(true);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  // State per articoli caricati dall'inventario
  const [invLinen, setInvLinen] = useState<LinenItem[]>([]);
  const [invBath, setInvBath] = useState<LinenItem[]>([]);
  const [invKit, setInvKit] = useState<LinenItem[]>([]);
  const [invExtras, setInvExtras] = useState<{ id: string; n: string; p: number; desc: string }[]>([]);

  // Usa propertyBeds passati come prop, o fallback a variabile globale
  const currentBeds = propertyBeds.length > 0 ? propertyBeds : beds;
  
  // 🔍 DEBUG: Log all'apertura della modal
  useEffect(() => {
    Object.entries(cfgs).forEach(([guests, cfg]) => {
    });
  }, []);


  // Carica articoli dall'inventario (skip se precaricati)
  useEffect(() => {
    if (preloadedLinen && preloadedLinen.length > 0) {
      setInvLinen(preloadedLinen);
      if (preloadedBath) setInvBath(preloadedBath);
      if (preloadedKit) setInvKit(preloadedKit);
      if (preloadedExtras) setInvExtras(preloadedExtras);
      setLoading(false);
      return;
    }
    async function loadInventory() {
      try {
        const res = await fetch('/api/inventory/list');
        const data = await res.json();
        
        const linenItems: LinenItem[] = [];
        const bathItemsLoaded: LinenItem[] = [];
        const kitItemsLoaded: LinenItem[] = [];
        const extrasLoaded: { id: string; n: string; p: number; desc: string }[] = [];

        data.categories?.forEach((cat: any) => {
          cat.items?.forEach((item: any) => {
            const mapped = { id: item.key || item.id, n: item.name, p: item.sellPrice || 0, d: 1 };
            
            if (cat.id === 'biancheria_letto') {
              linenItems.push(mapped);
            } else if (cat.id === 'biancheria_bagno') {
              bathItemsLoaded.push(mapped);
            } else if (cat.id === 'kit_cortesia') {
              kitItemsLoaded.push(mapped);
            } else if (cat.id === 'servizi_extra') {
              extrasLoaded.push({ ...mapped, desc: item.description || '' });
            }
          });
        });
        
        setInvLinen(linenItems);
        setInvBath(bathItemsLoaded);
        setInvKit(kitItemsLoaded);
        setInvExtras(extrasLoaded);
      } catch (err) {
        console.error('Errore caricamento inventario:', err);
      } finally {
        setLoading(false);
      }
    }
    loadInventory();
  }, []);

  // Protezione: se cfgs[g] non esiste, usa un default vuoto
  const c = cfgs[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} };
  const selectedBedIds = c.beds || [];
  const selectedBedsData = currentBeds.filter(b => selectedBedIds.includes(b.id));
  const totalCap = selectedBedsData.reduce((sum, b) => sum + (b.cap || (b.type === 'sing' ? 1 : 2)), 0);
  const warn = totalCap < g;
  
  // 🔍 DEBUG: Verifica matching ID letti
  if (selectedBedIds.length > 0 && selectedBedsData.length === 0) {
    console.warn("⚠️ MISMATCH ID LETTI!");
    console.warn("   selectedBedIds dalla config:", selectedBedIds);
    console.warn("   currentBeds IDs disponibili:", currentBeds.map(b => b.id));
    console.warn("   Nessun match trovato!");
  }
  
  // 🆕 VALIDAZIONE MINIMO LENZUOLA (2 per letto) E FEDERE (1 per ospite)
  const linenValidation = validateLinenForBeds(selectedBedsData, c.bl, invLinen, g);
  
  // Usa articoli inventario o fallback
  const currentBath = invBath.length > 0 ? invBath : bathItems;
  const currentKit = invKit.length > 0 ? invKit : kitItems;
  const currentExtras = invExtras.length > 0 ? invExtras : extras;

  // 🔥 FIX: Ricalcola automaticamente la biancheria quando:
  // 1. Cambia il numero di ospiti (g)
  // 2. Ci sono letti selezionati ma bl['all'] è vuoto
  // 3. L'inventario è stato caricato
  useEffect(() => {
    if (loading) return; // Aspetta che l'inventario sia caricato
    if (selectedBedsData.length === 0) return; // Nessun letto selezionato
    if (invLinen.length === 0) return; // Inventario non caricato
    
    // Controlla se c'è già biancheria configurata (sia formato 'all' che vecchio formato bedId)
    const currentBl = c.bl || {};
    let hasLinen = false;
    
    // Controlla formato 'all'
    if (currentBl['all']) {
      hasLinen = Object.values(currentBl['all']).some(v => v > 0);
    }
    
    // Controlla anche vecchio formato (bedId come chiave)
    if (!hasLinen) {
      Object.entries(currentBl).forEach(([key, items]) => {
        if (key !== 'all' && items && typeof items === 'object') {
          if (Object.values(items).some(v => v > 0)) {
            hasLinen = true;
          }
        }
      });
    }
    
    // Ricalcola SOLO se non c'è nessuna biancheria configurata
    if (!hasLinen) {
      
      // Calcola biancheria per i letti selezionati
      const linenReq = calculateTotalLinenForBeds(selectedBedsData);
      const mappedLinen = mapLinenToInventoryItems(linenReq, invLinen);
      
      // Aggiorna solo se abbiamo calcolato qualcosa
      if (Object.keys(mappedLinen).length > 0) {
        setCfgs(prev => ({
          ...prev,
          [g]: {
            ...(prev[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }),
            bl: { 'all': mappedLinen }
          }
        }));
      }
    }
  }, [g, selectedBedsData.length, invLinen.length, loading]);

  // Handler per toggle letto
  const toggleBed = (bedId: string) => {
    const bed = currentBeds.find(b => b.id === bedId);
    if (!bed) return;
    
    const isSelected = selectedBedIds.includes(bedId);
    
    setCfgs(prev => {
      const currentCfg = prev[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} };
      
      let newBeds: string[];
      const existingAll = currentCfg.bl?.['all'] ? { ...currentCfg.bl['all'] } : {};
      
      // Calcola i minimi per questo singolo letto
      const bedLinenReq = calculateTotalLinenForBeds([bed]);
      const bedMapped = mapLinenToInventoryItems(bedLinenReq, invLinen);
      
      if (isSelected) {
        newBeds = currentCfg.beds.filter(id => id !== bedId);
        Object.entries(bedMapped).forEach(([key, val]) => {
          existingAll[key] = Math.max(0, (existingAll[key] || 0) - val);
        });
      } else {
        newBeds = [...currentCfg.beds, bedId];
        Object.entries(bedMapped).forEach(([key, val]) => {
          existingAll[key] = (existingAll[key] || 0) + val;
        });
      }
      
      return {
        ...prev,
        [g]: { ...currentCfg, beds: newBeds, bl: { 'all': existingAll } }
      };
    });
  };

  // Handler per aggiornare quantità biancheria letto
  const updL = (itemId: string, v: number) => {
    setCfgs(prev => {
      const currentCfg = prev[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} };
      return {
        ...prev,
        [g]: {
          ...currentCfg,
          bl: {
            ...currentCfg.bl,
            'all': { ...(currentCfg.bl['all'] || {}), [itemId]: v }
          }
        }
      };
    });
  };

  // Handler per aggiornare biancheria bagno
  const updB = (id: string, v: number) => setCfgs(p => ({ 
    ...p, 
    [g]: { ...(p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }), ba: { ...(p[g]?.ba || {}), [id]: v } } 
  }));

  // Handler per aggiornare kit cortesia
  const updK = (id: string, v: number) => setCfgs(p => ({ 
    ...p, 
    [g]: { ...(p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }), ki: { ...(p[g]?.ki || {}), [id]: v } } 
  }));

  // Handler per toggle extra
  const togE = (id: string) => setCfgs(p => ({ 
    ...p, 
    [g]: { ...(p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }), ex: { ...(p[g]?.ex || {}), [id]: !(p[g]?.ex?.[id]) } } 
  }));

  // 🔧 Helper: Ottieni quantità di un item (supporta sia formato 'all' che vecchio formato bedId)
  const getItemQty = (itemId: string): number => {
    if (!c.bl) return 0;
    
    // Nuovo formato: usa chiave 'all'
    if (c.bl['all'] && c.bl['all'][itemId]) {
      return c.bl['all'][itemId];
    }
    
    // Vecchio formato: somma da tutte le chiavi bedId (retrocompatibilità)
    let total = 0;
    Object.entries(c.bl).forEach(([key, items]) => {
      if (key !== 'all' && items && typeof items === 'object' && items[itemId]) {
        total += items[itemId];
      }
    });
    return total;
  };

  // Calcola prezzi - usa la funzione helper per sommare da tutte le chiavi
  const bedP = invLinen.reduce((sum, item) => sum + item.p * getItemQty(item.id), 0);
  const bathP = calcArr(c.ba || {}, currentBath);
  const kitP = calcArr(c.ki || {}, currentKit);
  const exP = calcArr((c.ex || {}) as Record<string, boolean>, currentExtras);

  if (loading) {
    if (embedded) {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500"></div>
          <p className="mt-2 text-xs text-slate-400">Caricamento articoli...</p>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
        <p className="mt-3 text-slate-500">Caricamento articoli...</p>
      </div>
    );
  }

  const cfgContent = (
    <>
      <div className={embedded ? "pb-2" : "flex-shrink-0 bg-white pt-12 px-4 pb-3 border-b border-slate-100"}>
        <div className="flex items-center justify-between mb-3">
          <div>
            {embedded && onBack && (
              <button onClick={onBack} className="flex items-center gap-1 text-xs text-sky-600 font-semibold mb-1 hover:text-sky-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Torna alle stanze
              </button>
            )}
            <h2 className={embedded ? "text-[15px] font-bold text-slate-800" : "text-lg font-bold text-slate-800"}>Configurazione Dotazioni</h2>
            <p className="text-[11px] text-slate-400">Imposta la biancheria per ogni numero di ospiti</p>
          </div>
          {!embedded && (
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-95 active:bg-slate-200">
              <div className="w-5 h-5 text-slate-500">{I.close}</div>
            </button>
          )}
        </div>
        <GuestSelector value={g} onChange={setG} max={maxGuests} />
        {warn && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center gap-2">
            <div className="w-4 h-4 text-amber-500">{I.warn}</div>
            <p className="text-xs text-amber-700">Capacità letti ({totalCap}) inferiore a {g} ospiti</p>
          </div>
        )}
      </div>
      <div className={embedded ? "py-1" : "flex-1 overflow-y-auto px-4 py-3"}>
        <Section title="Biancheria Letto" icon={I.bed} price={bedP} expanded={sec === 'beds'} onToggle={() => setSec(sec === 'beds' ? null : 'beds')} >
          {currentBeds.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-slate-500 mb-2">Nessun letto configurato</p>
              <p className="text-xs text-slate-400">I letti verranno generati automaticamente</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* SEZIONE LETTI */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">🛏️ Seleziona i letti da preparare per {g} ospiti:</p>
                <div className="grid grid-cols-2 gap-2">
                  {currentBeds.map(bed => {
                    const isSelected = selectedBedIds.includes(bed.id);
                    return (
                      <button
                        key={bed.id}
                        onClick={() => toggleBed(bed.id)}
                        className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-50 shadow-sm' 
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                          }`}>
                            {isSelected && <div className="w-3 h-3 text-white">{I.check}</div>}
                          </div>
                          <div className="w-6 h-6 text-slate-500">{getBedIcon(bed.type)}</div>
                        </div>
                        <p className="text-xs font-medium mt-1">{bed.name}</p>
                        <p className="text-[10px] text-slate-500">{bed.loc} • {bed.cap || (bed.type === 'sing' ? 1 : 2)}p</p>
                      </button>
                    );
                  })}
                </div>
                {selectedBedsData.length > 0 && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-700">
                      ✓ {selectedBedsData.length} letti selezionati = {totalCap} posti
                    </p>
                  </div>
                )}
              </div>
              
              {/* SEZIONE BIANCHERIA CALCOLATA */}
              {invLinen.length > 0 && selectedBedsData.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">📦 Biancheria necessaria (calcolata automaticamente):</p>
                  <div className="space-y-2">
                    {invLinen.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-blue-100">
                        <span className="text-xs text-slate-700 font-medium">{item.n} <span className="text-blue-500">€{item.p}</span></span>
                        <Cnt v={getItemQty(item.id)} onChange={v => updL(item.id, v)} />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 italic">
                    Quantità calcolate in base ai letti selezionati. Puoi modificarle manualmente.
                  </p>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section title="Biancheria Bagno" icon={I.towel} price={bathP} expanded={sec === 'bath'} onToggle={() => setSec(sec === 'bath' ? null : 'bath')} >
          {currentBath.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-slate-500 mb-2">Nessun articolo biancheria bagno</p>
              <a href="/admin/inventario" className="text-xs text-blue-600 underline">Aggiungi nell'inventario →</a>
            </div>
          ) : (
            <div className="space-y-2">
              {currentBath.map(i => (
                <div key={i.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-purple-100">
                  <span className="text-xs text-slate-700 font-medium">{i.n} <span className="text-purple-500">€{i.p}</span></span>
                  <Cnt v={c.ba[i.id] || 0} onChange={v => updB(i.id, v)} />
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Kit Cortesia" icon={I.soap} price={kitP} expanded={sec === 'kit'} onToggle={() => setSec(sec === 'kit' ? null : 'kit')} >
          {currentKit.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-slate-500 mb-2">Nessun kit cortesia</p>
              <a href="/admin/inventario" className="text-xs text-blue-600 underline">Aggiungi nell'inventario →</a>
            </div>
          ) : (
            <div className="space-y-2">
              {currentKit.map(i => (
                <div key={i.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-amber-100">
                  <span className="text-xs text-slate-700 font-medium">{i.n} <span className="text-amber-600">€{i.p}</span></span>
                  <Cnt v={c.ki[i.id] || 0} onChange={v => updK(i.id, v)} />
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Servizi Extra" icon={I.gift} price={exP} expanded={sec === 'extra'} onToggle={() => setSec(sec === 'extra' ? null : 'extra')} >
          {currentExtras.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-slate-500 mb-2">Nessun servizio extra</p>
              <a href="/admin/inventario" className="text-xs text-blue-600 underline">Aggiungi nell'inventario →</a>
            </div>
          ) : (
            <div className="space-y-2">
              {currentExtras.map(i => (
                <div key={i.id} onClick={() => togE(i.id)} className={`rounded-lg p-2.5 border-2 transition-all ${c.ex[i.id] ? 'border-slate-400 bg-white shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${c.ex[i.id] ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                        {c.ex[i.id] && <div className="w-3 h-3 text-white">{I.check}</div>}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{i.n}</p>
                        <p className="text-[10px] text-slate-500">{i.desc}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold">€{i.p}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <div className="h-4"></div>
      </div>

      <div className="flex-shrink-0 px-4 pt-3 pb-20 border-t border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-600">Totale per <strong>{g}</strong> ospiti</span>
          <span className="text-2xl font-bold">€{formatPrice(bedP + bathP + kitP + exP)}</span>
        </div>
        
        {/* 🆕 Warning se biancheria insufficiente */}
        {selectedBedsData.length > 0 && !linenValidation.isValid && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl">
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
        
        <button 
          onClick={async () => {
            if (savingState !== 'idle') return;
            setSavingState('saving');
            try {
              await onSave(cfgs);
              setSavingState('saved');
              // Auto-chiudi dopo 1.2 secondi
              setTimeout(() => onClose(), 1200);
            } catch {
              setSavingState('idle');
            }
          }} 
          disabled={(selectedBedsData.length > 0 && !linenValidation.isValid) || savingState !== 'idle'}
          className={`w-full py-3.5 text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-all shadow-md ${
            (selectedBedsData.length > 0 && !linenValidation.isValid) || savingState !== 'idle'
              ? 'bg-slate-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-sky-500 to-sky-600'
          }`}
        >
          {savingState === 'saving' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Salvataggio...
            </span>
          ) : submitLabel}
        </button>
      </div>
    </>
  );

  // Schermata di successo dopo salvataggio
  if (savingState === 'saved') {
    const successContent = (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-emerald-100 flex items-center justify-center animate-in zoom-in-50 duration-300">
            <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Configurazione Salvata</h2>
          <p className="text-sm text-slate-500">Le dotazioni sono state aggiornate con successo</p>
        </div>
      </div>
    );

    if (embedded) return successContent;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {successContent}
      </div>
    );
  }

  if (embedded) return cfgContent;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {cfgContent}
    </div>
  );
}
// ==================== SERVICE MODAL ====================
function SvcModal({ svc, cfgs, cleanPrice, isAdmin, onClose, onSave }: { svc: Service; cfgs: Record<number, GuestConfig>; cleanPrice: number; isAdmin: boolean; onClose: () => void; onSave: (s: Service) => void; }) {
  const [g, setG] = useState(svc.guests);
  const [expBed, setExpBed] = useState<string | null>(null);
  const [sec, setSec] = useState<string | null>('beds');
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Funzione helper per convertire il formato 'all' al formato per-letto
  const convertBLFormat = (bl: Record<string, Record<string, number>>, selectedBeds: string[]): Record<string, Record<string, number>> => {
    // Se bl ha solo 'all', distribuisci ai letti selezionati
    if (bl['all'] && Object.keys(bl).length === 1) {
      const result: Record<string, Record<string, number>> = {};
      selectedBeds.forEach(bedId => {
        const bed = beds.find(b => b.id === bedId);
        if (bed) {
          // Calcola la biancheria per questo specifico tipo di letto
          const linenReq = getLinenForBedType(bed.type);
          const bedLinen: Record<string, number> = {};
          
          // Mappa i requisiti agli articoli dell'inventario
          (linen[bed.type] || []).forEach(item => {
            const itemName = item.n.toLowerCase();
            if (itemName.includes('matrimoniale') || itemName.includes('matr')) {
              if (linenReq.lenzuoloMatrimoniale > 0) {
                bedLinen[item.id] = linenReq.lenzuoloMatrimoniale;
              }
            } else if (itemName.includes('singolo') || itemName.includes('sing')) {
              if (linenReq.lenzuoloSingolo > 0) {
                bedLinen[item.id] = linenReq.lenzuoloSingolo;
              }
            } else if (itemName.includes('federa')) {
              if (linenReq.federa > 0) {
                bedLinen[item.id] = linenReq.federa;
              }
            }
          });
          
          result[bedId] = bedLinen;
        }
      });
      return result;
    }
    return bl;
  };
  
  // Protezione: se cfgs[g] non esiste, usa un default vuoto
  const std = cfgs[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} };
  const initialBL = convertBLFormat(std.bl || {}, std.beds || []);
  const [myBeds, setMyBeds] = useState(std.beds || []);
  const [myBL, setMyBL] = useState(JSON.parse(JSON.stringify(initialBL)));
  const [myBa, setMyBa] = useState({ ...(std.ba || {}) });
  const [myKi, setMyKi] = useState({ ...(std.ki || {}) });
  const [myEx, setMyEx] = useState({ ...(std.ex || {}) });

  const handleG = (n: number) => { 
    setG(n); 
    setExpBed(null); 
    const c = cfgs[n] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }; 
    const convertedBL = convertBLFormat(c.bl || {}, c.beds || []);
    setMyBeds(c.beds || []); 
    setMyBL(JSON.parse(JSON.stringify(convertedBL))); 
    setMyBa({ ...(c.ba || {}) }); 
    setMyKi({ ...(c.ki || {}) }); 
    setMyEx({ ...(c.ex || {}) }); 
  };
  const cap = calcCap(myBeds); const warn = cap < g;
  
  // 🆕 Calcola letti selezionati per validazione
  const selectedBedsDataSvc = beds.filter(b => myBeds.includes(b.id));
  
  // 🆕 Combina tutti gli articoli biancheria per la validazione
  const allLinenItems = [...(linen['matr'] || []), ...(linen['sing'] || []), ...(linen['divano'] || [])];
  const uniqueLinenItems = allLinenItems.filter((item, index, self) => 
    index === self.findIndex(t => t.id === item.id)
  );
  
  // 🆕 VALIDAZIONE MINIMO LENZUOLA (2 per letto) E FEDERE (1 per ospite)
  const linenValidationSvc = validateLinenForBeds(selectedBedsDataSvc, myBL, uniqueLinenItems, g);
  
  const toggleBed = (id: string) => { const bed = beds.find(b => b.id === id); const sel = myBeds.includes(id); if (sel) { setMyBeds(myBeds.filter(x => x !== id)); const nl = { ...myBL }; delete nl[id]; setMyBL(nl); } else { setMyBeds([...myBeds, id]); const nl = { ...myBL }; nl[id] = {}; (linen[bed?.type || ''] || []).forEach(i => { nl[id][i.id] = i.d; }); setMyBL(nl); } };
  const updL = (bid: string, iid: string, v: number) => setMyBL((p: Record<string, Record<string, number>>) => ({ ...p, [bid]: { ...p[bid], [iid]: v } }));
  const updB = (id: string, v: number) => setMyBa((p: Record<string, number>) => ({ ...p, [id]: v }));
  const updK = (id: string, v: number) => setMyKi((p: Record<string, number>) => ({ ...p, [id]: v }));
  const togE = (id: string) => setMyEx((p: Record<string, boolean>) => ({ ...p, [id]: !p[id] }));
  const bedP = calcBL(myBL), bathP = calcArr(myBa, bathItems), kitP = calcArr(myKi, kitItems), exP = calcArr(myEx, extras), linenP = bedP + bathP + kitP + exP;

  const handleSave = () => {
    const updatedService: Service = {
      ...svc,
      guests: g,
      isModified: true,
      bedsConfig: myBeds.map(id => { const bed = beds.find(b => b.id === id); return { id, type: bed?.type || '', name: bed?.name || '', isDefault: false }; }),
      status: 'confirmed'
    };
    onSave(updatedService);
    setShowSuccess(true);
  };

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center"><div className="w-8 h-8 text-emerald-600">{I.check}</div></div>
          <h2 className="text-lg font-semibold text-center mb-2">Modifiche Salvate</h2>
          <p className="text-sm text-slate-500 text-center mb-6">{isAdmin ? 'Il servizio è stato aggiornato con successo.' : 'La richiesta di modifica è stata inviata e sarà valutata dall\'amministrazione.'}</p>
          <button onClick={onClose} className="w-full py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl active:scale-[0.98]">Chiudi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex-shrink-0 bg-white pt-12 px-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Modifica Servizio</h2>
            <p className="text-xs text-slate-500">{new Date(svc.date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })} • {svc.time}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-95 active:bg-slate-200">
            <div className="w-5 h-5 text-slate-500">{I.close}</div>
          </button>
        </div>

        <div className="flex items-center justify-between bg-slate-100 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
              <div className="w-5 h-5 text-slate-600">{I.users}</div>
            </div>
            <span className="text-sm font-semibold text-slate-700">Numero Ospiti</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => handleG(Math.max(1, g - 1))} className="w-10 h-10 rounded-xl border-2 border-slate-300 bg-white flex items-center justify-center active:scale-95">
              <div className="w-5 h-5 text-slate-500">{I.minus}</div>
            </button>
            <span className="w-10 text-center text-2xl font-bold">{g}</span>
            <button onClick={() => handleG(Math.min(7, g + 1))} className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center active:scale-95">
              <div className="w-5 h-5 text-white">{I.plus}</div>
            </button>
          </div>
        </div>

        {warn && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center gap-2">
            <div className="w-4 h-4 text-amber-500">{I.warn}</div>
            <p className="text-xs text-amber-700">Capacità letti ({cap}) inferiore a {g} ospiti</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <Section title="Biancheria Letto" icon={I.bed} price={bedP} expanded={sec === 'beds'} onToggle={() => setSec(sec === 'beds' ? null : 'beds')} >
          <div className="space-y-2">
            {beds.map(bed => {
              const sel = myBeds.includes(bed.id);
              const bl = myBL[bed.id] || {};
              const items = linen[bed.type] || [];
              const bp = items.reduce((s: number, i: LinenItem) => s + i.p * (bl[i.id] || 0), 0);
              return (
                <div key={bed.id} className={`rounded-lg border-2 overflow-hidden transition-all ${sel ? 'border-blue-300 bg-white shadow-sm' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                  <div className="p-2.5 flex items-center gap-2" onClick={() => toggleBed(bed.id)}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${sel ? 'bg-slate-900 border-slate-900' : 'border-slate-300 bg-white'}`}>
                      {sel && <div className="w-3 h-3 text-white">{I.check}</div>}
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                      <div className="w-4 h-4 text-blue-600">{getBedIcon(bed.type)}</div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{bed.name}</p>
                      <p className="text-[10px] text-slate-500">{bed.loc} • {bed.cap}p</p>
                    </div>
                    {sel && (
                      <>
                        <span className="text-sm font-bold text-blue-600">€{formatPrice(bp)}</span>
                        <button onClick={e => { e.stopPropagation(); setExpBed(expBed === bed.id ? null : bed.id); }} className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                          <div className={`w-4 h-4 text-blue-500 transition-transform ${expBed === bed.id ? 'rotate-180' : ''}`}>{I.down}</div>
                        </button>
                      </>
                    )}
                  </div>
                  {sel && expBed === bed.id && (
                    <div className="px-2.5 pb-2.5 pt-2 border-t border-blue-100 bg-blue-50/50 space-y-2">
                      {items.map(i => (
                        <div key={i.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-blue-100">
                          <span className="text-xs text-slate-700">{i.n} <span className="text-blue-500 font-medium">€{formatPrice(i.p)}</span></span>
                          <Cnt v={bl[i.id] || 0} onChange={v => updL(bed.id, i.id, v)} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Biancheria Bagno" icon={I.towel} price={bathP} expanded={sec === 'bath'} onToggle={() => setSec(sec === 'bath' ? null : 'bath')} >
          <div className="space-y-2">
            {bathItems.map(i => (
              <div key={i.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-purple-100">
                <span className="text-xs text-slate-700 font-medium">{i.n} <span className="text-purple-500">€{formatPrice(i.p)}</span></span>
                <Cnt v={myBa[i.id] || 0} onChange={v => updB(i.id, v)} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Kit Cortesia" icon={I.soap} price={kitP} expanded={sec === 'kit'} onToggle={() => setSec(sec === 'kit' ? null : 'kit')} >
          <div className="space-y-2">
            {kitItems.map(i => (
              <div key={i.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-amber-100">
                <span className="text-xs text-slate-700 font-medium">{i.n} <span className="text-amber-600">€{formatPrice(i.p)}</span></span>
                <Cnt v={myKi[i.id] || 0} onChange={v => updK(i.id, v)} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Servizi Extra" icon={I.gift} price={exP} expanded={sec === 'extra'} onToggle={() => setSec(sec === 'extra' ? null : 'extra')} >
          <div className="space-y-2">
            {extras.map(i => (
              <div key={i.id} onClick={() => togE(i.id)} className={`rounded-lg p-2.5 border-2 transition-all ${myEx[i.id] ? 'border-slate-400 bg-white shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${myEx[i.id] ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                      {myEx[i.id] && <div className="w-3 h-3 text-white">{I.check}</div>}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{i.n}</p>
                      <p className="text-[10px] text-slate-500">{i.desc}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold">€{formatPrice(i.p)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="h-4"></div>
      </div>

      <div className="flex-shrink-0 px-4 pt-3 pb-20 border-t border-slate-200 bg-white">
        <div className="space-y-1 mb-2">
          <div className="flex justify-between text-xs text-slate-500"><span>Pulizia</span><span className="font-medium">€{formatPrice(cleanPrice)}</span></div>
          <div className="flex justify-between text-xs text-slate-500"><span>Dotazioni</span><span className="font-medium">€{formatPrice(linenP)}</span></div>
          <div className="flex justify-between pt-1 border-t border-slate-200"><span className="text-sm font-semibold">Totale</span><span className="text-xl font-bold">€{formatPrice(cleanPrice + linenP)}</span></div>
        </div>
        
        {/* 🆕 Warning se biancheria insufficiente */}
        {selectedBedsDataSvc.length > 0 && !linenValidationSvc.isValid && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-2">
              <span className="text-lg flex-shrink-0">⚠️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">Biancheria insufficiente</p>
                <p className="text-xs text-red-600 mt-1">
                  Per {g} ospiti servono almeno:
                </p>
                <ul className="text-xs text-red-600 mt-1 space-y-0.5">
                  {linenValidationSvc.requiredMatrimoniali > 0 && (
                    <li>
                      • <strong>{linenValidationSvc.requiredMatrimoniali}</strong> lenzuola matrimoniali 
                      (hai: <strong>{linenValidationSvc.currentMatrimoniali}</strong>
                      {linenValidationSvc.missingMatrimoniali > 0 && (
                        <span className="text-red-700 font-bold"> → mancano {linenValidationSvc.missingMatrimoniali}</span>
                      )})
                    </li>
                  )}
                  {linenValidationSvc.requiredSingole > 0 && (
                    <li>
                      • <strong>{linenValidationSvc.requiredSingole}</strong> lenzuola singole 
                      (hai: <strong>{linenValidationSvc.currentSingole}</strong>
                      {linenValidationSvc.missingSingole > 0 && (
                        <span className="text-red-700 font-bold"> → mancano {linenValidationSvc.missingSingole}</span>
                      )})
                    </li>
                  )}
                  {linenValidationSvc.requiredFedere > 0 && (
                    <li>
                      • <strong>{linenValidationSvc.requiredFedere}</strong> federe (1 per ospite)
                      (hai: <strong>{linenValidationSvc.currentFedere}</strong>
                      {linenValidationSvc.missingFedere > 0 && (
                        <span className="text-red-700 font-bold"> → mancano {linenValidationSvc.missingFedere}</span>
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
        
        <button 
          onClick={handleSave} 
          disabled={selectedBedsDataSvc.length > 0 && !linenValidationSvc.isValid}
          className={`w-full py-3.5 text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-transform shadow-md ${
            selectedBedsDataSvc.length > 0 && !linenValidationSvc.isValid 
              ? 'bg-slate-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-600 to-blue-700'
          }`}
        >
          Salva Modifiche
        </button>
      </div>
    </div>
  );
}

// ==================== DEACTIVATE MODAL ====================
interface DeactivateModalProps {
  isAdmin: boolean;
  propertyId: string;
  propertyName: string;
  ownerId?: string;
  onClose: () => void;
  onConfirm: () => void;
  onRequestSent?: () => void;
}

function DeactivateModal({ isAdmin, propertyId, propertyName, ownerId, onClose, onConfirm, onRequestSent }: DeactivateModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSendRequest = async () => {
    if (!reason.trim()) {
      setError('Inserisci il motivo della cancellazione');
      return;
    }
    
    setSending(true);
    setError(null);
    
    try {
      // Usa la NUOVA API deletion-requests (crea record + notifica admin + setta PENDING_DELETION)
      const response = await fetch('/api/deletion-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          reason: reason.trim(),
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Errore nell\'invio della richiesta');
      }
      
      
      setRequestSent(true);
      onRequestSent?.();
    } catch (err) {
      console.error('Errore invio richiesta:', err);
      setError(err instanceof Error ? err.message : 'Errore nell\'invio della richiesta');
    } finally {
      setSending(false);
    }
  };

  // 🔥 NUOVA FUNZIONE: Admin disattiva direttamente
  const handleAdminDeactivate = async () => {
    if (confirmText !== 'ELIMINA') return;
    
    setSending(true);
    setError(null);
    
    try {
      
      // Disattiva la proprietà
      const response = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'INACTIVE',
          deactivatedAt: new Date().toISOString(),
          deactivatedBy: 'admin',
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Errore nella disattivazione');
      }
      
      // Invia notifica al proprietario
      if (ownerId) {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: "Proprietà Disattivata",
            message: `La tua proprietà "${propertyName}" è stata disattivata dall'amministratore.`,
            type: "WARNING",
            recipientRole: "PROPRIETARIO",
            recipientId: ownerId,
            senderId: "system",
            senderName: "Sistema",
          }),
        });
      }
      
      setSuccess(true);
      
      // Dopo 1.5 secondi chiudi e aggiorna
      setTimeout(() => {
        onConfirm();
        window.location.reload();
      }, 1500);
      
    } catch (err) {
      console.error('Errore disattivazione:', err);
      setError(err instanceof Error ? err.message : 'Errore nella disattivazione');
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = () => {
    if (isAdmin && confirmText === 'ELIMINA') {
      handleAdminDeactivate();
    } else if (!isAdmin) {
      handleSendRequest();
    }
  };

  // Schermata di successo dopo disattivazione admin
  if (isAdmin && success) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <div className="w-8 h-8 text-emerald-600">{I.check}</div>
          </div>
          <h2 className="text-lg font-semibold text-center mb-2">Proprietà Disattivata!</h2>
          <p className="text-sm text-slate-500 text-center mb-6">"{propertyName}" è stata spostata nelle proprietà disattivate. Il proprietario è stato notificato.</p>
        </div>
      </div>
    );
  }

  // Schermata di successo dopo l'invio (proprietario)
  if (!isAdmin && requestSent) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <div className="w-8 h-8 text-emerald-600">{I.send}</div>
          </div>
          <h2 className="text-lg font-semibold text-center mb-2">Richiesta Inviata!</h2>
          <p className="text-sm text-slate-500 text-center mb-6">La tua richiesta di cancellazione per "{propertyName}" è stata inviata all'amministrazione. Riceverai una notifica quando sarà elaborata.</p>
          <button onClick={() => { onClose(); window.location.reload(); }} className="w-full py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl active:scale-[0.98] transition-transform">Chiudi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <div className="w-8 h-8 text-red-600">{I.warn}</div>
        </div>
        <h2 className="text-lg font-semibold text-center mb-2">{isAdmin ? 'Disattiva Proprietà' : 'Richiedi Cancellazione'}</h2>
        <p className="text-sm text-slate-500 text-center mb-4">{isAdmin ? `Stai per disattivare "${propertyName}". La proprietà verrà spostata in "Disattivate".` : `Stai richiedendo la cancellazione di "${propertyName}". La richiesta verrà inviata all'amministrazione per l'approvazione.`}</p>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600 text-center">{error}</p>
          </div>
        )}
        
        {isAdmin ? (
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-2">Scrivi <span className="font-bold text-red-600">ELIMINA</span> per confermare</label>
            <input 
              type="text" 
              value={confirmText} 
              onChange={(e) => setConfirmText(e.target.value)} 
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-center font-semibold focus:border-red-300 focus:outline-none" 
              placeholder="ELIMINA" 
            />
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-2">Motivo della cancellazione *</label>
            <textarea 
              value={reason} 
              onChange={(e) => setReason(e.target.value)} 
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-red-300 focus:outline-none resize-none" 
              placeholder="Es: Vendita immobile, fine collaborazione..."
              rows={3}
            />
          </div>
        )}
        
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl active:scale-[0.98]">Annulla</button>
          <button 
            onClick={handleConfirm} 
            disabled={(isAdmin && confirmText !== 'ELIMINA') || (!isAdmin && !reason.trim()) || sending} 
            className={`flex-1 py-3 text-white text-sm font-semibold rounded-xl transition-all active:scale-[0.98] ${
              sending 
                ? 'bg-slate-400 cursor-wait' 
                : isAdmin 
                  ? confirmText === 'ELIMINA' ? 'bg-red-600' : 'bg-red-300 cursor-not-allowed' 
                  : reason.trim() ? 'bg-red-500 hover:bg-red-600' : 'bg-red-300 cursor-not-allowed'
            }`}
          >
            {sending ? 'Invio...' : isAdmin ? 'Disattiva' : 'Invia Richiesta'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== EDIT PRICE MODAL ====================
function EditPriceModal({ 
  currentPrice, 
  propertyId, 
  propertyName,
  onClose, 
  onSave 
}: { 
  currentPrice: number; 
  propertyId?: string;
  propertyName: string;
  onClose: () => void; 
  onSave: (newPrice: number) => void; 
}) {
  const [price, setPrice] = useState(currentPrice.toString());
  const [showSuccess, setShowSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const newPrice = parseFloat(price);
    if (isNaN(newPrice) || newPrice < 0) {
      setError('Inserisci un prezzo valido');
      return;
    }

    setSaving(true);
    setError(null);

    if (propertyId) {
      try {
        const response = await fetch(`/api/properties/${propertyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cleaningPrice: newPrice }),
        });
        if (!response.ok) {
          throw new Error('Errore nel salvataggio');
        }
      } catch (err) {
        console.error('Error saving price:', err);
        setError('Errore nel salvataggio del prezzo');
        setSaving(false);
        return;
      }
    }

    onSave(newPrice);
    setSaving(false);
    setShowSuccess(true);
  };

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <div className="w-8 h-8 text-emerald-600">{I.check}</div>
          </div>
          <h2 className="text-lg font-semibold text-center mb-2">Prezzo Aggiornato!</h2>
          <p className="text-sm text-slate-500 text-center mb-2">Il prezzo pulizia per</p>
          <p className="text-base font-bold text-center text-slate-800 mb-2">"{propertyName}"</p>
          <p className="text-sm text-slate-500 text-center mb-4">è stato aggiornato a <span className="font-bold text-emerald-600">€{parseFloat(price).toFixed(2)}</span></p>
          <button onClick={onClose} className="w-full py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl active:scale-[0.98] transition-transform">
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
          <div className="w-7 h-7 text-blue-600">{I.money}</div>
        </div>
        <h2 className="text-lg font-semibold text-center mb-1">Modifica Prezzo Pulizia</h2>
        <p className="text-sm text-slate-500 text-center mb-4">{propertyName}</p>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600 text-center">{error}</p>
          </div>
        )}
        
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-600 mb-2">Nuovo prezzo (€)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">€</span>
            <input 
              type="number" 
              step="0.01"
              min="0"
              value={price} 
              onChange={(e) => setPrice(e.target.value)} 
              className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl text-xl font-bold text-center focus:border-blue-400 focus:outline-none" 
              placeholder="65.00"
              autoFocus
            />
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">Prezzo attuale: €{currentPrice.toFixed(2)}</p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={onClose} 
            className="flex-1 py-3 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl active:scale-[0.98]"
          >
            Annulla
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving || !price}
            className={`flex-1 py-3 text-white text-sm font-semibold rounded-xl transition-all active:scale-[0.98] ${
              saving || !price 
                ? 'bg-slate-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-600 to-blue-700'
            }`}
          >
            {saving ? 'Salvataggio...' : 'Salva Prezzo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== UNIFIED PROPERTY MODAL ====================
// Modal COMPLETA con 3 tab - Editor Letti integrato - Comportamento Admin/Proprietario
const BED_TYPES = [
  { tipo: 'matr', nome: 'Matrimoniale', cap: 2, icon: '🛏️' },
  { tipo: 'sing', nome: 'Singolo', cap: 1, icon: '🛏️' },
  { tipo: 'divano', nome: 'Divano Letto', cap: 2, icon: '🛋️' },
  { tipo: 'castello', nome: 'Letto a Castello', cap: 2, icon: '🛏️' },
  { tipo: 'piazza_mezza', nome: 'Piazza e Mezza', cap: 1, icon: '🛏️' },
];

function UnifiedPropertyModal({ 
  propData, 
  beds: initialBeds,
  isAdmin, 
  propertyId, 
  currentCfgs,
  onClose, 
  onSave 
}: { 
  propData: PropertyData; 
  beds: Bed[];
  isAdmin: boolean; 
  propertyId?: string; 
  currentCfgs?: Record<number, GuestConfig>;
  onClose: () => void; 
  onSave: (data: Partial<PropertyData>, updatedCfgs?: Record<number, GuestConfig>) => void; 
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'rooms' | 'access'>('info');
  const [showSuccess, setShowSuccess] = useState<'saved' | 'requested' | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [pendingRequestType, setPendingRequestType] = useState<string | null>(null);
  
  // Step configurazione biancheria prima dell'invio
  const [showCfgStep, setShowCfgStep] = useState(false);
  const [requestCfgs, setRequestCfgs] = useState<Record<number, GuestConfig>>({});
  
  // Tab 1: Informazioni Base
  const [name, setName] = useState(propData.name);
  const [addr, setAddr] = useState(propData.addr);
  const [apartment, setApartment] = useState(propData.apartment || '');
  const [floor, setFloor] = useState(propData.floor || '');
  const [intercom, setIntercom] = useState(propData.intercom || '');
  const [city, setCity] = useState(propData.city || '');
  const [postalCode, setPostalCode] = useState(propData.postalCode || '');
  const [checkIn, setCheckIn] = useState(propData.checkIn);
  const [checkOut, setCheckOut] = useState(propData.checkOut);
  
  // Tab 2: Stanze, Ospiti e Letti (rooms-first)
  const [maxGuests, setMaxGuests] = useState(propData.maxGuests);
  const [bathrooms, setBathrooms] = useState(propData.bathrooms);
  const [reason, setReason] = useState('');

  // Rooms-first: raggruppa letti per stanza
  const buildRoomsFromBeds = (flatBeds: Bed[]) => {
    const roomMap = new Map<string, Bed[]>();
    flatBeds.forEach(b => {
      const loc = b.loc || 'Camera';
      if (!roomMap.has(loc)) roomMap.set(loc, []);
      roomMap.get(loc)!.push({ ...b });
    });
    return Array.from(roomMap.entries()).map(([rname, rbeds], i) => ({
      id: `room_${i}`, name: rname, beds: rbeds
    }));
  };

  const [rooms, setRooms] = useState(() => buildRoomsFromBeds(initialBeds));
  const [roomIdCtr, setRoomIdCtr] = useState(100);
  const [bedIdCtr, setBedIdCtr] = useState(100);
  const [openRooms, setOpenRooms] = useState<Set<string>>(new Set());

  // Derived from rooms
  const editBeds = rooms.flatMap(r => r.beds.map(b => ({ ...b, loc: r.name })));
  const allBeds = rooms.flatMap(r => r.beds);
  const bedrooms = rooms.length;
  const bedCapacity = editBeds.reduce((sum, b) => sum + b.cap, 0);
  const initialBedCapacity = initialBeds.reduce((sum, b) => sum + b.cap, 0);
  const hasRoomChanges = maxGuests !== propData.maxGuests || bedrooms !== propData.bedrooms || bathrooms !== propData.bathrooms;
  const hasBedChanges = JSON.stringify(editBeds.map(b => ({ id: b.id, type: b.type, name: b.name, loc: b.loc, cap: b.cap }))) !== JSON.stringify(initialBeds.map(b => ({ id: b.id, type: b.type, name: b.name, loc: b.loc, cap: b.cap })));
  const hasAnyRoomOrBedChanges = hasRoomChanges || hasBedChanges;
  const [showScendibagnoConfirm, setShowScendibagnoConfirm] = useState(false);
  const [updateScendibagno, setUpdateScendibagno] = useState(true);
  const hasBathroomChanged = bathrooms !== propData.bathrooms;
  // Traccia cosa fare DOPO la scelta scendibagno: 'save' (admin) o 'configure' (proprietario con altre modifiche) o 'send' (solo bagni)
  const [pendingAfterScendibagno, setPendingAfterScendibagno] = useState<'save' | 'configure' | 'send' | null>(null);

  // Room CRUD
  const addRoom = () => {
    const nid = roomIdCtr; setRoomIdCtr(p => p + 1);
    setRooms(p => [...p, { id: `room_${nid}`, name: 'Nuova Stanza', beds: [] }]);
    setOpenRooms(p => { const n = new Set(p); n.add(`room_${nid}`); return n; });
  };
  const removeRoom = (rid: string) => setRooms(p => p.filter(r => r.id !== rid));
  const renameRoom = (rid: string, nm: string) => setRooms(p => p.map(r => r.id === rid ? { ...r, name: nm } : r));
  const toggleRoom = (rid: string) => setOpenRooms(p => { const n = new Set(p); n.has(rid) ? n.delete(rid) : n.add(rid); return n; });
  
  const addBedToRoom = (rid: string, type: string) => {
    const bt = BED_TYPES.find(t => t.tipo === type);
    if (!bt) return;
    const nid = bedIdCtr; setBedIdCtr(p => p + 1);
    const room = rooms.find(r => r.id === rid);
    const newBed: Bed = { id: `bed_${Date.now()}_${nid}`, type: bt.tipo, name: bt.nome, loc: room?.name || 'Camera', cap: bt.cap };
    setRooms(p => p.map(r => r.id === rid ? { ...r, beds: [...r.beds, newBed] } : r));
  };
  const removeBedFromRoom = (rid: string, bid: string) => {
    setRooms(p => p.map(r => r.id === rid ? { ...r, beds: r.beds.filter(b => b.id !== bid) } : r));
  };

  // Check richieste pendenti
  useEffect(() => {
    if (!isAdmin && propertyId) {
      fetch(`/api/property-change-request?propertyId=${propertyId}&status=PENDING`)
        .then(res => res.json())
        .then(data => {
          if (data.requests?.length > 0) {
            setHasPendingRequest(true);
            setPendingRequestType(data.requests[0].changeType);
          }
        })
        .catch(() => {});
    }
  }, [isAdmin, propertyId]);

  // Tab 3: Accesso
  const [doorCode, setDoorCode] = useState(propData.doorCode || '');
  const [keysLocation, setKeysLocation] = useState(propData.keysLocation || '');
  const [accessNotes, setAccessNotes] = useState(propData.accessNotes || '');
  const [doorImage, setDoorImage] = useState(propData.images?.door || '');
  const [buildingImage, setBuildingImage] = useState(propData.images?.building || '');
  const [uploading, setUploading] = useState<'door' | 'building' | null>(null);
  const doorInputRef = useRef<HTMLInputElement>(null);
  const buildingInputRef = useRef<HTMLInputElement>(null);
  // Elementi DOM helper per compressione immagini (evita new Image() bloccato da SES)
  // Vengono aggiunti nel JSX come elementi nascosti
  const handleImageUpload = async (file: File, type: 'door' | 'building') => {
    if (!propertyId || !file.type.startsWith('image/')) return;
    setUploading(type);
    try {
      // Usa la stessa libreria dell operatore (dynamic import = no SES issues)
      const { compressImage, getOptimalCompressionConfig } = await import('~/lib/photos/imageCompression');
      const config = getOptimalCompressionConfig();
      const result = await compressImage(file, { ...config, maxWidth: 1200, maxHeight: 1200, quality: 0.8 });
      if (!result.success || !result.compressedBlob) throw new Error('Compressione fallita');
      const formData = new FormData();
      formData.append('file', result.compressedBlob, `${type}.jpg`);
      formData.append('propertyId', propertyId);
      formData.append('photoType', type);
      const response = await fetch('/api/properties/upload-photo', { method: 'POST', body: formData });
      if (response.ok) {
        const data = await response.json();
        if (type === 'door') setDoorImage(data.url);
        else setBuildingImage(data.url);
      }
    } catch (error) { console.error('Errore upload:', error); }
    finally { setUploading(null); }
  };

  const handleRemoveImage = async (type: 'door' | 'building') => {
    if (!propertyId) return;
    try {
      await fetch(`/api/properties/upload-photo?propertyId=${propertyId}&photoType=${type}`, { method: 'DELETE' });
      if (type === 'door') setDoorImage(''); else setBuildingImage('');
    } catch (error) { console.error('Errore rimozione:', error); }
  };

  // === SALVATAGGIO (ADMIN o info/accesso per tutti) ===
  const [adminPendingSave, setAdminPendingSave] = useState(false);
  
  const handleSave = async (forceScendibagno?: boolean) => {
    // Se admin e bagni cambiati, chiedi prima dello scendibagno
    if (isAdmin && hasBathroomChanged && forceScendibagno === undefined) {
      setPendingAfterScendibagno('save');
      setShowScendibagnoConfirm(true);
      return;
    }
    
    // Se admin e ha cambiato letti/ospiti → apri configuratore biancheria prima di salvare
    if (isAdmin && hasAnyRoomOrBedChanges && !adminPendingSave) {
      // NON salvare ancora — apri solo il configuratore biancheria
      proceedToConfigurator(forceScendibagno);
      setAdminPendingSave(true);
      return;
    }
    
    setSaving(true);
    const saveData: any = {
      name, address: addr, apartment, floor, intercom, city, postalCode,
      checkInTime: checkIn, checkOutTime: checkOut,
      doorCode, keysLocation, accessNotes,
      images: { door: doorImage, building: buildingImage },
    };
    
    // Admin salva anche stanze e letti
    if (isAdmin) {
      saveData.maxGuests = maxGuests;
      saveData.bedrooms = bedrooms;
      saveData.bathrooms = bathrooms;
      saveData.bedsConfig = editBeds.map(b => ({
        id: b.id, type: b.type, name: b.name, location: b.loc, capacity: b.cap
      }));
      // Se bagni cambiati, includi la scelta scendibagno
      if (hasBathroomChanged) {
        saveData.updateScendibagno = forceScendibagno ?? updateScendibagno;
      }
    }
    
    if (propertyId) {
      try {
        // Sanitizza saveData per evitare riferimenti circolari (eventi DOM, etc.)
        const cleanData = JSON.parse(JSON.stringify(saveData, (key, value) => {
          if (value instanceof HTMLElement || value instanceof Node) return undefined;
          if (typeof value === 'function') return undefined;
          return value;
        }));
        const response = await fetch(`/api/properties/${propertyId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanData),
        });
        if (!response.ok) { setSaving(false); return; }
      } catch (error) { console.error('Error:', error); setSaving(false); return; }
    }
    
    // Se admin ha scelto di aggiornare scendibagno, calcola le cfgs aggiornate per il parent
    let updatedCfgsForParent: Record<number, GuestConfig> | undefined;
    if (isAdmin && hasBathroomChanged && (forceScendibagno ?? updateScendibagno) && currentCfgs) {
      updatedCfgsForParent = {};
      for (const [key, cfg] of Object.entries(currentCfgs)) {
        const copied: GuestConfig = JSON.parse(JSON.stringify(cfg));
        if (copied.ba) {
          for (const itemId of Object.keys(copied.ba)) {
            const keyL = itemId.toLowerCase();
            if (keyL.includes('scendi') || keyL.includes('tappetino') || keyL.includes('bathmat')) {
              copied.ba[itemId] = bathrooms;
            }
          }
        }
        updatedCfgsForParent[Number(key)] = copied;
      }
    }
    
    onSave({ 
      name, addr, apartment, floor, intercom, city, postalCode, checkIn, checkOut, 
      doorCode, keysLocation, accessNotes, images: { door: doorImage, building: buildingImage },
      ...(isAdmin ? { maxGuests, bedrooms, bathrooms, newBeds: editBeds.map(b => ({ id: b.id, type: b.type, name: b.name, location: b.loc, capacity: b.cap })) } : {})
    }, updatedCfgsForParent);
    setSaving(false);
    setShowSuccess('saved');
  };

  // === STEP 1: Apri configuratore biancheria prima dell'invio ===
  const hasBathroomOnlyChange = bathrooms !== propData.bathrooms && !hasBedChanges && maxGuests === propData.maxGuests;
  
  const handleSendRequest = async () => {
    if (!propertyId || !hasAnyRoomOrBedChanges) return;
    
    if (maxGuests > bedCapacity && bedCapacity > 0) {
      alert(`⚠️ Non puoi richiedere ${maxGuests} ospiti con solo ${bedCapacity} posti letto.\n\nAggiungi prima altri letti per aumentare la capacità.`);
      return;
    }

    // Se i bagni sono cambiati, mostra SEMPRE prima la modal scendibagno
    // Dopo la scelta, prosegue con il flusso appropriato
    if (hasBathroomChanged) {
      const hasOtherChanges = hasBedChanges || maxGuests !== propData.maxGuests;
      setPendingAfterScendibagno(hasOtherChanges ? 'configure' : 'send');
      setShowScendibagnoConfirm(true);
      return;
    }
    
    // Se solo letti/ospiti cambiati (senza bagni), vai diretto al configuratore
    proceedToConfigurator();
  };
  
  // Funzione separata per procedere al configuratore biancheria
  const proceedToConfigurator = (overrideScendibagno?: boolean) => {
    const shouldUpdateScendibagno = overrideScendibagno ?? updateScendibagno;
    const newBedIds = new Set(editBeds.map(b => b.id));
    const oldBedIds = new Set(initialBeds.map(b => b.id));
    const addedBeds = editBeds.filter(b => !oldBedIds.has(b.id));
    
    const newCfgs: Record<number, GuestConfig> = {};
    for (let i = 1; i <= maxGuests; i++) {
      const hasExisting = !!(currentCfgs && currentCfgs[i]);
      
      if (hasExisting && hasBedChanges) {
        const oldCfg: GuestConfig = JSON.parse(JSON.stringify(currentCfgs[i]));
        const survivingBeds = (oldCfg.beds || []).filter((id: string) => newBedIds.has(id));
        let currentCap = survivingBeds.reduce((s: number, id: string) => { const bed = editBeds.find(b => b.id === id); return s + (bed?.cap || (bed?.type === 'sing' ? 1 : 2)); }, 0);
        const finalBeds = [...survivingBeds];
        const newlyAddedToConfig: string[] = [];
        if (currentCap < i) {
          for (const bed of addedBeds) { if (currentCap >= i) break; if (!finalBeds.includes(bed.id)) { finalBeds.push(bed.id); newlyAddedToConfig.push(bed.id); currentCap += bed.cap; } }
          if (currentCap < i) { for (const bed of editBeds) { if (currentCap >= i) break; if (!finalBeds.includes(bed.id)) { finalBeds.push(bed.id); newlyAddedToConfig.push(bed.id); currentCap += bed.cap; } } }
        }
        
        // Ricalcola biancheria basandosi SOLO sui letti finali (sopravvissuti + nuovi)
        const removedBeds = (oldCfg.beds || []).filter((id: string) => !newBedIds.has(id));
        const hasRemovedBeds = removedBeds.length > 0;
        
        let newBl: Record<string, Record<string, number>>;
        if (hasRemovedBeds || newlyAddedToConfig.length > 0) {
          // Letti cambiati (aggiunti o rimossi): ricalcola da zero basandosi sui letti finali
          const finalBedsData = editBeds.filter(b => finalBeds.includes(b.id));
          const linenReq = calculateTotalLinenForBeds(finalBedsData);
          const mappedLinen = mapLinenToInventoryItems(linenReq, linen['matr'] || []);
          newBl = { 'all': mappedLinen };
        } else if (oldCfg.bl?.['all']) {
          // Nessun cambio letti: preserva biancheria esistente
          newBl = { 'all': { ...oldCfg.bl['all'] } };
        } else {
          const selectedBedsForCfg = editBeds.filter(b => finalBeds.includes(b.id));
          const linenReqForCfg = calculateTotalLinenForBeds(selectedBedsForCfg);
          const mappedLinenForCfg = mapLinenToInventoryItems(linenReqForCfg, linen['matr'] || []);
          newBl = { 'all': mappedLinenForCfg };
        }
        
        oldCfg.beds = finalBeds;
        oldCfg.bl = newBl;
        // Se bagni cambiati e utente ha scelto di aggiornare scendibagno
        if (hasBathroomChanged && shouldUpdateScendibagno && oldCfg.ba) {
          Object.keys(oldCfg.ba).forEach(itemId => {
            const keyL = itemId.toLowerCase();
            if (keyL.includes('scendi') || keyL.includes('tappetino') || keyL.includes('bathmat')) {
              oldCfg.ba![itemId] = bathrooms;
            }
          });
        }
        newCfgs[i] = oldCfg;
      } else if (currentCfgs && currentCfgs[i] && !hasBedChanges) {
        const copied: GuestConfig = JSON.parse(JSON.stringify(currentCfgs[i]));
        // Se bagni cambiati e utente ha scelto di aggiornare scendibagno, aggiorna nelle config esistenti
        if (hasBathroomChanged && shouldUpdateScendibagno && copied.ba) {
          Object.keys(copied.ba).forEach(itemId => {
            const keyL = itemId.toLowerCase();
            if (keyL.includes('scendi') || keyL.includes('tappetino') || keyL.includes('bathmat')) {
              copied.ba![itemId] = bathrooms;
            }
          });
        }
        newCfgs[i] = copied;
      } else {
        // Config nuova: eredita dalla config ospiti precedente + aggiungi minimi per letti extra
        const selBeds: string[] = []; let rem = i;
        editBeds.forEach(bed => { const bedCap = bed.cap || (bed.type === 'sing' ? 1 : 2); if (rem > 0) { selBeds.push(bed.id); rem -= bedCap; } });
        
        // Cerca la config precedente più alta da cui ereditare
        const prevConfig = newCfgs[i - 1] || (currentCfgs && currentCfgs[i - 1]) || null;
        
        let blAll: Record<string, number>;
        if (prevConfig?.bl?.['all']) {
          // Eredita dalla config precedente
          blAll = { ...prevConfig.bl['all'] };
          // Trova i letti nuovi rispetto alla config precedente
          const prevBedIds = new Set(prevConfig.beds || []);
          const extraBeds = selBeds.filter(id => !prevBedIds.has(id));
          if (extraBeds.length > 0) {
            const extraBedsData = editBeds.filter(b => extraBeds.includes(b.id));
            const extraLinenReq = calculateTotalLinenForBeds(extraBedsData);
            const extraMapped = mapLinenToInventoryItems(extraLinenReq, linen['matr'] || []);
            Object.entries(extraMapped).forEach(([key, val]) => {
              blAll[key] = (blAll[key] || 0) + val;
            });
          }
        } else {
          // Nessuna config precedente: usa minimi default
          const selBedsData = editBeds.filter(b => selBeds.includes(b.id));
          const linenReqNew = calculateTotalLinenForBeds(selBedsData);
          blAll = mapLinenToInventoryItems(linenReqNew, linen['matr'] || []);
        }
        
        const ba: Record<string, number> = {};
        bathItems.forEach(item => {
          const keyL = (item.id || '').toLowerCase();
          const nameL = (item.n || '').toLowerCase();
          const isTappetino = keyL.includes('scendi') || keyL.includes('tappetino') || keyL.includes('bathmat') || nameL.includes('scendi') || nameL.includes('tappetino') || nameL.includes('bathmat');
          ba[item.id] = isTappetino ? bathrooms : item.d * i;
        });
        const ki: Record<string, number> = {};
        kitItems.forEach(item => { ki[item.id] = item.d * i; });
        const ex: Record<string, boolean> = {};
        extras.forEach(item => { ex[item.id] = false; });
        newCfgs[i] = { beds: selBeds, bl: { 'all': blAll }, ba, ki, ex };
      }
    }
    setRequestCfgs(newCfgs);
    setShowCfgStep(true);
  };

  // === STEP 2: Dopo che il proprietario ha configurato la biancheria, invia la richiesta ===
  // (Per admin: salva direttamente le serviceConfigs sulla proprietà)
  const handleAdminCfgSave = async (finalCfgs: Record<number, GuestConfig>) => {
    if (!propertyId) return;
    setShowCfgStep(false);
    setAdminPendingSave(false);
    setSaving(true);
    try {
      // Converti le chiavi numeriche in stringhe per Firestore
      const cfgsForFirestore: Record<string, any> = {};
      Object.entries(finalCfgs).forEach(([key, val]) => {
        cfgsForFirestore[String(key)] = val;
      });
      
      // Salva TUTTO in un unico PATCH: info + stanze + letti + biancheria
      const saveData: any = {
        name, address: addr, apartment, floor, intercom, city, postalCode,
        checkInTime: checkIn, checkOutTime: checkOut,
        doorCode, keysLocation, accessNotes,
        images: { door: doorImage, building: buildingImage },
        maxGuests, bedrooms, bathrooms,
        bedsConfig: editBeds.map(b => ({
          id: b.id, type: b.type, name: b.name, location: b.loc, capacity: b.cap
        })),
        serviceConfigs: cfgsForFirestore,
      };
      if (hasBathroomChanged) {
        saveData.updateScendibagno = updateScendibagno;
      }
      
      const cleanData = JSON.parse(JSON.stringify(saveData, (key, value) => {
        if (value instanceof HTMLElement || value instanceof Node) return undefined;
        if (typeof value === 'function') return undefined;
        return value;
      }));
      
      const response = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanData),
      });
      if (response.ok) {
        onSave({ 
          name, addr, apartment, floor, intercom, city, postalCode, checkIn, checkOut, 
          doorCode, keysLocation, accessNotes, images: { door: doorImage, building: buildingImage },
          maxGuests, bedrooms, bathrooms,
          newBeds: editBeds.map(b => ({ id: b.id, type: b.type, name: b.name, location: b.loc, capacity: b.cap }))
        }, cfgsForFirestore as unknown as Record<number, GuestConfig>);
        setTimeout(() => onClose(), 500);
      }
    } catch (error) {
      console.error('Error saving admin configs:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCfgDoneAndSend = async (finalCfgs: Record<number, GuestConfig>) => {
    setShowCfgStep(false);
    setRequestCfgs(finalCfgs);
    setSendingRequest(true);
    
    try {
      // Sanitizza per evitare riferimenti circolari
      const cleanCfgs = JSON.parse(JSON.stringify(finalCfgs, (key, value) => {
        if (value instanceof HTMLElement || value instanceof Node) return undefined;
        if (typeof value === 'function') return undefined;
        return value;
      }));
      
      const response = await fetch('/api/property-change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          changeType: 'PROPERTY_UPDATE',
          currentValue: { 
            maxGuests: propData.maxGuests, 
            bedrooms: propData.bedrooms, 
            bathrooms: propData.bathrooms,
            beds: initialBeds.map(b => ({ id: b.id, type: b.type, name: b.name, loc: b.loc, cap: b.cap }))
          },
          requestedValue: { 
            maxGuests, 
            bedrooms, 
            bathrooms,
            beds: editBeds.map(b => ({ id: b.id, type: b.type, name: b.name, loc: b.loc, cap: b.cap }))
          },
          reason: reason || 'Richiesta modifica configurazione stanze e letti',
          newBeds: editBeds.map(b => ({ id: b.id, type: b.type, name: b.name, location: b.loc, capacity: b.cap })),
          requestedServiceConfigs: JSON.stringify(
            Object.fromEntries(Object.entries(cleanCfgs).map(([k, v]) => [String(k), v]))
          ),
        }),
      });
      if (response.ok) {
        setShowSuccess('requested');
        setHasPendingRequest(true);
      }
    } catch (error) { console.error('Error:', error); }
    finally { setSendingRequest(false); }
  };

  // === Invio richiesta cambio bagni (con/senza aggiornamento scendibagno) ===
  const handleSendBathroomRequest = async (withScendibagno: boolean) => {
    setShowScendibagnoConfirm(false);
    setUpdateScendibagno(withScendibagno);
    
    const nextAction = pendingAfterScendibagno;
    setPendingAfterScendibagno(null);
    
    if (nextAction === 'save') {
      // Admin: salva direttamente con la scelta scendibagno
      handleSave(withScendibagno);
    } else if (nextAction === 'configure') {
      // Proprietario: bagni + altre modifiche → apri configuratore con scelta scendibagno
      proceedToConfigurator(withScendibagno);
    } else {
      // 'send': solo bagni cambiati → invia richiesta diretta (proprietario)
      setSendingRequest(true);
      try {
        const response = await fetch('/api/property-change-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyId,
            changeType: 'PROPERTY_UPDATE',
            currentValue: { 
              maxGuests: propData.maxGuests, 
              bedrooms: propData.bedrooms, 
              bathrooms: propData.bathrooms,
              beds: initialBeds.map(b => ({ id: b.id, type: b.type, name: b.name, loc: b.loc, cap: b.cap }))
            },
            requestedValue: { 
              maxGuests, 
              bedrooms, 
              bathrooms,
              beds: editBeds.map(b => ({ id: b.id, type: b.type, name: b.name, loc: b.loc, cap: b.cap }))
            },
            reason: reason || 'Richiesta modifica numero bagni',
            newBeds: editBeds.map(b => ({ id: b.id, type: b.type, name: b.name, location: b.loc, capacity: b.cap })),
            updateScendibagno: withScendibagno,
          }),
        });
        if (response.ok) {
          setShowSuccess('requested');
          setHasPendingRequest(true);
        }
      } catch (error) { console.error('Error:', error); }
      finally { setSendingRequest(false); }
    }
  };

  // CfgModal is now shown inline inside the Stanze tab, no early return needed

  // === MODAL CONFERMA SCENDIBAGNO ===
  if (showScendibagnoConfirm) {
    const oldBath = propData.bathrooms || 1;
    const newBath = bathrooms;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={() => setShowScendibagnoConfirm(false)}>
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-sky-50 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5" className="w-8 h-8">
              <path d="M3 20h18M5 20v-6a2 2 0 012-2h10a2 2 0 012 2v6M9 12V8a3 3 0 016 0v4"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold text-center text-gray-900 mb-1">
            Bagni: {oldBath} → {newBath}
          </h2>
          <p className="text-[13px] text-gray-500 text-center mb-5">
            Vuoi aggiornare automaticamente gli scendibagno in tutte le configurazioni?
          </p>
          <div className="bg-gray-50 rounded-xl p-3 mb-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Scendibagno</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 line-through">{oldBath}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="w-3.5 h-3.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <span className="font-bold text-sky-600">{newBath}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleSendBathroomRequest(false)}
              className="flex-1 py-3 text-[13px] font-semibold text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all">
              No, mantieni
            </button>
            <button onClick={() => handleSendBathroomRequest(true)}
              className="flex-1 py-3 text-[13px] font-semibold text-white bg-sky-500 rounded-xl hover:bg-sky-600 active:scale-[0.98] transition-all">
              Sì, aggiorna
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === SUCCESS SCREEN ===
  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
          <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${showSuccess === 'saved' ? 'bg-emerald-100' : 'bg-sky-100'}`}>
            <span className="text-4xl">{showSuccess === 'saved' ? '✓' : '📨'}</span>
          </div>
          <h2 className="text-xl font-bold text-center mb-2">
            {showSuccess === 'saved' ? 'Salvato!' : 'Richiesta Inviata'}
          </h2>
          <p className="text-sm text-slate-500 text-center mb-6">
            {showSuccess === 'saved' 
              ? 'Le modifiche sono state salvate con successo.' 
              : 'La richiesta è stata inviata. Riceverai una notifica quando verrà processata.'}
          </p>
          <button onClick={onClose} className="w-full py-3 bg-slate-900 text-white font-semibold rounded-xl active:scale-[0.98] transition-transform">
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" style={{ zIndex: 9999 }} onClick={onClose}>
      <div 
        className="bg-white w-full max-w-[500px] rounded-3xl shadow-2xl overflow-hidden flex flex-col" 
        style={{ maxHeight: 'min(calc(100vh - 16px), 100%)', fontFamily: "'Outfit', -apple-system, sans-serif" }} 
        onClick={e => e.stopPropagation()}
      >
        {/* === HEADER === */}
        <div className="flex-shrink-0 px-6 pt-5 pb-0" style={{ fontFamily: "'Outfit', -apple-system, sans-serif" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[19px] font-bold text-gray-900 tracking-tight">Modifica Proprietà</h2>
              <p className="text-[13px] text-gray-400 mt-0.5">{propData.name}</p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
              <div className="w-4 h-4 text-gray-500">{I.close}</div>
            </button>
          </div>
          
          {/* === TABS === */}
          <div className="flex gap-1 bg-gray-100 rounded-[14px] p-1 mb-1">
            <button onClick={() => setActiveTab('info')}
              className={`flex-1 py-2.5 px-2 rounded-[10px] flex items-center justify-center gap-[7px] text-[13px] font-semibold transition-all duration-200 ${
                activeTab === 'info' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
              }`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[18px] h-[18px] flex-shrink-0"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h3"/></svg>
              <span>Info</span>
            </button>
            <button onClick={() => setActiveTab('rooms')}
              className={`flex-1 py-2.5 px-2 rounded-[10px] flex items-center justify-center gap-[7px] text-[13px] font-semibold transition-all duration-200 ${
                activeTab === 'rooms' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
              }`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[18px] h-[18px] flex-shrink-0"><path d="M3 18V12a2 2 0 012-2h14a2 2 0 012 2v6M3 20v-2m18 2v-2M7 10V7a1 1 0 011-1h8a1 1 0 011 1v3"/></svg>
              <span>Stanze</span>
            </button>
            <button onClick={() => setActiveTab('access')}
              className={`flex-1 py-2.5 px-2 rounded-[10px] flex items-center justify-center gap-[7px] text-[13px] font-semibold transition-all duration-200 ${
                activeTab === 'access' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
              }`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-[18px] h-[18px] flex-shrink-0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <span>Accesso</span>
            </button>
          </div>
        </div>

        {/* === CONTENT === */}
        <div className={`overflow-y-auto ${showCfgStep ? 'px-3 py-2' : 'flex-1 px-6 py-5'}`} style={{ scrollbarWidth: 'thin' }}>
          
          {/* ============ TAB: INFO ============ */}
          {activeTab === 'info' && (
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome Proprietà *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} 
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-base transition-all" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Indirizzo *</label>
                <input type="text" value={addr} onChange={(e) => setAddr(e.target.value)} 
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-base transition-all" />
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Interno', value: apartment, setter: setApartment, placeholder: '3' },
                  { label: 'Piano', value: floor, setter: setFloor, placeholder: '2' },
                  { label: 'Citofono', value: intercom, setter: setIntercom, placeholder: 'Rossi' },
                ].map(field => (
                  <div key={field.label}>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{field.label}</label>
                    <input type="text" value={field.value} onChange={(e) => field.setter(e.target.value)} placeholder={field.placeholder}
                      className="w-full px-3 py-3 border border-slate-200 rounded-xl text-center focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-base transition-all" />
                  </div>
                ))}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Città *</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} 
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-base transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">CAP</label>
                  <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} 
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-center focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-base transition-all" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Check-in</label>
                  <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} 
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-center focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-base transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Check-out</label>
                  <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} 
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-center focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-base transition-all" />
                </div>
              </div>
            </div>
          )}

          {/* ============ TAB: STANZE ============ */}
          {activeTab === 'rooms' && (
            <div className={showCfgStep ? "p-3 space-y-2" : "p-5 space-y-3"}>
              {/* === STEP 1: Configurazione stanze === */}
              {!showCfgStep && (
              <>
              {/* Avviso richiesta pendente */}
              {!isAdmin && hasPendingRequest && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <div className="w-4 h-4 text-amber-600">{I.clock}</div>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-800 text-xs">Richiesta in attesa</p>
                    <p className="text-[11px] text-amber-600">Hai già una richiesta pendente</p>
                  </div>
                </div>
              )}

              {/* Ospiti + Bagni */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Max Ospiti */}
                <div className={`rounded-2xl p-3 border-[1.5px] transition-all ${maxGuests !== propData.maxGuests && !isAdmin ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-slate-50/80'}`}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-[34px] h-[34px] rounded-[10px] bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <div className="w-[18px] h-[18px] text-blue-600">{I.users}</div>
                    </div>
                    <span className="text-[13px] font-semibold text-slate-700">Max Ospiti</span>
                    {maxGuests !== propData.maxGuests && !isAdmin && <span className="ml-auto text-[9px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Mod.</span>}
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <button onClick={() => setMaxGuests(Math.max(1, maxGuests - 1))} disabled={maxGuests <= 1 || (!isAdmin && hasPendingRequest)}
                      className="w-9 h-9 rounded-full border-[1.5px] border-slate-200 bg-white flex items-center justify-center text-base font-semibold text-slate-600 hover:border-slate-400 active:scale-90 disabled:opacity-20 transition-all">−</button>
                    <span className="text-[28px] font-extrabold text-slate-900 min-w-[36px] text-center leading-none" style={{letterSpacing: '-0.03em'}}>{maxGuests}</span>
                    <button onClick={() => setMaxGuests(Math.min(20, maxGuests + 1))} disabled={maxGuests >= 20 || (!isAdmin && hasPendingRequest)}
                      className="w-9 h-9 rounded-full border-[1.5px] border-slate-200 bg-white flex items-center justify-center text-base font-semibold text-slate-600 hover:border-slate-400 active:scale-90 disabled:opacity-20 transition-all">+</button>
                  </div>
                  {maxGuests > bedCapacity && bedCapacity > 0 && (
                    <p className="text-[11px] text-amber-700 text-center mt-2 bg-amber-50 py-1.5 rounded-lg border border-amber-200">⚠️ Capacità letti: {bedCapacity}</p>
                  )}
                </div>
                {/* Bagni */}
                <div className={`rounded-2xl p-3 border-[1.5px] transition-all ${bathrooms !== propData.bathrooms && !isAdmin ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-slate-50/80'}`}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-[34px] h-[34px] rounded-[10px] bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <div className="w-[18px] h-[18px] text-emerald-600">{I.bath}</div>
                    </div>
                    <span className="text-[13px] font-semibold text-slate-700">Bagni</span>
                    {bathrooms !== propData.bathrooms && !isAdmin && <span className="ml-auto text-[9px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Mod.</span>}
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <button onClick={() => setBathrooms(Math.max(1, bathrooms - 1))} disabled={bathrooms <= 1 || (!isAdmin && hasPendingRequest)}
                      className="w-9 h-9 rounded-full border-[1.5px] border-slate-200 bg-white flex items-center justify-center text-base font-semibold text-slate-600 hover:border-slate-400 active:scale-90 disabled:opacity-20 transition-all">−</button>
                    <span className="text-[28px] font-extrabold text-slate-900 min-w-[36px] text-center leading-none" style={{letterSpacing: '-0.03em'}}>{bathrooms}</span>
                    <button onClick={() => setBathrooms(Math.min(10, bathrooms + 1))} disabled={bathrooms >= 10 || (!isAdmin && hasPendingRequest)}
                      className="w-9 h-9 rounded-full border-[1.5px] border-slate-200 bg-white flex items-center justify-center text-base font-semibold text-slate-600 hover:border-slate-400 active:scale-90 disabled:opacity-20 transition-all">+</button>
                  </div>
                </div>
              </div>

              {/* Warning capacità */}
              {allBeds.length === 0 && maxGuests > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <div className="w-4 h-4 text-amber-500 flex-shrink-0">{I.warn}</div>
                  <span className="text-xs text-amber-800 font-medium">Nessun letto configurato per {maxGuests} ospiti</span>
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-slate-200"></div>
                <span className="text-[11px] font-bold text-slate-400 uppercase" style={{letterSpacing: '0.06em'}}>Stanze</span>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>

              {/* Room cards */}
              {rooms.map(room => {
                const isOpen = openRooms.has(room.id);
                const rc = room.beds.length;
                const rCap = room.beds.reduce((s, b) => s + b.cap, 0);
                const desc = rc === 0 ? 'Nessun letto' : `${rc} ${rc === 1 ? 'letto' : 'letti'} · ${rCap} posti`;
                return (
                  <div key={room.id} className="border-[1.5px] border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 transition-colors">
                    {/* Room header */}
                    <button onClick={() => toggleRoom(room.id)} className="w-full flex items-center gap-2.5 p-3 bg-slate-50/80 hover:bg-slate-100/80 transition-colors">
                      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{background: 'linear-gradient(135deg, #ede9fe, #f5f3ff)'}}>
                        <div className="w-[18px] h-[18px] text-violet-600">{I.settings}</div>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-[13px] font-bold text-slate-900">{room.name}</p>
                        <p className="text-[11px] text-slate-400 font-medium">{desc}</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); removeRoom(room.id); }} className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors">
                        <div className="w-3.5 h-3.5">{I.trash}</div>
                      </button>
                      <div className={`w-[18px] h-[18px] text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>{I.down}</div>
                    </button>
                    
                    {/* Room body */}
                    {isOpen && (
                      <div className="p-3 border-t border-slate-100 bg-white space-y-2.5">
                        {/* Name edit */}
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">Nome:</label>
                          <input type="text" value={room.name} onChange={e => renameRoom(room.id, e.target.value)} onClick={e => e.stopPropagation()}
                            className="flex-1 px-3 py-2 border-[1.5px] border-slate-200 rounded-[10px] text-[13px] font-semibold text-slate-900 focus:border-violet-400 outline-none transition-all" />
                        </div>

                        {/* Beds */}
                        {room.beds.length > 0 ? room.beds.map(bed => {
                          const colors: Record<string, {bg: string, text: string, capBg: string, capText: string}> = {
                            matr: {bg: 'bg-blue-100', text: 'text-blue-600', capBg: 'bg-blue-100', capText: 'text-blue-700'},
                            sing: {bg: 'bg-violet-100', text: 'text-violet-600', capBg: 'bg-violet-100', capText: 'text-violet-700'},
                            divano: {bg: 'bg-emerald-100', text: 'text-emerald-600', capBg: 'bg-emerald-100', capText: 'text-emerald-700'},
                            castello: {bg: 'bg-amber-100', text: 'text-amber-600', capBg: 'bg-amber-100', capText: 'text-amber-700'},
                          };
                          const c = colors[bed.type] || {bg: 'bg-slate-100', text: 'text-slate-600', capBg: 'bg-slate-100', capText: 'text-slate-700'};
                          const iconMap: Record<string, React.ReactNode> = {matr: I.bedDouble, sing: I.bedSingle, divano: I.sofa, castello: I.bunk};
                          return (
                            <div key={bed.id} className="flex items-center gap-2 p-2 rounded-[10px] border-[1.5px] border-slate-200 bg-white">
                              <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
                                <div className={`w-3.5 h-3.5 ${c.text}`}>{iconMap[bed.type] || I.bed}</div>
                              </div>
                              <span className="text-xs font-semibold text-slate-800 flex-1">{bed.name}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${c.capBg} ${c.capText}`}>{bed.cap}p</span>
                              <button onClick={() => removeBedFromRoom(room.id, bed.id)} className="w-[22px] h-[22px] rounded-md bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors">
                                <div className="w-2.5 h-2.5">{I.close}</div>
                              </button>
                            </div>
                          );
                        }) : (
                          <p className="text-[11px] text-slate-400 text-center py-2">Nessun letto in questa stanza</p>
                        )}

                        {/* Add bed buttons */}
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 mb-1.5">Aggiungi letto in {room.name}:</p>
                          <div className="flex flex-wrap gap-1.5">
                            <button onClick={() => addBedToRoom(room.id, 'matr')}
                              className="flex items-center gap-1 px-2.5 py-1.5 border-[1.5px] border-slate-200 rounded-lg bg-white text-[11px] font-semibold text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 active:scale-95 transition-all">
                              <div className="w-3.5 h-3.5 text-blue-600">{I.bedDouble}</div>Matr. (2p)
                            </button>
                            <button onClick={() => addBedToRoom(room.id, 'sing')}
                              className="flex items-center gap-1 px-2.5 py-1.5 border-[1.5px] border-slate-200 rounded-lg bg-white text-[11px] font-semibold text-slate-500 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 active:scale-95 transition-all">
                              <div className="w-3.5 h-3.5 text-violet-600">{I.bedSingle}</div>Singolo (1p)
                            </button>
                            <button onClick={() => addBedToRoom(room.id, 'divano')}
                              className="flex items-center gap-1 px-2.5 py-1.5 border-[1.5px] border-slate-200 rounded-lg bg-white text-[11px] font-semibold text-slate-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 active:scale-95 transition-all">
                              <div className="w-3.5 h-3.5 text-emerald-600">{I.sofa}</div>Divano (2p)
                            </button>
                            <button onClick={() => addBedToRoom(room.id, 'castello')}
                              className="flex items-center gap-1 px-2.5 py-1.5 border-[1.5px] border-slate-200 rounded-lg bg-white text-[11px] font-semibold text-slate-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600 active:scale-95 transition-all">
                              <div className="w-3.5 h-3.5 text-amber-600">{I.bunk}</div>Castello (2p)
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Aggiungi stanza */}
              <button onClick={addRoom} className="w-full py-3.5 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/50 flex items-center justify-center gap-2 hover:border-blue-300 hover:bg-blue-50/50 active:scale-[0.98] transition-all">
                <div className="w-[18px] h-[18px] text-blue-500">{I.plus}</div>
                <span className="text-[13px] font-bold text-slate-700">Aggiungi stanza</span>
              </button>

              {/* Biancheria */}
              {editBeds.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-3.5 h-3.5 text-slate-500">{I.towel}</div>
                    <span className="text-[11px] font-bold text-slate-600">Biancheria minima richiesta</span>
                  </div>
                  <div className="space-y-0.5">
                    {(() => {
                      let mM = 0, mS = 0;
                      editBeds.forEach(b => { if (b.type === 'matr' || b.type === 'divano' || b.type === 'castello') mM++; else if (b.type === 'sing') mS++; });
                      // @ts-expect-error TODO-FIX: TS2503 Cannot find namespace 'JSX'.
                      const rows: JSX.Element[] = [];
                      if (mM > 0) rows.push(<div key="lm" className="flex items-center justify-between py-1 border-b border-slate-100"><span className="text-[11px] text-slate-500 font-medium flex items-center gap-1"><span className="w-3 h-3 text-blue-500">{I.bedDouble}</span>Lenzuola matr.</span><span className="text-[11px] font-bold text-slate-700">min. {mM * 2}</span></div>);
                      if (mS > 0) rows.push(<div key="ls" className="flex items-center justify-between py-1 border-b border-slate-100"><span className="text-[11px] text-slate-500 font-medium flex items-center gap-1"><span className="w-3 h-3 text-violet-500">{I.bedSingle}</span>Lenzuola sing.</span><span className="text-[11px] font-bold text-slate-700">min. {mS * 2}</span></div>);
                      rows.push(<div key="fd" className="flex items-center justify-between py-1 border-b border-slate-100"><span className="text-[11px] text-slate-500 font-medium flex items-center gap-1"><span className="w-3 h-3 text-slate-500">{I.bed}</span>Federe</span><span className="text-[11px] font-bold text-slate-700">min. {maxGuests}</span></div>);
                      rows.push(<div key="as" className="flex items-center justify-between py-1 border-b border-slate-100"><span className="text-[11px] text-slate-500 font-medium flex items-center gap-1"><span className="w-3 h-3 text-emerald-500">{I.towel}</span>Asciugamani</span><span className="text-[11px] font-bold text-slate-700">min. {maxGuests * 2}</span></div>);
                      rows.push(<div key="tb" className="flex items-center justify-between py-1"><span className="text-[11px] text-slate-500 font-medium flex items-center gap-1"><span className="w-3 h-3 text-sky-500">{I.bath}</span>Teli bagno</span><span className="text-[11px] font-bold text-slate-700">min. {maxGuests}</span></div>);
                      return rows;
                    })()}
                  </div>
                </div>
              )}

              {/* Motivazione */}
              {!isAdmin && hasAnyRoomOrBedChanges && !hasPendingRequest && (
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-3">
                  <label className="block text-xs font-semibold text-sky-800 mb-1.5">Motivazione (opzionale)</label>
                  <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Es: Abbiamo aggiunto un divano letto in soggiorno..."
                    className="w-full px-3 py-2 border border-sky-200 rounded-lg text-xs bg-white focus:border-sky-400 outline-none resize-none" />
                </div>
              )}

              {/* Admin notice */}
              </>
              )}
              {/* ^ End of Step 1 content */}

              {!showCfgStep && (
                <div className="flex items-center gap-1.5 justify-center py-2.5 bg-slate-50 rounded-[10px]">
                  <div className="w-3.5 h-3.5 text-slate-300">{I.info}</div>
                  <span className="text-[11px] text-slate-400 font-medium">Le modifiche a stanze e letti richiedono approvazione admin</span>
                </div>
              )}

              {/* Bottone Continua o Invia Richiesta */}
              {!isAdmin && !showCfgStep && (
                <div className={`rounded-xl p-3 ${hasAnyRoomOrBedChanges && !hasPendingRequest ? 'bg-sky-600' : 'bg-slate-100'}`}>
                  {hasAnyRoomOrBedChanges && !hasPendingRequest ? (
                    <button onClick={handleSendRequest} disabled={sendingRequest}
                      className="w-full text-white font-semibold py-2 text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                      {sendingRequest ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Invio in corso...</>
                      ) : hasBathroomOnlyChange ? (
                        <><div className="w-4 h-4">{I.send}</div> Invia Richiesta di Modifica</>
                      ) : (
                        <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Continua</>
                      )}
                    </button>
                  ) : hasPendingRequest ? (
                    <p className="text-xs text-slate-500 text-center">Attendi l&apos;approvazione della richiesta precedente</p>
                  ) : null}
                </div>
              )}

              {/* === CONFIGURATORE BIANCHERIA INLINE === */}
              {showCfgStep && (
                <CfgModal
                  cfgs={requestCfgs}
                  setCfgs={setRequestCfgs}
                  onClose={() => { setShowCfgStep(false); setAdminPendingSave(false); }}
                  onSave={isAdmin ? handleAdminCfgSave : handleCfgDoneAndSend}
                  maxGuests={maxGuests}
                  propertyBeds={editBeds}
                  embedded={true}
                  onBack={() => { setShowCfgStep(false); setAdminPendingSave(false); }}
                  submitLabel={isAdmin ? (saving ? 'Salvataggio...' : '✅ Salva Configurazione') : (sendingRequest ? 'Invio in corso...' : '📨 Invia Richiesta di Modifica')}
                  preloadedLinen={linen['matr'] || []}
                  preloadedBath={bathItems}
                  preloadedKit={kitItems}
                  preloadedExtras={extras}
                />
              )}
            </div>
          )}

          {/* ============ TAB: ACCESSO ============ */}
          {activeTab === 'access' && (
            <div className="p-4 space-y-4">
              {/* Foto */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">📸 Foto per operatori</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { type: 'door' as const, icon: '🚪', label: 'Porta', image: doorImage, ref: doorInputRef },
                    { type: 'building' as const, icon: '🏢', label: 'Palazzo', image: buildingImage, ref: buildingInputRef },
                  ].map(item => (
                    <div key={item.type}>
                      <p className="text-xs text-slate-500 mb-1.5">{item.icon} {item.label}</p>
                      <div 
                        className={`aspect-square rounded-xl border-2 border-dashed overflow-hidden flex items-center justify-center cursor-pointer relative group transition-all ${
                          item.image ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-sky-300'
                        }`}
                        onClick={() => item.ref.current?.click()}
                      >
                        {uploading === item.type ? (
                          <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
                        ) : item.image ? (
                          <>
                            <img src={item.image} alt={item.label} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button className="p-2 bg-white rounded-lg" onClick={(e) => { e.stopPropagation(); item.ref.current?.click(); }}>
                                <div className="w-5 h-5 text-slate-700">{I.camera}</div>
                              </button>
                              <button className="p-2 bg-red-500 rounded-lg" onClick={(e) => { e.stopPropagation(); handleRemoveImage(item.type); }}>
                                <div className="w-5 h-5 text-white">{I.trash}</div>
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="text-center">
                            <span className="text-3xl">{item.icon}</span>
                            <p className="text-xs text-slate-400 mt-1">Carica foto</p>
                          </div>
                        )}
                      </div>
                      <input ref={item.ref} type="file" accept="image/*" className="hidden" 
                        onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], item.type)} />
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Codici */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">🔢 Codice Porta</label>
                  <input type="text" value={doorCode} onChange={(e) => setDoorCode(e.target.value)} placeholder="1234#"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-base transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">🔑 Chiavi</label>
                  <input type="text" value={keysLocation} onChange={(e) => setKeysLocation(e.target.value)} placeholder="KeyBox 5678"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-base transition-all" />
                </div>
              </div>
              
              {/* Istruzioni */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">📝 Istruzioni di Accesso</label>
                <textarea value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} rows={4}
                  placeholder="Come raggiungere l'appartamento, dove trovare le chiavi..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none text-base resize-none transition-all" />
              </div>
            </div>
          )}
        </div>

        {/* === FOOTER === */}
        {!showCfgStep && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-white flex gap-3">
            <button onClick={onClose} 
              className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all text-[14px]">
              Annulla
            </button>
            {(isAdmin || activeTab !== 'rooms') && (
              <button onClick={() => handleSave()} disabled={saving}
                className={`flex-1 py-3 text-white font-semibold rounded-xl active:scale-[0.98] transition-all text-[14px] flex items-center justify-center gap-2 ${
                  saving ? 'bg-gray-400' : 'bg-sky-500 hover:bg-sky-600'
                }`}>
                {saving ? 'Salvataggio...' : isAdmin && hasAnyRoomOrBedChanges && activeTab === 'rooms' ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Avanti</> : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><path d="M20 6L9 17l-5-5"/></svg>Salva</>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ==================== MAIN COMPONENT ====================
interface PropertyServiceConfigProps {
  isAdmin?: boolean;
  propertyId?: string;
  initialImageUrl?: string | null;
}

// ── Checklist costanti (fuori dal componente per evitare ricreazioni) ─────────
const CHECKLIST_DEFAULT = [
  { id: "1", text: "Cambiare lenzuola e federe", category: "camera" },
  { id: "2", text: "Rifare i letti", category: "camera" },
  { id: "3", text: "Cambiare asciugamani", category: "bagno" },
  { id: "4", text: "Pulire e disinfettare bagno", category: "bagno" },
  { id: "5", text: "Pulire specchi", category: "bagno" },
  { id: "6", text: "Aspirare pavimenti", category: "generale" },
  { id: "7", text: "Lavare pavimenti", category: "generale" },
  { id: "8", text: "Pulire cucina", category: "cucina" },
  { id: "9", text: "Pulire elettrodomestici", category: "cucina" },
  { id: "10", text: "Svuotare frigorifero", category: "cucina" },
  { id: "11", text: "Svuotare cestini", category: "generale" },
  { id: "12", text: "Controllare scorte", category: "generale" },
];
const CHECKLIST_CATS = [
  { value: "camera",    label: "🛏 Camera",    color: "bg-blue-100 text-blue-700" },
  { value: "bagno",     label: "🚿 Bagno",     color: "bg-cyan-100 text-cyan-700" },
  { value: "cucina",    label: "🍳 Cucina",    color: "bg-orange-100 text-orange-700" },
  { value: "soggiorno", label: "🛋 Soggiorno", color: "bg-purple-100 text-purple-700" },
  { value: "generale",  label: "🏠 Generale",  color: "bg-slate-100 text-slate-600" },
];

export default function PropertyServiceConfig({ isAdmin = true, propertyId, initialImageUrl }: PropertyServiceConfigProps) {
  const [tab, setTab] = useState('dashboard');
  const [svcModal, setSvcModal] = useState<Service | null>(null);
  const [cfgModal, setCfgModal] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [deactivateModal, setDeactivateModal] = useState(false);
  const [deactivationRequested, setDeactivationRequested] = useState(false);
  const [icalModal, setIcalModal] = useState(false);
  const [priceModal, setPriceModal] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [guestChangeModal, setGuestChangeModal] = useState<{ serviceId: string; oldGuests: number; newGuests: number; date: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [cfgs, setCfgs] = useState(initCfgs);
  const [services, setServices] = useState<Service[]>(servicesData);
  const [loadingCleanings, setLoadingCleanings] = useState(true);
  const [propertyImage, setPropertyImage] = useState<string | null>(initialImageUrl || null);
  const [editInfoModal, setEditInfoModal] = useState(false);
  const [ratingsModal, setRatingsModal] = useState(false);
  const [ratingsData, setRatingsData] = useState<any>(() => {
    try {
      const cached = localStorage.getItem(`ratings_${propertyId}`);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [propData, setPropData] = useState(prop);
  const [savingImage, setSavingImage] = useState(false);
  const [loadingProperty, setLoadingProperty] = useState(true);
  const [propertyBeds, setPropertyBeds] = useState<Bed[]>([]);
  const [usesOwnLinen, setUsesOwnLinen] = useState(false);
  const [savingLinen, setSavingLinen] = useState(false);
  const [linenConfirmModal, setLinenConfirmModal] = useState(false);
  const [configNeedsReview, setConfigNeedsReview] = useState(false);
  
  // 🔧 Stati per inventario (evita variabili globali che causano re-render)
  const [invLinen, setInvLinen] = useState<LinenItem[]>([]);
  const [invBath, setInvBath] = useState<LinenItem[]>([]);
  const [invKit, setInvKit] = useState<LinenItem[]>([]);
  const [invExtras, setInvExtras] = useState<{ id: string; n: string; p: number; desc: string }[]>([]);
  const [icalLinks, setIcalLinks] = useState<ICalLinks>({
    icalAirbnb: "",
    icalBooking: "",
    icalOktorate: "",
    icalInreception: "",
    icalKrossbooking: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 🔄 Assume mobile su SSR - nessun flash
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 768;
  });
  
  // Conteggio pulizie per timeline ciclo approfondita
  const [cleaningCycleCount, setCleaningCycleCount] = useState<number>(0);
  const [loadingCycleCount, setLoadingCycleCount] = useState(true);

  // ── Checklist personalizzata (solo admin) ──────────────────────────────────
  const [checklist, setChecklist] = useState<{ id: string; text: string; category: string }[]>(CHECKLIST_DEFAULT);
  const [checklistCustom, setChecklistCustom] = useState(false);
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [checklistSaved, setChecklistSaved] = useState(false);
  const [checklistNewText, setChecklistNewText] = useState("");
  const [checklistNewCat, setChecklistNewCat] = useState("generale");
  const [checklistEditId, setChecklistEditId] = useState<string | null>(null);
  const [checklistEditText, setChecklistEditText] = useState("");
  const [checklistOpen, setChecklistOpen] = useState(false);

  // Rileva se siamo su desktop (≥768px)
  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  // Conta pulizie standard completate dopo l'ultima approfondita
  useEffect(() => {
    async function countCleaningCycle() {
      if (!propertyId) {
        setLoadingCycleCount(false);
        return;
      }
      
      try {
        // Query semplice: solo per propertyId, poi filtro in JS
        const cleaningsQuery = query(
          collection(db, "cleanings"),
          where("propertyId", "==", propertyId)
        );
        
        const cleaningsSnap = await getDocs(cleaningsQuery);
        const allCleanings = cleaningsSnap.docs.map(doc => ({
          ...(doc.data() as Record<string, any>),
          id: doc.id
        }));
        
        // Filtra solo le completate
        const completedCleanings = allCleanings.filter(c => 
          // @ts-expect-error TODO-FIX: TS2339 Property 'status' does not exist on type '{ id: string; }'.
          c.status === "COMPLETED" || c.status === "completed"
        );
        
        // Trova l'ultima pulizia approfondita
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
        
        // Conta le pulizie standard completate dopo l'ultima approfondita
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
          // Se non c'è mai stata un'approfondita, conta tutte le standard completate
          standardCount = completedCleanings.filter(c => 
            // @ts-expect-error TODO-FIX: TS2339 Property 'serviceType' does not exist on type '{ id: string; }'.
            !c.serviceType || c.serviceType === "STANDARD"
          ).length;
        }
        
        // Il conteggio è modulo 5 (da 0 a 4, poi si resetta)
        setCleaningCycleCount(standardCount % 5);
      } catch (error) {
        console.error("Errore conteggio ciclo pulizie:", error);
        setCleaningCycleCount(0);
      } finally {
        setLoadingCycleCount(false);
      }
    }
    
    countCleaningCycle();
  }, [propertyId]);

  // Carica i dati REALI della proprietà dal database
  useEffect(() => {
    async function loadPropertyData() {
      if (!propertyId) {
        setLoadingProperty(false);
        return;
      }
      
      try {
        const response = await fetch(`/api/properties/${propertyId}`);
        if (response.ok) {
          const data = await response.json();
          
          const maxGuests = data.maxGuests || 4;
          const bedroomsCount = data.bedrooms || 1;
          
          // Mappa i dati dal database al formato del componente
          setPropData({
            id: data.id || propertyId,
            name: data.name || "Proprietà",
            addr: data.address || "",
            apartment: data.apartment || "",
            floor: data.floor || "",
            intercom: data.intercom || "",
            city: data.city || "",
            postalCode: data.postalCode || "",
            cleanPrice: data.cleaningPrice || 65,
            maxGuests: maxGuests,
            bathrooms: data.bathrooms || 1,
            bedrooms: bedroomsCount,
            checkIn: data.checkInTime || "15:00",
            checkOut: data.checkOutTime || "10:00",
            icalAirbnb: data.icalAirbnb || "",
            icalBooking: data.icalBooking || "",
            icalOktorate: data.icalOktorate || "",
            icalInreception: data.icalInreception || "",
            icalKrossbooking: data.icalKrossbooking || "",
            // Nuovi campi accesso
            doorCode: data.doorCode || "",
            keysLocation: data.keysLocation || "",
            accessNotes: data.accessNotes || "",
            images: data.images || {},
            // Owner info per notifiche
            ownerId: data.ownerId || "",
          });
          
          // Imposta anche i link iCal
          setIcalLinks({
            icalAirbnb: data.icalAirbnb || "",
            icalBooking: data.icalBooking || "",
            icalOktorate: data.icalOktorate || "",
            icalInreception: data.icalInreception || "",
            icalKrossbooking: data.icalKrossbooking || "",
          });
          
          // Imposta immagine se presente
          if (data.imageUrl) {
            setPropertyImage(data.imageUrl);
          }
          
          // Carica stato richiesta disattivazione
          if (data.deactivationRequested) {
            setDeactivationRequested(true);
          }
          
          // Carica stato biancheria propria
          setUsesOwnLinen(data.usesOwnLinen === true);
          
          // Carica flag configurazione da rivedere
          setConfigNeedsReview(data.configNeedsReview === true);
          
          // ==================== GESTIONE LETTI ====================
          let loadedBeds: Bed[] = [];
          
          // 🔍 DEBUG COMPLETO: Cosa contiene data?
          
          // Se esistono letti salvati nel database, usali
          // 🔧 FIX: Cerca sia 'bedsConfig' (vecchio) che 'beds' (nuovo formato)
          const bedsData = data.bedsConfig || data.beds;
          
          if (bedsData && Array.isArray(bedsData) && bedsData.length > 0) {
            loadedBeds = bedsData.map((bed: any) => ({
              id: bed.id,
              type: bed.type,
              name: bed.name,
              loc: bed.location || bed.loc,
              cap: bed.capacity || bed.cap || (bed.type === 'sing' ? 1 : 2)
            }));
          } else if (data.bedConfiguration && Array.isArray(data.bedConfiguration) && data.bedConfiguration.length > 0) {
            // 🔧 FIX: Ricostruisci letti da bedConfiguration (struttura stanze/letti)
            const typeMap: Record<string, { type: string; cap: number; name: string }> = {
              'matrimoniale': { type: 'matr', cap: 2, name: 'Matrimoniale' },
              'singolo': { type: 'sing', cap: 1, name: 'Singolo' },
              'divano': { type: 'divano', cap: 2, name: 'Divano Letto' },
              'piazza_mezza': { type: 'sing', cap: 1, name: 'Piazza e Mezza' },
              'castello': { type: 'castello', cap: 2, name: 'Letto a Castello' },
            };
            
            let bedIndex = 0;
            data.bedConfiguration.forEach((stanza: any) => {
              const stanzaNome = stanza.nome || `Stanza ${bedIndex + 1}`;
              (stanza.letti || []).forEach((letto: any) => {
                const tipoKey = letto.tipo || 'singolo';
                const tipoInfo = typeMap[tipoKey] || { type: 'sing', cap: 1, name: tipoKey };
                const qty = letto.quantita || 1;
                
                for (let i = 0; i < qty; i++) {
                  loadedBeds.push({
                    id: `bed_${bedIndex++}`,
                    type: tipoInfo.type,
                    name: tipoInfo.name,
                    loc: stanzaNome,
                    cap: tipoInfo.cap
                  });
                }
              });
            });
          } else {
            // Genera automaticamente i letti basandosi su maxGuests e bedrooms
            loadedBeds = generateAutoBeds(maxGuests, bedroomsCount);
            
            // Salva i letti generati nel database
            try {
              await fetch(`/api/properties/${propertyId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bedsConfig: loadedBeds.map(bed => ({
                    id: bed.id,
                    type: bed.type,
                    name: bed.name,
                    location: bed.loc,
                    capacity: bed.cap
                  }))
                })
              });
            } catch (err) {
              console.error("Errore salvataggio letti:", err);
            }
          }
          
          // Aggiorna lo stato e la variabile globale
          setPropertyBeds(loadedBeds);
          beds = loadedBeds;
          
          // Carica anche l'inventario per generare le configurazioni corrette
          const inventoryLinen: LinenItem[] = [];
          const inventoryBath: LinenItem[] = [];
          try {
            const invRes = await fetch('/api/inventory/list');
            const invData = await invRes.json();
            
            invData.categories?.forEach((cat: any) => {
              if (cat.id === 'biancheria_letto') {
                cat.items?.forEach((item: any) => {
                  inventoryLinen.push({ 
                    id: item.key || item.id, 
                    n: item.name, 
                    p: item.sellPrice || 0, 
                    d: 1 
                  });
                });
              } else if (cat.id === 'biancheria_bagno') {
                cat.items?.forEach((item: any) => {
                  inventoryBath.push({ 
                    id: item.key || item.id, 
                    n: item.name, 
                    p: item.sellPrice || 0, 
                    d: 1 
                  });
                });
              }
            });
            
            // ==================== AGGIORNA VARIABILI GLOBALI PER SvcModal ====================
            // Assegna gli articoli biancheria letto a tutti i tipi di letto
            linen = {
              matr: inventoryLinen,
              sing: inventoryLinen,
              divano: inventoryLinen,
              castello: inventoryLinen
            };
            bathItems = inventoryBath;
            
            // Carica anche kit cortesia e servizi extra
            invData.categories?.forEach((cat: any) => {
              if (cat.id === 'kit_cortesia') {
                kitItems = cat.items?.map((item: any) => ({
                  id: item.key || item.id,
                  n: item.name,
                  p: item.sellPrice || 0,
                  d: 1
                })) || [];
              } else if (cat.id === 'servizi_extra') {
                extras = cat.items?.map((item: any) => ({
                  id: item.key || item.id,
                  n: item.name,
                  p: item.sellPrice || 0,
                  desc: item.description || ''
                })) || [];
              }
            });
            
            // 🔧 FIX: Aggiorna anche gli stati React per evitare re-render multipli
            setInvLinen(inventoryLinen);
            setInvBath(inventoryBath);
            setInvKit(kitItems);
            setInvExtras(extras);
          } catch (err) {
            console.error("Errore caricamento inventario:", err);
          }
          
          // ==================== CONFIGURAZIONI DOTAZIONI ====================
          // Se esistono configurazioni salvate, usale. Altrimenti genera di default.
          
          if (data.serviceConfigs && typeof data.serviceConfigs === 'object' && Object.keys(data.serviceConfigs).length > 0) {
            // Mostra dettagli config per debug
            Object.entries(data.serviceConfigs).forEach(([guests, cfg]: [string, any]) => {
            });
            
            // 🔧 FIX: Verifica che gli ID dei letti nelle config corrispondano ai letti caricati
            const loadedBedIds = new Set(loadedBeds.map(b => b.id));
            const firstConfig = Object.values(data.serviceConfigs)[0] as any;
            const configBedIds = firstConfig?.beds || [];
            const hasMatchingBeds = configBedIds.some((id: string) => loadedBedIds.has(id));
            
            
            if (hasMatchingBeds || configBedIds.length === 0) {
              // Gli ID corrispondono, usa le configurazioni salvate
              // 🔧 FIX: Unisci con le configurazioni generate per i numeri di ospiti mancanti
              const maxG = data.maxGuests || 7;
              const mergedCfgs: Record<number, GuestConfig> = {};
              
              // Prima genera le configurazioni di base per tutti gli ospiti
              for (let i = 1; i <= maxG; i++) {
                mergedCfgs[i] = genCfg(i);
              }
              
              // Poi sovrascrivi con le configurazioni salvate (che hanno priorità)
              Object.entries(data.serviceConfigs).forEach(([key, value]) => {
                const guestNum = parseInt(key);
                if (!isNaN(guestNum) && guestNum >= 1 && guestNum <= maxG) {
                  mergedCfgs[guestNum] = value as GuestConfig;
                }
              });
              
              setCfgs(mergedCfgs);
            } else {
              // 🔧 MISMATCH: Gli ID non corrispondono
              // Tentativo 1: Ricostruisci i letti dagli ID nelle serviceConfigs
              console.warn("⚠️ MISMATCH ID LETTI! Tentativo ricostruzione da serviceConfigs...");
              
              // Estrai tutti gli ID letti unici da tutte le configurazioni
              const allBedIdsFromConfigs = new Set<string>();
              Object.values(data.serviceConfigs).forEach((cfg: any) => {
                (cfg.beds || []).forEach((id: string) => allBedIdsFromConfigs.add(id));
              });
              
              
              // Ricostruisci i letti usando bedConfiguration per i dettagli
              if (data.bedConfiguration && Array.isArray(data.bedConfiguration)) {
                const reconstructedBeds: Bed[] = [];
                const typeMap: Record<string, { type: string; cap: number; name: string }> = {
                  'matrimoniale': { type: 'matr', cap: 2, name: 'Matrimoniale' },
                  'singolo': { type: 'sing', cap: 1, name: 'Singolo' },
                  'divano': { type: 'divano', cap: 2, name: 'Divano Letto' },
                  'piazza_mezza': { type: 'sing', cap: 1, name: 'Piazza e Mezza' },
                  'castello': { type: 'castello', cap: 2, name: 'Letto a Castello' },
                };
                
                // Prova a matchare ogni ID con i dati di bedConfiguration
                Array.from(allBedIdsFromConfigs).forEach(bedId => {
                  // Estrai info dall'ID (formato: stanza_XXX_tipo_N)
                  const parts = bedId.split('_');
                  const tipo = parts[parts.length - 2] || 'singolo';
                  const tipoInfo = typeMap[tipo] || { type: 'sing', cap: 1, name: tipo };
                  
                  // Trova la stanza corrispondente
                  let stanzaNome = 'Camera';
                  data.bedConfiguration.forEach((stanza: any) => {
                    if (stanza.letti?.some((l: any) => l.tipo === tipo)) {
                      stanzaNome = stanza.nome || 'Camera';
                    }
                  });
                  
                  reconstructedBeds.push({
                    id: bedId, // USA L'ID ORIGINALE!
                    type: tipoInfo.type,
                    name: tipoInfo.name,
                    loc: stanzaNome,
                    cap: tipoInfo.cap
                  });
                });
                
                
                // Usa i letti ricostruiti
                loadedBeds = reconstructedBeds;
                setPropertyBeds(reconstructedBeds);
                beds = reconstructedBeds;
                
                // 🔧 FIX: Unisci configurazioni salvate con quelle generate
                const maxG = data.maxGuests || 7;
                const mergedCfgs: Record<number, GuestConfig> = {};
                for (let i = 1; i <= maxG; i++) {
                  mergedCfgs[i] = genCfg(i);
                }
                Object.entries(data.serviceConfigs).forEach(([key, value]) => {
                  const guestNum = parseInt(key);
                  if (!isNaN(guestNum) && guestNum >= 1 && guestNum <= maxG) {
                    mergedCfgs[guestNum] = value as GuestConfig;
                  }
                });
                setCfgs(mergedCfgs);
                
                // Salva i letti ricostruiti per evitare questo problema in futuro
                try {
                  await fetch(`/api/properties/${propertyId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      beds: reconstructedBeds.map(bed => ({
                        id: bed.id,
                        type: bed.type,
                        name: bed.name,
                        location: bed.loc,
                        capacity: bed.cap
                      }))
                    })
                  });
                } catch (err) {
                  console.error("Errore salvataggio letti:", err);
                }
              } else {
                // Fallback: rigenera tutto
                console.warn("⚠️ Impossibile ricostruire, rigenero configurazioni con letti nuovi...");
                const bathroomsCount = data.bathrooms || 1;
                const newCfgs = generateAllConfigs(maxGuests, loadedBeds, bathroomsCount, inventoryLinen, inventoryBath);
                setCfgs(newCfgs);
                
                // Salva le nuove configurazioni E i letti su Firestore
                try {
                  await fetch(`/api/properties/${propertyId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      serviceConfigs: newCfgs,
                      beds: loadedBeds.map(bed => ({
                        id: bed.id,
                        type: bed.type,
                        name: bed.name,
                        location: bed.loc,
                        capacity: bed.cap
                      }))
                    })
                  });
                } catch (err) {
                  console.error("Errore salvataggio:", err);
                }
              }
            }
          } else {
            // Genera le configurazioni con la logica corretta (letto + bagno)
            const bathroomsCount = data.bathrooms || 1;
            const newCfgs = generateAllConfigs(maxGuests, loadedBeds, bathroomsCount, inventoryLinen, inventoryBath);
            setCfgs(newCfgs);
            
            // Salva le configurazioni generate su Firestore
            try {
              await fetch(`/api/properties/${propertyId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serviceConfigs: newCfgs })
              });
            } catch (err) {
              console.error("Errore salvataggio configurazioni:", err);
            }
          }
          
          // Le pulizie sono caricate in realtime con onSnapshot (vedi useEffect separato)
          setLoadingCleanings(false);

          // Carica checklist personalizzata (solo admin)
          if (isAdmin) {
            if (data.checklist && data.checklist.length > 0) {
              setChecklist(data.checklist);
              setChecklistCustom(true);
            } else {
              setChecklist(CHECKLIST_DEFAULT);
              setChecklistCustom(false);
            }
          }
        }
      } catch (error) {
        console.error("Errore caricamento proprietà:", error);
      } finally {
        setLoadingProperty(false);
      }
    }
    
    loadPropertyData();
  }, [propertyId]);

  // ==================== REALTIME PROPERTY DATA ====================
  // Listener per aggiornamenti realtime sulla proprietà (es. dopo approvazione admin)
  const initialLoadDone = useRef(false);
  
  useEffect(() => {
    if (!propertyId) return;
    
    const propertyRef = doc(db, "properties", propertyId);
    const unsubscribe = onSnapshot(propertyRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      
      // Ignora il primo snapshot (i dati vengono già caricati da loadPropertyData)
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        return;
      }
      
      
      // Aggiorna propData con i dati dal Firestore
      setPropData(prev => ({
        ...prev,
        maxGuests: data.maxGuests ?? prev.maxGuests,
        bedrooms: data.bedrooms ?? prev.bedrooms,
        bathrooms: data.bathrooms ?? prev.bathrooms,
        name: data.name || prev.name,
        addr: data.address || prev.addr,
        apartment: data.apartment || prev.apartment,
        floor: data.floor || prev.floor,
        intercom: data.intercom || prev.intercom,
        city: data.city || prev.city,
        postalCode: data.postalCode || prev.postalCode,
        checkIn: data.checkInTime || prev.checkIn,
        checkOut: data.checkOutTime || prev.checkOut,
        doorCode: data.doorCode ?? prev.doorCode,
        keysLocation: data.keysLocation ?? prev.keysLocation,
        accessNotes: data.accessNotes ?? prev.accessNotes,
        images: data.images || prev.images,
      }));
      
      // Aggiorna letti se presenti
      const bedsData = data.bedsConfig || data.beds;
      if (bedsData && Array.isArray(bedsData) && bedsData.length > 0) {
        const loadedBeds: Bed[] = bedsData.map((b: any, i: number) => ({
          id: b.id || `bed_${i}`,
          type: b.type || 'matr',
          name: b.name || BED_TYPES.find(t => t.tipo === b.type)?.nome || 'Letto',
          loc: b.location || b.loc || b.room || 'Camera',
          cap: b.capacity || b.cap || BED_TYPES.find(t => t.tipo === b.type)?.cap || 2,
        }));
        setPropertyBeds(loadedBeds);
        beds = loadedBeds; // Aggiorna anche la variabile globale
      }
      
      // Aggiorna serviceConfigs se presenti (es. dopo approvazione admin)
      if (data.serviceConfigs && typeof data.serviceConfigs === 'object' && Object.keys(data.serviceConfigs).length > 0) {
        const maxG = data.maxGuests || 7;
        const mergedCfgs: Record<number, GuestConfig> = {};
        
        // Genera config base per tutti gli ospiti
        for (let i = 1; i <= maxG; i++) {
          mergedCfgs[i] = genCfg(i);
        }
        
        // Sovrascrivi con le config salvate
        Object.entries(data.serviceConfigs).forEach(([key, value]) => {
          const guestNum = parseInt(key);
          if (!isNaN(guestNum) && guestNum >= 1 && guestNum <= maxG) {
            mergedCfgs[guestNum] = value as GuestConfig;
          }
        });
        
        setCfgs(mergedCfgs);
      }
      
      // Aggiorna flag configNeedsReview
      if (data.configNeedsReview !== undefined) {
        setConfigNeedsReview(data.configNeedsReview === true);
      }

      // Aggiorna checklist se admin
      if (isAdmin) {
        if (data.checklist && data.checklist.length > 0) {
          setChecklist(data.checklist);
          setChecklistCustom(true);
        } else {
          setChecklist(CHECKLIST_DEFAULT);
          setChecklistCustom(false);
        }
      }
    });
    
    return () => unsubscribe();
  }, [propertyId]);

  // ==================== REALTIME PULIZIE ====================
  useEffect(() => {
    if (!propertyId) return;
    
    
    const q = query(
      collection(db, "cleanings"),
      where("propertyId", "==", propertyId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      
      if (snapshot.docs.length === 0) {
      }
      
      const loadedServices: Service[] = snapshot.docs.map((doc) => {
        const c = doc.data() as Record<string, any>;
        
        let cleaningDate: Date;
        if (c.scheduledDate?.toDate) {
          cleaningDate = c.scheduledDate.toDate();
        } else if (c.scheduledDate?._seconds) {
          cleaningDate = new Date(c.scheduledDate._seconds * 1000);
        } else if (c.date) {
          cleaningDate = new Date(c.date);
        } else {
          cleaningDate = new Date();
        }
        
        const operatorName = c.operatorName || c.operator?.name || "Non assegnato";
        
        return {
          id: doc.id,
          date: cleaningDate.toISOString(),
          time: c.scheduledTime || c.time || "10:00",
          op: operatorName,
          guests: c.guestsCount || c.booking?.guestsCount || propData.maxGuests || 2,
          edit: true,
          bedsConfig: [],
          isModified: false,
          status: c.status === 'COMPLETED' ? 'confirmed' : 'pending',
          // Campi aggiuntivi per EditCleaningModal
          propertyId: propertyId,
          propertyName: propData.name,
          scheduledTime: c.scheduledTime || c.time || "10:00",
          guestsCount: c.guestsCount || c.booking?.guestsCount || propData.maxGuests || 2,
          notes: c.notes || "",
          price: c.price || c.manualPrice || propData.cleanPrice,
          serviceType: c.serviceType || "STANDARD",
          serviceTypeName: c.serviceTypeName || "Pulizia Standard",
          sgrossoReason: c.sgrossoReason || "",
          sgrossoReasonLabel: c.sgrossoReasonLabel || "",
          sgrossoNotes: c.sgrossoNotes || "",
          contractPrice: c.contractPrice || propData.cleanPrice,
          priceModified: c.priceModified || false,
          priceChangeReason: c.priceChangeReason || "",
          originalDate: c.originalDate?.toDate?.() || null,
          dateModifiedAt: c.dateModifiedAt?.toDate?.() || null,
          // Campi per pulizie completate
          photos: c.photos || [],
          startedAt: c.startedAt || null,
          completedAt: c.completedAt || null,
          // Campi per valutazione
          ratingScore: c.ratingScore || null,
          ratingId: c.ratingId || null,
          ratingNotes: c.ratingNotes || "",
          extraServices: c.extraServices || [],
          // 🔧 FIX: Campi per biancheria personalizzata
          customLinenConfig: c.customLinenConfig || null,
          linenConfigModified: c.linenConfigModified || false,
        };
      });
      
      // Ordina per data
      loadedServices.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      setServices(loadedServices);
      setLoadingCleanings(false);
    }, (error) => {
      console.error("❌ Errore listener pulizie:", error);
      setLoadingCleanings(false);
    });
    
    // Cleanup: rimuovi listener quando il componente si smonta
    return () => {
      unsubscribe();
    };
  }, [propertyId]);

  useEffect(() => {
    if (editInfoModal || cfgModal || svcModal || deactivateModal || icalModal || priceModal || guestChangeModal || ratingsModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [editInfoModal, cfgModal, svcModal, deactivateModal, icalModal, priceModal, guestChangeModal, ratingsModal]);

  // Carica ratings quando apre il modal
  const loadRatingsData = async () => {
    if (!propertyId || loadingRatings) return;
    setLoadingRatings(true);
    try {
      const res = await fetch(`/api/property-ratings?propertyId=${propertyId}&months=3`);
      if (res.ok) {
        const data = await res.json();
        setRatingsData(data);
        // Salva in cache localStorage
        try { localStorage.setItem(`ratings_${propertyId}`, JSON.stringify(data)); } catch {}
      } else {
        console.warn("API ratings non disponibile:", res.status);
        if (!ratingsData) setRatingsData(null);
      }
    } catch (err) {
      console.error("Errore caricamento ratings:", err);
      if (!ratingsData) setRatingsData(null);
    }
    setLoadingRatings(false);
  };

  // Carica ratings all'avvio: refresh in background (cache già caricata in useState)
  useEffect(() => {
    if (propertyId) {
      loadRatingsData().catch(() => {});
    }
  }, [propertyId]);

  // 🔥 Comprimi immagine usando la stessa libreria dell operatore (dynamic import = no SES)
  const compressImage = async (file: File, maxWidth = 800, quality = 0.7): Promise<string> => {
    const { compressImage: compress, getOptimalCompressionConfig } = await import('~/lib/photos/imageCompression');
    const config = getOptimalCompressionConfig();
    const result = await compress(file, { ...config, maxWidth, maxHeight: maxWidth, quality });
    if (!result.success || !result.compressedBlob) throw new Error('Compressione fallita');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(result.compressedBlob!);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && propertyId) {
      setSavingImage(true);
      try {
        const base64Image = await compressImage(file);
        setPropertyImage(base64Image);

        const response = await fetch(`/api/properties/${propertyId}/image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: base64Image }),
        });
        if (!response.ok) {
          console.error('Failed to save image');
        }
      } catch (error) {
        console.error('Error saving image:', error);
      }
      setSavingImage(false);
    } else if (file) {
      const compressed = await compressImage(file);
      setPropertyImage(compressed);
    }
  };

  const handleRemoveImage = async () => {
    setPropertyImage(null);
    if (propertyId) {
      try {
        await fetch(`/api/properties/${propertyId}/image`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error('Error removing image:', error);
      }
    }
  };

  const handleSaveService = (updatedService: Service) => {
    setServices(prev => prev.map(s => s.id === updatedService.id ? updatedService : s));
  };

  const handleSavePropertyInfo = (data: Partial<PropertyData> & { newBeds?: any[] }, updatedCfgs?: Record<number, GuestConfig>) => {
    const { newBeds, ...restData } = data;
    setPropData(prev => ({ ...prev, ...restData }));
    if (updatedCfgs) {
      setCfgs(updatedCfgs);
    }
    // Aggiorna i letti se sono stati passati
    if (newBeds && newBeds.length > 0) {
      const mappedBeds: Bed[] = newBeds.map((b: any) => ({
        id: b.id,
        type: b.type || 'matrimoniale',
        name: b.name || b.type || 'Letto',
        location: b.location || b.loc || 'Camera',
        capacity: b.capacity || b.cap || 2,
      }));
      setPropertyBeds(mappedBeds);
    }
  };

  // Toggle biancheria propria (ottimistico: UI istantanea, backend in background)
  const handleToggleLinen = (useOwn: boolean) => {
    if (!propertyId || savingLinen) return;
    
    // Aggiorna UI subito
    setUsesOwnLinen(useOwn);
    setSavingLinen(true); // Previene doppi click durante la richiesta
    
    // Backend in background (fire-and-forget)
    fetch(`/api/properties/${propertyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usesOwnLinen: useOwn }),
    })
    .then(res => res.ok ? res.json() : Promise.reject('Errore'))
    .then(result => {
    })
    .catch(err => {
      console.error('Errore toggle biancheria:', err);
      // Rollback UI in caso di errore
      setUsesOwnLinen(!useOwn);
    })
    .finally(() => setSavingLinen(false));
  };

  // Sincronizza iCal per questa proprietà
  const handleSync = async () => {
    if (!propertyId || syncing) return;
    
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const response = await fetch(`/api/properties/${propertyId}/sync-ical`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSyncResult({
          success: true,
          message: data.message || `Nuove: ${data.stats?.totalNew || 0}, Pulizie: ${data.stats?.totalCleaningsCreated || 0}`
        });
      } else {
        setSyncResult({
          success: false,
          message: data.error || 'Errore durante la sincronizzazione'
        });
      }
    } catch (error) {
      console.error('Errore sync:', error);
      setSyncResult({
        success: false,
        message: 'Errore di connessione'
      });
    } finally {
      setSyncing(false);
      // Nascondi il messaggio dopo 5 secondi
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  // Salva la configurazione dotazioni su Firestore
  const handleSaveConfig = async (configs: Record<number, GuestConfig>) => {
    if (!propertyId || savingConfig) return;
    
    setSavingConfig(true);
    
    try {
      const cleanConfigs = JSON.parse(JSON.stringify(configs, (key, value) => {
        if (value instanceof HTMLElement || value instanceof Node) return undefined;
        if (typeof value === 'function') return undefined;
        return value;
      }));
      
      const response = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceConfigs: cleanConfigs, configNeedsReview: false }),
      });
      
      if (response.ok) {
        setConfigNeedsReview(false);
        
        // Fire-and-forget: aggiorna ordini PENDING
        fetch(`/api/properties/${propertyId}/update-pending-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).then(r => r.ok ? r.json() : null).then(result => {
        }).catch(e => console.warn('⚠️ Errore aggiornamento ordini (non critico):', e));
      } else {
        const errData = await response.json().catch(() => null);
        console.error('❌ Errore salvataggio:', response.status, errData);
        throw new Error('Errore salvataggio');
      }
    } finally {
      setSavingConfig(false);
    }
  };

  // 🔧 FIX: Usa stati React invece di variabili globali per calcolare il prezzo
  const getPrice = (s: Service) => { 
    const c = cfgs[s.guests]; 
    if (!c) return { clean: propData.cleanPrice, linen: 0 }; 
    
    // Usa stati React o fallback a variabili globali
    const currentBath = invBath.length > 0 ? invBath : bathItems;
    const currentKit = invKit.length > 0 ? invKit : kitItems;
    const currentExtras = invExtras.length > 0 ? invExtras : extras;
    
    return { 
      clean: propData.cleanPrice, 
      linen: calcBL(c.bl || {}, invLinen) + calcArr(c.ba || {}, currentBath) + calcArr(c.ki || {}, currentKit) + calcArr((c.ex || {}) as Record<string, boolean>, currentExtras) 
    }; 
  };
  
  // Funzione per aprire la nuova EditCleaningModal
  const openEditCleaningModal = (s: Service) => {
    setSvcModal(s);
  };
  
  const yearlyRevenue = monthlyStats.reduce((sum, m) => sum + m.revenue, 0);
  const currentMonth = monthlyStats[monthlyStats.length - 1];
  const prevMonth = monthlyStats[monthlyStats.length - 2];
  const monthlyTrend = prevMonth ? ((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-4" style={{ fontFamily: "-apple-system, sans-serif" }}>
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } .animate-fadeInUp { animation: fadeInUp 0.3s ease-out forwards; } .stagger-1 { animation-delay: 0.05s; opacity: 0; } .stagger-2 { animation-delay: 0.1s; opacity: 0; } .stagger-3 { animation-delay: 0.15s; opacity: 0; } .stagger-4 { animation-delay: 0.2s; opacity: 0; } .stagger-5 { animation-delay: 0.25s; opacity: 0; } .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; } .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }`}</style>

      <header className="bg-white sticky top-0 z-20 border-b border-slate-200">
        <div className={`flex items-center gap-3 ${isDesktop ? 'px-8 py-4' : 'px-4 py-2'}`}>
          <Link href={isAdmin ? "/dashboard/proprieta" : "/proprietario/proprieta"} className={`rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-95 transition-all ${isDesktop ? 'w-10 h-10' : 'w-8 h-8'}`}><div className={isDesktop ? 'w-5 h-5' : 'w-4 h-4'}>{I.back}</div></Link>
          <div className="flex-1">
            <span className={`font-semibold text-slate-700 ${isDesktop ? 'text-lg' : 'text-sm'}`}>Dettaglio Proprietà</span>
            {isDesktop && <p className="text-sm text-slate-500">{propData.name} • {propData.addr}</p>}
          </div>
          {isDesktop && (
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                Attiva
              </span>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all text-sm font-medium"
              >
                <div className="w-4 h-4">{I.camera}</div>
                Cambia Foto
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={`relative bg-slate-200 ${isDesktop ? 'h-56' : 'h-36'}`}>
        {propertyImage ? (
          <img src={propertyImage} alt="Proprietà" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-300 to-slate-400">
            <div className="text-center">
              <div className={`mx-auto text-white/50 mb-1 ${isDesktop ? 'w-16 h-16' : 'w-10 h-10'}`}>{I.image}</div>
              <p className={`text-white/70 ${isDesktop ? 'text-sm' : 'text-xs'}`}>Nessuna foto</p>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
        {!isDesktop && (
          <div className="absolute top-3 right-3">
            <span className="px-2.5 py-1 bg-emerald-500 text-white text-[10px] font-bold rounded-full shadow-lg flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
              Attiva
            </span>
          </div>
        )}
        <div className={`absolute text-white ${isDesktop ? 'bottom-6 left-8 right-8' : 'bottom-3 left-3 right-3'}`}>
          <h1 className={`font-bold ${isDesktop ? 'text-3xl' : 'text-lg'}`}>{propData.name}</h1>
          <p className={`opacity-90 ${isDesktop ? 'text-base mt-1' : 'text-xs'}`}>{propData.addr}{propData.city ? `, ${propData.city}` : ''}</p>
          {isDesktop && (
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-lg">
                <div className="w-4 h-4">{I.users}</div>
                <span className="text-sm font-medium">{propData.maxGuests} ospiti</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-lg">
                <div className="w-4 h-4">{I.bed}</div>
                <span className="text-sm font-medium">{propData.bedrooms} camere</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-lg">
                <div className="w-4 h-4">{I.bath}</div>
                <span className="text-sm font-medium">{propData.bathrooms} bagni</span>
              </div>
            </div>
          )}
        </div>
        {!isDesktop && (
          <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-3 right-3 w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all">
            <div className="w-4 h-4">{I.camera}</div>
          </button>
        )}
      </div>

      <div className={`bg-slate-100 flex gap-2 sticky z-10 border-b border-slate-200 ${isDesktop ? 'px-8 py-3 top-[73px]' : 'px-3 py-2.5 top-[52px]'}`}>
        <style>{`@keyframes zoomSoft { 0% { transform: scale(1); } 50% { transform: scale(1.15); box-shadow: 0 4px 15px rgba(59,130,246,0.4); } 100% { transform: scale(1); } } .zoom-soft-1 { animation: zoomSoft 0.5s ease-in-out; } .zoom-soft-2 { animation: zoomSoft 0.5s ease-in-out 0.2s; } .zoom-soft-3 { animation: zoomSoft 0.5s ease-in-out 0.4s; }`}</style>
        {[{ k: 'dashboard', l: 'Dashboard', i: 'chart' }, { k: 'services', l: 'Servizi', i: 'clean' }, { k: 'settings', l: 'Impostazioni', i: 'settings' }].map((t, idx) => (
          <button 
            key={t.k} 
            onClick={() => setTab(t.k)} 
            className={`flex items-center justify-center gap-2 rounded-xl font-bold transition-all duration-300 ${
              isDesktop 
                ? `px-8 py-3 text-sm ${tab === t.k ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`
                : `flex-1 py-2.5 text-xs ${tab === t.k ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`
            } ${(editInfoModal || cfgModal || svcModal || deactivateModal || icalModal) ? `zoom-soft-${idx + 1}` : ''}`}
          >
            <div className={isDesktop ? 'w-5 h-5' : 'w-5 h-5'}>{I[t.i]}</div>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div className={isDesktop ? 'p-6 lg:p-8' : 'p-4 space-y-4'}>
          {isDesktop ? (
            /* ========== DESKTOP DASHBOARD LAYOUT ========== */
            <div className="space-y-6">
              {/* Stats Row - 5 cards */}
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-lg hover:border-emerald-200 transition-all group cursor-default">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <div className="w-5 h-5 text-emerald-600">{I.money}</div>
                    </div>
                    <div className="flex items-center gap-1 text-emerald-500">
                      <div className="w-3 h-3">{I.trend}</div>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">€{yearlyRevenue.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-1">Fatturato Annuale</p>
                </div>
                
                <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-lg hover:border-blue-200 transition-all group cursor-default">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <div className="w-5 h-5 text-blue-600">{I.chart}</div>
                    </div>
                    <div className={`flex items-center gap-1 ${monthlyTrend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      <div className="w-3 h-3">{monthlyTrend >= 0 ? I.trend : I.trendDown}</div>
                      <span className="text-xs font-medium">{monthlyTrend >= 0 ? '+' : ''}{monthlyTrend.toFixed(0)}%</span>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">€{currentMonth.revenue}</p>
                  <p className="text-xs text-slate-500 mt-1">Fatturato {currentMonth.month}</p>
                </div>
                
                <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-lg hover:border-purple-200 transition-all group cursor-default">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <div className="w-5 h-5 text-purple-600">{I.clean}</div>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{services.length}</p>
                  <p className="text-xs text-slate-500 mt-1">Pulizie Totali</p>
                </div>
                
                <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-lg hover:border-amber-200 transition-all group cursor-default">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <div className="w-5 h-5 text-amber-600">{I.calendar}</div>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{services.filter(s => new Date(s.date) >= new Date(new Date().setHours(0,0,0,0))).length}</p>
                  <p className="text-xs text-slate-500 mt-1">Programmate</p>
                </div>

                <div 
                  onClick={() => isAdmin && setPriceModal(true)}
                  className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white ${isAdmin ? 'cursor-pointer hover:from-slate-700 hover:to-slate-800' : ''} transition-all group`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <div className="w-5 h-5">{I.clean}</div>
                    </div>
                    {isAdmin && <div className="w-4 h-4 text-white/40">{I.pencil}</div>}
                  </div>
                  <p className="text-2xl font-bold">€{propData.cleanPrice}</p>
                  <p className="text-xs text-white/60 mt-1">Prezzo Pulizia</p>
                </div>
              </div>

              {/* Banner Valutazioni */}
              <div 
                onClick={() => setRatingsModal(true)}
                className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5 hover:shadow-lg hover:border-amber-300 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-2xl shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform">
                      ⭐
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Valutazioni Proprietà</h3>
                      <p className="text-sm text-slate-500">
                        {ratingsData?.summary ? `${ratingsData.summary.totalRatings} valutazioni • Media ${ratingsData.summary.overallAverage.toFixed(1)}/5` : 'Clicca per vedere le valutazioni'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {ratingsData?.summary && (
                      <div className="flex items-center gap-3">
                        <div className={`text-center px-4 py-2 rounded-xl ${
                          ratingsData.summary.overallAverage >= 4 ? 'bg-emerald-100' :
                          ratingsData.summary.overallAverage >= 3 ? 'bg-amber-100' : 'bg-rose-100'
                        }`}>
                          <div className={`text-2xl font-black ${
                            ratingsData.summary.overallAverage >= 4 ? 'text-emerald-600' :
                            ratingsData.summary.overallAverage >= 3 ? 'text-amber-600' : 'text-rose-600'
                          }`}>
                            {ratingsData.summary.overallAverage.toFixed(1)}
                          </div>
                          <div className="text-[10px] text-slate-500">su 5</div>
                        </div>
                        {ratingsData.trend && (
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            ratingsData.trend.direction === 'improving' ? 'bg-emerald-100 text-emerald-700' :
                            ratingsData.trend.direction === 'declining' ? 'bg-rose-100 text-rose-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {ratingsData.trend.direction === 'improving' ? '📈 In crescita' :
                             ratingsData.trend.direction === 'declining' ? '📉 In calo' : '➡️ Stabile'}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-amber-500 group-hover:bg-amber-100 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-3 gap-6">
                {/* Chart - 2 colonne */}
                <div className="col-span-2 bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Andamento Fatturato</h3>
                      <p className="text-sm text-slate-500">Ultimi 12 mesi</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
                        <div className="w-3 h-3 rounded-full bg-sky-500"></div>
                        <span className="text-xs font-medium text-slate-600">Fatturato</span>
                      </div>
                      <div className="px-3 py-1.5 bg-slate-100 rounded-lg">
                        <span className="text-sm font-medium text-slate-600">2025-2026</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-48">
                    <MiniChart data={monthlyStats} />
                  </div>
                </div>

                {/* Prossime Pulizie - 1 colonna */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                        <div className="w-5 h-5 text-sky-600">{I.calendar}</div>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800">Prossime Pulizie</h3>
                        <p className="text-xs text-slate-500">{services.filter(s => new Date(s.date) >= new Date(new Date().setHours(0,0,0,0))).length} programmate</p>
                      </div>
                    </div>
                    <button onClick={() => setTab('services')} className="text-sm text-sky-600 hover:text-sky-700 font-medium">Vedi tutte →</button>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {services.filter(s => new Date(s.date) >= new Date(new Date().setHours(0,0,0,0))).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 5).map((svc) => (
                      <div key={svc.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setExpandedCardId(svc.id)}>
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 flex flex-col items-center justify-center text-white flex-shrink-0">
                          <span className="text-lg font-bold leading-none">{new Date(svc.date).getDate()}</span>
                          <span className="text-[9px] uppercase">{new Date(svc.date).toLocaleDateString('it-IT', { month: 'short' })}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 truncate">{new Date(svc.date).toLocaleDateString('it-IT', { weekday: 'long' })}</p>
                          <p className="text-xs text-slate-500">{svc.time} • {svc.op}</p>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg">
                          <div className="w-4 h-4 text-slate-500">{I.users}</div>
                          <span className="text-sm font-semibold text-slate-700">{svc.guests}</span>
                        </div>
                      </div>
                    ))}
                    {services.filter(s => new Date(s.date) >= new Date(new Date().setHours(0,0,0,0))).length === 0 && (
                      <div className="px-5 py-8 text-center">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <div className="w-6 h-6 text-slate-400">{I.calendar}</div>
                        </div>
                        <p className="text-slate-500">Nessuna pulizia programmata</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Timeline Ciclo Pulizia Approfondita - Desktop - SOLO ADMIN */}
              {isAdmin && (
              <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 rounded-2xl border border-indigo-100 p-6 hover:shadow-lg transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-indigo-800">Ciclo Pulizia Approfondita</h3>
                      <p className="text-sm text-indigo-600">Ogni 5 pulizie standard viene eseguita una pulizia approfondita</p>
                    </div>
                  </div>
                  {cleaningCycleCount === 4 && (
                    <div className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-bold text-sm animate-pulse">
                      🎯 Prossima: Approfondita!
                    </div>
                  )}
                </div>
                
                {loadingCycleCount ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    {/* Timeline visuale */}
                    <div className="flex-1 flex items-center justify-between px-4">
                      {[1, 2, 3, 4, 5].map((step, idx) => (
                        <div key={step} className="flex items-center">
                          <div className="flex flex-col items-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                              step <= cleaningCycleCount 
                                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-300' 
                                : step === cleaningCycleCount + 1
                                  ? 'bg-white border-2 border-indigo-400 text-indigo-600 ring-4 ring-indigo-100'
                                  : 'bg-slate-100 text-slate-400 border border-slate-200'
                            }`}>
                              {step === 5 ? (
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                </svg>
                              ) : step}
                            </div>
                            <span className={`text-xs mt-2 font-medium ${step <= cleaningCycleCount ? 'text-indigo-600' : 'text-slate-400'}`}>
                              {step === 5 ? 'Approfondita' : `Pulizia ${step}`}
                            </span>
                          </div>
                          {idx < 4 && (
                            <div className={`w-16 h-1 mx-2 rounded-full transition-all ${
                              step < cleaningCycleCount ? 'bg-indigo-400' : 'bg-slate-200'
                            }`}></div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {/* Counter */}
                    <div className="text-center px-6 py-4 bg-white rounded-xl border border-indigo-100">
                      <p className="text-3xl font-bold text-indigo-600">{cleaningCycleCount}/5</p>
                      <p className="text-xs text-slate-500 mt-1">Completate</p>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* ─── SEZIONE DURATA PULIZIE - DESKTOP (SOLO ADMIN) ─── */}
              {isAdmin && (
              <PropertyDurationStats 
                // @ts-expect-error TODO-FIX: TS2322 Type 'string | undefined' is not assignable to type 'string'.
                propertyId={propertyId}
                bedrooms={propData.bedrooms || 1}
                bathrooms={propData.bathrooms || 1}
                isAdmin={isAdmin}
              />
              )}
            </div>
          ) : (
            /* ========== MOBILE DASHBOARD LAYOUT ========== */
            <>
          {/* Prezzo + Valutazione Row */}
          <div className="grid grid-cols-2 gap-2.5 animate-fadeInUp stagger-1">
            {/* Card Prezzo */}
            <div 
              onClick={() => isAdmin && setPriceModal(true)}
              className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-[14px] text-white h-[150px] overflow-hidden relative flex flex-col items-center justify-center text-center pt-2.5 ${isAdmin ? 'cursor-pointer hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] active:scale-[0.98] transition-all' : ''}`}
            >
              {/* € watermark */}
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[120px] font-black text-sky-400/[0.04] leading-none pointer-events-none">€</span>
              {/* Icon */}
              <div className="absolute top-3.5 left-3.5 w-[34px] h-[34px] rounded-[9px] bg-sky-400/[0.12] flex items-center justify-center">
                <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              </div>
              <p className="text-[54px] font-black leading-none tracking-tighter relative z-[1]">{propData.cleanPrice}€</p>
              <p className="text-[12px] text-white/[0.45] font-bold uppercase tracking-[1.5px] mt-1.5 relative z-[1]">Prezzo Pulizia</p>
            </div>
            {/* Card Valutazione */}
            <div 
              onClick={() => setRatingsModal(true)}
              className="rounded-[14px] text-white h-[150px] overflow-hidden flex flex-col cursor-pointer hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.25)] active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(160deg, #1e293b 0%, #44403c 50%, #78716c 100%)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between h-[34px] flex-shrink-0 px-4 pt-3.5">
                <div className="flex items-center gap-2">
                  <div className="w-[34px] h-[34px] rounded-[9px] bg-amber-400/[0.12] flex items-center justify-center">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#fbbf24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  </div>
                  <span className="text-[11px] text-white/[0.55] font-medium">Valutazione</span>
                </div>
                <div className="w-7 h-7 rounded-lg bg-white/[0.08] flex items-center justify-center hover:bg-white/[0.15] transition-all">
                  <svg className="w-3.5 h-3.5 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7"/></svg>
                </div>
              </div>
              {/* Body */}
              <div className="flex-1 flex flex-col items-center justify-center">
                {ratingsData?.summary ? (
                  <>
                    <p className="text-[44px] font-black leading-none tracking-tighter">{ratingsData.summary.overallAverage.toFixed(1)}</p>
                    <div className="flex gap-[3px] mt-1.5 h-[22px] items-center">
                      {[1,2,3,4,5].map(s => (
                        <svg key={s} className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill={s <= Math.round(ratingsData.summary.overallAverage) ? '#fbbf24' : 'rgba(255,255,255,0.15)'}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-10 bg-white/[0.08] rounded-lg animate-pulse"></div>
                    <div className="flex gap-[3px] mt-1.5 h-[22px] items-center">
                      {[1,2,3,4,5].map(s => (
                        <div key={s} className="w-[15px] h-[15px] bg-white/[0.06] rounded-sm animate-pulse"></div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* Footer */}
              <div className="h-5 flex-shrink-0 flex items-center px-4 pb-3.5">
                {ratingsData?.summary ? (
                  <>
                    <span className="text-[10px] text-white/40">{ratingsData.summary.totalRatings} valutazioni</span>
                    {ratingsData.trend && (
                      <span className={`ml-auto inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md ${
                        ratingsData.trend.direction === 'improving' ? 'bg-emerald-400/[0.15] text-emerald-300' :
                        ratingsData.trend.direction === 'declining' ? 'bg-rose-400/[0.15] text-rose-300' :
                        'bg-white/10 text-white/40'
                      }`}>
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>
                        {ratingsData.trend.direction === 'improving' ? 'In crescita' : ratingsData.trend.direction === 'declining' ? 'In calo' : 'Stabile'}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 w-full">
                    <div className="w-20 h-3 bg-white/[0.06] rounded animate-pulse"></div>
                    <div className="ml-auto w-16 h-4 bg-white/[0.06] rounded animate-pulse"></div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Info Proprietà - Variante 2: Dark Header + Card Colorate */}
          <div className="bg-white rounded-xl border overflow-hidden animate-fadeInUp stagger-2">
            {/* Dark Header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-bold text-white">Info Proprietà</h3>
                <span className="text-[10px] text-white/60">Configurazione stanze e servizi</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { icon: I.users, val: propData.maxGuests, label: 'Ospiti' },
                  { icon: I.bed, val: propData.bedrooms || 1, label: 'Camere' },
                  { icon: I.bath, val: propData.bathrooms, label: 'Bagni' },
                  { icon: I.clock, val: propData.checkIn, label: 'Check-in' },
                  { icon: I.clock, val: propData.checkOut, label: 'Check-out' },
                ].map((s, i) => (
                  <div key={i} className="text-center py-2.5 px-1 bg-white/[0.08] rounded-lg hover:bg-white/[0.12] transition-colors">
                    <div className="w-5 h-5 mx-auto mb-1.5 text-white/70">{s.icon}</div>
                    <p className="text-[15px] font-extrabold text-white leading-none">{s.val}</p>
                    <p className="text-[8px] text-white/60 uppercase tracking-wider mt-1.5 font-semibold">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Room Cards */}
            <div className="p-3.5 space-y-2">
              <div className="flex items-center gap-2 px-1 mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Configurazione stanze</span>
                <div className="flex-1 h-px bg-slate-100"></div>
              </div>
              {propertyBeds.length > 0 ? (() => {
                  // Raggruppa letti per stanza (loc)
                  const roomsMap: Record<string, typeof propertyBeds> = {};
                  propertyBeds.forEach(bed => {
                    const room = bed.loc || 'Stanza';
                    if (!roomsMap[room]) roomsMap[room] = [];
                    roomsMap[room].push(bed);
                  });
                  return Object.entries(roomsMap).map(([roomName, beds], ri) => {
                    const isSoggiorno = roomName.toLowerCase().includes('soggiorno') || beds.some(b => b.type === 'divano');
                    const roomCap = beds.reduce((s, b) => s + b.cap, 0);
                    // Conta letti per tipo
                    const bedCounts: Record<string, number> = {};
                    beds.forEach(b => { bedCounts[b.type] = (bedCounts[b.type] || 0) + 1; });
                    return (
                      <div key={ri} className={`rounded-xl p-3 flex items-center gap-3 transition-all hover:translate-x-0.5 ${
                        isSoggiorno 
                          ? 'bg-gradient-to-r from-amber-50 to-amber-50/50 border border-amber-200/60 border-l-[3px] border-l-amber-400' 
                          : 'bg-gradient-to-r from-sky-50 to-sky-50/50 border border-sky-200/60 border-l-[3px] border-l-sky-400'
                      }`}>
                        {/* Room Icon */}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm ${
                          isSoggiorno ? 'shadow-amber-100' : 'shadow-sky-100'
                        }`}>
                          <div className={`w-5 h-5 ${isSoggiorno ? 'text-amber-500' : 'text-sky-500'}`}>
                            {isSoggiorno ? I.sofa : I.bed}
                          </div>
                        </div>
                        {/* Room Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-slate-700">{roomName}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(bedCounts).map(([type, count]) => {
                              const typeConfig: Record<string, { bg: string; color: string; label: string }> = {
                                matr: { bg: 'bg-blue-50 border-blue-200', color: 'text-blue-600', label: 'Matrimoniale' },
                                sing: { bg: 'bg-violet-50 border-violet-200', color: 'text-violet-600', label: 'Singolo' },
                                divano: { bg: 'bg-amber-50 border-amber-200', color: 'text-amber-600', label: 'Divano Letto' },
                                castello: { bg: 'bg-emerald-50 border-emerald-200', color: 'text-emerald-600', label: 'Castello' },
                              };
                              const cfg = typeConfig[type] || { bg: 'bg-slate-50 border-slate-200', color: 'text-slate-600', label: type };
                              return (
                                <span key={type} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border ${cfg.bg} ${cfg.color}`}>
                                  <span className="w-3 h-3">{getBedIcon(type)}</span>
                                  {count > 1 ? `${count}× ` : ''}{cfg.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        {/* Capacity */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="w-[18px] h-[18px] text-slate-400">{I.users}</div>
                          <span className="text-[14px] font-extrabold text-slate-600">{roomCap}p</span>
                        </div>
                      </div>
                    );
                  });
                })() : (
                  <div className="flex flex-col gap-2">
                    {[1, 2].map(i => (
                      <div key={i} className="rounded-xl p-3 flex items-center gap-3 bg-slate-50 border border-slate-100 animate-pulse">
                        <div className="w-10 h-10 rounded-lg bg-slate-200 flex-shrink-0"></div>
                        <div className="flex-1">
                          <div className="h-3.5 w-28 bg-slate-200 rounded mb-2"></div>
                          <div className="h-3 w-20 bg-slate-100 rounded"></div>
                        </div>
                        <div className="h-4 w-8 bg-slate-200 rounded"></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
          </div>
          
          {/* Accesso Proprietà - nella dashboard */}
          <div className="animate-fadeInUp stagger-3">
            <PropertyAccessCard 
              property={{
                address: propData.addr,
                city: propData.city,
                postalCode: propData.postalCode,
                floor: propData.floor,
                apartment: propData.apartment,
                intercom: propData.intercom,
                doorCode: propData.doorCode,
                keysLocation: propData.keysLocation,
                accessNotes: propData.accessNotes,
                images: propData.images,
              }}
              editable={true}
              onEdit={() => setEditInfoModal(true)}
            />
          </div>

          
          {/* Timeline Ciclo Pulizia Approfondita - Mobile - SOLO ADMIN */}
          {isAdmin && (
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 p-4 animate-fadeInUp stagger-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-indigo-800">Ciclo Approfondita</h3>
                </div>
              </div>
              <span className="text-sm font-bold text-indigo-600">{cleaningCycleCount}/5</span>
            </div>
            
            {loadingCycleCount ? (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                {/* Barra progresso semplice */}
                <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-400 to-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${(cleaningCycleCount / 5) * 100}%` }}
                  ></div>
                </div>
                
                {/* Info */}
                <div className="text-center mt-2">
                  {cleaningCycleCount === 4 ? (
                    <p className="text-xs text-indigo-700 font-medium">
                      🎯 La prossima sarà <span className="font-bold">Approfondita</span>!
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      {cleaningCycleCount} completate • {5 - cleaningCycleCount} alla prossima approfondita
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
          )}
          
          <div className="bg-white rounded-xl border overflow-hidden animate-fadeInUp stagger-4">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><div className="w-4 h-4 text-slate-600">{I.clean}</div></div><div><h3 className="text-sm font-semibold">Prossime Pulizie</h3><p className="text-[10px] text-slate-500">{services.filter(s => new Date(s.date) >= new Date(new Date().setHours(0,0,0,0))).length} programmate</p></div></div><button onClick={() => setTab('services')} className="text-[11px] text-slate-500 hover:text-slate-700">Vedi tutte →</button></div>
            <div className="divide-y divide-slate-50">{services.filter(s => new Date(s.date) >= new Date(new Date().setHours(0,0,0,0))).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 4).map((svc) => (<div key={svc.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors"><div className="w-10 h-10 rounded-lg bg-slate-100 flex flex-col items-center justify-center"><span className="text-xs font-bold text-slate-700">{new Date(svc.date).getDate()}</span><span className="text-[8px] text-slate-500 uppercase">{new Date(svc.date).toLocaleDateString('it-IT', { month: 'short' })}</span></div><div className="flex-1"><p className="text-xs font-medium">{new Date(svc.date).toLocaleDateString('it-IT', { weekday: 'long' })}</p><p className="text-[10px] text-slate-500">{svc.time} • {svc.op}</p></div><div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-lg"><div className="w-3.5 h-3.5 text-slate-500">{I.users}</div><span className="text-xs font-medium text-slate-600">{svc.guests}</span></div></div>))}{services.filter(s => new Date(s.date) >= new Date(new Date().setHours(0,0,0,0))).length === 0 && (<div className="px-4 py-6 text-center"><p className="text-sm text-slate-400">Nessuna pulizia programmata</p></div>)}</div>
          </div>
          {/* ─── SEZIONE DURATA PULIZIE - MOBILE (SOLO ADMIN) ─── */}
          {isAdmin && (
          <PropertyDurationStats 
            // @ts-expect-error TODO-FIX: TS2322 Type 'string | undefined' is not assignable to type 'string'.
            propertyId={propertyId}
            bedrooms={propData.bedrooms || 1}
            bathrooms={propData.bathrooms || 1}
            isAdmin={isAdmin}
          />
          )}
            </>
          )}
        </div>
      )}

      {tab === 'services' && (
        <div className={isDesktop ? 'p-6 lg:p-8' : 'p-4 space-y-3'}>
          {loadingCleanings ? (
            <div className={`bg-white rounded-xl border text-center animate-fadeInUp ${isDesktop ? 'p-12' : 'p-8'}`}>
              <div className={`mx-auto mb-4 ${isDesktop ? 'w-16 h-16' : 'w-12 h-12'}`}>
                <div className={`animate-spin rounded-full border-b-2 border-sky-500 ${isDesktop ? 'h-16 w-16' : 'h-12 w-12'}`}></div>
              </div>
              <p className={`text-slate-500 ${isDesktop ? 'text-base' : 'text-sm'}`}>Caricamento pulizie...</p>
            </div>
          ) : services.length === 0 ? (
            <div className={`bg-white rounded-xl border text-center animate-fadeInUp ${isDesktop ? 'p-12' : 'p-8'}`}>
              <div className={`mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center ${isDesktop ? 'w-20 h-20' : 'w-16 h-16'}`}>
                <div className={`text-slate-400 ${isDesktop ? 'w-10 h-10' : 'w-8 h-8'}`}>{I.clean}</div>
              </div>
              <h3 className={`font-semibold text-slate-700 mb-2 ${isDesktop ? 'text-xl' : 'text-lg'}`}>Nessuna pulizia programmata</h3>
              <p className={`text-slate-500 mb-4 ${isDesktop ? 'text-base' : 'text-sm'}`}>Non ci sono pulizie programmate per questa proprietà.</p>
            </div>
          ) : isDesktop ? (
            /* ========== DESKTOP SERVICES - TABELLA ========== */
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center">
                    <div className="w-6 h-6 text-sky-600">{I.clean}</div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Pulizie Programmate</h2>
                    <p className="text-sm text-slate-500">{services.length} totali • {services.filter(s => new Date(s.date) >= new Date(new Date().setHours(0,0,0,0))).length} in programma</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                    {services.filter(s => new Date(s.date) >= new Date(new Date().setHours(0,0,0,0))).length} Future
                  </span>
                  <span className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">
                    {services.filter(s => new Date(s.date) < new Date(new Date().setHours(0,0,0,0))).length} Completate
                  </span>
                </div>
              </div>
              
              {/* Tabella */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Data</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Orario</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Operatore</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Ospiti</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Stato</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Prezzo</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {services.map((s) => {
                      const p = getPrice(s);
                      const isPast = new Date(s.date) < new Date(new Date().setHours(0,0,0,0));
                      const isTodayService = isSameDay(new Date(s.date), new Date());
                      return (
                        <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${isPast ? 'opacity-60' : ''} ${isTodayService ? 'bg-sky-50/50' : ''}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center text-white flex-shrink-0 ${isPast ? 'bg-slate-400' : isTodayService ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-gradient-to-br from-sky-500 to-sky-600'}`}>
                                <span className="text-lg font-bold leading-none">{new Date(s.date).getDate()}</span>
                                <span className="text-[9px] uppercase">{new Date(s.date).toLocaleDateString('it-IT', { month: 'short' })}</span>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800 capitalize">{new Date(s.date).toLocaleDateString('it-IT', { weekday: 'long' })}</p>
                                <p className="text-xs text-slate-500">{new Date(s.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-medium text-slate-700">{s.time}</span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-medium text-slate-700">{s.op}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button 
                              onClick={() => setGuestChangeModal({ serviceId: s.id, oldGuests: s.guests, newGuests: s.guests, date: new Date(s.date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) })}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group"
                            >
                              <div className="w-4 h-4 text-blue-500">{I.users}</div>
                              <span className="text-sm font-semibold text-blue-700">{s.guests}</span>
                              <div className="w-3 h-3 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">{I.pencil}</div>
                            </button>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {isPast ? (
                              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">Completata</span>
                            ) : isTodayService ? (
                              <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full animate-pulse">Oggi</span>
                            ) : (
                              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">Programmata</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div>
                              <span className="text-lg font-bold text-slate-800">€{formatPrice(p.clean + p.linen)}</span>
                              <p className="text-xs text-slate-400">Pulizia €{formatPrice(p.clean)} + Dotazioni €{formatPrice(p.linen)}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => setExpandedCardId(expandedCardId === s.id ? null : s.id)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Dettagli"
                              >
                                <div className="w-5 h-5">{I.info}</div>
                              </button>
                              <button 
                                onClick={() => openEditCleaningModal(s)}
                                className="p-2 text-sky-500 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors"
                                title="Modifica"
                              >
                                <div className="w-5 h-5">{I.edit}</div>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ========== MOBILE SERVICES - NUOVO COMPONENTE ========== */
            <PropertyServicesSection 
              propertyId={propertyId || ''}
              property={{
                id: propertyId || '',
                name: propData.name,
                address: propData.addr,
                cleaningPrice: propData.cleanPrice,
                maxGuests: propData.maxGuests,
                bedrooms: propData.bedrooms,
                bathrooms: propData.bathrooms,
                // @ts-expect-error TODO-FIX: TS2322 Type 'Bed[]' is not assignable to type 'BedConfig[]'.
                bedsConfig: propertyBeds,
                serviceConfigs: cfgs
              }}
              onEditService={(cleaning) => setSvcModal(cleaning as any)}
              isAdmin={isAdmin}
            />
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className={isDesktop ? 'p-6 lg:p-8' : 'p-4 space-y-3'}>
          {isDesktop ? (
            /* ========== DESKTOP SETTINGS LAYOUT ========== */
            <div className="grid grid-cols-3 gap-6">
              {/* Colonna Sinistra - Foto & Info */}
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition-all">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <div className="w-5 h-5 text-slate-600">{I.camera}</div>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Foto Proprietà</h3>
                  </div>
                  <div className="flex items-start gap-5">
                    <div className="w-28 h-28 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center cursor-pointer relative group border-2 border-dashed border-slate-300 hover:border-sky-400 transition-colors" onClick={() => fileInputRef.current?.click()}>
                      {propertyImage ? (<><img src={propertyImage} alt="Proprietà" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><div className="w-8 h-8 text-white">{I.camera}</div></div></>) : (<div className="w-10 h-10 text-slate-300">{I.camera}</div>)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-600 mb-3">{propertyImage ? 'Clicca per cambiare foto' : 'Aggiungi una foto della proprietà'}</p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 active:scale-95 transition-all">{propertyImage ? 'Cambia Foto' : 'Carica Foto'}</button>
                        {propertyImage && <button onClick={handleRemoveImage} className="px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-xl hover:bg-red-100 active:scale-95 transition-all">Rimuovi</button>}
                      </div>
                    </div>
                  </div>
                </div>

                <button onClick={() => setEditInfoModal(true)} className="w-full bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-5 hover:shadow-lg hover:border-sky-200 transition-all active:scale-[0.99]">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                    <div className="w-7 h-7 text-slate-600">{I.edit}</div>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-base font-bold text-slate-800">Modifica Informazioni</p>
                    <p className="text-sm text-slate-500">Nome, indirizzo, orari, capacità</p>
                  </div>
                  <div className="w-6 h-6 text-slate-400">{I.right}</div>
                </button>
                
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all">
                  {/* Dark Header */}
                  <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[14px] font-bold text-white">Info Proprietà</h3>
                      <span className="text-[10px] text-white/60">Configurazione stanze e servizi</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        { icon: I.users, val: propData.maxGuests, label: 'Ospiti' },
                        { icon: I.bed, val: propData.bedrooms || 1, label: 'Camere' },
                        { icon: I.bath, val: propData.bathrooms, label: 'Bagni' },
                        { icon: I.clock, val: propData.checkIn, label: 'Check-in' },
                        { icon: I.clock, val: propData.checkOut, label: 'Check-out' },
                      ].map((s, i) => (
                        <div key={i} className="text-center py-2.5 px-1 bg-white/[0.08] rounded-lg hover:bg-white/[0.12] transition-colors">
                          <div className="w-5 h-5 mx-auto mb-1.5 text-white/70">{s.icon}</div>
                          <p className="text-[15px] font-extrabold text-white leading-none">{s.val}</p>
                          <p className="text-[8px] text-white/60 uppercase tracking-wider mt-1.5 font-semibold">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Room Cards */}
                  {propertyBeds.length > 0 && (
                    <div className="p-4 space-y-2">
                      <div className="flex items-center gap-2 px-1 mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Configurazione stanze</span>
                        <div className="flex-1 h-px bg-slate-100"></div>
                      </div>
                      {(() => {
                        const roomsMap: Record<string, typeof propertyBeds> = {};
                        propertyBeds.forEach(bed => {
                          const room = bed.loc || 'Stanza';
                          if (!roomsMap[room]) roomsMap[room] = [];
                          roomsMap[room].push(bed);
                        });
                        return Object.entries(roomsMap).map(([roomName, beds], ri) => {
                          const isSoggiorno = roomName.toLowerCase().includes('soggiorno') || beds.some(b => b.type === 'divano');
                          const roomCap = beds.reduce((s, b) => s + b.cap, 0);
                          const bedCounts: Record<string, number> = {};
                          beds.forEach(b => { bedCounts[b.type] = (bedCounts[b.type] || 0) + 1; });
                          return (
                            <div key={ri} className={`rounded-xl p-3 flex items-center gap-3 transition-all hover:translate-x-0.5 ${
                              isSoggiorno 
                                ? 'bg-gradient-to-r from-amber-50 to-amber-50/50 border border-amber-200/60 border-l-[3px] border-l-amber-400' 
                                : 'bg-gradient-to-r from-sky-50 to-sky-50/50 border border-sky-200/60 border-l-[3px] border-l-sky-400'
                            }`}>
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-sm ${
                                isSoggiorno ? 'shadow-amber-100' : 'shadow-sky-100'
                              }`}>
                                <div className={`w-5 h-5 ${isSoggiorno ? 'text-amber-500' : 'text-sky-500'}`}>
                                  {isSoggiorno ? I.sofa : I.bed}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-bold text-slate-700">{roomName}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {Object.entries(bedCounts).map(([type, count]) => {
                                    const typeConfig: Record<string, { bg: string; color: string; label: string }> = {
                                      matr: { bg: 'bg-blue-50 border-blue-200', color: 'text-blue-600', label: 'Matrimoniale' },
                                      sing: { bg: 'bg-violet-50 border-violet-200', color: 'text-violet-600', label: 'Singolo' },
                                      divano: { bg: 'bg-amber-50 border-amber-200', color: 'text-amber-600', label: 'Divano Letto' },
                                      castello: { bg: 'bg-emerald-50 border-emerald-200', color: 'text-emerald-600', label: 'Castello' },
                                    };
                                    const cfg = typeConfig[type] || { bg: 'bg-slate-50 border-slate-200', color: 'text-slate-600', label: type };
                                    return (
                                      <span key={type} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border ${cfg.bg} ${cfg.color}`}>
                                        <span className="w-3 h-3">{getBedIcon(type)}</span>
                                        {count > 1 ? `${count}× ` : ''}{cfg.label}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <div className="w-[18px] h-[18px] text-slate-400">{I.users}</div>
                                <span className="text-[14px] font-extrabold text-slate-600">{roomCap}p</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Colonna Centro - Azioni */}
              <div className="space-y-4">
                {configNeedsReview && (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3 animate-pulse">
                    <span className="text-2xl mt-0.5">⚠️</span>
                    <div>
                      <p className="font-semibold text-amber-800">Configurazione da aggiornare</p>
                      <p className="text-sm text-amber-600 mt-1">I letti o il numero di ospiti sono stati modificati. Apri il configuratore dotazioni per verificare e aggiornare la biancheria.</p>
                    </div>
                  </div>
                )}
                {/* Card unificata: Configurazione Dotazioni + Biancheria */}
                <div className={`bg-white rounded-2xl border overflow-hidden transition-all ${configNeedsReview ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200 hover:shadow-lg'}`}>
                  <button onClick={() => setCfgModal(true)} className="w-full p-5 flex items-center gap-5 hover:bg-slate-50 transition-all active:scale-[0.99]">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0">
                      <div className="w-7 h-7 text-slate-600">{I.package}</div>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-base font-bold text-slate-800">Configurazione Dotazioni</p>
                      <p className="text-sm text-slate-500">Letti, biancheria, kit, extra</p>
                    </div>
                    <div className="w-6 h-6 text-slate-400">{I.right}</div>
                  </button>
                  <div className="mx-5 h-px bg-slate-100"></div>
                  <div className="p-5">
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${usesOwnLinen ? 'bg-gradient-to-br from-amber-100 to-amber-200' : 'bg-gradient-to-br from-sky-100 to-sky-200'}`}>
                        <span className="text-xl">{usesOwnLinen ? '🏠' : '🧺'}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800">Servizio Biancheria</p>
                        <p className="text-xs text-slate-500">
                          {usesOwnLinen ? 'Usa biancheria propria o altra ditta' : 'Biancheria fornita dalla nostra ditta'}
                        </p>
                      </div>
                      <button
                        onClick={() => setLinenConfirmModal(true)}
                        className={`relative w-14 h-8 rounded-full transition-all ${usesOwnLinen ? 'bg-amber-500' : 'bg-sky-500'}`}
                      >
                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${usesOwnLinen ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                    <div className={`mt-3 p-3 rounded-xl text-sm ${usesOwnLinen ? 'bg-amber-100/50 text-amber-800' : 'bg-sky-100/50 text-sky-800'}`}>
                      {usesOwnLinen ? (
                        <p>⚠️ <strong>Biancheria disattivata</strong> — Non verranno creati ordini biancheria. Il configuratore resta utile agli operatori.</p>
                      ) : (
                        <p>✅ <strong>Biancheria attiva</strong> — Ordini biancheria creati automaticamente ad ogni pulizia.</p>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Banner Accesso Proprietà */}
                <PropertyAccessCard 
                  property={{
                    address: propData.addr,
                    city: propData.city,
                    postalCode: propData.postalCode,
                    floor: propData.floor,
                    apartment: propData.apartment,
                    intercom: propData.intercom,
                    doorCode: propData.doorCode,
                    keysLocation: propData.keysLocation,
                    accessNotes: propData.accessNotes,
                    images: propData.images,
                  }}
                  editable={true}
                  onEdit={() => setEditInfoModal(true)}
                />
                
                <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg transition-all">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-sky-100 to-sky-200 flex items-center justify-center">
                      <div className="w-7 h-7 text-sky-600">{I.calendar}</div>
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-bold text-slate-800">Sincronizzazione Calendario</p>
                      <p className="text-sm text-slate-500">iCal • Airbnb • Booking • Altri</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                    {syncResult && (
                      <div className={`p-3 rounded-xl text-sm font-medium ${syncResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {syncResult.success ? '✅' : '❌'} {syncResult.message}
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button onClick={() => setIcalModal(true)} className="flex-1 py-3 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 active:scale-95">Configura Link</button>
                      <button 
                        onClick={handleSync} 
                        disabled={syncing}
                        className={`flex-1 py-3 text-sm font-semibold rounded-xl active:scale-95 flex items-center justify-center gap-2 ${syncing ? 'bg-sky-400 text-white cursor-wait' : 'bg-sky-600 text-white hover:bg-sky-700'}`}
                      >
                        {syncing ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4m-8-10h4m12 0h4" strokeLinecap="round"/></svg>
                            Sincronizzando...
                          </>
                        ) : 'Sincronizza Ora'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Colonna Destra - Checklist (admin) + Zona Pericolo */}
              <div className="space-y-4">
                {isAdmin && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all">
                    {/* Header collassabile */}
                    <button
                      onClick={() => setChecklistOpen(o => !o)}
                      className="w-full p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl">✅</span>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-base font-bold text-slate-800">Checklist Pulizie</p>
                        <p className="text-sm text-slate-500">
                          {checklistCustom ? `${checklist.length} voci personalizzate` : `${checklist.length} voci standard`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {checklistCustom && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">Personalizzata</span>}
                        <svg className={`w-5 h-5 text-slate-400 transition-transform ${checklistOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </button>

                    {checklistOpen && (
                      <div className="border-t border-slate-100">
                        {/* Lista voci */}
                        <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                          {checklist.map((item, idx) => (
                            <div key={item.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 group">
                              <span className="text-xs text-slate-300 w-4 shrink-0 font-mono">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                {checklistEditId === item.id ? (
                                  <input
                                    autoFocus
                                    className="w-full border border-sky-300 rounded-lg px-2 py-1 text-sm focus:outline-none"
                                    value={checklistEditText}
                                    onChange={e => setChecklistEditText(e.target.value)}
                                    onBlur={() => {
                                      if (checklistEditText.trim()) setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, text: checklistEditText.trim() } : i));
                                      setChecklistEditId(null);
                                    }}
                                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setChecklistEditId(null); }}
                                  />
                                ) : (
                                  <span className="text-sm text-slate-700 cursor-pointer hover:text-sky-600" onClick={() => { setChecklistEditId(item.id); setChecklistEditText(item.text); }}>{item.text}</span>
                                )}
                              </div>
                              <select
                                value={item.category}
                                onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, category: e.target.value } : i))}
                                className={`text-xs font-medium px-2 py-0.5 rounded-lg border-0 cursor-pointer focus:outline-none ${CHECKLIST_CATS.find(c => c.value === item.category)?.color || 'bg-slate-100 text-slate-600'}`}
                              >
                                {CHECKLIST_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                                <button onClick={() => setChecklist(prev => { const n=[...prev]; const i=n.findIndex(x=>x.id===item.id); if(i>0){[n[i],n[i-1]]=[n[i-1],n[i]]}; return n; })} disabled={idx===0} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20 rounded">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7"/></svg>
                                </button>
                                <button onClick={() => setChecklist(prev => { const n=[...prev]; const i=n.findIndex(x=>x.id===item.id); if(i<n.length-1){[n[i],n[i+1]]=[n[i+1],n[i]]}; return n; })} disabled={idx===checklist.length-1} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20 rounded">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/></svg>
                                </button>
                                <button onClick={() => setChecklist(prev => prev.filter(i => i.id !== item.id))} className="p-1 text-slate-300 hover:text-red-500 rounded">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Aggiungi voce */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Aggiungi voce..."
                              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                              value={checklistNewText}
                              onChange={e => setChecklistNewText(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && checklistNewText.trim()) { setChecklist(prev => [...prev, { id: Date.now().toString(), text: checklistNewText.trim(), category: checklistNewCat }]); setChecklistNewText(""); } }}
                            />
                            <select
                              value={checklistNewCat}
                              onChange={e => setChecklistNewCat(e.target.value)}
                              className="border border-slate-200 rounded-xl px-2 py-2 text-sm focus:outline-none bg-white"
                            >
                              {CHECKLIST_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                            <button
                              onClick={() => { if(checklistNewText.trim()){ setChecklist(prev => [...prev, { id: Date.now().toString(), text: checklistNewText.trim(), category: checklistNewCat }]); setChecklistNewText(""); }}}
                              disabled={!checklistNewText.trim()}
                              className="px-3 py-2 bg-sky-500 text-white text-sm font-bold rounded-xl disabled:opacity-40"
                            >+</button>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            {checklistCustom && (
                              <button onClick={() => { if(confirm("Ripristinare checklist standard?")){ setChecklist(CHECKLIST_DEFAULT); setChecklistCustom(false); }}} className="text-xs text-slate-400 hover:text-red-500 underline">Ripristina default</button>
                            )}
                            <div className="flex-1" />
                            <button
                              onClick={async () => {
                                setChecklistSaving(true);
                                try {
                                  await fetch("/api/admin/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, checklist }) });
                                  setChecklistCustom(true);
                                  setChecklistSaved(true);
                                  setTimeout(() => setChecklistSaved(false), 3000);
                                } catch { alert("Errore salvataggio"); }
                                setChecklistSaving(false);
                              }}
                              disabled={checklistSaving}
                              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
                            >
                              {checklistSaving ? "Salvataggio..." : checklistSaved ? "✓ Salvato!" : "💾 Salva"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!isAdmin && deactivationRequested ? (
                  <div className="w-full bg-amber-50 rounded-2xl border border-amber-200 p-5 flex items-center gap-5">
                    <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center">
                      <div className="w-7 h-7 text-amber-500">{I.clock}</div>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-base font-bold text-amber-700">Richiesta Disattivazione Inviata</p>
                      <p className="text-sm text-amber-500">In attesa di approvazione dall'amministrazione</p>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setDeactivateModal(true)} className="w-full bg-white rounded-2xl border border-red-200 p-5 flex items-center gap-5 hover:bg-red-50 hover:border-red-300 transition-all active:scale-[0.99]">
                    <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center">
                      <div className="w-7 h-7 text-red-500">{I.trash}</div>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-base font-bold text-red-600">{isAdmin ? 'Disattiva Proprietà' : 'Richiedi Disattivazione'}</p>
                      <p className="text-sm text-red-400">{isAdmin ? 'Sposta in proprietà disattivate' : 'Invia richiesta all\'amministrazione'}</p>
                    </div>
                    <div className="w-6 h-6 text-red-300">{I.right}</div>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ========== MOBILE SETTINGS LAYOUT ========== */
            <>
          <div className="bg-white rounded-xl border p-4 animate-fadeInUp">
            <h3 className="text-sm font-semibold mb-3">Foto Proprietà</h3>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center cursor-pointer relative group border-2 border-dashed border-slate-300" onClick={() => fileInputRef.current?.click()}>
                {propertyImage ? (<><img src={propertyImage} alt="Proprietà" className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><div className="w-6 h-6 text-white">{I.camera}</div></div></>) : (<div className="w-8 h-8 text-slate-300">{I.camera}</div>)}
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-600 mb-2">{propertyImage ? 'Clicca per cambiare foto' : 'Aggiungi una foto della proprietà'}</p>
                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg active:scale-95">{propertyImage ? 'Cambia Foto' : 'Carica Foto'}</button>
                {propertyImage && <button onClick={handleRemoveImage} className="ml-2 px-4 py-2 bg-red-50 text-red-600 text-xs font-medium rounded-lg active:scale-95">Rimuovi</button>}
              </div>
            </div>
          </div>
          <button onClick={() => setEditInfoModal(true)} className="w-full bg-white rounded-xl border p-4 flex items-center gap-4 hover-lift active:scale-[0.98] animate-fadeInUp stagger-1"><div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center"><div className="w-6 h-6 text-slate-600">{I.edit}</div></div><div className="flex-1 text-left"><p className="text-sm font-medium">Modifica Informazioni Generali</p><p className="text-[11px] text-slate-500">Nome, indirizzo, orari, capacità</p></div><div className="w-5 h-5 text-slate-400">{I.right}</div></button>
          {configNeedsReview && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center gap-2 animate-fadeInUp">
              <span>⚠️</span>
              <p className="text-xs text-amber-700 font-medium">Configurazione dotazioni da aggiornare dopo modifica letti/ospiti</p>
            </div>
          )}
          
          {/* Card unificata: Configurazione + Biancheria */}
          <div className={`bg-white rounded-xl border animate-fadeInUp stagger-2 overflow-hidden ${configNeedsReview ? 'border-amber-400 ring-2 ring-amber-200' : ''}`}>
            {/* Top: Configurazione Dotazioni */}
            <button onClick={() => setCfgModal(true)} className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 active:scale-[0.98] transition-all">
              <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0"><div className="w-6 h-6 text-slate-600">{I.package}</div></div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Configurazione Dotazioni</p>
                <p className="text-[11px] text-slate-500">Letti, biancheria, kit, extra</p>
              </div>
              {configNeedsReview ? <span className="w-3 h-3 bg-amber-500 rounded-full animate-pulse"></span> : <div className="w-5 h-5 text-slate-400">{I.right}</div>}
            </button>
            {/* Divider */}
            <div className="mx-4 h-px bg-slate-100"></div>
            {/* Bottom: Servizio Biancheria toggle */}
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${usesOwnLinen ? 'bg-amber-100' : 'bg-sky-100'}`}>
                  <span className="text-lg">{usesOwnLinen ? '🏠' : '🧺'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-700">Servizio Biancheria</p>
                  <p className="text-[10px] text-slate-500">{usesOwnLinen ? 'Usa biancheria propria' : 'Fornita dalla ditta'}</p>
                </div>
                <button
                  onClick={() => setLinenConfirmModal(true)}
                  className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 ${usesOwnLinen ? 'bg-amber-500' : 'bg-sky-500'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all ${usesOwnLinen ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
              <div className={`mt-2 px-2.5 py-1.5 rounded-lg text-[10px] font-medium ${usesOwnLinen ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
                {usesOwnLinen 
                  ? '⚠️ Nessun ordine biancheria verrà creato automaticamente' 
                  : '✅ Ordini biancheria creati automaticamente ad ogni pulizia'}
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border p-4 animate-fadeInUp stagger-4">
            <div className="flex items-center gap-4"><div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center"><div className="w-6 h-6 text-blue-600">{I.calendar}</div></div><div className="flex-1"><p className="text-sm font-medium">Sincronizzazione Calendario</p><p className="text-[11px] text-slate-500">iCal • Airbnb • Booking • Altri</p></div></div>
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              {syncResult && (
                <div className={`p-2 rounded-lg text-xs font-medium ${syncResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {syncResult.success ? '✅' : '❌'} {syncResult.message}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setIcalModal(true)} className="flex-1 py-2 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200 active:scale-95">Configura Link</button>
                <button 
                  onClick={handleSync} 
                  disabled={syncing}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg active:scale-95 flex items-center justify-center gap-2 ${syncing ? 'bg-blue-400 text-white cursor-wait' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                  {syncing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4m-8-10h4m12 0h4" strokeLinecap="round"/></svg>
                      Sincronizzando...
                    </>
                  ) : 'Sincronizza Ora'}
                </button>
              </div>
            </div>
          </div>

          {/* Checklist Pulizie (solo admin) */}
          {isAdmin && (
            <div className="bg-white rounded-xl border overflow-hidden animate-fadeInUp">
              <button onClick={() => setChecklistOpen(o => !o)} className="w-full p-4 flex items-center gap-3 hover:bg-slate-50 active:scale-[0.98]">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0"><span className="text-xl">✅</span></div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">Checklist Pulizie</p>
                  <p className="text-[11px] text-slate-500">{checklistCustom ? `${checklist.length} voci personalizzate` : `${checklist.length} voci standard`}</p>
                </div>
                {checklistCustom && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">Custom</span>}
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${checklistOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </button>
              {checklistOpen && (
                <div className="border-t border-slate-100">
                  <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                    {checklist.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 group">
                        <span className="text-xs text-slate-300 w-4 shrink-0 font-mono">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          {checklistEditId === item.id ? (
                            <input autoFocus className="w-full border border-sky-300 rounded px-2 py-1 text-xs focus:outline-none" value={checklistEditText} onChange={e => setChecklistEditText(e.target.value)}
                              onBlur={() => { if(checklistEditText.trim()) setChecklist(prev => prev.map(i => i.id===item.id ? {...i,text:checklistEditText.trim()} : i)); setChecklistEditId(null); }}
                              onKeyDown={e => { if(e.key==="Enter")(e.target as HTMLInputElement).blur(); if(e.key==="Escape")setChecklistEditId(null); }}
                            />
                          ) : (
                            <span className="text-xs text-slate-700 cursor-pointer" onClick={() => { setChecklistEditId(item.id); setChecklistEditText(item.text); }}>{item.text}</span>
                          )}
                        </div>
                        <select value={item.category} onChange={e => setChecklist(prev => prev.map(i => i.id===item.id ? {...i,category:e.target.value} : i))}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded border-0 ${CHECKLIST_CATS.find(c=>c.value===item.category)?.color||'bg-slate-100 text-slate-600'}`}>
                          {CHECKLIST_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <button onClick={() => setChecklist(prev => prev.filter(i=>i.id!==item.id))} className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-slate-100 bg-slate-50 space-y-2">
                    <div className="flex gap-2">
                      <input type="text" placeholder="Nuova voce..." className="flex-1 border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none bg-white" value={checklistNewText} onChange={e => setChecklistNewText(e.target.value)}
                        onKeyDown={e => { if(e.key==="Enter"&&checklistNewText.trim()){ setChecklist(prev=>[...prev,{id:Date.now().toString(),text:checklistNewText.trim(),category:checklistNewCat}]); setChecklistNewText(""); }}} />
                      <select value={checklistNewCat} onChange={e => setChecklistNewCat(e.target.value)} className="border border-slate-200 rounded-lg px-2 text-xs bg-white">
                        {CHECKLIST_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <button onClick={() => { if(checklistNewText.trim()){ setChecklist(prev=>[...prev,{id:Date.now().toString(),text:checklistNewText.trim(),category:checklistNewCat}]); setChecklistNewText(""); }}} disabled={!checklistNewText.trim()} className="px-3 bg-sky-500 text-white text-sm font-bold rounded-lg disabled:opacity-40">+</button>
                    </div>
                    <button onClick={async () => { setChecklistSaving(true); try { await fetch("/api/admin/checklist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({propertyId,checklist})}); setChecklistCustom(true); setChecklistSaved(true); setTimeout(()=>setChecklistSaved(false),3000); } catch{ alert("Errore"); } setChecklistSaving(false); }}
                      disabled={checklistSaving} className="w-full py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-xl disabled:opacity-50">
                      {checklistSaving ? "Salvataggio..." : checklistSaved ? "✓ Salvato!" : "💾 Salva Checklist"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isAdmin && deactivationRequested ? (
            <div className="w-full bg-amber-50 rounded-xl border border-amber-200 p-4 flex items-center gap-4 animate-fadeInUp stagger-5">
              <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
                <div className="w-6 h-6 text-amber-500">{I.clock}</div>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-amber-700">Richiesta Disattivazione Inviata</p>
                <p className="text-[11px] text-amber-500">In attesa di approvazione dall'amministrazione</p>
              </div>
            </div>
          ) : (
            <button onClick={() => setDeactivateModal(true)} className="w-full bg-white rounded-xl border border-red-100 p-4 flex items-center gap-4 hover:bg-red-50 transition-colors animate-fadeInUp stagger-5 active:scale-[0.98]"><div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center"><div className="w-6 h-6 text-red-400">{I.trash}</div></div><div className="flex-1 text-left"><p className="text-sm font-medium text-red-600">{isAdmin ? 'Disattiva Proprietà' : 'Richiedi Disattivazione'}</p><p className="text-[11px] text-red-400">{isAdmin ? 'Sposta in proprietà disattivate' : 'Invia richiesta all\'amministrazione'}</p></div><div className="w-5 h-5 text-red-300">{I.right}</div></button>
          )}
            </>
          )}
        </div>
      )}

      {/* Modal Conferma Biancheria */}
      {linenConfirmModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setLinenConfirmModal(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fadeInUp" onClick={e => e.stopPropagation()}>
            {/* Header con icona */}
            <div className={`px-6 pt-6 pb-4 text-center ${usesOwnLinen ? 'bg-sky-50' : 'bg-amber-50'}`}>
              <div className={`w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center ${usesOwnLinen ? 'bg-sky-100' : 'bg-amber-100'}`}>
                <span className="text-3xl">{usesOwnLinen ? '🧺' : '🏠'}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                {usesOwnLinen ? 'Attivare il Servizio Biancheria?' : 'Disattivare il Servizio Biancheria?'}
              </h3>
            </div>
            {/* Body */}
            <div className="px-6 py-4">
              <p className="text-sm text-slate-600 text-center">
                {usesOwnLinen 
                  ? 'Riattivando il servizio, verranno creati automaticamente gli ordini biancheria per tutte le pulizie future già programmate.'
                  : 'Disattivando il servizio, tutti gli ordini biancheria futuri in stato "pending" verranno eliminati automaticamente. Le pulizie già completate non saranno modificate.'}
              </p>
            </div>
            {/* Buttons */}
            <div className="px-6 pb-6 flex gap-3">
              <button 
                onClick={() => setLinenConfirmModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-[0.97] transition-all"
              >
                Annulla
              </button>
              <button 
                onClick={() => {
                  setLinenConfirmModal(false);
                  handleToggleLinen(!usesOwnLinen);
                }}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold text-white active:scale-[0.97] transition-all ${
                  usesOwnLinen 
                    ? 'bg-sky-500 hover:bg-sky-600' 
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {usesOwnLinen ? 'Sì, Attiva' : 'Sì, Disattiva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cfgModal && <CfgModal cfgs={cfgs} setCfgs={setCfgs} onClose={() => setCfgModal(false)} onSave={handleSaveConfig} maxGuests={propData.maxGuests} propertyBeds={propertyBeds} preloadedLinen={linen['matr'] || []} preloadedBath={bathItems} preloadedKit={kitItems} preloadedExtras={extras} />}
      {svcModal && (
        <EditCleaningModal
          isOpen={true}
          onClose={() => setSvcModal(null)}
          cleaning={{
            id: svcModal.id,
            propertyId: propertyId || '',
            propertyName: propData.name,
            date: new Date(svcModal.date),
            scheduledTime: svcModal.scheduledTime || svcModal.time,
            status: svcModal.status === 'confirmed' ? 'COMPLETED' : 'PENDING',
            guestsCount: svcModal.guestsCount || svcModal.guests,
            notes: svcModal.notes || '',
            price: svcModal.price,
            serviceType: svcModal.serviceType,
            serviceTypeName: svcModal.serviceTypeName,
            sgrossoReason: svcModal.sgrossoReason as any,
            sgrossoReasonLabel: svcModal.sgrossoReasonLabel,
            sgrossoNotes: svcModal.sgrossoNotes,
            contractPrice: svcModal.contractPrice,
            priceModified: svcModal.priceModified,
            priceChangeReason: svcModal.priceChangeReason,
            originalDate: svcModal.originalDate,
            dateModifiedAt: svcModal.dateModifiedAt,
            // Campi per pulizie completate
            photos: svcModal.photos,
            startedAt: svcModal.startedAt,
            completedAt: svcModal.completedAt,
            // Campi per valutazione
            ratingScore: svcModal.ratingScore,
            ratingId: svcModal.ratingId,
            extraServices: svcModal.extraServices,
            // 🔧 FIX: Passa customLinenConfig e linenConfigModified
            customLinenConfig: svcModal.customLinenConfig,
            linenConfigModified: svcModal.linenConfigModified,
          }}
          property={{
            id: propertyId || '',
            name: propData.name,
            address: propData.addr,
            maxGuests: propData.maxGuests,
            bedrooms: propData.bedrooms,
            bathrooms: propData.bathrooms,
            cleaningPrice: propData.cleanPrice,
            bedsConfig: propertyBeds,
            serviceConfigs: cfgs,
          }}
          onSuccess={() => {
            setSvcModal(null);
            // Il listener realtime aggiornerà automaticamente i servizi
          }}
          userRole={isAdmin ? "ADMIN" : "PROPRIETARIO"}
        />
      )}
      {deactivateModal && <DeactivateModal isAdmin={isAdmin} propertyId={propertyId || ''} propertyName={propData.name} ownerId={propData.ownerId} onClose={() => setDeactivateModal(false)} onConfirm={() => { setDeactivateModal(false); }} onRequestSent={() => setDeactivationRequested(true)} />}
      {editInfoModal && <UnifiedPropertyModal propData={propData} beds={propertyBeds} isAdmin={isAdmin} propertyId={propertyId} currentCfgs={cfgs} onClose={() => setEditInfoModal(false)} onSave={handleSavePropertyInfo} />}
      {icalModal && (
        <ICalConfigModal
          icalLinks={icalLinks}
          propertyId={propertyId}
          onClose={() => setIcalModal(false)}
          onSave={(links) => {
            setIcalLinks(links);
            setPropData(prev => ({
              ...prev,
              icalAirbnb: links.icalAirbnb,
              icalBooking: links.icalBooking,
              icalOktorate: links.icalOktorate,
              icalInreception: links.icalInreception,
              icalKrossbooking: links.icalKrossbooking,
            }));
          }}
        />
      )}
      {priceModal && (
        <EditPriceModal
          currentPrice={propData.cleanPrice}
          propertyId={propertyId}
          propertyName={propData.name}
          onClose={() => setPriceModal(false)}
          onSave={(newPrice) => {
            setPropData(prev => ({ ...prev, cleanPrice: newPrice }));
            setPriceModal(false);
          }}
        />
      )}
      {guestChangeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setGuestChangeModal(null)}>
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <div className="w-8 h-8 text-white">{I.users}</div>
            </div>
            <h2 className="text-xl font-bold text-center mb-1">Modifica Ospiti</h2>
            <p className="text-sm text-slate-500 text-center mb-6">
              Pulizia del <span className="font-semibold text-slate-700">{guestChangeModal.date}</span>
            </p>
            
            {/* Selettore ospiti */}
            <div className="bg-slate-50 rounded-2xl p-4 mb-6">
              <p className="text-xs text-slate-500 text-center mb-3">Numero di ospiti</p>
              <div className="flex items-center justify-center gap-4">
                <button 
                  onClick={() => {
                    if (guestChangeModal.newGuests > 1) {
                      setGuestChangeModal({...guestChangeModal, newGuests: guestChangeModal.newGuests - 1});
                    }
                  }}
                  disabled={guestChangeModal.newGuests <= 1}
                  className={`w-14 h-14 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
                    guestChangeModal.newGuests <= 1 
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                      : 'bg-white border-2 border-slate-300 text-slate-600 hover:border-slate-400 shadow-sm'
                  }`}
                >
                  <div className="w-6 h-6">{I.minus}</div>
                </button>
                
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <span className="text-4xl font-bold text-white">{guestChangeModal.newGuests}</span>
                </div>
                
                <button 
                  onClick={() => {
                    if (guestChangeModal.newGuests < propData.maxGuests) {
                      setGuestChangeModal({...guestChangeModal, newGuests: guestChangeModal.newGuests + 1});
                    }
                  }}
                  disabled={guestChangeModal.newGuests >= propData.maxGuests}
                  className={`w-14 h-14 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
                    guestChangeModal.newGuests >= propData.maxGuests 
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                      : 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm'
                  }`}
                >
                  <div className="w-6 h-6">{I.plus}</div>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 text-center mt-3">Max {propData.maxGuests} ospiti per questa proprietà</p>
            </div>
            
            {/* Info cambio */}
            {guestChangeModal.newGuests !== guestChangeModal.oldGuests && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-4 text-blue-500">{I.info}</div>
                  <span className="text-xs font-semibold text-blue-700">Riepilogo modifica</span>
                </div>
                <p className="text-xs text-blue-600">
                  Da <span className="font-bold">{guestChangeModal.oldGuests}</span> a <span className="font-bold">{guestChangeModal.newGuests}</span> ospiti. 
                  La biancheria verrà ricalcolata automaticamente.
                </p>
              </div>
            )}
            
            <div className="flex gap-3">
              <button 
                onClick={() => setGuestChangeModal(null)} 
                className="flex-1 py-3.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl active:scale-[0.98] hover:bg-slate-200 transition-colors"
              >
                Annulla
              </button>
              <button 
                onClick={() => {
                  if (guestChangeModal.newGuests !== guestChangeModal.oldGuests) {
                    setServices(services.map(svc => 
                      svc.id === guestChangeModal.serviceId 
                        ? { ...svc, guests: guestChangeModal.newGuests } 
                        : svc
                    ));
                  }
                  setGuestChangeModal(null);
                }}
                disabled={guestChangeModal.newGuests === guestChangeModal.oldGuests}
                className={`flex-1 py-3.5 text-sm font-semibold rounded-xl active:scale-[0.98] transition-all ${
                  guestChangeModal.newGuests === guestChangeModal.oldGuests
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md hover:shadow-lg'
                }`}
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Valutazioni */}
      {ratingsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setRatingsModal(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div 
            className="relative bg-slate-50 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                    ⭐
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Valutazioni Proprietà</h2>
                    <p className="text-white/80 text-sm">Feedback dalle pulizie</p>
                  </div>
                </div>
                <button
                  onClick={() => setRatingsModal(false)}
                  className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {loadingRatings ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-3 border-amber-200 border-t-amber-500 rounded-full animate-spin"></div>
                </div>
              ) : (
                // @ts-expect-error TODO-FIX: TS2322 Type 'string | undefined' is not assignable to type 'string'.
                <PropertyRatingsSection propertyId={propertyId} isAdmin={isAdmin} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
