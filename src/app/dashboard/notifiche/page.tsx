"use client";

import { useState, useEffect } from "react";
import { useNotifications } from "~/hooks/useNotifications";
import type { FirebaseNotification } from "~/lib/firebase/types";
import Link from "next/link";

// ==================== ICONS ====================
const BellIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const HomeIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const AlertIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// ==================== TYPES ====================
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
  processedByName?: string;
  adminNote?: string;
  newBeds?: any[];
}

// ==================== HELPERS ====================
function getNotificationIcon(type: string) {
  switch (type) {
    case "DELETION_REQUEST":
    case "NEW_PROPERTY":
      return <HomeIcon />;
    case "WARNING":
    case "ERROR":
      return <AlertIcon />;
    default:
      return <BellIcon />;
  }
}

function getNotificationColor(type: string, actionStatus?: string) {
  if (actionStatus === "APPROVED") return "bg-emerald-100 text-emerald-600 border-emerald-200";
  if (actionStatus === "REJECTED") return "bg-red-100 text-red-600 border-red-200";
  
  switch (type) {
    case "DELETION_REQUEST":
      return "bg-amber-100 text-amber-600 border-amber-200";
    case "NEW_PROPERTY":
      return "bg-blue-100 text-blue-600 border-blue-200";
    case "SUCCESS":
      return "bg-emerald-100 text-emerald-600 border-emerald-200";
    case "WARNING":
      return "bg-amber-100 text-amber-600 border-amber-200";
    case "ERROR":
      return "bg-red-100 text-red-600 border-red-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Adesso";
  if (diffMins < 60) return `${diffMins} minuti fa`;
  if (diffHours < 24) return `${diffHours} ore fa`;
  if (diffDays < 7) return `${diffDays} giorni fa`;
  return formatDate(date);
}

// ==================== TABS ====================
type TabType = "all" | "pending" | "modifications" | "read" | "archived";

// ==================== ACTION MODAL ====================
interface ActionModalProps {
  notification: FirebaseNotification;
  action: "approve" | "reject";
  onClose: () => void;
  onConfirm: (note: string) => void;
}

function ActionModal({ notification, action, onClose, onConfirm }: ActionModalProps) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm(note);
    setLoading(false);
  };

  const isApprove = action === "approve";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
            isApprove ? "bg-emerald-100" : "bg-red-100"
          }`}>
            <div className={`w-8 h-8 ${isApprove ? "text-emerald-600" : "text-red-600"}`}>
              {isApprove ? <CheckIcon /> : <XIcon />}
            </div>
          </div>
          
          <h2 className="text-xl font-bold text-center text-slate-800 mb-2">
            {isApprove ? "Approva Richiesta" : "Rifiuta Richiesta"}
          </h2>
          
          <p className="text-sm text-slate-500 text-center mb-4">
            {isApprove 
              ? `Stai per approvare la richiesta per "${notification.relatedEntityName}"`
              : `Stai per rifiutare la richiesta per "${notification.relatedEntityName}"`
            }
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {isApprove ? "Note (opzionale)" : "Motivo del rifiuto"}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isApprove ? "Aggiungi eventuali note..." : "Spiega il motivo del rifiuto..."}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || (!isApprove && !note.trim())}
              className={`flex-1 py-3 text-white font-semibold rounded-xl transition-all disabled:opacity-50 ${
                isApprove 
                  ? "bg-emerald-500 hover:bg-emerald-600" 
                  : "bg-red-500 hover:bg-red-600"
              }`}
            >
              {loading ? "Caricamento..." : isApprove ? "Approva" : "Rifiuta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== MODIFICATION REQUEST MODAL ====================
interface ModificationModalProps {
  request: PropertyChangeRequest;
  action: "approve" | "reject";
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}

function ModificationModal({ request, action, onClose, onConfirm }: ModificationModalProps) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm(note);
    setLoading(false);
  };

  const isApprove = action === "approve";
  
  const parseValue = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  const current = parseValue(request.currentValue);
  const requested = parseValue(request.requestedValue);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
            isApprove ? "bg-emerald-100" : "bg-red-100"
          }`}>
            <span className="text-3xl">{isApprove ? "✅" : "❌"}</span>
          </div>
          
          <h2 className="text-xl font-bold text-center text-slate-800 mb-2">
            {isApprove ? "Approva Modifica" : "Rifiuta Modifica"}
          </h2>
          
          <p className="text-sm text-slate-500 text-center mb-4">
            {request.propertyName}
          </p>

          {/* Riepilogo modifiche */}
          <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2">
            {typeof current === 'object' && (
              <>
                {current.maxGuests !== requested.maxGuests && (
                  <div className="flex items-center gap-2 text-sm">
                    <span>👥</span>
                    <span className="text-slate-500">Ospiti:</span>
                    <span className="line-through text-slate-400">{current.maxGuests}</span>
                    <span>→</span>
                    <span className="font-bold text-sky-600">{requested.maxGuests}</span>
                  </div>
                )}
                {current.bedrooms !== requested.bedrooms && (
                  <div className="flex items-center gap-2 text-sm">
                    <span>🚪</span>
                    <span className="text-slate-500">Camere:</span>
                    <span className="line-through text-slate-400">{current.bedrooms}</span>
                    <span>→</span>
                    <span className="font-bold text-sky-600">{requested.bedrooms}</span>
                  </div>
                )}
                {current.bathrooms !== requested.bathrooms && (
                  <div className="flex items-center gap-2 text-sm">
                    <span>🚿</span>
                    <span className="text-slate-500">Bagni:</span>
                    <span className="line-through text-slate-400">{current.bathrooms}</span>
                    <span>→</span>
                    <span className="font-bold text-sky-600">{requested.bathrooms}</span>
                  </div>
                )}
                {requested.beds && (
                  <div className="pt-2 border-t border-slate-200 mt-2">
                    <p className="text-xs text-slate-500 mb-1">🛏️ Nuovi letti:</p>
                    <div className="flex flex-wrap gap-1">
                      {requested.beds.map((b: any, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded text-xs">
                          {b.name} ({b.cap}p)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {isApprove ? "Note (opzionale)" : "Motivo del rifiuto"}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isApprove ? "Aggiungi eventuali note..." : "Spiega il motivo del rifiuto..."}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
              rows={2}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`flex-1 py-3 text-white font-semibold rounded-xl transition-all disabled:opacity-50 ${
                isApprove 
                  ? "bg-emerald-500 hover:bg-emerald-600" 
                  : "bg-red-500 hover:bg-red-600"
              }`}
            >
              {loading ? "..." : isApprove ? "Approva" : "Rifiuta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN PAGE ====================
export default function NotifichePage() {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [selectedNotification, setSelectedNotification] = useState<FirebaseNotification | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  
  // State per richieste modifica
  const [changeRequests, setChangeRequests] = useState<PropertyChangeRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PropertyChangeRequest | null>(null);
  const [requestAction, setRequestAction] = useState<"approve" | "reject" | null>(null);

  const {
    notifications,
    unreadCount,
    pendingActionsCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    handleAction,
  } = useNotifications();

  // Carica richieste modifica
  useEffect(() => {
    loadChangeRequests();
  }, []);

  const loadChangeRequests = async () => {
    setLoadingRequests(true);
    try {
      const response = await fetch("/api/property-change-request?status=ALL");
      if (response.ok) {
        const data = await response.json();
        setChangeRequests(data.requests || []);
      }
    } catch (error) {
      console.error("Errore caricamento richieste:", error);
    } finally {
      setLoadingRequests(false);
    }
  };

  const pendingChangeRequests = changeRequests.filter(r => r.status === "PENDING");

  // Filtra notifiche in base al tab
  const filteredNotifications = notifications.filter(n => {
    switch (activeTab) {
      case "pending":
        return n.actionRequired && n.actionStatus === "PENDING";
      case "modifications":
        return false; // Le modifiche sono gestite separatamente
      case "read":
        return n.status === "READ";
      case "archived":
        return n.status === "ARCHIVED";
      default:
        return n.status !== "ARCHIVED";
    }
  });

  const handleOpenAction = (notification: FirebaseNotification, action: "approve" | "reject") => {
    setSelectedNotification(notification);
    setActionType(action);
  };

  const handleConfirmAction = async (note: string) => {
    if (!selectedNotification || !actionType) return;
    
    await handleAction(
      selectedNotification.id, 
      actionType === "approve" ? "APPROVED" : "REJECTED",
      note
    );
    
    setSelectedNotification(null);
    setActionType(null);
  };

  // Handler per richieste modifica
  const handleModificationAction = async (note: string) => {
    if (!selectedRequest || !requestAction) return;
    
    try {
      const response = await fetch("/api/property-change-request", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          action: requestAction === "approve" ? "APPROVE" : "REJECT",
          adminNote: note || undefined,
        }),
      });
      
      if (response.ok) {
        await loadChangeRequests();
      }
    } catch (error) {
      console.error("Errore:", error);
    }
    
    setSelectedRequest(null);
    setRequestAction(null);
  };

  const tabs: { id: TabType; label: string; count?: number; icon?: string }[] = [
    { id: "all", label: "Tutte", count: notifications.filter(n => n.status !== "ARCHIVED").length },
    { id: "pending", label: "In Attesa", count: pendingActionsCount },
    { id: "modifications", label: "Richieste Modifica", count: pendingChangeRequests.length, icon: "📝" },
    { id: "read", label: "Lette", count: notifications.filter(n => n.status === "READ").length },
    { id: "archived", label: "Archiviate", count: notifications.filter(n => n.status === "ARCHIVED").length },
  ];

  const formatRequestDate = (timestamp: any) => {
    if (!timestamp) return "-";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp._seconds ? timestamp._seconds * 1000 : timestamp);
    return formatTimeAgo(date);
  };

  const parseValue = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg text-white">
              <BellIcon />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Notifiche</h1>
              <p className="text-sm text-slate-500">
                {unreadCount > 0 ? `${unreadCount} non lette` : "Tutte le notifiche lette"} 
                {pendingActionsCount > 0 && ` • ${pendingActionsCount} in attesa`}
                {pendingChangeRequests.length > 0 && ` • ${pendingChangeRequests.length} richieste modifica`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="px-4 py-2 bg-blue-50 text-blue-600 text-sm font-medium rounded-xl hover:bg-blue-100 transition-colors"
              >
                Segna tutte come lette
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={async () => {
                  if (confirm(`Sei sicuro di voler eliminare tutte le ${notifications.length} notifiche?`)) {
                    await deleteAllNotifications();
                  }
                }}
                className="px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-xl hover:bg-red-100 transition-colors"
              >
                🗑️ Elimina Tutte
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? tab.id === "modifications" 
                  ? "bg-sky-500 text-white shadow-md"
                  : "bg-slate-900 text-white shadow-md"
                : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
            }`}
          >
            {tab.icon && <span>{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                activeTab === tab.id ? "bg-white/20" : "bg-slate-100"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "modifications" ? (
        /* === RICHIESTE MODIFICA === */
        <div className="space-y-4">
          {loadingRequests ? (
            <div className="bg-white rounded-2xl p-12 text-center">
              <div className="w-12 h-12 border-3 border-slate-200 border-t-sky-500 rounded-full animate-spin mx-auto"></div>
              <p className="text-slate-500 mt-4">Caricamento richieste...</p>
            </div>
          ) : changeRequests.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📭</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Nessuna richiesta</h3>
              <p className="text-slate-500">Non ci sono richieste di modifica proprietà</p>
            </div>
          ) : (
            <>
              {/* Pending */}
              {pendingChangeRequests.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-amber-600 mb-3 flex items-center gap-2">
                    <span>⏳</span> In attesa di approvazione ({pendingChangeRequests.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingChangeRequests.map(request => {
                      const current = parseValue(request.currentValue);
                      const requested = parseValue(request.requestedValue);
                      
                      return (
                        <div key={request.id} className="bg-white rounded-2xl border-2 border-amber-200 p-5 shadow-sm">
                          <div className="flex gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-2xl">🏠</span>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <Link 
                                    href={`/dashboard/proprieta/${request.propertyId}`}
                                    className="font-semibold text-slate-800 hover:text-sky-600"
                                  >
                                    {request.propertyName}
                                  </Link>
                                  <p className="text-sm text-slate-500">
                                    da {request.requesterName} • {formatRequestDate(request.createdAt)}
                                  </p>
                                </div>
                              </div>

                              {/* Dettagli modifiche */}
                              <div className="bg-slate-50 rounded-xl p-3 mb-3 space-y-1.5">
                                {typeof current === 'object' && (
                                  <>
                                    {current.maxGuests !== requested.maxGuests && (
                                      <div className="flex items-center gap-2 text-sm">
                                        <span>👥</span>
                                        <span className="text-slate-500">Ospiti:</span>
                                        <span className="line-through text-slate-400">{current.maxGuests}</span>
                                        <span>→</span>
                                        <span className="font-bold text-sky-600">{requested.maxGuests}</span>
                                      </div>
                                    )}
                                    {current.bedrooms !== requested.bedrooms && (
                                      <div className="flex items-center gap-2 text-sm">
                                        <span>🚪</span>
                                        <span className="text-slate-500">Camere:</span>
                                        <span className="line-through text-slate-400">{current.bedrooms}</span>
                                        <span>→</span>
                                        <span className="font-bold text-sky-600">{requested.bedrooms}</span>
                                      </div>
                                    )}
                                    {current.bathrooms !== requested.bathrooms && (
                                      <div className="flex items-center gap-2 text-sm">
                                        <span>🚿</span>
                                        <span className="text-slate-500">Bagni:</span>
                                        <span className="line-through text-slate-400">{current.bathrooms}</span>
                                        <span>→</span>
                                        <span className="font-bold text-sky-600">{requested.bathrooms}</span>
                                      </div>
                                    )}
                                    {requested.beds && (
                                      <div className="pt-2 border-t border-slate-200">
                                        <p className="text-xs text-slate-500 mb-1">🛏️ Nuovi letti ({requested.beds.length}):</p>
                                        <div className="flex flex-wrap gap-1">
                                          {requested.beds.slice(0, 5).map((b: any, i: number) => (
                                            <span key={i} className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded text-xs">
                                              {b.name}
                                            </span>
                                          ))}
                                          {requested.beds.length > 5 && (
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">
                                              +{requested.beds.length - 5}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>

                              {request.reason && (
                                <p className="text-sm text-slate-600 mb-3 italic">
                                  "{request.reason}"
                                </p>
                              )}

                              {/* Azioni */}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => { setSelectedRequest(request); setRequestAction("approve"); }}
                                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 active:scale-95 transition-all"
                                >
                                  ✅ Approva
                                </button>
                                <button
                                  onClick={() => { setSelectedRequest(request); setRequestAction("reject"); }}
                                  className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 active:scale-95 transition-all"
                                >
                                  ❌ Rifiuta
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Storico */}
              {changeRequests.filter(r => r.status !== "PENDING").length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-500 mb-3">📋 Storico</h3>
                  <div className="space-y-2">
                    {changeRequests.filter(r => r.status !== "PENDING").map(request => (
                      <div key={request.id} className={`bg-white rounded-xl p-4 border ${
                        request.status === "APPROVED" ? "border-emerald-200" : "border-red-200"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                              request.status === "APPROVED" ? "bg-emerald-100" : "bg-red-100"
                            }`}>
                              {request.status === "APPROVED" ? "✅" : "❌"}
                            </span>
                            <div>
                              <p className="font-medium text-slate-800">{request.propertyName}</p>
                              <p className="text-xs text-slate-500">
                                {request.status === "APPROVED" ? "Approvata" : "Rifiutata"} da {request.processedByName}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400">{formatRequestDate(request.processedAt || request.createdAt)}</p>
                        </div>
                        {request.adminNote && (
                          <p className="text-sm text-slate-500 mt-2 ml-11 italic">"{request.adminNote}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* === NOTIFICHE NORMALI === */
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-2xl p-12 text-center">
              <div className="w-12 h-12 border-3 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
              <p className="text-slate-500 mt-4">Caricamento notifiche...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-10 h-10 text-slate-400">
                  <BellIcon />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Nessuna notifica</h3>
              <p className="text-slate-500">
                {activeTab === "pending" 
                  ? "Non ci sono richieste in attesa di approvazione"
                  : "Non hai notifiche in questa sezione"
                }
              </p>
            </div>
          ) : (
            filteredNotifications.map(notification => {
              const isUnread = notification.status === "UNREAD";
              const isPending = notification.actionRequired && notification.actionStatus === "PENDING";
              const createdAt = notification.createdAt?.toDate?.() || new Date();
              
              return (
                <div
                  key={notification.id}
                  className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${
                    isUnread ? "border-blue-200 shadow-md" : "border-slate-100"
                  }`}
                >
                  <div className="p-5">
                    <div className="flex gap-4">
                      {/* Icon */}
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
                        getNotificationColor(notification.type, notification.actionStatus)
                      }`}>
                        {getNotificationIcon(notification.type)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <h3 className={`text-base ${isUnread ? "font-bold" : "font-semibold"} text-slate-800`}>
                            {notification.title}
                          </h3>
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <ClockIcon />
                            <span>{formatTimeAgo(createdAt)}</span>
                          </div>
                        </div>
                        
                        <p className="text-sm text-slate-600 mb-2">
                          {notification.message}
                        </p>

                        {/* Sender info */}
                        <p className="text-xs text-slate-400">
                          Da: {notification.senderName}
                          {notification.senderEmail && ` (${notification.senderEmail})`}
                        </p>

                        {/* Status Badge */}
                        {notification.actionStatus && notification.actionStatus !== "PENDING" && (
                          <div className="mt-3">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                              notification.actionStatus === "APPROVED" 
                                ? "bg-emerald-100 text-emerald-700" 
                                : "bg-red-100 text-red-700"
                            }`}>
                              {notification.actionStatus === "APPROVED" ? <CheckIcon /> : <XIcon />}
                              {notification.actionStatus === "APPROVED" ? "Approvata" : "Rifiutata"}
                            </span>
                            {notification.actionNote && (
                              <p className="text-xs text-slate-500 mt-2 italic">
                                "{notification.actionNote}"
                              </p>
                            )}
                          </div>
                        )}

                        {/* Actions for pending */}
                        {isPending && (
                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={() => handleOpenAction(notification, "approve")}
                              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 active:scale-95 transition-all shadow-sm"
                            >
                              <CheckIcon />
                              Approva
                            </button>
                            <button
                              onClick={() => handleOpenAction(notification, "reject")}
                              className="flex items-center gap-2 px-4 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 active:scale-95 transition-all shadow-sm"
                            >
                              <XIcon />
                              Rifiuta
                            </button>
                            {notification.link && (
                              <a
                                href={notification.link}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors"
                              >
                                Visualizza Proprietà
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Quick actions */}
                      <div className="flex flex-col gap-2">
                        {isUnread && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Segna come letta"
                          >
                            <CheckIcon />
                          </button>
                        )}
                        {notification.status !== "ARCHIVED" && (
                          <button
                            onClick={() => deleteNotification(notification.id)}
                            className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Elimina"
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Action Modal for notifications */}
      {selectedNotification && actionType && (
        <ActionModal
          notification={selectedNotification}
          action={actionType}
          onClose={() => {
            setSelectedNotification(null);
            setActionType(null);
          }}
          onConfirm={handleConfirmAction}
        />
      )}

      {/* Action Modal for modification requests */}
      {selectedRequest && requestAction && (
        <ModificationModal
          request={selectedRequest}
          action={requestAction}
          onClose={() => {
            setSelectedRequest(null);
            setRequestAction(null);
          }}
          onConfirm={handleModificationAction}
        />
      )}
    </div>
  );
}
