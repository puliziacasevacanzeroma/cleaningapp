"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { calculateDistance } from "~/lib/geo";

// ═══════════════════════════════════════════════════════════════
// TIPI
// ═══════════════════════════════════════════════════════════════

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  propertyZona?: string;
  propertyType?: string;
  propertySize?: number;
  propertyCoordinates?: { lat: number; lng: number };
  scheduledDate: Date;
  scheduledTime: string;
  checkoutTime?: string;
  checkinTime?: string;
  propertyCheckIn?: string;
  propertyCheckOut?: string;
  status: string;
  operatorId?: string;
  operatorName?: string;
  operators?: Array<{ id: string; name: string }>;
  guestsCount?: number;
  estimatedDuration?: number;
  type?: string;
  notes?: string;
  urgent?: boolean;
}

interface Operator {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  rating?: number;
  preferredZone?: string;
  speciality?: string;
  speed?: string;
  todayCleanings: Cleaning[];
  colorIndex?: number;
}

// Bozza di assegnazione locale
interface DraftAssignment {
  cleaningId: string;
  operatorId: string;
  operatorName: string;
  scheduledTime?: string;
  estimatedDuration?: number; // ore — dall'auto-assign (durata storica/calcolata)
}

interface AssignmentScore {
  total: number;
  proximity: { points: number; km: string; minutes: number; sameZone: boolean };
  familiarity: { points: number; times: number };
  workload: { points: number; today: number };
  performance: { points: number; rating: number };
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

// ── Tile layers mappa (stessi della pagina coordinate) ──
const MAP_TILE_LAYERS = {
  positron: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    label: "Minimal", icon: "◻️",
    attr: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
    filter: "",
  },
  voyager: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    label: "Colori", icon: "🎨",
    attr: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
    filter: "",
  },
} as const;
type MapTileKey = keyof typeof MAP_TILE_LAYERS;

const ZONE_FROM_CAP: Record<string, string> = {
  "00184": "Centro Storico", "00186": "Centro Storico", "00187": "Centro Storico",
  "00153": "Trastevere", "00154": "Testaccio",
  "00192": "Vaticano/Prati", "00193": "Vaticano/Prati",
  "00185": "Termini", "00144": "EUR", "00142": "EUR",
};

const getZoneFromCAP = (cap?: string): string => {
  if (!cap) return "Altro";
  return ZONE_FROM_CAP[cap] || "Altro";
};

const calculateScore = (cleaning: Cleaning, operator: Operator): AssignmentScore => {
  const sameZone = cleaning.propertyZona === operator.preferredZone;
  const zoneNearby = cleaning.propertyZona?.includes("Centro") && operator.preferredZone?.includes("Centro");
  let proximityPoints: number, km: string, minutes: number;
  if (sameZone) { km = "0.5"; proximityPoints = 28; }
  else if (zoneNearby) { km = "1.2"; proximityPoints = 22; }
  else { km = "3.5"; proximityPoints = 10; }
  minutes = Math.ceil(parseFloat(km) * 10);
  const familiarityPoints = 10;
  const timesCleaned = -1;
  const todayCount = operator.todayCleanings.length;
  let workloadPoints: number;
  if (todayCount === 0) workloadPoints = 25;
  else if (todayCount === 1) workloadPoints = 22;
  else if (todayCount === 2) workloadPoints = 18;
  else if (todayCount === 3) workloadPoints = 14;
  else workloadPoints = 8;
  const rating = operator.rating || 4.0;
  const performancePoints = Math.floor(rating * 4);
  return {
    total: proximityPoints + familiarityPoints + workloadPoints + performancePoints,
    proximity: { points: proximityPoints, km, minutes, sameZone: sameZone || false },
    familiarity: { points: familiarityPoints, times: timesCleaned },
    workload: { points: workloadPoints, today: todayCount },
    performance: { points: performancePoints, rating },
  };
};

// Pulizia urgente: check-in E check-out lo stesso giorno (turnover)
const isUrgent = (cleaning: Cleaning): boolean => {
  return !!cleaning.checkinTime;
};

const OP_COLORS = [
  { bg: "bg-pink-500", hex: "#ec4899", text: "text-pink-600", light: "bg-pink-50", border: "border-pink-400", ring: "ring-pink-400" },
  { bg: "bg-blue-500", hex: "#3b82f6", text: "text-blue-600", light: "bg-blue-50", border: "border-blue-400", ring: "ring-blue-400" },
  { bg: "bg-emerald-500", hex: "#10b981", text: "text-emerald-600", light: "bg-emerald-50", border: "border-emerald-400", ring: "ring-emerald-400" },
  { bg: "bg-purple-500", hex: "#a855f7", text: "text-purple-600", light: "bg-purple-50", border: "border-purple-400", ring: "ring-purple-400" },
  { bg: "bg-amber-500", hex: "#f59e0b", text: "text-amber-600", light: "bg-amber-50", border: "border-amber-400", ring: "ring-amber-400" },
  { bg: "bg-teal-500", hex: "#14b8a6", text: "text-teal-600", light: "bg-teal-50", border: "border-teal-400", ring: "ring-teal-400" },
  { bg: "bg-rose-500", hex: "#f43f5e", text: "text-rose-600", light: "bg-rose-50", border: "border-rose-400", ring: "ring-rose-400" },
  { bg: "bg-indigo-500", hex: "#6366f1", text: "text-indigo-600", light: "bg-indigo-50", border: "border-indigo-400", ring: "ring-indigo-400" },
];
const getColor = (i: number) => OP_COLORS[i % OP_COLORS.length];

// Formatta durata ore → stringa leggibile precisa al minuto ("1h30", "2h", "45m")
const fmtDur = (h: number | undefined): string => {
  if (!h || h <= 0) return "—";
  const totalMin = Math.round(h * 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h${mins.toString().padStart(2, "0")}`;
};
// Arrotonda durata ore a 2 decimali per calcoli
const roundDur = (h: number): number => Math.round(h * 100) / 100;

const HOURS = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
const TIME_OPTIONS: string[] = [];
for (let h = 8; h <= 18; h++) {
  TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:00`);
  TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:30`);
}

// ═══════════════════════════════════════════════════════════════
// PORTAL WRAPPER
// ═══════════════════════════════════════════════════════════════
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPALE
// ═══════════════════════════════════════════════════════════════

export default function AssegnazioniPage() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [serverCleanings, setServerCleanings] = useState<Cleaning[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"kanban" | "timeline" | "mappa">("kanban");
  const [filterZone, setFilterZone] = useState("Tutte");
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Cleaning | null>(null);
  const draggingRef = useRef<Cleaning | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  // Map refs (at parent level to survive re-renders)
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapObjRef2 = useRef<any>(null);
  const mapTileLayerRef = useRef<any>(null);

  // ═══════════════════════════════════════════════════════════════
  // DRAFT STATE — Assegnazioni in bozza (solo locali)
  // Usiamo useRef + counter per forzare re-render senza stale closures
  // ═══════════════════════════════════════════════════════════════
  const [drafts, setDrafts] = useState<DraftAssignment[]>([]);
  const draftsRef = useRef<DraftAssignment[]>([]);
  // Sync ref con state
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);

  const [draftTimeChanges, setDraftTimeChanges] = useState<Map<string, string>>(new Map());
  const draftTimeRef = useRef<Map<string, string>>(new Map());
  useEffect(() => { draftTimeRef.current = draftTimeChanges; }, [draftTimeChanges]);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const [sheetCleaningId, setSheetCleaningId] = useState<string | null>(null);
  const [sheetAddMode, setSheetAddMode] = useState(false); // true = aggiungi operatore (non sostituire)
  const [showTimePickerFor, setShowTimePickerFor] = useState<string | null>(null);

  // Ref per serverCleanings (per accesso stabile nei callback)
  const serverCleaningsRef = useRef<Cleaning[]>([]);
  useEffect(() => { serverCleaningsRef.current = serverCleanings; }, [serverCleanings]);

  // ── Mount & Resize ──
  useEffect(() => {
    setMounted(true);
    setIsMobile(window.innerWidth < 1024);
    const h = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ── Blocco scroll body quando mappa è attiva su MOBILE (fix overlay) ──
  useEffect(() => {
    if (viewMode === "mappa" && window.innerWidth < 1024) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        document.documentElement.style.overflow = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [viewMode]);

  // ── Avviso uscita con bozze non salvate ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (draftsRef.current.length > 0 || draftTimeRef.current.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── Coordinate proprietà: listener realtime dalla collection properties ──
  const [propertyCoords, setPropertyCoords] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const [propertyTimes, setPropertyTimes] = useState<Map<string, { checkIn?: string; checkOut?: string }>>(new Map());
  const [propertyAvgDurations, setPropertyAvgDurations] = useState<Map<string, number>>(new Map());
  const [familiarityMap, setFamiliarityMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "properties"), (snap) => {
      const coords = new Map<string, { lat: number; lng: number }>();
      const times = new Map<string, { checkIn?: string; checkOut?: string }>();
      snap.docs.forEach(d => {
        const p = d.data() as Record<string, any>;
        if (p.coordinates?.lat && p.coordinates?.lng) {
          coords.set(d.id, { lat: p.coordinates.lat, lng: p.coordinates.lng });
        }
        // Campi corretti: checkInTime e checkOutTime (non checkIn/checkOut)
        if (p.checkInTime || p.checkOutTime) {
          times.set(d.id, { checkIn: p.checkInTime, checkOut: p.checkOutTime });
        }
      });
      setPropertyCoords(coords);
      setPropertyTimes(times);
    });
    return () => unsub();
  }, []);

  // Carica durate medie per proprietà (una volta, no realtime)
  useEffect(() => {
    const loadDurations = async () => {
      try {
        const q2 = query(collection(db, "cleanings"), where("status", "in", ["COMPLETED", "VERIFIED", "completed", "verified"]));
        const snap = await getDocs(q2);
        console.log(`📊 Pulizie completate trovate: ${snap.docs.length}`);
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 6);
        const dursByProp = new Map<string, number[]>();
        const famMap = new Map<string, number>();
        let famCount = 0;
        snap.docs.forEach(d => {
          const data = d.data() as Record<string, any>;
          if (!data.propertyId) return;
          
          // Familiarità: operatorId:propertyId → conteggio (TUTTE le pulizie, non solo ultimi 6 mesi)
          if (data.operatorId) {
            const fKey = `${data.operatorId}:${data.propertyId}`;
            famMap.set(fKey, (famMap.get(fKey) || 0) + 1);
            famCount++;
          }
          
          if (!data.startedAt || !data.completedAt) return;
          try {
            const s = data.startedAt.toDate ? data.startedAt.toDate() : new Date(data.startedAt);
            const e = data.completedAt.toDate ? data.completedAt.toDate() : new Date(data.completedAt);
            if (e < cutoff) return;
            const mins = Math.round((e.getTime() - s.getTime()) / 60000);
            if (mins < 15 || mins > 480) return;
            const arr = dursByProp.get(data.propertyId) || [];
            arr.push(mins);
            dursByProp.set(data.propertyId, arr);
          } catch { /* ignora */ }
        });
        const avgMap = new Map<string, number>();
        for (const [propId, durs] of dursByProp) {
          if (durs.length >= 1) {
            const sorted = [...durs].sort((a, b) => a - b);
            avgMap.set(propId, sorted[Math.floor(sorted.length / 2)]!);
          }
        }
        if (avgMap.size > 0) {
          console.log(`⏱ Durate reali: ${avgMap.size} proprietà`, Object.fromEntries([...avgMap].slice(0, 3)));
          setPropertyAvgDurations(avgMap);
        }
        if (famMap.size > 0) {
          const top5 = [...famMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
          console.log(`👥 Familiarità: ${famMap.size} coppie (${famCount} totali)`, Object.fromEntries(top5));
          setFamiliarityMap(famMap);
        } else {
          console.warn("⚠️ Nessun dato familiarità trovato. operatorId presente nelle pulizie completate?");
        }
      } catch (err) {
        console.warn("⏱ Errore caricamento durate:", err);
      }
    };
    loadDurations();
  }, []);

  // ── Firebase: Cleanings ──
  useEffect(() => {
    if (!selectedDate) return;
    const date = new Date(selectedDate);
    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
    const q = query(
      collection(db, "cleanings"),
      where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
      where("scheduledDate", "<=", Timestamp.fromDate(endOfDay))
    );
    const unsub = onSnapshot(q, async (snap) => {
      const data = snap.docs.map((docSnap) => {
        const d = docSnap.data() as Record<string, any>;
        const c: Cleaning = {
          id: docSnap.id, propertyId: d.propertyId,
          propertyName: d.propertyName || "Proprietà",
          propertyAddress: d.propertyAddress || "",
          propertyZona: d.propertyZona || getZoneFromCAP(d.propertyCAP),
          propertyType: d.propertyType, propertySize: d.propertySize,
          propertyCoordinates: d.propertyCoordinates?.lat && d.propertyCoordinates?.lng ? { lat: d.propertyCoordinates.lat, lng: d.propertyCoordinates.lng } : undefined,
          scheduledDate: d.scheduledDate?.toDate() || new Date(),
          scheduledTime: d.scheduledTime || "10:00",
          checkoutTime: d.checkoutTime,
          checkinTime: d.checkInTime || d.checkinTime,
          status: d.status || "SCHEDULED",
          operatorId: d.operatorId, operatorName: d.operatorName,
          operators: d.operators, guestsCount: d.guestsCount,
          estimatedDuration: d.estimatedDuration ? (d.estimatedDuration > 10 ? d.estimatedDuration / 60 : d.estimatedDuration) : 2,
          type: d.type, notes: d.notes, urgent: false,
        };
        c.urgent = isUrgent(c);
        return c;
      });

      // Cerca booking con check-in oggi per rilevare turnover (checkout+checkin stesso giorno)
      try {
        const propertyIds = [...new Set(data.map(c => c.propertyId))];
        const checkinPropertyIds = new Set<string>();
        const checkinTimesMap = new Map<string, string>();
        
        // Query bookings per blocchi di 10 (limite Firestore "in")
        for (let i = 0; i < propertyIds.length; i += 10) {
          const chunk = propertyIds.slice(i, i + 10);
          const bookingsQ = query(
            collection(db, "bookings"),
            where("propertyId", "in", chunk)
          );
          const bookingsSnap = await getDocs(bookingsQ);
          bookingsSnap.docs.forEach(bd => {
            const bData = bd.data() as Record<string, any>;
            const ciDate = bData.checkIn?.toDate?.();
            if (!ciDate || !bData.propertyId) return;
            // Check se il checkIn è nello stesso giorno della data selezionata
            const ciDay = `${ciDate.getFullYear()}-${String(ciDate.getMonth() + 1).padStart(2, "0")}-${String(ciDate.getDate()).padStart(2, "0")}`;
            if (ciDay === selectedDate) {
              checkinPropertyIds.add(bData.propertyId);
              const propTimes = propertyTimes.get(bData.propertyId);
              checkinTimesMap.set(bData.propertyId, propTimes?.checkIn || "15:00");
            }
          });
        }
        
        // Aggiorna le pulizie: se la proprietà ha un check-in oggi → turnover
        data.forEach(c => {
          if (checkinPropertyIds.has(c.propertyId)) {
            c.checkinTime = c.checkinTime || checkinTimesMap.get(c.propertyId) || "15:00";
            c.urgent = true;
          }
        });
        console.log(`🔄 Turnover: ${checkinPropertyIds.size}/${propertyIds.length} proprietà con check-in il ${selectedDate}`);
      } catch (err) {
        console.warn("⚠️ Errore query bookings per turnover:", err);
      }

      data.sort((a, b) => {
        const timeCmp = a.scheduledTime.localeCompare(b.scheduledTime);
        if (timeCmp !== 0) return timeCmp;
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        return 0;
      });
      setServerCleanings(data);
      setLoading(false);

      // ── Arricchisci coordinate mancanti (async, non blocca) ──
      // Le coordinate vengono ora dalla collection properties in realtime (propertyCoords)
    });
    return () => unsub();
  }, [selectedDate]);

  // ── Reset bozze quando cambia data ──
  useEffect(() => {
    setDrafts([]);
    setDraftTimeChanges(new Map());
  }, [selectedDate]);

  // ── Firebase: Operators ──
  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((docSnap, index) => {
        const d = docSnap.data() as Record<string, any>;
        return {
          id: docSnap.id, name: d.name || "Operatore", email: d.email || "",
          phone: d.phone, status: d.status || "ACTIVE",
          rating: d.rating || 4.0,
          preferredZone: d.preferredZone || ["Centro Storico", "Trastevere", "Vaticano/Prati", "Termini", "EUR"][index % 5],
          speciality: d.speciality || "",
          speed: d.speed || ["Veloce", "Medio"][index % 2],
          todayCleanings: [] as Cleaning[],
          colorIndex: index,
        };
      });
      setOperators(data);
    });
    return () => unsub();
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // CLEANINGS "EFFETTIVE" = server + bozze applicate
  // Questa è la fonte di verità per tutta la UI
  // ═══════════════════════════════════════════════════════════════
  const cleanings = useMemo(() => {
    let result = serverCleanings.map(c => ({ ...c }));

    // Applica draft time changes
    for (const [cleaningId, newTime] of draftTimeChanges) {
      const idx = result.findIndex(c => c.id === cleaningId);
      if (idx >= 0) {
        result[idx] = { ...result[idx], scheduledTime: newTime };
        result[idx].urgent = isUrgent(result[idx]);
      }
    }

    // Applica draft assignments — supporta MULTI-OPERATORE
    // Le bozze rappresentano lo stato FINALE degli operatori:
    // - drag/tap normale (addToExisting=false) → handleAssign rimuove vecchie bozze → 1 bozza = sostituzione
    // - bottone "+" (addToExisting=true) → handleAssign mantiene vecchie bozze → 2+ bozze = multi-operatore
    const draftsByCleaningId = new Map<string, DraftAssignment[]>();
    for (const draft of drafts) {
      const arr = draftsByCleaningId.get(draft.cleaningId) || [];
      arr.push(draft);
      draftsByCleaningId.set(draft.cleaningId, arr);
    }

    for (const [cleaningId, cleaningDrafts] of draftsByCleaningId) {
      const idx = result.findIndex(c => c.id === cleaningId);
      if (idx >= 0) {
        // Le bozze definiscono gli operatori finali
        const finalOps = cleaningDrafts.map(d => ({ id: d.operatorId, name: d.operatorName }));

        result[idx] = {
          ...result[idx],
          operatorId: finalOps[0]?.id || '',
          operatorName: finalOps[0]?.name || '',
          status: "ASSIGNED",
          operators: finalOps,
        };
        if (cleaningDrafts[0]?.scheduledTime) {
          result[idx].scheduledTime = cleaningDrafts[0].scheduledTime;
        }
        // Applica durata calcolata dall'auto-assign (per timeline corretta)
        if (cleaningDrafts[0]?.estimatedDuration) {
          result[idx].estimatedDuration = cleaningDrafts[0].estimatedDuration;
        }
      }
    }

    // Applica durata media reale da Firestore (mediana pulizie completate)
    let durApplied = 0;
    result.forEach((c, i) => {
      const avgMin = propertyAvgDurations.get(c.propertyId);
      if (avgMin && avgMin > 0) {
        result[i] = { ...result[i], estimatedDuration: roundDur(avgMin / 60) };
        durApplied++;
      }
    });
    if (durApplied > 0) console.log(`⏱ Durate applicate a ${durApplied}/${result.length} pulizie`);

    result.sort((a, b) => {
      const timeCmp = a.scheduledTime.localeCompare(b.scheduledTime);
      if (timeCmp !== 0) return timeCmp;
      if (a.urgent && !b.urgent) return -1;
      if (!a.urgent && b.urgent) return 1;
      return 0;
    });

    return result;
  }, [serverCleanings, drafts, draftTimeChanges, propertyAvgDurations]);

  const draftCleaningIds = useMemo(() => new Set(drafts.map(d => d.cleaningId)), [drafts]);
  const draftTimeCleaningIds = useMemo(() => {
    const s = new Set<string>();
    for (const k of draftTimeChanges.keys()) s.add(k);
    return s;
  }, [draftTimeChanges]);
  const hasDrafts = drafts.length > 0 || draftTimeChanges.size > 0;

  // ── Sync todayCleanings ──
  useEffect(() => {
    if (operators.length === 0) return;
    setOperators((prev) =>
      prev.map((op) => ({
        ...op,
        todayCleanings: cleanings.filter(
          (c) => c.status !== "CANCELLED" && (
            c.operatorId === op.id || 
            (c.operators && c.operators.some(o => o.id === op.id))
          )
        ),
      }))
    );
  }, [cleanings]);

  // ── Derived data ──
  const unassigned = useMemo(() =>
    cleanings.filter((c) => !c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED"),
    [cleanings]
  );
  const assigned = useMemo(() =>
    cleanings.filter((c) => c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED"),
    [cleanings]
  );
  const zones = useMemo(() => {
    const s = new Set<string>();
    cleanings.forEach((c) => s.add(c.propertyZona || "Altro"));
    return Array.from(s);
  }, [cleanings]);
  const filtered = useMemo(() => {
    if (filterZone === "Tutte") return unassigned;
    return unassigned.filter((c) => c.propertyZona === filterZone);
  }, [unassigned, filterZone]);
  const activeOps = useMemo(() => operators.filter((op) => op.status === "ACTIVE"), [operators]);
  const activeOpsRef = useRef(activeOps);
  useEffect(() => { activeOpsRef.current = activeOps; }, [activeOps]);
  const propertyCoordsRef = useRef(propertyCoords);
  useEffect(() => { propertyCoordsRef.current = propertyCoords; }, [propertyCoords]);
  const propertyTimesRef = useRef(propertyTimes);
  useEffect(() => { propertyTimesRef.current = propertyTimes; }, [propertyTimes]);
  const progress = cleanings.length > 0 ? Math.round((assigned.length / cleanings.length) * 100) : 0;

  // ═══════════════════════════════════════════════════════════════
  // AZIONI DRAFT — tutto locale, niente Firestore
  // ═══════════════════════════════════════════════════════════════
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // handleAssign usa functional setState per evitare stale closures
  // addToExisting=true → aggiunge un secondo operatore senza rimuovere il primo
  const handleAssign = useCallback((cleaningId: string, operatorId: string, operatorName: string, addToExisting: boolean = false) => {
    // Check duplicato server
    const serverCl = serverCleaningsRef.current.find(c => c.id === cleaningId);
    if (serverCl?.operatorId === operatorId || serverCl?.operators?.some(o => o.id === operatorId)) {
      showToast("Già assegnata a questo operatore");
      return;
    }

    setDrafts(prev => {
      // Check duplicato nelle bozze esistenti
      if (prev.some(d => d.cleaningId === cleaningId && d.operatorId === operatorId)) {
        return prev;
      }
      if (addToExisting) {
        // Modalità AGGIUNGI: mantieni le bozze esistenti per questa pulizia
        let updated = [...prev];
        // Se non ci sono ancora bozze per questa pulizia ma c'è un operatore server,
        // crea una bozza anche per l'operatore server (per preservarlo)
        const hasExistingDrafts = prev.some(d => d.cleaningId === cleaningId);
        if (!hasExistingDrafts && serverCl) {
          const serverOps = serverCl.operators?.length 
            ? serverCl.operators 
            : (serverCl.operatorId ? [{ id: serverCl.operatorId, name: serverCl.operatorName || '' }] : []);
          for (const sOp of serverOps) {
            if (sOp.id !== operatorId) {
              updated.push({ cleaningId, operatorId: sOp.id, operatorName: sOp.name });
            }
          }
        }
        updated.push({ cleaningId, operatorId, operatorName });
        return updated;
      } else {
        // Modalità SOSTITUISCI: rimuovi vecchie bozze e aggiungi la nuova
        const withoutThis = prev.filter(d => d.cleaningId !== cleaningId);
        return [...withoutThis, { cleaningId, operatorId, operatorName }];
      }
    });

    showToast(addToExisting ? `✏️ +${operatorName} aggiunto` : `✏️ Bozza: ${operatorName}`);
    setSheetCleaningId(null);
  }, []); // no deps — usa ref per serverCleanings, functional setState per drafts

  const handleUnassign = useCallback((cleaningId: string, operatorId?: string) => {
    // Controlla se ci sono bozze per questa pulizia
    const cleaningDrafts = draftsRef.current.filter(d => d.cleaningId === cleaningId);
    
    if (cleaningDrafts.length > 0) {
      if (operatorId && cleaningDrafts.length > 1) {
        // Multi-operatore: rimuovi solo l'operatore specifico dalla bozza
        setDrafts(prev => prev.filter(d => !(d.cleaningId === cleaningId && d.operatorId === operatorId)));
        showToast("Operatore rimosso dalla bozza");
      } else {
        // Singolo operatore o nessun operatorId: rimuovi tutte le bozze per questa pulizia
        setDrafts(prev => prev.filter(d => d.cleaningId !== cleaningId));
        showToast("Bozza rimossa");
      }
      return;
    }

    // Se è assegnata sul server, rimuovi direttamente
    const serverCl = serverCleaningsRef.current.find(c => c.id === cleaningId);
    if (serverCl?.operatorId) {
      handleServerUnassign(cleaningId, operatorId || serverCl.operatorId);
    }
  }, []); // no deps — usa refs

  const handleServerUnassign = async (cleaningId: string, operatorId: string) => {
    try {
      const res = await fetch(`/api/cleanings/${cleaningId}/assign`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId }),
      });
      if (res.ok) {
        showToast("Assegnazione rimossa");
      } else {
        const err = await res.json();
        showToast(`Errore: ${err.error || "Errore rimozione"}`);
      }
    } catch (e) {
      showToast(`Errore: ${e instanceof Error ? e.message : "Errore"}`);
    }
  };

  const handleChangeTime = useCallback((cleaningId: string, newTime: string) => {
    setDraftTimeChanges(prev => {
      const next = new Map(prev);
      const serverCl = serverCleaningsRef.current.find(c => c.id === cleaningId);
      if (serverCl && serverCl.scheduledTime === newTime) {
        next.delete(cleaningId);
      } else {
        next.set(cleaningId, newTime);
      }
      return next;
    });

    setDrafts(prev => prev.map(d =>
      d.cleaningId === cleaningId ? { ...d, scheduledTime: newTime } : d
    ));

    showToast(`✏️ Orario bozza: ${newTime}`);
    setShowTimePickerFor(null);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // AUTO-ASSIGN — Logica interamente client-side
  // Opzionalmente arricchita da API (durate storiche, familiarità)
  // ═══════════════════════════════════════════════════════════════

  const handleAutoAssignAll = useCallback(async () => {
    const currentServer = serverCleaningsRef.current;
    const currentDrafts = draftsRef.current;
    const currentTimeChanges = draftTimeRef.current;

    // ── Ricostruisci stato effettivo ──
    const effective = currentServer.map(c => ({ ...c }));
    for (const [cid, nt] of currentTimeChanges) {
      const idx = effective.findIndex(c => c.id === cid);
      if (idx >= 0) effective[idx] = { ...effective[idx], scheduledTime: nt };
    }
    const draftsByClId = new Map<string, DraftAssignment[]>();
    for (const d of currentDrafts) {
      const arr = draftsByClId.get(d.cleaningId) || [];
      arr.push(d);
      draftsByClId.set(d.cleaningId, arr);
    }
    for (const [cid, cDrafts] of draftsByClId) {
      const idx = effective.findIndex(c => c.id === cid);
      if (idx >= 0) {
        effective[idx] = { ...effective[idx], operatorId: cDrafts[0]!.operatorId, operatorName: cDrafts[0]!.operatorName, status: "ASSIGNED" };
        if (cDrafts[0]?.estimatedDuration) effective[idx].estimatedDuration = cDrafts[0].estimatedDuration;
      }
    }

    const unassignedList = effective.filter(c => !c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED");
    if (unassignedList.length === 0) { showToast("Tutte le pulizie sono già assegnate"); return; }

    const assignedList = effective.filter(c => c.operatorId && c.status !== "COMPLETED" && c.status !== "CANCELLED");
    const opsActive = activeOps.filter(op => op.status === "ACTIVE");
    if (opsActive.length === 0) { showToast("Nessun operatore attivo"); return; }

    setIsAutoAssigning(true);

    // ── Arricchimento opzionale da API ──
    const propIds = [...new Set(effective.map(c => c.propertyId).filter(Boolean))];
    const opIds = opsActive.map(o => o.id);

    let historicalDurations: Record<string, number> = {};
    let familiarityData: Record<string, number> = {};
    let checkInTimes: Record<string, string> = {};

    try {
      const res = await fetch("/api/assignments/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyIds: propIds, operatorIds: opIds }),
      });
      if (res.ok) {
        const enrichment = await res.json();
        historicalDurations = enrichment.durations || {};
        familiarityData = enrichment.familiarity || {};
        checkInTimes = enrichment.checkInTimes || {};
        console.log("📊 Enrichment OK:", Object.keys(historicalDurations).length, "durate,", Object.keys(familiarityData).length, "familiarità");
      }
    } catch (e) {
      console.warn("⚠️ Enrichment API failed, using local data only:", e);
    }

    // ── COSTANTI ──
    const MIN_TRAVEL = 15;
    const ROAD_FACTOR = 1.4;
    const CHECKIN_BUFFER = 15;

    // ── HELPERS ──
    const toM = (t: string) => { const p = t.split(":"); return (parseInt(p[0]||"0"))*60 + (parseInt(p[1]||"0")); };
    const toT = (m: number) => `${Math.floor(m/60).toString().padStart(2,"0")}:${(m%60).toString().padStart(2,"0")}`;
    const r15 = (m: number) => Math.ceil(m / 15) * 15;

    const travelMin = (from: { lat: number; lng: number }, to: { lat: number; lng: number }): number => {
      const km = calculateDistance(from, to) * ROAD_FACTOR;
      if (km < 1) return Math.max(MIN_TRAVEL, Math.ceil(km * 12));
      if (km < 3) return Math.max(MIN_TRAVEL, Math.ceil(km * 8));
      return Math.max(MIN_TRAVEL, Math.ceil(km * 5) + 10);
    };

    const pxScore = (km: number): number => {
      if (km < 0.5) return 30; if (km < 1) return 27; if (km < 1.5) return 24;
      if (km < 2) return 21; if (km < 3) return 18; if (km < 4) return 15;
      if (km < 5) return 12; if (km < 7) return 9; if (km < 10) return 6;
      if (km < 15) return 3; return 0;
    };

    // Normalizza durata: Firestore mix minuti/ore
    const normDur = (v: number | undefined): number => {
      if (!v || v <= 0) return 1.5;
      return v > 10 ? v / 60 : v;
    };

    // Calcola durata effettiva (storica > stimata > fallback)
    const getDuration = (c: Cleaning): number => {
      const hist = historicalDurations[c.propertyId];
      if (hist) return hist / 60; // minuti → ore
      return normDur(c.estimatedDuration);
    };

    // Calcola deadline (checkin dalla pulizia, o dalla proprietà, o 18:00)
    const getDeadline = (c: Cleaning, globalMax: number): number => {
      const ciFromCleaning = c.checkinTime ? toM(c.checkinTime) : 0;
      const ciFromProperty = checkInTimes[c.propertyId] ? toM(checkInTimes[c.propertyId]!) : 0;
      const ci = ciFromCleaning || ciFromProperty;
      if (ci > 0) return Math.min(globalMax, ci - CHECKIN_BUFFER);
      return globalMax;
    };

    // ── SLOT per ogni operatore ──
    interface Slot { start: number; end: number; coords?: { lat: number; lng: number }; propId: string; }

    const opSlots = new Map<string, Slot[]>();
    for (const op of opsActive) opSlots.set(op.id, []);

    // Popola con assegnazioni esistenti
    for (const c of assignedList) {
      const slots = opSlots.get(c.operatorId!);
      if (!slots) continue;
      const start = toM(c.scheduledTime);
      const dur = getDuration(c);
      slots.push({ start, end: start + Math.round(dur * 60), coords: c.propertyCoordinates, propId: c.propertyId });
    }
    for (const [, s] of opSlots) s.sort((a, b) => a.start - b.start);

    // ── GAP-FINDING ──
    const findSlot = (slots: Slot[], durM: number, minS: number, maxE: number, coords?: { lat: number; lng: number }): { start: number; afterIdx: number } | null => {
      if (slots.length === 0) {
        const s = r15(minS);
        return (s + durM <= maxE) ? { start: s, afterIdx: -1 } : null;
      }
      // Prima del primo
      { const s = r15(minS); let tv = MIN_TRAVEL;
        if (coords && slots[0]!.coords) tv = travelMin(coords, slots[0]!.coords);
        if (s + durM <= maxE && s + durM + tv <= slots[0]!.start) return { start: s, afterIdx: -1 };
      }
      // Buchi
      for (let i = 0; i < slots.length - 1; i++) {
        let tvFrom = MIN_TRAVEL; if (slots[i]!.coords && coords) tvFrom = travelMin(slots[i]!.coords, coords);
        const s = r15(Math.max(minS, slots[i]!.end + tvFrom));
        let tvTo = MIN_TRAVEL; if (coords && slots[i+1]!.coords) tvTo = travelMin(coords, slots[i+1]!.coords);
        if (s + durM <= maxE && s + durM + tvTo <= slots[i+1]!.start) return { start: s, afterIdx: i };
      }
      // Dopo l'ultimo
      { const last = slots[slots.length-1]!; let tv = MIN_TRAVEL;
        if (last.coords && coords) tv = travelMin(last.coords, coords);
        const s = r15(Math.max(minS, last.end + tv));
        return (s + durM <= maxE) ? { start: s, afterIdx: slots.length - 1 } : null;
      }
    };

    // ═══════════════════════════════════════════════════════════
    // ALGORITMO v7: ROUND-ROBIN BILANCIATO + CLUSTERING GPS
    //
    // Fase 1: Calcola quante pulizie spettano a ogni operatore
    // Fase 2: Per ogni "round" assegna 1 pulizia all'operatore
    //         con meno pulizie, scegliendo quella più vicina
    //         alla sua ultima posizione
    // Fase 3: Pulizie rimaste → forzate su chi ha spazio
    // ═══════════════════════════════════════════════════════════

    const MAX_END_NORMAL = 15.5 * 60;  // obiettivo: finire entro 15:30
    const MAX_END_EXTENDED = 18 * 60;  // esteso: 18:00
    const MAX_END_FORCED = 20 * 60;    // forzato: 20:00

    // Calcola l'orario di fine più presto per una pulizia su un operatore
    const getEarliestEnd = (opId: string, cl: Cleaning): { start: number; end: number } | null => {
      const dur = getDuration(cl);
      const durM = Math.round(dur * 60);
      const minS = toM(cl.scheduledTime);
      const slots = opSlots.get(opId) || [];
      
      // Prova con deadline progressivamente più larga
      for (const maxE of [MAX_END_NORMAL, MAX_END_EXTENDED, MAX_END_FORCED]) {
        const slot = findSlot(slots, durM, minS, maxE, cl.propertyCoordinates);
        if (slot) return { start: slot.start, end: slot.start + durM };
      }
      return null;
    };

    // Distanza tra l'ultima pulizia di un operatore e una nuova
    const getDistanceToOp = (opId: string, cl: Cleaning): number => {
      const slots = opSlots.get(opId) || [];
      if (slots.length === 0 || !cl.propertyCoordinates) return 999;
      const last = slots[slots.length - 1]!;
      if (!last.coords) return 999;
      return calculateDistance(last.coords, cl.propertyCoordinates) * ROAD_FACTOR;
    };

    const allResults: DraftAssignment[] = [];
    const assignedSet = new Set<string>();
    const remainingPool = [...unassignedList];

    // ── FASE 1: Round-Robin — assegna 1 pulizia per round all'operatore più scarico ──
    let maxRounds = Math.ceil(remainingPool.length / Math.max(1, opsActive.length)) + 2;
    
    for (let round = 0; round < maxRounds && remainingPool.filter(c => !assignedSet.has(c.id)).length > 0; round++) {
      // Ordina operatori per carico (meno pulizie → prima)
      const opsByLoad = [...opsActive].sort((a, b) => {
        const aSlots = (opSlots.get(a.id) || []).length;
        const bSlots = (opSlots.get(b.id) || []).length;
        return aSlots - bSlots;
      });

      for (const op of opsByLoad) {
        const available = remainingPool.filter(c => !assignedSet.has(c.id));
        if (available.length === 0) break;

        // Per questo operatore, trova la pulizia MIGLIORE:
        // 1. Che ci sta nella sua schedule
        // 2. Più vicina alla sua ultima posizione (clustering)
        // 3. Che finisce prima possibile
        let bestCl: Cleaning | null = null;
        let bestStart = 0;
        let bestEnd = Infinity;
        let bestDist = Infinity;

        for (const cl of available) {
          const result = getEarliestEnd(op.id, cl);
          if (!result) continue;

          const dist = getDistanceToOp(op.id, cl);
          
          // Score: preferisci vicine + che finiscono presto
          // Distanza < 2km → priorità massima (cluster)
          // A parità di cluster, preferisci chi finisce prima
          const isNear = dist < 2;
          const isMed = dist < 5;
          
          let isBetter = false;
          if (!bestCl) {
            isBetter = true;
          } else if (isNear && bestDist >= 2) {
            isBetter = true; // vicina batte lontana
          } else if (isNear && bestDist < 2) {
            isBetter = result.end < bestEnd; // entrambe vicine → chi finisce prima
          } else if (isMed && bestDist >= 5) {
            isBetter = true; // media batte lontana
          } else if (!isNear && !isMed && bestDist >= 5) {
            isBetter = result.end < bestEnd; // entrambe lontane → chi finisce prima
          } else {
            isBetter = result.end < bestEnd; // default: chi finisce prima
          }

          if (isBetter) {
            bestCl = cl;
            bestStart = result.start;
            bestEnd = result.end;
            bestDist = dist;
          }
        }

        if (bestCl) {
          const dur = getDuration(bestCl);
          const durM = Math.round(dur * 60);
          
          allResults.push({
            cleaningId: bestCl.id,
            operatorId: op.id,
            operatorName: op.name,
            scheduledTime: toT(bestStart),
            estimatedDuration: roundDur(dur),
          });

          const slots = opSlots.get(op.id)!;
          slots.push({ start: bestStart, end: bestStart + durM, coords: bestCl.propertyCoordinates, propId: bestCl.propertyId });
          slots.sort((a, b) => a.start - b.start);
          
          assignedSet.add(bestCl.id);
        }
      }
    }

    // ── FASE 2: Pulizie rimaste — forzale su chi ha spazio (ignora bilanciamento) ──
    const stillRemaining = remainingPool.filter(c => !assignedSet.has(c.id));
    if (stillRemaining.length > 0) {
      for (const cl of stillRemaining) {
        const dur = getDuration(cl);
        const durM = Math.round(dur * 60);
        const minS = toM(cl.scheduledTime);

        let bestOp: string | null = null;
        let bestStart = 0;
        let bestEndTime = Infinity;

        for (const op of opsActive) {
          const slots = opSlots.get(op.id) || [];
          const slot = findSlot(slots, durM, minS, MAX_END_FORCED, cl.propertyCoordinates);
          if (!slot) continue;
          const endTime = slot.start + durM;
          if (endTime < bestEndTime) {
            bestEndTime = endTime;
            bestOp = op.id;
            bestStart = slot.start;
          }
        }

        if (bestOp) {
          allResults.push({
            cleaningId: cl.id,
            operatorId: bestOp,
            operatorName: opsActive.find(o => o.id === bestOp)?.name || "Op",
            scheduledTime: toT(bestStart),
            estimatedDuration: roundDur(dur),
          });

          const slots = opSlots.get(bestOp)!;
          slots.push({ start: bestStart, end: bestStart + durM, coords: cl.propertyCoordinates, propId: cl.propertyId });
          slots.sort((a, b) => a.start - b.start);
          assignedSet.add(cl.id);
        }
      }
    }

    // Log debug
    const finalRem = remainingPool.filter(c => !assignedSet.has(c.id));
    if (finalRem.length > 0) {
      console.warn("⚠️ Impossibili:", finalRem.map(c => ({ name: c.propertyName, checkout: c.scheduledTime })));
    }
    // Log distribuzione
    console.log("📊 Distribuzione:", opsActive.map(op => `${op.name.split(" ")[0]}:${(opSlots.get(op.id)||[]).length}`).join(", "));

    const allDrafts = allResults;

    if (allDrafts.length === 0) {
      showToast("Nessuna assegnazione possibile");
      setIsAutoAssigning(false);
      return;
    }

    // ── Applica bozze ──
    const unassIds = new Set(unassignedList.map(c => c.id));
    const newTimeChanges = new Map(currentTimeChanges);
    for (const d of allDrafts) {
      const serverCl = currentServer.find(c => c.id === d.cleaningId);
      if (serverCl && serverCl.scheduledTime !== d.scheduledTime) {
        newTimeChanges.set(d.cleaningId, d.scheduledTime!);
      }
    }

    const mergedDrafts = [...currentDrafts.filter(d => !unassIds.has(d.cleaningId)), ...allDrafts];
    setDrafts(mergedDrafts);
    setDraftTimeChanges(newTimeChanges);

    const remCount = remainingPool.length - assignedSet.size;
    const remLabel = remCount > 0 ? ` ⚠️${remCount} impossibili` : "";
    showToast(`✏️ ${allDrafts.length} bozze — tutte assegnate!${remLabel}`);
    setIsAutoAssigning(false);
  }, [activeOps, selectedDate]);

  const handleDiscardDrafts = useCallback(() => {
    if (!window.confirm("Scartare tutte le bozze non confermate?")) return;
    setDrafts([]);
    setDraftTimeChanges(new Map());
    showToast("Bozze scartate");
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // CONFERMA BATCH
  // ═══════════════════════════════════════════════════════════════
  const handleConfirmAll = async () => {
    setIsConfirming(true);
    try {
      const currentDrafts = draftsRef.current;
      const currentTimeChanges = draftTimeRef.current;
      const currentDraftIds = new Set(currentDrafts.map(d => d.cleaningId));

      // 1) Salva i cambi orario che NON hanno anche un'assegnazione bozza
      const timeOnlyChanges = [...currentTimeChanges.entries()]
        .filter(([cleaningId]) => !currentDraftIds.has(cleaningId));

      for (const [cleaningId, newTime] of timeOnlyChanges) {
        try {
          await updateDoc(doc(db, "cleanings", cleaningId), { scheduledTime: newTime });
        } catch (e) {
          console.error(`Errore cambio orario ${cleaningId}:`, e);
        }
      }

      // 2) Batch assign tramite API
      if (currentDrafts.length > 0) {
        const assignments = currentDrafts.map(d => ({
          cleaningId: d.cleaningId,
          operatorId: d.operatorId,
          operatorName: d.operatorName,
          scheduledTime: d.scheduledTime || currentTimeChanges.get(d.cleaningId),
          estimatedDuration: d.estimatedDuration,
        }));

        const res = await fetch("/api/cleanings/batch-assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignments }),
        });

        const data = await res.json();

        if (res.ok) {
          showToast(`✅ ${data.successCount} pulizie assegnate e notificate!`);
        } else {
          showToast(`Errore: ${data.error || "Errore conferma"}`);
        }
      } else if (timeOnlyChanges.length > 0) {
        showToast("✅ Orari aggiornati!");
      }

      // 3) Pulisci bozze
      setDrafts([]);
      setDraftTimeChanges(new Map());
      setShowConfirmModal(false);
    } catch (e) {
      showToast(`Errore: ${e instanceof Error ? e.message : "Errore"}`);
    } finally {
      setIsConfirming(false);
    }
  };

  // ── Drag (desktop only) ──
  const handleDragStart = (c: Cleaning, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", c.id);
    draggingRef.current = c;
    requestAnimationFrame(() => setDragging(c));
  };
  const handleDragEnd = () => {
    draggingRef.current = null;
    setDragging(null);
    setDropTarget(null);
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, opId: string, opName: string) => {
    e.preventDefault();
    const draggedCleaning = draggingRef.current;
    if (!draggedCleaning) return;
    draggingRef.current = null;
    setDragging(null);
    setDropTarget(null);
    handleAssign(draggedCleaning.id, opId, opName);
  };

  if (!mounted) return <div className="flex items-center justify-center h-96"><div className="animate-spin w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full" /></div>;

  // ═══════════════════════════════════════════════════════════════
  // SHARED SUBCOMPONENTS
  // ═══════════════════════════════════════════════════════════════

  const DraftBadge = () => (
    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse">
      BOZZA
    </span>
  );

  const CleaningCard = ({ c, mode }: { c: Cleaning; mode: "drag" | "tap" }) => {
    const isDraft = draftCleaningIds.has(c.id);
    const hasTimeChange = draftTimeCleaningIds.has(c.id);
    return (
      <div
        draggable={mode === "drag"}
        onDragStart={mode === "drag" ? (e) => handleDragStart(c, e) : undefined}
        onDragEnd={mode === "drag" ? handleDragEnd : undefined}
        onClick={mode === "tap" ? () => { setSheetCleaningId(c.id); setSheetAddMode(false); } : undefined}
        className={`bg-white border rounded-xl p-3 mb-2 border-l-4 select-none ${
          mode === "tap" ? "transition-all" : ""
        } ${
          c.urgent ? "border-l-red-500" : "border-l-emerald-500"
        } ${mode === "drag" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer active:scale-[0.98]"} ${
          dragging?.id === c.id ? "opacity-30" : ""
        } ${mode === "tap" && sheetCleaningId === c.id ? "ring-2 ring-violet-400 bg-violet-50" : "border-slate-200"} ${
          isDraft || hasTimeChange ? "ring-2 ring-amber-300 bg-amber-50/30" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {c.urgent && <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded">URGENTE</span>}
            {(isDraft || hasTimeChange) && <DraftBadge />}
            {mode === "tap" ? (
              <button
                onClick={(e) => { e.stopPropagation(); setShowTimePickerFor(c.id); }}
                className="text-lg font-bold text-amber-600 hover:text-amber-700"
              >{c.scheduledTime}</button>
            ) : (
              <span className="text-lg font-bold text-amber-600">{c.scheduledTime}</span>
            )}
          </div>
          <span className="text-xs text-slate-400">{fmtDur(c.estimatedDuration)}</span>
        </div>
        <div className="font-semibold text-sm text-slate-800 truncate">{c.propertyName}</div>
        <div className="text-xs text-slate-400 truncate">{c.propertyAddress}</div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="bg-violet-100 text-violet-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">{c.propertyZona || "—"}</span>
          {c.guestsCount && <span className="text-[11px] text-slate-400">{c.guestsCount} ospiti</span>}
        </div>
        {mode === "tap" && <div className="text-[10px] text-violet-500 font-medium mt-1.5">Tap per assegnare ›</div>}
        {mode === "drag" && <div className="text-[10px] text-slate-300 mt-1.5">⠿ Trascina su un operatore</div>}
      </div>
    );
  };

  const AssignedItem = ({ c, opId, color }: { c: Cleaning; opId: string; color: typeof OP_COLORS[0] }) => {
    const isDraft = draftCleaningIds.has(c.id);
    const hasTimeChange = draftTimeCleaningIds.has(c.id);
    const otherOps = (c.operators || []).filter(o => o.id !== opId);
    return (
      <div className={`flex items-center gap-2 p-2 border rounded-lg mb-1.5 border-l-4 ${color.border} ${
        isDraft || hasTimeChange ? "bg-amber-50/50 ring-1 ring-amber-300" : "bg-slate-50 border-slate-200"
      }`}>
        <button onClick={() => setShowTimePickerFor(c.id)} className="font-bold text-sm text-emerald-600 hover:text-emerald-700 min-w-[42px]">
          {c.scheduledTime}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {(isDraft || hasTimeChange) && <DraftBadge />}
            <span className="font-medium text-xs text-slate-700 truncate">{c.propertyName}</span>
          </div>
          <div className="text-[10px] text-slate-400">
            {c.propertyZona} · {fmtDur(c.estimatedDuration)}
            {otherOps.length > 0 && (
              <span className="text-violet-500 font-semibold"> · +{otherOps.map(o => o.name.split(' ')[0]).join(', ')}</span>
            )}
          </div>
        </div>
        <button 
          onClick={() => { setSheetCleaningId(c.id); setSheetAddMode(true); }}
          className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-500 hover:bg-emerald-100 flex items-center justify-center text-sm font-bold flex-shrink-0"
          title="Aggiungi operatore"
        >+</button>
        <button onClick={() => handleUnassign(c.id, opId)} className="w-6 h-6 rounded-md bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center text-xs flex-shrink-0">✕</button>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════
  const goDay = (offset: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + offset);
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };
  const isToday = (() => {
    const d = new Date();
    return selectedDate === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const formatDateLabel = (ds: string): string => {
    const d = new Date(ds + "T12:00:00");
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const openDatePicker = () => setShowCalendar(!showCalendar);

  // ── Calendario custom dropdown ──
  const CalendarDropdown = () => {
    const sel = new Date(selectedDate + "T12:00:00");
    const [calMonth, setCalMonth] = useState(sel.getMonth());
    const [calYear, setCalYear] = useState(sel.getFullYear());
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // 0=Lun
    const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
    const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

    const goMonth = (d: number) => {
      let m = calMonth + d, y = calYear;
      if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
      setCalMonth(m); setCalYear(y);
    };

    const pickDay = (day: number) => {
      const ds = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      setSelectedDate(ds);
      setShowCalendar(false);
    };

    const cells: { day: number; current: boolean }[] = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: prevMonthDays - firstDow + 1 + i, current: false });
    for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, current: true });
    const remain = 7 - (cells.length % 7); if (remain < 7) for (let i = 1; i <= remain; i++) cells.push({ day: i, current: false });

    return (
      <Portal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30" onClick={() => setShowCalendar(false)}>
          <div onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 w-[300px]"
              style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)" }}>
              {/* Header mese */}
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => goMonth(-1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-slate-800">{monthNames[calMonth]}</span>
                  <span className="text-sm text-slate-400">{calYear}</span>
                </div>
                <button onClick={() => goMonth(1)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
              {/* Giorni settimana */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {["Lu","Ma","Me","Gi","Ve","Sa","Do"].map(d => (
                  <div key={d} className="text-center text-[10px] font-medium text-slate-400 py-1">{d}</div>
                ))}
              </div>
              {/* Griglia giorni */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((c, i) => {
                  const ds = c.current ? `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(c.day).padStart(2, "0")}` : "";
                  const isSelected = ds === selectedDate;
                  const isToday2 = ds === todayStr;
                  return (
                    <button key={i} onClick={() => c.current && pickDay(c.day)}
                      className={`h-9 rounded-xl text-xs font-medium transition-all ${
                        !c.current ? "text-slate-300 cursor-default" :
                        isSelected ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/25" :
                        isToday2 ? "bg-violet-50 text-violet-600 font-semibold ring-1 ring-violet-200" :
                        "text-slate-600 hover:bg-slate-50"
                      }`}>
                      {c.day}
                    </button>
                  );
                })}
              </div>
              {/* Footer */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <button onClick={() => setShowCalendar(false)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Chiudi</button>
                <button onClick={() => { setSelectedDate(todayStr); setShowCalendar(false); setCalMonth(today.getMonth()); setCalYear(today.getFullYear()); }}
                  className="text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors">
                  Oggi
                </button>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    );
  };

  const Header = () => {
    const dayName = (() => {
      const d = new Date(selectedDate + "T12:00:00");
      return ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"][d.getDay()];
    })();

    return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-40 flex-shrink-0">
      {/* ── MOBILE ── */}
      {isMobile ? (
        <div className="px-3 py-2 space-y-3">
          {/* Riga 1: Tabs + Auto */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-xl p-0.5 flex-1">
              {(["kanban", "timeline", "mappa"] as const).map((v) => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                    viewMode === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
                  }`}>
                  {v === "kanban" && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="10" rx="1.5"/></svg>}
                  {v === "timeline" && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>}
                  {v === "mappa" && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>}
                  {v === "kanban" ? "Kanban" : v === "timeline" ? "Timeline" : "Mappa"}
                </button>
              ))}
            </div>
            <button onClick={handleAutoAssignAll} disabled={filtered.length === 0 || isAutoAssigning}
              className="bg-gradient-to-r from-slate-500 to-slate-600 text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40 flex items-center gap-1 flex-shrink-0">
              {isAutoAssigning ? <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : null}
              Auto ({filtered.length})
            </button>
          </div>
          {/* Riga 2: Calendario centrato */}
          <div className="flex items-center justify-center">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl">
              <button onClick={() => goDay(-1)} className="px-3 py-1.5 active:bg-slate-200 transition-colors rounded-l-xl">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button onClick={openDatePicker} className={`px-4 py-1.5 text-sm font-semibold border-l border-r border-slate-200 flex items-center gap-1.5 ${isToday ? "text-violet-600" : "text-slate-700"}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={isToday ? "text-violet-400" : "text-slate-300"}>
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {isToday ? "Oggi" : `${dayName} ${formatDateLabel(selectedDate)}`}
              </button>
              <button onClick={() => goDay(1)} className="px-3 py-1.5 active:bg-slate-200 transition-colors rounded-r-xl">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
            <button onClick={() => {
                const d = new Date();
                setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
              }} className={`ml-2 px-2.5 py-1.5 text-[10px] font-bold text-violet-600 bg-violet-50 rounded-lg ${isToday ? "invisible" : ""}`}>
                OGGI
              </button>
          </div>
          {/* Bozze mobile */}
          {hasDrafts && (
            <div className="flex gap-2">
              <button onClick={handleDiscardDrafts} className="flex-1 bg-red-100 text-red-600 py-2 rounded-xl text-xs font-bold">
                Scarta ({drafts.length + draftTimeChanges.size})
              </button>
              <button onClick={() => setShowConfirmModal(true)} className="flex-1 bg-emerald-500 text-white py-2 rounded-xl text-xs font-bold shadow-lg animate-pulse">
                Conferma ({drafts.length + draftTimeChanges.size})
              </button>
            </div>
          )}
        </div>
      ) : (
      /* ── DESKTOP ── */
      <div className="px-4 py-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl">
              <button onClick={() => goDay(-1)} className="px-2.5 py-2 hover:bg-slate-100 active:bg-slate-200 transition-colors rounded-l-xl">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div className="border-l border-r border-slate-200 flex items-center">
                <button onClick={openDatePicker} className={`px-3 py-1.5 text-sm font-semibold transition-colors min-w-[120px] text-center flex items-center justify-center gap-1.5 ${isToday ? "text-violet-600" : "text-slate-700"}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={isToday ? "text-violet-400" : "text-slate-300"}>
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {isToday ? "Oggi" : `${dayName} ${formatDateLabel(selectedDate)}`}
                </button>
                <button onClick={() => {
                    const d = new Date();
                    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                  }} className={`px-2 py-1.5 text-[10px] font-bold text-violet-500 hover:bg-violet-50 transition-colors border-l border-slate-200 ${isToday ? "invisible" : ""}`}>OGGI</button>
              </div>
              <button onClick={() => goDay(1)} className="px-2.5 py-2 hover:bg-slate-100 active:bg-slate-200 transition-colors rounded-r-xl">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
            <div className="flex bg-slate-100 rounded-xl p-0.5">
              {(["kanban", "timeline", "mappa"] as const).map((v) => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                    viewMode === v ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"
                  }`}>
                  {v === "kanban" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={viewMode === v ? "text-slate-600" : "text-slate-400"}><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="10" rx="1.5"/></svg>}
                  {v === "timeline" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={viewMode === v ? "text-slate-600" : "text-slate-400"}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>}
                  {v === "mappa" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={viewMode === v ? "text-slate-600" : "text-slate-400"}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>}
                  {v === "kanban" ? "Kanban" : v === "timeline" ? "Timeline" : "Mappa"}
                </button>
              ))}
            </div>
            <select value={filterZone} onChange={(e) => setFilterZone(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-medium">
              <option value="Tutte">Tutte le zone</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-4 text-sm mr-2">
              <div className="text-center"><div className="text-lg font-bold text-red-500">{unassigned.length}</div><div className="text-[10px] text-slate-400">DA FARE</div></div>
              <div className="text-center"><div className="text-lg font-bold text-emerald-500">{assigned.length}</div><div className="text-[10px] text-slate-400">FATTE</div></div>
              <div className="text-center"><div className="text-lg font-bold text-violet-500">{progress}%</div><div className="text-[10px] text-slate-400">PROGRESSO</div></div>
            </div>
            <button onClick={handleAutoAssignAll} disabled={filtered.length === 0 || isAutoAssigning}
              className="bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 text-white px-3 py-2 rounded-xl text-sm font-bold disabled:opacity-40 shadow-sm flex items-center gap-1.5">
              {isAutoAssigning ? <><div className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> Calcolo...</> : <>Auto ({filtered.length})</>}
            </button>
            {hasDrafts && (
              <>
                <button onClick={handleDiscardDrafts} className="bg-red-100 text-red-600 hover:bg-red-200 px-3 py-2 rounded-xl text-sm font-bold transition-all">
                  Scarta ({drafts.length + draftTimeChanges.size})
                </button>
                <button onClick={() => setShowConfirmModal(true)}
                  className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30 animate-pulse">
                  Conferma ({drafts.length + draftTimeChanges.size})
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
  };

  // ═══════════════════════════════════════════════════════════════
  // SIDEBAR
  // ═══════════════════════════════════════════════════════════════
  const Sidebar = ({ mode }: { mode: "drag" | "tap" }) => (
    <div className="w-80 min-w-[320px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <div className="p-3 border-b border-slate-200 bg-red-50/50 flex items-center gap-2">
        <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
        <span className="font-bold text-sm text-slate-700">Da Assegnare</span>
        <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{filtered.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12"><div className="text-4xl mb-2">🎉</div><p className="text-sm text-slate-400">Tutto assegnato!</p></div>
        ) : filtered.map((c) => <CleaningCard key={c.id} c={c} mode={mode} />)}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // KANBAN VIEW
  // ═══════════════════════════════════════════════════════════════
  const KanbanDesktop = () => (
    <div className="flex" style={{ height: "calc(100vh - 120px)" }}>
      <Sidebar mode="drag" />
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {activeOps.map((op) => {
            const color = getColor(op.colorIndex || 0);
            const opCl = op.todayCleanings.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
            const hours = Math.round(opCl.reduce((s, c) => s + (c.estimatedDuration || 2), 0) * 10) / 10;
            const hasDraftItems = opCl.some(c => draftCleaningIds.has(c.id) || draftTimeCleaningIds.has(c.id));
            return (
              <div key={op.id}
                onDragOver={handleDragOver}
                onDragEnter={() => setDropTarget(op.id)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => handleDrop(e, op.id, op.name)}
                className={`bg-white border-2 rounded-xl overflow-hidden flex flex-col transition-all ${
                  dropTarget === op.id ? `${color.border} ${color.ring} ring-2` : hasDraftItems ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"
                }`}
              >
                <div className={`${color.bg} p-3 text-white`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center font-bold text-sm">{op.name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{op.name}</div>
                      <div className="text-[11px] opacity-85">⭐ {op.rating?.toFixed(1)} · {op.preferredZone}</div>
                    </div>
                    {hasDraftItems && <span className="bg-amber-400 text-amber-900 text-[9px] font-bold px-1.5 py-0.5 rounded">BOZZE</span>}
                  </div>
                  <div className="flex gap-1.5">
                    <div className="flex-1 bg-white/15 rounded-lg py-1 text-center"><div className="font-bold text-sm">{opCl.length}</div><div className="text-[9px] opacity-70">pulizie</div></div>
                    <div className="flex-1 bg-white/15 rounded-lg py-1 text-center"><div className="font-bold text-sm">{hours}h</div><div className="text-[9px] opacity-70">lavoro</div></div>
                  </div>
                </div>
                <div className="flex-1 p-2 min-h-[60px]">
                  {opCl.map((c) => <AssignedItem key={c.id} c={c} opId={op.id} color={color} />)}
                  {opCl.length === 0 && (
                    <div className={`border-2 border-dashed rounded-lg p-4 text-center text-xs transition-all ${
                      dropTarget === op.id ? `${color.border} ${color.light} ${color.text}` : "border-slate-200 text-slate-300"
                    }`}>Trascina qui<br /><span className="text-[10px]">Zona: {op.preferredZone}</span></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const KanbanMobile = () => (
    <div className="pb-4">
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="font-bold text-xs text-slate-500 uppercase">Da Assegnare ({filtered.length})</span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-8"><div className="text-3xl mb-1">🎉</div><p className="text-sm text-slate-400">Tutto assegnato!</p></div>
        ) : filtered.map((c) => <CleaningCard key={c.id} c={c} mode="tap" />)}
      </div>
      <div className="px-3 mt-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full" />
          <span className="font-bold text-xs text-slate-500 uppercase">Team ({activeOps.length})</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {activeOps.map((op) => {
            const color = getColor(op.colorIndex || 0);
            const opCl = op.todayCleanings.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
            const hasDraftItems = opCl.some(c => draftCleaningIds.has(c.id));
            return (
              <div key={op.id} className={`bg-white border rounded-xl overflow-hidden ${hasDraftItems ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"}`}>
                <div className={`${color.bg} p-2.5 text-white flex items-center gap-2`}>
                  <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center font-bold text-xs">{op.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs truncate">{op.name}</div>
                    <div className="text-[10px] opacity-80">{op.preferredZone}</div>
                  </div>
                  <div className="text-lg font-bold">{opCl.length}</div>
                </div>
                <div className="p-1.5">
                  {opCl.map((c) => {
                    const isDraft = draftCleaningIds.has(c.id);
                    const otherOps = (c.operators || []).filter(o => o.id !== op.id);
                    return (
                      <div key={c.id} className={`flex items-center gap-1.5 py-1 px-1.5 text-[11px] rounded mb-1 ${isDraft ? "bg-amber-50 ring-1 ring-amber-200" : "bg-slate-50"}`}>
                        {isDraft && <span className="text-[8px] text-amber-600 font-bold">✏️</span>}
                        <span className="font-bold text-emerald-600">{c.scheduledTime}</span>
                        <span className="flex-1 truncate text-slate-600">
                          {c.propertyName}
                          {otherOps.length > 0 && <span className="text-violet-500"> +{otherOps.length}</span>}
                        </span>
                        <button onClick={() => { setSheetCleaningId(c.id); setSheetAddMode(true); }} className="text-emerald-500 text-[10px] font-bold">+</button>
                        <button onClick={() => handleUnassign(c.id, op.id)} className="text-red-400 text-[10px]">✕</button>
                      </div>
                    );
                  })}
                  {opCl.length === 0 && <div className="text-center py-2 text-[10px] text-slate-300">Nessuna pulizia</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // TIMELINE VIEW
  // ═══════════════════════════════════════════════════════════════
  const TimelineDesktop = () => (
    <div className="flex" style={{ height: "calc(100vh - 120px)" }}>
      <Sidebar mode="drag" />
      <div className="flex-1 overflow-x-auto overflow-y-auto p-4" style={{ minWidth: 0 }}>
        <div style={{ minWidth: `${176 + HOURS.length * 96 + 32}px` }}>
          <div className="flex mb-1 ml-44">
            {HOURS.map((h) => (
              <div key={h} className="w-24 text-center text-xs font-medium text-slate-400">{h}:00</div>
            ))}
          </div>
          <div className="space-y-1.5">
            {activeOps.map((op) => {
              const color = getColor(op.colorIndex || 0);
              const opCl = op.todayCleanings;
              return (
                <div key={op.id} className="flex items-center"
                  onDragOver={handleDragOver}
                  onDragEnter={() => setDropTarget(op.id)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => handleDrop(e, op.id, op.name)}
                >
                  <div className="w-44 flex-shrink-0 pr-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 ${color.bg} rounded-full flex items-center justify-center font-bold text-sm text-white shadow`}>{op.name.charAt(0)}</div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-700 truncate">{op.name}</div>
                        <div className="text-[11px] text-slate-400">{opCl.length} pul · {op.rating?.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>
                  <div className={`relative h-14 bg-slate-50 rounded-lg border transition-all ${
                    dropTarget === op.id ? `${color.border} ring-2 ${color.ring}` : "border-slate-200"
                  }`} style={{ width: `${HOURS.length * 96}px`, minWidth: `${HOURS.length * 96}px` }}>
                    <div className="absolute inset-0 flex">
                      {HOURS.map((_, i) => <div key={i} className="w-24 border-l border-slate-200/60" />)}
                    </div>
                    {opCl.map((c) => {
                      const startH = parseInt(c.scheduledTime.split(":")[0]);
                      const startM = parseInt(c.scheduledTime.split(":")[1]);
                      const left = (startH - 8) * 96 + (startM / 60) * 96;
                      const width = (c.estimatedDuration || 2) * 96;
                      const isDraft = draftCleaningIds.has(c.id) || draftTimeCleaningIds.has(c.id);
                      return (
                        <div key={c.id}
                          className={`absolute top-1 bottom-1 ${color.bg} rounded-lg shadow flex items-center px-2 text-white text-xs font-medium cursor-pointer hover:brightness-110 transition-all ${c.urgent ? "ring-2 ring-red-500" : ""} ${isDraft ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
                          style={{ left: `${left}px`, width: `${width}px` }}
                          onClick={() => setShowTimePickerFor(c.id)}
                          title={`${c.propertyName} - ${c.scheduledTime} (${fmtDur(c.estimatedDuration)})${isDraft ? " [BOZZA]" : ""}`}
                        >
                          <span className="truncate">{isDraft && "✏️ "}{c.scheduledTime} {c.propertyName}</span>
                        </div>
                      );
                    })}
                    {opCl.length === 0 && (
                      <div className={`absolute inset-1 border-2 border-dashed rounded-lg flex items-center justify-center text-xs transition-all ${
                        dropTarget === op.id ? `${color.border} ${color.text}` : "border-slate-200 text-slate-300"
                      }`}>Trascina qui</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-slate-400">
            <div className="flex items-center gap-1.5"><div className="w-4 h-3 bg-gradient-to-r from-pink-500 to-blue-500 rounded" /><span>Confermata</span></div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-3 border-2 border-dashed border-slate-300 rounded" /><span>Slot libero</span></div>
            <div className="flex items-center gap-1.5"><div className="w-4 h-3 bg-amber-400 rounded ring-2 ring-amber-300" /><span>Bozza</span></div>
          </div>
        </div>
      </div>
    </div>
  );

  const TimelineMobile = () => (
    <div className="pb-4">
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="font-bold text-xs text-slate-500 uppercase">Da Assegnare ({filtered.length})</span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-6"><div className="text-3xl mb-1">🎉</div><p className="text-sm text-slate-400">Tutto assegnato!</p></div>
        ) : filtered.map((c) => <CleaningCard key={c.id} c={c} mode="tap" />)}
      </div>
      <div className="px-3 mt-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full" />
          <span className="font-bold text-xs text-slate-500 uppercase">Timeline Team</span>
        </div>
        <div className="space-y-2">
          {activeOps.map((op) => {
            const color = getColor(op.colorIndex || 0);
            const opCl = op.todayCleanings.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
            const hours = Math.round(opCl.reduce((s, c) => s + (c.estimatedDuration || 2), 0) * 10) / 10;
            return (
              <div key={op.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className={`${color.bg} px-3 py-2 text-white flex items-center gap-2`}>
                  <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center font-bold text-xs">{op.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0"><div className="font-bold text-xs truncate">{op.name}</div><div className="text-[10px] opacity-80">{op.preferredZone}</div></div>
                  <div className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded">{opCl.length} pul · {hours}h</div>
                </div>
                <div className="px-2 py-2">
                  <div className="relative h-8 bg-slate-50 rounded border border-slate-200">
                    <div className="absolute inset-0 flex">
                      {[8,10,12,14,16,18].map((h) => (
                        <div key={h} className="flex-1 border-r border-slate-100 relative">
                          <span className="absolute -top-3.5 left-0 text-[8px] text-slate-300">{h}</span>
                        </div>
                      ))}
                    </div>
                    {opCl.map((c) => {
                      const startH = parseInt(c.scheduledTime.split(":")[0]);
                      const startM = parseInt(c.scheduledTime.split(":")[1]);
                      const leftPct = ((startH - 8 + startM / 60) / 10) * 100;
                      const widthPct = ((c.estimatedDuration || 2) / 10) * 100;
                      const isDraft = draftCleaningIds.has(c.id) || draftTimeCleaningIds.has(c.id);
                      return (
                        <div key={c.id}
                          className={`absolute top-0.5 bottom-0.5 ${color.bg} rounded text-white text-[9px] font-medium flex items-center px-1 overflow-hidden ${isDraft ? "ring-2 ring-amber-400" : ""}`}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          onClick={() => setShowTimePickerFor(c.id)}
                        >
                          <span className="truncate">{isDraft && "✏️"}{c.scheduledTime}</span>
                        </div>
                      );
                    })}
                  </div>
                  {opCl.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {opCl.map((c) => {
                        const isDraft = draftCleaningIds.has(c.id);
                        return (
                          <div key={c.id} className="flex items-center gap-1.5 text-[11px]">
                            {isDraft && <span className="text-[8px] text-amber-600">✏️</span>}
                            <span className="font-bold text-emerald-600 min-w-[36px]">{c.scheduledTime}</span>
                            <span className="flex-1 truncate text-slate-600">{c.propertyName}</span>
                            <span className="text-slate-300">{fmtDur(c.estimatedDuration)}</span>
                            <button onClick={() => handleUnassign(c.id, op.id)} className="text-red-400">✕</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {opCl.length === 0 && <div className="text-center py-1 text-[10px] text-slate-300">Nessuna pulizia assegnata</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════
  // MOBILE BOTTOM SHEET
  // ═══════════════════════════════════════════════════════════════
  const BottomSheet = () => {
    if (!sheetCleaningId) return null;
    const cleaning = cleanings.find((c) => c.id === sheetCleaningId);
    if (!cleaning) return null;
    const assignedOpIds = new Set((cleaning.operators || []).map(o => o.id));
    const availableOps = sheetAddMode 
      ? activeOps.filter(op => !assignedOpIds.has(op.id))
      : activeOps;

    // Pre-calcola esperienza per operatore dalla familiarityMap
    const opExperience = new Map<string, { total: number; zoneCleanings: number }>();
    for (const [key, count] of familiarityMap) {
      const [opId, propId] = key.split(":");
      if (!opId) continue;
      const prev = opExperience.get(opId) || { total: 0, zoneCleanings: 0 };
      prev.total += count;
      // Conta pulizie nella stessa zona
      const propZone = (() => {
        const cl = cleanings.find(c => c.propertyId === propId);
        return cl?.propertyZona || "";
      })();
      if (propZone === cleaning.propertyZona) prev.zoneCleanings += count;
      opExperience.set(opId, prev);
    }

    // Calcola punteggio per ogni operatore (dati reali)
    const scored = availableOps.map(op => {
      let score = 0;
      const reasons: string[] = [];
      const exp = opExperience.get(op.id) || { total: 0, zoneCleanings: 0 };

      // 1. FAMILIARITÀ PROPRIETÀ: quante volte ha pulito QUESTA casa (+30 max)
      const famKey = `${op.id}:${cleaning.propertyId}`;
      const timesCleaned = familiarityMap.get(famKey) || 0;
      if (timesCleaned >= 10) { score += 30; reasons.push(`${timesCleaned}x questa casa`); }
      else if (timesCleaned >= 5) { score += 25; reasons.push(`${timesCleaned}x questa casa`); }
      else if (timesCleaned >= 3) { score += 20; reasons.push(`${timesCleaned}x questa casa`); }
      else if (timesCleaned >= 1) { score += 12; reasons.push(`${timesCleaned}x questa casa`); }

      // 2. ESPERIENZA ZONA: pulizie fatte nella stessa zona (+20 max)
      if (exp.zoneCleanings >= 20) { score += 20; reasons.push(`Esperto zona`); }
      else if (exp.zoneCleanings >= 10) { score += 15; reasons.push(`${exp.zoneCleanings}x in zona`); }
      else if (exp.zoneCleanings >= 5) { score += 10; reasons.push(`${exp.zoneCleanings}x in zona`); }
      else if (exp.zoneCleanings >= 1) { score += 5; }

      // 3. ZONA PREFERITA corrispondente (+15)
      const sameZone = op.preferredZone === cleaning.propertyZona;
      if (sameZone) { score += 15; reasons.push("Zona preferita"); }

      // 4. ESPERIENZA TOTALE: pulizie completate totali (+15 max)
      if (exp.total >= 50) { score += 15; }
      else if (exp.total >= 30) { score += 12; }
      else if (exp.total >= 15) { score += 9; reasons.push(`${exp.total} completate`); }
      else if (exp.total >= 5) { score += 5; reasons.push(`${exp.total} completate`); }
      else { reasons.push(`${exp.total} completate`); }

      // 5. CARICO DI LAVORO oggi (+15 max)
      const todayCount = op.todayCleanings.length;
      if (todayCount === 0) { score += 15; reasons.push("Libero"); }
      else if (todayCount <= 2) { score += 10; }
      else if (todayCount <= 4) { score += 5; reasons.push(`${todayCount} oggi`); }
      else { reasons.push(`${todayCount} oggi`); }

      // 6. ORE LAVORATE oggi (+10 max)
      const h = op.todayCleanings.reduce((s, c) => s + (c.estimatedDuration || 2), 0);
      if (h === 0) score += 10;
      else if (h < 3) score += 7;
      else if (h < 5) score += 4;

      // 7. DISTANZA dall'ultima pulizia assegnata (+10 max)
      const lastCleaning = op.todayCleanings[op.todayCleanings.length - 1];
      const cleanCoords = propertyCoords.get(cleaning.propertyId);
      if (lastCleaning && cleanCoords) {
        const lastCoords = propertyCoords.get(lastCleaning.propertyId);
        if (lastCoords) {
          const dist = Math.sqrt(Math.pow(lastCoords.lat - cleanCoords.lat, 2) + Math.pow(lastCoords.lng - cleanCoords.lng, 2)) * 111;
          if (dist < 0.5) { score += 10; reasons.push("Molto vicino"); }
          else if (dist < 1) { score += 7; reasons.push("Vicino"); }
          else if (dist < 2) { score += 4; }
        }
      }

      // 8. RATING operatore (+5 max) 
      const rating = op.rating || 4.0;
      score += Math.round((rating / 5) * 5);

      return { op, score, reasons, todayCount, hours: Math.round(h * 10) / 10, timesCleaned, totalExp: exp.total };
    }).sort((a, b) => b.score - a.score);

    const maxScore = Math.max(...scored.map(s => s.score), 1);

    return (
      <Portal>
        <div className="fixed inset-0 bg-black/40 z-[9998]" onClick={() => { setSheetCleaningId(null); setSheetAddMode(false); }} />
        <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[9999] max-h-[80vh] flex flex-col shadow-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 flex-shrink-0" />
          <div className="px-4 pb-2 pt-1 border-b border-slate-100 flex-shrink-0">
            <div className="text-center">
              <div className="font-bold text-base text-slate-800">
                <span className="text-amber-600">{cleaning.scheduledTime}</span> {cleaning.propertyName}
              </div>
              <div className="text-xs text-slate-400">{cleaning.propertyZona} · {fmtDur(cleaning.estimatedDuration)}{cleaning.urgent ? " · 🔴 Turnover" : " · 🟢 Solo checkout"}</div>
              {sheetAddMode ? (
                <div className="text-[10px] text-emerald-600 font-medium mt-0.5">Aggiungi un secondo operatore</div>
              ) : (
                <div className="text-[10px] text-amber-600 font-medium mt-0.5">Assegnazione in bozza fino alla conferma</div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2" style={{ WebkitOverflowScrolling: "touch" }}>
            {scored.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">Tutti gli operatori sono già assegnati</div>
            ) : scored.map(({ op, score, reasons, todayCount, hours, timesCleaned, totalExp }, idx) => {
              const color = getColor(op.colorIndex || 0);
              const pct = Math.round((score / maxScore) * 100);
              const isTop = idx === 0 && score > 0;
              return (
                <button key={op.id} onClick={() => { handleAssign(cleaning.id, op.id, op.name, sheetAddMode); setSheetAddMode(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border mb-2 text-left active:scale-[0.98] transition-all ${
                    isTop ? "border-emerald-300 bg-emerald-50/50 ring-1 ring-emerald-200" : "border-slate-200 active:bg-slate-50"
                  }`}>
                  <div className="relative">
                    <div className={`w-10 h-10 ${color.bg} rounded-full flex items-center justify-center text-white font-bold text-sm`}>{op.name.charAt(0)}</div>
                    {isTop && <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                    </div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-slate-800">{op.name}</span>
                      {isTop && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">CONSIGLIATO</span>}
                    </div>
                    <div className="text-xs text-slate-400">
                      {op.preferredZone}
                      {reasons.length > 0 && <span className="text-emerald-600 font-medium ml-1">· {reasons.join(" · ")}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400">{todayCount} oggi · {hours}h · {totalExp} totali{timesCleaned > 0 ? ` · ${timesCleaned}x qui` : ""}</span>
                      <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#94a3b8" }} />
                      </div>
                      <span className="text-[10px] font-bold" style={{ color: pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#94a3b8" }}>{score}pt</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="px-3 pb-3 flex-shrink-0">
            <button onClick={() => { setSheetCleaningId(null); setSheetAddMode(false); }} className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 font-semibold text-sm">Annulla</button>
          </div>
        </div>
      </Portal>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // TIME PICKER MODAL
  // ═══════════════════════════════════════════════════════════════
  const TimePicker = () => {
    if (!showTimePickerFor) return null;
    const current = cleanings.find((c) => c.id === showTimePickerFor)?.scheduledTime;
    return (
      <Portal>
        <div className="fixed inset-0 bg-black/40 z-[9998] flex items-end sm:items-center justify-center" onClick={() => setShowTimePickerFor(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: isMobile ? "calc(16px + env(safe-area-inset-bottom, 0px))" : "20px" }}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />
            <h3 className="text-lg font-bold text-slate-800 text-center mb-1">Seleziona Orario</h3>
            <p className="text-xs text-amber-600 text-center mb-3">Salvato come bozza fino alla conferma</p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {TIME_OPTIONS.map((time) => (
                <button key={time} onClick={() => handleChangeTime(showTimePickerFor, time)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                    current === time ? "bg-violet-600 text-white shadow-lg shadow-violet-500/30" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >{time}</button>
              ))}
            </div>
            <button onClick={() => setShowTimePickerFor(null)} className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 font-semibold text-sm">Chiudi</button>
          </div>
        </div>
      </Portal>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // CONFIRM MODAL
  // ═══════════════════════════════════════════════════════════════
  const ConfirmModal = () => {
    if (!showConfirmModal) return null;

    const byOp = new Map<string, { name: string; cleanings: Array<{ propertyName: string; time: string }> }>();
    for (const d of drafts) {
      const cl = cleanings.find(c => c.id === d.cleaningId);
      if (!cl) continue;
      if (!byOp.has(d.operatorId)) {
        byOp.set(d.operatorId, { name: d.operatorName, cleanings: [] });
      }
      byOp.get(d.operatorId)!.cleanings.push({
        propertyName: cl.propertyName,
        time: d.scheduledTime || cl.scheduledTime,
      });
    }

    const timeOnlyChanges: Array<{ propertyName: string; oldTime: string; newTime: string }> = [];
    for (const [cleaningId, newTime] of draftTimeChanges) {
      if (draftCleaningIds.has(cleaningId)) continue;
      const serverCl = serverCleanings.find(c => c.id === cleaningId);
      if (serverCl) {
        timeOnlyChanges.push({ propertyName: serverCl.propertyName, oldTime: serverCl.scheduledTime, newTime });
      }
    }

    return (
      <Portal>
        <div className="fixed inset-0 bg-black/50 z-[9998] flex items-end sm:items-center justify-center" onClick={() => setShowConfirmModal(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: isMobile ? "env(safe-area-inset-bottom, 0px)" : "0" }}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-2 sm:hidden" />
            <div className="px-5 pt-3 pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 text-center">Conferma Assegnazioni</h3>
              <p className="text-xs text-slate-400 text-center mt-1">
                Le notifiche agli operatori partiranno solo dopo la conferma
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3" style={{ WebkitOverflowScrolling: "touch" }}>
              {Array.from(byOp.entries()).map(([opId, data]) => {
                const op = activeOps.find(o => o.id === opId);
                const color = getColor(op?.colorIndex || 0);
                return (
                  <div key={opId} className="mb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-7 h-7 ${color.bg} rounded-full flex items-center justify-center text-white font-bold text-xs`}>{data.name.charAt(0)}</div>
                      <span className="font-bold text-sm text-slate-800">{data.name}</span>
                      <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">{data.cleanings.length} nuove</span>
                    </div>
                    <div className="ml-9 space-y-1">
                      {data.cleanings.map((cl, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="font-bold text-emerald-600 min-w-[45px]">{cl.time}</span>
                          <span className="text-slate-600">{cl.propertyName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {timeOnlyChanges.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="font-bold text-sm text-slate-600 mb-2">Cambi orario</div>
                  {timeOnlyChanges.map((tc, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm mb-1">
                      <span className="text-slate-400 line-through">{tc.oldTime}</span>
                      <span className="text-emerald-600 font-bold">→ {tc.newTime}</span>
                      <span className="text-slate-600">{tc.propertyName}</span>
                    </div>
                  ))}
                </div>
              )}

              {drafts.length === 0 && timeOnlyChanges.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">Nessuna modifica da confermare</div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} disabled={isConfirming}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-semibold text-sm">
                Annulla
              </button>
              <button onClick={handleConfirmAll} disabled={isConfirming || (drafts.length === 0 && draftTimeChanges.size === 0)}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/30 disabled:opacity-60 flex items-center justify-center gap-2">
                {isConfirming ? (
                  <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Invio...</>
                ) : (
                  <>✓ Conferma e Notifica</>
                )}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // DRAFT BANNER (sticky in basso)
  // ═══════════════════════════════════════════════════════════════
  const DraftBanner = () => {
    if (!hasDrafts) return null;
    return (
      <Portal>
        <div className="fixed bottom-0 left-0 right-0 z-[9990] bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-3 shadow-2xl shadow-amber-500/40"
          style={{ paddingBottom: isMobile ? "calc(12px + env(safe-area-inset-bottom, 0px))" : "12px" }}>
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-lg animate-bounce">✏️</div>
              <div>
                <div className="font-bold text-sm">{drafts.length} assegnazion{drafts.length === 1 ? "e" : "i"} in bozza{draftTimeChanges.size > 0 && ` + ${draftTimeChanges.size} orari`}</div>
                <div className="text-[11px] opacity-90">Nessuna notifica inviata. Conferma per salvare.</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleDiscardDrafts} className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold transition-all">
                Scarta
              </button>
              <button onClick={() => setShowConfirmModal(true)} className="px-4 py-2 bg-white text-amber-600 hover:bg-amber-50 rounded-lg text-sm font-bold transition-all shadow-lg">
                ✓ Conferma tutto
              </button>
            </div>
          </div>
        </div>
      </Portal>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // MAPPA VIEW — Leaflet + circleMarkers + polylines
  // ═══════════════════════════════════════════════════════════════
  const MappaView = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapObjRef = useRef<any>(null);
    const tileLayerRef = useRef<any>(null);
    const fittedDateRef = useRef<string>("");
    const lastRenderHash = useRef<string>("");
    const renderTimerRef = useRef<any>(null);
    const markersGroupRef = useRef<any>(null);
    const debugRef = useRef({ effects: 0, renders: 0, skips: 0, log: [] as string[] });
    const debugDivRef = useRef<HTMLDivElement>(null);
    const [mapTileKey, setMapTileKey] = useState<MapTileKey>("positron");

    const updateDebug = (msg: string) => {
      const d = debugRef.current;
      const t = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      d.log = [...d.log.slice(-7), `${t} ${msg}`];
      if (debugDivRef.current) {
        debugDivRef.current.innerHTML = `<b>E:${d.effects} R:${d.renders} S:${d.skips}</b><br/>${d.log.join("<br/>")}`;
      }
    };

    // ── Cambio tile layer ──
    useEffect(() => {
      if (!mapObjRef.current || !tileLayerRef.current) return;
      const L = (window as any).L;
      if (!L) return;
      mapObjRef.current.removeLayer(tileLayerRef.current);
      const tile = MAP_TILE_LAYERS[mapTileKey];
      tileLayerRef.current = L.tileLayer(tile.url, { attribution: tile.attr, maxZoom: 19 }).addTo(mapObjRef.current);
      const pane = mapObjRef.current.getPane("tilePane");
      if (pane) pane.style.filter = tile.filter;
    }, [mapTileKey]);

    // Quando la mappa diventa visibile, ricalcola le dimensioni
    useEffect(() => {
      if (viewMode === "mappa" && mapObjRef.current) {
        setTimeout(() => {
          mapObjRef.current?.invalidateSize();
        }, 50);
      }
    }, [viewMode]);

    // Track previous values for debug
    const prevClRef = useRef(0);
    const prevDrRef = useRef(0);

    useEffect(() => {
      if (!containerRef.current) return;

      // DEBUG tracking
      debugRef.current.effects++;
      const changes: string[] = [];
      if (prevClRef.current !== cleanings.length) changes.push(`cl:${prevClRef.current}→${cleanings.length}`);
      if (prevDrRef.current !== drafts.length) changes.push(`dr:${prevDrRef.current}→${drafts.length}`);
      prevClRef.current = cleanings.length;
      prevDrRef.current = drafts.length;
      updateDebug(`EFFECT#${debugRef.current.effects} [${changes.join(",") || "no change"}]`);

      // CSS Leaflet
      if (!document.getElementById("lf-css")) {
        const link = document.createElement("link");
        link.id = "lf-css"; link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const render = async () => {
        // Leggi dati da refs (non triggera re-render)
        const activeOps = activeOpsRef.current;
        const propertyCoords = propertyCoordsRef.current;
        const propertyTimes = propertyTimesRef.current;

        // Carica Leaflet JS
        if (!(window as any).L) {
          await new Promise<void>((resolve) => {
            if (document.getElementById("lf-js")) {
              const iv = setInterval(() => { if ((window as any).L) { clearInterval(iv); resolve(); } }, 50);
            } else {
              const s = document.createElement("script");
              s.id = "lf-js"; s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
              s.onload = () => resolve();
              document.head.appendChild(s);
            }
          });
        }

        const L = (window as any).L;
        if (!L || !containerRef.current) return;

        // Crea mappa se non esiste
        if (!mapObjRef.current) {
          mapObjRef.current = L.map(containerRef.current, {
            tap: false,
            bounceAtZoomLimits: false,
            zoomSnap: 0,
            zoomDelta: 0.5,
            wheelDebounceTime: 80,
            inertia: true,
            inertiaDeceleration: 3000,
            inertiaMaxSpeed: 1500,
            zoomAnimation: true,
            fadeAnimation: false,
          }).setView([41.9028, 12.4964], 14);
          const tile = MAP_TILE_LAYERS.positron;
          tileLayerRef.current = L.tileLayer(tile.url, {
            attribution: tile.attr, maxZoom: 19,
          }).addTo(mapObjRef.current);
          // Filtro CSS iniziale
          const pane = mapObjRef.current.getPane("tilePane");
          if (pane) pane.style.filter = tile.filter;
        }

        const map = mapObjRef.current;

        // Coordinate: priorità alla collection properties (realtime), fallback al campo della pulizia
        const getCoords = (c: typeof cleanings[0]) => {
          const fromProps = propertyCoords.get(c.propertyId);
          if (fromProps) return fromProps;
          if (c.propertyCoordinates?.lat && c.propertyCoordinates?.lng) return c.propertyCoordinates;
          return null;
        };
        const valid = cleanings.filter(c => c.status !== "CANCELLED" && getCoords(c) !== null);
        
        // Se non ci sono dati validi, non cancellare la mappa (evita flash durante caricamento)
        if (valid.length === 0) return;

        // Hash solo su campi che cambiano i pin visivamente (NO durata/scheduledTime che cambiano troppo)
        const dataHash = valid.map(c => `${c.id}:${c.operatorId || ""}:${c.urgent ? 1 : 0}`).join("|")
          + "|D" + draftCleaningIds.size;
        if (lastRenderHash.current === dataHash) {
          debugRef.current.skips++;
          updateDebug(`SKIP#${debugRef.current.skips} (hash same, ${valid.length} pin)`);
          return;
        }
        debugRef.current.renders++;
        updateDebug(`RENDER#${debugRef.current.renders} (${valid.length} pin, hash changed)`);
        lastRenderHash.current = dataHash;

        // LayerGroup atomico: tutti i nuovi marker in un gruppo, swap istantaneo
        const newGroup = L.layerGroup();

        // Hover card div (position:fixed sul body, mai tagliato, mai flickera)
        let hoverDiv = document.getElementById("map-hover-card") as HTMLDivElement;
        if (!hoverDiv) {
          hoverDiv = document.createElement("div");
          hoverDiv.id = "map-hover-card";
          hoverDiv.style.cssText = "position:fixed;z-index:10000;pointer-events:none;opacity:0;transition:opacity .15s;";
          document.body.appendChild(hoverDiv);
        }

        // Raggruppa per operatore — supporta operators array
        const byOp = new Map<string, Array<{ lat: number; lng: number; time: string; cleaning: typeof valid[0]; order: number }>>();
        valid.forEach(c => {
          const ops = (c.operators && c.operators.length > 0) ? c.operators : (c.operatorId ? [{ id: c.operatorId, name: c.operatorName || "" }] : []);
          ops.forEach(op => {
            if (!op.id) return;
            const arr = byOp.get(op.id) || [];
            arr.push({ lat: getCoords(c)!.lat, lng: getCoords(c)!.lng, time: c.scheduledTime, cleaning: c, order: 0 });
            byOp.set(op.id, arr);
          });
        });
        for (const [, pts] of byOp) {
          pts.sort((a, b) => a.time.localeCompare(b.time));
          pts.forEach((p, i) => { p.order = i + 1; });
        }
        const orderMap = new Map<string, number>();
        for (const [, pts] of byOp) {
          pts.forEach(p => { if (!orderMap.has(p.cleaning.id)) orderMap.set(p.cleaning.id, p.order); });
        }

        const isMob = window.innerWidth < 768;
        const pinSize = isMob ? 38 : 36;

        // Calcola offset per pin con stesse coordinate (stessa proprietà/indirizzo)
        const coordCounts = new Map<string, number>();
        const coordIndex = new Map<string, number>();
        valid.forEach(c => {
          const coords = getCoords(c)!;
          const key = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
          coordCounts.set(key, (coordCounts.get(key) || 0) + 1);
        });
        const getOffset = (lat: number, lng: number): { lat: number; lng: number } => {
          const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
          const total = coordCounts.get(key) || 1;
          if (total <= 1) return { lat, lng };
          const idx = coordIndex.get(key) || 0;
          coordIndex.set(key, idx + 1);
          // Offset a ventaglio: sposta i pin lateralmente
          const spread = 0.00025; // ~25 metri
          const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
          const radius = total <= 2 ? spread * 0.6 : spread;
          return {
            lat: lat + Math.sin(angle) * radius,
            lng: lng + Math.cos(angle) * radius,
          };
        };

        valid.forEach((c) => {
          const rawCoords = getCoords(c)!;
          const { lat, lng } = getOffset(rawCoords.lat, rawCoords.lng);
          const ops = (c.operators && c.operators.length > 0) ? c.operators : (c.operatorId ? [{ id: c.operatorId, name: c.operatorName || "" }] : []);
          const isAssigned = ops.length > 0 && ops[0]?.id;
          const isDraft = draftCleaningIds.has(c.id);
          const order = orderMap.get(c.id) || 0;

          let fillColor = "#94a3b8";
          const isTurnover = !!c.checkinTime; // checkout + checkin stesso giorno
          if (isAssigned) {
            const opIdx = activeOps.findIndex(o => o.id === ops[0].id);
            if (opIdx >= 0) fillColor = getColor(activeOps[opIdx]!.colorIndex || opIdx).hex;
          } else {
            // Non assegnata: rosso = turnover, verde = solo checkout
            fillColor = isTurnover ? "#ef4444" : "#22c55e";
          }
          const pinBorder = isAssigned ? "2px solid white" : `2px solid ${isTurnover ? "#dc2626" : "#16a34a"}`;

          const initials = isAssigned ? ops.map(o => o.name.charAt(0).toUpperCase()).join("") : "?";
          const opNames = ops.map(o => o.name).join(", ");
          const propTimes = propertyTimes.get(c.propertyId);
          const checkOutStr = propTimes?.checkOut || c.checkoutTime || "";
          const checkInStr = propTimes?.checkIn || c.checkinTime || "";
          const durStr = fmtDur(c.estimatedDuration);

          // PIN Stile 2: quadrato arrotondato con punta
          const icon = L.divIcon({
            className: "",
            iconSize: [pinSize, pinSize + 6],
            iconAnchor: [pinSize / 2, pinSize + 4],
            html: `<div style="position:relative;"><div style="width:${pinSize}px;height:${pinSize}px;border-radius:10px;background:${fillColor};border:${pinBorder};box-shadow:0 4px 12px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;gap:2px;cursor:pointer;"><span style="color:white;font-size:${isMob ? 16 : 15}px;font-weight:900;text-shadow:0 1px 2px rgba(0,0,0,.4);">${isAssigned ? order : "?"}</span><span style="color:rgba(255,255,255,.8);font-size:${isMob ? 11 : 10}px;font-weight:700;border-left:1px solid rgba(255,255,255,.3);padding-left:3px;">${initials}</span></div><div style="position:absolute;bottom:-4px;left:50%;width:8px;height:8px;background:${fillColor};transform:translateX(-50%) rotate(45deg);border-right:${pinBorder};border-bottom:${pinBorder};"></div></div>`,
          });

          const marker = L.marker([lat, lng], { icon }).addTo(newGroup);

          // HOVER: card custom (desktop only)
          const hoverHtml = `<div style="font-family:system-ui;width:290px;background:white;border:1.5px solid #e2e8f0;border-radius:14px;padding:14px;box-shadow:0 12px 40px rgba(0,0,0,.15),0 2px 6px rgba(0,0,0,.06);">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
              <div style="width:36px;height:36px;border-radius:10px;background:${fillColor};display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:800;flex-shrink:0;">${initials}</div>
              <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:14px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.propertyName}</div>
              <div style="font-size:10px;color:#94a3b8;">${c.propertyAddress || ""}</div></div></div>
            <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:8px;display:flex;">
              ${checkOutStr ? `<div style="flex:1;padding:7px;text-align:center;background:#fef7f7;"><div style="font-size:8px;color:#94a3b8;font-weight:700;">CHECK-OUT</div><div style="font-size:15px;font-weight:800;color:#dc2626;">${checkOutStr}</div></div><div style="width:1px;background:#e2e8f0;"></div>` : ""}
              ${checkInStr ? `<div style="flex:1;padding:7px;text-align:center;background:#f7fef9;"><div style="font-size:8px;color:#94a3b8;font-weight:700;">CHECK-IN</div><div style="font-size:15px;font-weight:800;color:#16a34a;">${checkInStr}</div></div><div style="width:1px;background:#e2e8f0;"></div>` : ""}
              <div style="flex:1;padding:7px;text-align:center;background:#f7f9fe;"><div style="font-size:8px;color:#94a3b8;font-weight:700;">PULIZIA</div><div style="font-size:15px;font-weight:800;color:#2563eb;">${c.scheduledTime}</div></div>
            </div>
            <div style="display:flex;align-items:center;gap:5px;">
              <span style="background:#f1f5f9;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:600;color:#475569;">⏱ ${durStr}</span>
              ${c.guestsCount ? `<span style="background:#f1f5f9;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:600;color:#475569;">👥 ${c.guestsCount}</span>` : ""}
              ${isAssigned && order ? `<span style="border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;color:${fillColor};border:1px solid ${fillColor}30;background:${fillColor}08;">Tappa ${order}</span>` : ""}
              <span style="margin-left:auto;font-size:10px;font-weight:600;color:${isAssigned ? '#059669' : '#ef4444'};">${isAssigned ? `✅ ${opNames}` : '❌ Non assegnata'}</span>
            </div></div>`;

          // POPUP: completo con bottone
          const popupId = `pb-${c.id.slice(0, 8)}`;
          const cols = [checkOutStr, checkInStr].filter(Boolean).length + 1;
          const pw = isMob ? 220 : 300;
          const pf = isMob ? 13 : 18; // font size orari
          const pf2 = isMob ? 15 : 20; // font size pulizia
          const pp = isMob ? 6 : 10; // padding celle
          const iconSz = isMob ? 32 : 44;
          const iconR = isMob ? 8 : 12;
          const iconF = isMob ? 13 : 17;
          const nameF = isMob ? 13 : 15;
          const badgeP = isMob ? "3px 8px" : "5px 12px";
          const badgeF = isMob ? 10 : 12;
          const btnP = isMob ? 8 : 11;
          const btnF = isMob ? 11 : 13;
          const popupHtml = `<div style="font-family:system-ui;width:${pw}px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <div style="width:${iconSz}px;height:${iconSz}px;border-radius:${iconR}px;background:${fillColor};display:flex;align-items:center;justify-content:center;color:white;font-size:${iconF}px;font-weight:800;flex-shrink:0;">${initials}</div>
              <div style="flex:1;"><div style="font-weight:700;font-size:${nameF}px;color:#1e293b;line-height:1.2;">${c.propertyName}</div>
              ${!isMob ? `<div style="font-size:11px;color:#94a3b8;">${c.propertyAddress || ""}</div>` : ""}</div></div>
            <div style="border:1px solid #e2e8f0;border-radius:${isMob ? 8 : 12}px;overflow:hidden;margin-bottom:8px;">
              <div style="display:flex;">
                ${checkOutStr ? `<div style="flex:1;padding:${pp}px;text-align:center;background:#fef2f2;"><div style="font-size:${isMob ? 8 : 9}px;color:#94a3b8;font-weight:700;">CHECK-OUT</div><div style="font-size:${pf}px;font-weight:800;color:#dc2626;">${checkOutStr}</div></div><div style="width:1px;background:#e2e8f0;"></div>` : ""}
                ${checkInStr ? `<div style="flex:1;padding:${pp}px;text-align:center;background:#f0fdf4;"><div style="font-size:${isMob ? 8 : 9}px;color:#94a3b8;font-weight:700;">CHECK-IN</div><div style="font-size:${pf}px;font-weight:800;color:#16a34a;">${checkInStr}</div></div>` : ""}
              </div>
              <div style="border-top:1px solid #e2e8f0;padding:${pp}px;text-align:center;background:#eff6ff;">
                <div style="font-size:${isMob ? 8 : 9}px;color:#94a3b8;font-weight:700;">ORARIO PULIZIA</div>
                <div style="font-size:${pf2}px;font-weight:800;color:#2563eb;">${c.scheduledTime}</div></div></div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
              <span style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:${badgeP};font-size:${badgeF}px;font-weight:600;color:#334155;">⏱ ${durStr}</span>
              ${c.guestsCount ? `<span style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:${badgeP};font-size:${badgeF}px;font-weight:600;color:#334155;">👥 ${c.guestsCount}</span>` : ""}
              ${isAssigned && order ? `<span style="border-radius:6px;padding:${badgeP};font-size:${badgeF}px;font-weight:700;color:${fillColor};border:1px solid ${fillColor}40;background:${fillColor}12;">Tappa ${order}</span>` : ""}
            </div>
            <div style="border-top:1px solid #e2e8f0;padding-top:6px;margin-bottom:6px;font-size:${isMob ? 11 : 13}px;font-weight:600;color:${isAssigned ? '#059669' : '#ef4444'};">
              ${isAssigned ? `✅ ${opNames}${isDraft ? " (bozza)" : ""}` : "❌ Non assegnata"}</div>
            <button id="${popupId}" style="width:100%;padding:${btnP}px;border:none;border-radius:${isMob ? 8 : 12}px;background:${isAssigned ? '#7c3aed' : '#ef4444'};color:white;font-size:${btnF}px;font-weight:700;cursor:pointer;">
              ${isAssigned ? "✏️ Cambia operatore" : "👤 Assegna operatore"}
            </button></div>`;

          marker.bindPopup(popupHtml, { 
            maxWidth: isMob ? 250 : 340,
            autoPan: true,
            autoPanPadding: isMob ? [20, 80] as any : [40, 40] as any,
          });

          // Desktop hover → card custom, mobile → solo click popup
          if (!isMob) {
            marker.on("mouseover", () => {
              hoverDiv.innerHTML = hoverHtml;
              const rect = map.getContainer().getBoundingClientRect();
              const pt = map.latLngToContainerPoint([lat, lng]);
              let x = rect.left + pt.x + 24;
              let y = rect.top + pt.y - 160;
              if (x + 300 > window.innerWidth) x = rect.left + pt.x - 320;
              if (y < 10) y = rect.top + pt.y + 40;
              hoverDiv.style.left = x + "px";
              hoverDiv.style.top = y + "px";
              hoverDiv.style.opacity = "1";
            });
            marker.on("mouseout", () => { hoverDiv.style.opacity = "0"; });
          }
          marker.on("click", () => {
            hoverDiv.style.opacity = "0";
            // Mobile: centra il pin prima di aprire il popup
            if (isMob) {
              const containerH = map.getContainer().clientHeight;
              const offset = containerH * 0.15; // sposta il pin nel terzo superiore
              const targetPoint = map.project([lat, lng], map.getZoom());
              targetPoint.y -= offset;
              const targetLatLng = map.unproject(targetPoint, map.getZoom());
              map.panTo(targetLatLng, { animate: true, duration: 0.3 });
            }
          });
          marker.on("popupopen", () => {
            setTimeout(() => {
              const btn = document.getElementById(popupId);
              if (btn) btn.onclick = () => { map.closePopup(); setSheetCleaningId(c.id); setSheetAddMode(!!isAssigned); };
            }, 100);
          });
        });

        // Effetto C: Dash scorrevole — polyline con CSS animation (nativo Leaflet, no z-index issues)
        for (const [opId, pts] of byOp) {
          if (pts.length < 2) continue;
          const opIdx = activeOps.findIndex(o => o.id === opId);
          const lc = opIdx >= 0 ? getColor(activeOps[opIdx]!.colorIndex || opIdx).hex : "#94a3b8";
          const coords = pts.map(p => [p.lat, p.lng] as [number, number]);

          // Linea tratteggiata con dash animato lento
          const line = L.polyline(coords, { color: lc, weight: 2.5, opacity: 0.25, dashArray: "8,14", className: "animated-dash" }).addTo(newGroup);
          // Linea ombra statica (no animazione)
          L.polyline(coords, { color: lc, weight: 4, opacity: 0.06, dashArray: "4,18" }).addTo(newGroup);
        }

        // Fade out → swap → fade in (nasconde qualsiasi jump visivo)
        const container = map.getContainer();
        container.style.transition = "opacity 0.08s";
        container.style.opacity = "0";

        // Swap atomico
        newGroup.addTo(map);
        if (markersGroupRef.current) {
          try { map.removeLayer(markersGroupRef.current); } catch {}
        }
        markersGroupRef.current = newGroup;

        const bounds = valid.map(c => [getCoords(c)!.lat, getCoords(c)!.lng] as [number, number]);
        if (map.getContainer() && bounds.length > 0 && fittedDateRef.current !== selectedDate) {
          fittedDateRef.current = selectedDate;
          try { map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: false }); } catch {}
          updateDebug(`FITBOUNDS (date: ${selectedDate})`);
        }

        // Fade in dopo che tutto è in posizione
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            container.style.opacity = "1";
          });
        });
      };

      // Debounce 200ms: batcha cambiamenti rapidi in un solo render
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
      renderTimerRef.current = setTimeout(() => { updateDebug("DEBOUNCE fired → render()"); render(); }, 200);
      return () => { if (renderTimerRef.current) clearTimeout(renderTimerRef.current); };
    }, [cleanings, drafts, draftCleaningIds]);

    useEffect(() => () => {
      if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; }
      const hd = document.getElementById("map-hover-card");
      if (hd) hd.remove();
    }, []);

    const activeCl = cleanings.filter(c => c.status !== "CANCELLED");
    const wc = activeCl.filter(c => propertyCoords.has(c.propertyId) || (c.propertyCoordinates?.lat && c.propertyCoordinates?.lng)).length;
    const tot = activeCl.length;
    const missingGps = activeCl.filter(c => !propertyCoords.has(c.propertyId) && !(c.propertyCoordinates?.lat && c.propertyCoordinates?.lng));


    return (
      <div className={`relative ${isMobile ? "flex-1 min-h-0" : ""}`} style={{ height: isMobile ? undefined : "calc(100vh - 140px)", overflow: "hidden" }}>
        <style>{`
          .leaflet-popup-content-wrapper { border-radius:14px!important; box-shadow:0 12px 40px rgba(0,0,0,0.15)!important; border:1.5px solid #e2e8f0!important; padding:0!important; }
          .leaflet-popup-content { margin:14px 16px!important; }
          .leaflet-popup-tip { border-top-color:#fff!important; box-shadow:none!important; }
          .leaflet-popup-close-button { font-size:20px!important; color:#94a3b8!important; top:8px!important; right:12px!important; }
          .leaflet-popup-close-button:hover { color:#1e293b!important; }
          .leaflet-control-attribution { display:none!important; }
          .animated-dash { animation: dash-scroll 30s linear infinite; will-change: stroke-dashoffset; }
          @keyframes dash-scroll { to { stroke-dashoffset: -100; } }
        `}</style>
        <div ref={containerRef} className="w-full h-full" style={{ position: "relative", zIndex: 1 }} />
        <div className="absolute bottom-2 left-2 right-2 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Operatori</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {activeOps.filter(op => op.todayCleanings.length > 0).map((op, i) => (
                  <div key={op.id} className="flex items-center gap-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${getColor(op.colorIndex || i).bg}`} />
                    <span className="text-[10px] text-slate-600">{op.name.split(" ")[0]} <b>{op.todayCleanings.length}</b></span>
                  </div>
                ))}
              </div>
              {cleanings.some(c => !c.operatorId && c.status !== "CANCELLED") && (
                <div className="flex items-center gap-1 mt-1 pt-1 border-t border-slate-100">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-red-400" />
                  <span className="text-[10px] text-red-500 font-semibold">Non assegnata</span>
                </div>
              )}
            </div>
            {/* Tile switch integrato */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 flex-shrink-0">
              {(Object.keys(MAP_TILE_LAYERS) as MapTileKey[]).map(k => {
                const t = MAP_TILE_LAYERS[k];
                const active = mapTileKey === k;
                return (
                  <button key={k} onClick={() => setMapTileKey(k)}
                    className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${active ? "bg-violet-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="absolute top-4 right-4 z-[1000] bg-white/95 backdrop-blur rounded-xl shadow-lg px-3 py-2 max-w-xs">
          <div className="text-[11px] text-slate-500">📍 {wc}/{tot} sulla mappa</div>
          {missingGps.length > 0 && (
            <div className="text-[10px] text-amber-600 font-semibold mt-1">
              ⚠️ Senza coordinate: {missingGps.map(c => c.propertyName).join(", ")}
            </div>
          )}
        </div>
        {/* DEBUG OVERLAY - DOM only, no React re-renders */}
        <div ref={debugDivRef} className="absolute top-12 left-2 z-[1001] bg-black/90 text-green-400 rounded-xl px-3 py-2 max-w-[320px] font-mono text-[9px] leading-[13px] pointer-events-none" />
      </div>
    );
  };


  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className={`${viewMode === "mappa" && isMobile ? "fixed left-0 right-0 flex flex-col overflow-hidden z-30" : "min-h-screen"} bg-slate-50 ${hasDrafts && !(viewMode === "mappa" && isMobile) ? "pb-20" : ""}`} style={viewMode === "mappa" && isMobile ? { top: "64px", bottom: "56px" } : undefined}>
      <Header />
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Mappa sempre montata (Leaflet non si re-inizializza mai) */}
          <div style={viewMode === "mappa" ? 
            (isMobile ? { flex: 1, minHeight: 0, position: "relative" as const } : {}) :
            { position: "absolute" as const, top: 0, left: 0, right: 0, height: 1, overflow: "hidden", visibility: "hidden" as const, pointerEvents: "none" as const }
          }>
            <MappaView />
          </div>
          {viewMode !== "mappa" && (
            isMobile ? (
              viewMode === "kanban" ? <KanbanMobile /> : <TimelineMobile />
            ) : (
              viewMode === "kanban" ? <KanbanDesktop /> : <TimelineDesktop />
            )
          )}
        </>
      )}
      <BottomSheet />
      <TimePicker />
      <ConfirmModal />
      {showCalendar && <CalendarDropdown />}
      <DraftBanner />
      {toast && (
        <Portal>
          <div className={`fixed ${hasDrafts ? "bottom-20" : "bottom-6"} left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-2xl z-[9999]`}>{toast}</div>
        </Portal>
      )}
    </div>
  );
}
