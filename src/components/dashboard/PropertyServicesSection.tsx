"use client";

/**
 * 🔧 PropertyServicesSection
 * 
 * Componente per mostrare la lista servizi di una proprietà.
 * Usa la stessa logica di PulizieView per calcolare i prezzi (calculateDotazioni).
 * 
 * PROBLEMA RISOLTO:
 * - Prima usava variabili globali (bathItems, kitItems, linen, beds) che causavano re-render multipli
 * - Ora usa calculateDotazioni centralizzato che funziona correttamente
 */

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { calculateDotazioni } from "~/lib/calculateDotazioni";

// ==================== INTERFACES ====================
interface BedConfig {
  id: string;
  type: string;
  name: string;
  location?: string;
  loc?: string;
  capacity: number;
  cap?: number;
}

interface Property {
  id: string;
  name: string;
  address?: string;
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

interface InventoryItem {
  id: string;
  key?: string;
  name: string;
  sellPrice: number;
  category: string;
}

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName?: string;
  date: Date;
  scheduledDate?: Date;
  status: string;
  scheduledTime?: string;
  operator?: { name?: string } | null;
  operatorName?: string;
  guestsCount?: number;
  notes?: string;
  price?: number;
  contractPrice?: number;
  customLinenConfig?: any;
  linenConfigModified?: boolean;
  hasLinenOrder?: boolean;
  serviceType?: string;
  serviceTypeName?: string;
  priceModified?: boolean;
  priceChangeReason?: string;
  sgrossoReason?: string;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  extraServices?: { name: string; price: number }[];
}

interface PropertyServicesSectionProps {
  propertyId: string;
  property: Property;
  onEditService?: (cleaning: Cleaning) => void;
  isAdmin?: boolean;
}

// ==================== ICONS ====================
const Icons = {
  bed: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>,
  towel: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2v6a2 2 0 0 0 2 2h6"/><path d="M4 7V4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8"/><path d="M7 12h10"/><path d="M7 16h7"/></svg>,
  users: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  pencil: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>,
  down: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  clock: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  check: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  calendar: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>,
};

// ==================== UTILITY ====================
const formatPrice = (price: number): string => {
  if (Number.isInteger(price)) return price.toString();
  return price.toFixed(2);
};

const getStatusConfig = (status: string, hasOperator: boolean) => {
  switch (status) {
    case 'COMPLETED':
      return { label: 'Completata', color: 'bg-emerald-100 text-emerald-700', icon: '✓' };
    case 'IN_PROGRESS':
      return { label: 'In corso', color: 'bg-blue-100 text-blue-700', icon: '●' };
    case 'SCHEDULED':
    default:
      return { label: 'Programmata', color: 'bg-amber-100 text-amber-700', icon: '○' };
  }
};

// ==================== MAIN COMPONENT ====================
export default function PropertyServicesSection({
  propertyId,
  property,
  onEditService,
  isAdmin = false
}: PropertyServicesSectionProps) {
  
  // Stati
  const [services, setServices] = useState<Cleaning[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // ==================== LOAD INVENTORY ====================
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        key: doc.data().key || doc.id,
        name: doc.data().name || "",
        sellPrice: doc.data().sellPrice || 0,
        category: doc.data().categoryId || doc.data().category || ""
      }));
      setInventory(items);
      console.log("✅ PropertyServicesSection: Inventario caricato:", items.length, "articoli");
    });
    return () => unsubscribe();
  }, []);

  // ==================== LOAD SERVICES (CLEANINGS) ====================
  useEffect(() => {
    if (!propertyId) return;

    console.log("🔵 PropertyServicesSection: Avvio listener per propertyId:", propertyId);

    const q = query(
      collection(db, "cleanings"),
      where("propertyId", "==", propertyId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("🔵 PropertyServicesSection: Ricevute", snapshot.docs.length, "pulizie");

      const loadedServices: Cleaning[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        
        let cleaningDate: Date;
        if (data.scheduledDate?.toDate) {
          cleaningDate = data.scheduledDate.toDate();
        } else if (data.scheduledDate?._seconds) {
          cleaningDate = new Date(data.scheduledDate._seconds * 1000);
        } else if (data.date) {
          cleaningDate = new Date(data.date);
        } else {
          cleaningDate = new Date();
        }

        return {
          id: doc.id,
          propertyId: propertyId,
          propertyName: property.name,
          date: cleaningDate,
          scheduledDate: cleaningDate,
          status: data.status || 'SCHEDULED',
          scheduledTime: data.scheduledTime || data.time || "10:00",
          operator: data.operator || null,
          operatorName: data.operatorName || data.operator?.name || "Non assegnato",
          guestsCount: data.guestsCount || data.booking?.guestsCount || property.maxGuests || 2,
          notes: data.notes || "",
          price: data.price || data.manualPrice,
          contractPrice: data.contractPrice || data.price || property.cleaningPrice,
          customLinenConfig: data.customLinenConfig || null,
          linenConfigModified: data.linenConfigModified || false,
          hasLinenOrder: data.hasLinenOrder,
          serviceType: data.serviceType || "STANDARD",
          serviceTypeName: data.serviceTypeName || "Pulizia Standard",
          priceModified: data.priceModified || false,
          priceChangeReason: data.priceChangeReason || "",
          sgrossoReason: data.sgrossoReason || "",
          sgrossoReasonLabel: data.sgrossoReasonLabel || "",
          sgrossoNotes: data.sgrossoNotes || "",
          extraServices: data.extraServices || [],
        };
      });

      // Ordina per data
      loadedServices.sort((a, b) => a.date.getTime() - b.date.getTime());
      
      setServices(loadedServices);
      setLoading(false);
    }, (error) => {
      console.error("❌ PropertyServicesSection: Errore listener:", error);
      setLoading(false);
    });

    return () => {
      console.log("🔵 PropertyServicesSection: Rimuovo listener");
      unsubscribe();
    };
  }, [propertyId, property.name, property.maxGuests, property.cleaningPrice]);

  // ==================== RENDER ====================
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-200 rounded-xl"></div>
              <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                <div className="h-3 bg-slate-200 rounded w-32"></div>
              </div>
              <div className="h-6 bg-slate-200 rounded w-16"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
          <div className="w-8 h-8 text-slate-400">{Icons.calendar}</div>
        </div>
        <p className="text-slate-500 font-medium">Nessun servizio programmato</p>
        <p className="text-slate-400 text-sm mt-1">I servizi appariranno qui quando saranno creati</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {services.map((service) => {
        // 🔥 USA calculateDotazioni - stessa logica di PulizieView
        const { cleaningPrice, dotazioniPrice, totalPrice, bedItems, bathItems } = calculateDotazioni(
          service,
          property,
          inventory
        );

        const isExpanded = expandedCardId === service.id;
        const statusConfig = getStatusConfig(service.status, !!service.operator);
        const isPast = service.date < new Date(new Date().setHours(0, 0, 0, 0));
        const isToday = service.date.toDateString() === new Date().toDateString();

        return (
          <div 
            key={service.id} 
            className={`bg-white rounded-xl border overflow-hidden transition-all hover:shadow-lg hover:border-sky-200 ${
              isPast ? 'opacity-60' : ''
            } ${isToday ? 'border-amber-300 shadow-amber-100' : 'border-slate-200'}`}
          >
            {/* Header Card */}
            <div className="flex items-center gap-3 p-3">
              {/* Data */}
              <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center text-white flex-shrink-0 ${
                isPast ? 'bg-slate-400' : isToday ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-gradient-to-br from-sky-500 to-sky-600'
              }`}>
                <span className="text-lg font-bold leading-none">{service.date.getDate()}</span>
                <span className="text-[9px] uppercase">{service.date.toLocaleDateString('it-IT', { month: 'short' })}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate capitalize">
                  {service.date.toLocaleDateString('it-IT', { weekday: 'long' })}
                </p>
                <p className="text-slate-500 text-[11px]">
                  {service.scheduledTime} • {service.operatorName || 'Non assegnato'}
                </p>
              </div>

              {/* Ospiti */}
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded-lg">
                <div className="w-3.5 h-3.5 text-blue-500">{Icons.users}</div>
                <span className="text-sm font-semibold text-blue-700">{service.guestsCount}</span>
              </div>

              {/* Prezzo */}
              <div className="text-right flex-shrink-0">
                <p className="text-base font-bold">€{formatPrice(totalPrice)}</p>
              </div>

              {/* Freccia espandi */}
              <button 
                onClick={() => setExpandedCardId(isExpanded ? null : service.id)}
                className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all flex-shrink-0"
              >
                <div className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                  {Icons.down}
                </div>
              </button>
            </div>

            {/* Contenuto espandibile */}
            {isExpanded && (
              <div className="border-t border-slate-100">
                {/* Dettagli prezzo */}
                <div className="px-3 py-2 bg-slate-50 flex justify-between text-xs">
                  <span className="text-slate-500">
                    Pulizia: <span className="font-medium text-slate-700">€{formatPrice(cleaningPrice)}</span>
                  </span>
                  <span className="text-slate-500">
                    Dotazioni: <span className="font-medium text-slate-700">€{formatPrice(dotazioniPrice)}</span>
                  </span>
                </div>

                {/* Biancheria Letto */}
                {bedItems.length > 0 && (
                  <div className="p-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                        <div className="w-3.5 h-3.5 text-blue-600">{Icons.bed}</div>
                      </div>
                      <span className="text-xs font-semibold text-slate-700">Biancheria Letto</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {bedItems.map((item, idx) => (
                        <span key={idx} className="px-2 py-1 bg-blue-50 rounded-lg text-[10px] text-blue-700">
                          {item.name}: <span className="font-semibold">{item.quantity}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Biancheria Bagno */}
                {bathItems.length > 0 && (
                  <div className="p-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center">
                        <div className="w-3.5 h-3.5 text-purple-600">{Icons.towel}</div>
                      </div>
                      <span className="text-xs font-semibold text-slate-700">Biancheria Bagno</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {bathItems.map((item, idx) => (
                        <span key={idx} className="px-2 py-1 bg-purple-50 rounded-lg text-[10px] text-purple-700">
                          {item.name}: <span className="font-semibold">{item.quantity}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nessuna biancheria */}
                {bedItems.length === 0 && bathItems.length === 0 && (
                  <div className="p-3 border-t border-slate-100">
                    <p className="text-[11px] text-slate-400 italic text-center">
                      {service.hasLinenOrder === false 
                        ? "Solo pulizia (senza biancheria)" 
                        : "Nessuna dotazione configurata"}
                    </p>
                  </div>
                )}

                {/* Stato */}
                <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between">
                  <span className={`px-2 py-1 text-[10px] font-medium rounded-full ${statusConfig.color}`}>
                    {statusConfig.icon} {statusConfig.label}
                  </span>
                  {service.serviceTypeName && (
                    <span className="text-[10px] text-slate-500">{service.serviceTypeName}</span>
                  )}
                </div>

                {/* Bottone modifica */}
                <div className="p-3 border-t border-slate-100 bg-slate-50">
                  <button
                    onClick={() => onEditService?.(service)}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-semibold rounded-lg active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    <div className="w-4 h-4">{Icons.pencil}</div>
                    Modifica Dettagli Completi
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
