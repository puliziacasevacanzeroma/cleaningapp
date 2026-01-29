/**
 * Pagina Admin - Approvazione Nuovi Utenti + Storico
 * 
 * Tabs:
 * - In attesa: utenti PENDING_APPROVAL
 * - Approvati: storico approvazioni
 * - Rifiutati: storico rifiuti (utenti cancellati)
 * 
 * Quando rifiutato: utente CANCELLATO dal DB (può ri-registrarsi)
 * 
 * URL: /dashboard/approvazioni
 */

"use client";

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
    businessName?: string;
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
  fullName: string;
  fiscalCode: string;
  signatureImage: string;
  createdAt: any;
  metadata?: {
    ipAddress?: string;
    localTime?: string;
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

export default function ApprovazioniPage() {
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
          ...d.data(),
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
        ...d.data(),
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
      
      // Invia notifica all'utente
      await addDoc(collection(db, "notifications"), {
        title: "Account Approvato! 🎉",
        message: "Il tuo account è stato approvato. Ora puoi accedere a tutte le funzionalità.",
        type: "SUCCESS",
        recipientRole: "PROPRIETARIO",
        recipientId: user.id,
        senderId: "system",
        senderName: "Sistema",
        status: "UNREAD",
        link: "/proprietario",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      // Aggiorna UI
      setUsers(prev => prev.filter(u => u.id !== user.id));
      await loadHistory();
      
      alert(`✅ ${user.name} è stato approvato!`);
      
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
      
      console.log(`🗑️ Utente ${user.email} cancellato - può ri-registrarsi`);
      
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
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Gestione Registrazioni</h1>
        <p className="text-gray-500 mt-1">Approva o rifiuta le richieste di registrazione</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === "pending"
              ? "bg-white text-amber-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          In attesa
          {users.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full">
              {users.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("approved")}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === "approved"
              ? "bg-white text-green-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Approvati
          <span className="ml-2 text-xs text-gray-400">
            ({history.filter(h => h.action === "APPROVED").length})
          </span>
        </button>
        <button
          onClick={() => setActiveTab("rejected")}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === "rejected"
              ? "bg-white text-red-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Rifiutati
          <span className="ml-2 text-xs text-gray-400">
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
            <div className="space-y-6">
              {users.map((user) => (
                <div key={user.id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                  {/* Header utente */}
                  <div className="p-6 border-b border-gray-100">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
                          {user.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{user.name}</h3>
                          <p className="text-gray-500">{user.email}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-sm text-gray-400">{user.phone}</span>
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                              In attesa
                            </span>
                            {user.registrationMethod === "google" && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                Google
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Registrato il</p>
                        <p className="text-sm font-medium text-gray-700">{formatDate(user.createdAt)}</p>
                      </div>
                    </div>

                    {/* Azioni */}
                    <div className="flex items-center gap-3 mt-4">
                      <button
                        onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                      >
                        {expandedUser === user.id ? "Nascondi dettagli" : "Vedi dettagli"}
                      </button>
                      <button
                        onClick={() => handleApprove(user)}
                        disabled={processing === user.id}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50"
                      >
                        {processing === user.id ? "..." : "✓ Approva"}
                      </button>
                      <button
                        onClick={() => setShowRejectModal(user.id)}
                        disabled={processing === user.id}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
                      >
                        ✕ Rifiuta
                      </button>
                    </div>
                  </div>

                  {/* Dettagli espansi */}
                  {expandedUser === user.id && (
                    <div className="p-6 bg-gray-50">
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Dati Fatturazione */}
                        <div className="bg-white rounded-xl p-5 shadow-sm">
                          <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                            </svg>
                            Dati Fatturazione
                          </h4>
                          
                          {user.billingInfo ? (
                            <div className="space-y-2 text-sm">
                              {user.billingInfo.invoiceType && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Tipo:</span>
                                  <span className="font-medium">{user.billingInfo.invoiceType === "company" ? "Azienda" : "Privato"}</span>
                                </div>
                              )}
                              {user.billingInfo.businessName && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Ragione Sociale:</span>
                                  <span className="font-medium">{user.billingInfo.businessName}</span>
                                </div>
                              )}
                              {user.billingInfo.vatNumber && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">P.IVA:</span>
                                  <span className="font-medium font-mono">{user.billingInfo.vatNumber}</span>
                                </div>
                              )}
                              {user.billingInfo.fiscalCode && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Codice Fiscale:</span>
                                  <span className="font-medium font-mono">{user.billingInfo.fiscalCode}</span>
                                </div>
                              )}
                              {user.billingInfo.sdiCode && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Codice SDI:</span>
                                  <span className="font-medium font-mono">{user.billingInfo.sdiCode}</span>
                                </div>
                              )}
                              {user.billingInfo.pecEmail && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">PEC:</span>
                                  <span className="font-medium">{user.billingInfo.pecEmail}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-gray-500">Indirizzo:</span>
                                <span className="font-medium text-right">{formatAddress(user.billingInfo)}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-gray-400 italic">Nessun dato di fatturazione</p>
                          )}
                        </div>

                        {/* Contratti Firmati */}
                        <div className="bg-white rounded-xl p-5 shadow-sm">
                          <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Contratti Firmati
                          </h4>
                          
                          {contracts[user.id]?.length > 0 ? (
                            <div className="space-y-3">
                              {contracts[user.id].map((contract) => (
                                <div key={contract.id} className="p-3 bg-gray-50 rounded-lg">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className="font-medium text-gray-900">{contract.documentTitle || "Contratto"}</p>
                                      <p className="text-xs text-gray-500">
                                        v{contract.documentVersion || "1.0"} • {formatDate(contract.createdAt)}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {contract.fullName} ({contract.fiscalCode})
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => setViewContract(contract)}
                                      className="px-3 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100"
                                    >
                                      Visualizza
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-400 italic">Nessun contratto firmato</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{viewContract.documentTitle || "Contratto"}</h3>
                <p className="text-sm text-gray-500">Versione {viewContract.documentVersion || "1.0"}</p>
              </div>
              <button
                onClick={() => setViewContract(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <h4 className="font-medium text-gray-900 mb-3">Dati Firmatario</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Nome:</span>
                    <p className="font-medium">{viewContract.fullName}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Codice Fiscale:</span>
                    <p className="font-medium font-mono">{viewContract.fiscalCode}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Data Firma:</span>
                    <p className="font-medium">{formatDate(viewContract.createdAt)}</p>
                  </div>
                  {viewContract.metadata?.ipAddress && (
                    <div>
                      <span className="text-gray-500">IP:</span>
                      <p className="font-medium font-mono">{viewContract.metadata.ipAddress}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-medium text-gray-900 mb-3">Firma Digitale</h4>
                <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
                  {viewContract.signatureImage ? (
                    <img src={viewContract.signatureImage} alt="Firma" className="max-h-32 mx-auto" />
                  ) : (
                    <p className="text-gray-400 text-center">Firma non disponibile</p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setViewContract(null)}
                className="w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200"
              >
                Chiudi
              </button>
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
