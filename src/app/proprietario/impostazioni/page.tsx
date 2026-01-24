/**
 * Pagina Impostazioni Proprietario
 * 
 * Permette al proprietario di gestire:
 * - Dati personali
 * - Dati di fatturazione
 * - Preferenze notifiche
 * - Documenti firmati
 */

"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { BillingInfoForm } from "~/components/billing";
import type { BillingFormData, BillingInfo } from "~/types/billing";
import { 
  formDataToBillingInfo, 
  billingInfoToFormData, 
  createEmptyBillingFormData,
} from "~/types/billing";

// ==================== TIPI ====================

interface UserData {
  name: string;
  email: string;
  phone?: string;
  billingInfo?: BillingInfo;
}

interface SignedDocument {
  id: string;
  documentId: string;
  documentTitle: string;
  documentVersion: string;
  documentType: string;
  fullName: string;
  fiscalCode: string;
  signatureImage: string;
  createdAt: Date;
  documentContent?: string;
}

type TabType = "profilo" | "fatturazione" | "notifiche" | "documenti";

// ==================== COMPONENTE ====================

export default function ImpostazioniPage() {
  const { user } = useAuth();
  
  // State
  const [activeTab, setActiveTab] = useState<TabType>("profilo");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Dati profilo
  const [userData, setUserData] = useState<UserData>({
    name: "",
    email: "",
    phone: "",
  });
  
  // Dati fatturazione
  const [billingData, setBillingData] = useState<BillingFormData>(createEmptyBillingFormData());
  const [billingValid, setBillingValid] = useState(false);
  
  // Notifiche
  const [notificationPrefs, setNotificationPrefs] = useState({
    emailNotifications: true,
    pushNotifications: true,
    cleaningReminders: true,
    paymentAlerts: true,
  });

  // Documenti firmati
  const [signedDocuments, setSignedDocuments] = useState<SignedDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<SignedDocument | null>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);

  // ==================== CARICAMENTO DATI ====================
  
  useEffect(() => {
    async function loadUserData() {
      if (!user?.id) return;
      
      try {
        setLoading(true);
        const userDoc = await getDoc(doc(db, "users", user.id));
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          
          // Dati profilo
          setUserData({
            name: data.name || "",
            email: data.email || "",
            phone: data.phone || "",
          });
          
          // Dati fatturazione (se esistono)
          if (data.billingInfo) {
            setBillingData(billingInfoToFormData(data.billingInfo));
          }
          
          // Preferenze notifiche
          if (data.notificationPrefs) {
            setNotificationPrefs(prev => ({
              ...prev,
              ...data.notificationPrefs,
            }));
          }
        }
      } catch (error) {
        console.error("Errore caricamento dati:", error);
        setMessage({ type: "error", text: "Errore nel caricamento dei dati" });
      } finally {
        setLoading(false);
      }
    }
    
    loadUserData();
  }, [user?.id]);

  // Carica documenti firmati quando si apre il tab
  useEffect(() => {
    async function loadSignedDocuments() {
      if (!user?.id || activeTab !== "documenti") return;
      
      try {
        setLoadingDocuments(true);
        
        // Query per ottenere le accettazioni dell'utente
        const acceptancesQuery = query(
          collection(db, "contractAcceptances"),
          where("userId", "==", user.id),
          where("status", "==", "valid")
        );
        
        const snapshot = await getDocs(acceptancesQuery);
        
        const docs: SignedDocument[] = [];
        
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          
          // Prova a recuperare il contenuto del documento originale
          let documentContent = "";
          try {
            const regDoc = await getDoc(doc(db, "regulationDocuments", data.documentId));
            if (regDoc.exists()) {
              documentContent = regDoc.data().content || "";
            }
          } catch {
            // Documento non trovato
          }
          
          docs.push({
            id: docSnap.id,
            documentId: data.documentId,
            documentTitle: data.documentTitle || "Documento",
            documentVersion: data.documentVersion || "1.0",
            documentType: data.documentType || "regolamento",
            fullName: data.fullName,
            fiscalCode: data.fiscalCode,
            signatureImage: data.signatureImage,
            createdAt: data.createdAt?.toDate() || new Date(),
            documentContent,
          });
        }
        
        // Ordina per data (più recente prima)
        docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        
        setSignedDocuments(docs);
      } catch (error) {
        console.error("Errore caricamento documenti:", error);
      } finally {
        setLoadingDocuments(false);
      }
    }
    
    loadSignedDocuments();
  }, [user?.id, activeTab]);

  // ==================== SALVATAGGIO ====================

  const saveProfile = async () => {
    if (!user?.id) return;
    
    try {
      setSaving(true);
      setMessage(null);
      
      await updateDoc(doc(db, "users", user.id), {
        name: userData.name,
        phone: userData.phone,
        updatedAt: Timestamp.now(),
      });
      
      setMessage({ type: "success", text: "Profilo aggiornato con successo!" });
    } catch (error) {
      console.error("Errore salvataggio profilo:", error);
      setMessage({ type: "error", text: "Errore durante il salvataggio" });
    } finally {
      setSaving(false);
    }
  };

  const saveBilling = async () => {
    if (!user?.id || !billingValid) return;
    
    try {
      setSaving(true);
      setMessage(null);
      
      const billingInfo = formDataToBillingInfo(billingData);
      
      await updateDoc(doc(db, "users", user.id), {
        billingInfo,
        billingCompleted: true,
        updatedAt: Timestamp.now(),
      });
      
      setMessage({ type: "success", text: "Dati di fatturazione salvati!" });
    } catch (error) {
      console.error("Errore salvataggio fatturazione:", error);
      setMessage({ type: "error", text: "Errore durante il salvataggio" });
    } finally {
      setSaving(false);
    }
  };

  const saveNotifications = async () => {
    if (!user?.id) return;
    
    try {
      setSaving(true);
      setMessage(null);
      
      await updateDoc(doc(db, "users", user.id), {
        notificationPrefs,
        updatedAt: Timestamp.now(),
      });
      
      setMessage({ type: "success", text: "Preferenze notifiche salvate!" });
    } catch (error) {
      console.error("Errore salvataggio notifiche:", error);
      setMessage({ type: "error", text: "Errore durante il salvataggio" });
    } finally {
      setSaving(false);
    }
  };

  // ==================== HANDLERS ====================

  const handleBillingChange = (data: BillingFormData, isValid: boolean) => {
    setBillingData(data);
    setBillingValid(isValid);
  };

  const openDocument = (doc: SignedDocument) => {
    setSelectedDocument(doc);
    setShowDocumentModal(true);
  };

  const downloadPDF = async (doc: SignedDocument) => {
    // Genera e scarica PDF
    try {
      const response = await fetch("/api/contract/generate-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acceptanceId: doc.id,
        }),
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${doc.documentTitle.replace(/\s+/g, "_")}_firmato.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        setMessage({ type: "error", text: "Errore generazione PDF" });
      }
    } catch (error) {
      console.error("Errore download PDF:", error);
      setMessage({ type: "error", text: "Errore durante il download" });
    }
  };

  // ==================== TABS ====================

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: "profilo", label: "Profilo", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
    { id: "fatturazione", label: "Fatturazione", icon: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" },
    { id: "notifiche", label: "Notifiche", icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
    { id: "documenti", label: "Documenti", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  ];

  // ==================== RENDER ====================

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Impostazioni</h1>
        <p className="text-gray-500 mt-1">Gestisci il tuo profilo e le preferenze</p>
      </div>

      {/* Messaggio */}
      {message && (
        <div className={`mb-6 p-4 rounded-xl ${
          message.type === "success" 
            ? "bg-green-50 border border-green-200 text-green-700" 
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {message.text}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-sky-500 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        
        {/* ==================== TAB PROFILO ==================== */}
        {activeTab === "profilo" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Dati Personali
            </h2>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome e Cognome
                </label>
                <input
                  type="text"
                  value={userData.name}
                  onChange={(e) => setUserData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={userData.email}
                  disabled
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">L'email non può essere modificata</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefono
                </label>
                <input
                  type="tel"
                  value={userData.phone}
                  onChange={(e) => setUserData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+39 333 1234567"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="px-6 py-3 bg-sky-500 text-white font-semibold rounded-xl hover:bg-sky-600 transition-colors disabled:opacity-50"
              >
                {saving ? "Salvataggio..." : "Salva Profilo"}
              </button>
            </div>
          </div>
        )}

        {/* ==================== TAB FATTURAZIONE ==================== */}
        {activeTab === "fatturazione" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
              </svg>
              Dati di Fatturazione
            </h2>
            
            <p className="text-gray-600 text-sm">
              Inserisci i dati per la fatturazione elettronica. Questi dati verranno utilizzati per generare le fatture dei servizi.
            </p>

            <BillingInfoForm
              initialData={billingData}
              onChange={handleBillingChange}
              compact
            />

            <div className="pt-4 border-t">
              <button
                onClick={saveBilling}
                disabled={saving || !billingValid}
                className={`px-6 py-3 font-semibold rounded-xl transition-colors ${
                  billingValid
                    ? "bg-sky-500 text-white hover:bg-sky-600"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {saving ? "Salvataggio..." : "Salva Dati Fatturazione"}
              </button>
              {!billingValid && (
                <p className="text-sm text-amber-600 mt-2">
                  Completa tutti i campi obbligatori per salvare
                </p>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB NOTIFICHE ==================== */}
        {activeTab === "notifiche" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Preferenze Notifiche
            </h2>

            <div className="space-y-4">
              {[
                { key: "emailNotifications", label: "Notifiche Email", desc: "Ricevi aggiornamenti via email" },
                { key: "pushNotifications", label: "Notifiche Push", desc: "Ricevi notifiche push sul dispositivo" },
                { key: "cleaningReminders", label: "Promemoria Pulizie", desc: "Ricorda le pulizie programmate" },
                { key: "paymentAlerts", label: "Avvisi Pagamenti", desc: "Notifiche su fatture e pagamenti" },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900">{item.label}</p>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={notificationPrefs[item.key as keyof typeof notificationPrefs]}
                      onChange={(e) => setNotificationPrefs(prev => ({
                        ...prev,
                        [item.key]: e.target.checked,
                      }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                  </div>
                </label>
              ))}
            </div>

            <div className="pt-4 border-t">
              <button
                onClick={saveNotifications}
                disabled={saving}
                className="px-6 py-3 bg-sky-500 text-white font-semibold rounded-xl hover:bg-sky-600 transition-colors disabled:opacity-50"
              >
                {saving ? "Salvataggio..." : "Salva Preferenze"}
              </button>
            </div>
          </div>
        )}

        {/* ==================== TAB DOCUMENTI ==================== */}
        {activeTab === "documenti" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Documenti Firmati
            </h2>

            <p className="text-gray-600 text-sm">
              Qui trovi tutti i documenti che hai firmato. Puoi visualizzarli o scaricarli in formato PDF.
            </p>

            {loadingDocuments ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-500" />
              </div>
            ) : signedDocuments.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500">Nessun documento firmato</p>
              </div>
            ) : (
              <div className="space-y-4">
                {signedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="border border-gray-200 rounded-xl p-4 hover:border-sky-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{doc.documentTitle}</h3>
                          <p className="text-sm text-gray-500">Versione {doc.documentVersion}</p>
                          <div className="mt-2 text-sm text-gray-600 space-y-1">
                            <p className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              Firmato il {doc.createdAt.toLocaleDateString("it-IT")} alle {doc.createdAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            <p className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              {doc.fullName}
                            </p>
                            <p className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                              </svg>
                              CF: {doc.fiscalCode}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Firma in miniatura */}
                      {doc.signatureImage && (
                        <div className="hidden sm:block flex-shrink-0">
                          <img
                            src={doc.signatureImage}
                            alt="Firma"
                            className="w-24 h-12 object-contain border border-gray-200 rounded bg-white"
                          />
                        </div>
                      )}
                    </div>

                    {/* Azioni */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => openDocument(doc)}
                        className="flex items-center gap-2 px-4 py-2 text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors text-sm font-medium"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Visualizza
                      </button>
                      <button
                        onClick={() => downloadPDF(doc)}
                        className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Scarica PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================== MODAL VISUALIZZA DOCUMENTO ==================== */}
      {showDocumentModal && selectedDocument && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{selectedDocument.documentTitle}</h3>
                <p className="text-sm text-gray-500">Versione {selectedDocument.documentVersion}</p>
              </div>
              <button
                onClick={() => setShowDocumentModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contenuto */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedDocument.documentContent ? (
                <div 
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedDocument.documentContent }}
                />
              ) : (
                <p className="text-gray-500 text-center py-8">Contenuto non disponibile</p>
              )}

              {/* Info firma */}
              <div className="mt-8 pt-6 border-t">
                <h4 className="font-semibold text-gray-900 mb-4">Dati Firma</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-gray-500">Firmatario</p>
                    <p className="font-medium">{selectedDocument.fullName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Codice Fiscale</p>
                    <p className="font-medium">{selectedDocument.fiscalCode}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Data e Ora</p>
                    <p className="font-medium">
                      {selectedDocument.createdAt.toLocaleDateString("it-IT")} alle {selectedDocument.createdAt.toLocaleTimeString("it-IT")}
                    </p>
                  </div>
                </div>
                
                {/* Firma */}
                {selectedDocument.signatureImage && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-2">Firma Digitale</p>
                    <img
                      src={selectedDocument.signatureImage}
                      alt="Firma"
                      className="max-w-xs h-24 object-contain border border-gray-200 rounded-lg bg-white p-2"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowDocumentModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Chiudi
              </button>
              <button
                onClick={() => downloadPDF(selectedDocument)}
                className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Scarica PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
