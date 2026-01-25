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

// Funzione per notificare il proprietario
async function notifyOwner(propertyId: string, title: string, message: string, type: 'info' | 'success') {
  try {
    // Recupera la proprietà per trovare l'ownerId
    const propertyRef = doc(db, "properties", propertyId);
    const propertySnap = await getDoc(propertyRef);
    
    if (propertySnap.exists()) {
      const propertyData = propertySnap.data();
      const ownerId = propertyData.ownerId;
      
      if (ownerId) {
        // Salva notifica per il proprietario
        await addDoc(collection(db, "notifications"), {
          title,
          message,
          type: type.toUpperCase(),
          recipientRole: 'PROPRIETARIO',
          recipientId: ownerId,
          senderId: "system",
          senderName: "Sistema",
          status: "UNREAD",
          actionRequired: false,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        console.log("📬 Notifica inviata al proprietario:", ownerId);
      }
    }
  } catch (error) {
    console.error("Errore invio notifica proprietario:", error);
  }
}

// Funzione per notificare l'admin
async function notifyAdmin(title: string, message: string, type: 'info' | 'success' | 'warning') {
  try {
    await addDoc(collection(db, "notifications"), {
      title,
      message,
      type: type.toUpperCase(),
      recipientRole: 'ADMIN',
      recipientId: null,
      senderId: "system",
      senderName: "Sistema",
      status: "UNREAD",
      actionRequired: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log("📬 Notifica inviata all'admin");
  } catch (error) {
    console.error("Errore invio notifica admin:", error);
  }
}

// Checklist di default se non ce n'è una specifica
const DEFAULT_CHECKLIST = [
  { id: "1", text: "Cambiare le lenzuola di tutti i letti", category: "camera" },
  { id: "2", text: "Cambiare federe cuscini", category: "camera" },
  { id: "3", text: "Cambiare asciugamani bagno", category: "bagno" },
  { id: "4", text: "Pulire e disinfettare bagno", category: "bagno" },
  { id: "5", text: "Pulire specchi", category: "bagno" },
  { id: "6", text: "Aspirare tutti i pavimenti", category: "generale" },
  { id: "7", text: "Lavare i pavimenti", category: "generale" },
  { id: "8", text: "Pulire superfici cucina", category: "cucina" },
  { id: "9", text: "Pulire elettrodomestici", category: "cucina" },
  { id: "10", text: "Svuotare frigorifero e pulire", category: "cucina" },
  { id: "11", text: "Svuotare tutti i cestini", category: "generale" },
  { id: "12", text: "Controllare scorte (sapone, carta igienica)", category: "generale" },
  { id: "13", text: "Verificare funzionamento luci", category: "controllo" },
  { id: "14", text: "Verificare funzionamento TV/WiFi", category: "controllo" },
  { id: "15", text: "Chiudere finestre e persiane", category: "controllo" },
];

export default function CleaningWizard({ cleaning, user }: CleaningWizardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stati
  const [currentStep, setCurrentStep] = useState<"briefing" | "cleaning" | "photos" | "confirm">(
    cleaning.status === "COMPLETED" ? "confirm" :
    cleaning.status === "IN_PROGRESS" ? "cleaning" : "briefing"
  );
  const [checkedItems, setCheckedItems] = useState<string[]>(cleaning.checklistCompleted || []);
  const [photos, setPhotos] = useState<string[]>(cleaning.photos || []);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [showDeletePhotoConfirm, setShowDeletePhotoConfirm] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<number | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [notes, setNotes] = useState(cleaning.operatorNotes || "");
  const [saving, setSaving] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  
  // 📸 Stati Photo Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  // Funzioni Lightbox
  const openLightbox = (photoArray: string[], index: number) => {
    setLightboxPhotos(photoArray);
    setLightboxIndex(index);
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    document.body.style.overflow = '';
  };

  const goToPrevious = () => {
    setLightboxIndex((prev) => (prev === 0 ? lightboxPhotos.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setLightboxIndex((prev) => (prev === lightboxPhotos.length - 1 ? 0 : prev + 1));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    if (diff > threshold) goToNext();
    else if (diff < -threshold) goToPrevious();
  };

  // Keyboard navigation per lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxOpen) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, lightboxPhotos.length]);

  // 🔥 REALTIME: Aggiorna lo step quando cambia lo stato della pulizia
  useEffect(() => {
    console.log("🔄 Cleaning status changed:", cleaning.status);
    
    if (cleaning.status === "COMPLETED") {
      setCurrentStep("confirm");
    } else if (cleaning.status === "IN_PROGRESS") {
      setCurrentStep("cleaning");
    } else {
      setCurrentStep("briefing");
    }
    
    // Aggiorna anche i dati locali
    setCheckedItems(cleaning.checklistCompleted || []);
    setPhotos(cleaning.photos || []);
    setNotes(cleaning.operatorNotes || "");
  }, [cleaning.status, cleaning.checklistCompleted, cleaning.photos, cleaning.operatorNotes]);

  const property = cleaning.property || {};
  const checklist = property.checklist?.length > 0 
    ? property.checklist.map((text: string, i: number) => ({ id: String(i), text, category: "generale" }))
    : DEFAULT_CHECKLIST;

  // Calcola letti da preparare
  const bedsInfo = {
    total: property.bedrooms || 1,
    guests: cleaning.guestsCount || property.maxGuests || 2,
  };

  // Formatta data
  const scheduledDate = cleaning.scheduledDate?.toDate?.() 
    ? cleaning.scheduledDate.toDate().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })
    : "Oggi";

  // Toggle checklist item
  const toggleChecklist = (id: string) => {
    setCheckedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Inizia pulizia
  const startCleaning = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        status: "IN_PROGRESS",
        startedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      // 📬 Notifica al proprietario e admin
      if (cleaning.propertyId) {
        notifyOwner(
          cleaning.propertyId,
          "🧹 Pulizia Iniziata",
          `La pulizia della tua proprietà "${cleaning.propertyName || ''}" è iniziata`,
          "info"
        );
      }
      notifyAdmin(
        "▶️ Pulizia Iniziata",
        `Pulizia di "${cleaning.propertyName || 'proprietà'}" iniziata`,
        "info"
      );
      
      setCurrentStep("cleaning");
      setShowStartModal(false);
    } catch (error) {
      console.error("Errore avvio pulizia:", error);
      alert("Errore nell'avvio della pulizia");
    } finally {
      setSaving(false);
    }
  };

  // Funzione per comprimere immagini e convertire in Blob
  const compressImageToBlob = (file: File, maxWidth: number = 1200, quality: number = 0.6): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = document.createElement('img');
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.naturalWidth;
          let height = img.naturalHeight;

          // Ridimensiona se troppo grande
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Canvas context not available'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          
          // Converti in Blob JPEG compresso
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create blob'));
              }
            },
            'image/jpeg',
            quality
          );
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  };

  // Upload singola foto tramite API (bypassa CORS)
  const uploadPhotoToStorage = async (file: File, index: number): Promise<string> => {
    // Comprimi l'immagine
    const compressedBlob = await compressImageToBlob(file, 1200, 0.6);
    
    // Prepara FormData per l'API
    const formData = new FormData();
    formData.append('file', compressedBlob, `photo_${index}.jpg`);
    formData.append('cleaningId', cleaning.id);
    formData.append('index', String(index));
    
    // Upload tramite API (no CORS issues!)
    const response = await fetch('/api/upload-photo', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }
    
    const data = await response.json();
    return data.url;
  };

  // Gestione upload foto (con Firebase Storage)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhotos(true);
    const totalFiles = files.length;
    setUploadProgress({ current: 0, total: totalFiles });

    try {
      const newPhotoURLs: string[] = [];

      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: totalFiles });
        console.log(`📸 Upload foto ${i + 1}/${totalFiles}: ${file.name}`);
        
        try {
          const url = await uploadPhotoToStorage(file, i);
          newPhotoURLs.push(url);
          console.log(`✅ Foto ${i + 1} caricata con successo`);
        } catch (err) {
          console.error(`❌ Errore upload foto ${i + 1}:`, err);
          // Continua con le altre foto
        }
      }

      if (newPhotoURLs.length > 0) {
        const allPhotos = [...photos, ...newPhotoURLs];
        setPhotos(allPhotos);

        // Salva solo gli URL in Firestore (molto più leggero!)
        await updateDoc(doc(db, "cleanings", cleaning.id), {
          photos: allPhotos,
          updatedAt: Timestamp.now(),
        });
        
        console.log(`✅ ${newPhotoURLs.length} foto salvate su Storage`);
      }

    } catch (error) {
      console.error("Errore upload foto:", error);
      alert("Errore nel caricamento delle foto. Riprova.");
    } finally {
      setUploadingPhotos(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  // Rimuovi foto - chiamata dalla modal
  const removePhoto = async () => {
    if (photoToDelete === null) return;
    
    setDeletingPhoto(true);
    try {
      const newPhotos = photos.filter((_, i) => i !== photoToDelete);
      setPhotos(newPhotos);
      
      // Aggiorna Firestore (il file su Storage rimane ma non è linkato)
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        photos: newPhotos,
        updatedAt: Timestamp.now(),
      });
      
      console.log("🗑️ Foto rimossa dalla pulizia");
      setShowDeletePhotoConfirm(false);
      setPhotoToDelete(null);
    } catch (error) {
      console.error("Errore eliminazione foto:", error);
      alert("Errore durante l'eliminazione della foto");
    } finally {
      setDeletingPhoto(false);
    }
  };

  // Completa pulizia
  const completeCleaning = async () => {
    if (photos.length < 2) {
      alert("Devi caricare almeno 2 foto prima di completare la pulizia!");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        status: "COMPLETED",
        checklistCompleted: checkedItems,
        operatorNotes: notes,
        photos: photos,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      // 📬 Notifica al proprietario e admin
      if (cleaning.propertyId) {
        notifyOwner(
          cleaning.propertyId,
          "✨ Pulizia Completata!",
          `La pulizia della tua proprietà "${cleaning.propertyName || ''}" è stata completata`,
          "success"
        );
      }
      notifyAdmin(
        "✨ Pulizia Completata",
        `Pulizia di "${cleaning.propertyName || 'proprietà'}" completata!`,
        "success"
      );
      
      setShowCompletionModal(true);
    } catch (error) {
      console.error("Errore completamento pulizia:", error);
      alert("Errore nel completamento della pulizia");
    } finally {
      setSaving(false);
    }
  };

  // Salva progresso
  const saveProgress = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "cleanings", cleaning.id), {
        checklistCompleted: checkedItems,
        operatorNotes: notes,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("Errore salvataggio:", error);
    } finally {
      setSaving(false);
    }
  };

  const progress = Math.round((checkedItems.length / checklist.length) * 100);
  const canComplete = checkedItems.length === checklist.length && photos.length >= 2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/operatore" className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-slate-800 truncate">{property.name || cleaning.propertyName}</h1>
              <p className="text-sm text-slate-500 truncate">{property.address || cleaning.propertyAddress}</p>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              cleaning.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" :
              cleaning.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" :
              "bg-sky-100 text-sky-700"
            }`}>
              {cleaning.status === "COMPLETED" ? "✓ Completata" :
               cleaning.status === "IN_PROGRESS" ? "In corso" : "Da iniziare"}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {currentStep !== "briefing" && cleaning.status !== "COMPLETED" && (
        <div className="bg-white border-b border-slate-100 px-4 py-2">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-slate-600">Progresso checklist</span>
              <span className="font-semibold text-emerald-600">{progress}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6 pb-44 md:pb-32">
        
        {/* STEP: BRIEFING */}
        {currentStep === "briefing" && cleaning.status !== "COMPLETED" && (
          <div className="space-y-6">
            {/* Card Info Principale */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4">
                <h2 className="text-xl font-bold text-white">📋 Briefing Pulizia</h2>
                <p className="text-emerald-100 text-sm">{scheduledDate}</p>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Orario e Ospiti */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-sky-50 rounded-xl p-4 text-center">
                    <div className="text-3xl mb-1">🕐</div>
                    <p className="text-2xl font-bold text-sky-700">{cleaning.scheduledTime || "10:00"}</p>
                    <p className="text-sm text-sky-600">Orario previsto</p>
                  </div>
                  <div className="bg-violet-50 rounded-xl p-4 text-center">
                    <div className="text-3xl mb-1">👥</div>
                    <p className="text-2xl font-bold text-violet-700">{bedsInfo.guests}</p>
                    <p className="text-sm text-violet-600">Ospiti in arrivo</p>
                  </div>
                </div>

                {/* Info Letti */}
                <div className="bg-amber-50 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-3xl">🛏️</div>
                    <div>
                      <p className="font-bold text-amber-800">Letti da preparare</p>
                      <p className="text-sm text-amber-600">{bedsInfo.total} {bedsInfo.total === 1 ? "camera" : "camere"} • {property.bathrooms || 1} {(property.bathrooms || 1) === 1 ? "bagno" : "bagni"}</p>
                    </div>
                  </div>
                  <div className="bg-white/60 rounded-lg p-3 text-sm text-amber-700">
                    Prepara i letti per <strong>{bedsInfo.guests} {bedsInfo.guests === 1 ? "ospite" : "ospiti"}</strong>
                  </div>
                </div>

                {/* Accesso - Nuovo Banner */}
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

                {/* Note speciali */}
                {(cleaning.notes || property.cleaningInstructions) && (
                  <div className="bg-rose-50 rounded-xl p-4">
                    <p className="font-semibold text-rose-700 mb-2">⚠️ Note Importanti</p>
                    <p className="text-sm text-rose-600">
                      {cleaning.notes || property.cleaningInstructions}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Checklist Preview */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="text-xl">✅</span>
                Cosa dovrai fare ({checklist.length} attività)
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {checklist.slice(0, 5).map((item: any, index: number) => (
                  <div key={item.id} className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                    <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium">{index + 1}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
                {checklist.length > 5 && (
                  <p className="text-sm text-slate-400 text-center py-2">
                    + altre {checklist.length - 5} attività...
                  </p>
                )}
              </div>
            </div>

            {/* Bottone Inizia */}
            <button
              onClick={() => setShowStartModal(true)}
              className="w-full py-5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-bold text-xl shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 active:scale-[0.98] transition-all"
            >
              🚀 INIZIA PULIZIA
            </button>
          </div>
        )}

        {/* STEP: CLEANING (Checklist) */}
        {currentStep === "cleaning" && cleaning.status !== "COMPLETED" && (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 bg-white rounded-xl p-1.5 border border-slate-200">
              <button
                onClick={() => setCurrentStep("cleaning")}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium transition-all bg-emerald-500 text-white shadow-sm"
              >
                ✅ Checklist
              </button>
              <button
                onClick={() => setCurrentStep("photos")}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium transition-all text-slate-600 hover:bg-slate-50"
              >
                📸 Foto ({photos.length})
              </button>
            </div>

            {/* Checklist */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800">Checklist Pulizia</h3>
                  <span className="text-sm font-medium text-emerald-600">
                    {checkedItems.length}/{checklist.length} completate
                  </span>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {checklist.map((item: any, index: number) => {
                  const isChecked = checkedItems.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleChecklist(item.id)}
                      className={`w-full flex items-center gap-4 p-4 transition-all ${
                        isChecked ? "bg-emerald-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isChecked 
                          ? "bg-emerald-500 border-emerald-500" 
                          : "border-slate-300"
                      }`}>
                        {isChecked && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`font-medium ${isChecked ? "text-emerald-700" : "text-slate-700"}`}>
                          {item.text}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">#{index + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Note */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h3 className="font-bold text-slate-800 mb-3">📝 Note (opzionale)</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveProgress}
                placeholder="Segnala eventuali problemi o note..."
                rows={3}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none text-slate-700"
              />
            </div>
          </div>
        )}

        {/* STEP: PHOTOS */}
        {currentStep === "photos" && cleaning.status !== "COMPLETED" && (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 bg-white rounded-xl p-1.5 border border-slate-200">
              <button
                onClick={() => setCurrentStep("cleaning")}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium transition-all text-slate-600 hover:bg-slate-50"
              >
                ✅ Checklist ({checkedItems.length}/{checklist.length})
              </button>
              <button
                onClick={() => setCurrentStep("photos")}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium transition-all bg-emerald-500 text-white shadow-sm"
              >
                📸 Foto ({photos.length})
              </button>
            </div>

            {/* Upload Area */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 mb-2">📸 Foto della Pulizia</h3>
              <p className="text-sm text-slate-500 mb-4">
                Carica almeno <strong className="text-emerald-600">2 foto</strong> per completare la pulizia
              </p>

              {/* Status */}
              <div className={`mb-4 p-3 rounded-xl flex items-center gap-3 ${
                photos.length >= 2 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}>
                {photos.length >= 2 ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">Hai caricato {photos.length} foto ✓</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-medium">Servono ancora {2 - photos.length} {2 - photos.length === 1 ? "foto" : "foto"}</span>
                  </>
                )}
              </div>

              {/* Upload Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhotos}
                className="w-full border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-xl p-8 text-center transition-all hover:bg-emerald-50/50 disabled:opacity-50"
              >
                {uploadingPhotos ? (
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500 mb-3"></div>
                    <p className="text-slate-600 font-medium">
                      Caricamento foto {uploadProgress.current}/{uploadProgress.total}...
                    </p>
                    <div className="w-full max-w-xs bg-slate-200 rounded-full h-2 mt-3">
                      <div 
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Compressione e upload su cloud...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-3">
                      <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <p className="font-medium text-slate-700 mb-1">📷 Carica foto dalla galleria</p>
                    <p className="text-sm text-slate-500">Seleziona una o più foto</p>
                  </div>
                )}
              </button>

              {/* Gallery */}
              {photos.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-slate-700">Foto caricate ({photos.length})</h4>
                    {photos.length > 0 && (
                      <button
                        onClick={() => openLightbox(photos, 0)}
                        className="text-sm text-sky-600 font-medium hover:text-sky-700"
                      >
                        Espandi →
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative aspect-square rounded-xl overflow-hidden group">
                        {/* Immagine cliccabile per aprire lightbox */}
                        <button
                          onClick={() => openLightbox(photos, index)}
                          className="w-full h-full focus:outline-none"
                        >
                          <img 
                            src={photo} 
                            alt={`Foto ${index + 1}`} 
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                          />
                          {/* Overlay hover */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                        </button>
                        {/* Bottone elimina */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhotoToDelete(index);
                            setShowDeletePhotoConfirm(true);
                          }}
                          className="absolute top-1 right-1 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform z-10"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        {/* Numero foto */}
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md font-medium">
                          {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 text-center">Tocca una foto per ingrandirla • ❌ per eliminarla</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP: COMPLETED */}
        {cleaning.status === "COMPLETED" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-8 text-center">
                <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Pulizia Completata!</h2>
                <p className="text-emerald-100">Ottimo lavoro 🎉</p>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-slate-500">Attività completate</p>
                    <p className="text-xl font-bold text-slate-800">{cleaning.checklistCompleted?.length || 0}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-slate-500">Foto caricate</p>
                    <p className="text-xl font-bold text-slate-800">{cleaning.photos?.length || 0}</p>
                  </div>
                </div>

                {cleaning.photos?.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-slate-700">📸 Foto ({cleaning.photos.length})</p>
                      <button
                        onClick={() => openLightbox(cleaning.photos, 0)}
                        className="text-sm text-sky-600 font-medium hover:text-sky-700 transition-colors"
                      >
                        Vedi tutte →
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {cleaning.photos.slice(0, 8).map((photo: string, index: number) => (
                        <button
                          key={index}
                          onClick={() => openLightbox(cleaning.photos, index)}
                          className="aspect-square rounded-xl overflow-hidden relative group focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                        >
                          <img 
                            src={photo} 
                            alt={`Foto ${index + 1}`} 
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" 
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                              <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                              </svg>
                            </div>
                          </div>
                          {/* Badge per foto extra */}
                          {index === 7 && cleaning.photos.length > 8 && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <span className="text-white font-bold text-lg">+{cleaning.photos.length - 8}</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {cleaning.completedAt && (
                  <div className="space-y-3">
                    {/* ─── TEMPO IMPIEGATO ─── */}
                    {cleaning.startedAt && (
                      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                            <span className="text-2xl">⏱️</span>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-purple-600 font-medium">Tempo impiegato</p>
                            <p className="text-2xl font-bold text-purple-800">
                              {(() => {
                                const start = cleaning.startedAt.toDate?.() ?? new Date(cleaning.startedAt);
                                const end = cleaning.completedAt.toDate?.() ?? new Date(cleaning.completedAt);
                                const diffMs = end.getTime() - start.getTime();
                                const diffMins = Math.round(diffMs / 60000);
                                if (diffMins < 60) return `${diffMins} min`;
                                const hours = Math.floor(diffMins / 60);
                                const mins = diffMins % 60;
                                return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-sm text-slate-500 text-center">
                      Completata il {cleaning.completedAt.toDate?.().toLocaleDateString("it-IT", { 
                        day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" 
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <Link
              href="/operatore"
              className="block w-full py-4 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-bold text-center shadow-lg hover:shadow-xl transition-all"
            >
              ← Torna alla Dashboard
            </Link>
          </div>
        )}
      </div>

      {/* Fixed Bottom Button - SOPRA la navbar mobile */}
      {cleaning.status === "IN_PROGRESS" && (
        <div className="fixed bottom-[72px] md:bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-[95] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={completeCleaning}
              disabled={saving || !canComplete}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                canComplete
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed"
              }`}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Salvataggio...
                </span>
              ) : canComplete ? (
                "✓ COMPLETA PULIZIA"
              ) : (
                `Completa checklist e carica ${Math.max(0, 2 - photos.length)} foto`
              )}
            </button>
          </div>
        </div>
      )}

      {/* Modal Conferma Inizio */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-8 text-center">
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🧹</span>
              </div>
              <h3 className="text-xl font-bold text-white">Pronto a iniziare?</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-600 text-center">
                Stai per iniziare la pulizia di <strong>{property.name || cleaning.propertyName}</strong>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowStartModal(false)}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={startCleaning}
                  disabled={saving}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {saving ? "..." : "Inizia! 🚀"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Completamento */}
      {showCompletionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-8 text-center">
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-5xl">🎉</span>
              </div>
              <h3 className="text-2xl font-bold text-white">Ottimo lavoro!</h3>
              <p className="text-emerald-100 mt-2">Pulizia completata con successo</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-emerald-600">{checkedItems.length}</p>
                  <p className="text-sm text-slate-500">Attività</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-emerald-600">{photos.length}</p>
                  <p className="text-sm text-slate-500">Foto</p>
                </div>
              </div>
              <button
                onClick={() => router.push("/operatore")}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold hover:shadow-lg transition-all"
              >
                Torna alla Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Conferma Eliminazione Foto */}
      {showDeletePhotoConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-rose-500 px-6 py-5 text-center">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">🗑️</span>
              </div>
              <h3 className="text-lg font-bold text-white">Elimina Foto</h3>
            </div>
            <div className="p-6">
              {photoToDelete !== null && photos[photoToDelete] && (
                <div className="mb-4">
                  <img 
                    src={photos[photoToDelete]} 
                    alt="Foto da eliminare" 
                    className="w-32 h-32 object-cover rounded-xl mx-auto shadow-md"
                  />
                </div>
              )}
              <p className="text-slate-600 text-center mb-4">
                Sei sicuro di voler eliminare la <strong>Foto #{(photoToDelete || 0) + 1}</strong>?
              </p>
              <p className="text-red-600 text-sm text-center mb-6 bg-red-50 p-3 rounded-xl">
                ⚠️ Questa azione è irreversibile
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeletePhotoConfirm(false);
                    setPhotoToDelete(null);
                  }}
                  disabled={deletingPhoto}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  onClick={removePhoto}
                  disabled={deletingPhoto}
                  className="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-xl font-semibold hover:from-red-600 hover:to-rose-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deletingPhoto ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Eliminazione...
                    </>
                  ) : (
                    '🗑️ Elimina'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📸 PHOTO LIGHTBOX - Visualizzatore Immersivo */}
      {lightboxOpen && lightboxPhotos.length > 0 && (
        <div 
          className="fixed inset-0 z-[200] bg-black"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Header con contatore e pulsante chiudi */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4 pt-safe">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <div className="flex items-center gap-3">
                <span className="text-white/90 font-medium">
                  {lightboxIndex + 1} / {lightboxPhotos.length}
                </span>
              </div>
              <button
                onClick={closeLightbox}
                className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Immagine principale */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <img
              src={lightboxPhotos[lightboxIndex]}
              alt={`Foto ${lightboxIndex + 1}`}
              className="max-w-full max-h-full object-contain select-none animate-in fade-in zoom-in-95 duration-200"
              draggable={false}
            />
          </div>

          {/* Freccia Sinistra - Desktop */}
          {lightboxPhotos.length > 1 && (
            <button
              onClick={goToPrevious}
              className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Freccia Destra - Desktop */}
          {lightboxPhotos.length > 1 && (
            <button
              onClick={goToNext}
              className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Footer con miniature e indicatori */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4 pb-safe">
            {/* Indicatori pallini per mobile */}
            {lightboxPhotos.length <= 10 && (
              <div className="flex justify-center gap-2 mb-3 md:hidden">
                {lightboxPhotos.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setLightboxIndex(index)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === lightboxIndex 
                        ? 'bg-white w-6' 
                        : 'bg-white/40 hover:bg-white/60'
                    }`}
                  />
                ))}
              </div>
            )}
            
            {/* Miniature per desktop e tante foto */}
            {lightboxPhotos.length > 1 && (
              <div className="hidden md:flex justify-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {lightboxPhotos.map((photo, index) => (
                  <button
                    key={index}
                    onClick={() => setLightboxIndex(index)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all ${
                      index === lightboxIndex 
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110' 
                        : 'opacity-50 hover:opacity-80'
                    }`}
                  >
                    <img 
                      src={photo} 
                      alt={`Miniatura ${index + 1}`} 
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Hint swipe per mobile */}
            {lightboxPhotos.length > 1 && (
              <p className="text-center text-white/50 text-xs mt-2 md:hidden">
                ← Scorri per navigare →
              </p>
            )}
          </div>

          {/* Click su sfondo per chiudere */}
          <button
            onClick={closeLightbox}
            className="absolute inset-0 -z-10"
            aria-label="Chiudi"
          />
        </div>
      )}
    </div>
  );
}
