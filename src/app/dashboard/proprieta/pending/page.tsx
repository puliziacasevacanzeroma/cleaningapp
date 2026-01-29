"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, orderBy, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface Property {
  id: string;
  name: string;
  address: string;
  ownerName: string;
  ownerEmail: string;
  ownerId: string;
  status: string;
  createdAt: string;
  deactivationRequested?: boolean;
  deactivationReason?: string;
  deactivationRequestedAt?: string;
  maxGuests?: number;
  bathrooms?: number;
  bedrooms?: number;
}

// ============================================
// MODAL APPROVAZIONE NUOVA PROPRIETÀ (con prezzo obbligatorio)
// ============================================
interface ApproveModalProps {
  isOpen: boolean;
  property: Property | null;
  onClose: () => void;
  onConfirm: (cleaningPrice: number) => void;
}

function ApproveModal({ isOpen, property, onClose, onConfirm }: ApproveModalProps) {
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset quando si apre la modal
  useEffect(() => {
    if (isOpen) {
      setPrice('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen || !property) return null;

  const handleConfirm = async () => {
    const numPrice = parseFloat(price);
    if (!price || isNaN(numPrice) || numPrice <= 0) {
      setError('Inserisci un prezzo valido maggiore di 0');
      return;
    }
    setError('');
    setSubmitting(true);
    await onConfirm(numPrice);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-emerald-100">
            <span className="text-2xl">✓</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Approva Proprietà</h3>
            <p className="text-sm text-slate-500">{property.name}</p>
          </div>
        </div>

        {/* Info proprietà */}
        <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-500">Indirizzo</p>
              <p className="font-medium text-slate-800">{property.address || '-'}</p>
            </div>
            <div>
              <p className="text-slate-500">Proprietario</p>
              <p className="font-medium text-slate-800">{property.ownerName || property.ownerEmail || '-'}</p>
            </div>
            {property.maxGuests && (
              <div>
                <p className="text-slate-500">Max Ospiti</p>
                <p className="font-medium text-slate-800">{property.maxGuests}</p>
              </div>
            )}
            {property.bathrooms && (
              <div>
                <p className="text-slate-500">Bagni</p>
                <p className="font-medium text-slate-800">{property.bathrooms}</p>
              </div>
            )}
          </div>
        </div>

        {/* Prezzo OBBLIGATORIO */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            💰 Prezzo Pulizia Contratto <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">€</span>
            <input
              type="number"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setError('');
              }}
              placeholder="Es: 50"
              min="1"
              step="0.01"
              className={`w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-lg font-semibold ${
                error ? 'border-red-300 bg-red-50' : 'border-slate-200'
              }`}
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-red-500 mt-1">{error}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            Questo sarà il prezzo base per ogni pulizia di questa proprietà
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200"
            disabled={submitting}
          >
            Annulla
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || !price}
            className="flex-1 py-3 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Approvazione...
              </span>
            ) : '✓ Approva con Prezzo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MODAL per conferma azione (cancellazione/rifiuto)
// ============================================
interface ActionModalProps {
  isOpen: boolean;
  type: 'approve' | 'reject';
  property: Property | null;
  futureBookings: number;
  futureCleanings: number;
  loadingCounts: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

function ActionModal({ isOpen, type, property, futureBookings, futureCleanings, loadingCounts, onClose, onConfirm }: ActionModalProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !property) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    await onConfirm(note);
    setSubmitting(false);
    setNote('');
  };

  const hasWarnings = type === 'approve' && (futureBookings > 0 || futureCleanings > 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${type === 'approve' ? 'bg-red-100' : 'bg-slate-100'}`}>
            <span className="text-2xl">{type === 'approve' ? '🗑️' : '✗'}</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              {type === 'approve' ? 'Conferma Cancellazione' : 'Rifiuta Richiesta'}
            </h3>
            <p className="text-sm text-slate-500">{property.name}</p>
          </div>
        </div>

        {/* Warning prenotazioni/pulizie future */}
        {hasWarnings && !loadingCounts && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="font-medium text-amber-800 mb-2">⚠️ Attenzione!</p>
            <ul className="text-sm text-amber-700 space-y-1">
              {futureBookings > 0 && (
                <li>• {futureBookings} prenotazioni future verranno cancellate</li>
              )}
              {futureCleanings > 0 && (
                <li>• {futureCleanings} pulizie programmate verranno annullate</li>
              )}
            </ul>
          </div>
        )}

        {loadingCounts && type === 'approve' && (
          <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-sm text-slate-500 flex items-center gap-2">
              <span className="animate-spin">⏳</span> Verifica prenotazioni e pulizie...
            </p>
          </div>
        )}

        {/* Nota admin */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Nota per il proprietario (opzionale)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={type === 'approve' 
              ? "Es: Proprietà rimossa come richiesto..." 
              : "Es: Ci sono prenotazioni attive, riproviamo tra un mese..."}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200"
            disabled={submitting}
          >
            Annulla
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || loadingCounts}
            className={`flex-1 py-3 text-white font-medium rounded-xl disabled:opacity-50 ${
              type === 'approve' 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-slate-600 hover:bg-slate-700'
            }`}
          >
            {submitting ? '...' : type === 'approve' ? 'Cancella Proprietà' : 'Rifiuta Richiesta'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProprietaPendingPage() {
  const [pendingProperties, setPendingProperties] = useState<Property[]>([]);
  const [deactivationRequests, setDeactivationRequests] = useState<Property[]>([]);
  const [inactiveProperties, setInactiveProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'new' | 'deactivation' | 'inactive'>('new');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Stati per modal approvazione NUOVA proprietà (con prezzo)
  const [approveModal, setApproveModal] = useState<{ isOpen: boolean; property: Property | null }>({
    isOpen: false,
    property: null
  });
  
  // Stati per modal azione (cancellazione/rifiuto)
  const [actionModal, setActionModal] = useState<{ isOpen: boolean; type: 'approve' | 'reject'; property: Property | null }>({
    isOpen: false,
    type: 'approve',
    property: null
  });
  const [futureBookings, setFutureBookings] = useState(0);
  const [futureCleanings, setFutureCleanings] = useState(0);
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Listener realtime Firestore - MOLTO più veloce!
  useEffect(() => {
    console.log("🔥 Avvio listener realtime proprietà pending...");
    
    const unsubscribe = onSnapshot(
      query(collection(db, "properties"), orderBy("name", "asc")),
      (snapshot) => {
        console.log("📦 Snapshot ricevuto:", snapshot.docs.length, "proprietà");
        
        const pending: Property[] = [];
        const deactivation: Property[] = [];
        const inactive: Property[] = [];
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const property: Property = {
            id: doc.id,
            name: data.name || "",
            address: data.address || "",
            ownerName: data.ownerName || "",
            ownerEmail: data.ownerEmail || "",
            ownerId: data.ownerId || "",
            status: data.status || "",
            createdAt: data.createdAt?.toDate?.()?.toISOString() || "",
            deactivationRequested: data.deactivationRequested || false,
            deactivationReason: data.deactivationReason || "",
            deactivationRequestedAt: data.deactivationRequestedAt?.toDate?.()?.toISOString() || "",
            // Campi extra per la modal di approvazione
            maxGuests: data.maxGuests || undefined,
            bathrooms: data.bathrooms || undefined,
            bedrooms: data.bedrooms || undefined,
          };
          
          // Richieste di disattivazione (proprietà ACTIVE con flag) o PENDING_DELETION
          if (data.deactivationRequested && data.status === "ACTIVE") {
            deactivation.push(property);
          }
          else if (data.status === "PENDING_DELETION") {
            deactivation.push(property);
          }
          // Nuove proprietà in attesa
          else if (data.status === "PENDING") {
            pending.push(property);
          }
          // Proprietà disattivate/sospese
          else if (data.status === "INACTIVE" || data.status === "SUSPENDED" || data.status === "DELETED") {
            inactive.push(property);
          }
        });
        
        console.log("📊 Risultati:", {
          pending: pending.length,
          deactivation: deactivation.length,
          inactive: inactive.length
        });
        
        setPendingProperties(pending);
        setDeactivationRequests(deactivation);
        setInactiveProperties(inactive);
        setLoading(false);
        
        // Auto-select tab con richieste
        if (deactivation.length > 0 && pending.length === 0) {
          setActiveTab('deactivation');
        }
      },
      (error) => {
        console.error("Errore listener:", error);
        setLoading(false);
      }
    );
    
    return () => unsubscribe();
  }, []);

  // Funzione per caricare conteggi prenotazioni/pulizie future
  const loadFutureCounts = async (propertyId: string) => {
    setLoadingCounts(true);
    try {
      const now = new Date();
      
      // Conta prenotazioni future
      const bookingsQuery = query(
        collection(db, "bookings"),
        where("propertyId", "==", propertyId),
        where("status", "==", "confirmed")
      );
      const bookingsSnap = await getDocs(bookingsQuery);
      const futureBookingsCount = bookingsSnap.docs.filter(doc => {
        const data = doc.data();
        const checkIn = data.checkIn?.toDate?.() || new Date(data.checkIn);
        return checkIn > now;
      }).length;
      
      // Conta pulizie future
      const cleaningsQuery = query(
        collection(db, "cleanings"),
        where("propertyId", "==", propertyId),
        where("status", "in", ["PENDING", "SCHEDULED", "IN_PROGRESS"])
      );
      const cleaningsSnap = await getDocs(cleaningsQuery);
      const futureCleaningsCount = cleaningsSnap.docs.length;
      
      setFutureBookings(futureBookingsCount);
      setFutureCleanings(futureCleaningsCount);
    } catch (error) {
      console.error("Errore caricamento conteggi:", error);
    } finally {
      setLoadingCounts(false);
    }
  };

  // Apre modal per approvazione
  const openApproveModal = async (property: Property) => {
    setActionModal({ isOpen: true, type: 'approve', property });
    await loadFutureCounts(property.id);
  };

  // Apre modal per rifiuto
  const openRejectModal = (property: Property) => {
    setActionModal({ isOpen: true, type: 'reject', property });
    setFutureBookings(0);
    setFutureCleanings(0);
  };

  // Chiude modal
  const closeActionModal = () => {
    setActionModal({ isOpen: false, type: 'approve', property: null });
    setFutureBookings(0);
    setFutureCleanings(0);
  };

  // Apre modal approvazione nuova proprietà
  const openApproveNewModal = (property: Property) => {
    setApproveModal({ isOpen: true, property });
  };

  // Chiude modal approvazione
  const closeApproveModal = () => {
    setApproveModal({ isOpen: false, property: null });
  };

  // Approva nuova proprietà CON PREZZO
  const handleApproveWithPrice = async (cleaningPrice: number) => {
    const property = approveModal.property;
    if (!property) return;
    
    setActionLoading(property.id);
    try {
      // Salva prezzo E status in un'unica chiamata
      const res = await fetch(`/api/properties/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          status: "ACTIVE",
          cleaningPrice: cleaningPrice 
        }),
      });
      
      if (!res.ok) {
        throw new Error("Errore nell'approvazione");
      }

      // Invia notifica al proprietario
      if (property.ownerId) {
        try {
          const notifRes = await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: "Proprietà Approvata! 🎉",
              message: `La tua proprietà "${property.name}" è stata approvata ed è ora attiva. Prezzo pulizia: €${cleaningPrice}`,
              type: "SUCCESS",
              recipientRole: "PROPRIETARIO",
              recipientId: property.ownerId,
              senderId: "system",
              senderName: "Sistema",
            }),
          });
          if (notifRes.ok) {
            console.log('📬 Notifica approvazione inviata a:', property.ownerId);
          } else {
            const errData = await notifRes.json();
            console.error('❌ Errore invio notifica:', errData);
          }
        } catch (notifErr) {
          console.error('❌ Errore invio notifica:', notifErr);
        }
      }

      closeApproveModal();
      // Il listener si aggiornerà automaticamente
    } catch (error) {
      console.error("Errore approvazione:", error);
      alert("Errore nell'approvazione");
    }
    setActionLoading(null);
  };

  // VECCHIA funzione - ora apre la modal invece di approvare direttamente
  const handleApprove = async (id: string) => {
    // Trova la proprietà e apri la modal
    const property = pendingProperties.find(p => p.id === id);
    if (property) {
      openApproveNewModal(property);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questa proprietà?")) return;
    setActionLoading(id);
    try {
      console.log("🗑️ Eliminazione proprietà:", id);
      const res = await fetch(`/api/properties/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      console.log("🗑️ Risposta eliminazione:", res.status, data);
      
      if (!res.ok) {
        alert(`Errore nell'eliminazione: ${data.error || 'Errore sconosciuto'}`);
      } else {
        console.log("✅ Proprietà eliminata con successo:", data);
      }
      // Il listener si aggiornerà automaticamente
    } catch (error) {
      console.error("Errore rifiuto:", error);
      alert("Errore nell'eliminazione");
    }
    setActionLoading(null);
  };

  const handleDeactivate = async (id: string) => {
    setActionLoading(id);
    try {
      const response = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "INACTIVE", deactivationRequested: false }),
      });
      
      if (!response.ok) {
        alert("Errore nella disattivazione");
      }
      // Il listener si aggiornerà automaticamente
    } catch (error) {
      console.error("Errore disattivazione:", error);
      alert("Errore nella disattivazione");
    }
    setActionLoading(null);
  };

  const handleRejectDeactivation = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivationRequested: false }),
      });
      if (!res.ok) {
        alert("Errore nel rifiuto");
      }
      // Il listener si aggiornerà automaticamente
    } catch (error) {
      console.error("Errore rifiuto disattivazione:", error);
      alert("Errore nel rifiuto");
    }
    setActionLoading(null);
  };

  const handleReactivate = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE", deactivationRequested: false }),
      });
      if (!res.ok) {
        alert("Errore nella riattivazione");
      }
      // Il listener si aggiornerà automaticamente
    } catch (error) {
      console.error("Errore riattivazione:", error);
      alert("Errore nella riattivazione");
    }
    setActionLoading(null);
  };

  const handleDeletePermanent = async (id: string) => {
    if (!confirm("⚠️ ATTENZIONE: Questa azione eliminerà PERMANENTEMENTE la proprietà. Continuare?")) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert("Errore nell'eliminazione");
      }
      // Il listener si aggiornerà automaticamente
    } catch (error) {
      console.error("Errore eliminazione:", error);
      alert("Errore nell'eliminazione");
    }
    setActionLoading(null);
  };

  // Handler per approvare cancellazione (usa API deletion-requests)
  const handleApproveDeletion = async (propertyId: string, adminNote: string = "") => {
    setActionLoading(propertyId);
    try {
      // Prima trova la richiesta di cancellazione
      const listRes = await fetch(`/api/deletion-requests?propertyId=${propertyId}&status=pending`);
      const listData = await listRes.json();
      
      // Trova info proprietà per la notifica
      const property = deactivationRequests.find(p => p.id === propertyId);
      
      if (!listData.requests || listData.requests.length === 0) {
        // Fallback: usa il vecchio metodo se non c'è richiesta nella collection
        const res = await fetch(`/api/properties/${propertyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "DELETED", deactivationRequested: false }),
        });
        if (!res.ok) throw new Error("Errore cancellazione");
        
        // Invia notifica al proprietario
        if (property?.ownerId) {
          await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: "Richiesta Cancellazione Approvata",
              message: `La tua richiesta di cancellazione per "${property.name}" è stata approvata. La proprietà è stata rimossa dal sistema.${adminNote ? ` Nota: ${adminNote}` : ''}`,
              type: "SUCCESS",
              recipientRole: "PROPRIETARIO",
              recipientId: property.ownerId,
              senderId: "system",
              senderName: "Sistema",
            }),
          });
          console.log('📬 Notifica approvazione inviata (fallback) a:', property.ownerId);
        }
      } else {
        // Approva la richiesta tramite API (notifica già inclusa nell'API)
        const requestId = listData.requests[0].id;
        const res = await fetch(`/api/deletion-requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved", adminNote }),
        });
        if (!res.ok) throw new Error("Errore approvazione");
      }
      closeActionModal();
      // Il listener si aggiornerà automaticamente
    } catch (error) {
      console.error("Errore approvazione cancellazione:", error);
      alert("Errore nell'approvazione");
    }
    setActionLoading(null);
  };

  // Handler per rifiutare cancellazione (usa API deletion-requests)
  const handleRejectDeletion = async (propertyId: string, adminNote: string = "") => {
    setActionLoading(propertyId);
    try {
      // Prima trova la richiesta di cancellazione
      const listRes = await fetch(`/api/deletion-requests?propertyId=${propertyId}&status=pending`);
      const listData = await listRes.json();
      
      // Trova info proprietà per la notifica
      const property = deactivationRequests.find(p => p.id === propertyId);
      
      if (!listData.requests || listData.requests.length === 0) {
        // Fallback: usa il vecchio metodo + invia notifica manualmente
        const res = await fetch(`/api/properties/${propertyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE", deactivationRequested: false }),
        });
        if (!res.ok) throw new Error("Errore ripristino");
        
        // Invia notifica al proprietario
        if (property?.ownerId) {
          await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: "Richiesta Cancellazione Rifiutata",
              message: `La tua richiesta di cancellazione per "${property.name}" è stata rifiutata.${adminNote ? ` Motivo: ${adminNote}` : ''} La proprietà rimane attiva.`,
              type: "WARNING",
              recipientRole: "PROPRIETARIO",
              recipientId: property.ownerId,
              senderId: "system",
              senderName: "Sistema",
            }),
          });
          console.log('📬 Notifica rifiuto inviata (fallback) a:', property.ownerId);
        }
      } else {
        // Rifiuta la richiesta tramite API (notifica già inclusa nell'API)
        const requestId = listData.requests[0].id;
        const res = await fetch(`/api/deletion-requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "rejected", adminNote: adminNote || "Richiesta rifiutata" }),
        });
        if (!res.ok) throw new Error("Errore rifiuto");
      }
      closeActionModal();
      // Il listener si aggiornerà automaticamente
    } catch (error) {
      console.error("Errore rifiuto cancellazione:", error);
      alert("Errore nel rifiuto");
    }
    setActionLoading(null);
  };

  const totalPending = pendingProperties.length + deactivationRequests.length;

  if (loading) {
    return (
      <div className="p-4 lg:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-64 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-slate-200 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <Link href="/dashboard/proprieta" className="text-sky-500 hover:underline text-sm">
          ← Torna alle proprietà
        </Link>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 mt-2">
          Gestione Richieste
        </h1>
        <p className="text-slate-500">{totalPending} richieste da gestire • {inactiveProperties.length} disattivate</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveTab('new')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'new' 
              ? 'bg-emerald-500 text-white' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          🆕 Nuove ({pendingProperties.length})
        </button>
        <button
          onClick={() => setActiveTab('deactivation')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'deactivation' 
              ? 'bg-amber-500 text-white' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          ⏳ Richieste Disattivazione ({deactivationRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('inactive')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'inactive' 
              ? 'bg-slate-600 text-white' 
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          🚫 Disattivate ({inactiveProperties.length})
        </button>
        <div className="ml-auto flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          Live
        </div>
      </div>

      {/* Nuove Proprietà */}
      {activeTab === 'new' && (
        <>
          {pendingProperties.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="text-3xl">✅</span>
              </div>
              <p className="text-slate-500">Nessuna nuova proprietà in attesa</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingProperties.map((property) => (
                <div key={property.id} className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-xs font-medium rounded-full">Nuova</span>
                      </div>
                      <h3 className="font-semibold text-slate-800">{property.name}</h3>
                      <p className="text-sm text-slate-500">{property.address}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Proprietario: {property.ownerName || property.ownerEmail || "-"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(property.id)}
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === property.id ? "..." : "✓ Approva"}
                      </button>
                      <button
                        onClick={() => handleReject(property.id)}
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        🗑 Elimina
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Richieste Disattivazione */}
      {activeTab === 'deactivation' && (
        <>
          {deactivationRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <span className="text-3xl">✅</span>
              </div>
              <p className="text-slate-500">Nessuna richiesta di disattivazione in attesa</p>
            </div>
          ) : (
            <div className="space-y-4">
              {deactivationRequests.map((property) => {
                const isPendingDeletion = property.status === "PENDING_DELETION";
                return (
                <div key={property.id} className={`bg-white rounded-2xl border shadow-sm p-6 ${isPendingDeletion ? 'border-red-200' : 'border-amber-100'}`}>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          isPendingDeletion 
                            ? 'bg-red-100 text-red-600' 
                            : 'bg-amber-100 text-amber-600'
                        }`}>
                          {isPendingDeletion ? '🗑️ Richiesta Cancellazione' : '⏸️ Richiesta Disattivazione'}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-800">{property.name}</h3>
                      <p className="text-sm text-slate-500">{property.address}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Proprietario: {property.ownerName || property.ownerEmail || "-"}
                      </p>
                      {/* Data richiesta */}
                      {property.deactivationRequestedAt && (
                        <p className="text-xs text-slate-400 mt-1">
                          📅 Richiesta: {new Date(property.deactivationRequestedAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                      {property.deactivationReason && (
                        <div className="mt-2 p-2 bg-slate-50 rounded-lg">
                          <p className="text-xs text-slate-500">
                            <span className="font-medium">Motivo:</span> {property.deactivationReason}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isPendingDeletion ? (
                        <>
                          <button
                            onClick={() => openApproveModal(property)}
                            disabled={actionLoading === property.id}
                            className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === property.id ? "..." : "🗑️ Cancella"}
                          </button>
                          <button
                            onClick={() => openRejectModal(property)}
                            disabled={actionLoading === property.id}
                            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors disabled:opacity-50"
                          >
                            ✗ Rifiuta
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleDeactivate(property.id)}
                            disabled={actionLoading === property.id}
                            className="px-4 py-2 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === property.id ? "..." : "⏸️ Disattiva"}
                          </button>
                          <button
                            onClick={() => handleRejectDeactivation(property.id)}
                            disabled={actionLoading === property.id}
                            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors disabled:opacity-50"
                          >
                            ✗ Rifiuta
                          </button>
                          <button
                            onClick={() => handleDeletePermanent(property.id)}
                            disabled={actionLoading === property.id}
                            className="px-4 py-2 bg-red-100 text-red-600 rounded-xl font-medium hover:bg-red-200 transition-colors disabled:opacity-50"
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Proprietà Disattivate */}
      {activeTab === 'inactive' && (
        <>
          {inactiveProperties.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <span className="text-3xl">📭</span>
              </div>
              <p className="text-slate-500">Nessuna proprietà disattivata</p>
            </div>
          ) : (
            <div className="space-y-4">
              {inactiveProperties.map((property) => (
                <div key={property.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 opacity-75">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs font-medium rounded-full">Disattivata</span>
                      </div>
                      <h3 className="font-semibold text-slate-600">{property.name}</h3>
                      <p className="text-sm text-slate-400">{property.address}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Proprietario: {property.ownerName || property.ownerEmail || "-"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReactivate(property.id)}
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === property.id ? "..." : "♻️ Riattiva"}
                      </button>
                      <button
                        onClick={() => handleDeletePermanent(property.id)}
                        disabled={actionLoading === property.id}
                        className="px-4 py-2 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        🗑 Elimina
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal Azione Admin */}
      <ActionModal
        isOpen={actionModal.isOpen}
        type={actionModal.type}
        property={actionModal.property}
        futureBookings={futureBookings}
        futureCleanings={futureCleanings}
        loadingCounts={loadingCounts}
        onClose={closeActionModal}
        onConfirm={async (note) => {
          if (actionModal.property) {
            if (actionModal.type === 'approve') {
              await handleApproveDeletion(actionModal.property.id, note);
            } else {
              await handleRejectDeletion(actionModal.property.id, note);
            }
          }
        }}
      />

      {/* Modal Approvazione Nuova Proprietà (con prezzo obbligatorio) */}
      <ApproveModal
        isOpen={approveModal.isOpen}
        property={approveModal.property}
        onClose={closeApproveModal}
        onConfirm={handleApproveWithPrice}
      />
    </div>
  );
}