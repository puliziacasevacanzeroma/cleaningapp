"use client";

import { useState, useRef, forwardRef, useImperativeHandle, lazy, Suspense, useEffect } from "react";
import { createPortal } from "react-dom";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

const GuestModal = lazy(() => import("~/components/proprietario/GuestModal").then(m => ({ default: m.GuestModal })));
const GuestSuccessToast = lazy(() => import("~/components/proprietario/GuestSuccessToast").then(m => ({ default: m.GuestSuccessToast })));
const NewCleaningModal = lazy(() => import("~/components/NewCleaningModal"));
const EditCleaningModal = lazy(() => import("~/components/proprietario/EditCleaningModal"));
const OrderDetailModal = lazy(() => import("~/components/OrderDetailModal"));

// 🚀 Precarica i bundle lazy in background → apertura modal istantanea
function preloadModals() {
  import("~/components/proprietario/GuestModal");
  import("~/components/proprietario/EditCleaningModal");
  import("~/components/NewCleaningModal");
  import("~/components/OrderDetailModal");
  import("~/components/proprietario/GuestSuccessToast");
}

interface Operator { id: string; name: string | null; }
interface Property { id: string; name: string; address: string; imageUrl?: string; bedsConfig?: any[]; cleaningPrice?: number; maxGuests?: number; bedrooms?: number; bathrooms?: number; serviceConfigs?: any; }
interface Cleaning { id: string; propertyId: string; propertyName?: string; date: Date; status: string; scheduledTime?: string | null; operator?: Operator | null; operators?: Operator[]; guestsCount?: number; guestsConfirmed?: boolean; adulti?: number; neonati?: number; notes?: string; bookingSource?: string; guestName?: string; price?: number; contractPrice?: number; customLinenConfig?: any; linenConfigModified?: boolean; hasLinenOrder?: boolean; serviceType?: string; serviceTypeName?: string; priceModified?: boolean; priceChangeReason?: string; sgrossoReason?: string; sgrossoReasonLabel?: string; }
interface Order { id: string; status: string; [key: string]: any; }

export interface PulizieModalsHandle {
  openGuestModal: (cleaning: Cleaning) => void;
  openTimeModal: (cleaning: Cleaning) => void;
  openOperatorModal: (cleaning: Cleaning) => void;
  openEditModal: (cleaning: Cleaning, property: Property | undefined, calculatedPrice?: number) => void;
  openNewCleaningModal: () => void;
  openOrderDetailModal: (order: Order) => void;
}

interface PulizieModalsProps {
  properties: Property[];
  operators: Operator[];
  inventory: any[];
  isAdmin: boolean;
  user: any;
  ownerId?: string;
}

export const PulizieModals = forwardRef<PulizieModalsHandle, PulizieModalsProps>(
  ({ properties, operators, inventory, isAdmin, user, ownerId }, ref) => {

  // ═══ ALL MODAL STATE ═══
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);
  const [guestModalInitialAdulti, setGuestModalInitialAdulti] = useState(2);
  const [guestModalInitialNeonati, setGuestModalInitialNeonati] = useState(0);
  const [savingGuests, setSavingGuests] = useState(false);
  const [showLinenAlert, setShowLinenAlert] = useState(false);
  const [pendingGuestChange, setPendingGuestChange] = useState<{ newCount: number; adulti: number; neonati: number } | null>(null);
  const [showGuestSuccess, setShowGuestSuccess] = useState(false);
  const [guestSuccessCount, setGuestSuccessCount] = useState(0);
  const [guestSuccessProperty, setGuestSuccessProperty] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCleaning, setEditingCleaning] = useState<Cleaning | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeModalCleaning, setTimeModalCleaning] = useState<Cleaning | null>(null);
  const [tempTime, setTempTime] = useState("10:00");
  const [savingTime, setSavingTime] = useState(false);
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [operatorModalCleaning, setOperatorModalCleaning] = useState<Cleaning | null>(null);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [savingOperator, setSavingOperator] = useState(false);
  const [showNewCleaningModal, setShowNewCleaningModal] = useState(false);
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);

  useEffect(() => {
    if (showGuestModal || showNewCleaningModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showGuestModal, showNewCleaningModal]);

  // 🚀 Precarica tutti i bundle modal in background al mount
  useEffect(() => { preloadModals(); }, []);

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const flashCard = (cardId: string) => {
    setTimeout(() => {
      const card = document.querySelector(`[data-id="${cardId}"]`) as HTMLElement;
      if (card) {
        card.classList.add('card-reorder-flash');
        setTimeout(() => card.classList.remove('card-reorder-flash'), 600);
      }
    }, 300);
  };

  const openGuestModal = (cleaning: Cleaning) => {
    // 🚀 Prepara dati SENZA setState (nessun re-render durante il calcolo)
    const prop = properties.find(p => p.id === cleaning.propertyId);
    const maxGuests = prop?.maxGuests || 6;
    const cleaningDate = cleaning.date instanceof Date ? cleaning.date : new Date(cleaning.date);
    const now = new Date();
    const deadlineDate = new Date(cleaningDate);
    deadlineDate.setDate(deadlineDate.getDate() - 1);
    deadlineDate.setHours(20, 0, 0, 0);
    const isAfterDeadline = now >= deadlineDate;
    
    let adulti = 2, neonati = 0;
    if (!cleaning.guestsConfirmed && isAfterDeadline) {
      adulti = maxGuests;
      neonati = 0;
    } else {
      const totalGuests = cleaning.guestsCount || 2;
      const storedAdulti = cleaning.adulti || 0;
      const storedNeonati = cleaning.neonati || 0;
      if (storedAdulti + storedNeonati === totalGuests && storedAdulti > 0) {
        adulti = storedAdulti;
        neonati = storedNeonati;
      } else {
        adulti = Math.max(1, totalGuests);
        neonati = 0;
      }
    }
    
    
      setSelectedCleaning(cleaning);
      setGuestModalInitialAdulti(adulti);
      setGuestModalInitialNeonati(neonati);
      setShowGuestModal(true);

  };


  const openTimeModal = (cleaning: Cleaning) => {
    
      setTimeModalCleaning(cleaning);
      setTempTime(cleaning.scheduledTime || "10:00");
      setShowTimeModal(true);

  };

  const openOperatorModal = (cleaning: Cleaning) => {
    // 🚀 Prepara dati senza setState
    const existingIds: string[] = [];
    if (cleaning.operators && cleaning.operators.length > 0) {
      cleaning.operators.forEach(op => {
        if (op.id) existingIds.push(op.id);
      });
    } else if (cleaning.operator?.id) {
      existingIds.push(cleaning.operator.id);
    }
    
      setOperatorModalCleaning(cleaning);
      setSelectedOperatorIds(existingIds);
      setShowOperatorModal(true);

  };


  const toggleOperatorSelection = (opId: string) => {
    setSelectedOperatorIds(prev => {
      if (prev.includes(opId)) {
        return prev.filter(id => id !== opId);
      } else {
        return [...prev, opId];
      }
    });
  };


  const saveTimeFromModal = async () => {
    if (!timeModalCleaning) return;
    const cardId = timeModalCleaning.id;
    setSavingTime(true);
    try {
      const cleaningRef = doc(db, "cleanings", timeModalCleaning.id);
      await updateDoc(cleaningRef, {
        scheduledTime: tempTime,
        updatedAt: new Date()
      });
      setShowTimeModal(false);
      setTimeModalCleaning(null);
      // Flash effect dopo riordinamento
      flashCard(cardId);
    } catch (error) {
      console.error("Errore salvataggio orario:", error);
      alert("Errore nel salvataggio");
    } finally {
      setSavingTime(false);
    }
  };

  const saveOperatorFromModal = async () => {
    if (!operatorModalCleaning) return;
    setSavingOperator(true);
    try {
      const cleaningRef = doc(db, "cleanings", operatorModalCleaning.id);
      
      if (selectedOperatorIds.length > 0) {
        // Costruisci array di operatori
        const selectedOps = selectedOperatorIds.map(id => {
          const op = operators.find(o => o.id === id);
          return { id: id, name: op?.name || "" };
        });
        
        // Salva anche il primo come operator singolo per retrocompatibilità
        await updateDoc(cleaningRef, {
          operators: selectedOps,
          operatorId: selectedOps[0].id,
          operatorName: selectedOps[0].name,
          operator: selectedOps[0],
          status: "SCHEDULED",
          updatedAt: new Date()
        });
      } else {
        // Nessun operatore selezionato
        await updateDoc(cleaningRef, {
          operators: [],
          operatorId: null,
          operatorName: null,
          operator: null,
          updatedAt: new Date()
        });
      }
      setShowOperatorModal(false);
      setOperatorModalCleaning(null);
    } catch (error) {
      console.error("Errore salvataggio operatori:", error);
      alert("Errore nel salvataggio");
    } finally {
      setSavingOperator(false);
    }
  };


  const openEditModal = (cleaning: Cleaning, property: Property | undefined, calculatedPrice?: number) => {
    // 🚀 Prepara dati senza setState
    const cleaningWithPrice = {
      ...cleaning,
      price: cleaning.price || calculatedPrice || property?.cleaningPrice || 0,
      contractPrice: cleaning.contractPrice || calculatedPrice || property?.cleaningPrice || 0
    };
    
    
      setEditingCleaning(cleaningWithPrice);
      setEditingProperty(property || null);
      setShowEditModal(true);

  };

  // 🎉 Success modal dopo inserimento ospiti

  const saveGuests = async (adulti: number, neonati: number) => {
    if (!selectedCleaning) return;
    
    const newGuestsCount = adulti + neonati;
    const oldGuestsCount = selectedCleaning.guestsCount || 2;
    
    // Se biancheria personalizzata E numero ospiti cambiato → mostra alert
    if (selectedCleaning.linenConfigModified === true && newGuestsCount !== oldGuestsCount) {
      setPendingGuestChange({ newCount: newGuestsCount, adulti, neonati });
      setShowGuestModal(false);
      setShowLinenAlert(true);
      return;
    }
    
    const cleaningId = selectedCleaning.id;
    const propertyName = properties.find(p => p.id === selectedCleaning.propertyId)?.name || "";

    // 🛡️ FIX SICUREZZA (root cause CASALE 2.0 ordine biancheria stale):
    // Le scritture devono essere AWAITED in sequenza, NON fire-and-forget.
    // Sequenza:
    //   1. updateDoc su cleaning (await) — se fallisce, NON chiudere il modal, mostra errore
    //   2. fetch update-linen-order (await + retry 1x) — solo se guests cambiati
    //   3. Solo se entrambi OK → animazione successo + chiusura
    // Se step 2 fallisce dopo retry, l'utente vede un alert: i guests sono salvati ma
    // l'ordine non si è ricalcolato → contattare admin (l'admin può ricalcolare manualmente).
    setSavingGuests(true);
    try {
      const cleaningRef = doc(db, "cleanings", cleaningId);
      await updateDoc(cleaningRef, {
        guestsCount: newGuestsCount,
        guestsConfirmed: true,
        adulti, neonati,
        updatedAt: new Date()
      });

      let orderRecalcOk = true;
      if (newGuestsCount !== oldGuestsCount) {
        const callUpdateOrder = async (): Promise<boolean> => {
          try {
            const res = await fetch(`/api/cleanings/${cleaningId}/update-linen-order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              cache: 'no-store',
            });
            return res.ok;
          } catch (e) {
            console.error("⚠️ Errore aggiornamento ordine:", e);
            return false;
          }
        };
        orderRecalcOk = await callUpdateOrder();
        if (!orderRecalcOk) {
          // Retry singolo dopo 800ms (mitiga race Firestore eventual consistency
          // tra il updateDoc del client SDK e il read dell'Admin SDK lato server)
          await new Promise(r => setTimeout(r, 800));
          orderRecalcOk = await callUpdateOrder();
        }
      }

      // Chiusura modal + animazione successo
      setShowGuestModal(false);

      if (orderRecalcOk) {
        setGuestSuccessCount(newGuestsCount);
        setGuestSuccessProperty(propertyName);
        setShowGuestSuccess(true);
        setTimeout(() => setShowGuestSuccess(false), 1800);
      } else {
        // Ospiti salvati MA ordine NON ricalcolato → l'admin deve intervenire.
        // Messaggio chiaro all'utente: il numero ospiti è memorizzato (e cambierà
        // gli importi/fatturazione) ma l'ordine biancheria potrebbe arrivare con
        // le quantità precedenti.
        alert(
          `Numero ospiti aggiornato a ${newGuestsCount} per "${propertyName}".\n\n` +
          `⚠️ Attenzione: la richiesta di ricalcolo della biancheria non è andata a buon fine. ` +
          `Riapri la pulizia tra qualche secondo per riprovare, oppure contatta l'amministratore.`
        );
      }
    } catch (err) {
      console.error("Errore salvataggio ospiti:", err);
      alert(
        "Errore nel salvataggio del numero ospiti. " +
        "Verifica la connessione e riprova. Se il problema persiste contatta l'amministratore."
      );
    } finally {
      setSavingGuests(false);
    }
  };

  // 🆕 Handler "Usa standard" - resetta biancheria a standard
  const handleLinenUseStandard = async () => {
    if (!selectedCleaning || !pendingGuestChange) return;
    setSavingGuests(true);
    try {
      const cleaningRef = doc(db, "cleanings", selectedCleaning.id);
      // 🔧 FIX: Rimuovi anche customLinenConfig per resettare completamente
      await updateDoc(cleaningRef, {
        guestsCount: pendingGuestChange.newCount,
        guestsConfirmed: true, // 🆕 Flag che indica salvataggio manuale
        adulti: pendingGuestChange.adulti,
        neonati: pendingGuestChange.neonati,
        linenConfigModified: false,
        customLinenConfig: deleteField(),
        updatedAt: new Date()
      });
      
      // 🔧 FIX: Aggiorna l'ordine biancheria di QUESTA pulizia
      // Ora userà serviceConfigs della proprietà (perché linenConfigModified = false)
      try {
        const response = await fetch(`/api/cleanings/${selectedCleaning.id}/update-linen-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
          const result = await response.json();
        }
      } catch (orderError) {
        console.error("⚠️ Errore aggiornamento ordine:", orderError);
      }
      
      setShowLinenAlert(false);
      setPendingGuestChange(null);
    } catch (error) {
      console.error("Errore salvataggio:", error);
      alert("Errore nel salvataggio");
    } finally {
      setSavingGuests(false);
    }
  };

  // 🆕 Handler "Mantieni personalizzata"
  const handleLinenKeepCustom = async () => {
    if (!selectedCleaning || !pendingGuestChange) return;
    setSavingGuests(true);
    try {
      const cleaningRef = doc(db, "cleanings", selectedCleaning.id);
      await updateDoc(cleaningRef, {
        guestsCount: pendingGuestChange.newCount,
        guestsConfirmed: true, // 🆕 Flag che indica salvataggio manuale
        adulti: pendingGuestChange.adulti,
        neonati: pendingGuestChange.neonati,
        updatedAt: new Date()
      });
      setShowLinenAlert(false);
      setPendingGuestChange(null);
    } catch (error) {
      console.error("Errore salvataggio:", error);
      alert("Errore nel salvataggio");
    } finally {
      setSavingGuests(false);
    }
  };

  // ========== FUNZIONI MODIFICA INLINE ==========
  
  // Salva orario inline
  const saveTimeInline = async (cleaningId: string, newTime: string) => {
    // @ts-expect-error TODO-FIX: TS2552 Cannot find name 'setSavingInline'. Did you mean 'setSavingTime'?
    setSavingInline(cleaningId);
    try {
      const cleaningRef = doc(db, "cleanings", cleaningId);
      await updateDoc(cleaningRef, {
        scheduledTime: newTime,
        updatedAt: new Date()
      });
      // @ts-expect-error TODO-FIX: TS2304 Cannot find name 'setEditingTimeId'.
      setEditingTimeId(null);
    } catch (error) {
      console.error("Errore salvataggio orario:", error);
    } finally {
      // @ts-expect-error TODO-FIX: TS2552 Cannot find name 'setSavingInline'. Did you mean 'setSavingTime'?
      setSavingInline(null);
    }
  };

  const handleOpenOrderDetail = (order: Order) => {
    setSelectedOrderForDetail(order);
    setShowOrderDetailModal(true);
  };

  useImperativeHandle(ref, () => ({
    openGuestModal,
    openTimeModal,
    openOperatorModal,
    openEditModal,
    openNewCleaningModal: () => setShowNewCleaningModal(true),
    openOrderDetailModal: handleOpenOrderDetail,
  }));

  return (
    <>
      {showGuestModal && selectedCleaning && typeof document !== "undefined" && createPortal(
      <Suspense fallback={null}>
        <GuestModal
          cleaning={selectedCleaning}
          properties={properties}
          isAdmin={isAdmin}
          initialAdulti={guestModalInitialAdulti}
          initialNeonati={guestModalInitialNeonati}
          savingGuests={savingGuests}
          onSave={saveGuests}
          onClose={() => setShowGuestModal(false)}
        />
      </Suspense>,
      document.body
      )}

      {/* 🎉 Toast Successo Ospiti */}
      {showGuestSuccess && (
        <Suspense fallback={null}>
        <GuestSuccessToast
          count={guestSuccessCount}
          propertyName={guestSuccessProperty}
          onClose={() => setShowGuestSuccess(false)}
        />
        </Suspense>
      )}

      {/* 🆕 Modal Alert Biancheria Personalizzata */}
      {showLinenAlert && selectedCleaning && pendingGuestChange && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            {/* Header con icona */}
            <div className="flex justify-center pt-6 pb-4">
              <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            
            {/* Titolo */}
            <h3 className="text-xl font-bold text-slate-800 text-center px-6">Biancheria personalizzata</h3>
            
            {/* Content */}
            <div className="px-6 pt-4 pb-6">
              <div className="bg-slate-50 rounded-xl p-4 mb-5">
                <p className="text-sm text-slate-700 text-center">
                  Hai modificato la biancheria per <strong>{selectedCleaning.guestsCount || 2} ospiti</strong>.
                </p>
                <p className="text-sm text-slate-600 text-center mt-2">
                  Vuoi usare la biancheria <strong>standard</strong> per <strong>{pendingGuestChange.newCount} ospiti</strong> o <strong>mantenere</strong> la tua personalizzazione?
                </p>
              </div>
              
              {/* Bottoni */}
              <div className="space-y-2">
                <button
                  onClick={handleLinenUseStandard}
                  disabled={savingGuests}
                  className="w-full py-3.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {savingGuests ? "Salvo..." : `Usa standard per ${pendingGuestChange.newCount} ospiti`}
                </button>
                
                <button
                  onClick={handleLinenKeepCustom}
                  disabled={savingGuests}
                  className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Mantieni personalizzata
                </button>
                
                <button
                  onClick={() => {
                    setShowLinenAlert(false);
                    setPendingGuestChange(null);
                  }}
                  disabled={savingGuests}
                  className="w-full py-3 text-slate-500 font-medium hover:text-slate-700 transition-colors"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        </div>,
      document.body
      )}

      {showNewCleaningModal && typeof document !== 'undefined' && createPortal(
      <Suspense fallback={null}>
      <NewCleaningModal
        isOpen={showNewCleaningModal}
        onClose={() => setShowNewCleaningModal(false)}
        onSuccess={() => { 
          setShowNewCleaningModal(false); 
          // 🔥 RIMOSSO window.location.reload() - Firebase onSnapshot aggiorna in tempo reale
        }}
        userRole={isAdmin ? "ADMIN" : "PROPRIETARIO"}
        ownerId={ownerId}
      />
      </Suspense>,
      document.body
      )}

      {/* Modal Modifica Pulizia */}
      {showEditModal && editingCleaning && typeof document !== 'undefined' && createPortal(
        <Suspense fallback={null}>
        <EditCleaningModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingCleaning(null);
            setEditingProperty(null);
          }}
          cleaning={{
            id: editingCleaning.id,
            propertyId: editingCleaning.propertyId,
            propertyName: editingCleaning.propertyName,
            date: editingCleaning.date,
            scheduledTime: editingCleaning.scheduledTime || "10:00",
            status: editingCleaning.status,
            guestsCount: editingCleaning.guestsCount || 2,
            guestsConfirmed: editingCleaning.guestsConfirmed,
            notes: editingCleaning.notes || "",
            // Prezzi - usa quello della pulizia, poi della proprietà
            price: editingCleaning.price || editingCleaning.contractPrice || editingProperty?.cleaningPrice,
            contractPrice: editingCleaning.contractPrice || editingCleaning.price || editingProperty?.cleaningPrice,
            priceModified: editingCleaning.priceModified,
            priceChangeReason: editingCleaning.priceChangeReason,
            // Tipo servizio
            serviceType: editingCleaning.serviceType,
            serviceTypeName: editingCleaning.serviceTypeName,
            sgrossoReason: editingCleaning.sgrossoReason,
            sgrossoReasonLabel: editingCleaning.sgrossoReasonLabel,
            // @ts-expect-error TODO-FIX: TS2339 Property 'sgrossoNotes' does not exist on type 'Cleaning'.
            sgrossoNotes: editingCleaning.sgrossoNotes,
            // Campi per pulizie completate
            // @ts-expect-error TODO-FIX: TS2339 Property 'photos' does not exist on type 'Cleaning'.
            photos: editingCleaning.photos,
            // @ts-expect-error TODO-FIX: TS2339 Property 'startedAt' does not exist on type 'Cleaning'.
            startedAt: editingCleaning.startedAt,
            // @ts-expect-error TODO-FIX: TS2339 Property 'completedAt' does not exist on type 'Cleaning'.
            completedAt: editingCleaning.completedAt,
            // Campi per valutazione
            // @ts-expect-error TODO-FIX: TS2339 Property 'ratingScore' does not exist on type 'Cleaning'.
            ratingScore: editingCleaning.ratingScore,
            // @ts-expect-error TODO-FIX: TS2339 Property 'ratingId' does not exist on type 'Cleaning'.
            ratingId: editingCleaning.ratingId,
            // Servizi extra
            // @ts-expect-error TODO-FIX: TS2339 Property 'extraServices' does not exist on type 'Cleaning'.
            extraServices: editingCleaning.extraServices,
            // Campi per deadline mancata
            // @ts-expect-error TODO-FIX: TS2339 Property 'missedDeadline' does not exist on type 'Cleaning'.
            missedDeadline: editingCleaning.missedDeadline,
            // @ts-expect-error TODO-FIX: TS2339 Property 'missedDeadlineAt' does not exist on type 'Cleaning'.
            missedDeadlineAt: editingCleaning.missedDeadlineAt,
            // 🔧 FIX: Passa customLinenConfig per mantenere le modifiche salvate
            customLinenConfig: editingCleaning.customLinenConfig,
            // 🔧 FIX: Passa linenConfigModified per far sapere alla modal che è personalizzata
            linenConfigModified: editingCleaning.linenConfigModified,
            // 🔧 FIX: Passa hasLinenOrder per toggle biancheria
            hasLinenOrder: editingCleaning.hasLinenOrder,
            // Tracciamento modifica data
            originalDate: editingCleaning.originalDate,
            dateModifiedAt: editingCleaning.dateModifiedAt,
            dateModifiedBy: (editingCleaning as any).dateModifiedBy,
            dateModifiedByName: (editingCleaning as any).dateModifiedByName,
            // 🎉 Maggiorazione festività
            holidayFee: (editingCleaning as any).holidayFee,
            holidayName: (editingCleaning as any).holidayName,
          }}
          property={{
            id: editingProperty?.id || editingCleaning.propertyId,
            name: editingProperty?.name || editingCleaning.propertyName || 'Proprietà',
            address: editingProperty?.address || '',
            maxGuests: editingProperty?.maxGuests || 6, // 🔧 Fallback ridotto
            bedrooms: editingProperty?.bedrooms,
            bathrooms: editingProperty?.bathrooms,
            bedsConfig: editingProperty?.bedsConfig,
            serviceConfigs: editingProperty?.serviceConfigs,
            // Calcola cleaningPrice: prima dalla pulizia, poi dalla proprietà
            cleaningPrice: editingCleaning.contractPrice || editingCleaning.price || editingProperty?.cleaningPrice || 0,
            // 🆕 Campi indirizzo per creazione ordine
            // @ts-expect-error TODO-FIX: TS2353 Object literal may only specify known properties, and 'city' does not exist in t...
            city: (editingProperty as any)?.city || '',
            postalCode: (editingProperty as any)?.postalCode || '',
            floor: (editingProperty as any)?.floor || '',
            apartment: (editingProperty as any)?.apartment || '',
            intercom: (editingProperty as any)?.intercom || '',
            doorCode: (editingProperty as any)?.doorCode || '',
            keysLocation: (editingProperty as any)?.keysLocation || '',
            accessNotes: (editingProperty as any)?.accessNotes || '',
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingCleaning(null);
            setEditingProperty(null);
          }}
          userRole={isAdmin ? "ADMIN" : "PROPRIETARIO"}
        />
        </Suspense>,
      document.body
      )}

      {/* ========== MODAL ORARIO ========== */}
      {showTimeModal && timeModalCleaning && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden" style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
            {/* Header */}
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Modifica Orario</h3>
                    <p className="text-xs text-gray-500">Seleziona l'orario della pulizia</p>
                  </div>
                </div>
                <button onClick={() => setShowTimeModal(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-5">
              <input
                type="time"
                value={tempTime}
                onChange={(e) => setTempTime(e.target.value)}
                className="w-full h-14 text-center text-2xl font-bold text-gray-800 border-2 border-gray-200 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
              />
            </div>

            {/* Footer */}
            <div className="p-5 bg-gray-50 flex gap-3">
              <button 
                onClick={() => setShowTimeModal(false)} 
                className="flex-1 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-all"
              >
                Annulla
              </button>
              <button 
                onClick={saveTimeFromModal} 
                disabled={savingTime}
                className="flex-1 py-3.5 text-white font-semibold rounded-xl disabled:opacity-50 transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', boxShadow: '0 4px 12px rgba(59,130,246,0.4)' }}
              >
                {savingTime ? "Salvo..." : "Conferma"}
              </button>
            </div>
          </div>
        </div>,
      document.body
      )}

      {/* ========== MODAL OPERATORE (MULTISELEZIONE) ========== */}
      {showOperatorModal && operatorModalCleaning && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden" style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
            {/* Header */}
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Assegna Operatori</h3>
                    <p className="text-xs text-gray-500">Seleziona uno o più operatori</p>
                  </div>
                </div>
                <button onClick={() => setShowOperatorModal(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Contatore selezionati */}
            {selectedOperatorIds.length > 0 && (
              <div className="px-5 py-3 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
                <span className="text-sm font-medium text-purple-700">
                  {selectedOperatorIds.length} operatore{selectedOperatorIds.length > 1 ? 'i' : ''} selezionato{selectedOperatorIds.length > 1 ? 'i' : ''}
                </span>
                <button 
                  onClick={() => setSelectedOperatorIds([])}
                  className="text-xs font-medium text-purple-600 hover:text-purple-800"
                >
                  Deseleziona tutti
                </button>
              </div>
            )}

            {/* Content - Lista operatori con checkbox */}
            <div className="p-4 max-h-[300px] overflow-y-auto">
              {operators.map((op, index) => {
                const isSelected = selectedOperatorIds.includes(op.id);
                const colors = [
                  { bg: '#8b5cf6', bgEnd: '#7c3aed' },
                  { bg: '#3b82f6', bgEnd: '#2563eb' },
                  { bg: '#10b981', bgEnd: '#059669' },
                  { bg: '#f59e0b', bgEnd: '#d97706' },
                  { bg: '#ec4899', bgEnd: '#db2777' },
                ];
                const color = colors[index % colors.length];
                
                return (
                  <button
                    key={op.id}
                    onClick={() => toggleOperatorSelection(op.id)}
                    className={`w-full p-3 rounded-xl flex items-center gap-3 mb-2 transition-all ${
                      isSelected ? 'bg-purple-50 border-2 border-purple-400 shadow-sm' : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    {/* Checkbox custom */}
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-300 bg-white'
                    }`}>
                      {isSelected && (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    
                    {/* Avatar */}
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: `linear-gradient(135deg, ${color.bg} 0%, ${color.bgEnd} 100%)` }}
                    >
                      {getInitials(op.name)}
                    </div>
                    
                    {/* Nome */}
                    <div className="text-left flex-1">
                      <p className="font-semibold text-gray-700">{op.name}</p>
                      <p className="text-xs text-gray-400">Operatore pulizie</p>
                    </div>
                    
                    {/* Indicatore selezione */}
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
                    )}
                  </button>
                );
              })}
              
              {operators.length === 0 && (
                <div className="p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">Nessun operatore disponibile</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 bg-gray-50 flex gap-3">
              <button 
                onClick={() => setShowOperatorModal(false)} 
                className="flex-1 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-all"
              >
                Annulla
              </button>
              <button 
                onClick={saveOperatorFromModal} 
                disabled={savingOperator}
                className="flex-1 py-3.5 text-white font-semibold rounded-xl disabled:opacity-50 transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', boxShadow: '0 4px 12px rgba(139,92,246,0.4)' }}
              >
                {savingOperator ? "Salvo..." : `Conferma${selectedOperatorIds.length > 0 ? ` (${selectedOperatorIds.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>,
      document.body
      )}

      {/* 🆕 Modal Dettaglio Ordine Biancheria */}
      {showOrderDetailModal && typeof document !== 'undefined' && createPortal(
      <Suspense fallback={null}>
      <OrderDetailModal
        isOpen={showOrderDetailModal}
        onClose={() => { setShowOrderDetailModal(false); setSelectedOrderForDetail(null); }}
        order={selectedOrderForDetail as any}
        userRole={isAdmin ? "ADMIN" : "PROPRIETARIO"}
        inventory={inventory}
        onOrderUpdate={() => {
          // L'ordine si aggiornerà automaticamente tramite il listener onSnapshot
        }}
      />
      </Suspense>,
      document.body
      )}
    </>
  );
});
