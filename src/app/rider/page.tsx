"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, getDocs, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  checked?: boolean;
}

interface Order {
  id: string;
  propertyId?: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyPostalCode?: string;
  propertyFloor?: string;
  propertyAccessCode?: string;
  riderId?: string;
  status: string;
  items: OrderItem[];
  createdAt: any;
  scheduledDate?: string;
  notes?: string;
}

type DeliveryStep = "list" | "prepare" | "navigate" | "confirm";

export default function RiderDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [deliveryStep, setDeliveryStep] = useState<DeliveryStep>("list");
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const today = new Date();

  useEffect(() => {
    loadOrders();
  }, [user]);

  async function loadOrders() {
    if (!user) return;
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "orders"));
      let allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      // Filtra ordini per questo rider o non assegnati
      const filtered = allOrders.filter(o =>
        o.riderId === user?.id || !o.riderId || o.status === "PENDING"
      );

      filtered.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      setOrders(filtered);
    } catch (error) {
      console.error("Errore caricamento ordini:", error);
    } finally {
      setLoading(false);
    }
  }

  const pendingOrders = orders.filter(o => o.status === "PENDING" || o.status === "ASSIGNED");
  const inProgressOrders = orders.filter(o => o.status === "IN_PROGRESS" || o.status === "PICKING" || o.status === "IN_TRANSIT");
  const completedOrders = orders.filter(o => o.status === "DELIVERED" || o.status === "COMPLETED");

  // Inizia consegna - passa a preparazione sacco
  const handleStartDelivery = async (order: Order) => {
    setActiveOrder(order);
    setCheckedItems({});
    
    // Aggiorna stato a PICKING
    try {
      await updateDoc(doc(db, "orders", order.id), {
        status: "PICKING",
        riderId: user?.id,
        startedAt: Timestamp.now(),
      });
      
      setOrders(prev => prev.map(o => 
        o.id === order.id ? { ...o, status: "PICKING", riderId: user?.id } : o
      ));
    } catch (e) {
      console.error("Errore aggiornamento stato:", e);
    }
    
    setDeliveryStep("prepare");
  };

  // Tutti gli articoli sono stati spuntati?
  const allItemsChecked = activeOrder?.items?.every(item => checkedItems[item.id]) ?? false;

  // Conferma preparazione sacco - passa a navigazione
  const handleBagReady = async () => {
    if (!activeOrder || !allItemsChecked) return;
    
    setSaving(true);
    try {
      await updateDoc(doc(db, "orders", activeOrder.id), {
        status: "IN_TRANSIT",
        bagPreparedAt: Timestamp.now(),
      });
      
      setOrders(prev => prev.map(o => 
        o.id === activeOrder.id ? { ...o, status: "IN_TRANSIT" } : o
      ));
      
      setDeliveryStep("navigate");
    } catch (e) {
      console.error("Errore:", e);
    } finally {
      setSaving(false);
    }
  };

  // Sono arrivato - passa a conferma
  const handleArrived = () => {
    setDeliveryStep("confirm");
  };

  // Conferma consegna completata
  const handleDeliveryComplete = async () => {
    if (!activeOrder) return;
    
    setSaving(true);
    try {
      await updateDoc(doc(db, "orders", activeOrder.id), {
        status: "DELIVERED",
        deliveredAt: Timestamp.now(),
      });
      
      setOrders(prev => prev.map(o => 
        o.id === activeOrder.id ? { ...o, status: "DELIVERED" } : o
      ));
      
      // Torna alla lista
      setActiveOrder(null);
      setDeliveryStep("list");
      setCheckedItems({});
    } catch (e) {
      console.error("Errore:", e);
    } finally {
      setSaving(false);
    }
  };

  // Annulla e torna alla lista
  const handleCancel = () => {
    setActiveOrder(null);
    setDeliveryStep("list");
    setCheckedItems({});
  };

  // Apri Google Maps
  const openMaps = () => {
    if (!activeOrder) return;
    const address = `${activeOrder.propertyAddress || ''}, ${activeOrder.propertyPostalCode || ''} ${activeOrder.propertyCity || ''}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  // Chiama il numero (se disponibile)
  const callProperty = () => {
    // Per ora solo placeholder
    alert("Funzione chiamata non ancora implementata");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DELIVERED":
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-700";
      case "IN_PROGRESS":
      case "IN_TRANSIT":
        return "bg-blue-100 text-blue-700";
      case "PICKING":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "DELIVERED":
      case "COMPLETED":
        return "✓ Consegnato";
      case "IN_TRANSIT":
        return "🚴 In Viaggio";
      case "PICKING":
        return "📦 Preparazione";
      case "IN_PROGRESS":
        return "In Corso";
      default:
        return "Da Fare";
    }
  };

  // ==================== STEP: PREPARAZIONE SACCO ====================
  if (deliveryStep === "prepare" && activeOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-6 rounded-b-3xl shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={handleCancel} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold">📦 Prepara il Sacco</h1>
              <p className="text-white/80 text-sm">Spunta ogni articolo quando lo metti nel sacco</p>
            </div>
          </div>
          
          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-white/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${(Object.values(checkedItems).filter(Boolean).length / (activeOrder.items?.length || 1)) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium">
              {Object.values(checkedItems).filter(Boolean).length}/{activeOrder.items?.length || 0}
            </span>
          </div>
        </div>

        {/* Destinazione */}
        <div className="mx-4 -mt-4 bg-white rounded-2xl shadow-lg p-4 border border-amber-100">
          <p className="text-xs text-slate-500 mb-1">DESTINAZIONE</p>
          <p className="font-semibold text-slate-800">{activeOrder.propertyName}</p>
          <p className="text-sm text-slate-600">{activeOrder.propertyAddress}</p>
        </div>

        {/* Lista Articoli */}
        <div className="p-4 space-y-3 mt-4">
          <h2 className="font-semibold text-slate-700 mb-2">Articoli da preparare</h2>
          
          {activeOrder.items?.map((item, idx) => (
            <div 
              key={item.id || idx}
              onClick={() => setCheckedItems(prev => ({ ...prev, [item.id || idx]: !prev[item.id || idx] }))}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                checkedItems[item.id || idx] 
                  ? "bg-emerald-50 border-emerald-400" 
                  : "bg-white border-slate-200"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  checkedItems[item.id || idx] 
                    ? "bg-emerald-500 text-white" 
                    : "bg-slate-100 text-slate-400"
                }`}>
                  {checkedItems[item.id || idx] ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-bold">{idx + 1}</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className={`font-medium ${checkedItems[item.id || idx] ? "text-emerald-700 line-through" : "text-slate-800"}`}>
                    {item.name}
                  </p>
                </div>
                <div className={`px-3 py-1 rounded-lg font-bold ${
                  checkedItems[item.id || idx] 
                    ? "bg-emerald-100 text-emerald-700" 
                    : "bg-amber-100 text-amber-700"
                }`}>
                  x{item.quantity}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottone Conferma */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200">
          <button
            onClick={handleBagReady}
            disabled={!allItemsChecked || saving}
            className={`w-full py-4 rounded-2xl font-bold text-lg transition-all ${
              allItemsChecked 
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30" 
                : "bg-slate-200 text-slate-400"
            }`}
          >
            {saving ? "Salvataggio..." : allItemsChecked ? "✓ Sacco Pronto - Vai!" : `Spunta tutti gli articoli (${Object.values(checkedItems).filter(Boolean).length}/${activeOrder.items?.length || 0})`}
          </button>
        </div>
      </div>
    );
  }

  // ==================== STEP: NAVIGAZIONE ====================
  if (deliveryStep === "navigate" && activeOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-6 rounded-b-3xl shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setDeliveryStep("prepare")} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold">🚴 In Viaggio</h1>
              <p className="text-white/80 text-sm">Raggiungi la destinazione</p>
            </div>
          </div>
        </div>

        {/* Card Destinazione */}
        <div className="mx-4 -mt-6 bg-white rounded-2xl shadow-xl p-5 border border-blue-100">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl shadow-lg">
              🏠
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-lg text-slate-800">{activeOrder.propertyName}</h2>
              <p className="text-slate-600">{activeOrder.propertyAddress}</p>
              <p className="text-slate-500 text-sm">{activeOrder.propertyPostalCode} {activeOrder.propertyCity}</p>
            </div>
          </div>

          {/* Dettagli Accesso */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">PIANO</p>
              <p className="font-bold text-lg text-slate-800">{activeOrder.propertyFloor || "-"}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">CITOFONO / ACCESSO</p>
              <p className="font-bold text-lg text-slate-800">{activeOrder.propertyAccessCode || "-"}</p>
            </div>
          </div>

          {/* Note */}
          {activeOrder.notes && (
            <div className="bg-amber-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-amber-600 mb-1">📝 NOTE</p>
              <p className="text-sm text-amber-800">{activeOrder.notes}</p>
            </div>
          )}

          {/* Bottone Maps */}
          <button
            onClick={openMaps}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Apri in Google Maps
          </button>
        </div>

        {/* Riepilogo Articoli */}
        <div className="mx-4 mt-4 bg-white rounded-2xl shadow-lg p-4 border border-slate-200">
          <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>📦</span> Articoli nel sacco ({activeOrder.items?.length || 0})
          </h3>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {activeOrder.items?.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-slate-600">{item.name}</span>
                <span className="font-medium text-slate-800">x{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottone Sono Arrivato */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200">
          <button
            onClick={handleArrived}
            className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30"
          >
            📍 Sono Arrivato
          </button>
        </div>
      </div>
    );
  }

  // ==================== STEP: CONFERMA CONSEGNA ====================
  if (deliveryStep === "confirm" && activeOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-8 rounded-b-3xl shadow-lg text-center">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-5xl">🎉</span>
          </div>
          <h1 className="text-2xl font-bold">Conferma Consegna</h1>
          <p className="text-white/80 mt-1">Hai consegnato tutti gli articoli?</p>
        </div>

        {/* Riepilogo */}
        <div className="flex-1 p-4">
          <div className="bg-white rounded-2xl shadow-lg p-5 border border-emerald-100">
            <div className="text-center mb-6">
              <p className="text-slate-500 text-sm">Consegna per</p>
              <h2 className="font-bold text-xl text-slate-800">{activeOrder.propertyName}</h2>
              <p className="text-slate-600">{activeOrder.propertyAddress}</p>
            </div>

            <div className="bg-emerald-50 rounded-xl p-4 mb-4">
              <p className="text-sm font-medium text-emerald-700 mb-2">✓ Articoli Consegnati</p>
              <div className="space-y-1">
                {activeOrder.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-emerald-600">{item.name}</span>
                    <span className="font-medium text-emerald-700">x{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottoni */}
        <div className="p-4 space-y-3 bg-white border-t border-slate-200">
          <button
            onClick={handleDeliveryComplete}
            disabled={saving}
            className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30"
          >
            {saving ? "Conferma in corso..." : "✓ Confermo Consegna Completata"}
          </button>
          <button
            onClick={() => setDeliveryStep("navigate")}
            className="w-full py-3 rounded-xl font-medium text-slate-600 bg-slate-100"
          >
            ← Torna Indietro
          </button>
        </div>
      </div>
    );
  }

  // ==================== LISTA PRINCIPALE ====================
  return (
    <div className="p-4 lg:p-8 pb-24">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
            Ciao, {user?.name?.split(" ")[0] || "Rider"}! 🚴
          </h1>
          <p className="text-slate-500 mt-1">
            {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-slate-800">{orders.length}</p>
            <p className="text-xs text-slate-500">Totali</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-4 text-center shadow-lg shadow-orange-500/20">
            <p className="text-3xl font-bold text-white">{pendingOrders.length + inProgressOrders.length}</p>
            <p className="text-xs text-white/80">Da Fare</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-4 text-center shadow-lg shadow-emerald-500/20">
            <p className="text-3xl font-bold text-white">{completedOrders.length}</p>
            <p className="text-xs text-white/80">Fatte</p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border p-8 text-center shadow-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
            <p className="text-slate-500 mt-3">Caricamento consegne...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📦</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna consegna!</h3>
            <p className="text-slate-500">Controlla più tardi per nuovi ordini 😊</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Consegne da fare */}
            {(pendingOrders.length > 0 || inProgressOrders.length > 0) && (
              <div>
                <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="w-3 h-3 bg-amber-500 rounded-full animate-pulse"></span>
                  Da Consegnare ({pendingOrders.length + inProgressOrders.length})
                </h2>
                <div className="space-y-3">
                  {[...inProgressOrders, ...pendingOrders].map((order) => (
                    <div key={order.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-slate-800">{order.propertyName || "Proprietà"}</h3>
                            <p className="text-sm text-slate-500">{order.propertyAddress}</p>
                            {order.propertyCity && (
                              <p className="text-xs text-slate-400">{order.propertyPostalCode} {order.propertyCity}</p>
                            )}
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                            {getStatusText(order.status)}
                          </span>
                        </div>
                        
                        {/* Articoli preview */}
                        {order.items?.length > 0 && (
                          <div className="bg-slate-50 rounded-xl p-3 mb-3">
                            <p className="text-xs text-slate-500 mb-2">📦 {order.items.length} articoli</p>
                            <div className="flex flex-wrap gap-1">
                              {order.items.slice(0, 4).map((item, idx) => (
                                <span key={idx} className="px-2 py-1 bg-white rounded-lg text-xs text-slate-600 border">
                                  {item.name} x{item.quantity}
                                </span>
                              ))}
                              {order.items.length > 4 && (
                                <span className="px-2 py-1 bg-slate-200 rounded-lg text-xs text-slate-600">
                                  +{order.items.length - 4} altri
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Bottone azione */}
                        <button 
                          onClick={() => {
                            if (order.status === "PICKING") {
                              setActiveOrder(order);
                              setDeliveryStep("prepare");
                            } else if (order.status === "IN_TRANSIT") {
                              setActiveOrder(order);
                              setDeliveryStep("navigate");
                            } else {
                              handleStartDelivery(order);
                            }
                          }}
                          className={`w-full py-3 rounded-xl font-semibold transition-all ${
                            order.status === "IN_TRANSIT"
                              ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
                              : order.status === "PICKING"
                              ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                              : "bg-gradient-to-r from-orange-500 to-red-500 text-white"
                          }`}
                        >
                          {order.status === "IN_TRANSIT" 
                            ? "🚴 Continua Navigazione" 
                            : order.status === "PICKING"
                            ? "📦 Continua Preparazione"
                            : "🚴 Inizia Consegna"
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Consegne completate */}
            {completedOrders.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  Completate ({completedOrders.length})
                </h2>
                <div className="space-y-2">
                  {completedOrders.slice(0, 5).map((order) => (
                    <div key={order.id} className="bg-white rounded-xl border border-slate-200 p-3 opacity-75">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-medium text-slate-700">{order.propertyName || "Proprietà"}</h3>
                          <p className="text-xs text-slate-400">{order.items?.length || 0} articoli</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {getStatusText(order.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
