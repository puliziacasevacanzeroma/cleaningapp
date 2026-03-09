import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { dryRun = false } = body;

    const propertiesSnapshot = await adminDb.collection("properties").get();
    const propertiesMap = new Map<string, { lat: number; lng: number } | null>();
    propertiesSnapshot.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      propertiesMap.set(doc.id, (data.coordinates?.lat && data.coordinates?.lng) ? data.coordinates : null);
    });

    const cleaningsSnapshot = await adminDb.collection("cleanings").get();
    const results: any = { totalCleanings: cleaningsSnapshot.docs.length, alreadyHaveCoordinates: 0, updated: 0, noPropertyCoordinates: 0, noPropertyId: 0, details: [] };

    const BATCH_SIZE = 400;
    let batch = adminDb.batch();
    let batchCount = 0;

    for (const cleaningDoc of cleaningsSnapshot.docs) {
      const data = cleaningDoc.data() as Record<string, any>;
      const cleaningId = cleaningDoc.id;
      const propertyName = data.propertyName || "Sconosciuta";

      if (data.propertyCoordinates?.lat && data.propertyCoordinates?.lng) { results.alreadyHaveCoordinates++; results.details.push({ cleaningId, propertyName, status: "already" }); continue; }
      if (!data.propertyId) { results.noPropertyId++; results.details.push({ cleaningId, propertyName, status: "no-property" }); continue; }

      const propertyCoords = propertiesMap.get(data.propertyId);
      if (!propertyCoords) { results.noPropertyCoordinates++; results.details.push({ cleaningId, propertyName, status: "no-coords" }); continue; }

      if (!dryRun) {
        batch.update(adminDb.collection("cleanings").doc(cleaningId), { propertyCoordinates: propertyCoords, coordinatesSyncedAt: Timestamp.now() });
        batchCount++;
        if (batchCount >= BATCH_SIZE) { await batch.commit(); batch = adminDb.batch(); batchCount = 0; }
      }
      results.updated++;
      results.details.push({ cleaningId, propertyName, status: "updated" });
    }

    if (!dryRun && batchCount > 0) await batch.commit();

    return NextResponse.json({ success: true, dryRun, ...results, details: results.details.slice(0, 50) });
  } catch (error: any) {
    console.error("❌ Errore sync coordinate:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const snapshot = await adminDb.collection("cleanings").get();
    let withCoordinates = 0, withoutCoordinates = 0, scheduled = 0, assigned = 0;
    snapshot.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      if (data.status === "SCHEDULED") scheduled++;
      if (data.status === "ASSIGNED") assigned++;
      if (data.propertyCoordinates?.lat && data.propertyCoordinates?.lng) withCoordinates++; else withoutCoordinates++;
    });

    return NextResponse.json({ totalCleanings: snapshot.docs.length, withCoordinates, withoutCoordinates, percentageComplete: Math.round((withCoordinates / snapshot.docs.length) * 100) || 0, scheduled, assigned });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
