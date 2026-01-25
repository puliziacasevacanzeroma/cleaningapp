/**
 * Sistema di Assegnazione Intelligente
 * 
 * Calcola il punteggio di assegnazione per ogni operatore basandosi su:
 * 1. PROSSIMITÀ GEOGRAFICA (max 30 pt) - Distanza dalla pulizia precedente
 * 2. FAMILIARITÀ PROPRIETÀ (max 25 pt) - Ha già pulito questa casa?
 * 3. CARICO LAVORO (max 25 pt) - Quante pulizie ha già oggi?
 * 4. PERFORMANCE (max 20 pt) - Rating medio dell'operatore
 * 
 * Totale massimo: 100 punti
 */

import { 
  collection, 
  query, 
  where, 
  getDocs,
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { 
  calculateDistance, 
  getDistanceScore, 
  formatDistance,
  estimateTravelTime,
  type Coordinates 
} from "~/lib/geo";

// ═══════════════════════════════════════════════════════════════
// TIPI
// ═══════════════════════════════════════════════════════════════

export interface CleaningForAssignment {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  propertyCity?: string;
  propertyPostalCode?: string;
  coordinates?: Coordinates;
  scheduledDate: Date;
  scheduledTime?: string;
  estimatedDuration?: number;
}

export interface OperatorForAssignment {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  rating?: number; // 1-5, default 4.0
}

export interface ExistingAssignment {
  cleaningId: string;
  propertyId: string;
  propertyName: string;
  propertyAddress?: string;
  coordinates?: Coordinates;
  scheduledTime?: string;
  estimatedDuration?: number;
}

export interface ScoreBreakdown {
  proximity: {
    score: number;
    maxScore: 30;
    distanceKm: number | null;
    fromProperty: string | null;
    travelTimeMin: number | null;
    details: string;
  };
  familiarity: {
    score: number;
    maxScore: 25;
    previousCleanings: number;
    details: string;
  };
  workload: {
    score: number;
    maxScore: 25;
    todayCleanings: number;
    details: string;
  };
  performance: {
    score: number;
    maxScore: 20;
    rating: number;
    details: string;
  };
}

export interface AssignmentScore {
  operatorId: string;
  operatorName: string;
  operatorEmail: string;
  operatorPhone?: string;
  totalScore: number;
  maxPossibleScore: 100;
  breakdown: ScoreBreakdown;
  todayAssignments: ExistingAssignment[];
  isRecommended: boolean;
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════
// FUNZIONI DI CALCOLO PUNTEGGIO
// ═══════════════════════════════════════════════════════════════

/**
 * Calcola il punteggio di PROSSIMITÀ (max 30 pt)
 * Basato sulla distanza dalla pulizia precedente/successiva dell'operatore
 */
function calculateProximityScore(
  targetCleaning: CleaningForAssignment,
  todayAssignments: ExistingAssignment[]
): ScoreBreakdown["proximity"] {
  // Se non ci sono coordinate della proprietà target
  if (!targetCleaning.coordinates) {
    return {
      score: 15, // Punteggio medio
      maxScore: 30,
      distanceKm: null,
      fromProperty: null,
      travelTimeMin: null,
      details: "Coordinate non disponibili, punteggio medio assegnato",
    };
  }

  // Se l'operatore non ha altre pulizie oggi → punteggio pieno
  if (todayAssignments.length === 0) {
    return {
      score: 30,
      maxScore: 30,
      distanceKm: null,
      fromProperty: null,
      travelTimeMin: null,
      details: "Prima pulizia della giornata - nessuno spostamento",
    };
  }

  // Trova la pulizia più vicina (temporalmente) tra quelle già assegnate
  // che abbia le coordinate
  const assignmentsWithCoords = todayAssignments.filter(a => a.coordinates);
  
  if (assignmentsWithCoords.length === 0) {
    return {
      score: 20, // Punteggio medio-alto
      maxScore: 30,
      distanceKm: null,
      fromProperty: null,
      travelTimeMin: null,
      details: "Coordinate altre pulizie non disponibili",
    };
  }

  // Calcola distanza da ogni pulizia assegnata e prendi la minima
  let minDistance = Infinity;
  let closestProperty = "";

  for (const assignment of assignmentsWithCoords) {
    if (assignment.coordinates) {
      const distance = calculateDistance(
        targetCleaning.coordinates,
        assignment.coordinates
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestProperty = assignment.propertyName;
      }
    }
  }

  const score = getDistanceScore(minDistance);
  const travelTime = estimateTravelTime(minDistance);

  return {
    score,
    maxScore: 30,
    distanceKm: Math.round(minDistance * 10) / 10,
    fromProperty: closestProperty,
    travelTimeMin: travelTime,
    details: `${formatDistance(minDistance)} da "${closestProperty}" (~${travelTime} min)`,
  };
}

/**
 * Calcola il punteggio di FAMILIARITÀ (max 25 pt)
 * Basato su quante volte l'operatore ha già pulito questa proprietà
 */
async function calculateFamiliarityScore(
  propertyId: string,
  operatorId: string
): Promise<ScoreBreakdown["familiarity"]> {
  try {
    // Query per trovare pulizie completate di questa proprietà da questo operatore
    const cleaningsQuery = query(
      collection(db, "cleanings"),
      where("propertyId", "==", propertyId),
      where("operatorId", "==", operatorId),
      where("status", "==", "COMPLETED")
    );

    const snapshot = await getDocs(cleaningsQuery);
    const count = snapshot.docs.length;

    let score: number;
    let details: string;

    if (count >= 5) {
      score = 25;
      details = `Esperto: ${count} pulizie completate`;
    } else if (count >= 3) {
      score = 20;
      details = `Conosce bene: ${count} pulizie completate`;
    } else if (count >= 1) {
      score = 15;
      details = `Ha esperienza: ${count} pulizie completate`;
    } else {
      score = 0;
      details = "Mai pulita questa proprietà";
    }

    return {
      score,
      maxScore: 25,
      previousCleanings: count,
      details,
    };
  } catch (error) {
    console.error("Errore calcolo familiarità:", error);
    return {
      score: 0,
      maxScore: 25,
      previousCleanings: 0,
      details: "Errore nel calcolo",
    };
  }
}

/**
 * Calcola il punteggio di CARICO LAVORO (max 25 pt)
 * Basato su quante pulizie ha già l'operatore oggi
 */
function calculateWorkloadScore(
  todayCleaningsCount: number
): ScoreBreakdown["workload"] {
  let score: number;
  let details: string;

  switch (todayCleaningsCount) {
    case 0:
      score = 25;
      details = "Nessuna pulizia oggi - disponibilità massima";
      break;
    case 1:
      score = 18;
      details = "1 pulizia oggi - buona disponibilità";
      break;
    case 2:
      score = 10;
      details = "2 pulizie oggi - disponibilità limitata";
      break;
    case 3:
      score = 5;
      details = "3 pulizie oggi - quasi al limite";
      break;
    default:
      score = 0;
      details = `${todayCleaningsCount} pulizie oggi - sovraccarico`;
  }

  return {
    score,
    maxScore: 25,
    todayCleanings: todayCleaningsCount,
    details,
  };
}

/**
 * Calcola il punteggio di PERFORMANCE (max 20 pt)
 * Basato sul rating medio dell'operatore
 */
function calculatePerformanceScore(
  rating: number = 4.0 // Default 4.0 se non disponibile
): ScoreBreakdown["performance"] {
  // Rating da 1 a 5, convertito in punteggio 0-20
  // Rating 5.0 = 20 pt
  // Rating 4.0 = 16 pt
  // Rating 3.0 = 12 pt
  // Rating 2.0 = 8 pt
  // Rating 1.0 = 4 pt
  const score = Math.round(rating * 4);

  let details: string;
  if (rating >= 4.5) {
    details = `Eccellente (${rating.toFixed(1)}/5)`;
  } else if (rating >= 4.0) {
    details = `Molto buono (${rating.toFixed(1)}/5)`;
  } else if (rating >= 3.5) {
    details = `Buono (${rating.toFixed(1)}/5)`;
  } else if (rating >= 3.0) {
    details = `Sufficiente (${rating.toFixed(1)}/5)`;
  } else {
    details = `Da migliorare (${rating.toFixed(1)}/5)`;
  }

  return {
    score,
    maxScore: 20,
    rating,
    details,
  };
}

// ═══════════════════════════════════════════════════════════════
// FUNZIONE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

/**
 * Calcola il punteggio completo per un singolo operatore
 */
export async function calculateAssignmentScore(
  cleaning: CleaningForAssignment,
  operator: OperatorForAssignment,
  todayAssignments: ExistingAssignment[]
): Promise<AssignmentScore> {
  const warnings: string[] = [];

  // 1. Prossimità geografica
  const proximityScore = calculateProximityScore(cleaning, todayAssignments);

  // 2. Familiarità con la proprietà
  const familiarityScore = await calculateFamiliarityScore(
    cleaning.propertyId,
    operator.id
  );

  // 3. Carico di lavoro
  const workloadScore = calculateWorkloadScore(todayAssignments.length);

  // 4. Performance
  const performanceScore = calculatePerformanceScore(operator.rating || 4.0);

  // Calcola totale
  const totalScore =
    proximityScore.score +
    familiarityScore.score +
    workloadScore.score +
    performanceScore.score;

  // Genera warnings
  if (todayAssignments.length >= 3) {
    warnings.push("Operatore già molto impegnato oggi");
  }
  
  if (proximityScore.distanceKm && proximityScore.distanceKm > 10) {
    warnings.push(`Distanza elevata: ${formatDistance(proximityScore.distanceKm)}`);
  }

  if (proximityScore.travelTimeMin && proximityScore.travelTimeMin > 30) {
    warnings.push(`Tempo di spostamento: ~${proximityScore.travelTimeMin} min`);
  }

  return {
    operatorId: operator.id,
    operatorName: operator.name,
    operatorEmail: operator.email,
    operatorPhone: operator.phone,
    totalScore,
    maxPossibleScore: 100,
    breakdown: {
      proximity: proximityScore,
      familiarity: familiarityScore,
      workload: workloadScore,
      performance: performanceScore,
    },
    todayAssignments,
    isRecommended: totalScore >= 70,
    warnings,
  };
}

/**
 * Ottiene i migliori operatori per una pulizia
 */
export async function getTopOperatorsForCleaning(
  cleaning: CleaningForAssignment,
  operators: OperatorForAssignment[],
  allTodayCleanings: Map<string, ExistingAssignment[]>, // operatorId -> assignments
  limit: number = 5
): Promise<AssignmentScore[]> {
  const scores: AssignmentScore[] = [];

  for (const operator of operators) {
    // Salta operatori non attivi
    if (operator.status !== "ACTIVE") continue;

    const todayAssignments = allTodayCleanings.get(operator.id) || [];
    
    const score = await calculateAssignmentScore(
      cleaning,
      operator,
      todayAssignments
    );
    
    scores.push(score);
  }

  // Ordina per punteggio decrescente
  scores.sort((a, b) => b.totalScore - a.totalScore);

  // Ritorna i top N
  return scores.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════
// HELPERS PER CARICARE DATI
// ═══════════════════════════════════════════════════════════════

/**
 * Carica tutte le pulizie assegnate per una data specifica
 * Raggruppa per operatore
 */
export async function loadTodayAssignmentsByOperator(
  date: Date
): Promise<Map<string, ExistingAssignment[]>> {
  const result = new Map<string, ExistingAssignment[]>();

  try {
    // Crea range per la data (inizio e fine giornata)
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Query pulizie del giorno con operatore assegnato
    const cleaningsQuery = query(
      collection(db, "cleanings"),
      where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
      where("scheduledDate", "<=", Timestamp.fromDate(endOfDay))
    );

    const snapshot = await getDocs(cleaningsQuery);

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const operatorId = data.operatorId;

      // Salta se non ha operatore assegnato
      if (!operatorId) return;

      const assignment: ExistingAssignment = {
        cleaningId: doc.id,
        propertyId: data.propertyId,
        propertyName: data.propertyName || "Proprietà",
        propertyAddress: data.propertyAddress,
        coordinates: data.propertyCoordinates || undefined,
        scheduledTime: data.scheduledTime,
        estimatedDuration: data.estimatedDuration,
      };

      if (!result.has(operatorId)) {
        result.set(operatorId, []);
      }
      result.get(operatorId)!.push(assignment);
    });

    return result;
  } catch (error) {
    console.error("Errore caricamento assegnazioni giornaliere:", error);
    return result;
  }
}

/**
 * Conta le pulizie totali del giorno per ogni operatore
 */
export async function getOperatorWorkloadForDate(
  date: Date
): Promise<Map<string, number>> {
  const assignments = await loadTodayAssignmentsByOperator(date);
  const workload = new Map<string, number>();

  assignments.forEach((cleanings, operatorId) => {
    workload.set(operatorId, cleanings.length);
  });

  return workload;
}
