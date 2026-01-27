"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import NewCleaningModal from "~/components/NewCleaningModal";

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  photos?: string[];
}

interface Operator {
  id: string;
  name: string | null;
}

interface Booking {
  id: string;
  guestsCount: number;
}

interface Cleaning {
  id: string;
  date: Date | string;
  status: string;
  scheduledTime?: string | null;
  guestsCount?: number | null;
  property: Property;
  operator?: Operator | null;
  booking?: Booking | null;
  type?: string;
}

interface Order {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress?: string;
  scheduledDate: Date | string;
  scheduledTime?: string;
  status: string;
  items: { id: string; name: string; quantity: number }[];
  cleaningId?: string | null;
  riderName?: string | null;
}

interface PulizieClientProps {
  upcomingCleanings: Cleaning[];
  pastCleanings: Cleaning[];
  ownerId?: string;
  propertyIds?: string[];
}

const Icons = {
  calendar: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  users: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  plus: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  clean: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>,
  linen: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  building: <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21" /></svg>,
  sparkle: <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>,
  truck: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  close: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  check: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
};

export function PulizieClient({ upcomingCleanings, pastCleanings, ownerId, propertyIds = [] }: PulizieClientProps) {
  const searchParams = useSearchParams();
  const urlDate = searchParams.get('date');
  const highlightId = searchParams.get('highlight');
  const urlTab = searchParams.get('tab');
  
  const [activeTab, setActiveTab] = useState<"cleanings" | "orders">(urlTab === "orders" ? "orders" : "cleanings");
  const [showNewCleaningModal, setShowNewCleaningModal] = useState(false);
  const [modalRequestType, setModalRequestType] = useState<"cleaning" | "linen_only">("cleaning");
  
  // Ordini biancheria (senza pulizia collegata)
  const [standaloneOrders, setStandaloneOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  
  // Modal dettaglio
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailItem, setDetailItem] = useState<Cleaning | Order | null>(null);
  const [detailType, setDetailType] = useState<"cleaning" | "order">("cleaning");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Carica ordini biancheria standalone
  useEffect(() => {
    if (propertyIds.length === 0) {
      setLoadingOrders(false);
      return;
    }

    // Dividi propertyIds in chunks di 10 (limite Firestore per "in")
    const chunks: string[][] = [];
    for (let i = 0; i < propertyIds.length; i += 10) {
      chunks.push(propertyIds.slice(i, i + 10));
    }

    const unsubscribes: (() => void)[] = [];
    let allOrders: Order[] = [];

    chunks.forEach((chunk) => {
      const ordersQuery = query(
        collection(db, "orders"),
        where("propertyId", "in", chunk)
      );

      const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
        const chunkOrders = snapshot.docs
          .filter(doc => !doc.data().cleaningId) // Solo ordini senza pulizia
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              propertyId: data.propertyId,
              propertyName: data.propertyName || "Proprietà",
              propertyAddress: data.propertyAddress || "",
              scheduledDate: data.scheduledDate?.toDate?.() || new Date(),
              scheduledTime: data.scheduledTime || "10:00",
              status: data.status || "PENDING",
              items: data.items || [],
              cleaningId: data.cleaningId || null,
              riderName: data.riderName || null,
            };
          });

        // Aggiorna ordini
        setStandaloneOrders(prev => {
          const otherOrders = prev.filter(o => !chunk.includes(o.propertyId));
          const combined = [...otherOrders, ...chunkOrders];
          combined.sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
          return combined;
        });
        
        setLoadingOrders(false);
      });

      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [propertyIds]);

  // Gestisci highlight da URL
  useEffect(() => {
    if (highlightId) {
      // Cerca prima nelle pulizie
      const cleaning = [...upcomingCleanings, ...pastCleanings].find(c => c.id === highlightId);
      if (cleaning) {
        setDetailItem(cleaning);
        setDetailType("cleaning");
        setShowDetailModal(true);
        setActiveTab("cleanings");
      } else {
        // Cerca negli ordini
        const order = standaloneOrders.find(o => o.id === highlightId);
        if (order) {
          setDetailItem(order);
          setDetailType("order");
          setShowDetailModal(true);
          setActiveTab("orders");
        }
      }
      
      // Rimuovi parametro dall'URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [highlightId, upcomingCleanings, pastCleanings, standaloneOrders]);

  const getStatusConfig = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
      case "delivered":
        return { label: status === "delivered" ? "Consegnato" : "Completata", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" };
      case "in_progress":
      case "in_transit":
        return { label: status === "in_transit" ? "In consegna" : "In corso", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" };
      case "assigned":
        return { label: "Assegnato", bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" };
      case "scheduled":
      case "pending":
      default:
        return { label: status === "pending" ? "In attesa" : "Programmata", bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500" };
    }
  };

  const handleNewCleaning = () => {
    setModalRequestType("cleaning");
    setShowNewCleaningModal(true);
  };

  const handleRequestLinen = () => {
    setModalRequestType("linen_only");
    setShowNewCleaningModal(true);
  };

  const handleModalClose = () => {
    setShowNewCleaningModal(false);
  };

  const handleSuccess = () => {
    setShowNewCleaningModal(false);
    window.location.reload();
  };

  const openCleaningDetail = (cleaning: Cleaning) => {
    setDetailItem(cleaning);
    setDetailType("cleaning");
    setShowDetailModal(true);
  };

  const openOrderDetail = (order: Order) => {
    setDetailItem(order);
    setDetailType("order");
    setShowDetailModal(true);
  };

  const upcomingOrders = standaloneOrders.filter(o => {
    const orderDate = new Date(o.scheduledDate);
    orderDate.setHours(0, 0, 0, 0);
    return orderDate >= today && o.status !== "DELIVERED";
  });

  const pastOrders = standaloneOrders.filter(o => {
    const orderDate = new Date(o.scheduledDate);
    orderDate.setHours(0, 0, 0, 0);
    return orderDate < today || o.status === "DELIVERED";
  });

  return (
    <div className="p-4 lg:p-8">
      {/* Header con pulsanti */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">I Miei Servizi</h1>
            <p className="text-slate-500 mt-1">Pulizie e consegne biancheria</p>
          </div>
          
          {/* Pulsanti azione */}
          <div className="flex gap-2">
            <button
              onClick={handleRequestLinen}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
            >
              {Icons.linen}
              <span className="hidden sm:inline">Richiedi Biancheria</span>
              <span className="sm:hidden">Biancheria</span>
            </button>
            <button
              onClick={handleNewCleaning}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl font-medium text-sm hover:from-sky-600 hover:to-sky-700 transition-all active:scale-95 shadow-md"
            >
              {Icons.plus}
              <span className="hidden sm:inline">Nuova Pulizia</span>
              <span className="sm:hidden">Pulizia</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs principali */}
      <div className="mb-6">
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
          <button 
            onClick={() => setActiveTab("cleanings")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === "cleanings" 
                ? "bg-white text-slate-800 shadow-sm" 
                : "text-slate-600 hover:text-slate-800"
            }`}
          >
            {Icons.clean}
            <span>Pulizie</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === "cleanings" ? "bg-sky-100 text-sky-700" : "bg-slate-200 text-slate-600"}`}>
              {upcomingCleanings.length}
            </span>
          </button>
          <button 
            onClick={() => setActiveTab("orders")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === "orders" 
                ? "bg-white text-slate-800 shadow-sm" 
                : "text-slate-600 hover:text-slate-800"
            }`}
          >
            {Icons.truck}
            <span>Consegne</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === "orders" ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-600"}`}>
              {upcomingOrders.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB PULIZIE */}
      {activeTab === "cleanings" && (
        <>
          {upcomingCleanings.length > 0 ? (
            <div className="space-y-3">
              {upcomingCleanings.map((cleaning) => {
                const cleaningDate = new Date(cleaning.date);
                const isToday = cleaningDate.toDateString() === today.toDateString();
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const isTomorrow = cleaningDate.toDateString() === tomorrow.toDateString();
                const statusConfig = getStatusConfig(cleaning.status);

                return (
                  <div
                    key={cleaning.id}
                    onClick={() => openCleaningDetail(cleaning)}
                    className="flex gap-4 bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-lg hover:border-sky-200 transition-all cursor-pointer"
                  >
                    {/* Indicatore tipo */}
                    <div className="w-1 rounded-full bg-gradient-to-b from-sky-400 to-sky-600 flex-shrink-0"></div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-800">{cleaning.property.name}</h3>
                          <p className="text-sm text-slate-500 truncate">{cleaning.property.address}</p>
                        </div>
                        <span className={`px-2 py-1 ${statusConfig.bg} ${statusConfig.text} text-xs font-medium rounded-lg flex-shrink-0`}>
                          {statusConfig.label}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                        <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${isToday ? "bg-emerald-50 text-emerald-700" : isTomorrow ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`}>
                          {Icons.calendar}
                          <span className="font-medium">
                            {isToday ? "Oggi" : isTomorrow ? "Domani" : cleaningDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span>{cleaning.scheduledTime || "10:00"}</span>
                        </span>
                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 text-slate-600">
                          {Icons.users}
                          {cleaning.guestsCount ?? "N/D"} ospiti
                        </span>
                      </div>
                    </div>

                    {/* Freccia */}
                    <div className="flex items-center text-slate-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                {Icons.sparkle}
              </div>
              <p className="text-slate-600 font-medium">Nessuna pulizia programmata</p>
              <p className="text-sm text-slate-500 mt-1">Le prossime pulizie appariranno qui</p>
              <button
                onClick={handleNewCleaning}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl font-medium text-sm"
              >
                {Icons.plus}
                <span>Programma una pulizia</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* TAB CONSEGNE */}
      {activeTab === "orders" && (
        <>
          {loadingOrders ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-orange-500"></div>
            </div>
          ) : upcomingOrders.length > 0 ? (
            <div className="space-y-3">
              {upcomingOrders.map((order) => {
                const orderDate = new Date(order.scheduledDate);
                const isToday = orderDate.toDateString() === today.toDateString();
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const isTomorrow = orderDate.toDateString() === tomorrow.toDateString();
                const statusConfig = getStatusConfig(order.status);
                const totalItems = order.items.reduce((sum, i) => sum + i.quantity, 0);

                return (
                  <div
                    key={order.id}
                    onClick={() => openOrderDetail(order)}
                    className="flex gap-4 bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-lg hover:border-orange-200 transition-all cursor-pointer"
                  >
                    {/* Indicatore tipo */}
                    <div className="w-1 rounded-full bg-gradient-to-b from-orange-400 to-red-500 flex-shrink-0"></div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-800">{order.propertyName}</h3>
                          <p className="text-sm text-slate-500 truncate">{order.propertyAddress}</p>
                        </div>
                        <span className={`px-2 py-1 ${statusConfig.bg} ${statusConfig.text} text-xs font-medium rounded-lg flex-shrink-0`}>
                          {statusConfig.label}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                        <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${isToday ? "bg-emerald-50 text-emerald-700" : isTomorrow ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`}>
                          {Icons.calendar}
                          <span className="font-medium">
                            {isToday ? "Oggi" : isTomorrow ? "Domani" : orderDate.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span>{order.scheduledTime || "10:00"}</span>
                        </span>
                        <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-orange-50 text-orange-700">
                          {Icons.linen}
                          {totalItems} articoli
                        </span>
                        {order.riderName && (
                          <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 text-blue-700">
                            {Icons.truck}
                            {order.riderName}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Freccia */}
                    <div className="flex items-center text-slate-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
                {Icons.truck}
              </div>
              <p className="text-slate-600 font-medium">Nessuna consegna in programma</p>
              <p className="text-sm text-slate-500 mt-1">Le consegne di biancheria appariranno qui</p>
              <button
                onClick={handleRequestLinen}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-medium text-sm"
              >
                {Icons.linen}
                <span>Richiedi biancheria</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal Nuova Pulizia / Richiedi Biancheria */}
      <NewCleaningModal
        isOpen={showNewCleaningModal}
        onClose={handleModalClose}
        onSuccess={handleSuccess}
        userRole="PROPRIETARIO"
        ownerId={ownerId}
        defaultRequestType={modalRequestType}
      />

      {/* Modal Dettaglio */}
      {showDetailModal && detailItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className={`px-5 py-4 ${detailType === "cleaning" ? "bg-gradient-to-r from-sky-500 to-sky-600" : "bg-gradient-to-r from-orange-500 to-red-500"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="text-xl">{detailType === "cleaning" ? "🧹" : "📦"}</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {detailType === "cleaning" ? "Dettaglio Pulizia" : "Dettaglio Consegna"}
                    </h2>
                    <p className="text-xs text-white/80">
                      {detailType === "cleaning" 
                        ? (detailItem as Cleaning).property?.name 
                        : (detailItem as Order).propertyName}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowDetailModal(false)} 
                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30"
                >
                  {Icons.close}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              {detailType === "cleaning" ? (
                // Dettaglio Pulizia
                <>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-sm text-slate-600">Stato</span>
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusConfig((detailItem as Cleaning).status).bg} ${getStatusConfig((detailItem as Cleaning).status).text}`}>
                        {getStatusConfig((detailItem as Cleaning).status).label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-sm text-slate-600">Data</span>
                      <span className="font-medium text-slate-800">
                        {new Date((detailItem as Cleaning).date).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-sm text-slate-600">Orario</span>
                      <span className="font-medium text-slate-800">{(detailItem as Cleaning).scheduledTime || "10:00"}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-sm text-slate-600">Ospiti</span>
                      <span className="font-medium text-slate-800">{(detailItem as Cleaning).guestsCount ?? "N/D"}</span>
                    </div>
                    {(detailItem as Cleaning).operator && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <span className="text-sm text-slate-600">Operatore</span>
                        <span className="font-medium text-slate-800">{(detailItem as Cleaning).operator?.name || "Non assegnato"}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                // Dettaglio Ordine
                <>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-sm text-slate-600">Stato</span>
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusConfig((detailItem as Order).status).bg} ${getStatusConfig((detailItem as Order).status).text}`}>
                        {getStatusConfig((detailItem as Order).status).label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-sm text-slate-600">Data consegna</span>
                      <span className="font-medium text-slate-800">
                        {new Date((detailItem as Order).scheduledDate).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                      </span>
                    </div>
                    {(detailItem as Order).riderName && (
                      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <span className="text-sm text-slate-600">Rider</span>
                        <span className="font-medium text-slate-800">{(detailItem as Order).riderName}</span>
                      </div>
                    )}
                    
                    {/* Lista articoli */}
                    <div className="mt-4">
                      <h3 className="font-semibold text-slate-800 mb-3">Articoli ordinati</h3>
                      <div className="space-y-2">
                        {(detailItem as Order).items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-orange-50 rounded-xl">
                            <span className="text-sm text-slate-700">{item.name}</span>
                            <span className="font-bold text-orange-600">×{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setShowDetailModal(false)}
                className="w-full py-3 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
