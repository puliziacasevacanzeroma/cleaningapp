"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, updateDoc, Timestamp, getDoc, addDoc, collection, getDocs } from "firebase/firestore";
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

// Tipi letto
const TIPI_LETTO: Record<string, { nome: string; icon: string }> = {
  matrimoniale: { nome: 'Matrimoniale', icon: '🛏️' },
  singolo: { nome: 'Singolo', icon: '🛏️' },
  piazza_mezza: { nome: '1 Piazza e Mezza', icon: '🛏️' },
  divano_letto: { nome: 'Divano Letto', icon: '🛋️' },
  castello: { nome: 'Castello', icon: '🛏️' },
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
  
  // State
  const [currentStep, setCurrentStep] = useState<"briefing" | "cleaning" | "photos" | "confirm">("briefing");
  const [property, setProperty] = useState<any>({});
  const [linenProducts, setLinenProducts] = useState<Record<string, string>>({});
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

  // Carica proprietà e prodotti biancheria
  useEffect(() => {
    async function loadData() {
      // Carica proprietà
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

      // Carica prodotti biancheria per mappa ID->nome
      try {
        const linenSnap = await getDocs(collection(db, "linen"));
        const map: Record<string, string> = {};
        linenSnap.docs.forEach(doc => {
          const data = doc.data();
          map[doc.id] = data.name || data.nome || doc.id;
        });
        setLinenProducts(map);
      } catch (e) {
        console.error("Errore caricamento biancheria:", e);
      }
    }
    loadData();
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
  const biancheria = calcolaBiancheria(bedConfiguration, guests, bathrooms);

  // Funzione per ottenere nome prodotto
  const getProductName = (id: string): string => {
    if (linenProducts[id]) return linenProducts[id];
    // Fallback per ID tecnici
    return id.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  };

  // Prepara lista biancheria da customLinenConfig se presente
  const getBiancheriaList = () => {
    const list: { icon: string; name: string; qty: number }[] = [];
    
    const customConfig = cleaning.customLinenConfig;
    const serviceConfig = property.serviceConfigs?.[guests];
    const config = customConfig || serviceConfig;

    if (config?.bl) {
      // Biancheria letto da config
      Object.values(config.bl).forEach((bedItems: any) => {
        Object.entries(bedItems).forEach(([itemId, qty]) => {
          if ((qty as number) > 0) {
            const existing = list.find(l => l.name === getProductName(itemId));
            if (existing) {
              existing.qty += qty as number;
            } else {
              list.push({ icon: '🛏️', name: getProductName(itemId), qty: qty as number });
            }
          }
        });
      });
    } else {
      // Calcolo automatico
      if (biancheria.lenzuolaMatrimoniali > 0) {
        list.push({ icon: '🛏️', name: 'Set Lenzuola Matrimoniale', qty: biancheria.lenzuolaMatrimoniali });
      }
      if (biancheria.lenzuolaSingole > 0) {
        list.push({ icon: '🛏️', name: 'Set Lenzuola Singole', qty: biancheria.lenzuolaSingole });
      }
      if (biancheria.federe > 0) {
        list.push({ icon: '🛏️', name: 'Federe', qty: biancheria.federe });
      }
    }

    // Asciugamani (sempre)
    if (config?.ba) {
      Object.entries(config.ba).forEach(([itemId, qty]) => {
        if ((qty as number) > 0) {
          list.push({ icon: '🛁', name: getProductName(itemId), qty: qty as number });
        }
      });
    } else {
      list.push({ icon: '🛁', name: 'Asciugamani Grandi', qty: biancheria.asciugamaniGrandi });
      list.push({ icon: '🧴', name: 'Asciugamani Piccoli', qty: biancheria.asciugamaniPiccoli });
      if (biancheria.tappetiniBagno > 0) {
        list.push({ icon: '🚿', name: 'Tappetini Bagno', qty: biancheria.tappetiniBagno });
      }
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
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        status: "COMPLETED",
        completedAt: Timestamp.now(),
        completedChecklist: completedItems,
        photos,
        operatorNotes: notes,
      });

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
  const hasCustomConfig = cleaning.customLinenConfig || property.serviceConfigs?.[guests];
  const biancheriaList = getBiancheriaList();

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Lightbox */}
      {lightbox && (
        <PhotoLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

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

        {/* Progress Steps - più slim */}
        {cleaning.status !== "COMPLETED" && (
          <div className="px-4 pb-2 flex items-center gap-1">
            {["briefing", "cleaning", "photos", "confirm"].map((step, idx) => (
              <div key={step} className="flex items-center flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  currentStep === step ? "bg-emerald-500 text-white" :
                  ["briefing", "cleaning", "photos", "confirm"].indexOf(currentStep) > idx 
                    ? "bg-emerald-200 text-emerald-700" 
                    : "bg-slate-200 text-slate-400"
                }`}>
                  {idx + 1}
                </div>
                {idx < 3 && (
                  <div className={`flex-1 h-0.5 mx-1 ${
                    ["briefing", "cleaning", "photos", "confirm"].indexOf(currentStep) > idx 
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
                <p className="text-xs font-bold text-slate-500 uppercase mb-3">Configurazione Letti</p>
                <div className="space-y-2">
                  {bedConfiguration.map((stanza: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-slate-600 min-w-[80px]">{stanza.nome}:</span>
                      {stanza.letti?.map((letto: any, lidx: number) => {
                        const tipoInfo = TIPI_LETTO[letto.tipo] || { nome: letto.tipo, icon: '🛏️' };
                        return Array.from({ length: letto.quantita || 1 }).map((_, i) => (
                          <span key={`${lidx}-${i}`} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                            {tipoInfo.icon} {tipoInfo.nome}
                          </span>
                        ));
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Biancheria */}
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase">Biancheria da Preparare</p>
                {hasCustomConfig && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    ✓ Configurato
                  </span>
                )}
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
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STEP 4: COMPLETATO
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
                onClick={() => setShowConfirmComplete(true)}
                disabled={!canComplete}
                className={`flex-1 py-3.5 font-bold rounded-xl active:scale-[0.98] ${
                  canComplete ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"
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
    </div>
  );
}
