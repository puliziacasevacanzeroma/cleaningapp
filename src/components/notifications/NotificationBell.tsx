"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "~/hooks/useNotifications";
import type { FirebaseNotification } from "~/lib/firebase/types";

// ==================== ICONS ====================
const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const AlertIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const InfoIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// ==================== HELPERS ====================
function getNotificationIcon(type: string) {
  switch (type) {
    case "DELETION_REQUEST":
    case "NEW_PROPERTY":
    case "PROPERTY_APPROVED":
    case "PROPERTY_REJECTED":
      return <HomeIcon />;
    case "urgent_issue":
    case "WARNING":
    case "ERROR":
      return <AlertIcon />;
    case "cleaning_completed":
      return <CheckIcon />;
    default:
      return <InfoIcon />;
  }
}

function getNotificationColor(type: string, actionStatus?: string) {
  if (actionStatus === "APPROVED") return "bg-emerald-100 text-emerald-600";
  if (actionStatus === "REJECTED") return "bg-red-100 text-red-600";
  
  switch (type) {
    case "urgent_issue":
      return "bg-red-100 text-red-600";
    case "cleaning_completed":
      return "bg-emerald-100 text-emerald-600";
    case "DELETION_REQUEST":
      return "bg-amber-100 text-amber-600";
    case "NEW_PROPERTY":
      return "bg-blue-100 text-blue-600";
    case "SUCCESS":
    case "PROPERTY_APPROVED":
      return "bg-emerald-100 text-emerald-600";
    case "WARNING":
    case "PROPERTY_REJECTED":
      return "bg-amber-100 text-amber-600";
    case "ERROR":
      return "bg-red-100 text-red-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Adesso";
  if (diffMins < 60) return `${diffMins}m fa`;
  if (diffHours < 24) return `${diffHours}h fa`;
  if (diffDays < 7) return `${diffDays}g fa`;
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

// ==================== NOTIFICATION ITEM ====================
interface NotificationItemProps {
  notification: FirebaseNotification;
  onMarkAsRead: (id: string) => void;
  onArchive: (id: string) => void;
  onNavigate?: () => void;
  isAdmin?: boolean;
}

function NotificationItem({ 
  notification, 
  onMarkAsRead, 
  onArchive, 
  onNavigate,
  isAdmin 
}: NotificationItemProps) {
  const router = useRouter();
  const isUnread = notification.status === "UNREAD";
  const isPending = notification.actionRequired && notification.actionStatus === "PENDING";
  const createdAt = notification.createdAt?.toDate?.() || new Date();
  
  // Gestisce il click sulla notifica per navigare
  const handleClick = () => {
    // Segna come letta
    if (isUnread) {
      onMarkAsRead(notification.id);
    }
    
    // Chiudi dropdown
    onNavigate?.();
    
    // Navigazione basata sul tipo di notifica
    const notificationType = notification.type?.toLowerCase() || '';
    // Supporta sia data.xxx che xxx direttamente nella notifica
    const data = notification.data || notification || {};
    const notifData = notification as any;
    const titleLower = (notifData.title || '').toLowerCase();
    
    // 🚨 SEGNALAZIONE / PROBLEMA CRITICO → vai alla pagina segnalazioni
    // Controlla prima se è una segnalazione perché ha priorità
    const isIssueNotification = 
      notifData.relatedType === 'issue' || 
      notifData.relatedEntityType === 'ISSUE' ||
      notificationType === 'urgent_issue' || 
      notificationType.includes('issue') || 
      notificationType.includes('segnalazione') ||
      titleLower.includes('segnalazione') ||
      titleLower.includes('problema critico') ||
      titleLower.includes('problema') ||
      (titleLower.includes('critico') && notificationType === 'warning');
    
    if (isIssueNotification) {
      const issueId = notifData.relatedId || data.issueId || '';
      // Se abbiamo un issueId specifico, vai direttamente a quella segnalazione
      if (issueId) {
        if (isAdmin) {
          router.push(`/dashboard/segnalazioni?id=${issueId}`);
        } else {
          router.push(`/proprietario/segnalazioni?id=${issueId}`);
        }
      } else {
        // Altrimenti vai alla lista segnalazioni
        if (isAdmin) {
          router.push('/dashboard/segnalazioni');
        } else {
          router.push('/proprietario/segnalazioni');
        }
      }
      return;
    }
    
    // 🕕 PULIZIA SCADUTA (URGENT con relatedEntityType CLEANING e titolo "non completata")
    if ((notificationType === 'urgent' || notificationType === 'warning') && 
        notifData.relatedEntityType === 'CLEANING' && 
        titleLower.includes('non completata')) {
      const cleaningId = notifData.relatedEntityId || '';
      if (cleaningId) {
        if (isAdmin) {
          router.push(`/dashboard?openCleaning=${cleaningId}`);
        } else {
          router.push(`/proprietario/dashboard?openCleaning=${cleaningId}`);
        }
        return;
      }
    }
    
    // ✅ Pulizia completata → vai al dettaglio pulizia
    if (notificationType === 'cleaning_completed' || notificationType.includes('pulizia') || notificationType === 'success') {
      const cleaningId = data.cleaningId || notifData.cleaningId || notifData.relatedEntityId || notifData.relatedId || '';
      if (cleaningId) {
        if (isAdmin) {
          router.push(`/dashboard?openCleaning=${cleaningId}`);
        } else {
          router.push(`/proprietario/dashboard?openCleaning=${cleaningId}`);
        }
        return;
      }
    }
    
    // 🏠 Richiesta disattivazione proprietà
    if (notification.type === "DELETION_REQUEST" && isPending) {
      router.push("/dashboard/proprieta/pending");
      return;
    }
    
    // 🏠 Nuova proprietà
    if (notification.type === "NEW_PROPERTY") {
      router.push("/dashboard/proprieta/pending");
      return;
    }
    
    // Proprietà approvata/rifiutata
    if (notification.type === "PROPERTY_APPROVED" || notification.type === "PROPERTY_REJECTED") {
      const propertyId = data.propertyId || '';
      if (propertyId) {
        router.push(`/proprietario/proprieta/${propertyId}`);
      } else {
        router.push('/proprietario/proprieta');
      }
      return;
    }
  };
  
  return (
    <div 
      onClick={handleClick}
      className={`p-3 border-b border-slate-100 last:border-b-0 transition-colors cursor-pointer ${
        isUnread ? "bg-blue-50/50" : "bg-white"
      } hover:bg-slate-50`}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          getNotificationColor(notification.type, notification.actionStatus)
        }`}>
          {getNotificationIcon(notification.type)}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm ${isUnread ? "font-semibold" : "font-medium"} text-slate-800`}>
              {notification.title}
            </p>
            <span className="text-[10px] text-slate-400 whitespace-nowrap">
              {formatTimeAgo(createdAt)}
            </span>
          </div>
          
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
            {notification.message}
          </p>
          
          {/* Status Badge */}
          {notification.actionStatus && notification.actionStatus !== "PENDING" && (
            <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
              notification.actionStatus === "APPROVED" 
                ? "bg-emerald-100 text-emerald-700" 
                : "bg-red-100 text-red-700"
            }`}>
              {notification.actionStatus === "APPROVED" ? "Approvato" : "Rifiutato"}
            </span>
          )}
          
          {/* Indicazione per admin - clicca per gestire */}
          {isAdmin && isPending && (
            <p className="text-xs text-blue-600 mt-2 font-medium">
              👆 Clicca per gestire
            </p>
          )}
        </div>
        
        {/* Quick actions */}
        <div className="flex flex-col gap-1">
          {isUnread && (
            <button
              onClick={(e) => { e.stopPropagation(); onMarkAsRead(notification.id); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Segna come letta"
            >
              <CheckIcon />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(notification.id); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Archivia"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== NOTIFICATION BELL ====================
interface NotificationBellProps {
  isAdmin?: boolean;
}

export function NotificationBell({ isAdmin = false }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
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

  // Chiudi dropdown quando si clicca fuori
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Badge count: per admin mostra richieste pendenti, per altri notifiche non lette
  const badgeCount = isAdmin ? (pendingActionsCount || unreadCount) : unreadCount;
  
  // Filtra notifiche: mostra non archiviate + quelle con azioni pendenti (anche se archiviate)
  const visibleNotifications = notifications
    .filter(n => n.status !== "ARCHIVED" || (n.actionRequired && n.actionStatus === "PENDING"))
    .slice(0, 10);
  
  // Debug log
  console.log("🔔 NotificationBell:", {
    totalNotifications: notifications.length,
    visibleCount: visibleNotifications.length,
    pendingActionsCount,
    unreadCount,
    badgeCount,
  });

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
      >
        <BellIcon />
        {badgeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full animate-pulse">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
            <div>
              <h3 className="font-semibold text-slate-800">Notifiche</h3>
              {isAdmin && pendingActionsCount > 0 && (
                <p className="text-xs text-amber-600 font-medium">
                  {pendingActionsCount} richieste in attesa
                </p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Segna tutte lette
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-slate-500 mt-2">Caricamento...</p>
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <BellIcon />
                </div>
                <p className="text-sm text-slate-500">Nessuna notifica</p>
              </div>
            ) : (
              visibleNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  onArchive={archiveNotification}
                  onNavigate={() => setIsOpen(false)}
                  isAdmin={isAdmin}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {visibleNotifications.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
              <a
                href={isAdmin ? "/dashboard/notifiche" : "/proprietario/notifiche"}
                className="block text-center text-sm text-blue-600 hover:text-blue-700 font-medium py-1"
              >
                Vedi tutte le notifiche →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
