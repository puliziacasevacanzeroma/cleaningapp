import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0;
}

async function getCompletedCleanings() {
  try { return await adminDb.collection("cleanings").where("status", "in", ["COMPLETED", "completed", "VERIFIED", "verified"]).get(); }
  catch { return await adminDb.collection("cleanings").get(); }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    const propertyId = new URL(request.url).searchParams.get("propertyId");
    if (!propertyId) return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });

    const propertiesSnap = await adminDb.collection("properties").get();
    const propertiesMap = new Map<string, { bedrooms: number; bathrooms: number; name: string }>();
    let targetProperty: { bedrooms: number; bathrooms: number; name: string } | null = null;
    propertiesSnap.docs.forEach(d => {
      const data = d.data() as Record<string, any>;
      const propData = { bedrooms: data.bedrooms || 1, bathrooms: data.bathrooms || 1, name: data.name || "Proprietà" };
      propertiesMap.set(d.id, propData);
      if (d.id === propertyId) targetProperty = propData;
    });
    if (!targetProperty) return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });

    const cleaningsSnap = await getCompletedCleanings();
    const completedStatuses = ["COMPLETED", "completed", "VERIFIED", "verified"];
    const propertyDurations: number[] = [];
    const globalDurations: Map<string, number[]> = new Map();

    cleaningsSnap.docs.forEach(d => {
      const data = d.data() as Record<string, any>;
      if (!completedStatuses.includes(data.status) || !data.startedAt || !data.completedAt) return;
      try {
        const startedAt = data.startedAt.toDate?.() ?? new Date(data.startedAt);
        const completedAt = data.completedAt.toDate?.() ?? new Date(data.completedAt);
        const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);
        if (durationMinutes < 15 || durationMinutes > 480) return;
        if (data.propertyId === propertyId) propertyDurations.push(durationMinutes);
        const prop = propertiesMap.get(data.propertyId);
        if (prop) { const key = `${prop.bedrooms}b${prop.bathrooms}ba`; if (!globalDurations.has(key)) globalDurations.set(key, []); globalDurations.get(key)!.push(durationMinutes); }
      } catch { return; }
    });

    let propertyStats = null;
    if (propertyDurations.length > 0) {
      const sorted = [...propertyDurations].sort((a, b) => a - b);
      // @ts-expect-error TODO-FIX: TS2339 Property 'name' does not exist on type 'never'.
      propertyStats = { propertyId, propertyName: targetProperty.name, bedrooms: targetProperty.bedrooms, bathrooms: targetProperty.bathrooms, cleaningsCount: propertyDurations.length, avgDuration: Math.round(propertyDurations.reduce((a, b) => a + b, 0) / propertyDurations.length), minDuration: sorted[0] ?? 0, maxDuration: sorted[sorted.length - 1] ?? 0, p75Duration: calculatePercentile(propertyDurations, 75), lastUpdated: new Date().toISOString() };
    }

    // @ts-expect-error TODO-FIX: TS2339 Property 'bedrooms' does not exist on type 'never'.
    const targetKey = `${targetProperty.bedrooms}b${targetProperty.bathrooms}ba`;
    const globalDurationsForSize = globalDurations.get(targetKey) || [];
    let globalStats = null;
    if (globalDurationsForSize.length > 0) {
      // @ts-expect-error TODO-FIX: TS2339 Property 'bedrooms' does not exist on type 'never'.
      globalStats = { key: targetKey, bedrooms: targetProperty.bedrooms, bathrooms: targetProperty.bathrooms, cleaningsCount: globalDurationsForSize.length, avgDuration: Math.round(globalDurationsForSize.reduce((a, b) => a + b, 0) / globalDurationsForSize.length), p75Duration: calculatePercentile(globalDurationsForSize, 75) };
    }

    const allGlobalStats: any[] = [];
    globalDurations.forEach((durations, key) => {
      const match = key.match(/(\d+)b(\d+)ba/);
      if (match && durations.length >= 3) allGlobalStats.push({ key, bedrooms: parseInt(match[1] ?? "1"), bathrooms: parseInt(match[2] ?? "1"), cleaningsCount: durations.length, avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length), p75Duration: calculatePercentile(durations, 75) });
    });
    allGlobalStats.sort((a, b) => a.bedrooms !== b.bedrooms ? a.bedrooms - b.bedrooms : a.bathrooms - b.bathrooms);

    let comparison = null;
    if (propertyStats && globalStats) { const diff = propertyStats.avgDuration - globalStats.avgDuration; comparison = { diff, status: diff < -5 ? "faster" : diff > 5 ? "slower" : "same" }; }

    return NextResponse.json({ success: true, property: propertyStats, globalForSize: globalStats, allGlobalStats, comparison, message: propertyStats ? `Statistiche basate su ${propertyStats.cleaningsCount} pulizie` : "Nessuna pulizia completata per questa proprietà" });
  } catch (error) {
    return NextResponse.json({ error: "Errore nel calcolo delle statistiche", details: error instanceof Error ? error.message : "Errore sconosciuto" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Solo admin può aggiornare" }, { status: 403 });
    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { propertyId, recalculateAll = false } = body;
    if (!propertyId && !recalculateAll) return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });

    const propertiesSnap = await adminDb.collection("properties").get();
    const propertiesMap = new Map<string, { id: string; bedrooms: number; bathrooms: number; name: string }>();
    propertiesSnap.docs.forEach(d => { const data = d.data() as Record<string, any>; propertiesMap.set(d.id, { id: d.id, bedrooms: data.bedrooms || 1, bathrooms: data.bathrooms || 1, name: data.name || "Proprietà" }); });

    const cleaningsSnap = await getCompletedCleanings();
    const completedStatuses = ["COMPLETED", "completed", "VERIFIED", "verified"];
    const durationsByProperty: Map<string, number[]> = new Map();
    cleaningsSnap.docs.forEach(d => {
      const data = d.data() as Record<string, any>;
      if (!completedStatuses.includes(data.status) || !data.startedAt || !data.completedAt) return;
      try {
        const startedAt = data.startedAt.toDate?.() ?? new Date(data.startedAt);
        const completedAt = data.completedAt.toDate?.() ?? new Date(data.completedAt);
        const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);
        if (durationMinutes < 15 || durationMinutes > 480) return;
        if (!durationsByProperty.has(data.propertyId)) durationsByProperty.set(data.propertyId, []);
        durationsByProperty.get(data.propertyId)!.push(durationMinutes);
      } catch { return; }
    });

    const updates: string[] = [];
    const now = Timestamp.now();
    const propertiesToUpdate = recalculateAll ? Array.from(propertiesMap.keys()) : [propertyId];
    for (const propId of propertiesToUpdate) {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
      const durations = durationsByProperty.get(propId) || [];
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
      const propData = propertiesMap.get(propId);
      if (propData && durations.length > 0) {
        const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
        const p75Duration = calculatePercentile(durations, 75);
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
        await adminDb.collection("properties").doc(propId).update({ avgCleaningDuration: avgDuration, p75CleaningDuration: p75Duration, cleaningDurationSamples: durations.length, cleaningDurationUpdatedAt: now, updatedAt: now });
        updates.push(`${propData.name}: ${avgDuration} min (media), ${p75Duration} min (P75) da ${durations.length} pulizie`);
      }
    }

    return NextResponse.json({ success: true, updatesApplied: updates.length, updates });
  } catch (error) {
    return NextResponse.json({ error: "Errore nell'aggiornamento", details: error instanceof Error ? error.message : "Errore sconosciuto" }, { status: 500 });
  }
}
