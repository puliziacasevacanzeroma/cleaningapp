"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, updateDoc, Timestamp, getDoc, addDoc, collection } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { PhotoLightbox } from "~/components/ui/PhotoLightbox";
import PropertyAccessCard from "~/components/property/PropertyAccessCard";
import PropertyRatingForm from "~/components/cleaning/PropertyRatingForm";
import IssueReporter from "~/components/cleaning/IssueReporter";
import OpenIssuesSection from "~/components/cleaning/OpenIssuesSection";
import IssueResolutionSection from "~/components/cleaning/IssueResolutionSection";
import BedIcon, { BedBadge } from "~/components/ui/BedIcon";
import type { BedType } from "~/components/ui/BedIcon";

// Tipi per rating (5 categorie)
interface RatingScores {
  guestCleanliness: number;
  checkoutPunctuality: number;
  propertyCondition: number;
  damages: number;
  accessEase: number;
}

interface Issue {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  photos: string[];
}

interface CleaningWizardProps {
  cleaning: any;
  user: any;
}

// Notifiche
async function notifyOwner(propertyId: string, title: string, message: string, type: 'info' | 'success') {
  try {
    const propertyRef = doc(db, "properties", propertyId);
    const propertySnap = await getDoc(propertyRef);
    if (propertySnap.exists()) {
      const propertyData = propertySnap.data();
      const ownerId = propertyData.ownerId;
      if (ownerId) {
        await addDoc(collection(db, "notifications"), {
          title, message, type: type.toUpperCase(),
          recipientRole: 'PROPRIETARIO', recipientId: ownerId,
          senderId: "system", senderName: "Sistema",
          status: "UNREAD", actionRequired: false,
          createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
        });
      }
    }
  } catch (error) {
    console.error("Errore notifica:", error);
  }
}

async function notifyAdmin(title: string, message: string, type: 'info' | 'success' | 'warning') {
  try {
    await addDoc(collection(db, "notifications"), {
      title, message, type: type.toUpperCase(),
      recipientRole: 'ADMIN', recipientId: null,
      senderId: "system", senderName: "Sistema",
      status: "UNREAD", actionRequired: false,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("Errore notifica admin:", error);
  }
}

// Checklist default
const DEFAULT_CHECKLIST = [
  { id: "1", text: "Cambiare lenzuola e federe", category: "camera" },
  { id: "2", text: "Rifare i letti", category: "camera" },
  { id: "3", text: "Cambiare asciugamani", category: "bagno" },
  { id: "4", text: "Pulire e disinfettare bagno", category: "bagno" },
  { id: "5", text: "Pulire specchi", category: "bagno" },
  { id: "6", text: "Aspirare pavimenti", category: "generale" },
  { id: "7", text: "Lavare pavimenti", category: "generale" },
  { id: "8", text: "Pulire cucina", category: "cucina" },
  { id: "9", text: "Pulire elettrodomestici", category: "cucina" },
  { id: "10", text: "Svuotare frigorifero", category: "cucina" },
  { id: "11", text: "Svuotare cestini", category: "generale" },
  { id: "12", text: "Controllare scorte", category: "generale" },
];

// Labels per tipi letto (le icone sono nel componente BedIcon)
const BED_TYPE_LABELS: Record<string, string> = {
  matrimoniale: 'Matrimoniale',
  singolo: 'Singolo',
  piazza_mezza: '1 Piazza e Mezza',
  divano_letto: 'Divano Letto',
  castello: 'Castello',
  letto_aggiuntivo: 'Letto Aggiuntivo',
};

// Calcola biancheria (senza customConfig per evitare ID incomprensibili)
function calcolaBiancheria(
  bedConfiguration: any[],
  guests: number,
  bathrooms: number
) {
  let lenzuolaMatrimoniali = 0;
  let lenzuolaSingole = 0;
  let federe = 0;

  bedConfiguration.forEach((stanza) => {
    stanza.letti?.forEach((letto: any) => {
      const qty = letto.quantita || 1;
      switch (letto.tipo) {
        case 'matrimoniale':
        case 'divano_letto':
          lenzuolaMatrimoniali += qty;
          federe += qty * 2;
          break;
        case 'singolo':
        case 'piazza_mezza':
          lenzuolaSingole += qty;
          federe += qty;
          break;
        case 'castello':
          lenzuolaSingole += qty * 2;
          federe += qty * 2;
          break;
      }
    });
  });

  return {
    lenzuolaMatrimoniali,
    lenzuolaSingole,
    federe,
    asciugamaniGrandi: guests,
    asciugamaniPiccoli: guests,
    tappetiniBagno: bathrooms,
  };
}

export default function CleaningWizard({ cleaning, user }: CleaningWizardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State - inizializza currentStep basandosi sullo status della pulizia
  const getInitialStep = () => {
    if (cleaning.status === "COMPLETED") return "confirm";
    if (cleaning.status === "IN_PROGRESS") return "cleaning";
    return "briefing";
  };
  const [currentStep, setCurrentStep] = useState<"briefing" | "cleaning" | "photos" | "rating" | "confirm">(getInitialStep);
  const [property, setProperty] = useState<any>({});
  const [checklist, setChecklist] = useState<any[]>(DEFAULT_CHECKLIST);
  const [completedItems, setCompletedItems] = useState<string[]>(cleaning.completedChecklist || []);
  const [photos, setPhotos] = useState<string[]>(cleaning.photos || []);
  const [notes, setNotes] = useState(cleaning.operatorNotes || "");
  const [saving, setSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [showConfirmStart, setShowConfirmStart] = useState(false);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);

  // ⭐ RATING E ISSUES - Stati (5 categorie)
  const [ratingScores, setRatingScores] = useState<RatingScores>({
    guestCleanliness: 0,
    checkoutPunctuality: 0,
    propertyCondition: 0,
    damages: 0,
    accessEase: 0,
  });
  const [ratingNotes, setRatingNotes] = useState("");
  const [ratingComplete, setRatingComplete] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);

  // 🧴 PRODOTTI PULIZIA - Stati
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, number>>({});
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productRequestSent, setProductRequestSent] = useState(false);

  // 🔧 SEGNALAZIONI APERTE - Stati
  const [openIssues, setOpenIssues] = useState<any[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [issueResolutions, setIssueResolutions] = useState<any[]>([]);

  // 💾 AUTO-SAVE - Stati
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 💾 AUTO-SAVE FUNCTION - Salva progresso su Firestore
  const autoSaveProgress = async (dataToSave?: Partial<{
    wizardStep: string;
    completedChecklist: string[];
    photos: string[];
    operatorNotes: string;
    ratingScores: RatingScores;
    ratingNotes: string;
  }>) => {
    if (cleaning.status === "COMPLETED") return; // Non salvare se già completata
    
    try {
      setAutoSaving(true);
      
      const updateData: any = {
        updatedAt: Timestamp.now(),
      };
      
      // Usa i dati passati o quelli dallo stato corrente
      if (dataToSave?.wizardStep) updateData.wizardStep = dataToSave.wizardStep;
      if (dataToSave?.completedChecklist) updateData.completedChecklist = dataToSave.completedChecklist;
      if (dataToSave?.photos) updateData.photos = dataToSave.photos;
      if (dataToSave?.operatorNotes !== undefined) updateData.operatorNotes = dataToSave.operatorNotes;
      if (dataToSave?.ratingScores) updateData.ratingScores = dataToSave.ratingScores;
      if (dataToSave?.ratingNotes !== undefined) updateData.ratingNotes = dataToSave.ratingNotes;
      
      await updateDoc(doc(db, "cleanings", cleaning.id), updateData);
      setLastSaved(new Date());
      console.log("💾 Auto-save completato:", Object.keys(updateData));
    } catch (error) {
      console.error("Errore auto-save:", error);
    } finally {
      setAutoSaving(false);
    }
  };

  // 💾 DEBOUNCED AUTO-SAVE - Aspetta 2 secondi prima di salvare
  const debouncedAutoSave = (dataToSave: Parameters<typeof autoSaveProgress>[0]) => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveProgress(dataToSave);
    }, 2000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Carica segnalazioni aperte per questa proprietà
  useEffect(() => {
    async function loadOpenIssues() {
      console.log("🔧 DEBUG: loadOpenIssues called, propertyId:", cleaning.propertyId);
      
      if (!cleaning.propertyId) {
        console.log("🔧 DEBUG: No propertyId, skipping");
        setLoadingIssues(false);
        return;
      }
      
      try {
        const url = `/api/issues?propertyId=${cleaning.propertyId}&onlyOpen=true`;
        console.log("🔧 DEBUG: Fetching issues from:", url);
        
        const res = await fetch(url);
        console.log("🔧 DEBUG: Response status:", res.status);
        
        if (res.ok) {
          const data = await res.json();
          console.log("🔧 DEBUG: Issues received:", data.issues?.length || 0, data);
          setOpenIssues(data.issues || []);
        } else {
          console.log("🔧 DEBUG: Response not ok:", await res.text());
        }
      } catch (error) {
        console.error("🔧 DEBUG: Errore caricamento segnalazioni:", error);
      } finally {
        setLoadingIssues(false);
      }
    }
    
    loadOpenIssues();
  }, [cleaning.propertyId]);

  // Carica proprietà
  useEffect(() => {
    async function loadData() {
      if (cleaning.propertyId) {
        try {
          const propertySnap = await getDoc(doc(db, "properties", cleaning.propertyId));
          if (propertySnap.exists()) {
            setProperty(propertySnap.data());
            if (propertySnap.data().checklist?.length > 0) {
              setChecklist(propertySnap.data().checklist);
            }
          }
        } catch (e) {
          console.error("Errore caricamento proprietà:", e);
        }
      }
    }
    loadData();
  }, [cleaning.propertyId]);

  // Sync step con stato - NON resettare se l'utente è già avanzato
  useEffect(() => {
    if (cleaning.status === "COMPLETED") {
      setCurrentStep("confirm");
    } else if (cleaning.status === "IN_PROGRESS") {
      // Solo se siamo in briefing, passa a cleaning
      // NON resettare se l'utente è già avanzato a photos
      setCurrentStep(prev => {
        if (prev === "briefing") return "cleaning";
        return prev; // Mantieni lo step corrente se già avanzato
      });
    } else {
      // ASSIGNED o altro - solo se non siamo già in corso
      setCurrentStep(prev => {
        if (prev === "confirm") return "briefing"; // Reset se completato e poi riaperto
        return prev;
      });
    }
  }, [cleaning.status]);

  // 🧴 PRODOTTI PULIZIA - Carica prodotti disponibili
  const loadAvailableProducts = async () => {
    if (availableProducts.length > 0) return; // Già caricati
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/product-requests/available");
      const data = await res.json();
      setAvailableProducts(data.products || []);
    } catch (error) {
      console.error("Errore caricamento prodotti:", error);
    } finally {
      setLoadingProducts(false);
    }
  };

  // 🧴 PRODOTTI PULIZIA - Toggle prodotto
  const toggleProduct = (productId: string, productName: string) => {
    setSelectedProducts(prev => {
      const current = { ...prev };
      if (current[productId]) {
        delete current[productId];
      } else {
        current[productId] = 1;
      }
      return current;
    });
  };

  // 🧴 PRODOTTI PULIZIA - Cambia quantità
  const changeProductQuantity = (productId: string, delta: number) => {
    setSelectedProducts(prev => {
      const current = { ...prev };
      const newQty = (current[productId] || 0) + delta;
      if (newQty <= 0) {
        delete current[productId];
      } else {
        current[productId] = Math.min(newQty, 10); // Max 10
      }
      return current;
    });
  };

  // 🧴 PRODOTTI PULIZIA - Invia richiesta
  const submitProductRequest = async () => {
    const selectedItems = Object.entries(selectedProducts)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => {
        const product = availableProducts.find(p => p.id === id);
        return {
          itemId: id,
          name: product?.name || "Prodotto",
          quantity: qty,
        };
      });

    if (selectedItems.length === 0) return;

    try {
      const res = await fetch("/api/product-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: cleaning.propertyId,
          propertyName: cleaning.propertyName,
          propertyAddress: cleaning.propertyAddress,
          cleaningId: cleaning.id,
          items: selectedItems,
        }),
      });

      if (res.ok) {
        setProductRequestSent(true);
        console.log("🧴 Richiesta prodotti inviata");
      }
    } catch (error) {
      console.error("Errore invio richiesta prodotti:", error);
    }
  };

  const selectedProductsCount = Object.keys(selectedProducts).length;


  // Dati calcolati
  const bedConfiguration = property.bedConfiguration || [];
  const guests = cleaning.guestsCount || property.maxGuests || 2;
  const bathrooms = property.bathrooms || 1;
  const biancheria = calcolaBiancheria(bedConfiguration, guests, bathrooms);

  // Prepara lista biancheria - calcolo semplice e leggibile
  const getBiancheriaList = () => {
    const list: { icon: string; name: string; qty: number }[] = [];
    
    // Biancheria letto (calcolo da bedConfiguration)
    if (biancheria.lenzuolaMatrimoniali > 0) {
      list.push({ icon: '🛏️', name: 'Set Lenzuola Matrimoniale', qty: biancheria.lenzuolaMatrimoniali });
    }
    if (biancheria.lenzuolaSingole > 0) {
      list.push({ icon: '🛏️', name: 'Set Lenzuola Singole', qty: biancheria.lenzuolaSingole });
    }
    if (biancheria.federe > 0) {
      list.push({ icon: '🛏️', name: 'Federe', qty: biancheria.federe });
    }

    // Asciugamani (basato su numero ospiti)
    list.push({ icon: '🛁', name: 'Asciugamani Grandi', qty: biancheria.asciugamaniGrandi });
    list.push({ icon: '🧴', name: 'Asciugamani Piccoli', qty: biancheria.asciugamaniPiccoli });
    if (biancheria.tappetiniBagno > 0) {
      list.push({ icon: '🚿', name: 'Tappetini Bagno', qty: biancheria.tappetiniBagno });
    }

    return list;
  };

  const scheduledDate = cleaning.scheduledDate?.toDate?.()
    ? cleaning.scheduledDate.toDate().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })
    : "Oggi";

  // Handlers
  const handleStartCleaning = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        status: "IN_PROGRESS",
        startedAt: Timestamp.now(),
        operatorId: user?.id,
        operatorName: user?.name || user?.email,
      });
      setCurrentStep("cleaning");
      setShowConfirmStart(false);
    } catch (e) {
      console.error("Errore:", e);
    }
    setSaving(false);
  };

  const handleToggleItem = (itemId: string) => {
    setCompletedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);
    setUploadProgress({ current: 0, total: files.length });

    const newPhotos: string[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("cleaningId", cleaning.id);

        const response = await fetch("/api/upload-photo", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          if (data.url) {
            newPhotos.push(data.url);
          }
        }
        setUploadProgress({ current: i + 1, total: files.length });
      } catch (error) {
        console.error("Errore upload:", error);
      }
    }

    if (newPhotos.length > 0) {
      const updatedPhotos = [...photos, ...newPhotos];
      setPhotos(updatedPhotos);
      
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        photos: updatedPhotos,
        updatedAt: Timestamp.now(),
      });
    }

    setUploadingPhotos(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeletePhoto = async (index: number) => {
    const updatedPhotos = photos.filter((_, i) => i !== index);
    setPhotos(updatedPhotos);
    
    await updateDoc(doc(db, "cleanings", cleaning.id), {
      photos: updatedPhotos,
      updatedAt: Timestamp.now(),
    });
  };

  const handleCompleteCleaning = async () => {
    setSaving(true);
    try {
      // 1. Aggiorna la pulizia
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        status: "COMPLETED",
        completedAt: Timestamp.now(),
        completedChecklist: completedItems,
        photos,
        operatorNotes: notes,
      });

      // 2. ⭐ SALVA RATING E ISSUES
      if (ratingComplete) {
        try {
          const ratingRes = await fetch("/api/property-ratings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cleaningId: cleaning.id,
              propertyId: cleaning.propertyId,
              propertyName: cleaning.propertyName,
              scores: ratingScores,
              notes: ratingNotes,
              issues: issues,
            }),
          });
          
          if (ratingRes.ok) {
            const ratingData = await ratingRes.json();
            console.log("⭐ Rating salvato:", ratingData);
          }
        } catch (ratingError) {
          console.error("Errore salvataggio rating:", ratingError);
        }
      }

      // 3. 🔧 SALVA NUOVI ISSUES (segnalati in questa pulizia)
      for (const issue of issues) {
        try {
          await fetch("/api/issues", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              propertyId: cleaning.propertyId,
              propertyName: cleaning.propertyName,
              cleaningId: cleaning.id,
              reportedBy: user?.id,
              reportedByName: user?.name || user?.email || "Operatore",
              type: issue.type,
              title: issue.title,
              description: issue.description,
              severity: issue.severity,
              photos: issue.photos || [],
            }),
          });
        } catch (issueError) {
          console.error("Errore salvataggio issue:", issueError);
        }
      }

      // 4. 🔧 AGGIORNA ISSUE RISOLTI
      for (const resolution of issueResolutions) {
        if (resolution.resolved) {
          try {
            await fetch("/api/issues", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                issueId: resolution.issueId,
                action: "resolve",
                resolvedBy: user?.id,
                resolvedByName: user?.name || user?.email || "Operatore",
                resolvedInCleaningId: cleaning.id,
                resolutionNotes: resolution.notes || "",
                resolutionPhotos: resolution.photos || [],
              }),
            });
          } catch (resolveError) {
            console.error("Errore risoluzione issue:", resolveError);
          }
        }
      }

      // 5. 🧴 INVIA RICHIESTA PRODOTTI SE SELEZIONATI
      if (selectedProductsCount > 0 && !productRequestSent) {
        await submitProductRequest();
      }

      await notifyOwner(
        cleaning.propertyId,
        "✅ Pulizia Completata",
        `La pulizia di ${cleaning.propertyName || "proprietà"} è stata completata.`,
        "success"
      );
      await notifyAdmin(
        "✅ Pulizia Completata",
        `${user?.name || "Operatore"} ha completato la pulizia di ${cleaning.propertyName}.${selectedProductsCount > 0 ? ` (+ richiesta ${selectedProductsCount} prodotti)` : ""}`,
        "success"
      );

      setCurrentStep("confirm");
      setShowConfirmComplete(false);
    } catch (e) {
      console.error("Errore:", e);
    }
    setSaving(false);
  };

  // Handler per il rating
  const handleRatingChange = (scores: RatingScores, notes: string, isComplete: boolean) => {
    setRatingScores(scores);
    setRatingNotes(notes);
    setRatingComplete(isComplete);
  };

  // Handler per gli issues
  const handleIssuesChange = (newIssues: Issue[]) => {
    setIssues(newIssues);
  };

  const canComplete = completedItems.length >= Math.floor(checklist.length * 0.8) && photos.length >= 2 && ratingComplete;
  const biancheriaList = getBiancheriaList();

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Lightbox */}
      <PhotoLightbox
        photos={lightbox?.images || []}
        initialIndex={lightbox?.index || 0}
        isOpen={!!lightbox}
        onClose={() => setLightbox(null)}
      />

      {/* Header Sticky */}
      <div className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link href="/operatore" className="p-1">
            <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-slate-800 truncate text-sm">{cleaning.propertyName || "Pulizia"}</h1>
            <p className="text-xs text-slate-400 truncate">{cleaning.propertyAddress}</p>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            cleaning.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" :
            cleaning.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" :
            "bg-blue-100 text-blue-700"
          }`}>
            {cleaning.status === "COMPLETED" ? "Fatto" :
             cleaning.status === "IN_PROGRESS" ? "In corso" : "Da fare"}
          </span>
        </div>

        {/* Progress Steps - 5 step */}
        {cleaning.status !== "COMPLETED" && (
          <div className="px-4 pb-2 flex items-center gap-1">
            {["briefing", "cleaning", "photos", "rating", "confirm"].map((step, idx) => (
              <div key={step} className="flex items-center flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  currentStep === step ? "bg-emerald-500 text-white" :
                  ["briefing", "cleaning", "photos", "rating", "confirm"].indexOf(currentStep) > idx 
                    ? "bg-emerald-200 text-emerald-700" 
                    : "bg-slate-200 text-slate-400"
                }`}>
                  {idx + 1}
                </div>
                {idx < 4 && (
                  <div className={`flex-1 h-0.5 mx-1 ${
                    ["briefing", "cleaning", "photos", "rating", "confirm"].indexOf(currentStep) > idx 
                      ? "bg-emerald-300" 
                      : "bg-slate-200"
                  }`} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-4 pb-28 space-y-3">

        {/* ══════════════════════════════════════════════════════════════
            STEP 1: BRIEFING
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "briefing" && cleaning.status !== "COMPLETED" && (
          <>
            {/* Info rapide */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <span className="text-lg">📋</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{scheduledDate}</p>
                    <p className="text-xs text-slate-500">Ore {cleaning.scheduledTime || "10:00"}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-emerald-600">{guests}</p>
                  <p className="text-[10px] text-slate-400 uppercase">ospiti</p>
                </div>
              </div>
            </div>

            {/* Camere */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <span>🚪</span>
                  <span className="text-slate-700">{bedConfiguration.length || property.bedrooms || 1} camere</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>🚿</span>
                  <span className="text-slate-700">{bathrooms} bagni</span>
                </div>
              </div>
            </div>

            {/* Configurazione Letti */}
            {bedConfiguration.length > 0 && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-slate-500 uppercase">Configurazione Letti</p>
                  <span className="text-xs text-slate-400">
                    {bedConfiguration.reduce((total: number, stanza: any) => 
                      total + (stanza.letti?.reduce((sum: number, l: any) => sum + (l.quantita || 1), 0) || 0), 0
                    )} posti letto
                  </span>
                </div>
                <div className="space-y-3">
                  {bedConfiguration.map((stanza: any, idx: number) => (
                    <div key={idx} className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2">{stanza.nome}</p>
                      <div className="flex flex-wrap gap-2">
                        {stanza.letti?.map((letto: any, lidx: number) => (
                          <BedBadge
                            key={lidx}
                            type={(letto.tipo as BedType) || "singolo"}
                            quantity={letto.quantita || 1}
                            color={idx % 2 === 0 ? "emerald" : "blue"}
                            size="sm"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Biancheria */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase">Biancheria da Preparare</p>
              </div>
              <div className="space-y-2">
                {biancheriaList.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{item.icon}</span>
                      <span className="text-sm text-slate-700">{item.name}</span>
                    </div>
                    <span className="font-bold text-slate-800 text-sm">{item.qty}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Accesso Proprietà */}
            <PropertyAccessCard 
              property={{
                address: property.address || cleaning.propertyAddress,
                city: property.city,
                postalCode: property.postalCode,
                floor: property.floor,
                apartment: property.apartment,
                intercom: property.intercom,
                doorCode: property.doorCode,
                keysLocation: property.keysLocation,
                accessNotes: property.accessNotes,
                images: property.images,
              }}
              editable={false}
            />

            {/* Note */}
            {(cleaning.notes || property.cleaningInstructions) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-bold text-amber-800 mb-1">⚠️ Note</p>
                <p className="text-sm text-amber-700">{cleaning.notes || property.cleaningInstructions}</p>
              </div>
            )}

            {/* 🔧 SEGNALAZIONI APERTE */}
            {console.log("🔧 DEBUG RENDER: loadingIssues:", loadingIssues, "openIssues:", openIssues.length, openIssues)}
            {!loadingIssues && openIssues.length > 0 && (
              <OpenIssuesSection 
                issues={openIssues}
                onViewPhoto={(photos, index) => setLightbox({ images: photos, index })}
              />
            )}
            {!loadingIssues && openIssues.length === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-sm text-green-700">✅ Nessuna segnalazione aperta per questa proprietà</p>
                <p className="text-xs text-green-500 mt-1">PropertyId: {cleaning.propertyId}</p>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 2: CLEANING (Checklist)
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "cleaning" && cleaning.status !== "COMPLETED" && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase">Checklist</p>
                <span className="text-xs text-slate-400">{completedItems.length}/{checklist.length}</span>
              </div>
              
              {/* Progress bar */}
              <div className="h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${(completedItems.length / checklist.length) * 100}%` }}
                />
              </div>

              <div className="space-y-1.5">
                {checklist.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => handleToggleItem(item.id)}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-lg transition-all active:scale-[0.98] ${
                      completedItems.includes(item.id)
                        ? "bg-emerald-50"
                        : "bg-slate-50"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      completedItems.includes(item.id)
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}>
                      {completedItems.includes(item.id) ? "✓" : idx + 1}
                    </div>
                    <span className={`flex-1 text-left text-sm ${
                      completedItems.includes(item.id) ? "text-emerald-700 line-through" : "text-slate-700"
                    }`}>
                      {item.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Note (opzionale)</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Segnala problemi..."
                className="w-full p-3 border border-slate-200 rounded-lg text-sm resize-none h-20"
              />
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 3: PHOTOS
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "photos" && cleaning.status !== "COMPLETED" && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase">Foto Pulizia</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  photos.length >= 2 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {photos.length}/2 min
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />

              {uploadingPhotos ? (
                <div className="border border-slate-200 rounded-lg p-6 text-center">
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Caricamento {uploadProgress.current}/{uploadProgress.total}</p>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-emerald-400 transition-all active:scale-[0.98]"
                >
                  <span className="text-2xl block mb-1">📷</span>
                  <p className="text-sm text-slate-600">Carica Foto</p>
                </button>
              )}

              {photos.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden group">
                      <img
                        src={photo}
                        alt=""
                        className="w-full h-full object-cover"
                        onClick={() => setLightbox({ images: photos, index: idx })}
                      />
                      <button
                        onClick={() => handleDeletePhoto(idx)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════════
                🧴 SEZIONE PRODOTTI PULIZIA
            ══════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🧴</span>
                  <p className="text-xs font-bold text-slate-500 uppercase">Prodotti Pulizia</p>
                </div>
                {selectedProductsCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                    {selectedProductsCount} selezionati
                  </span>
                )}
              </div>

              <p className="text-sm text-slate-500 mb-3">
                Mancano prodotti per la prossima pulizia? Richiedili qui.
              </p>

              {productRequestSent ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                  <span className="text-2xl block mb-1">✅</span>
                  <p className="text-sm font-medium text-emerald-700">Richiesta inviata!</p>
                  <p className="text-xs text-emerald-600 mt-1">Il rider porterà i prodotti alla prossima pulizia</p>
                </div>
              ) : (
                <>
                  {selectedProductsCount > 0 && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-3">
                      <p className="text-xs font-medium text-rose-700 mb-2">Prodotti da richiedere:</p>
                      <div className="space-y-1">
                        {Object.entries(selectedProducts).map(([id, qty]) => {
                          const product = availableProducts.find(p => p.id === id);
                          return (
                            <div key={id} className="flex items-center justify-between text-sm">
                              <span className="text-slate-700">{product?.name || id}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => changeProductQuantity(id, -1)}
                                  className="w-6 h-6 bg-white border border-slate-200 rounded text-slate-600 text-xs"
                                >
                                  -
                                </button>
                                <span className="font-bold text-rose-600 w-4 text-center">{qty}</span>
                                <button
                                  onClick={() => changeProductQuantity(id, 1)}
                                  className="w-6 h-6 bg-white border border-slate-200 rounded text-slate-600 text-xs"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      loadAvailableProducts();
                      setShowProductsModal(true);
                    }}
                    className="w-full border border-dashed border-rose-300 rounded-lg p-4 text-center hover:border-rose-400 hover:bg-rose-50 transition-all active:scale-[0.98]"
                  >
                    <span className="text-lg block mb-1">➕</span>
                    <p className="text-sm text-rose-600 font-medium">
                      {selectedProductsCount > 0 ? "Modifica Prodotti" : "Richiedi Prodotti"}
                    </p>
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 4: RATING E PROBLEMI
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "rating" && cleaning.status !== "COMPLETED" && (
          <>
            {/* Titolo sezione */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⭐</span>
                <div>
                  <h3 className="font-bold text-slate-800">Valuta la proprietà</h3>
                  <p className="text-xs text-slate-500">Aiutaci a migliorare il servizio per il proprietario</p>
                </div>
              </div>
            </div>

            {/* Form Rating */}
            <PropertyRatingForm 
              onRatingChange={handleRatingChange}
              initialScores={ratingScores}
              initialNotes={ratingNotes}
              compact={false}
            />

            {/* Segnalazione Problemi */}
            <IssueReporter 
              onIssuesChange={handleIssuesChange}
              initialIssues={issues}
              cleaningId={cleaning.id}
            />

            {/* 🔧 RISOLUZIONE SEGNALAZIONI APERTE */}
            {openIssues.length > 0 && (
              <IssueResolutionSection
                issues={openIssues}
                onResolutionsChange={setIssueResolutions}
                cleaningId={cleaning.id}
              />
            )}

            {/* Info completamento */}
            {!ratingComplete && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <p className="text-sm text-amber-700">Completa tutte le 5 categorie per procedere</p>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 5: COMPLETATO
        ══════════════════════════════════════════════════════════════ */}
        {cleaning.status === "COMPLETED" && (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">✅</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">Completata!</h2>
            <p className="text-slate-500 text-sm mb-6">Ottimo lavoro 🎉</p>

            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-6">
                {photos.map((photo, idx) => (
                  <img
                    key={idx}
                    src={photo}
                    alt=""
                    className="aspect-square object-cover rounded-lg"
                    onClick={() => setLightbox({ images: photos, index: idx })}
                  />
                ))}
              </div>
            )}

            <Link
              href="/operatore"
              className="inline-block px-6 py-3 bg-emerald-500 text-white font-bold rounded-xl"
            >
              Torna alla Home
            </Link>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          BOTTOM BUTTONS
      ══════════════════════════════════════════════════════════════ */}
      {cleaning.status !== "COMPLETED" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 z-50" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {currentStep === "briefing" && (
            <button
              onClick={() => setShowConfirmStart(true)}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl shadow-lg active:scale-[0.98] transition-all"
            >
              🚀 Inizia Pulizia
            </button>
          )}
          
          {currentStep === "cleaning" && (
            <button
              onClick={() => setCurrentStep("photos")}
              className="w-full py-3.5 bg-emerald-500 text-white font-bold rounded-xl active:scale-[0.98]"
            >
              Avanti: Foto →
            </button>
          )}
          
          {currentStep === "photos" && (
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentStep("cleaning")}
                className="flex-1 py-3.5 bg-slate-200 text-slate-700 font-bold rounded-xl active:scale-[0.98]"
              >
                ← Indietro
              </button>
              <button
                onClick={() => setCurrentStep("rating")}
                disabled={photos.length < 2}
                className={`flex-1 py-3.5 font-bold rounded-xl active:scale-[0.98] ${
                  photos.length >= 2 ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"
                }`}
              >
                Avanti: Valutazione →
              </button>
            </div>
          )}

          {currentStep === "rating" && (
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentStep("photos")}
                className="flex-1 py-3.5 bg-slate-200 text-slate-700 font-bold rounded-xl active:scale-[0.98]"
              >
                ← Indietro
              </button>
              <button
                onClick={() => setShowConfirmComplete(true)}
                disabled={!ratingComplete}
                className={`flex-1 py-3.5 font-bold rounded-xl active:scale-[0.98] ${
                  ratingComplete ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"
                }`}
              >
                Completa ✓
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════════ */}
      
      {showConfirmStart && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowConfirmStart(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <span className="text-4xl block mb-3">🧹</span>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Iniziare?</h3>
              <p className="text-sm text-slate-500 mb-4">Il proprietario sarà notificato.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowConfirmStart(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-medium">
                  Annulla
                </button>
                <button onClick={handleStartCleaning} disabled={saving} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl font-medium">
                  {saving ? "..." : "Inizia"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmComplete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowConfirmComplete(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <span className="text-4xl block mb-3">✅</span>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Completare?</h3>
              <p className="text-sm text-slate-500 mb-4">Checklist: {completedItems.length}/{checklist.length} • Foto: {photos.length}</p>
              {selectedProductsCount > 0 && !productRequestSent && (
                <p className="text-xs text-rose-600 mb-3 bg-rose-50 p-2 rounded-lg">
                  🧴 Hai {selectedProductsCount} prodotti da richiedere
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setShowConfirmComplete(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-medium">
                  Annulla
                </button>
                <button onClick={handleCompleteCleaning} disabled={saving} className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl font-medium">
                  {saving ? "..." : "Completa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          🧴 MODAL SELEZIONE PRODOTTI PULIZIA
      ══════════════════════════════════════════════════════════════ */}
      {showProductsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowProductsModal(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div 
            className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden" 
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧴</span>
                <h3 className="text-lg font-bold text-slate-800">Prodotti Pulizia</h3>
              </div>
              <button 
                onClick={() => setShowProductsModal(false)}
                className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {loadingProducts ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Caricamento prodotti...</p>
                </div>
              ) : availableProducts.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-4xl block mb-2">📭</span>
                  <p className="text-slate-500">Nessun prodotto disponibile</p>
                  <p className="text-xs text-slate-400 mt-1">Contatta l'admin per aggiungere prodotti</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableProducts.map((product) => {
                    const isSelected = selectedProducts[product.id] > 0;
                    const qty = selectedProducts[product.id] || 0;
                    
                    return (
                      <div 
                        key={product.id}
                        className={`border rounded-xl p-3 transition-all ${
                          isSelected 
                            ? "border-rose-300 bg-rose-50" 
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className={`font-medium ${isSelected ? "text-rose-700" : "text-slate-700"}`}>
                              {product.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              Disponibili: {product.quantity} {product.unit}
                            </p>
                          </div>
                          
                          {isSelected ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => changeProductQuantity(product.id, -1)}
                                className="w-8 h-8 bg-white border border-rose-200 rounded-lg text-rose-600 font-bold"
                              >
                                -
                              </button>
                              <span className="font-bold text-rose-600 w-6 text-center">{qty}</span>
                              <button
                                onClick={() => changeProductQuantity(product.id, 1)}
                                className="w-8 h-8 bg-white border border-rose-200 rounded-lg text-rose-600 font-bold"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => toggleProduct(product.id, product.name)}
                              className="px-4 py-2 bg-rose-100 text-rose-600 rounded-lg text-sm font-medium hover:bg-rose-200 transition-all"
                            >
                              Aggiungi
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4">
              <button
                onClick={() => setShowProductsModal(false)}
                className={`w-full py-3 rounded-xl font-bold transition-all ${
                  selectedProductsCount > 0
                    ? "bg-rose-500 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {selectedProductsCount > 0 
                  ? `Conferma ${selectedProductsCount} prodotti` 
                  : "Chiudi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
