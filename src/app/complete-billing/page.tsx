/**
 * Pagina Completamento Dati Fatturazione
 * 
 * Step 1 obbligatorio per i nuovi proprietari.
 * Dopo il completamento, l'utente passa a PENDING_CONTRACT (step 2: firma contratto).
 * 
 * URL: /complete-billing
 */

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { BillingInfoForm } from "~/components/billing";
import type { BillingFormData } from "~/types/billing";
import { 
  formDataToBillingInfo, 
  createEmptyBillingFormData,
} from "~/types/billing";

// 🔥 Helper per leggere utente da localStorage/cookie (fallback)
function getUserFromStorage(): any {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("user");
    if (stored) return JSON.parse(stored);
    
    // Il cookie auth-token è HttpOnly (non leggibile da JS)
    // Usiamo solo localStorage come fonte dati per l'UI
  } catch {}
  return null;
}

// Aggiorna sessione in modo sicuro (chiama il server per rinnovare il JWT)
async function updateUserSession(updates: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem("user");
    if (stored) {
      const userData = JSON.parse(stored);
      const updatedUser = { ...userData, ...updates };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedUser),
      });
    }
  } catch (e) {
    console.error("Errore aggiornamento sessione:", e);
  }
}

export default function CompleteBillingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // 🔥 FIX HYDRATION: mounted=false durante SSR, true solo dopo mount lato client
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Form
  const [billingData, setBillingData] = useState<BillingFormData>(() => {
    const base = createEmptyBillingFormData();
    // Pre-popola nome/cognome dal nome utente se disponibile
    const effectiveU = user || getUserFromStorage();
    if (effectiveU?.name) {
      const parts = effectiveU.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        base.firstName = parts[0];
        base.lastName = parts.slice(1).join(" ");
      }
    }
    return base;
  });
  const [billingValid, setBillingValid] = useState(false);

  // Check se già completato
  useEffect(() => {
    async function checkBillingStatus() {
      // 🔥 FIX: Usa sia user da AuthContext che da localStorage
      const effectiveUser = user || getUserFromStorage();
      if (!effectiveUser?.id) return;
      
      try {
        setLoading(true);
        const userDoc = await getDoc(doc(db, "users", effectiveUser.id));
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          
          // Se già completato, redirect
          if (data.billingCompleted === true) {
            if (data.contractAccepted !== true) {
              // Billing done, contract not yet → go to contract
              window.location.href = "/accept-contract";
            } else if (data.status === "ACTIVE") {
              window.location.href = "/proprietario";
            } else {
              // Billing done + contract done + qualsiasi altro status (PENDING_APPROVAL, PENDING_CONTRACT, etc.)
              window.location.href = "/pending-approval";
            }
            return;
          }
        }
      } catch (err) {
        console.error("Errore check billing:", err);
      } finally {
        setLoading(false);
      }
    }
    
    // 🔥 FIX: Esegui anche se user è null ma c'è in localStorage
    const effectiveUser = user || getUserFromStorage();
    if (effectiveUser && !authLoading) {
      checkBillingStatus();
    }
  }, [user, authLoading, router]);

  // Handlers
  const handleBillingChange = (data: BillingFormData, isValid: boolean) => {
    setBillingData(data);
    setBillingValid(isValid);
  };

  const handleSubmit = async () => {
    // 🔥 FIX: Usa anche localStorage come fallback
    const effectiveUser = user || getUserFromStorage();
    if (!effectiveUser?.id || !billingValid) return;
    
    try {
      setSubmitting(true);
      setError(null);
      
      const billingInfo = formDataToBillingInfo(billingData);
      
      // 🔥 FIX: Usa endpoint server-side che gestisce TUTTO atomicamente
      // (update utente + notifica admin con Admin SDK — non può fallire silenziosamente)
      const res = await fetch("/api/auth/complete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingInfo }),
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Errore durante il salvataggio");
      }
      
      // Determina prossimo step: se il contratto è già firmato (vecchio flusso),
      // vai direttamente a pending-approval
      const alreadySignedContract = effectiveUser.contractAccepted === true;
      const nextStatus = alreadySignedContract ? "PENDING_APPROVAL" : "PENDING_CONTRACT";
      const nextPage = alreadySignedContract ? "/pending-approval" : "/accept-contract";
      
      // Aggiorna cookie
      await updateUserSession({ 
        billingCompleted: true,
        status: nextStatus
      });
      
      setSuccess(true);
      
      setTimeout(() => {
        window.location.href = nextPage;
      }, 2000);
      
    } catch (err) {
      console.error("Errore salvataggio:", err);
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  // 🔥 FIX HYDRATION: non legge localStorage durante SSR, aspetta mount client
  const storedUser = mounted ? getUserFromStorage() : null;
  const effectiveUser = user || storedUser;

  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500" />
      </div>
    );
  }

  // Non loggato
  if (!effectiveUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Accesso richiesto</h1>
          <p className="text-gray-600 mb-6">Devi effettuare l'accesso per visualizzare questa pagina.</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full py-3 px-6 bg-sky-500 text-white font-semibold rounded-xl hover:bg-sky-600"
          >
            Vai al Login
          </button>
        </div>
      </div>
    );
  }

  // Loading check
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500 mx-auto mb-4" />
          <p className="text-gray-600">Verifica dati...</p>
        </div>
      </div>
    );
  }

  // Successo
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Dati Salvati!</h1>
          <p className="text-gray-600 mb-6">
            I tuoi dati di fatturazione sono stati salvati.
          </p>
          <div className="animate-pulse text-sky-500">Reindirizzamento...</div>
        </div>
      </div>
    );
  }

  // Form
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-50">
      <div className="w-full">
        
        {/* Banner */}
        <div className="mb-6" style={{ background: 'linear-gradient(135deg, #0f2a4a 0%, #1a3c5e 50%, #1e4976 100%)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }}></div>
          <div style={{ position: 'absolute', bottom: '-20px', left: '30%', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }}></div>
          <div className="flex items-center justify-between px-5 py-4" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }}>
                <svg className="w-[18px] h-[18px]" fill="none" stroke="white" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-white text-base font-bold">Dati di Fatturazione</h1>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>Step 1 di 3 — Inserisci i dati fiscali</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[10px] font-bold" style={{ color: '#1a3c5e' }}>1</div>
              <div className="w-3 h-[2px] rounded-sm" style={{ background: 'rgba(255,255,255,0.2)' }}></div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>2</div>
              <div className="w-3 h-[2px] rounded-sm" style={{ background: 'rgba(255,255,255,0.2)' }}></div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>3</div>
            </div>
          </div>
          <div className="px-5 pb-3" style={{ position: 'relative', zIndex: 1 }}>
            <div className="h-[3px] rounded-sm" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full rounded-sm" style={{ width: '33%', background: 'rgba(255,255,255,0.7)' }}></div>
            </div>
          </div>
        </div>

      <div className="max-w-3xl mx-auto px-4">

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <BillingInfoForm
            initialData={billingData}
            onChange={handleBillingChange}
          />
        </div>

        {/* Errore */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <button
          onClick={handleSubmit}
          disabled={!billingValid || submitting}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all mb-3 ${
            billingValid && !submitting
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 shadow-lg hover:shadow-xl'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {submitting ? "Salvataggio..." : "Continua → Firma Contratto"}
        </button>

        {!billingValid && (
          <p className="text-center text-sm text-amber-600 mt-3">
            Completa tutti i campi obbligatori per continuare
          </p>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Potrai modificare questi dati in qualsiasi momento dalle Impostazioni
        </p>

        {/* Banner progressi salvati + Logout */}
        <div className="mt-8 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            I tuoi progressi sono salvati
          </p>
          <button
            onClick={async () => {
              const { getAuth, signOut } = await import("firebase/auth");
              await signOut(getAuth());
              localStorage.clear();
              document.cookie.split(";").forEach(c => { document.cookie = c.trim().split("=")[0] + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/"; });
              window.location.href = "/login";
            }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Esci
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
