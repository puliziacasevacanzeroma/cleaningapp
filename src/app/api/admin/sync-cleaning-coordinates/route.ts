/**
 * API per aggiornare le coordinate nelle pulizie esistenti
 * 
 * Questo script prende le coordinate dalle proprietà e le copia
 * nelle pulizie che non le hanno ancora
 * 
 * POST /api/admin/sync-cleaning-coordinates
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc,
  query,
  where,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

export async function POST(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { dryRun = false } = body;

    console.log(`\n🔄 Sincronizzazione coordinate pulizie (dryRun: ${dryRun})`);

    // 1. Carica tutte le proprietà con coordinate
    const propertiesRef = collection(db, "properties");
    const propertiesSnapshot = await getDocs(propertiesRef);
    
    const propertiesMap = new Map<string, { lat: number; lng: number } | null>();
    let propertiesWithCoords = 0;
    
    propertiesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.coordinates?.lat && data.coordinates?.lng) {
        propertiesMap.set(doc.id, data.coordinates);
        propertiesWithCoords++;
      } else {
        propertiesMap.set(doc.id, null);
      }
    });

    console.log(`📍 Proprietà con coordinate: ${propertiesWithCoords}/${propertiesSnapshot.docs.length}`);

    // 2. Carica tutte le pulizie SCHEDULED o ASSIGNED (non completate/cancellate)
    const cleaningsRef = collection(db, "cleanings");
    const cleaningsSnapshot = await getDocs(cleaningsRef);

    const results = {
      totalCleanings: cleaningsSnapshot.docs.length,
      alreadyHaveCoordinates: 0,
      updated: 0,
      noPropertyCoordinates: 0,
      noPropertyId: 0,
      details: [] as Array<{
        cleaningId: string;
        propertyName: string;
        status: "already" | "updated" | "no-coords" | "no-property";
      }>,
    };

    // Batch per aggiornamenti efficienti
    let batch = writeBatch(db);
    let batchCount = 0;
    const BATCH_SIZE = 400; // Firebase limit è 500

    for (const cleaningDoc of cleaningsSnapshot.docs) {
      const data = cleaningDoc.data();
      const cleaningId = cleaningDoc.id;
      const propertyName = data.propertyName || "Sconosciuta";

      // Se ha già coordinate, salta
      if (data.propertyCoordinates?.lat && data.propertyCoordinates?.lng) {
        results.alreadyHaveCoordinates++;
        results.details.push({
          cleaningId,
          propertyName,
          status: "already",
        });
        continue;
      }

      // Se non ha propertyId, salta
      if (!data.propertyId) {
        results.noPropertyId++;
        results.details.push({
          cleaningId,
          propertyName,
          status: "no-property",
        });
        continue;
      }

      // Cerca coordinate della proprietà
      const propertyCoords = propertiesMap.get(data.propertyId);

      if (!propertyCoords) {
        results.noPropertyCoordinates++;
        results.details.push({
          cleaningId,
          propertyName,
          status: "no-coords",
        });
        continue;
      }

      // Aggiorna pulizia con coordinate
      if (!dryRun) {
        const cleaningRef = doc(db, "cleanings", cleaningId);
        batch.update(cleaningRef, {
          propertyCoordinates: propertyCoords,
          coordinatesSyncedAt: Timestamp.now(),
        });
        batchCount++;

        // Commit batch se raggiunge il limite
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`   💾 Batch committato: ${batchCount} documenti`);
          batch = writeBatch(db);
          batchCount = 0;
        }
      }

      results.updated++;
      results.details.push({
        cleaningId,
        propertyName,
        status: "updated",
      });
    }

    // Commit batch finale
    if (!dryRun && batchCount > 0) {
      await batch.commit();
      console.log(`   💾 Batch finale committato: ${batchCount} documenti`);
    }

    console.log(`\n📊 Riepilogo:`);
    console.log(`   Totale pulizie: ${results.totalCleanings}`);
    console.log(`   Già con coordinate: ${results.alreadyHaveCoordinates}`);
    console.log(`   Aggiornate: ${results.updated}`);
    console.log(`   Proprietà senza coordinate: ${results.noPropertyCoordinates}`);
    console.log(`   Senza propertyId: ${results.noPropertyId}`);

    return NextResponse.json({
      success: true,
      dryRun,
      ...results,
      // Non ritornare tutti i details per pulizie (troppi)
      details: results.details.slice(0, 50),
    });

  } catch (error: any) {
    console.error("❌ Errore sync coordinate:", error);
    return NextResponse.json(
      { error: error.message || "Errore server" },
      { status: 500 }
    );
  }
}

// GET per vedere lo stato attuale
export async function GET(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Conta pulizie
    const cleaningsRef = collection(db, "cleanings");
    const snapshot = await getDocs(cleaningsRef);

    let withCoordinates = 0;
    let withoutCoordinates = 0;
    let scheduled = 0;
    let assigned = 0;

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      
      if (data.status === "SCHEDULED") scheduled++;
      if (data.status === "ASSIGNED") assigned++;
      
      if (data.propertyCoordinates?.lat && data.propertyCoordinates?.lng) {
        withCoordinates++;
      } else {
        withoutCoordinates++;
      }
    });

    return NextResponse.json({
      totalCleanings: snapshot.docs.length,
      withCoordinates,
      withoutCoordinates,
      percentageComplete: Math.round((withCoordinates / snapshot.docs.length) * 100) || 0,
      scheduled,
      assigned,
    });

  } catch (error: any) {
    console.error("❌ Errore:", error);
    return NextResponse.json(
      { error: error.message || "Errore server" },
      { status: 500 }
    );
  }
}
