import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

interface DurationStats {
  count: number; totalMinutes: number; avgMinutes: number; minMinutes: number;
  maxMinutes: number; stdDeviation: number; p25: number; p50: number; p75: number; p90: number;
}
interface CleaningDurationData {
  cleaningId: string; propertyId: string; propertyName: string; serviceTypeCode: string;
  operatorId: string; operatorName: string; bedrooms: number; bathrooms: number;
  durationMinutes: number; completedAt: Date;
}

function calculateStats(durations: number[]): DurationStats {
  if (durations.length === 0) return { count: 0, totalMinutes: 0, avgMinutes: 0, minMinutes: 0, maxMinutes: 0, stdDeviation: 0, p25: 0, p50: 0, p75: 0, p90: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const count = sorted.length;
  const total = sorted.reduce((sum, d) => sum + d, 0);
  const avg = total / count;
  const stdDev = Math.sqrt(sorted.map(d => Math.pow(d - avg, 2)).reduce((sum, d) => sum + d, 0) / count);
  const percentile = (p: number) => { const index = Math.ceil((p / 100) * count) - 1; return sorted[Math.max(0, Math.min(index, count - 1))] ?? 0; };
  return { count, totalMinutes: Math.round(total), avgMinutes: Math.round(avg), minMinutes: sorted[0] ?? 0, maxMinutes: sorted[count - 1] ?? 0, stdDeviation: Math.round(stdDev), p25: percentile(25), p50: percentile(50), p75: percentile(75), p90: percentile(90) };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Solo admin può vedere le statistiche" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get("months") || "6");
    const propertyId = searchParams.get("propertyId");
    const operatorId = searchParams.get("operatorId");
    const cutoffDate = new Date(); cutoffDate.setMonth(cutoffDate.getMonth() - months);

    let cleaningsSnap;
    try {
      cleaningsSnap = await adminDb.collection("cleanings").where("status", "in", ["COMPLETED", "completed", "VERIFIED", "verified"]).get();
    } catch {
      cleaningsSnap = await adminDb.collection("cleanings").get();
    }

    const propertiesSnap = await adminDb.collection("properties").get();
    const propertiesMap = new Map<string, { bedrooms: number; bathrooms: number; name: string }>();
    propertiesSnap.docs.forEach(d => { const data = d.data() as Record<string, any>; propertiesMap.set(d.id, { bedrooms: data.bedrooms || 1, bathrooms: data.bathrooms || 1, name: data.name || "Proprietà" }); });

    const usersSnap = await adminDb.collection("users").get();
    const usersMap = new Map<string, string>();
    usersSnap.docs.forEach(d => { const data = d.data() as Record<string, any>; usersMap.set(d.id, data.name || data.email || "Operatore"); });

    const cleaningData: CleaningDurationData[] = [];
    const completedStatuses = ["COMPLETED", "completed", "VERIFIED", "verified"];

    cleaningsSnap.docs.forEach(d => {
      const data = d.data() as Record<string, any>;
      if (!completedStatuses.includes(data.status)) return;
      if (!data.startedAt || !data.completedAt) return;
      let startedAt: Date, completedAt: Date;
      try { startedAt = data.startedAt.toDate?.() ?? new Date(data.startedAt); completedAt = data.completedAt.toDate?.() ?? new Date(data.completedAt); } catch { return; }
      if (completedAt < cutoffDate) return;
      const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);
      if (durationMinutes < 15 || durationMinutes > 480) return;
      if (propertyId && data.propertyId !== propertyId) return;
      if (operatorId && data.operatorId !== operatorId) return;
      const property = propertiesMap.get(data.propertyId);
      cleaningData.push({ cleaningId: d.id, propertyId: data.propertyId, propertyName: property?.name ?? data.propertyName ?? "Sconosciuta", serviceTypeCode: data.serviceTypeCode || data.serviceType || "STANDARD", operatorId: data.operatorId || "", operatorName: data.operatorId ? usersMap.get(data.operatorId) ?? "Sconosciuto" : "Non assegnato", bedrooms: property?.bedrooms ?? data.bedrooms ?? 1, bathrooms: property?.bathrooms ?? data.bathrooms ?? 1, durationMinutes, completedAt });
    });

    if (cleaningData.length === 0) {
      return NextResponse.json({ success: true, noData: true, message: "Nessuna pulizia completata nel periodo", period: { months, from: cutoffDate.toISOString(), to: new Date().toISOString() }, totalCleanings: 0, overall: calculateStats([]), byServiceType: {}, byProperty: {}, byOperator: {}, byRoomCount: {}, suggestions: { serviceTypes: [], extraTimePerRoom: 15, extraTimePerBathroom: 10 } });
    }

    const byServiceType: Record<string, DurationStats> = {};
    ["STANDARD", "APPROFONDITA", "SGROSSO"].forEach(code => {
      const durations = cleaningData.filter(c => c.serviceTypeCode.toUpperCase() === code).map(c => c.durationMinutes);
      if (durations.length > 0) byServiceType[code] = calculateStats(durations);
    });

    const byProperty: Record<string, DurationStats & { name: string }> = {};
    [...new Set(cleaningData.map(c => c.propertyId))].forEach(propId => {
      const cleanings = cleaningData.filter(c => c.propertyId === propId);
      byProperty[propId] = { ...calculateStats(cleanings.map(c => c.durationMinutes)), name: cleanings[0]?.propertyName ?? "Sconosciuta" };
    });

    const overallAvg = calculateStats(cleaningData.map(c => c.durationMinutes)).avgMinutes || 90;
    const byOperator: Record<string, DurationStats & { name: string; efficiency: number }> = {};
    [...new Set(cleaningData.filter(c => c.operatorId).map(c => c.operatorId))].forEach(opId => {
      const cleanings = cleaningData.filter(c => c.operatorId === opId);
      const stats = calculateStats(cleanings.map(c => c.durationMinutes));
      byOperator[opId] = { ...stats, name: cleanings[0]?.operatorName ?? "Sconosciuto", efficiency: stats.avgMinutes > 0 ? Math.round((overallAvg / stats.avgMinutes) * 100) : 100 };
    });

    const byRoomCount: Record<string, DurationStats & { label: string }> = {};
    [...new Set(cleaningData.map(c => `${c.bedrooms}b${c.bathrooms}ba`))].forEach(combo => {
      const match = combo.match(/(\d+)b(\d+)ba/); if (!match) return;
      const beds = parseInt(match[1] ?? "1"), baths = parseInt(match[2] ?? "1");
      byRoomCount[combo] = { ...calculateStats(cleaningData.filter(c => c.bedrooms === beds && c.bathrooms === baths).map(c => c.durationMinutes)), label: `${beds} camera${beds > 1 ? 'e' : ''}, ${baths} bagn${baths > 1 ? 'i' : 'o'}` };
    });

    return NextResponse.json({ success: true, noData: false, period: { months, from: cutoffDate.toISOString(), to: new Date().toISOString() }, totalCleanings: cleaningData.length, overall: calculateStats(cleaningData.map(c => c.durationMinutes)), byServiceType, byProperty, byOperator, byRoomCount, suggestions: { serviceTypes: Object.entries(byServiceType).filter(([, s]) => s.count >= 5).map(([code, s]) => ({ code, currentEstimate: ({ STANDARD: 90, APPROFONDITA: 120, SGROSSO: 180 } as any)[code] ?? 90, suggestedEstimate: s.p75, basedOnSamples: s.count, confidence: s.count >= 20 ? "alta" : s.count >= 10 ? "media" : "bassa" })), extraTimePerRoom: 15, extraTimePerBathroom: 10 }, recentCleanings: cleaningData.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime()).slice(0, 50).map(c => ({ id: c.cleaningId, property: c.propertyName, operator: c.operatorName, type: c.serviceTypeCode, duration: c.durationMinutes, date: c.completedAt.toISOString().split('T')[0] })) });
  } catch (error) {
    return NextResponse.json({ error: "Errore nel calcolo delle statistiche", details: error instanceof Error ? error.message : "Errore sconosciuto" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Solo admin può aggiornare le stime" }, { status: 403 });

    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { applyToServiceTypes = true, applyToProperties = false, usePercentile = 75, minSamples = 10 } = body;
    const cutoffDate = new Date(); cutoffDate.setMonth(cutoffDate.getMonth() - 6);

    let cleaningsSnap;
    try { cleaningsSnap = await adminDb.collection("cleanings").where("status", "in", ["COMPLETED", "completed", "VERIFIED", "verified"]).get(); }
    catch { cleaningsSnap = await adminDb.collection("cleanings").get(); }

    const durationsByServiceType: Record<string, number[]> = { STANDARD: [], APPROFONDITA: [], SGROSSO: [] };
    const durationsByProperty: Record<string, number[]> = {};
    const completedStatuses = ["COMPLETED", "completed", "VERIFIED", "verified"];

    cleaningsSnap.docs.forEach(d => {
      const data = d.data() as Record<string, any>;
      if (!completedStatuses.includes(data.status) || !data.startedAt || !data.completedAt) return;
      try {
        const startedAt = data.startedAt.toDate?.() ?? new Date(data.startedAt);
        const completedAt = data.completedAt.toDate?.() ?? new Date(data.completedAt);
        const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);
        if (durationMinutes < 15 || durationMinutes > 480 || completedAt < cutoffDate) return;
        const code = (data.serviceTypeCode || data.serviceType || "STANDARD").toUpperCase();
        if (durationsByServiceType[code]) durationsByServiceType[code]!.push(durationMinutes);
        if (data.propertyId) { if (!durationsByProperty[data.propertyId]) durationsByProperty[data.propertyId] = []; durationsByProperty[data.propertyId]!.push(durationMinutes); }
      } catch { return; }
    });

    const updates: string[] = [];
    const now = Timestamp.now();

    if (applyToServiceTypes) {
      const serviceTypesSnap = await adminDb.collection("serviceTypes").get();
      for (const stDoc of serviceTypesSnap.docs) {
        const code = ((stDoc.data() as Record<string, any>).code || "").toUpperCase();
        const durations = durationsByServiceType[code] || [];
        // @ts-expect-error TODO-FIX: TS18046 'minSamples' is of type 'unknown'.
        if (durations.length >= minSamples) {
          const sorted = durations.sort((a, b) => a - b);
          // @ts-expect-error TODO-FIX: TS18046 'usePercentile' is of type 'unknown'.
          const newEstimate = sorted[Math.max(0, Math.ceil((usePercentile / 100) * sorted.length) - 1)] ?? 90;
          await stDoc.ref.update({ estimatedDuration: newEstimate, estimatedDurationSource: "auto", estimatedDurationSamples: durations.length, estimatedDurationUpdatedAt: now, updatedAt: now });
          updates.push(`${code}: ${newEstimate} min (da ${durations.length} campioni)`);
        }
      }
    }

    if (applyToProperties) {
      for (const [propId, durations] of Object.entries(durationsByProperty)) {
        // @ts-expect-error TODO-FIX: TS18046 'minSamples' is of type 'unknown'.
        if (durations.length >= minSamples) {
          const sorted = durations.sort((a, b) => a - b);
          // @ts-expect-error TODO-FIX: TS18046 'usePercentile' is of type 'unknown'.
          const newEstimate = sorted[Math.max(0, Math.ceil((usePercentile / 100) * sorted.length) - 1)] ?? 90;
          await adminDb.collection("properties").doc(propId).update({ estimatedCleaningDuration: newEstimate, estimatedDurationSource: "auto", estimatedDurationSamples: durations.length, estimatedDurationUpdatedAt: now, updatedAt: now });
          updates.push(`Proprietà ${propId}: ${newEstimate} min`);
        }
      }
    }

    return NextResponse.json({ success: true, updatesApplied: updates.length, updates, settings: { usePercentile, minSamples, applyToServiceTypes, applyToProperties } });
  } catch (error) {
    return NextResponse.json({ error: "Errore nell'applicazione delle stime", details: error instanceof Error ? error.message : "Errore sconosciuto" }, { status: 500 });
  }
}
