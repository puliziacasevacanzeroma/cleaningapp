/**
 * PropertyContractModal
 * 
 * Modal per la firma dell'Allegato D - Scheda Servizio Proprietà
 * Mostrata al proprietario quando l'admin approva una proprietà con prezzo.
 * 
 * Flusso:
 * 1. Admin approva proprietà → status PENDING_SIGNATURE
 * 2. Proprietario vede banner "Firma richiesta" nella lista proprietà
 * 3. Click → apre questa modal con Allegato D precompilato
 * 4. Proprietario scorre, accetta, firma → status ACTIVE
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import { doc, getDoc, updateDoc, addDoc, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { SignaturePad } from "~/components/contract/SignaturePad";
import { precompileAllegatoD } from "~/lib/contractPrecompiler";
import { validateFiscalCodeMatchFullName } from "~/types/billing";

// Validazione CF
function isValidFiscalCode(code: string): boolean {
  if (!code || code.length !== 16) return false;
  return /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/i.test(code);
}

function formatFiscalCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

interface PropertyContractModalProps {
  isOpen: boolean;
  property: {
    id: string;
    name: string;
    address?: string;
    city?: string;
    postalCode?: string;
    floor?: string;
    apartment?: string;
    intercom?: string;
    doorCode?: string;
    cleaningPrice?: number;
    maxGuests?: number;
    bedrooms?: number;
    bathrooms?: number;
    ownerId?: string;
    ownerName?: string;
    ownerEmail?: string;
    createdAt?: any;
    serviceConfigs?: Record<number, any>;
    bedConfiguration?: any[];
    bedsConfig?: any[];
    usesOwnLinen?: boolean;
    linenConfig?: any[];
  } | null;
  user: {
    id: string;
    name?: string;
    email?: string;
    role?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export function PropertyContractModal({ isOpen, property, user, onClose, onSuccess }: PropertyContractModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // State
  const [step, setStep] = useState<"view" | "sign">("view");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractHtml, setContractHtml] = useState<string>("");
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  // Form
  const [fullName, setFullName] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  // Tipo fatturazione (persona_fisica o azienda)
  const [billingType, setBillingType] = useState<"persona_fisica" | "azienda">("persona_fisica");
  const [vatNumber, setVatNumber] = useState(""); // Partita IVA per aziende
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureActive, setSignatureActive] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrice, setAcceptPrice] = useState(false);

  // Reset when opening
  useEffect(() => {
    if (isOpen && property) {
      setStep("view");
      setLoading(true);
      setError(null);
      setHasScrolledToBottom(false);
      setFullName(user?.name || "");
      setFiscalCode("");
      setVatNumber("");
      setBillingType("persona_fisica");
      setSignature(null);
      setSignatureActive(false);
      setAcceptTerms(false);
      setAcceptPrice(false);
      loadContract();
    }
  }, [isOpen, property?.id]);

  // Scroll handler
  useEffect(() => {
    if (step !== "view") return;
    
    const handleScroll = () => {
      if (contentRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 20) {
          setHasScrolledToBottom(true);
        }
      }
    };

    const checkIfScrollNeeded = () => {
      if (contentRef.current) {
        const { scrollHeight, clientHeight } = contentRef.current;
        if (scrollHeight <= clientHeight + 20) {
          setHasScrolledToBottom(true);
        }
      }
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener("scroll", handleScroll);
      setTimeout(checkIfScrollNeeded, 300);
      return () => content.removeEventListener("scroll", handleScroll);
    }
  }, [step, contractHtml]);

  async function loadContract() {
    try {
      // Carica il template Allegato D da regulationDocuments
      const docsQuery = query(
        collection(db, "regulationDocuments"),
        where("type", "==", "allegato_d_template"),
        where("isActive", "==", true)
      );
      const snapshot = await getDocs(docsQuery);

      if (snapshot.empty) {
        setError("Template Allegato D non trovato. Contatta l'amministratore.");
        setLoading(false);
        return;
      }

      const templateDoc = snapshot.docs[0];
      let html = (templateDoc.data() as Record<string, any>).content || "";

      // Carica dati completi dell'utente (incluso billingInfo)
      if (property && user) {
        let userDocSnap = await getDoc(doc(db, "users", user.id));
        // 🔥 FIX: se user.id è vecchio formato (user_XXX), cerca per email
        if (!userDocSnap.exists() && user.email) {
          const { collection: col, query: q, where: wh, getDocs: gd } = await import("firebase/firestore");
          const emailQ = q(col(db, "users"), wh("email", "==", user.email));
          const emailSnap = await gd(emailQ);
          if (!emailSnap.empty) userDocSnap = emailSnap.docs[0] as any;
        }
        const fullUserData = userDocSnap.exists() ? userDocSnap.data() : {};

        // Helper per convertire Firestore Timestamp in data leggibile
        const formatDate = (val: any): string => {
          if (!val) return "";
          if (val.toDate) return val.toDate().toLocaleDateString("it-IT");
          if (val.seconds) return new Date(val.seconds * 1000).toLocaleDateString("it-IT");
          if (typeof val === "string" && val) return val;
          return "";
        };

        html = precompileAllegatoD(
          html,
          {
            id: user.id,
            name: fullUserData.name || user.name || "",
            email: fullUserData.email || user.email || "",
            phone: fullUserData.phone || fullUserData.telefono || "",
            role: user.role,
            billingInfo: fullUserData.billingInfo,
          },
          {
            id: property.id,
            name: property.name,
            address: property.address,
            city: (property as any).city || "",
            postalCode: (property as any).postalCode || "",
            floor: (property as any).floor || "",
            apartment: (property as any).apartment || "",
            intercom: (property as any).intercom || "",
            doorCode: (property as any).doorCode || "",
            maxGuests: property.maxGuests,
            bedrooms: property.bedrooms,
            bathrooms: property.bathrooms,
            cleaningPrice: property.cleaningPrice,
            createdAt: formatDate((property as any).createdAt),
            approvedAt: formatDate((property as any).approvedAt || (property as any).updatedAt),
            bedsConfig: (property as any).bedsConfig || (property as any).bedConfiguration || [],
            linenConfig: (property as any).linenConfig || [],
            usesOwnLinen: (property as any).usesOwnLinen || false,
            ownerName: property.ownerName,
            ownerEmail: property.ownerEmail,
          }
        );
        
        // Pre-popola nome e CF dai dati di fatturazione
        if (fullUserData.billingInfo) {
          const bi = fullUserData.billingInfo;
          if (bi.type === "azienda") {
            setBillingType("azienda");
            // Azienda: ragione sociale + partita IVA
            const companyName = bi.companyName || fullUserData.name || user?.name || "";
            const piva = bi.vatNumber || "";
            if (companyName) setFullName(companyName);
            if (piva) setVatNumber(piva.toUpperCase());
            // CF opzionale per azienda (può essere vuoto)
            if (bi.fiscalCode || bi.companyFiscalCode) setFiscalCode((bi.fiscalCode || bi.companyFiscalCode || "").toUpperCase());
          } else {
            setBillingType("persona_fisica");
            // Persona fisica: nome+cognome + CF
            const name = bi.firstName && bi.lastName 
              ? (bi.firstName + " " + bi.lastName) 
              : (fullUserData.name || user?.name || "");
            const cf = bi.fiscalCode || "";
            if (name) setFullName(name);
            if (cf) setFiscalCode(cf.toUpperCase());
          }
        }
      }

      setContractHtml(html);
    } catch (err) {
      console.error("Errore caricamento contratto:", err);
      setError("Errore nel caricamento del documento.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!property || !user) return;

    // Validate
    const errors: string[] = [];
    if (!acceptTerms) errors.push("Devi accettare i termini e le condizioni");
    if (!acceptPrice) errors.push("Devi accettare il prezzo di pulizia");
    if (!fullName || fullName.trim().length < 2) errors.push(billingType === "azienda" ? "Inserisci la ragione sociale" : "Inserisci nome e cognome");
    if (billingType === "azienda") {
      // P.IVA: 11 cifre numeriche (con o senza prefisso IT)
      const rawVat = vatNumber.replace(/\s/g, "").replace(/^IT/i, "");
      if (!vatNumber || rawVat.length !== 11 || !/^\d{11}$/.test(rawVat)) {
        errors.push("Partita IVA non valida — deve essere 11 cifre numeriche (es. 12345678901 o IT12345678901)");
      }
    } else {
      if (!fiscalCode || !isValidFiscalCode(fiscalCode)) errors.push("Codice fiscale non valido");
      else if (fullName && fullName.trim().split(/\s+/).length >= 2 && !validateFiscalCodeMatchFullName(fullName.trim(), fiscalCode)) errors.push("Il codice fiscale non corrisponde al nome e cognome inseriti");
    }
    if (!signature) errors.push("Inserisci la firma digitale");

    if (errors.length > 0) {
      setError("⚠️ " + errors.join("\n• "));
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Raccogli IP reale
      let clientIp = "unknown";
      try {
        const ipRes = await fetch("/api/client-ip");
        const ipData = await ipRes.json();
        clientIp = ipData.ip || "unknown";
      } catch { clientIp = "unknown"; }

      // Genera hash del contenuto
      const encoder = new TextEncoder();
      const data = encoder.encode(contractHtml);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

      // Ricompila HTML con dati reali post-firma
      const signedTimestamp = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
      let finalContent = contractHtml;
      finalContent = finalContent.replace(/\[Firma tramite Gestionale\]/g, "✓ Firmato digitalmente da " + fullName.trim());
      finalContent = finalContent.replace(/\[FIRMA DIGITALE HOST – Gestionale\]/g, "✓ Firmato digitalmente da " + fullName.trim());
      finalContent = finalContent.replace(/<span style="color:#999;font-style:italic">\[La tua firma\]<\/span>/g, "✓ Firmato digitalmente da " + fullName.trim());
      finalContent = finalContent.replace(/\[La tua firma\]/g, "✓ Firmato digitalmente da " + fullName.trim());
      finalContent = finalContent.replace(/\[FIRMA DIGITALE AUTO – Gestionale\]/g, "✓ Firma digitale – Puliziacasevacanze.it S.r.l.s.");
      finalContent = finalContent.replace(/\[timestamp: AUTO \| IP: AUTO\]/g, "Timestamp: " + signedTimestamp + " | IP: " + clientIp);
      finalContent = finalContent.replace(/\[timestamp: AUTO \| IP:AUTO\]/g, "Timestamp: " + signedTimestamp + " | IP: " + clientIp);
      finalContent = finalContent.replace(/\[AUTO_SIG_HOST\]/g, "✓ Firmato digitalmente da " + fullName.trim());
      finalContent = finalContent.replace(/\[AUTO_SIG_COMPANY\]/g, "✓ Firma digitale – Puliziacasevacanze.it S.r.l.s.");
      finalContent = finalContent.replace(/\[AUTO_SIG_TIMESTAMP\]/g, signedTimestamp + " | IP: " + clientIp);
      finalContent = finalContent.replace(/\[AUTO – Gestionale\]/g, "—");
      finalContent = finalContent.replace(/\[AUTO\]/g, "—");

      // Salva accettazione
      const acceptanceData = {
        userId: user.id,
        userRole: user.role || "PROPRIETARIO",
        userEmail: user.email || "",
        fullName: fullName.trim(),
        fiscalCode: billingType === "azienda" ? (fiscalCode || "").toUpperCase() : fiscalCode.toUpperCase(),
        vatNumber: billingType === "azienda" ? vatNumber.toUpperCase() : "",
        billingType,
        documentId: "allegato_d_" + property.id,
        documentType: "allegato_d",
        documentVersion: "2.0",
        documentHash: hash,
        documentTitle: `Allegato D – ${property.name}`,
        documentContent: finalContent,
        propertyId: property.id,
        propertyName: property.name,
        cleaningPrice: property.cleaningPrice,
        signatureImage: signature,
        signatureMethod: "drawn",
        consents: {
          readFully: true,
          acceptTerms: true,
          acceptPrice: true,
          privacyConsent: true,
        },
        metadata: {
          ipAddress: clientIp,
          userAgent: navigator.userAgent,
          timestamp: Timestamp.now(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        status: "valid",
        createdAt: Timestamp.now(),
      };

      await addDoc(collection(db, "contractAcceptances"), acceptanceData);

      // Aggiorna proprietà → ACTIVE
      await updateDoc(doc(db, "properties", property.id), {
        status: "ACTIVE",
        contractSigned: true,
        contractSignedAt: Timestamp.now(),
        contractSignedBy: user.id,
        updatedAt: Timestamp.now(),
      });

      onSuccess();
    } catch (err) {
      console.error("Errore firma contratto:", err);
      setError("Errore durante la firma. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen || !property) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl h-[95dvh] sm:h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-sky-100">
            <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-800">Allegato D – Scheda Servizio</h3>
            <p className="text-sm text-slate-500">{property.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Steps */}
        <div className="px-6 py-3 bg-slate-50 border-b flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === "view" ? "bg-sky-500 text-white" : "bg-green-500 text-white"}`}>
              {step === "sign" ? "✓" : "1"}
            </div>
            <span className={`text-sm font-medium ${step === "view" ? "text-sky-600" : "text-green-600"}`}>Leggi</span>
          </div>
          <div className="w-8 h-0.5 bg-slate-300 rounded"></div>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === "sign" ? "bg-sky-500 text-white" : "bg-slate-300 text-slate-500"}`}>2</div>
            <span className={`text-sm font-medium ${step === "sign" ? "text-sky-600" : "text-slate-400"}`}>Firma</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sky-500 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Caricamento documento...</p>
              </div>
            </div>
          ) : error && !contractHtml ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          ) : step === "view" ? (
            <>
              {/* Price banner */}
              <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-200 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-700 font-medium">Prezzo pulizia contrattuale:</span>
                  <span className="text-lg font-bold text-emerald-800">€ {(property.cleaningPrice || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Scroll indicator */}
              <div className="px-6 py-2 border-b flex-shrink-0">
                {!hasScrolledToBottom ? (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    Scorri fino in fondo per procedere
                  </p>
                ) : (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Documento letto — Puoi procedere
                  </p>
                )}
              </div>

              {/* Document */}
              <div ref={contentRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                <style dangerouslySetInnerHTML={{ __html: `
                  .contract-content { overflow-x: hidden; }
                  .contract-content table { width: 100% !important; table-layout: auto !important; font-size: 0.85em !important; border-collapse: collapse !important; display: table !important; border-radius: 6px !important; overflow: hidden !important; max-width: 100% !important; box-sizing: border-box !important; }
                  .contract-content th, .contract-content td { padding: 6px 10px !important; word-break: break-word; overflow-wrap: break-word; max-width: none !important; width: auto !important; box-sizing: border-box !important; }
                  .contract-content th[colspan] { width: 100% !important; }
                  .contract-content th { text-align: left !important; }
                  .contract-content td:last-child { text-align: right !important; }
                  .contract-content h1 { font-size: 1.2em !important; }
                  .contract-content p { font-size: 0.85em !important; line-height: 1.5 !important; }
                  .contract-content > div { max-width: 100% !important; overflow: hidden !important; }
                  @media (max-width: 640px) {
                    .contract-content table { font-size: 0.78em !important; }
                    .contract-content th, .contract-content td { padding: 4px 6px !important; font-size: inherit !important; }
                  }
                ` }} />
                <div className="contract-content max-w-none" style={{ overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: contractHtml }} />
              </div>

              {/* Action */}
              <div className="px-6 pt-4 border-t flex-shrink-0" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))" }}>
                <button
                  onClick={() => setStep("sign")}
                  disabled={!hasScrolledToBottom}
                  className={`w-full py-3 rounded-xl font-semibold transition-all ${hasScrolledToBottom
                    ? "bg-sky-500 text-white hover:bg-sky-600 shadow-lg"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  Procedi alla Firma
                </button>
              </div>
            </>
          ) : (
            /* STEP 2: Firma */
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 sm:p-6 space-y-4">
                
                {/* Riepilogo compatto */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-slate-500">Proprietà: </span>
                      <span className="font-semibold text-slate-800">{property.name}</span>
                    </div>
                    <span className="font-bold text-emerald-700">€ {(property.cleaningPrice || 0).toFixed(2)}</span>
                  </div>
                  {property.address && (
                    <p className="text-xs text-slate-500 mt-1">{property.address}</p>
                  )}
                </div>

                {/* Consensi */}
                <div className="space-y-2">
                  <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border-2 transition-all cursor-pointer ${acceptTerms ? "border-green-500 bg-green-50" : "border-slate-200"}`}>
                    <input type="checkbox" checked={acceptTerms} onChange={() => setAcceptTerms(!acceptTerms)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-green-500" />
                    <span className="text-sm text-slate-700">Dichiaro di aver letto e accetto <strong>integralmente</strong> le condizioni dell&apos;Allegato D</span>
                  </label>
                  <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border-2 transition-all cursor-pointer ${acceptPrice ? "border-green-500 bg-green-50" : "border-slate-200"}`}>
                    <input type="checkbox" checked={acceptPrice} onChange={() => setAcceptPrice(!acceptPrice)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-green-500" />
                    <span className="text-sm text-slate-700">Accetto il prezzo di <strong>€ {(property.cleaningPrice || 0).toFixed(2)}</strong> per la proprietà <strong>{property.name}</strong></span>
                  </label>
                </div>

                {/* Dati identificativi - adattivi per persona fisica / azienda */}
                {billingType === "azienda" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl border border-blue-200">
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                      <span className="text-xs font-medium text-blue-700">Firma come Azienda</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Ragione Sociale *</label>
                        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Rossi S.r.l."
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Partita IVA *</label>
                        <input type="text" value={vatNumber}
                          onChange={(e) => {
                            const v = e.target.value.toUpperCase();
                            // Accetta: prefisso IT opzionale + 11 cifre
                            const cleaned = v.replace(/[^0-9IT]/g, "");
                            setVatNumber(cleaned);
                          }}
                          placeholder="12345678901 oppure IT12345678901"
                          maxLength={13}
                          className={`w-full px-3 py-2.5 border rounded-xl text-sm uppercase focus:ring-2 focus:ring-sky-500 ${
                            vatNumber.length > 0 && !/^(IT)?\d{11}$/i.test(vatNumber.replace(/\s/g,""))
                              ? "border-amber-400 bg-amber-50"
                              : "border-slate-300"
                          }`}
                        />
                        {vatNumber.length > 0 && !/^(IT)?\d{11}$/i.test(vatNumber.replace(/\s/g,"")) && (
                          <p className="text-amber-600 text-xs mt-1">
                            {vatNumber.replace(/^IT/i,"").replace(/\s/g,"").length}/11 cifre
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Codice Fiscale Azienda (opzionale)</label>
                      <input type="text" value={fiscalCode} onChange={(e) => setFiscalCode(e.target.value.toUpperCase())} placeholder="Lascia vuoto se uguale alla P.IVA"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm uppercase focus:ring-2 focus:ring-sky-500" maxLength={16} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Nome e Cognome *</label>
                      <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Mario Rossi"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Codice Fiscale *</label>
                      <input type="text" value={fiscalCode} onChange={(e) => setFiscalCode(formatFiscalCode(e.target.value))} placeholder="RSSMRA80A01H501U" maxLength={16}
                        className={`w-full px-3 py-2.5 border rounded-xl text-sm uppercase focus:ring-2 focus:ring-sky-500 ${fiscalCode.length === 16 && !isValidFiscalCode(fiscalCode) ? "border-red-500 bg-red-50" : "border-slate-300"}`} />
                      {fiscalCode.length > 0 && fiscalCode.length < 16 && <p className="text-slate-400 text-xs mt-1">{fiscalCode.length}/16</p>}
                    </div>
                  </div>
                )}

                {/* Firma */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Firma Digitale *</label>
                  {!signatureActive ? (
                    <div
                      onClick={() => setSignatureActive(true)}
                      className="flex flex-col items-center justify-center cursor-pointer rounded-xl border-2 border-dashed border-gray-300 bg-gradient-to-b from-gray-50 to-white hover:border-sky-400 hover:from-sky-50 hover:to-white transition-all active:scale-[0.99]"
                      style={{ minHeight: '150px' }}
                    >
                      <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center mb-2">
                        <svg className="w-6 h-6 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">Tocca per firmare</span>
                      <span className="text-xs text-gray-400 mt-0.5">Disegna la tua firma con il dito</span>
                    </div>
                  ) : (
                    <SignaturePad onSignatureChange={setSignature} width={undefined} height={150} />
                  )}
                </div>

                {/* Errore */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-red-700 text-sm whitespace-pre-line">{error}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 pt-4 border-t flex gap-3 flex-shrink-0 sticky bottom-0 bg-white" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))" }}>
                <button onClick={() => { setStep("view"); setError(null); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200" disabled={submitting}>
                  ← Indietro
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  className={`flex-1 py-3 font-semibold rounded-xl transition-all ${submitting ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 shadow-lg"}`}>
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Elaborazione...
                    </span>
                  ) : "Accetta e Firma"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
