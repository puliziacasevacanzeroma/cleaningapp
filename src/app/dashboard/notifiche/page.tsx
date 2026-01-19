"use client";

import { useState } from "react";
import { useNotifications } from "~/hooks/useNotifications";
import type { FirebaseNotification } from "~/lib/firebase/types";

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
type TabType = "all" | "pending" | "read" | "archived";

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
              ? `Stai per approvare la richiesta di disattivazione per "${notification.relatedEntityName}"`
              : `Stai per rifiutare la richiesta di disattivazione per "${notification.relatedEntityName}"`
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

// ==================== MAIN PAGE ====================
export default function NotifichePage() {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [selectedNotification, setSelectedNotification] = useState<FirebaseNotification | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);

  const {
    notifications,
    unreadCount,
    pendingActionsCount,
    loading,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    handleAction,
  } = useNotifications();

  // Filtra notifiche in base al tab
  const filteredNotifications = notifications.filter(n => {
    switch (activeTab) {
      case "pending":
        return n.actionRequired && n.actionStatus === "PENDING";
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

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "all", label: "Tutte", count: notifications.filter(n => n.status !== "ARCHIVED").length },
    { id: "pending", label: "In Attesa", count: pendingActionsCount },
    { id: "read", label: "Lette", count: notifications.filter(n => n.status === "READ").length },
    { id: "archived", label: "Archiviate", count: notifications.filter(n => n.status === "ARCHIVED").length },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <BellIcon />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Notifiche</h1>
              <p className="text-sm text-slate-500">
                {unreadCount > 0 ? `${unreadCount} non lette` : "Tutte le notifiche lette"} 
                {pendingActionsCount > 0 && ` • ${pendingActionsCount} in attesa`}
              </p>
            </div>
          </div>
          
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="px-4 py-2 bg-blue-50 text-blue-600 text-sm font-medium rounded-xl hover:bg-blue-100 transition-colors"
            >
              Segna tutte come lette
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-slate-900 text-white shadow-md"
                : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                activeTab === tab.id ? "bg-white/20" : "bg-slate-100"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications List */}
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
                          onClick={() => archiveNotification(notification.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Archivia"
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

      {/* Action Modal */}
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
    </div>
  );
}
