/**
 * Pagina Impostazioni Proprietario
 * 
 * Permette al proprietario di gestire:
 * - Dati personali
 * - Dati di fatturazione
 * - Preferenze notifiche
 */

"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { BillingInfoForm } from "~/components/billing";
import type { BillingFormData, BillingInfo } from "~/types/billing";
import { 
  formDataToBillingInfo, 
  billingInfoToFormData, 
  createEmptyBillingFormData,
  isBillingFormValid 
} from "~/types/billing";

// ==================== TIPI ====================

interface UserData {
  name: string;
  email: string;
  phone?: string;
  billingInfo?: BillingInfo;
}

type TabType = "profilo" | "fatturazione" | "notifiche";

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

  // ==================== TABS ====================

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: "profilo", label: "Profilo", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
    { id: "fatturazione", label: "Fatturazione", icon: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" },
    { id: "notifiche", label: "Notifiche", icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
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
      </div>
    </div>
  );
}
