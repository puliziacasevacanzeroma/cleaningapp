"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRealtimePayments, useRealtimePaymentsTimeline } from "~/hooks/useRealtimePayments";

// ==================== LUCIDE ICONS (SVG) ====================
const Icons = {
  chevronLeft: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  chevronDown: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  x: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  wallet: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  user: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  edit: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  trash: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  alertTriangle: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  home: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  bed: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16M4 12a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2M4 12v6a2 2 0 002 2h12a2 2 0 002-2v-6" />
    </svg>
  ),
  spray: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  package: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  gift: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  ),
  creditCard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  arrowTrendingUp: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  list: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  table: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  download: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  fileText: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  banknote: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  calendar: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  plus: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  ),
};

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
  propertyImage?: string; // Foto proprietà
  description: string;
  originalPrice: number;
  effectivePrice: number;
  hasOverride: boolean;
  overrideReason?: string;
  items?: OrderItemDetail[];
  cleaningId?: string;      // Per ordini: ID della pulizia collegata
  laundryOrderId?: string;  // Per pulizie: ID dell'ordine biancheria collegato
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

function formatCurrencyCompact(amount: number): string {
  if (amount >= 1000) return `€${(amount / 1000).toFixed(1)}k`;
  return `€${amount.toFixed(0)}`;
}

function formatDate(date: any): string {
  if (!date) return "-";
  try {
    let timestamp: number | null = null;
    if (typeof date === "string") timestamp = Date.parse(date);
    else if (date?.toDate && typeof date.toDate === "function") timestamp = date.toDate().getTime();
    else if (date?.seconds) timestamp = date.seconds * 1000;
    else if (date instanceof Date) timestamp = date.getTime();
    if (!timestamp || isNaN(timestamp)) return "-";
    return new Date(timestamp).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
  } catch { return "-"; }
}

function getServiceIcon(type: ServiceType) {
  switch (type) {
    case "PULIZIA": return Icons.spray;
    case "BIANCHERIA": return Icons.bed;
    case "KIT_CORTESIA": return Icons.package;
    case "SERVIZI_EXTRA": return Icons.gift;
    default: return Icons.home;
  }
}

function getServiceLabel(type: ServiceType): string {
  switch (type) {
    case "PULIZIA": return "Pulizia";
    case "BIANCHERIA": return "Biancheria";
    case "KIT_CORTESIA": return "Kit Cortesia";
    case "SERVIZI_EXTRA": return "Extra";
    default: return type;
  }
}

// ==================== MAIN COMPONENT ====================
export default function PagamentiPage() {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const defaultMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const defaultYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const [isDesktop, setIsDesktop] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedYear, setSelectedYear] = useState(defaultYear);

  // 🔥 REAL-TIME: Usa hook con Firebase listeners - ISTANTANEO!
  const { 
    loading, 
    error, 
    clients, 
    summary, 
    propertiesWithoutPrice,
    refresh: refreshPayments
  } = useRealtimePayments(selectedMonth, selectedYear);
  
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set()); // Proprietà espanse
  const [expandedBiancheria, setExpandedBiancheria] = useState<Set<string>>(new Set()); // Biancheria espanse
  const [activeTab, setActiveTab] = useState<"tutti" | "da_pagare" | "saldati">("da_pagare");
  const [searchTerm, setSearchTerm] = useState("");
  const [propertyFilter, setPropertyFilter] = useState<string>(""); // Filtro proprietà
  
  const [mainTab, setMainTab] = useState<"lista" | "timeline">("lista"); // Default lista
  
  const [quickPayClient, setQuickPayClient] = useState<ClientStats | null>(null);
  const [editingService, setEditingService] = useState<ServiceDetail | null>(null);
  const [confirmSaldoModal, setConfirmSaldoModal] = useState<{ client: ClientStats; amount: number } | null>(null);
  const [showNewPaymentModal, setShowNewPaymentModal] = useState(false); // Modal nuovo pagamento
  const [newPaymentSearch, setNewPaymentSearch] = useState(""); // Ricerca nel modal
  
  // ===== BIANCHERIA EDIT =====
  const [editingBiancheria, setEditingBiancheria] = useState<{
    service: ServiceDetail;
    items: OrderItemDetail[];
  } | null>(null);
  const [biancheriaEditLoading, setBiancheriaEditLoading] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  
  const [paymentForm, setPaymentForm] = useState({ type: "ACCONTO" as PaymentType, amount: "", method: "CONTANTI" as PaymentMethod, note: "" });
  const [serviceEditForm, setServiceEditForm] = useState({ newPrice: "", reason: "" });

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 🔥 REAL-TIME: Non serve più fetchData - i dati si aggiornano automaticamente!
  const fetchData = useCallback(async () => {
    // Forza il ricaricamento dei dati
    refreshPayments();
  }, [refreshPayments]);

  const timelineMonths = useMemo(() => {
    const months = [];
    let m = currentMonth;
    let y = currentYear;
    for (let i = 0; i < 6; i++) {  // Solo 6 mesi
      months.push({ month: m, year: y, label: MONTHS_SHORT[m - 1] });
      m--;
      if (m === 0) { m = 12; y--; }
    }
    return months.reverse();
  }, [currentMonth, currentYear]);

  // 🚀 TIMELINE REAL-TIME: Caricamento ISTANTANEO dalla cache Firebase!
  const { loading: loadingTable, tableData } = useRealtimePaymentsTimeline(timelineMonths);

  // Legacy fetchTableData - mantenuto per compatibilità con azioni (refresh dopo pagamento)
  const fetchTableData = useCallback(async () => {
    // Non serve più fare fetch - i dati sono real-time!
  }, []);

  const goToPrevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(selectedYear - 1); }
    else setSelectedMonth(selectedMonth - 1);
    setExpandedClient(null);
  };

  const goToNextMonth = () => {
    const nextM = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const nextY = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    if (nextY > currentYear || (nextY === currentYear && nextM > currentMonth)) return;
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(selectedYear + 1); }
    else setSelectedMonth(selectedMonth + 1);
    setExpandedClient(null);
  };

  const showSuccess = (msg: string) => { setSuccessMessage(msg); setTimeout(() => setSuccessMessage(null), 3000); };

  const handleSubmitPayment = async (proprietarioId: string, proprietarioName: string, customAmount?: number, totalDue?: number, totalPaid?: number) => {
    const amount = customAmount || parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { setLocalError("Inserisci un importo valido"); return; }
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proprietarioId, proprietarioName, month: String(selectedMonth), year: String(selectedYear), amount, type: customAmount ? "SALDO" : paymentForm.type, method: paymentForm.method, note: paymentForm.note, totalDue: totalDue || 0, totalPaid: totalPaid || 0 }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showSuccess(`Pagamento di ${formatCurrency(amount)} registrato`);
      setQuickPayClient(null);
      setPaymentForm({ type: "ACCONTO", amount: "", method: "CONTANTI", note: "" });
      fetchData();
      // 🚀 Timeline si aggiorna automaticamente in real-time!
    } catch (err: any) { setLocalError(err.message); }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("Eliminare questo pagamento?")) return;
    try {
      const res = await fetch(`/api/payments?id=${paymentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      showSuccess("Pagamento eliminato");
      fetchData();
    } catch (err: any) { setLocalError(err.message); }
  };

  const handleSubmitServiceEdit = async () => {
    if (!editingService) return;
    const newPrice = parseFloat(serviceEditForm.newPrice);
    if (isNaN(newPrice) || newPrice < 0) { setLocalError("Inserisci un importo valido"); return; }
    try {
      const res = await fetch("/api/payments/service-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: editingService.id, orderType: editingService.type, newPrice, reason: serviceEditForm.reason || "Modifica manuale" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showSuccess("Servizio modificato");
      setEditingService(null);
      setServiceEditForm({ newPrice: "", reason: "" });
      fetchData();
    } catch { setLocalError("Errore"); }
  };

  // ===== BIANCHERIA EDIT FUNCTIONS =====
  const openBiancheriaEditor = (service: ServiceDetail) => {
    if (!service.items || service.items.length === 0) return;
    setEditingBiancheria({
      service,
      items: JSON.parse(JSON.stringify(service.items)) // Deep copy
    });
  };

  const updateBiancheriaQuantity = (itemId: string, delta: number) => {
    if (!editingBiancheria) return;
    setEditingBiancheria(prev => {
      if (!prev) return null;
      const newItems = prev.items.map(item => {
        if (item.itemId === itemId) {
          const newQty = Math.max(0, item.quantity + delta);
          return {
            ...item,
            quantity: newQty,
            totalPrice: newQty * item.unitPrice
          };
        }
        return item;
      });
      return { ...prev, items: newItems };
    });
  };

  const removeBiancheriaItem = (itemId: string) => {
    if (!editingBiancheria) return;
    setDeletingItemId(itemId);
    setTimeout(() => {
      setEditingBiancheria(prev => {
        if (!prev) return null;
        return {
          ...prev,
          items: prev.items.filter(item => item.itemId !== itemId)
        };
      });
      setDeletingItemId(null);
    }, 300);
  };

  const saveBiancheriaChanges = async () => {
    if (!editingBiancheria) return;
    setBiancheriaEditLoading(true);
    
    try {
      // Debug: mostra cosa c'è negli items
      
      // Filtra items con quantità > 0 E sanitizza i dati
      const validItems = editingBiancheria.items
        .filter(item => item.quantity > 0)
        .map(item => ({
          itemId: item.itemId || "",
          name: item.name || "Articolo",
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          totalPrice: Number(item.totalPrice) || 0,
          categoryName: item.categoryName || "Altro"
        }));
      
      
      const newTotal = validItems.reduce((sum, item) => sum + item.totalPrice, 0);
      
      
      const res = await fetch("/api/orders/update-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: editingBiancheria.service.id,
          items: validItems,
          calculatedTotal: newTotal
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Errore aggiornamento");
      }
      
      showSuccess("Biancheria aggiornata!");
      setEditingBiancheria(null);
      fetchData();
    } catch (err: any) {
      console.error("Errore salvataggio biancheria:", err);
      setLocalError(err.message || "Errore salvataggio");
    } finally {
      setBiancheriaEditLoading(false);
    }
  };

  const getBiancheriaTotal = () => {
    if (!editingBiancheria) return 0;
    return editingBiancheria.items.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  // Lista proprietà uniche per filtro
  const allProperties = useMemo(() => {
    const props = new Set<string>();
    clients.forEach(c => c.services.forEach(s => props.add(s.propertyName)));
    return Array.from(props).sort();
  }, [clients]);

  const filteredClients = clients.filter(c => {
    if (activeTab === "da_pagare" && c.saldo <= 0) return false;
    if (activeTab === "saldati" && c.saldo > 0) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesClient = c.proprietarioName.toLowerCase().includes(search);
      const matchesProperty = c.services.some(s => s.propertyName.toLowerCase().includes(search));
      if (!matchesClient && !matchesProperty) return false;
    }
    if (propertyFilter && !c.services.some(s => s.propertyName === propertyFilter)) return false;
    return true;
  });

  // Raggruppa servizi per proprietà E poi per data (pulizia + biancheria insieme)
  const groupServicesByProperty = (services: ServiceDetail[]) => {
    const grouped: { [key: string]: ServiceDetail[] } = {};
    services.forEach(s => {
      if (!grouped[s.propertyName]) grouped[s.propertyName] = [];
      grouped[s.propertyName].push(s);
    });
    return grouped;
  };

  // Helper per normalizzare data a YYYY-MM-DD per confronti
  const normalizeDate = (dateStr: string | Date | undefined): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toISOString().split('T')[0]; // "2024-02-03"
    } catch {
      return '';
    }
  };

  // Raggruppa servizi: ogni PULIZIA è un gruppo con la sua biancheria collegata
  // La biancheria collegata va SOTTO la pulizia nella stessa card (usa data della pulizia)
  const groupServicesByDate = (services: ServiceDetail[]) => {
    // Risultato: chiave = ID univoco, valore = { pulizia?, biancheriaCollegata?, altri[], dateKey }
    const groups: { [key: string]: { pulizia?: ServiceDetail; biancheriaCollegata?: ServiceDetail; altri: ServiceDetail[]; dateKey: string } } = {};
    
    // 1. Separa pulizie e altri servizi
    const pulizie: ServiceDetail[] = [];
    const biancherie: ServiceDetail[] = [];
    const altri: ServiceDetail[] = [];
    
    services.forEach(s => {
      if (s.type === 'PULIZIA') {
        pulizie.push(s);
      } else if (s.type === 'BIANCHERIA') {
        biancherie.push(s);
      } else {
        altri.push(s);
      }
    });
    
    // 2. Per ogni PULIZIA, crea un gruppo e cerca biancheria collegata
    const biancherieUsate = new Set<string>();
    
    pulizie.forEach(pulizia => {
      const groupKey = `pulizia-${pulizia.id}`;
      const dateKey = pulizia.date || 'no-date';
      
      groups[groupKey] = {
        pulizia,
        altri: [],
        dateKey
      };
      
      // Cerca biancheria collegata (3 metodi)
      for (const biancheria of biancherie) {
        if (biancherieUsate.has(biancheria.id)) continue;
        
        let isCollegata = false;
        let matchMethod = '';
        
        // Metodo 1: pulizia.laundryOrderId === biancheria.id
        if (pulizia.laundryOrderId && pulizia.laundryOrderId === biancheria.id) {
          isCollegata = true;
          matchMethod = 'laundryOrderId';
        }
        // Metodo 2: biancheria.cleaningId === pulizia.id
        else if (biancheria.cleaningId && biancheria.cleaningId === pulizia.id) {
          isCollegata = true;
          matchMethod = 'cleaningId';
        }
        // Metodo 3: stessa proprietà + stessa data (normalizzata!)
        else if (biancheria.propertyId === pulizia.propertyId && 
                 normalizeDate(biancheria.date) === normalizeDate(pulizia.date)) {
          isCollegata = true;
          matchMethod = 'samePropertyDate';
        }
        // Metodo 4: stessa proprietà + data biancheria entro 1 giorno dalla pulizia
        // (la biancheria viene spesso consegnata il giorno prima della pulizia)
        else if (biancheria.propertyId === pulizia.propertyId) {
          const puliziaDate = new Date(pulizia.date);
          const biancheriaDate = new Date(biancheria.date);
          const diffDays = Math.abs((puliziaDate.getTime() - biancheriaDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 1) {
            isCollegata = true;
            matchMethod = 'samePropertyCloseDate';
          }
        }
        
        if (isCollegata) {
          groups[groupKey].biancheriaCollegata = biancheria;
          biancherieUsate.add(biancheria.id);
          break;
        }
      }
    });
    
    // 3. Biancherie NON collegate → gruppi standalone (per data)
    biancherie.forEach(biancheria => {
      if (biancherieUsate.has(biancheria.id)) return;
      
      const dateKey = biancheria.date || 'no-date';
      const groupKey = `standalone-${biancheria.id}`;
      
      groups[groupKey] = { altri: [biancheria], dateKey };
    });
    
    // 4. Altri servizi (kit, extra) → aggiungi a gruppi esistenti o crea nuovi
    altri.forEach(s => {
      const dateKey = s.date || 'no-date';
      const normalizedDate = normalizeDate(s.date);
      
      // Cerca un gruppo esistente con la stessa data
      let foundGroup = false;
      for (const key of Object.keys(groups)) {
        const group = groups[key];
        if (normalizeDate(group.dateKey) === normalizedDate) {
          group.altri.push(s);
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        const groupKey = `altri-${s.id}`;
        groups[groupKey] = { altri: [s], dateKey };
      }
    });
    
    // 5. Converti in formato compatibile con il rendering
    const result: { [key: string]: { pulizia?: ServiceDetail; biancheriaCollegata?: ServiceDetail; altri: ServiceDetail[] } } = {};
    
    Object.keys(groups).forEach(key => {
      const group = groups[key];
      result[key] = {
        pulizia: group.pulizia,
        biancheriaCollegata: group.biancheriaCollegata,
        altri: group.altri
      };
    });
    
    return result;
  };
  
  // Helper per formattare data da ServiceDetail
  const getDateFromService = (group: { pulizia?: ServiceDetail; biancheriaCollegata?: ServiceDetail; altri: ServiceDetail[] }): string | undefined => {
    if (group.pulizia) return group.pulizia.date;
    if (group.biancheriaCollegata) return group.biancheriaCollegata.date;
    if (group.altri.length > 0) return group.altri[0].date;
    return undefined;
  };

  // ==================== EXPORT FUNCTIONS ====================
  const exportCSV = () => {
    if (filteredClients.length === 0) {
      setLocalError("Nessun dato da esportare");
      return;
    }
    
    // Info filtri applicati
    const filterInfo = [];
    if (activeTab === "da_pagare") filterInfo.push("Solo da pagare");
    else if (activeTab === "saldati") filterInfo.push("Solo saldati");
    else filterInfo.push("Tutti i clienti");
    if (searchTerm) filterInfo.push(`Ricerca: "${searchTerm}"`);
    
    // Headers dettagliati
    const headers = [
      "Cliente", 
      "Proprietà", 
      "N. Pulizie", 
      "Tot. Pulizie",
      "N. Biancheria",
      "Tot. Biancheria", 
      "N. Kit Cortesia",
      "Tot. Kit",
      "N. Extra",
      "Tot. Extra",
      "Totale Dovuto", 
      "Pagato", 
      "Saldo", 
      "Stato",
      "Dettaglio Servizi"
    ];
    
    const rows = filteredClients.map(c => {
      // Conta servizi per tipo
      const pulizie = c.services.filter(s => s.type === "PULIZIA");
      const biancheria = c.services.filter(s => s.type === "BIANCHERIA");
      const kit = c.services.filter(s => s.type === "KIT_CORTESIA");
      const extra = c.services.filter(s => s.type === "SERVIZI_EXTRA");
      
      // Dettaglio servizi raggruppati per proprietà
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'import("/home/claude/app2/cleaningapp-main/src/hooks/useRealti...
      const groupedByProp = groupServicesByProperty(c.services);
      const dettaglio = Object.entries(groupedByProp).map(([prop, services]) => {
        const propTotal = services.reduce((sum, s) => sum + s.effectivePrice, 0);
        return `${prop}: ${formatCurrency(propTotal)}`;
      }).join(" | ");
      
      return [
        c.proprietarioName,
        c.propertyCount,
        pulizie.length,
        pulizie.reduce((sum, s) => sum + s.effectivePrice, 0).toFixed(2),
        biancheria.length,
        biancheria.reduce((sum, s) => sum + s.effectivePrice, 0).toFixed(2),
        kit.length,
        kit.reduce((sum, s) => sum + s.effectivePrice, 0).toFixed(2),
        extra.length,
        extra.reduce((sum, s) => sum + s.effectivePrice, 0).toFixed(2),
        c.totaleEffettivo.toFixed(2),
        c.totalePagato.toFixed(2),
        c.saldo.toFixed(2),
        c.saldo <= 0 ? "SALDATO" : c.totalePagato > 0 ? "PARZIALE" : "DA_PAGARE",
        dettaglio
      ];
    });
    
    // Totali
    const totals = [
      "TOTALE",
      filteredClients.reduce((s, c) => s + c.propertyCount, 0),
      filteredClients.reduce((s, c) => s + c.services.filter(x => x.type === "PULIZIA").length, 0),
      filteredClients.reduce((s, c) => s + c.services.filter(x => x.type === "PULIZIA").reduce((sum, x) => sum + x.effectivePrice, 0), 0).toFixed(2),
      filteredClients.reduce((s, c) => s + c.services.filter(x => x.type === "BIANCHERIA").length, 0),
      filteredClients.reduce((s, c) => s + c.services.filter(x => x.type === "BIANCHERIA").reduce((sum, x) => sum + x.effectivePrice, 0), 0).toFixed(2),
      filteredClients.reduce((s, c) => s + c.services.filter(x => x.type === "KIT_CORTESIA").length, 0),
      filteredClients.reduce((s, c) => s + c.services.filter(x => x.type === "KIT_CORTESIA").reduce((sum, x) => sum + x.effectivePrice, 0), 0).toFixed(2),
      filteredClients.reduce((s, c) => s + c.services.filter(x => x.type === "SERVIZI_EXTRA").length, 0),
      filteredClients.reduce((s, c) => s + c.services.filter(x => x.type === "SERVIZI_EXTRA").reduce((sum, x) => sum + x.effectivePrice, 0), 0).toFixed(2),
      filteredClients.reduce((s, c) => s + c.totaleEffettivo, 0).toFixed(2),
      filteredClients.reduce((s, c) => s + c.totalePagato, 0).toFixed(2),
      filteredClients.reduce((s, c) => s + c.saldo, 0).toFixed(2),
      "",
      ""
    ];
    
    const csvContent = [
      `Report Pagamenti - ${MONTHS[selectedMonth - 1]} ${selectedYear}`,
      `Generato il: ${new Date().toLocaleDateString('it-IT')} alle ${new Date().toLocaleTimeString('it-IT')}`,
      `Filtri applicati: ${filterInfo.join(", ")}`,
      `Clienti esportati: ${filteredClients.length}`,
      "",
      headers.join(";"),
      ...rows.map(r => r.join(";")),
      "",
      totals.join(";")
    ].join("\n");
    
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const filterSuffix = activeTab !== "tutti" ? `_${activeTab}` : "";
    link.download = `pagamenti_${selectedMonth}_${selectedYear}${filterSuffix}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showSuccess(`CSV scaricato con ${filteredClients.length} clienti${filterInfo.length > 1 ? " (filtrati)" : ""}`);
  };

  const exportPDF = async () => {
    if (filteredClients.length === 0) {
      setLocalError("Nessun dato da esportare");
      return;
    }
    
    try {
      const res = await fetch("/api/payments/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          clients: filteredClients.map(c => ({
            name: c.proprietarioName,
            properties: c.propertyCount,
            services: c.services.length,
            total: c.totaleEffettivo,
            paid: c.totalePagato,
            balance: c.saldo,
            status: c.saldo <= 0 ? "SALDATO" : c.totalePagato > 0 ? "PARZIALE" : "DA_PAGARE"
          })),
          summary: summary
        })
      });
      
      if (!res.ok) {
        // Fallback: genera PDF lato client
        generateClientPDF();
        return;
      }
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pagamenti_${selectedMonth}_${selectedYear}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      showSuccess("PDF scaricato");
    } catch {
      generateClientPDF();
    }
  };

  const generateClientPDF = () => {
    // PDF Professionale con design moderno
    const today = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
    
    const content = `
      <!DOCTYPE html>
      <html lang="it">
        <head>
          <meta charset="UTF-8">
          <title>Report Pagamenti - ${MONTHS[selectedMonth - 1]} ${selectedYear}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { margin: 0; size: A4; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              color: #1e293b;
              background: #fff;
              line-height: 1.5;
            }
            
            /* Header con gradient */
            .header {
              background: linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%);
              color: white;
              padding: 30px 40px;
              position: relative;
              overflow: hidden;
            }
            .header::before {
              content: '';
              position: absolute;
              top: -50%;
              right: -10%;
              width: 300px;
              height: 300px;
              background: rgba(255,255,255,0.05);
              border-radius: 50%;
            }
            .header-content {
              position: relative;
              z-index: 1;
            }
            .logo-section {
              display: flex;
              align-items: center;
              gap: 15px;
              margin-bottom: 20px;
            }
            .logo-icon {
              width: 50px;
              height: 50px;
              background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
              border-radius: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 24px;
              font-weight: bold;
              box-shadow: 0 4px 15px rgba(56, 189, 248, 0.3);
            }
            .company-name {
              font-size: 28px;
              font-weight: 700;
              letter-spacing: -0.5px;
            }
            .company-subtitle {
              font-size: 12px;
              opacity: 0.7;
              margin-top: 2px;
            }
            .report-title {
              font-size: 18px;
              font-weight: 600;
              margin-top: 15px;
              padding-top: 15px;
              border-top: 1px solid rgba(255,255,255,0.2);
            }
            .report-date {
              font-size: 13px;
              opacity: 0.8;
              margin-top: 5px;
            }
            
            /* Summary Cards */
            .summary-section {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              padding: 25px 40px;
              background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
            }
            .summary-card {
              background: white;
              border-radius: 12px;
              padding: 20px;
              text-align: center;
              box-shadow: 0 2px 10px rgba(0,0,0,0.05);
              border: 1px solid #e2e8f0;
            }
            .summary-card.green {
              background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
              border-color: #a7f3d0;
            }
            .summary-card.red {
              background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
              border-color: #fecaca;
            }
            .summary-label {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #64748b;
              margin-bottom: 8px;
            }
            .summary-value {
              font-size: 24px;
              font-weight: 700;
              color: #1e293b;
            }
            .summary-card.green .summary-value { color: #059669; }
            .summary-card.red .summary-value { color: #dc2626; }
            
            /* Progress Bar */
            .progress-section {
              padding: 0 40px 25px;
              background: white;
            }
            .progress-bar-container {
              background: #e2e8f0;
              border-radius: 10px;
              height: 12px;
              overflow: hidden;
            }
            .progress-bar {
              height: 100%;
              background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
              border-radius: 10px;
              transition: width 0.3s;
            }
            .progress-label {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8px;
              font-size: 12px;
              color: #64748b;
            }
            .progress-percent {
              font-weight: 700;
              color: #10b981;
            }
            
            /* Content */
            .content {
              padding: 0 40px 30px;
            }
            
            /* Client Section */
            .client-section {
              margin-bottom: 25px;
              page-break-inside: avoid;
            }
            .client-header {
              background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
              padding: 15px 20px;
              border-radius: 12px 12px 0 0;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border: 1px solid #e2e8f0;
              border-bottom: none;
            }
            .client-name {
              font-size: 16px;
              font-weight: 700;
              color: #1e293b;
            }
            .client-badge {
              padding: 6px 14px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 600;
            }
            .badge-saldato {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
            }
            .badge-parziale {
              background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
              color: white;
            }
            .badge-da-pagare {
              background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
              color: white;
            }
            
            /* Services Table */
            .services-table {
              width: 100%;
              border-collapse: collapse;
              background: white;
              border: 1px solid #e2e8f0;
              border-top: none;
              border-radius: 0 0 12px 12px;
              overflow: hidden;
            }
            .services-table th {
              background: #f8fafc;
              padding: 12px 15px;
              text-align: left;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #64748b;
              font-weight: 600;
              border-bottom: 1px solid #e2e8f0;
            }
            .services-table td {
              padding: 12px 15px;
              font-size: 13px;
              border-bottom: 1px solid #f1f5f9;
            }
            .services-table tr:last-child td {
              border-bottom: none;
            }
            .service-type {
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            .service-icon {
              width: 28px;
              height: 28px;
              border-radius: 6px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
            }
            .service-icon.pulizia { background: #dbeafe; color: #2563eb; }
            .service-icon.biancheria { background: #fce7f3; color: #db2777; }
            .service-icon.kit { background: #fef3c7; color: #d97706; }
            .service-icon.extra { background: #ede9fe; color: #7c3aed; }
            
            /* Client Totals */
            .client-totals {
              background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
              padding: 12px 15px;
              display: flex;
              justify-content: flex-end;
              gap: 30px;
              border-top: 2px solid #e2e8f0;
            }
            .total-item {
              text-align: right;
            }
            .total-label {
              font-size: 10px;
              text-transform: uppercase;
              color: #64748b;
            }
            .total-value {
              font-size: 16px;
              font-weight: 700;
            }
            .total-value.green { color: #059669; }
            .total-value.red { color: #dc2626; }
            
            /* Footer */
            .footer {
              background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
              color: white;
              padding: 25px 40px;
              margin-top: 30px;
            }
            .footer-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 20px;
              text-align: center;
            }
            .footer-item-label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 1px;
              opacity: 0.7;
              margin-bottom: 5px;
            }
            .footer-item-value {
              font-size: 20px;
              font-weight: 700;
            }
            .footer-item-value.green { color: #34d399; }
            .footer-item-value.red { color: #f87171; }
            .footer-note {
              text-align: center;
              margin-top: 20px;
              padding-top: 15px;
              border-top: 1px solid rgba(255,255,255,0.1);
              font-size: 11px;
              opacity: 0.6;
            }
            
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .client-section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <!-- Header -->
          <div class="header">
            <div class="header-content">
              <div class="logo-section">
                <div class="logo-icon">C</div>
                <div>
                  <div class="company-name">CleaningApp</div>
                  <div class="company-subtitle">Gestionale Pro</div>
                </div>
              </div>
              <div class="report-title">📊 Report Pagamenti - ${MONTHS[selectedMonth - 1]} ${selectedYear}</div>
              <div class="report-date">Generato il ${today} • ${filteredClients.length} clienti${activeTab !== "tutti" ? ` • Filtro: ${activeTab === "da_pagare" ? "Solo da pagare" : "Solo saldati"}` : ""}${searchTerm ? ` • Ricerca: "${searchTerm}"` : ""}</div>
            </div>
          </div>
          
          <!-- Summary -->
          ${summary ? `
          <div class="summary-section">
            <div class="summary-card">
              <div class="summary-label">Totale Servizi</div>
              <div class="summary-value">€${summary.totaleServizi.toFixed(2)}</div>
            </div>
            <div class="summary-card green">
              <div class="summary-label">Incassato</div>
              <div class="summary-value">€${summary.totaleIncassato.toFixed(2)}</div>
            </div>
            <div class="summary-card red">
              <div class="summary-label">Da Incassare</div>
              <div class="summary-value">€${summary.saldoTotale.toFixed(2)}</div>
            </div>
          </div>
          
          <div class="progress-section">
            <div class="progress-label">
              <span>Progresso Incassi</span>
              <span class="progress-percent">${summary.totaleServizi > 0 ? Math.round((summary.totaleIncassato / summary.totaleServizi) * 100) : 0}%</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar" style="width: ${summary.totaleServizi > 0 ? (summary.totaleIncassato / summary.totaleServizi) * 100 : 0}%"></div>
            </div>
          </div>
          ` : ''}
          
          <!-- Clients Detail -->
          <div class="content">
            ${filteredClients.map(c => {
              const stato = c.saldo <= 0 ? "SALDATO" : c.totalePagato > 0 ? "PARZIALE" : "DA_PAGARE";
              const badgeClass = stato === "SALDATO" ? "badge-saldato" : stato === "PARZIALE" ? "badge-parziale" : "badge-da-pagare";
              
              return `
                <div class="client-section">
                  <div class="client-header">
                    <div class="client-name">${c.proprietarioName}</div>
                    <div class="client-badge ${badgeClass}">${stato === "SALDATO" ? "✓ Saldato" : stato === "PARZIALE" ? "◐ Parziale" : "○ Da pagare"}</div>
                  </div>
                  <table class="services-table">
                    <thead>
                      <tr>
                        <th>Servizio</th>
                        <th>Proprietà</th>
                        <th>Data</th>
                        <th style="text-align: right">Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${c.services.map(s => {
                        const iconClass = s.type === "PULIZIA" ? "pulizia" : s.type === "BIANCHERIA" ? "biancheria" : s.type === "KIT_CORTESIA" ? "kit" : "extra";
                        const iconEmoji = s.type === "PULIZIA" ? "🧹" : s.type === "BIANCHERIA" ? "🛏️" : s.type === "KIT_CORTESIA" ? "🎁" : "✨";
                        const label = s.type === "PULIZIA" ? "Pulizia" : s.type === "BIANCHERIA" ? "Biancheria" : s.type === "KIT_CORTESIA" ? "Kit Cortesia" : "Extra";
                        return `
                          <tr>
                            <td>
                              <span class="service-type">
                                <span class="service-icon ${iconClass}">${iconEmoji}</span>
                                ${label}
                              </span>
                            </td>
                            <td>${s.propertyName}</td>
                            <td>${s.date}</td>
                            <td style="text-align: right; font-weight: 600">€${s.effectivePrice.toFixed(2)}</td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                  <div class="client-totals">
                    <div class="total-item">
                      <div class="total-label">Totale</div>
                      <div class="total-value">€${c.totaleEffettivo.toFixed(2)}</div>
                    </div>
                    <div class="total-item">
                      <div class="total-label">Pagato</div>
                      <div class="total-value green">€${c.totalePagato.toFixed(2)}</div>
                    </div>
                    <div class="total-item">
                      <div class="total-label">Saldo</div>
                      <div class="total-value ${c.saldo > 0 ? 'red' : 'green'}">€${c.saldo.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          
          <!-- Footer -->
          ${summary ? `
          <div class="footer">
            <div class="footer-grid">
              <div>
                <div class="footer-item-label">Totale Servizi</div>
                <div class="footer-item-value">€${summary.totaleServizi.toFixed(2)}</div>
              </div>
              <div>
                <div class="footer-item-label">Contanti</div>
                <div class="footer-item-value">€${summary.totaleContanti.toFixed(2)}</div>
              </div>
              <div>
                <div class="footer-item-label">Bonifico</div>
                <div class="footer-item-value">€${summary.totaleBonifico.toFixed(2)}</div>
              </div>
              <div>
                <div class="footer-item-label">Da Incassare</div>
                <div class="footer-item-value red">€${summary.saldoTotale.toFixed(2)}</div>
              </div>
            </div>
            <div class="footer-note">
              CleaningApp - Report generato automaticamente • ${today}
            </div>
          </div>
          ` : ''}
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 250);
    }
    showSuccess("PDF generato");
  };

  const clientColors = ["from-rose-500 to-red-600", "from-sky-500 to-blue-600", "from-emerald-500 to-teal-600", "from-amber-500 to-orange-600", "from-violet-500 to-purple-600", "from-pink-500 to-rose-600", "from-cyan-500 to-sky-600", "from-lime-500 to-green-600"];

  // Ref per scroll sincronizzato
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  
  // Ricerca timeline
  const [timelineSearch, setTimelineSearch] = useState("");
  
  // Filtra clienti per timeline
  const filteredTableData = tableData.filter(client => {
    if (!timelineSearch) return true;
    const search = timelineSearch.toLowerCase();
    return client.proprietarioName.toLowerCase().includes(search) ||
           client.properties.some(p => p.toLowerCase().includes(search));
  });

  // ==================== TIMELINE VIEW (STILE GANTT) ====================
  const TimelineView = () => {
    if (loadingTable) return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-sky-500 border-t-transparent"></div>
      </div>
    );

    const isCurrentMonth = (m: number, y: number) => m === currentMonth && y === currentYear;
    const cellWidth = 100; // colonne più larghe

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
        {/* Barra di ricerca migliorata */}
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Cerca cliente o proprietà..."
                value={timelineSearch}
                onChange={(e) => setTimelineSearch(e.target.value)}
                className="w-full pl-16 pr-4 py-4 text-base bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 transition-all placeholder:text-slate-400"
              />
              {timelineSearch && (
                <button 
                  onClick={() => setTimelineSearch("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                >
                  {Icons.x}
                </button>
              )}
            </div>
            
            {/* Export Buttons anche nella Timeline */}
            <div className="flex gap-2">
              <button 
                onClick={exportCSV} 
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md"
              >
                {Icons.download}
                <span>CSV</span>
              </button>
              <button 
                onClick={exportPDF} 
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-xl text-sm font-semibold hover:from-red-600 hover:to-rose-600 transition-all shadow-md"
              >
                {Icons.fileText}
                <span>PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Header mesi */}
        <div 
          ref={headerRef}
          className="overflow-x-auto sticky top-0 z-20 bg-gradient-to-b from-slate-100 to-slate-50"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div 
            className="grid" 
            style={{ gridTemplateColumns: `repeat(${timelineMonths.length}, ${cellWidth}px)` }}
          >
            {timelineMonths.map((m, idx) => (
              <div 
                key={idx} 
                className={`py-4 text-center transition-all ${
                  isCurrentMonth(m.month, m.year) 
                    ? "bg-gradient-to-b from-sky-100 to-sky-50" 
                    : idx === 0 ? "border-l-0" : ""
                }`}
                style={{
                  borderRight: idx < timelineMonths.length - 1 ? '1px solid rgba(148, 163, 184, 0.3)' : 'none'
                }}
              >
                <div className={`text-[10px] font-semibold mb-1 ${isCurrentMonth(m.month, m.year) ? "text-sky-600" : "text-slate-400"}`}>
                  {m.year !== currentYear ? m.year : ""}
                </div>
                {isCurrentMonth(m.month, m.year) ? (
                  <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 text-white text-sm font-bold flex items-center justify-center shadow-lg">
                    {m.label}
                  </div>
                ) : (
                  <div className="text-base font-bold text-slate-700 py-2">{m.label}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Griglia clienti */}
        <div 
          ref={gridRef}
          className="overflow-x-auto"
          onScroll={(e) => {
            if (headerRef.current) {
              headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
        >
          {filteredTableData.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
                {Icons.user}
              </div>
              <p className="text-slate-500">{timelineSearch ? "Nessun cliente trovato" : "Nessun dato disponibile"}</p>
            </div>
          ) : (
            filteredTableData.map((client, idx) => {
              const totaleNonPagato = client.months.reduce((sum, m) => sum + (m.saldo > 0 ? m.saldo : 0), 0);
              const initials = client.proprietarioName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
              
              // Sfumatura alternata elegante
              const rowBg = idx % 2 === 0 
                ? "bg-gradient-to-r from-white via-slate-50/50 to-white" 
                : "bg-gradient-to-r from-slate-50/80 via-slate-100/30 to-slate-50/80";
              
              return (
                <div 
                  key={client.proprietarioId} 
                  className={`relative h-[70px] ${rowBg}`}
                  style={{ 
                    width: `${timelineMonths.length * cellWidth}px`,
                    borderBottom: '1px solid rgba(226, 232, 240, 0.6)'
                  }}
                >
                  {/* Badge nome cliente - STICKY */}
                  <div 
                    className="h-7 flex items-center gap-2 pl-2 pr-4 rounded-br-2xl shadow-lg sticky left-0 w-fit z-10"
                    style={{ 
                      background: idx % 2 === 0 
                        ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)'
                        : 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%)',
                      marginBottom: '-28px',
                      boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
                    }}
                  >
                    <div className="w-5 h-5 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[9px] font-bold">{initials}</span>
                    </div>
                    <span className="text-white text-[11px] font-semibold whitespace-nowrap drop-shadow-sm max-w-[140px] truncate">
                      {client.proprietarioName}
                    </span>
                    {totaleNonPagato > 0 && (
                      <span className="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                        {formatCurrencyCompact(totaleNonPagato)}
                      </span>
                    )}
                  </div>

                  {/* Griglia sfondo con bordi sottili */}
                  <div 
                    className="absolute inset-0 grid" 
                    style={{ gridTemplateColumns: `repeat(${timelineMonths.length}, ${cellWidth}px)` }}
                  >
                    {timelineMonths.map((m, i) => (
                      <div 
                        key={i} 
                        className={`${isCurrentMonth(m.month, m.year) ? "bg-sky-50/30" : ""}`}
                        style={{
                          borderRight: i < timelineMonths.length - 1 ? '1px solid rgba(226, 232, 240, 0.4)' : 'none'
                        }}
                      />
                    ))}
                  </div>

                  {/* Blocchi pagamenti */}
                  {timelineMonths.map((m, mIdx) => {
                    const monthData = client.months.find(cm => cm.month === m.month && cm.year === m.year);
                    const status = monthData?.status || "NESSUNO";
                    const saldo = monthData?.saldo || 0;
                    
                    if (status === "NESSUNO") return null;
                    
                    let bgColor, content;
                    
                    if (status === "PAGATO") {
                      bgColor = "from-emerald-400 to-teal-500";
                      content = (
                        <div className="flex items-center gap-1">
                          {Icons.check}
                          <span className="text-xs font-bold">OK</span>
                        </div>
                      );
                    } else if (status === "PARZIALE") {
                      bgColor = "from-amber-400 to-orange-500";
                      content = (
                        <span className="text-sm font-bold">{formatCurrencyCompact(saldo)}</span>
                      );
                    } else {
                      bgColor = "from-rose-400 to-red-500";
                      content = (
                        <span className="text-sm font-bold">{formatCurrencyCompact(saldo)}</span>
                      );
                    }
                    
                    return (
                      <button
                        key={mIdx}
                        onClick={() => {
                          setSelectedMonth(m.month);
                          setSelectedYear(m.year);
                          setMainTab("lista");
                          setSearchTerm(client.proprietarioName);
                          setActiveTab("da_pagare");
                        }}
                        className={`absolute top-[26px] bg-gradient-to-br ${bgColor} text-white rounded-lg shadow-md flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform z-10`}
                        style={{ 
                          left: `${mIdx * cellWidth + 4}px`, 
                          width: `${cellWidth - 8}px`, 
                          height: "30px" 
                        }}
                      >
                        {content}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Legenda */}
        <div className="p-3 border-t border-slate-200 bg-slate-50">
          <div className="flex flex-wrap justify-center gap-4 text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-5 rounded bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white">{Icons.check}</div>
              <span className="text-slate-600 font-medium">Pagato</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-5 rounded bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[9px] font-bold">€X</div>
              <span className="text-slate-600 font-medium">Parziale</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-5 rounded bg-gradient-to-br from-rose-400 to-red-500 flex items-center justify-center text-white text-[9px] font-bold">€X</div>
              <span className="text-slate-600 font-medium">Da pagare</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ==================== QUICK PAY MODAL ====================
  const QuickPayModal = () => {
    if (!quickPayClient) return null;
    const [paymentMode, setPaymentMode] = useState<"totale" | "acconto">("totale");
    const [customAmount, setCustomAmount] = useState(String(quickPayClient.saldo));
    
    const handleModeChange = (mode: "totale" | "acconto") => {
      setPaymentMode(mode);
      if (mode === "totale") {
        setCustomAmount(String(quickPayClient.saldo));
      } else {
        setCustomAmount("");
      }
    };
    
    const finalAmount = paymentMode === "totale" ? quickPayClient.saldo : parseFloat(customAmount) || 0;
    
    return (
      <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setQuickPayClient(null)} />
        <div 
          className={`fixed z-50 bg-white shadow-2xl flex flex-col ${
            isDesktop 
              ? "inset-0 m-auto max-w-md max-h-[85vh] rounded-2xl" 
              : "inset-x-2 bottom-2 top-auto max-h-[85vh] rounded-2xl"
          }`}
        >
          {/* Header */}
          <div className="flex-shrink-0 p-3 sm:p-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg flex-shrink-0">{Icons.wallet}</div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-base sm:text-lg">Registra Incasso</h3>
                  <p className="text-xs sm:text-sm text-slate-500 truncate">{quickPayClient.proprietarioName}</p>
                </div>
              </div>
              <button onClick={() => setQuickPayClient(null)} className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">{Icons.x}</button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-4 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Riepilogo importi */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl sm:rounded-2xl p-3 sm:p-4 text-white">
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <span className="text-slate-400 text-xs sm:text-sm">Totale dovuto</span>
                <span className="font-bold text-base sm:text-lg">{formatCurrency(quickPayClient.totaleEffettivo)}</span>
              </div>
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <span className="text-emerald-400 text-sm">Già pagato</span>
                <span className="font-bold text-emerald-400">{formatCurrency(quickPayClient.totalePagato)}</span>
              </div>
              <div className="border-t border-slate-700 pt-3 flex justify-between items-center">
                <span className="font-semibold">Da incassare</span>
                <span className="font-bold text-2xl text-red-400">{formatCurrency(quickPayClient.saldo)}</span>
              </div>
            </div>
            
            {/* Tipo pagamento */}
            <div>
              <p className="text-sm font-semibold text-slate-600 mb-3">Tipo di pagamento</p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => handleModeChange("totale")}
                  className={`p-4 rounded-2xl border-2 transition-all ${
                    paymentMode === "totale" 
                      ? "border-emerald-500 bg-emerald-50" 
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${
                    paymentMode === "totale" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                    {Icons.check}
                  </div>
                  <p className={`font-bold text-center ${paymentMode === "totale" ? "text-emerald-700" : "text-slate-700"}`}>
                    Incassa Totale
                  </p>
                  <p className={`text-sm text-center mt-1 ${paymentMode === "totale" ? "text-emerald-600" : "text-slate-500"}`}>
                    {formatCurrency(quickPayClient.saldo)}
                  </p>
                </button>
                
                <button 
                  onClick={() => handleModeChange("acconto")}
                  className={`p-4 rounded-2xl border-2 transition-all ${
                    paymentMode === "acconto" 
                      ? "border-amber-500 bg-amber-50" 
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${
                    paymentMode === "acconto" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                    {Icons.edit}
                  </div>
                  <p className={`font-bold text-center ${paymentMode === "acconto" ? "text-amber-700" : "text-slate-700"}`}>
                    Paga Acconto
                  </p>
                  <p className={`text-sm text-center mt-1 ${paymentMode === "acconto" ? "text-amber-600" : "text-slate-500"}`}>
                    Importo parziale
                  </p>
                </button>
              </div>
            </div>
            
            {/* Importo - Solo per acconto */}
            {paymentMode === "acconto" && (
              <div>
                <p className="text-sm font-semibold text-slate-600 mb-2">Importo acconto</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl font-bold">€</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={customAmount} 
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 text-2xl font-bold border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-amber-500 text-center" 
                    placeholder="0,00"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2 text-center">
                  Residuo dopo acconto: {formatCurrency(quickPayClient.saldo - (parseFloat(customAmount) || 0))}
                </p>
              </div>
            )}
            
            {/* Metodo pagamento */}
            <div>
              <p className="text-sm font-semibold text-slate-600 mb-2">Metodo di pagamento</p>
              <div className="flex gap-2">
                {(["CONTANTI", "BONIFICO", "ALTRO"] as PaymentMethod[]).map((m) => (
                  <button 
                    key={m} 
                    onClick={() => setPaymentForm({ ...paymentForm, method: m })}
                    className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                      paymentForm.method === m 
                        ? "bg-slate-800 text-white shadow-md" 
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {m === "CONTANTI" ? "Contanti" : m === "BONIFICO" ? "Bonifico" : "Altro"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Footer con bottone conferma */}
          <div className="flex-shrink-0 p-4 border-t border-slate-200 bg-white">
            <button 
              onClick={() => {
                if (paymentMode === "totale") {
                  setConfirmSaldoModal({ client: quickPayClient, amount: quickPayClient.saldo });
                } else if (finalAmount > 0) {
                  handleSubmitPayment(quickPayClient.proprietarioId, quickPayClient.proprietarioName, finalAmount, quickPayClient.totaleEffettivo, quickPayClient.totalePagato);
                  setQuickPayClient(null);
                }
              }}
              disabled={paymentMode === "acconto" && finalAmount <= 0}
              className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                paymentMode === "totale"
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-lg"
                  : finalAmount > 0
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-lg"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              {Icons.check}
              <span>
                {paymentMode === "totale" 
                  ? `Incassa Totale ${formatCurrency(quickPayClient.saldo)}`
                  : finalAmount > 0 
                    ? `Registra Acconto ${formatCurrency(finalAmount)}`
                    : "Inserisci importo"
                }
              </span>
            </button>
          </div>
        </div>
      </>
    );
  };

  // ==================== CONFIRM SALDO MODAL ====================
  const ConfirmSaldoModal = () => {
    if (!confirmSaldoModal) return null;
    return (
      <>
        <div className="fixed inset-0 bg-black/70 z-[70]" onClick={() => setConfirmSaldoModal(null)} />
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-2xl shadow-2xl p-6">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg text-white">{Icons.wallet}</div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Conferma incasso</h3>
              <p className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(confirmSaldoModal.amount)}</p>
              <p className="text-sm text-slate-500 mt-1">{confirmSaldoModal.client.proprietarioName}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmSaldoModal(null)} className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50">Annulla</button>
              <button onClick={() => { handleSubmitPayment(confirmSaldoModal.client.proprietarioId, confirmSaldoModal.client.proprietarioName, confirmSaldoModal.amount, confirmSaldoModal.client.totaleEffettivo, confirmSaldoModal.client.totalePagato); setConfirmSaldoModal(null); setQuickPayClient(null); }}
                className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-600 flex items-center justify-center gap-2">{Icons.check} Conferma</button>
            </div>
          </div>
        </div>
      </>
    );
  };

  // ==================== CLIENT CARD ====================
  const ClientCard = ({ client, index }: { client: ClientStats; index: number }) => {
    const initials = client.proprietarioName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    const isExpanded = expandedClient === client.proprietarioId;
    const cardRef = useRef<HTMLDivElement>(null);
    const groupedServices = groupServicesByProperty(client.services);
    const propertyNames = Object.keys(groupedServices);
    
    const toggleProperty = (propName: string) => {
      const key = `${client.proprietarioId}-${propName}`;
      setExpandedProperties(prev => {
        const newSet = new Set(prev);
        if (newSet.has(key)) newSet.delete(key);
        else newSet.add(key);
        return newSet;
      });
    };
    
    const isPropertyExpanded = (propName: string) => expandedProperties.has(`${client.proprietarioId}-${propName}`);
    
    const handleExpand = () => {
      const willExpand = !isExpanded;
      setExpandedClient(willExpand ? client.proprietarioId : null);
      if (willExpand && cardRef.current) setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    };
    
    // Formatta data in modo leggibile
    const formatServiceDate = (dateStr?: string) => {
      if (!dateStr) return null;
      try {
        const date = new Date(dateStr);
        const day = date.getDate();
        const month = MONTHS_SHORT[date.getMonth()];
        const weekday = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'][date.getDay()];
        return { day, month, weekday };
      } catch { return null; }
    };
    
    return (
      <div ref={cardRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header con info cliente + bottone pagamento */}
        <div className="p-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${clientColors[index % clientColors.length]} flex items-center justify-center shadow-md flex-shrink-0`}>
              <span className="text-white text-sm font-bold">{initials}</span>
            </div>
            
            {/* Info cliente */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-800 truncate">{client.proprietarioName}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span className="flex items-center gap-1">{Icons.home} {propertyNames.length} proprietà</span>
                <span>•</span>
                <span>{client.services.length} servizi</span>
              </div>
            </div>
            
            {/* Saldo + Bottone pagamento */}
            <div className="flex items-center gap-2">
              {client.saldo > 0 ? (
                <>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Da incassare</p>
                    <p className="font-bold text-red-600 text-lg">{formatCurrency(client.saldo)}</p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setQuickPayClient(client); }}
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
                    title="Incassa"
                  >
                    {Icons.creditCard}
                  </button>
                </>
              ) : (
                <div className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-semibold flex items-center gap-1.5">
                  {Icons.check}
                  <span>Saldato</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Mini riepilogo proprietà (sempre visibile) */}
          <div className="mt-3 flex flex-wrap gap-2">
            {propertyNames.slice(0, 3).map((propName, i) => {
              const propServices = groupedServices[propName];
              const propTotal = propServices.reduce((sum, s) => sum + s.effectivePrice, 0);
              return (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg text-xs">
                  <span className="font-medium text-slate-700 truncate max-w-[100px]">{propName}</span>
                  <span className="text-slate-500">•</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(propTotal)}</span>
                </div>
              );
            })}
            {propertyNames.length > 3 && (
              <div className="px-2.5 py-1.5 bg-slate-200 rounded-lg text-xs font-medium text-slate-600">
                +{propertyNames.length - 3} altre
              </div>
            )}
          </div>
          
          {/* Espandi/Comprimi */}
          <button 
            onClick={handleExpand}
            className="w-full mt-3 pt-3 border-t border-slate-100 flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <span>{isExpanded ? "Nascondi dettagli" : "Mostra dettagli"}</span>
            <div className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}>{Icons.chevronDown}</div>
          </button>
        </div>
        
        {/* Contenuto espanso */}
        {isExpanded && (
          <div className="border-t border-slate-200 bg-slate-50/50">
            {/* Proprietà COLLASSABILI */}
            {propertyNames.map((propName, propIdx) => {
              const propServices = groupedServices[propName];
              const propTotal = propServices.reduce((sum, s) => sum + s.effectivePrice, 0);
              const isPropExpanded = isPropertyExpanded(propName);
              // Prendi l'immagine dalla prima proprietà
              const propImage = propServices[0]?.propertyImage;
              
              // Helper per toggle dettaglio biancheria
              const toggleBiancheriaDetail = (serviceId: string, e: React.MouseEvent) => {
                e.stopPropagation();
                const key = `${client.proprietarioId}-${serviceId}`;
                setExpandedBiancheria(prev => {
                  const newSet = new Set(prev);
                  if (newSet.has(key)) newSet.delete(key);
                  else newSet.add(key);
                  return newSet;
                });
              };
              const isBiancheriaExpanded = (serviceId: string) => expandedBiancheria.has(`${client.proprietarioId}-${serviceId}`);
              
              return (
                <div key={propIdx} className={`${propIdx > 0 ? "border-t border-slate-200" : ""}`}>
                  {/* Header proprietà - CLICCABILE con FOTO */}
                  <button 
                    onClick={() => toggleProperty(propName)}
                    className="w-full px-4 py-3 bg-gradient-to-r from-slate-100 to-white flex items-center justify-between hover:from-slate-50 hover:to-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar proprietà con FOTO o lettera */}
                      {propImage ? (
                        <img 
                          src={propImage} 
                          alt={propName}
                          className="w-10 h-10 rounded-xl object-cover shadow-md flex-shrink-0 border-2 border-violet-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-md flex-shrink-0">
                          {propName.charAt(0)}
                        </div>
                      )}
                      <div className="text-left">
                        <p className="font-semibold text-slate-800">{propName}</p>
                        <p className="text-xs text-slate-500">{propServices.length} servizi</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-bold text-slate-800 text-lg">{formatCurrency(propTotal)}</p>
                      <div className={`w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center transition-transform ${isPropExpanded ? "rotate-180" : ""}`}>
                        {Icons.chevronDown}
                      </div>
                    </div>
                  </button>
                  
                  {/* Servizi della proprietà - RAGGRUPPATI PER DATA */}
                  {isPropExpanded && (
                    <div className="px-4 py-3 space-y-3 bg-white">
                      {(() => {
                        // Raggruppa servizi (pulizia + biancheria collegata insieme)
                        const dateGroups = groupServicesByDate(propServices);
                        
                        // Ordina per data effettiva (prende la data dalla pulizia o dal primo servizio)
                        const sortedKeys = Object.keys(dateGroups).sort((a, b) => {
                          const groupA = dateGroups[a];
                          const groupB = dateGroups[b];
                          const dateA = groupA.pulizia?.date || groupA.altri[0]?.date || '';
                          const dateB = groupB.pulizia?.date || groupB.altri[0]?.date || '';
                          return new Date(dateB).getTime() - new Date(dateA).getTime();
                        });
                        
                        return sortedKeys.map((groupKey, dateIdx) => {
                          const group = dateGroups[groupKey];
                          
                          // Prende la data effettiva dal primo servizio disponibile
                          const actualDate = group.pulizia?.date || group.biancheriaCollegata?.date || group.altri[0]?.date;
                          const dateInfo = formatServiceDate(actualDate);
                          
                          // Skip se non c'è niente da mostrare
                          const hasContent = group.pulizia || group.biancheriaCollegata || group.altri.length > 0;
                          if (!hasContent) return null;
                          
                          const hasBiancheriaCollegata = group.pulizia && group.biancheriaCollegata;
                          const groupTotal = (group.pulizia?.effectivePrice || 0) + 
                                           (group.biancheriaCollegata?.effectivePrice || 0) + 
                                           group.altri.reduce((sum, s) => sum + s.effectivePrice, 0);
                          const hasMultipleItems = (group.pulizia ? 1 : 0) + (group.biancheriaCollegata ? 1 : 0) + group.altri.length > 1;
                          
                          return (
                            <div key={dateIdx} className="rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
                              {/* Card data + servizi */}
                              <div className="flex items-stretch">
                                {/* Colonna data colorata - COMPATTA SU MOBILE */}
                                {dateInfo && (
                                  <div className="w-12 sm:w-16 flex-shrink-0 flex flex-col items-center justify-center py-2 sm:py-3 bg-gradient-to-b from-slate-700 to-slate-800 text-white">
                                    <span className="text-[8px] sm:text-[10px] font-medium opacity-70">{dateInfo.weekday}</span>
                                    <span className="text-lg sm:text-2xl font-bold">{dateInfo.day}</span>
                                    <span className="text-[8px] sm:text-[10px] font-medium opacity-70">{dateInfo.month}</span>
                                  </div>
                                )}
                                
                                {/* Contenuto servizi del giorno */}
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  {/* ========== PULIZIA + BIANCHERIA COLLEGATA ========== */}
                                  {group.pulizia && (
                                    <div className={`${group.pulizia.hasOverride ? "bg-amber-50" : ""}`}>
                                      {/* Pulizia principale - LAYOUT OTTIMIZZATO MOBILE */}
                                      <div className="p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
                                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white shadow-md flex-shrink-0">
                                          {getServiceIcon(group.pulizia.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-semibold text-slate-800 text-sm sm:text-base">{getServiceLabel(group.pulizia.type)}</p>
                                          {group.pulizia.description && (
                                            <p className="text-[11px] sm:text-xs text-slate-500 truncate">{group.pulizia.description}</p>
                                          )}
                                        </div>
                                        <p className={`font-bold text-base sm:text-lg flex-shrink-0 ${group.pulizia.hasOverride ? "text-amber-600" : "text-sky-600"}`}>
                                          {formatCurrency(group.pulizia.effectivePrice)}
                                        </p>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); setEditingService(group.pulizia!); setServiceEditForm({ newPrice: String(group.pulizia!.effectivePrice), reason: "" }); }} 
                                          className="w-8 h-8 sm:w-9 sm:h-9 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0 flex items-center justify-center"
                                        >
                                          {Icons.edit}
                                        </button>
                                      </div>
                                      
                                      {/* Biancheria COLLEGATA come sotto-elemento (più piccola) */}
                                      {group.biancheriaCollegata && (
                                        <div className="mx-2 sm:mx-3 mb-3 ml-4 sm:ml-6">
                                          <button
                                            onClick={(e) => toggleBiancheriaDetail(group.biancheriaCollegata!.id, e)}
                                            className={`w-full p-2 rounded-xl border-2 border-dashed flex items-center gap-2 transition-all ${
                                              isBiancheriaExpanded(group.biancheriaCollegata.id) 
                                                ? "border-violet-400 bg-violet-50" 
                                                : "border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-violet-50"
                                            }`}
                                          >
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white shadow flex-shrink-0">
                                              {getServiceIcon(group.biancheriaCollegata.type)}
                                            </div>
                                            <div className="flex-1 text-left min-w-0">
                                              <p className="font-medium text-slate-700 text-sm">Biancheria</p>
                                              <p className="text-[11px] text-slate-500">{group.biancheriaCollegata.items?.length || 0} articoli</p>
                                            </div>
                                            <p className="font-bold text-violet-600 text-sm">{formatCurrency(group.biancheriaCollegata.effectivePrice)}</p>
                                            <div className={`w-6 h-6 rounded-md bg-violet-200 flex items-center justify-center transition-transform text-violet-600 ${isBiancheriaExpanded(group.biancheriaCollegata.id) ? "rotate-180" : ""}`}>
                                              {Icons.chevronDown}
                                            </div>
                                          </button>
                                          
                                          {/* Dettaglio biancheria ESPANDIBILE */}
                                          {isBiancheriaExpanded(group.biancheriaCollegata.id) && group.biancheriaCollegata.items && group.biancheriaCollegata.items.length > 0 && (
                                            <div className="mt-2 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-2 sm:p-3 border border-violet-200 animate-in slide-in-from-top-2">
                                              <div className="flex items-center justify-between mb-2">
                                                <p className="text-[10px] uppercase font-bold text-violet-600">🛏️ Dettaglio biancheria</p>
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); openBiancheriaEditor(group.biancheriaCollegata!); }}
                                                  className="flex items-center gap-1 px-2.5 py-1 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-lg text-[10px] font-semibold transition-colors"
                                                >
                                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                  </svg>
                                                  Modifica
                                                </button>
                                              </div>
                                              <div className="grid gap-1.5">
                                                {group.biancheriaCollegata.items.map((item, itemIdx) => (
                                                  <div key={itemIdx} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5 border border-violet-100 shadow-sm">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                      <span className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                                        {item.quantity}×
                                                      </span>
                                                      <div className="min-w-0">
                                                        <span className="text-xs text-slate-800 font-medium block truncate">{item.name}</span>
                                                        <span className="text-[9px] text-slate-400">€{item.unitPrice.toFixed(2)}/pz</span>
                                                      </div>
                                                    </div>
                                                    <span className="text-xs font-bold text-violet-700 ml-2 flex-shrink-0">
                                                      {formatCurrency(item.totalPrice)}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                              <div className="mt-2 pt-2 border-t border-violet-200 flex justify-between items-center">
                                                <span className="text-[10px] font-medium text-violet-600">Subtotale</span>
                                                <span className="text-sm font-bold text-violet-700">{formatCurrency(group.biancheriaCollegata.effectivePrice)}</span>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {/* ========== ALTRI SERVIZI (biancheria standalone, kit, extra) ========== */}
                                  {group.altri.map((service, sIdx) => {
                                    const isBiancheria = service.type === "BIANCHERIA";
                                    const hasItems = service.items && service.items.length > 0;
                                    const colorClass = service.type === "BIANCHERIA" ? "from-violet-400 to-purple-500" :
                                                       service.type === "KIT_CORTESIA" ? "from-amber-400 to-orange-500" :
                                                       "from-emerald-400 to-teal-500";
                                    const textColorClass = service.type === "BIANCHERIA" ? "text-violet-600" :
                                                         service.type === "KIT_CORTESIA" ? "text-amber-600" : "text-emerald-600";
                                    const bgColorClass = service.type === "BIANCHERIA" ? "violet" :
                                                        service.type === "KIT_CORTESIA" ? "amber" : "emerald";
                                    
                                    return (
                                      <div key={sIdx} className={`border-t border-slate-100 ${service.hasOverride ? "bg-amber-50" : ""}`}>
                                        {/* Header servizio - CLICCABILE per biancheria - OTTIMIZZATO MOBILE */}
                                        {isBiancheria ? (
                                          <button
                                            onClick={(e) => toggleBiancheriaDetail(service.id, e)}
                                            className="w-full p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3 hover:bg-violet-50 transition-colors"
                                          >
                                            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center text-white shadow-md flex-shrink-0`}>
                                              {getServiceIcon(service.type)}
                                            </div>
                                            <div className="flex-1 min-w-0 text-left">
                                              <p className="font-semibold text-slate-800 text-sm sm:text-base">{getServiceLabel(service.type)}</p>
                                              <p className="text-[10px] sm:text-xs text-slate-500">{service.items?.length || 0} articoli</p>
                                            </div>
                                            <p className={`font-bold text-base sm:text-lg flex-shrink-0 ${service.hasOverride ? "text-amber-600" : textColorClass}`}>
                                              {formatCurrency(service.effectivePrice)}
                                            </p>
                                            <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-violet-100 flex items-center justify-center transition-transform text-violet-600 flex-shrink-0 ${isBiancheriaExpanded(service.id) ? "rotate-180" : ""}`}>
                                              {Icons.chevronDown}
                                            </div>
                                          </button>
                                        ) : (
                                          <div className="p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
                                            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center text-white shadow-md flex-shrink-0`}>
                                              {getServiceIcon(service.type)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="font-semibold text-slate-800 text-sm sm:text-base">{getServiceLabel(service.type)}</p>
                                              {hasItems && <p className="text-[10px] sm:text-xs text-slate-500">{service.items?.length} articoli</p>}
                                            </div>
                                            <p className={`font-bold text-base sm:text-lg flex-shrink-0 ${service.hasOverride ? "text-amber-600" : textColorClass}`}>
                                              {formatCurrency(service.effectivePrice)}
                                            </p>
                                            <button 
                                              onClick={(e) => { e.stopPropagation(); setEditingService(service); setServiceEditForm({ newPrice: String(service.effectivePrice), reason: "" }); }} 
                                              className="w-8 h-8 sm:w-9 sm:h-9 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0 flex items-center justify-center"
                                            >
                                              {Icons.edit}
                                            </button>
                                          </div>
                                        )}
                                        
                                        {/* Dettaglio biancheria ESPANDIBILE */}
                                        {isBiancheria && isBiancheriaExpanded(service.id) && hasItems && (
                                          <div className="mx-2 sm:mx-3 mb-3 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-2 sm:p-3 border border-violet-200 animate-in slide-in-from-top-2">
                                            <div className="flex items-center justify-between mb-2">
                                              <p className="text-[10px] uppercase font-bold text-violet-600">🛏️ Dettaglio biancheria</p>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); openBiancheriaEditor(service); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-lg text-xs font-semibold transition-all shadow-md hover:shadow-lg"
                                              >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                                Modifica
                                              </button>
                                            </div>
                                            <div className="grid gap-1.5">
                                              {service.items!.map((item, itemIdx) => (
                                                <div key={itemIdx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-violet-100 shadow-sm">
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-7 h-7 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                                      {item.quantity}×
                                                    </span>
                                                    <div className="min-w-0">
                                                      <span className="text-sm text-slate-800 font-medium block truncate">{item.name}</span>
                                                      <span className="text-[10px] text-slate-400">€{item.unitPrice.toFixed(2)}/pz</span>
                                                    </div>
                                                  </div>
                                                  <span className="text-sm font-bold text-violet-700 ml-2 flex-shrink-0">
                                                    {formatCurrency(item.totalPrice)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                            <div className="mt-2 pt-2 border-t border-violet-200 flex justify-between items-center">
                                              <span className="text-xs font-medium text-violet-600">Subtotale biancheria</span>
                                              <span className="font-bold text-violet-700">{formatCurrency(service.effectivePrice)}</span>
                                            </div>
                                          </div>
                                        )}
                                        
                                        {/* Kit Cortesia - dettaglio sempre visibile */}
                                        {service.type === "KIT_CORTESIA" && hasItems && (
                                          <div className="mx-2 sm:mx-3 mb-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-2 sm:p-3 border border-amber-200">
                                            <p className="text-[10px] uppercase font-bold text-amber-600 mb-2">🎁 Dettaglio kit</p>
                                            <div className="grid gap-1.5">
                                              {service.items!.map((item, itemIdx) => (
                                                <div key={itemIdx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100 shadow-sm">
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-7 h-7 rounded-md bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                                      {item.quantity}×
                                                    </span>
                                                    <span className="text-sm text-slate-800 font-medium truncate">{item.name}</span>
                                                  </div>
                                                  <span className="text-sm font-bold text-amber-700 ml-2 flex-shrink-0">
                                                    {formatCurrency(item.totalPrice)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        
                                        {/* Servizi Extra - dettaglio sempre visibile */}
                                        {service.type === "SERVIZI_EXTRA" && hasItems && (
                                          <div className="mx-2 sm:mx-3 mb-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-2 sm:p-3 border border-emerald-200">
                                            <p className="text-[10px] uppercase font-bold text-emerald-600 mb-2">✨ Dettaglio extra</p>
                                            <div className="grid gap-1.5">
                                              {service.items!.map((item, itemIdx) => (
                                                <div key={itemIdx} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-emerald-100 shadow-sm">
                                                  <div className="flex items-center gap-2 min-w-0">
                                                    <span className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                                      {item.quantity}×
                                                    </span>
                                                    <span className="text-sm text-slate-800 font-medium truncate">{item.name}</span>
                                                  </div>
                                                  <span className="text-sm font-bold text-emerald-700 ml-2 flex-shrink-0">
                                                    {formatCurrency(item.totalPrice)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              
                              {/* Footer totale giornata (se più servizi) */}
                              {hasMultipleItems && (
                                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                  <span className="text-xs text-slate-500 font-medium">Totale giornata</span>
                                  <span className="font-bold text-slate-800">{formatCurrency(groupTotal)}</span>
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Pagamenti effettuati */}
            {client.payments.length > 0 && (
              <div className="border-t border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1">
                  {Icons.check} Pagamenti effettuati
                </p>
                <div className="space-y-1.5">
                  {client.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center gap-2 p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                        {Icons.check}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-emerald-700">{formatCurrency(payment.amount)}</p>
                        // @ts-expect-error TODO-FIX: TS2551 Property 'notes' does not exist on type 'Payment'. Did you mean 'note'?
                        <p className="text-xs text-emerald-600">{payment.method} {payment.note && `• ${payment.note}`}</p>
                      </div>
                      <button 
                        onClick={() => handleDeletePayment(payment.id)} 
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        {Icons.trash}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Riepilogo totali */}
            <div className="border-t border-slate-200 p-4 bg-white">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-100 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Totale</p>
                  <p className="font-bold text-slate-800">{formatCurrency(client.totaleEffettivo)}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3">
                  <p className="text-xs text-emerald-600">Pagato</p>
                  <p className="font-bold text-emerald-700">{formatCurrency(client.totalePagato)}</p>
                </div>
                <div className={`rounded-xl p-3 ${client.saldo > 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                  <p className={`text-xs ${client.saldo > 0 ? "text-red-600" : "text-emerald-600"}`}>Saldo</p>
                  <p className={`font-bold ${client.saldo > 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency(client.saldo)}</p>
                </div>
              </div>
              
              {/* Bottone incassa grande (se c'è saldo) */}
              {client.saldo > 0 && (
                <button 
                  onClick={() => setQuickPayClient(client)} 
                  className="w-full mt-3 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-emerald-700 flex items-center justify-center gap-2 shadow-lg"
                >
                  {Icons.creditCard}
                  <span>Incassa {formatCurrency(client.saldo)}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ==================== SERVICE EDIT MODAL ====================
  const ServiceEditModal = () => {
    if (!editingService) return null;
    return (
      <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setEditingService(null)} />
        <div className={`fixed z-50 bg-white shadow-2xl flex flex-col ${
          isDesktop 
            ? "inset-0 m-auto max-w-md max-h-[85vh] rounded-2xl" 
            : "inset-x-2 bottom-2 top-auto max-h-[80vh] rounded-2xl"
        }`}>
          {/* Header fisso */}
          <div className="flex-shrink-0 p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">{Icons.edit} Modifica Servizio</h3>
              <button 
                onClick={() => setEditingService(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                {Icons.x}
              </button>
            </div>
          </div>
          
          {/* Contenuto scrollabile */}
          <div className="flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  editingService.type === "PULIZIA" ? "bg-sky-100 text-sky-600" :
                  editingService.type === "BIANCHERIA" ? "bg-violet-100 text-violet-600" :
                  editingService.type === "KIT_CORTESIA" ? "bg-amber-100 text-amber-600" :
                  "bg-emerald-100 text-emerald-600"
                }`}>
                  {getServiceIcon(editingService.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">{getServiceLabel(editingService.type)}</p>
                  <p className="text-sm text-slate-500 truncate">{editingService.propertyName}</p>
                </div>
              </div>
              <p className="font-bold text-2xl text-slate-800">{formatCurrency(editingService.effectivePrice)}</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nuovo totale</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">€</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    inputMode="decimal"
                    value={serviceEditForm.newPrice} 
                    onChange={(e) => setServiceEditForm({ ...serviceEditForm, newPrice: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 text-xl font-bold border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Motivo (opzionale)</label>
                <input 
                  type="text" 
                  value={serviceEditForm.reason} 
                  onChange={(e) => setServiceEditForm({ ...serviceEditForm, reason: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" 
                  placeholder="Es: Sconto cliente abituale" 
                />
              </div>
            </div>
          </div>
          
          {/* Footer fisso con bottoni */}
          <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-white rounded-b-2xl">
            <div className="flex gap-3">
              <button onClick={() => setEditingService(null)} className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Annulla</button>
              <button onClick={handleSubmitServiceEdit} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-emerald-700 flex items-center justify-center gap-2 shadow-lg">{Icons.check} Salva</button>
            </div>
          </div>
        </div>
      </>
    );
  };

  // ==================== BIANCHERIA EDIT MODAL ====================
  const BiancheriaEditModal = () => {
    if (!editingBiancheria) return null;
    
    const hasChanges = JSON.stringify(editingBiancheria.items) !== JSON.stringify(editingBiancheria.service.items);
    const newTotal = getBiancheriaTotal();
    const originalTotal = editingBiancheria.service.effectivePrice;
    const diff = newTotal - originalTotal;
    
    return (
      <>
        {/* Backdrop con blur */}
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] animate-in fade-in duration-200" 
          onClick={() => !biancheriaEditLoading && setEditingBiancheria(null)} 
        />
        
        {/* Modal - OTTIMIZZATA PER MOBILE */}
        <div className={`fixed z-[60] bg-white shadow-2xl flex flex-col animate-in ${
          isDesktop 
            ? "inset-0 m-auto max-w-lg max-h-[85vh] rounded-3xl slide-in-from-bottom-4" 
            : "inset-x-2 bottom-2 top-auto max-h-[85vh] rounded-2xl slide-in-from-bottom-8"
        }`}>
          {/* Header con gradient - FISSO */}
          <div className="flex-shrink-0 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 px-4 py-3 text-white rounded-t-2xl lg:rounded-t-3xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base sm:text-lg">Modifica Biancheria</h3>
                  <p className="text-white/70 text-xs sm:text-sm truncate">{editingBiancheria.service.propertyName}</p>
                </div>
              </div>
              <button 
                onClick={() => !biancheriaEditLoading && setEditingBiancheria(null)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Lista articoli scrollabile - CONTENUTO PRINCIPALE */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            {editingBiancheria.items.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </div>
                <p className="text-slate-500 font-medium">Nessun articolo rimasto</p>
                <p className="text-slate-400 text-sm mt-1">L'ordine verrà eliminato</p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {editingBiancheria.items.map((item, idx) => {
                  const isDeleting = deletingItemId === item.itemId;
                  const isZero = item.quantity === 0;
                  
                  return (
                    <div 
                      key={item.itemId}
                      className={`relative bg-gradient-to-br from-slate-50 to-white rounded-xl border-2 transition-all duration-300 ${
                        isDeleting ? "opacity-0 scale-95 -translate-x-full" : "opacity-100"
                      } ${isZero ? "border-red-200 bg-red-50/50" : "border-slate-100"}`}
                    >
                      {/* Badge quantità zero */}
                      {isZero && (
                        <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg z-10">
                          RIMUOVI
                        </div>
                      )}
                      
                      <div className="p-3">
                        {/* Riga info articolo */}
                        <div className="flex items-start gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{item.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {item.categoryName || "Altro"}
                              </span>
                              <span className="text-[10px] text-violet-600 font-medium">
                                €{item.unitPrice.toFixed(2)}/pz
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`font-bold text-base ${isZero ? "text-red-500 line-through" : "text-violet-600"}`}>
                              €{item.totalPrice.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        
                        {/* Controlli quantità - OTTIMIZZATI */}
                        <div className="flex items-center justify-between gap-2">
                          {/* Bottone elimina */}
                          <button
                            onClick={() => removeBiancheriaItem(item.itemId)}
                            className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-50 to-red-100 text-red-500 hover:from-red-100 hover:to-red-200 flex items-center justify-center transition-all active:scale-95 shadow-sm flex-shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          
                          {/* Controlli +/- compatti */}
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateBiancheriaQuantity(item.itemId, -1)}
                              disabled={item.quantity <= 0}
                              className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg transition-all shadow ${
                                item.quantity <= 0 
                                  ? "bg-slate-100 text-slate-300 cursor-not-allowed" 
                                  : "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 hover:from-slate-200 hover:to-slate-300 active:scale-95"
                              }`}
                            >
                              −
                            </button>
                            
                            <div className={`w-12 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${
                              isZero 
                                ? "bg-red-100 text-red-500" 
                                : "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg"
                            }`}>
                              {item.quantity}
                            </div>
                            
                            <button
                              onClick={() => updateBiancheriaQuantity(item.itemId, 1)}
                              className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center font-bold text-lg shadow-lg hover:from-violet-600 hover:to-purple-700 active:scale-95 transition-all"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Footer con totale e azioni - FISSO */}
          <div className="flex-shrink-0 border-t border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 sm:p-4 rounded-b-2xl lg:rounded-b-3xl">
            {/* Riepilogo prezzi */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-semibold">Nuovo totale</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-800">€{newTotal.toFixed(2)}</p>
              </div>
              {diff !== 0 && (
                <div className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-bold ${
                  diff > 0 
                    ? "bg-red-100 text-red-600" 
                    : "bg-emerald-100 text-emerald-600"
                }`}>
                  {diff > 0 ? "+" : ""}{diff.toFixed(2)} €
                </div>
              )}
            </div>
            
            {/* Bottoni azione */}
            <div className="flex gap-2 sm:gap-3">
              <button 
                onClick={() => setEditingBiancheria(null)}
                disabled={biancheriaEditLoading}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-colors disabled:opacity-50 text-sm sm:text-base"
              >
                Annulla
              </button>
              <button 
                onClick={saveBiancheriaChanges}
                disabled={biancheriaEditLoading || !hasChanges}
                className={`flex-1 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg transition-all ${
                  hasChanges && !biancheriaEditLoading
                    ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                {biancheriaEditLoading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Salvataggio...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Salva Modifiche</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-white pb-20 lg:pb-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 text-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4">
          {/* Title + Tabs */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-400 text-xs">Gestione</p>
              <h1 className="text-xl font-bold">Pagamenti</h1>
            </div>
            <div className="flex bg-slate-700/50 rounded-xl p-1">
              <button 
                onClick={() => setMainTab("lista")} 
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${mainTab === "lista" ? "bg-white text-slate-800 shadow-lg" : "text-slate-300 hover:text-white"}`}
              >
                {Icons.list}
                <span>Lista</span>
              </button>
              <button 
                onClick={() => setMainTab("timeline")} 
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${mainTab === "timeline" ? "bg-white text-slate-800 shadow-lg" : "text-slate-300 hover:text-white"}`}
              >
                {Icons.table}
                <span>Tabella</span>
              </button>
            </div>
          </div>

          {/* Month Selector - Solo per Lista */}
          {mainTab === "lista" && (
            <>
              <div className="flex items-center justify-center gap-4 mb-4">
                <button onClick={goToPrevMonth} className="w-10 h-10 rounded-xl bg-slate-700/50 flex items-center justify-center hover:bg-slate-600 transition-colors">
                  {Icons.chevronLeft}
                </button>
                <div className="text-center min-w-[120px]">
                  <span className="text-xl font-bold">{MONTHS_SHORT[selectedMonth - 1]} {selectedYear}</span>
                </div>
                <button 
                  onClick={goToNextMonth}
                  disabled={selectedMonth === currentMonth && selectedYear === currentYear}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${selectedMonth === currentMonth && selectedYear === currentYear ? "bg-slate-700/20 opacity-30 cursor-not-allowed" : "bg-slate-700/50 hover:bg-slate-600"}`}
                >
                  {Icons.chevronRight}
                </button>
              </div>

              {/* Badge mese */}
              <div className="flex justify-center mb-4">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${
                  selectedMonth === currentMonth && selectedYear === currentYear 
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" 
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                }`}>
                  {Icons.calendar}
                  <span className="text-sm font-medium">
                    {selectedMonth === currentMonth && selectedYear === currentYear ? "Mese corrente" : "Mese precedente"}
                  </span>
                </div>
              </div>

              {/* Stats Cards */}
              {summary && (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-slate-700/50 rounded-xl p-2 sm:p-3 text-center">
                      <p className="text-slate-400 text-[9px] sm:text-[10px] uppercase tracking-wide">Totale</p>
                      <p className="text-white text-sm sm:text-lg font-bold">{formatCurrency(summary.totaleServizi || 0)}</p>
                    </div>
                    <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl p-2 sm:p-3 text-center">
                      <p className="text-emerald-300 text-[9px] sm:text-[10px] uppercase tracking-wide">Incassato</p>
                      <p className="text-emerald-400 text-sm sm:text-lg font-bold">{formatCurrency(summary.totalePagato || 0)}</p>
                    </div>
                    <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-2 sm:p-3 text-center">
                      <p className="text-red-300 text-[9px] sm:text-[10px] uppercase tracking-wide">Da Incassare</p>
                      <p className="text-red-400 text-sm sm:text-lg font-bold">{formatCurrency(summary.totaleDovuto || 0)}</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="bg-slate-700/50 rounded-xl p-3 mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-400 text-sm">Progresso</span>
                      <span className="text-emerald-400 font-bold">
                        {(summary.totaleServizi || 0) > 0 ? Math.round(((summary.totalePagato || 0) / summary.totaleServizi) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${(summary.totaleServizi || 0) > 0 ? ((summary.totalePagato || 0) / summary.totaleServizi) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Payment Methods */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-700/30 rounded-xl p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-600/50 flex items-center justify-center text-slate-300">
                        {Icons.banknote}
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase">Contanti</p>
                        <p className="text-white font-bold">{formatCurrency(summary.totaleContanti)}</p>
                      </div>
                    </div>
                    <div className="bg-slate-700/30 rounded-xl p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-600/50 flex items-center justify-center text-slate-300">
                        {Icons.creditCard}
                      </div>
                      <div>
                        <p className="text-slate-400 text-[10px] uppercase">Bonifico</p>
                        <p className="text-white font-bold">{formatCurrency(summary.totaleBonifico)}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Banner per Timeline */}
          {mainTab === "timeline" && (
            <>
              {/* Badge periodo */}
              <div className="flex justify-center mb-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {Icons.table}
                  <span className="text-sm font-medium">Riepilogo ultimi 6 mesi</span>
                </div>
              </div>

              {/* Stats Riepilogo */}
              {tableData.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-700/50 rounded-xl p-3 text-center">
                    <p className="text-slate-400 text-[10px] uppercase tracking-wide">Clienti</p>
                    <p className="text-white text-lg font-bold">{tableData.length}</p>
                  </div>
                  <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-center">
                    <p className="text-red-300 text-[10px] uppercase tracking-wide">Da Incassare</p>
                    <p className="text-red-400 text-lg font-bold">
                      {formatCurrency(tableData.reduce((sum, c) => sum + c.months.reduce((s, m) => s + (m.saldo > 0 ? m.saldo : 0), 0), 0))}
                    </p>
                  </div>
                  <div className="bg-amber-500/20 border border-amber-500/30 rounded-xl p-3 text-center">
                    <p className="text-amber-300 text-[10px] uppercase tracking-wide">Con Debiti</p>
                    <p className="text-amber-400 text-lg font-bold">
                      {tableData.filter(c => c.months.some(m => m.saldo > 0)).length}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 space-y-4">
        {/* Messages */}
        {localError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm">
            <span className="text-red-500">{Icons.alertTriangle}</span>
            <p className="text-red-700 flex-1">{localError}</p>
            <button onClick={() => setLocalError(null)} className="text-red-400">{Icons.x}</button>
          </div>
        )}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-sm">
            <span className="text-emerald-500">{Icons.check}</span>
            <p className="text-emerald-700">{successMessage}</p>
          </div>
        )}

        {/* LISTA VIEW */}
        {mainTab === "lista" && (
          <>
            {/* Search & Filters Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Search Bar UNICA - Cerca clienti E proprietà */}
              <div className="p-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Cerca cliente o proprietà..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-20 pr-4 py-4 text-lg bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 transition-all placeholder:text-slate-400 font-medium" 
                  />
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:bg-red-100 hover:text-red-500 transition-colors"
                    >
                      {Icons.x}
                    </button>
                  )}
                </div>
                {searchTerm && (
                  <p className="mt-2 text-xs text-slate-500 ml-1">
                    Ricerca per cliente o proprietà: "{searchTerm}"
                  </p>
                )}
              </div>
              
              {/* Tabs + Export Row */}
              <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Status Tabs */}
                <div className="flex bg-slate-100 rounded-xl p-1 w-full sm:w-auto">
                  {[
                    { key: "tutti", label: "Tutti", count: clients.length, color: "slate" },
                    { key: "da_pagare", label: "Da pagare", count: clients.filter(c => c.saldo > 0).length, color: "red" },
                    { key: "saldati", label: "Saldati", count: clients.filter(c => c.saldo <= 0).length, color: "emerald" }
                  ].map((tab) => (
                    <button 
                      key={tab.key} 
                      onClick={() => setActiveTab(tab.key as typeof activeTab)}
                      className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                        activeTab === tab.key 
                          ? "bg-white text-slate-800 shadow-md" 
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        activeTab === tab.key
                          ? tab.key === "da_pagare" ? "bg-red-100 text-red-600" : tab.key === "saldati" ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-600"
                          : "bg-slate-200/50 text-slate-400"
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
                
                {/* Export Buttons */}
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={exportCSV} 
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md hover:shadow-lg"
                  >
                    {Icons.download}
                    <span>CSV</span>
                  </button>
                  <button 
                    onClick={exportPDF} 
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-xl text-sm font-semibold hover:from-red-600 hover:to-rose-600 transition-all shadow-md hover:shadow-lg"
                  >
                    {Icons.fileText}
                    <span>PDF</span>
                  </button>
                </div>
              </div>
              
              {/* Active Filters */}
              {(searchTerm || propertyFilter) && (
                <div className="px-4 pb-4 flex flex-wrap gap-2">
                  {searchTerm && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 text-sky-700 rounded-full text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      "{searchTerm}"
                      <button onClick={() => setSearchTerm("")} className="ml-1 hover:text-sky-900">{Icons.x}</button>
                    </span>
                  )}
                  {propertyFilter && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 rounded-full text-sm">
                      {Icons.home}
                      {propertyFilter}
                      <button onClick={() => setPropertyFilter("")} className="ml-1 hover:text-violet-900">{Icons.x}</button>
                    </span>
                  )}
                  <button 
                    onClick={() => { setSearchTerm(""); setPropertyFilter(""); }}
                    className="text-sm text-slate-500 hover:text-slate-700 underline"
                  >
                    Rimuovi filtri
                  </button>
                </div>
              )}
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-sky-500 border-t-transparent"></div>
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredClients.length === 0 && (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
                  {Icons.user}
                </div>
                <p className="text-slate-500">Nessun cliente trovato</p>
              </div>
            )}

            {/* Client List */}
            <div className="space-y-3">
              {!loading && filteredClients.map((client, index) => (
                // @ts-expect-error TODO-FIX: TS2322 Type 'import("/home/claude/app2/cleaningapp-main/src/hooks/useRealtimePayments")...
                <ClientCard key={client.proprietarioId} client={client} index={index} />
              ))}
            </div>
          </>
        )}

        {/* TIMELINE VIEW */}
        {mainTab === "timeline" && <TimelineView />}
      </div>

      {/* FAB - Nuovo Pagamento */}
      {mainTab === "lista" && clients.filter(c => c.saldo > 0).length > 0 && (
        <div className="fixed bottom-24 lg:bottom-8 right-4 lg:right-8 z-40">
          <button
            onClick={() => { setShowNewPaymentModal(true); setNewPaymentSearch(""); }}
            className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-transform"
            style={{ boxShadow: '0 8px 30px rgba(16, 185, 129, 0.4)' }}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
        </div>
      )}

      {/* NEW PAYMENT MODAL - Con ricerca cliente/proprietà */}
      {showNewPaymentModal && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setShowNewPaymentModal(false)} />
          <div 
            className={`fixed z-50 bg-white shadow-2xl flex flex-col ${
              isDesktop 
                ? "inset-0 m-auto max-w-lg max-h-[80vh] rounded-2xl" 
                : "inset-x-2 bottom-2 top-auto max-h-[80vh] rounded-2xl"
            }`}
          >
            {/* Header */}
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg flex-shrink-0">
                  {Icons.creditCard}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-base sm:text-lg">Nuovo Pagamento</h3>
                  <p className="text-xs sm:text-sm text-slate-500">Seleziona cliente</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewPaymentModal(false)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 flex-shrink-0"
              >
                {Icons.x}
              </button>
            </div>
            
            {/* Search Bar */}
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                <svg className="w-5 h-5 absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Cerca cliente o proprietà..."
                  value={newPaymentSearch}
                  onChange={(e) => setNewPaymentSearch(e.target.value)}
                  autoFocus
                  className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                {newPaymentSearch && (
                  <button 
                    onClick={() => setNewPaymentSearch("")}
                    className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 bg-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-300"
                  >
                    {Icons.x}
                  </button>
                )}
              </div>
            </div>
            
            {/* Client List */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-2 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
              {clients
                .filter(c => c.saldo > 0)
                .filter(c => {
                  if (!newPaymentSearch) return true;
                  const search = newPaymentSearch.toLowerCase();
                  return c.proprietarioName.toLowerCase().includes(search) ||
                         c.services.some(s => s.propertyName.toLowerCase().includes(search));
                })
                .map((client, idx) => {
                  const initials = client.proprietarioName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                  const properties = [...new Set(client.services.map(s => s.propertyName))];
                  
                  return (
                    <button
                      key={client.proprietarioId}
                      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'ClientStats' is not assignable to parameter of type 'SetStateA...
                      onClick={() => { setShowNewPaymentModal(false); setQuickPayClient(client); }}
                      className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl flex items-center gap-3 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all text-left"
                    >
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${clientColors[idx % clientColors.length]} flex items-center justify-center shadow-md flex-shrink-0`}>
                        <span className="text-white text-sm font-bold">{initials}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate">{client.proprietarioName}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {properties.slice(0, 2).join(", ")}
                          {properties.length > 2 && ` +${properties.length - 2}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-slate-500">Da incassare</p>
                        <p className="font-bold text-red-600 text-lg">{formatCurrency(client.saldo)}</p>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
                        {Icons.chevronRight}
                      </div>
                    </button>
                  );
                })}
              
              {clients.filter(c => c.saldo > 0).filter(c => {
                if (!newPaymentSearch) return true;
                const search = newPaymentSearch.toLowerCase();
                return c.proprietarioName.toLowerCase().includes(search) ||
                       c.services.some(s => s.propertyName.toLowerCase().includes(search));
              }).length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
                    {Icons.user}
                  </div>
                  <p className="text-slate-500">
                    {newPaymentSearch ? "Nessun cliente trovato" : "Nessun cliente con debiti"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <QuickPayModal />
      <ConfirmSaldoModal />
      <ServiceEditModal />
      <BiancheriaEditModal />
    </div>
  );
}
