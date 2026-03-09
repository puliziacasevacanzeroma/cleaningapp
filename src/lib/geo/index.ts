/**
 * Modulo Geo - Funzioni geografiche per CleaningApp
 * 
 * Esporta:
 * - Calcolo distanze (Haversine)
 * - Geocoding (Photon + Nominatim)
 * - Utility per formattazione
 */

// Distanze
export {
  calculateDistance,
  calculateRealDistance,
  getDistanceScore,
  getDistanceLabel,
  formatDistance,
  estimateTravelTime,
  formatTravelTime,
  type Coordinates,
  type RouteResult,
} from "./distance";

// Geocoding
export {
  searchAddress,
  searchPhoton,
  searchNominatim,
  geocodeAddress,
  reverseGeocode,
  type AddressResult,
  type SearchOptions,
} from "./geocode";
