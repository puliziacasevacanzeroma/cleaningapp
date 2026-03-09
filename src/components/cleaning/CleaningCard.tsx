"use client";

import { useState } from "react";

// ============ TYPES ============
interface Property {
  id: string;
  name: string;
  address: string;
  ownerId?: string;
  ownerName?: string;
  cleaningPrice?: number;
  maxGuests?: number;
  photos?: string[];
  imageUrl?: string;
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
  items: LinenItem[];
  status: string;
}

interface InventoryItem {
  id: string;
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
  notes?: string;
  price?: number;
  contractPrice?: number;
  serviceType?: string;
  serviceTypeName?: string;
  photos?: string[];
  startedAt?: any;
  completedAt?: any;
  customLinenConfig?: any;
  linenConfigModified?: boolean;
  missedDeadline?: boolean;
  property?: Property;
  booking?: { guestsCount?: number };
}

interface CleaningCardProps {
  cleaning: Cleaning;
  property?: Property;
  operators: Operator[];
  linenOrder?: Order | null;
  inventory?: InventoryItem[];
  onAssignTime: (cleaningId: string, time: string) => Promise<void>;
  onAssignOperator: (cleaningId: string, operatorId: string) => Promise<void>;
  onRemoveOperator: (cleaningId: string) => Promise<void>;
  onOpenEditModal: (cleaning: Cleaning, property: Property | undefined) => void;
  savingAssignment?: boolean;
  assigningTime?: string | null;
  setAssigningTime?: (id: string | null) => void;
  assigningOperator?: string | null;
  setAssigningOperator?: (id: string | null) => void;
}

// ============ CONSTANTS ============
const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", 
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00"
];

// Mapping per calcolo prezzi
const ORDER_ID_TO_INVENTORY_KEYWORDS: Record<string, string[]> = {
  'lenzuola_matrimoniale': ['matrimoniale', 'lenzuolo matr'],
  'lenzuola_singolo': ['singol', 'lenzuola singol'],
  'copripiumino': ['copripiumino', 'piumino'],
  'federa': ['federa'],
  'asciugamano_grande': ['corpo', 'grande', 'doccia', 'telo corpo'],
  'asciugamano_piccolo': ['viso', 'piccolo', 'bidet', 'telo viso'],
  'tappetino_bagno': ['scendi', 'tappetino', 'bagno'],
};

// ============ HELPER FUNCTIONS ============
const findItemPrice = (orderItem: { id: string; name: string }, inventory: InventoryItem[]): number => {
  const byId = inventory.find(i => i.id === orderItem.id);
  if (byId) return byId.sellPrice;
  
  const keywords = ORDER_ID_TO_INVENTORY_KEYWORDS[orderItem.id];
  if (keywords) {
    for (const keyword of keywords) {
      const match = inventory.find(i => i.name.toLowerCase().includes(keyword.toLowerCase()));
      if (match) return match.sellPrice;
    }
  }
  
  if (orderItem.id.includes('lenzuol')) return 1.8;
  if (orderItem.id.includes('asciugamano')) return 1.2;
  if (orderItem.id.includes('tappetino')) return 1.0;
  
  return 0;
};

const getStatusConfig = (status: string, hasOperator: boolean) => {
  switch (status) {
    case "COMPLETED":
      return { 
        gradient: "bg-gradient-to-r from-emerald-500 to-teal-400",
        label: "Completata",
        icon: "✓"
      };
    case "IN_PROGRESS":
      return { 
        gradient: "bg-gradient-to-r from-amber-500 to-orange-400",
        label: "In corso",
        icon: "●"
      };
    case "SCHEDULED":
      if (!hasOperator) {
        return { 
          gradient: "bg-gradient-to-r from-rose-500 to-pink-400",
          label: "Da assegnare",
          icon: "!"
        };
      }
      return { 
        gradient: "bg-gradient-to-r from-blue-500 to-indigo-400",
        label: "Programmata",
        icon: "○"
      };
    default:
      return { 
        gradient: "bg-gradient-to-r from-slate-500 to-slate-400",
        label: status,
        icon: "?"
      };
  }
};

const getInitials = (name: string | null) => {
  if (!name) return "??";
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
};

// ============ COMPONENT - REPLICA ESATTA DI PULIZIEADMINVIEW ============
export function CleaningCard({
  cleaning,
  property: propProperty,
  operators,
  linenOrder,
  inventory = [],
  onAssignTime,
  onAssignOperator,
  onRemoveOperator,
  onOpenEditModal,
  savingAssignment = false,
  assigningTime: externalAssigningTime,
  setAssigningTime: externalSetAssigningTime,
  assigningOperator: externalAssigningOperator,
  setAssigningOperator: externalSetAssigningOperator,
}: CleaningCardProps) {
  const [internalAssigningTime, setInternalAssigningTime] = useState<string | null>(null);
  const [internalAssigningOperator, setInternalAssigningOperator] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const assigningTime = externalAssigningTime !== undefined ? externalAssigningTime : internalAssigningTime;
  const setAssigningTime = externalSetAssigningTime || setInternalAssigningTime;
  const assigningOperator = externalAssigningOperator !== undefined ? externalAssigningOperator : internalAssigningOperator;
  const setAssigningOperator = externalSetAssigningOperator || setInternalAssigningOperator;

  const property = propProperty || cleaning.property;
  const status = getStatusConfig(cleaning.status, !!cleaning.operator);

  // Calcola prezzi
  const cleaningPrice = cleaning.price || property?.cleaningPrice || 0;
  const dotazioniPrice = linenOrder?.items?.reduce((sum, item) => {
    const itemPrice = findItemPrice(item, inventory);
    return sum + (item.quantity * itemPrice);
  }, 0) || 0;
  const totalPrice = cleaningPrice + dotazioniPrice;

  // Foto della proprietà
  const photoUrl = property?.photos?.[0] || property?.imageUrl;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg transition-all">
      <div className="flex">
        {/* FOTO A SINISTRA con badge e prezzo */}
        <div className="w-28 sm:w-36 h-32 flex-shrink-0 relative">
          {photoUrl ? (
            <img 
              src={photoUrl} 
              alt={property?.name} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
              <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          )}
          
          {/* Badge Status sulla foto */}
          <div className={`absolute top-2 left-2 px-2 py-1 rounded-lg text-[10px] font-bold text-white ${status.gradient} flex items-center gap-1`}>
            <span>{status.icon}</span>
            <span>{status.label}</span>
          </div>
          
          {/* Prezzo in basso sulla foto */}
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-lg">
            <span className="text-white font-bold text-sm">€{totalPrice.toFixed(0)}</span>
          </div>
        </div>

        {/* CONTENUTO A DESTRA */}
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          {/* Header: Nome e indirizzo */}
          <div 
            className="cursor-pointer"
            onClick={() => onOpenEditModal(cleaning, property)}
          >
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-800 text-sm truncate">{property?.name || cleaning.propertyName}</h3>
                <p className="text-xs text-slate-500 truncate">{property?.address}</p>
              </div>
            </div>
          </div>

          {/* Info: Orario e Ospiti */}
          <div className="flex items-center gap-2 mt-2">
            {/* Orario */}
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-semibold text-slate-700">{cleaning.scheduledTime || "10:00"}</span>
            </div>

            {/* Ospiti */}
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs font-semibold text-slate-700">{cleaning.guestsCount || cleaning.booking?.guestsCount || 2}</span>
            </div>
          </div>

          {/* Operatore */}
          <div className="mt-2 relative">
            {cleaning.operator ? (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 w-fit">
                <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white">{getInitials(cleaning.operator.name)}</span>
                </div>
                <span className="text-xs font-medium text-white">{cleaning.operator.name}</span>
              </div>
            ) : (
              <>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setAssigningOperator(assigningOperator === cleaning.id ? null : cleaning.id); 
                    setAssigningTime(null); 
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 text-white hover:bg-slate-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-xs font-medium">Assegna</span>
                </button>

                {/* Dropdown Operatori */}
                {assigningOperator === cleaning.id && (
                  <div 
                    className="absolute bottom-full left-0 mb-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 min-w-[180px] max-h-64 overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {operators.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-slate-500">
                        Nessun operatore
                      </div>
                    ) : (
                      operators.map(op => (
                        <button
                          key={op.id}
                          onClick={async () => {
                            setAssigningOperator(null);
                            await onAssignOperator(cleaning.id, op.id);
                          }}
                          disabled={savingAssignment}
                          className="w-full px-3 py-2.5 text-left flex items-center gap-2 hover:bg-violet-50 transition-colors disabled:opacity-50"
                        >
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-white">{getInitials(op.name)}</span>
                          </div>
                          <span className="text-sm font-medium text-slate-700 truncate">{op.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Freccia espansione */}
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="px-3 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Sezione espansa */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-3 bg-slate-50">
          <div className="flex flex-wrap gap-2">
            {/* Modifica orario */}
            <div className="relative">
              <button
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setAssigningTime(assigningTime === cleaning.id ? null : cleaning.id); 
                  setAssigningOperator(null); 
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-medium text-slate-700">Modifica orario</span>
              </button>
              
              {assigningTime === cleaning.id && (
                <div 
                  className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-48 overflow-y-auto w-24"
                  onClick={(e) => e.stopPropagation()}
                >
                  {TIME_SLOTS.map(time => (
                    <button
                      key={time}
                      onClick={async () => {
                        setAssigningTime(null);
                        await onAssignTime(cleaning.id, time);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-violet-50 transition-colors ${cleaning.scheduledTime === time ? "bg-violet-100 text-violet-700 font-semibold" : "text-slate-700"}`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Rimuovi operatore */}
            {cleaning.operator && (
              <button
                onClick={() => onRemoveOperator(cleaning.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-xs font-medium">Rimuovi operatore</span>
              </button>
            )}

            {/* Modifica pulizia */}
            <button
              onClick={() => onOpenEditModal(cleaning, property)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              <span className="text-xs font-medium">Modifica</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export helper functions
export { getStatusConfig, getInitials, findItemPrice, TIME_SLOTS };
export type { Cleaning, Property, Operator, Order, InventoryItem, CleaningCardProps };
