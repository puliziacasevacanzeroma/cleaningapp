"use client";

import React, { useState, useMemo, useRef, useEffect, lazy, Suspense, startTransition, useTransition, useCallback, useDeferredValue } from "react";
import { doc, updateDoc, collection, query, where, deleteField } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { PulizieFilters } from "~/components/proprietario/PulizieFilters";
import { motion, AnimatePresence } from "framer-motion";
// 🚀 Modali lazy: caricate solo quando servono, non al mount
import { ALL_INVENTORY_ITEMS, getDefaultLinenConfig } from "~/lib/linenItems";
import { calculateDotazioni } from "~/lib/calculateDotazioni";
import CleaningCardAdmin from "~/components/cleaning/CleaningCardAdmin";
import { PulizieModals} from "~/components/proprietario/PulizieModals";
import { isSameDay, getDateString, toDate } from "~/lib/dateUtils";
import type { PulizieModalsHandle } from "~/components/proprietario/PulizieModals";
import { getCalendarState, setCalendarDate, setCalendarScroll } from "~/lib/stores/calendarStateStore";

interface BedConfig {
  id: string;
  type: string;
  name: string;
  location: string;
  capacity: number;
}

interface Property {
  id: string;
  name: string;
  address: string;
  imageUrl?: string;
  bedsConfig?: BedConfig[];
  cleaningPrice?: number;
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
  serviceConfigs?: Record<number, {
    beds: string[];
    bl: Record<string, Record<string, number>>;
    ba: Record<string, number>;
    ki: Record<string, number>;
    ex: Record<string, boolean>;
  }>;
}

interface Operator {
  id: string;
  name: string | null;
}

interface LinenItem {
  id: string;
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  cleaningId?: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  scheduledDate?: Date;
  scheduledTime?: string;
  items: LinenItem[];
  status: string;
  riderName?: string;
  deliveryFee?: number;
  deliveryFeeEnabled?: boolean;
  bedMaking?: boolean;
  bedMakingCount?: number;
  bedMakingFee?: number;
  bedMakingBeds?: { name: string; type: string; location: string }[];
}

interface InventoryItem {
  id: string;
  key?: string; // 🔥 AGGIUNTO: key per mapping ID semantici
  name: string;
  sellPrice: number;
  category: string;
}

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName?: string;
  date: Date;
  status: string;
  scheduledTime?: string | null;
  operator?: Operator | null;
  operators?: Operator[];
  guestsCount?: number;
  guestsConfirmed?: boolean; // 🆕 True solo se inserito manualmente dall'utente
  adulti?: number;
  neonati?: number;
  notes?: string;
  bookingSource?: string;
  guestName?: string;
  price?: number;
  // Campi per tipo servizio e prezzo
  contractPrice?: number;
  customLinenConfig?: any;
  linenConfigModified?: boolean;
  hasLinenOrder?: boolean; // 🔥 FIX: Flag se la pulizia ha ordine biancheria
  serviceType?: string;
  serviceTypeName?: string;
  priceModified?: boolean;
  priceChangeReason?: string;
  sgrossoReason?: string;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  // Campi per tracciamento modifica data
  originalDate?: Date | null;
  dateModifiedAt?: Date | null;
  // Campi per valutazione
  ratingScore?: number | null;
  ratingId?: string | null;
  // Campi per completamento (admin)
  photos?: string[];
  startedAt?: any;
  completedAt?: any;
  // Campi per deadline mancata
  missedDeadline?: boolean;
  missedDeadlineAt?: any;
  // Servizi extra
  extraServices?: { name: string; price: number }[];
}

// 🔴 NUOVO: Tipo unificato per servizi (pulizia o consegna standalone)
type ServiceType = 'cleaning' | 'cleaning_with_linen' | 'linen_only';

// 🔥 Funzione per trovare il prezzo di un item dell'ordine (mapping ID semantici -> inventario)
const findOrderItemPrice = (orderItem: { id?: string; itemId?: string; name: string; price?: number; unitPrice?: number; totalPrice?: number }, inventory: InventoryItem[]): number => {
  // 0. Se l'item ha già un prezzo unitario salvato, usalo!
  if (orderItem.unitPrice && orderItem.unitPrice > 0) {
    return orderItem.unitPrice;
  }
  
  // 0b. Se l'item ha già un prezzo salvato (vecchio formato), usalo!
  if (orderItem.price && orderItem.price > 0) {
    return orderItem.price;
  }
  
  // Ottieni l'ID (compatibilità con entrambi i formati)
  const itemId = orderItem.itemId || orderItem.id;
  if (!itemId) {
    console.warn("⚠️ Item senza ID:", orderItem);
    return 0;
  }
  
  // 1. Prova match esatto per ID
  const byId = inventory.find(i => i.id === itemId);
  if (byId) return byId.sellPrice;
  
  // 2. Prova match per KEY (es: "doubleSheets" -> trova "item_doubleSheets")
  const byKey = inventory.find(i => i.key === itemId);
  if (byKey) return byKey.sellPrice;
  
  // 3. Prova con prefisso "item_" (es: "doubleSheets" -> "item_doubleSheets")
  const withPrefix = inventory.find(i => i.id === `item_${itemId}`);
  if (withPrefix) return withPrefix.sellPrice;
  
  // 4. Prova senza prefisso "item_" (es: "item_doubleSheets" -> cerca "doubleSheets")
  if (itemId.startsWith('item_')) {
    const withoutPrefix = itemId.replace('item_', '');
    const found = inventory.find(i => i.key === withoutPrefix || i.id === withoutPrefix);
    if (found) return found.sellPrice;
  }
  
  // 5. Mapping ID standard conosciuti
  const idMapping: Record<string, string[]> = {
    // Biancheria Letto
    'doubleSheets': ['item_doubleSheets', 'lenzuola_matrimoniale', 'lenzuolaMatr'],
    'singleSheets': ['item_singleSheets', 'lenzuola_singolo', 'lenzuolaSing'],
    'pillowcases': ['item_pillowcases', 'federa', 'federe'],
    'lenzuola_matr': ['item_doubleSheets', 'doubleSheets'],
    'federa': ['item_pillowcases', 'pillowcases'],
    // Biancheria Bagno
    'towelsLarge': ['item_towelsLarge', 'telo_doccia', 'telo_corpo', 'asciugamano_grande'],
    'towelsFace': ['item_towelsFace', 'asciugamano_viso', 'telo_viso'],
    'towelsSmall': ['item_towelsSmall', 'asciugamano_bidet', 'asciugamano_ospite'],
    'bathMats': ['item_bathMats', 'tappetino_bagno', 'scendi_bagno', 'tappetino_scendibagno'],
    'telo_corpo': ['item_towelsLarge', 'towelsLarge'],
    'telo_viso': ['item_towelsFace', 'towelsFace'],
    'telo_bidet': ['item_towelsSmall', 'towelsSmall'],
    'scendi_bagno': ['item_bathMats', 'bathMats'],
  };
  
  // Cerca match per ID mappato
  const mappedIds = idMapping[itemId];
  if (mappedIds) {
    for (const mappedId of mappedIds) {
      const found = inventory.find(i => i.id === mappedId || i.key === mappedId);
      if (found) return found.sellPrice;
    }
  }
  
  // 6. Match per nome (fuzzy)
  if (orderItem.name) {
    const nameLower = orderItem.name.toLowerCase();
    
    // Match esatto per nome
    const exactName = inventory.find(i => i.name.toLowerCase() === nameLower);
    if (exactName) return exactName.sellPrice;
    
    // Match parziale per keywords nel nome
    const keywordMatches: { keywords: string[], categoryHint?: string }[] = [
      { keywords: ['lenzuol', 'matrimonial'], categoryHint: 'letto' },
      { keywords: ['lenzuol', 'singol'], categoryHint: 'letto' },
      { keywords: ['feder'], categoryHint: 'letto' },
      { keywords: ['telo', 'doccia'], categoryHint: 'bagno' },
      { keywords: ['telo', 'corpo'], categoryHint: 'bagno' },
      { keywords: ['asciugamano', 'viso'], categoryHint: 'bagno' },
      { keywords: ['asciugamano', 'bidet'], categoryHint: 'bagno' },
      { keywords: ['tappetino', 'scendi'], categoryHint: 'bagno' },
    ];
    
    for (const match of keywordMatches) {
      if (match.keywords.every(kw => nameLower.includes(kw))) {
        const found = inventory.find(i => 
          match.keywords.some(kw => i.name.toLowerCase().includes(kw))
        );
        if (found) return found.sellPrice;
      }
    }
    
    // Match singola keyword
    const singleKeywords = ['matrimoniale', 'singolo', 'federa', 'doccia', 'corpo', 'viso', 'bidet', 'tappetino', 'scendi'];
    for (const kw of singleKeywords) {
      if (nameLower.includes(kw)) {
        const found = inventory.find(i => i.name.toLowerCase().includes(kw));
        if (found) return found.sellPrice;
      }
    }
  }
  
  // 7. Fallback - ritorna 0
  console.warn(`⚠️ Prezzo non trovato per item: id="${itemId}", name="${orderItem.name}"`);
  return 0;
};

interface UnifiedService {
  id: string;
  type: ServiceType;
  propertyId: string;
  propertyName?: string;
  date: Date;
  scheduledTime?: string | null;
  status: string;
  // Campi pulizia
  cleaning?: Cleaning;
  // Campi ordine
  order?: Order;
  // Per ordini standalone
  items?: LinenItem[];
  riderName?: string;
}

interface PulizieContentProps {
  properties: Property[];
  cleanings: Cleaning[];
  operators: Operator[];
  orders: Order[];
  inventory: any[];
  ownerId?: string;
  isAdmin: boolean;
  user: any;
  highlightCleaningId?: string | null;
  openCleaningId?: string | null;
  storeHasData: boolean;
  storeInitialLoading: boolean;
  dataLoading: boolean;
  authLoading: boolean;
}

type ViewMode = "calendar" | "list";
type TimeFilter = "all" | "today" | "week" | "month" | "custom";
type StatusFilter = "all" | "completed" | "in_progress" | "scheduled";

const PROPERTY_COLORS = ['#8b5cf6', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];

// Funzione per pulire l'indirizzo (mostra solo via e numero, senza CAP/città)
function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  // Prende solo la prima parte prima della virgola (via e numero)
  const firstPart = address.split(',')[0].trim();
  // Rimuove eventuale CAP (5 cifre) se presente
  return firstPart.replace(/\s*\d{5}\s*/g, '').trim();
}

// Icona Letto
const BedIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v11m0-4h18m0 4V8a1 1 0 00-1-1H4a1 1 0 00-1 1v3h18M6 15v3m12-3v3" />
  </svg>
);

// 🔴 NUOVE ICONE SERVIZIO (monocromatiche, senza sfondo)
// Icona Solo Pulizia
const CleaningOnlyIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    {/* Spray body */}
    <rect x="15" y="18" width="12" height="20" rx="3" stroke="currentColor" strokeWidth="1.2"/>
    {/* Etichetta */}
    <rect x="17.5" y="23" width="7" height="4.5" rx="1.2" stroke="currentColor" strokeWidth=".8" opacity=".5" fill="currentColor" fillOpacity=".08"/>
    <line x1="19" y1="25.2" x2="23" y2="25.2" stroke="currentColor" strokeWidth=".6" strokeLinecap="round" opacity=".3"/>
    {/* Collo */}
    <rect x="19" y="13.5" width="4" height="4.5" rx=".8" stroke="currentColor" strokeWidth="1.1"/>
    {/* Spruzzatore */}
    <path d="M19 13.5h4l2-3.5H17l2 3.5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
    {/* Beccuccio */}
    <line x1="23" y1="11.5" x2="26.5" y2="11.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    <line x1="26.5" y1="10" x2="26.5" y2="13" stroke="currentColor" strokeWidth=".8" strokeLinecap="round"/>
    {/* Trigger */}
    <path d="M23 14.5h2.5v2H23" stroke="currentColor" strokeWidth=".8" strokeLinecap="round" strokeLinejoin="round" opacity=".6"/>
    {/* Stella 4 punte */}
    <path d="M36 10c0 0-1.8 2.2-1.8 3.2s1.8 3.2 1.8 3.2 1.8-2.2 1.8-3.2S36 10 36 10z" stroke="currentColor" strokeWidth=".9"/>
    <path d="M36 13.2c0 0-2.2-1.8-3.2-1.8s-3.2 1.8-3.2 1.8 2.2 1.8 3.2 1.8 3.2-1.8 3.2-1.8z" stroke="currentColor" strokeWidth=".9"/>
    {/* Stella piccola */}
    <path d="M34 22l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z" stroke="currentColor" strokeWidth=".7"/>
    {/* Puntini */}
    <circle cx="31" cy="8" r=".7" fill="currentColor" opacity=".4"/>
    <circle cx="33" cy="6" r=".5" fill="currentColor" opacity=".3"/>
    <circle cx="38" cy="19" r=".6" fill="currentColor" opacity=".35"/>
    <circle cx="9" cy="14" r=".8" fill="currentColor" opacity=".25"/>
  </svg>
);

// Icona Pulizia + Biancheria
const CleaningWithLinenIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    {/* Mini spray */}
    <rect x="2" y="11.5" width="8.5" height="13.5" rx="2" stroke="currentColor" strokeWidth="1"/>
    <rect x="3.5" y="15.5" width="5" height="3" rx=".8" stroke="currentColor" strokeWidth=".6" opacity=".4" fill="currentColor" fillOpacity=".06"/>
    <line x1="4.5" y1="17" x2="7.5" y2="17" stroke="currentColor" strokeWidth=".5" strokeLinecap="round" opacity=".25"/>
    <rect x="4.5" y="7.5" width="3" height="4" rx=".6" stroke="currentColor" strokeWidth=".9"/>
    <path d="M4.5 7.5h3l1.5-2.5h-6L4.5 7.5z" stroke="currentColor" strokeWidth=".8" strokeLinejoin="round"/>
    <line x1="7.5" y1="6.2" x2="10" y2="6.2" stroke="currentColor" strokeWidth=".7" strokeLinecap="round"/>
    <path d="M7.5 8.5h1.5v1.5H7.5" stroke="currentColor" strokeWidth=".6" strokeLinecap="round" strokeLinejoin="round" opacity=".5"/>
    {/* Stella 4 punte */}
    <path d="M15 5c0 0-1.2 1.5-1.2 2.2s1.2 2.2 1.2 2.2 1.2-1.5 1.2-2.2S15 5 15 5z" stroke="currentColor" strokeWidth=".7"/>
    <path d="M15 7.2c0 0-1.5-1.2-2.2-1.2s-2.2 1.2-2.2 1.2 1.5 1.2 2.2 1.2 2.2-1.2 2.2-1.2z" stroke="currentColor" strokeWidth=".7"/>
    <circle cx="12" cy="3" r=".5" fill="currentColor" opacity=".3"/>
    <circle cx="17" cy="9" r=".4" fill="currentColor" opacity=".25"/>
    {/* Letto */}
    <rect x="13" y="29" width="33" height="8.5" rx="3" stroke="currentColor" strokeWidth="1.1"/>
    <rect x="15" y="30.5" width="29" height="5.5" rx="1.5" stroke="currentColor" strokeWidth=".5" opacity=".15" fill="currentColor" fillOpacity=".04"/>
    <path d="M15.5 29v-6.5c0-1.8 1.5-3.2 3.2-3.2h20.6c1.8 0 3.2 1.4 3.2 3.2V29" stroke="currentColor" strokeWidth="1.1"/>
    <path d="M18 20c0 0 5-1.2 11.5-1.2S41 20 41 20" stroke="currentColor" strokeWidth=".5" strokeLinecap="round" opacity=".3"/>
    <rect x="17" y="21" width="9.5" height="6.5" rx="2.2" stroke="currentColor" strokeWidth=".9" fill="currentColor" fillOpacity=".05"/>
    <path d="M19 24.5c2-.6 4-.6 5.5 0" stroke="currentColor" strokeWidth=".4" opacity=".3" strokeLinecap="round"/>
    <rect x="31" y="21" width="9.5" height="6.5" rx="2.2" stroke="currentColor" strokeWidth=".9" fill="currentColor" fillOpacity=".05"/>
    <path d="M33 24.5c2-.6 4-.6 5.5 0" stroke="currentColor" strokeWidth=".4" opacity=".3" strokeLinecap="round"/>
    <path d="M14 32.5c5-1 10-1.5 15.5-1.5s11 .5 16 1.5" stroke="currentColor" strokeWidth=".6" opacity=".2" strokeLinecap="round"/>
    <line x1="16" y1="37.5" x2="16" y2="42.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <line x1="43" y1="37.5" x2="43" y2="42.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <circle cx="16" cy="43" r=".8" fill="currentColor" opacity=".2" stroke="currentColor" strokeWidth=".5"/>
    <circle cx="43" cy="43" r=".8" fill="currentColor" opacity=".2" stroke="currentColor" strokeWidth=".5"/>
  </svg>
);

// Icona Solo Biancheria (consegna standalone)
const LinenOnlyIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    {/* Struttura base letto */}
    <rect x="4" y="24" width="40" height="10" rx="3.5" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="6" y="25.5" width="36" height="7" rx="2" stroke="currentColor" strokeWidth=".6" opacity=".15" fill="currentColor" fillOpacity=".05"/>
    {/* Testiera */}
    <path d="M7 24V15c0-2.5 2-4.5 4.5-4.5h25c2.5 0 4.5 2 4.5 4.5v9" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M11 11.5c0 0 6.5-2 13-2s13 2 13 2" stroke="currentColor" strokeWidth=".6" strokeLinecap="round" opacity=".3"/>
    {/* Cuscino sinistro */}
    <rect x="9" y="13" width="12" height="8.5" rx="3" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity=".06"/>
    <path d="M11.5 17c2.5-1 5.5-1 7.5 0" stroke="currentColor" strokeWidth=".5" strokeLinecap="round" opacity=".3"/>
    {/* Cuscino destro */}
    <rect x="27" y="13" width="12" height="8.5" rx="3" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity=".06"/>
    <path d="M29.5 17c2.5-1 5.5-1 7.5 0" stroke="currentColor" strokeWidth=".5" strokeLinecap="round" opacity=".3"/>
    {/* Coperta piega */}
    <path d="M5 28.5c5-1.5 12-2.5 19-2.5s14 1 19 2.5" stroke="currentColor" strokeWidth=".8" opacity=".25" strokeLinecap="round"/>
    {/* Cuciture trapunta */}
    <line x1="16" y1="26" x2="16" y2="32.5" stroke="currentColor" strokeWidth=".4" opacity=".15"/>
    <line x1="24" y1="25.5" x2="24" y2="33" stroke="currentColor" strokeWidth=".4" opacity=".15"/>
    <line x1="32" y1="26" x2="32" y2="32.5" stroke="currentColor" strokeWidth=".4" opacity=".15"/>
    {/* Gambe */}
    <line x1="8" y1="34" x2="8" y2="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="40" y1="34" x2="40" y2="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="8" cy="40.5" r="1" fill="currentColor" opacity=".15" stroke="currentColor" strokeWidth=".6"/>
    <circle cx="40" cy="40.5" r="1" fill="currentColor" opacity=".15" stroke="currentColor" strokeWidth=".6"/>
  </svg>
);

// CSS per flash effect quando card si riordina
const reorderStyles = `
  .card-reorder-flash {
    animation: cardFlash 0.6s ease;
  }
  @keyframes cardFlash {
    0%, 100% { background: rgba(255,255,255,0.8); }
    30% { background: rgba(139, 92, 246, 0.15); }
    60% { background: rgba(139, 92, 246, 0.08); }
  }
`;

// ═══ CACHE GESTITA DAL PulizieDataStore SINGLETON ═══
// I listener Firestore ora vivono nel store globale (pulizieDataStore.ts)
// e NON vengono ricreati ad ogni navigazione.

// 🚀 CARD ESPANDIBILE — state LOCALE (come CleaningCardAdmin)
// Wrappa l'intera card e fornisce isExpanded + toggle via render prop
// Questo evita che il toggle ri-renderizzi l'intera lista di 3900 righe
function ExpandableCard({ 
  id, 
  children, 
  className, 
  style, 
  dataId, 
  dataTime 
}: { 
  id: string; 
  children: (props: { isExpanded: boolean; toggleExpand: (e: React.MouseEvent) => void }) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  dataId?: string;
  dataTime?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(v => !v);
  };
  return (
    <div className={className} style={style} data-id={dataId} data-time={dataTime}>
      {children({ isExpanded, toggleExpand })}
    </div>
  );
}

// 🚀 CARD MEMOIZZATA — evita re-render quando solo i filtri cambiano
const MemoCard = React.memo(function MemoCard({ 
  cleaning, property, operators, isAdmin, hasLinenOrder, inventory,
  onTimeModal, onGuestModal, onEditModal, onOperatorModal
}: {
  cleaning: any; property: any; operators: any[]; isAdmin: boolean; hasLinenOrder: boolean;
  inventory: any[];
  onTimeModal: () => void; onGuestModal: () => void; onEditModal: () => void; onOperatorModal: () => void;
}) {
  // Calcolo dotazioni DENTRO la card — eseguito solo quando la card si ri-renderizza
  const { cleaningPrice, dotazioniPrice, totalPrice, bedItems, bathItems } = calculateDotazioni(
    cleaning, property, inventory
  );
  
  return (
    <div className="card-reorder" data-id={cleaning.id} data-time={cleaning.scheduledTime}>
      <CleaningCardAdmin
        cleaning={{
          ...cleaning,
          operators: cleaning.operators || (cleaning.operator ? [cleaning.operator] : []),
          hasLinenOrder: hasLinenOrder,
        }}
        property={property}
        operators={operators}
        totalPrice={totalPrice}
        cleaningPrice={cleaningPrice}
        dotazioniPrice={dotazioniPrice}
        bedItems={bedItems}
        bathItems={bathItems}
        isAdmin={isAdmin}
        onAssignOperator={() => {}}
        onRemoveOperator={() => {}}
        onChangeTime={onTimeModal}
        onChangeGuests={onGuestModal}
        onOpenDetail={onEditModal}
        onOpenOperatorModal={onOperatorModal}
      />
    </div>
  );
}, (prev, next) => {
  // Skip re-render se i dati della card non sono cambiati
  return prev.cleaning.id === next.cleaning.id &&
    prev.cleaning.status === next.cleaning.status &&
    prev.cleaning.scheduledTime === next.cleaning.scheduledTime &&
    prev.cleaning.guestsCount === next.cleaning.guestsCount &&
    prev.cleaning.guestsConfirmed === next.cleaning.guestsConfirmed &&
    prev.cleaning.operator?.id === next.cleaning.operator?.id &&
    prev.hasLinenOrder === next.hasLinenOrder &&
    prev.inventory?.length === next.inventory?.length;
});

export const PulizieContent = React.memo(function PulizieContent({ 
  properties, cleanings, operators, orders, inventory,
  ownerId, isAdmin, user,
  highlightCleaningId, openCleaningId,
  storeHasData, storeInitialLoading, dataLoading, authLoading,
}: PulizieContentProps) {
  
  // 🚀 Mappa proprietà per ID — O(1) lookup invece di O(n) per ogni card
  const propertyMap = useMemo(() => {
    const map = new Map<string, any>();
    properties.forEach(p => map.set(p.id, p));
    return map;
  }, [properties]);
  
  // Stati UI
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const toggleSliderRef = useRef<HTMLDivElement>(null);
  const toggleListBtnRef = useRef<HTMLButtonElement>(null);
  const toggleCalBtnRef = useRef<HTMLButtonElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const calContainerRef = useRef<HTMLDivElement>(null);
  
  const switchView = (mode: ViewMode) => {
    if (mode === viewMode) return;
    
    // 1. Instant DOM updates (no React)
    if (toggleSliderRef.current) {
      toggleSliderRef.current.style.transform = mode === "calendar" ? "translateX(calc(100% + 8px))" : "translateX(0)";
    }
    if (toggleListBtnRef.current) {
      toggleListBtnRef.current.className = toggleListBtnRef.current.className.replace(/text-slate-\d+/g, mode === "list" ? "text-slate-900" : "text-slate-400");
    }
    if (toggleCalBtnRef.current) {
      toggleCalBtnRef.current.className = toggleCalBtnRef.current.className.replace(/text-slate-\d+/g, mode === "calendar" ? "text-slate-900" : "text-slate-400");
    }
    if (listContainerRef.current) {
      listContainerRef.current.style.display = mode === "list" ? "block" : "none";
    }
    if (calContainerRef.current) {
      calContainerRef.current.style.display = mode === "calendar" ? "block" : "none";
    }
    // Hide/show filters row instantly via DOM (data-filters-row attribute)
    const filtersRow = document.querySelector("[data-filters-row]") as HTMLElement;
    if (filtersRow) {
      filtersRow.style.display = mode === "list" ? "flex" : "none";
    }
    
    // 2. Deferred React state update
    setTimeout(() => setViewMode(mode), 0);
  };
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  
  // 📅 Date range picker per filtro custom
  
  const [customDateFrom, setCustomDateFrom] = useState<string>("");
  const [customDateTo, setCustomDateTo] = useState<string>("");
  
  // Data-affecting states (stay in parent, card list uses these)
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [currentDate, setCurrentDateRaw] = useState(() => getCalendarState("pulizie").currentDate);
  const setCurrentDate = (d: Date) => { setCalendarDate("pulizie", d); setCurrentDateRaw(d); };
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("next_cleaning");
  
  // 🚀 Valori deferred — i useMemo usano questi, React li aggiorna quando il thread è libero
  const deferredTimeFilter = useDeferredValue(timeFilter);
  const deferredStatusFilter = useDeferredValue(statusFilter);
  const deferredPropertyIds = useDeferredValue(selectedPropertyIds);
  const deferredSearch = useDeferredValue(debouncedSearch);
  const deferredSortBy = useDeferredValue(sortBy);
  const deferredDateFrom = useDeferredValue(customDateFrom);
  const deferredDateTo = useDeferredValue(customDateTo);
  
  // 🚀 INFINITE SCROLL: mostra solo le prime N card, carica il resto allo scroll
  const [visibleCardCount, setVisibleCardCount] = useState(8);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  // Reset count when filters change
  const prevFilterKey = useRef("");
  const filterKey = `${debouncedSearch}-${statusFilter}-${timeFilter}-${selectedPropertyIds.join(",")}-${customDateFrom}-${customDateTo}`;
  if (filterKey !== prevFilterKey.current) {
    prevFilterKey.current = filterKey;
    if (visibleCardCount !== 8) setVisibleCardCount(8);
  }
  
  // IntersectionObserver: quando il sentinel entra nel viewport, carica più card
  useEffect(() => {
    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCardCount(prev => prev + 8);
        }
      },
      { rootMargin: "200px" } // pre-carica 200px prima di arrivare in fondo
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
  
  // 🚀 Transition: filter changes non bloccano la UI
  const [isFilterPending, startFilterTransition] = useTransition();
  
  // 🚀 Callbacks per PulizieFilters — usano startTransition per non bloccare
  const handleTimeFilterChange = useCallback((v: TimeFilter) => startFilterTransition(() => setTimeFilter(v)), []);
  const handleStatusFilterChange = useCallback((v: StatusFilter) => startFilterTransition(() => setStatusFilter(v)), []);
  const handleSortByChange = useCallback((v: string) => startFilterTransition(() => setSortBy(v)), []);
  const handlePropertyIdsChange = useCallback((v: string[] | ((prev: string[]) => string[])) => startFilterTransition(() => setSelectedPropertyIds(v as any)), []);
  const handleCustomDateFromChange = useCallback((v: string) => setCustomDateFrom(v), []);
  const handleCustomDateToChange = useCallback((v: string) => setCustomDateTo(v), []);
  const handleSearchChange = useCallback((v: string) => startFilterTransition(() => setDebouncedSearch(v)), []);
  
  // 🚀 Filter setters wrappati in transition — la UI resta reattiva
  
  // 🚀 MODAL: gestite dal componente separato PulizieModals (zero re-render qui)
  const modalsRef = useRef<PulizieModalsHandle>(null);

  // Stato per card espanse
  // expandedCards rimosso — ogni card gestisce il proprio state locale via ExpandableCard
  
  // 🔄 Banner: indice per alternare tra servizi in corso
  // Usa SOLO useRef — nessun setState, nessun re-render dell'intero componente
  // Il banner si aggiorna tramite DOM diretto nel suo useEffect dedicato
  const bannerServiceIndexRef = useRef(0);
  const bannerServiceIndex = bannerServiceIndexRef.current;
  
  // Ordini e inventario derivati direttamente dal store globale (vedi sopra)

  // Stato per modifiche inline
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingGuestsId, setEditingGuestsId] = useState<string | null>(null);
  const [editingOperatorId, setEditingOperatorId] = useState<string | null>(null);
  const [savingInline, setSavingInline] = useState<string | null>(null);

  // Refs
  const calendarRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isScrollSyncing = useRef(false);
  
  // Hook per deep link da notifiche
  // Deep-link params (passati come props dal parent)
  
  // Dati gestiti tramite store globale — vedi sopra
  
  // 🔴 TUTTI GLI useEffect QUI
  
  // 🔵 Listener Firestore ora gestiti dal PulizieDataStore globale
  // Nessun listener locale necessario — dati arrivano via usePulizieData()
  
  // Auth redirect gestito dal parent (PulizieView)
  
  // Auto-apri modal dettaglio se c'è ?id= nella URL (solo una volta)
  const highlightHandled = useRef(false);
  useEffect(() => {
    if (highlightHandled.current) return;
    if (highlightCleaningId && cleanings.length > 0 && properties.length > 0) {
      const found = cleanings.find(c => c.id === highlightCleaningId);
      if (found) {
        const prop = propertyMap.get(found.propertyId);
        if (prop) {
          highlightHandled.current = true;
          modalsRef.current?.openEditModal(found, prop, found.price || prop.cleaningPrice || 0);
        }
        setStatusFilter("all");
      }
    }
  }, [highlightCleaningId, cleanings, properties]);

  // 🆕 Auto-apri modal OSPITI se c'è ?openCleaning= nella URL (da notifiche/email, solo una volta)
  const openCleaningHandled = useRef(false);
  useEffect(() => {
    if (openCleaningHandled.current) return;
    if (openCleaningId && cleanings.length > 0) {
      const found = cleanings.find(c => c.id === openCleaningId);
      if (found) {
        openCleaningHandled.current = true;
        modalsRef.current?.openGuestModal(found);
        
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', window.location.pathname);
        }
        setStatusFilter("all");
      }
    }
  }, [openCleaningId, cleanings]);

  // Inject CSS
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = reorderStyles;
    document.head.appendChild(styleEl);
    return () => styleEl.remove();
  }, []);

  // Inventario ora gestito dal store globale

  // Ordini ora gestiti dal store globale (filtrati sopra per proprietà visibili)
  
  // 🔴 TUTTI I useMemo DEVONO ESSERE QUI - PRIMA DEI RETURN CONDIZIONALI
  
  // Crea lista unificata di servizi (pulizie + consegne standalone)
  const unifiedServices = useMemo((): UnifiedService[] => {
    if (!properties.length) return [];
    const services: UnifiedService[] = [];
    const propertyIds = properties.map(p => p.id);
    
    // Aggiungi pulizie
    cleanings.forEach(cleaning => {
      if (!propertyIds.includes(cleaning.propertyId)) return;
      
      // Controlla se ha ordine biancheria collegato
      const linkedOrder = orders.find(o => o.cleaningId === cleaning.id);
      // Priorità: valore salvato su Firestore > presenza ordine collegato
      const hasLinen = cleaning.hasLinenOrder !== undefined ? cleaning.hasLinenOrder : !!linkedOrder;
      
      services.push({
        id: cleaning.id,
        type: hasLinen ? 'cleaning_with_linen' : 'cleaning',
        propertyId: cleaning.propertyId,
        propertyName: cleaning.propertyName,
        date: new Date(cleaning.date),
        scheduledTime: cleaning.scheduledTime,
        status: cleaning.status,
        cleaning: cleaning,
        order: linkedOrder,
      });
    });
    
    // Aggiungi ordini standalone (senza cleaningId)
    orders.forEach(order => {
      if (order.cleaningId) return; // Skip ordini collegati a pulizie
      if (!propertyIds.includes(order.propertyId)) return;
      
      const property = propertyMap.get(order.propertyId);
      
      services.push({
        id: `order_${order.id}`,
        type: 'linen_only',
        propertyId: order.propertyId,
        propertyName: order.propertyName || property?.name,
        date: order.scheduledDate ? new Date(order.scheduledDate) : new Date(),
        scheduledTime: order.scheduledTime,
        status: order.status,
        order: order,
        items: order.items,
        riderName: order.riderName,
      });
    });
    
    return services;
  }, [cleanings, orders, properties]);

  // Sync scroll: header segue scroll X della griglia, sidebar segue scroll Y
  const handleGridScroll = () => {
    if (gridRef.current && headerRef.current && sidebarRef.current) {
      headerRef.current.scrollLeft = gridRef.current.scrollLeft;
      sidebarRef.current.scrollTop = gridRef.current.scrollTop;
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 🔴 NUOVO: Filtra servizi unificati (pulizie + consegne standalone)
  const filteredServices = useMemo(() => {
    let filtered = unifiedServices;

    if (deferredPropertyIds.length > 0) {
      const pidSet = new Set(deferredPropertyIds);
      filtered = filtered.filter(s => pidSet.has(s.propertyId));
    } else if (deferredSearch) {
      const search = deferredSearch.toLowerCase();
      filtered = filtered.filter(s => {
        const prop = propertyMap.get(s.propertyId);
        return prop?.name.toLowerCase().includes(search) || 
               s.propertyName?.toLowerCase().includes(search) ||
               s.cleaning?.operator?.name?.toLowerCase().includes(search);
      });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    switch (deferredTimeFilter) {
      case "today":
        filtered = filtered.filter(s => {
          const d = new Date(s.date);
          return isSameDay(d, now);
        });
        break;
      case "week":
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        filtered = filtered.filter(s => {
          const d = new Date(s.date);
          return d >= now && d <= weekEnd;
        });
        break;
      case "month":
        const monthEnd = new Date(now);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        filtered = filtered.filter(s => {
          const d = new Date(s.date);
          return d >= now && d <= monthEnd;
        });
        break;
      case "custom":
        if (deferredDateFrom) {
          const from = new Date(deferredDateFrom);
          from.setHours(0, 0, 0, 0);
          filtered = filtered.filter(s => new Date(s.date) >= from);
        }
        if (deferredDateTo) {
          const to = new Date(deferredDateTo);
          to.setHours(23, 59, 59, 999);
          filtered = filtered.filter(s => new Date(s.date) <= to);
        }
        break;
    }

    // Filtro per stato
    switch (deferredStatusFilter) {
      case "completed":
        filtered = filtered.filter(s => s.status === "COMPLETED" || s.status === "DELIVERED");
        break;
      case "in_progress":
        filtered = filtered.filter(s => s.status === "IN_PROGRESS" || s.status === "IN_TRANSIT");
        break;
      case "scheduled":
        filtered = filtered.filter(s => 
          s.status !== "COMPLETED" && s.status !== "IN_PROGRESS" && 
          s.status !== "DELIVERED" && s.status !== "IN_TRANSIT" &&
          s.status !== "CANCELLED"
        );
        break;
      case "all":
      default:
        // 🔧 FIX: Escludi sempre le pulizie/ordini CANCELLED dalla vista
        filtered = filtered.filter(s => s.status !== "CANCELLED");
        break;
    }

    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [unifiedServices, properties, deferredTimeFilter, deferredSearch, deferredPropertyIds, deferredStatusFilter, deferredDateFrom, deferredDateTo]);


  // Proprietà filtrate per il calendario
  // Funzione per trovare la prossima pulizia di una proprietà
  const getNextCleaning = (propertyId: string) => {
    // 🔧 FIX: Escludi pulizie CANCELLED
    const propertyCleanings = cleanings.filter(c => c.propertyId === propertyId && c.status !== "CANCELLED");
    const futureCleanings = propertyCleanings.filter(c => {
      const cleaningDate = new Date(c.date);
      return cleaningDate >= today;
    });
    if (futureCleanings.length === 0) return null;
    return futureCleanings.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )[0];
  };

  const filteredProperties = useMemo(() => {
    let filtered = [...properties];
    
    // Filtro ricerca
    if (deferredPropertyIds.length > 0) {
      filtered = filtered.filter(p => deferredPropertyIds.includes(p.id));
    } else if (deferredSearch) {
      const search = deferredSearch.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(search) || 
        p.address?.toLowerCase().includes(search)
      );
    }
    
    // Ordinamento
    if (deferredSortBy === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (deferredSortBy === "next_cleaning") {
      filtered.sort((a, b) => {
        const nextA = getNextCleaning(a.id);
        const nextB = getNextCleaning(b.id);
        if (!nextA && !nextB) return a.name.localeCompare(b.name);
        if (!nextA) return 1;
        if (!nextB) return -1;
        return new Date(nextA.date).getTime() - new Date(nextB.date).getTime();
      });
    }
    
    return filtered;
  }, [properties, deferredSearch, deferredPropertyIds, deferredSortBy, cleanings]);

  // 🚀 groupedByDate: derivato da filteredServices (già filtrato, zero duplicazione)
  const groupedByDate = useMemo(() => {
    const groups: { [key: string]: UnifiedService[] } = {};
    filteredServices.forEach(s => {
      const dateKey = getDateString(new Date(s.date));
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(s);
    });
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'));
    });
    return groups;
  }, [filteredServices]);

  // 🚀 statusStats: conta per status SENZA filtro status (per badge corretti)
  const statusStats = useMemo(() => {
    const propertyIdSet = new Set(properties.map(p => p.id));
    let base = unifiedServices.filter(s => s.status !== "CANCELLED" && propertyIdSet.has(s.propertyId));
    
    if (deferredPropertyIds.length > 0) {
      const pidSet = new Set(deferredPropertyIds);
      base = base.filter(s => pidSet.has(s.propertyId));
    } else if (deferredSearch) {
      const search = deferredSearch.toLowerCase();
      base = base.filter(s => {
        const prop = propertyMap.get(s.propertyId);
        return prop?.name.toLowerCase().includes(search) || s.propertyName?.toLowerCase().includes(search);
      });
    }
    
    const now = new Date(); now.setHours(0, 0, 0, 0);
    switch (deferredTimeFilter) {
      case "today": base = base.filter(s => isSameDay(new Date(s.date), now)); break;
      case "week": { const end = new Date(now); end.setDate(end.getDate() + 7); base = base.filter(s => { const d = new Date(s.date); return d >= now && d <= end; }); break; }
      case "month": { const end = new Date(now); end.setMonth(end.getMonth() + 1); base = base.filter(s => { const d = new Date(s.date); return d >= now && d <= end; }); break; }
      case "custom": {
        if (deferredDateFrom) { const f = new Date(deferredDateFrom); f.setHours(0,0,0,0); base = base.filter(s => new Date(s.date) >= f); }
        if (deferredDateTo) { const t = new Date(deferredDateTo); t.setHours(23,59,59,999); base = base.filter(s => new Date(s.date) <= t); }
        break;
      }
    }
    
    let completed = 0, in_progress = 0, scheduled = 0;
    base.forEach(s => {
      if (s.status === "COMPLETED") completed++;
      else if (s.status === "IN_PROGRESS") in_progress++;
      else scheduled++;
    });
    return { all: base.length, completed, in_progress, scheduled };
  }, [unifiedServices, properties, propertyMap, deferredTimeFilter, deferredSearch, deferredPropertyIds, deferredDateFrom, deferredDateTo]);

  const stats = useMemo(() => {
    const propertyIds = properties.map(p => p.id);
    // 🔧 FIX: Escludi pulizie CANCELLED dalle statistiche
    const myCleanings = cleanings.filter(c => propertyIds.includes(c.propertyId) && c.status !== "CANCELLED");
    
    const todayCleanings = myCleanings.filter(c => 
      isSameDay(new Date(c.date), today)
    );
    const weekCleanings = myCleanings.filter(c => {
      const d = new Date(c.date);
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return d >= today && d <= weekEnd;
    });
    
    return {
      today: todayCleanings.length,
      week: weekCleanings.length,
      properties: properties.length,
      completed: todayCleanings.filter(c => c.status === "COMPLETED").length,
      pending: todayCleanings.filter(c => !c.operator).length,
    };
  }, [cleanings, properties]);

  const ganttDays = useMemo(() => {
    if (viewMode !== "calendar") return []; // Skip in list mode
    const days = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(year, month, d);
      days.push({
        date,
        day: d,
        dayName: date.toLocaleDateString("it-IT", { weekday: "short" }).charAt(0).toUpperCase() + 
                 date.toLocaleDateString("it-IT", { weekday: "short" }).slice(1, 3),
        isToday: isSameDay(date, today),
        isSunday: date.getDay() === 0
      });
    }
    return days;
  }, [currentDate, viewMode]);

  // Auto-scroll al giorno corrente quando si apre il calendario
  useEffect(() => {
    if (viewMode === "calendar") {
      const cached = getCalendarState("pulizie");
      let scrollPosition: number;
      
      if (cached.scrollLeft >= 0) {
        // Usa posizione salvata dalla cache
        scrollPosition = cached.scrollLeft;
      } else {
        // Calcola posizione per il giorno corrente
        const todayIndex = ganttDays.findIndex(d => d.isToday);
        const cellWidth = 60;
        scrollPosition = todayIndex !== -1 
          ? Math.max(0, (todayIndex * cellWidth) - 150)
          : 0;
      }
      
      // Scroll IMMEDIATO, senza setTimeout
      if (calendarRef.current) {
        calendarRef.current.scrollLeft = scrollPosition;
      }
      if (headerRef.current) {
        headerRef.current.scrollLeft = scrollPosition;
      }
    }
  }, [viewMode, currentDate, ganttDays]);

  // Body overflow lock ora gestito da PulizieModals

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  // Status config con gradienti e ombre
  const getStatusConfig = (status: string, hasOperator: boolean) => {
    switch (status) {
      case "COMPLETED":
        return { 
          bg: "bg-gradient-to-r from-emerald-400 to-teal-500", 
          gradient: "bg-gradient-to-r from-emerald-500 to-teal-400",
          cssGradient: "linear-gradient(135deg, rgba(16,185,129,0.9), rgba(20,184,166,0.85))",
          shadowColor: "rgba(16,185,129,0.4)",
          shadow: "shadow-lg shadow-emerald-200",
          badge: "bg-emerald-100 text-emerald-700",
          label: "Completata",
          icon: "✓",
          emoji: "✅"
        };
      case "IN_PROGRESS":
        return { 
          bg: "bg-gradient-to-r from-amber-400 to-orange-500", 
          gradient: "bg-gradient-to-r from-amber-500 to-orange-400",
          cssGradient: "linear-gradient(135deg, rgba(245,158,11,0.9), rgba(249,115,22,0.85))",
          shadowColor: "rgba(245,158,11,0.4)",
          shadow: "shadow-lg shadow-amber-200",
          badge: "bg-amber-100 text-amber-700",
          label: "In corso",
          icon: "●",
          emoji: "🧹"
        };
      case "SCHEDULED":
      case "ASSIGNED":
      case "PENDING":
      default:
        // Per il proprietario: tutto è "Programmata" (blu)
        // Per l'admin: mostra "Da assegnare" se non ha operatore
        if (isAdmin && !hasOperator) {
          return { 
            bg: "bg-gradient-to-r from-rose-400 to-red-500", 
            gradient: "bg-gradient-to-r from-rose-500 to-pink-400",
            cssGradient: "linear-gradient(135deg, rgba(244,63,94,0.9), rgba(251,113,133,0.85))",
            shadowColor: "rgba(244,63,94,0.4)",
            shadow: "shadow-lg shadow-rose-200",
            badge: "bg-rose-100 text-rose-700",
            label: "Da assegnare",
            icon: "!",
            emoji: "⚠️"
          };
        }
        return { 
          bg: "bg-gradient-to-r from-sky-400 to-blue-500", 
          gradient: "bg-gradient-to-r from-blue-500 to-indigo-400",
          cssGradient: "linear-gradient(135deg, rgba(59,130,246,0.9), rgba(99,102,241,0.85))",
          shadowColor: "rgba(59,130,246,0.4)",
          shadow: "shadow-lg shadow-blue-200",
          badge: "bg-sky-100 text-sky-700",
          label: "Programmata",
          icon: "○",
          emoji: "📅"
        };
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const openGuestModal = (cleaning: Cleaning) => modalsRef.current?.openGuestModal(cleaning);
  const openTimeModal = (cleaning: Cleaning) => modalsRef.current?.openTimeModal(cleaning);
  const openOperatorModal = (cleaning: Cleaning) => modalsRef.current?.openOperatorModal(cleaning);
  const openEditModal = (cleaning: Cleaning, property: Property | undefined, calculatedPrice?: number) => modalsRef.current?.openEditModal(cleaning, property, calculatedPrice);
  const handleOpenOrderDetail = (order: Order) => modalsRef.current?.openOrderDetailModal(order);

  // Salva ospiti inline
  const saveGuestsInline = async (cleaningId: string, newCount: number) => {
    setSavingInline(cleaningId);
    try {
      const cleaningRef = doc(db, "cleanings", cleaningId);
      await updateDoc(cleaningRef, {
        guestsCount: newCount,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error("Errore salvataggio ospiti:", error);
    } finally {
      setSavingInline(null);
    }
  };

  // Salva operatore inline (solo admin)
  const saveOperatorInline = async (cleaningId: string, operatorId: string, operatorName: string) => {
    setSavingInline(cleaningId);
    try {
      const cleaningRef = doc(db, "cleanings", cleaningId);
      if (operatorId) {
        await updateDoc(cleaningRef, {
          operatorId: operatorId,
          operatorName: operatorName,
          status: "SCHEDULED",
          updatedAt: new Date()
        });
      } else {
        await updateDoc(cleaningRef, {
          operatorId: null,
          operatorName: null,
          updatedAt: new Date()
        });
      }
      setEditingOperatorId(null);
    } catch (error) {
      console.error("Errore salvataggio operatore:", error);
    } finally {
      setSavingInline(null);
    }
  };

  const navigateCalendar = (months: number) => {
    // FIX: Usa giorno 1 per evitare overflow mese (es: 31 gen -> 3 mar invece di 28 feb)
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + months, 1));
  };

  // toggleCardExpand rimosso — ogni ExpandableCard gestisce il toggle internamente

  // Funzione per ottenere ordine biancheria collegato alla pulizia
  const getLinenOrderForCleaning = (cleaningId: string, propertyId: string) => {
    return orders.find(o => o.cleaningId === cleaningId || (o.propertyId === propertyId && !o.cleaningId));
  };

  // ========== FUNZIONI DI AUTO-GENERAZIONE (come EditCleaningModal) ==========
  const generateAutoBeds = (maxGuests: number, bedrooms: number) => {
    const beds: { id: string; type: string; name: string; cap: number }[] = [];
    let rem = maxGuests, id = 1;
    for (let i = 0; i < bedrooms && rem > 0; i++) { 
      beds.push({ id: `b${id++}`, type: 'matr', name: 'Matrimoniale', cap: 2 }); 
      rem -= 2; 
    }
    if (rem >= 2) { beds.push({ id: `b${id++}`, type: 'divano', name: 'Divano Letto', cap: 2 }); rem -= 2; }
    if (rem === 1) { beds.push({ id: `b${id++}`, type: 'sing', name: 'Singolo', cap: 1 }); rem -= 1; }
    while (rem >= 2) { beds.push({ id: `b${id++}`, type: 'castello', name: 'Letto a Castello', cap: 2 }); rem -= 2; }
    if (rem === 1) { beds.push({ id: `b${id++}`, type: 'sing', name: 'Singolo', cap: 1 }); }
    return beds;
  };

  const getLinenForBedType = (t: string) => {
    switch (t) { 
      case 'matr': return { m: 3, s: 0, f: 2 }; 
      case 'sing': return { m: 0, s: 3, f: 1 }; 
      case 'divano': return { m: 3, s: 0, f: 2 }; 
      case 'castello': return { m: 0, s: 6, f: 2 }; 
      default: return { m: 0, s: 3, f: 1 }; 
    }
  };

  const calcLinenForBeds = (beds: { type: string }[]) => {
    const t = { m: 0, s: 0, f: 0 };
    beds.forEach(b => { const r = getLinenForBedType(b.type); t.m += r.m; t.s += r.s; t.f += r.f; });
    return t;
  };

  // ========== FUNZIONE PER OTTENERE BIANCHERIA (PRIORITÀ: customLinenConfig > serviceConfigs > AUTO) ==========
  const getLinenFromConfig = (property: Property | undefined, guestsCount: number, customLinenConfig?: any) => {
    const bedItems: { name: string; items: { name: string; quantity: number }[] }[] = [];
    const bathItems: { name: string; quantity: number }[] = [];
    const kitItems: { name: string; quantity: number }[] = [];
    
    // 🔥 PRIORITÀ: usa customLinenConfig se esiste, altrimenti serviceConfigs
    const config = customLinenConfig || property?.serviceConfigs?.[guestsCount];
    
    let totalPrice = 0;

    // Se abbiamo una config salvata, usala
    if (config) {
      // 🔧 FIX: Biancheria Letto (bl) - USA SEMPRE 'all' SE PRESENTE
      if (config.bl) {
        const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
        
        if (hasAll) {
          // USA SOLO 'all' - contiene i totali configurati dall'utente
          const bedLinenItems: { name: string; quantity: number }[] = [];
          
          Object.entries(config.bl['all'] as Record<string, number>).forEach(([itemId, qty]) => {
            if (qty > 0) {
              const invItem = inventory.find(i => i.id === itemId);
              const defaultItem = ALL_INVENTORY_ITEMS.find(i => i.id === itemId);
              const name = invItem?.name || defaultItem?.name || itemId;
              const price = invItem?.sellPrice || defaultItem?.defaultPrice || 0;
              bedLinenItems.push({ name, quantity: qty });
              totalPrice += price * qty;
            }
          });
          
          if (bedLinenItems.length > 0) {
            bedItems.push({ name: 'Biancheria Letto', items: bedLinenItems });
          }
        } else {
          // Fallback: somma da gruppi letto (escludendo 'all')
          Object.entries(config.bl).forEach(([bedKey, items]) => {
            if (bedKey !== 'all') {
              const bedLinenItems: { name: string; quantity: number }[] = [];
              
              Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                if (qty > 0) {
                  const invItem = inventory.find(i => i.id === itemId);
                  const defaultItem = ALL_INVENTORY_ITEMS.find(i => i.id === itemId);
                  const name = invItem?.name || defaultItem?.name || itemId;
                  const price = invItem?.sellPrice || defaultItem?.defaultPrice || 0;
                  bedLinenItems.push({ name, quantity: qty });
                  totalPrice += price * qty;
                }
              });
              
              if (bedLinenItems.length > 0) {
                bedItems.push({ name: bedKey, items: bedLinenItems });
              }
            }
          });
        }
      }

      // Biancheria Bagno (ba)
      if (config.ba) {
        Object.entries(config.ba as Record<string, number>).forEach(([itemId, qty]) => {
          if (qty > 0) {
            const invItem = inventory.find(i => i.id === itemId);
            const defaultItem = ALL_INVENTORY_ITEMS.find(i => i.id === itemId);
            const name = invItem?.name || defaultItem?.name || itemId;
            const price = invItem?.sellPrice || defaultItem?.defaultPrice || 0;
            bathItems.push({ name, quantity: qty });
            totalPrice += price * qty;
          }
        });
      }

      // Kit Cortesia (ki)
      if (config.ki) {
        Object.entries(config.ki as Record<string, number>).forEach(([itemId, qty]) => {
          if (qty > 0) {
            const invItem = inventory.find(i => i.id === itemId);
            const defaultItem = ALL_INVENTORY_ITEMS.find(i => i.id === itemId);
            const name = invItem?.name || defaultItem?.name || itemId;
            const price = invItem?.sellPrice || defaultItem?.defaultPrice || 0;
            kitItems.push({ name, quantity: qty });
            totalPrice += price * qty;
          }
        });
      }
    } else {
      // 🔥 AUTO-GENERAZIONE: Calcola automaticamente come fa la modal
      const bedrooms = property?.bedrooms || 1;
      const bathrooms = property?.bathrooms || 1;
      
      // Genera letti automatici
      const autoBeds = generateAutoBeds(guestsCount, bedrooms);
      const selectedBeds = autoBeds.slice(0, Math.ceil(guestsCount / 2));
      const linenReq = calcLinenForBeds(selectedBeds);
      
      // Biancheria Letto (auto)
      const bedLinenItems: { name: string; quantity: number }[] = [];
      
      // Lenzuola matrimoniali
      if (linenReq.m > 0) {
        const item = inventory.find(i => i.name?.toLowerCase().includes('matrimoniale')) || 
                     ALL_INVENTORY_ITEMS.find(i => i.name?.toLowerCase().includes('matrimoniale'));
        if (item) {
          bedLinenItems.push({ name: item.name || 'Lenzuolo Matrimoniale', quantity: linenReq.m });
          totalPrice += (item.sellPrice || item.defaultPrice || 0) * linenReq.m;
        }
      }
      
      // Lenzuola singole
      if (linenReq.s > 0) {
        const item = inventory.find(i => i.name?.toLowerCase().includes('singol')) || 
                     ALL_INVENTORY_ITEMS.find(i => i.name?.toLowerCase().includes('singol'));
        if (item) {
          bedLinenItems.push({ name: item.name || 'Lenzuolo Singolo', quantity: linenReq.s });
          totalPrice += (item.sellPrice || item.defaultPrice || 0) * linenReq.s;
        }
      }
      
      // Federe
      if (linenReq.f > 0) {
        const item = inventory.find(i => i.name?.toLowerCase().includes('federa')) || 
                     ALL_INVENTORY_ITEMS.find(i => i.name?.toLowerCase().includes('federa'));
        if (item) {
          bedLinenItems.push({ name: item.name || 'Federa', quantity: linenReq.f });
          totalPrice += (item.sellPrice || item.defaultPrice || 0) * linenReq.f;
        }
      }
      
      if (bedLinenItems.length > 0) {
        bedItems.push({ name: 'Biancheria Letto', items: bedLinenItems });
      }
      
      // Biancheria Bagno (auto) - basata su numero ospiti e bagni
      const bathItemsAuto = [
        { keywords: ['corpo', 'telo doccia'], qty: guestsCount },
        { keywords: ['viso'], qty: guestsCount },
        { keywords: ['bidet'], qty: guestsCount },
        { keywords: ['scendi', 'tappetino'], qty: bathrooms }
      ];
      
      bathItemsAuto.forEach(({ keywords, qty }) => {
        const item = inventory.find(i => keywords.some(k => i.name?.toLowerCase().includes(k))) ||
                     ALL_INVENTORY_ITEMS.find(i => keywords.some(k => i.name?.toLowerCase().includes(k)));
        if (item && qty > 0) {
          bathItems.push({ name: item.name || keywords[0], quantity: qty });
          totalPrice += (item.sellPrice || item.defaultPrice || 0) * qty;
        }
      });
    }

    return { bedItems, bathItems, kitItems, totalPrice };
  };

  // Wrapper per retrocompatibilità
  const getLinenFromServiceConfig = (property: Property | undefined, guestsCount: number) => {
    return getLinenFromConfig(property, guestsCount);
  };

  // 🔴 RETURN CONDIZIONALI - DOPO TUTTI GLI HOOKS
  
  // 🚀 RENDERING PROGRESSIVO: non bloccare il main thread al mount
  // Fase 1 (frame 0): shell leggero con bg colore e titolo — navbar resta reattiva
  // Fase 2 (dopo primo paint): header, filtri, toolbar
  // Fase 3 (dopo secondo paint): card pesanti
  const hasCachedData = storeHasData && !storeInitialLoading;
  const [isHydrated, setIsHydrated] = useState(hasCachedData);
  const [showCards, setShowCards] = useState(hasCachedData);
  useEffect(() => {
    if (!isHydrated) {
      requestAnimationFrame(() => setIsHydrated(true));
    } else if (!showCards) {
      requestAnimationFrame(() => setShowCards(true));
    }
  }, [isHydrated, showCards]);

  // Spinner SOLO la primissima volta in assoluto (nessun dato in cache)
  // Se hai già visitato la pagina, i dati sono in cache → render immediato
  // Spinner SOLO la primissima volta in assoluto (nessun dato in cache)
  // Se hai già visitato la pagina → render immediato, zero attesa
  if (!storeHasData && (authLoading || dataLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 pb-4">
        <div className="flex items-center justify-center pt-32">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500"></div>
        </div>
      </div>
    );
  }
  
  // Se non c'è utente E non ci sono dati in cache, non renderizzare
  if (!user && !storeHasData) return null;


  // 🚀 Shell leggero: solo se non abbiamo mai avuto dati
  if (!isHydrated && !storeHasData) {
    return (
      <div className="min-h-screen bg-slate-50 pb-4">
        <div className="px-4 pt-4">
          <div className="h-24 rounded-2xl bg-gradient-to-r from-violet-100 to-sky-100 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-4">
      
      {/* ═══ BANNER — Week Map v2 ═══ */}
      <style>{`
        @keyframes banner-aurora {
          0%,100%{transform:translate(0,0)}
          33%{transform:translate(2%,-1.5%)}
          66%{transform:translate(-1.5%,2%)}
        }
        @keyframes banner-blink {
          0%,100%{opacity:1}50%{opacity:.3}
        }
        @keyframes banner-shimmer {
          0%{left:-120%}100%{left:220%}
        }
        @keyframes banner-fade {
          0%{opacity:0;transform:translateY(8px) scale(0.98)}
          50%{opacity:1}
          100%{opacity:1;transform:translateY(0) scale(1)}
        }
        .banner-aurora::before {
          content:'';position:absolute;width:280%;height:280%;top:-90%;left:-90%;
          background:
            radial-gradient(ellipse 400px 300px at 15% 45%,rgba(99,102,241,.32) 0%,transparent 70%),
            radial-gradient(ellipse 350px 250px at 75% 35%,rgba(139,92,246,.2) 0%,transparent 70%),
            radial-gradient(ellipse 250px 180px at 50% 85%,rgba(59,130,246,.15) 0%,transparent 70%);
          animation:banner-aurora 16s ease-in-out infinite;
        }
        .banner-grid-bg {
          display:none;
        }
        .banner-cta-shimmer::after {
          content:'';position:absolute;top:0;left:-120%;width:60%;height:100%;
          background:linear-gradient(90deg,transparent,rgba(99,102,241,.05),transparent);
          animation:banner-shimmer 5s ease infinite;
        }
      `}</style>
      
      {(() => {
        // ── Dati dinamici per il banner proprietario ──
        const now = new Date();
        const hour = now.getHours();
        const greeting = hour < 12 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";
        const firstName = user?.name?.split(" ")[0] || "";
        
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        
        // Servizi di oggi
        const todayServices = unifiedServices.filter(s => {
          const d = new Date(s.date);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === todayDate.getTime() && s.status !== "CANCELLED";
        });
        const todayCompleted = todayServices.filter(s => s.status === "COMPLETED" || s.status === "DELIVERED").length;
        const todayTotal = todayServices.length;
        
        // Tutti i servizi in corso
        const allInProgress = todayServices.filter(s => s.status === "IN_PROGRESS" || s.status === "IN_TRANSIT");
        
        // Tutti i servizi programmati oggi (non completati, non in corso)
        const allScheduledToday = todayServices
          .filter(s => s.status !== "COMPLETED" && s.status !== "DELIVERED" && s.status !== "IN_PROGRESS" && s.status !== "IN_TRANSIT")
          .sort((a, b) => (a.scheduledTime || "99:99").localeCompare(b.scheduledTime || "99:99"));
        
        // Prossimo futuro (se nessuno oggi)
        const futureServices = unifiedServices
          .filter(s => {
            const d = new Date(s.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() > todayDate.getTime() && s.status !== "CANCELLED";
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const nextFuture = futureServices[0];
        
        // Servizio da mostrare nella card:
        // 1) Se ci sono servizi in corso → alterna tra quelli
        // 2) Se ci sono servizi programmati → alterna tra quelli
        // 3) Altrimenti → null (mostra futuro o completato)
        let activeService: typeof allInProgress[0] | null = null;
        let isInProgress = false;
        let rotatingList: typeof allInProgress = [];
        
        if (allInProgress.length > 0) {
          rotatingList = allInProgress;
          activeService = allInProgress[bannerServiceIndex % allInProgress.length];
          isInProgress = true;
        } else if (allScheduledToday.length > 0) {
          rotatingList = allScheduledToday;
          activeService = allScheduledToday[bannerServiceIndex % allScheduledToday.length];
          isInProgress = false;
        }
        
        const futureServiceForCard = !activeService ? nextFuture : null;
        
        const allDone = todayTotal > 0 && todayCompleted === todayTotal;
        
        // Subtitle dinamico
        let subtitle = "Nessun servizio oggi";
        if (allDone) {
          subtitle = `Tutti i ${todayTotal} servizi completati`;
        } else if (todayTotal > 0) {
          const parts = [`${todayTotal} serviz${todayTotal === 1 ? "io" : "i"} oggi`];
          if (todayCompleted > 0) parts.push(`${todayCompleted} completat${todayCompleted === 1 ? "o" : "i"}`);
          if (allInProgress.length > 0) parts.push(`${allInProgress.length} in corso`);
          subtitle = parts.join(" · ");
        }
        
        // Helper tipo servizio
        const getServiceTypeLabel = (svc: typeof activeService) => {
          if (!svc) return "";
          if (svc.type === "linen_only") return "Consegna biancheria";
          return "Pulizia";
        };
        const getServiceTypeIcon = (svc: typeof activeService) => {
          if (!svc) return null;
          if (svc.type === "linen_only") {
            return <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>;
          }
          return <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4"/></svg>;
        };
        
        const formatFutureDate = (d: Date) => {
          const tomorrow = new Date(todayDate);
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (d.getTime() === tomorrow.getTime()) return "Domani";
          return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
        };

        // Colori per tipo
        const isLinen = activeService?.type === "linen_only";
        const inProgressColor = isLinen ? { main: "#f59e0b", light: "#fbbf24", bg: "rgba(245,158,11,", border: "rgba(245,158,11," } : { main: "#10b981", light: "#34d399", bg: "rgba(16,185,129,", border: "rgba(16,185,129," };
        const nextColor = isLinen ? { main: "#f59e0b", light: "#fbbf24" } : { main: "#6366f1", light: "#a5b4fc" };

        return (
          <div className="relative">
            {/* Banner background */}
            <div className="relative overflow-hidden" style={{ background: "#0b0b18", padding: "18px 18px 44px" }}>
              {/* Background image */}
              <div className="absolute inset-0" style={{ backgroundImage: "url('data:image/jpeg;base64,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')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.70 }} />
              {/* Gradient overlay */}
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(11,11,24,0.35) 0%, rgba(11,11,24,0.75) 100%)" }} />
              {/* Aurora */}
              <div className="banner-aurora absolute inset-0 overflow-hidden" style={{ opacity: 0.35 }} />
              {/* Grid */}
              <div className="banner-grid-bg absolute inset-0" />
              
              {/* Content */}
              <div className="relative z-10">
                {/* Header row */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div>
                      <div className="text-[16px] font-bold text-white" style={{ letterSpacing: "-0.3px", textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
                        {allDone ? `Ottimo, ` : `${greeting}, `}
                        <span style={{ background: "linear-gradient(135deg,#c7d2fe,#a5b4fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{firstName}</span>
                        {allDone && "!"}
                      </div>
                      <div className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.7)", marginTop: "1px" }}>{subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-[5px]">
                    <div className="w-[5px] h-[5px] rounded-full" style={{ background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.5)", animation: "banner-blink 2s ease infinite" }} />
                    <span className="text-[9px] font-bold uppercase" style={{ color: "rgba(255,255,255,0.6)", letterSpacing: "1.5px" }}>Live</span>
                  </div>
                </div>

                {/* Active / In progress service card */}
                {activeService && (
                  <div 
                    className="flex items-center gap-3 rounded-[14px] transition-all"
                    style={{
                      background: isInProgress ? `${inProgressColor.bg}0.08)` : "rgba(0,0,0,0.25)",
                      backdropFilter: "blur(16px)",
                      border: `1px solid ${isInProgress ? `${inProgressColor.border}0.15)` : "rgba(255,255,255,0.08)"}`,
                      padding: "12px 14px",
                      animation: rotatingList.length > 1 ? "banner-fade 1s cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
                    }}
                    key={activeService.id}
                  >
                    <div className="w-[3px] h-8 rounded-full flex-shrink-0" style={{
                      background: isInProgress 
                        ? `linear-gradient(180deg,${inProgressColor.main},${inProgressColor.light})` 
                        : `linear-gradient(180deg,${nextColor.main},${nextColor.light})`,
                      boxShadow: isInProgress ? `0 0 8px ${inProgressColor.bg}0.3)` : undefined,
                    }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-[9px] font-bold uppercase" style={{ letterSpacing: "1.5px", color: isInProgress ? inProgressColor.light : nextColor.light, marginBottom: 3 }}>
                          {isInProgress 
                            ? (isLinen ? "Consegna in corso" : "Pulizia in corso")
                            : (activeService.type === "linen_only" ? "Prossima consegna" : "Prossima pulizia")
                          }
                        </div>
                        {rotatingList.length > 1 && (
                          <div className="text-[8px] font-bold rounded-full px-[6px] py-[1px]" style={{ 
                            background: isInProgress ? `${inProgressColor.bg}0.15)` : "rgba(99,102,241,0.15)", 
                            color: isInProgress ? inProgressColor.light : nextColor.light,
                            marginBottom: 3,
                          }}>
                            {(bannerServiceIndex % rotatingList.length) + 1}/{rotatingList.length}
                          </div>
                        )}
                      </div>
                      <div className="text-[13px] font-bold text-white truncate">{activeService.propertyName}</div>
                      <div className="flex items-center gap-2 mt-[2px]" style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>
                        <span style={{ color: isInProgress ? inProgressColor.light : nextColor.light, opacity: 0.6 }}>{getServiceTypeIcon(activeService)}</span>
                        <span>{getServiceTypeLabel(activeService)}</span>
                        {activeService.cleaning?.guestsCount && (
                          <>
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>·</span>
                            <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                            <span>{activeService.cleaning.guestsCount} ospiti</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-center rounded-[10px] flex-shrink-0" style={{
                      padding: "6px 12px",
                      background: isInProgress ? `${inProgressColor.bg}0.1)` : `rgba(99,102,241,0.1)`,
                      border: `1px solid ${isInProgress ? `${inProgressColor.border}0.12)` : "rgba(99,102,241,0.12)"}`,
                    }}>
                      <div className="text-[16px] font-extrabold" style={{ color: isInProgress ? inProgressColor.light : nextColor.light, lineHeight: 1, letterSpacing: "-0.5px" }}>{activeService.scheduledTime || "TBD"}</div>
                      <div className="text-[7px] font-bold uppercase" style={{ color: isInProgress ? `${inProgressColor.bg}0.4)` : "rgba(165,180,252,0.4)", letterSpacing: "1px", marginTop: 1 }}>{isInProgress ? "Ora" : "Oggi"}</div>
                    </div>
                  </div>
                )}

                {/* All done today */}
                {allDone && !activeService && (
                  <div className="flex items-center gap-3 rounded-[14px]" style={{ background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.35)", padding: "12px 14px" }}>
                    <div className="w-[3px] h-8 rounded-full flex-shrink-0" style={{ background: "linear-gradient(180deg,#10b981,#34d399)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-bold uppercase" style={{ letterSpacing: "1.5px", color: "#34d399", marginBottom: 3 }}>Tutto completato</div>
                      <div className="text-[13px] font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>
                        {nextFuture ? `Prossimo: ${nextFuture.propertyName} · ${formatFutureDate(new Date(nextFuture.date))}` : "Nessun servizio in programma"}
                      </div>
                      <div className="flex items-center gap-2 mt-[2px]" style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>
                        <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        <span>{todayCompleted} su {todayTotal} completat{todayCompleted === 1 ? "o" : "i"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-center rounded-[10px] flex-shrink-0" style={{ padding: "6px 12px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.12)" }}>
                      <div className="text-[16px] font-extrabold" style={{ color: "#34d399", lineHeight: 1 }}>{todayCompleted}/{todayTotal}</div>
                      <div className="text-[7px] font-bold uppercase" style={{ color: "rgba(52,211,153,0.4)", letterSpacing: "1px", marginTop: 1 }}>Fatto</div>
                    </div>
                  </div>
                )}

                {/* No services today — show next future */}
                {todayTotal === 0 && futureServiceForCard && (
                  <div className="flex items-center gap-3 rounded-[14px]" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px" }}>
                    <div className="w-[3px] h-8 rounded-full flex-shrink-0" style={{ background: futureServiceForCard.type === "linen_only" ? "linear-gradient(180deg,#f59e0b,#fbbf24)" : "linear-gradient(180deg,#6366f1,#a78bfa)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-bold uppercase" style={{ letterSpacing: "1.5px", color: futureServiceForCard.type === "linen_only" ? "#fbbf24" : "#818cf8", marginBottom: 3 }}>
                        {futureServiceForCard.type === "linen_only" ? "Prossima consegna" : "Prossima pulizia"}
                      </div>
                      <div className="text-[13px] font-bold text-white truncate">{futureServiceForCard.propertyName}</div>
                      <div className="flex items-center gap-2 mt-[2px]" style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>
                        <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        <span>{formatFutureDate(new Date(futureServiceForCard.date))}</span>
                        {futureServiceForCard.cleaning?.guestsCount && (
                          <>
                            <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                            <span>{futureServiceForCard.cleaning.guestsCount} ospiti</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-center rounded-[10px] flex-shrink-0" style={{ padding: "6px 12px", background: futureServiceForCard.type === "linen_only" ? "rgba(245,158,11,0.1)" : "rgba(99,102,241,0.1)", border: `1px solid ${futureServiceForCard.type === "linen_only" ? "rgba(245,158,11,0.12)" : "rgba(99,102,241,0.12)"}` }}>
                      <div className="text-[16px] font-extrabold" style={{ color: futureServiceForCard.type === "linen_only" ? "#fbbf24" : "#a5b4fc", lineHeight: 1, letterSpacing: "-0.5px" }}>{futureServiceForCard.scheduledTime || "TBD"}</div>
                      <div className="text-[7px] font-bold uppercase" style={{ color: futureServiceForCard.type === "linen_only" ? "rgba(251,191,36,0.4)" : "rgba(165,180,252,0.4)", letterSpacing: "1px", marginTop: 1 }}>
                        {formatFutureDate(new Date(futureServiceForCard.date)).split(" ")[0]}
                      </div>
                    </div>
                  </div>
                )}

                {/* Nessun servizio futuro */}
                {todayTotal === 0 && !futureServiceForCard && (
                  <div className="text-center py-2">
                    <p className="text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Nessun servizio in programma</p>
                  </div>
                )}
              </div>
            </div>

            {/* CTA Button */}
            <div className="flex justify-center relative z-20 px-[18px]" style={{ marginTop: "-22px" }}>
              <button
                onClick={() => modalsRef.current?.openNewCleaningModal()}
                className="banner-cta-shimmer flex items-center gap-3 bg-white border-none cursor-pointer relative overflow-hidden hover:scale-[1.02] active:scale-[0.97] transition-transform"
                style={{
                  padding: "13px 28px 13px 16px",
                  borderRadius: 16,
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#1e1b4b",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(99,102,241,0.08)",
                }}
              >
                <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 2px 8px rgba(99,102,241,0.3)" }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v16m8-8H4"/></svg>
                </div>
                <span>Richiedi Servizio</span>
                <svg className="w-4 h-4 ml-auto" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        );
      })()}
      
      {/* Small spacer */}
      <div className="h-3"></div>

      {/* ═══ TOGGLE LISTA / CALENDARIO ═══ */}
      <div className="px-4 pb-2">
        <div className="flex bg-slate-100 rounded-xl p-1 max-w-md mx-auto relative">
          <div 
            ref={toggleSliderRef}
            className="absolute top-1 bottom-1 rounded-lg bg-white pointer-events-none"
            style={{ 
              width: 'calc(50% - 4px)', 
              transform: "translateX(0)",
              transition: "transform 150ms ease-out",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          />
          <button
            ref={toggleListBtnRef}
            onClick={() => switchView("list")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold relative z-10 text-slate-900"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
            Lista
          </button>
          <button
            ref={toggleCalBtnRef}
            onClick={() => switchView("calendar")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold relative z-10 text-slate-400"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>
            Calendario
          </button>
        </div>
      </div>

      {/* ═══ FILTRI — Componente separato, reattivo istantaneo ═══ */}
      <PulizieFilters
        timeFilter={timeFilter}
        statusFilter={statusFilter}
        selectedPropertyIds={selectedPropertyIds}
        sortBy={sortBy}
        customDateFrom={customDateFrom}
        customDateTo={customDateTo}
        viewMode={viewMode}
        properties={properties}
        statusStats={statusStats}
        onTimeFilterChange={handleTimeFilterChange}
        onStatusFilterChange={handleStatusFilterChange}
        onSelectedPropertyIdsChange={handlePropertyIdsChange}
        onSortByChange={handleSortByChange}
        onCustomDateFromChange={handleCustomDateFromChange}
        onCustomDateToChange={handleCustomDateToChange}
        onSearchChange={handleSearchChange}
      />

      {/* CONTENT */}
      <div className="px-4 py-4">
        <div className="max-w-4xl mx-auto">
          
          {/* Lista — nascosta con CSS quando in calendario */}
          <div ref={listContainerRef} style={{ display: "block" }}>
            <div className="space-y-5" style={{ opacity: (isFilterPending || deferredTimeFilter !== timeFilter || deferredStatusFilter !== statusFilter) ? 0.6 : 1, transition: 'opacity 0.1s' }}>
              {!showCards ? (
                /* Fase 2: header e filtri visibili, card in caricamento */
                <div className="py-8" />
              ) : Object.keys(groupedByDate).length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-1">Nessuna pulizia trovata</h3>
                  <p className="text-slate-500 text-sm">Non ci sono pulizie per il periodo selezionato</p>
                </div>
              ) : (() => {
                // 🚀 Flatten all services, take only first N for rendering
                const allServices = Object.entries(groupedByDate).flatMap(([dateKey, services]) => 
                  services.map(s => ({ ...s, _dateKey: dateKey }))
                );
                const totalCount = allServices.length;
                const visibleServices = allServices.slice(0, visibleCardCount);
                
                // Re-group visible services by date
                const visibleGrouped: Record<string, typeof visibleServices> = {};
                visibleServices.forEach(s => {
                  if (!visibleGrouped[s._dateKey]) visibleGrouped[s._dateKey] = [];
                  visibleGrouped[s._dateKey].push(s);
                });
                
                return (
                  <>
                {Object.entries(visibleGrouped).map(([dateKey, dayServices]) => {
                  const date = toDate(dateKey) || new Date(dateKey);
                  const isTodayDate = isSameDay(date, today);
                  const dateLabel = isTodayDate ? "Oggi" : date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
                  
                  // Conta per tipo
                  const cleaningsCount = dayServices.filter(s => s.type !== 'linen_only').length;
                  const linensCount = dayServices.filter(s => s.type === 'linen_only').length;
                  const serviceLabel = cleaningsCount > 0 && linensCount > 0 
                    ? `${cleaningsCount} pulizie, ${linensCount} consegne`
                    : cleaningsCount > 0 
                      ? `${cleaningsCount} ${cleaningsCount === 1 ? 'pulizia' : 'pulizie'}`
                      : `${linensCount} ${linensCount === 1 ? 'consegna' : 'consegne'}`;
                  
                  return (
                    <div key={dateKey}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`px-3 py-1 rounded-lg font-semibold text-sm ${isTodayDate ? "bg-violet-500 text-white" : "bg-slate-200 text-slate-700"}`}>
                          {dateLabel}
                        </div>
                        <div className="flex-1 h-px bg-slate-200"></div>
                        <span className="text-xs text-slate-400">{serviceLabel}</span>
                      </div>

                      <div className="space-y-3">
                        {dayServices.map((service) => {
                          // Se è una pulizia, usa la logica esistente
                          if (service.type !== 'linen_only' && service.cleaning) {
                            const cleaning = service.cleaning;
                            const property = propertyMap.get(cleaning.propertyId);

                            const hasLinenOrder = service.type === 'cleaning_with_linen';
                          
                          return (
                            <MemoCard
                              key={cleaning.id}
                              cleaning={cleaning}
                              property={property}
                              operators={operators}
                              isAdmin={isAdmin}
                              hasLinenOrder={hasLinenOrder}
                              inventory={inventory}
                              onTimeModal={() => openTimeModal(cleaning)}
                              onGuestModal={() => openGuestModal(cleaning)}
                              onEditModal={() => openEditModal(cleaning, property, 0)}
                              onOperatorModal={() => openOperatorModal(cleaning)}
                            />
                          );
                          } else {
                            // 🔴 CARD PER CONSEGNA STANDALONE (solo biancheria)
                            const order = service.order!;
                            const property = propertyMap.get(service.propertyId);
                            const totalItems = service.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;

                            
                            // Calcola prezzo totale degli articoli
                            const itemsPrice = service.items?.reduce((sum, item) => {
                              // 🔥 FIX: Usa funzione di mapping per trovare prezzi
                              const price = findOrderItemPrice(item, inventory);
                              return sum + (price * item.quantity);
                            }, 0) || 0;
                            // 💰 Aggiungi costo consegna se presente e abilitato
                            const orderDeliveryFee = (order.deliveryFee && order.deliveryFeeEnabled !== false) ? order.deliveryFee : 0;
                            // 🛏️ Aggiungi costo preparazione letti se presente
                            const orderBedMakingFee = (order.bedMaking && order.bedMakingFee) ? order.bedMakingFee : 0;
                            const orderTotalPrice = itemsPrice + orderDeliveryFee + orderBedMakingFee;
                            
                            // Status config per ordini
                            const getOrderStatusConfig = (status: string) => {
                              switch (status?.toUpperCase()) {
                                case 'DELIVERED':
                                  return { label: 'Consegnato', cssGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', icon: '✓' };
                                case 'IN_TRANSIT':
                                  return { label: 'In consegna', cssGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', icon: '●' };
                                case 'ASSIGNED':
                                  return { label: 'Assegnato', cssGradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', icon: '!' };
                                default:
                                  return { label: 'In attesa', cssGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', icon: '○' };
                              }
                            };
                            const orderStatus = getOrderStatusConfig(order.status);
                            
                            return (
                              <ExpandableCard
                                key={service.id}
                                id={service.id}
                                className="bg-white rounded-3xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                                style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.04)' }}
                              >
                              {({ isExpanded, toggleExpand }) => (<div onClick={() => handleOpenOrderDetail(order)}>
                                <div className="flex h-32">
                                  {/* Foto/Placeholder con overlay arancione per consegne */}
                                  <div className="relative w-32 h-32 flex-shrink-0">
                                    {property?.imageUrl ? (
                                      <img 
                                        src={property.imageUrl} 
                                        alt={property?.name || ''} 
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div 
                                        className="w-full h-full flex items-center justify-center"
                                        style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
                                      >
                                        <LinenOnlyIcon className="w-12 h-12 text-white/30" />
                                      </div>
                                    )}
                                    {/* Overlay sfumato */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                                    
                                    {/* Badge Stato */}
                                    <div className="absolute top-2.5 left-2.5">
                                      <span 
                                        className="px-2.5 py-1 text-[10px] font-bold text-white rounded-lg flex items-center gap-1"
                                        style={{ 
                                          background: orderStatus.cssGradient,
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                                        }}
                                      >
                                        {orderStatus.icon === '✓' && (
                                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                        {orderStatus.icon === '●' && (
                                          <svg className="w-2.5 h-2.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                          </svg>
                                        )}
                                        {orderStatus.icon === '!' && (
                                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                                        )}
                                        {orderStatus.icon === '○' && (
                                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                        )}
                                        {orderStatus.label}
                                      </span>
                                    </div>
                                    
                                    {/* 🔴 PREZZO TOTALE sulla foto (invece di numero articoli) */}
                                    <div className="absolute bottom-2 right-2">
                                      <span className="text-2xl font-black text-white drop-shadow-lg">€{orderTotalPrice.toFixed(0)}</span>
                                    </div>
                                  </div>
                                  
                                  {/* Contenuto */}
                                  <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0">
                                    {/* Header */}
                                    <div>
                                      <div className="flex items-center gap-2">
                                        {/* Icona tipo servizio */}
                                        <div className="flex-shrink-0" title="Solo Biancheria">
                                          <LinenOnlyIcon className="w-4 h-4 text-orange-500" />
                                        </div>
                                        <h3 className="font-semibold text-[13px] text-gray-900 truncate leading-tight">{service.propertyName || property?.name}</h3>
                                        <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-bold rounded-md uppercase flex-shrink-0">
                                          Consegna
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{cleanAddress(property?.address)}</p>
                                    </div>
                                    
                                    {/* Info */}
                                    <div className="flex items-center gap-2 mt-2">
                                      {/* Orario */}
                                      <div 
                                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                        style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', boxShadow: '0 2px 8px rgba(249,115,22,0.1)' }}
                                      >
                                        <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="text-[11px] font-semibold text-orange-700">{service.scheduledTime || "TBD"}</span>
                                      </div>
                                      
                                      {/* Articoli */}
                                      <div 
                                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                                      >
                                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                        </svg>
                                        <span className="text-[11px] font-semibold text-gray-700">{totalItems} articoli</span>
                                      </div>
                                      
                                      {/* Rider se assegnato */}
                                      {service.riderName && (
                                        <div 
                                          className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                          style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)' }}
                                        >
                                          <svg className="w-3 h-3 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                          </svg>
                                          <span className="text-[11px] font-semibold text-violet-700 truncate max-w-[60px]">{service.riderName}</span>
                                        </div>
                                      )}
                                      
                                      {/* 🔴 PULSANTE ESPANDI */}
                                      <button 
                                        onClick={toggleExpand}
                                        onTouchStart={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.85)'; }}
                                        onTouchEnd={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                                        className="ml-auto w-7 h-7 rounded-xl flex items-center justify-center active:scale-90"
                                        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'transform 0.1s', WebkitTapHighlightColor: 'transparent' }}
                                      >
                                        <svg 
                                          className="w-4 h-4 text-gray-400"
                                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
                                          fill="none" 
                                          stroke="currentColor" 
                                          viewBox="0 0 24 24"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* 🔴 DETTAGLI ESPANDIBILI PER CONSEGNA */}
                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.25, ease: "easeInOut" }}
                                      className="overflow-hidden"
                                    >
                                <div onClick={(e) => e.stopPropagation()}>
                                    <div className="px-4 pb-4 pt-2 border-t border-orange-100">
                                      {/* Riga Totale */}
                                      <div className="flex items-center justify-between mb-4 py-2 px-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)' }}>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-orange-600">Totale articoli:</span>
                                          <span className="text-xs font-bold text-orange-800">{totalItems}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-orange-600">Costo totale:</span>
                                          <span className="text-sm font-bold text-orange-800">€{orderTotalPrice.toFixed(2)}</span>
                                        </div>
                                      </div>

                                      {/* Lista Articoli */}
                                      {service.items && service.items.length > 0 && (
                                        <div className="mb-4">
                                          <div className="flex items-center gap-2 mb-2">
                                            <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center">
                                              <LinenOnlyIcon className="w-3.5 h-3.5 text-orange-600" />
                                            </div>
                                            <span className="text-xs font-semibold text-gray-700">Articoli ordinati</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1.5">
                                            {service.items.map((item, idx) => {
                                              // @ts-expect-error TODO-FIX: TS2339 Property 'itemId' does not exist on type 'LinenItem'.
                                              const itemName = item.name || item.itemId || item.id || "Articolo";
                                              return (
                                                <span key={idx} className="px-2 py-1 bg-orange-50 rounded-lg text-[10px] text-orange-700 border border-orange-200">
                                                  {itemName}: <span className="font-bold">{item.quantity}</span>
                                                </span>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      {/* 💰 Costo Consegna */}
                                      {orderDeliveryFee > 0 && (
                                        <div className="mb-4 flex items-center justify-between py-2 px-3 rounded-xl bg-amber-50 border border-amber-200">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm">🚚</span>
                                            <span className="text-xs font-semibold text-amber-800">Costo Consegna</span>
                                          </div>
                                          <span className="text-sm font-bold text-amber-700">€{orderDeliveryFee.toFixed(2)}</span>
                                        </div>
                                      )}

                                      {/* 🛏️ Preparazione Letti */}
                                      {order.bedMaking && orderBedMakingFee > 0 && (
                                        <div className="mb-4 rounded-xl bg-violet-50 border border-violet-200 overflow-hidden">
                                          <div className="flex items-center justify-between py-2 px-3">
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm">🛏️</span>
                                              <span className="text-xs font-bold text-violet-800">Preparazione Letti</span>
                                            </div>
                                            <span className="text-sm font-bold text-violet-700">€{orderBedMakingFee.toFixed(2)}</span>
                                          </div>
                                          {order.bedMakingBeds && order.bedMakingBeds.length > 0 && (
                                            <div className="px-3 pb-2 space-y-1">
                                              {order.bedMakingBeds.map((bed: any, i: number) => (
                                                <div key={i} className="flex items-center gap-2 text-[10px] text-violet-600">
                                                  <span>{bed.type === 'matrimoniale' ? '🛏️' : '🛌'}</span>
                                                  <span className="font-medium">{bed.name}</span>
                                                  {bed.location && <span className="text-violet-400">• {bed.location}</span>}
                                                  <span className="ml-auto font-bold">€5</span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Messaggio se non ci sono articoli */}
                                      {(!service.items || service.items.length === 0) && (
                                        <div className="mb-3 p-3 bg-orange-50 rounded-xl text-center">
                                          <p className="text-xs text-orange-600">Nessun articolo nella consegna</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>)}
                              </ExpandableCard>
                            );
                          }
                        })}
                      </div>
                    </div>
                  );
                })}
                
                {/* 🚀 Infinite scroll — carica più card quando l'utente scrolla in basso */}
                {totalCount > visibleCardCount && (
                  <div ref={scrollSentinelRef} className="flex items-center justify-center gap-2 py-4">
                    <div className="w-5 h-5 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                    <span className="text-sm text-slate-400">Caricamento...</span>
                  </div>
                )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Calendario — renderizzato SOLO quando visibile */}
          {viewMode === "calendar" && (
          <div ref={calContainerRef}>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
              
              {/* Navigation header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <button 
                  onClick={() => navigateCalendar(-1)}
                  className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 capitalize">{monthName}</h3>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-2 py-1 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-md"
                  >
                    Oggi
                  </button>
                </div>
                <button 
                  onClick={() => navigateCalendar(1)}
                  className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Header giorni */}
              <div 
                ref={headerRef}
                className="overflow-x-auto sticky top-0 z-40 bg-white"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                onScroll={(e) => {
                  if (isScrollSyncing.current) return;
                  isScrollSyncing.current = true;
                  if (calendarRef.current) {
                    calendarRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                  isScrollSyncing.current = false;
                }}
              >
                <div className="grid border-b-2 border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `repeat(${ganttDays.length}, 60px)` }}>
                  {ganttDays.map((day, i) => (
                    <div key={i} className={`py-2 text-center border-r border-slate-200 last:border-r-0 ${day.isToday ? "bg-emerald-100" : "bg-slate-50"}`}>
                      <div className={`text-[9px] font-semibold ${day.isToday ? "text-emerald-600" : day.isSunday ? "text-rose-400" : "text-slate-400"}`}>
                        {day.dayName}
                      </div>
                      {day.isToday ? (
                        <div className="w-7 h-7 mx-auto rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center mt-0.5 shadow">
                          {day.day}
                        </div>
                      ) : (
                        <div className={`text-xs font-bold mt-0.5 ${day.isSunday ? "text-rose-400" : "text-slate-700"}`}>
                          {day.day}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Griglia proprietà */}
              <div 
                ref={calendarRef} 
                className="overflow-x-auto"
                onScroll={(e) => {
                  if (isScrollSyncing.current) return;
                  isScrollSyncing.current = true;
                  if (headerRef.current) {
                    headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                  setCalendarScroll("pulizie", e.currentTarget.scrollLeft);
                  isScrollSyncing.current = false;
                }}
              >

                {/* Righe proprietà */}
                {filteredProperties.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">Nessuna proprietà trovata</div>
                ) : (
                  filteredProperties.map((property, propIndex) => {
                    // 🔧 FIX: Escludi pulizie CANCELLED dal Gantt
                    const propertyCleanings = cleanings.filter(c => c.propertyId === property.id && c.status !== "CANCELLED");
                    
                    return (
                      <div key={property.id} className="relative h-[70px] border-b-2 border-slate-200 last:border-b-0" style={{ width: `${ganttDays.length * 60}px` }}>
                        
                        {/* Badge nome proprietà */}
                        <div 
                          className="h-5 flex items-center gap-1.5 pl-1.5 pr-3 rounded-br-lg shadow-md sticky left-0 w-fit"
                          style={{ 
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
                            zIndex: 10, 
                            marginBottom: '-20px',
                            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                          }}
                        >
                          <div className="w-4 h-4 rounded bg-white/25 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[8px] font-bold drop-shadow-sm">{property.name.charAt(0)}</span>
                          </div>
                          <span className="text-white text-[10px] font-semibold whitespace-nowrap drop-shadow-sm">{property.name}</span>
                          {property.address && (
                            <>
                              <span className="text-white/60 text-[10px]">-</span>
                              <span className="text-white/80 text-[9px] whitespace-nowrap drop-shadow-sm">{cleanAddress(property.address)}</span>
                            </>
                          )}
                        </div>

                        {/* Griglia sfondo */}
                        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${ganttDays.length}, 60px)` }}>
                          {ganttDays.map((day, i) => (
                            <div key={i} className={`border-r border-slate-200 last:border-r-0 ${day.isToday ? "bg-emerald-50" : ""}`} />
                          ))}
                        </div>

                        {/* Blocchi pulizie */}
                        {propertyCleanings.map((cleaning) => {
                          const cleaningDate = new Date(cleaning.date);
                          const dayIndex = ganttDays.findIndex(d => isSameDay(d.date, cleaningDate));
                          if (dayIndex === -1) return null;
                          const status = getStatusConfig(cleaning.status, !!cleaning.operator);
                          
                          // Calcola deadline e stato ospiti
                          const now = new Date();
                          const deadlineDate = new Date(cleaningDate);
                          deadlineDate.setDate(deadlineDate.getDate() - 1);
                          deadlineDate.setHours(20, 0, 0, 0);
                          const isAfterDeadline = now >= deadlineDate;
                          const maxGuests = property?.maxGuests || 6;
                          
                          // Determina colore badge ospiti
                          let guestsBadgeBg = '';
                          let guestsDisplay: string | number = '!';
                          let ringClass = '';
                          
                          if (cleaning.guestsConfirmed) {
                            guestsBadgeBg = 'bg-emerald-500/40';
                            guestsDisplay = cleaning.guestsCount || maxGuests;
                          } else if (isAfterDeadline) {
                            guestsBadgeBg = 'bg-amber-500/50';
                            guestsDisplay = maxGuests;
                          } else {
                            guestsBadgeBg = 'bg-red-500/50';
                            guestsDisplay = '!';
                            ringClass = 'ring-2 ring-red-400 ring-offset-1';
                          }
                          
                          return (
                            <div
                              key={cleaning.id}
                              className={`absolute top-[24px] ${status.bg} rounded-lg shadow-lg flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform z-10 ${ringClass}`}
                              style={{ left: `${dayIndex * 60 + 3}px`, width: "54px", height: "42px" }}
                              onClick={() => openEditModal(cleaning, property, cleaning.price || cleaning.contractPrice || property?.cleaningPrice || 0)}
                            >
                              <span className="text-white text-[10px] font-bold drop-shadow">{cleaning.scheduledTime || "TBD"}</span>
                              <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${guestsBadgeBg}`}>
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                                </svg>
                                <span className="text-white text-[9px] font-bold">{guestsDisplay}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Legenda */}
              <div className="p-3 border-t border-slate-200 bg-slate-50">
                <div className="flex flex-wrap justify-center gap-3 text-[10px]">
                  {[
                    { bg: "from-emerald-400 to-teal-500", label: "Completata", icon: "✓" },
                    { bg: "from-amber-400 to-orange-500", label: "In corso", icon: "●" },
                    { bg: "from-sky-400 to-blue-500", label: "Programmata", icon: "○" },
                    ...(isAdmin ? [{ bg: "from-rose-400 to-red-500", label: "Da assegnare", icon: "!" }] : []),
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className={`w-4 h-4 rounded bg-gradient-to-r ${item.bg} flex items-center justify-center text-white text-[8px] font-bold shadow`}>
                        {item.icon}
                      </div>
                      <span className="text-slate-600">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* 🚀 Modal: componente separato — zero re-render di PulizieView */}
      <PulizieModals
        ref={modalsRef}
        properties={properties}
        operators={operators}
        inventory={inventory}
        isAdmin={isAdmin}
        user={user}
        ownerId={ownerId}
      />
    </div>
  );
});
