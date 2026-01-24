/**
 * Pagina Accettazione Contratto/Regolamento
 * 
 * Questa pagina viene mostrata agli utenti che devono accettare
 * il regolamento operativo prima di poter usare l'applicazione.
 * 
 * URL: /accept-contract
 */

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { SignaturePad } from "~/components/contract/SignaturePad";
import type { 
  RegulationDocument, 
  AcceptanceConsents,
  AcceptContractRequest,
  AcceptContractResponse,
  CurrentDocumentResponse
} from "~/types/contract";
import { isValidFiscalCode, formatFiscalCode } from "~/types/contract";

// ==================== COMPONENTE PRINCIPALE ====================

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
  const [needsAcceptance, setNeedsAcceptance] = useState(true);
  
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
  
  // Geolocation
  const [geolocation, setGeolocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"pending" | "granted" | "denied" | "unavailable">("pending");
  
  // Device info
  const [deviceInfo, setDeviceInfo] = useState({
    userAgent: "",
    platform: "",
    timestamp: "",
  });

  // ==================== EFFECTS ====================
  
  // Carica il documento corrente
  useEffect(() => {
    async function loadDocument() {
      if (!user) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const token = await user.getIdToken();
        
        const response = await fetch("/api/contract/current", {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });
        
        const data: CurrentDocumentResponse = await response.json();
        
        if (!response.ok) {
          throw new Error(data.message || "Errore nel caricamento del documento");
        }
        
        setDocument(data.document);
        setNeedsAcceptance(data.needsAcceptance);
        
        // Se non serve accettazione, redirect
        if (!data.needsAcceptance && data.document) {
          router.push(getRedirectPath());
        }
        
      } catch (err) {
        console.error("Errore caricamento documento:", err);
        setError(err instanceof Error ? err.message : "Errore sconosciuto");
      } finally {
        setLoading(false);
      }
    }
    
    if (user && !authLoading) {
      loadDocument();
    }
  }, [user, authLoading, router]);

  // Richiedi geolocation
  useEffect(() => {
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeolocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
          setGeoStatus("granted");
        },
        (error) => {
          console.warn("Geolocation denied:", error.message);
          setGeoStatus("denied");
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      setGeoStatus("unavailable");
    }
  }, []);

  // Raccogli info dispositivo
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setDeviceInfo({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        timestamp: new Date().toLocaleString("it-IT"),
      });
    }
  }, []);

  // Traccia scroll del contenuto
  const handleScroll = useCallback(() => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      // Considera "in fondo" quando mancano meno di 50px
      if (scrollHeight - scrollTop - clientHeight < 50) {
        setHasScrolledToBottom(true);
      }
    }
  }, []);

  // ==================== HANDLERS ====================
  
  const handleConsentChange = (key: keyof AcceptanceConsents) => {
    setConsents(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleFiscalCodeChange = (value: string) => {
    // Formatta automaticamente in maiuscolo e rimuovi spazi
    setFiscalCode(formatFiscalCode(value));
  };

  const getRedirectPath = () => {
    // Redirect basato sul ruolo (da implementare con userData)
    return "/dashboard";
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !document) return;
    
    // Validazioni
    if (!hasScrolledToBottom) {
      setError("Devi scorrere e leggere tutto il documento prima di accettare");
      return;
    }
    
    if (!consents.readFully || !consents.acceptTerms || !consents.privacyConsent) {
      setError("Devi accettare tutti i consensi obbligatori");
      return;
    }
    
    if (!fullName || fullName.trim().length < 3) {
      setError("Inserisci il tuo nome e cognome completo");
      return;
    }
    
    if (!isValidFiscalCode(fiscalCode)) {
      setError("Codice fiscale non valido");
      return;
    }
    
    if (!signature) {
      setError("Devi apporre la tua firma");
      return;
    }
    
    try {
      setSubmitting(true);
      setError(null);
      
      const token = await user.getIdToken();
      
      const requestBody: AcceptContractRequest = {
        fullName: fullName.trim(),
        fiscalCode,
        signatureImage: signature,
        consents,
        geolocation: geolocation || undefined,
      };
      
      const response = await fetch("/api/contract/accept", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        body: JSON.stringify(requestBody),
      });
      
      const data: AcceptContractResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Errore durante l'accettazione");
      }
      
      setSuccess(true);
      
      // Redirect dopo 2 secondi
      setTimeout(() => {
        router.push(getRedirectPath());
      }, 2000);
      
    } catch (err) {
      console.error("Errore submit:", err);
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setSubmitting(false);
    }
  };

  // ==================== RENDER ====================
  
  // Loading auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500" />
      </div>
    );
  }
  
  // Non autenticato
  if (!user) {
    router.push("/login");
    return null;
  }
  
  // Loading documento
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500 mx-auto mb-4" />
          <p className="text-gray-600">Caricamento regolamento...</p>
        </div>
      </div>
    );
  }
  
  // Nessun documento
  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">📄</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Nessun documento da accettare
          </h1>
          <p className="text-gray-600 mb-6">
            Non ci sono regolamenti attivi per il tuo profilo.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors"
          >
            Vai alla Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  // Già accettato
  if (!needsAcceptance) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Regolamento già accettato
          </h1>
          <p className="text-gray-600 mb-6">
            Hai già accettato la versione corrente del regolamento.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors"
          >
            Vai alla Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  // Success
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-xl font-bold text-green-600 mb-2">
            Regolamento accettato!
          </h1>
          <p className="text-gray-600 mb-2">
            Grazie per aver accettato il regolamento operativo.
          </p>
          <p className="text-sm text-gray-500">
            Reindirizzamento in corso...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-100 rounded-full mb-4">
            <svg className="w-8 h-8 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {document.title}
          </h1>
          <p className="text-gray-600 mt-1">
            Versione {document.version}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Box contenuto documento */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-900">
                📜 Contenuto del Regolamento
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {!hasScrolledToBottom 
                  ? "⚠️ Scorri fino in fondo per abilitare l'accettazione" 
                  : "✓ Documento letto completamente"}
              </p>
            </div>
            
            <div 
              ref={contentRef}
              onScroll={handleScroll}
              className="h-96 overflow-y-auto p-6 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: document.content }}
            />
            
            {/* Scroll indicator */}
            {!hasScrolledToBottom && (
              <div className="bg-amber-50 border-t border-amber-200 px-6 py-3 text-center">
                <p className="text-sm text-amber-700 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  Scorri verso il basso per continuare
                </p>
              </div>
            )}
          </div>

          {/* Checkbox consensi */}
          <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 mb-4">
              ✅ Dichiarazioni e Consensi
            </h2>
            
            <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
              consents.readFully ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200"
            } ${!hasScrolledToBottom ? "opacity-50 cursor-not-allowed" : ""}`}>
              <input
                type="checkbox"
                checked={consents.readFully}
                onChange={() => handleConsentChange("readFully")}
                disabled={!hasScrolledToBottom}
                className="mt-1 h-4 w-4 text-sky-600 rounded"
              />
              <span className="text-sm text-gray-700">
                <strong>Dichiaro di aver letto integralmente</strong> il regolamento operativo sopra riportato
              </span>
            </label>
            
            <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
              consents.acceptTerms ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200"
            } ${!hasScrolledToBottom ? "opacity-50 cursor-not-allowed" : ""}`}>
              <input
                type="checkbox"
                checked={consents.acceptTerms}
                onChange={() => handleConsentChange("acceptTerms")}
                disabled={!hasScrolledToBottom}
                className="mt-1 h-4 w-4 text-sky-600 rounded"
              />
              <span className="text-sm text-gray-700">
                <strong>Accetto integralmente</strong> i termini e le condizioni del regolamento
              </span>
            </label>
            
            <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
              consents.privacyConsent ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200"
            } ${!hasScrolledToBottom ? "opacity-50 cursor-not-allowed" : ""}`}>
              <input
                type="checkbox"
                checked={consents.privacyConsent}
                onChange={() => handleConsentChange("privacyConsent")}
                disabled={!hasScrolledToBottom}
                className="mt-1 h-4 w-4 text-sky-600 rounded"
              />
              <span className="text-sm text-gray-700">
                <strong>Acconsento al trattamento</strong> dei miei dati personali come descritto nell'informativa privacy
              </span>
            </label>
          </div>

          {/* Dati identificativi */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="font-semibold text-gray-900 mb-4">
              👤 Dati Identificativi
            </h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome e Cognome *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Mario Rossi"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Codice Fiscale *
                </label>
                <input
                  type="text"
                  value={fiscalCode}
                  onChange={(e) => handleFiscalCodeChange(e.target.value)}
                  placeholder="RSSMRA80A01H501U"
                  maxLength={16}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 uppercase ${
                    fiscalCode && !isValidFiscalCode(fiscalCode) 
                      ? "border-red-300 bg-red-50" 
                      : "border-gray-300"
                  }`}
                  required
                />
                {fiscalCode && !isValidFiscalCode(fiscalCode) && (
                  <p className="text-xs text-red-500 mt-1">Formato codice fiscale non valido</p>
                )}
              </div>
            </div>
          </div>

          {/* Firma */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="font-semibold text-gray-900 mb-4">
              ✍️ Firma Digitale
            </h2>
            
            <SignaturePad
              onSignatureChange={setSignature}
              height={180}
              placeholder="Apponi qui la tua firma"
            />
          </div>

          {/* Info registrate */}
          <div className="bg-gray-100 rounded-xl p-6">
            <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Informazioni che verranno registrate
            </h3>
            
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-lg">📍</span>
                <span>
                  Posizione: {
                    geoStatus === "granted" 
                      ? `${geolocation?.latitude.toFixed(4)}, ${geolocation?.longitude.toFixed(4)}` 
                      : geoStatus === "pending" 
                        ? "In attesa..." 
                        : "Non disponibile"
                  }
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-lg">🕐</span>
                <span>Data e ora: {deviceInfo.timestamp || new Date().toLocaleString("it-IT")}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-lg">💻</span>
                <span>Dispositivo: {deviceInfo.platform || "Sconosciuto"}</span>
              </div>
              
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-lg">🌐</span>
                <span>Browser: {deviceInfo.userAgent?.split(" ").slice(-1)[0] || "Sconosciuto"}</span>
              </div>
            </div>
          </div>

          {/* Errore */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={
              submitting || 
              !hasScrolledToBottom || 
              !consents.readFully || 
              !consents.acceptTerms || 
              !consents.privacyConsent ||
              !fullName ||
              !isValidFiscalCode(fiscalCode) ||
              !signature
            }
            className={`
              w-full py-4 px-6 rounded-xl font-semibold text-lg
              flex items-center justify-center gap-2
              transition-all
              ${submitting || !hasScrolledToBottom || !consents.readFully || !consents.acceptTerms || !consents.privacyConsent || !fullName || !isValidFiscalCode(fiscalCode) || !signature
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-sky-500 text-white hover:bg-sky-600 shadow-lg hover:shadow-xl"
              }
            `}
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white" />
                Invio in corso...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Accetta e Firma
              </>
            )}
          </button>
          
          <p className="text-center text-xs text-gray-500">
            Cliccando "Accetta e Firma" confermi di aver letto e accettato il regolamento.
            La tua firma digitale ha valore legale.
          </p>
          
        </form>
      </div>
    </div>
  );
}
