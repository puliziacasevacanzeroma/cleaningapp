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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "~/lib/firebase/config";
import { SignaturePad } from "~/components/contract/SignaturePad";
import { precompileOnboardingContract } from "~/lib/contractPrecompiler";
import { validateFiscalCodeMatchFullName } from "~/types/billing";

// 🔥 Helper per leggere utente da localStorage/cookie (fallback)
function getUserFromStorage(): any {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("user");
    if (stored) return JSON.parse(stored);
    
    // Il cookie auth-token è HttpOnly - solo localStorage
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
  const [signatureActive, setSignatureActive] = useState(false);
  
  // Selfie / foto identità
  const [selfiePhoto, setSelfiePhoto] = useState<string | null>(null);      // base64 preview
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);          // blob per upload
  const [selfieMode, setSelfieMode] = useState<"idle" | "camera" | "done">("idle");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const selfieFileRef = useRef<HTMLInputElement>(null);
  const [consents, setConsents] = useState<AcceptanceConsents>({
    readFully: false,
    acceptTerms: false,
    privacyConsent: false,
  });

  // Carica documento
  useEffect(() => {
    async function loadDocument() {
      // 🔥 FIX: Usa sia user da AuthContext che da localStorage
      const effectiveUser = user || getUserFromStorage();
      if (!effectiveUser?.id) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // Verifica se ha già firmato
        const userDoc = await getDoc(doc(db, "users", effectiveUser.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const urlParams = new URLSearchParams(window.location.search);
          const isEditing = urlParams.get("edit") === "true";
          
          if (userData.contractAccepted === true && !isEditing) {
            // Già firmato e non sta modificando, vai al prossimo step
            window.location.href = "/complete-billing";
            return;
          }
          // Pre-popola nome se disponibile
          if (userData.name) {
            setFullName(userData.name);
          }
          // Pre-popola codice fiscale se disponibile
          if (userData.fiscalCode) {
            setFiscalCode(userData.fiscalCode);
          }
        }
        
        // Cerca documento attivo (solo contratto quadro, NON allegato D)
        const docsQuery = query(
          collection(db, "regulationDocuments"),
          where("isActive", "==", true)
        );
        
        const snapshot = await getDocs(docsQuery);
        
        let foundDoc: RegulationDocument | null = null;
        const userRole = effectiveUser.role?.toUpperCase() || "PROPRIETARIO";
        
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const applicableTo = data.applicableTo as string[] || [];
          const docType = data.type || "";
          
          if (data.isDraft) continue;
          // Salta l'Allegato D — viene gestito separatamente in PropertyContractModal
          if (docType === "allegato_d_template") continue;
          
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
        
        // Precompila il contratto con dati utente e azienda
        if (foundDoc) {
          const userDoc2 = await getDoc(doc(db, "users", effectiveUser.id));
          const fullUserData = userDoc2.exists() ? userDoc2.data() : {};
          foundDoc.content = precompileOnboardingContract(foundDoc.content, {
            id: effectiveUser.id,
            name: fullUserData.name || effectiveUser.name || "",
            email: fullUserData.email || effectiveUser.email || "",
            phone: fullUserData.phone || fullUserData.telefono || "",
            role: effectiveUser.role,
            billingInfo: fullUserData.billingInfo,
          });
        }
        
        setDocument(foundDoc);
        
      } catch (err) {
        console.error("Errore caricamento documento:", err);
        setError("Errore nel caricamento del documento");
      } finally {
        setLoading(false);
      }
    }
    
    // 🔥 FIX: Esegui anche se user è null ma c'è in localStorage
    const effectiveUser = user || getUserFromStorage();
    if (effectiveUser && !authLoading) {
      loadDocument();
    }
  }, [user, authLoading, router]);

  // Collega stream video alla videocamera quando disponibile
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Cleanup camera stream quando componente si smonta
  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach(t => t.stop());
    };
  }, [cameraStream]);


  // ══════════════════════════════════════════
  // HANDLER CAMERA SELFIE (estratti dal JSX)
  // ══════════════════════════════════════════

  const handleOpenCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" }, 
        audio: false 
      });
      setCameraStream(stream);
      setSelfieMode("camera");
    } catch {
      // Fotocamera non disponibile → fallback file picker
      selfieFileRef.current?.click();
    }
  };

  const handleOpenFilePicker = () => {
    selfieFileRef.current?.click();
  };

  const handleScattaFoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    // Usa toDataURL invece di toBlob + FileReader per evitare problemi di minificazione
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setSelfiePhoto(dataUrl);
      // Converti dataUrl in blob per upload Firebase
      fetch(dataUrl)
        .then(r => r.blob())
        .then(blob => {
          setSelfieBlob(blob);
          setSelfieMode("done");
          cameraStream?.getTracks().forEach(t => t.stop());
          setCameraStream(null);
        });
    } catch {
      setSelfieMode("idle");
    }
  };

  const handleAnnullaCamera = () => {
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    setSelfieMode("idle");
  };

  const handleRifareFoto = () => {
    setSelfiePhoto(null);
    setSelfieBlob(null);
    setSelfieMode("idle");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Usa window.Image esplicitamente per evitare minificazione errata con React
    const imgEl = document.createElement("img") as HTMLImageElement;
    const url = URL.createObjectURL(file);
    imgEl.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX = 1024;
      let w = imgEl.naturalWidth || imgEl.width;
      let h = imgEl.naturalHeight || imgEl.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(imgEl, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) return;
        // Usa FileReader via window per evitare minificazione errata
        const reader = new (window as any).FileReader();
        reader.onload = (ev: ProgressEvent<FileReader>) => setSelfiePhoto(ev.target?.result as string);
        reader.readAsDataURL(blob);
        setSelfieBlob(blob);
        setSelfieMode("done");
        URL.revokeObjectURL(url);
      }, "image/jpeg", 0.85);
    };
    imgEl.src = url;
    e.target.value = "";
  };

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
      setTimeout(checkIfScrollNeeded, 100);
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
    } else if (fullName && fullName.trim().split(/\s+/).length >= 2 && !validateFiscalCodeMatchFullName(fullName.trim(), fiscalCode)) {
      errors.push("Il codice fiscale non corrisponde al nome e cognome inseriti");
    }
    if (!signature) {
      errors.push("Devi inserire la tua firma digitale");
    }
    if (!selfiePhoto) {
      errors.push("Devi scattare un selfie o caricare una foto per verificare la tua identità");
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
    // 🔥 FIX: Usa anche localStorage come fallback
    const effectiveUser = user || getUserFromStorage();
    if (!effectiveUser?.id || !document) return;
    
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setError("⚠️ Completa i seguenti campi:\n\n• " + validationErrors.join("\n• "));
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
      } catch { /* fallback sotto */ }
      
      // Fallback: servizio esterno se IP non rilevato
      if (clientIp === "unknown") {
        try {
          const extRes = await fetch("https://api.ipify.org?format=json");
          const extData = await extRes.json();
          clientIp = extData.ip || "unknown";
        } catch { /* resta unknown */ }
      }

      // Upload selfie su Firebase Storage
      let selfieUrl = "";
      if (selfieBlob) {
        try {
          const selfieRef = ref(storage, `contract-selfies/${effectiveUser.id}/${Date.now()}.jpg`);
          await uploadBytes(selfieRef, selfieBlob, { contentType: "image/jpeg" });
          selfieUrl = await getDownloadURL(selfieRef);
        } catch (uploadErr) {
          console.error("Errore upload selfie:", uploadErr);
          throw new Error("Impossibile caricare la foto. Riprova.");
        }
      }

      // Crea record accettazione
      const signedTimestamp = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
      
      // Ricompila l'HTML del contratto con i dati reali post-firma
      let finalContent = document.content;
      // Dati host
      finalContent = finalContent.replace(/Nome \/ Ragione Sociale: \[AUTO – Gestionale\]/g, "Nome / Ragione Sociale: " + fullName.trim());
      finalContent = finalContent.replace(/C\.F\. \/ P\.IVA: \[AUTO – Gestionale\]/g, "C.F. / P.IVA: " + fiscalCode.toUpperCase());
      finalContent = finalContent.replace(/Email: \[AUTO – Gestionale\]/g, "Email: " + (effectiveUser.email || "—"));
      finalContent = finalContent.replace(/Indirizzo: \[AUTO – Gestionale\]/g, "Indirizzo: —");
      finalContent = finalContent.replace(/PEC: \[AUTO – Gestionale\]/g, "PEC: —");
      finalContent = finalContent.replace(/Tel\.: \[AUTO – Gestionale\]/g, "Tel.: —");
      // Firme
      finalContent = finalContent.replace(/\[FIRMA DIGITALE HOST – Gestionale\]/g, "✓ Firmato digitalmente da " + fullName.trim());
      finalContent = finalContent.replace(/<span style="color:#999;font-style:italic">\[La tua firma\]<\/span>/g, "✓ Firmato digitalmente da " + fullName.trim());
      finalContent = finalContent.replace(/\[La tua firma\]/g, "✓ Firmato digitalmente da " + fullName.trim());
      finalContent = finalContent.replace(/\[FIRMA DIGITALE AUTO – Gestionale\]/g, "✓ Firma digitale – Puliziacasevacanze.it S.r.l.s.");
      finalContent = finalContent.replace(/✓ Firma digitale – Puliziacasevacanze\.it S\.r\.l\.s\./g, "✓ Firma digitale – Puliziacasevacanze.it S.r.l.s.");
      finalContent = finalContent.replace(/\[timestamp: AUTO \| IP: AUTO\]/g, "Timestamp: " + signedTimestamp + " | IP: " + clientIp);
      finalContent = finalContent.replace(/\[timestamp: AUTO \| IP:AUTO\]/g, "Timestamp: " + signedTimestamp + " | IP: " + clientIp);
      finalContent = finalContent.replace(/Timestamp: [^<\n]*/g, "Timestamp: " + signedTimestamp + " | IP: " + clientIp);
      // Catch-all per eventuali placeholder rimasti
      finalContent = finalContent.replace(/\[AUTO – Gestionale\]/g, "—");
      finalContent = finalContent.replace(/\[AUTO\]/g, "—");
      
      const acceptanceData = {
        userId: effectiveUser.id,
        userRole: effectiveUser.role || "PROPRIETARIO",
        userEmail: effectiveUser.email || "",
        fullName: fullName.trim(),
        fiscalCode: fiscalCode.toUpperCase(),
        documentId: document.id,
        documentType: document.type || "regolamento",
        documentVersion: document.version,
        documentHash: document.hash || "",
        documentTitle: document.title,
        documentContent: finalContent,
        signatureImage: signature,
        signatureMethod: "drawn",
        selfiePhotoUrl: selfieUrl,
        selfiePhotoBase64: selfiePhoto,   // base64 come backup locale
        consents,
        metadata: {
          ipAddress: clientIp,
          userAgent: navigator.userAgent,
          timestamp: Timestamp.now(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        status: "valid",
        createdAt: Timestamp.now(),
      };

      // Cerca record accettazione esistente (per evitare duplicati se torna indietro)
      const existingQuery = query(
        collection(db, "contractAcceptances"),
        where("userId", "==", effectiveUser.id),
        where("documentId", "==", document.id),
        where("status", "==", "valid")
      );
      const existingSnap = await getDocs(existingQuery);
      
      if (!existingSnap.empty) {
        // Sovrascrive il record esistente
        const existingDocRef = existingSnap.docs[0].ref;
        await updateDoc(existingDocRef, {
          ...acceptanceData,
          updatedAt: Timestamp.now(),
        });
      } else {
        // Crea nuovo record
        await addDoc(collection(db, "contractAcceptances"), acceptanceData);
      }

      // Aggiorna utente - cambia status a PENDING_BILLING
      await updateDoc(doc(db, "users", effectiveUser.id), {
        contractAccepted: true,
        status: "PENDING_BILLING",
        name: fullName.trim(),
        fiscalCode: fiscalCode.toUpperCase(),
        contractAcceptance: {
          accepted: true,
          version: document.version,
          acceptedAt: Timestamp.now(),
          selfiePhotoUrl: selfieUrl,
        },
        updatedAt: Timestamp.now(),
      });

      // Aggiorna cookie
      await updateUserSession({ 
        contractAccepted: true,
        status: "PENDING_BILLING"
      });

      setSuccess(true);
      
      // 🔥 FIX: Usa window.location.href per hard redirect
      setTimeout(() => {
        window.location.href = "/complete-billing";
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

  // 🔥 FIX: Controlla anche localStorage come fallback
  const storedUser = getUserFromStorage();
  const effectiveUser = user || storedUser;
  
  if (!effectiveUser) {
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Documento in Preparazione</h1>
          <p className="text-gray-600 mb-6">
            Il regolamento operativo è in fase di preparazione.<br/>
            Contatta l'amministratore per maggiori informazioni.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="text-amber-800 text-sm">
              <strong>Nota:</strong> Non puoi procedere finché il regolamento non sarà disponibile per la firma.
            </p>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full py-3 px-6 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 mb-3"
          >
            Ricarica Pagina
          </button>
          <button 
            onClick={() => {
              // Logout e torna al login
              localStorage.removeItem("user");
              window.document.cookie = "firebase-user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
              window.location.href = "/login";
            }} 
            className="w-full py-3 px-6 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200"
          >
            Torna al Login
          </button>
        </div>
      </div>
    );
  }

  // Form principale
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-white text-base font-bold">{document.title}</h1>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>Step 1 di 3 — Leggi e firma il regolamento</p>
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

      <div className="max-w-5xl mx-auto px-2">
        {/* Contratto */}
        <div className="bg-white rounded-2xl shadow-lg mb-4 overflow-hidden">
          <div ref={contentRef} className="overflow-y-auto px-2 py-3 max-w-none" style={{ maxHeight: '65vh' }} dangerouslySetInnerHTML={{ __html: document.content }} />
          <div className={`px-4 py-3 border-t flex items-center gap-2 transition-all ${hasScrolledToBottom ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            {hasScrolledToBottom ? (
              <>
                <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-green-700 font-medium">Contratto letto — Puoi procedere con la firma</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <span className="text-sm text-amber-700">Scorri fino in fondo per procedere</span>
              </>
            )}
          </div>
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
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Mario Rossi" className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-sky-500 ${fullName.trim().length >= 3 && fullName.trim().split(/\s+/).length >= 2 ? 'border-green-500 bg-green-50' : fullName.trim().length > 0 && fullName.trim().split(/\s+/).length < 2 ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`} />
              {fullName.trim().length > 0 && fullName.trim().split(/\s+/).length < 2 && <p className="text-amber-600 text-sm mt-1">Inserisci nome e cognome separati da uno spazio</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Codice Fiscale *</label>
              <input type="text" value={fiscalCode} onChange={handleFiscalCodeChange} placeholder="RSSMRA80A01H501U" maxLength={16} className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-sky-500 uppercase ${fiscalCode.length === 16 ? (isValidFiscalCode(fiscalCode) && fullName.trim().split(/\s+/).length >= 2 && validateFiscalCodeMatchFullName(fullName.trim(), fiscalCode) ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50') : 'border-gray-300'}`} />
              {fiscalCode.length > 0 && fiscalCode.length < 16 && <p className="text-gray-400 text-sm mt-1">{fiscalCode.length}/16</p>}
              {fiscalCode.length === 16 && isValidFiscalCode(fiscalCode) && fullName.trim().split(/\s+/).length >= 2 && (validateFiscalCodeMatchFullName(fullName.trim(), fiscalCode) ? <p className="text-green-600 text-sm mt-1 flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Codice fiscale verificato</p> : <p className="text-red-600 text-sm mt-1 flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>Il CF non corrisponde al nome e cognome</p>)}
              {fiscalCode.length === 16 && !isValidFiscalCode(fiscalCode) && <p className="text-red-600 text-sm mt-1 flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>Formato codice fiscale non valido</p>}
            </div>
          </div>
        </div>

        {/* Firma */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Firma Digitale *</h2>
          {!signatureActive ? (
            <div
              onClick={() => setSignatureActive(true)}
              className="flex flex-col items-center justify-center cursor-pointer rounded-xl border-2 border-dashed border-gray-300 bg-gradient-to-b from-gray-50 to-white hover:border-sky-400 hover:from-sky-50 hover:to-white transition-all active:scale-[0.99]"
              style={{ minHeight: '180px' }}
            >
              <div className="w-14 h-14 rounded-full bg-sky-50 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-700">Tocca per firmare</span>
              <span className="text-xs text-gray-400 mt-1">Disegna la tua firma con il dito</span>
            </div>
          ) : (
            <SignaturePad onSignatureChange={setSignature} width={undefined} height={200} />
          )}
        </div>

        {/* Foto Identità / Selfie */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Foto Identità *</h2>
          <p className="text-sm text-gray-500 mb-4">
            Scatta un selfie oppure carica una foto del tuo viso. Sarà allegata al contratto come controprova della firma.
          </p>

          {selfieMode === "idle" && !selfiePhoto && (
            <div className="grid grid-cols-2 gap-3">
              {/* Scatta selfie */}
              <button
                type="button"
                onClick={handleOpenCamera}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 hover:bg-sky-100 transition-all active:scale-[0.98] cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-sky-700">Scatta Selfie</span>
                <span className="text-xs text-sky-500">Usa la fotocamera</span>
              </button>

              {/* Carica foto */}
              <button
                type="button"
                onClick={handleOpenFilePicker}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition-all active:scale-[0.98] cursor-pointer"
              >
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-gray-700">Carica Foto</span>
                <span className="text-xs text-gray-500">Dalla galleria</span>
              </button>
            </div>
          )}

          {/* Camera live */}
          {selfieMode === "camera" && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Guida ovale viso */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-4 border-white/70 rounded-full" style={{ width: "45%", height: "65%", boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }} />
                </div>
                <p className="absolute bottom-3 left-0 right-0 text-center text-white text-xs font-medium">Posiziona il viso nell'ovale</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleScattaFoto}
                  className="py-3 px-4 bg-sky-500 text-white font-semibold rounded-xl hover:bg-sky-600 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth={2} />
                    <circle cx="12" cy="12" r="5" fill="currentColor" />
                  </svg>
                  Scatta
                </button>
                <button
                  type="button"
                  onClick={handleAnnullaCamera}
                  className="py-3 px-4 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}

          {/* Preview foto scattata */}
          {selfiePhoto && selfieMode === "done" && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden border-2 border-green-400" style={{ aspectRatio: "4/3" }}>
                <img src={selfiePhoto} alt="La tua foto" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-green-700 font-medium flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Foto acquisita
                </p>
                <button
                  type="button"
                  onClick={handleRifareFoto}
                  className="text-sm text-sky-600 hover:text-sky-700 font-medium"
                >
                  Rifare foto
                </button>
              </div>
            </div>
          )}

          {/* Input file nascosto */}
          <input
            ref={selfieFileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Nota privacy */}
          <p className="text-xs text-gray-400 mt-3 flex items-start gap-1.5">
            <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            La foto è cifrata e conservata in modo sicuro. È accessibile solo agli amministratori per verifiche legali.
          </p>
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

        {/* Banner progressi salvati + Logout */}
        <div className="mt-8 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Puoi completare la registrazione in qualsiasi momento
          </p>
          <button
            onClick={async () => {
              const { getAuth, signOut } = await import("firebase/auth");
              await signOut(getAuth());
              localStorage.clear();
              window.document.cookie.split(";").forEach(c => { window.document.cookie = c.trim().split("=")[0] + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/"; });
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
