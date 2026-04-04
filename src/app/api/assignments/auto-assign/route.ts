/**
 * AUTO-ASSIGN API v3 — Assegnazione intelligente pulizie
 * 
 * VINCOLI ORARIO:
 * - La pulizia NON può iniziare PRIMA del checkout (scheduledTime)
 * - La pulizia DEVE finire PRIMA del checkin (checkInTime dalla proprietà)
 * - Se non c'è checkin → deadline globale 18:00
 * - Tempo minimo spostamento tra pulizie: 15 min (o calcolato da GPS)
 * 
 * CRITERI SCORE (max 100):
 * - Prossimità GPS (max 30) — distanza dalla pulizia precedente
 * - Familiarità (max 25) — quante volte ha pulito questa proprietà  
 * - Workload (max 25) — bilanciamento carico tra operatori
 * - Performance (max 20) — rating operatore
 * 
 * DATI USATI:
 * - Durate storiche: mediana da startedAt/completedAt ultimi 6 mesi
 * - Coordinate GPS: da propertyCoordinates o fallback da properties
 * - Familiarità: conteggio pulizie completate per coppia op+proprietà
 * - checkInTime: dalla pulizia o dalla proprietà come fallback
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { calculateDistance } from "~/lib/geo";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════
// TIPI
// ═══════════════════════════════════════════════════════════════

interface Coords { lat: number; lng: number; }

interface CleaningData {
  id: string;
  propertyId: string;
  propertyName: string;
  scheduledTime: string;      // orario checkout = inizio minimo
  checkInTime?: string;       // orario checkin nuovi ospiti = deadline fine
  estimatedDuration: number;  // ore (storica o stimata)
  coordinates?: Coords;
  priority?: string;          // "urgent" | "normal"
  serviceTypeCode?: string;   // STANDARD | APPROFONDITA | SGROSSO
  guestsCount?: number;
  bedrooms?: number;
  bathrooms?: number;
}

interface OperatorInput { id: string; name: string; rating: number; }

interface DraftResult {
  cleaningId: string;
  operatorId: string;
  operatorName: string;
  scheduledTime: string;
  estimatedDuration: number; // ore — durata calcolata (storica/stimata)
  reason: string;
}

interface TimeSlot {
  startMin: number;
  endMin: number;
  coords?: Coords;
  propertyId: string;
}

// ═══════════════════════════════════════════════════════════════
// COSTANTI
// ═══════════════════════════════════════════════════════════════

const MIN_TRAVEL_MINUTES = 15;
const GLOBAL_MAX_END = 18 * 60;       // 18:00 = 1080 min
const ROAD_FACTOR = 1.4;              // Haversine → strada
const DEFAULT_DURATION_HOURS = 2;
const HISTORY_MONTHS = 6;
// Buffer di sicurezza prima del checkin (minuti)
// Per non tagliare al limite — l'operatore deve avere margine
const CHECKIN_BUFFER_MIN = 15;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getTravelMinutes(from: Coords, to: Coords): number {
  const roadKm = calculateDistance(from, to) * ROAD_FACTOR;
  if (roadKm < 1) return Math.max(MIN_TRAVEL_MINUTES, Math.ceil(roadKm * 12));
  if (roadKm < 3) return Math.max(MIN_TRAVEL_MINUTES, Math.ceil(roadKm * 8));
  return Math.max(MIN_TRAVEL_MINUTES, Math.ceil(roadKm * 5) + 10);
}

function proxScore(km: number): number {
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

function toMin(t: string): number {
  const p = t.split(":");
  return (parseInt(p[0] || "0")) * 60 + (parseInt(p[1] || "0"));
}

function toTime(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
}

function roundUp15(m: number): number { return Math.ceil(m / 15) * 15; }

function validCoords(c: any): c is Coords {
  return c && typeof c.lat === "number" && typeof c.lng === "number" && c.lat !== 0 && c.lng !== 0;
}

// estimatedDuration in Firestore è MISTO: alcune pulizie lo hanno in minuti (90, 120, 180)
// mentre il client usa il fallback 2 (ore). Normalizziamo: se >10 è minuti, altrimenti ore.
function normalizeToHours(val: number | undefined): number {
  if (!val || val <= 0) return DEFAULT_DURATION_HOURS;
  if (val > 10) return val / 60; // è in minuti → converti in ore
  return val; // è già in ore
}

// ═══════════════════════════════════════════════════════════════
// GAP-FINDING: Trova il primo slot libero nella schedule
// Cerca buchi tra slot esistenti, non solo append in coda
// ═══════════════════════════════════════════════════════════════

function findEarliestSlot(
  slots: TimeSlot[],
  durMin: number,
  minStart: number,
  maxEnd: number,  // deadline: checkin - buffer, oppure 18:00
  newCoords?: Coords
): { startMin: number; afterIdx: number } | null {

  // Nessuno slot → inizia subito
  if (slots.length === 0) {
    const s = roundUp15(minStart);
    if (s + durMin <= maxEnd) return { startMin: s, afterIdx: -1 };
    return null;
  }

  // Prova PRIMA del primo slot
  {
    const first = slots[0]!;
    const s = roundUp15(minStart);
    let travelToNext = MIN_TRAVEL_MINUTES;
    if (newCoords && first.coords) travelToNext = getTravelMinutes(newCoords, first.coords);
    if (s + durMin <= maxEnd && s + durMin + travelToNext <= first.startMin) {
      return { startMin: s, afterIdx: -1 };
    }
  }

  // Prova in ogni BUCO tra slot
  for (let i = 0; i < slots.length - 1; i++) {
    const curr = slots[i]!;
    const next = slots[i + 1]!;

    let travelFrom = MIN_TRAVEL_MINUTES;
    if (curr.coords && newCoords) travelFrom = getTravelMinutes(curr.coords, newCoords);
    const s = roundUp15(Math.max(minStart, curr.endMin + travelFrom));

    let travelTo = MIN_TRAVEL_MINUTES;
    if (newCoords && next.coords) travelTo = getTravelMinutes(newCoords, next.coords);

    if (s + durMin <= maxEnd && s + durMin + travelTo <= next.startMin) {
      return { startMin: s, afterIdx: i };
    }
  }

  // Prova DOPO l'ultimo slot
  {
    const last = slots[slots.length - 1]!;
    let travelFrom = MIN_TRAVEL_MINUTES;
    if (last.coords && newCoords) travelFrom = getTravelMinutes(last.coords, newCoords);
    const s = roundUp15(Math.max(minStart, last.endMin + travelFrom));
    if (s + durMin <= maxEnd) return { startMin: s, afterIdx: slots.length - 1 };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// STIMA DURATA FALLBACK (quando non c'è storico)
// Usa serviceTypeCode + bedrooms + bathrooms
// ═══════════════════════════════════════════════════════════════

function estimateDurationMinutes(cl: CleaningData): number {
  // Base per tipo servizio
  const code = (cl.serviceTypeCode || "STANDARD").toUpperCase();
  let base: number;
  if (code === "APPROFONDITA" || code === "DEEP") base = 150;      // 2.5h
  else if (code === "SGROSSO" || code === "INITIAL") base = 210;   // 3.5h
  else base = 90;                                                   // 1.5h standard

  // Aggiungi per camere extra (oltre la prima)
  const rooms = (cl.bedrooms || 1);
  if (rooms > 1) base += (rooms - 1) * 15; // +15 min per camera extra

  // Aggiungi per bagni extra (oltre il primo)
  const baths = (cl.bathrooms || 1);
  if (baths > 1) base += (baths - 1) * 10; // +10 min per bagno extra

  // Aggiungi per ospiti (se molti)
  const guests = cl.guestsCount || 2;
  if (guests > 4) base += (guests - 4) * 5; // +5 min per ospite oltre 4

  return base;
}

// ═══════════════════════════════════════════════════════════════
// POST — Auto-assign intelligente v3
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin" }, { status: 403 });
    }

    const body = await request.json();
    const { unassignedIds, operators: clientOps, existingAssignments } = body as {
      date: string;
      unassignedIds: string[];
      operators: OperatorInput[];
      existingAssignments: Array<{
        cleaningId: string;
        operatorId: string;
        scheduledTime: string;
        estimatedDuration: number;
        coordinates?: Coords;
        propertyId: string;
      }>;
    };

    if (!unassignedIds?.length) {
      return NextResponse.json({ drafts: [], message: "Nessuna pulizia da assegnare" });
    }
    if (!clientOps?.length) {
      return NextResponse.json({ drafts: [], message: "Nessun operatore disponibile" });
    }

    // ───────────────────────────────────────────────────────────
    // 1. CARICA PROPRIETÀ (coordinate, checkInTime, checkOutTime, bedrooms, bathrooms)
    // ───────────────────────────────────────────────────────────
    const propertyCache = new Map<string, {
      coords?: Coords;
      checkInTime?: string;
      checkOutTime?: string;
      bedrooms?: number;
      bathrooms?: number;
    }>();

    // Raccogliamo tutti i propertyId che ci servono
    const allPropertyIds = new Set<string>();

    // ───────────────────────────────────────────────────────────
    // 2. CARICA PULIZIE DA ASSEGNARE
    // ───────────────────────────────────────────────────────────
    const cleanings: CleaningData[] = [];

    for (const cid of unassignedIds) {
      const snap = await adminDb.collection("cleanings").doc(cid).get();
      if (!snap.exists) continue;
      const d = snap.data() as Record<string, any>;
      const coords = d.propertyCoordinates;

      cleanings.push({
        id: cid,
        propertyId: d.propertyId || "",
        propertyName: d.propertyName || "Proprietà",
        scheduledTime: d.scheduledTime || "10:00",
        checkInTime: d.checkInTime || d.checkinTime || undefined,
        estimatedDuration: normalizeToHours(d.estimatedDuration),
        coordinates: validCoords(coords) ? { lat: coords.lat, lng: coords.lng } : undefined,
        priority: d.priority || "normal",
        serviceTypeCode: d.serviceTypeCode || d.serviceType || "STANDARD",
        guestsCount: d.guestsCount,
        bedrooms: d.bedrooms,
        bathrooms: d.bathrooms,
      });
      if (d.propertyId) allPropertyIds.add(d.propertyId);
    }

    for (const ea of existingAssignments || []) {
      if (ea.propertyId) allPropertyIds.add(ea.propertyId);
    }

    // ───────────────────────────────────────────────────────────
    // 3. CARICA TUTTE LE PROPRIETÀ NECESSARIE (batch)
    // ───────────────────────────────────────────────────────────
    const propIdArray = [...allPropertyIds];
    if (propIdArray.length > 0) {
      // Firestore getAll supporta max ~30 refs per batch in admin SDK
      // Ma usiamo loop singolo per sicurezza
      for (const pid of propIdArray) {
        try {
          const pSnap = await adminDb.collection("properties").doc(pid).get();
          if (pSnap.exists) {
            const p = pSnap.data() as Record<string, any>;
            propertyCache.set(pid, {
              coords: validCoords(p.coordinates) ? { lat: p.coordinates.lat, lng: p.coordinates.lng } : undefined,
              checkInTime: p.checkInTime || undefined,
              checkOutTime: p.checkOutTime || undefined,
              bedrooms: p.bedrooms,
              bathrooms: p.bathrooms,
            });
          }
        } catch { /* ignora */ }
      }
    }

    // Arricchisci pulizie con dati proprietà
    for (const cl of cleanings) {
      const prop = propertyCache.get(cl.propertyId);
      if (!prop) continue;

      // Coordinate: fallback dalla proprietà
      if (!cl.coordinates && prop.coords) {
        cl.coordinates = prop.coords;
      }
      // CheckInTime: fallback dalla proprietà (tipicamente 15:00)
      if (!cl.checkInTime && prop.checkInTime) {
        cl.checkInTime = prop.checkInTime;
      }
      // Bedrooms/bathrooms: fallback dalla proprietà
      if (!cl.bedrooms && prop.bedrooms) cl.bedrooms = prop.bedrooms;
      if (!cl.bathrooms && prop.bathrooms) cl.bathrooms = prop.bathrooms;
    }

    // ───────────────────────────────────────────────────────────
    // 4. CARICA DURATE STORICHE + FAMILIARITÀ (singola query)
    // ───────────────────────────────────────────────────────────
    const durationByProp = new Map<string, number>();  // propertyId → mediana minuti
    const familiarityMap = new Map<string, number>();   // "opId:propId" → count
    const opIdSet = new Set(clientOps.map(o => o.id));

    if (allPropertyIds.size > 0) {
      try {
        const snap = await adminDb.collection("cleanings")
          .where("status", "in", ["COMPLETED", "completed", "VERIFIED", "verified"])
          .get();

        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - HISTORY_MONTHS);
        const dursByProp = new Map<string, number[]>();

        snap.docs.forEach(doc => {
          const data = doc.data() as Record<string, any>;
          const pid = data.propertyId;
          if (!pid || !allPropertyIds.has(pid)) return;

          // Familiarità
          if (data.operatorId && opIdSet.has(data.operatorId)) {
            const k = `${data.operatorId}:${pid}`;
            familiarityMap.set(k, (familiarityMap.get(k) || 0) + 1);
          }

          // Durate
          if (!data.startedAt || !data.completedAt) return;
          try {
            const s = data.startedAt.toDate?.() ?? new Date(data.startedAt);
            const e = data.completedAt.toDate?.() ?? new Date(data.completedAt);
            if (e < cutoff) return;
            const mins = Math.round((e.getTime() - s.getTime()) / 60000);
            if (mins < 15 || mins > 480) return;
            const arr = dursByProp.get(pid) || [];
            arr.push(mins);
            dursByProp.set(pid, arr);
          } catch { /* ignora */ }
        });

        for (const [pid, durs] of dursByProp) {
          const sorted = durs.sort((a, b) => a - b);
          durationByProp.set(pid, sorted[Math.floor(sorted.length / 2)] || 90);
        }
      } catch (err) {
        console.error("Errore caricamento storico:", err);
      }
    }

    // Applica durate: storica > stima da parametri > fallback
    for (const cl of cleanings) {
      const hist = durationByProp.get(cl.propertyId);
      if (hist) {
        cl.estimatedDuration = hist / 60; // minuti → ore
      } else {
        // Stima intelligente basata su tipo servizio + camere + bagni
        cl.estimatedDuration = estimateDurationMinutes(cl) / 60;
      }
    }

    // ───────────────────────────────────────────────────────────
    // 5. COSTRUISCI SCHEDULE INIZIALE OPERATORI
    // ───────────────────────────────────────────────────────────
    const opSchedule = new Map<string, TimeSlot[]>();
    const opNames = new Map<string, string>();

    for (const op of clientOps) {
      opSchedule.set(op.id, []);
      opNames.set(op.id, op.name);
    }

    for (const ea of existingAssignments || []) {
      const slots = opSchedule.get(ea.operatorId);
      if (!slots) continue;

      const startMin = toMin(ea.scheduledTime || "10:00");
      // Durata: storica → passata dal client (normalizzata) → default
      const hist = durationByProp.get(ea.propertyId);
      const durH = hist ? hist / 60 : normalizeToHours(ea.estimatedDuration);
      const endMin = startMin + Math.round(durH * 60);

      let coords: Coords | undefined;
      if (validCoords(ea.coordinates)) coords = ea.coordinates;
      else coords = propertyCache.get(ea.propertyId)?.coords;

      slots.push({ startMin, endMin, coords, propertyId: ea.propertyId || "" });
    }

    for (const [, slots] of opSchedule) {
      slots.sort((a, b) => a.startMin - b.startMin);
    }

    // ───────────────────────────────────────────────────────────
    // 6. ALGORITMO GREEDY CON GAP-FINDING + FINESTRA CHECKOUT/CHECKIN
    // ───────────────────────────────────────────────────────────

    const drafts: DraftResult[] = [];
    const pool = cleanings.filter(
      c => !c.priority || c.priority !== "cancelled" // safety
    );

    // ── Ordinamento prioritario ──
    // 1. Pulizie urgenti (priority=urgent) prima
    // 2. Finestra stretta (checkout-checkin piccola) prima — più difficili da piazzare
    // 3. Durata più lunga prima — più difficili da piazzare
    // 4. scheduledTime (checkout) più presto prima
    pool.sort((a, b) => {
      // Urgenti prima
      const aUrg = a.priority === "urgent" ? 0 : 1;
      const bUrg = b.priority === "urgent" ? 0 : 1;
      if (aUrg !== bUrg) return aUrg - bUrg;

      // Finestra stretta prima
      const aWindow = getWindowMinutes(a);
      const bWindow = getWindowMinutes(b);
      if (aWindow !== bWindow) return aWindow - bWindow; // più stretta = numero minore = prima

      // Durata più lunga prima
      const durDiff = (b.estimatedDuration || 2) - (a.estimatedDuration || 2);
      if (Math.abs(durDiff) > 0.25) return durDiff;

      // Checkout più presto prima
      return toMin(a.scheduledTime) - toMin(b.scheduledTime);
    });

    for (const cl of pool) {
      const durMin = Math.round(cl.estimatedDuration * 60);
      const minStart = toMin(cl.scheduledTime); // checkout = inizio minimo

      // Deadline: checkin - buffer, oppure 18:00
      let maxEnd = GLOBAL_MAX_END;
      if (cl.checkInTime) {
        const checkinMin = toMin(cl.checkInTime);
        // La pulizia deve FINIRE prima del checkin (meno un buffer)
        const checkinDeadline = checkinMin - CHECKIN_BUFFER_MIN;
        // Usa il più restrittivo tra checkin e 18:00
        maxEnd = Math.min(maxEnd, checkinDeadline);
      }

      // Verifica che la finestra sia fisicamente possibile
      if (minStart + durMin > maxEnd) {
        // Questa pulizia non ci sta in nessun caso nella sua finestra
        // (es: checkout 14:00, checkin 15:00, durata 2h → impossibile)
        // Skip — verrà segnalata come non assegnata
        continue;
      }

      let bestOpId: string | null = null;
      let bestScore = -Infinity;
      let bestStartMin = 0;
      let bestReason = "";

      for (const op of clientOps) {
        const slots = opSchedule.get(op.id) || [];

        const slot = findEarliestSlot(slots, durMin, minStart, maxEnd, cl.coordinates);
        if (!slot) continue;

        const candidateStart = slot.startMin;
        const workloadCount = slots.length;

        // ── PROSSIMITÀ (max 30) ──
        let pxPts = 30;
        let pxDetail = "1ª";

        const prevIdx = slot.afterIdx;
        if (prevIdx >= 0 && prevIdx < slots.length) {
          const prev = slots[prevIdx]!;
          if (prev.coords && cl.coordinates) {
            const km = calculateDistance(prev.coords, cl.coordinates) * ROAD_FACTOR;
            pxPts = proxScore(km);
            pxDetail = `${km.toFixed(1)}km`;
          } else { pxPts = 15; pxDetail = "?km"; }
        } else if (slots.length > 0 && prevIdx === -1) {
          const next = slots[0]!;
          if (next.coords && cl.coordinates) {
            const km = calculateDistance(cl.coordinates, next.coords) * ROAD_FACTOR;
            pxPts = proxScore(km);
            pxDetail = `${km.toFixed(1)}km`;
          } else { pxPts = 15; pxDetail = "?km"; }
        }

        // ── FAMILIARITÀ (max 25) ──
        const famN = familiarityMap.get(`${op.id}:${cl.propertyId}`) || 0;
        const famPts = famN >= 5 ? 25 : famN >= 3 ? 20 : famN >= 1 ? 15 : 0;

        // ── WORKLOAD (max 25) ──
        const wPts = workloadCount === 0 ? 25 : workloadCount === 1 ? 18 : workloadCount === 2 ? 10 : workloadCount === 3 ? 5 : 0;

        // ── PERFORMANCE (max 20) ──
        const perfPts = Math.round((op.rating || 4.0) * 4);

        const total = pxPts + famPts + wPts + perfPts;

        // ── BONUS: orario più vicino al checkout (meglio iniziare subito dopo checkout)
        // Penalità proporzionale al ritardo rispetto al checkout
        const delayFromCheckout = candidateStart - minStart;
        // Ogni 30 min di ritardo = -1 punto di bonus (max -5)
        const delayPenalty = Math.min(5, Math.floor(delayFromCheckout / 30));

        // Tiebreaker composito: score principale → meno ritardo → orario prima
        const adjusted = (total - delayPenalty) * 100000 - candidateStart;

        if (adjusted > bestScore) {
          bestScore = adjusted;
          bestOpId = op.id;
          bestStartMin = candidateStart;
          bestReason = [
            `px:${pxPts}(${pxDetail})`,
            `fam:${famPts}(${famN}x)`,
            `ld:${wPts}(${workloadCount})`,
            `pf:${perfPts}`,
            `→${total}pt`,
            `@${toTime(candidateStart)}`,
            cl.checkInTime ? `fin<${cl.checkInTime}` : "",
            delayPenalty > 0 ? `delay:-${delayPenalty}` : "",
          ].filter(Boolean).join(" ");
        }
      }

      if (bestOpId) {
        drafts.push({
          cleaningId: cl.id,
          operatorId: bestOpId,
          operatorName: opNames.get(bestOpId) || "Operatore",
          scheduledTime: toTime(bestStartMin),
          estimatedDuration: Math.round((durMin / 60) * 100) / 100,
          reason: bestReason,
        });

        const slots = opSchedule.get(bestOpId)!;
        slots.push({
          startMin: bestStartMin,
          endMin: bestStartMin + durMin,
          coords: cl.coordinates,
          propertyId: cl.propertyId,
        });
        slots.sort((a, b) => a.startMin - b.startMin);

        const fk = `${bestOpId}:${cl.propertyId}`;
        familiarityMap.set(fk, (familiarityMap.get(fk) || 0) + 1);
      }
    }

    // ───────────────────────────────────────────────────────────
    // 6b. SECONDO PASSAGGIO — pulizie rimaste, vincoli rilassati
    // Estende deadline a 19:00, ignora workload nel score
    // ───────────────────────────────────────────────────────────
    const assignedIds = new Set(drafts.map(d => d.cleaningId));
    const remaining = pool.filter(c => !assignedIds.has(c.id));

    if (remaining.length > 0) {
      const EXTENDED_MAX = 19 * 60; // 19:00

      for (const cl of remaining) {
        const durMin = Math.round(cl.estimatedDuration * 60);
        const minStart = toMin(cl.scheduledTime);

        let maxEnd = EXTENDED_MAX;
        if (cl.checkInTime) {
          const checkinDeadline = toMin(cl.checkInTime) - CHECKIN_BUFFER_MIN;
          maxEnd = Math.min(EXTENDED_MAX, checkinDeadline);
        }

        if (minStart + durMin > maxEnd) continue;

        let bestOpId: string | null = null;
        let bestScore = -Infinity;
        let bestStartMin = 0;
        let bestReason = "";

        for (const op of clientOps) {
          const slots = opSchedule.get(op.id) || [];
          const slot = findEarliestSlot(slots, durMin, minStart, maxEnd, cl.coordinates);
          if (!slot) continue;

          const candidateStart = slot.startMin;

          // Score semplificato: solo prossimità + performance (ignora workload)
          let pxPts = 30;
          const prevIdx = slot.afterIdx;
          if (prevIdx >= 0 && prevIdx < slots.length) {
            const prev = slots[prevIdx]!;
            if (prev.coords && cl.coordinates) {
              pxPts = proxScore(calculateDistance(prev.coords, cl.coordinates) * ROAD_FACTOR);
            } else { pxPts = 15; }
          } else if (slots.length > 0 && prevIdx === -1 && slots[0]!.coords && cl.coordinates) {
            pxPts = proxScore(calculateDistance(cl.coordinates, slots[0]!.coords) * ROAD_FACTOR);
          }

          const perfPts = Math.round((op.rating || 4.0) * 4);
          const total = pxPts + perfPts;
          const adjusted = total * 100000 - candidateStart;

          if (adjusted > bestScore) {
            bestScore = adjusted;
            bestOpId = op.id;
            bestStartMin = candidateStart;
            bestReason = `[2°pass] px:${pxPts} pf:${perfPts} @${toTime(candidateStart)}`;
          }
        }

        if (bestOpId) {
          drafts.push({
            cleaningId: cl.id,
            operatorId: bestOpId,
            operatorName: opNames.get(bestOpId) || "Operatore",
            scheduledTime: toTime(bestStartMin),
            estimatedDuration: Math.round((durMin / 60) * 100) / 100,
            reason: bestReason,
          });

          const slots = opSchedule.get(bestOpId)!;
          slots.push({
            startMin: bestStartMin,
            endMin: bestStartMin + durMin,
            coords: cl.coordinates,
            propertyId: cl.propertyId,
          });
          slots.sort((a, b) => a.startMin - b.startMin);
        }
      }
    }

    // ───────────────────────────────────────────────────────────
    // 7. RISPOSTA CON STATISTICHE
    // ───────────────────────────────────────────────────────────
    const byOp = new Map<string, number>();
    drafts.forEach(d => byOp.set(d.operatorId, (byOp.get(d.operatorId) || 0) + 1));

    return NextResponse.json({
      success: true,
      drafts,
      stats: {
        total: drafts.length,
        unassignedRemaining: pool.length - drafts.length,
        byOperator: Object.fromEntries(byOp),
        historicalDurations: durationByProp.size,
        familiarityPairs: familiarityMap.size,
        coordsAvailable: cleanings.filter(c => c.coordinates).length,
        coordsTotal: cleanings.length,
        withCheckinDeadline: cleanings.filter(c => c.checkInTime).length,
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

// ═══════════════════════════════════════════════════════════════
// HELPER: calcola finestra disponibile in minuti (checkout → checkin)
// Usata per l'ordinamento — finestra stretta = più urgente
// ═══════════════════════════════════════════════════════════════
function getWindowMinutes(cl: CleaningData): number {
  const start = toMin(cl.scheduledTime);
  const end = cl.checkInTime ? toMin(cl.checkInTime) : GLOBAL_MAX_END;
  return end - start;
}
