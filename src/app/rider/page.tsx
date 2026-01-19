"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import Link from "next/link";

interface Order {
  id: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  riderId?: string;
  riderName?: string;
  status: string;
  scheduledDate?: any;
  items: { id: string; name: string; quantity: number }[];
  notes?: string;
  createdAt: any;
}

export default function RiderDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const today = new Date();

  useEffect(() => {
    async function loadOrders() {
      try {
        const snapshot = await getDocs(collection(db, "orders"));
        let allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        
        // Filtra per rider (assegnati a questo rider o non assegnati)
        const filtered = allOrders.filter(o => 
          o.riderId === user?.id || !o.riderId
        );
        
        // Ordina per data
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
    if (user) loadOrders();
  }, [user]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Errore logout:", error);
      setLoggingOut(false);
    }
  };

  const pendingOrders = orders.filter(o => o.status === "PENDING" || o.status === "ASSIGNED");
  const inProgressOrders = orders.filter(o => o.status === "IN_PROGRESS");
  const completedOrders = orders.filter(o => o.status === "DELIVERED" || o.status === "COMPLETED");

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DELIVERED":
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-700";
      case "IN_PROGRESS":
        return "bg-amber-100 text-amber-700";
      case "ASSIGNED":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "DELIVERED":
      case "COMPLETED":
        return "✓ Consegnato";
      case "IN_PROGRESS":
        return "In Consegna";
      case "ASSIGNED":
        return "Assegnato";
      default:
        return "Da Assegnare";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/30">
      {/* Header con Logout */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
                <span className="text-white text-lg">🚴</span>
              </div>
              <div>
                <h1 className="font-bold text-slate-800">Area Rider</h1>
                <p className="text-sm text-slate-500">{user?.name || "Rider"}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl transition-all disabled:opacity-50"
            >
              {loggingOut ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              )}
              <span className="font-medium">Esci</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
              Ciao, {user?.name?.split(" ")[0] || "Rider"}! 🚴
            </h1>
            <p className="text-slate-500 mt-1">
              {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
              <p className="text-3xl font-bold text-slate-800">{orders.length}</p>
              <p className="text-sm text-slate-500">Ordini Totali</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
              <p className="text-3xl font-bold text-amber-600">{pendingOrders.length + inProgressOrders.length}</p>
              <p className="text-sm text-slate-500">Da Consegnare</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
              <p className="text-3xl font-bold text-emerald-600">{completedOrders.length}</p>
              <p className="text-sm text-slate-500">Consegnati</p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border p-8 text-center shadow-sm">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
              <p className="text-slate-500 mt-3">Caricamento ordini...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📦</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessun ordine da consegnare!</h3>
              <p className="text-slate-500">Controlla più tardi per nuovi ordini 😊</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Ordini da Consegnare */}
              {(pendingOrders.length > 0 || inProgressOrders.length > 0) && (
                <div>
                  <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Da Consegnare ({pendingOrders.length + inProgressOrders.length})
                  </h2>
                  <div className="space-y-3">
                    {[...inProgressOrders, ...pendingOrders].map((order) => (
                      <div
                        key={order.id}
                        className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-all hover:border-orange-200"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-800">{order.propertyName || "Proprietà"}</h3>
                            {order.propertyAddress && (
                              <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {order.propertyAddress}
                              </p>
                            )}
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                            {getStatusText(order.status)}
                          </span>
                        </div>

                        {/* Items */}
                        <div className="bg-slate-50 rounded-xl p-3 mb-3">
                          <p className="text-xs text-slate-500 mb-2">Articoli da consegnare:</p>
                          <div className="space-y-1">
                            {order.items?.slice(0, 3).map((item, idx) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="text-slate-600">{item.name}</span>
                                <span className="font-medium text-slate-800">x{item.quantity}</span>
                              </div>
                            ))}
                            {order.items?.length > 3 && (
                              <p className="text-xs text-slate-400">+ altri {order.items.length - 3} articoli</p>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button className="flex-1 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-medium text-sm hover:shadow-lg transition-all">
                            {order.status === "IN_PROGRESS" ? "✓ Segna Consegnato" : "🚴 Inizia Consegna"}
                          </button>
                          <button className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-200 transition-all">
                            📍 Mappa
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ordini Completati */}
              {completedOrders.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Consegnati Oggi ({completedOrders.length})
                  </h2>
                  <div className="space-y-3">
                    {completedOrders.slice(0, 5).map((order) => (
                      <div
                        key={order.id}
                        className="bg-white rounded-2xl border border-slate-200 p-4 opacity-75"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-medium text-slate-700">{order.propertyName || "Proprietà"}</h3>
                            <p className="text-sm text-slate-400">{order.items?.length || 0} articoli</p>
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
    </div>
  );
}
