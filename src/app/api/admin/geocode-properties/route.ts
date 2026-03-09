import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { searchAddress } from "~/lib/geo";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

function buildSearchAddress(address: string | null, city: string | null, postalCode: string | null): string {
  if (!address) return "";
  const addressLower = address.toLowerCase();
  const hasCity = city && addressLower.includes(city.toLowerCase());
  const hasPostalCode = /\b\d{5}\b/.test(address);
  if (hasCity && hasPostalCode) return `${address}, Italia`;
  const parts = [address];
  if (postalCode && !hasPostalCode) parts.push(postalCode);
  if (city && !hasCity) parts.push(city);
  parts.push("Italia");
  return parts.join(", ");
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { dryRun = false, limit = 50 } = body;

    const snapshot = await adminDb.collection("properties").get();
    const results: any = { total: snapshot.docs.length, alreadyGeocoded: 0, geocoded: 0, failed: 0, skipped: 0, details: [] };

    let processed = 0;
    for (const docSnap of snapshot.docs) {
      if (processed >= limit) { results.skipped = snapshot.docs.length - processed - results.alreadyGeocoded; break; }
      const data = docSnap.data() as Record<string, any>;
      const propertyId = docSnap.id; const propertyName = data.name || "Senza nome";
      if (data.coordinates?.lat && data.coordinates?.lng) { results.alreadyGeocoded++; continue; }
      if (!data.address) { results.failed++; results.details.push({ id: propertyId, name: propertyName, address: "", searchQuery: "", status: "failed", error: "Indirizzo mancante" }); processed++; continue; }

      const searchQuery = buildSearchAddress(data.address, data.city, data.postalCode);
      try {
        let searchResults = await searchAddress(searchQuery, { limit: 1, countryCode: "it", lang: "it" });
        if (searchResults.length === 0) {
          const simpleParts = data.address.split(",").slice(0, 2).join(",").trim();
          searchResults = await searchAddress(`${simpleParts}, ${data.city || "Roma"}, Italia`, { limit: 1, countryCode: "it", lang: "it" });
        }
        if (searchResults.length === 0) {
          const viaOnly = data.address.split(",")[0].trim();
          searchResults = await searchAddress(`${viaOnly}, Roma, Italia`, { limit: 1, countryCode: "it", lang: "it" });
        }
        if (searchResults.length === 0) { results.failed++; results.details.push({ id: propertyId, name: propertyName, address: data.address, searchQuery, status: "failed", error: "Nessun risultato trovato" }); processed++; continue; }

        const result = searchResults[0]; const coordinates = result.coordinates;
        if (!dryRun) {
          await adminDb.collection("properties").doc(propertyId).update({ coordinates, coordinatesVerified: result.confidence === "high", coordinatesSource: "geocode-script-v2", coordinatesUpdatedAt: Timestamp.now() });
        }
        results.geocoded++; results.details.push({ id: propertyId, name: propertyName, address: data.address, searchQuery, status: "success", coordinates });
        await sleep(400);
      } catch (error: any) {
        results.failed++; results.details.push({ id: propertyId, name: propertyName, address: data.address, searchQuery, status: "failed", error: error.message });
      }
      processed++;
    }

    return NextResponse.json({ success: true, dryRun, ...results });
  } catch (error: any) {
    console.error("❌ Errore geocodifica:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const snapshot = await adminDb.collection("properties").get();
    let withCoordinates = 0, withoutCoordinates = 0;
    const missingList: Array<{ id: string; name: string; address: string }> = [];

    snapshot.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      if (data.coordinates?.lat && data.coordinates?.lng) { withCoordinates++; }
      else { withoutCoordinates++; missingList.push({ id: doc.id, name: data.name || "Senza nome", address: `${data.address || ""}, ${data.city || ""}`.trim() }); }
    });

    return NextResponse.json({ total: snapshot.docs.length, withCoordinates, withoutCoordinates, percentageComplete: Math.round((withCoordinates / snapshot.docs.length) * 100), missingCoordinates: missingList.slice(0, 20) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
