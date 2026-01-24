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
  writeBatch
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface DurationStats {
  count: number;
  totalMinutes: number;
  avgMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  stdDeviation: number;
  // Percentili per stime più accurate
  p25: number;  // 25% delle pulizie sotto questo tempo
  p50: number;  // Mediana
  p75: number;  // 75% delle pulizie sotto questo tempo
  p90: number;  // 90% sotto (utile per pianificazione)
}

interface CleaningDurationData {
  cleaningId: string;
  propertyId: string;
  serviceTypeCode: string;
  operatorId: string;
  bedrooms: number;
  bathrooms: number;
  durationMinutes: number;
  completedAt: Date;
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
// HELPER: Calcola statistiche da array di durate
// ═══════════════════════════════════════════════════════════════

function calculateStats(durations: number[]): DurationStats {
  if (durations.length === 0) {
    return {
      count: 0,
      totalMinutes: 0,
      avgMinutes: 0,
      minMinutes: 0,
      maxMinutes: 0,
      stdDeviation: 0,
      p25: 0,
      p50: 0,
      p75: 0,
      p90: 0,
    };
  }

  // Ordina per calcolo percentili
  const sorted = [...durations].sort((a, b) => a - b);
  const count = sorted.length;
  const total = sorted.reduce((sum, d) => sum + d, 0);
  const avg = total / count;

  // Deviazione standard
  const squaredDiffs = sorted.map(d => Math.pow(d - avg, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, d) => sum + d, 0) / count;
  const stdDev = Math.sqrt(avgSquaredDiff);

  // Percentili
  const percentile = (p: number) => {
    const index = Math.ceil((p / 100) * count) - 1;
    return sorted[Math.max(0, Math.min(index, count - 1))] || 0;
  };

  return {
    count,
    totalMinutes: Math.round(total),
    avgMinutes: Math.round(avg),
    minMinutes: sorted[0] || 0,
    maxMinutes: sorted[count - 1] || 0,
    stdDeviation: Math.round(stdDev),
    p25: percentile(25),
    p50: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
  };
}

// ═══════════════════════════════════════════════════════════════
// GET - Calcola e restituisci statistiche durata
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può vedere le statistiche" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get("months") || "6"); // Ultimi N mesi
    const propertyId = searchParams.get("propertyId");
    const operatorId = searchParams.get("operatorId");

    // ─── CARICA PULIZIE COMPLETATE ───
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    const cleaningsQuery = query(
      collection(db, "cleanings"),
      where("status", "in", ["COMPLETED", "completed", "VERIFIED", "verified"]),
      where("completedAt", ">=", Timestamp.fromDate(cutoffDate))
    );

    const cleaningsSnap = await getDocs(cleaningsQuery);

    // ─── CARICA PROPRIETÀ PER INFO STANZE ───
    const propertiesSnap = await getDocs(collection(db, "properties"));
    const propertiesMap = new Map<string, { bedrooms: number; bathrooms: number; name: string }>();
    propertiesSnap.docs.forEach(doc => {
      const data = doc.data();
      propertiesMap.set(doc.id, {
        bedrooms: data.bedrooms || 1,
        bathrooms: data.bathrooms || 1,
        name: data.name || "Proprietà",
      });
    });

    // ─── ELABORA DATI ───
    const cleaningData: CleaningDurationData[] = [];

    cleaningsSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      
      // Salta se mancano dati essenziali
      if (!data.startedAt || !data.completedAt) return;
      
      const startedAt = data.startedAt.toDate?.() || new Date(data.startedAt);
      const completedAt = data.completedAt.toDate?.() || new Date(data.completedAt);
      const durationMs = completedAt.getTime() - startedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);

      // Filtra durate anomale (< 15 min o > 8 ore)
      if (durationMinutes < 15 || durationMinutes > 480) return;

      // Applica filtri opzionali
      if (propertyId && data.propertyId !== propertyId) return;
      if (operatorId && data.operatorId !== operatorId) return;

      const property = propertiesMap.get(data.propertyId);

      cleaningData.push({
        cleaningId: docSnap.id,
        propertyId: data.propertyId,
        serviceTypeCode: data.serviceTypeCode || "STANDARD",
        operatorId: data.operatorId || "",
        bedrooms: property?.bedrooms || data.bedrooms || 1,
        bathrooms: property?.bathrooms || data.bathrooms || 1,
        durationMinutes,
        completedAt,
      });
    });

    // ─── CALCOLA STATISTICHE PER TIPO SERVIZIO ───
    const byServiceType: Record<string, DurationStats> = {};
    const serviceTypeCodes = ["STANDARD", "APPROFONDITA", "SGROSSO"];
    
    serviceTypeCodes.forEach(code => {
      const durations = cleaningData
        .filter(c => c.serviceTypeCode === code)
        .map(c => c.durationMinutes);
      byServiceType[code] = calculateStats(durations);
    });

    // ─── CALCOLA STATISTICHE PER PROPRIETÀ ───
    const byProperty: Record<string, DurationStats & { name: string }> = {};
    const propertyIds = [...new Set(cleaningData.map(c => c.propertyId))];
    
    propertyIds.forEach(propId => {
      const durations = cleaningData
        .filter(c => c.propertyId === propId)
        .map(c => c.durationMinutes);
      const stats = calculateStats(durations);
      const property = propertiesMap.get(propId);
      byProperty[propId] = {
        ...stats,
        name: property?.name || "Sconosciuta",
      };
    });

    // ─── CALCOLA STATISTICHE PER OPERATORE ───
    const byOperator: Record<string, DurationStats & { efficiency: number }> = {};
    const operatorIds = [...new Set(cleaningData.filter(c => c.operatorId).map(c => c.operatorId))];
    
    const overallAvg = calculateStats(cleaningData.map(c => c.durationMinutes)).avgMinutes || 90;
    
    operatorIds.forEach(opId => {
      const durations = cleaningData
        .filter(c => c.operatorId === opId)
        .map(c => c.durationMinutes);
      const stats = calculateStats(durations);
      byOperator[opId] = {
        ...stats,
        // Efficienza: 100 = media, >100 = più veloce, <100 = più lento
        efficiency: stats.avgMinutes > 0 ? Math.round((overallAvg / stats.avgMinutes) * 100) : 100,
      };
    });

    // ─── CALCOLA STATISTICHE PER NUMERO STANZE ───
    const byRoomCount: Record<string, DurationStats> = {};
    const roomCombinations = [...new Set(cleaningData.map(c => `${c.bedrooms}b${c.bathrooms}ba`))];
    
    roomCombinations.forEach(combo => {
      const [bedrooms, bathrooms] = combo.split("b").map(s => parseInt(s.replace("ba", "")));
      const durations = cleaningData
        .filter(c => c.bedrooms === bedrooms && c.bathrooms === bathrooms)
        .map(c => c.durationMinutes);
      byRoomCount[combo] = calculateStats(durations);
    });

    // ─── CALCOLA TEMPO EXTRA PER STANZA/BAGNO ───
    // Regressione lineare semplice per stimare impatto di stanze/bagni
    let extraTimePerRoom = 0;
    let extraTimePerBathroom = 0;

    if (cleaningData.length >= 10) {
      // Raggruppa per numero stanze e calcola media
      const avgByBedrooms: Record<number, number> = {};
      for (let beds = 1; beds <= 5; beds++) {
        const durations = cleaningData.filter(c => c.bedrooms === beds).map(c => c.durationMinutes);
        if (durations.length >= 3) {
          avgByBedrooms[beds] = durations.reduce((a, b) => a + b, 0) / durations.length;
        }
      }
      
      // Calcola differenza media tra livelli
      const bedroomKeys = Object.keys(avgByBedrooms).map(Number).sort((a, b) => a - b);
      if (bedroomKeys.length >= 2) {
        let totalDiff = 0;
        let diffs = 0;
        for (let i = 1; i < bedroomKeys.length; i++) {
          const prev = bedroomKeys[i - 1]!;
          const curr = bedroomKeys[i]!;
          totalDiff += (avgByBedrooms[curr]! - avgByBedrooms[prev]!) / (curr - prev);
          diffs++;
        }
        extraTimePerRoom = Math.round(totalDiff / diffs);
      }

      // Stesso calcolo per bagni
      const avgByBathrooms: Record<number, number> = {};
      for (let baths = 1; baths <= 4; baths++) {
        const durations = cleaningData.filter(c => c.bathrooms === baths).map(c => c.durationMinutes);
        if (durations.length >= 3) {
          avgByBathrooms[baths] = durations.reduce((a, b) => a + b, 0) / durations.length;
        }
      }
      
      const bathroomKeys = Object.keys(avgByBathrooms).map(Number).sort((a, b) => a - b);
      if (bathroomKeys.length >= 2) {
        let totalDiff = 0;
        let diffs = 0;
        for (let i = 1; i < bathroomKeys.length; i++) {
          const prev = bathroomKeys[i - 1]!;
          const curr = bathroomKeys[i]!;
          totalDiff += (avgByBathrooms[curr]! - avgByBathrooms[prev]!) / (curr - prev);
          diffs++;
        }
        extraTimePerBathroom = Math.round(totalDiff / diffs);
      }
    }

    // ─── SUGGERIMENTI AGGIORNAMENTO ───
    const suggestions = {
      serviceTypes: Object.entries(byServiceType)
        .filter(([_, stats]) => stats.count >= 5)
        .map(([code, stats]) => ({
          code,
          currentEstimate: code === "STANDARD" ? 90 : code === "APPROFONDITA" ? 120 : 180,
          suggestedEstimate: stats.p75, // Usa il 75° percentile per sicurezza
          basedOnSamples: stats.count,
          confidence: stats.count >= 20 ? "high" : stats.count >= 10 ? "medium" : "low",
        })),
      extraTimePerRoom: extraTimePerRoom > 0 ? extraTimePerRoom : 15,
      extraTimePerBathroom: extraTimePerBathroom > 0 ? extraTimePerBathroom : 10,
    };

    console.log(`📊 Statistiche calcolate su ${cleaningData.length} pulizie degli ultimi ${months} mesi`);

    return NextResponse.json({
      success: true,
      period: {
        months,
        from: cutoffDate.toISOString(),
        to: new Date().toISOString(),
      },
      totalCleanings: cleaningData.length,
      overall: calculateStats(cleaningData.map(c => c.durationMinutes)),
      byServiceType,
      byProperty,
      byOperator,
      byRoomCount,
      suggestions,
    });
  } catch (error) {
    console.error("❌ Errore GET analytics:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// POST - Applica le stime calcolate ai ServiceType
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può aggiornare le stime" }, { status: 403 });
    }

    const body = await request.json();
    const { 
      applyToServiceTypes = true,
      applyToProperties = false,
      usePercentile = 75, // Quale percentile usare (50 = mediana, 75 = conservativo)
      minSamples = 10,    // Minimo campioni per aggiornare
    } = body;

    // ─── RICALCOLA STATISTICHE ───
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);

    const cleaningsQuery = query(
      collection(db, "cleanings"),
      where("status", "in", ["COMPLETED", "completed", "VERIFIED", "verified"]),
      where("completedAt", ">=", Timestamp.fromDate(cutoffDate))
    );

    const cleaningsSnap = await getDocs(cleaningsQuery);
    
    // Elabora dati
    const durationsByServiceType: Record<string, number[]> = {
      STANDARD: [],
      APPROFONDITA: [],
      SGROSSO: [],
    };
    
    const durationsByProperty: Record<string, number[]> = {};

    cleaningsSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.startedAt || !data.completedAt) return;
      
      const startedAt = data.startedAt.toDate?.() || new Date(data.startedAt);
      const completedAt = data.completedAt.toDate?.() || new Date(data.completedAt);
      const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);

      if (durationMinutes < 15 || durationMinutes > 480) return;

      const code = data.serviceTypeCode || "STANDARD";
      if (durationsByServiceType[code]) {
        durationsByServiceType[code].push(durationMinutes);
      }

      if (data.propertyId) {
        if (!durationsByProperty[data.propertyId]) {
          durationsByProperty[data.propertyId] = [];
        }
        durationsByProperty[data.propertyId].push(durationMinutes);
      }
    });

    const updates: string[] = [];
    const now = Timestamp.now();

    // ─── AGGIORNA SERVICE TYPES ───
    if (applyToServiceTypes) {
      const serviceTypesSnap = await getDocs(collection(db, "serviceTypes"));
      
      for (const stDoc of serviceTypesSnap.docs) {
        const code = stDoc.data().code;
        const durations = durationsByServiceType[code] || [];
        
        if (durations.length >= minSamples) {
          const sorted = durations.sort((a, b) => a - b);
          const index = Math.ceil((usePercentile / 100) * sorted.length) - 1;
          const newEstimate = sorted[Math.max(0, index)] || 90;
          
          await updateDoc(doc(db, "serviceTypes", stDoc.id), {
            estimatedDuration: newEstimate,
            estimatedDurationSource: "auto",
            estimatedDurationSamples: durations.length,
            estimatedDurationUpdatedAt: now,
            updatedAt: now,
          });
          
          updates.push(`${code}: ${newEstimate} min (da ${durations.length} campioni)`);
        }
      }
    }

    // ─── AGGIORNA PROPRIETÀ (opzionale) ───
    if (applyToProperties) {
      for (const [propertyId, durations] of Object.entries(durationsByProperty)) {
        if (durations.length >= minSamples) {
          const sorted = durations.sort((a, b) => a - b);
          const index = Math.ceil((usePercentile / 100) * sorted.length) - 1;
          const newEstimate = sorted[Math.max(0, index)] || 90;
          
          await updateDoc(doc(db, "properties", propertyId), {
            estimatedCleaningDuration: newEstimate,
            estimatedDurationSource: "auto",
            estimatedDurationSamples: durations.length,
            estimatedDurationUpdatedAt: now,
            updatedAt: now,
          });
          
          updates.push(`Proprietà ${propertyId}: ${newEstimate} min`);
        }
      }
    }

    console.log(`✅ Aggiornate ${updates.length} stime automatiche`);

    return NextResponse.json({
      success: true,
      updatesApplied: updates.length,
      updates,
      settings: {
        usePercentile,
        minSamples,
        applyToServiceTypes,
        applyToProperties,
      },
    });
  } catch (error) {
    console.error("❌ Errore POST analytics:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
