"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Property {
  id: string;
  name: string;
  address: string;
  ownerName: string;
  ownerEmail: string;
  ownerId: string;
  createdAt: string;
  deactivationRequested?: boolean;
}

export default function ProprietaPendingPage() {
  const [pendingProperties, setPendingProperties] = useState<Property[]>([]);
  const [deactivationRequests, setDeactivationRequests] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'new' | 'deactivation'>('new');

  useEffect(() => {
    fetch("/api/properties/list")
      .then(res => res.json())
      .then(data => {
        setPendingProperties(data.pendingProperties || []);
        setDeactivationRequests(data.deactivationRequests || []);
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
      setPendingProperties(prev => prev.filter(p => p.id !== id));
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
      setPendingProperties(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error("Errore rifiuto:", error);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      const response = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "INACTIVE", deactivationRequested: false }),
      });
      
      if (response.ok) {
        setDeactivationRequests(prev => prev.filter(p => p.id !== id));
        // Invia notifica al proprietario
        const property = deactivationRequests.find(p => p.id === id);
        if (property) {
          await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'PROPERTY_DEACTIVATED',
              propertyId: id,
              propertyName: property.name,
              recipientId: property.ownerId,
            }),
          });
        }
      }
    } catch (error) {
      console.error("Errore disattivazione:", error);
    }
  };

  const handleRejectDeactivation = async (id: string) => {
    try {
      await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivationRequested: false }),
      });
      setDeactivationRequests(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error("Errore rifiuto disattivazione:", error);
    }
  };

  const totalPending = pendingProperties.length + deactivationRequests.length;

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
          Richieste in Attesa
        </h1>
        <p className="text-slate-500">{totalPending} richieste da gestire</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('new')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'new' 
              ? 'bg-emerald-500 text-white' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Nuove Proprietà ({pendingProperties.length})
        </button>
        <button
          onClick={() => setActiveTab('deactivation')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'deactivation' 
              ? 'bg-red-500 text-white' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Richieste Disattivazione ({deactivationRequests.length})
        </button>
      </div>

      {/* Nuove Proprietà */}
      {activeTab === 'new' && (
        <>
          {pendingProperties.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-slate-500">Nessuna nuova proprietà in attesa di approvazione</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingProperties.map((property) => (
                <div key={property.id} className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-xs font-medium rounded-full">Nuova</span>
                      </div>
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
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors"
                      >
                        Rifiuta
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Richieste Disattivazione */}
      {activeTab === 'deactivation' && (
        <>
          {deactivationRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-slate-500">Nessuna richiesta di disattivazione in attesa</p>
            </div>
          ) : (
            <div className="space-y-4">
              {deactivationRequests.map((property) => (
                <div key={property.id} className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">Richiesta Disattivazione</span>
                      </div>
                      <h3 className="font-semibold text-slate-800">{property.name}</h3>
                      <p className="text-sm text-slate-500">{property.address}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Proprietario: {property.ownerName || property.ownerEmail || "-"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeactivate(property.id)}
                        className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors"
                      >
                        Disattiva
                      </button>
                      <button
                        onClick={() => handleRejectDeactivation(property.id)}
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors"
                      >
                        Rifiuta
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}