/**
 * Servizi di Geocoding gratuiti
 * 
 * Utilizza Photon (Komoot) come principale e Nominatim come fallback.
 * Entrambi sono basati su OpenStreetMap e sono completamente gratuiti.
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
  countryCode?: string; // es: "it" per Italia
  lang?: string;        // es: "it" per italiano
}

// ═══════════════════════════════════════════════════════════════
// PHOTON API (Komoot) - Principale
// Ottimizzato per autocomplete, veloce, nessun limite stretto
// ═══════════════════════════════════════════════════════════════

interface PhotonFeature {
  geometry: {
    coordinates: [number, number]; // [lng, lat]
  };
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
    // Aggiungi "Italia" se non presente per risultati migliori
    const searchQuery = query.toLowerCase().includes("italia") 
      ? query 
      : `${query}, Italia`;

    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", searchQuery);
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("lang", lang);
    // Filtra per indirizzi (no POI generici)
    url.searchParams.set("osm_tag", "place:house");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "CleaningApp/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Photon API error: ${response.status}`);
    }

    const data: PhotonResponse = await response.json();

    return data.features.map((feature) => {
      const props = feature.properties;
      const [lng, lat] = feature.geometry.coordinates;

      // Costruisci indirizzo completo
      const parts = [
        props.street,
        props.housenumber,
        props.postcode,
        props.city,
        props.country,
      ].filter(Boolean);

      return {
        fullAddress: parts.join(", ") || props.name || query,
        street: props.street || "",
        houseNumber: props.housenumber || "",
        city: props.city || "",
        postalCode: props.postcode || "",
        country: props.country || "Italia",
        coordinates: { lat, lng },
        confidence: props.housenumber && props.street ? "high" : "medium",
      };
    });
  } catch (error) {
    console.error("Errore Photon API:", error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// NOMINATIM API (OpenStreetMap) - Fallback
// Più preciso ma con limite di 1 req/sec
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
    postcode?: string;
    country?: string;
    state?: string;
  };
  importance: number;
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
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("countrycodes", countryCode);
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "CleaningApp/1.0 (cleaning app for property management)",
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data: NominatimResult[] = await response.json();

    return data.map((result) => {
      const addr = result.address;
      const city = addr.city || addr.town || addr.village || "";

      // Costruisci indirizzo completo
      const parts = [
        addr.road,
        addr.house_number,
        addr.postcode,
        city,
        addr.country,
      ].filter(Boolean);

      return {
        fullAddress: parts.join(", ") || result.display_name,
        street: addr.road || "",
        houseNumber: addr.house_number || "",
        city,
        postalCode: addr.postcode || "",
        country: addr.country || "Italia",
        coordinates: {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
        },
        confidence: result.importance > 0.5 ? "high" : result.importance > 0.3 ? "medium" : "low",
      };
    });
  } catch (error) {
    console.error("Errore Nominatim API:", error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// FUNZIONE PRINCIPALE - Con fallback automatico
// ═══════════════════════════════════════════════════════════════

/**
 * Cerca indirizzi usando Photon come principale e Nominatim come fallback
 */
export async function searchAddress(
  query: string,
  options: SearchOptions = {}
): Promise<AddressResult[]> {
  if (!query || query.trim().length < 3) {
    return [];
  }

  // Prova prima con Photon (più veloce)
  let results = await searchPhoton(query, options);

  // Se Photon non trova nulla, prova Nominatim
  if (results.length === 0) {
    console.log("Photon nessun risultato, provo Nominatim...");
    results = await searchNominatim(query, options);
  }

  return results;
}

/**
 * Geocodifica un singolo indirizzo e ritorna le coordinate
 * Utile per geocodificare indirizzi esistenti senza autocomplete
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
      headers: {
        "User-Agent": "CleaningApp/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Reverse geocoding error: ${response.status}`);
    }

    const data: NominatimResult = await response.json();
    const addr = data.address;
    const city = addr.city || addr.town || addr.village || "";

    const parts = [
      addr.road,
      addr.house_number,
      addr.postcode,
      city,
    ].filter(Boolean);

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
