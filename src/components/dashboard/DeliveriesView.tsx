"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import OrderDetailModal from "~/components/OrderDetailModal";
import { getItemName } from "~/lib/itemNames";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  propertyCity?: string;
  propertyPostalCode?: string;
  propertyFloor?: string;
  propertyApartment?: string;
  propertyIntercom?: string;
  propertyAccessCode?: string;
  propertyDoorCode?: string;
  propertyKeysLocation?: string;
  propertyAccessNotes?: string;
  riderId?: string | null;
  riderName?: string | null;
  status: string;
  urgency?: 'normal' | 'urgent';
  items: OrderItem[];
  scheduledDate: Date;
  scheduledTime?: string;
  cleaningId?: string;
  notes?: string;
  createdAt: Date;
  // Ritiro biancheria
  includePickup?: boolean;
  pickupItems?: OrderItem[];
  // Dati pulizia collegata
  cleaning?: {
    scheduledTime?: string;
    status?: string;
  };
  // Costo consegna
  deliveryFee?: number;
  deliveryFeeEnabled?: boolean;
}

interface Rider {
  id: string;
  name: string;
}

interface InventoryItem {
  id: string;
  key?: string;
  name: string;
  sellPrice: number;
  category?: string;
}

interface DeliveriesViewProps {
  orders: Order[];
  riders: Rider[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onOrdersUpdate?: () => void;
  inventory?: InventoryItem[];
  propertiesImageUrls?: Record<string, string>;
}

export function DeliveriesView({ 
  orders: initialOrders, 
  riders, 
  selectedDate, 
  onDateChange,
  onOrdersUpdate,
  inventory = [],
  propertiesImageUrls = {}
}: DeliveriesViewProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  
  // Modal conferma urgenza
  const [showUrgencyModal, setShowUrgencyModal] = useState(false);
  const [urgencyOrderId, setUrgencyOrderId] = useState<string | null>(null);
  const [urgencyOrderName, setUrgencyOrderName] = useState<string>("");
  const [urgencyLoading, setUrgencyLoading] = useState(false);

  // ⏰ Modal orario — solo per consegne Solo Biancheria (senza cleaningId)
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeModalOrderId, setTimeModalOrderId] = useState<string | null>(null);
  const [timeModalOrderName, setTimeModalOrderName] = useState<string>("");
  const [timeModalValue, setTimeModalValue] = useState<string>("");
  const [savingTime, setSavingTime] = useState(false);

  const openTimeModal = (order: Order) => {
    if (order.cleaningId) return; // Non editabile se collegata a pulizia
    setTimeModalOrderId(order.id);
    setTimeModalOrderName(order.propertyName);
    setTimeModalValue(order.scheduledTime || "10:00");
    setShowTimeModal(true);
  };

  const handleSaveTime = async () => {
    if (!timeModalOrderId || !timeModalValue) return;
    setSavingTime(true);
    try {
      await updateDoc(doc(db, "orders", timeModalOrderId), {
        scheduledTime: timeModalValue,
        timeManuallySet: true,
        updatedAt: Timestamp.now(),
      });
      setOrders(prev => prev.map(o => o.id === timeModalOrderId ? { ...o, scheduledTime: timeModalValue } : o));
      setShowTimeModal(false);
      setTimeModalOrderId(null);
    } catch (e) {
      console.error("Errore aggiornamento orario:", e);
    } finally {
      setSavingTime(false);
    }
  };

  // 📦 Modal riepilogo biancheria del giorno
  const [showLinenSummary, setShowLinenSummary] = useState(false);

  // 🆕 Modal dettaglio ordine
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Handler per aprire il dettaglio ordine
  const handleOpenDetail = (order: Order) => {
    setDetailOrder(order);
    setShowDetailModal(true);
  };

  // Sync with props when they change
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  // Detect screen size
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    onDateChange(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    onDateChange(newDate);
  };

  const { day, month, year } = {
    day: selectedDate.getDate(),
    month: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'][selectedDate.getMonth()],
    year: selectedDate.getFullYear()
  };

  // Status helpers
  const getStatusConfig = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DELIVERED":
      case "COMPLETED":
        return { label: "Consegnato", color: "bg-emerald-100 text-emerald-700", icon: "✓", borderColor: "border-l-emerald-500" };
      case "IN_TRANSIT":
        return { label: "In Viaggio", color: "bg-blue-100 text-blue-700", icon: "🚴", borderColor: "border-l-blue-500" };
      case "PICKING":
        return { label: "In Preparazione", color: "bg-amber-100 text-amber-700", icon: "📦", borderColor: "border-l-amber-500" };
      case "ASSIGNED":
        return { label: "Assegnato", color: "bg-violet-100 text-violet-700", icon: "👤", borderColor: "border-l-violet-500" };
      default:
        return { label: "Da Assegnare", color: "bg-rose-100 text-rose-700", icon: "⏳", borderColor: "border-l-rose-500" };
    }
  };

  const mapStatus = (status: string): string => {
    switch (status?.toUpperCase()) {
      case 'PENDING':
        return 'pending';
      case 'ASSIGNED':
      case 'PICKING':
        return 'picking';
      case 'IN_TRANSIT':
        return 'transit';
      case 'DELIVERED':
      case 'COMPLETED':
        return 'delivered';
      default:
        return 'pending';
    }
  };

  // Stats
  const stats = {
    pending: orders.filter(o => o.status === "PENDING").length,
    picking: orders.filter(o => o.status === "PICKING" || o.status === "ASSIGNED").length,
    transit: orders.filter(o => o.status === "IN_TRANSIT").length,
    delivered: orders.filter(o => o.status === "DELIVERED" || o.status === "COMPLETED").length,
    total: orders.length,
  };

  // Filtered orders
  const filteredOrders = orders.filter(order => {
    // Status filter
    if (statusFilter && mapStatus(order.status) !== statusFilter) return false;
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        order.propertyName?.toLowerCase().includes(query) ||
        order.propertyAddress?.toLowerCase().includes(query) ||
        order.riderName?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Sorted orders (pending first, then by status progression)
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const statusOrder: Record<string, number> = { pending: 0, picking: 1, transit: 2, delivered: 3 };
    const statusA = statusOrder[mapStatus(a.status)] || 0;
    const statusB = statusOrder[mapStatus(b.status)] || 0;
    return statusA - statusB;
  });

  // Assign rider
  const handleAssignRider = async (riderId: string) => {
    if (!selectedOrder) return;
    setAssigning(true);
    try {
      const rider = riders.find(r => r.id === riderId);
      const response = await fetch('/api/orders/' + selectedOrder.id + '/assign', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId, riderName: rider?.name })
      });
      
      if (response.ok) {
        setOrders(prev => prev.map(o => 
          o.id === selectedOrder.id 
            ? { ...o, riderId, riderName: rider?.name || null, status: "ASSIGNED" } 
            : o
        ));
        setShowAssignModal(false);
        setSelectedOrder(null);
        onOrdersUpdate?.();
      }
    } catch (error) {
      console.error("Errore assegnazione rider:", error);
    } finally {
      setAssigning(false);
    }
  };

  // Remove rider
  const handleRemoveRider = async (orderId: string, riderName: string) => {
    if (!confirm(`Rimuovere ${riderName} da questa consegna?`)) return;
    
    try {
      const response = await fetch('/api/orders/' + orderId + '/assign', {
        method: "DELETE",
      });
      
      if (response.ok) {
        setOrders(prev => prev.map(o => 
          o.id === orderId 
            ? { ...o, riderId: null, riderName: null, status: "PENDING" } 
            : o
        ));
        onOrdersUpdate?.();
      } else {
        alert("Errore nella rimozione del rider");
      }
    } catch (error) {
      console.error("Errore rimozione rider:", error);
      alert("Errore nella rimozione del rider");
    }
  };

  // Apre modal conferma per rendere urgente
  const openUrgencyModal = (orderId: string, orderName: string) => {
    setUrgencyOrderId(orderId);
    setUrgencyOrderName(orderName);
    setShowUrgencyModal(true);
  };

  // Conferma urgenza dalla modal
  const confirmUrgency = async () => {
    if (!urgencyOrderId) return;
    
    setUrgencyLoading(true);
    try {
      const response = await fetch(`/api/orders/${urgencyOrderId}/urgency`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urgency: "urgent",
          userRole: "ADMIN",
        }),
      });
      
      if (response.ok) {
        setOrders(prev => prev.map(o => 
          o.id === urgencyOrderId 
            ? { ...o, urgency: "urgent" as const } 
            : o
        ));
        onOrdersUpdate?.();
      } else {
        const data = await response.json();
        alert(data.error || "Errore nel cambio urgenza");
      }
    } catch (error) {
      console.error("Errore toggle urgenza:", error);
      alert("Errore nel cambio urgenza");
    } finally {
      setUrgencyLoading(false);
      setShowUrgencyModal(false);
      setUrgencyOrderId(null);
      setUrgencyOrderName("");
    }
  };

  // Rimuovi urgenza (senza conferma)
  const removeUrgency = async (orderId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/urgency`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urgency: "normal",
          userRole: "ADMIN",
        }),
      });
      
      if (response.ok) {
        setOrders(prev => prev.map(o => 
          o.id === orderId 
            ? { ...o, urgency: "normal" as const } 
            : o
        ));
        onOrdersUpdate?.();
      } else {
        const data = await response.json();
        alert(data.error || "Errore nel cambio urgenza");
      }
    } catch (error) {
      console.error("Errore toggle urgenza:", error);
      alert("Errore nel cambio urgenza");
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // 📦 Riepilogo biancheria del giorno
  const renderLinenSummaryModal = () => {
    if (!showLinenSummary) return null;
    
    const activeOrders = orders.filter(o => o.status !== "DELIVERED" && o.status !== "COMPLETED");
    
    const deliveryTotals = new Map<string, number>();
    activeOrders.forEach(order => {
      order.items?.forEach(item => {
        const translated = getItemName(item.id || item.name);
        const name = translated !== (item.id || item.name) ? translated : item.name;
        deliveryTotals.set(name, (deliveryTotals.get(name) || 0) + item.quantity);
      });
    });
    
    const pickupTotals = new Map<string, number>();
    activeOrders.forEach(order => {
      if (order.includePickup && order.pickupItems) {
        order.pickupItems.forEach(item => {
          const translated = getItemName(item.id || item.name);
          const name = translated !== (item.id || item.name) ? translated : item.name;
          pickupTotals.set(name, (pickupTotals.get(name) || 0) + item.quantity);
        });
      }
    });
    
    const sortedDelivery = Array.from(deliveryTotals.entries()).sort((a, b) => b[1] - a[1]);
    const sortedPickup = Array.from(pickupTotals.entries()).sort((a, b) => b[1] - a[1]);
    const totalPieces = sortedDelivery.reduce((sum, [, qty]) => sum + qty, 0);
    const byStatus = {
      pending: orders.filter(o => o.status === "PENDING").length,
      inProgress: orders.filter(o => ["PICKING","ASSIGNED","IN_TRANSIT"].includes(o.status)).length,
      delivered: orders.filter(o => o.status === "DELIVERED" || o.status === "COMPLETED").length,
    };
    const dateLabel = selectedDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
          onClick={() => setShowLinenSummary(false)}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed z-[60] inset-3 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-lg sm:w-full flex items-start sm:items-center justify-center pt-8 sm:pt-0"
        >
          <div 
            className="bg-white rounded-2xl max-h-[85vh] flex flex-col overflow-hidden w-full"
            style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 10px 30px rgba(0,0,0,0.1)' }}
          >
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)' }}>
              <div className="absolute inset-0 opacity-10">
                <div className="absolute -top-4 -right-4 w-32 h-32 bg-white rounded-full blur-2xl" />
                <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-indigo-300 rounded-full blur-2xl" />
              </div>
              <div className="relative flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Riepilogo Biancheria</h3>
                  <p className="text-indigo-300 text-sm capitalize mt-0.5">{dateLabel}</p>
                </div>
                <button 
                  onClick={() => setShowLinenSummary(false)}
                  className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-colors"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-2.5 mb-5">
                {[
                  { value: totalPieces, label: "Pezzi", gradient: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)", color: "#4338ca" },
                  { value: byStatus.pending, label: "Da assegnare", gradient: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)", color: "#e11d48" },
                  { value: byStatus.inProgress, label: "In corso", gradient: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)", color: "#d97706" },
                  { value: byStatus.delivered, label: "Consegnate", gradient: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)", color: "#059669" },
                ].map((stat, i) => (
                  <div key={i} className="rounded-xl p-3 text-center" style={{ background: stat.gradient }}>
                    <p className="text-2xl font-black" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="text-[10px] font-semibold mt-0.5" style={{ color: stat.color, opacity: 0.7 }}>{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Da Portare */}
              <div className="mb-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)' }}>
                    <span className="text-white text-xs">📤</span>
                  </div>
                  <span className="text-sm font-bold text-slate-700">Da consegnare</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">{activeOrders.length} ordini</span>
                </div>
                {sortedDelivery.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-sm text-slate-400">Nessun articolo da consegnare</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 mb-5">
                    {sortedDelivery.map(([name, qty]) => (
                      <div 
                        key={name} 
                        className="flex items-center justify-between rounded-xl px-4 py-3"
                        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                      >
                        <span className="text-sm font-medium text-slate-700">{name}</span>
                        <span 
                          className="text-base font-black min-w-[44px] text-center py-0.5 px-3 rounded-lg"
                          style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)', color: '#4338ca' }}
                        >
                          {qty}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Da Ritirare */}
              {sortedPickup.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)' }}>
                      <span className="text-white text-xs">📥</span>
                    </div>
                    <span className="text-sm font-bold text-slate-700">Da ritirare</span>
                  </div>
                  <div className="space-y-1.5">
                    {sortedPickup.map(([name, qty]) => (
                      <div 
                        key={name} 
                        className="flex items-center justify-between rounded-xl px-4 py-3"
                        style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                      >
                        <span className="text-sm font-medium text-slate-700">{name}</span>
                        <span 
                          className="text-base font-black min-w-[44px] text-center py-0.5 px-3 rounded-lg"
                          style={{ background: 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)', color: '#ea580c' }}
                        >
                          {qty}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setShowLinenSummary(false)}
                className="w-full py-3 font-semibold rounded-xl transition-all hover:shadow-md active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', color: '#475569' }}
              >
                Chiudi
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  };

  const riderColors = [
    "from-orange-400 to-red-500",
    "from-cyan-400 to-blue-500",
    "from-pink-400 to-rose-500",
    "from-lime-400 to-green-500",
    "from-purple-400 to-indigo-500",
  ];

  const getRiderColor = (riderId: string | null | undefined) => {
    if (!riderId) return "from-slate-400 to-slate-500";
    const index = riders.findIndex(r => r.id === riderId);
    return riderColors[Math.abs(index) % riderColors.length];
  };

  // Status config con CSS gradients per card (come CleaningCardAdmin)
  const getStatusCardConfig = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DELIVERED":
      case "COMPLETED":
        return { label: "Consegnato", icon: "✓", cssGradient: "linear-gradient(135deg, #10b981 0%, #059669 100%)", shadowColor: "rgba(16,185,129,0.4)" };
      case "IN_TRANSIT":
        return { label: "In Viaggio", icon: "🚴", cssGradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)", shadowColor: "rgba(59,130,246,0.4)" };
      case "PICKING":
        return { label: "Preparazione", icon: "📦", cssGradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", shadowColor: "rgba(245,158,11,0.4)" };
      case "ASSIGNED":
        return { label: "Assegnato", icon: "👤", cssGradient: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)", shadowColor: "rgba(139,92,246,0.4)" };
      default:
        return { label: "Da Assegnare", icon: "!", cssGradient: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)", shadowColor: "rgba(244,63,94,0.4)" };
    }
  };

  if (isMobile === null) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-3 border-slate-200 border-t-sky-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  // =====================================================
  // MOBILE LAYOUT
  // =====================================================
  if (isMobile) {
    return (
      <>
        {/* Date Navigator */}
        <div className="bg-white rounded-xl px-3 py-2 mb-3 flex items-center justify-between border border-slate-100 shadow-sm">
          <button onClick={goToPreviousDay} className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-50 border border-slate-100">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="text-center flex items-center gap-2">
            <p className="text-base font-black text-slate-800">{day}</p>
            <p className="text-xs font-medium text-slate-400">{month} {year}</p>
          </div>
          <button onClick={goToNextDay} className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-50 border border-slate-100">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        {/* List Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-800">
            {statusFilter === 'pending' ? 'Da Assegnare' : 
             statusFilter === 'picking' ? 'In Preparazione' : 
             statusFilter === 'transit' ? 'In Viaggio' : 
             statusFilter === 'delivered' ? 'Consegnate' : 'Tutte le consegne'}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLinenSummary(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 text-white"
              style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)', boxShadow: '0 2px 8px rgba(67,56,202,0.3)' }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              Dettagli
            </button>
            <span className="text-xs text-slate-400">{sortedOrders.length} consegne</span>
          </div>
        </div>

        {/* Cards - Stile Desktop con foto */}
        <div className="space-y-3 pb-4">
          {loadingOrders ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-slate-500 text-sm">Caricamento...</p>
            </div>
          ) : sortedOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">📦</span>
              </div>
              <p className="text-slate-500">Nessuna consegna per oggi</p>
            </div>
          ) : (
            sortedOrders.map((order) => {
              const statusCard = getStatusCardConfig(order.status);
              const isUrgent = order.urgency === 'urgent';
              const isExpanded = expandedCards[order.id] || false;
              const imageUrl = propertiesImageUrls[order.propertyId] || null;
              const totalItems = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
              const itemsPrice = order.items?.reduce((sum, item) => {
                const invItem = inventory.find(i => i.id === item.id || i.name === item.name);
                return sum + ((invItem?.sellPrice || 0) * item.quantity);
              }, 0) || 0;
              // 💰 Aggiungi costo consegna se presente e abilitato
              const deliveryFee = (order.deliveryFee && order.deliveryFeeEnabled !== false) ? order.deliveryFee : 0;
              // 🛏️ Aggiungi costo preparazione letti se presente
              const bedMakingFee = (order.bedMaking && order.bedMakingFee) ? order.bedMakingFee : 0;
              const orderPrice = itemsPrice + deliveryFee + bedMakingFee;

              return (
                <div
                  key={order.id}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl overflow-hidden"
                  style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.04)' }}
                >
                  <div className="flex h-28">
                    {/* ========== FOTO con overlay ========== */}
                    <div className="relative w-28 h-28 flex-shrink-0 overflow-hidden rounded-l-2xl">
                      {imageUrl ? (
                        <img src={imageUrl} alt={order.propertyName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: statusCard.cssGradient }}>
                          <svg className="w-10 h-10 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                      )}
                      {/* Overlay sfumato */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                      
                      {/* Badge Stato */}
                      <div className="absolute top-2 left-2">
                        <span 
                          className="px-2 py-0.5 text-[9px] font-bold text-white rounded-md flex items-center gap-1"
                          style={{ background: statusCard.cssGradient, boxShadow: `0 2px 8px ${statusCard.shadowColor}` }}
                        >
                          {statusCard.icon === '✓' && (
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {statusCard.icon === '!' && (
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                          )}
                          {statusCard.label}
                        </span>
                      </div>

                      {/* Urgente badge */}
                      {isUrgent && (
                        <div className="absolute top-2 right-2">
                          <span className="px-1.5 py-0.5 text-[8px] font-bold text-white rounded-md bg-gradient-to-r from-red-500 to-rose-600" style={{ boxShadow: '0 2px 8px rgba(239,68,68,0.5)' }}>
                            🚨
                          </span>
                        </div>
                      )}
                      
                      {/* Prezzo */}
                      <div className="absolute bottom-1.5 right-1.5">
                        <span className="text-xl font-black text-white drop-shadow-lg">€{orderPrice.toFixed(0)}</span>
                      </div>
                    </div>
                    
                    {/* ========== CONTENUTO ========== */}
                    <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                      {/* Header */}
                      <div className="cursor-pointer" onClick={() => handleOpenDetail(order)}>
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                          <h3 className="font-semibold text-[13px] text-gray-900 truncate leading-tight">
                            {order.propertyName}
                          </h3>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{order.propertyAddress}{order.propertyCity ? `, ${order.propertyPostalCode} ${order.propertyCity}` : ''}</p>
                      </div>
                      
                      {/* Info minimizzate: orario + pezzi totali */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {/* Orario — cliccabile solo per Solo Biancheria */}
                        <div 
                          className={`h-6 px-2 rounded-lg flex items-center gap-1 ${!order.cleaningId ? 'cursor-pointer hover:bg-blue-50 active:scale-95 transition-all' : ''}`}
                          style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                          onClick={!order.cleaningId ? (e: any) => { e.stopPropagation(); openTimeModal(order); } : undefined}
                        >
                          <svg className="w-2.5 h-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-[10px] font-semibold text-gray-700">{order.scheduledTime || "—"}</span>
                        </div>
                        
                        {/* Pezzi totali */}
                        <div 
                          className="h-6 px-2 rounded-lg flex items-center gap-1"
                          style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', boxShadow: '0 1px 4px rgba(234,88,12,0.08)' }}
                        >
                          <svg className="w-2.5 h-2.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                          <span className="text-[10px] font-semibold text-orange-700">{totalItems} pz</span>
                        </div>
                      </div>
                      
                      {/* Rider + Urgenza + Espandi */}
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* Rider */}
                          {!order.riderName ? (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); setShowAssignModal(true); }}
                              className="h-6 px-2.5 rounded-lg flex items-center gap-1 transition-all active:scale-95"
                              style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', boxShadow: '0 2px 8px rgba(15,23,42,0.3)' }}
                            >
                              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                              </svg>
                              <span className="text-[9px] font-bold text-white">Assegna Rider</span>
                            </button>
                          ) : (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); setShowAssignModal(true); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all active:scale-95"
                              style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', boxShadow: '0 1px 4px rgba(234,88,12,0.15)' }}
                            >
                              <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-gradient-to-r ${getRiderColor(order.riderId)}`}>
                                <span className="text-[7px] font-bold text-white">{getInitials(order.riderName)}</span>
                              </div>
                              <span className="text-[10px] font-semibold text-orange-700 truncate max-w-[70px]">{order.riderName}</span>
                            </button>
                          )}
                          
                          {/* Urgenza toggle */}
                          {order.urgency === 'urgent' ? (
                            <button 
                              onClick={(e) => { e.stopPropagation(); removeUrgency(order.id); }}
                              className="h-6 px-2 rounded-lg flex items-center gap-1 transition-all active:scale-95"
                              style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)', boxShadow: '0 1px 4px rgba(239,68,68,0.2)' }}
                              title="Rimuovi urgenza"
                            >
                              <span className="text-[10px]">🚨</span>
                              <span className="text-[9px] font-bold text-red-600">Urgente</span>
                            </button>
                          ) : (
                            <button 
                              onClick={(e) => { e.stopPropagation(); openUrgencyModal(order.id, order.propertyName); }}
                              className="h-6 px-2 rounded-lg flex items-center gap-1 transition-all active:scale-95"
                              style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                              title="Rendi urgente"
                            >
                              <span className="text-[10px]">🔔</span>
                              <span className="text-[9px] font-semibold text-slate-500">Urgente</span>
                            </button>
                          )}
                        </div>
                        
                        {/* Espandi */}
                        <button 
                          onClick={(e) => { e.stopPropagation(); setExpandedCards(prev => ({ ...prev, [order.id]: !prev[order.id] })); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
                          style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                        >
                          <svg 
                            className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
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
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 pt-2 border-t border-gray-100">
                          
                          {/* Badge urgenza */}
                          {isUrgent && (
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-6 px-2 rounded-lg flex items-center gap-1" style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)' }}>
                                <span className="text-xs">🚨</span>
                                <span className="text-[10px] font-semibold text-red-700">Consegna Urgente</span>
                              </div>
                            </div>
                          )}

                          {/* Orario Pulizia / Consegna info */}
                          {order.cleaning ? (
                            <div className="rounded-xl p-2 mb-2 bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">🧹</span>
                                  <span className="text-[10px] font-semibold text-slate-700">
                                    Pulizia: {order.cleaning.scheduledTime || order.scheduledTime || '--:--'}
                                  </span>
                                </div>
                                <div className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                                  order.cleaning.status === 'SCHEDULED' 
                                    ? 'bg-amber-100 text-amber-700' 
                                  : order.cleaning.status === 'IN_PROGRESS' 
                                    ? 'bg-green-100 text-green-700' 
                                  : order.cleaning.status === 'COMPLETED' 
                                    ? 'bg-slate-200 text-slate-600' 
                                  : 'bg-red-100 text-red-700'
                                }`}>
                                  {order.cleaning.status === 'SCHEDULED' && '🟡 Non iniziata'}
                                  {order.cleaning.status === 'IN_PROGRESS' && '🟢 In corso'}
                                  {order.cleaning.status === 'COMPLETED' && '✅ Completata'}
                                  {order.cleaning.status === 'CANCELLED' && '❌ Annullata'}
                                  {!order.cleaning.status && '⏳ In attesa'}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl p-2 mb-2 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm">🛏️</span>
                                <span className="text-[10px] font-semibold text-sky-700">Solo Biancheria</span>
                                {order.scheduledTime && (
                                  <span className="text-[10px] text-sky-600 ml-auto">
                                    Consegna: {order.scheduledTime}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Articoli da consegnare */}
                          {order.items && order.items.length > 0 && (
                            <div className="mb-3">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <div className="w-5 h-5 rounded-md bg-orange-50 flex items-center justify-center">
                                  <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                  </svg>
                                </div>
                                <span className="text-[10px] font-semibold text-gray-700">Articoli da Consegnare ({totalItems} pz)</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {order.items.map((item, idx) => (
                                  <span key={idx} className="px-1.5 py-0.5 bg-orange-50 rounded-md text-[9px] text-orange-700 border border-orange-100">
                                    {getItemName(item.id) || item.name}: <span className="font-bold">{item.quantity}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Ritiro biancheria */}
                          {order.includePickup && order.pickupItems && order.pickupItems.length > 0 && (
                            <div className="mb-3">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center">
                                  <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                  </svg>
                                </div>
                                <span className="text-[10px] font-semibold text-gray-700">Ritiro Biancheria Sporca</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {order.pickupItems.map((item, idx) => (
                                  <span key={idx} className="px-1.5 py-0.5 bg-blue-50 rounded-md text-[9px] text-blue-600 border border-blue-100">
                                    {getItemName(item.id) || item.name}: <span className="font-bold">{item.quantity}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Nessun ritiro */}
                          {order.includePickup === false && (
                            <div className="mb-2">
                              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                <span>📥</span> Nessun ritiro
                              </p>
                            </div>
                          )}

                          {/* Note */}
                          {order.notes && (
                            <div className="mb-3 p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' }}>
                              <div className="flex items-center gap-1 mb-0.5">
                                <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                </svg>
                                <span className="text-[10px] font-semibold text-amber-700">Note</span>
                              </div>
                              <p className="text-[10px] text-amber-800">{order.notes}</p>
                            </div>
                          )}

                          {/* Pulsante Dettaglio */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleOpenDetail(order); }}
                            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                            style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', boxShadow: '0 4px 12px rgba(15,23,42,0.25)' }}
                          >
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span className="text-xs font-semibold text-white">Dettaglio Consegna</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Assegna Rider (Mobile) */}
        <AnimatePresence>
          {showAssignModal && selectedOrder && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-50"
                onClick={() => { setShowAssignModal(false); setSelectedOrder(null); }}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed bottom-20 left-0 right-0 bg-white rounded-3xl z-50 mx-3 max-h-[70vh] overflow-hidden shadow-2xl"
              >
                <div className="p-4 border-b border-slate-100">
                  <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-slate-800">
                    {selectedOrder.riderName ? 'Gestisci Rider' : 'Assegna Rider'}
                  </h3>
                  <p className="text-sm text-slate-500">{selectedOrder.propertyName}</p>
                </div>
                <div className="p-4 overflow-y-auto max-h-[45vh]">
                  {/* Rider attualmente assegnato - mostra opzione rimuovi */}
                  {selectedOrder.riderName && (
                    <div className="mb-4 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 flex items-center justify-center shadow-md">
                            <span className="text-sm font-bold text-white">{getInitials(selectedOrder.riderName)}</span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{selectedOrder.riderName}</p>
                            <p className="text-xs text-violet-600">Rider assegnato</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            handleRemoveRider(selectedOrder.id, selectedOrder.riderName!);
                            setShowAssignModal(false);
                            setSelectedOrder(null);
                          }}
                          disabled={assigning}
                          className="px-3 py-2 bg-red-100 text-red-600 text-sm font-bold rounded-xl hover:bg-red-200 transition-colors disabled:opacity-50"
                        >
                          ✕ Rimuovi
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista rider per (ri)assegnare */}
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">
                    {selectedOrder.riderName ? 'Cambia con:' : 'Seleziona rider:'}
                  </p>
                  {riders.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <p>Nessun rider disponibile</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {riders.map((rider, index) => (
                        <button
                          key={rider.id}
                          onClick={() => handleAssignRider(rider.id)}
                          disabled={assigning || rider.id === selectedOrder.riderId}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all disabled:opacity-50 ${
                            rider.id === selectedOrder.riderId 
                              ? 'border-violet-300 bg-violet-50 cursor-default' 
                              : 'border-slate-200 hover:border-orange-400 hover:bg-orange-50'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-r ${riderColors[index % riderColors.length]} flex items-center justify-center shadow-md`}>
                            <span className="text-sm font-bold text-white">{getInitials(rider.name)}</span>
                          </div>
                          <span className="font-medium text-slate-800">{rider.name}</span>
                          {rider.id === selectedOrder.riderId && (
                            <span className="ml-auto text-xs font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">Attuale</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Bottone Annulla */}
                <div className="p-4 border-t border-slate-100">
                  <button
                    onClick={() => { setShowAssignModal(false); setSelectedOrder(null); }}
                    className="w-full py-3 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    Annulla
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ═══════════════════════════════════════════════════════════════
            MODAL CONFERMA URGENZA (Mobile) 🚨
            ═══════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
        {showUrgencyModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
              onClick={() => !urgencyLoading && setShowUrgencyModal(false)}
            />
            
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden pointer-events-auto">
                {/* Header con animazione pulse */}
                <div className="relative bg-gradient-to-r from-red-500 via-rose-500 to-orange-500 p-5 overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full animate-pulse" />
                  <div className="absolute -bottom-5 -left-5 w-20 h-20 bg-white/10 rounded-full animate-pulse delay-150" />
                  
                  <div className="relative flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                      <span className="text-3xl animate-bounce">🚨</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Rendi Urgente</h3>
                      <p className="text-white/80 text-sm">Conferma l'azione</p>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <div className="bg-slate-50 rounded-2xl p-4 mb-4">
                    <p className="text-sm text-slate-500 mb-1">Ordine per:</p>
                    <p className="font-bold text-slate-800 text-lg">{urgencyOrderName}</p>
                  </div>
                  
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">📢</span>
                      <div>
                        <p className="font-semibold text-amber-800 text-sm">Attenzione</p>
                        <p className="text-amber-700 text-sm mt-1">
                          Tutti i rider riceveranno una <strong>notifica immediata</strong> per questo ordine urgente.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bottoni */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowUrgencyModal(false);
                        setUrgencyOrderId(null);
                        setUrgencyOrderName("");
                      }}
                      disabled={urgencyLoading}
                      className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={confirmUrgency}
                      disabled={urgencyLoading}
                      className="flex-1 py-3.5 bg-gradient-to-r from-red-500 to-rose-500 text-white font-bold rounded-2xl shadow-lg shadow-red-500/30 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {urgencyLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Invio...</span>
                        </>
                      ) : (
                        <>
                          <span>🚨</span>
                          <span>Conferma Urgente</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
        </AnimatePresence>

        {/* Modal Dettaglio Ordine (Mobile) */}
        <OrderDetailModal
          isOpen={showDetailModal}
          onClose={() => { setShowDetailModal(false); setDetailOrder(null); }}
          order={detailOrder}
          userRole="ADMIN"
          riders={riders}
          inventory={inventory}
          onOrderUpdate={() => {
            onOrdersUpdate?.();
            if (detailOrder) {
              const updatedOrder = orders.find(o => o.id === detailOrder.id);
              if (updatedOrder) setDetailOrder(updatedOrder);
            }
          }}
          onOrderDelete={() => {
            onOrdersUpdate?.();
          }}
        />

        {/* 📦 Modal Riepilogo Biancheria */}
        {renderLinenSummaryModal()}
      </>
    );
  }

  // =====================================================
  // DESKTOP LAYOUT
  // =====================================================
  return (
    <>
      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <button
          onClick={() => setStatusFilter(null)}
          className={`bg-white rounded-2xl border p-4 text-center transition-all hover:shadow-md ${!statusFilter ? 'border-sky-400 ring-2 ring-sky-200' : 'border-slate-200'}`}
        >
          <p className="text-3xl font-bold text-slate-800">{stats.total}</p>
          <p className="text-sm text-slate-500">Totali</p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'pending' ? null : 'pending')}
          className={`bg-white rounded-2xl border p-4 text-center transition-all hover:shadow-md ${statusFilter === 'pending' ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200'}`}
        >
          <p className="text-3xl font-bold text-rose-600">{stats.pending}</p>
          <p className="text-sm text-slate-500">Da Assegnare</p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'picking' ? null : 'picking')}
          className={`bg-white rounded-2xl border p-4 text-center transition-all hover:shadow-md ${statusFilter === 'picking' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200'}`}
        >
          <p className="text-3xl font-bold text-amber-600">{stats.picking}</p>
          <p className="text-sm text-slate-500">In Preparazione</p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'transit' ? null : 'transit')}
          className={`bg-white rounded-2xl border p-4 text-center transition-all hover:shadow-md ${statusFilter === 'transit' ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200'}`}
        >
          <p className="text-3xl font-bold text-blue-600">{stats.transit}</p>
          <p className="text-sm text-slate-500">In Viaggio</p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'delivered' ? null : 'delivered')}
          className={`bg-white rounded-2xl border p-4 text-center transition-all hover:shadow-md ${statusFilter === 'delivered' ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'}`}
        >
          <p className="text-3xl font-bold text-emerald-600">{stats.delivered}</p>
          <p className="text-sm text-slate-500">Consegnate</p>
        </button>
      </div>

      {/* Search and Date */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <svg className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cerca proprietà, indirizzo, rider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>
        
        <button
          onClick={() => setShowLinenSummary(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-semibold text-sm whitespace-nowrap hover:shadow-lg active:scale-[0.97]"
          style={{ 
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)', 
            color: '#fff',
            boxShadow: '0 4px 15px rgba(67,56,202,0.3)' 
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          Dettagli
        </button>
        
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2">
          <button onClick={goToPreviousDay} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="font-medium text-slate-800 min-w-[140px] text-center">
            {day} {month} {year}
          </span>
          <button onClick={goToNextDay} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Orders Cards - Stile CleaningCardAdmin */}
      <div className="space-y-4">
        {loadingOrders ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Caricamento...</h3>
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📦</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna consegna</h3>
            <p className="text-slate-500">Non ci sono consegne biancheria per questa data</p>
          </div>
        ) : (
          sortedOrders.map((order) => {
            const statusCard = getStatusCardConfig(order.status);
            const isUrgent = order.urgency === 'urgent';
            const isExpanded = expandedCards[order.id] || false;
            const imageUrl = propertiesImageUrls[order.propertyId] || null;
            const totalItems = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
            const itemsPrice = order.items?.reduce((sum, item) => {
              const invItem = inventory.find(i => i.id === item.id || i.name === item.name);
              return sum + ((invItem?.sellPrice || 0) * item.quantity);
            }, 0) || 0;
            // 💰 Aggiungi costo consegna se presente e abilitato
            const deliveryFee = (order.deliveryFee && order.deliveryFeeEnabled !== false) ? order.deliveryFee : 0;
            // 🛏️ Aggiungi costo preparazione letti se presente
            const bedMakingFee2 = (order.bedMaking && order.bedMakingFee) ? order.bedMakingFee : 0;
            const orderPrice = itemsPrice + deliveryFee + bedMakingFee2;

            return (
              <div 
                key={order.id}
                className="bg-white/80 backdrop-blur-sm rounded-3xl"
                style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.04)' }}
              >
                <div className="flex h-32">
                  {/* ========== FOTO con overlay ========== */}
                  <div className="relative w-32 h-32 flex-shrink-0 overflow-hidden rounded-l-3xl">
                    {imageUrl ? (
                      <img src={imageUrl} alt={order.propertyName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: statusCard.cssGradient }}>
                        <svg className="w-12 h-12 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                    {/* Overlay sfumato */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                    
                    {/* Badge Stato */}
                    <div className="absolute top-2.5 left-2.5">
                      <span 
                        className="px-2.5 py-1 text-[10px] font-bold text-white rounded-lg flex items-center gap-1"
                        style={{ background: statusCard.cssGradient, boxShadow: `0 2px 8px ${statusCard.shadowColor}` }}
                      >
                        {statusCard.icon === '✓' && (
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {statusCard.icon === '!' && (
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                        )}
                        {statusCard.label}
                      </span>
                    </div>

                    {/* Urgente badge */}
                    {isUrgent && (
                      <div className="absolute top-2.5 right-2.5">
                        <span className="px-2 py-1 text-[9px] font-bold text-white rounded-lg bg-gradient-to-r from-red-500 to-rose-600" style={{ boxShadow: '0 2px 8px rgba(239,68,68,0.5)' }}>
                          🚨
                        </span>
                      </div>
                    )}
                    
                    {/* Numero articoli sulla foto → PREZZO */}
                    <div className="absolute bottom-2 right-2">
                      <span className="text-2xl font-black text-white drop-shadow-lg">€{orderPrice.toFixed(0)}</span>
                    </div>
                  </div>
                  
                  {/* ========== CONTENUTO ========== */}
                  <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0">
                    {/* Header */}
                    <div className="cursor-pointer" onClick={() => handleOpenDetail(order)}>
                      <div className="flex items-center gap-2">
                        <div className="flex-shrink-0">
                          <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-[13px] text-gray-900 truncate leading-tight">
                          {order.propertyName}
                        </h3>
                      </div>
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{order.propertyAddress}{order.propertyCity ? `, ${order.propertyPostalCode} ${order.propertyCity}` : ''}</p>
                    </div>
                    
                    {/* Info minimizzate: orario + pezzi totali */}
                    <div className="flex items-center gap-2 mt-2">
                      {/* Orario */}
                      <div 
                        className={`h-7 px-2.5 rounded-xl flex items-center gap-1.5 ${!order.cleaningId ? 'cursor-pointer hover:bg-blue-50 active:scale-95 transition-all' : ''}`}
                        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                        onClick={!order.cleaningId ? (e: any) => { e.stopPropagation(); openTimeModal(order); } : undefined}
                      >
                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[11px] font-semibold text-gray-700">{order.scheduledTime || "—"}</span>
                      </div>
                      
                      {/* Pezzi totali */}
                      <div 
                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                        style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', boxShadow: '0 2px 8px rgba(234,88,12,0.08)' }}
                      >
                        <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <span className="text-[11px] font-semibold text-orange-700">{totalItems} pz</span>
                      </div>
                    </div>
                    
                    {/* Rider + Urgenza + Espandi */}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {/* Rider */}
                        {!order.riderName ? (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); setShowAssignModal(true); }}
                            className="h-7 px-3 rounded-xl flex items-center gap-1.5 transition-all hover:scale-105"
                            style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', boxShadow: '0 4px 12px rgba(15,23,42,0.3)' }}
                          >
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                            <span className="text-[10px] font-bold text-white">Assegna Rider</span>
                          </button>
                        ) : (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); setShowAssignModal(true); }}
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all hover:scale-105"
                            style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', boxShadow: '0 2px 8px rgba(234,88,12,0.15)' }}
                          >
                            <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 bg-gradient-to-r ${getRiderColor(order.riderId)}`}>
                              <span className="text-[8px] font-bold text-white">{getInitials(order.riderName)}</span>
                            </div>
                            <span className="text-[11px] font-semibold text-orange-700">{order.riderName}</span>
                          </button>
                        )}
                        
                        {/* Urgenza toggle */}
                        {order.urgency === 'urgent' ? (
                          <button 
                            onClick={(e) => { e.stopPropagation(); removeUrgency(order.id); }}
                            className="h-7 px-2.5 rounded-xl flex items-center gap-1 transition-all hover:scale-105"
                            style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)', boxShadow: '0 2px 8px rgba(239,68,68,0.2)' }}
                            title="Rimuovi urgenza"
                          >
                            <span className="text-xs">🚨</span>
                            <span className="text-[10px] font-bold text-red-600">Urgente</span>
                          </button>
                        ) : (
                          <button 
                            onClick={(e) => { e.stopPropagation(); openUrgencyModal(order.id, order.propertyName); }}
                            className="h-7 px-2.5 rounded-xl flex items-center gap-1 transition-all hover:scale-105"
                            style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                            title="Rendi urgente"
                          >
                            <span className="text-xs">🔔</span>
                            <span className="text-[10px] font-semibold text-slate-500">Urgente</span>
                          </button>
                        )}
                      </div>
                      
                      {/* Espandi */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setExpandedCards(prev => ({ ...prev, [order.id]: !prev[order.id] })); }}
                        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                      >
                        <svg 
                          className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
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
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                        
                        {/* Badge urgenza */}
                        {isUrgent && (
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-7 px-2.5 rounded-xl flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)' }}>
                              <span className="text-sm">🚨</span>
                              <span className="text-[11px] font-semibold text-red-700">Consegna Urgente</span>
                            </div>
                          </div>
                        )}

                        {/* Articoli da consegnare */}
                        {order.items && order.items.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-6 h-6 rounded-lg bg-orange-50 flex items-center justify-center">
                                <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                              </div>
                              <span className="text-xs font-semibold text-gray-700">Articoli da Consegnare ({totalItems} pz)</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {order.items.map((item, idx) => (
                                <span key={idx} className="px-2 py-1 bg-orange-50 rounded-lg text-[10px] text-orange-700 border border-orange-100">
                                  {getItemName(item.id) || item.name}: <span className="font-bold">{item.quantity}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Ritiro biancheria */}
                        {order.includePickup && order.pickupItems && order.pickupItems.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                              </div>
                              <span className="text-xs font-semibold text-gray-700">Ritiro Biancheria Sporca</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {order.pickupItems.map((item, idx) => (
                                <span key={idx} className="px-2 py-1 bg-blue-50 rounded-lg text-[10px] text-blue-600 border border-blue-100">
                                  {getItemName(item.id) || item.name}: <span className="font-bold">{item.quantity}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Note */}
                        {order.notes && (
                          <div className="mb-4 p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' }}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                              </svg>
                              <span className="text-[11px] font-semibold text-amber-700">Note</span>
                            </div>
                            <p className="text-[11px] text-amber-800">{order.notes}</p>
                          </div>
                        )}

                        {/* Pulsante Dettaglio */}
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleOpenDetail(order); }}
                          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                          style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', boxShadow: '0 4px 12px rgba(15,23,42,0.25)' }}
                        >
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span className="text-sm font-semibold text-white">Dettaglio Consegna</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Assegna Rider (Desktop) */}
      {showAssignModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {selectedOrder.riderName ? 'Gestisci Rider' : 'Assegna Rider'}
                  </h3>
                  <p className="text-orange-100 text-sm">{selectedOrder.propertyName}</p>
                </div>
                <button 
                  onClick={() => { setShowAssignModal(false); setSelectedOrder(null); }} 
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Rider attualmente assegnato - opzione rimuovi */}
              {selectedOrder.riderName && (
                <div className="mb-4 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 flex items-center justify-center shadow-md">
                        <span className="text-sm font-bold text-white">{getInitials(selectedOrder.riderName)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{selectedOrder.riderName}</p>
                        <p className="text-xs text-violet-600">Rider assegnato</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        handleRemoveRider(selectedOrder.id, selectedOrder.riderName!);
                        setShowAssignModal(false);
                        setSelectedOrder(null);
                      }}
                      disabled={assigning}
                      className="px-3 py-2 bg-red-100 text-red-600 text-sm font-bold rounded-xl hover:bg-red-200 transition-colors disabled:opacity-50"
                    >
                      ✕ Rimuovi
                    </button>
                  </div>
                </div>
              )}

              <p className="text-sm text-slate-500 mb-4">
                {selectedOrder.riderName ? 'Cambia rider per questa consegna' : 'Seleziona un rider per questa consegna'}
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {riders.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <p>Nessun rider disponibile</p>
                  </div>
                ) : (
                  riders.map((rider, index) => (
                    <button
                      key={rider.id}
                      onClick={() => handleAssignRider(rider.id)}
                      disabled={assigning || rider.id === selectedOrder.riderId}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all disabled:opacity-50 ${
                        rider.id === selectedOrder.riderId 
                          ? 'border-violet-300 bg-violet-50 cursor-default' 
                          : 'border-slate-200 hover:border-orange-400 hover:bg-orange-50'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-r ${riderColors[index % riderColors.length]} flex items-center justify-center shadow-md`}>
                        <span className="text-sm font-bold text-white">{getInitials(rider.name)}</span>
                      </div>
                      <span className="font-medium text-slate-800">{rider.name}</span>
                      {rider.id === selectedOrder.riderId && (
                        <span className="ml-auto text-xs font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">Attuale</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => { setShowAssignModal(false); setSelectedOrder(null); }} 
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MODAL CONFERMA URGENZA - Premium Design 🚨
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
      {showUrgencyModal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={() => !urgencyLoading && setShowUrgencyModal(false)}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden pointer-events-auto">
              {/* Header con animazione pulse */}
              <div className="relative bg-gradient-to-r from-red-500 via-rose-500 to-orange-500 p-6 overflow-hidden">
                {/* Cerchi animati di sfondo */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full animate-pulse" />
                <div className="absolute -bottom-5 -left-5 w-20 h-20 bg-white/10 rounded-full animate-pulse delay-150" />
                
                <div className="relative flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                    <span className="text-4xl animate-bounce">🚨</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Rendi Urgente</h3>
                    <p className="text-white/80 text-sm">Conferma l'azione</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="bg-slate-50 rounded-2xl p-4 mb-5">
                  <p className="text-sm text-slate-500 mb-1">Ordine per:</p>
                  <p className="font-bold text-slate-800 text-lg">{urgencyOrderName}</p>
                </div>
                
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📢</span>
                    <div>
                      <p className="font-semibold text-amber-800 text-sm">Attenzione</p>
                      <p className="text-amber-700 text-sm mt-1">
                        Tutti i rider riceveranno una <strong>notifica immediata</strong> per questo ordine urgente.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottoni */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowUrgencyModal(false);
                      setUrgencyOrderId(null);
                      setUrgencyOrderName("");
                    }}
                    disabled={urgencyLoading}
                    className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={confirmUrgency}
                    disabled={urgencyLoading}
                    className="flex-1 py-3.5 bg-gradient-to-r from-red-500 to-rose-500 text-white font-bold rounded-2xl shadow-lg shadow-red-500/30 hover:shadow-red-500/40 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {urgencyLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Invio...</span>
                      </>
                    ) : (
                      <>
                        <span>🚨</span>
                        <span>Conferma Urgente</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>

      {/* 🆕 Modal Dettaglio Ordine */}
      <OrderDetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setDetailOrder(null); }}
        order={detailOrder}
        userRole="ADMIN"
        riders={riders}
        inventory={inventory}
        onOrderUpdate={() => {
          onOrdersUpdate?.();
          // Aggiorna l'ordine nello stato locale se ancora aperto
          if (detailOrder) {
            const updatedOrder = orders.find(o => o.id === detailOrder.id);
            if (updatedOrder) setDetailOrder(updatedOrder);
          }
        }}
        onOrderDelete={() => {
          onOrdersUpdate?.();
        }}
      />

      {/* 📦 Modal Riepilogo Biancheria */}
      {renderLinenSummaryModal()}

      {/* ⏰ Modal Orario — solo per consegne Solo Biancheria */}
      {showTimeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTimeModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Orario Consegna</p>
                <p className="text-xs text-slate-500">{timeModalOrderName}</p>
              </div>
            </div>
            <input
              type="time"
              value={timeModalValue}
              onChange={(e) => setTimeModalValue(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-center focus:border-blue-400 outline-none mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowTimeModal(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl active:scale-95 transition-transform"
              >
                Annulla
              </button>
              <button
                onClick={handleSaveTime}
                disabled={savingTime}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
              >
                {savingTime ? "..." : "Salva"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
