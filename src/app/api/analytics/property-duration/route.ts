import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  collection, 
  getDocs, 
  query, 
  where,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface DurationStats {
  count: number;
  avgMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  p75: number;
}

interface PropertyDurationData {
  propertyId: string;
  propertyName: string;
  bedrooms: number;
  bathrooms: number;
  cleaningsCount: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p75Duration: number;
  lastUpdated: string;
}

interface GlobalStats {
  key: string; // "2b1ba" = 2 bedrooms, 1 bathroom
  bedrooms: number;
  bathrooms: number;
  cleaningsCount: number;
  avgDuration: number;
  p75Duration: number;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Ottieni utente da cookie
// ═══════════════════════════════════════════════════════════════

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Calcola percentile
// ═══════════════════════════════════════════════════════════════

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0;
}

// ═══════════════════════════════════════════════════════════════
// GET - Ottieni statistiche durata per una proprietà specifica
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
    }

    // ─── CARICA PROPRIETÀ ───
    const propertiesSnap = await getDocs(collection(db, "properties"));
    const propertiesMap = new Map<string, { bedrooms: number; bathrooms: number; name: string }>();
    let targetProperty: { bedrooms: number; bathrooms: number; name: string } | null = null;

    propertiesSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const propData = {
        bedrooms: data.bedrooms || 1,
        bathrooms: data.bathrooms || 1,
        name: data.name || "Proprietà",
      };
      propertiesMap.set(docSnap.id, propData);
      if (docSnap.id === propertyId) {
        targetProperty = propData;
      }
    });

    if (!targetProperty) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // ─── CARICA TUTTE LE PULIZIE COMPLETATE ───
    let cleaningsSnap;
    try {
      const cleaningsQuery = query(
        collection(db, "cleanings"),
        where("status", "in", ["COMPLETED", "completed", "VERIFIED", "verified"])
      );
      cleaningsSnap = await getDocs(cleaningsQuery);
    } catch {
      cleaningsSnap = await getDocs(collection(db, "cleanings"));
    }

    const completedStatuses = ["COMPLETED", "completed", "VERIFIED", "verified"];
    
    // Durate per la proprietà specifica
    const propertyDurations: number[] = [];
    
    // Durate globali per camere+bagni
    const globalDurations: Map<string, number[]> = new Map();

    cleaningsSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      
      if (!completedStatuses.includes(data.status)) return;
      if (!data.startedAt || !data.completedAt) return;

      let startedAt: Date;
      let completedAt: Date;

      try {
        startedAt = data.startedAt.toDate?.() ?? new Date(data.startedAt);
        completedAt = data.completedAt.toDate?.() ?? new Date(data.completedAt);
      } catch {
        return;
      }

      const durationMs = completedAt.getTime() - startedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);

      // Filtra durate anomale (< 15 min o > 8 ore)
      if (durationMinutes < 15 || durationMinutes > 480) return;

      // Aggiungi alla proprietà specifica
      if (data.propertyId === propertyId) {
        propertyDurations.push(durationMinutes);
      }

      // Aggiungi alle statistiche globali per camere+bagni
      const prop = propertiesMap.get(data.propertyId);
      if (prop) {
        const key = `${prop.bedrooms}b${prop.bathrooms}ba`;
        if (!globalDurations.has(key)) {
          globalDurations.set(key, []);
        }
        globalDurations.get(key)!.push(durationMinutes);
      }
    });

    // ─── CALCOLA STATISTICHE PROPRIETÀ ───
    let propertyStats: PropertyDurationData | null = null;

    if (propertyDurations.length > 0) {
      const sorted = [...propertyDurations].sort((a, b) => a - b);
      propertyStats = {
        propertyId,
        propertyName: targetProperty.name,
        bedrooms: targetProperty.bedrooms,
        bathrooms: targetProperty.bathrooms,
        cleaningsCount: propertyDurations.length,
        avgDuration: Math.round(propertyDurations.reduce((a, b) => a + b, 0) / propertyDurations.length),
        minDuration: sorted[0] ?? 0,
        maxDuration: sorted[sorted.length - 1] ?? 0,
        p75Duration: calculatePercentile(propertyDurations, 75),
        lastUpdated: new Date().toISOString(),
      };
    }

    // ─── CALCOLA STATISTICHE GLOBALI per stesse dimensioni ───
    const targetKey = `${targetProperty.bedrooms}b${targetProperty.bathrooms}ba`;
    const globalDurationsForSize = globalDurations.get(targetKey) || [];
    
    let globalStats: GlobalStats | null = null;
    if (globalDurationsForSize.length > 0) {
      globalStats = {
        key: targetKey,
        bedrooms: targetProperty.bedrooms,
        bathrooms: targetProperty.bathrooms,
        cleaningsCount: globalDurationsForSize.length,
        avgDuration: Math.round(globalDurationsForSize.reduce((a, b) => a + b, 0) / globalDurationsForSize.length),
        p75Duration: calculatePercentile(globalDurationsForSize, 75),
      };
    }

    // ─── CALCOLA TUTTE LE STATISTICHE GLOBALI (per la pagina admin) ───
    const allGlobalStats: GlobalStats[] = [];
    globalDurations.forEach((durations, key) => {
      const match = key.match(/(\d+)b(\d+)ba/);
      if (match && durations.length >= 3) {
        allGlobalStats.push({
          key,
          bedrooms: parseInt(match[1] ?? "1"),
          bathrooms: parseInt(match[2] ?? "1"),
          cleaningsCount: durations.length,
          avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
          p75Duration: calculatePercentile(durations, 75),
        });
      }
    });

    // Ordina per camere, poi bagni
    allGlobalStats.sort((a, b) => {
      if (a.bedrooms !== b.bedrooms) return a.bedrooms - b.bedrooms;
      return a.bathrooms - b.bathrooms;
    });

    // ─── CONFRONTO ───
    let comparison: { diff: number; status: "faster" | "slower" | "same" } | null = null;
    if (propertyStats && globalStats) {
      const diff = propertyStats.avgDuration - globalStats.avgDuration;
      comparison = {
        diff,
        status: diff < -5 ? "faster" : diff > 5 ? "slower" : "same",
      };
    }

    return NextResponse.json({
      success: true,
      property: propertyStats,
      globalForSize: globalStats,
      allGlobalStats,
      comparison,
      message: propertyStats 
        ? `Statistiche basate su ${propertyStats.cleaningsCount} pulizie`
        : "Nessuna pulizia completata per questa proprietà",
    });

  } catch (error) {
    console.error("❌ Errore GET property-duration:", error);
    return NextResponse.json({ 
      error: "Errore nel calcolo delle statistiche",
      details: error instanceof Error ? error.message : "Errore sconosciuto"
    }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST - Ricalcola e salva la durata media di una proprietà
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può aggiornare" }, { status: 403 });
    }

    const body = await request.json();
    const { propertyId, recalculateAll = false } = body;

    if (!propertyId && !recalculateAll) {
      return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
    }

    // ─── CARICA PROPRIETÀ ───
    const propertiesSnap = await getDocs(collection(db, "properties"));
    const propertiesMap = new Map<string, { id: string; bedrooms: number; bathrooms: number; name: string }>();

    propertiesSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      propertiesMap.set(docSnap.id, {
        id: docSnap.id,
        bedrooms: data.bedrooms || 1,
        bathrooms: data.bathrooms || 1,
        name: data.name || "Proprietà",
      });
    });

    // ─── CARICA PULIZIE COMPLETATE ───
    let cleaningsSnap;
    try {
      const cleaningsQuery = query(
        collection(db, "cleanings"),
        where("status", "in", ["COMPLETED", "completed", "VERIFIED", "verified"])
      );
      cleaningsSnap = await getDocs(cleaningsQuery);
    } catch {
      cleaningsSnap = await getDocs(collection(db, "cleanings"));
    }

    const completedStatuses = ["COMPLETED", "completed", "VERIFIED", "verified"];
    const durationsByProperty: Map<string, number[]> = new Map();

    cleaningsSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      
      if (!completedStatuses.includes(data.status)) return;
      if (!data.startedAt || !data.completedAt) return;

      try {
        const startedAt = data.startedAt.toDate?.() ?? new Date(data.startedAt);
        const completedAt = data.completedAt.toDate?.() ?? new Date(data.completedAt);
        const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);

        if (durationMinutes < 15 || durationMinutes > 480) return;

        if (!durationsByProperty.has(data.propertyId)) {
          durationsByProperty.set(data.propertyId, []);
        }
        durationsByProperty.get(data.propertyId)!.push(durationMinutes);
      } catch {
        return;
      }
    });

    // ─── AGGIORNA PROPRIETÀ ───
    const updates: string[] = [];
    const now = Timestamp.now();

    const propertiesToUpdate = recalculateAll 
      ? Array.from(propertiesMap.keys())
      : [propertyId];

    for (const propId of propertiesToUpdate) {
      const durations = durationsByProperty.get(propId) || [];
      const propData = propertiesMap.get(propId);

      if (propData && durations.length > 0) {
        const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
        const p75Duration = calculatePercentile(durations, 75);

        await updateDoc(doc(db, "properties", propId), {
          avgCleaningDuration: avgDuration,
          p75CleaningDuration: p75Duration,
          cleaningDurationSamples: durations.length,
          cleaningDurationUpdatedAt: now,
          updatedAt: now,
        });

        updates.push(`${propData.name}: ${avgDuration} min (media), ${p75Duration} min (P75) da ${durations.length} pulizie`);
      }
    }

    console.log(`✅ Aggiornate durate per ${updates.length} proprietà`);

    return NextResponse.json({
      success: true,
      updatesApplied: updates.length,
      updates,
    });

  } catch (error) {
    console.error("❌ Errore POST property-duration:", error);
    return NextResponse.json({ 
      error: "Errore nell'aggiornamento",
      details: error instanceof Error ? error.message : "Errore sconosciuto"
    }, { status: 500 });
  }
}
