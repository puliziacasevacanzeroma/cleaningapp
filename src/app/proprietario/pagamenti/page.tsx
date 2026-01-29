"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ==================== TYPES ====================

type PaymentMethod = "BONIFICO" | "CONTANTI" | "ALTRO";
type PaymentType = "ACCONTO" | "SALDO";
type ServiceType = "PULIZIA" | "BIANCHERIA" | "KIT_CORTESIA" | "SERVIZI_EXTRA";

interface Payment {
  id: string;
  proprietarioId: string;
  proprietarioName: string;
  month: number;
  year: number;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  note?: string;
  createdAt: Timestamp;
}

interface Property {
  id: string;
  name: string;
  ownerId: string;
  cleaningPrice?: number;
  status: string;
}

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  scheduledDate: Timestamp;
  status: string;
  price?: number;
  priceOverride?: number;
  priceOverrideReason?: string;
  type?: string;
}

interface OrderItem {
  id: string;
  name?: string;
  quantity: number;
  price?: number;
  priceOverride?: number;
}

interface Order {
  id: string;
  propertyId: string;
  propertyName: string;
  status: string;
  createdAt?: Timestamp;
  scheduledDate?: Timestamp;
  deliveredAt?: Timestamp;
  items?: OrderItem[];
  totalPriceOverride?: number;
  priceOverrideReason?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  sellPrice: number;
  categoryName?: string;
}

interface ServiceDetail {
  id: string;
  type: ServiceType;
  date: Date;
  propertyId: string;
  propertyName: string;
  description: string;
  effectivePrice: number;
  hasOverride: boolean;
  items?: { name: string; quantity: number; unitPrice: number; totalPrice: number }[];
}

interface PropertyStats {
  propertyId: string;
  propertyName: string;
  cleaningsCount: number;
  cleaningsTotal: number;
  ordersCount: number;
  ordersTotal: number;
  total: number;
}

// ==================== HELPERS ====================

const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDate(date: Date | Timestamp | any): string {
  if (!date) return "-";
  
  try {
    let d: Date;
    if (date instanceof Date) {
      d = date;
    } else if (date?.toDate) {
      d = date.toDate();
    } else if (typeof date === "number") {
      d = new Date(date);
    } else if (date?.seconds) {
      d = new Date(date.seconds * 1000);
    } else {
      return "-";
    }
    
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch {
    return "-";
  }
}

function getServiceIcon(type: ServiceType): string {
  switch (type) {
    case "PULIZIA": return "🧹";
    case "BIANCHERIA": return "🛏️";
    case "KIT_CORTESIA": return "🧴";
    case "SERVIZI_EXTRA": return "🎁";
    default: return "📦";
  }
}

function getServiceLabel(type: ServiceType): string {
  switch (type) {
    case "PULIZIA": return "Pulizia";
    case "BIANCHERIA": return "Biancheria";
    case "KIT_CORTESIA": return "Kit Cortesia";
    case "SERVIZI_EXTRA": return "Servizi Extra";
    default: return "Altro";
  }
}

function mapCategoryToServiceType(categoryName: string): ServiceType {
  const lower = (categoryName || "").toLowerCase();
  if (lower.includes("kit") || lower.includes("cortesia")) return "KIT_CORTESIA";
  if (lower.includes("extra") || lower.includes("servizi")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}

// ==================== MAIN COMPONENT ====================

export default function PagamentiProprietarioPage() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  // 🔄 Assume mobile su SSR - nessun flash
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth < 768;
  });
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);
  
  // Realtime data
  const [properties, setProperties] = useState<Property[]>([]);
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Screen detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ==================== REALTIME LISTENERS ====================

  // 1. Listener Proprietà
  useEffect(() => {
    if (!user?.id) return;
    
    const q = query(
      collection(db, "properties"),
      where("ownerId", "==", user.id),
      where("status", "==", "ACTIVE")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Property[];
      setProperties(data);
      console.log("🏠 Proprietà aggiornate:", data.length);
    });
    
    return () => unsubscribe();
  }, [user?.id]);

  // 2. Listener Pulizie
  useEffect(() => {
    if (!user?.id || properties.length === 0) {
      setCleanings([]);
      return;
    }
    
    const propertyIds = properties.map(p => p.id);
    
    // Firestore non supporta where in con più di 10 elementi
    // Per semplicità, carichiamo tutte le pulizie e filtriamo client-side
    const unsubscribe = onSnapshot(collection(db, "cleanings"), (snapshot) => {
      const allCleanings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Cleaning[];
      const filtered = allCleanings.filter(c => propertyIds.includes(c.propertyId));
      setCleanings(filtered);
      console.log("🧹 Pulizie aggiornate:", filtered.length);
    });
    
    return () => unsubscribe();
  }, [user?.id, properties]);

  // 3. Listener Ordini
  useEffect(() => {
    if (!user?.id || properties.length === 0) {
      setOrders([]);
      return;
    }
    
    const propertyIds = properties.map(p => p.id);
    
    const unsubscribe = onSnapshot(collection(db, "orders"), (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      const filtered = allOrders.filter(o => propertyIds.includes(o.propertyId));
      setOrders(filtered);
      console.log("📦 Ordini aggiornati:", filtered.length);
    });
    
    return () => unsubscribe();
  }, [user?.id, properties]);

  // 4. Listener Pagamenti - Carica TUTTI i pagamenti del proprietario e filtra client-side
  useEffect(() => {
    if (!user?.id) return;
    
    // Carica tutti i pagamenti del proprietario senza filtri su month/year
    // per evitare la necessità di indici compositi
    const q = query(
      collection(db, "payments"),
      where("proprietarioId", "==", user.id)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Payment[];
      // Filtra client-side per mese/anno
      const filtered = allPayments.filter(p => p.month === selectedMonth && p.year === selectedYear);
      setPayments(filtered);
      console.log("💳 Pagamenti aggiornati:", filtered.length, "di", allPayments.length, "totali");
    });
    
    return () => unsubscribe();
  }, [user?.id, selectedMonth, selectedYear]);

  // 5. Listener Inventario (per i prezzi)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as InventoryItem[];
      setInventory(data);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // 6. Listener Override - Carica tutti e filtra client-side
  useEffect(() => {
    if (!user?.id) return;
    
    const q = query(
      collection(db, "paymentOverrides"),
      where("proprietarioId", "==", user.id)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOverrides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filtra client-side per mese/anno
      const filtered = allOverrides.filter((o: any) => o.month === selectedMonth && o.year === selectedYear);
      setOverrides(filtered);
      console.log("📝 Override aggiornati:", filtered.length);
    });
    
    return () => unsubscribe();
  }, [user?.id, selectedMonth, selectedYear]);

  // ==================== COMPUTED DATA ====================

  const computedStats = useMemo(() => {
    if (properties.length === 0) return null;

    const inventoryById = new Map(inventory.map(i => [i.id, i]));
    const propertiesById = new Map(properties.map(p => [p.id, p]));
    const propertyIds = properties.map(p => p.id);

    // Range date per il mese
    const startOfMonth = new Date(selectedYear, selectedMonth - 1, 1, 0, 0, 0);
    const endOfMonth = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

    const services: ServiceDetail[] = [];
    let cleaningsTotal = 0;
    let cleaningsCount = 0;
    let ordersTotal = 0;
    let ordersCount = 0;
    let kitCortesiaTotal = 0;
    let kitCortesiaCount = 0;
    let serviziExtraTotal = 0;
    let serviziExtraCount = 0;

    // Processa pulizie COMPLETED nel mese
    cleanings.forEach(cleaning => {
      if (cleaning.status !== "COMPLETED") return;
      
      const scheduledDate = cleaning.scheduledDate?.toDate?.();
      if (!scheduledDate) return;
      
      if (scheduledDate >= startOfMonth && scheduledDate <= endOfMonth) {
        const property = propertiesById.get(cleaning.propertyId);
        const originalPrice = cleaning.price || property?.cleaningPrice || 0;
        const effectivePrice = cleaning.priceOverride ?? originalPrice;
        
        cleaningsTotal += effectivePrice;
        cleaningsCount++;
        
        services.push({
          id: cleaning.id,
          type: "PULIZIA",
          date: scheduledDate,
          propertyId: cleaning.propertyId,
          propertyName: cleaning.propertyName || property?.name || "Proprietà",
          description: `Pulizia ${cleaning.type || "checkout"}`,
          effectivePrice,
          hasOverride: cleaning.priceOverride !== undefined && cleaning.priceOverride !== null,
        });
      }
    });

    // Processa ordini DELIVERED nel mese
    orders.forEach(order => {
      if (order.status !== "DELIVERED") return;
      
      const deliveryDate = order.deliveredAt?.toDate?.() || order.scheduledDate?.toDate?.() || order.createdAt?.toDate?.();
      if (!deliveryDate) return;
      
      if (deliveryDate >= startOfMonth && deliveryDate <= endOfMonth) {
        let calculatedTotal = 0;
        const itemDetails: { name: string; quantity: number; unitPrice: number; totalPrice: number }[] = [];
        let mainCategory = "Biancheria";
        let maxCategoryTotal = 0;
        const categoryTotals: { [key: string]: number } = {};
        
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach((item) => {
            const invItem = inventoryById.get(item.id);
            const basePrice = invItem?.sellPrice || item.price || 0;
            const unitPrice = item.priceOverride ?? basePrice;
            const quantity = item.quantity || 1;
            const itemTotal = unitPrice * quantity;
            calculatedTotal += itemTotal;
            
            const categoryName = invItem?.categoryName || "Altro";
            categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + itemTotal;
            if (categoryTotals[categoryName] > maxCategoryTotal) {
              maxCategoryTotal = categoryTotals[categoryName];
              mainCategory = categoryName;
            }
            
            itemDetails.push({
              name: invItem?.name || item.name || "Articolo",
              quantity,
              unitPrice,
              totalPrice: itemTotal,
            });
          });
        }

        const effectivePrice = order.totalPriceOverride ?? calculatedTotal;
        const serviceType = mapCategoryToServiceType(mainCategory);
        
        if (serviceType === "KIT_CORTESIA") {
          kitCortesiaTotal += effectivePrice;
          kitCortesiaCount++;
        } else if (serviceType === "SERVIZI_EXTRA") {
          serviziExtraTotal += effectivePrice;
          serviziExtraCount++;
        } else {
          ordersTotal += effectivePrice;
          ordersCount++;
        }
        
        services.push({
          id: order.id,
          type: serviceType,
          date: deliveryDate,
          propertyId: order.propertyId,
          propertyName: order.propertyName || "Proprietà",
          description: `${itemDetails.length} articoli`,
          effectivePrice,
          hasOverride: order.totalPriceOverride !== undefined && order.totalPriceOverride !== null,
          items: itemDetails,
        });
      }
    });

    // Ordina servizi per data
    services.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calcola totali
    const totaleCalcolato = cleaningsTotal + ordersTotal + kitCortesiaTotal + serviziExtraTotal;
    const override = overrides.length > 0 ? overrides[0] : null;
    const totaleEffettivo = override?.overrideTotal ?? totaleCalcolato;
    const totalePagato = payments.reduce((sum, p) => sum + p.amount, 0);
    const saldo = totaleEffettivo - totalePagato;

    // Stato
    let stato: "SALDATO" | "PARZIALE" | "DA_PAGARE" = "DA_PAGARE";
    if (saldo <= 0) stato = "SALDATO";
    else if (totalePagato > 0) stato = "PARZIALE";

    // Stats per proprietà
    const statsByProperty: PropertyStats[] = properties.map(property => {
      const propServices = services.filter(s => s.propertyId === property.id);
      const propCleanings = propServices.filter(s => s.type === "PULIZIA");
      const propOrders = propServices.filter(s => s.type !== "PULIZIA");
      
      return {
        propertyId: property.id,
        propertyName: property.name,
        cleaningsCount: propCleanings.length,
        cleaningsTotal: propCleanings.reduce((sum, s) => sum + s.effectivePrice, 0),
        ordersCount: propOrders.length,
        ordersTotal: propOrders.reduce((sum, s) => sum + s.effectivePrice, 0),
        total: propServices.reduce((sum, s) => sum + s.effectivePrice, 0),
      };
    }).filter(p => p.cleaningsCount > 0 || p.ordersCount > 0);

    return {
      cleaningsCount,
      cleaningsTotal,
      ordersCount,
      ordersTotal,
      kitCortesiaCount,
      kitCortesiaTotal,
      serviziExtraCount,
      serviziExtraTotal,
      totaleCalcolato,
      totaleEffettivo,
      hasOverride: !!override,
      overrideReason: override?.reason,
      totalePagato,
      saldo,
      stato,
      services,
      statsByProperty,
    };
  }, [properties, cleanings, orders, payments, inventory, overrides, selectedMonth, selectedYear]);

  // Navigation
  const goToPrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
    setExpandedProperty(null);
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
    setExpandedProperty(null);
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p className="text-slate-600">Caricamento pagamenti...</p>
        </div>
      </div>
    );
  }

  // ==================== MOBILE VIEW ====================
  if (isMobile) {
    return (
      <div className="min-h-screen bg-slate-50 pb-24">
        {/* Header */}
        <div className="bg-gradient-to-br from-sky-500 to-blue-600 text-white px-4 py-6">
          <h1 className="text-2xl font-bold mb-4">💳 I Miei Pagamenti</h1>
          
          {/* Month Navigator */}
          <div className="flex items-center justify-between bg-white/20 rounded-xl p-3">
            <button onClick={goToPrevMonth} className="p-2 hover:bg-white/20 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-lg font-semibold">{MONTHS[selectedMonth - 1]} {selectedYear}</span>
            <button onClick={goToNextMonth} className="p-2 hover:bg-white/20 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-4 -mt-2">
          {!computedStats || computedStats.services.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Nessun servizio</h3>
              <p className="text-slate-500">Non ci sono servizi completati per questo mese.</p>
            </div>
          ) : (
            <>
              {/* Summary Card */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
                <div className={`p-4 ${
                  computedStats.stato === "SALDATO" ? "bg-emerald-500" :
                  computedStats.stato === "PARZIALE" ? "bg-amber-500" : "bg-red-500"
                } text-white`}>
                  <div className="flex justify-between items-center">
                    <span className="text-white/90">Stato</span>
                    <span className="font-bold text-lg">
                      {computedStats.stato === "SALDATO" ? "✓ Saldato" :
                       computedStats.stato === "PARZIALE" ? "⏳ Parziale" : "⚠️ Da pagare"}
                    </span>
                  </div>
                </div>
                
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-slate-600">🧹 Pulizie ({computedStats.cleaningsCount})</span>
                    <span className="font-semibold">{formatCurrency(computedStats.cleaningsTotal)}</span>
                  </div>
                  
                  {computedStats.ordersCount > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-600">🛏️ Biancheria ({computedStats.ordersCount})</span>
                      <span className="font-semibold">{formatCurrency(computedStats.ordersTotal)}</span>
                    </div>
                  )}
                  
                  {computedStats.kitCortesiaCount > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-600">🧴 Kit Cortesia ({computedStats.kitCortesiaCount})</span>
                      <span className="font-semibold">{formatCurrency(computedStats.kitCortesiaTotal)}</span>
                    </div>
                  )}
                  
                  {computedStats.serviziExtraCount > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-slate-100">
                      <span className="text-slate-600">🎁 Servizi Extra ({computedStats.serviziExtraCount})</span>
                      <span className="font-semibold">{formatCurrency(computedStats.serviziExtraTotal)}</span>
                    </div>
                  )}

                  <div className="pt-2 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-700">Totale Servizi</span>
                      <span className="text-xl font-bold text-slate-800">{formatCurrency(computedStats.totaleEffettivo)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-emerald-600">
                      <span className="font-medium">Pagato</span>
                      <span className="font-semibold">{formatCurrency(computedStats.totalePagato)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center bg-slate-100 rounded-xl p-3 mt-2">
                      <span className="font-bold text-slate-700">SALDO</span>
                      <span className={`text-2xl font-bold ${computedStats.saldo > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {formatCurrency(computedStats.saldo)}
                      </span>
                    </div>
                  </div>
                  
                  {computedStats.hasOverride && (
                    <p className="text-sm text-amber-600 mt-2">
                      ⚠️ Totale modificato: {computedStats.overrideReason}
                    </p>
                  )}
                </div>
              </div>

              {/* Payments List */}
              {payments.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
                  <h3 className="font-bold text-slate-800 mb-3">💳 Pagamenti Registrati</h3>
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-emerald-50 rounded-xl p-3">
                        <div>
                          <span className="text-slate-500 text-sm">{formatDate(p.createdAt)}</span>
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                            p.type === "SALDO" ? "bg-emerald-200 text-emerald-700" : "bg-blue-200 text-blue-700"
                          }`}>
                            {p.type}
                          </span>
                          {p.method && (
                            <span className="ml-2 text-xs text-slate-400">
                              ({p.method === "BONIFICO" ? "🏦" : p.method === "CONTANTI" ? "💵" : "📝"})
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-emerald-700">{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per Property */}
              {computedStats.statsByProperty.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
                  <div className="p-4 bg-slate-50 border-b border-slate-200">
                    <h3 className="font-bold text-slate-800">🏠 Dettaglio per Proprietà</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {computedStats.statsByProperty.map((prop) => (
                      <div key={prop.propertyId} className="p-4">
                        <div 
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedProperty(expandedProperty === prop.propertyId ? null : prop.propertyId)}
                        >
                          <div>
                            <p className="font-medium text-slate-800">{prop.propertyName}</p>
                            <p className="text-sm text-slate-500">
                              {prop.cleaningsCount} pulizie • {prop.ordersCount} ordini
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sky-600">{formatCurrency(prop.total)}</span>
                            <svg className={`w-5 h-5 text-slate-400 transition-transform ${expandedProperty === prop.propertyId ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                        
                        {expandedProperty === prop.propertyId && (
                          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                            {computedStats.services
                              .filter(s => s.propertyId === prop.propertyId)
                              .map((service) => (
                                <div key={service.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-2 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span>{getServiceIcon(service.type)}</span>
                                    <div>
                                      <p className="font-medium text-slate-700">{getServiceLabel(service.type)}</p>
                                      <p className="text-xs text-slate-500">{formatDate(service.date)}</p>
                                    </div>
                                  </div>
                                  <span className="font-semibold">{formatCurrency(service.effectivePrice)}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Services Timeline */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                  <h3 className="font-bold text-slate-800">📋 Tutti i Servizi</h3>
                </div>
                <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                  {computedStats.services.map((service) => (
                    <div key={service.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-lg">
                            {getServiceIcon(service.type)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{getServiceLabel(service.type)}</p>
                            <p className="text-sm text-slate-500">{service.propertyName}</p>
                            <p className="text-xs text-slate-400">{formatDate(service.date)} • {service.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-800">{formatCurrency(service.effectivePrice)}</p>
                          {service.hasOverride && (
                            <span className="text-xs text-amber-500">modificato</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Items detail */}
                      {service.items && service.items.length > 0 && (
                        <div className="mt-2 ml-13 bg-slate-50 rounded-lg p-2 text-xs space-y-1">
                          {service.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-slate-600">
                              <span>{item.quantity}x {item.name}</span>
                              <span>{formatCurrency(item.totalPrice)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ==================== DESKTOP VIEW ====================
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">💳 I Miei Pagamenti</h1>
              <p className="text-white/80 mt-1">Riepilogo dei servizi e stato pagamenti</p>
            </div>
            
            {/* Month Navigator */}
            <div className="flex items-center gap-4 bg-white/20 rounded-xl px-4 py-2">
              <button onClick={goToPrevMonth} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xl font-semibold min-w-[180px] text-center">
                {MONTHS[selectedMonth - 1]} {selectedYear}
              </span>
              <button onClick={goToNextMonth} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        {!computedStats || computedStats.services.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="text-8xl mb-6">📭</div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Nessun servizio per questo mese</h3>
            <p className="text-slate-500 max-w-md mx-auto">
              Non ci sono servizi completati (pulizie o ordini consegnati) per {MONTHS[selectedMonth - 1]} {selectedYear}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-6">
            {/* Col 1: Summary */}
            <div className="space-y-4">
              {/* Status Card */}
              <div className={`rounded-2xl p-6 text-white ${
                computedStats.stato === "SALDATO" ? "bg-gradient-to-br from-emerald-500 to-emerald-600" :
                computedStats.stato === "PARZIALE" ? "bg-gradient-to-br from-amber-500 to-amber-600" : 
                "bg-gradient-to-br from-red-500 to-red-600"
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-white/90">Stato Pagamento</span>
                  <span className="text-2xl">
                    {computedStats.stato === "SALDATO" ? "✓" : computedStats.stato === "PARZIALE" ? "⏳" : "⚠️"}
                  </span>
                </div>
                <p className="text-3xl font-bold">
                  {computedStats.stato === "SALDATO" ? "Saldato" :
                   computedStats.stato === "PARZIALE" ? "Parziale" : "Da Pagare"}
                </p>
              </div>

              {/* Amounts Card */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h3 className="font-bold text-slate-800 mb-4 text-lg">📊 Riepilogo</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-600">🧹 Pulizie ({computedStats.cleaningsCount})</span>
                    <span className="font-semibold">{formatCurrency(computedStats.cleaningsTotal)}</span>
                  </div>
                  
                  {computedStats.ordersCount > 0 && (
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">🛏️ Biancheria ({computedStats.ordersCount})</span>
                      <span className="font-semibold">{formatCurrency(computedStats.ordersTotal)}</span>
                    </div>
                  )}
                  
                  {computedStats.kitCortesiaCount > 0 && (
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">🧴 Kit Cortesia ({computedStats.kitCortesiaCount})</span>
                      <span className="font-semibold">{formatCurrency(computedStats.kitCortesiaTotal)}</span>
                    </div>
                  )}
                  
                  {computedStats.serviziExtraCount > 0 && (
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">🎁 Servizi Extra ({computedStats.serviziExtraCount})</span>
                      <span className="font-semibold">{formatCurrency(computedStats.serviziExtraTotal)}</span>
                    </div>
                  )}

                  <div className="pt-3 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-700">Totale Servizi</span>
                      <span className="text-2xl font-bold">{formatCurrency(computedStats.totaleEffettivo)}</span>
                    </div>
                    
                    {computedStats.hasOverride && (
                      <p className="text-sm text-amber-600">⚠️ Modificato: {computedStats.overrideReason}</p>
                    )}
                    
                    <div className="flex justify-between items-center text-emerald-600">
                      <span className="font-medium">Pagato</span>
                      <span className="text-xl font-semibold">{formatCurrency(computedStats.totalePagato)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center bg-slate-100 rounded-xl p-4">
                      <span className="font-bold text-slate-700">SALDO</span>
                      <span className={`text-3xl font-bold ${computedStats.saldo > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {formatCurrency(computedStats.saldo)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payments List */}
              {payments.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <h3 className="font-bold text-slate-800 mb-4 text-lg">💳 Pagamenti Registrati</h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-emerald-50 rounded-xl p-3">
                        <div>
                          <span className="text-slate-500 text-sm">{formatDate(p.createdAt)}</span>
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                            p.type === "SALDO" ? "bg-emerald-200 text-emerald-700" : "bg-blue-200 text-blue-700"
                          }`}>
                            {p.type}
                          </span>
                          <span className="ml-2 text-xs text-slate-400">
                            {p.method === "BONIFICO" ? "🏦 Bonifico" : p.method === "CONTANTI" ? "💵 Contanti" : "📝 Altro"}
                          </span>
                        </div>
                        <span className="font-bold text-emerald-700">{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Col 2: Per Property */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 bg-slate-50 border-b border-slate-200">
                <h3 className="font-bold text-slate-800 text-lg">🏠 Dettaglio per Proprietà</h3>
              </div>
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {computedStats.statsByProperty.map((prop) => (
                  <div key={prop.propertyId} className="p-4 hover:bg-slate-50 transition-colors">
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedProperty(expandedProperty === prop.propertyId ? null : prop.propertyId)}
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{prop.propertyName}</p>
                        <p className="text-sm text-slate-500">
                          🧹 {prop.cleaningsCount} pulizie • 📦 {prop.ordersCount} ordini
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-bold text-sky-600">{formatCurrency(prop.total)}</span>
                        <svg className={`w-5 h-5 text-slate-400 transition-transform ${expandedProperty === prop.propertyId ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    
                    {expandedProperty === prop.propertyId && (
                      <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                        {computedStats.services
                          .filter(s => s.propertyId === prop.propertyId)
                          .map((service) => (
                            <div key={service.id} className="bg-slate-50 rounded-xl p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-xl">{getServiceIcon(service.type)}</span>
                                  <div>
                                    <p className="font-medium text-slate-700">{getServiceLabel(service.type)}</p>
                                    <p className="text-xs text-slate-500">{formatDate(service.date)} • {service.description}</p>
                                  </div>
                                </div>
                                <span className="font-semibold">{formatCurrency(service.effectivePrice)}</span>
                              </div>
                              
                              {service.items && service.items.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-slate-200 text-xs space-y-1">
                                  {service.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-slate-500">
                                      <span>{item.quantity}x {item.name}</span>
                                      <span>{formatCurrency(item.totalPrice)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
                
                {computedStats.statsByProperty.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    Nessun servizio per questo mese
                  </div>
                )}
              </div>
            </div>

            {/* Col 3: All Services */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 bg-slate-50 border-b border-slate-200">
                <h3 className="font-bold text-slate-800 text-lg">📋 Tutti i Servizi</h3>
                <p className="text-sm text-slate-500 mt-1">{computedStats.services.length} servizi nel mese</p>
              </div>
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {computedStats.services.map((service) => (
                  <div key={service.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-xl">
                          {getServiceIcon(service.type)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{getServiceLabel(service.type)}</p>
                          <p className="text-sm text-slate-500">{service.propertyName}</p>
                          <p className="text-xs text-slate-400">{formatDate(service.date)} • {service.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-800">{formatCurrency(service.effectivePrice)}</p>
                        {service.hasOverride && (
                          <span className="text-xs text-amber-500">modificato</span>
                        )}
                      </div>
                    </div>
                    
                    {service.items && service.items.length > 0 && (
                      <div className="mt-3 ml-15 bg-slate-50 rounded-lg p-3 text-xs space-y-1">
                        {service.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-slate-600">
                            <span>{item.quantity}x {item.name}</span>
                            <span>{formatCurrency(item.totalPrice)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
