"use client";

import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { ToastProvider, useProprietarioRealtimeNotifications } from "~/components/ui/ToastNotifications";
import { PushNotificationInit } from "~/components/PushNotificationInit";
import { NotificationBell } from "~/components/notifications";
import { PaymentWarningModal } from "~/components/proprietario/PaymentWarningModal";
import { usePaymentBlock } from "~/hooks/usePaymentBlock";
import { useOwnerDebts } from "~/hooks/useOwnerDebts";
import { AssistantWidget, AssistantHeaderButton, triggerAssistant, onAssistantClose } from "~/components/proprietario/AssistantWidget";

interface ProprietarioLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userId?: string;
}

// Componente separato per listener proprietario
function ProprietarioRealtimeListener({ userId }: { userId: string }) {
  // Il nuovo listener usa direttamente userId, non serve più cercare le proprietà
  useProprietarioRealtimeNotifications(userId, []);
  return null;
}

export function ProprietarioLayoutClient({ children, userName, userEmail, userId }: ProprietarioLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [pendingSignCount, setPendingSignCount] = useState(0);
  const [hideNav, setHideNav] = useState(false);

  // ═══ BLOCCO PAGAMENTI: se l'account è bloccato, mostra solo pagamenti ═══
  const { isBlocked: isPaymentBlocked } = usePaymentBlock(userId);
  const { countScaduti } = useOwnerDebts(userId);
  const isAccountSuspended = isPaymentBlocked && countScaduti > 0;
  const isOnPaymentsPage = pathname === "/proprietario/pagamenti";

  // Se account sospeso e NON è sulla pagina pagamenti, blocca la navigazione
  // Il children viene sostituito con un messaggio vuoto, la modal bloccante fa il resto
  const effectiveChildren = (isAccountSuspended && !isOnPaymentsPage) ? null : children;

  // Nascondi bottom nav quando PropertyContractModal è aperta
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setHideNav(document.body.classList.contains("modal-contract-open"));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Conta proprietà in attesa di firma allegato D
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, "properties"), where("ownerId", "==", userId), where("status", "==", "PENDING_SIGNATURE"));
    const unsub = onSnapshot(q, snap => setPendingSignCount(snap.size));
    return () => unsub();
  }, [userId]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  
  // 🔄 Fix Hydration: inizializza sempre null, poi determina sul client
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  // Sincronizza isAssistantOpen quando il pannello viene chiuso dall'interno (X interna o click fuori)
  useEffect(() => {
    onAssistantClose(() => setIsAssistantOpen(false));
    return () => onAssistantClose(null);
  }, []);

  // 🚀 NAVBAR ISTANTANEA: evidenzia il pulsante subito al click, prima che la pagina carichi
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  
  useEffect(() => {
    setOptimisticPath(null);
  }, [pathname]);

  const activePath = optimisticPath || pathname;

  const isItemActive = (href: string) => {
    if (href === "/proprietario") return activePath === "/proprietario";
    return activePath === href || activePath.startsWith(href + "/");
  };

  const handleNavClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (pathname === href) return;

    // 🚀 1. DOM diretto — highlight ISTANTANEO senza aspettare React
    const nav = (e.currentTarget as HTMLElement).closest('nav');
    if (nav) {
      nav.querySelectorAll('[data-nav-item]').forEach(el => {
        (el as HTMLElement).className = (el as HTMLElement).className
          .replace(/text-sky-600/g, 'text-slate-500')
          .replace(/bg-sky-50/g, '');
      });
      const clicked = e.currentTarget as HTMLElement;
      clicked.className = clicked.className
        .replace(/text-slate-500/g, 'text-sky-600')
        .replace(/text-slate-600/g, 'text-sky-600');
      if (!clicked.className.includes('bg-sky-50')) {
        clicked.className = clicked.className + ' bg-sky-50';
      }
    }

    // 🚀 2. React state in background
    setOptimisticPath(href);
    startTransition(() => { router.push(href); });
  }, [pathname, router, startTransition]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 🔧 Reset scroll quando cambia pagina
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [pathname]);

  // 🔄 Loading mentre determiniamo mobile/desktop
  if (isMobile === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  // Voci per la navbar mobile in basso (solo le principali)
  const navbarItems = [
    { href: "/proprietario", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/proprietario/proprieta", label: "Proprietà", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
    { href: "/proprietario/calendario/pulizie", label: "Pulizie", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
    { href: "/proprietario/calendario/prenotazioni", label: "Prenotazioni", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  ];

  // Voci aggiuntive nel menu dropdown (mobile) e sidebar (desktop)
  const extraMenuItems = [
    { href: "/proprietario/pagamenti", label: "Pagamenti", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
    { href: "/proprietario/notifiche", label: "Centro Messaggi", icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
    { href: "/guida", label: "Guida", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
    { href: "/proprietario/impostazioni", label: "Impostazioni", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  ];

  // Tutte le voci per la sidebar desktop
  const allMenuItems = [...navbarItems, ...extraMenuItems];

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (isMobile) {
    return (
      <ToastProvider>
        {userId && <ProprietarioRealtimeListener userId={userId} />}
        <PushNotificationInit />
        {userId && <PaymentWarningModal userId={userId} userName={userName} />}
        {/* Layout mobile: container fixed che copre tutto lo schermo */}
        <div className="fixed inset-0 bg-slate-50 flex flex-col z-0" style={{ overscrollBehavior: "none" }}>
          {/* Header SEMPRE visibile — fixed, non può scomparire */}
          <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="text-lg font-bold text-slate-800">CleaningApp</h1>
              <p className="text-xs text-slate-500">Area Proprietario</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AssistantHeaderButton
                id="ai-header-btn"
                onClick={() => { setIsAssistantOpen(v => !v); triggerAssistant(); }}
                isOpen={isAssistantOpen}
              />
              <NotificationBell isAdmin={false} />
            </div>
          </header>
          
          {/* Contenuto principale scrollabile */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overscroll-none"
            style={{ WebkitOverflowScrolling: "touch", paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
          >
            {effectiveChildren}
          </div>
          
          {/* Navbar fissa in basso — ZERO DELAY */}
          <nav id="proprietario-bottom-nav" className={`fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 z-50 transition-transform ${hideNav ? "translate-y-full" : ""}`} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', WebkitTapHighlightColor: 'transparent' }}>
            <div className="flex justify-around items-center py-1">
              {/* Solo le 4 voci principali nella navbar */}
              {navbarItems.map((item) => (
                <a key={item.href} href={item.href} data-nav-item onClick={(e) => handleNavClick(e, item.href)} style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }} className={`relative flex flex-col items-center py-1 px-2 rounded-xl ${isItemActive(item.href) ? "text-sky-600 bg-sky-50" : "text-slate-500"}`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                  <span className="text-xs mt-1">{item.label}</span>
                  {item.label === "Proprietà" && pendingSignCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">{pendingSignCount}</span>
                  )}
                </a>
              ))}
              {/* Pulsante Menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className={`flex flex-col items-center py-1 px-2 rounded-xl ${menuOpen || extraMenuItems.some(item => isItemActive(item.href)) ? "text-sky-600 bg-sky-50" : "text-slate-500"}`}
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  <span className="text-xs mt-1">Menu</span>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute bottom-full right-0 mb-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50">
                      {/* Info utente */}
                      <div className="p-3 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-sky-500 rounded-full flex items-center justify-center text-white font-bold">
                            {userName.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-800 truncate text-sm">{userName}</p>
                            <p className="text-xs text-slate-500 truncate">{userEmail}</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Voci menu aggiuntive */}
                      <div className="py-1">
                        {extraMenuItems.map((item) => (
                          <a
                            key={item.href}
                            href={item.href}
                            onClick={(e) => { setMenuOpen(false); handleNavClick(e, item.href); }}
                            className={`flex items-center gap-3 px-4 py-3 ${
                              isItemActive(item.href) 
                                ? "bg-sky-50 text-sky-600" 
                                : "text-slate-700 active:bg-slate-50"
                            }`}
                            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                            </svg>
                            <span className="font-medium">{item.label}</span>
                          </a>
                        ))}
                      </div>
                      
                      {/* Logout */}
                      <div className="border-t border-slate-100">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          <span className="font-medium">Esci</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </nav>
        </div>
        <AssistantWidget />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <PushNotificationInit />
      {userId && <ProprietarioRealtimeListener userId={userId} />}
      {userId && <PaymentWarningModal userId={userId} userName={userName} />}
      <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-white border-r border-slate-200 p-4 fixed h-full">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-800">CleaningApp</h1>
          <p className="text-sm text-slate-500">Area Proprietario</p>
        </div>
        <nav className="space-y-2">
          {/* Sidebar desktop con tutte le voci */}
          {allMenuItems.map((item) => (
            <a key={item.href} href={item.href} data-nav-item onClick={(e) => handleNavClick(e, item.href)} className={`relative flex items-center gap-3 px-4 py-3 rounded-xl ${isItemActive(item.href) ? "bg-sky-50 text-sky-600" : "text-slate-600 hover:bg-slate-50"}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              {item.label}
              {item.label === "Proprietà" && pendingSignCount > 0 && (
                <span className="ml-auto min-w-[20px] h-[20px] px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">{pendingSignCount}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-2">
            <div className="w-10 h-10 bg-sky-500 rounded-full flex items-center justify-center text-white font-bold">
              {userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800 truncate">{userName}</p>
              <p className="text-xs text-slate-500 truncate">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="font-medium">Esci</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-64">
        {/* Header con campanella */}
        <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-end gap-3">
          <AssistantHeaderButton
            id="ai-header-btn"
            onClick={() => { setIsAssistantOpen(v => !v); triggerAssistant(); }}
            isOpen={isAssistantOpen}
          />
          <NotificationBell isAdmin={false} />
        </div>
        {effectiveChildren}
      </main>
    </div>
    <AssistantWidget />
    </ToastProvider>
  );
}
