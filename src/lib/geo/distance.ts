/**
 * Calcolo distanza geografica usando la formula di Haversine
 * 
 * Questa formula calcola la distanza in linea d'aria tra due punti
 * sulla superficie terrestre, dati latitudine e longitudine.
 * 
 * È una formula matematica pura, non richiede API esterne.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Converte gradi in radianti
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calcola la distanza in km tra due punti usando la formula di Haversine
 * 
 * @param coord1 - Coordinate del primo punto
 * @param coord2 - Coordinate del secondo punto
 * @returns Distanza in chilometri
 */
export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371; // Raggio della Terra in km

  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLng = toRadians(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) *
    Math.cos(toRadians(coord2.lat)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distanza in km
}

/**
 * Calcola il punteggio di prossimità basato sulla distanza
 * 
 * @param distanceKm - Distanza in chilometri
 * @returns Punteggio da 0 a 30
 */
export function getDistanceScore(distanceKm: number): number {
  if (distanceKm < 0.5) return 30;   // < 500m = Vicinissimo
  if (distanceKm < 1) return 27;     // < 1km = Molto vicino
  if (distanceKm < 1.5) return 24;   // < 1.5km = Vicino
  if (distanceKm < 2) return 21;     // < 2km = Abbastanza vicino
  if (distanceKm < 3) return 18;     // < 3km = Raggiungibile facilmente
  if (distanceKm < 4) return 15;     // < 4km = Raggiungibile
  if (distanceKm < 5) return 12;     // < 5km = Media distanza
  if (distanceKm < 7) return 9;      // < 7km = Lontanuccio
  if (distanceKm < 10) return 6;     // < 10km = Lontano
  if (distanceKm < 15) return 3;     // < 15km = Molto lontano
  return 0;                           // > 15km = Troppo lontano
}

/**
 * Restituisce una descrizione testuale della distanza
 */
export function getDistanceLabel(distanceKm: number): string {
  if (distanceKm < 0.5) return "Vicinissimo";
  if (distanceKm < 1) return "Molto vicino";
  if (distanceKm < 2) return "Vicino";
  if (distanceKm < 3) return "Raggiungibile";
  if (distanceKm < 5) return "Media distanza";
  if (distanceKm < 10) return "Lontano";
  return "Molto lontano";
}

/**
 * Formatta la distanza per la visualizzazione
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Stima il tempo di percorrenza in minuti
 * Assume velocità media di 25 km/h in città (traffico, semafori, etc.)
 */
export function estimateTravelTime(distanceKm: number): number {
  const avgSpeedKmh = 25; // Velocità media in città
  const timeHours = distanceKm / avgSpeedKmh;
  return Math.ceil(timeHours * 60); // Ritorna minuti, arrotondato per eccesso
}

/**
 * Formatta il tempo di percorrenza stimato
 */
export function formatTravelTime(distanceKm: number): string {
  const minutes = estimateTravelTime(distanceKm);
  if (minutes < 60) {
    return `~${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `~${hours}h ${remainingMinutes}min`;
}
