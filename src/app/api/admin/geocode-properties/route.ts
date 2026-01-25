/**
 * API per geocodificare tutte le proprietà esistenti
 * FIX: Gestisce indirizzi che già contengono città e CAP
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
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { searchAddress } from "~/lib/geo";

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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pulisce l'indirizzo rimuovendo duplicati di città
 * Es: "Via Roma 1, Roma, 00184" + city="Roma" → "Via Roma 1, 00184, Roma"
 */
function buildSearchAddress(address: string | null, city: string | null, postalCode: string | null): string {
  if (!address) return "";
  
  // Se l'indirizzo già contiene la città E un CAP, usalo direttamente
  const addressLower = address.toLowerCase();
  const hasCity = city && addressLower.includes(city.toLowerCase());
  const hasPostalCode = /\b\d{5}\b/.test(address); // CAP italiano 5 cifre
  
  if (hasCity && hasPostalCode) {
    // L'indirizzo è già completo, aggiungi solo Italia
    return `${address}, Italia`;
  }
  
  // Altrimenti costruisci l'indirizzo
  const parts = [address];
  
  // Aggiungi CAP se non presente
  if (postalCode && !hasPostalCode) {
    parts.push(postalCode);
  }
  
  // Aggiungi città se non presente
  if (city && !hasCity) {
    parts.push(city);
  }
  
  parts.push("Italia");
  
  return parts.join(", ");
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
        searchQuery: string;
        status: "already" | "success" | "failed" | "skipped";
        coordinates?: { lat: number; lng: number };
        error?: string;
      }>,
    };

    let processed = 0;

    for (const docSnap of snapshot.docs) {
      if (processed >= limit) {
        results.skipped = snapshot.docs.length - processed - results.alreadyGeocoded;
        break;
      }

      const data = docSnap.data();
      const propertyId = docSnap.id;
      const propertyName = data.name || "Senza nome";

      // Se ha già coordinate, salta
      if (data.coordinates?.lat && data.coordinates?.lng) {
        results.alreadyGeocoded++;
        continue;
      }

      // Se non ha indirizzo, salta
      if (!data.address) {
        results.failed++;
        results.details.push({
          id: propertyId,
          name: propertyName,
          address: "",
          searchQuery: "",
          status: "failed",
          error: "Indirizzo mancante",
        });
        processed++;
        continue;
      }

      // Costruisci indirizzo di ricerca pulito
      const searchQuery = buildSearchAddress(data.address, data.city, data.postalCode);

      console.log(`\n📍 ${propertyName}`);
      console.log(`   Originale: ${data.address}`);
      console.log(`   Ricerca: ${searchQuery}`);

      try {
        // Prima prova: indirizzo completo
        let searchResults = await searchAddress(searchQuery, {
          limit: 1,
          countryCode: "it",
          lang: "it",
        });

        // Se non trova, prova solo via + civico + città
        if (searchResults.length === 0) {
          // Estrai solo la prima parte dell'indirizzo (via + numero)
          const simpleParts = data.address.split(",").slice(0, 2).join(",").trim();
          const simpleQuery = `${simpleParts}, ${data.city || "Roma"}, Italia`;
          
          console.log(`   Retry semplice: ${simpleQuery}`);
          
          searchResults = await searchAddress(simpleQuery, {
            limit: 1,
            countryCode: "it",
            lang: "it",
          });
        }

        // Se ancora non trova, prova SOLO la via
        if (searchResults.length === 0) {
          const viaOnly = data.address.split(",")[0].trim();
          const viaQuery = `${viaOnly}, Roma, Italia`;
          
          console.log(`   Retry solo via: ${viaQuery}`);
          
          searchResults = await searchAddress(viaQuery, {
            limit: 1,
            countryCode: "it",
            lang: "it",
          });
        }

        if (searchResults.length === 0) {
          results.failed++;
          results.details.push({
            id: propertyId,
            name: propertyName,
            address: data.address,
            searchQuery,
            status: "failed",
            error: "Nessun risultato trovato",
          });
          processed++;
          continue;
        }

        const result = searchResults[0];
        const coordinates = result.coordinates;

        console.log(`   ✅ Trovato: ${result.fullAddress}`);
        console.log(`   📍 Coordinate: ${coordinates.lat}, ${coordinates.lng}`);

        if (!dryRun) {
          const propertyRef = doc(db, "properties", propertyId);
          await updateDoc(propertyRef, {
            coordinates,
            coordinatesVerified: result.confidence === "high",
            coordinatesSource: "geocode-script-v2",
            coordinatesUpdatedAt: Timestamp.now(),
          });
        }

        results.geocoded++;
        results.details.push({
          id: propertyId,
          name: propertyName,
          address: data.address,
          searchQuery,
          status: "success",
          coordinates,
        });

        // Rate limit
        await sleep(400);

      } catch (error: any) {
        console.error(`   ❌ Errore: ${error.message}`);
        results.failed++;
        results.details.push({
          id: propertyId,
          name: propertyName,
          address: data.address,
          searchQuery,
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
      missingCoordinates: missingList.slice(0, 20),
    });

  } catch (error: any) {
    console.error("❌ Errore:", error);
    return NextResponse.json(
      { error: error.message || "Errore server" },
      { status: 500 }
    );
  }
}
