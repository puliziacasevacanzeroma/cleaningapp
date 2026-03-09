"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============ HELPER FUNCTIONS ============
const getInitials = (name: string | null | undefined): string => {
  if (!name) return "??";
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
};

// Status config con CSS gradients
const getStatusConfig = (status: string, hasOperator: boolean, isAdmin: boolean = true) => {
  const upperStatus = status?.toUpperCase() || "";
  
  // 🔥 FIX: Gestione stato CANCELLED
  if (upperStatus === "CANCELLED") {
    return {
      label: "Annullata",
      icon: "✗",
      cssGradient: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
      shadowColor: "rgba(239,68,68,0.4)"
    };
  }
  
  if (upperStatus === "COMPLETED") {
    return {
      label: "Completata",
      icon: "✓",
      cssGradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
      shadowColor: "rgba(16,185,129,0.4)"
    };
  }
  if (upperStatus === "IN_PROGRESS") {
    return {
      label: "In corso",
      icon: "●",
      cssGradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
      shadowColor: "rgba(245,158,11,0.4)"
    };
  }
  // 🔥 FIX: Aggiungo ASSIGNED - quando ha operatore ma non è ancora iniziata
  if (upperStatus === "ASSIGNED") {
    return {
      label: "Assegnata",
      icon: "○",
      cssGradient: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
      shadowColor: "rgba(139,92,246,0.4)"
    };
  }
  if (upperStatus === "SCHEDULED") {
    if (isAdmin && !hasOperator) {
      return {
        label: "Da assegnare",
        icon: "!",
        cssGradient: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
        shadowColor: "rgba(244,63,94,0.4)"
      };
    }
    return {
      label: "Programmata",
      icon: "○",
      cssGradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
      shadowColor: "rgba(59,130,246,0.4)"
    };
  }
  return {
    label: status || "Sconosciuto",
    icon: "?",
    cssGradient: "linear-gradient(135deg, #64748b 0%, #475569 100%)",
    shadowColor: "rgba(100,116,139,0.4)"
  };
};

// ============ TYPES ============
interface Operator {
  id: string;
  name: string | null;
}

interface Property {
  id?: string;
  name?: string;
  address?: string;
  photos?: string[];
  imageUrl?: string;
}

interface Cleaning {
  id: string;
  propertyId?: string;
  propertyName?: string;
  status: string;
  scheduledTime?: string | null;
  guestsCount?: number | null;
  guestsConfirmed?: boolean;
  date?: any; // Firestore timestamp or Date
  operator?: Operator | null;
  operators?: Operator[];
  serviceType?: string;
  bookingSource?: string;
  linenConfigModified?: boolean;
  priceModified?: boolean;
  // 🔥 FIX CRITICO: Flag per nascondere biancheria
  hasLinenOrder?: boolean;
}

interface LinenItem {
  name: string;
  quantity: number;
  price?: number;
}

interface CleaningCardAdminProps {
  cleaning: Cleaning;
  property?: Property | null;
  operators: Operator[];
  totalPrice: number;
  cleaningPrice?: number;
  dotazioniPrice?: number;
  bedItems?: LinenItem[];
  bathItems?: LinenItem[];
  isAdmin?: boolean;
  onAssignOperator: (cleaningId: string, operatorId: string) => void;
  onRemoveOperator: (cleaningId: string) => void;
  onChangeTime: (cleaningId: string, time: string) => void;
  onChangeGuests?: (cleaningId: string) => void;
  onOpenDetail: (cleaning: Cleaning) => void;
  onOpenOperatorModal?: (cleaning: Cleaning) => void;
  savingAssignment?: boolean;
}

// ============ COMPONENT ============
export default function CleaningCardAdmin({
  cleaning,
  property,
  operators,
  totalPrice,
  cleaningPrice = 0,
  dotazioniPrice = 0,
  bedItems = [],
  bathItems = [],
  isAdmin = true,
  onAssignOperator,
  onRemoveOperator,
  onChangeTime,
  onChangeGuests,
  onOpenDetail,
  onOpenOperatorModal,
  savingAssignment = false,
}: CleaningCardAdminProps) {
  
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Get operator list
  const opList = cleaning.operators && cleaning.operators.length > 0 
    ? cleaning.operators 
    : (cleaning.operator ? [cleaning.operator] : []);
  
  const hasOperator = opList.length > 0;
  const status = getStatusConfig(cleaning.status, hasOperator, isAdmin);
  
  // Get image URL
  const imageUrl = property?.imageUrl || property?.photos?.[0] || null;

  // 🟢🟠🔴 Stato pulsante ospiti per proprietario
  const getGuestButtonStatus = () => {
    if (cleaning.guestsConfirmed) return 'confirmed'; // Verde
    // Calcola ore mancanti alla pulizia
    try {
      const cleaningDate = cleaning.date?.toDate ? cleaning.date.toDate() : new Date(cleaning.date);
      const now = new Date();
      const hoursLeft = (cleaningDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursLeft <= 0) return 'expired'; // Rosso — scaduto
      if (hoursLeft <= 24) return 'urgent'; // Rosso — meno di 24h
      if (hoursLeft <= 72) return 'warning'; // Ambra — meno di 3 giorni
      return 'pending'; // Ambra leggero — c'è tempo
    } catch {
      return 'pending';
    }
  };
  
  const guestStatus = getGuestButtonStatus();

  return (
    <div 
      className="bg-white rounded-3xl"
      style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.04)' }}
    >
      <div className="flex h-32">
        {/* ========== FOTO GRANDE con overlay ========== */}
        <div className="relative w-32 h-32 flex-shrink-0 overflow-hidden rounded-l-3xl">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={property?.name || ''} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div 
              className="w-full h-full flex items-center justify-center"
              style={{ background: status.cssGradient }}
            >
              <svg className="w-12 h-12 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
            </div>
          )}
          {/* Overlay sfumato */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
          
          {/* Badge Stato Premium */}
          <div className="absolute top-2.5 left-2.5">
            <span 
              className="px-2.5 py-1 text-[10px] font-bold text-white rounded-lg flex items-center gap-1"
              style={{ 
                background: status.cssGradient,
                boxShadow: `0 2px 8px ${status.shadowColor}`
              }}
            >
              {status.icon === '✓' && (
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {status.icon === '!' && (
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
              )}
              {status.icon === '●' && (
                <svg className="w-2.5 h-2.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {status.icon === '○' && (
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
              {status.label}
            </span>
          </div>
          
          {/* Prezzo sulla foto */}
          <div className="absolute bottom-2 right-2">
            <span className="text-2xl font-black text-white drop-shadow-lg">€{totalPrice.toFixed(0)}</span>
          </div>
        </div>
        
        {/* ========== CONTENUTO ========== */}
        <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0">
          {/* Header */}
          <div className="cursor-pointer" onClick={() => onOpenDetail(cleaning)}>
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0">
                <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <h3 className="font-semibold text-[13px] text-gray-900 truncate leading-tight">
                {property?.name || cleaning.propertyName}
              </h3>
              {cleaning.serviceType === "APPROFONDITA" && (
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded-md uppercase">
                  Approfondita
                </span>
              )}
              {cleaning.serviceType === "SGROSSO" && (
                <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-bold rounded-md uppercase">
                  Sgrosso
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{property?.address}</p>
          </div>
          
          {/* Controlli */}
          <div className="flex items-center gap-2 mt-2">
            {/* ORARIO - Click apre modal esterna SOLO per admin */}
            {isAdmin ? (
              <button 
                onClick={(e) => { e.stopPropagation(); onChangeTime(cleaning.id, cleaning.scheduledTime || "10:00"); }}
                className="h-7 px-2.5 rounded-xl flex items-center gap-1.5 transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' }}
              >
                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[11px] font-semibold text-gray-700">{cleaning.scheduledTime || "10:00"}</span>
              </button>
            ) : (
              <div 
                className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' }}
              >
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[11px] font-semibold text-gray-500">{cleaning.scheduledTime || "TBD"}</span>
              </div>
            )}
            
            {/* OSPITI - Colore in base allo stato conferma */}
            {(() => {
              const guestStyles = {
                confirmed: {
                  bg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  border: '1.5px solid #6ee7b7',
                  shadow: '0 2px 8px rgba(16,185,129,0.15)',
                  iconColor: '#059669',
                  textColor: '#047857',
                },
                pending: {
                  bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                  border: '1.5px solid #fcd34d',
                  shadow: '0 2px 8px rgba(245,158,11,0.15)',
                  iconColor: '#d97706',
                  textColor: '#b45309',
                },
                warning: {
                  bg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                  border: '1.5px solid #fb923c',
                  shadow: '0 2px 10px rgba(249,115,22,0.2)',
                  iconColor: '#ea580c',
                  textColor: '#c2410c',
                },
                urgent: {
                  bg: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
                  border: '1.5px solid #f87171',
                  shadow: '0 2px 12px rgba(239,68,68,0.25)',
                  iconColor: '#dc2626',
                  textColor: '#b91c1c',
                },
                expired: {
                  bg: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
                  border: '1.5px solid #ef4444',
                  shadow: '0 2px 12px rgba(239,68,68,0.3)',
                  iconColor: '#dc2626',
                  textColor: '#991b1b',
                },
              };
              const s = guestStyles[guestStatus];
              const needsAttention = guestStatus !== 'confirmed';
              const isPulse = guestStatus === 'urgent' || guestStatus === 'expired';
              
              return (
                <button 
                  onClick={(e) => { e.stopPropagation(); onChangeGuests?.(cleaning.id); }}
                  className={`h-7 px-2.5 rounded-xl flex items-center gap-1.5 transition-all hover:scale-105 ${isPulse ? 'animate-pulse' : ''}`}
                  style={{ background: s.bg, border: s.border, boxShadow: s.shadow }}
                >
                  {guestStatus === 'confirmed' ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: s.iconColor }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: s.iconColor }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                  <span className="text-[11px] font-semibold" style={{ color: s.textColor }}>{cleaning.guestsCount || 2}</span>
                  {needsAttention && !isAdmin && (
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20" style={{ color: s.iconColor }}>
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })()}
          </div>
          
          {/* Operatori */}
          <div className="flex items-center justify-between mt-2">
            <div onClick={(e) => e.stopPropagation()}>
              {isAdmin ? (
                /* Admin: pulsanti cliccabili per assegnare/modificare operatore */
                opList.length === 0 ? (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onOpenOperatorModal?.(cleaning); }}
                    className="h-7 px-3 rounded-xl flex items-center gap-1.5 transition-all hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', boxShadow: '0 4px 12px rgba(15,23,42,0.3)' }}
                  >
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <span className="text-[10px] font-bold text-white">Assegna</span>
                  </button>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onOpenOperatorModal?.(cleaning); }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)', boxShadow: '0 2px 8px rgba(168,85,247,0.15)' }}
                  >
                    {opList.slice(0, 2).map((op, idx) => {
                      if (!op) return null;
                      const colors = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b'];
                      const colorsDark = ['#9333ea', '#2563eb', '#059669', '#d97706'];
                      return (
                        <div key={op.id || idx} className="flex items-center gap-1">
                          <div 
                            className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ background: `linear-gradient(135deg, ${colors[idx % 4]} 0%, ${colorsDark[idx % 4]} 100%)` }}
                          >
                            <span className="text-[8px] font-bold text-white">{getInitials(op.name)}</span>
                          </div>
                          <span className="text-[11px] font-semibold text-purple-700">{op.name || 'Operatore'}</span>
                        </div>
                      );
                    })}
                    {opList.length > 2 && <span className="text-[10px] font-semibold text-purple-500">+{opList.length - 2}</span>}
                  </button>
                )
              ) : (
                /* Non-admin (proprietario): solo visualizzazione read-only */
                opList.length === 0 ? (
                  <div 
                    className="h-7 px-3 rounded-xl flex items-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' }}
                  >
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-[10px] font-medium text-gray-400">Da assegnare</span>
                  </div>
                ) : (
                  <div 
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl"
                    style={{ background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)' }}
                  >
                    {opList.slice(0, 2).map((op, idx) => {
                      if (!op) return null;
                      const colors = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b'];
                      const colorsDark = ['#9333ea', '#2563eb', '#059669', '#d97706'];
                      return (
                        <div key={op.id || idx} className="flex items-center gap-1">
                          <div 
                            className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ background: `linear-gradient(135deg, ${colors[idx % 4]} 0%, ${colorsDark[idx % 4]} 100%)` }}
                          >
                            <span className="text-[8px] font-bold text-white">{getInitials(op.name)}</span>
                          </div>
                          <span className="text-[11px] font-semibold text-purple-700">{op.name || 'Operatore'}</span>
                        </div>
                      );
                    })}
                    {opList.length > 2 && <span className="text-[10px] font-semibold text-purple-500">+{opList.length - 2}</span>}
                  </div>
                )
              )}
            </div>
            
            {/* Espandi */}
            <button 
              onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110"
              style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
              <svg 
                className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
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
      
      {/* ========== DETTAGLI ESPANDIBILI ========== */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            onClick={(e) => e.stopPropagation()}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-gray-100">
              
              {/* Badge Fonte e Modifiche */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {cleaning.bookingSource && cleaning.bookingSource !== '' && cleaning.bookingSource !== 'manual' ? (
                  <div className="h-7 px-2.5 rounded-xl flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' }}>
                    <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[11px] font-semibold text-blue-600">iCal</span>
                  </div>
                ) : (
                  <div className="h-7 px-2.5 rounded-xl flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' }}>
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span className="text-[11px] font-semibold text-slate-500">Manuale</span>
                  </div>
                )}
                
                {cleaning.linenConfigModified && (
                  <div className="h-7 px-2.5 rounded-xl flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' }}>
                    <span className="text-sm">🛏️</span>
                    <span className="text-[11px] font-semibold text-amber-700">Biancheria personalizzata</span>
                  </div>
                )}
                
                {cleaning.priceModified && (
                  <div className="h-7 px-2.5 rounded-xl flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)' }}>
                    <span className="text-sm">💰</span>
                    <span className="text-[11px] font-semibold text-purple-700">Prezzo modificato</span>
                  </div>
                )}
              </div>
              
              {/* Riga Pulizia / Dotazioni */}
              <div className="flex items-center justify-between mb-4 py-2 px-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">Pulizia:</span>
                  <span className="text-xs font-bold text-gray-800">€{cleaningPrice.toFixed(2)}</span>
                </div>
                {dotazioniPrice > 0 ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">Dotazioni:</span>
                    <span className="text-xs font-bold text-gray-800">€{dotazioniPrice.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 italic">Senza biancheria</span>
                  </div>
                )}
              </div>

              {/* Biancheria Letto */}
              {bedItems.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-gray-700">Biancheria Letto</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bedItems.map((item, idx) => (
                      <span key={idx} className="px-2 py-1 bg-slate-50 rounded-lg text-[10px] text-gray-600 border border-slate-200">
                        {item.name}: <span className="font-bold">{item.quantity}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Biancheria Bagno */}
              {bathItems.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 6v12a2 2 0 002 2h12a2 2 0 002-2V6M4 6l2-2h12l2 2M9 10h6" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-gray-700">Biancheria Bagno</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bathItems.map((item, idx) => (
                      <span key={idx} className="px-2 py-1 bg-blue-50 rounded-lg text-[10px] text-blue-600 border border-blue-100">
                        {item.name}: <span className="font-bold">{item.quantity}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Messaggio se non ci sono dati */}
              {bedItems.length === 0 && bathItems.length === 0 && (
                <div className="mb-3 p-3 rounded-xl flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' }}>
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-semibold text-slate-500">Solo Pulizia — Nessun ordine biancheria</span>
                </div>
              )}

              {/* Pulsante Modifica */}
              <button 
                onClick={(e) => { e.stopPropagation(); onOpenDetail(cleaning); }}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', boxShadow: '0 4px 12px rgba(15,23,42,0.25)' }}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span className="text-sm font-semibold text-white">Modifica Servizio</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
