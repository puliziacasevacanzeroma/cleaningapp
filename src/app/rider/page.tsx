"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface Order {
  id: string;
  propertyName?: string;
  propertyAddress?: string;
  riderId?: string;
  status: string;
  items: { id: string; name: string; quantity: number }[];
  createdAt: any;
}

export default function RiderDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();

  useEffect(() => {
    async function loadOrders() {
      try {
        const snapshot = await getDocs(collection(db, "orders"));
        let allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        
        const filtered = allOrders.filter(o => 
          o.riderId === user?.id || !o.riderId
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
    if (user) loadOrders();
  }, [user]);

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
      default:
        return "Da Consegnare";
    }
  };

  return (
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
            {(pendingOrders.length > 0 || inProgressOrders.length > 0) && (
              <div>
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Da Consegnare</h2>
                <div className="space-y-3">
                  {[...inProgressOrders, ...pendingOrders].map((order) => (
                    <div key={order.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-slate-800">{order.propertyName || "Proprietà"}</h3>
                          {order.propertyAddress && (
                            <p className="text-sm text-slate-500">{order.propertyAddress}</p>
                          )}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {getStatusText(order.status)}
                        </span>
                      </div>
                      {order.items?.length > 0 && (
                        <div className="bg-slate-50 rounded-xl p-3 mb-3">
                          {order.items.slice(0, 3).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span>{item.name}</span>
                              <span className="font-medium">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-medium">
                        {order.status === "IN_PROGRESS" ? "✓ Segna Consegnato" : "🚴 Inizia Consegna"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completedOrders.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Consegnati</h2>
                <div className="space-y-3">
                  {completedOrders.slice(0, 5).map((order) => (
                    <div key={order.id} className="bg-white rounded-2xl border border-slate-200 p-4 opacity-75">
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
  );
}
