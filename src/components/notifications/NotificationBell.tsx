"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useNotifications } from "~/hooks/useNotifications";
import { resolveNotificationLink } from "~/lib/notifications/linkGenerator";
import type { FirebaseNotification } from "~/lib/firebase/types";

interface Issue {
  id: string; propertyId: string; propertyName: string; type: string;
  title: string; description: string; severity: string; status: string;
  photos: string[]; isUrgent?: boolean; resolved?: boolean;
  reportedBy: string; reportedByName: string; createdAt: any; reportedAt?: any;
}

const Ic = ({ d, className = "w-[18px] h-[18px]" }: { d: string | string[]; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {(Array.isArray(d) ? d : [d]).map((p, i) => (
      <path key={i} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={p} />
    ))}
  </svg>
);

const ic = {
  bell: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  warn: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  check: "M5 13l4 4L19 7",
  trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  star: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  coin: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  chevR: "M9 5l7 7-7 7",
  close: "M6 18L18 6M6 6l12 12",
  box: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  gear: ["M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z", "M15 12a3 3 0 11-6 0 3 3 0 016 0z"],
  back: "M15 19l-7-7 7-7",
};

function getNotifIconData(type: string) {
  switch (type) {
    case "CLEANING_ASSIGNED": case "CLEANING_ASSIGNED_OWNER": case "CLEANING_STARTED": case "CLEANING_COMPLETED": return { d: ic.star, color: "bg-sky-50 text-sky-500" };
    case "PROPERTY_APPROVED": case "NEW_PROPERTY": case "PROPERTY_ADDED": case "SUCCESS": case "DELETION_APPROVED": case "PAYMENT_RECEIVED": case "LAUNDRY_DELIVERED": return { d: ic.check, color: "bg-emerald-50 text-emerald-500" };
    case "PROPERTY_REJECTED": case "ERROR": case "DELETION_REJECTED": case "CLEANING_NOT_COMPLETED": return { d: ic.close, color: "bg-red-50 text-red-500" };
    case "PAYMENT_DUE": case "PAYMENT_REMINDER": case "PAYMENT_OVERDUE": case "WARNING": case "URGENT": case "CLEANING_ISSUE": return { d: ic.warn, color: "bg-amber-50 text-amber-500" };
    case "ORDER_CREATED": case "LAUNDRY_NEW": case "LINEN_DELIVERED": case "ORDER_DELIVERED": case "PRODUCT_REQUEST": return { d: ic.box, color: "bg-indigo-50 text-indigo-500" };
    case "BOOKING_NEW": return { d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", color: "bg-indigo-50 text-indigo-500" };
    default: return { d: ic.bell, color: "bg-slate-100 text-slate-500" };
  }
}

function getIssueIconData(type: string, isUrgent?: boolean) {
  if (isUrgent) return { d: ic.warn, bg: "bg-red-50 text-red-500" };
  switch (type) {
    case "damage": return { d: ic.warn, bg: "bg-red-50 text-red-500" };
    case "missing_item": return { d: ic.box, bg: "bg-amber-50 text-amber-500" };
    case "maintenance": return { d: ic.gear, bg: "bg-emerald-50 text-emerald-500" };
    default: return { d: ic.bell, bg: "bg-slate-100 text-slate-500" };
  }
}

function timeAgo(date: Date): string {
  const ms = new Date().getTime() - date.getTime();
  const m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), d = Math.floor(ms / 86400000);
  if (m < 1) return "Adesso"; if (m < 60) return m + "m fa"; if (h < 24) return h + "h fa"; if (d < 7) return d + "g fa";
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function fmtDate(ts: any): string {
  if (!ts) return "-"; const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const SEV: Record<string, string> = { low: "bg-emerald-100 text-emerald-700", medium: "bg-amber-100 text-amber-700", high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700" };
const SEV_L: Record<string, string> = { low: "Bassa", medium: "Media", high: "Alta", critical: "Critica" };

type BellTab = "notifiche" | "segnalazioni";

interface NotificationBellProps { isAdmin?: boolean; }

export function NotificationBell({ isAdmin = false }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>("notifiche");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user } = useAuth();
  const { notifications, unreadCount, loading: nLoad, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [isMobile, setIsMobile] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  // Solo admin e proprietario hanno la pagina /notifiche
  const userRole = (user?.role || "").toUpperCase();
  const hasNotifPage = isAdmin || userRole === "PROPRIETARIO";
  const notifPageUrl = isAdmin ? "/dashboard/notifiche" : "/proprietario/notifiche";

  useEffect(() => {
    setPortalReady(true);
    setIsMobile(window.innerWidth < 768);
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // Segnalazioni data
  const [issues, setIssues] = useState<Issue[]>([]);
  const [props, setProps] = useState<string[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    if (isAdmin) { setProps(["__admin__"]); return; }
    const q = query(collection(db, "properties"), where("ownerId", "==", user.id));
    const unsub = onSnapshot(q, snap => setProps(snap.docs.map(d => d.id)));
    return () => unsub();
  }, [user?.id, isAdmin]);

  useEffect(() => {
    if (props.length === 0) return;
    const q = isAdmin
      ? query(collection(db, "issues"))
      : query(collection(db, "issues"), where("propertyId", "in", props.slice(0, 10)));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as Issue[];
      data.sort((a, b) => {
        const da = a.createdAt?.toDate?.() || a.reportedAt?.toDate?.() || new Date(0);
        const db2 = b.createdAt?.toDate?.() || b.reportedAt?.toDate?.() || new Date(0);
        return db2.getTime() - da.getTime();
      });
      setIssues(data);
    });
    return () => unsub();
  }, [props, isAdmin]);

  // Desktop: click outside (controlla sia il bottone che il dropdown portaled)
  const desktopDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isMobile || !isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const inButton = dropdownRef.current?.contains(target);
      const inDropdown = desktopDropdownRef.current?.contains(target);
      if (!inButton && !inDropdown) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobile, isOpen]);

  // Blocca scroll body quando pannello mobile è aperto
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isMobile, isOpen]);

  const totalBadge = unreadCount;
  const visibleNotifs = notifications.filter(n => n.status !== "ARCHIVED").slice(0, 30);
  const openIssues = issues.filter(i => !(i.resolved === true || i.status === "resolved"));
  const visibleIssues = issues.slice(0, 15);

  const handleNotifClick = (n: FirebaseNotification) => {
    if (n.status === "UNREAD") markAsRead(n.id);
    setIsOpen(false);
    const notifData = n as any;
    const link = resolveNotificationLink({ link: n.link, type: n.type, relatedEntityId: n.relatedEntityId, relatedEntityType: n.relatedEntityType, relatedType: notifData.relatedType, relatedId: notifData.relatedId, recipientRole: n.recipientRole });
    if (link) router.push(link);
  };

  // ═══════════════════════════════════════════════════════════════
  // SHARED CONTENT (tabs + lists)
  // ═══════════════════════════════════════════════════════════════

  const TabSlider = () => (
    <div className="bg-slate-100 rounded-[10px] p-0.5 flex relative">
      <div className={`absolute top-0.5 left-0.5 w-[calc(50%-2px)] h-[calc(100%-4px)] bg-gradient-to-r from-sky-500 to-blue-500 rounded-[8px] shadow-sm transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] ${tab === "segnalazioni" ? "translate-x-full" : ""}`} />
      {(["notifiche", "segnalazioni"] as BellTab[]).map(t => (
        <button key={t} onClick={() => setTab(t)} className={`flex-1 relative z-[1] py-[7px] flex items-center justify-center gap-[5px] text-[11px] font-semibold transition-colors duration-300 ${tab === t ? "text-white" : "text-slate-400"}`}>
          <Ic d={t === "notifiche" ? ic.bell : ic.warn} className="w-3.5 h-3.5" />
          {t === "notifiche" ? "Notifiche" : "Segnalazioni"}
          {t === "notifiche" && unreadCount > 0 && <span className={`min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${tab === "notifiche" ? "bg-white/25 text-white" : "bg-red-100 text-red-500"}`}>{unreadCount}</span>}
          {t === "segnalazioni" && openIssues.length > 0 && <span className={`min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${tab === "segnalazioni" ? "bg-white/25 text-white" : "bg-red-100 text-red-500"}`}>{openIssues.length}</span>}
        </button>
      ))}
    </div>
  );

  const NotifList = ({ maxH }: { maxH?: string }) => (
    <div className={maxH ? `max-h-[${maxH}] overflow-y-auto` : "flex-1 overflow-y-auto"} style={maxH ? undefined : { WebkitOverflowScrolling: "touch" }}>
      {nLoad ? (
        <div className="p-8 text-center"><div className="w-8 h-8 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin mx-auto" /><p className="text-xs text-slate-400 mt-2">Caricamento...</p></div>
      ) : visibleNotifs.length === 0 ? (
        <div className="p-8 text-center"><Ic d={ic.bell} className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Nessuna notifica</p></div>
      ) : visibleNotifs.map(n => {
        const ur = n.status === "UNREAD"; const ca = n.createdAt?.toDate?.() || new Date(); const { d, color } = getNotifIconData(n.type);
        return (
          <div key={n.id} onClick={() => handleNotifClick(n)} className={`px-4 py-3 flex gap-3 cursor-pointer transition-all border-b border-slate-50 last:border-b-0 ${ur ? "bg-sky-50/40" : "bg-white"} hover:bg-slate-50 active:bg-slate-100`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}><Ic d={d} className="w-[18px] h-[18px]" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-[13px] text-slate-800 leading-snug ${ur ? "font-bold" : "font-medium"}`}>{n.title}</p>
                <span className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">{timeAgo(ca)}</span>
              </div>
              <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              {ur && <button onClick={e => { e.stopPropagation(); markAsRead(n.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-colors"><Ic d={ic.check} className="w-4 h-4" /></button>}
              <button onClick={e => { e.stopPropagation(); deleteNotification(n.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Ic d={ic.trash} className="w-4 h-4" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const IssueList = ({ maxH }: { maxH?: string }) => (
    <div className={maxH ? `max-h-[${maxH}] overflow-y-auto` : "flex-1 overflow-y-auto"} style={maxH ? undefined : { WebkitOverflowScrolling: "touch" }}>
      {visibleIssues.length === 0 ? (
        <div className="p-8 text-center"><Ic d={ic.check} className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Nessuna segnalazione</p></div>
      ) : visibleIssues.map(issue => {
        const isRes = issue.resolved === true || issue.status === "resolved"; const { d, bg } = getIssueIconData(issue.type, issue.isUrgent);
        return (
          <div key={issue.id} onClick={() => { if (hasNotifPage) { setIsOpen(false); router.push(isAdmin ? "/dashboard/notifiche?tab=segnalazioni&id=" + issue.id : "/proprietario/notifiche?id=" + issue.id); } }} className={`px-4 py-3 flex gap-3 ${hasNotifPage ? "cursor-pointer" : ""} transition-all border-b border-slate-50 last:border-b-0 hover:bg-slate-50 active:bg-slate-100 border-l-[3px] ${issue.isUrgent ? "border-l-red-500 bg-red-50/20" : isRes ? "border-l-emerald-500 opacity-60" : "border-l-amber-500"}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}><Ic d={d} className="w-[18px] h-[18px]" /></div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[13px] font-bold text-slate-800 truncate">{issue.title}</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">{issue.propertyName}</p>
              <div className="flex gap-1.5 mt-1.5 items-center flex-wrap">
                <span className={`text-[9px] font-bold px-1.5 py-[2px] rounded-full ${SEV[issue.severity] || SEV.low}`}>{SEV_L[issue.severity] || "Bassa"}</span>
                <span className={`text-[9px] font-bold px-1.5 py-[2px] rounded-full ${isRes ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{isRes ? "Risolta" : "Aperta"}</span>
                <span className="text-[10px] text-slate-400">{fmtDate(issue.reportedAt || issue.createdAt)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // MOBILE: Full-screen panel via portal
  // ═══════════════════════════════════════════════════════════════
  const MobilePanel = () => {
    if (!isOpen || !isMobile || !portalReady) return null;
    return createPortal(
      <div className="fixed inset-0 z-[10000] flex flex-col bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 px-4 pt-3 pb-3" style={{ paddingTop: "calc(12px + env(safe-area-inset-top, 0px))" }}>
          <div className="flex items-start justify-between">
            <h3 className="font-bold text-white text-base pt-1.5">Centro Messaggi</h3>
            <div className="flex flex-col items-end gap-3">
              <button onClick={() => setIsOpen(false)} className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center active:scale-95 transition-transform">
                <Ic d={ic.close} className="w-5 h-5 text-white" />
              </button>
              {tab === "notifiche" && unreadCount > 0 && (
                <button onClick={() => markAllAsRead()} className="text-[11px] text-white/70 hover:text-white font-medium active:scale-95 transition-all">
                  Segna tutte come lette
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 bg-white px-4 pt-3 pb-2">
          <TabSlider />
        </div>

        {/* Content */}
        {tab === "notifiche" ? <NotifList /> : <IssueList />}

        {/* Footer — solo se esiste la pagina notifiche per questo ruolo */}
        {hasNotifPage && (
          <div className="flex-shrink-0 px-4 py-3 border-t border-slate-100 bg-white">
            <button
              onClick={() => { setIsOpen(false); router.push(notifPageUrl); }}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold text-sm text-center active:scale-[0.98] transition-transform shadow-lg shadow-sky-500/20"
            >
              Apri Centro Messaggi completo
            </button>
          </div>
        )}
      </div>,
      document.body
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // DESKTOP: Dropdown via portal (evita z-index issues con header sticky)
  // ═══════════════════════════════════════════════════════════════
  const [ddPos, setDdPos] = useState<{ top: number; right: number } | null>(null);

  // Calcola posizione del dropdown relativa al bottone
  useEffect(() => {
    if (!isOpen || isMobile || !dropdownRef.current) { setDdPos(null); return; }
    const rect = dropdownRef.current.getBoundingClientRect();
    setDdPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [isOpen, isMobile]);

  const DesktopDropdown = () => {
    if (!isOpen || isMobile || !portalReady || !ddPos) return null;
    return createPortal(
      <div ref={desktopDropdownRef} className="fixed w-[400px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-[9999]" style={{ top: ddPos.top, right: ddPos.right }}>
        {/* Header gradient */}
        <div className="bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600 px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-[14px]">Centro Messaggi</h3>
            {tab === "notifiche" && unreadCount > 0 && (<button onClick={() => markAllAsRead()} className="text-[10px] text-white/80 hover:text-white font-medium">Segna tutte lette</button>)}
          </div>
        </div>

        {/* Tab slider */}
        <div className="bg-white px-3 pt-3 pb-1">
          <TabSlider />
        </div>

        {/* NOTIFICHE LIST */}
        {tab === "notifiche" && (
          <div className="max-h-[360px] overflow-y-auto">
            {nLoad ? (
              <div className="p-8 text-center"><div className="w-8 h-8 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin mx-auto" /><p className="text-xs text-slate-400 mt-2">Caricamento...</p></div>
            ) : visibleNotifs.length === 0 ? (
              <div className="p-8 text-center"><Ic d={ic.bell} className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Nessuna notifica</p></div>
            ) : visibleNotifs.slice(0, 10).map(n => {
              const ur = n.status === "UNREAD"; const ca = n.createdAt?.toDate?.() || new Date(); const { d, color } = getNotifIconData(n.type);
              return (
                <div key={n.id} onClick={() => handleNotifClick(n)} className={`px-3 py-2.5 flex gap-2.5 cursor-pointer transition-all border-b border-slate-50 last:border-b-0 ${ur ? "bg-sky-50/40" : "bg-white"} hover:bg-slate-50 active:bg-slate-100`}>
                  <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${color}`}><Ic d={d} className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2"><p className={`text-[12px] text-slate-800 leading-tight ${ur ? "font-bold" : "font-medium"}`}>{n.title}</p><span className="text-[9px] text-slate-400 whitespace-nowrap mt-0.5">{timeAgo(ca)}</span></div>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{n.message}</p>
                  </div>
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    {ur && <button onClick={e => { e.stopPropagation(); markAsRead(n.id); }} className="p-1 rounded-md text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-colors"><Ic d={ic.check} className="w-3.5 h-3.5" /></button>}
                    <button onClick={e => { e.stopPropagation(); deleteNotification(n.id); }} className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Ic d={ic.trash} className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* SEGNALAZIONI LIST */}
        {tab === "segnalazioni" && (
          <div className="max-h-[360px] overflow-y-auto">
            {visibleIssues.length === 0 ? (
              <div className="p-8 text-center"><Ic d={ic.check} className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-xs text-slate-400">Nessuna segnalazione</p></div>
            ) : visibleIssues.slice(0, 8).map(issue => {
              const isRes = issue.resolved === true || issue.status === "resolved"; const { d, bg } = getIssueIconData(issue.type, issue.isUrgent);
              return (
                <div key={issue.id} onClick={() => { if (hasNotifPage) { setIsOpen(false); router.push(isAdmin ? "/dashboard/notifiche?tab=segnalazioni&id=" + issue.id : "/proprietario/notifiche?id=" + issue.id); } }} className={`px-3 py-2.5 flex gap-2.5 ${hasNotifPage ? "cursor-pointer" : ""} transition-all border-b border-slate-50 last:border-b-0 hover:bg-slate-50 active:bg-slate-100 border-l-[3px] ${issue.isUrgent ? "border-l-red-500 bg-red-50/20" : isRes ? "border-l-emerald-500 opacity-60" : "border-l-amber-500"}`}>
                  <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${bg}`}><Ic d={d} className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[12px] font-bold text-slate-800 truncate">{issue.title}</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">{issue.propertyName}</p>
                    <div className="flex gap-1 mt-1 items-center">
                      <span className={`text-[8px] font-bold px-1.5 py-[1px] rounded-full ${SEV[issue.severity] || SEV.low}`}>{SEV_L[issue.severity] || "Bassa"}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-[1px] rounded-full ${isRes ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{isRes ? "Risolta" : "Aperta"}</span>
                      <span className="text-[9px] text-slate-400">{fmtDate(issue.reportedAt || issue.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer — solo se esiste la pagina notifiche per questo ruolo */}
        {hasNotifPage && (
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
            <a href={notifPageUrl} onClick={() => setIsOpen(false)} className="block text-center text-[12px] text-sky-600 hover:text-sky-700 font-semibold py-0.5">
              Vedi tutto in Centro Messaggi <span className="inline-block ml-0.5">→</span>
            </a>
          </div>
        )}
      </div>,
      document.body
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="relative p-2 rounded-xl hover:bg-white/10 transition-colors active:scale-95">
        <Ic d={ic.bell} className="w-5 h-5 text-current" />
        {totalBadge > 0 && (<span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full animate-pulse">{totalBadge > 99 ? "99+" : totalBadge}</span>)}
      </button>

      <DesktopDropdown />
      <MobilePanel />
    </div>
  );
}

export default NotificationBell;
