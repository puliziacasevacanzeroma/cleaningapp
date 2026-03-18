"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, orderBy, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface Property {
  id: string;
  name: string;
  address: string;
  city?: string;
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
  beds?: { name: string; type: string }[];
  cleaningPrice?: number;
  checkInTime?: string;
  checkOutTime?: string;
  icalAirbnb?: string;
  icalBooking?: string;
  icalOktorate?: string;
  icalInreception?: string;
  icalKrossbooking?: string;
  usesOwnLinen?: boolean;
  serviceConfigs?: Record<string, any>;
  floor?: string;
  accessCode?: string;
  notes?: string;
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

export function ProprietaPendingContent({ embedded = false }: { embedded?: boolean }) {
  const [pendingProperties, setPendingProperties] = useState<Property[]>([]);
  const [deactivationRequests, setDeactivationRequests] = useState<Property[]>([]);
  const [inactiveProperties, setInactiveProperties] = useState<Property[]>([]);
  const [pendingSignatureProperties, setPendingSignatureProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'new' | 'signature' | 'deactivation' | 'inactive'>('new');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedPropId, setExpandedPropId] = useState<string | null>(null);
  
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
    
    const unsubscribe = onSnapshot(
      query(collection(db, "properties"), orderBy("name", "asc")),
      (snapshot) => {
        
        const pending: Property[] = [];
        const deactivation: Property[] = [];
        const inactive: Property[] = [];
        const pendingSignature: Property[] = [];
        
        snapshot.docs.forEach(doc => {
          const data = doc.data() as Record<string, any>;
          const property: Property = {
            id: doc.id,
            name: data.name || "",
            address: data.address || "",
            city: data.city || "",
            ownerName: data.ownerName || "",
            ownerEmail: data.ownerEmail || "",
            ownerId: data.ownerId || "",
            status: data.status || "",
            createdAt: data.createdAt?.toDate?.()?.toISOString() || "",
            deactivationRequested: data.deactivationRequested || false,
            deactivationReason: data.deactivationReason || "",
            deactivationRequestedAt: data.deactivationRequestedAt?.toDate?.()?.toISOString() || "",
            maxGuests: data.maxGuests || undefined,
            bathrooms: data.bathrooms || undefined,
            bedrooms: data.bedrooms || undefined,
            beds: data.beds || undefined,
            cleaningPrice: data.cleaningPrice || undefined,
            checkInTime: data.checkInTime || undefined,
            checkOutTime: data.checkOutTime || undefined,
            icalAirbnb: data.icalAirbnb || undefined,
            icalBooking: data.icalBooking || undefined,
            icalOktorate: data.icalOktorate || undefined,
            icalInreception: data.icalInreception || undefined,
            icalKrossbooking: data.icalKrossbooking || undefined,
            usesOwnLinen: data.usesOwnLinen || false,
            floor: data.floor || undefined,
            accessCode: data.accessCode || undefined,
            notes: data.notes || undefined,
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
          // Proprietà approvate in attesa firma proprietario
          else if (data.status === "PENDING_SIGNATURE") {
            pendingSignature.push(property);
          }
          // Proprietà disattivate/sospese
          else if (data.status === "INACTIVE" || data.status === "SUSPENDED" || data.status === "DELETED") {
            inactive.push(property);
          }
        });
        
        
        setPendingProperties(pending);
        setDeactivationRequests(deactivation);
        setInactiveProperties(inactive);
        setPendingSignatureProperties(pendingSignature);
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
        const data = doc.data() as Record<string, any>;
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
      // Salva prezzo e status PENDING_SIGNATURE (il proprietario deve firmare Allegato D)
      const res = await fetch(`/api/properties/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          status: "PENDING_SIGNATURE",
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
              title: "Proprietà Approvata - Firma Richiesta 📋",
              message: `La tua proprietà "${property.name}" è stata approvata con prezzo pulizia €${cleaningPrice}. Firma l'Allegato D nella sezione Proprietà per attivarla.`,
              type: "SUCCESS",
              recipientRole: "PROPRIETARIO",
              recipientId: property.ownerId,
              senderId: "system",
              senderName: "Sistema",
            }),
          });
          if (notifRes.ok) {
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
      const res = await fetch(`/api/properties/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      
      if (!res.ok) {
        alert(`Errore nell'eliminazione: ${data.error || 'Errore sconosciuto'}`);
      } else {
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

  const totalPending = pendingProperties.length + deactivationRequests.length + pendingSignatureProperties.length;

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
    <div className={embedded ? "px-4 pt-3" : "p-4 lg:p-8"}>
      {!embedded && (
      <div className="mb-6">
        <Link href="/dashboard/proprieta" className="text-sky-500 hover:underline text-sm">
          ← Torna alle proprietà
        </Link>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 mt-2">
          Gestione Richieste
        </h1>
        <p className="text-slate-500">{totalPending} richieste da gestire • {inactiveProperties.length} disattivate</p>
      </div>
      )}

      {embedded && (
        <p className="text-[12px] text-slate-500 mb-3">{totalPending} richieste da gestire • {inactiveProperties.length} disattivate</p>
      )}

      {/* Tabs — stile pill scrollabili quando embedded */}
      <div className={`flex gap-1.5 ${embedded ? "overflow-x-auto -mx-4 px-4 pb-2 mb-3" : "flex-wrap gap-2 mb-6"}`} style={embedded ? { scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } : {}}>
        <button
          onClick={() => setActiveTab('new')}
          className={embedded
            ? `px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${activeTab === 'new' ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`
            : `px-4 py-2 rounded-xl font-medium text-sm transition-all ${activeTab === 'new' ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          🆕 Nuove ({pendingProperties.length})
        </button>
        <button
          onClick={() => setActiveTab('signature')}
          className={embedded
            ? `px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${activeTab === 'signature' ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`
            : `px-4 py-2 rounded-xl font-medium text-sm transition-all ${activeTab === 'signature' ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          ✍️ Firma ({pendingSignatureProperties.length})
        </button>
        <button
          onClick={() => setActiveTab('deactivation')}
          className={embedded
            ? `px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${activeTab === 'deactivation' ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`
            : `px-4 py-2 rounded-xl font-medium text-sm transition-all ${activeTab === 'deactivation' ? 'bg-amber-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          ⏳ Disattivazione ({deactivationRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('inactive')}
          className={embedded
            ? `px-3.5 py-[7px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 border-[1.5px] ${activeTab === 'inactive' ? "bg-sky-500 text-white border-sky-500 shadow-[0_2px_8px_rgba(14,165,233,.2)]" : "bg-white text-slate-500 border-slate-200"}`
            : `px-4 py-2 rounded-xl font-medium text-sm transition-all ${activeTab === 'inactive' ? 'bg-slate-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          🚫 Disattivate ({inactiveProperties.length})
        </button>
        {!embedded && (
        <div className="ml-auto flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          Live
        </div>
        )}
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
                <div key={property.id} className="bg-white rounded-[20px] overflow-hidden border border-slate-100">
                  <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-4 pt-3.5 pb-3.5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] font-semibold px-2.5 py-1 rounded-md bg-white/20 text-white tracking-wider">NUOVA PROPRIETÀ</span>
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="w-[42px] h-[42px] rounded-[13px] bg-white/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-white">{property.name}</p>
                        <p className="text-[11px] text-white/70">{property.address}</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pt-3 pb-3.5">
                    <div className="flex items-center gap-2 mb-2.5">
                      <svg className="w-[13px] h-[13px] text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      <span className="text-[12px] text-slate-600">{property.ownerName || property.ownerEmail || "-"}</span>
                    </div>
                    <div className="flex gap-[6px]">
                      <button onClick={() => handleApprove(property.id)} disabled={actionLoading === property.id} className="flex-1 py-[10px] rounded-xl bg-emerald-500 text-white text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50">
                        {actionLoading === property.id ? "..." : "Approva"}
                      </button>
                      <button onClick={() => handleReject(property.id)} disabled={actionLoading === property.id} className="flex-1 py-[10px] rounded-xl bg-red-500 text-white text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50">
                        Elimina
                      </button>
                      <button onClick={() => setExpandedPropId(expandedPropId === property.id ? null : property.id)} className="py-[10px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-[12px] font-medium active:scale-95 transition-all flex items-center gap-1.5">
                        <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Dettagli
                      </button>
                    </div>
                  </div>

                  {expandedPropId === property.id && (
                    <div className="border-t border-slate-100 px-4 py-3.5 bg-slate-50/50 space-y-2.5">
                      {/* Info struttura */}
                      <div className="bg-white rounded-[14px] p-3.5">
                        <p className="text-[10px] font-semibold text-slate-400 tracking-wider mb-2.5">STRUTTURA</p>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center bg-slate-50 rounded-xl p-2.5">
                            <p className="text-[18px] font-bold text-slate-700">{property.maxGuests || '—'}</p>
                            <p className="text-[10px] text-slate-400">Ospiti max</p>
                          </div>
                          <div className="text-center bg-slate-50 rounded-xl p-2.5">
                            <p className="text-[18px] font-bold text-slate-700">{property.bedrooms || '—'}</p>
                            <p className="text-[10px] text-slate-400">Camere</p>
                          </div>
                          <div className="text-center bg-slate-50 rounded-xl p-2.5">
                            <p className="text-[18px] font-bold text-slate-700">{property.bathrooms || '—'}</p>
                            <p className="text-[10px] text-slate-400">Bagni</p>
                          </div>
                        </div>
                        {property.beds && property.beds.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[10px] text-slate-400 mb-1.5">Letti configurati</p>
                            <div className="flex flex-wrap gap-1.5">
                              {property.beds.map((bed: any, i: number) => (
                                <span key={i} className="text-[10px] px-2 py-1 bg-sky-50 text-sky-700 rounded-lg font-medium">{bed.name || bed.type}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Proprietario */}
                      <div className="bg-white rounded-[14px] p-3.5">
                        <p className="text-[10px] font-semibold text-slate-400 tracking-wider mb-2.5">PROPRIETARIO</p>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-[28px] h-[28px] rounded-[8px] bg-indigo-50 flex items-center justify-center flex-shrink-0">
                              <svg className="w-[13px] h-[13px] text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-400">Nome</p>
                              <p className="text-[12px] text-slate-800 font-medium">{property.ownerName || '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <div className="w-[28px] h-[28px] rounded-[8px] bg-indigo-50 flex items-center justify-center flex-shrink-0">
                              <svg className="w-[13px] h-[13px] text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-400">Email</p>
                              <p className="text-[12px] text-slate-800 font-medium">{property.ownerEmail || '—'}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Orari e configurazione */}
                      <div className="bg-white rounded-[14px] p-3.5">
                        <p className="text-[10px] font-semibold text-slate-400 tracking-wider mb-2.5">CONFIGURAZIONE</p>
                        <div className="grid grid-cols-2 gap-2">
                          {property.checkInTime && (
                            <div className="bg-slate-50 rounded-xl p-2.5">
                              <p className="text-[10px] text-slate-400">Check-in</p>
                              <p className="text-[13px] text-slate-700 font-semibold">{property.checkInTime}</p>
                            </div>
                          )}
                          {property.checkOutTime && (
                            <div className="bg-slate-50 rounded-xl p-2.5">
                              <p className="text-[10px] text-slate-400">Check-out</p>
                              <p className="text-[13px] text-slate-700 font-semibold">{property.checkOutTime}</p>
                            </div>
                          )}
                          {property.cleaningPrice != null && (
                            <div className="bg-emerald-50 rounded-xl p-2.5">
                              <p className="text-[10px] text-emerald-600">Prezzo pulizia</p>
                              <p className="text-[13px] text-emerald-700 font-bold">€ {(property.cleaningPrice || 0).toFixed(2)}</p>
                            </div>
                          )}
                          <div className="bg-slate-50 rounded-xl p-2.5">
                            <p className="text-[10px] text-slate-400">Biancheria</p>
                            <p className="text-[13px] text-slate-700 font-semibold">{property.usesOwnLinen ? 'Propria' : 'Nostra'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Link iCal */}
                      {(property.icalAirbnb || property.icalBooking || property.icalOktorate || property.icalInreception || property.icalKrossbooking) && (
                        <div className="bg-white rounded-[14px] p-3.5">
                          <p className="text-[10px] font-semibold text-slate-400 tracking-wider mb-2.5">CANALI iCAL</p>
                          <div className="space-y-1.5">
                            {property.icalAirbnb && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-pink-500 flex-shrink-0"></span><span className="text-[11px] text-slate-600 truncate">Airbnb configurato</span></div>}
                            {property.icalBooking && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span><span className="text-[11px] text-slate-600 truncate">Booking configurato</span></div>}
                            {property.icalOktorate && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0"></span><span className="text-[11px] text-slate-600 truncate">Oktorate configurato</span></div>}
                            {property.icalInreception && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0"></span><span className="text-[11px] text-slate-600 truncate">InReception configurato</span></div>}
                            {property.icalKrossbooking && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span><span className="text-[11px] text-slate-600 truncate">Krossbooking configurato</span></div>}
                          </div>
                        </div>
                      )}

                      {/* Accesso e note */}
                      {(property.floor || property.accessCode || property.notes) && (
                        <div className="bg-white rounded-[14px] p-3.5">
                          <p className="text-[10px] font-semibold text-slate-400 tracking-wider mb-2.5">ACCESSO E NOTE</p>
                          <div className="space-y-1.5">
                            {property.floor && (
                              <div className="flex gap-2 items-center">
                                <div className="w-[28px] h-[28px] rounded-[8px] bg-slate-100 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-[13px] h-[13px] text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                </div>
                                <div><p className="text-[10px] text-slate-400">Piano</p><p className="text-[12px] text-slate-800 font-medium">{property.floor}</p></div>
                              </div>
                            )}
                            {property.accessCode && (
                              <div className="flex gap-2 items-center">
                                <div className="w-[28px] h-[28px] rounded-[8px] bg-amber-50 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-[13px] h-[13px] text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
                                </div>
                                <div><p className="text-[10px] text-slate-400">Codice accesso</p><p className="text-[12px] text-slate-800 font-mono font-medium">{property.accessCode}</p></div>
                              </div>
                            )}
                            {property.notes && (
                              <div className="mt-1 bg-slate-50 rounded-xl p-2.5">
                                <p className="text-[10px] text-slate-400 mb-0.5">Note</p>
                                <p className="text-[11px] text-slate-600">{property.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* In Attesa Firma Proprietario */}
      {activeTab === 'signature' && (
        <>
          {pendingSignatureProperties.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-sky-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna proprietà in attesa di firma</h3>
              <p className="text-slate-500">Tutte le proprietà approvate sono state firmate dai proprietari.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingSignatureProperties.map((property) => (
                <div key={property.id} className="bg-white rounded-[20px] overflow-hidden border border-slate-100">
                  <div className="bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-4 pt-3.5 pb-3.5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] font-semibold px-2.5 py-1 rounded-md bg-white/20 text-white tracking-wider">IN ATTESA FIRMA</span>
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="w-[42px] h-[42px] rounded-[13px] bg-white/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-white">{property.name}</p>
                        <p className="text-[11px] text-white/70">{property.address || '—'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pt-3 pb-3.5">
                    <div className="flex flex-col gap-[5px] mb-2">
                      <div className="flex items-center gap-2">
                        <svg className="w-[13px] h-[13px] text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <span className="text-[12px] text-slate-600">{property.ownerName || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-[13px] h-[13px] text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        <span className="text-[12px] text-slate-600">{property.ownerEmail || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-[13px] h-[13px] text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="text-[12px] text-emerald-600 font-semibold">€ {((property as any).cleaningPrice || 0).toFixed(2)}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 italic">Il proprietario deve firmare l&apos;Allegato D per attivare.</p>
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
                <div key={property.id} className="bg-white rounded-[20px] overflow-hidden border border-slate-100">
                  <div className={`px-4 pt-3.5 pb-3.5 ${isPendingDeletion ? 'bg-gradient-to-r from-red-500 via-rose-500 to-pink-500' : 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-400'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] font-semibold px-2.5 py-1 rounded-md bg-white/20 text-white tracking-wider">{isPendingDeletion ? 'RICHIESTA CANCELLAZIONE' : 'RICHIESTA DISATTIVAZIONE'}</span>
                      {property.deactivationRequestedAt && (
                        <span className="text-[10px] text-white/70">{new Date(property.deactivationRequestedAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
                      )}
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="w-[42px] h-[42px] rounded-[13px] bg-white/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-white">{property.name}</p>
                        <p className="text-[11px] text-white/70">{property.address}</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pt-3 pb-3.5">
                    <div className="flex items-center gap-2 mb-1">
                      <svg className="w-[13px] h-[13px] text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      <span className="text-[12px] text-slate-600">{property.ownerName || property.ownerEmail || "-"}</span>
                    </div>
                    {property.deactivationReason && (
                      <div className="bg-slate-50 rounded-xl p-2.5 mt-2 mb-2">
                        <p className="text-[11px] text-slate-500"><span className="font-medium">Motivo:</span> {property.deactivationReason}</p>
                      </div>
                    )}
                    <div className="flex gap-[6px] mt-2">
                      {isPendingDeletion ? (
                        <>
                          <button onClick={() => openApproveModal(property)} disabled={actionLoading === property.id} className="flex-1 py-[10px] rounded-xl bg-red-500 text-white text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50">
                            {actionLoading === property.id ? "..." : "Cancella"}
                          </button>
                          <button onClick={() => openRejectModal(property)} disabled={actionLoading === property.id} className="flex-1 py-[10px] rounded-xl bg-slate-200 text-slate-700 text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50">
                            Rifiuta
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleDeactivate(property.id)} disabled={actionLoading === property.id} className="flex-1 py-[10px] rounded-xl bg-amber-500 text-white text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50">
                            {actionLoading === property.id ? "..." : "Disattiva"}
                          </button>
                          <button onClick={() => handleRejectDeactivation(property.id)} disabled={actionLoading === property.id} className="flex-1 py-[10px] rounded-xl bg-slate-200 text-slate-700 text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50">
                            Rifiuta
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
                <div key={property.id} className="bg-white rounded-[20px] overflow-hidden border border-slate-100 opacity-80">
                  <div className="bg-gradient-to-r from-slate-400 via-slate-500 to-slate-600 px-4 pt-3.5 pb-3.5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] font-semibold px-2.5 py-1 rounded-md bg-white/20 text-white tracking-wider">DISATTIVATA</span>
                    </div>
                    <div className="flex gap-3 items-center">
                      <div className="w-[42px] h-[42px] rounded-[13px] bg-white/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-white">{property.name}</p>
                        <p className="text-[11px] text-white/70">{property.address}</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pt-3 pb-3.5">
                    <div className="flex items-center gap-2 mb-2.5">
                      <svg className="w-[13px] h-[13px] text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      <span className="text-[12px] text-slate-600">{property.ownerName || property.ownerEmail || "-"}</span>
                    </div>
                    <div className="flex gap-[6px]">
                      <button onClick={() => handleReactivate(property.id)} disabled={actionLoading === property.id} className="flex-1 py-[10px] rounded-xl bg-emerald-500 text-white text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50">
                        {actionLoading === property.id ? "..." : "Riattiva"}
                      </button>
                      <button onClick={() => handleDeletePermanent(property.id)} disabled={actionLoading === property.id} className="flex-1 py-[10px] rounded-xl bg-red-500 text-white text-[12px] font-semibold active:scale-95 transition-all disabled:opacity-50">
                        Elimina
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