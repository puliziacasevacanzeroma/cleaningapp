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
  totalMinutes: number;
  avgMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  stdDeviation: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface CleaningDurationData {
  cleaningId: string;
  propertyId: string;
  propertyName: string;
  serviceTypeCode: string;
  operatorId: string;
  operatorName: string;
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
    if (count === 0) return 0;
    const index = Math.ceil((p / 100) * count) - 1;
    return sorted[Math.max(0, Math.min(index, count - 1))] ?? 0;
  };

  return {
    count,
    totalMinutes: Math.round(total),
    avgMinutes: Math.round(avg),
    minMinutes: sorted[0] ?? 0,
    maxMinutes: sorted[count - 1] ?? 0,
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
    const months = parseInt(searchParams.get("months") || "6");
    const propertyId = searchParams.get("propertyId");
    const operatorId = searchParams.get("operatorId");

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    // ─── CARICA TUTTE LE PULIZIE (senza query composita) ───
    let cleaningsSnap;
    try {
      const cleaningsQuery = query(
        collection(db, "cleanings"),
        where("status", "in", ["COMPLETED", "completed", "VERIFIED", "verified"])
      );
      cleaningsSnap = await getDocs(cleaningsQuery);
    } catch {
      console.log("📊 Query con filtro fallita, carico tutte le pulizie");
      cleaningsSnap = await getDocs(collection(db, "cleanings"));
    }

    // ─── CARICA PROPRIETÀ ───
    const propertiesSnap = await getDocs(collection(db, "properties"));
    const propertiesMap = new Map<string, { bedrooms: number; bathrooms: number; name: string }>();
    propertiesSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      propertiesMap.set(docSnap.id, {
        bedrooms: data.bedrooms || 1,
        bathrooms: data.bathrooms || 1,
        name: data.name || "Proprietà",
      });
    });

    // ─── CARICA UTENTI (operatori) ───
    const usersSnap = await getDocs(collection(db, "users"));
    const usersMap = new Map<string, string>();
    usersSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      usersMap.set(docSnap.id, data.name || data.email || "Operatore");
    });

    // ─── ELABORA DATI ───
    const cleaningData: CleaningDurationData[] = [];
    const completedStatuses = ["COMPLETED", "completed", "VERIFIED", "verified"];

    cleaningsSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      
      // Filtra per status completato
      if (!completedStatuses.includes(data.status)) return;

      // Salta se mancano dati essenziali
      if (!data.startedAt || !data.completedAt) return;

      let startedAt: Date;
      let completedAt: Date;

      try {
        startedAt = data.startedAt.toDate?.() ?? new Date(data.startedAt);
        completedAt = data.completedAt.toDate?.() ?? new Date(data.completedAt);
      } catch {
        return;
      }

      // Filtra per data (post-query)
      if (completedAt < cutoffDate) return;

      const durationMs = completedAt.getTime() - startedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);

      // Filtra durate anomale (< 15 min o > 8 ore)
      if (durationMinutes < 15 || durationMinutes > 480) return;

      // Applica filtri opzionali
      if (propertyId && data.propertyId !== propertyId) return;
      if (operatorId && data.operatorId !== operatorId) return;

      const property = propertiesMap.get(data.propertyId);
      const operatorName = data.operatorId ? usersMap.get(data.operatorId) ?? "Sconosciuto" : "Non assegnato";

      cleaningData.push({
        cleaningId: docSnap.id,
        propertyId: data.propertyId,
        propertyName: property?.name ?? data.propertyName ?? "Sconosciuta",
        serviceTypeCode: data.serviceTypeCode || data.serviceType || "STANDARD",
        operatorId: data.operatorId || "",
        operatorName,
        bedrooms: property?.bedrooms ?? data.bedrooms ?? 1,
        bathrooms: property?.bathrooms ?? data.bathrooms ?? 1,
        durationMinutes,
        completedAt,
      });
    });

    // ─── SE NON CI SONO DATI ───
    if (cleaningData.length === 0) {
      return NextResponse.json({
        success: true,
        noData: true,
        message: "Nessuna pulizia completata nel periodo selezionato",
        period: {
          months,
          from: cutoffDate.toISOString(),
          to: new Date().toISOString(),
        },
        totalCleanings: 0,
        overall: calculateStats([]),
        byServiceType: {},
        byProperty: {},
        byOperator: {},
        byRoomCount: {},
        suggestions: {
          serviceTypes: [],
          extraTimePerRoom: 15,
          extraTimePerBathroom: 10,
        },
      });
    }

    // ─── CALCOLA STATISTICHE PER TIPO SERVIZIO ───
    const byServiceType: Record<string, DurationStats> = {};
    const serviceTypeCodes = ["STANDARD", "APPROFONDITA", "SGROSSO"];
    
    serviceTypeCodes.forEach(code => {
      const durations = cleaningData
        .filter(c => c.serviceTypeCode.toUpperCase() === code)
        .map(c => c.durationMinutes);
      if (durations.length > 0) {
        byServiceType[code] = calculateStats(durations);
      }
    });

    // ─── CALCOLA STATISTICHE PER PROPRIETÀ ───
    const byProperty: Record<string, DurationStats & { name: string }> = {};
    const propertyIds = [...new Set(cleaningData.map(c => c.propertyId))];
    
    propertyIds.forEach(propId => {
      const cleanings = cleaningData.filter(c => c.propertyId === propId);
      const durations = cleanings.map(c => c.durationMinutes);
      const stats = calculateStats(durations);
      const propName = cleanings[0]?.propertyName ?? "Sconosciuta";
      byProperty[propId] = {
        ...stats,
        name: propName,
      };
    });

    // ─── CALCOLA STATISTICHE PER OPERATORE ───
    const byOperator: Record<string, DurationStats & { name: string; efficiency: number }> = {};
    const operatorIds = [...new Set(cleaningData.filter(c => c.operatorId).map(c => c.operatorId))];
    
    const overallAvg = calculateStats(cleaningData.map(c => c.durationMinutes)).avgMinutes || 90;
    
    operatorIds.forEach(opId => {
      const cleanings = cleaningData.filter(c => c.operatorId === opId);
      const durations = cleanings.map(c => c.durationMinutes);
      const stats = calculateStats(durations);
      const opName = cleanings[0]?.operatorName ?? "Sconosciuto";
      byOperator[opId] = {
        ...stats,
        name: opName,
        efficiency: stats.avgMinutes > 0 ? Math.round((overallAvg / stats.avgMinutes) * 100) : 100,
      };
    });

    // ─── CALCOLA STATISTICHE PER NUMERO STANZE ───
    const byRoomCount: Record<string, DurationStats & { label: string }> = {};
    const roomCombinations = [...new Set(cleaningData.map(c => `${c.bedrooms}b${c.bathrooms}ba`))];
    
    roomCombinations.forEach(combo => {
      const match = combo.match(/(\d+)b(\d+)ba/);
      if (!match) return;
      const bedrooms = parseInt(match[1] ?? "1");
      const bathrooms = parseInt(match[2] ?? "1");
      const durations = cleaningData
        .filter(c => c.bedrooms === bedrooms && c.bathrooms === bathrooms)
        .map(c => c.durationMinutes);
      byRoomCount[combo] = {
        ...calculateStats(durations),
        label: `${bedrooms} camera${bedrooms > 1 ? 'e' : ''}, ${bathrooms} bagn${bathrooms > 1 ? 'i' : 'o'}`,
      };
    });

    // ─── CALCOLA TEMPO EXTRA PER STANZA/BAGNO ───
    let extraTimePerRoom = 15;
    let extraTimePerBathroom = 10;

    if (cleaningData.length >= 10) {
      const avgByBedrooms: Record<number, number> = {};
      for (let beds = 1; beds <= 5; beds++) {
        const durations = cleaningData.filter(c => c.bedrooms === beds).map(c => c.durationMinutes);
        if (durations.length >= 3) {
          avgByBedrooms[beds] = durations.reduce((a, b) => a + b, 0) / durations.length;
        }
      }
      
      const bedroomKeys = Object.keys(avgByBedrooms).map(Number).sort((a, b) => a - b);
      if (bedroomKeys.length >= 2) {
        let totalDiff = 0;
        let diffs = 0;
        for (let i = 1; i < bedroomKeys.length; i++) {
          const prev = bedroomKeys[i - 1]!;
          const curr = bedroomKeys[i]!;
          if (avgByBedrooms[prev] !== undefined && avgByBedrooms[curr] !== undefined) {
            totalDiff += (avgByBedrooms[curr]! - avgByBedrooms[prev]!) / (curr - prev);
            diffs++;
          }
        }
        if (diffs > 0) {
          extraTimePerRoom = Math.max(5, Math.round(totalDiff / diffs));
        }
      }

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
          if (avgByBathrooms[prev] !== undefined && avgByBathrooms[curr] !== undefined) {
            totalDiff += (avgByBathrooms[curr]! - avgByBathrooms[prev]!) / (curr - prev);
            diffs++;
          }
        }
        if (diffs > 0) {
          extraTimePerBathroom = Math.max(5, Math.round(totalDiff / diffs));
        }
      }
    }

    // ─── SUGGERIMENTI AGGIORNAMENTO ───
    const defaultEstimates: Record<string, number> = {
      STANDARD: 90,
      APPROFONDITA: 120,
      SGROSSO: 180,
    };

    const suggestions = {
      serviceTypes: Object.entries(byServiceType)
        .filter(([, stats]) => stats.count >= 5)
        .map(([code, stats]) => ({
          code,
          currentEstimate: defaultEstimates[code] ?? 90,
          suggestedEstimate: stats.p75,
          basedOnSamples: stats.count,
          confidence: stats.count >= 20 ? "alta" : stats.count >= 10 ? "media" : "bassa",
        })),
      extraTimePerRoom,
      extraTimePerBathroom,
    };

    console.log(`📊 Statistiche calcolate su ${cleaningData.length} pulizie degli ultimi ${months} mesi`);

    return NextResponse.json({
      success: true,
      noData: false,
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
      recentCleanings: cleaningData
        .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
        .slice(0, 50)
        .map(c => ({
          id: c.cleaningId,
          property: c.propertyName,
          operator: c.operatorName,
          type: c.serviceTypeCode,
          duration: c.durationMinutes,
          date: c.completedAt.toISOString().split('T')[0],
        })),
    });
  } catch (error) {
    console.error("❌ Errore GET analytics:", error);
    return NextResponse.json({ 
      error: "Errore nel calcolo delle statistiche",
      details: error instanceof Error ? error.message : "Errore sconosciuto"
    }, { status: 500 });
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
      usePercentile = 75,
      minSamples = 10,
    } = body;

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);

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

    const durationsByServiceType: Record<string, number[]> = {
      STANDARD: [],
      APPROFONDITA: [],
      SGROSSO: [],
    };
    
    const durationsByProperty: Record<string, number[]> = {};
    const completedStatuses = ["COMPLETED", "completed", "VERIFIED", "verified"];

    cleaningsSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      
      if (!completedStatuses.includes(data.status)) return;
      if (!data.startedAt || !data.completedAt) return;
      
      try {
        const startedAt = data.startedAt.toDate?.() ?? new Date(data.startedAt);
        const completedAt = data.completedAt.toDate?.() ?? new Date(data.completedAt);
        const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);

        if (durationMinutes < 15 || durationMinutes > 480) return;
        if (completedAt < cutoffDate) return;

        const code = (data.serviceTypeCode || data.serviceType || "STANDARD").toUpperCase();
        if (durationsByServiceType[code]) {
          durationsByServiceType[code]!.push(durationMinutes);
        }

        if (data.propertyId) {
          if (!durationsByProperty[data.propertyId]) {
            durationsByProperty[data.propertyId] = [];
          }
          durationsByProperty[data.propertyId]!.push(durationMinutes);
        }
      } catch {
        return;
      }
    });

    const updates: string[] = [];
    const now = Timestamp.now();

    if (applyToServiceTypes) {
      const serviceTypesSnap = await getDocs(collection(db, "serviceTypes"));
      
      for (const stDoc of serviceTypesSnap.docs) {
        const stData = stDoc.data();
        const code = (stData.code || "").toUpperCase();
        const durations = durationsByServiceType[code] || [];
        
        if (durations.length >= minSamples) {
          const sorted = durations.sort((a, b) => a - b);
          const index = Math.ceil((usePercentile / 100) * sorted.length) - 1;
          const newEstimate = sorted[Math.max(0, index)] ?? 90;
          
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

    if (applyToProperties) {
      for (const [propId, durations] of Object.entries(durationsByProperty)) {
        if (durations.length >= minSamples) {
          const sorted = durations.sort((a, b) => a - b);
          const index = Math.ceil((usePercentile / 100) * sorted.length) - 1;
          const newEstimate = sorted[Math.max(0, index)] ?? 90;
          
          await updateDoc(doc(db, "properties", propId), {
            estimatedCleaningDuration: newEstimate,
            estimatedDurationSource: "auto",
            estimatedDurationSamples: durations.length,
            estimatedDurationUpdatedAt: now,
            updatedAt: now,
          });
          
          updates.push(`Proprietà ${propId}: ${newEstimate} min`);
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
    return NextResponse.json({ 
      error: "Errore nell'applicazione delle stime",
      details: error instanceof Error ? error.message : "Errore sconosciuto"
    }, { status: 500 });
  }
}
