"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import CleaningWizard from "./CleaningWizard";
import Link from "next/link";

interface CleaningData {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress?: string;
  bookingId?: string;
  operatorId?: string;
  operatorName?: string;
  operators?: Array<{ id: string; name: string }>;
  scheduledDate: any;
  scheduledTime?: string;
  status: string;
  type?: string;
  price?: number;
  guestsCount?: number;
  notes?: string;
  operatorNotes?: string;
  photos?: string[];
  checklistCompleted?: string[];
  startedAt?: any;
  completedAt?: any;
  property?: PropertyData;
  // Configurazione personalizzata biancheria (salvata da proprietario/admin)
  customLinenConfig?: {
    beds: string[];
    bl: Record<string, Record<string, number>>;
    ba: Record<string, number>;
    ki: Record<string, number>;
    ex: Record<string, boolean>;
  };
}

interface PropertyData {
  id: string;
  name: string;
  address: string;
  city?: string;
  zone?: string;
  postalCode?: string;
  apartment?: string;
  floor?: string;
  intercom?: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  doorCode?: string;
  keysLocation?: string;
  accessNotes?: string;
  images?: { door?: string; building?: string };
  checkInTime?: string;
  checkOutTime?: string;
  cleaningInstructions?: string;
  checklist?: string[];
  ownerId?: string;
  // Configurazione letti e biancheria
  bedConfiguration?: Array<{
    nome: string;
    letti: Array<{ tipo: string; quantita: number }>;
  }>;
  linenConfigs?: Array<{
    guestCount: number;
    selectedBeds: string[];
    bedLinen: Record<string, Record<string, number>>;
    bathItems: Record<string, number>;
    kitItems: Record<string, number>;
    extras: Record<string, boolean>;
  }>;
  // Configurazioni servizio per numero ospiti (usato da EditCleaningModal)
  serviceConfigs?: Record<number, {
    beds: string[];
    bl: Record<string, Record<string, number>>;
    ba: Record<string, number>;
    ki: Record<string, number>;
    ex: Record<string, boolean>;
  }>;
}

export default function CleaningDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [cleaning, setCleaning] = useState<CleaningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cleaningId = params?.id as string;

  // 🔥 REALTIME: usa onSnapshot per aggiornamenti automatici
  useEffect(() => {
    if (!cleaningId) return;

    console.log("🔴 Operatore Pulizia Realtime: Avvio listener per", cleaningId);

    // Listener realtime sulla pulizia
    const unsubCleaning = onSnapshot(
      doc(db, "cleanings", cleaningId),
      async (cleaningSnap) => {
        if (!cleaningSnap.exists()) {
          setError("Pulizia non trovata");
          setLoading(false);
          return;
        }

        const cleaningData = { id: cleaningSnap.id, ...cleaningSnap.data() } as CleaningData;
        console.log("🔄 Pulizia aggiornata:", cleaningData.status);

        // Carica la proprietà associata (una sola volta)
        if (cleaningData.propertyId && !cleaningData.property) {
          try {
            const propertyRef = doc(db, "properties", cleaningData.propertyId);
            const propertySnap = await getDoc(propertyRef);

            if (propertySnap.exists()) {
              cleaningData.property = { id: propertySnap.id, ...propertySnap.data() } as PropertyData;
            }
          } catch (err) {
            console.error("Errore caricamento proprietà:", err);
          }
        }

        setCleaning(prev => ({
          ...cleaningData,
          property: cleaningData.property || prev?.property
        }));
        setLoading(false);
      },
      (err) => {
        console.error("Errore listener pulizia:", err);
        setError("Errore nel caricamento");
        setLoading(false);
      }
    );

    return () => {
      console.log("🔴 Operatore Pulizia Realtime: Chiusura listener");
      unsubCleaning();
    };
  }, [cleaningId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p className="text-slate-500">Caricamento pulizia...</p>
        </div>
      </div>
    );
  }

  if (error || !cleaning) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">{error || "Pulizia non trovata"}</h2>
          <p className="text-slate-500 mb-6">Non è stato possibile caricare i dettagli della pulizia.</p>
          <Link href="/operatore" className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-medium hover:shadow-lg transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Torna alla Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <CleaningWizard cleaning={cleaning} user={user} />;
}
