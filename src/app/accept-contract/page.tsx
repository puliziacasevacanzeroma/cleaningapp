/**
 * Pagina Accettazione Contratto/Regolamento
 * 
 * Step 1 obbligatorio per i nuovi proprietari.
 * Dopo la firma, l'utente passa a PENDING_BILLING.
 * 
 * URL: /accept-contract
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { SignaturePad } from "~/components/contract/SignaturePad";

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

// Validazione Codice Fiscale
function isValidFiscalCode(code: string): boolean {
  if (!code || code.length !== 16) return false;
  const pattern = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/i;
  return pattern.test(code);
}

function formatFiscalCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

interface RegulationDocument {
  id: string;
  title: string;
  version: string;
  content: string;
  hash?: string;
  type?: string;
}

interface AcceptanceConsents {
  readFully: boolean;
  acceptTerms: boolean;
  privacyConsent: boolean;
}

export default function AcceptContractPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Stati
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Documento
  const [document, setDocument] = useState<RegulationDocument | null>(null);
  
  // Scroll tracking
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  
  // Form data
  const [fullName, setFullName] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [consents, setConsents] = useState<AcceptanceConsents>({
    readFully: false,
    acceptTerms: false,
    privacyConsent: false,
  });

  // Carica documento
  useEffect(() => {
    async function loadDocument() {
      if (!user?.id) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // Verifica se ha già firmato
        const userDoc = await getDoc(doc(db, "users", user.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.contractAccepted === true) {
            // Già firmato, vai al prossimo step
            router.push("/complete-billing");
            return;
          }
          // Pre-popola nome se disponibile
          if (userData.name) {
            setFullName(userData.name);
          }
        }
        
        // Cerca documento attivo
        const docsQuery = query(
          collection(db, "regulationDocuments"),
          where("isActive", "==", true)
        );
        
        const snapshot = await getDocs(docsQuery);
        
        let foundDoc: RegulationDocument | null = null;
        const userRole = user.role?.toUpperCase() || "PROPRIETARIO";
        
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const applicableTo = data.applicableTo as string[] || [];
          
          if (data.isDraft) continue;
          
          if (applicableTo.includes(userRole) || applicableTo.includes("ALL")) {
            foundDoc = {
              id: docSnap.id,
              title: data.title,
              version: data.version,
              content: data.content,
              hash: data.hash,
              type: data.type,
            };
            break;
          }
        }
        
        setDocument(foundDoc);
        
      } catch (err) {
        console.error("Errore caricamento documento:", err);
        setError("Errore nel caricamento del documento");
      } finally {
        setLoading(false);
      }
    }
    
    if (user && !authLoading) {
      loadDocument();
    }
  }, [user, authLoading, router]);

  // Scroll handler
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 20) {
          setHasScrolledToBottom(true);
        }
      }
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener("scroll", handleScroll);
      return () => content.removeEventListener("scroll", handleScroll);
    }
  }, [document]);

  // Validazione
  function validateForm(): string[] {
    const errors: string[] = [];
    
    if (!hasScrolledToBottom) {
      errors.push("Devi scorrere fino in fondo al regolamento");
    }
    if (!consents.readFully) {
      errors.push("Devi dichiarare di aver letto integralmente il regolamento");
    }
    if (!consents.acceptTerms) {
      errors.push("Devi accettare i termini e le condizioni");
    }
    if (!consents.privacyConsent) {
      errors.push("Devi acconsentire al trattamento dei dati personali");
    }
    if (!fullName || fullName.trim().length < 3) {
      errors.push("Inserisci il tuo nome e cognome completo");
    }
    if (!fiscalCode) {
      errors.push("Inserisci il codice fiscale");
    } else if (!isValidFiscalCode(fiscalCode)) {
      errors.push("Il codice fiscale non è valido");
    }
    if (!signature) {
      errors.push("Devi inserire la tua firma digitale");
    }
    
    return errors;
  }

  // Handlers
  const handleConsentChange = (key: keyof AcceptanceConsents) => {
    if (!hasScrolledToBottom) {
      setError("Devi prima scorrere fino in fondo al regolamento");
      return;
    }
    setConsents(prev => ({ ...prev, [key]: !prev[key] }));
    setError(null);
  };

  const handleFiscalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = formatFiscalCode(e.target.value);
    if (value.length <= 16) setFiscalCode(value);
  };

  const handleSubmit = async () => {
    if (!user?.id || !document) return;
    
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setError("⚠️ Completa i seguenti campi:\n\n• " + validationErrors.join("\n• "));
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      
      // Crea record accettazione
      const acceptanceData = {
        userId: user.id,
        userRole: user.role || "PROPRIETARIO",
        userEmail: user.email || "",
        fullName: fullName.trim(),
        fiscalCode: fiscalCode.toUpperCase(),
        documentId: document.id,
        documentType: document.type || "regolamento",
        documentVersion: document.version,
        documentHash: document.hash || "",
        documentTitle: document.title,
        signatureImage: signature,
        signatureMethod: "drawn",
        consents,
        metadata: {
          ipAddress: "client",
          userAgent: navigator.userAgent,
          timestamp: Timestamp.now(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        status: "valid",
        createdAt: Timestamp.now(),
      };

      await addDoc(collection(db, "contractAcceptances"), acceptanceData);

      // Aggiorna utente - cambia status a PENDING_BILLING
      await updateDoc(doc(db, "users", user.id), {
        contractAccepted: true,
        status: "PENDING_BILLING",
        contractAcceptance: {
          accepted: true,
          version: document.version,
          acceptedAt: Timestamp.now(),
        },
        updatedAt: Timestamp.now(),
      });

      // Aggiorna cookie
      updateUserCookie({ 
        contractAccepted: true,
        status: "PENDING_BILLING"
      });

      setSuccess(true);
      
      // Redirect al prossimo step
      setTimeout(() => {
        router.push("/complete-billing");
      }, 2000);

    } catch (err) {
      console.error("Errore submit:", err);
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setSubmitting(false);
    }
  };

  // Render loading/auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Accesso richiesto</h1>
          <button onClick={() => router.push("/login")} className="w-full py-3 px-6 bg-sky-500 text-white font-semibold rounded-xl hover:bg-sky-600">
            Vai al Login
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500 mx-auto mb-4" />
          <p className="text-gray-600">Caricamento documento...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Regolamento Accettato!</h1>
          <p className="text-gray-600 mb-6">Ora completeremo i dati di fatturazione.</p>
          <div className="animate-pulse text-sky-500">Reindirizzamento...</div>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">📄</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Nessun documento</h1>
          <p className="text-gray-600 mb-6">Non ci sono regolamenti da accettare.</p>
          <button onClick={() => router.push("/complete-billing")} className="w-full py-3 px-6 bg-sky-500 text-white font-semibold rounded-xl hover:bg-sky-600">
            Continua
          </button>
        </div>
      </div>
    );
  }

  // Form principale
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        
        {/* Progress */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center text-sm font-bold">1</div>
            <span className="text-sky-600 font-medium hidden sm:inline">Contratto</span>
          </div>
          <div className="w-12 h-1 bg-gray-300 rounded"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center text-sm font-bold">2</div>
            <span className="text-gray-400 font-medium hidden sm:inline">Fatturazione</span>
          </div>
          <div className="w-12 h-1 bg-gray-300 rounded"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center text-sm font-bold">3</div>
            <span className="text-gray-400 font-medium hidden sm:inline">Approvazione</span>
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-100 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{document.title}</h1>
          <p className="text-gray-500 mt-1">Versione {document.version}</p>
        </div>

        {/* Contenuto documento */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-700">Contenuto del Regolamento</h2>
            {!hasScrolledToBottom ? (
              <p className="text-sm text-amber-600 mt-1 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                Scorri fino in fondo per abilitare l'accettazione
              </p>
            ) : (
              <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Regolamento letto - Puoi procedere
              </p>
            )}
          </div>
          <div ref={contentRef} className="h-96 overflow-y-auto px-6 py-4 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: document.content }} />
        </div>

        {/* Consensi */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Dichiarazioni e Consensi</h2>
          <div className="space-y-3">
            {[
              { key: "readFully" as const, label: "Dichiaro di aver letto <strong>integralmente</strong> il regolamento operativo" },
              { key: "acceptTerms" as const, label: "Accetto <strong>integralmente</strong> i termini e le condizioni del regolamento" },
              { key: "privacyConsent" as const, label: "Acconsento al <strong>trattamento dei dati personali</strong>" },
            ].map((item) => (
              <label key={item.key} className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${consents[item.key] ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'} ${!hasScrolledToBottom ? 'opacity-50' : ''}`}>
                <input type="checkbox" checked={consents[item.key]} onChange={() => handleConsentChange(item.key)} disabled={!hasScrolledToBottom} className="mt-1 w-5 h-5 rounded border-gray-300 text-green-500" />
                <span className="text-gray-700" dangerouslySetInnerHTML={{ __html: item.label }} />
              </label>
            ))}
          </div>
        </div>

        {/* Dati identificativi */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Dati Identificativi</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome e Cognome *</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Mario Rossi" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Codice Fiscale *</label>
              <input type="text" value={fiscalCode} onChange={handleFiscalCodeChange} placeholder="RSSMRA80A01H501U" maxLength={16} className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-sky-500 uppercase ${fiscalCode.length === 16 && !isValidFiscalCode(fiscalCode) ? 'border-red-500 bg-red-50' : 'border-gray-300'}`} />
              {fiscalCode.length > 0 && fiscalCode.length < 16 && <p className="text-gray-400 text-sm mt-1">{fiscalCode.length}/16</p>}
            </div>
          </div>
        </div>

        {/* Firma */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Firma Digitale *</h2>
          <SignaturePad onSignatureChange={setSignature} width={undefined} height={200} />
        </div>

        {/* Errore */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 text-sm whitespace-pre-line">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting} className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all ${submitting ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 shadow-lg hover:shadow-xl'}`}>
          {submitting ? "Elaborazione..." : "Accetta e Firma"}
        </button>
      </div>
    </div>
  );
}
