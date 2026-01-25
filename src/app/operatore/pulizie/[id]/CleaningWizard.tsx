"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, updateDoc, Timestamp, getDoc, addDoc, collection } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { PhotoLightbox } from "~/components/ui/PhotoLightbox";
import PropertyAccessCard from "~/components/property/PropertyAccessCard";

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

// Mappa nomi biancheria leggibili
const BIANCHERIA_NOMI: Record<string, string> = {
  'lenzuolo_matr': 'Lenzuolo Matrimoniale',
  'lenzuolo_sing': 'Lenzuolo Singolo',
  'lenzuolo_1p': 'Lenzuolo 1 Piazza',
  'copripiumino_matr': 'Copripiumino Matrimoniale',
  'copripiumino_sing': 'Copripiumino Singolo',
  'federa': 'Federa',
  'federa_std': 'Federa Standard',
  'asciugamano_grande': 'Asciugamano Grande',
  'asciugamano_piccolo': 'Asciugamano Piccolo',
  'asciugamano_ospite': 'Asciugamano Ospite',
  'tappetino_bagno': 'Tappetino Bagno',
  'accappatoio': 'Accappatoio',
};

// Tipi letto
const TIPI_LETTO: Record<string, { nome: string; icon: string }> = {
  matrimoniale: { nome: 'Matrimoniale', icon: '🛏️' },
  singolo: { nome: 'Singolo', icon: '🛏️' },
  piazza_mezza: { nome: 'Una Piazza e Mezza', icon: '🛏️' },
  divano_letto: { nome: 'Divano Letto', icon: '🛋️' },
  castello: { nome: 'Letto a Castello', icon: '🛏️' },
};

// Calcola biancheria
function calcolaBiancheria(
  bedConfiguration: any[],
  guests: number,
  bathrooms: number,
  customLinenConfig?: any,
  serviceConfigs?: Record<number, any>
) {
  // Priorità 1: customLinenConfig
  if (customLinenConfig?.beds?.length > 0) {
    const bedLinenItems: Record<string, number> = {};
    const bathLinenItems: Record<string, number> = {};
    
    if (customLinenConfig.bl) {
      Object.values(customLinenConfig.bl).forEach((bedItems: any) => {
        Object.entries(bedItems).forEach(([itemId, qty]) => {
          bedLinenItems[itemId] = (bedLinenItems[itemId] || 0) + (qty as number);
        });
      });
    }
    
    if (customLinenConfig.ba) {
      Object.entries(customLinenConfig.ba).forEach(([itemId, qty]) => {
        bathLinenItems[itemId] = qty as number;
      });
    }
    
    return {
      customConfig: true,
      bedLinenItems,
      bathLinenItems,
      selectedBeds: customLinenConfig.beds || [],
      asciugamaniGrandi: bathLinenItems['asciugamano_grande'] || guests,
      asciugamaniPiccoli: bathLinenItems['asciugamano_piccolo'] || guests,
      tappetiniBagno: bathLinenItems['tappetino_bagno'] || bathrooms,
    };
  }

  // Priorità 2: serviceConfigs per numero ospiti
  if (serviceConfigs && serviceConfigs[guests]) {
    const config = serviceConfigs[guests];
    const bedLinenItems: Record<string, number> = {};
    const bathLinenItems: Record<string, number> = {};
    
    if (config.bl) {
      Object.values(config.bl).forEach((bedItems: any) => {
        Object.entries(bedItems).forEach(([itemId, qty]) => {
          bedLinenItems[itemId] = (bedLinenItems[itemId] || 0) + (qty as number);
        });
      });
    }
    
    if (config.ba) {
      Object.entries(config.ba).forEach(([itemId, qty]) => {
        bathLinenItems[itemId] = qty as number;
      });
    }
    
    return {
      customConfig: true,
      bedLinenItems,
      bathLinenItems,
      selectedBeds: config.beds || [],
      asciugamaniGrandi: bathLinenItems['asciugamano_grande'] || guests,
      asciugamaniPiccoli: bathLinenItems['asciugamano_piccolo'] || guests,
      tappetiniBagno: bathLinenItems['tappetino_bagno'] || bathrooms,
    };
  }

  // Priorità 3: Calcolo da bedConfiguration
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
    customConfig: false,
    lenzuolaMatrimoniali,
    lenzuolaSingole,
    federe,
    asciugamaniGrandi: guests,
    asciugamaniPiccoli: guests,
    tappetiniBagno: bathrooms,
  };
}

// Funzione per ottenere nome leggibile
function getNomeBiancheria(itemId: string): string {
  if (BIANCHERIA_NOMI[itemId]) return BIANCHERIA_NOMI[itemId];
  // Fallback: formatta l'ID
  return itemId
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .substring(0, 20); // Limita lunghezza
}

export default function CleaningWizard({ cleaning, user }: CleaningWizardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State
  const [currentStep, setCurrentStep] = useState<"briefing" | "cleaning" | "photos" | "confirm">("briefing");
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

  // Carica proprietà
  useEffect(() => {
    async function loadProperty() {
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
    loadProperty();
  }, [cleaning.propertyId]);

  // Sync step con stato
  useEffect(() => {
    if (cleaning.status === "COMPLETED") {
      setCurrentStep("confirm");
    } else if (cleaning.status === "IN_PROGRESS") {
      setCurrentStep("cleaning");
    } else {
      setCurrentStep("briefing");
    }
  }, [cleaning.status]);

  // Dati calcolati
  const bedConfiguration = property.bedConfiguration || [];
  const guests = cleaning.guestsCount || property.maxGuests || 2;
  const bathrooms = property.bathrooms || 1;
  const biancheria = calcolaBiancheria(
    bedConfiguration,
    guests,
    bathrooms,
    cleaning.customLinenConfig,
    property.serviceConfigs
  );

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
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        status: "COMPLETED",
        completedAt: Timestamp.now(),
        completedChecklist: completedItems,
        photos,
        operatorNotes: notes,
      });

      // Notifiche
      await notifyOwner(
        cleaning.propertyId,
        "✅ Pulizia Completata",
        `La pulizia di ${cleaning.propertyName || "proprietà"} è stata completata.`,
        "success"
      );
      await notifyAdmin(
        "✅ Pulizia Completata",
        `${user?.name || "Operatore"} ha completato la pulizia di ${cleaning.propertyName}.`,
        "success"
      );

      setCurrentStep("confirm");
      setShowConfirmComplete(false);
    } catch (e) {
      console.error("Errore:", e);
    }
    setSaving(false);
  };

  const canComplete = completedItems.length >= Math.floor(checklist.length * 0.8) && photos.length >= 2;

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Lightbox */}
      {lightbox && (
        <PhotoLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Header Sticky */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/operatore" className="flex items-center gap-2 text-slate-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="text-center flex-1 px-4">
              <h1 className="font-bold text-slate-800 truncate">{cleaning.propertyName || "Pulizia"}</h1>
              <p className="text-xs text-slate-500">{cleaning.propertyAddress}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              cleaning.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" :
              cleaning.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" :
              "bg-blue-100 text-blue-700"
            }`}>
              {cleaning.status === "COMPLETED" ? "✓ Fatto" :
               cleaning.status === "IN_PROGRESS" ? "In corso" : "Da fare"}
            </span>
          </div>
        </div>

        {/* Progress Steps */}
        {cleaning.status !== "COMPLETED" && (
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between">
              {["briefing", "cleaning", "photos", "confirm"].map((step, idx) => (
                <div key={step} className="flex items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    currentStep === step ? "bg-emerald-500 text-white scale-110" :
                    ["briefing", "cleaning", "photos", "confirm"].indexOf(currentStep) > idx 
                      ? "bg-emerald-200 text-emerald-700" 
                      : "bg-slate-200 text-slate-400"
                  }`}>
                    {idx + 1}
                  </div>
                  {idx < 3 && (
                    <div className={`flex-1 h-1 mx-1 rounded ${
                      ["briefing", "cleaning", "photos", "confirm"].indexOf(currentStep) > idx 
                        ? "bg-emerald-300" 
                        : "bg-slate-200"
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-6 pb-32 space-y-4">

        {/* ══════════════════════════════════════════════════════════════
            STEP 1: BRIEFING
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "briefing" && cleaning.status !== "COMPLETED" && (
          <>
            {/* Info Card */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4">
                <h2 className="text-lg font-bold text-white">📋 Briefing</h2>
                <p className="text-emerald-100 text-sm">{scheduledDate}</p>
              </div>
              
              <div className="p-5">
                {/* Orario e Ospiti */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-sky-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black text-sky-600">{cleaning.scheduledTime || "10:00"}</p>
                    <p className="text-xs text-sky-500 font-medium">ORARIO</p>
                  </div>
                  <div className="bg-violet-50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black text-violet-600">{guests}</p>
                    <p className="text-xs text-violet-500 font-medium">OSPITI</p>
                  </div>
                </div>

                {/* Camere e Bagni */}
                <div className="flex items-center justify-center gap-6 py-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚪</span>
                    <span className="font-semibold text-slate-700">{bedConfiguration.length || property.bedrooms || 1} camere</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚿</span>
                    <span className="font-semibold text-slate-700">{bathrooms} bagni</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Configurazione Letti */}
            {bedConfiguration.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">🛏️</span>
                  Configurazione Letti
                </h3>
                <div className="space-y-3">
                  {bedConfiguration.map((stanza: any, idx: number) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-4">
                      <p className="font-semibold text-slate-700 mb-2">{stanza.nome}</p>
                      <div className="flex flex-wrap gap-2">
                        {stanza.letti?.map((letto: any, lidx: number) => {
                          const tipoInfo = TIPI_LETTO[letto.tipo] || { nome: letto.tipo, icon: '🛏️' };
                          return Array.from({ length: letto.quantita || 1 }).map((_, i) => (
                            <span key={`${lidx}-${i}`} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-sm">
                              <span>{tipoInfo.icon}</span>
                              <span className="text-slate-700">{tipoInfo.nome}</span>
                            </span>
                          ));
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Biancheria da Preparare */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-cyan-100 rounded-lg flex items-center justify-center">🧺</span>
                Biancheria da Preparare
                {(biancheria as any).customConfig && (
                  <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                    ✓ Configurato
                  </span>
                )}
              </h3>
              
              <div className="space-y-2">
                {/* Biancheria Letto */}
                {(biancheria as any).customConfig && (biancheria as any).bedLinenItems ? (
                  Object.entries((biancheria as any).bedLinenItems).map(([itemId, qty]) => (
                    (qty as number) > 0 && (
                      <div key={itemId} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🛏️</span>
                          <span className="text-slate-700">{getNomeBiancheria(itemId)}</span>
                        </div>
                        <span className="font-bold text-slate-800 bg-white px-3 py-1 rounded-lg">{qty as number}</span>
                      </div>
                    )
                  ))
                ) : (
                  <>
                    {(biancheria as any).lenzuolaMatrimoniali > 0 && (
                      <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🛏️</span>
                          <span className="text-slate-700">Set Lenzuola Matrimoniali</span>
                        </div>
                        <span className="font-bold text-slate-800 bg-white px-3 py-1 rounded-lg">{(biancheria as any).lenzuolaMatrimoniali}</span>
                      </div>
                    )}
                    {(biancheria as any).lenzuolaSingole > 0 && (
                      <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">🛏️</span>
                          <span className="text-slate-700">Set Lenzuola Singole</span>
                        </div>
                        <span className="font-bold text-slate-800 bg-white px-3 py-1 rounded-lg">{(biancheria as any).lenzuolaSingole}</span>
                      </div>
                    )}
                  </>
                )}

                {/* Biancheria Bagno */}
                <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🛁</span>
                    <span className="text-slate-700">Asciugamani Grandi</span>
                  </div>
                  <span className="font-bold text-slate-800 bg-white px-3 py-1 rounded-lg">{biancheria.asciugamaniGrandi}</span>
                </div>
                <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🧴</span>
                    <span className="text-slate-700">Asciugamani Piccoli</span>
                  </div>
                  <span className="font-bold text-slate-800 bg-white px-3 py-1 rounded-lg">{biancheria.asciugamaniPiccoli}</span>
                </div>
                {biancheria.tappetiniBagno > 0 && (
                  <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🚿</span>
                      <span className="text-slate-700">Tappetini Bagno</span>
                    </div>
                    <span className="font-bold text-slate-800 bg-white px-3 py-1 rounded-lg">{biancheria.tappetiniBagno}</span>
                  </div>
                )}
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
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                  <span>⚠️</span> Note Importanti
                </h3>
                <p className="text-amber-700">{cleaning.notes || property.cleaningInstructions}</p>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 2: CLEANING (Checklist)
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "cleaning" && cleaning.status !== "COMPLETED" && (
          <>
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800">✅ Checklist</h3>
                <span className="text-sm text-slate-500">
                  {completedItems.length}/{checklist.length}
                </span>
              </div>
              
              {/* Progress bar */}
              <div className="h-2 bg-slate-100 rounded-full mb-6 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
                  style={{ width: `${(completedItems.length / checklist.length) * 100}%` }}
                />
              </div>

              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => handleToggleItem(item.id)}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all active:scale-[0.98] ${
                      completedItems.includes(item.id)
                        ? "bg-emerald-50 border-2 border-emerald-300"
                        : "bg-slate-50 border-2 border-transparent hover:border-slate-200"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      completedItems.includes(item.id)
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}>
                      {completedItems.includes(item.id) ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-xs font-bold">{idx + 1}</span>
                      )}
                    </div>
                    <span className={`flex-1 text-left ${
                      completedItems.includes(item.id) ? "text-emerald-700 line-through" : "text-slate-700"
                    }`}>
                      {item.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Note Operatore */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-3">📝 Note (opzionale)</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Segnala eventuali problemi o note..."
                className="w-full p-4 border border-slate-200 rounded-xl text-slate-700 resize-none h-24 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            {/* Vai a Foto */}
            <button
              onClick={() => setCurrentStep("photos")}
              className="w-full py-4 bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-all"
            >
              Vai alle Foto →
            </button>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 3: PHOTOS
        ══════════════════════════════════════════════════════════════ */}
        {currentStep === "photos" && cleaning.status !== "COMPLETED" && (
          <>
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800">📷 Foto Pulizia</h3>
                <span className={`text-sm px-2 py-1 rounded-full ${
                  photos.length >= 2 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {photos.length}/2 minimo
                </span>
              </div>

              {/* Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />

              {uploadingPhotos ? (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
                  <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-slate-600">Caricamento {uploadProgress.current}/{uploadProgress.total}...</p>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-xl p-8 text-center transition-all active:scale-[0.98]"
                >
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-3xl">📷</span>
                  </div>
                  <p className="font-semibold text-slate-700">Carica Foto</p>
                  <p className="text-sm text-slate-500">Seleziona dalla galleria</p>
                </button>
              )}

              {/* Gallery */}
              {photos.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm text-slate-500 mb-3">Foto caricate ({photos.length})</p>
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group">
                        <img
                          src={photo}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setLightbox({ images: photos, index: idx })}
                        />
                        <button
                          onClick={() => handleDeletePhoto(idx)}
                          className="absolute top-1 right-1 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottoni */}
            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep("cleaning")}
                className="flex-1 py-4 bg-slate-200 text-slate-700 font-bold rounded-2xl active:scale-[0.98] transition-all"
              >
                ← Indietro
              </button>
              <button
                onClick={() => setShowConfirmComplete(true)}
                disabled={!canComplete}
                className={`flex-1 py-4 font-bold rounded-2xl transition-all active:scale-[0.98] ${
                  canComplete
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-slate-200 text-slate-400"
                }`}
              >
                Completa ✓
              </button>
            </div>

            {!canComplete && (
              <p className="text-center text-sm text-amber-600">
                Completa almeno 80% della checklist e carica 2 foto
              </p>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 4: COMPLETATO
        ══════════════════════════════════════════════════════════════ */}
        {cleaning.status === "COMPLETED" && (
          <div className="text-center py-8">
            <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-5xl">✅</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Pulizia Completata!</h2>
            <p className="text-slate-500 mb-8">Ottimo lavoro! 🎉</p>

            {photos.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
                <p className="font-semibold text-slate-700 mb-3">Foto caricate ({photos.length})</p>
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((photo, idx) => (
                    <img
                      key={idx}
                      src={photo}
                      alt={`Foto ${idx + 1}`}
                      className="aspect-square object-cover rounded-lg cursor-pointer"
                      onClick={() => setLightbox({ images: photos, index: idx })}
                    />
                  ))}
                </div>
              </div>
            )}

            <Link
              href="/operatore"
              className="inline-block px-8 py-4 bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/30"
            >
              Torna alla Home
            </Link>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          BOTTOM BUTTON (Briefing Step)
      ══════════════════════════════════════════════════════════════ */}
      {currentStep === "briefing" && cleaning.status !== "COMPLETED" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-lg border-t border-slate-200 z-50">
          <button
            onClick={() => setShowConfirmStart(true)}
            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-lg rounded-2xl shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-all"
          >
            🚀 Inizia Pulizia
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════════ */}
      
      {/* Modal Conferma Inizio */}
      {showConfirmStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirmStart(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div 
            className="relative bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🧹</span>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Iniziare la pulizia?</h3>
              <p className="text-slate-500 mb-6">Il timer partirà e il proprietario sarà notificato.</p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmStart(false)}
                  className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl"
                >
                  Annulla
                </button>
                <button
                  onClick={handleStartCleaning}
                  disabled={saving}
                  className="flex-1 py-3 bg-emerald-500 text-white font-semibold rounded-2xl"
                >
                  {saving ? "..." : "Inizia!"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Conferma Completamento */}
      {showConfirmComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirmComplete(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div 
            className="relative bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✅</span>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Completare la pulizia?</h3>
              <p className="text-slate-500 mb-6">
                Checklist: {completedItems.length}/{checklist.length} • Foto: {photos.length}
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmComplete(false)}
                  className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl"
                >
                  Annulla
                </button>
                <button
                  onClick={handleCompleteCleaning}
                  disabled={saving}
                  className="flex-1 py-3 bg-emerald-500 text-white font-semibold rounded-2xl"
                >
                  {saving ? "..." : "Completa!"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
