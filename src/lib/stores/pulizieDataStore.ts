/**
 * PulizieDataStore — singleton globale con cache persistente
 * 
 * PRINCIPIO: Navigazione ISTANTANEA.
 * - I listener Firestore partono UNA SOLA VOLTA e restano attivi per sempre
 * - Quando torni sulla pagina pulizie: dati mostrati in 0ms dalla cache
 * - I listener aggiornano silenziosamente in background
 * - Spinner SOLO la primissima volta (cache completamente vuota)
 */

import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

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
  ratingScore?: number | null;
  ratingId?: string | null;
  photos?: string[];
  startedAt?: any;
  completedAt?: any;
  missedDeadline?: boolean;
  missedDeadlineAt?: any;
  extraServices?: { name: string; price: number }[];
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
  };

  private _listeners = new Set<Listener>();
  private _unsubscribers: (() => void)[] = [];
  private _activeUserId: string | null = null;
  private _activeIsAdmin: boolean = false;

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
      ? query(collection(db, "properties"))
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
      })
    );

    // ─── 2. Cleanings (TUTTE, senza filtro date) ───
    this._unsubscribers.push(
      onSnapshot(
        query(collection(db, "cleanings"), orderBy("scheduledDate", "asc")),
        (snapshot) => {
          const cleans: PulizieCleaning[] = snapshot.docs.map(doc => {
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
              missedDeadline: d.missedDeadline || false,
              missedDeadlineAt: d.missedDeadlineAt || null,
            };
          });
          this._patch({ cleanings: cleans });
        }
      )
    );

    // ─── 3. Orders ───
    this._unsubscribers.push(
      onSnapshot(collection(db, "orders"), (snapshot) => {
        const orders: PulizieOrder[] = snapshot.docs
          .map(doc => {
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
            } as PulizieOrder;
          })
          .filter(o => o.status !== "CANCELLED" && o.status !== "cancelled");
        this._patch({ orders });
      })
    );

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

  /** Ferma tutti i listener */
  stop(): void {
    this._unsubscribers.forEach(fn => fn());
    this._unsubscribers = [];
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
