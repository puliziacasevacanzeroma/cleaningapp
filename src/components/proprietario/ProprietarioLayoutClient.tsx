"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ProprietarioLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}

export function ProprietarioLayoutClient({ children, userName, userEmail }: ProprietarioLayoutClientProps) {
  const pathname = usePathname();

  // TEST: SFONDO ROSSO PER VERIFICARE CHE IL DEPLOY FUNZIONI
  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#FF0000',
      padding: '20px'
    }}>
      <h1 style={{ color: 'white', fontSize: '32px', fontWeight: 'bold' }}>
        TEST DEPLOY - SE VEDI QUESTO ROSSO IL DEPLOY FUNZIONA!
      </h1>
      <p style={{ color: 'white', fontSize: '18px' }}>
        User: {userName} - Email: {userEmail}
      </p>
      <p style={{ color: 'yellow', fontSize: '24px', marginTop: '20px' }}>
        Path: {pathname}
      </p>
      <div style={{ marginTop: '20px', backgroundColor: 'white', padding: '20px', borderRadius: '8px' }}>
        {children}
      </div>
    </div>
  );
}
