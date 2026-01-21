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
  status: string;
  createdAt: string;
  deactivationRequested?: boolean;
}

export default function ProprietaPendingPage() {
  const [pendingProperties, setPendingProperties] = useState<Property[]>([]);
  const [deactivationRequests, setDeactivationRequests] = useState<Property[]>([]);
  const [inactiveProperties, setInactiveProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'new' | 'deactivation' | 'inactive'>('new');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    fetch("/api/properties/list")
      .then(res => res.json())
      .then(data => {
        console.log("📦 Dati caricati:", data);
        setPendingProperties(data.pendingProperties || []);
        setDeactivationRequests(data.deactivationRequests || []);
        setInactiveProperties(data.suspendedProperties || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Errore:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      if (res.ok) {
        setPendingProperties(prev => prev.filter(p => p.id !== id));
      } else {
        alert("Errore nell'approvazione");
      }
    } catch (error) {
      console.error("Errore approvazione:", error);
      alert("Errore nell'approvazione");
    }
    setActionLoading(null);
  };

  const handleReject = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questa proprietà?")) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPendingProperties(prev => prev.filter(p => p.id !== id));
      } else {
        alert("Errore nell'eliminazione");
      }
    } catch (error) {
      console.error("Errore rifiuto:", error);
      alert("Errore nell'eliminazione");
    }
    setActionLoading(null);
  };

  const handleDeactivate = async (id: string) => {
    setActionLoading(id);
    try {
      const response = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "INACTIVE", deactivationRequested: false }),
      });
      
      if (response.ok) {
        const property = deactivationRequests.find(p => p.id === id);
        setDeactivationRequests(prev => prev.filter(p => p.id !== id));
        // Aggiungi alla lista inactive
        if (property) {
          setInactiveProperties(prev => [...prev, { ...property, status: "INACTIVE" }]);
        }
      } else {
        alert("Errore nella disattivazione");
      }
    } catch (error) {
      console.error("Errore disattivazione:", error);
      alert("Errore nella disattivazione");
    }
    setActionLoading(null);
  };

  const handleRejectDeactivation = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivationRequested: false }),
      });
      if (res.ok) {
        setDeactivationRequests(prev => prev.filter(p => p.id !== id));
      } else {
        alert("Errore nel rifiuto");
      }
    } catch (error) {
      console.error("Errore rifiuto disattivazione:", error);
      alert("Errore nel rifiuto");
    }
    setActionLoading(null);
  };

  const handleReactivate = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE", deactivationRequested: false }),
      });
      if (res.ok) {
        setInactiveProperties(prev => prev.filter(p => p.id !== id));
      } else {
        alert("Errore nella riattivazione");
      }
    } catch (error) {
      console.error("Errore riattivazione:", error);
      alert("Errore nella riattivazione");
    }
    setActionLoading(null);
  };

  const handleDeletePermanent = async (id: string) => {
    if (!confirm("⚠️ ATTENZIONE: Questa azione eliminerà PERMANENTEMENTE la proprietà. Continuare?")) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setInactiveProperties(prev => prev.filter(p => p.id !== id));
        setDeactivationRequests(prev => prev.filter(p => p.id !== id));
        setPendingProperties(prev => prev.filter(p => p.id !== id));
      } else {
        alert("Errore nell'eliminazione");
      }
    } catch (error) {
      console.error("Errore eliminazione:", error);
      alert("Errore nell'eliminazione");
    }
    setActionLoading(null);
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
          Gestione Richieste
        </h1>
        <p className="text-slate-500">{totalPending} richieste da gestire • {inactiveProperties.length} disattivate</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveTab('new')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'new' 
              ? 'bg-emerald-500 text-white' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          🆕 Nuove ({pendingProperties.length})
        </button>
        <button
          onClick={() => setActiveTab('deactivation')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'deactivation' 
              ? 'bg-amber-500 text-white' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          ⏳ Richieste Disattivazione ({deactivationRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('inactive')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'inactive' 
              ? 'bg-slate-600 text-white' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          🚫 Disattivate ({inactiveProperties.length})
        </button>
        <button
          onClick={loadData}
          className="ml-auto px-4 py-2 rounded-xl font-medium text-sm bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          🔄 Ricarica
        </button>
      </div>

      {/* Nuove Proprietà */}
      {activeTab === 'new' && (
        <>
          {pendingProperties.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="text-3xl">✅</span>
              </div>
              <p className="text-slate-500">Nessuna nuova proprietà in attesa</p>
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
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === property.id ? "..." : "✓ Approva"}
                      </button>
                      <button
                        onClick={() => handleReject(property.id)}
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        🗑 Elimina
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
                <span className="text-3xl">✅</span>
              </div>
              <p className="text-slate-500">Nessuna richiesta di disattivazione in attesa</p>
            </div>
          ) : (
            <div className="space-y-4">
              {deactivationRequests.map((property) => (
                <div key={property.id} className="bg-white rounded-2xl border border-amber-100 shadow-sm p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-600 text-xs font-medium rounded-full">Richiesta Disattivazione</span>
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
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === property.id ? "..." : "🚫 Disattiva"}
                      </button>
                      <button
                        onClick={() => handleRejectDeactivation(property.id)}
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors disabled:opacity-50"
                      >
                        ✗ Rifiuta
                      </button>
                      <button
                        onClick={() => handleDeletePermanent(property.id)}
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-red-100 text-red-600 rounded-xl font-medium hover:bg-red-200 transition-colors disabled:opacity-50"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Proprietà Disattivate */}
      {activeTab === 'inactive' && (
        <>
          {inactiveProperties.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <span className="text-3xl">📭</span>
              </div>
              <p className="text-slate-500">Nessuna proprietà disattivata</p>
            </div>
          ) : (
            <div className="space-y-4">
              {inactiveProperties.map((property) => (
                <div key={property.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 opacity-75">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs font-medium rounded-full">Disattivata</span>
                      </div>
                      <h3 className="font-semibold text-slate-600">{property.name}</h3>
                      <p className="text-sm text-slate-400">{property.address}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Proprietario: {property.ownerName || property.ownerEmail || "-"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReactivate(property.id)}
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === property.id ? "..." : "♻️ Riattiva"}
                      </button>
                      <button
                        onClick={() => handleDeletePermanent(property.id)}
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        🗑 Elimina
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