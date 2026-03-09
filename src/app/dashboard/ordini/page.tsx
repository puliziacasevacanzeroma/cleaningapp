"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Order {
  id: string;
  status: string;
  scheduledDate: string;
  property: { name: string; address: string };
  items: { id: string; name: string; quantity: number }[];
  rider?: { name: string };
}

export default function OrdiniPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/data")
      .then(res => res.json())
      .then(data => {
        setOrders(data.orders || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const pending = orders.filter((o) => o.status === "pending");
  const prepared = orders.filter((o) => o.status === "prepared");
  const inTransit = orders.filter((o) => o.status === "cargo" || o.status === "shipped");
  const delivered = orders.filter((o) => o.status === "delivered");

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "delivered": return { label: "Consegnato", bg: "bg-emerald-100", text: "text-emerald-700" };
      case "shipped": return { label: "In consegna", bg: "bg-amber-100", text: "text-amber-700" };
      case "cargo": return { label: "Caricato", bg: "bg-violet-100", text: "text-violet-700" };
      case "prepared": return { label: "Preparato", bg: "bg-sky-100", text: "text-sky-700" };
      default: return { label: "Da preparare", bg: "bg-rose-100", text: "text-rose-700" };
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-24 bg-slate-200 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Ordini Biancheria</h1>
          <p className="text-slate-500 mt-1">{orders.length} ordini totali</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-bold text-rose-600">{pending.length}</p>
          <p className="text-sm text-slate-500">Da preparare</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-bold text-sky-600">{prepared.length}</p>
          <p className="text-sm text-slate-500">Preparati</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-bold text-amber-600">{inTransit.length}</p>
          <p className="text-sm text-slate-500">In transito</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
          <p className="text-3xl font-bold text-emerald-600">{delivered.length}</p>
          <p className="text-sm text-slate-500">Consegnati</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Proprietà</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Data</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Articoli</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Rider</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Stato</th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-slate-600">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const statusConfig = getStatusConfig(order.status);
                return (
                  <tr key={order.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-6">
                      <div>
                        <p className="font-semibold text-slate-800">{order.property?.name || "-"}</p>
                        <p className="text-xs text-slate-500">{order.property?.address || ""}</p>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-600">
                      {order.scheduledDate ? new Date(order.scheduledDate).toLocaleDateString("it-IT") : "-"}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-wrap gap-1">
                        {order.items?.slice(0, 3).map((item) => (
                          <span key={item.id} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{item.name} x{item.quantity}</span>
                        ))}
                        {order.items?.length > 3 && <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">+{order.items.length - 3}</span>}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-600">{order.rider?.name || "-"}</td>
                    <td className="py-4 px-6">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>{statusConfig.label}</span>
                    </td>
                    <td className="py-4 px-6">
                      <Link href={`/dashboard/ordini/${order.id}`} className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors inline-block">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {orders.length === 0 && <div className="text-center py-12"><p className="text-slate-500">Nessun ordine</p></div>}
      </div>
    </div>
  );
}