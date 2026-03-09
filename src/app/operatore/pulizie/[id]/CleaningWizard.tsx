"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, updateDoc, Timestamp, getDoc, addDoc, collection, onSnapshot } from "firebase/firestore";
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
import { getItemName } from "~/lib/itemNames";

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
async function notifyOwner(propertyId: string, title: string, message: string, type: 'info' | 'success', cleaningId?: string) {
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
          relatedEntityId: cleaningId || propertyId,
          relatedEntityType: cleaningId ? "CLEANING" : "PROPERTY",
          link: cleaningId ? `/proprietario/pulizie?id=${cleaningId}` : `/proprietario/proprieta/${propertyId}`,
          createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
        });
      }
    }
  } catch (error) {
    console.error("Errore notifica:", error);
  }
}

async function notifyAdmin(title: string, message: string, type: 'info' | 'success' | 'warning', cleaningId?: string) {
  try {
    await addDoc(collection(db, "notifications"), {
      title, message, type: type.toUpperCase(),
      recipientRole: 'ADMIN', recipientId: null,
      senderId: "system", senderName: "Sistema",
      status: "UNREAD", actionRequired: false,
      relatedEntityId: cleaningId || undefined,
      relatedEntityType: cleaningId ? "CLEANING" : undefined,
      link: cleaningId ? `/dashboard?openCleaning=${cleaningId}` : `/dashboard`,
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

const CHECKLIST_CATS: Record<string, {
  label: string;
  gradient: string;
  iconPath: string;
  doneColor: string;
}> = {
  camera: {
    label: "Camera",
    gradient: "from-blue-800 to-blue-500",
    iconPath: "M2 7h20v13a2 2 0 01-2 2H4a2 2 0 01-2-2V7zm0 4h20M7 7V5a2 2 0 014 0v2m6 0V5a2 2 0 014 0v2",
    doneColor: "#6ee7b7",
  },
  bagno: {
    label: "Bagno",
    gradient: "from-cyan-800 to-cyan-500",
    iconPath: "M6 8V6a4 4 0 018 0v2M3 8h18v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 5h8m-8 4h5",
    doneColor: "#6ee7b7",
  },
  cucina: {
    label: "Cucina",
    gradient: "from-orange-800 to-orange-500",
    iconPath: "M2 7h20v13a2 2 0 01-2 2H4a2 2 0 01-2-2V7zm14-4v4M8 3v4M2 11h20",
    doneColor: "#6ee7b7",
  },
  soggiorno: {
    label: "Soggiorno",
    gradient: "from-purple-800 to-purple-500",
    iconPath: "M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1v-9.5zM9 21V13h6v8",
    doneColor: "#6ee7b7",
  },
  generale: {
    label: "Generale",
    gradient: "from-slate-700 to-slate-500",
    iconPath: "M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1v-9.5zM9 21V13h6v8",
    doneColor: "#6ee7b7",
  },
};

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
  
  // Inizializza subito da cleaning.property (già caricata da page.tsx) per evitare race condition
  const [property, setProperty] = useState<any>(cleaning.property || {});
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

  // 🛏️ DOTAZIONE BIANCHERIA REALE - Caricata dall'ordine del rider
  const [realLinenItems, setRealLinenItems] = useState<{ id: string; name: string; quantity: number }[] | null>(null);
  const [loadingLinenOrder, setLoadingLinenOrder] = useState(false);
  const [usesOwnLinen, setUsesOwnLinen] = useState(false);

  // 📋 MODAL INFO PROPRIETÀ - Visibile dagli step 2-6
  const [showInfoModal, setShowInfoModal] = useState(false);

  // 🛏️ REALTIME CONFIGURAZIONE LETTI — aggiornata quando host modifica biancheria
  const [realtimeGuests, setRealtimeGuests] = useState<number>(cleaning.guestsCount || 2);
  const [realtimeSelectedBedIds, setRealtimeSelectedBedIds] = useState<string[]>(
    cleaning.customLinenConfig?.beds || []
  );

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
      
      if (!cleaning.propertyId) {
        setLoadingIssues(false);
        return;
      }
      
      try {
        const url = `/api/issues?propertyId=${cleaning.propertyId}&onlyOpen=true`;
        
        const res = await fetch(url);
        
        if (res.ok) {
          const data = await res.json();
          setOpenIssues(data.issues || []);
        } else {
        }
      } catch (error) {
        console.error("🔧 DEBUG: Errore caricamento segnalazioni:", error);
      } finally {
        setLoadingIssues(false);
      }
    }
    
    void loadOpenIssues();
  }, [cleaning.propertyId]);

  // Carica prodotti quando si entra nello step products
  useEffect(() => {
    if (currentStep === "products") {
      void loadAvailableProducts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Carica proprietà + checklist in REALTIME
  useEffect(() => {
    if (!cleaning.propertyId) return;
    const unsub = onSnapshot(doc(db, "properties", cleaning.propertyId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProperty({ id: snap.id, ...data });
        if (data.checklist && (data.checklist as unknown[]).length > 0) {
          setChecklist(data.checklist as typeof DEFAULT_CHECKLIST);
        } else {
          setChecklist(DEFAULT_CHECKLIST);
        }
        if (data.usesOwnLinen) setUsesOwnLinen(true);
      }
    });
    return () => unsub();
  }, [cleaning.propertyId]);

  // 🛏️ Carica dotazione biancheria REALE dall'ordine del rider — REALTIME
  // Usa onSnapshot così se admin/proprietario modifica la biancheria dalla modal,
  // l'operatore vede subito gli aggiornamenti
  useEffect(() => {
    const orderId = cleaning.laundryOrderId;
    if (!orderId) return;
    
    setLoadingLinenOrder(true);
    
    const unsub = onSnapshot(
      doc(db, "orders", orderId),
      (orderSnap) => {
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          const items = orderData.items || [];
          if (items.length > 0) {
            setRealLinenItems(items.map((item: any) => {
              const rawId = item.id || item.itemId || '';
              const rawName = item.name || rawId || 'Articolo';
              // Risolvi sempre il nome italiano dall'ID — sovrascrive nomi inglesi salvati male
              const resolvedName = getItemName(rawId) !== rawId
                ? getItemName(rawId)
                : getItemName(rawName) !== rawName
                ? getItemName(rawName)
                : rawName;
              return { id: rawId, name: resolvedName, quantity: item.quantity || 0 };
            }).filter((item: any) => item.quantity > 0));
          } else {
            setRealLinenItems([]);
          }
        }
        setLoadingLinenOrder(false);
      },
      (err) => {
        console.error("Errore listener ordine biancheria:", err);
        setLoadingLinenOrder(false);
      }
    );

    return () => unsub();
  }, [cleaning.laundryOrderId]);

  // 🛏️ REALTIME: ascolta modifiche a guestsCount e customLinenConfig sulla cleaning
  // Così quando host/admin cambia la configurazione biancheria, l'operatore vede subito i letti aggiornati
  useEffect(() => {
    if (!cleaning.id) return;
    const unsub = onSnapshot(
      doc(db, "cleanings", cleaning.id),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setRealtimeGuests(data.guestsCount || 2);
        setRealtimeSelectedBedIds(data.customLinenConfig?.beds || []);
      },
      (err) => console.error("Errore listener cleaning beds:", err)
    );
    return () => unsub();
  }, [cleaning.id]);
  useEffect(() => {
    if (cleaning.status === "COMPLETED") {
      setCurrentStep("complete");
    } else if (cleaning.status === "IN_PROGRESS") {
      // Solo se siamo in briefing, passa a checklist
      // NON resettare se l'utente è già avanzato a photos
      setCurrentStep(prev => {
        if (prev === "briefing") return "checklist";
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
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/product-requests/available");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { products?: typeof availableProducts };
      setAvailableProducts(data.products ?? []);
    } catch (error) {
      console.error("Errore caricamento prodotti:", error);
      setAvailableProducts([]);
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
      }
    } catch (error) {
      console.error("Errore invio richiesta prodotti:", error);
    }
  };

  const selectedProductsCount = Object.keys(selectedProducts).length;


  // Dati calcolati
  const bedConfiguration = property.bedConfiguration || [];
  const guests = realtimeGuests || cleaning.guestsCount || property.maxGuests || 2;
  const bathrooms = property.bathrooms || 1;
  const biancheria = calcolaBiancheria(bedConfiguration, guests, bathrooms);

  // 🛏️ REALTIME: ricostruisce la lista letti da mostrare all'operatore
  // Priorità: customLinenConfig.beds (scelta host) → bedConfiguration (struttura proprietà)
  const getSelectedBedsDisplay = (): Array<{ id: string; nome: string; tipo: string; quantita: number; loc: string }> => {
    // Converte dbType ('matr','sing','divano','castello') → BedType usato da BedBadge
    const DB_TYPE_MAP: Record<string, string> = {
      'matr': 'matrimoniale',
      'sing': 'singolo',
      'divano': 'divano_letto',
      'castello': 'castello',
      'castle': 'castello',
      // già in formato interno — passthrough
      'matrimoniale': 'matrimoniale',
      'singolo': 'singolo',
      'divano_letto': 'divano_letto',
      'piazza_mezza': 'piazza_mezza',
      'letto_aggiuntivo': 'letto_aggiuntivo',
    };
    const resolveType = (t: string): string =>
      DB_TYPE_MAP[t] || DB_TYPE_MAP[t?.toLowerCase()] || 'singolo';

    if (realtimeSelectedBedIds.length > 0) {
      // CASO 1: host ha scelto letti specifici (linenConfigModified=true → customLinenConfig.beds salvato)
      const bedsConfig: any[] = property.bedsConfig || [];
      
      // Fallback: se bedsConfig non ha i letti, ricostruisce da serviceConfigs (stesso logic di EditCleaningModal)
      let allBeds = bedsConfig;
      if (allBeds.length === 0 && property.serviceConfigs) {
        const reconstructed: any[] = [];
        const seen = new Set<string>();
        Object.values(property.serviceConfigs).forEach((cfg: any) => {
          if (cfg?.beds && Array.isArray(cfg.beds)) {
            cfg.beds.forEach((id: string) => {
              if (!seen.has(id)) {
                seen.add(id);
                // Estrai tipo dall'ID (formato: b1, b2, ... oppure stanza_tipo_n)
                const parts = id.split('_');
                let type = 'singolo';
                if (parts.length >= 3) {
                  const t = parts[2].toLowerCase();
                  if (t.includes('matrim') || t === 'matr') type = 'matrimoniale';
                  else if (t.includes('divano')) type = 'divano_letto';
                  else if (t.includes('castell')) type = 'castello';
                } else if (id.startsWith('b')) {
                  // formato b1, b2 — tipo non ricavabile, default matrimoniale per copertura
                  type = 'matrimoniale';
                }
                reconstructed.push({ id, tipo: type, type: resolveType(type), name: type, loc: 'Camera' });
              }
            });
          }
        });
        allBeds = reconstructed;
      }

      const matched = realtimeSelectedBedIds
        .map((bedId: string) => {
          const found = allBeds.find((b: any) => b.id === bedId);
          if (found) {
            // tipo interno ha priorità, poi converte da dbType se necessario
            const rawType = found.tipo || found.type || 'singolo';
            return {
              id: found.id,
              nome: found.name || found.nome || 'Letto',
              tipo: resolveType(rawType),
              quantita: 1,
              loc: found.loc || found.stanza || 'Camera',
            };
          }
          return null;
        })
        .filter(Boolean) as any[];
      if (matched.length > 0) return matched;
    }

    // CASO 2: host usa config standard (linenConfigModified=false) → legge serviceConfigs[guestsCount]
    // Questo è il caso più comune: l'host ha solo confermato il numero ospiti senza modificare i letti
    if (property.serviceConfigs) {
      const cfg = property.serviceConfigs[realtimeGuests] || property.serviceConfigs[String(realtimeGuests)];
      if (cfg?.beds && cfg.beds.length > 0) {
        const bedsConfig: any[] = property.bedsConfig || [];
        const matched = cfg.beds
          .map((bedId: string) => {
            const found = bedsConfig.find((b: any) => b.id === bedId);
            if (found) {
              const rawType = found.tipo || found.type || 'singolo';
              return {
                id: found.id,
                nome: found.name || found.nome || 'Letto',
                tipo: resolveType(rawType),
                quantita: 1,
                loc: found.loc || found.stanza || 'Camera',
              };
            }
            // ID non trovato in bedsConfig — ricostruisce dal formato ID
            const parts = bedId.split('_');
            let type = 'singolo';
            if (parts.length >= 3) {
              const t = parts[2].toLowerCase();
              if (t.includes('matrim') || t === 'matr') type = 'matrimoniale';
              else if (t.includes('divano')) type = 'divano_letto';
              else if (t.includes('castell')) type = 'castello';
            }
            return { id: bedId, nome: BED_TYPE_LABELS[type] || type, tipo: resolveType(type), quantita: 1, loc: 'Camera' };
          })
          .filter(Boolean) as any[];
        if (matched.length > 0) return matched;
      }
    }
    // Fallback: converti bedConfiguration (vecchio formato a stanze) in lista piatta
    const flat: any[] = [];
    bedConfiguration.forEach((stanza: any) => {
      stanza.letti?.forEach((letto: any) => {
        flat.push({
          id: `${stanza.nome}_${letto.tipo}`,
          nome: BED_TYPE_LABELS[letto.tipo] || letto.tipo,
          tipo: resolveType(letto.tipo),
          quantita: letto.quantita || 1,
          loc: stanza.nome,
        });
      });
    });
    return flat;
  };

  const selectedBedsDisplay = getSelectedBedsDisplay();

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
      
      // 🔥 FIX: Resetta stato locale se c'erano dati vecchi di progresso
      // (l'API ha già resettato su Firestore, qui resettiamo lo stato React)
      if (cleaning.photos?.length > 0 || cleaning.completedChecklist?.length > 0 || cleaning.startedBy) {
        setPhotos([]);
        setCompletedItems([]);
      }
      setCurrentStep("checklist");
      setShowConfirmStart(false);
    } catch (e) {
      console.error("Errore:", e);
      // Fallback: aggiorna direttamente se l'API fallisce
      try {
        const fallbackData: any = {
          status: "IN_PROGRESS",
          startedAt: Timestamp.now(),
          operatorId: user?.id,
          operatorName: user?.name || user?.email,
        };
        // Resetta anche nel fallback se ci sono dati vecchi
        if (cleaning.photos?.length > 0 || cleaning.completedChecklist?.length > 0 || cleaning.startedBy) {
          fallbackData.photos = [];
          fallbackData.completedChecklist = [];
          fallbackData.operatorNotes = "";
          fallbackData.ratingScores = null;
          fallbackData.ratingNotes = "";
          fallbackData.wizardStep = "checklist";
          setPhotos([]);
          setCompletedItems([]);
        }
        await updateDoc(doc(db, "cleanings", cleaning.id), fallbackData);
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

    const fileList = Array.from(files);
    setUploadingPhotos(true);
    setUploadProgress({ current: 0, total: fileList.length });

    // Import compressione
    const { compressImage, getOptimalCompressionConfig } = await import("~/lib/photos/imageCompression");
    const config = getOptimalCompressionConfig();

    // 1. COMPRIMI TUTTE IN PARALLELO (max 3 alla volta)
    const compressed: { blob: Blob; index: number }[] = [];
    const COMPRESS_BATCH = 3;
    
    for (let i = 0; i < fileList.length; i += COMPRESS_BATCH) {
      const batch = fileList.slice(i, i + COMPRESS_BATCH);
      const results = await Promise.all(
        batch.map(async (file, batchIdx) => {
          const result = await compressImage(file, config);
          return {
            blob: (result.success && result.compressedBlob) ? result.compressedBlob : file,
            index: i + batchIdx,
          };
        })
      );
      compressed.push(...results);
    }

    // 2. UPLOAD PARALLELO (max 3 alla volta) 
    const newPhotos: string[] = [];
    let completedCount = 0;
    const UPLOAD_BATCH = 3;

    for (let i = 0; i < compressed.length; i += UPLOAD_BATCH) {
      const batch = compressed.slice(i, i + UPLOAD_BATCH);
      const results = await Promise.all(
        batch.map(async ({ blob }) => {
          try {
            const formData = new FormData();
            formData.append("file", blob, `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`);
            formData.append("cleaningId", cleaning.id);

            const response = await fetch("/api/upload-photo", {
              method: "POST",
              body: formData,
            });

            if (response.ok) {
              const data = await response.json();
              return data.url || null;
            }
          } catch (error) {
            console.error("Errore upload:", error);
          }
          return null;
        })
      );

      results.forEach(url => { if (url) newPhotos.push(url); });
      completedCount += batch.length;
      setUploadProgress({ current: completedCount, total: fileList.length });
    }

    // 3. Salva tutto su Firestore in un colpo solo
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

      // 📲📧 Notifiche + Push + Email → tutto delegato all'API (un solo punto)
      try {
        await fetch(`/api/cleanings/${cleaning.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            notifyOnly: true,
            operatorName: user?.name || user?.email || "Operatore",
            issues: issues.map(i => ({ severity: i.severity })),
            photosCount: photos.length,
            hasProductRequest: selectedProductsCount > 0,
            productCount: selectedProductsCount,
          }),
        });
      } catch (emailErr) {
        console.error("Errore trigger email complete:", emailErr);
      }

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
      const { compressImage, getOptimalCompressionConfig } = await import("~/lib/photos/imageCompression");
      const config = getOptimalCompressionConfig();

      for (const file of Array.from(files)) {
        let fileToUpload: Blob = file;
        const compressed = await compressImage(file, config);
        if (compressed.success && compressed.compressedBlob) {
          fileToUpload = compressed.compressedBlob;
        }

        const formData = new FormData();
        formData.append("file", fileToUpload, `issue_${Date.now()}.jpg`);
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
      const { compressImage, getOptimalCompressionConfig } = await import("~/lib/photos/imageCompression");
      const config = getOptimalCompressionConfig();

      for (const file of Array.from(files)) {
        let fileToUpload: Blob = file;
        const compressed = await compressImage(file, config);
        if (compressed.success && compressed.compressedBlob) {
          fileToUpload = compressed.compressedBlob;
        }

        const formData = new FormData();
        formData.append("file", fileToUpload, `urgent_${Date.now()}.jpg`);
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
        'info',
        cleaning.id
      );
      
      // 3. Notifica l'admin (tutti gli admin)
      try {
        await addDoc(collection(db, "notifications"), {
          type: "WARNING",
          title: `🚨 URGENTE: ${cleaning.propertyName}`,
          message: `Problema critico segnalato: ${urgentTitle}`,
          recipientRole: "ADMIN",
          recipientId: null,
          senderId: "system",
          senderName: "Sistema",
          status: "UNREAD",
          actionRequired: true,
          relatedEntityId: cleaning.id,
          relatedEntityType: "CLEANING",
          link: `/dashboard?openCleaning=${cleaning.id}`,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
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

  // 📋 Pulsante Info Proprietà (riusabile in step 2-6)
  const InfoPropertyButton = (
    <button onClick={() => setShowInfoModal(true)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] border border-slate-200 bg-white active:scale-[0.98] transition-all">
      <div className="w-9 h-9 rounded-[10px] bg-sky-50 flex items-center justify-center flex-shrink-0">
        <svg className="w-[18px] h-[18px] text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </div>
      <div className="flex-1 text-left">
        <span className="block text-sm font-bold text-slate-800">{cleaning.propertyName || "Proprietà"}</span>
        <span className="block text-[11px] text-slate-400">Vedi accesso, letti, biancheria, note</span>
      </div>
      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7"/></svg>
    </button>
  );

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

      {/* Header fisso — Dark Premium */}
      <div className="flex-shrink-0 bg-gradient-to-br from-slate-900 to-slate-800 z-10 relative overflow-hidden">
        <div className="absolute -top-20 -right-10 w-44 h-44 bg-sky-500/10 rounded-full blur-2xl" />
        <div className="px-4 py-3 flex items-center gap-3 relative z-10">
          <Link href="/operatore" className="w-9 h-9 rounded-[10px] bg-white/[0.07] border border-white/[0.1] flex items-center justify-center">
            <svg className="w-[18px] h-[18px] text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-white truncate text-[15px]">{cleaning.propertyName || "Pulizia"}</h1>
            <p className="text-xs text-white/40 truncate">{cleaning.propertyAddress}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
            cleaning.status === "COMPLETED" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" :
            cleaning.status === "IN_PROGRESS" ? "bg-amber-500/15 text-amber-300 border-amber-500/20" :
            "bg-sky-500/15 text-sky-300 border-sky-500/20"
          }`}>
            {cleaning.status === "COMPLETED" ? "Fatto" :
             cleaning.status === "IN_PROGRESS" ? "In corso" : "Da fare"}
          </span>
        </div>

        {/* Progress Steps — Dark theme */}
        {cleaning.status !== "COMPLETED" && (
          <div className="px-4 pb-3 relative z-10">
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
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isActive 
                          ? "bg-sky-500 text-white shadow-lg shadow-sky-500/40" 
                          : isCompleted 
                            ? "bg-emerald-500/20 text-emerald-300" 
                            : "bg-white/[0.06] text-white/25"
                      }`}>
                        {isCompleted ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                        ) : (
                          <WizardStepIcon step={step.id} size={16} color="currentColor" />
                        )}
                      </div>
                      <span className={`text-[9px] mt-1 font-semibold ${
                        isActive 
                          ? "text-sky-400" 
                          : isCompleted 
                            ? "text-emerald-400" 
                            : "text-white/20"
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < arr.length - 1 && (
                      <div className={`w-3 h-0.5 mx-0.5 mb-4 rounded-full ${
                        isCompleted ? "bg-emerald-500/30" : "bg-white/[0.08]"
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
            STEP 1: BRIEFING — Dark Premium restyled
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "briefing" && cleaning.status !== "COMPLETED" && (
          <>
            {/* Info rapide */}
            <div className="flex gap-2">
              <div className="flex-1 bg-white rounded-[14px] p-3 text-center border border-slate-100">
                <div className="w-8 h-8 rounded-[10px] bg-sky-50 flex items-center justify-center mx-auto mb-1">
                  <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                <p className="text-sm font-extrabold text-slate-800">{scheduledDate.split(',')[0] || scheduledDate}</p>
                <p className="text-[10px] text-slate-400 font-semibold">{cleaning.scheduledTime || "10:00"}</p>
              </div>
              <div className="flex-1 bg-white rounded-[14px] p-3 text-center border border-slate-100">
                <div className="w-8 h-8 rounded-[10px] bg-emerald-50 flex items-center justify-center mx-auto mb-1">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>
                <p className="text-lg font-extrabold text-slate-800">{realtimeGuests}</p>
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Ospiti</p>
              </div>
              <div className="flex-1 bg-white rounded-[14px] p-3 text-center border border-slate-100">
                <div className="w-8 h-8 rounded-[10px] bg-violet-50 flex items-center justify-center mx-auto mb-1">
                  <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                </div>
                <p className="text-lg font-extrabold text-slate-800">{bedConfiguration.length || property.bedrooms || 1}</p>
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Camere</p>
              </div>
              <div className="flex-1 bg-white rounded-[14px] p-3 text-center border border-slate-100">
                <div className="w-8 h-8 rounded-[10px] bg-pink-50 flex items-center justify-center mx-auto mb-1">
                  <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                </div>
                <p className="text-lg font-extrabold text-slate-800">{bathrooms}</p>
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Bagni</p>
              </div>
            </div>

            {/* 1. Accesso Proprietà */}
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

            {/* 2. Configurazione Letti — REALTIME: aggiornata quando host modifica biancheria */}
            {selectedBedsDisplay.length > 0 && (
              <div className="bg-white rounded-[16px] border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-[10px] bg-sky-50 flex items-center justify-center">
                      <svg className="w-[18px] h-[18px] text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v10m0-3h18m0-7v10M7 10.5V7h10v3.5"/></svg>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Configurazione Letti</span>
                      {realtimeSelectedBedIds.length > 0 && (
                        <span className="ml-2 text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-md">● live</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg">
                      {realtimeGuests} ospiti
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {/* Raggruppa per stanza */}
                  {(() => {
                    const grouped: Record<string, typeof selectedBedsDisplay> = {};
                    selectedBedsDisplay.forEach(b => {
                      const loc = b.loc || 'Camera';
                      if (!grouped[loc]) grouped[loc] = [];
                      grouped[loc].push(b);
                    });
                    return Object.entries(grouped).map(([loc, beds], idx) => (
                      <div key={loc} className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">{loc}</p>
                        <div className="flex flex-wrap gap-2">
                          {beds.map((bed, lidx) => (
                            <BedBadge
                              key={`${bed.id}_${lidx}`}
                              type={(bed.tipo as BedType) || "singolo"}
                              quantity={bed.quantita || 1}
                              color={idx % 2 === 0 ? "emerald" : "blue"}
                              size="sm"
                            />
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* 3. Dotazione Biancheria — Dati reali dall'ordine del rider */}
            <div className="bg-white rounded-[16px] border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[10px] bg-emerald-50 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px] text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Dotazione Biancheria</span>
              </div>
              <div className="p-4">
                {usesOwnLinen ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                    <svg className="w-6 h-6 text-blue-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <p className="text-sm font-medium text-blue-700">Questa proprietà usa biancheria propria</p>
                    <p className="text-xs text-blue-500 mt-1">Nessuna consegna prevista dal rider</p>
                  </div>
                ) : loadingLinenOrder ? (
                  <div className="flex items-center justify-center py-4 gap-2">
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-slate-500">Caricamento dotazione...</span>
                  </div>
                ) : realLinenItems && realLinenItems.length > 0 ? (
                  <div className="space-y-0">
                    {realLinenItems.map((item, idx) => (
                      <div key={item.id || idx} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                          </div>
                          <span className="text-sm text-slate-700">{item.name}</span>
                        </div>
                        <span className="text-sm font-extrabold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg">{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Fallback: calcolo locale se non c'è ordine */
                  <div className="space-y-0">
                    {biancheriaList.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                          </div>
                          <span className="text-sm text-slate-700">{item.name}</span>
                        </div>
                        <span className="text-sm font-extrabold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg">{item.qty}</span>
                      </div>
                    ))}
                    {biancheriaList.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-3">Nessuna dotazione configurata</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 4. Note */}
            {(cleaning.notes || property.cleaningInstructions) && (
              <div className="bg-amber-50 border border-amber-200 rounded-[14px] p-3.5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-amber-800">Note</p>
                  <p className="text-sm text-amber-700 mt-0.5">{cleaning.notes || property.cleaningInstructions}</p>
                </div>
              </div>
            )}

            {/* 5. Segnalazioni aperte */}
            {!loadingIssues && openIssues.length > 0 && (
              <OpenIssuesSection 
                issues={openIssues}
              />
            )}
            {!loadingIssues && openIssues.length === 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-[14px] p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-800">Nessuna segnalazione aperta</p>
                  <p className="text-sm text-emerald-600">Tutto ok per questa proprietà</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 2: CLEANING (Checklist) — Dark Premium
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "checklist" && cleaning.status !== "COMPLETED" && (
          <>
            {/* Pulsante Info Proprietà */}
            {InfoPropertyButton}

            {/* Global progress header */}
            <div className="bg-white rounded-[16px] border border-slate-200 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] bg-sky-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-[18px] h-[18px] text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Checklist pulizie</p>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
                    style={{ width: `${checklist.length > 0 ? (completedItems.length / checklist.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg flex-shrink-0">
                {completedItems.length}/{checklist.length}
              </span>
            </div>

            {/* Card per categoria — stile gradient scuro + arco SVG */}
            {(() => {
              const catOrder: string[] = [];
              const groups: Record<string, typeof checklist> = {};
              checklist.forEach(item => {
                const cat = item.category ?? "generale";
                if (!groups[cat]) { groups[cat] = []; catOrder.push(cat); }
                groups[cat].push(item);
              });

              return catOrder.map(cat => {
                const cfg = CHECKLIST_CATS[cat] ?? CHECKLIST_CATS.generale;
                const items = groups[cat];
                const doneCount = items.filter(i => completedItems.includes(i.id)).length;
                const total     = items.length;
                const pct       = total > 0 ? doneCount / total : 0;
                const allDone   = doneCount === total;
                // SVG arc: r=14, circumference=87.96
                const circ      = 87.96;
                const offset    = circ - pct * circ;

                return (
                  <div key={cat} className={`rounded-[16px] overflow-hidden transition-opacity duration-300 ${allDone ? "opacity-70" : ""}`}>
                    {/* Header gradient */}
                    <div className={`bg-gradient-to-r ${cfg.gradient} px-4 py-3 flex items-center gap-3`}>
                      {/* Icona SVG in box traslucido */}
                      <div className="w-9 h-9 rounded-[10px] bg-white/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="white" viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d={cfg.iconPath}/>
                        </svg>
                      </div>
                      {/* Nome + subtitle */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-800 text-white font-extrabold leading-none">{cfg.label}</p>
                        <p className="text-[10px] text-white/50 mt-0.5">{doneCount} di {total} completate</p>
                      </div>
                      {/* Arco SVG animato */}
                      <div className="relative w-9 h-9 flex-shrink-0">
                        <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
                          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3"/>
                          <circle
                            cx="18" cy="18" r="14"
                            fill="none"
                            stroke={allDone ? "#6ee7b7" : "white"}
                            strokeWidth="3"
                            strokeDasharray={circ}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                            style={{ transition: "stroke-dashoffset 0.4s cubic-bezier(.4,0,.2,1), stroke 0.3s" }}
                          />
                        </svg>
                        <span
                          className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold"
                          style={{ color: allDone ? "#6ee7b7" : "white" }}
                        >
                          {allDone ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                          ) : doneCount}
                        </span>
                      </div>
                    </div>

                    {/* Voci categoria */}
                    <div className={`px-3 py-2 flex flex-col gap-1.5 ${allDone ? "bg-emerald-50" : "bg-white"} border border-t-0 border-slate-200 rounded-b-[16px]`}>
                      {items.map((item, idx) => {
                        const done = completedItems.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleToggleItem(item.id)}
                            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all active:scale-[0.98] ${done ? "bg-emerald-50" : "bg-slate-50"}`}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
                              {done ? (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                              ) : (
                                <span className="text-[10px] font-bold">{idx + 1}</span>
                              )}
                            </div>
                            <span className={`flex-1 text-left text-sm font-medium transition-all duration-150 ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                              {item.text}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}

            {/* Note */}
            <div className="bg-white rounded-[16px] border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[10px] bg-violet-50 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px] text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Note (opzionale)</span>
              </div>
              <div className="p-4">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Segnala problemi o note..."
                  className="w-full p-3 border-[1.5px] border-slate-200 rounded-xl text-sm resize-none h-20 outline-none focus:border-sky-400 transition-colors"
                />
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 3: PRODOTTI PULIZIA
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "products" && cleaning.status !== "COMPLETED" && (
          <>
            {InfoPropertyButton}

            {/* Header */}
            <div className="bg-white rounded-[16px] border border-slate-200 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] bg-rose-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-[18px] h-[18px] text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Prodotti Pulizia</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Segnala prodotti mancanti o in esaurimento</p>
              </div>
              {selectedProductsCount > 0 && (
                <span className="text-xs font-bold bg-rose-500 text-white px-2.5 py-1 rounded-lg flex-shrink-0">
                  {selectedProductsCount} sel.
                </span>
              )}
            </div>

            {/* Lista prodotti */}
            <div className="bg-white rounded-[16px] border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Inventario disponibile</span>
                {loadingProducts && (
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                )}
              </div>

              {loadingProducts ? (
                <div className="p-10 text-center">
                  <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
                  <p className="text-sm text-slate-500 font-medium">Caricamento prodotti...</p>
                </div>
              ) : availableProducts.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-4 0v2"/>
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-slate-600 mb-1">Nessun prodotto configurato</p>
                  <p className="text-xs text-slate-400">L&apos;admin non ha ancora aggiunto prodotti<br/>nella categoria &quot;Prodotti Pulizia&quot;</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {availableProducts.map((product) => {
                    const selected = selectedProducts[product.id as string] ?? 0;
                    const productId = product.id as string;
                    return (
                      <div key={productId} className={`px-4 py-3 flex items-center gap-3 transition-colors ${selected > 0 ? "bg-rose-50" : ""}`}>
                        {/* Icona SVG */}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${selected > 0 ? "bg-rose-100" : "bg-slate-100"}`}>
                          <svg className={`w-5 h-5 ${selected > 0 ? "text-rose-500" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/>
                          </svg>
                        </div>
                        {/* Nome + unità */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-600 truncate ${selected > 0 ? "text-rose-800 font-bold" : "text-slate-800"}`}>
                            {product.name as string}
                          </p>
                          <p className="text-[11px] text-slate-400">{product.unit as string}</p>
                        </div>
                        {/* Stepper */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => {
                              if (selected > 0) {
                                setSelectedProducts(prev => {
                                  const next = { ...prev };
                                  if (selected - 1 === 0) delete next[productId];
                                  else next[productId] = selected - 1;
                                  return next;
                                });
                              }
                            }}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center text-lg font-bold transition-colors ${selected > 0 ? "bg-rose-200 text-rose-700 active:scale-95" : "bg-slate-100 text-slate-300 cursor-default"}`}
                          >
                            −
                          </button>
                          <span className={`w-7 text-center text-sm font-bold ${selected > 0 ? "text-rose-600" : "text-slate-300"}`}>
                            {selected || "·"}
                          </span>
                          <button
                            onClick={() => setSelectedProducts(prev => ({ ...prev, [productId]: selected + 1 }))}
                            className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center text-lg font-bold active:scale-95 transition-transform"
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

            {/* Riepilogo */}
            {selectedProductsCount > 0 ? (
              <div className="bg-rose-50 border border-rose-200 rounded-[16px] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                  </svg>
                  <span className="text-xs font-bold text-rose-700 uppercase tracking-wide">Richiesta in preparazione</span>
                  <span className="ml-auto bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{selectedProductsCount}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(selectedProducts)
                    .filter(([, qty]) => qty > 0)
                    .map(([id, qty]) => {
                      const product = availableProducts.find(p => p.id === id);
                      if (!product) return null;
                      return (
                        <span key={id} className="text-xs bg-white border border-rose-200 text-rose-700 px-2 py-0.5 rounded-lg font-medium">
                          {product.name as string} ×{qty}
                        </span>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-[16px] p-3 flex items-center gap-2.5">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <p className="text-sm text-emerald-700 font-medium">Tutto ok? Puoi procedere senza richiedere nulla.</p>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 4: RATING (ex step 3 photos)
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "photos" && cleaning.status !== "COMPLETED" && (
          <>
            {InfoPropertyButton}
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


          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 4: RATING E PROBLEMI
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "rating" && cleaning.status !== "COMPLETED" && (
          <>
            {InfoPropertyButton}
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
            {InfoPropertyButton}
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
                <button
                  onClick={() => setCurrentStep("checklist")}
                  className="w-full py-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white font-bold rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-slate-800/30"
                >
                  <span className="flex items-center justify-center gap-2">
                    <span>Continua</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setShowConfirmStart(true)}
                  className="w-full py-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white font-bold rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-slate-800/30"
                >
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
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
                        ? "bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-lg shadow-slate-800/30"
                        : "bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-lg shadow-slate-800/30"
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
      
      {/* ══════════════════════════════════════════════════════════════
          📋 MODAL INFO PROPRIETÀ — Contenuto briefing completo
      ══════════════════════════════════════════════════════════════ */}
      {showInfoModal && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={() => setShowInfoModal(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div 
            className="relative w-full max-w-md max-h-[85vh] bg-slate-50 rounded-t-[20px] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {cleaning.propertyName || "Proprietà"}
              </h3>
              <button 
                onClick={() => setShowInfoModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Body scrollabile — stesso contenuto del briefing */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Info rapide */}
              <div className="flex gap-2">
                <div className="flex-1 bg-white rounded-[14px] p-3 text-center border border-slate-100">
                  <div className="w-8 h-8 rounded-[10px] bg-sky-50 flex items-center justify-center mx-auto mb-1">
                    <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  </div>
                  <p className="text-sm font-extrabold text-slate-800">{scheduledDate.split(',')[0] || scheduledDate}</p>
                  <p className="text-[10px] text-slate-400 font-semibold">{cleaning.scheduledTime || "10:00"}</p>
                </div>
                <div className="flex-1 bg-white rounded-[14px] p-3 text-center border border-slate-100">
                  <div className="w-8 h-8 rounded-[10px] bg-emerald-50 flex items-center justify-center mx-auto mb-1">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </div>
                  <p className="text-lg font-extrabold text-slate-800">{realtimeGuests}</p>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Ospiti</p>
                </div>
                <div className="flex-1 bg-white rounded-[14px] p-3 text-center border border-slate-100">
                  <div className="w-8 h-8 rounded-[10px] bg-violet-50 flex items-center justify-center mx-auto mb-1">
                    <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                  </div>
                  <p className="text-lg font-extrabold text-slate-800">{selectedBedsDisplay.length || bedConfiguration.length || property.bedrooms || 1}</p>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Camere</p>
                </div>
              </div>

              {/* Accesso */}
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

              {/* Letti — REALTIME */}
              {selectedBedsDisplay.length > 0 && (
                <div className="bg-white rounded-[16px] border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-[10px] bg-sky-50 flex items-center justify-center">
                        <svg className="w-[18px] h-[18px] text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v10m0-3h18m0-7v10M7 10.5V7h10v3.5"/></svg>
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Configurazione Letti</span>
                        {realtimeSelectedBedIds.length > 0 && (
                          <span className="ml-2 text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-md">● live</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg">{realtimeGuests} ospiti</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {(() => {
                      const grouped: Record<string, typeof selectedBedsDisplay> = {};
                      selectedBedsDisplay.forEach(b => {
                        const loc = b.loc || 'Camera';
                        if (!grouped[loc]) grouped[loc] = [];
                        grouped[loc].push(b);
                      });
                      return Object.entries(grouped).map(([loc, beds], idx) => (
                        <div key={loc} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">{loc}</p>
                          <div className="flex flex-wrap gap-2">
                            {beds.map((bed, lidx) => (
                              <BedBadge key={`${bed.id}_${lidx}`} type={(bed.tipo as BedType) || "singolo"} quantity={bed.quantita || 1} color={idx % 2 === 0 ? "emerald" : "blue"} size="sm" />
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* Dotazione Biancheria */}
              <div className="bg-white rounded-[16px] border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[10px] bg-emerald-50 flex items-center justify-center">
                    <svg className="w-[18px] h-[18px] text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Dotazione Biancheria</span>
                </div>
                <div className="p-4">
                  {realLinenItems && realLinenItems.length > 0 ? (
                    realLinenItems.map((item, idx) => (
                      <div key={item.id || idx} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                        <span className="text-sm text-slate-700">{item.name}</span>
                        <span className="text-sm font-extrabold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg">{item.quantity}</span>
                      </div>
                    ))
                  ) : biancheriaList.length > 0 ? (
                    biancheriaList.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                        <span className="text-sm text-slate-700">{item.name}</span>
                        <span className="text-sm font-extrabold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg">{item.qty}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-2">Nessuna dotazione</p>
                  )}
                </div>
              </div>

              {/* Note */}
              {(cleaning.notes || property.cleaningInstructions) && (
                <div className="bg-amber-50 border border-amber-200 rounded-[14px] p-3.5 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-800">Note</p>
                    <p className="text-sm text-amber-700 mt-0.5">{cleaning.notes || property.cleaningInstructions}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
