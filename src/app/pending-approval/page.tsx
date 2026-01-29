/**
 * Pagina Attesa Approvazione
 * 
 * Mostrata quando l'utente ha completato tutti i passaggi
 * ma deve attendere l'approvazione dell'Admin.
 * 
 * URL: /pending-approval
 */

"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export default function PendingApprovalPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [checking, setChecking] = useState(true);

  // Ascolta cambiamenti dello status in real-time
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = onSnapshot(
      doc(db, "users", user.id),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          
          // Se approvato, aggiorna cookie e redirect
          if (data.status === "ACTIVE") {
            // Aggiorna cookie
            const updatedUser = {
              ...user,
              status: "ACTIVE",
              contractAccepted: true,
              billingCompleted: true,
            };
            
            localStorage.setItem("user", JSON.stringify(updatedUser));
            
            const expires = new Date();
            expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
            document.cookie = `firebase-user=${encodeURIComponent(JSON.stringify(updatedUser))}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
            
            // Redirect alla dashboard
            router.push("/proprietario");
          }
        }
        setChecking(false);
      },
      (error) => {
        console.error("Errore listener:", error);
        setChecking(false);
      }
    );

    return () => unsubscribe();
  }, [user?.id, router, user]);

  const handleLogout = async () => {
    // Rimuovi cookie
    document.cookie = "firebase-user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("user");
    
    if (logout) {
      await logout();
    }
    
    router.push("/login");
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          
          {/* Icona */}
          <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          {/* Titolo */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            In Attesa di Approvazione
          </h1>
          
          {/* Messaggio */}
          <p className="text-gray-600 mb-6">
            Grazie per aver completato la registrazione!<br/>
            Il tuo account è in fase di verifica.
          </p>

          {/* Riepilogo completati */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
            <h3 className="font-semibold text-gray-800 mb-3">Passaggi completati:</h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-3 text-green-700">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Registrazione account
              </li>
              <li className="flex items-center gap-3 text-green-700">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Firma contratto/regolamento
              </li>
              <li className="flex items-center gap-3 text-green-700">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Dati di fatturazione
              </li>
              <li className="flex items-center gap-3 text-amber-600">
                <svg className="w-5 h-5 text-amber-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Approvazione in corso...
              </li>
            </ul>
          </div>

          {/* Info */}
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-6">
            <p className="text-sky-800 text-sm">
              <strong>Cosa succede ora?</strong><br/>
              Un amministratore verificherà i tuoi dati e attiverà il tuo account. 
              Riceverai una notifica quando sarà pronto.
            </p>
          </div>

          {/* Tempo stimato */}
          <p className="text-gray-500 text-sm mb-6">
            ⏱️ Tempo stimato: <strong>1-2 giorni lavorativi</strong>
          </p>

          {/* Animazione attesa */}
          <div className="flex justify-center gap-1 mb-6">
            <div className="w-3 h-3 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-3 h-3 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-3 h-3 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>

          {/* Contatti */}
          <p className="text-gray-500 text-sm mb-6">
            Hai domande? Contattaci a <a href="mailto:info@cleaningapp.it" className="text-sky-600 hover:underline">info@cleaningapp.it</a>
          </p>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-700 text-sm font-medium"
          >
            Esci dall'account
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Questa pagina si aggiornerà automaticamente quando il tuo account sarà approvato
        </p>
      </div>
    </div>
  );
}
