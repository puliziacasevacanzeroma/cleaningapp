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
  const { cleaningPrice, dotazioniPrice, totalPrice, bedItems, bathItems, kitItems, extraItems } = calculateDotazioni(
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
        kitItems={kitItems || []}
        extraItems={extraItems || []}
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
    prev.cleaning.customLinenConfig === next.cleaning.customLinenConfig &&
    prev.cleaning.linenConfigModified === next.cleaning.linenConfigModified &&
    prev.cleaning.price === next.cleaning.price &&
    prev.cleaning.priceModified === next.cleaning.priceModified &&
    prev.cleaning.notes === next.cleaning.notes &&
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
        return sum + (s.cleaning.price || s.cleaning.contractPrice || prop?.cleaningPrice || 0) + (s.cleaning.holidayFee || 0);
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
        const effectivePrice = (s.cleaning.priceOverride ?? basePrice) + (s.cleaning.holidayFee || 0);
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
      // 🔧 FIX: Biancheria Letto (bl) - MERGE bl['all'] con gruppi letto
      if (config.bl) {
        const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
        
        if (hasAll) {
          // 🔥 FIX: usa 'all' come base + integra articoli mancanti dai gruppi letto
          const mergedBl: Record<string, number> = {};
          // Prima raccogli dai gruppi letto
          Object.entries(config.bl).forEach(([key, val]) => {
            if (key !== 'all' && typeof val === 'object' && val !== null) {
              Object.entries(val as Record<string, number>).forEach(([itemId, qty]) => {
                if (typeof qty === 'number' && qty > 0) mergedBl[itemId] = (mergedBl[itemId] || 0) + qty;
              });
            }
          });
          // Poi sovrascrivi con bl['all']
          Object.entries(config.bl['all'] as Record<string, number>).forEach(([itemId, qty]) => {
            if (typeof qty === 'number' && qty > 0) mergedBl[itemId] = qty;
          });
          
          const bedLinenItems: { name: string; quantity: number }[] = [];
          Object.entries(mergedBl).forEach(([itemId, qty]) => {
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
      {/* 🔧 FIX v2: aggiunto `xl:mx-auto` per centrare le card nell'area utile tra la
          sidebar fissa (pr-[310px]) e il bordo sinistro. Prima erano ancorate a sinistra
          lasciando un grosso vuoto centrale/destro. Larghezza max invariata (4xl = 896px).
          Zero impatto su mobile (breakpoint xl, applica solo da ~1280px in su). */}
      <div className="px-4 py-4 xl:max-w-4xl xl:mx-auto">
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
