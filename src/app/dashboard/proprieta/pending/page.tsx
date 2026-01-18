"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Property {
  id: string;
  name: string;
  address: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
}

export default function ProprietaPendingPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/properties/list")
      .then(res => res.json())
      .then(data => {
        setProperties(data.pendingProperties || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await fetch(`/api/admin/properties/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      setProperties(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error("Errore approvazione:", error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await fetch(`/api/admin/properties/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED" }),
      });
      setProperties(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error("Errore rifiuto:", error);
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-64 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-slate-200 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <Link href="/dashboard/proprieta" className="text-sky-500 hover:underline text-sm">
          ← Torna alle proprietà
        </Link>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 mt-2">
          Proprietà in Attesa
        </h1>
        <p className="text-slate-500">{properties.length} proprietà da approvare</p>
      </div>

      {properties.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500">Nessuna proprietà in attesa di approvazione</p>
        </div>
      ) : (
        <div className="space-y-4">
          {properties.map((property) => (
            <div key={property.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-800">{property.name}</h3>
                  <p className="text-sm text-slate-500">{property.address}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Proprietario: {property.ownerName || property.ownerEmail || "-"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(property.id)}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
                  >
                    Approva
                  </button>
                  <button
                    onClick={() => handleReject(property.id)}
                    className="px-4 py-2 bg-rose-500 text-white rounded-xl font-medium hover:bg-rose-600 transition-colors"
                  >
                    Rifiuta
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}