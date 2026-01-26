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
import WizardStepIcon from "~/components/ui/WizardStepIcon";
import type { StepType } from "~/components/ui/WizardStepIcon";

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
  const getInitialStep = (): "briefing" | "checklist" | "products" | "rating" | "issues" | "photos" | "complete" => {
    if (cleaning.status === "COMPLETED") return "complete";
    if (cleaning.status === "IN_PROGRESS") return "checklist";
    return "briefing";
  };
  
  // NUOVA STRUTTURA: briefing → checklist → products → rating → issues → photos → complete
  const [currentStep, setCurrentStep] = useState<"briefing" | "checklist" | "products" | "rating" | "issues" | "photos" | "complete">(getInitialStep);
  
  // 🔄 Aggiorna lo step se lo status della pulizia cambia (es. refresh pagina)
  useEffect(() => {
    if (cleaning.status === "IN_PROGRESS" && currentStep === "briefing") {
      setCurrentStep("checklist");
    } else if (cleaning.status === "COMPLETED" && currentStep !== "complete") {
      setCurrentStep("complete");
    }
  }, [cleaning.status]);
  
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
  const [showIssueModal, setShowIssueModal] = useState(false);
  
  // 🆕 NUOVA SEGNALAZIONE - Form states
  const [newIssueType, setNewIssueType] = useState<string>('');
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueDescription, setNewIssueDescription] = useState('');
  const [newIssueSeverity, setNewIssueSeverity] = useState('medium');
  const [newIssuePhotos, setNewIssuePhotos] = useState<string[]>([]);
  const [uploadingIssuePhoto, setUploadingIssuePhoto] = useState(false);
  const issuePhotoInputRef = useRef<HTMLInputElement>(null);

  // 🚨 SEGNALAZIONE URGENTE - Stati
  const [showUrgentModal, setShowUrgentModal] = useState(false);
  const [showUrgentConfirm, setShowUrgentConfirm] = useState(false);
  const [urgentTitle, setUrgentTitle] = useState('');
  const [urgentDescription, setUrgentDescription] = useState('');
  const [urgentPhotos, setUrgentPhotos] = useState<string[]>([]);
  const [uploadingUrgentPhoto, setUploadingUrgentPhoto] = useState(false);
  const [sendingUrgent, setSendingUrgent] = useState(false);
  const urgentPhotoInputRef = useRef<HTMLInputElement>(null);

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
      setCurrentStep("complete");
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
        if (prev === "complete") return "briefing"; // Reset se completato e poi riaperto
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
      // Chiama l'API per iniziare la pulizia (include notifiche ai rider)
      const response = await fetch(`/api/cleanings/${cleaning.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Errore nell'avviare la pulizia");
      }
      
      // Aggiorna anche operatorId e operatorName localmente (l'API potrebbe non farlo)
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        operatorId: user?.id,
        operatorName: user?.name || user?.email,
      });
      
      setCurrentStep("checklist");
      setShowConfirmStart(false);
    } catch (e) {
      console.error("Errore:", e);
      // Fallback: aggiorna direttamente se l'API fallisce
      try {
        await updateDoc(doc(db, "cleanings", cleaning.id), {
          status: "IN_PROGRESS",
          startedAt: Timestamp.now(),
          operatorId: user?.id,
          operatorName: user?.name || user?.email,
        });
        setCurrentStep("checklist");
        setShowConfirmStart(false);
      } catch (fallbackError) {
        console.error("Errore fallback:", fallbackError);
      }
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

      setCurrentStep("complete");
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

  // 🆕 NUOVA SEGNALAZIONE - Handlers
  const resetNewIssueForm = () => {
    setNewIssueType('');
    setNewIssueTitle('');
    setNewIssueDescription('');
    setNewIssueSeverity('medium');
    setNewIssuePhotos([]);
  };

  const handleAddNewIssue = () => {
    if (!newIssueType || !newIssueTitle.trim() || !newIssueDescription.trim()) {
      return;
    }
    
    const newIssue: Issue = {
      id: `issue_${Date.now()}`,
      type: newIssueType,
      title: newIssueTitle.trim(),
      description: newIssueDescription.trim(),
      severity: newIssueSeverity,
      photos: newIssuePhotos,
    };
    
    setIssues(prev => [...prev, newIssue]);
    resetNewIssueForm();
    setShowIssueModal(false);
  };

  const handleIssuePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploadingIssuePhoto(true);
    
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("cleaningId", `issue_${cleaning.id}`);
        
        const res = await fetch("/api/upload-photo", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            setNewIssuePhotos(prev => [...prev, data.url]);
          }
        }
      }
    } catch (error) {
      console.error("Errore upload foto issue:", error);
    }
    
    setUploadingIssuePhoto(false);
    if (issuePhotoInputRef.current) {
      issuePhotoInputRef.current.value = '';
    }
  };

  // 🚨 SEGNALAZIONE URGENTE - Handlers
  const resetUrgentForm = () => {
    setUrgentTitle('');
    setUrgentDescription('');
    setUrgentPhotos([]);
  };

  const handleUrgentPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploadingUrgentPhoto(true);
    
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("cleaningId", `urgent_${cleaning.id}`);
        
        const res = await fetch("/api/upload-photo", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            setUrgentPhotos(prev => [...prev, data.url]);
          }
        }
      }
    } catch (error) {
      console.error("Errore upload foto urgente:", error);
    }
    
    setUploadingUrgentPhoto(false);
    if (urgentPhotoInputRef.current) {
      urgentPhotoInputRef.current.value = '';
    }
  };

  const handleSendUrgentIssue = async () => {
    if (!urgentTitle.trim() || !urgentDescription.trim()) return;
    
    setSendingUrgent(true);
    
    try {
      // 1. Salva la segnalazione urgente nel database
      const issueData = {
        propertyId: cleaning.propertyId,
        propertyName: cleaning.propertyName,
        cleaningId: cleaning.id,
        reportedBy: user?.id,
        reportedByName: user?.name || user?.email || "Operatore",
        type: 'safety',
        title: `🚨 URGENTE: ${urgentTitle}`,
        description: urgentDescription,
        severity: 'critical',
        photos: urgentPhotos,
        isUrgent: true,
        createdAt: new Date().toISOString(),
      };
      
      await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issueData),
      });
      
      // 2. Notifica il proprietario
      await notifyOwner(
        cleaning.propertyId,
        `🚨 PROBLEMA URGENTE - ${cleaning.propertyName}`,
        `L'operatore ha segnalato un problema critico: ${urgentTitle}. ${urgentDescription}`,
        'info'
      );
      
      // 3. Notifica l'admin (tutti gli admin)
      try {
        await addDoc(collection(db, "notifications"), {
          userId: "admin", // notifica generale admin
          type: "urgent_issue",
          title: `🚨 URGENTE: ${cleaning.propertyName}`,
          message: `Problema critico segnalato: ${urgentTitle}`,
          propertyId: cleaning.propertyId,
          cleaningId: cleaning.id,
          read: false,
          createdAt: Timestamp.now(),
        });
      } catch (notifError) {
        console.error("Errore notifica admin:", notifError);
      }
      
      // 4. Chiudi modal e reset
      setShowUrgentModal(false);
      resetUrgentForm();
      
      alert("✅ Segnalazione urgente inviata! Admin e proprietario sono stati notificati.");
      
    } catch (error) {
      console.error("Errore invio segnalazione urgente:", error);
      alert("Errore nell'invio della segnalazione. Riprova.");
    }
    
    setSendingUrgent(false);
  };

  const canComplete = completedItems.length >= Math.floor(checklist.length * 0.8) && photos.length >= 2 && ratingComplete;
  const biancheriaList = getBiancheriaList();

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col">
      {/* Lightbox */}
      <PhotoLightbox
        photos={lightbox?.images || []}
        initialIndex={lightbox?.index || 0}
        isOpen={!!lightbox}
        onClose={() => setLightbox(null)}
      />

      {/* Header fisso */}
      <div className="flex-shrink-0 bg-white shadow-sm z-10">
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

        {/* Progress Steps - 7 step con icone SVG e scritte */}
        {cleaning.status !== "COMPLETED" && (
          <div className="px-4 pb-3 bg-white">
            <div className="flex items-center justify-between">
              {([
                { id: "briefing" as StepType, label: "Info" },
                { id: "checklist" as StepType, label: "Check" },
                { id: "products" as StepType, label: "Prodotti" },
                { id: "rating" as StepType, label: "Valuta" },
                { id: "issues" as StepType, label: "Problemi" },
                { id: "photos" as StepType, label: "Foto" },
                { id: "complete" as StepType, label: "Fine" },
              ]).map((step, idx, arr) => {
                const stepOrder: StepType[] = ["briefing", "checklist", "products", "rating", "issues", "photos", "complete"];
                const currentIdx = stepOrder.indexOf(currentStep as StepType);
                const isActive = currentStep === step.id;
                const isCompleted = currentIdx > idx;
                
                return (
                  <div key={step.id} className="flex items-center">
                    <div className="flex flex-col items-center">
                      {/* Icona SVG nel cerchio */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        isActive 
                          ? "bg-emerald-500 text-white shadow-md" 
                          : isCompleted 
                            ? "bg-emerald-100 text-emerald-600" 
                            : "bg-slate-100 text-slate-400"
                      }`}>
                        {isCompleted ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                        ) : (
                          <WizardStepIcon step={step.id} size={18} color="currentColor" />
                        )}
                      </div>
                      {/* Label sotto */}
                      <span className={`text-[9px] mt-1 font-medium ${
                        isActive 
                          ? "text-emerald-600" 
                          : isCompleted 
                            ? "text-emerald-500" 
                            : "text-slate-400"
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    {/* Linea connettore */}
                    {idx < arr.length - 1 && (
                      <div className={`w-3 h-0.5 mx-0.5 mb-4 ${
                        isCompleted ? "bg-emerald-300" : "bg-slate-200"
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Content - Scrollabile */}
      <div className="flex-1 overflow-y-auto overscroll-none px-4 py-4 pb-28 space-y-3">

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
              />
            )}
            {!loadingIssues && openIssues.length === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-sm text-green-700">✅ Nessuna segnalazione aperta per questa proprietà</p>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 2: CLEANING (Checklist)
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "checklist" && cleaning.status !== "COMPLETED" && (
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
            STEP 3: PRODOTTI PULIZIA
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "products" && cleaning.status !== "COMPLETED" && (
          <>
            {/* Hero Header */}
            <div className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 rounded-2xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                  <span className="text-3xl">🧴</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold">Prodotti Pulizia</h2>
                  <p className="text-white/80 text-sm">Segnala prodotti mancanti o in esaurimento</p>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-sm text-blue-700">
                💡 Se hai notato prodotti mancanti o in esaurimento, segnalali qui per ricevere un rifornimento
              </p>
            </div>

            {/* Lista Prodotti */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <p className="font-bold text-slate-700">Prodotti Disponibili</p>
              </div>
              
              {loadingProducts ? (
                <div className="p-8 text-center">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Caricamento prodotti...</p>
                </div>
              ) : availableProducts.length === 0 ? (
                <div className="p-8 text-center">
                  <span className="text-4xl block mb-2">📦</span>
                  <p className="text-slate-500">Nessun prodotto configurato</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {availableProducts.map((product) => {
                    const selected = selectedProducts[product.id] || 0;
                    return (
                      <div key={product.id} className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                            <span className="text-lg">{product.icon || '📦'}</span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-800 text-sm">{product.name}</p>
                            {product.unit && (
                              <p className="text-xs text-slate-500">{product.unit}</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (selected > 0) {
                                setSelectedProducts(prev => ({
                                  ...prev,
                                  [product.id]: selected - 1
                                }));
                              }
                            }}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              selected > 0 
                                ? "bg-slate-200 text-slate-700" 
                                : "bg-slate-100 text-slate-300"
                            }`}
                          >
                            -
                          </button>
                          <span className={`w-8 text-center font-bold ${
                            selected > 0 ? "text-blue-600" : "text-slate-400"
                          }`}>
                            {selected}
                          </span>
                          <button
                            onClick={() => {
                              setSelectedProducts(prev => ({
                                ...prev,
                                [product.id]: selected + 1
                              }));
                            }}
                            className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Riepilogo Richiesta */}
            {selectedProductsCount > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-blue-800">Prodotti da richiedere:</span>
                  <span className="bg-blue-500 text-white px-2 py-0.5 rounded-full text-sm font-bold">
                    {selectedProductsCount}
                  </span>
                </div>
                <div className="text-sm text-blue-700">
                  {Object.entries(selectedProducts)
                    .filter(([_, qty]) => qty > 0)
                    .map(([id, qty]) => {
                      const product = availableProducts.find(p => p.id === id);
                      return product ? `${product.name} x${qty}` : null;
                    })
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </div>
            )}

            {/* Info nessuna selezione */}
            {selectedProductsCount === 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                <span className="text-lg">✅</span>
                <p className="text-sm text-emerald-700">
                  Nessun prodotto mancante? Perfetto, puoi procedere!
                </p>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 4: RATING (ex step 3 photos)
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "photos" && cleaning.status !== "COMPLETED" && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📷</span>
                  <p className="font-bold text-slate-700">Foto Pulizia</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
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
                <div className="border-2 border-emerald-200 bg-emerald-50 rounded-xl p-5">
                  {/* Barra di progresso */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-emerald-700">
                        Caricamento foto {uploadProgress.current} di {uploadProgress.total}
                      </span>
                      <span className="text-sm font-bold text-emerald-600">
                        {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                      </span>
                    </div>
                    <div className="h-3 bg-emerald-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
                        style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Icona animata */}
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-emerald-700 font-medium">
                      📷 Foto {uploadProgress.current}/{uploadProgress.total} in corso...
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-all active:scale-[0.98]"
                >
                  <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="text-2xl">📷</span>
                  </div>
                  <p className="font-bold text-slate-700">Aggiungi Foto</p>
                  <p className="text-xs text-slate-500 mt-1">Tocca per scattare o selezionare</p>
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
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center shadow-lg"
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
            {/* Form Rating - ha già il suo header interno */}
            <PropertyRatingForm 
              onRatingChange={handleRatingChange}
              initialScores={ratingScores}
              initialNotes={ratingNotes}
              compact={false}
            />

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
            STEP 5: SEGNALAZIONI E PROBLEMI
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "issues" && cleaning.status !== "COMPLETED" && (
          <>
            {/* Header compatto */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-rose-500 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-bold text-slate-800">Problemi e Segnalazioni</h2>
                  <p className="text-xs text-slate-500">Tutto ok? Vai avanti. Altrimenti segnala qui.</p>
                </div>
              </div>
            </div>

            {/* ═══ PROBLEMI APERTI DA RISOLVERE ═══ */}
            {openIssues.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚠️</span>
                    <span className="font-bold text-amber-800">Problemi da verificare</span>
                  </div>
                  <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {openIssues.length}
                  </span>
                </div>
                
                <div className="divide-y divide-slate-100">
                  {openIssues.map((issue) => {
                    const resolution = issueResolutions.find(r => r.issueId === issue.id);
                    const isResolved = resolution?.resolved || false;
                    
                    return (
                      <div key={issue.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-medium text-slate-800">{issue.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{issue.description}</p>
                          </div>
                          
                          {/* Toggle Risolto */}
                          <button
                            onClick={() => {
                              const newResolutions = issueResolutions.filter(r => r.issueId !== issue.id);
                              if (!isResolved) {
                                newResolutions.push({
                                  issueId: issue.id,
                                  resolved: true,
                                  notes: '',
                                  photos: []
                                });
                              }
                              setIssueResolutions(newResolutions);
                            }}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                              isResolved 
                                ? "bg-emerald-500 text-white" 
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {isResolved ? "✓ Risolto" : "Risolto?"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ═══ NESSUN PROBLEMA APERTO ═══ */}
            {openIssues.length === 0 && issues.length === 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">✨</span>
                </div>
                <h3 className="font-bold text-emerald-800 mb-1">Tutto in ordine!</h3>
                <p className="text-sm text-emerald-600">Nessun problema segnalato per questa proprietà</p>
              </div>
            )}

            {/* ═══ SEGNALAZIONI NUOVE AGGIUNTE ═══ */}
            {issues.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <span className="font-bold text-slate-700">Segnalazioni aggiunte</span>
                  </div>
                  <span className="bg-rose-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                    {issues.length}
                  </span>
                </div>
                
                {issues.map((issue, idx) => {
                  // Mappa tipi a icone e colori
                  const typeInfo: Record<string, { icon: string; color: string; bgColor: string }> = {
                    damage: { icon: '💔', color: 'text-rose-600', bgColor: 'bg-rose-100' },
                    missing_item: { icon: '📦', color: 'text-amber-600', bgColor: 'bg-amber-100' },
                    maintenance: { icon: '🔧', color: 'text-orange-600', bgColor: 'bg-orange-100' },
                    cleanliness: { icon: '🧹', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
                    safety: { icon: '⚠️', color: 'text-red-600', bgColor: 'bg-red-100' },
                    other: { icon: '📝', color: 'text-slate-600', bgColor: 'bg-slate-100' },
                  };
                  const info = typeInfo[issue.type] || typeInfo.other;
                  
                  // Mappa severità a colori
                  const severityColor: Record<string, string> = {
                    low: 'bg-emerald-100 text-emerald-700',
                    medium: 'bg-amber-100 text-amber-700',
                    high: 'bg-orange-100 text-orange-700',
                    critical: 'bg-rose-100 text-rose-700',
                  };
                  
                  return (
                    <div 
                      key={idx} 
                      className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden"
                    >
                      {/* Header con tipo e pulsante elimina */}
                      <div className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* Icona tipo */}
                          <div className={`w-10 h-10 ${info.bgColor} rounded-xl flex items-center justify-center flex-shrink-0`}>
                            <span className="text-lg">{info.icon}</span>
                          </div>
                          
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-800 truncate">{issue.title}</h4>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{issue.description}</p>
                            
                            {/* Badge severità */}
                            <div className="flex items-center gap-2 mt-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severityColor[issue.severity] || severityColor.medium}`}>
                                {issue.severity === 'low' ? 'Bassa' : 
                                 issue.severity === 'medium' ? 'Media' :
                                 issue.severity === 'high' ? 'Alta' : 'Critica'}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Pulsante elimina */}
                        <button
                          onClick={() => {
                            const newIssues = issues.filter((_, i) => i !== idx);
                            handleIssuesChange(newIssues);
                          }}
                          className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 hover:bg-rose-100 hover:text-rose-500 flex-shrink-0 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                      
                      {/* Foto miniature */}
                      {issue.photos && issue.photos.length > 0 && (
                        <div className="px-4 pb-3">
                          <div className="flex gap-2 overflow-x-auto">
                            {issue.photos.map((photo, photoIdx) => (
                              <img
                                key={photoIdx}
                                src={photo}
                                alt=""
                                className="w-16 h-16 object-cover rounded-lg flex-shrink-0 border border-slate-200"
                                onClick={() => setLightbox({ images: issue.photos, index: photoIdx })}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ═══ PULSANTE AGGIUNGI PROBLEMA ═══ */}
            <button
              onClick={() => setShowIssueModal(true)}
              className="w-full bg-white border-2 border-dashed border-slate-300 rounded-xl p-5 flex items-center justify-center gap-3 hover:border-rose-400 hover:bg-rose-50 transition-all active:scale-[0.98]"
            >
              <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                <span className="text-xl text-rose-500">+</span>
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-700">Segnala un problema</p>
                <p className="text-xs text-slate-500">Danni, manutenzione, oggetti mancanti...</p>
              </div>
            </button>

            {/* Info */}
            <p className="text-center text-xs text-slate-400 py-2">
              Se non ci sono problemi, puoi procedere direttamente →
            </p>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            MODAL SEGNALA PROBLEMA - Ottimizzata mobile, centrata
        ═══════════════════════════════════════════════════════════════ */}
        {showIssueModal && (
          <div 
            className="fixed inset-0 z-[200] flex items-center justify-center p-3"
            onClick={() => { setShowIssueModal(false); resetNewIssueForm(); }}
          >
            {/* Overlay scuro */}
            <div className="absolute inset-0 bg-black/70" />
            
            {/* Modal Container */}
            <div 
              className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Header fisso */}
              <div className="flex-shrink-0 bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">⚠️ Segnala Problema</h3>
                  <button 
                    onClick={() => { setShowIssueModal(false); resetNewIssueForm(); }}
                    className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white"
                  >
                    ✕
                  </button>
                </div>
              </div>
              
              {/* Form scrollabile */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* TIPO PROBLEMA */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Tipo</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'damage', icon: '💔', label: 'Danno' },
                      { id: 'missing_item', icon: '📦', label: 'Mancante' },
                      { id: 'maintenance', icon: '🔧', label: 'Guasto' },
                      { id: 'cleanliness', icon: '🧹', label: 'Sporco' },
                      { id: 'safety', icon: '⚠️', label: 'Sicurezza' },
                      { id: 'other', icon: '📝', label: 'Altro' },
                    ].map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setNewIssueType(type.id)}
                        className={`p-2 rounded-xl border-2 transition-all text-center ${
                          newIssueType === type.id 
                            ? 'border-rose-500 bg-rose-50 scale-105' 
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <span className="text-xl block">{type.icon}</span>
                        <span className="text-[10px] text-slate-600 font-medium">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* TITOLO */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Titolo</p>
                  <input
                    type="text"
                    value={newIssueTitle}
                    onChange={(e) => setNewIssueTitle(e.target.value)}
                    placeholder="Es: Rubinetto perde, Lampadina rotta..."
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
                  />
                </div>

                {/* DESCRIZIONE */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Descrizione</p>
                  <textarea
                    value={newIssueDescription}
                    onChange={(e) => setNewIssueDescription(e.target.value)}
                    placeholder="Descrivi il problema..."
                    rows={2}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none resize-none"
                  />
                </div>

                {/* GRAVITÀ */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Gravità</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'low', label: 'Bassa', bg: 'bg-emerald-500' },
                      { id: 'medium', label: 'Media', bg: 'bg-amber-500' },
                      { id: 'high', label: 'Alta', bg: 'bg-orange-500' },
                      { id: 'critical', label: 'Critica', bg: 'bg-rose-500' },
                    ].map((sev) => (
                      <button
                        key={sev.id}
                        type="button"
                        onClick={() => setNewIssueSeverity(sev.id)}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${
                          newIssueSeverity === sev.id
                            ? `${sev.bg} text-white shadow-md`
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {sev.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* FOTO */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                    Foto {newIssueType === 'damage' && <span className="text-rose-500">(obbligatoria)</span>}
                  </p>
                  
                  <input
                    ref={issuePhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleIssuePhotoUpload}
                    className="hidden"
                  />
                  
                  <div className="flex gap-2 flex-wrap">
                    {/* Foto caricate */}
                    {newIssuePhotos.map((photo, idx) => (
                      <div key={idx} className="relative w-14 h-14">
                        <img src={photo} alt="" className="w-full h-full object-cover rounded-lg" />
                        <button
                          onClick={() => setNewIssuePhotos(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-white text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    
                    {/* Pulsante aggiungi foto */}
                    <button
                      onClick={() => issuePhotoInputRef.current?.click()}
                      disabled={uploadingIssuePhoto}
                      className="w-14 h-14 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 hover:border-rose-400 hover:text-rose-400"
                    >
                      {uploadingIssuePhoto ? (
                        <div className="w-5 h-5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="text-xl">+</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Footer fisso con pulsante */}
              <div className="flex-shrink-0 p-4 bg-slate-50 border-t border-slate-100">
                <button
                  onClick={handleAddNewIssue}
                  disabled={!newIssueType || !newIssueTitle.trim() || !newIssueDescription.trim() || (newIssueType === 'damage' && newIssuePhotos.length === 0)}
                  className={`w-full py-3 rounded-xl font-bold text-white transition-all ${
                    newIssueType && newIssueTitle.trim() && newIssueDescription.trim() && (newIssueType !== 'damage' || newIssuePhotos.length > 0)
                      ? 'bg-gradient-to-r from-rose-500 to-orange-500 shadow-lg active:scale-[0.98]'
                      : 'bg-slate-300'
                  }`}
                >
                  ✓ Aggiungi Segnalazione
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 6: COMPLETATO
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
          BOTTOM NAV - Design professionale con pulsante urgenza in rilievo
      ══════════════════════════════════════════════════════════════ */}
      {cleaning.status !== "COMPLETED" && (
        <div 
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]" 
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          {/* STEP 1: Briefing */}
          {currentStep === "briefing" && (
            <div className="px-4 py-3">
              {cleaning.status === "IN_PROGRESS" ? (
                /* Pulizia già iniziata - mostra Continua */
                <button
                  onClick={() => setCurrentStep("checklist")}
                  className="w-full py-4 bg-gradient-to-r from-sky-500 to-blue-500 text-white font-bold rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-sky-500/30"
                >
                  <span className="flex items-center justify-center gap-2">
                    <span>Continua</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </button>
              ) : (
                /* Pulizia non ancora iniziata - mostra Inizia con conferma */
                <button
                  onClick={() => setShowConfirmStart(true)}
                  className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/30"
                >
                  <span className="flex items-center justify-center gap-2">
                    <span>🚀</span>
                    <span>Inizia Pulizia</span>
                  </span>
                </button>
              )}
            </div>
          )}
          
          {/* STEP 2-6: Navbar con 3 elementi */}
          {currentStep !== "briefing" && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-3">
                
                {/* 🚨 Pulsante Urgenza - 3D con rilievo */}
                <button
                  onClick={() => setShowUrgentModal(true)}
                  className="relative w-14 h-14 flex-shrink-0 group"
                >
                  {/* Ombra 3D */}
                  <div className="absolute inset-0 bg-red-700 rounded-2xl translate-y-1" />
                  {/* Pulsante principale */}
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500 via-rose-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg group-active:translate-y-1 transition-transform">
                    <span className="text-2xl">🚨</span>
                  </div>
                  {/* Effetto luce */}
                  <div className="absolute inset-x-2 top-1 h-3 bg-gradient-to-b from-white/30 to-transparent rounded-t-xl" />
                </button>

                {/* Pulsante Indietro */}
                <button
                  onClick={() => {
                    if (currentStep === "checklist") setCurrentStep("briefing");
                    else if (currentStep === "products") setCurrentStep("checklist");
                    else if (currentStep === "rating") setCurrentStep("products");
                    else if (currentStep === "issues") setCurrentStep("rating");
                    else if (currentStep === "photos") setCurrentStep("issues");
                  }}
                  className="h-14 px-5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl active:scale-[0.97] transition-all flex items-center justify-center"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {/* Pulsante Avanti / Completa */}
                <button
                  onClick={() => {
                    if (currentStep === "checklist") setCurrentStep("products");
                    else if (currentStep === "products") setCurrentStep("rating");
                    else if (currentStep === "rating" && ratingComplete) setCurrentStep("issues");
                    else if (currentStep === "issues") setCurrentStep("photos");
                    else if (currentStep === "photos" && photos.length >= 2) setShowConfirmComplete(true);
                  }}
                  disabled={
                    (currentStep === "rating" && !ratingComplete) ||
                    (currentStep === "photos" && photos.length < 2)
                  }
                  className={`flex-1 h-14 font-bold rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${
                    (currentStep === "rating" && !ratingComplete) || (currentStep === "photos" && photos.length < 2)
                      ? "bg-slate-200 text-slate-400"
                      : currentStep === "photos"
                        ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30"
                        : "bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-lg shadow-sky-500/30"
                  }`}
                >
                  {currentStep === "photos" ? (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Completa</span>
                    </>
                  ) : (
                    <>
                      <span>Avanti</span>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
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

      {/* ═══════════════════════════════════════════════════════════════
          🚨 MODAL SEGNALAZIONE URGENTE
      ═══════════════════════════════════════════════════════════════ */}
      {showUrgentModal && (
        <div 
          className="fixed inset-0 z-[300] flex items-center justify-center p-3"
          onClick={() => { setShowUrgentModal(false); resetUrgentForm(); }}
        >
          {/* Overlay rosso/scuro */}
          <div className="absolute inset-0 bg-red-900/80" />
          
          {/* Modal Container */}
          <div 
            className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header rosso */}
            <div className="flex-shrink-0 bg-gradient-to-r from-red-600 to-rose-600 px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
                    <span className="text-xl">🚨</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Problema URGENTE</h3>
                    <p className="text-xs text-white/80">Notifica immediata</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setShowUrgentModal(false); resetUrgentForm(); }}
                  className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white"
                >
                  ✕
                </button>
              </div>
            </div>
            
            {/* Info */}
            <div className="bg-red-50 px-4 py-3 border-b border-red-100">
              <p className="text-xs text-red-700">
                ⚡ Questa segnalazione sarà inviata <strong>immediatamente</strong> all'admin e al proprietario
              </p>
            </div>
            
            {/* Form */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* Titolo */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Cosa è successo?</p>
                <input
                  type="text"
                  value={urgentTitle}
                  onChange={(e) => setUrgentTitle(e.target.value)}
                  placeholder="Es: Allagamento, Porta rotta, Vetro rotto..."
                  className="w-full px-3 py-3 border-2 border-red-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Descrizione */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Descrivi il problema</p>
                <textarea
                  value={urgentDescription}
                  onChange={(e) => setUrgentDescription(e.target.value)}
                  placeholder="Descrivi la situazione in dettaglio..."
                  rows={3}
                  className="w-full px-3 py-3 border-2 border-red-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none"
                />
              </div>

              {/* Foto */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Foto (consigliato)</p>
                
                <input
                  ref={urgentPhotoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUrgentPhotoUpload}
                  className="hidden"
                />
                
                <div className="flex gap-2 flex-wrap">
                  {urgentPhotos.map((photo, idx) => (
                    <div key={idx} className="relative w-16 h-16">
                      <img src={photo} alt="" className="w-full h-full object-cover rounded-lg" />
                      <button
                        onClick={() => setUrgentPhotos(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  
                  <button
                    onClick={() => urgentPhotoInputRef.current?.click()}
                    disabled={uploadingUrgentPhoto}
                    className="w-16 h-16 border-2 border-dashed border-red-300 rounded-lg flex items-center justify-center text-red-400 hover:border-red-400"
                  >
                    {uploadingUrgentPhoto ? (
                      <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span className="text-xl">📷</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Footer con pulsante conferma */}
            <div className="flex-shrink-0 p-4 bg-slate-50 border-t border-slate-100 space-y-2">
              <button
                onClick={() => setShowUrgentConfirm(true)}
                disabled={!urgentTitle.trim() || !urgentDescription.trim()}
                className={`w-full py-3.5 rounded-xl font-bold text-white transition-all ${
                  urgentTitle.trim() && urgentDescription.trim()
                    ? 'bg-gradient-to-r from-red-600 to-rose-600 shadow-lg active:scale-[0.98]'
                    : 'bg-slate-300'
                }`}
              >
                🚨 INVIA SEGNALAZIONE URGENTE
              </button>
              <p className="text-[10px] text-center text-slate-400">
                Admin e proprietario riceveranno una notifica immediata
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          🚨 MODAL CONFERMA INVIO URGENTE
      ═══════════════════════════════════════════════════════════════ */}
      {showUrgentConfirm && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowUrgentConfirm(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Icon */}
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">🚨</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800">Conferma Segnalazione Urgente</h3>
              <p className="text-sm text-slate-500 mt-1">
                Stai per inviare una notifica immediata a:
              </p>
            </div>
            
            {/* Recipients */}
            <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">👤</span>
                <span className="text-sm font-medium">Admin del sistema</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">🏠</span>
                <span className="text-sm font-medium">Proprietario di {cleaning.propertyName}</span>
              </div>
            </div>
            
            {/* Summary */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-xs font-bold text-red-800 uppercase mb-1">Problema:</p>
              <p className="text-sm font-bold text-red-700">{urgentTitle}</p>
              {urgentPhotos.length > 0 && (
                <p className="text-xs text-red-600 mt-1">📷 {urgentPhotos.length} foto allegate</p>
              )}
            </div>
            
            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowUrgentConfirm(false)}
                className="flex-1 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl active:scale-[0.98]"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  setShowUrgentConfirm(false);
                  handleSendUrgentIssue();
                }}
                disabled={sendingUrgent}
                className="flex-1 py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold rounded-xl active:scale-[0.98] shadow-lg"
              >
                {sendingUrgent ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </span>
                ) : (
                  "✓ Conferma"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
