"use client";

/**
 * Componente Admin - Approvazione Nuovi Utenti + Storico
 * Estratto da /dashboard/approvazioni/page.tsx per riuso con tab
 */

import React, { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  addDoc,
  deleteDoc,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface BillingAddress {
  street?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  country?: string;
}

interface PendingUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  role: string;
  registrationMethod?: string;
  createdAt: any;
  billingInfo?: {
    type?: string;
    firstName?: string;
    lastName?: string;
    businessName?: string;
    companyName?: string;
    vatNumber?: string;
    fiscalCode?: string;
    address?: string | BillingAddress;
    city?: string;
    postalCode?: string;
    province?: string;
    sdiCode?: string;
    pecEmail?: string;
    invoiceType?: string;
  };
}

interface SignedContract {
  id: string;
  documentTitle: string;
  documentVersion: string;
  documentContent?: string;
  fullName: string;
  fiscalCode: string;
  signatureImage: string;
  selfiePhotoUrl?: string;
  selfiePhotoBase64?: string;
  createdAt: any;
  metadata?: {
    ipAddress?: string;
    localTime?: string;
    userAgent?: string;
    geolocation?: { latitude: number; longitude: number };
  };
}

interface HistoryRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  action: "APPROVED" | "REJECTED";
  actionBy: string;
  actionAt: any;
  note?: string;
  billingInfo?: any;
  registrationMethod?: string;
}

type TabType = "pending" | "approved" | "rejected";

// Helper per formattare indirizzo
function formatAddress(billingInfo: PendingUser['billingInfo']): string {
  if (!billingInfo) return "-";
  
  if (billingInfo.address && typeof billingInfo.address === 'object') {
    const addr = billingInfo.address as BillingAddress;
    const parts = [
      addr.street,
      [addr.postalCode, addr.city].filter(Boolean).join(" "),
      addr.province ? `(${addr.province})` : null,
    ].filter(Boolean);
    return parts.join(", ") || "-";
  }
  
  if (typeof billingInfo.address === 'string') {
    const parts = [
      billingInfo.address,
      [billingInfo.postalCode, billingInfo.city].filter(Boolean).join(" "),
      billingInfo.province ? `(${billingInfo.province})` : null,
    ].filter(Boolean);
    return parts.join(", ") || "-";
  }
  
  const parts = [
    [billingInfo.postalCode, billingInfo.city].filter(Boolean).join(" "),
    billingInfo.province ? `(${billingInfo.province})` : null,
  ].filter(Boolean);
  return parts.join(", ") || "-";
}

export function ApprovazioniContent({ embedded = false }: { embedded?: boolean }) {
  const [activeTab, setActiveTab] = useState<TabType>("pending");
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [contracts, setContracts] = useState<Record<string, SignedContract[]>>({});
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [viewContract, setViewContract] = useState<SignedContract | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  // Carica dati
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadPendingUsers(), loadHistory()]);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingUsers = async () => {
    try {
      const usersQuery = query(
        collection(db, "users"),
        where("status", "==", "PENDING_APPROVAL")
      );
      
      const snapshot = await getDocs(usersQuery);
      
      const pendingUsers: PendingUser[] = [];
      const userContracts: Record<string, SignedContract[]> = {};
      
      for (const userDoc of snapshot.docs) {
        const userData = userDoc.data() as PendingUser;
        pendingUsers.push({
          ...userData,
          id: userDoc.id,
        });
        
        // Carica contratti firmati
        const contractsQuery = query(
          collection(db, "contractAcceptances"),
          where("userId", "==", userDoc.id),
          where("status", "==", "valid")
        );
        
        const contractsSnapshot = await getDocs(contractsQuery);
        userContracts[userDoc.id] = contractsSnapshot.docs.map(d => ({
          id: d.id,
          ...(d.data() as Record<string, any>),
        })) as SignedContract[];
      }
      
      pendingUsers.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      setUsers(pendingUsers);
      setContracts(userContracts);
    } catch (error) {
      console.error("Errore caricamento utenti:", error);
    }
  };

  const loadHistory = async () => {
    try {
      const historySnapshot = await getDocs(collection(db, "registrationHistory"));
      
      const records: HistoryRecord[] = historySnapshot.docs.map(d => ({
        id: d.id,
        ...(d.data() as Record<string, any>),
      })) as HistoryRecord[];
      
      // Ordina per data (più recenti prima)
      records.sort((a, b) => {
        const dateA = a.actionAt?.toDate?.() || new Date(0);
        const dateB = b.actionAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      setHistory(records);
    } catch (error) {
      console.error("Errore caricamento storico:", error);
    }
  };

  // Approva utente
  const handleApprove = async (user: PendingUser) => {
    if (!confirm(`Confermi l'approvazione di ${user.name}?`)) return;
    
    try {
      setProcessing(user.id);
      
      // Aggiorna status utente
      await updateDoc(doc(db, "users", user.id), {
        status: "ACTIVE",
        approvedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      // Salva nello storico
      await addDoc(collection(db, "registrationHistory"), {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userPhone: user.phone,
        action: "APPROVED",
        actionBy: "admin", // TODO: prendere da auth
        actionAt: Timestamp.now(),
        billingInfo: user.billingInfo || null,
        registrationMethod: user.registrationMethod || "self",
      });
      
      // Invia notifica all'utente con push
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Account Approvato! 🎉",
          message: "Il tuo account è stato approvato. Ora puoi accedere a tutte le funzionalità.",
          type: "SUCCESS",
          recipientRole: "PROPRIETARIO",
          recipientId: user.id,
          senderId: "system",
          senderName: "Sistema",
          link: "/proprietario",
        }),
      });
      
      // Invia email di approvazione
      let emailSent = false;
      try {
        const emailRes = await fetch("/api/auth/approval-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "approved",
            userEmail: user.email,
            userName: user.name,
          }),
        });
        const emailData = await emailRes.json();
        emailSent = emailRes.ok && emailData.success === true;
      } catch (emailErr) {
        console.warn("⚠️ Errore invio email approvazione:", emailErr);
      }
      
      // Aggiorna UI
      setUsers(prev => prev.filter(u => u.id !== user.id));
      await loadHistory();
      
      if (emailSent) {
        alert(`✅ ${user.name} è stato approvato!\n📧 Email di conferma inviata a ${user.email}`);
      } else {
        alert(`✅ ${user.name} è stato approvato!\n⚠️ Email non inviata — avvisa l'utente manualmente.`);
      }
      
    } catch (error) {
      console.error("Errore approvazione:", error);
      alert("Errore durante l'approvazione");
    } finally {
      setProcessing(null);
    }
  };

  // Rifiuta e CANCELLA utente
  const handleReject = async (user: PendingUser) => {
    try {
      setProcessing(user.id);
      
      // Salva nello storico PRIMA di cancellare
      await addDoc(collection(db, "registrationHistory"), {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userPhone: user.phone,
        action: "REJECTED",
        actionBy: "admin",
        actionAt: Timestamp.now(),
        note: rejectNote || "Richiesta non approvata",
        billingInfo: user.billingInfo || null,
        registrationMethod: user.registrationMethod || "self",
      });
      
      // Cancella contratti firmati
      const contractsToDelete = contracts[user.id] || [];
      for (const contract of contractsToDelete) {
        await deleteDoc(doc(db, "contractAcceptances", contract.id));
      }
      
      // CANCELLA l'utente dal database
      await deleteDoc(doc(db, "users", user.id));
      
      
      // Aggiorna UI
      setUsers(prev => prev.filter(u => u.id !== user.id));
      setShowRejectModal(null);
      setRejectNote("");
      await loadHistory();
      
      alert(`❌ ${user.name} è stato rifiutato e rimosso dal sistema.\nPotrà effettuare una nuova registrazione.`);
      
    } catch (error) {
      console.error("Errore rifiuto:", error);
      alert("Errore durante il rifiuto");
    } finally {
      setProcessing(null);
    }
  };

  // Formatta data
  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "-";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Filtra storico per tab
  const filteredHistory = history.filter(h => 
    activeTab === "approved" ? h.action === "APPROVED" : h.action === "REJECTED"
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "px-4 pt-3" : "p-6 max-w-7xl mx-auto"}>
      {/* Header — nascosto quando embedded */}
      {!embedded && (
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Gestione Registrazioni</h1>
        <p className="text-gray-500 mt-1">Approva o rifiuta le richieste di registrazione</p>
      </div>
      )}

      {/* Tabs — stile pill scrollabili quando embedded */}
      <div className={`flex gap-1.5 ${embedded ? "overflow-x-auto -mx-4 px-4 pb-2 mb-3" : "gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit"}`} style={embedded ? { scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } : {}}>
        <button
          onClick={() => setActiveTab("pending")}
          className={embedded
            ? `px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${activeTab === "pending" ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`
            : `px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === "pending" ? "bg-white text-amber-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          In attesa
          {users.length > 0 && (
            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${embedded ? "bg-white/25 text-white" : "bg-amber-500 text-white"}`}>
              {users.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("approved")}
          className={embedded
            ? `px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${activeTab === "approved" ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`
            : `px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === "approved" ? "bg-white text-green-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Approvati
          <span className={`ml-2 text-xs ${embedded ? "" : "text-gray-400"}`}>
            ({history.filter(h => h.action === "APPROVED").length})
          </span>
        </button>
        <button
          onClick={() => setActiveTab("rejected")}
          className={embedded
            ? `px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${activeTab === "rejected" ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`
            : `px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === "rejected" ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Rifiutati
          <span className={`ml-2 text-xs ${embedded ? "" : "text-gray-400"}`}>
            ({history.filter(h => h.action === "REJECTED").length})
          </span>
        </button>
      </div>

      {/* TAB: In attesa */}
      {activeTab === "pending" && (
        <>
          {users.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Nessuna richiesta in sospeso</h2>
              <p className="text-gray-500">Tutte le richieste di approvazione sono state gestite.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {users.map((user) => {
                const initials = (user.name || "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                const hasContracts = contracts[user.id]?.length > 0;
                
                return (
                <div key={user.id} className="bg-white rounded-[20px] overflow-hidden border border-slate-100">
                  {/* Header gradient con nome */}
                  <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-400 px-4 pt-3.5 pb-3.5">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[9px] font-semibold px-2.5 py-1 rounded-md bg-white/20 text-white tracking-wider">NUOVA REGISTRAZIONE</span>
                      <span className="text-[11px] text-white/70">{formatDate(user.createdAt)}</span>
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="w-[42px] h-[42px] rounded-[13px] bg-white/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[15px] font-semibold">{initials}</span>
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-white">{user.name}</p>
                        <p className="text-[11px] text-white/70">Proprietario</p>
                      </div>
                    </div>
                  </div>

                  {/* Info contatto */}
                  <div className="px-4 pt-3 pb-1">
                    <div className="flex flex-col gap-[5px]">
                      <div className="flex items-center gap-2">
                        <svg className="w-[13px] h-[13px] text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[12px] text-slate-600 truncate">{user.email}</span>
                      </div>
                      {user.phone && (
                      <div className="flex items-center gap-2">
                        <svg className="w-[13px] h-[13px] text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span className="text-[12px] text-slate-600">{user.phone}</span>
                      </div>
                      )}
                    </div>
                  </div>

                  {/* Azioni */}
                  <div className="flex gap-[6px] px-4 pt-2.5 pb-3.5">
                    <button
                      onClick={() => handleApprove(user)}
                      disabled={processing === user.id}
                      className="flex-1 py-[10px] rounded-xl bg-emerald-500 text-white text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50"
                    >
                      {processing === user.id ? "..." : "Approva"}
                    </button>
                    <button
                      onClick={() => setShowRejectModal(user.id)}
                      disabled={processing === user.id}
                      className="flex-1 py-[10px] rounded-xl bg-red-500 text-white text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50"
                    >
                      Rifiuta
                    </button>
                    <button
                      onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                      className="py-[10px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-[12px] font-medium active:scale-95 transition-all flex items-center gap-1.5"
                    >
                      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Dettagli
                    </button>
                  </div>

                  {/* Dettagli espansi — Modal-style dentro la card */}
                  {expandedUser === user.id && (
                    <div className="border-t border-slate-100 px-4 py-3.5 bg-slate-50/50 space-y-2.5">
                      {/* Fatturazione */}
                      <div className="bg-white rounded-[14px] p-3.5">
                        <p className="text-[10px] font-semibold text-slate-400 tracking-wider mb-2.5">FATTURAZIONE</p>
                        {user.billingInfo ? (
                          <div className="space-y-2">
                            {(user.billingInfo.businessName || user.billingInfo.companyName) && (
                              <div className="flex items-center gap-2.5">
                                <div className="w-[28px] h-[28px] rounded-[8px] bg-amber-50 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-[13px] h-[13px] text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-400">Ragione Sociale</p>
                                  <p className="text-[12px] text-slate-800 font-medium">{user.billingInfo.businessName || user.billingInfo.companyName}</p>
                                </div>
                              </div>
                            )}
                            <div className="flex gap-4 ml-[38px]">
                              {user.billingInfo.vatNumber && (
                                <div>
                                  <p className="text-[10px] text-slate-400">P.IVA</p>
                                  <p className="text-[11px] text-slate-600 font-mono">{user.billingInfo.vatNumber}</p>
                                </div>
                              )}
                              {user.billingInfo.fiscalCode && (
                                <div>
                                  <p className="text-[10px] text-slate-400">C.F.</p>
                                  <p className="text-[11px] text-slate-600 font-mono">{user.billingInfo.fiscalCode}</p>
                                </div>
                              )}
                            </div>
                            {user.billingInfo.sdiCode && (
                              <div className="ml-[38px]">
                                <p className="text-[10px] text-slate-400">SDI</p>
                                <p className="text-[11px] text-slate-600 font-mono">{user.billingInfo.sdiCode}</p>
                              </div>
                            )}
                            {user.billingInfo.pecEmail && (
                              <div className="ml-[38px]">
                                <p className="text-[10px] text-slate-400">PEC</p>
                                <p className="text-[11px] text-slate-600">{user.billingInfo.pecEmail}</p>
                              </div>
                            )}
                            <div className="ml-[38px]">
                              <p className="text-[10px] text-slate-400">Indirizzo</p>
                              <p className="text-[11px] text-slate-600">{formatAddress(user.billingInfo)}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">Nessun dato di fatturazione</p>
                        )}
                      </div>

                      {/* Documenti / Contratti */}
                      <div className="bg-white rounded-[14px] p-3.5">
                        <p className="text-[10px] font-semibold text-slate-400 tracking-wider mb-2.5">DOCUMENTI</p>
                        {hasContracts ? (
                          <div className="space-y-2">
                            {contracts[user.id].map((contract) => (
                              <button
                                key={contract.id}
                                onClick={() => setViewContract(contract)}
                                className="w-full flex items-center gap-2.5 bg-slate-50 rounded-[12px] p-3 border border-slate-100 active:scale-[.98] transition-all text-left"
                              >
                                <div className="w-[28px] h-[28px] rounded-[8px] bg-blue-50 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-[13px] h-[13px] text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-medium text-slate-800">{contract.documentTitle || "Allegato D"}</p>
                                  <p className="text-[10px] text-slate-400">v{contract.documentVersion || "1.0"} · Firmato: {formatDate(contract.createdAt)}</p>
                                </div>
                                <svg className="w-[14px] h-[14px] text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">Nessun contratto firmato</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB: Storico (Approvati/Rifiutati) */}
      {(activeTab === "approved" || activeTab === "rejected") && (
        <>
          {filteredHistory.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
              <div className={`w-20 h-20 ${activeTab === "approved" ? "bg-green-100" : "bg-red-100"} rounded-full flex items-center justify-center mx-auto mb-4`}>
                <svg className={`w-10 h-10 ${activeTab === "approved" ? "text-green-500" : "text-red-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Nessun record {activeTab === "approved" ? "approvato" : "rifiutato"}
              </h2>
              <p className="text-gray-500">Lo storico è vuoto.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Utente</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Metodo</th>
                    {activeTab === "rejected" && (
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Motivo</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredHistory.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                            activeTab === "approved" 
                              ? "bg-gradient-to-br from-green-400 to-emerald-500" 
                              : "bg-gradient-to-br from-red-400 to-rose-500"
                          }`}>
                            {record.userName?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{record.userName}</p>
                            <p className="text-sm text-gray-400">{record.userPhone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{record.userEmail}</td>
                      <td className="px-6 py-4 text-gray-600">{formatDate(record.actionAt)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          record.registrationMethod === "google"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-700"
                        }`}>
                          {record.registrationMethod === "google" ? "Google" : "Email"}
                        </span>
                      </td>
                      {activeTab === "rejected" && (
                        <td className="px-6 py-4 text-gray-500 text-sm max-w-xs truncate">
                          {record.note || "-"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal Visualizza Contratto */}
      {viewContract && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-2 md:p-6" onClick={() => setViewContract(null)}>
          <div className="bg-white rounded-[20px] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-400 px-4 pt-3 pb-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[15px] font-bold text-white">{viewContract.documentTitle || "Allegato D"}</h2>
                  <p className="text-white/70 text-[11px]">v{viewContract.documentVersion || "1.0"} · Firmato: {formatDate(viewContract.createdAt)}</p>
                </div>
                <button onClick={() => setViewContract(null)} className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center active:scale-90 transition-all">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* Content scrollabile */}
            <div className="flex-1 overflow-y-auto">
              {/* Testo contratto */}
              {viewContract.documentContent ? (
                <div className="p-4 md:p-6 prose prose-sm max-w-none text-slate-700 text-[12px] leading-relaxed" dangerouslySetInnerHTML={{ __html: viewContract.documentContent }} />
              ) : (
                <div className="p-6 text-center text-slate-400 text-[12px]">Testo del contratto non disponibile in questa vista.</div>
              )}

              {/* Prove di firma */}
              <div className="border-t border-slate-200 p-4 md:p-6 bg-slate-50">
                <p className="text-[10px] font-semibold text-slate-400 tracking-wider mb-3">PROVE DI FIRMA</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Dati firmatario */}
                  <div className="bg-white rounded-[12px] p-3 border border-slate-100">
                    <p className="text-[9px] font-semibold text-slate-400 tracking-wider mb-2">FIRMATARIO</p>
                    <div className="space-y-1">
                      <div><p className="text-[10px] text-slate-400">Nome</p><p className="text-[12px] text-slate-800 font-medium">{viewContract.fullName}</p></div>
                      {viewContract.fiscalCode && <div><p className="text-[10px] text-slate-400">Codice Fiscale</p><p className="text-[12px] text-slate-800 font-mono">{viewContract.fiscalCode}</p></div>}
                      <div><p className="text-[10px] text-slate-400">Data firma</p><p className="text-[12px] text-slate-800">{formatDate(viewContract.createdAt)}</p></div>
                      {viewContract.metadata?.ipAddress && <div><p className="text-[10px] text-slate-400">Indirizzo IP</p><p className="text-[12px] text-slate-800 font-mono">{viewContract.metadata.ipAddress}</p></div>}
                      {viewContract.metadata?.userAgent && <div><p className="text-[10px] text-slate-400">Device</p><p className="text-[11px] text-slate-600 break-all">{viewContract.metadata.userAgent}</p></div>}
                      {viewContract.metadata?.geolocation && <div><p className="text-[10px] text-slate-400">GPS</p><p className="text-[12px] text-slate-800 font-mono">{viewContract.metadata.geolocation.latitude?.toFixed(6)}, {viewContract.metadata.geolocation.longitude?.toFixed(6)}</p></div>}
                    </div>
                  </div>
                  {/* Firma + Selfie */}
                  <div className="space-y-3">
                    {viewContract.signatureImage && (
                      <div className="bg-white rounded-[12px] p-3 border border-slate-100">
                        <p className="text-[9px] font-semibold text-slate-400 tracking-wider mb-2">FIRMA DIGITALE</p>
                        <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-3">
                          <img src={viewContract.signatureImage} alt="Firma" className="max-h-24 mx-auto" />
                        </div>
                      </div>
                    )}
                    {(viewContract.selfiePhotoUrl || viewContract.selfiePhotoBase64) && (
                      <div className="bg-white rounded-[12px] p-3 border border-emerald-100">
                        <p className="text-[9px] font-semibold text-emerald-500 tracking-wider mb-2">FOTO IDENTITÀ</p>
                        <div className="border border-emerald-200 rounded-[10px] overflow-hidden bg-emerald-50">
                          <img src={viewContract.selfiePhotoUrl || viewContract.selfiePhotoBase64} alt="Selfie" className="w-full max-h-48 object-cover" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rifiuto */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Rifiuta Richiesta</h3>
                <p className="text-sm text-gray-500">L'utente verrà rimosso dal sistema</p>
              </div>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-amber-800 text-sm">
                ⚠️ L'utente verrà <strong>eliminato</strong> e potrà effettuare una nuova registrazione in futuro.
              </p>
            </div>
            
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Motivo del rifiuto (opzionale)..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
              rows={3}
            />
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectNote("");
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  const user = users.find(u => u.id === showRejectModal);
                  if (user) handleReject(user);
                }}
                disabled={processing === showRejectModal}
                className="flex-1 py-3 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 disabled:opacity-50"
              >
                {processing === showRejectModal ? "..." : "Rifiuta e Elimina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
