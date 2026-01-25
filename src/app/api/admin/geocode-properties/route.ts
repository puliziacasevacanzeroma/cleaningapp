/**
 * API per geocodificare tutte le proprietà esistenti
 * 
 * Questo script cerca tutte le proprietà senza coordinate
 * e le geocodifica usando Photon/Nominatim
 * 
 * POST /api/admin/geocode-properties
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
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { searchAddress } from "~/lib/geo";

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 secondi max

// Helper per ottenere utente
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

// Funzione per attendere (evita rate limiting)
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { dryRun = false, limit = 50 } = body;

    console.log(`\n🗺️ Inizio geocodifica proprietà (dryRun: ${dryRun}, limit: ${limit})`);

    // Carica tutte le proprietà
    const propertiesRef = collection(db, "properties");
    const snapshot = await getDocs(propertiesRef);

    const results = {
      total: snapshot.docs.length,
      alreadyGeocoded: 0,
      geocoded: 0,
      failed: 0,
      skipped: 0,
      details: [] as Array<{
        id: string;
        name: string;
        address: string;
        status: "already" | "success" | "failed" | "skipped";
        coordinates?: { lat: number; lng: number };
        error?: string;
      }>,
    };

    let processed = 0;

    for (const docSnap of snapshot.docs) {
      if (processed >= limit) {
        results.skipped = snapshot.docs.length - processed;
        break;
      }

      const data = docSnap.data();
      const propertyId = docSnap.id;
      const propertyName = data.name || "Senza nome";
      
      // Costruisci indirizzo completo
      const addressParts = [
        data.address,
        data.city,
        data.postalCode,
        "Italia"
      ].filter(Boolean);
      
      const fullAddress = addressParts.join(", ");

      // Se ha già coordinate, salta
      if (data.coordinates?.lat && data.coordinates?.lng) {
        results.alreadyGeocoded++;
        results.details.push({
          id: propertyId,
          name: propertyName,
          address: fullAddress,
          status: "already",
          coordinates: data.coordinates,
        });
        processed++;
        continue;
      }

      // Se non ha indirizzo, salta
      if (!data.address || !data.city) {
        results.failed++;
        results.details.push({
          id: propertyId,
          name: propertyName,
          address: fullAddress,
          status: "failed",
          error: "Indirizzo o città mancante",
        });
        processed++;
        continue;
      }

      console.log(`\n📍 Geocodifica: ${propertyName}`);
      console.log(`   Indirizzo: ${fullAddress}`);

      try {
        // Cerca indirizzo
        const searchResults = await searchAddress(fullAddress, {
          limit: 1,
          countryCode: "it",
          lang: "it",
        });

        if (searchResults.length === 0) {
          // Prova con solo indirizzo e città
          const simpleAddress = `${data.address}, ${data.city}`;
          const simpleResults = await searchAddress(simpleAddress, {
            limit: 1,
            countryCode: "it",
            lang: "it",
          });

          if (simpleResults.length === 0) {
            results.failed++;
            results.details.push({
              id: propertyId,
              name: propertyName,
              address: fullAddress,
              status: "failed",
              error: "Nessun risultato trovato",
            });
            processed++;
            continue;
          }

          // Usa risultato semplificato
          searchResults.push(simpleResults[0]);
        }

        const result = searchResults[0];
        const coordinates = result.coordinates;

        console.log(`   ✅ Trovato: ${result.fullAddress}`);
        console.log(`   📍 Coordinate: ${coordinates.lat}, ${coordinates.lng}`);
        console.log(`   🎯 Confidenza: ${result.confidence}`);

        if (!dryRun) {
          // Aggiorna proprietà con coordinate
          const propertyRef = doc(db, "properties", propertyId);
          await updateDoc(propertyRef, {
            coordinates,
            coordinatesVerified: result.confidence === "high",
            coordinatesSource: "geocode-script",
            coordinatesUpdatedAt: Timestamp.now(),
          });
          console.log(`   💾 Salvato!`);
        }

        results.geocoded++;
        results.details.push({
          id: propertyId,
          name: propertyName,
          address: fullAddress,
          status: "success",
          coordinates,
        });

        // Attendi 500ms tra le richieste (rispetta rate limit Photon)
        await sleep(500);

      } catch (error: any) {
        console.error(`   ❌ Errore: ${error.message}`);
        results.failed++;
        results.details.push({
          id: propertyId,
          name: propertyName,
          address: fullAddress,
          status: "failed",
          error: error.message,
        });
      }

      processed++;
    }

    console.log(`\n📊 Riepilogo:`);
    console.log(`   Totale: ${results.total}`);
    console.log(`   Già geocodificate: ${results.alreadyGeocoded}`);
    console.log(`   Geocodificate ora: ${results.geocoded}`);
    console.log(`   Fallite: ${results.failed}`);
    console.log(`   Saltate (limit): ${results.skipped}`);

    return NextResponse.json({
      success: true,
      dryRun,
      ...results,
    });

  } catch (error: any) {
    console.error("❌ Errore geocodifica:", error);
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

    // Conta proprietà
    const propertiesRef = collection(db, "properties");
    const snapshot = await getDocs(propertiesRef);

    let withCoordinates = 0;
    let withoutCoordinates = 0;
    const missingList: Array<{ id: string; name: string; address: string }> = [];

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.coordinates?.lat && data.coordinates?.lng) {
        withCoordinates++;
      } else {
        withoutCoordinates++;
        missingList.push({
          id: doc.id,
          name: data.name || "Senza nome",
          address: `${data.address || ""}, ${data.city || ""}`.trim(),
        });
      }
    });

    return NextResponse.json({
      total: snapshot.docs.length,
      withCoordinates,
      withoutCoordinates,
      percentageComplete: Math.round((withCoordinates / snapshot.docs.length) * 100),
      missingCoordinates: missingList.slice(0, 20), // Prime 20
    });

  } catch (error: any) {
    console.error("❌ Errore:", error);
    return NextResponse.json(
      { error: error.message || "Errore server" },
      { status: 500 }
    );
  }
}
