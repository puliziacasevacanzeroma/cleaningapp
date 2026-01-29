"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Order {
  id: string;
  status: string;
  scheduledDate: string;
  notes: string;
  property: { name: string; address: string };
  rider: { name: string } | null;
  items: { id: string; name: string; quantity: number }[];
}

export default function OrdineDetailPage() {
  const params = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetch(`/api/dashboard/orders/${params.id}`)
        .then(res => res.json())
        .then(data => {
          setOrder(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="h-64 bg-slate-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-4 lg:p-8">
        <div className="text-center py-12">
          <p className="text-slate-500">Ordine non trovato</p>
          <Link href="/dashboard/ordini" className="text-sky-500 hover:underline mt-2 inline-block">
            Torna agli ordini
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <Link href="/dashboard/ordini" className="text-sky-500 hover:underline text-sm">
          ← Torna agli ordini
        </Link>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 mt-2">
          Ordine #{order.id.slice(-6)}
        </h1>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="font-semibold text-slate-800 mb-2">Proprietà</h2>
            <p className="text-slate-600">{order.property?.name || "-"}</p>
            <p className="text-sm text-slate-500">{order.property?.address || ""}</p>
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 mb-2">Stato</h2>
            <span className="px-3 py-1 bg-sky-100 text-sky-700 rounded-full text-sm font-medium">
              {order.status}
            </span>
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 mb-2">Rider</h2>
            <p className="text-slate-600">{order.rider?.name || "Non assegnato"}</p>
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 mb-2">Data</h2>
            <p className="text-slate-600">
              {order.scheduledDate ? new Date(order.scheduledDate).toLocaleDateString("it-IT") : "-"}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200">
          <h2 className="font-semibold text-slate-800 mb-4">Articoli</h2>
          <div className="space-y-2">
            {order.items?.map((item) => (
              <div key={item.id} className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">{item.name}</span>
                <span className="font-medium text-slate-800">x{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}