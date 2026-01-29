"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ==================== CACHE HELPERS ====================
const CACHE_KEY = 'pagamenti_admin_cache';

function getFromCache(month: number, year: number): { summary: Summary | null; clients: ClientStats[]; propertiesWithoutPrice: PropertyWithoutPrice[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached);
    // Verifica che sia per lo stesso mese/anno
    if (data.month === month && data.year === year) {
      return data;
    }
    return null;
  } catch { return null; }
}

function saveToCache(month: number, year: number, summary: Summary | null, clients: ClientStats[], propertiesWithoutPrice: PropertyWithoutPrice[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ month, year, summary, clients, propertiesWithoutPrice, timestamp: Date.now() }));
  } catch {}
}

// ==================== TYPES ====================

type PaymentMethod = "BONIFICO" | "CONTANTI" | "ALTRO";
type PaymentType = "ACCONTO" | "SALDO";
type ServiceType = "PULIZIA" | "BIANCHERIA" | "KIT_CORTESIA" | "SERVIZI_EXTRA";

interface Payment {
  id: string;
  proprietarioId: string;
  proprietarioName: string;
  month: number;
  year: number;
  amount: number;
  type: PaymentType;
  method: PaymentMethod;
  note?: string;
  createdAt: { toDate?: () => Date } | string;
}

interface OrderItemDetail {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  categoryName: string;
}

interface ServiceDetail {
  id: string;
  type: ServiceType;
  date: string;
  propertyId: string;
  propertyName: string;
  description: string;
  originalPrice: number;
  effectivePrice: number;
  hasOverride: boolean;
  overrideReason?: string;
  items?: OrderItemDetail[];
}

interface ClientStats {
  proprietarioId: string;
  proprietarioName: string;
  propertyCount: number;
  cleaningsCount: number;
  cleaningsTotal: number;
  ordersCount: number;
  ordersTotal: number;
  kitCortesiaCount: number;
  kitCortesiaTotal: number;
  serviziExtraCount: number;
  serviziExtraTotal: number;
  totaleCalcolato: number;
  totaleEffettivo: number;
  hasOverride: boolean;
  overrideReason?: string;
  payments: Payment[];
  totalePagato: number;
  saldo: number;
  stato: "SALDATO" | "PARZIALE" | "DA_PAGARE";
  services: ServiceDetail[];
}

interface Summary {
  totaleServizi: number;
  totaleIncassato: number;
  totaleContanti: number;
  totaleBonifico: number;
  totaleAltro: number;
  saldoTotale: number;
  clientiConSaldo: number;
  clientiSaldati: number;
}

interface PropertyWithoutPrice {
  id: string;
  name: string;
  ownerName: string;
}

// ==================== HELPERS ====================

const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const MONTHS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDate(date: any): string {
  if (!date) return "-";
  
  try {
    let timestamp: number | null = null;
    
    // Se è già una stringa, prova a parsarla
    if (typeof date === "string") {
      timestamp = Date.parse(date);
    } 
    // Se è un numero (timestamp in millisecondi)
    else if (typeof date === "number") {
      timestamp = date;
    }
    // Se è un oggetto Date
    else if (date instanceof Date) {
      timestamp = date.getTime();
    }
    // Se è un Timestamp Firebase con metodo toDate()
    else if (date && typeof date === "object" && typeof date.toDate === "function") {
      try {
        timestamp = date.toDate().getTime();
      } catch {
        timestamp = null;
      }
    }
    // Se è un Timestamp serializzato con seconds
    else if (date && typeof date === "object" && typeof date.seconds === "number") {
      timestamp = date.seconds * 1000;
    }
    // Se è un oggetto con _seconds (a volte Firebase serializza così)
    else if (date && typeof date === "object" && typeof date._seconds === "number") {
      timestamp = date._seconds * 1000;
    }
    
    // Se non siamo riusciti a ottenere un timestamp valido
    if (timestamp === null || isNaN(timestamp)) {
      return "-";
    }
    
    // Crea la data e formattala
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  } catch (e) {
    console.warn("formatDate error:", e, date);
    return "-";
  }
}

function getServiceIcon(type: ServiceType): string {
  switch (type) {
    case "PULIZIA": return "🧹";
    case "BIANCHERIA": return "🛏️";
    case "KIT_CORTESIA": return "🧴";
    case "SERVIZI_EXTRA": return "🎁";
    default: return "📦";
  }
}

function getServiceLabel(type: ServiceType): string {
  switch (type) {
    case "PULIZIA": return "Pulizia";
    case "BIANCHERIA": return "Biancheria";
    case "KIT_CORTESIA": return "Kit Cortesia";
    case "SERVIZI_EXTRA": return "Servizi Extra";
    default: return "Altro";
  }
}

// ==================== MAIN COMPONENT ====================

export default function PagamentiPage() {
  // 🔄 Inizializza mese/anno
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  
  // 🔄 Assume mobile su SSR - nessun flash
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 1024;
  });
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  // 🔄 INIZIALIZZA DA CACHE - Zero loading visibile!
  const [loading, setLoading] = useState(() => {
    const cached = getFromCache(currentMonth, currentYear);
    return !cached; // Loading solo se non c'è cache
  });
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // 🔄 Dati da cache
  const [summary, setSummary] = useState<Summary | null>(() => {
    const cached = getFromCache(currentMonth, currentYear);
    return cached?.summary || null;
  });
  const [clients, setClients] = useState<ClientStats[]>(() => {
    const cached = getFromCache(currentMonth, currentYear);
    return cached?.clients || [];
  });
  const [propertiesWithoutPrice, setPropertiesWithoutPrice] = useState<PropertyWithoutPrice[]>(() => {
    const cached = getFromCache(currentMonth, currentYear);
    return cached?.propertiesWithoutPrice || [];
  });
  
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tutti" | "da_pagare" | "saldati">("tutti");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modals
  const [quickPayClient, setQuickPayClient] = useState<ClientStats | null>(null);
  const [detailClient, setDetailClient] = useState<ClientStats | null>(null);
  const [editingService, setEditingService] = useState<ServiceDetail | null>(null);
  const [editingItem, setEditingItem] = useState<{ orderId: string; item: OrderItemDetail } | null>(null);
  
  // Forms
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({ type: "ACCONTO" as PaymentType, amount: "", method: "BONIFICO" as PaymentMethod, note: "" });
  const [showOverrideForm, setShowOverrideForm] = useState<string | null>(null);
  const [overrideForm, setOverrideForm] = useState({ overrideTotal: "", reason: "" });
  const [serviceEditForm, setServiceEditForm] = useState({ newPrice: "", reason: "" });
  const [itemEditForm, setItemEditForm] = useState({ quantity: "", unitPrice: "", reason: "" });

  // Screen detection
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Fetch data - con cache
  const fetchData = useCallback(async (showLoading = true) => {
    // 🔄 Mostra loading solo se non abbiamo dati
    if (showLoading && clients.length === 0) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`/api/payments?month=${selectedMonth}&year=${selectedYear}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore");
      
      setSummary(data.summary);
      setClients(data.clients || []);
      setPropertiesWithoutPrice(data.propertiesWithoutPrice || []);
      
      // 🔄 Salva in cache per prossima visita
      saveToCache(selectedMonth, selectedYear, data.summary, data.clients || [], data.propertiesWithoutPrice || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, clients.length]);

  // 🔄 Carica dati - Prima da cache, poi aggiorna in background
  useEffect(() => {
    // Controlla cache per il mese selezionato
    const cached = getFromCache(selectedMonth, selectedYear);
    if (cached) {
      setSummary(cached.summary);
      setClients(cached.clients);
      setPropertiesWithoutPrice(cached.propertiesWithoutPrice);
      setLoading(false);
      // Aggiorna in background
      fetchData(false);
    } else {
      fetchData(true);
    }
  }, [selectedMonth, selectedYear]);

  // Navigation
  const goToPrevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(selectedYear - 1); }
    else { setSelectedMonth(selectedMonth - 1); }
    setExpandedClient(null);
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(selectedYear + 1); }
    else { setSelectedMonth(selectedMonth + 1); }
    setExpandedClient(null);
  };

  // Actions
  const showSuccess = (msg: string) => { setSuccessMessage(msg); setTimeout(() => setSuccessMessage(null), 3000); };

  const handleSubmitPayment = async (proprietarioId: string, proprietarioName: string, customAmount?: number, totalDue?: number, totalPaid?: number) => {
    const amount = customAmount || parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { setError("Inserisci un importo valido"); return; }
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proprietarioId, proprietarioName, month: selectedMonth, year: selectedYear,
          amount, type: customAmount ? "SALDO" : paymentForm.type, method: paymentForm.method, note: paymentForm.note,
          totalDue: totalDue || 0,
          totalPaid: totalPaid || 0,
        }),
      });
      if (!res.ok) throw new Error("Errore");
      showSuccess(`Pagamento di ${formatCurrency(amount)} registrato`);
      setShowPaymentForm(null); setQuickPayClient(null); setDetailClient(null);
      setPaymentForm({ type: "ACCONTO", amount: "", method: "BONIFICO", note: "" });
      fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : "Errore"); }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("Eliminare questo pagamento?")) return;
    try {
      await fetch(`/api/payments?id=${paymentId}`, { method: "DELETE" });
      showSuccess("Pagamento eliminato");
      fetchData();
    } catch { setError("Errore"); }
  };

  const handleSubmitOverride = async (proprietarioId: string, totaleCalcolato: number) => {
    if (!overrideForm.overrideTotal || !overrideForm.reason) { setError("Inserisci totale e motivo"); return; }
    try {
      await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_override", proprietarioId, month: selectedMonth, year: selectedYear,
          originalTotal: totaleCalcolato, overrideTotal: parseFloat(overrideForm.overrideTotal), reason: overrideForm.reason,
        }),
      });
      showSuccess("Totale modificato");
      setShowOverrideForm(null); setOverrideForm({ overrideTotal: "", reason: "" });
      fetchData();
    } catch { setError("Errore"); }
  };

  const handleResetOverride = async (proprietarioId: string) => {
    if (!confirm("Ripristinare il totale?")) return;
    try {
      await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_override", proprietarioId, month: selectedMonth, year: selectedYear }),
      });
      showSuccess("Totale ripristinato"); fetchData();
    } catch { setError("Errore"); }
  };

  const handleSubmitServiceEdit = async () => {
    if (!editingService || !serviceEditForm.newPrice || !serviceEditForm.reason) { 
      setError("Inserisci prezzo e motivo"); return; 
    }
    try {
      const isOrder = editingService.type !== "PULIZIA";
      const endpoint = isOrder 
        ? `/api/orders/${editingService.id}/price`
        : `/api/cleanings/${editingService.id}/price`;
      
      await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPrice: parseFloat(serviceEditForm.newPrice), reason: serviceEditForm.reason }),
      });
      showSuccess("Prezzo modificato");
      setEditingService(null);
      setServiceEditForm({ newPrice: "", reason: "" });
      fetchData();
    } catch { setError("Errore"); }
  };

  const handleSubmitItemEdit = async () => {
    if (!editingItem || !itemEditForm.quantity || !itemEditForm.unitPrice) { 
      setError("Inserisci quantità e prezzo"); return; 
    }
    try {
      await fetch(`/api/orders/${editingItem.orderId}/item`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          itemId: editingItem.item.itemId,
          quantity: parseInt(itemEditForm.quantity),
          unitPrice: parseFloat(itemEditForm.unitPrice),
          reason: itemEditForm.reason || "Modifica manuale",
        }),
      });
      showSuccess("Articolo modificato");
      setEditingItem(null);
      setItemEditForm({ quantity: "", unitPrice: "", reason: "" });
      fetchData();
    } catch { setError("Errore"); }
  };

  // Filter
  const filteredClients = clients.filter(c => {
    if (activeTab === "da_pagare" && c.saldo <= 0) return false;
    if (activeTab === "saldati" && c.saldo > 0) return false;
    if (searchTerm && !c.proprietarioName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // ==================== ITEM EDIT MODAL ====================
  const ItemEditModal = () => {
    if (!editingItem) return null;
    
    return (
      <>
        <div className="fixed inset-0 bg-black/60 z-[60]" onClick={() => setEditingItem(null)} />
        {isDesktop ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-slate-800 mb-4">✏️ Modifica Articolo</h3>
              
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <p className="font-semibold text-slate-800">{editingItem.item.name}</p>
                <p className="text-sm text-slate-500">{editingItem.item.categoryName}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantità</label>
                  <input
                    type="number"
                    min="0"
                    value={itemEditForm.quantity}
                    onChange={(e) => setItemEditForm({ ...itemEditForm, quantity: e.target.value })}
                    className="w-full px-4 py-3 text-lg font-semibold border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prezzo unit. €</label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemEditForm.unitPrice}
                    onChange={(e) => setItemEditForm({ ...itemEditForm, unitPrice: e.target.value })}
                    className="w-full px-4 py-3 text-lg font-semibold border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 rounded-xl p-3 mb-4 text-center">
                <p className="text-sm text-slate-500">Nuovo totale articolo</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {formatCurrency((parseFloat(itemEditForm.quantity) || 0) * (parseFloat(itemEditForm.unitPrice) || 0))}
                </p>
              </div>

              <input
                type="text"
                value={itemEditForm.reason}
                onChange={(e) => setItemEditForm({ ...itemEditForm, reason: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl mb-4"
                placeholder="Motivo modifica (opzionale)"
              />

              <div className="flex gap-2">
                <button onClick={() => setEditingItem(null)} className="flex-1 py-3 border border-slate-200 rounded-xl font-medium hover:bg-slate-50">Annulla</button>
                <button onClick={handleSubmitItemEdit} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-600">✓ Salva</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="fixed inset-x-0 bottom-[70px] z-[60] bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[70vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 pt-3 pb-2">
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto"></div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
              <h3 className="text-xl font-bold text-slate-800 mb-4">✏️ Modifica Articolo</h3>
              
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <p className="font-semibold text-slate-800">{editingItem.item.name}</p>
                <p className="text-sm text-slate-500">{editingItem.item.categoryName}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantità</label>
                  <input
                    type="number"
                    min="0"
                    value={itemEditForm.quantity}
                    onChange={(e) => setItemEditForm({ ...itemEditForm, quantity: e.target.value })}
                    className="w-full px-4 py-3 text-lg font-semibold border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prezzo unit. €</label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemEditForm.unitPrice}
                    onChange={(e) => setItemEditForm({ ...itemEditForm, unitPrice: e.target.value })}
                    className="w-full px-4 py-3 text-lg font-semibold border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 rounded-xl p-3 mb-4 text-center">
                <p className="text-sm text-slate-500">Nuovo totale articolo</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {formatCurrency((parseFloat(itemEditForm.quantity) || 0) * (parseFloat(itemEditForm.unitPrice) || 0))}
                </p>
              </div>

              <input
                type="text"
                value={itemEditForm.reason}
                onChange={(e) => setItemEditForm({ ...itemEditForm, reason: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl mb-4"
                placeholder="Motivo modifica (opzionale)"
              />

              <div className="flex gap-2">
                <button onClick={() => setEditingItem(null)} className="flex-1 py-3 border border-slate-200 rounded-xl font-medium active:bg-slate-50">Annulla</button>
                <button onClick={handleSubmitItemEdit} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-semibold active:bg-emerald-600">✓ Salva</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // ==================== SERVICE EDIT MODAL ====================
  const ServiceEditModal = () => {
    if (!editingService) return null;
    
    return (
      <>
        <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setEditingService(null)} />
        {isDesktop ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-slate-800 mb-4">✏️ Modifica Totale Servizio</h3>
              
              <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getServiceIcon(editingService.type)}</span>
                  <span className="font-medium">{getServiceLabel(editingService.type)}</span>
                </div>
                <p><span className="text-slate-500">Proprietà:</span> <span className="font-medium">{editingService.propertyName}</span></p>
                <p><span className="text-slate-500">Totale attuale:</span> <span className="font-bold text-lg">{formatCurrency(editingService.effectivePrice)}</span></p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nuovo totale</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">€</span>
                    <input type="number" step="0.01" value={serviceEditForm.newPrice} onChange={(e) => setServiceEditForm({ ...serviceEditForm, newPrice: e.target.value })} className="w-full pl-10 pr-4 py-3 text-lg font-semibold border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Motivo modifica *</label>
                  <input type="text" value={serviceEditForm.reason} onChange={(e) => setServiceEditForm({ ...serviceEditForm, reason: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl" placeholder="Es: Sconto, errore, ecc." />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setEditingService(null)} className="flex-1 py-3 border border-slate-200 rounded-xl font-medium hover:bg-slate-50">Annulla</button>
                  <button onClick={handleSubmitServiceEdit} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-600">✓ Salva</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="fixed inset-x-0 bottom-[70px] z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[70vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 pt-3 pb-2">
              <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto"></div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
              <h3 className="text-xl font-bold text-slate-800 mb-4">✏️ Modifica Totale Servizio</h3>
              
              <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getServiceIcon(editingService.type)}</span>
                  <span className="font-medium">{getServiceLabel(editingService.type)}</span>
                </div>
                <p><span className="text-slate-500">Proprietà:</span> <span className="font-medium">{editingService.propertyName}</span></p>
                <p><span className="text-slate-500">Totale attuale:</span> <span className="font-bold text-lg">{formatCurrency(editingService.effectivePrice)}</span></p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nuovo totale</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">€</span>
                    <input type="number" step="0.01" value={serviceEditForm.newPrice} onChange={(e) => setServiceEditForm({ ...serviceEditForm, newPrice: e.target.value })} className="w-full pl-10 pr-4 py-3 text-lg font-semibold border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Motivo modifica *</label>
                  <input type="text" value={serviceEditForm.reason} onChange={(e) => setServiceEditForm({ ...serviceEditForm, reason: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl" placeholder="Es: Sconto, errore, ecc." />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setEditingService(null)} className="flex-1 py-3 border border-slate-200 rounded-xl font-medium active:bg-slate-50">Annulla</button>
                  <button onClick={handleSubmitServiceEdit} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-semibold active:bg-emerald-600">✓ Salva</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // ==================== SERVICE CARD WITH ITEMS ====================
  const ServiceCard = ({ service, onEdit }: { service: ServiceDetail; onEdit: () => void }) => {
    const [expanded, setExpanded] = useState(false);
    const hasItems = service.items && service.items.length > 0;
    
    return (
      <div className={`bg-white rounded-xl border ${service.hasOverride ? "border-amber-300" : "border-slate-200"} overflow-hidden`}>
        {/* Header */}
        <div 
          className={`p-3 flex items-center gap-3 ${hasItems ? "cursor-pointer active:bg-slate-50" : ""}`}
          onClick={() => hasItems && setExpanded(!expanded)}
        >
          <span className="text-xl">{getServiceIcon(service.type)}</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-700 truncate">{service.propertyName}</p>
            <p className="text-xs text-slate-400">{formatDate(service.date)} • {service.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${service.hasOverride ? "text-amber-600" : "text-slate-700"}`}>
              {formatCurrency(service.effectivePrice)}
            </span>
            {hasItems && (
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
            {!hasItems && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-1.5 text-slate-400 hover:text-emerald-600 active:text-emerald-600"
              >
                ✏️
              </button>
            )}
          </div>
        </div>

        {/* Items Detail */}
        {expanded && hasItems && (
          <div className="border-t border-slate-100 bg-slate-50 p-3">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase">Dettaglio articoli</p>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="text-xs text-emerald-600 font-medium"
              >
                ✏️ Modifica totale
              </button>
            </div>
            <div className="space-y-2">
              {service.items!.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700 truncate">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.categoryName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-slate-500">
                        <span className="font-semibold text-slate-700">{item.quantity}</span> x {formatCurrency(item.unitPrice)}
                      </p>
                      <p className="font-semibold text-slate-800">{formatCurrency(item.totalPrice)}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingItem({ orderId: service.id, item });
                        setItemEditForm({ 
                          quantity: String(item.quantity), 
                          unitPrice: String(item.unitPrice), 
                          reason: "" 
                        });
                      }}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 active:text-emerald-600"
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ==================== MOBILE VERSION ====================

  if (!isDesktop) {
    return (
      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 pt-4 pb-6 rounded-b-3xl">
          <h1 className="text-xl font-bold mb-3">💰 Pagamenti</h1>
          
          <div className="flex items-center justify-center gap-4 bg-white/20 rounded-2xl p-2">
            <button onClick={goToPrevMonth} className="p-2 rounded-xl active:bg-white/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-lg font-semibold min-w-[130px] text-center">
              {MONTHS_SHORT[selectedMonth - 1]} {selectedYear}
            </span>
            <button onClick={goToNextMonth} className="p-2 rounded-xl active:bg-white/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {summary && (
            <>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="bg-white/20 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase opacity-80">Totale</p>
                  <p className="text-lg font-bold">{formatCurrency(summary.totaleServizi)}</p>
                </div>
                <div className="bg-white/20 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase opacity-80">Incassato</p>
                  <p className="text-lg font-bold">{formatCurrency(summary.totaleIncassato)}</p>
                </div>
                <div className="bg-white/30 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase opacity-80">Da incassare</p>
                  <p className="text-lg font-bold">{formatCurrency(summary.saldoTotale)}</p>
                </div>
              </div>
              
              {/* Dettaglio metodi di pagamento */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-white/20 rounded-xl p-2.5 flex items-center gap-2">
                  <span className="text-lg">💵</span>
                  <div>
                    <p className="text-[9px] uppercase opacity-70">Contanti</p>
                    <p className="text-sm font-bold">{formatCurrency(summary.totaleContanti)}</p>
                  </div>
                </div>
                <div className="bg-white/20 rounded-xl p-2.5 flex items-center gap-2">
                  <span className="text-lg">🏦</span>
                  <div>
                    <p className="text-[9px] uppercase opacity-70">Bonifico</p>
                    <p className="text-sm font-bold">{formatCurrency(summary.totaleBonifico)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-4 -mt-2">
          {error && (
            <div className="bg-red-100 border border-red-300 rounded-xl p-3 mb-3 flex items-center gap-2 mt-4">
              <span>⚠️</span>
              <p className="text-red-700 text-sm flex-1">{error}</p>
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}
          {successMessage && (
            <div className="bg-emerald-100 border border-emerald-300 rounded-xl p-3 mb-3 mt-4">
              <p className="text-emerald-700 text-sm">✅ {successMessage}</p>
            </div>
          )}

          <div className="flex bg-white rounded-2xl p-1.5 shadow-sm mt-4">
            {[
              { key: "tutti", label: "Tutti", count: clients.length },
              { key: "da_pagare", label: "Da pagare", count: clients.filter(c => c.saldo > 0).length },
              { key: "saldati", label: "Saldati", count: clients.filter(c => c.saldo <= 0).length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex-1 py-2.5 px-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === tab.key ? "bg-emerald-500 text-white shadow-lg" : "text-slate-500"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          )}

          {!loading && filteredClients.length === 0 && (
            <div className="bg-white rounded-2xl p-10 text-center mt-4">
              <span className="text-5xl">📭</span>
              <p className="text-slate-500 mt-3">Nessun cliente trovato</p>
            </div>
          )}

          <div className="space-y-3 mt-4 pb-6">
            {!loading && filteredClients.map((client) => (
              <div key={client.proprietarioId} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg ${
                      client.stato === "SALDATO" ? "bg-emerald-500" : client.stato === "PARZIALE" ? "bg-amber-500" : "bg-red-500"
                    }`}>
                      {client.proprietarioName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-800 truncate">{client.proprietarioName}</h3>
                      <p className="text-xs text-slate-400">
                        {client.cleaningsCount > 0 && `🧹${client.cleaningsCount}`}
                        {client.ordersCount > 0 && ` 🛏️${client.ordersCount}`}
                        {client.kitCortesiaCount > 0 && ` 🧴${client.kitCortesiaCount}`}
                        {client.serviziExtraCount > 0 && ` 🎁${client.serviziExtraCount}`}
                      </p>
                    </div>
                    <div className="text-right">
                      {client.stato === "SALDATO" ? (
                        <span className="text-emerald-600 font-bold text-sm">✓ Saldato</span>
                      ) : (
                        <span className="text-red-600 font-bold text-lg">{formatCurrency(client.saldo)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-sm">
                    <span className="text-slate-500">Totale: <span className="font-semibold text-slate-700">{formatCurrency(client.totaleEffettivo)}</span></span>
                    <span className="text-slate-500">Pagato: <span className="font-semibold text-emerald-600">{formatCurrency(client.totalePagato)}</span></span>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setDetailClient(client)}
                      className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm active:bg-slate-200"
                    >
                      📋 Dettagli
                    </button>
                    {client.saldo > 0 && (
                      <button
                        onClick={() => setQuickPayClient(client)}
                        className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-semibold text-sm active:bg-emerald-600"
                      >
                        💳 Incassa
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Pay Modal */}
        {quickPayClient && (
          <>
            <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setQuickPayClient(null)} />
            <div className="fixed inset-x-0 bottom-[70px] z-50 bg-white rounded-t-3xl rounded-b-none shadow-2xl flex flex-col max-h-[75vh]">
              <div className="flex-shrink-0 pt-3 pb-2">
                <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto"></div>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
                <h3 className="text-xl font-bold text-slate-800 mb-1">💳 Registra Pagamento</h3>
                <p className="text-slate-500 mb-4">{quickPayClient.proprietarioName}</p>

                <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Totale dovuto</span>
                    <span className="font-semibold">{formatCurrency(quickPayClient.totaleEffettivo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Già pagato</span>
                    <span className="font-semibold text-emerald-600">{formatCurrency(quickPayClient.totalePagato)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="font-bold text-slate-700">Saldo residuo</span>
                    <span className="font-bold text-red-600 text-lg">{formatCurrency(quickPayClient.saldo)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <button
                    onClick={() => handleSubmitPayment(quickPayClient.proprietarioId, quickPayClient.proprietarioName, quickPayClient.saldo, quickPayClient.totaleEffettivo, quickPayClient.totalePagato)}
                    className="py-5 bg-emerald-500 text-white rounded-2xl font-bold active:bg-emerald-600"
                  >
                    <span className="text-2xl block">{formatCurrency(quickPayClient.saldo)}</span>
                    <span className="text-sm opacity-80">Salda tutto</span>
                  </button>
                  <button
                    onClick={() => { setShowPaymentForm(quickPayClient.proprietarioId); setQuickPayClient(null); }}
                    className="py-5 bg-slate-200 text-slate-700 rounded-2xl font-bold active:bg-slate-300"
                  >
                    <span className="text-2xl block">✏️</span>
                    <span className="text-sm">Importo custom</span>
                  </button>
                </div>

                <p className="text-sm font-medium text-slate-600 mb-2">Metodo di pagamento</p>
                <div className="flex gap-2 mb-5">
                  {(["BONIFICO", "CONTANTI", "ALTRO"] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPaymentForm({ ...paymentForm, method: m })}
                      className={`flex-1 py-3 rounded-xl font-medium text-sm ${
                        paymentForm.method === m ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {m === "BONIFICO" ? "🏦" : m === "CONTANTI" ? "💵" : "📝"} {m}
                    </button>
                  ))}
                </div>

                <button onClick={() => setQuickPayClient(null)} className="w-full py-3 text-slate-500 font-medium">
                  Annulla
                </button>
              </div>
            </div>
          </>
        )}

        {/* Custom Amount Modal */}
        {showPaymentForm && (
          <>
            <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowPaymentForm(null)} />
            <div className="fixed inset-x-0 bottom-[70px] z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[70vh]">
              <div className="flex-shrink-0 pt-3 pb-2">
                <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto"></div>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
                <h3 className="text-xl font-bold text-slate-800 mb-4">💳 Inserisci importo</h3>

                <div className="relative mb-4">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-slate-400">€</span>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-12 pr-4 py-4 text-2xl font-bold border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                </div>

                <div className="flex gap-2 mb-4">
                  {(["BONIFICO", "CONTANTI", "ALTRO"] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPaymentForm({ ...paymentForm, method: m })}
                      className={`flex-1 py-2.5 rounded-xl font-medium text-sm ${
                        paymentForm.method === m ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
                  placeholder="Note (opzionale)"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl mb-4"
                />

                <button
                  onClick={() => {
                    const client = clients.find(c => c.proprietarioId === showPaymentForm);
                    if (client) handleSubmitPayment(client.proprietarioId, client.proprietarioName, undefined, client.totaleEffettivo, client.totalePagato);
                  }}
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold text-lg active:bg-emerald-600"
                >
                  ✓ Conferma Pagamento
                </button>
                <button onClick={() => setShowPaymentForm(null)} className="w-full py-3 mt-2 text-slate-500">
                  Annulla
                </button>
              </div>
            </div>
          </>
        )}

        {/* Detail Modal */}
        {detailClient && (
          <>
            <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setDetailClient(null)} />
            <div className="fixed inset-x-0 bottom-[70px] z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[75vh]">
              {/* Handle */}
              <div className="flex-shrink-0 pt-3 pb-2">
                <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto"></div>
              </div>
              
              {/* Header fisso */}
              <div className="flex-shrink-0 px-5 pb-3 flex items-center justify-between border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-800">{detailClient.proprietarioName}</h3>
                <button onClick={() => setDetailClient(null)} className="w-10 h-10 flex items-center justify-center text-slate-400 text-xl">✕</button>
              </div>
              
              {/* Content scrollabile */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-8">
                {/* Summary */}
                <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
                  {detailClient.cleaningsCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">🧹 Pulizie ({detailClient.cleaningsCount})</span>
                      <span className="font-medium">{formatCurrency(detailClient.cleaningsTotal)}</span>
                    </div>
                  )}
                  {detailClient.ordersCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">🛏️ Biancheria ({detailClient.ordersCount})</span>
                      <span className="font-medium">{formatCurrency(detailClient.ordersTotal)}</span>
                    </div>
                  )}
                  {detailClient.kitCortesiaCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">🧴 Kit Cortesia ({detailClient.kitCortesiaCount})</span>
                      <span className="font-medium">{formatCurrency(detailClient.kitCortesiaTotal)}</span>
                    </div>
                  )}
                  {detailClient.serviziExtraCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">🎁 Servizi Extra ({detailClient.serviziExtraCount})</span>
                      <span className="font-medium">{formatCurrency(detailClient.serviziExtraTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="font-semibold">Totale</span>
                    <span className="font-bold">{formatCurrency(detailClient.totaleEffettivo)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pagato</span>
                    <span className="font-medium text-emerald-600">{formatCurrency(detailClient.totalePagato)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="font-bold">Saldo</span>
                    <span className={`font-bold text-lg ${detailClient.saldo > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {formatCurrency(detailClient.saldo)}
                    </span>
                  </div>
                </div>

                {/* Services with expandable items */}
                <h4 className="font-bold text-slate-700 mb-2">📋 Servizi del mese</h4>
                <div className="space-y-2 mb-4">
                  {detailClient.services.map((s) => (
                    <ServiceCard 
                      key={`${s.type}-${s.id}`} 
                      service={s} 
                      onEdit={() => {
                        setEditingService(s);
                        setServiceEditForm({ newPrice: String(s.effectivePrice), reason: "" });
                      }}
                    />
                  ))}
                </div>

                {/* Payments */}
                <h4 className="font-bold text-slate-700 mb-2">💳 Pagamenti ricevuti</h4>
                {detailClient.payments.length === 0 ? (
                  <p className="text-slate-400 text-sm mb-4">Nessun pagamento</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {detailClient.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-emerald-50 rounded-lg p-2.5 text-sm">
                        <div>
                          <span className="text-slate-500">{formatDate(p.createdAt)}</span>
                          <span className="ml-2 px-2 py-0.5 rounded bg-emerald-200 text-emerald-700 text-xs">{p.type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-700">{formatCurrency(p.amount)}</span>
                          <button onClick={() => handleDeletePayment(p.id)} className="text-slate-400">🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {detailClient.saldo > 0 && (
                  <button
                    onClick={() => { setDetailClient(null); setQuickPayClient(detailClient); }}
                    className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold active:bg-emerald-600"
                  >
                    💳 Registra Pagamento
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        <ServiceEditModal />
        <ItemEditModal />
      </div>
    );
  }

  // ==================== DESKTOP VERSION ====================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">💰 Gestione Pagamenti</h1>
              <p className="text-slate-500 mt-1">Contabilità clienti • Incassi e saldi</p>
            </div>
            
            <div className="flex items-center bg-slate-100 rounded-2xl p-1">
              <button onClick={goToPrevMonth} className="p-3 hover:bg-white rounded-xl transition-colors">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="px-8 py-2 font-bold text-slate-800 text-lg min-w-[200px] text-center">
                {MONTHS[selectedMonth - 1]} {selectedYear}
              </div>
              <button onClick={goToNextMonth} className="p-3 hover:bg-white rounded-xl transition-colors">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">
        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-4">
            <span className="text-2xl">⚠️</span>
            <p className="text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xl">✕</button>
          </div>
        )}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-4">
            <span className="text-2xl">✅</span>
            <p className="text-emerald-700">{successMessage}</p>
          </div>
        )}

        {/* Alert Properties */}
        {propertiesWithoutPrice.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="font-bold text-amber-800 text-lg">Proprietà senza prezzo pulizia</h3>
                <p className="text-amber-600 mt-1">Configura il prezzo per includerle nei conteggi:</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {propertiesWithoutPrice.map(p => (
                    <Link key={p.id} href={`/dashboard/proprieta/${p.id}`}
                      className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-xl hover:bg-amber-100 transition-colors">
                      <span className="font-medium text-slate-700">{p.name}</span>
                      <span className="text-amber-600">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        {summary && (
          <>
            {/* Prima riga: totali principali */}
            <div className="grid grid-cols-5 gap-5">
              {[
                { icon: "📊", label: "Totale Servizi", value: formatCurrency(summary.totaleServizi), color: "bg-blue-100" },
                { icon: "✅", label: "Incassato", value: formatCurrency(summary.totaleIncassato), color: "bg-emerald-100", textColor: "text-emerald-600" },
                { icon: "🔴", label: "Da Incassare", value: formatCurrency(summary.saldoTotale), color: "bg-red-100", textColor: "text-red-600" },
                { icon: "👥", label: "Clienti con saldo", value: summary.clientiConSaldo, color: "bg-amber-100", textColor: "text-amber-600" },
                { icon: "🎉", label: "Clienti saldati", value: summary.clientiSaldati, color: "bg-teal-100", textColor: "text-teal-600" },
              ].map((card, i) => (
                <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl ${card.color} flex items-center justify-center`}>
                      <span className="text-2xl">{card.icon}</span>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 font-medium">{card.label}</p>
                      <p className={`text-2xl font-bold ${card.textColor || "text-slate-800"}`}>{card.value}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Seconda riga: dettaglio metodi di pagamento */}
            <div className="grid grid-cols-3 gap-5">
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                    <span className="text-xl">💵</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-500 font-medium">Incassato Contanti</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(summary.totaleContanti)}</p>
                  </div>
                  {summary.totaleIncassato > 0 && (
                    <div className="text-right">
                      <span className="text-sm font-medium text-slate-400">
                        {Math.round((summary.totaleContanti / summary.totaleIncassato) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                    <span className="text-xl">🏦</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-500 font-medium">Incassato Bonifico</p>
                    <p className="text-xl font-bold text-blue-600">{formatCurrency(summary.totaleBonifico)}</p>
                  </div>
                  {summary.totaleIncassato > 0 && (
                    <div className="text-right">
                      <span className="text-sm font-medium text-slate-400">
                        {Math.round((summary.totaleBonifico / summary.totaleIncassato) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                    <span className="text-xl">💳</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-500 font-medium">Incassato Altro</p>
                    <p className="text-xl font-bold text-purple-600">{formatCurrency(summary.totaleAltro)}</p>
                  </div>
                  {summary.totaleIncassato > 0 && (
                    <div className="text-right">
                      <span className="text-sm font-medium text-slate-400">
                        {Math.round((summary.totaleAltro / summary.totaleIncassato) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-6">
            <div className="flex-1 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
              <input
                type="text"
                placeholder="Cerca cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
              />
            </div>
            
            <div className="flex bg-slate-100 rounded-xl p-1">
              {[
                { key: "tutti", label: "Tutti", count: clients.length },
                { key: "da_pagare", label: "Da pagare", count: clients.filter(c => c.saldo > 0).length },
                { key: "saldati", label: "Saldati", count: clients.filter(c => c.saldo <= 0).length },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                    activeTab === tab.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          </div>
        )}

        {/* Empty */}
        {!loading && filteredClients.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-5xl">📭</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-700">Nessun cliente trovato</h3>
            <p className="text-slate-500 mt-2 text-lg">
              {clients.length === 0 ? "Nessun servizio completato in questo mese" : "Prova a modificare i filtri"}
            </p>
          </div>
        )}

        {/* Client Cards */}
        {!loading && filteredClients.map((client) => (
          <div key={client.proprietarioId} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div
              onClick={() => setExpandedClient(expandedClient === client.proprietarioId ? null : client.proprietarioId)}
              className="px-6 py-5 cursor-pointer hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-6">
                <svg className={`w-5 h-5 text-slate-400 transition-transform ${expandedClient === client.proprietarioId ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>

                <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg ${
                  client.stato === "SALDATO" ? "bg-emerald-500" : client.stato === "PARZIALE" ? "bg-amber-500" : "bg-red-500"
                }`}>
                  {client.proprietarioName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>

                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 text-lg">{client.proprietarioName}</h3>
                  <p className="text-slate-500">
                    {client.propertyCount} proprietà • 
                    {client.cleaningsCount > 0 && ` 🧹${client.cleaningsCount}`}
                    {client.ordersCount > 0 && ` 🛏️${client.ordersCount}`}
                    {client.kitCortesiaCount > 0 && ` 🧴${client.kitCortesiaCount}`}
                    {client.serviziExtraCount > 0 && ` 🎁${client.serviziExtraCount}`}
                  </p>
                </div>

                <div className="text-right px-6 border-l border-slate-100">
                  <p className="text-sm text-slate-400">Totale</p>
                  <p className="text-xl font-bold text-slate-800">{formatCurrency(client.totaleEffettivo)}</p>
                </div>
                <div className="text-right px-6 border-l border-slate-100">
                  <p className="text-sm text-slate-400">Pagato</p>
                  <p className="text-xl font-bold text-emerald-600">{formatCurrency(client.totalePagato)}</p>
                </div>

                <div className="min-w-[150px] text-right pl-6 border-l border-slate-100">
                  {client.stato === "SALDATO" ? (
                    <span className="inline-flex items-center px-5 py-2.5 rounded-xl bg-emerald-100 text-emerald-700 font-bold">✓ Saldato</span>
                  ) : (
                    <span className={`inline-flex items-center px-5 py-2.5 rounded-xl font-bold text-lg ${
                      client.stato === "PARZIALE" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                    }`}>
                      {formatCurrency(client.saldo)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded */}
            {expandedClient === client.proprietarioId && (
              <div className="border-t border-slate-200 bg-slate-50/50">
                <div className="grid grid-cols-3 divide-x divide-slate-200">
                  {/* Col 1: Summary */}
                  <div className="p-6">
                    <h4 className="font-bold text-slate-700 mb-4 text-lg">📊 Riepilogo</h4>
                    <div className="space-y-3">
                      {client.cleaningsCount > 0 && (
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">🧹 Pulizie ({client.cleaningsCount})</span>
                          <span className="font-semibold">{formatCurrency(client.cleaningsTotal)}</span>
                        </div>
                      )}
                      {client.ordersCount > 0 && (
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">🛏️ Biancheria ({client.ordersCount})</span>
                          <span className="font-semibold">{formatCurrency(client.ordersTotal)}</span>
                        </div>
                      )}
                      {client.kitCortesiaCount > 0 && (
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">🧴 Kit Cortesia ({client.kitCortesiaCount})</span>
                          <span className="font-semibold">{formatCurrency(client.kitCortesiaTotal)}</span>
                        </div>
                      )}
                      {client.serviziExtraCount > 0 && (
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="text-slate-600">🎁 Servizi Extra ({client.serviziExtraCount})</span>
                          <span className="font-semibold">{formatCurrency(client.serviziExtraTotal)}</span>
                        </div>
                      )}
                      
                      {/* Override */}
                      <div className="bg-white rounded-xl p-4 mt-4 border border-slate-200">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-700">Totale Effettivo</span>
                          {showOverrideForm === client.proprietarioId ? (
                            <input
                              type="number" step="0.01"
                              value={overrideForm.overrideTotal}
                              onChange={(e) => setOverrideForm({ ...overrideForm, overrideTotal: e.target.value })}
                              className="w-32 px-3 py-2 border rounded-lg text-right font-bold"
                            />
                          ) : (
                            <span className="text-2xl font-bold">{formatCurrency(client.totaleEffettivo)}</span>
                          )}
                        </div>
                        {client.hasOverride && !showOverrideForm && (
                          <p className="text-sm text-amber-600 mt-2">⚠️ Modificato: {client.overrideReason}</p>
                        )}
                        {showOverrideForm === client.proprietarioId ? (
                          <div className="mt-3 space-y-2">
                            <input
                              type="text"
                              value={overrideForm.reason}
                              onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                              placeholder="Motivo modifica"
                              className="w-full px-3 py-2 border rounded-lg"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => setShowOverrideForm(null)} className="flex-1 py-2 border rounded-lg hover:bg-slate-50">Annulla</button>
                              <button onClick={() => handleSubmitOverride(client.proprietarioId, client.totaleCalcolato)} className="flex-1 py-2 bg-emerald-500 text-white rounded-lg">Salva</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-3 mt-3">
                            <button onClick={() => { setShowOverrideForm(client.proprietarioId); setOverrideForm({ overrideTotal: String(client.totaleEffettivo), reason: "" }); }} className="text-sm text-emerald-600 font-medium">✏️ Modifica</button>
                            {client.hasOverride && <button onClick={() => handleResetOverride(client.proprietarioId)} className="text-sm text-slate-500">🔄 Reset</button>}
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between py-2 border-t border-slate-200 mt-4">
                        <span className="text-slate-600">Pagato</span>
                        <span className="font-semibold text-emerald-600">{formatCurrency(client.totalePagato)}</span>
                      </div>
                      <div className="flex justify-between py-3 bg-slate-100 rounded-xl px-4 mt-2">
                        <span className="font-bold text-slate-700">SALDO</span>
                        <span className={`text-2xl font-bold ${client.saldo > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {formatCurrency(client.saldo)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Col 2: Services with Items */}
                  <div className="p-6">
                    <h4 className="font-bold text-slate-700 mb-4 text-lg">📋 Servizi</h4>
                    <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                      {client.services.map((s) => (
                        <ServiceCard 
                          key={`${s.type}-${s.id}`} 
                          service={s} 
                          onEdit={() => {
                            setEditingService(s);
                            setServiceEditForm({ newPrice: String(s.effectivePrice), reason: "" });
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Col 3: Payments */}
                  <div className="p-6">
                    <h4 className="font-bold text-slate-700 mb-4 text-lg">💳 Pagamenti</h4>
                    
                    {client.payments.length > 0 && (
                      <div className="space-y-2 mb-4 max-h-[150px] overflow-y-auto">
                        {client.payments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between bg-emerald-50 rounded-xl p-3">
                            <div>
                              <span className="text-slate-500 text-sm">{formatDate(p.createdAt)}</span>
                              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${p.type === "SALDO" ? "bg-emerald-200 text-emerald-700" : "bg-blue-200 text-blue-700"}`}>{p.type}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-emerald-700">{formatCurrency(p.amount)}</span>
                              <button onClick={() => handleDeletePayment(p.id)} className="text-slate-400 hover:text-red-600">🗑️</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Payment Form */}
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200">
                      <h5 className="font-bold text-slate-700 mb-3">➕ Nuovo Pagamento</h5>
                      
                      {showPaymentForm === client.proprietarioId ? (
                        <div className="space-y-3">
                          <div className="flex gap-4">
                            {["ACCONTO", "SALDO"].map((t) => (
                              <label key={t} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={paymentForm.type === t}
                                  onChange={() => setPaymentForm({ ...paymentForm, type: t as PaymentType, amount: t === "SALDO" ? String(client.saldo) : paymentForm.amount })}
                                  className="w-4 h-4 text-emerald-600"
                                />
                                <span className="text-sm">{t}</span>
                              </label>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                              <input
                                type="number" step="0.01"
                                value={paymentForm.amount}
                                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                className="w-full pl-8 pr-3 py-2 border rounded-lg"
                              />
                            </div>
                            <button onClick={() => setPaymentForm({ ...paymentForm, amount: String(client.saldo) })} className="px-3 py-2 text-xs text-emerald-600 bg-emerald-100 rounded-lg">= Saldo</button>
                          </div>
                          <select
                            value={paymentForm.method}
                            onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value as PaymentMethod })}
                            className="w-full px-3 py-2 border rounded-lg"
                          >
                            <option value="BONIFICO">🏦 Bonifico</option>
                            <option value="CONTANTI">💵 Contanti</option>
                            <option value="ALTRO">📝 Altro</option>
                          </select>
                          <input
                            type="text"
                            value={paymentForm.note}
                            onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
                            placeholder="Note (opzionale)"
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => { setShowPaymentForm(null); setPaymentForm({ type: "ACCONTO", amount: "", method: "BONIFICO", note: "" }); }} className="flex-1 py-2 border rounded-lg hover:bg-white">Annulla</button>
                            <button onClick={() => handleSubmitPayment(client.proprietarioId, client.proprietarioName, undefined, client.totaleEffettivo, client.totalePagato)} className="flex-1 py-2 bg-emerald-500 text-white rounded-lg font-medium">✓ Registra</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowPaymentForm(client.proprietarioId)}
                          className="w-full py-3 border-2 border-dashed border-emerald-300 rounded-xl text-emerald-600 hover:bg-emerald-50 font-medium"
                        >
                          ➕ Aggiungi Pagamento
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <ServiceEditModal />
      <ItemEditModal />
    </div>
  );
}
