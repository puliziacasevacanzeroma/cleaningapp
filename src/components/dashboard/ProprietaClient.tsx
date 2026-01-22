"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ApprovePropertyButton } from "~/app/dashboard/ApprovePropertyButton";
import { CreaProprietaModal } from "./CreaProprietaModal";

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  status?: string;
  deactivationRequested?: boolean;
  owner?: { name: string | null; email?: string | null } | null;
  _count?: { bookings: number; cleanings: number };
  cleaningPrice?: number;
  monthlyTotal?: number;
  cleaningsThisMonth?: number;
  completedThisMonth?: number;
}

interface Proprietario {
  id: string;
  name: string | null;
  email: string | null;
}

interface ProprietaClientProps {
  activeProperties: Property[];
  pendingProperties: Property[];
  suspendedProperties?: Property[];
  proprietari?: Proprietario[];
}

// Componente per gestire richieste di disattivazione
function DeactivationRequestCard({ property, onAction }: { property: Property; onAction: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleDeactivate = async () => {
    setLoading(true);
    try {
      await fetch(`/api/properties/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "INACTIVE", deactivationRequested: false }),
      });
      onAction();
    } catch (error) {
      console.error("Errore disattivazione:", error);
    }
    setLoading(false);
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await fetch(`/api/properties/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivationRequested: false }),
      });
      onAction();
    } catch (error) {
      console.error("Errore rifiuto:", error);
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-xl border-2 border-red-200 overflow-hidden shadow-sm">
      <div className="bg-red-50 px-3 py-2 flex items-center gap-2">
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
        <span className="text-xs font-medium text-red-700">Richiesta Disattivazione</span>
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-slate-800">{property.name}</h3>
        <p className="text-sm text-slate-500 truncate">{property.address}, {property.city}</p>
        <p className="text-xs text-slate-400 mt-1">
          Proprietario: <span className="font-medium text-slate-600">{property.owner?.name || "N/D"}</span>
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleReject}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50"
          >
            ✗ Rifiuta
          </button>
          <button
            onClick={handleDeactivate}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50"
          >
            {loading ? "..." : "🚫 Disattiva"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProprietaClient({ activeProperties, pendingProperties, suspendedProperties = [], proprietari = [] }: ProprietaClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "pending" | "suspended">("active");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Separa nuove proprietà da richieste disattivazione
  const newProperties = pendingProperties.filter((p: any) => p.status === "PENDING" && !p.deactivationRequested);
  const deactivationRequests = pendingProperties.filter((p: any) => p.deactivationRequested === true);

  const colors = [
    { bg: "from-rose-500 to-pink-600" },
    { bg: "from-sky-500 to-blue-600" },
    { bg: "from-amber-500 to-orange-600" },
    { bg: "from-violet-500 to-purple-600" },
    { bg: "from-emerald-500 to-teal-600" },
    { bg: "from-cyan-500 to-blue-600" },
    { bg: "from-fuchsia-500 to-pink-600" },
    { bg: "from-lime-500 to-green-600" },
  ];

  const getColor = (index: number) => colors[index % colors.length];

  // Filtra proprietà attive
  const filteredActive = useMemo(() => {
    if (!searchTerm) return activeProperties;
    const term = searchTerm.toLowerCase();
    return activeProperties.filter(p => 
      p.name.toLowerCase().includes(term) ||
      p.address.toLowerCase().includes(term) ||
      p.city.toLowerCase().includes(term) ||
      p.owner?.name?.toLowerCase().includes(term)
    );
  }, [activeProperties, searchTerm]);

  // Filtra proprietà in attesa (solo nuove, non richieste disattivazione)
  const filteredPending = useMemo(() => {
    if (!searchTerm) return newProperties;
    const term = searchTerm.toLowerCase();
    return newProperties.filter(p => 
      p.name.toLowerCase().includes(term) ||
      p.address.toLowerCase().includes(term) ||
      p.city.toLowerCase().includes(term) ||
      p.owner?.name?.toLowerCase().includes(term)
    );
  }, [newProperties, searchTerm]);

  // Filtra richieste disattivazione
  const filteredDeactivation = useMemo(() => {
    if (!searchTerm) return deactivationRequests;
    const term = searchTerm.toLowerCase();
    return deactivationRequests.filter(p => 
      p.name.toLowerCase().includes(term) ||
      p.address.toLowerCase().includes(term) ||
      p.city.toLowerCase().includes(term) ||
      p.owner?.name?.toLowerCase().includes(term)
    );
  }, [deactivationRequests, searchTerm]);

  // Filtra proprietà sospese
  const filteredSuspended = useMemo(() => {
    if (!searchTerm) return suspendedProperties;
    const term = searchTerm.toLowerCase();
    return suspendedProperties.filter(p => 
      p.name.toLowerCase().includes(term) ||
      p.address.toLowerCase().includes(term) ||
      p.city.toLowerCase().includes(term) ||
      p.owner?.name?.toLowerCase().includes(term)
    );
  }, [suspendedProperties, searchTerm]);

  const totalBookings = activeProperties.reduce((sum, p) => sum + (p._count?.bookings || 0), 0);
  const totalCleanings = activeProperties.reduce((sum, p) => sum + (p._count?.cleanings || 0), 0);
  const totalPendingCount = newProperties.length + deactivationRequests.length;
  const hasPending = totalPendingCount > 0;
  const hasSuspended = suspendedProperties.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 pb-24">
      
      {/* ==================== MOBILE HEADER ==================== */}
      <div className="lg:hidden bg-white border-b border-slate-200">
        <div className="px-3 py-3">
          {/* Titolo + Add */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-800">Proprietà</h1>
              {hasPending && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 rounded-full">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] font-bold text-red-600">{totalPendingCount}</span>
                </span>
              )}
            </div>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="w-10 h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-2 border border-emerald-100">
              <p className="text-lg font-bold text-emerald-600">{activeProperties.length}</p>
              <p className="text-[10px] text-emerald-600/70 font-medium">Attive</p>
            </div>
            <div className={`bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-2 border ${hasPending ? 'border-red-300 ring-2 ring-red-200' : 'border-amber-100'}`}>
              <div className="flex items-center gap-1">
                <p className="text-lg font-bold text-amber-600">{totalPendingCount}</p>
                {hasPending && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
              </div>
              <p className="text-[10px] text-amber-600/70 font-medium">In Attesa</p>
            </div>
            <div className="bg-gradient-to-br from-sky-50 to-blue-50 rounded-xl p-2 border border-sky-100">
              <p className="text-lg font-bold text-sky-600">{totalBookings}</p>
              <p className="text-[10px] text-sky-600/70 font-medium">Prenotazioni</p>
            </div>
          </div>

          {/* Search + View Toggle */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Cerca proprietà..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-300 rounded-full flex items-center justify-center"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            {/* View Toggle */}
            <div className="flex bg-slate-100 rounded-xl p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white shadow-sm" : ""}`}
              >
                <svg className={`w-4 h-4 ${viewMode === "grid" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-white shadow-sm" : ""}`}
              >
                <svg className={`w-4 h-4 ${viewMode === "list" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setActiveTab("active")}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === "active" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Attive ({filteredActive.length})
            </button>
            <button
              onClick={() => setActiveTab("pending")}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all relative ${
                activeTab === "pending" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${hasPending ? "bg-red-500 animate-pulse" : "bg-amber-500"}`}></span>
              Attesa ({filteredPending.length + filteredDeactivation.length})
              {hasPending && activeTab !== "pending" && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("suspended")}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === "suspended" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
              Sospese ({filteredSuspended.length})
            </button>
          </div>
        </div>
      </div>

      {/* ==================== DESKTOP HEADER ==================== */}
      <div className="hidden lg:block p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Proprietà</h1>
              <p className="text-slate-500">{activeProperties.length} attive, {totalPendingCount} in attesa</p>
            </div>
            {hasPending && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-100 rounded-xl">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                <span className="text-sm font-medium text-red-700">{totalPendingCount} in attesa di approvazione</span>
              </div>
            )}
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuova Proprietà
          </button>
        </div>

        {/* Desktop Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm text-slate-500">Attive</p>
            <p className="text-2xl font-bold text-slate-800">{activeProperties.length}</p>
          </div>
          <div className={`bg-white rounded-xl border p-4 shadow-sm ${hasPending ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}>
            <p className="text-sm text-slate-500">In Attesa</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-amber-600">{totalPendingCount}</p>
              {hasPending && <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm text-slate-500">Prenotazioni</p>
            <p className="text-2xl font-bold text-slate-800">{totalBookings}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm text-slate-500">Pulizie</p>
            <p className="text-2xl font-bold text-slate-800">{totalCleanings}</p>
          </div>
        </div>

        {/* Desktop Search */}
        <div className="relative max-w-md mb-6">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cerca per nome, indirizzo, città o proprietario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* ==================== CONTENT ==================== */}
      <div className="px-3 lg:px-8 pt-4">
        
        {/* ===== MOBILE CONTENT ===== */}
        <div className="lg:hidden">
          
          {/* Tab: Attive - GRID */}
          {activeTab === "active" && viewMode === "grid" && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              {filteredActive.map((property, index) => {
                const color = getColor(index);
                const price = property.cleaningPrice || 0;
                const monthlyTotal = property.monthlyTotal || 0;
                return (
                  <div key={property.id} className="relative mb-5">
                    <Link
                      href={`/dashboard/proprieta/${property.id}`}
                      className="block bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible active:scale-95 transition-all"
                    >
                      {/* Header con gradiente */}
                      <div className={`h-14 bg-gradient-to-br ${color.bg} rounded-t-xl flex items-center justify-center relative`}>
                        <span className="text-xl font-medium text-white tracking-wide">
                          {property.name.slice(0, 2).toUpperCase()}
                        </span>
                        
                        {/* Prezzo pulizia */}
                        <div className="absolute -top-1.5 -right-1.5 bg-white rounded-lg px-2 py-1 shadow-md border border-slate-100">
                          <div className="flex items-baseline">
                            <span className="text-[8px] text-slate-400 mr-0.5">€</span>
                            <span className="text-xs font-bold text-slate-700">{price}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Content */}
                      <div className="p-2.5 pb-5">
                        <p className="text-xs font-semibold text-slate-800 truncate leading-tight">{property.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{property.city}</p>
                      </div>
                    </Link>

                    {/* Totale mese - Pill */}
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
                      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full px-2.5 py-1 shadow-md border-2 border-white">
                        <div className="flex items-baseline">
                          <span className="text-[7px] text-emerald-200 mr-0.5">€</span>
                          <span className="text-[11px] font-bold text-white">{monthlyTotal}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab: Attive - LIST */}
          {activeTab === "active" && viewMode === "list" && (
            <div className="space-y-2">
              {filteredActive.map((property, index) => {
                const color = getColor(index);
                const price = property.cleaningPrice || 0;
                const monthlyTotal = property.monthlyTotal || 0;
                return (
                  <Link
                    key={property.id}
                    href={`/dashboard/proprieta/${property.id}`}
                    className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 p-3 shadow-sm active:scale-[0.98] transition-all"
                  >
                    {/* Avatar */}
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-base font-bold text-white">{property.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{property.name}</p>
                      <p className="text-xs text-slate-400 truncate">{property.city}</p>
                    </div>
                    
                    {/* Prezzi */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {/* Prezzo singolo */}
                      <div className="bg-white rounded-lg px-2 py-1 border border-slate-200 shadow-sm">
                        <div className="flex items-baseline">
                          <span className="text-[8px] text-slate-400 mr-0.5">€</span>
                          <span className="text-sm font-bold text-slate-700">{price}</span>
                        </div>
                      </div>
                      {/* Totale mese */}
                      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg px-2 py-1 shadow-sm">
                        <div className="flex items-baseline">
                          <span className="text-[8px] text-emerald-200 mr-0.5">€</span>
                          <span className="text-sm font-bold text-white">{monthlyTotal}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Tab: In Attesa */}
          {activeTab === "pending" && (
            <div className="space-y-4">
              {/* Messaggio se vuoto */}
              {totalPendingCount === 0 && (
                <div className="bg-white rounded-xl p-8 text-center border border-slate-100">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-slate-600 font-medium">Nessuna richiesta in attesa</p>
                  <p className="text-sm text-slate-400 mt-1">Tutte le richieste sono state gestite</p>
                </div>
              )}

              {/* Richieste Disattivazione */}
              {filteredDeactivation.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                    Richieste Disattivazione ({filteredDeactivation.length})
                  </h3>
                  <div className="space-y-3">
                    {filteredDeactivation.map((property) => (
                      <DeactivationRequestCard 
                        key={property.id} 
                        property={property} 
                        onAction={() => window.location.reload()} 
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Nuove Proprietà */}
              {filteredPending.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                    Nuove Proprietà ({filteredPending.length})
                  </h3>
                  <div className="space-y-3">
                    {filteredPending.map((property) => (
                      <div key={property.id} className="bg-white rounded-xl border-2 border-amber-200 overflow-hidden shadow-sm">
                        <div className="bg-amber-50 px-3 py-2 flex items-center gap-2">
                          <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                          <span className="text-xs font-medium text-amber-700">Nuova proprietà</span>
                        </div>
                        <div className="p-3">
                          <h3 className="font-semibold text-slate-800">{property.name}</h3>
                          <p className="text-sm text-slate-500 truncate">{property.address}, {property.city}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Richiesta da: <span className="font-medium text-slate-600">{property.owner?.name || "N/D"}</span>
                          </p>
                          <div className="flex gap-2 mt-3">
                            <ApprovePropertyButton propertyId={property.id} action="reject" />
                            <ApprovePropertyButton propertyId={property.id} action="approve" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Sospese */}
          {activeTab === "suspended" && (
            <div className="space-y-3 pt-2">
              {filteredSuspended.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center border border-slate-100">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-slate-600 font-medium">Nessuna proprietà sospesa</p>
                  <p className="text-sm text-slate-400 mt-1">Le proprietà sospese appariranno qui</p>
                </div>
              ) : (
                filteredSuspended.map((property, index) => {
                  const color = getColor(index);
                  return (
                    <Link
                      key={property.id}
                      href={`/dashboard/proprieta/${property.id}`}
                      className="flex items-center gap-3 bg-white rounded-xl border-2 border-slate-300 p-3 shadow-sm active:scale-[0.98] transition-all opacity-75"
                    >
                      {/* Avatar con overlay */}
                      <div className={`relative w-11 h-11 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-base font-bold text-white">{property.name.slice(0, 2).toUpperCase()}</span>
                        <div className="absolute inset-0 bg-slate-900/30 rounded-xl"></div>
                        <svg className="absolute w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-600 truncate">{property.name}</p>
                        <p className="text-xs text-slate-400 truncate">{property.city}</p>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-slate-200 text-slate-600 text-[9px] font-medium rounded-full">
                          SOSPESA
                        </span>
                      </div>
                      
                      <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  );
                })
              )}
            </div>
          )}

          {/* Empty State Active */}
          {activeTab === "active" && filteredActive.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center border border-slate-100">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-slate-500">Nessuna proprietà trovata</p>
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="text-sky-600 text-sm mt-2">
                  Cancella ricerca
                </button>
              )}
            </div>
          )}
        </div>

        {/* ===== DESKTOP CONTENT ===== */}
        <div className="hidden lg:block">
          {/* Pending Section */}
          {totalPendingCount > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                <h2 className="text-lg font-bold text-slate-800">In attesa di approvazione ({totalPendingCount})</h2>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPending.map((property) => (
                  <div key={property.id} className="bg-white rounded-xl border-2 border-amber-200 overflow-hidden shadow-sm">
                    <div className="bg-amber-50 px-4 py-2 flex items-center gap-2">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                      <span className="text-sm font-medium text-amber-700">In attesa</span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-slate-800 text-lg">{property.name}</h3>
                      <p className="text-sm text-slate-500">{property.address}, {property.city}</p>
                      <p className="text-sm text-slate-400 mt-2">
                        Richiesta da: <span className="font-medium">{property.owner?.name || "N/D"}</span>
                      </p>
                      <div className="flex gap-2 mt-4">
                        <ApprovePropertyButton propertyId={property.id} action="reject" />
                        <ApprovePropertyButton propertyId={property.id} action="approve" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Section */}
          <h2 className="text-lg font-bold text-slate-800 mb-4">Proprietà Attive ({filteredActive.length})</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredActive.map((property, idx) => {
              const price = property.cleaningPrice || 0;
              const monthlyTotal = property.monthlyTotal || 0;
              return (
                <Link 
                  key={property.id} 
                  href={`/dashboard/proprieta/${property.id}`} 
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all overflow-hidden"
                >
                  <div className={`h-28 bg-gradient-to-br ${colors[idx % colors.length].bg} relative`}>
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="text-lg font-bold text-white truncate">{property.name}</h3>
                      {property.owner && <p className="text-white/80 text-sm">{property.owner.name}</p>}
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-slate-500 truncate mb-3">{property.address}, {property.city}</p>
                    
                    {/* Prezzi */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 text-center px-3 py-2 bg-slate-50 rounded-xl">
                        <p className="text-lg font-bold text-slate-700">€{price}</p>
                        <p className="text-[10px] text-slate-400 uppercase">Pulizia</p>
                      </div>
                      <div className="flex-1 text-center px-3 py-2 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
                        <p className="text-lg font-bold text-emerald-600">€{monthlyTotal}</p>
                        <p className="text-[10px] text-emerald-500 uppercase">Mese</p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal Crea Proprietà */}
      <CreaProprietaModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        proprietari={proprietari}
      />
    </div>
  );
}
