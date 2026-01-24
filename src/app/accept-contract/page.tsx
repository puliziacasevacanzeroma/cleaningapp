/**
 * Pagina Accettazione Contratto/Regolamento
 * 
 * Questa pagina viene mostrata agli utenti che devono accettare
 * il regolamento operativo prima di poter usare l'applicazione.
 * 
 * URL: /accept-contract
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { SignaturePad } from "~/components/contract/SignaturePad";
import type { 
  RegulationDocument, 
  AcceptanceConsents,
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

  // ==================== HELPER ====================
  
  function getRedirectPath(): string {
    if (!user) return "/login";
    const role = user.role?.toUpperCase();
    if (role === "ADMIN") return "/dashboard";
    if (role === "PROPRIETARIO" || role === "OWNER") return "/proprietario";
    if (role === "OPERATORE_PULIZIE" || role === "OPERATORE") return "/operatore";
    if (role === "RIDER") return "/rider";
    return "/dashboard";
  }

  // ==================== VALIDAZIONE ====================

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
      errors.push("Inserisci il tuo nome e cognome completo (minimo 3 caratteri)");
    }
    
    if (!fiscalCode) {
      errors.push("Inserisci il codice fiscale");
    } else if (!isValidFiscalCode(fiscalCode)) {
      errors.push("Il codice fiscale non è valido (deve essere di 16 caratteri nel formato italiano)");
    }
    
    if (!signature) {
      errors.push("Devi inserire la tua firma digitale");
    }
    
    return errors;
  }

  // ==================== EFFECTS ====================
  
  // Carica il documento corrente
  useEffect(() => {
    async function loadDocument() {
      if (!user?.id) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // Usa l'ID utente direttamente nell'header
        const response = await fetch("/api/contract/current", {
          headers: {
            "X-User-Id": user.id,
            "X-User-Role": user.role || "",
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

  // ==================== HANDLERS ====================

  const handleConsentChange = (key: keyof AcceptanceConsents) => {
    if (!hasScrolledToBottom) {
      setError("Devi prima scorrere fino in fondo al regolamento per abilitare i consensi");
      return;
    }
    setConsents(prev => ({ ...prev, [key]: !prev[key] }));
    setError(null);
  };

  const handleFiscalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = formatFiscalCode(e.target.value);
    if (value.length <= 16) {
      setFiscalCode(value);
    }
  };

  const handleSubmit = async () => {
    if (!user?.id || !document) return;
    
    // Validazione con messaggi specifici
    const validationErrors = validateForm();
    
    if (validationErrors.length > 0) {
      setError("⚠️ Completa i seguenti campi:\n\n• " + validationErrors.join("\n• "));
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      
      const response = await fetch("/api/contract/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.id,
          "X-User-Role": user.role || "",
          "X-User-Email": user.email || "",
          "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          fiscalCode: fiscalCode.toUpperCase(),
          signatureImage: signature,
          consents,
          geolocation,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Errore durante l'accettazione");
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
            className="w-full py-3 px-6 bg-sky-500 text-white font-semibold rounded-xl hover:bg-sky-600 transition-colors"
          >
            Vai al Login
          </button>
        </div>
      </div>
    );
  }

  // Loading documento
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Regolamento Accettato!</h1>
          <p className="text-gray-600 mb-6">Grazie per aver accettato il regolamento. Verrai reindirizzato...</p>
          <div className="animate-pulse text-sky-500">Reindirizzamento in corso...</div>
        </div>
      </div>
    );
  }

  // Nessun documento
  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">📄</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Nessun documento da accettare</h1>
          <p className="text-gray-600 mb-6">Non ci sono regolamenti attivi per il tuo profilo.</p>
          <button
            onClick={() => router.push(getRedirectPath())}
            className="w-full py-3 px-6 bg-sky-500 text-white font-semibold rounded-xl hover:bg-sky-600 transition-colors"
          >
            Vai alla Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Form accettazione
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        
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
            {!hasScrolledToBottom && (
              <p className="text-sm text-amber-600 mt-1 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                Scorri fino in fondo per abilitare l'accettazione
              </p>
            )}
            {hasScrolledToBottom && (
              <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Regolamento letto - Puoi procedere con l'accettazione
              </p>
            )}
          </div>
          <div 
            ref={contentRef}
            className="h-96 overflow-y-auto px-6 py-4 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: document.content }}
          />
        </div>

        {/* Consensi */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Dichiarazioni e Consensi</h2>
          
          <div className="space-y-3">
            <label className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
              consents.readFully ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            } ${!hasScrolledToBottom ? 'opacity-50' : ''}`}
            onClick={() => !hasScrolledToBottom && setError("Devi prima scorrere fino in fondo al regolamento")}>
              <input
                type="checkbox"
                checked={consents.readFully}
                onChange={() => handleConsentChange("readFully")}
                disabled={!hasScrolledToBottom}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-green-500 focus:ring-green-500"
              />
              <span className="text-gray-700">
                Dichiaro di aver letto <strong>integralmente</strong> il regolamento operativo
              </span>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
              consents.acceptTerms ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            } ${!hasScrolledToBottom ? 'opacity-50' : ''}`}
            onClick={() => !hasScrolledToBottom && setError("Devi prima scorrere fino in fondo al regolamento")}>
              <input
                type="checkbox"
                checked={consents.acceptTerms}
                onChange={() => handleConsentChange("acceptTerms")}
                disabled={!hasScrolledToBottom}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-green-500 focus:ring-green-500"
              />
              <span className="text-gray-700">
                Accetto <strong>integralmente</strong> i termini e le condizioni del regolamento
              </span>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
              consents.privacyConsent ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            } ${!hasScrolledToBottom ? 'opacity-50' : ''}`}
            onClick={() => !hasScrolledToBottom && setError("Devi prima scorrere fino in fondo al regolamento")}>
              <input
                type="checkbox"
                checked={consents.privacyConsent}
                onChange={() => handleConsentChange("privacyConsent")}
                disabled={!hasScrolledToBottom}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-green-500 focus:ring-green-500"
              />
              <span className="text-gray-700">
                Acconsento al <strong>trattamento dei dati personali</strong> come descritto nel regolamento
              </span>
            </label>
          </div>
        </div>

        {/* Dati identificativi */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Dati Identificativi</h2>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome e Cognome *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Mario Rossi"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Codice Fiscale *
              </label>
              <input
                type="text"
                value={fiscalCode}
                onChange={handleFiscalCodeChange}
                placeholder="RSSMRA80A01H501U"
                maxLength={16}
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 uppercase ${
                  fiscalCode.length === 16 && !isValidFiscalCode(fiscalCode) 
                    ? 'border-red-500 bg-red-50' 
                    : 'border-gray-300'
                }`}
              />
              {fiscalCode.length === 16 && !isValidFiscalCode(fiscalCode) && (
                <p className="text-red-500 text-sm mt-1">Formato codice fiscale non valido</p>
              )}
              {fiscalCode.length > 0 && fiscalCode.length < 16 && (
                <p className="text-gray-400 text-sm mt-1">{fiscalCode.length}/16 caratteri</p>
              )}
            </div>
          </div>
        </div>

        {/* Firma */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Firma Digitale *</h2>
          <SignaturePad
            onSignatureChange={setSignature}
            width={undefined}
            height={200}
          />
        </div>

        {/* Info registrate */}
        <div className="bg-gray-50 rounded-2xl mb-6 p-6">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Informazioni che verranno registrate
          </h2>
          <div className="grid gap-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${geoStatus === 'granted' ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span>Posizione: {geoStatus === 'granted' ? `${geolocation?.latitude.toFixed(4)}, ${geolocation?.longitude.toFixed(4)}` : 'Non disponibile'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>Data e ora: {deviceInfo.timestamp || new Date().toLocaleString("it-IT")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>Piattaforma: {deviceInfo.platform || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Errore */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-700 text-sm whitespace-pre-line">{error}</p>
            </div>
          </div>
        )}

        {/* Submit - SEMPRE ATTIVO */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all ${
            submitting
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 shadow-lg hover:shadow-xl'
          }`}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Elaborazione...
            </span>
          ) : (
            "Accetta e Firma"
          )}
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          Cliccando su "Accetta e Firma" confermi di aver letto e accettato il regolamento
        </p>
      </div>
    </div>
  );
}
