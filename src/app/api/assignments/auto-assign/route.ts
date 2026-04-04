import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { calculateDistance } from "~/lib/geo";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════
// TIPI
// ═══════════════════════════════════════════════════════════════

interface Coords {
  lat: number;
  lng: number;
}

interface CleaningInput {
  id: string;
  propertyId: string;
  propertyName: string;
  scheduledTime: string; // orario checkout/minimo
  estimatedDuration: number; // ore (fallback dal client)
  coordinates?: Coords;
  operatorId?: string;
  status: string;
}

interface OperatorInput {
  id: string;
  name: string;
  rating: number;
}

interface DraftResult {
  cleaningId: string;
  operatorId: string;
  operatorName: string;
  scheduledTime: string;
  reason: string; // motivo leggibile per debug
}

// ═══════════════════════════════════════════════════════════════
// COSTANTI CONFIGURAZIONE
// ═══════════════════════════════════════════════════════════════

const MIN_TRAVEL_MINUTES = 15; // minimo spostamento tra pulizie
const MAX_HOUR = 18; // orario massimo fine pulizia
const ROAD_FACTOR = 1.4; // fattore correttivo linea d'aria → strada
const DEFAULT_DURATION_HOURS = 2;
const DURATION_CACHE_MONTHS = 6; // mesi di storico per durate

// Peso dei criteri (totale ~100)
const W_PROXIMITY = 30;
const W_FAMILIARITY = 25;
const W_WORKLOAD = 25;
const W_PERFORMANCE = 20;

// ═══════════════════════════════════════════════════════════════
// HELPER: Calcola tempo spostamento (minuti) tra due coordinate
// Usa Haversine × fattore strada + tempo trasporto pubblico Roma
// ═══════════════════════════════════════════════════════════════
function getTravelMinutes(from: Coords, to: Coords): number {
  const linearKm = calculateDistance(from, to);
  const roadKm = linearKm * ROAD_FACTOR;

  if (roadKm < 1) return Math.max(MIN_TRAVEL_MINUTES, Math.ceil(roadKm * 12));
  if (roadKm < 3) return Math.max(MIN_TRAVEL_MINUTES, Math.ceil(roadKm * 8));
  return Math.max(MIN_TRAVEL_MINUTES, Math.ceil(roadKm * 5) + 10);
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Distanza punteggio (0-30) basata su km
// ═══════════════════════════════════════════════════════════════
function distanceScore(km: number): number {
  if (km < 0.5) return 30;
  if (km < 1) return 27;
  if (km < 1.5) return 24;
  if (km < 2) return 21;
  if (km < 3) return 18;
  if (km < 4) return 15;
  if (km < 5) return 12;
  if (km < 7) return 9;
  if (km < 10) return 6;
  if (km < 15) return 3;
  return 0;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Orario come minuti dall'inizio del giorno
// ═══════════════════════════════════════════════════════════════
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

// Arrotonda ai 15 minuti successivi
function roundUpTo15(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

// ═══════════════════════════════════════════════════════════════
// POST — Calcola auto-assign ottimale
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin" }, { status: 403 });
    }

    const body = await request.json();
    const { date, unassignedIds, operators: clientOperators, existingAssignments } = body as {
      date: string; // "YYYY-MM-DD"
      unassignedIds: string[]; // IDs pulizie da assegnare
      operators: OperatorInput[]; // operatori attivi
      existingAssignments: Array<{ // pulizie GIÀ assegnate (server + bozze precedenti)
        cleaningId: string;
        operatorId: string;
        scheduledTime: string;
        estimatedDuration: number;
        coordinates?: Coords;
        propertyId: string;
      }>;
    };

    if (!unassignedIds || unassignedIds.length === 0) {
      return NextResponse.json({ drafts: [], message: "Nessuna pulizia da assegnare" });
    }

    // ───────────────────────────────────────────────────────────
    // 1. CARICA PULIZIE DA ASSEGNARE con coordinate
    // ───────────────────────────────────────────────────────────
    const cleaningsToAssign: CleaningInput[] = [];
    const propertyIdsToLookup = new Set<string>();

    // Carica da Firestore per avere i dati completi (coordinate, ecc)
    for (const cid of unassignedIds) {
      const docSnap = await adminDb.collection("cleanings").doc(cid).get();
      if (!docSnap.exists) continue;
      const d = docSnap.data() as Record<string, any>;

      const coords = d.propertyCoordinates || undefined;
      cleaningsToAssign.push({
        id: cid,
        propertyId: d.propertyId || "",
        propertyName: d.propertyName || "Proprietà",
        scheduledTime: d.scheduledTime || "10:00",
        estimatedDuration: d.estimatedDuration || DEFAULT_DURATION_HOURS,
        coordinates: coords?.lat && coords?.lng ? { lat: coords.lat, lng: coords.lng } : undefined,
        operatorId: d.operatorId,
        status: d.status || "SCHEDULED",
      });

      if (d.propertyId) propertyIdsToLookup.add(d.propertyId);
    }

    // Se mancano coordinate, prova a caricarle dalla collection properties
    const cleaningsWithoutCoords = cleaningsToAssign.filter(c => !c.coordinates && c.propertyId);
    if (cleaningsWithoutCoords.length > 0) {
      const propIds = [...new Set(cleaningsWithoutCoords.map(c => c.propertyId))];
      for (const propId of propIds) {
        try {
          const propDoc = await adminDb.collection("properties").doc(propId).get();
          if (propDoc.exists) {
            const propData = propDoc.data() as Record<string, any>;
            const coords = propData.coordinates;
            if (coords?.lat && coords?.lng) {
              for (const cl of cleaningsWithoutCoords.filter(c => c.propertyId === propId)) {
                cl.coordinates = { lat: coords.lat, lng: coords.lng };
              }
            }
          }
        } catch { /* ignora errori singola proprietà */ }
      }
    }

    // ───────────────────────────────────────────────────────────
    // 2. CARICA DURATE STORICHE PER PROPRIETÀ
    // ───────────────────────────────────────────────────────────
    const durationByProperty = new Map<string, number>(); // propertyId -> media minuti
    const allPropertyIds = [...propertyIdsToLookup];

    if (allPropertyIds.length > 0) {
      try {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - DURATION_CACHE_MONTHS);

        // Query tutte le pulizie completate per queste proprietà
        const completedStatuses = ["COMPLETED", "completed", "VERIFIED", "verified"];
        const snap = await adminDb.collection("cleanings")
          .where("status", "in", completedStatuses)
          .get();

        // Raggruppa per propertyId
        const durationsByProp = new Map<string, number[]>();

        snap.docs.forEach(doc => {
          const data = doc.data() as Record<string, any>;
          if (!data.startedAt || !data.completedAt) return;
          if (!data.propertyId || !allPropertyIds.includes(data.propertyId)) return;

          try {
            const started = data.startedAt.toDate?.() ?? new Date(data.startedAt);
            const completed = data.completedAt.toDate?.() ?? new Date(data.completedAt);
            if (completed < cutoff) return;

            const mins = Math.round((completed.getTime() - started.getTime()) / 60000);
            if (mins < 15 || mins > 480) return; // filtra outlier

            const arr = durationsByProp.get(data.propertyId) || [];
            arr.push(mins);
            durationsByProp.set(data.propertyId, arr);
          } catch { /* ignora errori parsing date */ }
        });

        // Calcola media (p50 = mediana per robustezza)
        for (const [propId, durations] of durationsByProp) {
          if (durations.length >= 2) {
            const sorted = durations.sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)] || 90;
            durationByProperty.set(propId, median);
          } else if (durations.length === 1) {
            durationByProperty.set(propId, durations[0]!);
          }
        }
      } catch (err) {
        console.error("Errore caricamento durate storiche:", err);
        // Continua con durate di fallback
      }
    }

    // Applica durate storiche alle pulizie
    for (const cl of cleaningsToAssign) {
      const historicalMins = durationByProperty.get(cl.propertyId);
      if (historicalMins) {
        cl.estimatedDuration = Math.round((historicalMins / 60) * 100) / 100; // converti in ore
      }
    }

    // ───────────────────────────────────────────────────────────
    // 3. CARICA FAMILIARITÀ (quante volte operatore ha pulito proprietà)
    // ───────────────────────────────────────────────────────────
    // Mappa: "operatorId:propertyId" -> conteggio
    const familiarityMap = new Map<string, number>();

    try {
      const completedStatuses = ["COMPLETED", "completed", "VERIFIED", "verified"];
      const snap = await adminDb.collection("cleanings")
        .where("status", "in", completedStatuses)
        .get();

      const opIds = new Set(clientOperators.map(o => o.id));

      snap.docs.forEach(doc => {
        const data = doc.data() as Record<string, any>;
        if (!data.operatorId || !data.propertyId) return;
        if (!opIds.has(data.operatorId)) return;
        if (!allPropertyIds.includes(data.propertyId)) return;

        const key = `${data.operatorId}:${data.propertyId}`;
        familiarityMap.set(key, (familiarityMap.get(key) || 0) + 1);
      });
    } catch (err) {
      console.error("Errore caricamento familiarità:", err);
    }

    // ───────────────────────────────────────────────────────────
    // 4. COSTRUISCI STATO INIZIALE OPERATORI
    // ───────────────────────────────────────────────────────────
    // Per ogni operatore: lista slot occupati [{ start, end, coords, propertyId }]
    interface TimeSlot {
      startMin: number;
      endMin: number;
      coords?: Coords;
      propertyId: string;
    }

    const opSchedule = new Map<string, TimeSlot[]>();
    const opNames = new Map<string, string>();

    for (const op of clientOperators) {
      opSchedule.set(op.id, []);
      opNames.set(op.id, op.name);
    }

    // Popola con assegnazioni esistenti
    for (const ea of existingAssignments || []) {
      const slots = opSchedule.get(ea.operatorId);
      if (!slots) continue;
      const startMin = timeToMinutes(ea.scheduledTime || "10:00");
      const durHours = ea.estimatedDuration || DEFAULT_DURATION_HOURS;
      const endMin = startMin + Math.round(durHours * 60);
      slots.push({
        startMin,
        endMin,
        coords: ea.coordinates?.lat && ea.coordinates?.lng ? ea.coordinates : undefined,
        propertyId: ea.propertyId || "",
      });
    }

    // Ordina slot per orario
    for (const [, slots] of opSchedule) {
      slots.sort((a, b) => a.startMin - b.startMin);
    }

    // ───────────────────────────────────────────────────────────
    // 5. ALGORITMO DI ASSEGNAZIONE
    // ───────────────────────────────────────────────────────────
    // Per ogni pulizia non assegnata, per ogni operatore, calcola:
    // - Lo score combinato (prossimità + familiarità + workload + performance)
    // - Il primo slot disponibile (rispettando scheduledTime come minimo)
    // - Se la pulizia finisce entro le 18:00
    // Assegna alla miglior coppia (operatore, orario) e aggiorna lo stato

    const drafts: DraftResult[] = [];
    const unassignedPool = [...cleaningsToAssign].filter(
      c => !c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED"
    );

    // Ordina per urgenza (scheduledTime più presto = priorità)
    unassignedPool.sort((a, b) => timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime));

    for (const cleaning of unassignedPool) {
      const cleaningDurMin = Math.round(cleaning.estimatedDuration * 60);
      const minStartMin = timeToMinutes(cleaning.scheduledTime); // non prima del checkout

      let bestOpId: string | null = null;
      let bestScore = -1;
      let bestStartMin = 0;
      let bestReason = "";

      for (const op of clientOperators) {
        const slots = opSchedule.get(op.id) || [];
        const workloadCount = slots.length;

        // ── Trova il primo slot libero ──
        // L'operatore può iniziare questa pulizia dal momento minimo
        // tra minStartMin e dopo la fine dell'ultimo slot + travel time
        let candidateStart = minStartMin;

        if (slots.length > 0) {
          // Trova il punto migliore dove inserire (dopo l'ultima pulizia che finisce prima)
          // Per semplicità e robustezza: inserisci alla fine della giornata dell'operatore
          const lastSlot = slots[slots.length - 1]!;
          let travelMin = MIN_TRAVEL_MINUTES;

          // Se abbiamo coordinate di entrambe, calcola tempo reale
          if (lastSlot.coords && cleaning.coordinates) {
            travelMin = getTravelMinutes(lastSlot.coords, cleaning.coordinates);
          }

          const afterLast = lastSlot.endMin + travelMin;
          candidateStart = Math.max(candidateStart, afterLast);
        }

        // Arrotonda ai 15 minuti
        candidateStart = roundUpTo15(candidateStart);

        // Controlla che finisca entro le 18:00
        const candidateEnd = candidateStart + cleaningDurMin;
        if (candidateEnd > MAX_HOUR * 60) continue; // non ci sta

        // ── Calcola score ──

        // PROSSIMITÀ (max 30 pt)
        let proxScore = W_PROXIMITY; // default: prima pulizia = punteggio pieno
        let proxDetail = "prima pulizia";
        if (slots.length > 0 && cleaning.coordinates) {
          const lastSlot = slots[slots.length - 1]!;
          if (lastSlot.coords) {
            const linearKm = calculateDistance(lastSlot.coords, cleaning.coordinates);
            const roadKm = linearKm * ROAD_FACTOR;
            proxScore = distanceScore(roadKm);
            proxDetail = `${roadKm.toFixed(1)}km`;
          } else {
            proxScore = 15; // coordinate mancanti → medio
            proxDetail = "no coords prev";
          }
        } else if (slots.length > 0) {
          proxScore = 15;
          proxDetail = "no coords";
        }

        // FAMILIARITÀ (max 25 pt)
        const famKey = `${op.id}:${cleaning.propertyId}`;
        const famCount = familiarityMap.get(famKey) || 0;
        let famScore: number;
        if (famCount >= 5) famScore = 25;
        else if (famCount >= 3) famScore = 20;
        else if (famCount >= 1) famScore = 15;
        else famScore = 0;

        // WORKLOAD (max 25 pt) — meno pulizie = più punti
        let workScore: number;
        if (workloadCount === 0) workScore = 25;
        else if (workloadCount === 1) workScore = 18;
        else if (workloadCount === 2) workScore = 10;
        else if (workloadCount === 3) workScore = 5;
        else workScore = 0;

        // PERFORMANCE (max 20 pt)
        const perfScore = Math.round((op.rating || 4.0) * 4);

        const totalScore = proxScore + famScore + workScore + perfScore;

        // Bonus: preferisci orario più presto (a parità di score)
        // e usa come tiebreaker il candidateStart (più basso = meglio)
        const adjustedScore = totalScore * 10000 - candidateStart;

        if (adjustedScore > bestScore) {
          bestScore = adjustedScore;
          bestOpId = op.id;
          bestStartMin = candidateStart;
          bestReason = `prox:${proxScore}(${proxDetail}) fam:${famScore}(${famCount}x) load:${workScore}(${workloadCount}) perf:${perfScore} → ${totalScore}pt`;
        }
      }

      // Assegna al migliore
      if (bestOpId) {
        const scheduledTime = minutesToTime(bestStartMin);

        drafts.push({
          cleaningId: cleaning.id,
          operatorId: bestOpId,
          operatorName: opNames.get(bestOpId) || "Operatore",
          scheduledTime,
          reason: bestReason,
        });

        // Aggiorna schedule dell'operatore per le prossime iterazioni
        const slots = opSchedule.get(bestOpId) || [];
        slots.push({
          startMin: bestStartMin,
          endMin: bestStartMin + cleaningDurMin,
          coords: cleaning.coordinates,
          propertyId: cleaning.propertyId,
        });
        slots.sort((a, b) => a.startMin - b.startMin);

        // Aggiorna anche familiarità per prossime iterazioni
        const famKey = `${bestOpId}:${cleaning.propertyId}`;
        familiarityMap.set(famKey, (familiarityMap.get(famKey) || 0) + 1);
      }
    }

    // ───────────────────────────────────────────────────────────
    // 6. STATISTICHE RIEPILOGO
    // ───────────────────────────────────────────────────────────
    const statsByOperator = new Map<string, number>();
    for (const d of drafts) {
      statsByOperator.set(d.operatorId, (statsByOperator.get(d.operatorId) || 0) + 1);
    }

    const durationsUsed = cleaningsToAssign.map(c => ({
      propertyId: c.propertyId,
      propertyName: c.propertyName,
      duration: c.estimatedDuration,
      isHistorical: durationByProperty.has(c.propertyId),
    }));

    return NextResponse.json({
      success: true,
      drafts,
      stats: {
        total: drafts.length,
        unassignedRemaining: unassignedPool.length - drafts.length,
        byOperator: Object.fromEntries(statsByOperator),
        durationsUsed,
        historicalDurationsFound: durationByProperty.size,
        familiarityPairsFound: familiarityMap.size,
        coordinatesAvailable: cleaningsToAssign.filter(c => c.coordinates).length,
        coordinatesTotal: cleaningsToAssign.length,
      },
    });
  } catch (error) {
    console.error("❌ Errore auto-assign:", error);
    return NextResponse.json(
      { error: "Errore server", details: error instanceof Error ? error.message : "Errore" },
      { status: 500 }
    );
  }
}
