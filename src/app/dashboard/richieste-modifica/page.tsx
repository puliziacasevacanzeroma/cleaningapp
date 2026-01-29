/**
 * Pagina Admin - Richieste Modifica Proprietà
 * 
 * Gestisce tutte le richieste di modifica inviate dai proprietari:
 * - Modifica numero ospiti
 * - Modifica camere/bagni
 * - Modifica configurazione letti
 * 
 * URL: /dashboard/richieste-modifica
 */

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface PropertyChangeRequest {
  id: string;
  propertyId: string;
  propertyName: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  changeType: string;
  currentValue: string;
  requestedValue: string;
  reason?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: any;
  processedAt?: any;
  processedBy?: string;
  processedByName?: string;
  adminNote?: string;
  newBeds?: any[];
}

type TabType = "pending" | "approved" | "rejected";

export default function RichiesteModificaPage() {
  const [activeTab, setActiveTab] = useState<TabType>("pending");
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<PropertyChangeRequest[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PropertyChangeRequest | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [showRejectModal, setShowRejectModal] = useState<PropertyChangeRequest | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/property-change-request?status=ALL");
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error("Errore caricamento richieste:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: PropertyChangeRequest) => {
    setProcessing(request.id);
    try {
      const response = await fetch("/api/property-change-request", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          action: "APPROVE",
          adminNote: adminNote || undefined,
        }),
      });
      
      if (response.ok) {
        await loadRequests();
        setSelectedRequest(null);
        setAdminNote("");
      }
    } catch (error) {
      console.error("Errore approvazione:", error);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (request: PropertyChangeRequest) => {
    setProcessing(request.id);
    try {
      const response = await fetch("/api/property-change-request", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          action: "REJECT",
          adminNote: adminNote || undefined,
        }),
      });
      
      if (response.ok) {
        await loadRequests();
        setShowRejectModal(null);
        setAdminNote("");
      }
    } catch (error) {
      console.error("Errore rifiuto:", error);
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "-";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const parseValue = (value: string, type: string) => {
    try {
      if (type === "PROPERTY_UPDATE") {
        const parsed = JSON.parse(value);
        return parsed;
      }
      return value;
    } catch {
      return value;
    }
  };

  const renderChangeDetails = (request: PropertyChangeRequest) => {
    const current = parseValue(request.currentValue, request.changeType);
    const requested = parseValue(request.requestedValue, request.changeType);

    if (request.changeType === "PROPERTY_UPDATE") {
      return (
        <div className="space-y-3">
          {/* Ospiti */}
          {current.maxGuests !== requested.maxGuests && (
            <div className="flex items-center gap-3">
              <span className="text-2xl">👥</span>
              <div>
                <p className="text-sm text-slate-500">Max Ospiti</p>
                <p className="font-medium">
                  <span className="text-slate-400 line-through">{current.maxGuests}</span>
                  <span className="mx-2">→</span>
                  <span className="text-sky-600 font-bold">{requested.maxGuests}</span>
                </p>
              </div>
            </div>
          )}
          
          {/* Camere */}
          {current.bedrooms !== requested.bedrooms && (
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚪</span>
              <div>
                <p className="text-sm text-slate-500">Camere</p>
                <p className="font-medium">
                  <span className="text-slate-400 line-through">{current.bedrooms}</span>
                  <span className="mx-2">→</span>
                  <span className="text-sky-600 font-bold">{requested.bedrooms}</span>
                </p>
              </div>
            </div>
          )}
          
          {/* Bagni */}
          {current.bathrooms !== requested.bathrooms && (
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚿</span>
              <div>
                <p className="text-sm text-slate-500">Bagni</p>
                <p className="font-medium">
                  <span className="text-slate-400 line-through">{current.bathrooms}</span>
                  <span className="mx-2">→</span>
                  <span className="text-sky-600 font-bold">{requested.bathrooms}</span>
                </p>
              </div>
            </div>
          )}

          {/* Letti */}
          {requested.beds && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-sm font-medium text-slate-600 mb-2">🛏️ Nuova configurazione letti:</p>
              <div className="flex flex-wrap gap-2">
                {requested.beds.map((bed: any, idx: number) => (
                  <span key={idx} className="px-2 py-1 bg-sky-100 text-sky-700 rounded-lg text-sm">
                    {bed.name || bed.type} ({bed.cap || bed.capacity}p)
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Capacità totale: {requested.beds.reduce((sum: number, b: any) => sum + (b.cap || b.capacity || 0), 0)} posti
              </p>
            </div>
          )}
        </div>
      );
    }

    if (request.changeType === "MAX_GUESTS") {
      return (
        <div className="flex items-center gap-3">
          <span className="text-2xl">👥</span>
          <div>
            <p className="text-sm text-slate-500">Max Ospiti</p>
            <p className="font-medium">
              <span className="text-slate-400 line-through">{current}</span>
              <span className="mx-2">→</span>
              <span className="text-sky-600 font-bold">{requested}</span>
            </p>
          </div>
        </div>
      );
    }

    if (request.changeType === "BEDS") {
      return (
        <div>
          <p className="text-sm font-medium text-slate-600 mb-2">🛏️ Modifica Letti</p>
          {request.newBeds && (
            <div className="flex flex-wrap gap-2">
              {request.newBeds.map((bed: any, idx: number) => (
                <span key={idx} className="px-2 py-1 bg-sky-100 text-sky-700 rounded-lg text-sm">
                  {bed.name || bed.type}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <p className="text-sm text-slate-600">
        {request.currentValue} → {request.requestedValue}
      </p>
    );
  };

  const filteredRequests = requests.filter(r => {
    if (activeTab === "pending") return r.status === "PENDING";
    if (activeTab === "approved") return r.status === "APPROVED";
    if (activeTab === "rejected") return r.status === "REJECTED";
    return true;
  });

  const pendingCount = requests.filter(r => r.status === "PENDING").length;

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/dashboard" className="hover:text-slate-700">Dashboard</Link>
          <span>›</span>
          <span className="text-slate-800">Richieste Modifica</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Richieste Modifica Proprietà</h1>
            <p className="text-slate-500 mt-1">Gestisci le richieste di modifica inviate dai proprietari</p>
          </div>
          {pendingCount > 0 && (
            <div className="bg-amber-100 text-amber-700 px-4 py-2 rounded-xl font-medium">
              {pendingCount} in attesa
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: "pending", label: "In Attesa", icon: "⏳", count: requests.filter(r => r.status === "PENDING").length },
          { id: "approved", label: "Approvate", icon: "✅", count: requests.filter(r => r.status === "APPROVED").length },
          { id: "rejected", label: "Rifiutate", icon: "❌", count: requests.filter(r => r.status === "REJECTED").length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
              activeTab === tab.id
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? "bg-white/20" : "bg-slate-200"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Caricamento richieste...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">📭</span>
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            Nessuna richiesta {activeTab === "pending" ? "in attesa" : activeTab === "approved" ? "approvata" : "rifiutata"}
          </h2>
          <p className="text-slate-500">
            {activeTab === "pending" 
              ? "Non ci sono richieste di modifica da processare." 
              : "Lo storico è vuoto."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <div
              key={request.id}
              className={`bg-white rounded-2xl shadow-lg overflow-hidden border-2 transition-all ${
                request.status === "PENDING" ? "border-amber-200" : "border-transparent"
              }`}
            >
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Info Proprietà */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-sky-400 to-blue-500 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                        {request.propertyName?.charAt(0)?.toUpperCase() || "P"}
                      </div>
                      <div>
                        <Link 
                          href={`/dashboard/proprieta/${request.propertyId}`}
                          className="font-semibold text-slate-800 hover:text-sky-600 transition-colors"
                        >
                          {request.propertyName}
                        </Link>
                        <p className="text-sm text-slate-500">
                          da {request.requesterName} • {formatDate(request.createdAt)}
                        </p>
                      </div>
                    </div>

                    {/* Dettagli Modifica */}
                    <div className="bg-slate-50 rounded-xl p-4">
                      {renderChangeDetails(request)}
                    </div>

                    {/* Motivazione */}
                    {request.reason && (
                      <div className="mt-3 p-3 bg-sky-50 rounded-lg">
                        <p className="text-sm text-sky-700">
                          <span className="font-medium">📝 Motivazione:</span> {request.reason}
                        </p>
                      </div>
                    )}

                    {/* Nota Admin (per storico) */}
                    {request.adminNote && request.status !== "PENDING" && (
                      <div className="mt-3 p-3 bg-slate-100 rounded-lg">
                        <p className="text-sm text-slate-600">
                          <span className="font-medium">💬 Nota admin:</span> {request.adminNote}
                        </p>
                      </div>
                    )}

                    {/* Info Processamento (per storico) */}
                    {request.status !== "PENDING" && (
                      <p className="text-xs text-slate-400 mt-3">
                        {request.status === "APPROVED" ? "Approvata" : "Rifiutata"} da {request.processedByName} il {formatDate(request.processedAt)}
                      </p>
                    )}
                  </div>

                  {/* Azioni (solo per pending) */}
                  {request.status === "PENDING" && (
                    <div className="flex lg:flex-col gap-2">
                      <button
                        onClick={() => setSelectedRequest(request)}
                        disabled={processing === request.id}
                        className="flex-1 lg:flex-none px-6 py-3 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {processing === request.id ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>✅ Approva</>
                        )}
                      </button>
                      <button
                        onClick={() => setShowRejectModal(request)}
                        disabled={processing === request.id}
                        className="flex-1 lg:flex-none px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        ❌ Rifiuta
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Conferma Approvazione */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedRequest(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Approva Richiesta</h3>
                <p className="text-sm text-slate-500">{selectedRequest.propertyName}</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              {renderChangeDetails(selectedRequest)}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nota (opzionale)
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Aggiungi una nota per il proprietario..."
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none resize-none"
                rows={2}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedRequest(null);
                  setAdminNote("");
                }}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200"
              >
                Annulla
              </button>
              <button
                onClick={() => handleApprove(selectedRequest)}
                disabled={processing === selectedRequest.id}
                className="flex-1 py-3 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing === selectedRequest.id ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Conferma Approvazione"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rifiuto */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRejectModal(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">❌</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Rifiuta Richiesta</h3>
                <p className="text-sm text-slate-500">{showRejectModal.propertyName}</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-amber-700">
                ⚠️ Il proprietario riceverà una notifica con il motivo del rifiuto.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Motivo del rifiuto
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Spiega perché la richiesta è stata rifiutata..."
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setAdminNote("");
                }}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200"
              >
                Annulla
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={processing === showRejectModal.id}
                className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing === showRejectModal.id ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Rifiuta Richiesta"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
