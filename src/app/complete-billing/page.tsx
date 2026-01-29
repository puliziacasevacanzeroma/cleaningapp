/**
 * Pagina Completamento Dati Fatturazione
 * 
 * Step 2 obbligatorio per i nuovi proprietari.
 * Dopo il completamento, l'utente passa a PENDING_APPROVAL.
 * 
 * URL: /complete-billing
 */

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { BillingInfoForm } from "~/components/billing";
import type { BillingFormData } from "~/types/billing";
import { 
  formDataToBillingInfo, 
  createEmptyBillingFormData,
} from "~/types/billing";

// Helper per aggiornare il cookie utente
function updateUserCookie(updates: Record<string, any>) {
  if (typeof window === "undefined") return;
  
  try {
    const stored = localStorage.getItem("user");
    if (stored) {
      const userData = JSON.parse(stored);
      const updatedUser = { ...userData, ...updates };
      
      localStorage.setItem("user", JSON.stringify(updatedUser));
      
      const expires = new Date();
      expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000);
      document.cookie = `firebase-user=${encodeURIComponent(JSON.stringify(updatedUser))}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
    }
  } catch (e) {
    console.error("Errore aggiornamento cookie:", e);
  }
}

export default function CompleteBillingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Form
  const [billingData, setBillingData] = useState<BillingFormData>(createEmptyBillingFormData());
  const [billingValid, setBillingValid] = useState(false);

  // Check se già completato
  useEffect(() => {
    async function checkBillingStatus() {
      if (!user?.id) return;
      
      try {
        setLoading(true);
        const userDoc = await getDoc(doc(db, "users", user.id));
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          
          // Se già completato, redirect
          if (data.billingCompleted === true) {
            if (data.status === "PENDING_APPROVAL") {
              router.push("/pending-approval");
            } else if (data.status === "ACTIVE") {
              router.push("/proprietario");
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
    
    if (user && !authLoading) {
      checkBillingStatus();
    }
  }, [user, authLoading, router]);

  // Handlers
  const handleBillingChange = (data: BillingFormData, isValid: boolean) => {
    setBillingData(data);
    setBillingValid(isValid);
  };

  const handleSubmit = async () => {
    if (!user?.id || !billingValid) return;
    
    try {
      setSubmitting(true);
      setError(null);
      
      const billingInfo = formDataToBillingInfo(billingData);
      
      // Aggiorna Firestore
      await updateDoc(doc(db, "users", user.id), {
        billingInfo,
        billingCompleted: true,
        status: "PENDING_APPROVAL", // Passa ad attesa approvazione
        billingCompletedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      // Invia notifica all'Admin per approvazione
      try {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "APPROVAL_REQUEST",
            title: "Utente Pronto per Approvazione",
            message: `${user.name || user.email} ha completato la registrazione e attende approvazione.`,
            recipientRole: "ADMIN",
            senderId: user.id,
            senderName: user.name || user.email || "Nuovo utente",
            senderEmail: user.email,
            relatedEntityId: user.id,
            relatedEntityType: "USER",
            relatedEntityName: user.name || user.email,
            actionRequired: true,
            link: `/dashboard/utenti/${user.id}`,
          }),
        });
        console.log("✅ Notifica approvazione inviata all'admin");
      } catch (notifError) {
        console.warn("⚠️ Errore invio notifica (non bloccante):", notifError);
      }
      
      // Aggiorna cookie
      updateUserCookie({ 
        billingCompleted: true,
        status: "PENDING_APPROVAL"
      });
      
      setSuccess(true);
      
      // Redirect alla pagina di attesa
      setTimeout(() => {
        router.push("/pending-approval");
      }, 2000);
      
    } catch (err) {
      console.error("Errore salvataggio:", err);
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500" />
      </div>
    );
  }

  // Non loggato
  if (!user) {
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
            I tuoi dati di fatturazione sono stati salvati.<br/>
            Il tuo account è ora in attesa di approvazione.
          </p>
          <div className="animate-pulse text-sky-500">Reindirizzamento...</div>
        </div>
      </div>
    );
  }

  // Form
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold">
              ✓
            </div>
            <span className="text-green-600 font-medium hidden sm:inline">Contratto</span>
          </div>
          <div className="w-12 h-1 bg-green-500 rounded"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center text-sm font-bold">
              2
            </div>
            <span className="text-sky-600 font-medium hidden sm:inline">Fatturazione</span>
          </div>
          <div className="w-12 h-1 bg-gray-300 rounded"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center text-sm font-bold">
              3
            </div>
            <span className="text-gray-400 font-medium hidden sm:inline">Approvazione</span>
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-100 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Dati di Fatturazione</h1>
          <p className="text-gray-500 mt-2">
            Ultimo passaggio! Inserisci i dati per la fatturazione.
          </p>
        </div>

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

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!billingValid || submitting}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all ${
            billingValid && !submitting
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 shadow-lg hover:shadow-xl'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Salvataggio...
            </span>
          ) : (
            "Completa Registrazione"
          )}
        </button>

        {!billingValid && (
          <p className="text-center text-sm text-amber-600 mt-3">
            Completa tutti i campi obbligatori per continuare
          </p>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Potrai modificare questi dati in qualsiasi momento dalle Impostazioni
        </p>
      </div>
    </div>
  );
}
