"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CreaProprietaOwnerModal from "~/components/dashboard/CreaProprietaOwnerModal";

interface Property {
  id: string;
  name: string;
  address: string;
  city?: string;
  zone?: string;
  status: string;
  maxGuests?: number | null;
  bathrooms?: number | null;
  bedrooms?: number | null;
  cleaningPrice?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  imageUrl?: string | null;
  icalUrl?: string | null;
  _count?: { bookings: number; cleanings: number };
}

interface ProprietarioProprietaClientProps {
  activeProperties: Property[];
  pendingProperties: Property[];
  pendingDeletionProperties?: Property[];
}

const placeholderImages = [
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&h=400&fit=crop",
];

export function ProprietarioProprietaClient({ activeProperties, pendingProperties, pendingDeletionProperties = [] }: ProprietarioProprietaClientProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  // 🔄 Assume mobile su SSR - nessun flash
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 1024;
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [sortBy, setSortBy] = useState<"name" | "guests" | "cleanings">("name");
  const router = useRouter();

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const getPlaceholderImage = (index: number) => {
    return placeholderImages[index % placeholderImages.length];
  };

  const handlePropertyCreated = () => {
    window.location.reload();
  };

  // Filtra e ordina proprietà
  const filteredActive = activeProperties
    .filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.city?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "guests": return (b.maxGuests || 0) - (a.maxGuests || 0);
        case "cleanings": return (b._count?.cleanings || 0) - (a._count?.cleanings || 0);
        default: return a.name.localeCompare(b.name);
      }
    });

  // Statistiche totali
  const totalStats = {
    properties: activeProperties.length + pendingProperties.length + pendingDeletionProperties.length,
    active: activeProperties.length,
    pending: pendingProperties.length,
    pendingDeletion: pendingDeletionProperties.length,
    totalGuests: activeProperties.reduce((sum, p) => sum + (p.maxGuests || 0), 0),
    totalCleanings: activeProperties.reduce((sum, p) => sum + (p._count?.cleanings || 0), 0),
    totalBookings: activeProperties.reduce((sum, p) => sum + (p._count?.bookings || 0), 0),
  };

  // ==================== DESKTOP VIEW ====================
  if (isDesktop) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header Desktop */}
        <div className="bg-white border-b border-slate-200">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Le Mie Proprietà</h1>
                <p className="text-slate-500 mt-1">Gestisci le tue proprietà e monitora le attività</p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-5 py-3 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition-all shadow-lg shadow-sky-500/20 font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nuova Proprietà
              </button>
            </div>

            {/* Stats Cards - Full Width */}
            <div className="grid grid-cols-6 gap-4 mb-6">
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-slate-800">{totalStats.properties}</p>
                    <p className="text-sm text-slate-500">Proprietà Totali</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-200 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-emerald-700">{totalStats.active}</p>
                    <p className="text-sm text-emerald-600">Attive</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-amber-200 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-amber-700">{totalStats.pending}</p>
                    <p className="text-sm text-amber-600">In Attesa</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-200 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-blue-700">{totalStats.totalGuests}</p>
                    <p className="text-sm text-blue-600">Capacità Totale</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-200 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-purple-700">{totalStats.totalBookings}</p>
                    <p className="text-sm text-purple-600">Prenotazioni</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-4 border border-teal-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-teal-200 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-teal-700">{totalStats.totalCleanings}</p>
                    <p className="text-sm text-teal-600">Pulizie Totali</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters & Search Bar */}
            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-4">
                {/* Search */}
                <div className="relative">
                  <svg className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Cerca proprietà per nome, indirizzo o città..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 pr-4 py-3 w-96 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white text-sm"
                  />
                </div>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white text-slate-600 text-sm"
                >
                  <option value="name">Ordina per Nome</option>
                  <option value="guests">Ordina per Capacità</option>
                  <option value="cleanings">Ordina per Pulizie</option>
                </select>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 mr-2">Visualizza:</span>
                <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-slate-200">
                  <button
                    onClick={() => setViewMode("table")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium ${viewMode === "table" ? "bg-sky-500 text-white shadow" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    Tabella
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium ${viewMode === "grid" ? "bg-sky-500 text-white shadow" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    Griglia
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Pending Properties Alert */}
          {pendingProperties.length > 0 && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-amber-800 text-lg">{pendingProperties.length} proprietà in attesa di approvazione</p>
                  <p className="text-amber-600 mt-1">Le proprietà saranno visibili dopo la revisione dell'amministratore</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {pendingProperties.map((prop) => (
                      <div key={prop.id} className="bg-white rounded-xl px-4 py-3 border border-amber-200 shadow-sm">
                        <p className="font-semibold text-slate-800">{prop.name}</p>
                        <p className="text-sm text-slate-500">{prop.address}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending Deletion Properties Alert */}
          {pendingDeletionProperties.length > 0 && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-red-800 text-lg">{pendingDeletionProperties.length} proprietà in attesa di cancellazione</p>
                  <p className="text-red-600 mt-1">La richiesta è in attesa di approvazione dall'amministratore</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {pendingDeletionProperties.map((prop) => (
                      <div key={prop.id} className="bg-white rounded-xl px-4 py-3 border border-red-200 shadow-sm opacity-60">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">🗑️ In cancellazione</span>
                        </div>
                        <p className="font-semibold text-slate-800 mt-1">{prop.name}</p>
                        <p className="text-sm text-slate-500">{prop.address}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Table View */}
          {viewMode === "table" ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left py-4 px-6 font-semibold text-slate-600 text-sm">Proprietà</th>
                      <th className="text-left py-4 px-6 font-semibold text-slate-600 text-sm">Indirizzo</th>
                      <th className="text-center py-4 px-4 font-semibold text-slate-600 text-sm">Ospiti</th>
                      <th className="text-center py-4 px-4 font-semibold text-slate-600 text-sm">Camere</th>
                      <th className="text-center py-4 px-4 font-semibold text-slate-600 text-sm">Bagni</th>
                      <th className="text-center py-4 px-4 font-semibold text-slate-600 text-sm">Check-in</th>
                      <th className="text-center py-4 px-4 font-semibold text-slate-600 text-sm">Check-out</th>
                      <th className="text-center py-4 px-4 font-semibold text-slate-600 text-sm">Prenotazioni</th>
                      <th className="text-center py-4 px-4 font-semibold text-slate-600 text-sm">Pulizie</th>
                      <th className="text-center py-4 px-4 font-semibold text-slate-600 text-sm">Stato</th>
                      <th className="text-right py-4 px-6 font-semibold text-slate-600 text-sm">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredActive.map((property, index) => (
                      <tr 
                        key={property.id} 
                        className="hover:bg-sky-50/50 transition-all cursor-pointer group"
                        onClick={() => router.push(`/proprietario/proprieta/${property.id}`)}
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0 shadow-sm">
                              <img
                                src={property.imageUrl || getPlaceholderImage(index)}
                                alt={property.name}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 group-hover:text-sky-600 transition-colors">{property.name}</p>
                              {property.zone && <p className="text-xs text-slate-400 mt-0.5">{property.zone}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-slate-600 text-sm">{property.address}</p>
                          {property.city && <p className="text-xs text-slate-400 mt-0.5">{property.city}</p>}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg">
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="font-semibold text-blue-700">{property.maxGuests || "-"}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="font-medium text-slate-700">{property.bedrooms || "-"}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="font-medium text-slate-700">{property.bathrooms || "-"}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-sm text-slate-600">{property.checkInTime || "15:00"}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-sm text-slate-600">{property.checkOutTime || "10:00"}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm font-semibold">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {property._count?.bookings || 0}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-sm font-semibold">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                            {property._count?.cleanings || 0}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                            Attiva
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <Link
                              href={`/proprietario/proprieta/${property.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="p-2.5 hover:bg-sky-100 rounded-xl transition-colors text-sky-600"
                              title="Visualizza dettagli"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </Link>
                            <Link
                              href={`/proprietario/proprieta/${property.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-600"
                              title="Modifica"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredActive.length === 0 && (
                <div className="p-16 text-center">
                  <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-xl font-semibold text-slate-700">Nessuna proprietà trovata</p>
                  <p className="text-slate-500 mt-2">Prova a modificare i criteri di ricerca</p>
                </div>
              )}
            </div>
          ) : (
            /* Grid View */
            <div className="grid grid-cols-3 gap-6">
              {filteredActive.map((property, index) => (
                <Link
                  key={property.id}
                  href={`/proprietario/proprieta/${property.id}`}
                  className="group"
                >
                  <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 hover:shadow-xl hover:border-sky-300 transition-all duration-300 hover:-translate-y-1">
                    <div className="relative h-52 bg-slate-200 overflow-hidden">
                      <img
                        src={property.imageUrl || getPlaceholderImage(index)}
                        alt={property.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>

                      <div className="absolute top-4 left-4 flex items-center gap-2">
                        <span className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-lg">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          Attiva
                        </span>
                        {property.icalUrl && (
                          <span className="px-2.5 py-1.5 bg-purple-500 text-white text-xs font-bold rounded-lg shadow-lg" title="Sync iCal attivo">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </span>
                        )}
                      </div>

                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
                          <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>

                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <h3 className="text-white font-bold text-xl truncate">{property.name}</h3>
                        <p className="text-white/80 text-sm truncate mt-1">{property.address}{property.city ? `, ${property.city}` : ""}</p>
                      </div>
                    </div>

                    <div className="p-5">
                      {/* Property Details */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="text-center p-2 bg-slate-50 rounded-lg">
                          <div className="flex items-center justify-center gap-1 text-slate-600 mb-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <p className="font-bold text-slate-800">{property.maxGuests || "N/D"}</p>
                          <p className="text-xs text-slate-500">Ospiti</p>
                        </div>
                        <div className="text-center p-2 bg-slate-50 rounded-lg">
                          <div className="flex items-center justify-center gap-1 text-slate-600 mb-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                          </div>
                          <p className="font-bold text-slate-800">{property.bedrooms || "N/D"}</p>
                          <p className="text-xs text-slate-500">Camere</p>
                        </div>
                        <div className="text-center p-2 bg-slate-50 rounded-lg">
                          <div className="flex items-center justify-center gap-1 text-slate-600 mb-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </div>
                          <p className="font-bold text-slate-800">{property.bathrooms || "N/D"}</p>
                          <p className="text-xs text-slate-500">Bagni</p>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                        <div className="flex-1 bg-purple-50 rounded-xl px-4 py-3 text-center">
                          <p className="text-2xl font-bold text-purple-600">{property._count?.bookings || 0}</p>
                          <p className="text-xs text-purple-600 font-medium">Prenotazioni</p>
                        </div>
                        <div className="flex-1 bg-teal-50 rounded-xl px-4 py-3 text-center">
                          <p className="text-2xl font-bold text-teal-600">{property._count?.cleanings || 0}</p>
                          <p className="text-xs text-teal-600 font-medium">Pulizie</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}

              {/* Empty State */}
              {filteredActive.length === 0 && (
                <div className="col-span-3 bg-white rounded-2xl border border-slate-200 p-16 text-center">
                  <div className="w-24 h-24 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
                    <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="text-slate-800 font-bold text-xl">Nessuna proprietà trovata</p>
                  <p className="text-slate-500 mt-2 mb-8">
                    {searchTerm ? "Prova a modificare i criteri di ricerca" : "Aggiungi la tua prima proprietà per iniziare"}
                  </p>
                  {!searchTerm && (
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-sky-500 text-white font-semibold rounded-xl hover:bg-sky-600 transition-all shadow-lg shadow-sky-500/20"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Aggiungi Proprietà
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <CreaProprietaOwnerModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handlePropertyCreated}
        />
      </div>
    );
  }

  // ==================== MOBILE VIEW (unchanged) ====================
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Le Mie Proprietà</h1>
            <p className="text-sm text-slate-500 mt-0.5">{activeProperties.length + pendingProperties.length} proprietà totali</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-11 h-11 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Proprietà in attesa */}
        {pendingProperties.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
              <h2 className="text-sm font-semibold text-slate-600">In attesa ({pendingProperties.length})</h2>
            </div>
            <div className="space-y-4">
              {pendingProperties.map((property, index) => (
                <div key={property.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200">
                  <div className="relative h-40 bg-slate-200">
                    <img src={property.imageUrl || getPlaceholderImage(index)} alt={property.name} className="w-full h-full object-cover opacity-70" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                    <div className="absolute top-3 left-3">
                      <span className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-lg">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        In attesa
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-white font-bold text-lg truncate">{property.name}</h3>
                      <p className="text-white/80 text-sm truncate">{property.address}</p>
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-sm font-medium">{property.maxGuests || "N/D"}</span>
                      </div>
                    </div>
                    <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg font-medium">Revisione</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proprietà in attesa cancellazione - MOBILE */}
        {pendingDeletionProperties.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <h2 className="text-sm font-semibold text-slate-600">In cancellazione ({pendingDeletionProperties.length})</h2>
            </div>
            <div className="space-y-4">
              {pendingDeletionProperties.map((property, index) => (
                <div key={property.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-red-200 opacity-60">
                  <div className="relative h-40 bg-slate-200">
                    <img src={property.imageUrl || getPlaceholderImage(index)} alt={property.name} className="w-full h-full object-cover grayscale" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                    <div className="absolute top-3 left-3">
                      <span className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-lg">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        In cancellazione
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-white font-bold text-lg truncate">{property.name}</h3>
                      <p className="text-white/80 text-sm truncate">{property.address}</p>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg font-medium text-center">
                      ⏳ In attesa di approvazione admin
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proprietà attive */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
            <h2 className="text-sm font-semibold text-slate-600">Attive ({activeProperties.length})</h2>
          </div>

          {activeProperties.length > 0 ? (
            <div className="space-y-4">
              {activeProperties.map((property, index) => (
                <Link key={property.id} href={`/proprietario/proprieta/${property.id}`} className="block">
                  <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 hover:shadow-lg transition-all active:scale-[0.98]">
                    <div className="relative h-44 bg-slate-200">
                      <img src={property.imageUrl || getPlaceholderImage(index)} alt={property.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                      <div className="absolute top-3 left-3">
                        <span className="px-2.5 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-lg">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          Attiva
                        </span>
                      </div>
                      <div className="absolute top-3 right-3">
                        <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <h3 className="text-white font-bold text-xl truncate">{property.name}</h3>
                        <p className="text-white/80 text-sm truncate mt-0.5">{property.address}</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-sm font-medium">{property.maxGuests || "N/D"}</span>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div className="flex items-center gap-1.5 text-blue-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-medium">{property._count?.bookings || 0}</span>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div className="flex items-center gap-1.5 text-emerald-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                            <span className="text-sm font-medium">{property._count?.cleanings || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <p className="text-slate-800 font-semibold text-lg">Nessuna proprietà</p>
              <p className="text-sm text-slate-500 mt-1 mb-4">Aggiungi la tua prima proprietà</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 active:scale-95 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Aggiungi Proprietà
              </button>
            </div>
          )}
        </div>
      </div>

      <CreaProprietaOwnerModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handlePropertyCreated}
      />
    </div>
  );
}
