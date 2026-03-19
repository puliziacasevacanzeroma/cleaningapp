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
import { useOwnerDebts } from "~/hooks/useOwnerDebts";
import { useOwnerRealtimePayments } from "~/hooks/useOwnerRealtimePayments";

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

  // 🖥️ Debiti proprietario per pannello destro (hook chiamato sempre, dati usati solo se !isAdmin)
  const ownerDebts = useOwnerDebts(isAdmin ? undefined : ownerId);
  
  // 🖥️ Pagamenti mese corrente per spesa nel pannello (dato identico alla pagina Pagamenti)
  const currentMonthNum = new Date().getMonth() + 1;
  const currentYearNum = new Date().getFullYear();
  const ownerPayments = useOwnerRealtimePayments(isAdmin ? undefined : ownerId, currentMonthNum, currentYearNum);
  
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

  // 🖥️ PANNELLO DESTRO DESKTOP — dati aggregati (sempre oggi, ignora filtri attivi)
  const desktopPanelData = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Servizi di oggi (non cancellati)
    const todayServices = unifiedServices.filter(s => {
      const d = new Date(s.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === now.getTime() && s.status !== "CANCELLED";
    });

    const completed = todayServices.filter(s => s.status === "COMPLETED" || s.status === "DELIVERED").length;
    const inProgress = todayServices.filter(s => s.status === "IN_PROGRESS" || s.status === "IN_TRANSIT").length;
    const totalPrice = todayServices.reduce((sum, s) => {
      if (s.cleaning) {
        const prop = propertyMap.get(s.propertyId);
        return sum + (s.cleaning.price || s.cleaning.contractPrice || prop?.cleaningPrice || 0);
      }
      return sum;
    }, 0);

    // Da assegnare: pulizie senza operatore, da oggi in poi, ordinate per orario
    const unassigned = unifiedServices
      .filter(s => {
        if (s.status === "CANCELLED") return false;
        const d = new Date(s.date);
        d.setHours(0, 0, 0, 0);
        if (d.getTime() < now.getTime()) return false;
        if (s.type === "linen_only") return false;
        const cleaning = s.cleaning;
        if (!cleaning) return false;
        const ops = cleaning.operators?.length ? cleaning.operators : (cleaning.operator ? [cleaning.operator] : []);
        return ops.length === 0;
      })
      .sort((a, b) => {
        const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (a.scheduledTime || "99:99").localeCompare(b.scheduledTime || "99:99");
      })
      .slice(0, 5);

    // Carico operatori oggi
    const operatorWorkload: { id: string; name: string; initials: string; color: string; total: number; completed: number; inProgress: number }[] = [];
    const opColors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];
    const opMap = new Map<string, { total: number; completed: number; inProgress: number }>();

    todayServices.forEach(s => {
      if (!s.cleaning) return;
      const ops = s.cleaning.operators?.length ? s.cleaning.operators : (s.cleaning.operator ? [s.cleaning.operator] : []);
      ops.forEach((op: Operator) => {
        if (!op.id) return;
        const existing = opMap.get(op.id) || { total: 0, completed: 0, inProgress: 0 };
        existing.total++;
        if (s.status === "COMPLETED" || s.status === "DELIVERED") existing.completed++;
        if (s.status === "IN_PROGRESS") existing.inProgress++;
        opMap.set(op.id, existing);
      });
    });

    opMap.forEach((data, opId) => {
      const op = operators.find((o: Operator) => o.id === opId);
      const name = op?.name || "Sconosciuto";
      const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
      operatorWorkload.push({
        id: opId,
        name,
        initials,
        color: opColors[operatorWorkload.length % opColors.length],
        ...data,
      });
    });

    // Operatori liberi (non impegnati oggi)
    const busyOpIds = new Set(opMap.keys());
    const freeOperators = operators
      .filter((op: Operator) => op.id && op.name && !busyOpIds.has(op.id))
      .slice(0, 3);

    // Prossimi servizi (non completati, da adesso in poi)
    const nowTime = new Date();
    const upcoming = unifiedServices
      .filter(s => {
        if (s.status === "CANCELLED" || s.status === "COMPLETED" || s.status === "DELIVERED") return false;
        const d = new Date(s.date);
        return d >= now;
      })
      .sort((a, b) => {
        const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (a.scheduledTime || "99:99").localeCompare(b.scheduledTime || "99:99");
      })
      .slice(0, 4);

    // Alert
    const alerts: { type: "danger" | "warning" | "info"; title: string; subtitle: string }[] = [];
    todayServices.forEach(s => {
      if (!s.cleaning) return;
      const prop = propertyMap.get(s.propertyId);
      const pName = prop?.name || s.propertyName || "?";
      // Ospiti non confermati
      if (s.cleaning.guestsCount && !s.cleaning.guestsConfirmed && s.status !== "COMPLETED" && s.status !== "DELIVERED") {
        alerts.push({ type: "danger", title: "Ospiti non confermati", subtitle: `${pName} · ${s.cleaning.guestsCount} ospiti stimati` });
      }
      // Data spostata
      if (s.cleaning.originalDate) {
        const origDate = new Date(s.cleaning.originalDate);
        alerts.push({ type: "info", title: "Data spostata", subtitle: `${pName} · era ${origDate.toLocaleDateString("it-IT", { day: "numeric", month: "short" })}` });
      }
    });

    // 🏠 Dati specifici proprietario
    // Ospiti da confermare (pulizie future senza guestsConfirmed)
    const guestsToConfirm = unifiedServices
      .filter(s => {
        if (s.status === "CANCELLED" || s.status === "COMPLETED" || s.status === "DELIVERED") return false;
        if (!s.cleaning) return false;
        if (s.cleaning.guestsConfirmed) return false;
        const d = new Date(s.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() >= now.getTime();
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);

    // Spesa mese corrente — IDENTICA alla pagina Pagamenti (useOwnerRealtimePayments)
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let monthlySpendPulizie = 0;
    let monthlySpendOrdini = 0; // biancheria + kit cortesia + servizi extra
    let monthlyServiceCount = 0;

    // Calcolo prezzo ordine (stessa logica di useOwnerRealtimePayments.processOrder)
    const calcOrderTotal = (o: any): number => {
      if (o.totalPriceOverride) return o.totalPriceOverride;
      let t = 0;
      if (o.items) o.items.forEach((item: any) => {
        const unitPrice = item.priceOverride ?? item.unitPrice ?? item.price ?? 0;
        const quantity = item.quantity || 1;
        t += (item.totalPrice || (unitPrice * quantity));
      });
      // Costo consegna
      if (o.deliveryFee && o.deliveryFeeEnabled !== false) t += o.deliveryFee;
      // Costo rifacimento letti
      if (o.bedMaking && o.bedMakingFee) t += o.bedMakingFee;
      return t;
    };

    // Pulizie COMPLETATE del mese → spesa pulizie (con priceOverride come in Pagamenti)
    const completedCleaningIds = new Set<string>();
    unifiedServices.forEach(s => {
      if (!s.cleaning) return;
      const d = new Date(s.date);
      if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return;
      if (s.status === "COMPLETED") {
        const prop = propertyMap.get(s.propertyId);
        const basePrice = s.cleaning.price || prop?.cleaningPrice || 0;
        const effectivePrice = s.cleaning.priceOverride ?? basePrice;
        monthlySpendPulizie += effectivePrice;
        monthlyServiceCount++;
        completedCleaningIds.add(s.cleaning.id);
      }
    });

    // TUTTI gli ordini del mese (biancheria + kit cortesia + servizi extra)
    // Inclusi se: DELIVERED oppure collegati a pulizia COMPLETED
    const countedOrderIds = new Set<string>();
    orders.forEach((o: any) => {
      if (countedOrderIds.has(o.id)) return;
      const d = o.deliveredAt ? new Date(o.deliveredAt) : (o.scheduledDate ? new Date(o.scheduledDate) : (o.createdAt ? new Date(o.createdAt) : null));
      if (!d || d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return;
      const isDelivered = o.status === "DELIVERED";
      const isLinkedToCompleted = o.cleaningId && completedCleaningIds.has(o.cleaningId);
      if (!isDelivered && !isLinkedToCompleted) return;
      monthlySpendOrdini += calcOrderTotal(o);
      countedOrderIds.add(o.id);
      monthlyServiceCount++;
    });

    const monthlySpendTotal = monthlySpendPulizie + monthlySpendOrdini;

    return {
      todayTotal: todayServices.length,
      completed,
      inProgress,
      totalPrice: Math.round(totalPrice),
      unassigned,
      operatorWorkload,
      freeOperators,
      upcoming,
      alerts: alerts.slice(0, 5),
      // Proprietario
      guestsToConfirm,
      monthlySpendTotal: Math.round(monthlySpendTotal),
      monthlySpendPulizie: Math.round(monthlySpendPulizie),
      monthlySpendOrdini: Math.round(monthlySpendOrdini),
      monthlyServiceCount,
    };
  }, [unifiedServices, operators, propertyMap, orders]);

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
    <div className="min-h-screen bg-slate-50 pb-4 xl:pr-[310px]">
      
      {/* 🖥️ PANNELLO DESTRO DESKTOP — fixed, sempre visibile */}
      <div className="hidden xl:block fixed right-0 top-[57px] w-[300px] h-[calc(100vh-57px)] overflow-y-auto bg-slate-50 border-l border-slate-200 px-3 py-3 space-y-3 z-20" style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}>

        {isAdmin ? (
          <>
        {/* ═══ ADMIN PANEL ═══ */}

        {/* Riepilogo oggi */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Riepilogo oggi</span>
            <span className="text-[9px] text-slate-400">{new Date().toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}</span>
          </div>
          <div className="grid grid-cols-4 gap-0 px-3.5 pb-3">
            <div className="text-center">
              <div className="text-[18px] font-extrabold text-slate-900">{desktopPanelData.todayTotal}</div>
              <div className="text-[8px] font-semibold uppercase text-slate-400 mt-0.5">Totale</div>
            </div>
            <div className="text-center">
              <div className="text-[18px] font-extrabold text-emerald-500">{desktopPanelData.completed}</div>
              <div className="text-[8px] font-semibold uppercase text-slate-400 mt-0.5">Fatte</div>
            </div>
            <div className="text-center">
              <div className="text-[18px] font-extrabold text-amber-500">{desktopPanelData.inProgress}</div>
              <div className="text-[8px] font-semibold uppercase text-slate-400 mt-0.5">In corso</div>
            </div>
            <div className="text-center">
              <div className="text-[18px] font-extrabold text-slate-900">€{desktopPanelData.totalPrice}</div>
              <div className="text-[8px] font-semibold uppercase text-slate-400 mt-0.5">Totale €</div>
            </div>
          </div>
        </div>

        {/* Da assegnare */}
        {desktopPanelData.unassigned.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Da assegnare</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-500">{desktopPanelData.unassigned.length} urgenti</span>
            </div>
            <div className="divide-y divide-slate-50">
              {desktopPanelData.unassigned.map(s => {
                const prop = propertyMap.get(s.propertyId);
                const pName = prop?.name || s.propertyName || "?";
                const isPanelToday = isSameDay(new Date(s.date), today);
                return (
                  <div key={s.id} className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-red-50/50 transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-slate-900 truncate">{pName}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        {s.cleaning?.guestsCount ? `${s.cleaning.guestsCount} ospiti` : "Ospiti N/D"}
                        {!isPanelToday && ` · ${new Date(s.date).toLocaleDateString("it-IT", { weekday: "short", day: "numeric" })}`}
                      </div>
                    </div>
                    <div className="text-[11px] font-bold text-red-500 flex-shrink-0">{s.scheduledTime || "TBD"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Operatori oggi */}
        {(desktopPanelData.operatorWorkload.length > 0 || desktopPanelData.freeOperators.length > 0) && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Operatori oggi</span>
              {desktopPanelData.freeOperators.length > 0 && (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600">{desktopPanelData.freeOperators.length} liberi</span>
              )}
            </div>
            <div className="px-3.5 pb-3 space-y-2.5">
              {desktopPanelData.operatorWorkload.map(op => {
                const pct = op.total > 0 ? Math.round((op.completed / op.total) * 100) : 0;
                const statusLabel = op.completed === op.total ? "Libero" : op.inProgress > 0 ? "In corso" : "In attesa";
                const barColor = op.completed === op.total ? "#10b981" : op.inProgress > 0 ? "#f59e0b" : "#e2e8f0";
                return (
                  <div key={op.id} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${op.color}, ${op.color}dd)` }}>
                      {op.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-slate-900">{op.name}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">{op.completed} di {op.total} completate · {statusLabel}</div>
                      <div className="w-full h-[3px] rounded-sm mt-1 overflow-hidden bg-slate-100">
                        <div className="h-full rounded-sm transition-all" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {desktopPanelData.freeOperators.map((op: Operator) => (
                <div key={op.id} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span className="text-[10px] font-semibold text-emerald-600">{op.name} disponibile</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prossimi servizi */}
        {desktopPanelData.upcoming.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-3.5 pt-3 pb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prossimi servizi</span>
            </div>
            <div className="px-3.5 pb-3 space-y-0">
              {desktopPanelData.upcoming.map((s, i) => {
                const prop = propertyMap.get(s.propertyId);
                const pName = prop?.name || s.propertyName || "?";
                const isPanelToday = isSameDay(new Date(s.date), today);
                const hasOp = s.cleaning?.operator || (s.cleaning?.operators && s.cleaning.operators.length > 0);
                const dotColor = !hasOp ? "#ef4444" : s.status === "IN_PROGRESS" ? "#f59e0b" : "#3b82f6";
                return (
                  <div key={s.id} className="flex gap-2.5 py-2 relative">
                    <div className="w-9 flex-shrink-0 text-right">
                      <div className="text-[11px] font-bold text-indigo-500">{s.scheduledTime || "TBD"}</div>
                      {!isPanelToday && <div className="text-[8px] text-slate-400">{new Date(s.date).toLocaleDateString("it-IT", { weekday: "short" })}</div>}
                    </div>
                    <div className="flex flex-col items-center" style={{ width: 8 }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: dotColor, border: "2px solid white", boxShadow: "0 0 0 1px #e2e8f0" }} />
                      {i < desktopPanelData.upcoming.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-0.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-slate-900 truncate">{pName}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        {s.cleaning?.guestsCount ? `${s.cleaning.guestsCount} ospiti` : ""}
                        {!hasOp ? " · Da assegnare" : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Alert */}
        {desktopPanelData.alerts.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Alert</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-600">{desktopPanelData.alerts.length}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {desktopPanelData.alerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3.5 py-2.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    alert.type === "danger" ? "bg-red-50" : alert.type === "warning" ? "bg-amber-50" : "bg-indigo-50"
                  }`}>
                    {alert.type === "danger" ? (
                      <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2"/><path strokeWidth="2" d="M12 8v4M12 16h.01"/></svg>
                    ) : alert.type === "warning" ? (
                      <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" strokeLinecap="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    ) : (
                      <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" strokeLinecap="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold text-slate-900">{alert.title}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">{alert.subtitle}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        ) : (
          <>
        {/* ═══ PROPRIETARIO PANEL ═══ */}

        {/* Spesa mese + Oggi */}
        {(() => {
          const stats = ownerPayments.stats;
          const totale = stats ? Math.round(stats.totaleCalcolato) : 0;
          const pulizie = stats ? Math.round(stats.cleaningsTotal) : 0;
          const ordini = stats ? Math.round(stats.ordersTotal + stats.kitCortesiaTotal + stats.serviziExtraTotal) : 0;
          const pctPul = totale > 0 ? Math.round((pulizie / totale) * 100) : 0;
          return (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: "1px solid rgba(0,0,0,0.03)" }}>
          <div className="flex">
            <div className="flex-1 p-3.5" style={{ borderRight: "1px solid #f1f5f9" }}>
              <div className="text-[11px] text-slate-400 font-medium">Spesa mese</div>
              <div className="text-[22px] font-extrabold text-slate-900" style={{ letterSpacing: -0.5, lineHeight: 1, marginTop: 4 }}>€{totale}</div>
              <div className="w-full h-[5px] rounded-sm mt-2 overflow-hidden" style={{ background: "#f1f5f9" }}>
                <div className="h-full rounded-sm" style={{ width: `${pctPul}%`, background: "#6366f1" }} />
              </div>
              <div className="text-[9px] text-slate-400 mt-1.5">€{pulizie} pul · €{ordini} ordini</div>
            </div>
            <div className="flex-1 p-3.5">
              <div className="text-[11px] text-slate-400 font-medium">Oggi</div>
              <div className="text-[22px] font-extrabold text-slate-900" style={{ letterSpacing: -0.5, lineHeight: 1, marginTop: 4 }}>€{desktopPanelData.totalPrice}</div>
              <div className="flex gap-3 mt-2">
                <div><div className="text-[14px] font-extrabold text-slate-900">{desktopPanelData.todayTotal}</div><div className="text-[9px] text-slate-400">servizi</div></div>
                <div><div className="text-[14px] font-extrabold text-emerald-500">{desktopPanelData.completed}</div><div className="text-[9px] text-slate-400">{desktopPanelData.completed === 1 ? "fatta" : "fatte"}</div></div>
              </div>
            </div>
          </div>
        </div>
          );
        })()}

        {/* Pagamento scaduto */}
        {ownerDebts.totalDebt > 0 && ownerDebts.countScaduti > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "#fef2f2" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold" style={{ color: "#991b1b" }}>Pagamento scaduto</div>
                <div className="text-[10px]" style={{ color: "#b91c1c" }}>€{ownerDebts.totalDebt % 1 === 0 ? Math.round(ownerDebts.totalDebt) : ownerDebts.totalDebt.toFixed(2).replace(".", ",")} · {ownerDebts.countScaduti} {ownerDebts.countScaduti === 1 ? "mese scaduto" : "mesi scaduti"}</div>
              </div>
              <div className="text-[16px] font-extrabold text-red-500 flex-shrink-0">€{Math.round(ownerDebts.totalDebt)}</div>
            </div>
          </div>
        )}

        {/* Pagamento in scadenza (warning, non ancora scaduto) */}
        {ownerDebts.totalDebt > 0 && ownerDebts.countScaduti === 0 && ownerDebts.countWarning > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fffbeb", border: "1px solid #fef3c7", padding: "10px 14px" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "#fef3c7" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold" style={{ color: "#92400e" }}>Pagamento in scadenza</div>
                <div className="text-[10px]" style={{ color: "#a16207" }}>€{ownerDebts.totalDebt % 1 === 0 ? Math.round(ownerDebts.totalDebt) : ownerDebts.totalDebt.toFixed(2).replace(".", ",")} da pagare</div>
              </div>
              <div className="text-[16px] font-extrabold flex-shrink-0" style={{ color: "#d97706" }}>€{Math.round(ownerDebts.totalDebt)}</div>
            </div>
          </div>
        )}

        {/* N. ospiti da inserire */}
        {desktopPanelData.guestsToConfirm.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: "1px solid rgba(0,0,0,0.03)" }}>
            <div className="p-3.5 pb-2 flex items-center justify-between">
              <div>
                <div className="text-[14px] font-bold text-slate-900">N. ospiti da inserire</div>
                <div className="text-[11px] text-slate-400 font-medium mt-0.5">Conferma prima della pulizia</div>
              </div>
              <span className="w-[22px] h-[22px] rounded-full bg-violet-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">{desktopPanelData.guestsToConfirm.length}</span>
            </div>
            <div className="px-3.5 pb-3.5">
              {desktopPanelData.guestsToConfirm.map((s, gIdx) => {
                const prop = propertyMap.get(s.propertyId);
                const pName = prop?.name || s.propertyName || "?";
                const isPanelToday = isSameDay(new Date(s.date), today);
                const dayLabel = isPanelToday ? "Oggi" : new Date(s.date).toLocaleDateString("it-IT", { weekday: "short", day: "numeric" });
                return (
                  <div key={s.id} className="flex items-center gap-3" style={{ padding: "10px 0", borderTop: gIdx > 0 ? "1px solid #f1f5f9" : "none" }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-slate-800">{pName}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{dayLabel} {s.scheduledTime || ""} · {s.cleaning?.guestsCount || "?"} dalla prenotazione</div>
                    </div>
                    <button
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer flex-shrink-0 transition-colors"
                      style={{ background: "#6366f1", color: "#fff", border: "none" }}
                      onClick={() => { if (s.cleaning) openGuestModal(s.cleaning); }}
                    >Inserisci</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Prossime pulizie */}
        {desktopPanelData.upcoming.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: "1px solid rgba(0,0,0,0.03)" }}>
            <div className="p-3.5 pb-2">
              <div className="text-[14px] font-bold text-slate-900">Prossime pulizie</div>
            </div>
            <div className="px-3.5 pb-3">
              {desktopPanelData.upcoming.map((s, i) => {
                const prop = propertyMap.get(s.propertyId);
                const pName = prop?.name || s.propertyName || "?";
                const isPanelToday = isSameDay(new Date(s.date), today);
                const hasOp = s.cleaning?.operator || (s.cleaning?.operators && s.cleaning.operators.length > 0);
                const statusColor = (s.status === "COMPLETED" || s.status === "DELIVERED") ? "#10b981" : !hasOp ? "#f59e0b" : "#3b82f6";
                const statusLabel = (s.status === "COMPLETED" || s.status === "DELIVERED") ? "Completata" : !hasOp ? "In attesa operatore" : (s.status === "IN_PROGRESS" ? "In corso" : "Programmata");
                return (
                  <div key={s.id} className="flex items-center gap-2.5 py-2.5" style={{ borderTop: i > 0 ? "1px solid #f8fafc" : "none" }}>
                    <div className="w-[38px] flex-shrink-0 text-center">
                      <div className="text-[12px] font-bold text-indigo-500">{s.scheduledTime || "TBD"}</div>
                      {!isPanelToday && <div className="text-[9px] text-slate-400">{new Date(s.date).toLocaleDateString("it-IT", { weekday: "short" })}</div>}
                    </div>
                    <div style={{ width: 3, alignSelf: "stretch", background: statusColor, borderRadius: 2 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-slate-900">{pName}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{statusLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
          </>
        )}

      </div>

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
              {/* Background image - hidden on desktop where it looks blurry */}
              <div className="absolute inset-0 xl:hidden" style={{ backgroundImage: "url('data:image/jpeg;base64,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')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.70 }} />
              {/* Gradient overlay */}
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(11,11,24,0.35) 0%, rgba(11,11,24,0.75) 100%)" }} />
              {/* HD Desktop photo - visible only on xl+ */}
              <div className="absolute inset-0 hidden xl:block" style={{ backgroundImage: "url('data:image/jpeg;base64,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')", backgroundSize: "cover", backgroundPosition: "center 30%", opacity: 0.45 }} />
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
        <div>
          
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
