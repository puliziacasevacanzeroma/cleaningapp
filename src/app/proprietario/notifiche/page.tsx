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

const CleaningIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const PaymentIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
    case "CLEANING_ASSIGNED":
    case "CLEANING_COMPLETED":
      return <CleaningIcon />;
    case "PROPERTY_APPROVED":
    case "PROPERTY_REJECTED":
    case "NEW_PROPERTY":
      return <HomeIcon />;
    case "PAYMENT_DUE":
    case "PAYMENT_RECEIVED":
      return <PaymentIcon />;
    case "WARNING":
    case "ERROR":
      return <AlertIcon />;
    default:
      return <BellIcon />;
  }
}

function getNotificationColor(type: string) {
  switch (type) {
    case "CLEANING_ASSIGNED":
      return "bg-blue-100 text-blue-600 border-blue-200";
    case "CLEANING_COMPLETED":
      return "bg-emerald-100 text-emerald-600 border-emerald-200";
    case "PROPERTY_APPROVED":
    case "SUCCESS":
      return "bg-emerald-100 text-emerald-600 border-emerald-200";
    case "PROPERTY_REJECTED":
    case "ERROR":
      return "bg-red-100 text-red-600 border-red-200";
    case "PAYMENT_DUE":
    case "WARNING":
      return "bg-amber-100 text-amber-600 border-amber-200";
    case "PAYMENT_RECEIVED":
      return "bg-green-100 text-green-600 border-green-200";
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
type TabType = "all" | "unread" | "read" | "archived";

// ==================== MAIN PAGE ====================
export default function NotificheProprietarioPage() {
  const [activeTab, setActiveTab] = useState<TabType>("all");

  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    archiveNotification,
  } = useNotifications();

  // Filtra notifiche per tab
  const filteredNotifications = notifications.filter(n => {
    switch (activeTab) {
      case "unread":
        return n.status === "UNREAD";
      case "read":
        return n.status === "READ";
      case "archived":
        return n.status === "ARCHIVED";
      default:
        return n.status !== "ARCHIVED";
    }
  });

  const tabs = [
    { id: "all" as TabType, label: "Tutte", count: notifications.filter(n => n.status !== "ARCHIVED").length },
    { id: "unread" as TabType, label: "Non lette", count: unreadCount },
    { id: "read" as TabType, label: "Lette", count: notifications.filter(n => n.status === "READ").length },
    { id: "archived" as TabType, label: "Archiviate", count: notifications.filter(n => n.status === "ARCHIVED").length },
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Notifiche</h1>
            <p className="text-sm text-slate-500 mt-1">
              {unreadCount > 0 
                ? `Hai ${unreadCount} notifiche non lette`
                : "Nessuna notifica non letta"
              }
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="px-4 py-2 bg-sky-50 text-sky-600 text-sm font-medium rounded-xl hover:bg-sky-100 transition-colors"
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
                ? "bg-sky-500 text-white shadow-md"
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
            <div className="w-12 h-12 border-3 border-slate-200 border-t-sky-500 rounded-full animate-spin mx-auto"></div>
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
              Non hai notifiche in questa sezione
            </p>
          </div>
        ) : (
          filteredNotifications.map(notification => {
            const isUnread = notification.status === "UNREAD";
            const createdAt = notification.createdAt?.toDate?.() || new Date();
            
            return (
              <div
                key={notification.id}
                className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${
                  isUnread ? "border-sky-200 shadow-md" : "border-slate-100"
                }`}
              >
                <div className="p-4 md:p-5">
                  <div className="flex gap-4">
                    {/* Icon */}
                    <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
                      getNotificationColor(notification.type)
                    }`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <h3 className={`text-base ${isUnread ? "font-bold" : "font-semibold"} text-slate-800`}>
                          {notification.title}
                        </h3>
                        <div className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
                          <ClockIcon />
                          <span>{formatTimeAgo(createdAt)}</span>
                        </div>
                      </div>
                      
                      <p className="text-sm text-slate-600 mb-2">
                        {notification.message}
                      </p>

                      {/* Link se presente */}
                      {notification.link && (
                        <a
                          href={notification.link}
                          className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700 font-medium mt-2"
                        >
                          Visualizza dettagli →
                        </a>
                      )}
                    </div>

                    {/* Quick actions */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {isUnread && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
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
    </div>
  );
}
