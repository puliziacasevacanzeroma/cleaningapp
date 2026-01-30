"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import EditCleaningModal from "~/components/proprietario/EditCleaningModal";
import PropertyDurationStats from "~/components/dashboard/PropertyDurationStats";
import PropertyAccessCard from "~/components/property/PropertyAccessCard";
import PropertyRatingsSection from "~/components/cleaning/PropertyRatingsSection";

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
  
  console.log(`🛏️ Generati ${generatedBeds.length} letti per ${maxGuests} ospiti e ${bedrooms} camere:`, generatedBeds);
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
      // Matrimoniale: 3 lenzuola matrimoniali + 2 federe
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    
    case 'sing':
      // Singolo: 3 lenzuola singole + 1 federa
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
    
    case 'divano':
      // Divano letto: come matrimoniale
      return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    
    case 'castello':
      // Castello: 2 letti singoli = 6 lenzuola singole + 2 federe
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 6, federa: 2 };
    
    default:
      // Default: come singolo
      return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
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
  
  console.log(`📊 Biancheria calcolata per ${selectedBeds.length} letti:`, total);
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
  
  console.log(`🔗 Biancheria mappata a inventario:`, result);
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
  const scendiBagno = findItem(['scendi bagno', 'scendi_bagno', 'scendibagno', 'tappetino', 'scendidoccia']);
  if (scendiBagno && bathReq.scendiBagno > 0) {
    result[scendiBagno.id] = bathReq.scendiBagno;
  }
  
  console.log(`🛁 Biancheria bagno mappata a inventario:`, result);
  return result;
}

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
  
  console.log(`✅ Generate ${maxGuests} configurazioni di default`);
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
const calcBL = (bl: Record<string, Record<string, number>>, inventoryLinen: LinenItem[] = []): number => { 
  let t = 0; 
  
  Object.entries(bl).forEach(([key, items]) => { 
    if (key === 'all') {
      // Nuovo formato: usa chiave 'all' e inventario
      Object.entries(items).forEach(([itemId, qty]) => {
        // Cerca nell'inventario passato, o usa un prezzo di fallback
        const item = inventoryLinen.find(i => i.id === itemId);
        if (item) {
          t += item.p * qty;
        }
      });
    } else {
      // Vecchio formato: bedId -> items
      const b = beds.find(x => x.id === key); 
      (linen[b?.type || ''] || []).forEach(i => { t += i.p * (items[i.id] || 0); }); 
    }
  }); 
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

  const otaConfig = [
    { id: "airbnb", name: "Airbnb", desc: "Link iCal di Airbnb", value: airbnb, setValue: setAirbnb, color: "from-red-500 to-red-600", icon: "🏠", },
    { id: "booking", name: "Booking.com", desc: "Link iCal di Booking.com", value: booking, setValue: setBooking, color: "from-blue-500 to-blue-600", icon: "📘", },
    { id: "oktorate", name: "Oktorate", desc: "Link iCal di Oktorate", value: oktorate, setValue: setOktorate, color: "from-purple-500 to-purple-600", icon: "📱", },
    { id: "inreception", name: "InReception", desc: "Link iCal di InReception", value: inreception, setValue: setInreception, color: "from-green-500 to-green-600", icon: "🔔", },
    { id: "krossbooking", name: "KrossBooking", desc: "Link iCal di KrossBooking", value: krossbooking, setValue: setKrossbooking, color: "from-orange-500 to-orange-600", icon: "🗓️", },
  ];

  const handleSave = async () => {
    setSaving(true);
    const newLinks: ICalLinks = { icalAirbnb: airbnb, icalBooking: booking, icalOktorate: oktorate, icalInreception: inreception, icalKrossbooking: krossbooking };
    if (propertyId) {
      try {
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
        
        // 🔥 FIX: Triggera sync automatico dopo salvataggio link
        // Questo ricrea le prenotazioni se i link sono stati reinseriti
        const hasAnyLink = airbnb || booking || oktorate || inreception || krossbooking;
        if (hasAnyLink) {
          console.log("🔄 Triggering iCal sync dopo salvataggio link...");
          try {
            const syncResponse = await fetch(`/api/properties/${propertyId}/sync-ical?forceSync=true`, {
              method: "POST",
            });
            const syncData = await syncResponse.json();
            console.log("✅ Sync completato:", syncData);
          } catch (syncError) {
            console.warn("⚠️ Sync fallito (verrà ritentato dal cron):", syncError);
          }
        }
        
      } catch (error) {
        console.error("Error saving iCal links:", error);
        setSaving(false);
        return;
      }
    }
    onSave(newLinks);
    setSaving(false);
    setShowSuccess(true);
  };

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
function CfgModal({ cfgs, setCfgs, onClose, onSave, maxGuests = 7, propertyBeds = [] }: { 
  cfgs: Record<number, GuestConfig>; 
  setCfgs: React.Dispatch<React.SetStateAction<Record<number, GuestConfig>>>; 
  onClose: () => void;
  onSave: (configs: Record<number, GuestConfig>) => void;
  maxGuests?: number;
  propertyBeds?: Bed[];
}) {
  // Inizializza g con un valore valido (minimo tra 4 e maxGuests, o 1 se maxGuests < 1)
  const initialG = Math.min(4, maxGuests) || 1;
  const [g, setG] = useState(initialG);
  const [sec, setSec] = useState<string | null>('beds');
  const [loading, setLoading] = useState(true);
  
  // State per articoli caricati dall'inventario
  const [invLinen, setInvLinen] = useState<LinenItem[]>([]);
  const [invBath, setInvBath] = useState<LinenItem[]>([]);
  const [invKit, setInvKit] = useState<LinenItem[]>([]);
  const [invExtras, setInvExtras] = useState<{ id: string; n: string; p: number; desc: string }[]>([]);

  // Usa propertyBeds passati come prop, o fallback a variabile globale
  const currentBeds = propertyBeds.length > 0 ? propertyBeds : beds;
  
  // 🔍 DEBUG: Log all'apertura della modal
  useEffect(() => {
    console.log("🔍 CfgModal APERTA - DEBUG:");
    console.log("   propertyBeds ricevuti:", propertyBeds.length, "letti");
    propertyBeds.forEach(b => console.log(`      - ${b.id}: ${b.name} (${b.type}, ${b.cap}p)`));
    console.log("   beds globale:", beds.length, "letti");
    console.log("   currentBeds usati:", currentBeds.length, "letti");
    console.log("   cfgs ricevute:", Object.keys(cfgs).length, "configurazioni");
    Object.entries(cfgs).forEach(([guests, cfg]) => {
      console.log(`      - ${guests} ospiti: beds=[${(cfg.beds || []).join(', ')}]`);
    });
  }, []);


  // Carica articoli dall'inventario
  useEffect(() => {
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
  const totalCap = selectedBedsData.reduce((sum, b) => sum + b.cap, 0);
  const warn = totalCap < g;
  
  // 🔍 DEBUG: Verifica matching ID letti
  if (selectedBedIds.length > 0 && selectedBedsData.length === 0) {
    console.warn("⚠️ MISMATCH ID LETTI!");
    console.warn("   selectedBedIds dalla config:", selectedBedIds);
    console.warn("   currentBeds IDs disponibili:", currentBeds.map(b => b.id));
    console.warn("   Nessun match trovato!");
  }
  
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
      console.log(`🔄 Ricalcolo automatico biancheria per ${g} ospiti con ${selectedBedsData.length} letti`);
      
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
      let newBl = { ...currentCfg.bl };
      
      if (isSelected) {
        // Rimuovi letto
        newBeds = currentCfg.beds.filter(id => id !== bedId);
      } else {
        // Aggiungi letto
        newBeds = [...currentCfg.beds, bedId];
      }
      
      // Ricalcola biancheria per i letti selezionati
      const newSelectedBeds = currentBeds.filter(b => newBeds.includes(b.id));
      const linenReq = calculateTotalLinenForBeds(newSelectedBeds);
      
      // Mappa ai nomi reali degli articoli nell'inventario
      const mappedLinen = mapLinenToInventoryItems(linenReq, invLinen);
      
      newBl = {
        'all': mappedLinen
      };
      
      return {
        ...prev,
        [g]: { ...currentCfg, beds: newBeds, bl: newBl }
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
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
        <p className="mt-3 text-slate-500">Caricamento articoli...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex-shrink-0 bg-white pt-12 px-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Configurazione Dotazioni</h2>
            <p className="text-xs text-slate-500">Imposta la biancheria per ogni numero di ospiti</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-95 active:bg-slate-200">
            <div className="w-5 h-5 text-slate-500">{I.close}</div>
          </button>
        </div>
        <GuestSelector value={g} onChange={setG} max={maxGuests} />
        {warn && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center gap-2">
            <div className="w-4 h-4 text-amber-500">{I.warn}</div>
            <p className="text-xs text-amber-700">Capacità letti ({totalCap}) inferiore a {g} ospiti</p>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
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
                        <p className="text-[10px] text-slate-500">{bed.loc} • {bed.cap}p</p>
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
        <button onClick={() => onSave(cfgs)} className="w-full py-3.5 bg-gradient-to-r from-slate-600 to-slate-800 text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-transform shadow-md">
          Salva Configurazione
        </button>
      </div>
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
        <button onClick={handleSave} className="w-full py-3.5 text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-transform shadow-md bg-gradient-to-r from-blue-600 to-blue-700">
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
      
      console.log('🗑️ Richiesta cancellazione inviata via nuova API');
      
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
      console.log('🗑️ Admin disattiva proprietà:', propertyId);
      
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
        console.log('📬 Notifica disattivazione inviata a:', ownerId);
      }
      
      console.log('✅ Proprietà disattivata con successo');
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
  onClose, 
  onSave 
}: { 
  propData: PropertyData; 
  beds: Bed[];
  isAdmin: boolean; 
  propertyId?: string; 
  onClose: () => void; 
  onSave: (data: Partial<PropertyData>) => void; 
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'rooms' | 'access'>('info');
  const [showSuccess, setShowSuccess] = useState<'saved' | 'requested' | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [pendingRequestType, setPendingRequestType] = useState<string | null>(null);
  
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
  
  // Tab 2: Stanze, Ospiti e Letti
  const [maxGuests, setMaxGuests] = useState(propData.maxGuests);
  const [bedrooms, setBedrooms] = useState(propData.bedrooms);
  const [bathrooms, setBathrooms] = useState(propData.bathrooms);
  const [editBeds, setEditBeds] = useState<Bed[]>(initialBeds.map(b => ({ ...b })));
  const [showBedEditor, setShowBedEditor] = useState(false);
  const [reason, setReason] = useState('');
  
  // Tab 3: Accesso
  const [doorCode, setDoorCode] = useState(propData.doorCode || '');
  const [keysLocation, setKeysLocation] = useState(propData.keysLocation || '');
  const [accessNotes, setAccessNotes] = useState(propData.accessNotes || '');
  const [doorImage, setDoorImage] = useState(propData.images?.door || '');
  const [buildingImage, setBuildingImage] = useState(propData.images?.building || '');
  const [uploading, setUploading] = useState<'door' | 'building' | null>(null);
  const doorInputRef = useRef<HTMLInputElement>(null);
  const buildingInputRef = useRef<HTMLInputElement>(null);

  // Calcoli
  const bedCapacity = editBeds.reduce((sum, b) => sum + b.cap, 0);
  const initialBedCapacity = initialBeds.reduce((sum, b) => sum + b.cap, 0);
  const hasRoomChanges = maxGuests !== propData.maxGuests || bedrooms !== propData.bedrooms || bathrooms !== propData.bathrooms;
  const hasBedChanges = JSON.stringify(editBeds) !== JSON.stringify(initialBeds);
  const hasAnyRoomOrBedChanges = hasRoomChanges || hasBedChanges;

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

  // === GESTIONE LETTI ===
  const addBed = (type: string) => {
    const bedType = BED_TYPES.find(t => t.tipo === type);
    if (!bedType) return;
    const newBed: Bed = {
      id: `bed_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: bedType.tipo,
      name: bedType.nome,
      loc: bedrooms > 1 ? `Camera ${Math.min(editBeds.length + 1, bedrooms)}` : 'Camera',
      cap: bedType.cap
    };
    setEditBeds([...editBeds, newBed]);
  };

  const removeBed = (bedId: string) => {
    setEditBeds(editBeds.filter(b => b.id !== bedId));
  };

  const updateBedLocation = (bedId: string, newLoc: string) => {
    setEditBeds(editBeds.map(b => b.id === bedId ? { ...b, loc: newLoc } : b));
  };

  // === UPLOAD FOTO ===
  const handleImageUpload = async (file: File, type: 'door' | 'building') => {
    if (!propertyId || !file.type.startsWith('image/')) return;
    setUploading(type);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = URL.createObjectURL(file); });
      const maxSize = 1200;
      let width = img.width, height = img.height;
      if (width > maxSize || height > maxSize) {
        if (width > height) { height = (height / width) * maxSize; width = maxSize; }
        else { width = (width / height) * maxSize; height = maxSize; }
      }
      canvas.width = width; canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve) => { canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8); });
      const formData = new FormData();
      formData.append('file', blob, `${type}.jpg`);
      formData.append('propertyId', propertyId);
      formData.append('photoType', type);
      const response = await fetch('/api/properties/upload-photo', { method: 'POST', body: formData });
      if (response.ok) {
        const result = await response.json();
        if (type === 'door') setDoorImage(result.url);
        else setBuildingImage(result.url);
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
  const handleSave = async () => {
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
    }
    
    if (propertyId) {
      try {
        const response = await fetch(`/api/properties/${propertyId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saveData),
        });
        if (!response.ok) { setSaving(false); return; }
      } catch (error) { console.error('Error:', error); setSaving(false); return; }
    }
    
    onSave({ 
      name, addr, apartment, floor, intercom, city, postalCode, checkIn, checkOut, 
      doorCode, keysLocation, accessNotes, images: { door: doorImage, building: buildingImage },
      ...(isAdmin ? { maxGuests, bedrooms, bathrooms } : {})
    });
    setSaving(false);
    setShowSuccess('saved');
  };

  // === RICHIESTA MODIFICA (PROPRIETARIO) ===
  const handleSendRequest = async () => {
    if (!propertyId || !hasAnyRoomOrBedChanges) return;
    
    // VALIDAZIONE: Blocca se ospiti > capacità letti
    if (maxGuests > bedCapacity && bedCapacity > 0) {
      alert(`⚠️ Non puoi richiedere ${maxGuests} ospiti con solo ${bedCapacity} posti letto.\n\nAggiungi prima altri letti per aumentare la capacità.`);
      return;
    }
    
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
          reason: reason || 'Richiesta modifica configurazione stanze e letti',
          newBeds: editBeds.map(b => ({ id: b.id, type: b.type, name: b.name, location: b.loc, capacity: b.cap }))
        }),
      });
      if (response.ok) {
        setShowSuccess('requested');
        setHasPendingRequest(true);
      }
    } catch (error) { console.error('Error:', error); }
    finally { setSendingRequest(false); }
  };

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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col" 
        style={{ maxHeight: 'calc(100vh - 16px)' }} 
        onClick={e => e.stopPropagation()}
      >
        {/* === HEADER === */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Modifica Proprietà</h2>
              <p className="text-xs text-slate-500">{propData.name}</p>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all">
              <div className="w-5 h-5 text-slate-500">{I.close}</div>
            </button>
          </div>
          
          {/* === TABS === */}
          <div className="flex bg-slate-100 rounded-xl p-1">
            {[
              { id: 'info', icon: '📋', label: 'Info' },
              { id: 'rooms', icon: '🛏️', label: 'Stanze' },
              { id: 'access', icon: '🔐', label: 'Accesso' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === tab.id 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden xs:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* === CONTENT === */}
        <div className="flex-1 overflow-y-auto">
          
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
            <div className="p-4 space-y-4">
              {/* Avviso richiesta pendente */}
              {!isAdmin && hasPendingRequest && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">⏳</span>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-800">Richiesta in attesa</p>
                    <p className="text-sm text-amber-600">Hai già una richiesta pendente per questa proprietà</p>
                  </div>
                </div>
              )}

              {/* Ospiti */}
              <div className={`rounded-xl p-4 border-2 transition-all ${hasRoomChanges && !isAdmin ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-slate-700">👥 Max Ospiti</span>
                  {hasRoomChanges && !isAdmin && <span className="text-xs bg-sky-500 text-white px-2 py-0.5 rounded-full">Modificato</span>}
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => setMaxGuests(Math.max(1, maxGuests - 1))} 
                    disabled={maxGuests <= 1 || (!isAdmin && hasPendingRequest)}
                    className="w-14 h-14 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-2xl font-bold text-slate-600 hover:border-slate-300 active:scale-95 disabled:opacity-40 transition-all shadow-sm">
                    −
                  </button>
                  <div className="text-center">
                    <span className="text-5xl font-bold text-slate-800">{maxGuests}</span>
                  </div>
                  <button onClick={() => setMaxGuests(Math.min(20, maxGuests + 1))} 
                    disabled={maxGuests >= 20 || (!isAdmin && hasPendingRequest)}
                    className="w-14 h-14 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-2xl font-bold text-slate-600 hover:border-slate-300 active:scale-95 disabled:opacity-40 transition-all shadow-sm">
                    +
                  </button>
                </div>
                {maxGuests > bedCapacity && bedCapacity > 0 && (
                  <p className="text-sm text-amber-600 text-center mt-3 bg-amber-50 py-2 rounded-lg">⚠️ Capacità letti attuale: {bedCapacity}</p>
                )}
              </div>

              {/* Camere e Bagni */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: '🚪', label: 'Camere', value: bedrooms, setter: setBedrooms, original: propData.bedrooms },
                  { icon: '🚿', label: 'Bagni', value: bathrooms, setter: setBathrooms, original: propData.bathrooms },
                ].map(item => (
                  <div key={item.label} className={`rounded-xl p-4 border-2 transition-all ${item.value !== item.original && !isAdmin ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600">{item.icon} {item.label}</span>
                      {item.value !== item.original && !isAdmin && <span className="w-2 h-2 bg-sky-500 rounded-full" />}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => item.setter(Math.max(1, item.value - 1))} 
                        disabled={item.value <= 1 || (!isAdmin && hasPendingRequest)}
                        className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center text-xl font-bold disabled:opacity-40">−</button>
                      <span className="text-3xl font-bold w-12 text-center">{item.value}</span>
                      <button onClick={() => item.setter(Math.min(10, item.value + 1))} 
                        disabled={item.value >= 10 || (!isAdmin && hasPendingRequest)}
                        className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center text-xl font-bold disabled:opacity-40">+</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* === EDITOR LETTI === */}
              <div className={`rounded-xl border-2 overflow-hidden transition-all ${hasBedChanges && !isAdmin ? 'border-sky-300' : 'border-slate-200'}`}>
                <button 
                  onClick={() => setShowBedEditor(!showBedEditor)}
                  disabled={!isAdmin && hasPendingRequest}
                  className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🛏️</span>
                    <div className="text-left">
                      <p className="font-medium text-slate-800">Letti configurati</p>
                      <p className="text-sm text-slate-500">{editBeds.length} letti • {bedCapacity} posti</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasBedChanges && !isAdmin && <span className="text-xs bg-sky-500 text-white px-2 py-0.5 rounded-full">Modificato</span>}
                    <div className={`w-6 h-6 text-slate-400 transition-transform ${showBedEditor ? 'rotate-180' : ''}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </div>
                </button>
                
                {showBedEditor && (
                  <div className="p-4 border-t border-slate-200 bg-white space-y-3">
                    {/* Lista letti */}
                    {editBeds.length > 0 ? (
                      <div className="space-y-2">
                        {editBeds.map((bed, idx) => (
                          <div key={bed.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2.5">
                            <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center text-lg">
                              {BED_TYPES.find(t => t.tipo === bed.type)?.icon || '🛏️'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 text-sm">{bed.name}</p>
                              <input 
                                type="text" 
                                value={bed.loc || ''} 
                                onChange={(e) => updateBedLocation(bed.id, e.target.value)}
                                placeholder="Posizione"
                                className="text-xs text-slate-500 bg-transparent border-none p-0 focus:outline-none w-full"
                              />
                            </div>
                            <span className="text-xs text-slate-400 bg-white px-2 py-1 rounded">{bed.cap}p</span>
                            <button onClick={() => removeBed(bed.id)} className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 active:scale-95">
                              <div className="w-4 h-4">{I.trash}</div>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 text-center py-4">Nessun letto configurato</p>
                    )}
                    
                    {/* Aggiungi letto */}
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-2">Aggiungi letto:</p>
                      <div className="flex flex-wrap gap-2">
                        {BED_TYPES.map(type => (
                          <button 
                            key={type.tipo}
                            onClick={() => addBed(type.tipo)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm hover:border-sky-300 hover:bg-sky-50 active:scale-95 transition-all"
                          >
                            <span>{type.icon}</span>
                            <span className="hidden sm:inline">{type.nome}</span>
                            <span className="text-xs text-slate-400">({type.cap}p)</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Motivazione (solo proprietario con modifiche) */}
              {!isAdmin && hasAnyRoomOrBedChanges && !hasPendingRequest && (
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                  <label className="block text-sm font-medium text-sky-800 mb-2">📝 Motivazione (opzionale)</label>
                  <textarea 
                    value={reason} onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-2.5 border border-sky-200 rounded-lg text-sm bg-white focus:border-sky-400 outline-none resize-none"
                    rows={2} placeholder="Es: Abbiamo aggiunto un divano letto in soggiorno..."
                  />
                </div>
              )}

              {/* Bottone richiesta (solo proprietario) */}
              {!isAdmin && (
                <div className={`rounded-xl p-4 ${hasAnyRoomOrBedChanges && !hasPendingRequest ? 'bg-sky-600' : 'bg-slate-100'}`}>
                  {hasAnyRoomOrBedChanges && !hasPendingRequest ? (
                    <button onClick={handleSendRequest} disabled={sendingRequest}
                      className="w-full text-white font-semibold py-2 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                      {sendingRequest ? (
                        <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Invio in corso...</>
                      ) : (
                        <>📨 Invia Richiesta di Modifica</>
                      )}
                    </button>
                  ) : hasPendingRequest ? (
                    <p className="text-sm text-slate-500 text-center">Attendi l'approvazione della richiesta precedente</p>
                  ) : (
                    <p className="text-sm text-slate-500 text-center">Le modifiche a ospiti, stanze e letti richiedono approvazione</p>
                  )}
                </div>
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
        <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-white flex gap-3">
          <button onClick={onClose} 
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 active:scale-[0.98] transition-all">
            Annulla
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`flex-1 py-3 text-white font-semibold rounded-xl active:scale-[0.98] transition-all ${
              saving ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'
            }`}>
            {saving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
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

export default function PropertyServiceConfig({ isAdmin = true, propertyId, initialImageUrl }: PropertyServiceConfigProps) {
  const [tab, setTab] = useState('dashboard');
  const [svcModal, setSvcModal] = useState<Service | null>(null);
  const [cfgModal, setCfgModal] = useState(false);
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
  const [ratingsData, setRatingsData] = useState<any>(null);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [propData, setPropData] = useState(prop);
  const [savingImage, setSavingImage] = useState(false);
  const [loadingProperty, setLoadingProperty] = useState(true);
  const [propertyBeds, setPropertyBeds] = useState<Bed[]>([]);
  const [usesOwnLinen, setUsesOwnLinen] = useState(false);
  const [savingLinen, setSavingLinen] = useState(false);
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
          ...doc.data(),
          id: doc.id
        }));
        
        // Filtra solo le completate
        const completedCleanings = allCleanings.filter(c => 
          c.status === "COMPLETED" || c.status === "completed"
        );
        
        // Trova l'ultima pulizia approfondita
        const approfonditaCleanings = completedCleanings
          .filter(c => c.serviceType === "APPROFONDITA")
          .sort((a, b) => {
            const dateA = a.scheduledDate?.toDate?.() || new Date(0);
            const dateB = b.scheduledDate?.toDate?.() || new Date(0);
            return dateB.getTime() - dateA.getTime();
          });
        
        const lastApprofonditaDate = approfonditaCleanings.length > 0
          ? approfonditaCleanings[0].scheduledDate?.toDate?.() || null
          : null;
        
        // Conta le pulizie standard completate dopo l'ultima approfondita
        let standardCount = 0;
        if (lastApprofonditaDate) {
          standardCount = completedCleanings.filter(c => {
            const cleaningDate = c.scheduledDate?.toDate?.() || new Date(0);
            const isStandard = !c.serviceType || c.serviceType === "STANDARD";
            return isStandard && cleaningDate > lastApprofonditaDate;
          }).length;
        } else {
          // Se non c'è mai stata un'approfondita, conta tutte le standard completate
          standardCount = completedCleanings.filter(c => 
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
          console.log("📦 Dati proprietà caricati:", data);
          
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
          
          // ==================== GESTIONE LETTI ====================
          let loadedBeds: Bed[] = [];
          
          // 🔍 DEBUG COMPLETO: Cosa contiene data?
          console.log("🔍 DEBUG COMPLETO data ricevuta:");
          console.log("   Tutti i campi:", Object.keys(data));
          console.log("   data.beds:", data.beds);
          console.log("   data.bedsConfig:", data.bedsConfig);
          console.log("   data.bedConfiguration:", data.bedConfiguration);
          
          // Se esistono letti salvati nel database, usali
          // 🔧 FIX: Cerca sia 'bedsConfig' (vecchio) che 'beds' (nuovo formato)
          const bedsData = data.bedsConfig || data.beds;
          console.log("🔍 DEBUG: Cercando letti nel database...");
          console.log("   data.bedsConfig:", data.bedsConfig ? `${data.bedsConfig.length} letti` : "non presente");
          console.log("   data.beds:", data.beds ? `${data.beds.length} letti` : "non presente");
          console.log("   bedsData finale:", bedsData ? `${bedsData.length} letti` : "non presente");
          
          if (bedsData && Array.isArray(bedsData) && bedsData.length > 0) {
            loadedBeds = bedsData.map((bed: any) => ({
              id: bed.id,
              type: bed.type,
              name: bed.name,
              loc: bed.location || bed.loc,
              cap: bed.capacity || bed.cap
            }));
            console.log("🛏️ Letti caricati dal database:", loadedBeds.map(b => ({ id: b.id, type: b.type, cap: b.cap })));
          } else if (data.bedConfiguration && Array.isArray(data.bedConfiguration) && data.bedConfiguration.length > 0) {
            // 🔧 FIX: Ricostruisci letti da bedConfiguration (struttura stanze/letti)
            console.log("🔍 Tentativo ricostruzione letti da bedConfiguration...");
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
            console.log("🛏️ Letti ricostruiti da bedConfiguration:", loadedBeds.map(b => ({ id: b.id, type: b.type, cap: b.cap })));
          } else {
            // Genera automaticamente i letti basandosi su maxGuests e bedrooms
            loadedBeds = generateAutoBeds(maxGuests, bedroomsCount);
            console.log("🛏️ Letti generati automaticamente:", loadedBeds);
            
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
              console.log("✅ Letti salvati nel database");
            } catch (err) {
              console.error("Errore salvataggio letti:", err);
            }
          }
          
          // Aggiorna lo stato e la variabile globale
          setPropertyBeds(loadedBeds);
          beds = loadedBeds;
          
          // Carica anche l'inventario per generare le configurazioni corrette
          let inventoryLinen: LinenItem[] = [];
          let inventoryBath: LinenItem[] = [];
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
            console.log("📦 Articoli biancheria letto caricati:", inventoryLinen);
            console.log("🛁 Articoli biancheria bagno caricati:", inventoryBath);
            
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
            console.log("🎁 Kit cortesia caricati:", kitItems);
            console.log("✨ Servizi extra caricati:", extras);
          } catch (err) {
            console.error("Errore caricamento inventario:", err);
          }
          
          // ==================== CONFIGURAZIONI DOTAZIONI ====================
          // Se esistono configurazioni salvate, usale. Altrimenti genera di default.
          console.log("🔍 DEBUG: Cercando serviceConfigs nel database...");
          console.log("   data.serviceConfigs:", data.serviceConfigs ? `${Object.keys(data.serviceConfigs).length} configurazioni` : "non presente");
          
          if (data.serviceConfigs && typeof data.serviceConfigs === 'object' && Object.keys(data.serviceConfigs).length > 0) {
            // Mostra dettagli config per debug
            Object.entries(data.serviceConfigs).forEach(([guests, cfg]: [string, any]) => {
              console.log(`   Config ${guests} ospiti: beds=[${(cfg.beds || []).join(', ')}]`);
            });
            
            // 🔧 FIX: Verifica che gli ID dei letti nelle config corrispondano ai letti caricati
            const loadedBedIds = new Set(loadedBeds.map(b => b.id));
            const firstConfig = Object.values(data.serviceConfigs)[0] as any;
            const configBedIds = firstConfig?.beds || [];
            const hasMatchingBeds = configBedIds.some((id: string) => loadedBedIds.has(id));
            
            console.log("🔍 Verifica match ID letti:");
            console.log("   ID letti caricati:", Array.from(loadedBedIds));
            console.log("   ID letti in config:", configBedIds);
            console.log("   Match trovato:", hasMatchingBeds);
            
            if (hasMatchingBeds || configBedIds.length === 0) {
              // Gli ID corrispondono, usa le configurazioni salvate
              setCfgs(data.serviceConfigs);
              console.log("✅ Configurazioni caricate da Firestore (ID corrispondono)");
            } else {
              // 🔧 MISMATCH: Gli ID non corrispondono
              // Tentativo 1: Ricostruisci i letti dagli ID nelle serviceConfigs
              console.warn("⚠️ MISMATCH ID LETTI! Tentativo ricostruzione da serviceConfigs...");
              
              // Estrai tutti gli ID letti unici da tutte le configurazioni
              const allBedIdsFromConfigs = new Set<string>();
              Object.values(data.serviceConfigs).forEach((cfg: any) => {
                (cfg.beds || []).forEach((id: string) => allBedIdsFromConfigs.add(id));
              });
              
              console.log("   ID letti trovati in serviceConfigs:", Array.from(allBedIdsFromConfigs));
              
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
                
                console.log("🛏️ Letti ricostruiti da serviceConfigs:", reconstructedBeds.map(b => ({ id: b.id, type: b.type, cap: b.cap })));
                
                // Usa i letti ricostruiti
                loadedBeds = reconstructedBeds;
                setPropertyBeds(reconstructedBeds);
                beds = reconstructedBeds;
                
                // Usa le configurazioni originali (ora i letti matchano!)
                setCfgs(data.serviceConfigs);
                console.log("✅ Configurazioni caricate (letti ricostruiti da serviceConfigs)");
                
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
                  console.log("✅ Letti ricostruiti salvati su Firestore");
                } catch (err) {
                  console.error("Errore salvataggio letti:", err);
                }
              } else {
                // Fallback: rigenera tutto
                console.warn("⚠️ Impossibile ricostruire, rigenero configurazioni con letti nuovi...");
                const bathroomsCount = data.bathrooms || 1;
                const newCfgs = generateAllConfigs(maxGuests, loadedBeds, bathroomsCount, inventoryLinen, inventoryBath);
                setCfgs(newCfgs);
                console.log("✅ Configurazioni rigenerate con letti nuovi:", newCfgs);
                
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
                  console.log("✅ Nuove configurazioni E letti salvati su Firestore");
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
            console.log("✅ Configurazioni generate automaticamente:", newCfgs);
            
            // Salva le configurazioni generate su Firestore
            try {
              await fetch(`/api/properties/${propertyId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serviceConfigs: newCfgs })
              });
              console.log("✅ Configurazioni salvate su Firestore");
            } catch (err) {
              console.error("Errore salvataggio configurazioni:", err);
            }
          }
          
          // Le pulizie sono caricate in realtime con onSnapshot (vedi useEffect separato)
          setLoadingCleanings(false);
        }
      } catch (error) {
        console.error("Errore caricamento proprietà:", error);
      } finally {
        setLoadingProperty(false);
      }
    }
    
    loadPropertyData();
  }, [propertyId]);

  // ==================== REALTIME PULIZIE ====================
  useEffect(() => {
    if (!propertyId) return;
    
    console.log("🔴 Avvio listener REALTIME pulizie per propertyId:", propertyId);
    
    const q = query(
      collection(db, "cleanings"),
      where("propertyId", "==", propertyId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("🔴 Snapshot ricevuto:", snapshot.docs.length, "pulizie per", propertyId);
      
      if (snapshot.docs.length === 0) {
        console.log("🔴 Nessuna pulizia trovata per questa proprietà");
      }
      
      const loadedServices: Service[] = snapshot.docs.map((doc) => {
        const c = doc.data();
        console.log("🔴 Pulizia raw:", doc.id, c);
        
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
        };
      });
      
      // Ordina per data
      loadedServices.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      console.log("🔴 Servizi REALTIME:", loadedServices.length);
      setServices(loadedServices);
      setLoadingCleanings(false);
    }, (error) => {
      console.error("❌ Errore listener pulizie:", error);
      setLoadingCleanings(false);
    });
    
    // Cleanup: rimuovi listener quando il componente si smonta
    return () => {
      console.log("🔴 Rimuovo listener REALTIME pulizie");
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
      } else {
        // Se l'API fallisce, imposta dati vuoti invece di bloccare
        console.warn("API ratings non disponibile:", res.status);
        setRatingsData(null);
      }
    } catch (err) {
      console.error("Errore caricamento ratings:", err);
      setRatingsData(null);
    }
    setLoadingRatings(false);
  };

  // Carica ratings all'avvio per il banner (silenziosamente)
  useEffect(() => {
    if (propertyId) {
      // Carica in background senza bloccare
      loadRatingsData().catch(() => {});
    }
  }, [propertyId]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && propertyId) {
      setSavingImage(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64Image = ev.target?.result as string;
        setPropertyImage(base64Image);

        try {
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
      };
      reader.readAsDataURL(file);
    } else if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPropertyImage(ev.target?.result as string);
      reader.readAsDataURL(file);
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

  const handleSavePropertyInfo = (data: Partial<PropertyData>) => {
    setPropData(prev => ({ ...prev, ...data }));
  };

  // Toggle biancheria propria
  const handleToggleLinen = async (useOwn: boolean) => {
    if (!propertyId || savingLinen) return;
    
    setSavingLinen(true);
    try {
      const response = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usesOwnLinen: useOwn }),
      });
      
      if (response.ok) {
        setUsesOwnLinen(useOwn);
        console.log(`✅ Biancheria propria: ${useOwn ? 'attivata' : 'disattivata'}`);
      } else {
        console.error('Errore salvataggio impostazione biancheria');
      }
    } catch (error) {
      console.error('Errore:', error);
    } finally {
      setSavingLinen(false);
    }
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
        console.log('✅ Sync completata:', data);
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
    if (!propertyId) return;
    
    try {
      const response = await fetch(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceConfigs: configs }),
      });
      
      if (response.ok) {
        setCfgModal(false);
        console.log('✅ Configurazione salvata su Firestore');
      } else {
        console.error('Errore salvataggio configurazione');
        alert('Errore nel salvataggio della configurazione');
      }
    } catch (error) {
      console.error('Errore salvataggio configurazione:', error);
      alert('Errore nel salvataggio della configurazione');
    }
  };

  const getPrice = (s: Service) => { const c = cfgs[s.guests]; if (!c) return { clean: propData.cleanPrice, linen: 0 }; return { clean: propData.cleanPrice, linen: calcBL(c.bl || {}) + calcArr(c.ba || {}, bathItems) + calcArr(c.ki || {}, kitItems) + calcArr((c.ex || {}) as Record<string, boolean>, extras) }; };
  
  // Funzione per aprire la nuova EditCleaningModal
  const openEditCleaningModal = (s: Service) => {
    setSvcModal(s);
  };
  
  const yearlyRevenue = monthlyStats.reduce((sum, m) => sum + m.revenue, 0);
  const currentMonth = monthlyStats[monthlyStats.length - 1];
  const prevMonth = monthlyStats[monthlyStats.length - 2];
  const monthlyTrend = prevMonth ? ((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-20" style={{ fontFamily: "-apple-system, sans-serif" }}>
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

              {/* Bottom Row - Property Quick Info */}
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center hover:shadow-lg hover:border-slate-300 transition-all group">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                    <div className="w-5 h-5 text-slate-500 group-hover:text-sky-600 transition-colors">{I.bed}</div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{propertyBeds.length}</p>
                  <p className="text-xs text-slate-500">Letti Configurati</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center hover:shadow-lg hover:border-slate-300 transition-all group">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                    <div className="w-5 h-5 text-slate-500 group-hover:text-sky-600 transition-colors">{I.users}</div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{propData.maxGuests}</p>
                  <p className="text-xs text-slate-500">Capacità Max</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center hover:shadow-lg hover:border-slate-300 transition-all group">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                    <div className="w-5 h-5 text-slate-500 group-hover:text-sky-600 transition-colors">{I.bath}</div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{propData.bathrooms}</p>
                  <p className="text-xs text-slate-500">Bagni</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center hover:shadow-lg hover:border-slate-300 transition-all group">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                    <div className="w-5 h-5 text-slate-500 group-hover:text-sky-600 transition-colors">{I.clock}</div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{propData.checkIn}</p>
                  <p className="text-xs text-slate-500">Check-in</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center hover:shadow-lg hover:border-slate-300 transition-all group">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                    <div className="w-5 h-5 text-slate-500 group-hover:text-sky-600 transition-colors">{I.clock}</div>
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{propData.checkOut}</p>
                  <p className="text-xs text-slate-500">Check-out</p>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border p-4 hover-lift animate-fadeInUp stagger-1">
              <div className="flex items-center justify-between mb-2"><div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center"><div className="w-4 h-4 text-emerald-600">{I.money}</div></div><div className="flex items-center gap-1 text-emerald-500"><div className="w-3 h-3">{I.trend}</div></div></div>
              <p className="text-xl font-bold">€{yearlyRevenue.toLocaleString()}</p><p className="text-[10px] text-slate-500">Fatturato Annuale</p>
            </div>
            <div className="bg-white rounded-xl border p-4 hover-lift animate-fadeInUp stagger-2">
              <div className="flex items-center justify-between mb-2"><div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center"><div className="w-4 h-4 text-blue-600">{I.chart}</div></div><div className={`flex items-center gap-1 ${monthlyTrend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}><div className="w-3 h-3">{monthlyTrend >= 0 ? I.trend : I.trendDown}</div><span className="text-[10px] font-medium">{monthlyTrend >= 0 ? '+' : ''}{monthlyTrend.toFixed(0)}%</span></div></div>
              <p className="text-xl font-bold">€{currentMonth.revenue}</p><p className="text-[10px] text-slate-500">Fatturato {currentMonth.month}</p>
            </div>
          </div>
          <div 
            onClick={() => isAdmin && setPriceModal(true)}
            className={`bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 text-white animate-fadeInUp stagger-2 ${isAdmin ? 'cursor-pointer hover:from-slate-700 hover:to-slate-800 active:scale-[0.99] transition-all' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center"><div className="w-6 h-6">{I.clean}</div></div><div><p className="text-white/70 text-xs">Prezzo Pulizia {isAdmin && <span className="text-white/50">(clicca per modificare)</span>}</p><p className="text-2xl font-bold">€{propData.cleanPrice}</p></div></div>
              <div className="text-right">
                <p className="text-white/50 text-[10px]">Max {propData.maxGuests} ospiti</p>
                <p className="text-white/50 text-[10px]">{propData.bathrooms} bagni</p>
                {isAdmin && <div className="mt-2 w-6 h-6 text-white/40 ml-auto">{I.pencil}</div>}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4 animate-fadeInUp stagger-3">
            <div className="flex items-center justify-between mb-3"><div><h3 className="text-sm font-semibold">Andamento Fatturato</h3><p className="text-[10px] text-slate-500">Ultimi 12 mesi</p></div><div className="px-2 py-1 bg-slate-100 rounded-md"><span className="text-[10px] font-medium text-slate-600">2025-2026</span></div></div>
            <MiniChart data={monthlyStats} />
          </div>
          
          {/* Banner Valutazioni - Mobile */}
          <div 
            onClick={() => setRatingsModal(true)}
            className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-4 animate-fadeInUp stagger-3 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xl shadow-lg shadow-amber-500/30">
                  ⭐
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Valutazioni</h3>
                  <p className="text-[10px] text-slate-500">
                    {ratingsData?.summary ? `${ratingsData.summary.totalRatings} valut. • ${ratingsData.summary.overallAverage.toFixed(1)}/5` : 'Vedi dettagli'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {ratingsData?.summary && (
                  <div className={`text-center px-3 py-1.5 rounded-lg ${
                    ratingsData.summary.overallAverage >= 4 ? 'bg-emerald-100' :
                    ratingsData.summary.overallAverage >= 3 ? 'bg-amber-100' : 'bg-rose-100'
                  }`}>
                    <div className={`text-lg font-black ${
                      ratingsData.summary.overallAverage >= 4 ? 'text-emerald-600' :
                      ratingsData.summary.overallAverage >= 3 ? 'text-amber-600' : 'text-rose-600'
                    }`}>
                      {ratingsData.summary.overallAverage.toFixed(1)}
                    </div>
                  </div>
                )}
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
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
          <div className="grid grid-cols-3 gap-2 animate-fadeInUp stagger-5">
            <div className="bg-white rounded-xl border p-3 text-center"><div className="w-7 h-7 mx-auto mb-1 rounded-lg bg-slate-100 flex items-center justify-center"><div className="w-4 h-4 text-slate-500">{I.bed}</div></div><p className="text-lg font-bold">{propertyBeds.length}</p><p className="text-[9px] text-slate-500">Letti</p></div>
            <div className="bg-white rounded-xl border p-3 text-center"><div className="w-7 h-7 mx-auto mb-1 rounded-lg bg-slate-100 flex items-center justify-center"><div className="w-4 h-4 text-slate-500">{I.users}</div></div><p className="text-lg font-bold">{propData.maxGuests}</p><p className="text-[9px] text-slate-500">Max Ospiti</p></div>
            <div className="bg-white rounded-xl border p-3 text-center"><div className="w-7 h-7 mx-auto mb-1 rounded-lg bg-slate-100 flex items-center justify-center"><div className="w-4 h-4 text-slate-500">{I.bath}</div></div><p className="text-lg font-bold">{propData.bathrooms}</p><p className="text-[9px] text-slate-500">Bagni</p></div>
          </div>
          {/* ─── SEZIONE DURATA PULIZIE - MOBILE (SOLO ADMIN) ─── */}
          {isAdmin && (
          <PropertyDurationStats 
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
                      const isToday = new Date(s.date).toDateString() === new Date().toDateString();
                      return (
                        <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${isPast ? 'opacity-60' : ''} ${isToday ? 'bg-sky-50/50' : ''}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center text-white flex-shrink-0 ${isPast ? 'bg-slate-400' : isToday ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-gradient-to-br from-sky-500 to-sky-600'}`}>
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
                            ) : isToday ? (
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
            /* ========== MOBILE SERVICES - CARDS ========== */
            <div className="space-y-3">
            {services.map((s, idx) => { 
            const p = getPrice(s); 
            const isExpanded = expandedCardId === s.id;
            const guestConfig = cfgs[s.guests] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} };
            
            return (
          <div key={s.id} className={`bg-white rounded-xl border overflow-hidden hover:shadow-lg hover:border-sky-200 transition-all ${isDesktop ? 'border-slate-200' : ''} animate-fadeInUp stagger-${Math.min(idx + 1, 5)}`}>
            {/* Header compatto */}
            <div className={`flex items-center gap-3 ${isDesktop ? 'p-4' : 'p-3'}`}>
              {/* Data */}
              <div className={`rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 flex flex-col items-center justify-center text-white flex-shrink-0 ${isDesktop ? 'w-16 h-16' : 'w-12 h-12'}`}>
                <span className={`font-bold leading-none ${isDesktop ? 'text-2xl' : 'text-lg'}`}>{new Date(s.date).getDate()}</span>
                <span className={`uppercase ${isDesktop ? 'text-xs' : 'text-[9px]'}`}>{new Date(s.date).toLocaleDateString('it-IT', { month: 'short' })}</span>
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={`font-semibold truncate ${isDesktop ? 'text-base' : 'text-sm'}`}>{new Date(s.date).toLocaleDateString('it-IT', { weekday: 'long' })}</p>
                <p className={`text-slate-500 ${isDesktop ? 'text-sm' : 'text-[11px]'}`}>{s.time} • {s.op}</p>
              </div>
              
              {/* Ospiti - click per aprire modal */}
              <div 
                className={`flex items-center gap-1.5 bg-slate-100 rounded-lg cursor-pointer hover:bg-slate-200 active:scale-95 transition-all ${isDesktop ? 'px-4 py-2.5' : 'px-2.5 py-1.5'}`}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setGuestChangeModal({
                    serviceId: s.id,
                    oldGuests: s.guests,
                    newGuests: s.guests,
                    date: new Date(s.date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
                  });
                }}
              >
                <div className="w-4 h-4 text-slate-500">{I.users}</div>
                <span className="text-sm font-semibold">{s.guests}</span>
                <div className="w-3 h-3 text-blue-500">{I.pencil}</div>
              </div>
              
              {/* Prezzo */}
              <div className="text-right flex-shrink-0">
                <p className="text-base font-bold">€{formatPrice(p.clean + p.linen)}</p>
              </div>
              
              {/* Freccia espandi */}
              <button 
                onClick={() => setExpandedCardId(isExpanded ? null : s.id)}
                className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all flex-shrink-0"
              >
                <div className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>{I.down}</div>
              </button>
            </div>
            
            {/* Contenuto espandibile */}
            {isExpanded && (
              <div className="border-t border-slate-100">
                {/* Dettagli prezzo */}
                <div className="px-3 py-2 bg-slate-50 flex justify-between text-xs">
                  <span className="text-slate-500">Pulizia: <span className="font-medium text-slate-700">€{formatPrice(p.clean)}</span></span>
                  <span className="text-slate-500">Dotazioni: <span className="font-medium text-slate-700">€{formatPrice(p.linen)}</span></span>
                </div>
                
                {/* Biancheria Letto */}
                <div className="p-3 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                      <div className="w-3.5 h-3.5 text-blue-600">{I.bed}</div>
                    </div>
                    <span className="text-xs font-semibold text-slate-700">Biancheria Letto</span>
                  </div>
                  <div className="space-y-2">
                    {(guestConfig.beds || []).map(bedId => {
                      const bed = beds.find(b => b.id === bedId);
                      const bedLinen = guestConfig.bl?.[bedId] || guestConfig.bl?.['all'] || {};
                      if (!bed) return null;
                      return (
                        <div key={bedId} className="bg-blue-50 rounded-lg p-2">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-5 h-5 rounded bg-white flex items-center justify-center">
                              <div className="w-3 h-3 text-blue-600">{getBedIcon(bed.type)}</div>
                            </div>
                            <span className="text-[11px] font-medium text-blue-700">{bed.name}</span>
                            <span className="text-[10px] text-blue-500">({bed.loc})</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(bedLinen).map(([itemId, qty]) => {
                              if (!qty || qty === 0) return null;
                              const item = (linen[bed.type] || []).find(i => i.id === itemId);
                              return item ? (
                                <span key={itemId} className="px-1.5 py-0.5 bg-white rounded text-[10px] text-slate-600">
                                  {item.n}: <span className="font-medium">{qty}</span>
                                </span>
                              ) : null;
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {(!guestConfig.beds || guestConfig.beds.length === 0) && (
                      <p className="text-[11px] text-slate-400 italic">Nessun letto configurato</p>
                    )}
                  </div>
                </div>
                
                {/* Biancheria Bagno */}
                {Object.keys(guestConfig.ba || {}).length > 0 && (
                  <div className="p-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center">
                        <div className="w-3.5 h-3.5 text-purple-600">{I.towel}</div>
                      </div>
                      <span className="text-xs font-semibold text-slate-700">Biancheria Bagno</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(guestConfig.ba || {}).map(([itemId, qty]) => {
                        if (!qty || qty === 0) return null;
                        const item = bathItems.find(i => i.id === itemId);
                        return item ? (
                          <span key={itemId} className="px-2 py-1 bg-purple-50 rounded-lg text-[10px] text-purple-700">
                            {item.n}: <span className="font-semibold">{qty}</span>
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
                
                {/* Bottone modifica */}
                <div className="p-3 border-t border-slate-100 bg-slate-50">
                  <button
                    onClick={() => openEditCleaningModal(s)}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-semibold rounded-lg active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    <div className="w-4 h-4">{I.pencil}</div>
                    Modifica Dettagli Completi
                  </button>
                </div>
              </div>
            )}
          </div>
        ); })}
            </div>
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
                
                <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition-all">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <div className="w-5 h-5 text-slate-600">{I.info}</div>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Info Proprietà</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">{[{ i: 'users', v: propData.maxGuests.toString(), l: 'Ospiti' }, { i: 'bed', v: propData.bedrooms?.toString() || '1', l: 'Camere' }, { i: 'bath', v: propData.bathrooms.toString(), l: 'Bagni' }].map((x, i) => (<div key={i} className="bg-slate-50 rounded-xl p-4 text-center hover:bg-slate-100 hover:shadow-md transition-all cursor-default"><div className="w-6 h-6 mx-auto mb-2 text-slate-500">{I[x.i]}</div><p className="text-xl font-bold text-slate-800">{x.v}</p><p className="text-xs text-slate-500 uppercase mt-1">{x.l}</p></div>))}</div>
                  <div className="grid grid-cols-2 gap-3">{[{ i: 'clock', v: propData.checkIn, l: 'Check-in' }, { i: 'clock', v: propData.checkOut, l: 'Check-out' }].map((x, i) => (<div key={i} className="bg-slate-50 rounded-xl p-4 text-center hover:bg-slate-100 hover:shadow-md transition-all cursor-default"><div className="w-6 h-6 mx-auto mb-2 text-slate-500">{I[x.i]}</div><p className="text-xl font-bold text-slate-800">{x.v}</p><p className="text-xs text-slate-500 uppercase mt-1">{x.l}</p></div>))}</div>
                  {propertyBeds.length > 0 && (
                    <div className="mt-4 p-4 bg-sky-50 rounded-xl border border-sky-100">
                      <p className="text-sm font-bold text-sky-700 mb-2">🛏️ Letti configurati ({propertyBeds.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {propertyBeds.map(bed => (
                          <span key={bed.id} className="px-3 py-1 bg-white rounded-lg text-xs text-slate-600 border border-sky-100">
                            {bed.name} • {bed.loc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Colonna Centro - Azioni */}
              <div className="space-y-4">
                <button onClick={() => setCfgModal(true)} className="w-full bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-5 hover:shadow-lg hover:border-sky-200 transition-all active:scale-[0.99]">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                    <div className="w-7 h-7 text-slate-600">{I.package}</div>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-base font-bold text-slate-800">Configurazione Dotazioni</p>
                    <p className="text-sm text-slate-500">Letti, biancheria, kit, extra</p>
                  </div>
                  <div className="w-6 h-6 text-slate-400">{I.right}</div>
                </button>
                
                {/* 🧺 SEZIONE BIANCHERIA */}
                <div className={`bg-white rounded-2xl border-2 p-5 transition-all ${usesOwnLinen ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${usesOwnLinen ? 'bg-gradient-to-br from-amber-100 to-amber-200' : 'bg-gradient-to-br from-sky-100 to-sky-200'}`}>
                      <span className="text-2xl">{usesOwnLinen ? '🏠' : '🧺'}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-bold text-slate-800">Servizio Biancheria</p>
                      <p className="text-sm text-slate-500">
                        {usesOwnLinen 
                          ? 'Usa biancheria propria o altra ditta' 
                          : 'Biancheria fornita dalla nostra ditta'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleLinen(!usesOwnLinen)}
                      disabled={savingLinen}
                      className={`relative w-14 h-8 rounded-full transition-all ${savingLinen ? 'opacity-50' : ''} ${usesOwnLinen ? 'bg-amber-500' : 'bg-sky-500'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${usesOwnLinen ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className={`mt-4 p-3 rounded-xl text-sm ${usesOwnLinen ? 'bg-amber-100/50 text-amber-800' : 'bg-sky-100/50 text-sky-800'}`}>
                    {usesOwnLinen ? (
                      <p>⚠️ <strong>Biancheria disattivata</strong> — Non verranno creati ordini biancheria per le pulizie. Il configuratore resta utile agli operatori per sapere come allestire la casa.</p>
                    ) : (
                      <p>✅ <strong>Biancheria attiva</strong> — Ad ogni pulizia verrà creato automaticamente un ordine di consegna biancheria basato sulla configurazione impostata.</p>
                    )}
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
              
              {/* Colonna Destra - Zona Pericolo */}
              <div>
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
          <div className="bg-white rounded-xl border p-4 animate-fadeInUp stagger-1">
            <h3 className="text-sm font-semibold mb-3">Info Proprietà</h3>
            <div className="grid grid-cols-3 gap-2 mb-2">{[{ i: 'users', v: propData.maxGuests.toString(), l: 'Ospiti' }, { i: 'bed', v: propData.bedrooms?.toString() || '1', l: 'Camere' }, { i: 'bath', v: propData.bathrooms.toString(), l: 'Bagni' }].map((x, i) => (<div key={i} className="bg-slate-50 rounded-lg p-2 text-center hover:bg-slate-100 transition-colors"><div className="w-4 h-4 mx-auto mb-1 text-slate-400">{I[x.i]}</div><p className="text-sm font-semibold">{x.v}</p><p className="text-[8px] text-slate-500 uppercase">{x.l}</p></div>))}</div>
            <div className="grid grid-cols-2 gap-2">{[{ i: 'clock', v: propData.checkIn, l: 'Check-in' }, { i: 'clock', v: propData.checkOut, l: 'Check-out' }].map((x, i) => (<div key={i} className="bg-slate-50 rounded-lg p-2 text-center hover:bg-slate-100 transition-colors"><div className="w-4 h-4 mx-auto mb-1 text-slate-400">{I[x.i]}</div><p className="text-sm font-semibold">{x.v}</p><p className="text-[8px] text-slate-500 uppercase">{x.l}</p></div>))}</div>
            {propertyBeds.length > 0 && (
              <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                <p className="text-xs font-medium text-blue-700 mb-1">🛏️ Letti configurati ({propertyBeds.length})</p>
                <div className="flex flex-wrap gap-1">
                  {propertyBeds.map(bed => (
                    <span key={bed.id} className="px-2 py-0.5 bg-white rounded text-[10px] text-slate-600">
                      {bed.name} • {bed.loc}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setCfgModal(true)} className="w-full bg-white rounded-xl border p-4 flex items-center gap-4 hover-lift active:scale-[0.98] animate-fadeInUp stagger-2"><div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center"><div className="w-6 h-6 text-slate-600">{I.package}</div></div><div className="flex-1 text-left"><p className="text-sm font-medium">Configurazione Dotazioni</p><p className="text-[11px] text-slate-500">Letti, biancheria, kit, extra</p></div><div className="w-5 h-5 text-slate-400">{I.right}</div></button>
          
          {/* 🧺 SEZIONE BIANCHERIA MOBILE */}
          <div className={`rounded-xl border-2 p-4 animate-fadeInUp stagger-2 ${usesOwnLinen ? 'border-amber-300 bg-amber-50/50' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${usesOwnLinen ? 'bg-amber-100' : 'bg-sky-100'}`}>
                <span className="text-xl">{usesOwnLinen ? '🏠' : '🧺'}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Servizio Biancheria</p>
                <p className="text-[11px] text-slate-500">{usesOwnLinen ? 'Usa biancheria propria' : 'Fornita dalla ditta'}</p>
              </div>
              <button
                onClick={() => handleToggleLinen(!usesOwnLinen)}
                disabled={savingLinen}
                className={`relative w-12 h-7 rounded-full transition-all ${savingLinen ? 'opacity-50' : ''} ${usesOwnLinen ? 'bg-amber-500' : 'bg-sky-500'}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all ${usesOwnLinen ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
            <div className={`mt-3 p-2 rounded-lg text-xs ${usesOwnLinen ? 'bg-amber-100/70 text-amber-800' : 'bg-sky-100/70 text-sky-800'}`}>
              {usesOwnLinen 
                ? '⚠️ Nessun ordine biancheria verrà creato automaticamente' 
                : '✅ Ordini biancheria creati automaticamente ad ogni pulizia'}
            </div>
          </div>
          <button onClick={() => setEditInfoModal(true)} className="w-full bg-white rounded-xl border p-4 flex items-center gap-4 hover-lift active:scale-[0.98] animate-fadeInUp stagger-3"><div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center"><div className="w-6 h-6 text-slate-600">{I.edit}</div></div><div className="flex-1 text-left"><p className="text-sm font-medium">Modifica Informazioni Generali</p><p className="text-[11px] text-slate-500">Nome, indirizzo, orari, capacità</p></div><div className="w-5 h-5 text-slate-400">{I.right}</div></button>
          
          {/* Banner Accesso Proprietà Mobile */}
          <div className="animate-fadeInUp stagger-4">
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

      {cfgModal && <CfgModal cfgs={cfgs} setCfgs={setCfgs} onClose={() => setCfgModal(false)} onSave={handleSaveConfig} maxGuests={propData.maxGuests} propertyBeds={propertyBeds} />}
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
      {editInfoModal && <UnifiedPropertyModal propData={propData} beds={propertyBeds} isAdmin={isAdmin} propertyId={propertyId} onClose={() => setEditInfoModal(false)} onSave={handleSavePropertyInfo} />}
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
                <PropertyRatingsSection propertyId={propertyId} isAdmin={isAdmin} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
