/**
 * Servizi di Geocoding gratuiti — v2 ottimizzato per Italia
 * 
 * Strategia: ricerca PARALLELA su Nominatim + Photon, merge risultati.
 * Nominatim è più preciso per indirizzi italiani (civici inclusi).
 * Photon è più veloce per autocomplete.
 * Entrambi basati su OpenStreetMap, completamente gratuiti.
 */

import type { Coordinates } from "./distance";

// ═══════════════════════════════════════════════════════════════
// TIPI
// ═══════════════════════════════════════════════════════════════

export interface AddressResult {
  fullAddress: string;
  street: string;
  houseNumber: string;
  city: string;
  postalCode: string;
  country: string;
  coordinates: Coordinates;
  confidence: "high" | "medium" | "low";
}

export interface SearchOptions {
  limit?: number;
  countryCode?: string;
  lang?: string;
}

// ═══════════════════════════════════════════════════════════════
// PHOTON API (Komoot) — Veloce, buono per autocomplete
// ═══════════════════════════════════════════════════════════════

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    postcode?: string;
    country?: string;
    state?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

export async function searchPhoton(
  query: string,
  options: SearchOptions = {}
): Promise<AddressResult[]> {
  const { limit = 5, lang = "it" } = options;

  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit + 3));
    url.searchParams.set("lang", lang);
    // Bias geografico verso centro Italia (Roma)
    url.searchParams.set("lat", "41.9");
    url.searchParams.set("lon", "12.5");
    // NESSUN filtro osm_tag — prima usava place:house che escludeva quasi tutto

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": "CleaningApp/2.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Photon ${response.status}`);

    const data: PhotonResponse = await response.json();

    return data.features
      .filter((f) => {
        const country = f.properties.country?.toLowerCase() || "";
        if (country && !country.includes("ital")) return false;
        const type = f.properties.osm_value || "";
        if (["country", "state", "continent"].includes(type)) return false;
        return true;
      })
      .slice(0, limit)
      .map((feature) => {
        const props = feature.properties;
        const [lng, lat] = feature.geometry.coordinates;
        const street = props.street || props.name || "";
        const houseNumber = props.housenumber || "";

        const parts = [
          street + (houseNumber ? " " + houseNumber : ""),
          props.postcode,
          props.city,
        ].filter(Boolean);

        const hasStreet = !!props.street;
        const hasNumber = !!props.housenumber;

        return {
          fullAddress: parts.join(", ") || props.name || query,
          street,
          houseNumber,
          city: props.city || "",
          postalCode: props.postcode || "",
          country: props.country || "Italia",
          coordinates: { lat, lng },
          confidence: (hasStreet && hasNumber ? "high" : hasStreet ? "medium" : "low") as "high" | "medium" | "low",
        };
      });
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      console.error("Errore Photon API:", error);
    }
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// NOMINATIM API (OpenStreetMap) — Più preciso per civici italiani
// ═══════════════════════════════════════════════════════════════

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    postcode?: string;
    country?: string;
    state?: string;
    suburb?: string;
    neighbourhood?: string;
  };
  importance: number;
  type?: string;
  class?: string;
}

export async function searchNominatim(
  query: string,
  options: SearchOptions = {}
): Promise<AddressResult[]> {
  const { limit = 5, countryCode = "it" } = options;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit + 2));
    url.searchParams.set("countrycodes", countryCode);
    url.searchParams.set("addressdetails", "1");
    // Viewbox centrato sull'Italia per risultati più rilevanti
    url.searchParams.set("viewbox", "6.6,47.1,18.5,36.6");
    url.searchParams.set("bounded", "0");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "CleaningApp/2.0 (cleaning app for property management)",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Nominatim ${response.status}`);

    const data: NominatimResult[] = await response.json();

    return data.slice(0, limit).map((result) => {
      const addr = result.address;
      const city = addr.city || addr.town || addr.village || addr.municipality || "";
      const street = addr.road || "";
      const houseNumber = addr.house_number || "";

      const parts = [
        street + (houseNumber ? " " + houseNumber : ""),
        addr.postcode,
        city,
      ].filter(Boolean);

      const hasStreet = !!addr.road;
      const hasNumber = !!addr.house_number;

      return {
        fullAddress: parts.join(", ") || result.display_name,
        street,
        houseNumber,
        city,
        postalCode: addr.postcode || "",
        country: addr.country || "Italia",
        coordinates: {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
        },
        confidence: (hasStreet && hasNumber ? "high" : hasStreet ? "medium" : "low") as "high" | "medium" | "low",
      };
    });
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      console.error("Errore Nominatim API:", error);
    }
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// RICERCA STRUTTURATA — Per query con via e numero separati
// Nominatim è molto più preciso con parametri strutturati
// ═══════════════════════════════════════════════════════════════

async function searchNominatimStructured(
  query: string,
  options: SearchOptions = {}
): Promise<AddressResult[]> {
  const { limit = 5, countryCode = "it" } = options;

  // Parsa "Via/Viale/Piazza NomeVia NumCivico, Città"
  const match = query.match(
    /^(via|viale|piazza|vicolo|corso|largo|lungotevere|rampa|circonvallazione|piazzale)\s+(.+?)\s+(\d+[a-z]?(?:\/\d+)?)\s*[,.]?\s*(.+)?$/i
  );
  if (!match) return [];

  const streetType = match[1];
  const streetName = match[2].replace(/[,.]\s*$/, "").trim();
  const number = match[3];
  const cityPart = match[4]?.replace(/[,.]\s*$/, "").trim() || "";

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    // Nominatim vuole il formato "numero via nome" per il parametro street
    url.searchParams.set("street", `${number} ${streetType} ${streetName}`);
    if (cityPart) url.searchParams.set("city", cityPart);
    url.searchParams.set("country", "Italy");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("countrycodes", countryCode);
    url.searchParams.set("addressdetails", "1");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "CleaningApp/2.0 (cleaning app for property management)",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data: NominatimResult[] = await response.json();

    return data.slice(0, limit).map((result) => {
      const addr = result.address;
      const city = addr.city || addr.town || addr.village || addr.municipality || "";
      const street = addr.road || `${streetType} ${streetName}`;
      const houseNumber = addr.house_number || number;

      const parts = [
        street + " " + houseNumber,
        addr.postcode,
        city,
      ].filter(Boolean);

      return {
        fullAddress: parts.join(", ") || result.display_name,
        street,
        houseNumber,
        city,
        postalCode: addr.postcode || "",
        country: addr.country || "Italia",
        coordinates: {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
        },
        confidence: "high" as const,
      };
    });
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// DEDUPLICAZIONE
// ═══════════════════════════════════════════════════════════════

function deduplicateResults(results: AddressResult[]): AddressResult[] {
  const seen = new Map<string, AddressResult>();
  const rankConf = { high: 3, medium: 2, low: 1 };

  for (const r of results) {
    const key = [
      r.street.toLowerCase().replace(/\s+/g, " ").trim(),
      r.houseNumber.toLowerCase().trim(),
      r.city.toLowerCase().replace(/\s+/g, " ").trim(),
    ].join("|");

    const existing = seen.get(key);
    if (!existing || rankConf[r.confidence] > rankConf[existing.confidence]) {
      seen.set(key, r);
    }
  }

  return Array.from(seen.values());
}

// ═══════════════════════════════════════════════════════════════
// FUNZIONE PRINCIPALE — Ricerca parallela + merge + dedup
// ═══════════════════════════════════════════════════════════════

/**
 * Cerca indirizzi con strategia parallela:
 * 1. Lancia Nominatim (strutturata + libera) + Photon in parallelo
 * 2. Merge e deduplica risultati
 * 3. Ordina: alta confidence → con civico → con CAP
 */
export async function searchAddress(
  query: string,
  options: SearchOptions = {}
): Promise<AddressResult[]> {
  if (!query || query.trim().length < 3) {
    return [];
  }

  const cleanQuery = query.trim();

  // Lancia TUTTE le ricerche in parallelo — nessuna attesa sequenziale
  const [structuredResults, nominatimResults, photonResults] = await Promise.all([
    searchNominatimStructured(cleanQuery, options).catch(() => [] as AddressResult[]),
    searchNominatim(cleanQuery, options).catch(() => [] as AddressResult[]),
    searchPhoton(cleanQuery, options).catch(() => [] as AddressResult[]),
  ]);

  // Merge: strutturata ha priorità, poi Nominatim, poi Photon
  const allResults = [...structuredResults, ...nominatimResults, ...photonResults];

  // Deduplica
  const unique = deduplicateResults(allResults);

  // Ordina
  const rankConf = { high: 3, medium: 2, low: 1 };
  unique.sort((a, b) => {
    const confDiff = rankConf[b.confidence] - rankConf[a.confidence];
    if (confDiff !== 0) return confDiff;
    const numDiff = (b.houseNumber ? 1 : 0) - (a.houseNumber ? 1 : 0);
    if (numDiff !== 0) return numDiff;
    return (b.postalCode ? 1 : 0) - (a.postalCode ? 1 : 0);
  });

  return unique.slice(0, options.limit || 6);
}

/**
 * Geocodifica un singolo indirizzo e ritorna le coordinate
 */
export async function geocodeAddress(
  address: string
): Promise<{ coordinates: Coordinates; confidence: string } | null> {
  const results = await searchAddress(address, { limit: 1 });
  if (results.length > 0) {
    return {
      coordinates: results[0].coordinates,
      confidence: results[0].confidence,
    };
  }
  return null;
}

/**
 * Geocodifica inversa: da coordinate a indirizzo
 */
export async function reverseGeocode(
  coordinates: Coordinates
): Promise<AddressResult | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", coordinates.lat.toString());
    url.searchParams.set("lon", coordinates.lng.toString());
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": "CleaningApp/2.0" },
    });

    if (!response.ok) throw new Error(`Reverse geocoding error: ${response.status}`);

    const data: NominatimResult = await response.json();
    const addr = data.address;
    const city = addr.city || addr.town || addr.village || addr.municipality || "";

    const parts = [addr.road, addr.house_number, addr.postcode, city].filter(Boolean);

    return {
      fullAddress: parts.join(", ") || data.display_name,
      street: addr.road || "",
      houseNumber: addr.house_number || "",
      city,
      postalCode: addr.postcode || "",
      country: addr.country || "Italia",
      coordinates,
      confidence: "high",
    };
  } catch (error) {
    console.error("Errore reverse geocoding:", error);
    return null;
  }
}
