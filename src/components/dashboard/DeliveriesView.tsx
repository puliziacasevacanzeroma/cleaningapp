"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import OrderDetailModal from "~/components/OrderDetailModal";

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
}

interface Rider {
  id: string;
  name: string;
}

interface InventoryItem {
  id: string;
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
}

export function DeliveriesView({ 
  orders: initialOrders, 
  riders, 
  selectedDate, 
  onDateChange,
  onOrdersUpdate,
  inventory = []
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

  // 🆕 Modal dettaglio ordine
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

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
          <span className="text-xs text-slate-400">{sortedOrders.length} consegne</span>
        </div>

        {/* Cards */}
        <div className="space-y-3 pb-24">
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
              const statusConfig = getStatusConfig(order.status);
              const isUrgent = order.urgency === 'urgent';
              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleOpenDetail(order)}
                  className={`bg-white rounded-2xl border overflow-hidden shadow-sm border-l-4 cursor-pointer active:scale-[0.98] transition-transform ${
                    isUrgent ? 'border-red-200 ring-2 ring-red-100 border-l-red-500' : `border-slate-100 ${statusConfig.borderColor}`
                  }`}
                >
                  {/* Badge Urgente */}
                  {isUrgent && (
                    <div className="bg-gradient-to-r from-red-500 to-rose-500 px-3 py-1.5 flex items-center gap-2">
                      <span className="text-white">🚨</span>
                      <span className="text-white text-xs font-bold">URGENTE</span>
                    </div>
                  )}
                  
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800 truncate">{order.propertyName}</h3>
                        <p className="text-xs text-slate-500 truncate">{order.propertyAddress}</p>
                        {order.propertyCity && (
                          <p className="text-xs text-slate-400">{order.propertyPostalCode} {order.propertyCity}</p>
                        )}
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusConfig.color}`}>
                        <span>{statusConfig.icon}</span>
                        <span>{statusConfig.label}</span>
                      </span>
                    </div>

                    {/* Orario Pulizia / Consegna */}
                    <div className={`rounded-xl p-2.5 mb-3 ${
                      order.cleaning 
                        ? 'bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200' 
                        : 'bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200'
                    }`}>
                      {order.cleaning ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">🧹</span>
                            <span className="text-xs font-semibold text-slate-700">
                              Pulizia: {order.cleaning.scheduledTime || order.scheduledTime || '--:--'}
                            </span>
                          </div>
                          <div className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
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
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-base">🛏️</span>
                          <span className="text-xs font-semibold text-sky-700">Solo Biancheria</span>
                          {order.scheduledTime && (
                            <span className="text-xs text-sky-600 ml-auto">
                              Consegna: {order.scheduledTime}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 📤 DA PORTARE */}
                    {order.items?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-semibold text-emerald-600 mb-1.5 flex items-center gap-1">
                          <span>📤</span> DA PORTARE ({order.items.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {order.items.slice(0, 3).map((item, idx) => (
                            <span key={idx} className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
                              {item.name} x{item.quantity}
                            </span>
                          ))}
                          {order.items.length > 3 && (
                            <span className="px-2 py-1 bg-emerald-100 rounded-lg text-xs text-emerald-600">
                              +{order.items.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 📥 DA RITIRARE */}
                    {order.includePickup !== false && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-orange-600 mb-1.5 flex items-center gap-1">
                          <span>📥</span> DA RITIRARE
                        </p>
                        {order.pickupItems && order.pickupItems.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {order.pickupItems.slice(0, 3).map((item, idx) => (
                              <span key={idx} className="px-2 py-1 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                                {item.name} x{item.quantity}
                              </span>
                            ))}
                            {order.pickupItems.length > 3 && (
                              <span className="px-2 py-1 bg-orange-100 rounded-lg text-xs text-orange-600">
                                +{order.pickupItems.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Nessun ritiro precedente</p>
                        )}
                      </div>
                    )}

                    {/* Nessun ritiro */}
                    {order.includePickup === false && (
                      <div className="mb-3">
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <span>📥</span> Nessun ritiro
                        </p>
                      </div>
                    )}

                    {/* Rider + Urgency */}
                    <div className="flex items-center justify-between gap-2">
                      {order.riderName ? (
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r ${getRiderColor(order.riderId)}`}>
                          <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-white">{getInitials(order.riderName)}</span>
                          </div>
                          <span className="text-sm font-medium text-white">{order.riderName}</span>
                          {/* Bottone X per rimuovere rider */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveRider(order.id, order.riderName || 'Rider');
                            }}
                            className="ml-1 w-5 h-5 rounded-full bg-white/20 hover:bg-red-500 flex items-center justify-center transition-colors"
                            title="Rimuovi rider"
                          >
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSelectedOrder(order); setShowAssignModal(true); }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-orange-400 hover:text-orange-600 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-sm font-medium">Assegna Rider</span>
                        </button>
                      )}
                      
                      {/* Bottone Toggle Urgenza */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isUrgent) {
                            removeUrgency(order.id);
                          } else {
                            openUrgencyModal(order.id, order.propertyName);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                          isUrgent 
                            ? 'bg-red-500 text-white hover:bg-red-600' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                        }`}
                        title={isUrgent ? 'Clicca per togliere urgenza' : 'Clicca per rendere urgente'}
                      >
                        {isUrgent ? '🚨 URGENTE' : '📦 Normale'}
                      </button>
                    </div>
                  </div>
                </motion.div>
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
                  <h3 className="text-lg font-bold text-slate-800">Assegna Rider</h3>
                  <p className="text-sm text-slate-500">{selectedOrder.propertyName}</p>
                </div>
                <div className="p-4 overflow-y-auto max-h-[45vh]">
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
                          disabled={assigning}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-orange-400 hover:bg-orange-50 transition-all disabled:opacity-50"
                        >
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-r ${riderColors[index % riderColors.length]} flex items-center justify-center shadow-md`}>
                            <span className="text-sm font-bold text-white">{getInitials(rider.name)}</span>
                          </div>
                          <span className="font-medium text-slate-800">{rider.name}</span>
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

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loadingOrders ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-slate-500">Caricamento consegne...</p>
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📦</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna consegna</h3>
            <p className="text-slate-500">Non ci sono consegne biancheria per questa data</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Proprietà</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Articoli</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Rider</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Stato</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {sortedOrders.map((order) => {
                  const statusConfig = getStatusConfig(order.status);
                  const isUrgent = order.urgency === 'urgent';
                  return (
                    <tr 
                      key={order.id} 
                      onClick={() => handleOpenDetail(order)}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${isUrgent ? 'bg-red-50/50' : ''}`}
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-start gap-2">
                          {/* Badge Urgenza Desktop */}
                          {isUrgent && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-red-500 to-rose-500 text-white text-[10px] font-bold rounded-lg whitespace-nowrap">
                              🚨 URGENTE
                            </span>
                          )}
                          <div>
                            <p className="font-semibold text-slate-800">{order.propertyName}</p>
                            <p className="text-xs text-slate-500">{order.propertyAddress}</p>
                            {order.propertyCity && (
                              <p className="text-xs text-slate-400">{order.propertyPostalCode} {order.propertyCity}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {order.items?.slice(0, 3).map((item, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                              {item.name} x{item.quantity}
                            </span>
                          ))}
                          {order.items?.length > 3 && (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-500 rounded text-xs">
                              +{order.items.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                        {order.riderName ? (
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r ${getRiderColor(order.riderId)}`}>
                            <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                              <span className="text-xs font-bold text-white">{getInitials(order.riderName)}</span>
                            </div>
                            <span className="text-sm font-medium text-white">{order.riderName}</span>
                            {/* Bottone X per rimuovere rider */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveRider(order.id, order.riderName || 'Rider');
                              }}
                              className="ml-1 w-5 h-5 rounded-full bg-white/20 hover:bg-red-500 flex items-center justify-center transition-colors"
                              title="Rimuovi rider"
                            >
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); setShowAssignModal(true); }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-orange-400 hover:text-orange-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="text-sm font-medium">Assegna</span>
                          </button>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                          <span>{statusConfig.icon}</span>
                          <span>{statusConfig.label}</span>
                        </span>
                      </td>
                      <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleOpenDetail(order); }}
                          className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                          title="Visualizza dettaglio"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                  <h3 className="text-lg font-bold text-white">Assegna Rider</h3>
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
              <p className="text-sm text-slate-500 mb-4">Seleziona un rider per questa consegna</p>

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
                      disabled={assigning}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-orange-400 hover:bg-orange-50 transition-all disabled:opacity-50"
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-r ${riderColors[index % riderColors.length]} flex items-center justify-center shadow-md`}>
                        <span className="text-sm font-bold text-white">{getInitials(rider.name)}</span>
                      </div>
                      <span className="font-medium text-slate-800">{rider.name}</span>
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
    </>
  );
}
