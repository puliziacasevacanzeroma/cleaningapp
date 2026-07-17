/**
 * PulizieDataStore — singleton globale con cache persistente
 * 
 * PRINCIPIO: Navigazione ISTANTANEA.
 * - I listener Firestore partono UNA SOLA VOLTA e restano attivi per sempre
 * - Quando torni sulla pagina pulizie: dati mostrati in 0ms dalla cache
 * - I listener aggiornano silenziosamente in background
 * - Spinner SOLO la primissima volta (cache completamente vuota)
 */

import { collection, query, where, orderBy, onSnapshot, getDocs, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { kickFirestoreNetwork } from "~/lib/firebase/networkWatchdog";

// ─── Types ───────────────────────────────────────────────────
interface BedConfig {
  id: string;
  type: string;
  name: string;
  location: string;
  capacity: number;
}

export interface PulizieProperty {
  id: string;
  name: string;
  address: string;
  imageUrl?: string;
  bedsConfig?: BedConfig[];
  cleaningPrice?: number;
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
  serviceConfigs?: Record<number, {
    beds: string[];
    bl: Record<string, Record<string, number>>;
    ba: Record<string, number>;
    ki: Record<string, number>;
    ex: Record<string, boolean>;
  }>;
}

export interface PulizieOperator {
  id: string;
  name: string | null;
}

export interface PulizieCleaning {
  id: string;
  propertyId: string;
  propertyName?: string;
  date: Date;
  status: string;
  scheduledTime?: string | null;
  operator?: PulizieOperator | null;
  operators?: PulizieOperator[];
  guestsCount?: number;
  guestsConfirmed?: boolean;
  adulti?: number;
  neonati?: number;
  notes?: string;
  bookingSource?: string;
  guestName?: string;
  price?: number;
  contractPrice?: number;
  customLinenConfig?: any;
  linenConfigModified?: boolean;
  hasLinenOrder?: boolean;
  serviceType?: string;
  serviceTypeName?: string;
  priceModified?: boolean;
  priceChangeReason?: string;
  sgrossoReason?: string;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  originalDate?: Date | null;
  dateModifiedAt?: Date | null;
  dateModifiedBy?: string | null;
  dateModifiedByName?: string | null;
  ratingScore?: number | null;
  ratingId?: string | null;
  photos?: string[];
  startedAt?: any;
  completedAt?: any;
  missedDeadline?: boolean;
  missedDeadlineAt?: any;
  extraServices?: { name: string; price: number }[];
  holidayFee?: number;
  holidayName?: string;
}

export interface PulizieOrder {
  id: string;
  cleaningId?: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  scheduledDate?: Date;
  scheduledTime?: string;
  items: { id: string; name: string; quantity: number }[];
  status: string;
  riderName?: string;
  deliveryFee?: number;
  deliveryFeeEnabled?: boolean;
  bedMaking?: boolean;
  bedMakingCount?: number;
  bedMakingFee?: number;
  bedMakingBeds?: { name: string; type: string; location: string }[];
}

export interface PulizieInventoryItem {
  id: string;
  key?: string;
  name: string;
  sellPrice: number;
  category: string;
}

// ─── Store State ─────────────────────────────────────────────
export interface PulizieStoreState {
  properties: PulizieProperty[];
  cleanings: PulizieCleaning[];
  operators: PulizieOperator[];
  orders: PulizieOrder[];
  inventory: PulizieInventoryItem[];
  /** true dopo che ALMENO UN snapshot è arrivato (= abbiamo dati veri) */
  hasData: boolean;
  /** true solo la primissima volta, prima che arrivi qualsiasi dato */
  initialLoading: boolean;
  /** 📶 true quando le PULIZIE sono confermate dal SERVER (non solo l'emissione
   *  from-cache di Firestore, che può essere vuota/parziale). Usato per chiudere
   *  lo splash a dati veri già a schermo. */
  serverSynced: boolean;
}

type Listener = () => void;

// ─── Singleton Store ─────────────────────────────────────────
class PulizieDataStore {
  // Lo state vive QUI — sopravvive a qualsiasi navigazione React
  private _state: PulizieStoreState = {
    properties: [],
    cleanings: [],
    operators: [],
    orders: [],
    inventory: [],
    hasData: false,
    initialLoading: true,
    serverSynced: false,
  };

  private _listeners = new Set<Listener>();
  private _unsubscribers: (() => void)[] = [];
  private _activeUserId: string | null = null;
  private _activeIsAdmin: boolean = false;
  // 🚀 PROPRIETARIO: listener pulizie/ordini filtrati per propertyId (gestiti a parte)
  private _ownerCleaningsUnsubs: (() => void)[] = [];
  private _ownerOrdersUnsubs: (() => void)[] = [];
  private _ownerCleaningsByChunk = new Map<number, PulizieCleaning[]>();
  private _ownerOrdersByChunk = new Map<number, PulizieOrder[]>();
  private _ownerPropIdsKey = "";

  // ⛑️ ANTI-STALLO: se il primo snapshot delle pulizie non arriva (canale di
  // rete zombie dopo resume/navigazione), lettura one-shot della stessa query
  // e, se pure quella non risponde, riavvio del canale + un retry.
  private _gotCleaningsSnapshot = false;
  private _cleaningsFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  private _armCleaningsFallback(oneShot: () => Promise<void>): void {
    if (this._cleaningsFallbackTimer) clearTimeout(this._cleaningsFallbackTimer);
    this._cleaningsFallbackTimer = setTimeout(async () => {
      if (this._gotCleaningsSnapshot) return;
      console.warn("⛑️ [pulizieStore] primo snapshot pulizie in ritardo: lettura one-shot");
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000));
      try {
        await Promise.race([oneShot(), timeout]);
      } catch {
        await kickFirestoreNetwork("pulizieStore: one-shot pulizie in timeout");
        try { await oneShot(); } catch { /* i listener restano l'unica fonte */ }
      }
    }, 3000);
  }

  /** Subscribe for React (useSyncExternalStore) */
  subscribe = (callback: Listener): (() => void) => {
    this._listeners.add(callback);
    return () => { this._listeners.delete(callback); };
  };

  /** Snapshot getter for useSyncExternalStore */
  getSnapshot = (): PulizieStoreState => {
    return this._state;
  };

  /** Avvia listener. No-op se già attivi per stesso utente. */
  start(userId: string, isAdmin: boolean): void {
    if (this._activeUserId === userId && this._activeIsAdmin === isAdmin && this._unsubscribers.length > 0) {
      return; // Già attivi — i dati si aggiornano in background automaticamente
    }

    // Utente diverso → pulisci e riparti
    if (this._activeUserId && this._activeUserId !== userId) {
      this.stop();
    }

    this._activeUserId = userId;
    this._activeIsAdmin = isAdmin;

    if (this._state.hasData) {
      if (process.env.NODE_ENV !== "production") console.log("🔵 PulizieStore: Riconnessione (cache attiva:", this._state.cleanings.length, "pulizie)");
    } else {
      if (process.env.NODE_ENV !== "production") console.log("🔵 PulizieStore: Prima inizializzazione per", userId);
    }

    // ─── 1. Properties ───
    const propsQuery = isAdmin
      ? query(collection(db, "properties"), where("status", "==", "ACTIVE"))
      : query(collection(db, "properties"), where("ownerId", "==", userId));

    this._unsubscribers.push(
      onSnapshot(propsQuery, (snapshot) => {
        const props: PulizieProperty[] = snapshot.docs
          .filter(doc => (doc.data() as Record<string, any>).status === "ACTIVE")
          .map(doc => {
            const d = doc.data() as Record<string, any>;
            return {
              id: doc.id,
              name: d.name || "",
              address: d.address || "",
              imageUrl: d.imageUrl || null,
              cleaningPrice: d.cleaningPrice || 0,
              maxGuests: d.maxGuests || 0,
              bedrooms: d.bedrooms || 0,
              bathrooms: d.bathrooms || 0,
              bedsConfig: d.bedsConfig || [],
              serviceConfigs: d.serviceConfigs || {},
            };
          });
        this._patch({ properties: props });
        // 🚀 PROPRIETARIO: appena arrivano le sue proprietà, (ri)avvia pulizie/ordini
        // filtrati per i suoi propertyId (così non scarica i dati di tutti).
        if (!isAdmin) this._resubscribeOwnerData(props.map(p => p.id));
      })
    );

    // ─── 2. Cleanings + 3. Orders ───
    // 🚀 ADMIN: query globali ultimi 12 mesi (l'admin deve vedere tutto).
    //    PROPRIETARIO: gestite da _resubscribeOwnerData (filtrate per le sue proprietà).
    if (isAdmin) {
      const cleaningsRangeStart = new Date();
      cleaningsRangeStart.setMonth(cleaningsRangeStart.getMonth() - 12);
      cleaningsRangeStart.setHours(0, 0, 0, 0);

      const adminCleaningsQuery = query(
        collection(db, "cleanings"),
        where("scheduledDate", ">=", Timestamp.fromDate(cleaningsRangeStart)),
        orderBy("scheduledDate", "asc")
      );

      this._gotCleaningsSnapshot = false;
      this._unsubscribers.push(
        onSnapshot(
          adminCleaningsQuery,
          // 📶 includeMetadataChanges: serve l'evento in cui fromCache→false
          // (conferma server) anche se i documenti non cambiano.
          { includeMetadataChanges: true },
          (snapshot) => {
            this._gotCleaningsSnapshot = true;
            const serverConfirm = !snapshot.metadata.fromCache;
            // ⚡ FIX REGRESSIONE: gli eventi SOLO-metadata (fromCache→false senza
            // documenti cambiati) NON devono rimappare 12 mesi di pulizie
            // (migliaia di doc sul main thread → jank e dashboard in stallo).
            // docChanges() di default ESCLUDE i cambi solo-metadata: length 0
            // = nessun documento cambiato → aggiorna solo il flag e stop.
            if (snapshot.docChanges().length === 0 && this._state.hasData) {
              if (serverConfirm && !this._state.serverSynced) this._patch({ serverSynced: true });
              return;
            }
            const patch: Partial<PulizieStoreState> = { cleanings: snapshot.docs.map(doc => this._mapCleaning(doc)) };
            if (serverConfirm) patch.serverSynced = true;
            this._patch(patch);
          }
        )
      );

      // ⛑️ Fallback: se in 3s il listener non ha consegnato nulla → getDocs
      this._armCleaningsFallback(async () => {
        const snap = await getDocs(adminCleaningsQuery);
        if (this._gotCleaningsSnapshot) return; // arrivato nel frattempo
        this._patch({
          cleanings: snap.docs.map(doc => this._mapCleaning(doc)),
          serverSynced: true, // getDocs risponde dal server
        });
      });

      const ordersRangeStart = new Date();
      ordersRangeStart.setMonth(ordersRangeStart.getMonth() - 12);
      ordersRangeStart.setHours(0, 0, 0, 0);

      this._unsubscribers.push(
        onSnapshot(
          query(
            collection(db, "orders"),
            where("scheduledDate", ">=", Timestamp.fromDate(ordersRangeStart))
          ),
          (snapshot) => {
            this._patch({ orders: snapshot.docs.map(doc => this._mapOrder(doc)).filter(o => o.status !== "CANCELLED" && o.status !== "cancelled") });
          }
        )
      );
    }

    // ─── 4. Inventory ───
    this._unsubscribers.push(
      onSnapshot(collection(db, "inventory"), (snapshot) => {
        const inventory: PulizieInventoryItem[] = snapshot.docs.map(doc => ({
          id: doc.id,
          key: (doc.data() as Record<string, any>).key || doc.id,
          name: (doc.data() as Record<string, any>).name || "",
          sellPrice: (doc.data() as Record<string, any>).sellPrice || 0,
          category: (doc.data() as Record<string, any>).categoryId || (doc.data() as Record<string, any>).category || "",
        }));
        this._patch({ inventory });
      })
    );

    // ─── 5. Operators ───
    this._unsubscribers.push(
      onSnapshot(
        query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE")),
        (snapshot) => {
          const ops: PulizieOperator[] = snapshot.docs.map(doc => ({
            id: doc.id,
            name: (doc.data() as Record<string, any>).name || (doc.data() as Record<string, any>).email || "Operatore",
          }));
          this._patch({ operators: ops });
        }
      )
    );
  }

  // 🔧 Mapping condiviso (admin + proprietario) — stesso output per coerenza dati
  private _mapCleaning(doc: any): PulizieCleaning {
    const d = doc.data() as Record<string, any>;
    return {
      id: doc.id,
      propertyId: d.propertyId || "",
      propertyName: d.propertyName || "",
      date: d.scheduledDate?.toDate?.() || new Date(),
      scheduledTime: d.scheduledTime || "10:00",
      status: d.status || "SCHEDULED",
      operator: d.operatorId ? { id: d.operatorId, name: d.operatorName || "" } : null,
      operators: d.operators || [],
      guestName: d.guestName || "",
      guestsCount: d.guestsCount || 2,
      guestsConfirmed: d.guestsConfirmed || false,
      adulti: d.adulti || 0,
      neonati: d.neonati || 0,
      bookingSource: d.bookingSource || "",
      notes: d.notes || "",
      price: d.price,
      contractPrice: d.contractPrice || d.price,
      customLinenConfig: d.customLinenConfig || null,
      linenConfigModified: d.linenConfigModified || false,
      hasLinenOrder: d.hasLinenOrder,
      priceModified: d.priceModified || false,
      serviceType: d.serviceType || "STANDARD",
      serviceTypeName: d.serviceTypeName || "",
      sgrossoReason: d.sgrossoReason || null,
      sgrossoNotes: d.sgrossoNotes || null,
      ratingScore: d.ratingScore || null,
      ratingId: d.ratingId || null,
      extraServices: d.extraServices || [],
      photos: d.photos || [],
      startedAt: d.startedAt || null,
      completedAt: d.completedAt || null,
      originalDate: d.originalDate?.toDate?.() || null,
      dateModifiedAt: d.dateModifiedAt?.toDate?.() || null,
      dateModifiedBy: d.dateModifiedBy || null,
      dateModifiedByName: d.dateModifiedByName || null,
      missedDeadline: d.missedDeadline || false,
      missedDeadlineAt: d.missedDeadlineAt || null,
      holidayFee: d.holidayFee || 0,
      holidayName: d.holidayName || null,
    };
  }

  private _mapOrder(doc: any): PulizieOrder {
    const d = doc.data() as Record<string, any>;
    return {
      id: doc.id,
      cleaningId: d.cleaningId || null,
      propertyId: d.propertyId,
      propertyName: d.propertyName || "",
      propertyAddress: d.propertyAddress || "",
      scheduledDate: d.scheduledDate?.toDate?.() || new Date(),
      scheduledTime: d.scheduledTime || "10:00",
      items: d.items || [],
      status: d.status || "PENDING",
      riderName: d.riderName || null,
      deliveryFee: d.deliveryFee || 0,
      deliveryFeeEnabled: d.deliveryFeeEnabled !== false,
      bedMaking: d.bedMaking || false,
      bedMakingCount: d.bedMakingCount || 0,
      bedMakingFee: d.bedMakingFee || 0,
      bedMakingBeds: d.bedMakingBeds || [],
    } as PulizieOrder;
  }

  private _chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  /** PROPRIETARIO: (ri)sottoscrive pulizie/ordini filtrati per i suoi propertyId.
   *  Solo `in` su propertyId (niente range/orderBy server-side) → nessun indice
   *  composito richiesto. Finestra 12 mesi applicata lato client. */
  private _resubscribeOwnerData(propertyIds: string[]): void {
    const key = [...propertyIds].sort().join(",");
    if (key === this._ownerPropIdsKey) return; // nessun cambiamento → non rifare nulla
    this._ownerPropIdsKey = key;

    this._ownerCleaningsUnsubs.forEach(fn => fn());
    this._ownerOrdersUnsubs.forEach(fn => fn());
    this._ownerCleaningsUnsubs = [];
    this._ownerOrdersUnsubs = [];
    this._ownerCleaningsByChunk.clear();
    this._ownerOrdersByChunk.clear();

    if (propertyIds.length === 0) {
      // Nessuna proprietà → nessuna pulizia possibile: non c'è nulla da
      // attendere dal server, sblocca subito lo splash.
      this._gotCleaningsSnapshot = true; // niente fallback da attendere
      this._patch({ cleanings: [], orders: [], serverSynced: true });
      return;
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    cutoff.setHours(0, 0, 0, 0);

    const chunks = this._chunk(propertyIds, 30); // Firestore "in" max 30 valori
    this._gotCleaningsSnapshot = false;
    const ownerChunkQueries: ReturnType<typeof query>[] = [];
    chunks.forEach((chunk, idx) => {
      const ownerCleaningsQuery = query(collection(db, "cleanings"), where("propertyId", "in", chunk));
      ownerChunkQueries.push(ownerCleaningsQuery);
      this._ownerCleaningsUnsubs.push(
        onSnapshot(
          ownerCleaningsQuery,
          // 📶 includeMetadataChanges: serve l'evento fromCache→false (conferma server)
          { includeMetadataChanges: true },
          (snap) => {
            this._gotCleaningsSnapshot = true;
            const serverConfirm = !snap.metadata.fromCache;
            // ⚡ FIX REGRESSIONE: eventi solo-metadata → niente rimappatura (vedi admin)
            if (snap.docChanges().length === 0 && this._state.hasData) {
              if (serverConfirm && !this._state.serverSynced) this._patch({ serverSynced: true });
              return;
            }
            const list = snap.docs.map(doc => this._mapCleaning(doc)).filter(c => c.date >= cutoff);
            this._ownerCleaningsByChunk.set(idx, list);
            const merged: PulizieCleaning[] = [];
            this._ownerCleaningsByChunk.forEach(arr => merged.push(...arr));
            merged.sort((a, b) => a.date.getTime() - b.date.getTime());
            const patch: Partial<PulizieStoreState> = { cleanings: merged };
            if (serverConfirm) patch.serverSynced = true;
            this._patch(patch);
          }
        )
      );
      this._ownerOrdersUnsubs.push(
        onSnapshot(
          query(collection(db, "orders"), where("propertyId", "in", chunk)),
          (snap) => {
            const list = snap.docs.map(doc => this._mapOrder(doc)).filter(o => o.status !== "CANCELLED" && o.status !== "cancelled" && o.scheduledDate >= cutoff);
            this._ownerOrdersByChunk.set(idx, list);
            const merged: PulizieOrder[] = [];
            this._ownerOrdersByChunk.forEach(arr => merged.push(...arr));
            this._patch({ orders: merged });
          }
        )
      );
    });

    // ⛑️ Fallback owner: se in 3s nessun chunk ha consegnato → getDocs di tutti
    this._armCleaningsFallback(async () => {
      const snaps = await Promise.all(ownerChunkQueries.map(q2 => getDocs(q2)));
      if (this._gotCleaningsSnapshot) return; // arrivato nel frattempo
      snaps.forEach((snap, idx) => {
        const list = snap.docs.map(doc => this._mapCleaning(doc)).filter(c => c.date >= cutoff);
        this._ownerCleaningsByChunk.set(idx, list);
      });
      const merged: PulizieCleaning[] = [];
      this._ownerCleaningsByChunk.forEach(arr => merged.push(...arr));
      merged.sort((a, b) => a.date.getTime() - b.date.getTime());
      this._patch({ cleanings: merged, serverSynced: true }); // getDocs risponde dal server
    });
  }

  /** Ferma tutti i listener */
  stop(): void {
    if (this._cleaningsFallbackTimer) { clearTimeout(this._cleaningsFallbackTimer); this._cleaningsFallbackTimer = null; }
    this._unsubscribers.forEach(fn => fn());
    this._unsubscribers = [];
    this._ownerCleaningsUnsubs.forEach(fn => fn());
    this._ownerOrdersUnsubs.forEach(fn => fn());
    this._ownerCleaningsUnsubs = [];
    this._ownerOrdersUnsubs = [];
    this._ownerCleaningsByChunk.clear();
    this._ownerOrdersByChunk.clear();
    this._ownerPropIdsKey = "";
    this._activeUserId = null;
  }

  /** Aggiorna parzialmente lo state e notifica React */
  private _patch(partial: Partial<PulizieStoreState>): void {
    // Crea NUOVO oggetto state (immutabilità per React)
    this._state = {
      ...this._state,
      ...partial,
      hasData: true,
      initialLoading: false,
    };

    // Notifica tutti i subscriber (React fa re-render)
    this._listeners.forEach(fn => fn());
  }
}

// ══════════════════════════════════════════════════════
// SINGLETON — sopravvive a TUTTE le navigazioni
// ══════════════════════════════════════════════════════
export const pulizieStore = new PulizieDataStore();
