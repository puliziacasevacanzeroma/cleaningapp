"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ProprietarioLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}

export function ProprietarioLayoutClient({ children, userName, userEmail }: ProprietarioLayoutClientProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  // Icone SVG inline
  const HomeIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );

  const CalendarIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );

  const BuildingIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );

  const ChartIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );

  const SettingsIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  const MenuIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );

  const CloseIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  const LogoutIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );

  const menuItems = [
    { href: "/proprietario", label: "Dashboard", icon: HomeIcon, exact: true },
    { href: "/proprietario/calendario", label: "Calendario", icon: CalendarIcon },
    { href: "/proprietario/proprieta", label: "Proprietà", icon: BuildingIcon },
    { href: "/proprietario/report", label: "Report", icon: ChartIcon },
    { href: "/proprietario/impostazioni", label: "Impostazioni", icon: SettingsIcon },
  ];

  return (
    <>
      {/* CSS con media query - funziona sempre */}
      <style>{`
        .mobile-layout { display: none; }
        .desktop-layout { display: block; }
        @media (max-width: 1023px) {
          .desktop-layout { display: none !important; }
          .mobile-layout { display: block !important; }
        }
      `}</style>

      <div className="min-h-screen bg-slate-50">
        {/* ==================== MOBILE LAYOUT ==================== */}
        <div className="mobile-layout">
          {/* Mobile Header */}
          <header style={{ position: 'fixed', top: 0, left: 0, right: 0, backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', zIndex: 50, height: '64px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%', padding: '0 16px' }}>
              <Link href="/proprietario" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                <div style={{ width: '32px', height: '32px', backgroundColor: '#2563eb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>CA</span>
                </div>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>CleaningApp</span>
              </Link>
              
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                style={{ padding: '8px', color: '#475569', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
              </button>
            </div>
          </header>

          {/* Mobile Menu Overlay */}
          {mobileMenuOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setMobileMenuOpen(false)}>
              <div 
                style={{ position: 'absolute', top: '64px', right: 0, width: '256px', backgroundColor: 'white', height: 'calc(100vh - 64px)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <nav style={{ padding: '16px' }}>
                  {menuItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '12px', 
                        padding: '12px 16px', 
                        borderRadius: '8px', 
                        marginBottom: '4px',
                        textDecoration: 'none',
                        backgroundColor: (item.exact ? pathname === item.href : isActive(item.href)) ? '#eff6ff' : 'transparent',
                        color: (item.exact ? pathname === item.href : isActive(item.href)) ? '#1d4ed8' : '#475569',
                        fontWeight: (item.exact ? pathname === item.href : isActive(item.href)) ? 500 : 400
                      }}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </nav>
                
                <div style={{ position: 'absolute', bottom: '80px', left: 0, right: 0, padding: '16px', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ width: '40px', height: '40px', backgroundColor: '#dbeafe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#1d4ed8', fontWeight: 500, fontSize: '14px' }}>{getInitials(userName)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</p>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</p>
                    </div>
                  </div>
                  <Link
                    href="/api/auth/signout"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', color: '#dc2626', borderRadius: '8px', textDecoration: 'none', width: '100%' }}
                  >
                    <LogoutIcon />
                    <span>Esci</span>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Main Content */}
          <main style={{ paddingTop: '64px', paddingBottom: '80px', minHeight: '100vh' }}>
            {children}
          </main>

          {/* Mobile Bottom Navigation */}
          <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'white', borderTop: '1px solid #e2e8f0', zIndex: 50 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', height: '64px' }}>
              {menuItems.slice(0, 5).map((item) => {
                const active = item.exact ? pathname === item.href : isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      padding: '8px 12px', 
                      fontSize: '12px',
                      textDecoration: 'none',
                      color: active ? '#2563eb' : '#64748b'
                    }}
                  >
                    <item.icon />
                    <span style={{ marginTop: '4px' }}>{item.label === "Impostazioni" ? "Altro" : item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

        {/* ==================== DESKTOP LAYOUT ==================== */}
        <div className="desktop-layout">
          {/* Desktop Sidebar */}
          <aside style={{ width: '288px', height: '100vh', backgroundColor: 'white', borderRight: '1px solid #e2e8f0', position: 'fixed', left: 0, top: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Logo */}
            <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0' }}>
              <Link href="/proprietario" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
                <div style={{ width: '40px', height: '40px', backgroundColor: '#2563eb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'white', fontWeight: 'bold' }}>CA</span>
                </div>
                <div>
                  <h1 style={{ fontWeight: 'bold', color: '#1e293b', margin: 0 }}>CleaningApp</h1>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Area Proprietario</p>
                </div>
              </Link>
            </div>

            {/* Navigation */}
            <nav style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
              {menuItems.map((item) => {
                const active = item.exact ? pathname === item.href : isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px', 
                      padding: '12px 16px', 
                      borderRadius: '8px',
                      marginBottom: '4px',
                      textDecoration: 'none',
                      backgroundColor: active ? '#eff6ff' : 'transparent',
                      color: active ? '#1d4ed8' : '#475569',
                      fontWeight: active ? 500 : 400
                    }}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User Profile */}
            <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ width: '40px', height: '40px', backgroundColor: '#dbeafe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#1d4ed8', fontWeight: 500 }}>{getInitials(userName)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</p>
                </div>
              </div>
              <Link
                href="/api/auth/signout"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', color: '#dc2626', borderRadius: '8px', textDecoration: 'none', width: '100%' }}
              >
                <LogoutIcon />
                <span>Esci</span>
              </Link>
            </div>
          </aside>

          {/* Desktop Main Content */}
          <main style={{ marginLeft: '288px', minHeight: '100vh' }}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
