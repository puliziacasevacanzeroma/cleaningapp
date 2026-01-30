"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { doc, updateDoc, collection, query, where, onSnapshot, orderBy, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { useAuth } from "~/lib/firebase/AuthContext";
import { motion, LayoutGroup, AnimatePresence } from "framer-motion";
import NewCleaningModal from "~/components/NewCleaningModal";
import EditCleaningModal from "~/components/proprietario/EditCleaningModal";
import OrderDetailModal from "~/components/OrderDetailModal";
import { ALL_INVENTORY_ITEMS, getDefaultLinenConfig } from "~/lib/linenItems";
import { calculateDotazioni } from "~/lib/calculateDotazioni";

interface BedConfig {
  id: string;
  type: string;
  name: string;
  location: string;
  capacity: number;
}

interface Property {
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

interface Operator {
  id: string;
  name: string | null;
}

interface LinenItem {
  id: string;
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  cleaningId?: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  scheduledDate?: Date;
  scheduledTime?: string;
  items: LinenItem[];
  status: string;
  riderName?: string;
}

interface InventoryItem {
  id: string;
  key?: string; // 🔥 AGGIUNTO: key per mapping ID semantici
  name: string;
  sellPrice: number;
  category: string;
}

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName?: string;
  date: Date;
  status: string;
  scheduledTime?: string | null;
  operator?: Operator | null;
  operators?: Operator[];
  guestsCount?: number;
  adulti?: number;
  neonati?: number;
  notes?: string;
  bookingSource?: string;
  guestName?: string;
  price?: number;
  // Campi per tipo servizio e prezzo
  contractPrice?: number;
  customLinenConfig?: any;
  linenConfigModified?: boolean;
  hasLinenOrder?: boolean; // 🔥 FIX: Flag se la pulizia ha ordine biancheria
  serviceType?: string;
  serviceTypeName?: string;
  priceModified?: boolean;
  priceChangeReason?: string;
  sgrossoReason?: string;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  // Campi per tracciamento modifica data
  originalDate?: Date | null;
  dateModifiedAt?: Date | null;
  // Campi per valutazione
  ratingScore?: number | null;
  ratingId?: string | null;
  // Campi per completamento (admin)
  photos?: string[];
  startedAt?: any;
  completedAt?: any;
  // Campi per deadline mancata
  missedDeadline?: boolean;
  missedDeadlineAt?: any;
  // Servizi extra
  extraServices?: { name: string; price: number }[];
}

// 🔴 NUOVO: Tipo unificato per servizi (pulizia o consegna standalone)
type ServiceType = 'cleaning' | 'cleaning_with_linen' | 'linen_only';

// 🔥 Funzione per trovare il prezzo di un item dell'ordine (mapping ID semantici -> inventario)
const findOrderItemPrice = (orderItem: { id: string; name: string; price?: number }, inventory: InventoryItem[]): number => {
  // 0. Se l'item ha già un prezzo salvato, usalo!
  if (orderItem.price && orderItem.price > 0) {
    return orderItem.price;
  }
  
  // 1. Prova match esatto per ID
  const byId = inventory.find(i => i.id === orderItem.id);
  if (byId) return byId.sellPrice;
  
  // 2. Prova match per KEY (es: "doubleSheets" -> trova "item_doubleSheets")
  const byKey = inventory.find(i => i.key === orderItem.id);
  if (byKey) return byKey.sellPrice;
  
  // 3. Prova con prefisso "item_" (es: "doubleSheets" -> "item_doubleSheets")
  const withPrefix = inventory.find(i => i.id === `item_${orderItem.id}`);
  if (withPrefix) return withPrefix.sellPrice;
  
  // 4. Prova senza prefisso "item_" (es: "item_doubleSheets" -> cerca "doubleSheets")
  if (orderItem.id.startsWith('item_')) {
    const withoutPrefix = orderItem.id.replace('item_', '');
    const found = inventory.find(i => i.key === withoutPrefix || i.id === withoutPrefix);
    if (found) return found.sellPrice;
  }
  
  // 5. Mapping ID standard conosciuti
  const idMapping: Record<string, string[]> = {
    // Biancheria Letto
    'doubleSheets': ['item_doubleSheets', 'lenzuola_matrimoniale', 'lenzuolaMatr'],
    'singleSheets': ['item_singleSheets', 'lenzuola_singolo', 'lenzuolaSing'],
    'pillowcases': ['item_pillowcases', 'federa', 'federe'],
    'lenzuola_matr': ['item_doubleSheets', 'doubleSheets'],
    'federa': ['item_pillowcases', 'pillowcases'],
    // Biancheria Bagno
    'towelsLarge': ['item_towelsLarge', 'telo_doccia', 'telo_corpo', 'asciugamano_grande'],
    'towelsFace': ['item_towelsFace', 'asciugamano_viso', 'telo_viso'],
    'towelsSmall': ['item_towelsSmall', 'asciugamano_bidet', 'asciugamano_ospite'],
    'bathMats': ['item_bathMats', 'tappetino_bagno', 'scendi_bagno', 'tappetino_scendibagno'],
    'telo_corpo': ['item_towelsLarge', 'towelsLarge'],
    'telo_viso': ['item_towelsFace', 'towelsFace'],
    'telo_bidet': ['item_towelsSmall', 'towelsSmall'],
    'scendi_bagno': ['item_bathMats', 'bathMats'],
  };
  
  // Cerca match per ID mappato
  const mappedIds = idMapping[orderItem.id];
  if (mappedIds) {
    for (const mappedId of mappedIds) {
      const found = inventory.find(i => i.id === mappedId || i.key === mappedId);
      if (found) return found.sellPrice;
    }
  }
  
  // 6. Match per nome (fuzzy)
  if (orderItem.name) {
    const nameLower = orderItem.name.toLowerCase();
    
    // Match esatto per nome
    const exactName = inventory.find(i => i.name.toLowerCase() === nameLower);
    if (exactName) return exactName.sellPrice;
    
    // Match parziale per keywords nel nome
    const keywordMatches: { keywords: string[], categoryHint?: string }[] = [
      { keywords: ['lenzuol', 'matrimonial'], categoryHint: 'letto' },
      { keywords: ['lenzuol', 'singol'], categoryHint: 'letto' },
      { keywords: ['feder'], categoryHint: 'letto' },
      { keywords: ['telo', 'doccia'], categoryHint: 'bagno' },
      { keywords: ['telo', 'corpo'], categoryHint: 'bagno' },
      { keywords: ['asciugamano', 'viso'], categoryHint: 'bagno' },
      { keywords: ['asciugamano', 'bidet'], categoryHint: 'bagno' },
      { keywords: ['tappetino', 'scendi'], categoryHint: 'bagno' },
    ];
    
    for (const match of keywordMatches) {
      if (match.keywords.every(kw => nameLower.includes(kw))) {
        const found = inventory.find(i => 
          match.keywords.some(kw => i.name.toLowerCase().includes(kw))
        );
        if (found) return found.sellPrice;
      }
    }
    
    // Match singola keyword
    const singleKeywords = ['matrimoniale', 'singolo', 'federa', 'doccia', 'corpo', 'viso', 'bidet', 'tappetino', 'scendi'];
    for (const kw of singleKeywords) {
      if (nameLower.includes(kw)) {
        const found = inventory.find(i => i.name.toLowerCase().includes(kw));
        if (found) return found.sellPrice;
      }
    }
  }
  
  // 7. Fallback - ritorna 0
  console.warn(`⚠️ Prezzo non trovato per item: id="${orderItem.id}", name="${orderItem.name}"`);
  return 0;
};

interface UnifiedService {
  id: string;
  type: ServiceType;
  propertyId: string;
  propertyName?: string;
  date: Date;
  scheduledTime?: string | null;
  status: string;
  // Campi pulizia
  cleaning?: Cleaning;
  // Campi ordine
  order?: Order;
  // Per ordini standalone
  items?: LinenItem[];
  riderName?: string;
}

interface PulizieViewProps {
  // Tutte le props sono ora opzionali - il componente carica i dati internamente
  properties?: Property[];
  cleanings?: Cleaning[];
  operators?: Operator[];
  ownerId?: string;
  isAdmin?: boolean;
}

type ViewMode = "calendar" | "list";
type TimeFilter = "all" | "today" | "week" | "month";
type StatusFilter = "all" | "completed" | "in_progress" | "scheduled";

const PROPERTY_COLORS = ['#8b5cf6', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];

// Funzione per pulire l'indirizzo (mostra solo via e numero, senza CAP/città)
function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  // Prende solo la prima parte prima della virgola (via e numero)
  const firstPart = address.split(',')[0].trim();
  // Rimuove eventuale CAP (5 cifre) se presente
  return firstPart.replace(/\s*\d{5}\s*/g, '').trim();
}

// Icona Letto
const BedIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v11m0-4h18m0 4V8a1 1 0 00-1-1H4a1 1 0 00-1 1v3h18M6 15v3m12-3v3" />
  </svg>
);

// 🔴 NUOVE ICONE SERVIZIO (monocromatiche, senza sfondo)
// Icona Solo Pulizia
const CleaningOnlyIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
  </svg>
);

// Icona Pulizia + Biancheria
const CleaningWithLinenIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4" opacity={0.5} />
  </svg>
);

// Icona Solo Biancheria (consegna standalone)
const LinenOnlyIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

// CSS per flash effect quando card si riordina
const reorderStyles = `
  .card-reorder-flash {
    animation: cardFlash 0.6s ease;
  }
  @keyframes cardFlash {
    0%, 100% { background: rgba(255,255,255,0.8); }
    30% { background: rgba(139, 92, 246, 0.15); }
    60% { background: rgba(139, 92, 246, 0.08); }
  }
`;

export function PulizieView({ 
  properties: externalProperties, 
  cleanings: externalCleanings, 
  operators: externalOperators,
  ownerId: externalOwnerId,
  isAdmin: externalIsAdmin 
}: PulizieViewProps = {}) {
  // 🔴 CENTRALIZZATO: Ottieni utente dal context di autenticazione
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  // Determina il ruolo automaticamente dall'utente loggato
  const isAdmin = externalIsAdmin !== undefined ? externalIsAdmin : (user?.role?.toUpperCase() === "ADMIN");
  const ownerId = externalOwnerId || user?.id;
  
  // 🔴 TUTTI GLI HOOKS DEVONO ESSERE QUI - PRIMA DI QUALSIASI RETURN CONDIZIONALE
  
  // Stati per i dati caricati internamente
  const [internalProperties, setInternalProperties] = useState<Property[]>([]);
  const [internalCleanings, setInternalCleanings] = useState<Cleaning[]>([]);
  const [internalOperators, setInternalOperators] = useState<Operator[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  
  // Stati UI
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showNewCleaningModal, setShowNewCleaningModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("next_cleaning");
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);
  const [adulti, setAdulti] = useState(2);
  const [neonati, setNeonati] = useState(0);
  const [savingGuests, setSavingGuests] = useState(false);

  // Stato per card espanse
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  
  // Stato per ordini biancheria
  const [orders, setOrders] = useState<Order[]>([]);

  // Stato per inventario (per nomi e prezzi)
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  // Stato per modal modifica pulizia
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCleaning, setEditingCleaning] = useState<Cleaning | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  // Stato per modifiche inline
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingGuestsId, setEditingGuestsId] = useState<string | null>(null);
  const [editingOperatorId, setEditingOperatorId] = useState<string | null>(null);
  const [savingInline, setSavingInline] = useState<string | null>(null);

  // Modal per orario
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeModalCleaning, setTimeModalCleaning] = useState<Cleaning | null>(null);
  const [tempTime, setTempTime] = useState("10:00");
  const [savingTime, setSavingTime] = useState(false);

  // Modal per operatore (multiselezione)
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [operatorModalCleaning, setOperatorModalCleaning] = useState<Cleaning | null>(null);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [savingOperator, setSavingOperator] = useState(false);

  // Modal dettaglio ordine biancheria
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);

  // Refs
  const calendarRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  
  // Hook per deep link da notifiche
  const searchParams = useSearchParams();
  const highlightCleaningId = searchParams.get('id');
  
  // Usa dati esterni se forniti, altrimenti usa quelli caricati internamente
  const properties = externalProperties || internalProperties;
  const cleanings = externalCleanings || internalCleanings;
  const operators = externalOperators || internalOperators;
  
  // 🔴 TUTTI GLI useEffect QUI
  
  // Carica dati automaticamente se non forniti esternamente
  useEffect(() => {
    // Se i dati sono forniti esternamente, non caricare
    if (externalProperties && externalCleanings) {
      setDataLoading(false);
      return;
    }
    
    // Se non c'è utente, non caricare
    if (!user?.id) {
      setDataLoading(false);
      return;
    }
    
    console.log("🔄 PulizieView: Caricamento dati centralizzato...");
    console.log("👤 User:", user.id, "Role:", user.role, "isAdmin:", isAdmin);
    
    // Listener per proprietà
    let propsQuery;
    if (isAdmin) {
      // Admin vede tutte le proprietà attive
      propsQuery = query(collection(db, "properties"));
    } else {
      // Proprietario vede solo le sue
      propsQuery = query(collection(db, "properties"), where("ownerId", "==", user.id));
    }
    
    const unsubProperties = onSnapshot(propsQuery, (snapshot) => {
      const props = snapshot.docs
        .filter(doc => doc.data().status === "ACTIVE")
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || "",
            address: data.address || "",
            imageUrl: data.imageUrl || null,
            cleaningPrice: data.cleaningPrice || 0,
            maxGuests: data.maxGuests || 0,
            bedrooms: data.bedrooms || 0,
            bathrooms: data.bathrooms || 0,
            bedsConfig: data.bedsConfig || [],
            serviceConfigs: data.serviceConfigs || {},
          };
        });
      setInternalProperties(props);
      console.log("✅ PulizieView: Proprietà caricate:", props.length);
    });

    // Listener per pulizie
    const unsubCleanings = onSnapshot(
      query(collection(db, "cleanings"), orderBy("scheduledDate", "asc")),
      (snapshot) => {
        const cleans = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            propertyId: data.propertyId || "",
            propertyName: data.propertyName || "",
            date: data.scheduledDate?.toDate?.() || new Date(),
            scheduledTime: data.scheduledTime || "10:00",
            status: data.status || "SCHEDULED",
            operator: data.operatorId ? { id: data.operatorId, name: data.operatorName || "" } : null,
            operators: data.operators || [],
            guestName: data.guestName || "",
            guestsCount: data.guestsCount || 2,
            adulti: data.adulti || 0,
            neonati: data.neonati || 0,
            bookingSource: data.bookingSource || "",
            notes: data.notes || "",
            // IMPORTANTE: Non usare || 0 per i prezzi - lascia undefined se non presente
            price: data.price,
            contractPrice: data.contractPrice || data.price,
            customLinenConfig: data.customLinenConfig || null,
            linenConfigModified: data.linenConfigModified || false,
            hasLinenOrder: data.hasLinenOrder, // 🔥 FIX: undefined = legacy (mostra dotazioni), false = no ordine
            priceModified: data.priceModified || false,
            serviceType: data.serviceType || "STANDARD",
            serviceTypeName: data.serviceTypeName || "",
            sgrossoReason: data.sgrossoReason || null,
            sgrossoNotes: data.sgrossoNotes || null,
            ratingScore: data.ratingScore || null,
            ratingId: data.ratingId || null,
            extraServices: data.extraServices || [],
            // Campi aggiuntivi per admin
            photos: data.photos || [],
            startedAt: data.startedAt || null,
            completedAt: data.completedAt || null,
            originalDate: data.originalDate?.toDate?.() || null,
            dateModifiedAt: data.dateModifiedAt?.toDate?.() || null,
            missedDeadline: data.missedDeadline || false,
            missedDeadlineAt: data.missedDeadlineAt || null,
          };
        });
        setInternalCleanings(cleans);
        console.log("✅ PulizieView: Pulizie caricate:", cleans.length);
        setDataLoading(false);
      }
    );

    // Carica operatori
    getDocs(query(collection(db, "users"), where("role", "==", "OPERATORE_PULIZIE")))
      .then(snapshot => {
        const ops = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || doc.data().email || "Operatore"
        }));
        setInternalOperators(ops);
        console.log("✅ PulizieView: Operatori caricati:", ops.length);
      });

    return () => {
      unsubProperties();
      unsubCleanings();
    };
  }, [user?.id, user?.role, isAdmin, externalProperties, externalCleanings]);
  
  // Redirect se non autenticato
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);
  
  // Auto-apri modal dettaglio se c'è ?id= nella URL
  useEffect(() => {
    if (highlightCleaningId && cleanings.length > 0) {
      const found = cleanings.find(c => c.id === highlightCleaningId);
      if (found) {
        // Trova la proprietà associata
        const prop = properties.find(p => p.id === found.propertyId);
        if (prop) {
          setEditingCleaning(found);
          setEditingProperty(prop);
          setShowEditModal(true);
        }
        // Imposta filtro per mostrare tutte le pulizie
        setStatusFilter("all");
      }
    }
  }, [highlightCleaningId, cleanings, properties]);

  // Inject CSS
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = reorderStyles;
    document.head.appendChild(styleEl);
    return () => styleEl.remove();
  }, []);

  // Carica inventario da Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        key: doc.data().key || doc.id, // 🔥 AGGIUNTO: key per mapping
        name: doc.data().name || "",
        sellPrice: doc.data().sellPrice || 0,
        category: doc.data().categoryId || doc.data().category || ""
      }));
      setInventory(items);
      console.log("✅ Inventario caricato:", items.length, "articoli");
    });
    return () => unsubscribe();
  }, []);

  // Carica ordini biancheria in realtime
  useEffect(() => {
    const propertyIds = properties.map(p => p.id);
    if (propertyIds.length === 0) return;

    const ordersRef = collection(db, "orders");
    const unsubscribe = onSnapshot(ordersRef, (snapshot) => {
      const ordersData = snapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            cleaningId: data.cleaningId || null,
            propertyId: data.propertyId,
            propertyName: data.propertyName || "",
            propertyAddress: data.propertyAddress || "",
            scheduledDate: data.scheduledDate?.toDate?.() || new Date(),
            scheduledTime: data.scheduledTime || "10:00",
            items: data.items || [],
            status: data.status || "PENDING",
            riderName: data.riderName || null,
          } as Order;
        })
        // 🔧 FIX: Escludi ordini cancellati
        .filter(o => o.status !== "CANCELLED" && o.status !== "cancelled")
        .filter(o => propertyIds.includes(o.propertyId));
      setOrders(ordersData);
      console.log("✅ Ordini caricati:", ordersData.length, "standalone:", ordersData.filter(o => !o.cleaningId).length);
    });

    return () => unsubscribe();
  }, [properties]);
  
  // Handler per aprire il dettaglio ordine
  const handleOpenOrderDetail = (order: Order) => {
    setSelectedOrderForDetail(order);
    setShowOrderDetailModal(true);
  };

  // 🔴 TUTTI I useMemo DEVONO ESSERE QUI - PRIMA DEI RETURN CONDIZIONALI
  
  // Crea lista unificata di servizi (pulizie + consegne standalone)
  const unifiedServices = useMemo((): UnifiedService[] => {
    if (!properties.length) return [];
    const services: UnifiedService[] = [];
    const propertyIds = properties.map(p => p.id);
    
    // Aggiungi pulizie
    cleanings.forEach(cleaning => {
      if (!propertyIds.includes(cleaning.propertyId)) return;
      
      // Controlla se ha ordine biancheria collegato
      const linkedOrder = orders.find(o => o.cleaningId === cleaning.id);
      const hasLinen = !!linkedOrder;
      
      services.push({
        id: cleaning.id,
        type: hasLinen ? 'cleaning_with_linen' : 'cleaning',
        propertyId: cleaning.propertyId,
        propertyName: cleaning.propertyName,
        date: new Date(cleaning.date),
        scheduledTime: cleaning.scheduledTime,
        status: cleaning.status,
        cleaning: cleaning,
        order: linkedOrder,
      });
    });
    
    // Aggiungi ordini standalone (senza cleaningId)
    orders.forEach(order => {
      if (order.cleaningId) return; // Skip ordini collegati a pulizie
      if (!propertyIds.includes(order.propertyId)) return;
      
      const property = properties.find(p => p.id === order.propertyId);
      
      services.push({
        id: `order_${order.id}`,
        type: 'linen_only',
        propertyId: order.propertyId,
        propertyName: order.propertyName || property?.name,
        date: order.scheduledDate ? new Date(order.scheduledDate) : new Date(),
        scheduledTime: order.scheduledTime,
        status: order.status,
        order: order,
        items: order.items,
        riderName: order.riderName,
      });
    });
    
    return services;
  }, [cleanings, orders, properties]);

  // Sync scroll: header segue scroll X della griglia, sidebar segue scroll Y
  const handleGridScroll = () => {
    if (gridRef.current && headerRef.current && sidebarRef.current) {
      headerRef.current.scrollLeft = gridRef.current.scrollLeft;
      sidebarRef.current.scrollTop = gridRef.current.scrollTop;
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 🔴 NUOVO: Filtra servizi unificati (pulizie + consegne standalone)
  const filteredServices = useMemo(() => {
    let filtered = [...unifiedServices];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(s => {
        const prop = properties.find(p => p.id === s.propertyId);
        return prop?.name.toLowerCase().includes(search) || 
               s.propertyName?.toLowerCase().includes(search) ||
               s.cleaning?.operator?.name?.toLowerCase().includes(search);
      });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    switch (timeFilter) {
      case "today":
        filtered = filtered.filter(s => {
          const d = new Date(s.date);
          return d.toDateString() === now.toDateString();
        });
        break;
      case "week":
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        filtered = filtered.filter(s => {
          const d = new Date(s.date);
          return d >= now && d <= weekEnd;
        });
        break;
      case "month":
        const monthEnd = new Date(now);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        filtered = filtered.filter(s => {
          const d = new Date(s.date);
          return d >= now && d <= monthEnd;
        });
        break;
    }

    // Filtro per stato
    switch (statusFilter) {
      case "completed":
        filtered = filtered.filter(s => s.status === "COMPLETED" || s.status === "DELIVERED");
        break;
      case "in_progress":
        filtered = filtered.filter(s => s.status === "IN_PROGRESS" || s.status === "IN_TRANSIT");
        break;
      case "scheduled":
        filtered = filtered.filter(s => 
          s.status !== "COMPLETED" && s.status !== "IN_PROGRESS" && 
          s.status !== "DELIVERED" && s.status !== "IN_TRANSIT"
        );
        break;
    }

    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [unifiedServices, properties, timeFilter, searchTerm, statusFilter]);

  const filteredCleanings = useMemo(() => {
    let filtered = [...cleanings];
    const propertyIds = properties.map(p => p.id);
    filtered = filtered.filter(c => propertyIds.includes(c.propertyId));

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(c => {
        const prop = properties.find(p => p.id === c.propertyId);
        return prop?.name.toLowerCase().includes(search) || 
               c.operator?.name?.toLowerCase().includes(search);
      });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    switch (timeFilter) {
      case "today":
        filtered = filtered.filter(c => {
          const d = new Date(c.date);
          return d.toDateString() === now.toDateString();
        });
        break;
      case "week":
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        filtered = filtered.filter(c => {
          const d = new Date(c.date);
          return d >= now && d <= weekEnd;
        });
        break;
      case "month":
        const monthEnd = new Date(now);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        filtered = filtered.filter(c => {
          const d = new Date(c.date);
          return d >= now && d <= monthEnd;
        });
        break;
    }

    // Filtro per stato
    switch (statusFilter) {
      case "completed":
        filtered = filtered.filter(c => c.status === "COMPLETED");
        break;
      case "in_progress":
        filtered = filtered.filter(c => c.status === "IN_PROGRESS");
        break;
      case "scheduled":
        filtered = filtered.filter(c => c.status !== "COMPLETED" && c.status !== "IN_PROGRESS");
        break;
    }

    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [cleanings, properties, timeFilter, searchTerm, statusFilter]);

  // Proprietà filtrate per il calendario
  // Funzione per trovare la prossima pulizia di una proprietà
  const getNextCleaning = (propertyId: string) => {
    const propertyCleanings = cleanings.filter(c => c.propertyId === propertyId);
    const futureCleanings = propertyCleanings.filter(c => {
      const cleaningDate = new Date(c.date);
      return cleaningDate >= today;
    });
    if (futureCleanings.length === 0) return null;
    return futureCleanings.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )[0];
  };

  const filteredProperties = useMemo(() => {
    let filtered = [...properties];
    
    // Filtro ricerca
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(search) || 
        p.address?.toLowerCase().includes(search)
      );
    }
    
    // Ordinamento
    if (sortBy === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "next_cleaning") {
      filtered.sort((a, b) => {
        const nextA = getNextCleaning(a.id);
        const nextB = getNextCleaning(b.id);
        if (!nextA && !nextB) return a.name.localeCompare(b.name);
        if (!nextA) return 1;
        if (!nextB) return -1;
        return new Date(nextA.date).getTime() - new Date(nextB.date).getTime();
      });
    }
    
    return filtered;
  }, [properties, searchTerm, sortBy, cleanings]);

  // 🔴 MODIFICATO: Raggruppa servizi unificati per data
  const groupedByDate = useMemo(() => {
    const groups: { [key: string]: UnifiedService[] } = {};
    filteredServices.forEach(s => {
      const dateKey = new Date(s.date).toDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(s);
    });
    
    // Ordina ogni gruppo per scheduledTime
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        const timeA = a.scheduledTime || '23:59';
        const timeB = b.scheduledTime || '23:59';
        return timeA.localeCompare(timeB);
      });
    });
    
    return groups;
  }, [filteredServices]);

  // Statistiche per i badge dei filtri di stato (basate sul filtro temporale attuale)
  const statusStats = useMemo(() => {
    const propertyIds = properties.map(p => p.id);
    let baseCleanings = cleanings.filter(c => propertyIds.includes(c.propertyId));
    
    // Applica filtro temporale
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    switch (timeFilter) {
      case "today":
        baseCleanings = baseCleanings.filter(c => {
          const d = new Date(c.date);
          return d.toDateString() === now.toDateString();
        });
        break;
      case "week":
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        baseCleanings = baseCleanings.filter(c => {
          const d = new Date(c.date);
          return d >= now && d <= weekEnd;
        });
        break;
      case "month":
        const monthEnd = new Date(now);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        baseCleanings = baseCleanings.filter(c => {
          const d = new Date(c.date);
          return d >= now && d <= monthEnd;
        });
        break;
    }
    
    // Applica filtro ricerca
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      baseCleanings = baseCleanings.filter(c => {
        const prop = properties.find(p => p.id === c.propertyId);
        return prop?.name.toLowerCase().includes(search) || 
               c.operator?.name?.toLowerCase().includes(search);
      });
    }
    
    return {
      all: baseCleanings.length,
      completed: baseCleanings.filter(c => c.status === "COMPLETED").length,
      in_progress: baseCleanings.filter(c => c.status === "IN_PROGRESS").length,
      scheduled: baseCleanings.filter(c => c.status !== "COMPLETED" && c.status !== "IN_PROGRESS").length,
    };
  }, [cleanings, properties, timeFilter, searchTerm]);

  const stats = useMemo(() => {
    const propertyIds = properties.map(p => p.id);
    const myCleanings = cleanings.filter(c => propertyIds.includes(c.propertyId));
    
    const todayCleanings = myCleanings.filter(c => 
      new Date(c.date).toDateString() === today.toDateString()
    );
    const weekCleanings = myCleanings.filter(c => {
      const d = new Date(c.date);
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return d >= today && d <= weekEnd;
    });
    
    return {
      today: todayCleanings.length,
      week: weekCleanings.length,
      properties: properties.length,
      completed: todayCleanings.filter(c => c.status === "COMPLETED").length,
      pending: todayCleanings.filter(c => !c.operator).length,
    };
  }, [cleanings, properties]);

  const ganttDays = useMemo(() => {
    const days = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(year, month, d);
      days.push({
        date,
        day: d,
        dayName: date.toLocaleDateString("it-IT", { weekday: "short" }).charAt(0).toUpperCase() + 
                 date.toLocaleDateString("it-IT", { weekday: "short" }).slice(1, 3),
        isToday: date.toDateString() === today.toDateString(),
        isSunday: date.getDay() === 0
      });
    }
    return days;
  }, [currentDate]);

  // Auto-scroll al giorno corrente quando si apre il calendario
  useEffect(() => {
    if (viewMode === "calendar") {
      const todayIndex = ganttDays.findIndex(d => d.isToday);
      if (todayIndex !== -1) {
        const cellWidth = 60;
        const scrollPosition = Math.max(0, (todayIndex * cellWidth) - 150);
        
        const timer = setTimeout(() => {
          if (calendarRef.current) {
            calendarRef.current.scrollLeft = scrollPosition;
          }
          if (headerRef.current) {
            headerRef.current.scrollLeft = scrollPosition;
          }
        }, 200);
        
        return () => clearTimeout(timer);
      }
    }
  }, [viewMode, currentDate, ganttDays]);

  // Blocca scroll quando modal è aperta
  useEffect(() => {
    if (showGuestModal || showNewCleaningModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showGuestModal, showNewCleaningModal]);

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  // Status config con gradienti e ombre
  const getStatusConfig = (status: string, hasOperator: boolean) => {
    switch (status) {
      case "COMPLETED":
        return { 
          bg: "bg-gradient-to-r from-emerald-400 to-teal-500", 
          gradient: "bg-gradient-to-r from-emerald-500 to-teal-400",
          cssGradient: "linear-gradient(135deg, rgba(16,185,129,0.9), rgba(20,184,166,0.85))",
          shadowColor: "rgba(16,185,129,0.4)",
          shadow: "shadow-lg shadow-emerald-200",
          badge: "bg-emerald-100 text-emerald-700",
          label: "Completata",
          icon: "✓",
          emoji: "✅"
        };
      case "IN_PROGRESS":
        return { 
          bg: "bg-gradient-to-r from-amber-400 to-orange-500", 
          gradient: "bg-gradient-to-r from-amber-500 to-orange-400",
          cssGradient: "linear-gradient(135deg, rgba(245,158,11,0.9), rgba(249,115,22,0.85))",
          shadowColor: "rgba(245,158,11,0.4)",
          shadow: "shadow-lg shadow-amber-200",
          badge: "bg-amber-100 text-amber-700",
          label: "In corso",
          icon: "●",
          emoji: "🧹"
        };
      case "SCHEDULED":
      case "ASSIGNED":
      case "PENDING":
      default:
        // Per il proprietario: tutto è "Programmata" (blu)
        // Per l'admin: mostra "Da assegnare" se non ha operatore
        if (isAdmin && !hasOperator) {
          return { 
            bg: "bg-gradient-to-r from-rose-400 to-red-500", 
            gradient: "bg-gradient-to-r from-rose-500 to-pink-400",
            cssGradient: "linear-gradient(135deg, rgba(244,63,94,0.9), rgba(251,113,133,0.85))",
            shadowColor: "rgba(244,63,94,0.4)",
            shadow: "shadow-lg shadow-rose-200",
            badge: "bg-rose-100 text-rose-700",
            label: "Da assegnare",
            icon: "!",
            emoji: "⚠️"
          };
        }
        return { 
          bg: "bg-gradient-to-r from-sky-400 to-blue-500", 
          gradient: "bg-gradient-to-r from-blue-500 to-indigo-400",
          cssGradient: "linear-gradient(135deg, rgba(59,130,246,0.9), rgba(99,102,241,0.85))",
          shadowColor: "rgba(59,130,246,0.4)",
          shadow: "shadow-lg shadow-blue-200",
          badge: "bg-sky-100 text-sky-700",
          label: "Programmata",
          icon: "○",
          emoji: "📅"
        };
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const openGuestModal = (cleaning: Cleaning) => {
    setSelectedCleaning(cleaning);
    setAdulti(cleaning.adulti || Math.max(1, (cleaning.guestsCount || 2) - (cleaning.neonati || 0)));
    setNeonati(cleaning.neonati || 0);
    setShowGuestModal(true);
  };

  // Apre modal orario
  const openTimeModal = (cleaning: Cleaning) => {
    setTimeModalCleaning(cleaning);
    setTempTime(cleaning.scheduledTime || "10:00");
    setShowTimeModal(true);
  };

  // Apre modal operatore (multiselezione)
  const openOperatorModal = (cleaning: Cleaning) => {
    setOperatorModalCleaning(cleaning);
    // Inizializza con gli operatori già assegnati
    const existingIds: string[] = [];
    if (cleaning.operators && cleaning.operators.length > 0) {
      cleaning.operators.forEach(op => {
        if (op.id) existingIds.push(op.id);
      });
    } else if (cleaning.operator?.id) {
      existingIds.push(cleaning.operator.id);
    }
    setSelectedOperatorIds(existingIds);
    setShowOperatorModal(true);
  };

  // Toggle selezione operatore
  const toggleOperatorSelection = (opId: string) => {
    setSelectedOperatorIds(prev => {
      if (prev.includes(opId)) {
        return prev.filter(id => id !== opId);
      } else {
        return [...prev, opId];
      }
    });
  };

  // Flash card dopo riordinamento
  const flashCard = (cardId: string) => {
    setTimeout(() => {
      const card = document.querySelector(`[data-id="${cardId}"]`) as HTMLElement;
      if (card) {
        card.classList.add('card-reorder-flash');
        setTimeout(() => card.classList.remove('card-reorder-flash'), 600);
      }
    }, 300);
  };

  // Salva orario da modal
  const saveTimeFromModal = async () => {
    if (!timeModalCleaning) return;
    const cardId = timeModalCleaning.id;
    setSavingTime(true);
    try {
      const cleaningRef = doc(db, "cleanings", timeModalCleaning.id);
      await updateDoc(cleaningRef, {
        scheduledTime: tempTime,
        updatedAt: new Date()
      });
      setShowTimeModal(false);
      setTimeModalCleaning(null);
      // Flash effect dopo riordinamento
      flashCard(cardId);
    } catch (error) {
      console.error("Errore salvataggio orario:", error);
      alert("Errore nel salvataggio");
    } finally {
      setSavingTime(false);
    }
  };

  // Salva operatori da modal (multiselezione)
  const saveOperatorFromModal = async () => {
    if (!operatorModalCleaning) return;
    setSavingOperator(true);
    try {
      const cleaningRef = doc(db, "cleanings", operatorModalCleaning.id);
      
      if (selectedOperatorIds.length > 0) {
        // Costruisci array di operatori
        const selectedOps = selectedOperatorIds.map(id => {
          const op = operators.find(o => o.id === id);
          return { id: id, name: op?.name || "" };
        });
        
        // Salva anche il primo come operator singolo per retrocompatibilità
        await updateDoc(cleaningRef, {
          operators: selectedOps,
          operatorId: selectedOps[0].id,
          operatorName: selectedOps[0].name,
          operator: selectedOps[0],
          status: "SCHEDULED",
          updatedAt: new Date()
        });
      } else {
        // Nessun operatore selezionato
        await updateDoc(cleaningRef, {
          operators: [],
          operatorId: null,
          operatorName: null,
          operator: null,
          updatedAt: new Date()
        });
      }
      setShowOperatorModal(false);
      setOperatorModalCleaning(null);
    } catch (error) {
      console.error("Errore salvataggio operatori:", error);
      alert("Errore nel salvataggio");
    } finally {
      setSavingOperator(false);
    }
  };

  // Apre la modal di modifica pulizia
  const openEditModal = (cleaning: Cleaning, property: Property | undefined, calculatedPrice?: number) => {
    // Se il prezzo nella pulizia è 0 ma abbiamo un prezzo calcolato, usiamolo
    const cleaningWithPrice = {
      ...cleaning,
      price: cleaning.price || calculatedPrice || property?.cleaningPrice || 0,
      contractPrice: cleaning.contractPrice || calculatedPrice || property?.cleaningPrice || 0
    };
    setEditingCleaning(cleaningWithPrice);
    setEditingProperty(property || null);
    setShowEditModal(true);
  };

  const saveGuests = async () => {
    if (!selectedCleaning) return;
    
    setSavingGuests(true);
    try {
      const cleaningRef = doc(db, "cleanings", selectedCleaning.id);
      await updateDoc(cleaningRef, {
        guestsCount: adulti + neonati,
        adulti: adulti,
        neonati: neonati,
        updatedAt: new Date()
      });
      setShowGuestModal(false);
    } catch (error) {
      console.error("Errore salvataggio ospiti:", error);
      alert("Errore nel salvataggio");
    } finally {
      setSavingGuests(false);
    }
  };

  // ========== FUNZIONI MODIFICA INLINE ==========
  
  // Salva orario inline
  const saveTimeInline = async (cleaningId: string, newTime: string) => {
    setSavingInline(cleaningId);
    try {
      const cleaningRef = doc(db, "cleanings", cleaningId);
      await updateDoc(cleaningRef, {
        scheduledTime: newTime,
        updatedAt: new Date()
      });
      setEditingTimeId(null);
    } catch (error) {
      console.error("Errore salvataggio orario:", error);
    } finally {
      setSavingInline(null);
    }
  };

  // Salva ospiti inline
  const saveGuestsInline = async (cleaningId: string, newCount: number) => {
    setSavingInline(cleaningId);
    try {
      const cleaningRef = doc(db, "cleanings", cleaningId);
      await updateDoc(cleaningRef, {
        guestsCount: newCount,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error("Errore salvataggio ospiti:", error);
    } finally {
      setSavingInline(null);
    }
  };

  // Salva operatore inline (solo admin)
  const saveOperatorInline = async (cleaningId: string, operatorId: string, operatorName: string) => {
    setSavingInline(cleaningId);
    try {
      const cleaningRef = doc(db, "cleanings", cleaningId);
      if (operatorId) {
        await updateDoc(cleaningRef, {
          operatorId: operatorId,
          operatorName: operatorName,
          status: "SCHEDULED",
          updatedAt: new Date()
        });
      } else {
        await updateDoc(cleaningRef, {
          operatorId: null,
          operatorName: null,
          updatedAt: new Date()
        });
      }
      setEditingOperatorId(null);
    } catch (error) {
      console.error("Errore salvataggio operatore:", error);
    } finally {
      setSavingInline(null);
    }
  };

  const navigateCalendar = (months: number) => {
    // FIX: Usa giorno 1 per evitare overflow mese (es: 31 gen -> 3 mar invece di 28 feb)
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + months, 1));
  };

  const toggleCardExpand = (cleaningId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cleaningId)) {
        newSet.delete(cleaningId);
      } else {
        newSet.add(cleaningId);
      }
      return newSet;
    });
  };

  // Funzione per ottenere ordine biancheria collegato alla pulizia
  const getLinenOrderForCleaning = (cleaningId: string, propertyId: string) => {
    return orders.find(o => o.cleaningId === cleaningId || (o.propertyId === propertyId && !o.cleaningId));
  };

  // ========== FUNZIONI DI AUTO-GENERAZIONE (come EditCleaningModal) ==========
  const generateAutoBeds = (maxGuests: number, bedrooms: number) => {
    const beds: { id: string; type: string; name: string; cap: number }[] = [];
    let rem = maxGuests, id = 1;
    for (let i = 0; i < bedrooms && rem > 0; i++) { 
      beds.push({ id: `b${id++}`, type: 'matr', name: 'Matrimoniale', cap: 2 }); 
      rem -= 2; 
    }
    if (rem >= 2) { beds.push({ id: `b${id++}`, type: 'divano', name: 'Divano Letto', cap: 2 }); rem -= 2; }
    if (rem === 1) { beds.push({ id: `b${id++}`, type: 'sing', name: 'Singolo', cap: 1 }); rem -= 1; }
    while (rem >= 2) { beds.push({ id: `b${id++}`, type: 'castello', name: 'Letto a Castello', cap: 2 }); rem -= 2; }
    if (rem === 1) { beds.push({ id: `b${id++}`, type: 'sing', name: 'Singolo', cap: 1 }); }
    return beds;
  };

  const getLinenForBedType = (t: string) => {
    switch (t) { 
      case 'matr': return { m: 3, s: 0, f: 2 }; 
      case 'sing': return { m: 0, s: 3, f: 1 }; 
      case 'divano': return { m: 3, s: 0, f: 2 }; 
      case 'castello': return { m: 0, s: 6, f: 2 }; 
      default: return { m: 0, s: 3, f: 1 }; 
    }
  };

  const calcLinenForBeds = (beds: { type: string }[]) => {
    const t = { m: 0, s: 0, f: 0 };
    beds.forEach(b => { const r = getLinenForBedType(b.type); t.m += r.m; t.s += r.s; t.f += r.f; });
    return t;
  };

  // ========== FUNZIONE PER OTTENERE BIANCHERIA (PRIORITÀ: customLinenConfig > serviceConfigs > AUTO) ==========
  const getLinenFromConfig = (property: Property | undefined, guestsCount: number, customLinenConfig?: any) => {
    const bedItems: { name: string; items: { name: string; quantity: number }[] }[] = [];
    const bathItems: { name: string; quantity: number }[] = [];
    const kitItems: { name: string; quantity: number }[] = [];
    
    // 🔥 PRIORITÀ: usa customLinenConfig se esiste, altrimenti serviceConfigs
    const config = customLinenConfig || property?.serviceConfigs?.[guestsCount];
    
    let totalPrice = 0;

    // Se abbiamo una config salvata, usala
    if (config) {
      // Biancheria Letto (bl)
      if (config.bl) {
        Object.entries(config.bl).forEach(([bedKey, items]) => {
          const bedName = bedKey === 'all' ? 'Biancheria Letto' : bedKey;
          const bedLinenItems: { name: string; quantity: number }[] = [];
          
          Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
            if (qty > 0) {
              const invItem = inventory.find(i => i.id === itemId);
              const defaultItem = ALL_INVENTORY_ITEMS.find(i => i.id === itemId);
              const name = invItem?.name || defaultItem?.name || itemId;
              const price = invItem?.sellPrice || defaultItem?.defaultPrice || 0;
              bedLinenItems.push({ name, quantity: qty });
              totalPrice += price * qty;
            }
          });
          
          if (bedLinenItems.length > 0) {
            bedItems.push({ name: bedName, items: bedLinenItems });
          }
        });
      }

      // Biancheria Bagno (ba)
      if (config.ba) {
        Object.entries(config.ba as Record<string, number>).forEach(([itemId, qty]) => {
          if (qty > 0) {
            const invItem = inventory.find(i => i.id === itemId);
            const defaultItem = ALL_INVENTORY_ITEMS.find(i => i.id === itemId);
            const name = invItem?.name || defaultItem?.name || itemId;
            const price = invItem?.sellPrice || defaultItem?.defaultPrice || 0;
            bathItems.push({ name, quantity: qty });
            totalPrice += price * qty;
          }
        });
      }

      // Kit Cortesia (ki)
      if (config.ki) {
        Object.entries(config.ki as Record<string, number>).forEach(([itemId, qty]) => {
          if (qty > 0) {
            const invItem = inventory.find(i => i.id === itemId);
            const defaultItem = ALL_INVENTORY_ITEMS.find(i => i.id === itemId);
            const name = invItem?.name || defaultItem?.name || itemId;
            const price = invItem?.sellPrice || defaultItem?.defaultPrice || 0;
            kitItems.push({ name, quantity: qty });
            totalPrice += price * qty;
          }
        });
      }
    } else {
      // 🔥 AUTO-GENERAZIONE: Calcola automaticamente come fa la modal
      const bedrooms = property?.bedrooms || 1;
      const bathrooms = property?.bathrooms || 1;
      
      // Genera letti automatici
      const autoBeds = generateAutoBeds(guestsCount, bedrooms);
      const selectedBeds = autoBeds.slice(0, Math.ceil(guestsCount / 2));
      const linenReq = calcLinenForBeds(selectedBeds);
      
      // Biancheria Letto (auto)
      const bedLinenItems: { name: string; quantity: number }[] = [];
      
      // Lenzuola matrimoniali
      if (linenReq.m > 0) {
        const item = inventory.find(i => i.name?.toLowerCase().includes('matrimoniale')) || 
                     ALL_INVENTORY_ITEMS.find(i => i.name?.toLowerCase().includes('matrimoniale'));
        if (item) {
          bedLinenItems.push({ name: item.name || 'Lenzuolo Matrimoniale', quantity: linenReq.m });
          totalPrice += (item.sellPrice || item.defaultPrice || 0) * linenReq.m;
        }
      }
      
      // Lenzuola singole
      if (linenReq.s > 0) {
        const item = inventory.find(i => i.name?.toLowerCase().includes('singol')) || 
                     ALL_INVENTORY_ITEMS.find(i => i.name?.toLowerCase().includes('singol'));
        if (item) {
          bedLinenItems.push({ name: item.name || 'Lenzuolo Singolo', quantity: linenReq.s });
          totalPrice += (item.sellPrice || item.defaultPrice || 0) * linenReq.s;
        }
      }
      
      // Federe
      if (linenReq.f > 0) {
        const item = inventory.find(i => i.name?.toLowerCase().includes('federa')) || 
                     ALL_INVENTORY_ITEMS.find(i => i.name?.toLowerCase().includes('federa'));
        if (item) {
          bedLinenItems.push({ name: item.name || 'Federa', quantity: linenReq.f });
          totalPrice += (item.sellPrice || item.defaultPrice || 0) * linenReq.f;
        }
      }
      
      if (bedLinenItems.length > 0) {
        bedItems.push({ name: 'Biancheria Letto', items: bedLinenItems });
      }
      
      // Biancheria Bagno (auto) - basata su numero ospiti e bagni
      const bathItemsAuto = [
        { keywords: ['corpo', 'telo doccia'], qty: guestsCount },
        { keywords: ['viso'], qty: guestsCount },
        { keywords: ['bidet'], qty: guestsCount },
        { keywords: ['scendi', 'tappetino'], qty: bathrooms }
      ];
      
      bathItemsAuto.forEach(({ keywords, qty }) => {
        const item = inventory.find(i => keywords.some(k => i.name?.toLowerCase().includes(k))) ||
                     ALL_INVENTORY_ITEMS.find(i => keywords.some(k => i.name?.toLowerCase().includes(k)));
        if (item && qty > 0) {
          bathItems.push({ name: item.name || keywords[0], quantity: qty });
          totalPrice += (item.sellPrice || item.defaultPrice || 0) * qty;
        }
      });
    }

    return { bedItems, bathItems, kitItems, totalPrice };
  };

  // Wrapper per retrocompatibilità
  const getLinenFromServiceConfig = (property: Property | undefined, guestsCount: number) => {
    return getLinenFromConfig(property, guestsCount);
  };

  // 🔴 RETURN CONDIZIONALI - DOPO TUTTI GLI HOOKS
  
  // Mostra loading se in caricamento
  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-24">
        <div className="flex items-center justify-center pt-32">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500"></div>
        </div>
      </div>
    );
  }
  
  // Se non c'è utente, non renderizzare nulla (il redirect è già in corso)
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      
      {/* HEADER - Premium Floating Accent Design */}
      <style>{`
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes bounce-soft {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-5px) scale(1.02); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 10px 40px rgba(168, 85, 247, 0.4); }
          50% { box-shadow: 0 15px 60px rgba(168, 85, 247, 0.6); }
        }
        @keyframes shine {
          0% { left: -100%; }
          100% { left: 200%; }
        }
        .gradient-animate {
          background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 25%, #a855f7 50%, #c026d3 75%, #7c3aed 100%);
          background-size: 200% 100%;
          animation: gradient-x 4s ease infinite;
        }
        .bounce-soft { animation: bounce-soft 2s ease-in-out infinite; }
        .glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }
        .shine-effect { position: relative; overflow: hidden; }
        .shine-effect::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 50%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          animation: shine 3s infinite;
        }
        .stat-card-float { transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .stat-card-float:hover { transform: translateY(-2px); background: rgba(255,255,255,0.15); }
      `}</style>
      
      {/* Banner container - NO overflow hidden */}
      <div className="relative">
        {/* Gradient background */}
        <div className="gradient-animate rounded-b-[32px]">
          {/* Mesh gradient overlay */}
          <div className="absolute inset-0 rounded-b-[32px] opacity-50" style={{ background: 'radial-gradient(circle at 20% 80%, rgba(236, 72, 153, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.3) 0%, transparent 50%)' }}></div>
          
          {/* Content */}
          <div className="relative z-10 px-4 pt-5 pb-16">
            <div className="max-w-4xl mx-auto">
              {/* Top section */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
                    <span className="text-2xl">🏠</span>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">
                      {isAdmin ? "Gestione Pulizie" : "Le Mie Pulizie"}
                    </h1>
                    <p className="text-purple-200 text-xs font-medium">
                      {isAdmin ? "Dashboard amministrazione" : "Tutto sotto controllo"}
                    </p>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center cursor-pointer hover:bg-white/25 transition-all">
                  <svg className="w-5 h-5 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
              </div>

              {/* Stats inline */}
              <div className="flex items-center justify-around bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                <div className="stat-card-float text-center px-3 py-2 rounded-xl cursor-pointer">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-xl">📋</span>
                    <span className="text-3xl font-bold text-white">{stats.today}</span>
                  </div>
                  <p className="text-purple-200 text-[10px] uppercase tracking-wider mt-1 font-medium">Oggi</p>
                </div>
                <div className="w-px h-12 bg-white/20"></div>
                <div className="stat-card-float text-center px-3 py-2 rounded-xl cursor-pointer">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-xl">📆</span>
                    <span className="text-3xl font-bold text-white">{stats.week}</span>
                  </div>
                  <p className="text-purple-200 text-[10px] uppercase tracking-wider mt-1 font-medium">Settimana</p>
                </div>
                <div className="w-px h-12 bg-white/20"></div>
                <div className="stat-card-float text-center px-3 py-2 rounded-xl cursor-pointer">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-xl">🏡</span>
                    <span className="text-3xl font-bold text-white">{stats.properties}</span>
                  </div>
                  <p className="text-purple-200 text-[10px] uppercase tracking-wider mt-1 font-medium">Proprietà</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* FLOATING CTA BUTTON - positioned outside the gradient div */}
        <div className="flex justify-center -mt-7 relative z-20 px-4">
          <button 
            onClick={() => setShowNewCleaningModal(true)}
            className="shine-effect px-6 py-4 rounded-2xl bg-white text-purple-700 font-bold text-base flex items-center gap-3 glow-pulse hover:scale-105 active:scale-95 transition-transform bounce-soft shadow-xl border border-purple-100"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-lg whitespace-nowrap">Richiedi Servizio</span>
            <svg className="w-5 h-5 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Small spacer */}
      <div className="h-4"></div>

      {/* TABS */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setViewMode("list")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
                viewMode === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Lista
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
                viewMode === "calendar" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Calendario
            </button>
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-4xl mx-auto space-y-3">
          {viewMode === "list" && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { key: "today" as TimeFilter, label: "Oggi" },
                { key: "week" as TimeFilter, label: "7 giorni" },
                { key: "month" as TimeFilter, label: "30 giorni" },
                { key: "all" as TimeFilter, label: "Tutte" },
              ].map(filter => (
                <button
                  key={filter.key}
                  onClick={() => setTimeFilter(filter.key)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap ${
                    timeFilter === filter.key ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
          
          {/* Filtri per Stato - Griglia Compatta */}
          {viewMode === "list" && (
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { key: "all" as StatusFilter, label: "Tutte", count: statusStats.all, color: "slate", icon: null },
                { key: "completed" as StatusFilter, label: "Fatte", count: statusStats.completed, color: "emerald", icon: "✓" },
                { key: "in_progress" as StatusFilter, label: "In corso", count: statusStats.in_progress, color: "amber", icon: "●" },
                { key: "scheduled" as StatusFilter, label: "Programmate", count: statusStats.scheduled, color: "sky", icon: "○" },
              ].map(filter => {
                const isActive = statusFilter === filter.key;
                const colorStyles: Record<string, { active: string; inactive: string; dot: string }> = {
                  slate: { active: "bg-slate-800 text-white", inactive: "bg-slate-100 text-slate-600", dot: "bg-slate-500" },
                  emerald: { active: "bg-emerald-600 text-white", inactive: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
                  amber: { active: "bg-amber-500 text-white", inactive: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
                  sky: { active: "bg-sky-600 text-white", inactive: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
                };
                const style = colorStyles[filter.color];
                
                return (
                  <button
                    key={filter.key}
                    onClick={() => setStatusFilter(filter.key)}
                    className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-xl font-medium transition-all ${
                      isActive ? `${style.active} shadow-md` : `${style.inactive} hover:shadow-sm`
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {filter.icon && <span className="text-[10px]">{filter.icon}</span>}
                      <span className="text-[11px] font-semibold">{filter.label}</span>
                    </div>
                    <span className={`text-lg font-bold leading-tight ${isActive ? "text-white/90" : ""}`}>
                      {filter.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Cerca proprietà..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            {viewMode === "calendar" && (
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="flex items-center gap-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 active:scale-95 touch-manipulation"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-50" onClick={() => setShowSortMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden min-w-[180px]">
                      <button
                        onClick={() => { setSortBy("name"); setShowSortMenu(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-3.5 text-sm transition-colors touch-manipulation ${
                          sortBy === "name" ? "bg-violet-50 text-violet-700" : "text-slate-700 active:bg-slate-100"
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9" />
                        </svg>
                        <span>Ordine Alfabetico</span>
                        {sortBy === "name" && (
                          <svg className="w-4 h-4 ml-auto text-violet-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => { setSortBy("next_cleaning"); setShowSortMenu(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-3.5 text-sm transition-colors touch-manipulation ${
                          sortBy === "next_cleaning" ? "bg-violet-50 text-violet-700" : "text-slate-700 active:bg-slate-100"
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
                        </svg>
                        <span>Prossima Pulizia</span>
                        {sortBy === "next_cleaning" && (
                          <svg className="w-4 h-4 ml-auto text-violet-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="px-4 py-4">
        <div className="max-w-4xl mx-auto">
          
          {viewMode === "list" && (
            <div className="space-y-5">
              {Object.keys(groupedByDate).length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-1">Nessuna pulizia trovata</h3>
                  <p className="text-slate-500 text-sm">Non ci sono pulizie per il periodo selezionato</p>
                </div>
              ) : (
                Object.entries(groupedByDate).map(([dateKey, dayServices]) => {
                  const date = new Date(dateKey);
                  const isToday = date.toDateString() === today.toDateString();
                  const dateLabel = isToday ? "Oggi" : date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
                  
                  // Conta per tipo
                  const cleaningsCount = dayServices.filter(s => s.type !== 'linen_only').length;
                  const linensCount = dayServices.filter(s => s.type === 'linen_only').length;
                  const serviceLabel = cleaningsCount > 0 && linensCount > 0 
                    ? `${cleaningsCount} pulizie, ${linensCount} consegne`
                    : cleaningsCount > 0 
                      ? `${cleaningsCount} ${cleaningsCount === 1 ? 'pulizia' : 'pulizie'}`
                      : `${linensCount} ${linensCount === 1 ? 'consegna' : 'consegne'}`;
                  
                  return (
                    <div key={dateKey}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`px-3 py-1 rounded-lg font-semibold text-sm ${isToday ? "bg-violet-500 text-white" : "bg-slate-200 text-slate-700"}`}>
                          {dateLabel}
                        </div>
                        <div className="flex-1 h-px bg-slate-200"></div>
                        <span className="text-xs text-slate-400">{serviceLabel}</span>
                      </div>

                      <LayoutGroup>
                      <div className="space-y-3">
                        {dayServices.map((service) => {
                          // Se è una pulizia, usa la logica esistente
                          if (service.type !== 'linen_only' && service.cleaning) {
                            const cleaning = service.cleaning;
                            const property = properties.find(p => p.id === cleaning.propertyId);
                            const status = getStatusConfig(cleaning.status, !!cleaning.operator);
                            const isExpanded = expandedCards.has(cleaning.id);
                            const hasLinenOrder = service.type === 'cleaning_with_linen';
                            
                            // 🔥 USA FUNZIONE CONDIVISA - stessa logica della modal
                            const { cleaningPrice, dotazioniPrice, totalPrice, bedItems, bathItems } = calculateDotazioni(
                              cleaning,
                              property,
                              inventory
                            );
                          
                          return (
                            <motion.div 
                              key={cleaning.id}
                              layoutId={cleaning.id}
                              layout="position"
                              initial={false}
                              transition={{
                                layout: {
                                  type: "spring",
                                  stiffness: 120,
                                  damping: 20,
                                  mass: 1
                                }
                              }}
                              className="bg-white/80 backdrop-blur-sm rounded-3xl overflow-hidden card-reorder"
                              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.04)' }}
                              data-id={cleaning.id}
                              data-time={cleaning.scheduledTime}
                            >
                              <div className="flex h-32">
                                {/* Foto Grande con overlay */}
                                <div className="relative w-32 h-32 flex-shrink-0">
                                  {property?.imageUrl ? (
                                    <img 
                                      src={property.imageUrl} 
                                      alt={property?.name || ''} 
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div 
                                      className="w-full h-full flex items-center justify-center"
                                      style={{ background: status.cssGradient }}
                                    >
                                      <svg className="w-12 h-12 text-white/30" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                                      </svg>
                                    </div>
                                  )}
                                  {/* Overlay sfumato */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                                  
                                  {/* Badge Stato Premium */}
                                  <div className="absolute top-2.5 left-2.5">
                                    <span 
                                      className="px-2.5 py-1 text-[10px] font-bold text-white rounded-lg flex items-center gap-1"
                                      style={{ 
                                        background: status.cssGradient,
                                        boxShadow: `0 2px 8px ${status.shadowColor || 'rgba(0,0,0,0.3)'}`
                                      }}
                                    >
                                      {status.icon === '✓' && (
                                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                      {status.icon === '!' && (
                                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                                      )}
                                      {status.icon === '●' && (
                                        <svg className="w-2.5 h-2.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                      )}
                                      {status.icon === '○' && (
                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                      )}
                                      {status.label}
                                    </span>
                                  </div>
                                  
                                  {/* Prezzo sulla foto */}
                                  <div className="absolute bottom-2 right-2">
                                    <span className="text-2xl font-black text-white drop-shadow-lg">€{totalPrice.toFixed(0)}</span>
                                  </div>
                                </div>
                                
                                {/* Contenuto */}
                                <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0">
                                  {/* Header */}
                                  <div className="cursor-pointer" onClick={() => openEditModal(cleaning, property, cleaningPrice)}>
                                    <div className="flex items-center gap-2">
                                      {/* 🔴 NUOVA: Icona tipo servizio */}
                                      <div className="flex-shrink-0" title={hasLinenOrder ? "Pulizia + Biancheria" : "Solo Pulizia"}>
                                        {hasLinenOrder ? (
                                          <CleaningWithLinenIcon className="w-4 h-4 text-violet-500" />
                                        ) : (
                                          <CleaningOnlyIcon className="w-4 h-4 text-violet-400" />
                                        )}
                                      </div>
                                      <h3 className="font-semibold text-[13px] text-gray-900 truncate leading-tight">{property?.name || cleaning.propertyName}</h3>
                                      {/* Badge tipo servizio */}
                                      {cleaning.serviceType === "APPROFONDITA" && (
                                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded-md uppercase">
                                          Approfondita
                                        </span>
                                      )}
                                      {cleaning.serviceType === "SGROSSO" && (
                                        <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-bold rounded-md uppercase">
                                          Sgrosso
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-gray-400 truncate mt-0.5">{cleanAddress(property?.address)}</p>
                                  </div>
                                  
                                  {/* Controlli con ombre */}
                                  <div className="flex items-center gap-2 mt-2">
                                    {/* ORARIO - solo admin può modificare */}
                                    {isAdmin ? (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); openTimeModal(cleaning); }}
                                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5 transition-all hover:scale-105"
                                        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' }}
                                      >
                                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="text-[11px] font-semibold text-gray-700">{cleaning.scheduledTime || "TBD"}</span>
                                      </button>
                                    ) : (
                                      <div 
                                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' }}
                                      >
                                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="text-[11px] font-semibold text-gray-500">{cleaning.scheduledTime || "TBD"}</span>
                                      </div>
                                    )}
                                    
                                    {/* OSPITI - apre modal */}
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openGuestModal(cleaning); }}
                                      className="h-7 px-2.5 rounded-xl flex items-center gap-1.5 transition-all hover:scale-105"
                                      style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' }}
                                    >
                                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                      <span className="text-[11px] font-semibold text-gray-700">{cleaning.guestsCount || 0}</span>
                                    </button>
                                  </div>
                                  
                                  {/* Operatori (supporto multi-selezione) */}
                                  <div className="flex items-center justify-between mt-2">
                                    {isAdmin ? (
                                      <div onClick={(e) => e.stopPropagation()}>
                                        {(() => {
                                          const opList = cleaning.operators && cleaning.operators.length > 0 
                                            ? cleaning.operators 
                                            : (cleaning.operator ? [cleaning.operator] : []);
                                          
                                          if (opList.length === 0) {
                                            return (
                                              <button 
                                                onClick={() => openOperatorModal(cleaning)}
                                                className="h-7 px-3 rounded-xl flex items-center gap-1.5 transition-all hover:scale-105"
                                                style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', boxShadow: '0 4px 12px rgba(15,23,42,0.3)' }}
                                              >
                                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                                </svg>
                                                <span className="text-[10px] font-bold text-white">Assegna</span>
                                              </button>
                                            );
                                          }
                                          
                                          return (
                                            <button 
                                              onClick={() => openOperatorModal(cleaning)}
                                              className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-all hover:scale-105"
                                              style={{ background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)', boxShadow: '0 2px 8px rgba(168,85,247,0.15)' }}
                                            >
                                              {opList.map((op, idx) => {
                                                if (!op) return null;
                                                const colors = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b'];
                                                const colorsDark = ['#9333ea', '#2563eb', '#059669', '#d97706'];
                                                const color = colors[idx % 4];
                                                const colorDark = colorsDark[idx % 4];
                                                
                                                // Primi 2: avatar + nome completo
                                                if (idx < 2) {
                                                  return (
                                                    <div key={op.id || idx} className="flex items-center gap-1">
                                                      <div 
                                                        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                                                        style={{ background: `linear-gradient(135deg, ${color} 0%, ${colorDark} 100%)` }}
                                                      >
                                                        <span className="text-[8px] font-bold text-white">{getInitials(op.name)}</span>
                                                      </div>
                                                      <span className="text-[11px] font-semibold text-purple-700">{op.name || 'Operatore'}</span>
                                                    </div>
                                                  );
                                                }
                                                
                                                // Dal 3°: solo avatar
                                                return (
                                                  <div 
                                                    key={op.id || idx}
                                                    className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 -ml-1"
                                                    style={{ background: `linear-gradient(135deg, ${color} 0%, ${colorDark} 100%)`, border: '2px solid white' }}
                                                  >
                                                    <span className="text-[8px] font-bold text-white">{getInitials(op.name)}</span>
                                                  </div>
                                                );
                                              })}
                                            </button>
                                          );
                                        })()}
                                      </div>
                                    ) : (
                                      (() => {
                                        const opList = cleaning.operators && cleaning.operators.length > 0 
                                          ? cleaning.operators 
                                          : (cleaning.operator ? [cleaning.operator] : []);
                                        
                                        if (opList.length === 0) {
                                          return (
                                            <div 
                                              className="flex items-center gap-1 px-2 py-1 rounded-xl"
                                              style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' }}
                                            >
                                              <span className="text-[10px] font-medium text-slate-500">In gestione</span>
                                            </div>
                                          );
                                        }
                                        
                                        return (
                                          <div 
                                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl"
                                            style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', boxShadow: '0 2px 8px rgba(16,185,129,0.15)' }}
                                          >
                                            {opList.map((op, idx) => {
                                              if (!op) return null;
                                              const colors = ['#10b981', '#3b82f6', '#a855f7', '#f59e0b'];
                                              const colorsDark = ['#059669', '#2563eb', '#9333ea', '#d97706'];
                                              const color = colors[idx % 4];
                                              const colorDark = colorsDark[idx % 4];
                                              
                                              // Primi 2: avatar + nome completo
                                              if (idx < 2) {
                                                return (
                                                  <div key={op.id || idx} className="flex items-center gap-1">
                                                    <div 
                                                      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                                                      style={{ background: `linear-gradient(135deg, ${color} 0%, ${colorDark} 100%)` }}
                                                    >
                                                      <span className="text-[8px] font-bold text-white">{getInitials(op.name)}</span>
                                                    </div>
                                                    <span className="text-[11px] font-semibold text-emerald-700">{op.name || 'Operatore'}</span>
                                                  </div>
                                                );
                                              }
                                              
                                              // Dal 3°: solo avatar
                                              return (
                                                <div 
                                                  key={op.id || idx}
                                                  className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 -ml-1"
                                                  style={{ background: `linear-gradient(135deg, ${color} 0%, ${colorDark} 100%)`, border: '2px solid white' }}
                                                >
                                                  <span className="text-[8px] font-bold text-white">{getInitials(op.name)}</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      })()
                                    )}
                                    
                                    {/* Espandi */}
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); toggleCardExpand(cleaning.id); }}
                                      className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                                      style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                                    >
                                      <svg 
                                        className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
                                        fill="none" 
                                        stroke="currentColor" 
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              </div>
                              
                              {/* ========== DETTAGLI ESPANDIBILI ========== */}
                              <AnimatePresence>
                              {isExpanded && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3, ease: "easeInOut" }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                                  
                                  {/* 🏷️ Badge Fonte e Modifiche - Stile coerente con la pagina */}
                                  <div className="flex flex-wrap items-center gap-2 mb-3">
                                    {/* Badge iCal (automatico) o Manuale */}
                                    {cleaning.bookingSource && cleaning.bookingSource !== '' && cleaning.bookingSource !== 'manual' ? (
                                      <div 
                                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                        style={{ 
                                          background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', 
                                          boxShadow: '0 2px 8px rgba(59, 130, 246, 0.15), inset 0 1px 0 rgba(255,255,255,0.8)' 
                                        }}
                                      >
                                        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-[11px] font-semibold text-blue-600">iCal</span>
                                      </div>
                                    ) : (
                                      <div 
                                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                        style={{ 
                                          background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', 
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' 
                                        }}
                                      >
                                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                        <span className="text-[11px] font-semibold text-slate-500">Manuale</span>
                                      </div>
                                    )}
                                    
                                    {/* Badge Biancheria Modificata */}
                                    {cleaning.linenConfigModified && (
                                      <div 
                                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                        style={{ 
                                          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', 
                                          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15), inset 0 1px 0 rgba(255,255,255,0.8)' 
                                        }}
                                      >
                                        <span className="text-sm">🛏️</span>
                                        <span className="text-[11px] font-semibold text-amber-700">Biancheria personalizzata</span>
                                      </div>
                                    )}
                                    
                                    {/* Badge Prezzo Modificato */}
                                    {cleaning.priceModified && (
                                      <div 
                                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                        style={{ 
                                          background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)', 
                                          boxShadow: '0 2px 8px rgba(168, 85, 247, 0.15), inset 0 1px 0 rgba(255,255,255,0.8)' 
                                        }}
                                      >
                                        <span className="text-sm">💰</span>
                                        <span className="text-[11px] font-semibold text-purple-700">Prezzo modificato</span>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Riga Pulizia / Dotazioni */}
                                  <div className="flex items-center justify-between mb-4 py-2 px-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-500">Pulizia:</span>
                                      <span className="text-xs font-bold text-gray-800">€{cleaningPrice.toFixed(2)}</span>
                                    </div>
                                    {dotazioniPrice > 0 ? (
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-gray-500">Dotazioni:</span>
                                        <span className="text-xs font-bold text-gray-800">€{dotazioniPrice.toFixed(2)}</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-slate-400 italic">Senza biancheria</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Biancheria Letto */}
                                  {bedItems.length > 0 && (
                                    <div className="mb-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
                                          <BedIcon />
                                        </div>
                                        <span className="text-xs font-semibold text-gray-700">Biancheria Letto</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {bedItems.map((item, idx) => (
                                          <span key={idx} className="px-2 py-1 bg-slate-50 rounded-lg text-[10px] text-gray-600 border border-slate-200">
                                            {item.name}: <span className="font-bold">{item.quantity}</span>
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Biancheria Bagno */}
                                  {bathItems.length > 0 && (
                                    <div className="mb-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                                          <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 6v12a2 2 0 002 2h12a2 2 0 002-2V6M4 6l2-2h12l2 2M9 10h6" />
                                          </svg>
                                        </div>
                                        <span className="text-xs font-semibold text-gray-700">Biancheria Bagno</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {bathItems.map((item, idx) => (
                                          <span key={idx} className="px-2 py-1 bg-blue-50 rounded-lg text-[10px] text-blue-600 border border-blue-100">
                                            {item.name}: <span className="font-bold">{item.quantity}</span>
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Messaggio se non ci sono dati */}
                                  {bedItems.length === 0 && bathItems.length === 0 && (
                                    <div className="mb-3 p-3 rounded-xl flex items-center justify-center gap-2"
                                      style={{ 
                                        background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', 
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' 
                                      }}>
                                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      <span className="text-xs font-semibold text-slate-500">Solo Pulizia — Nessun ordine biancheria</span>
                                    </div>
                                  )}

                                  {/* Pulsante Modifica */}
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); openEditModal(cleaning, property, cleaningPrice); }}
                                    className="w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', boxShadow: '0 4px 12px rgba(15,23,42,0.25)' }}
                                  >
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-white">Modifica Servizio</span>
                                  </button>
                                  </div>
                                </motion.div>
                              )}
                              </AnimatePresence>
                            </motion.div>
                          );
                          } else {
                            // 🔴 CARD PER CONSEGNA STANDALONE (solo biancheria)
                            const order = service.order!;
                            const property = properties.find(p => p.id === service.propertyId);
                            const totalItems = service.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
                            const isExpanded = expandedCards.has(service.id);
                            
                            // Calcola prezzo totale degli articoli
                            const orderTotalPrice = service.items?.reduce((sum, item) => {
                              // 🔥 FIX: Usa funzione di mapping per trovare prezzi
                              const price = findOrderItemPrice(item, inventory);
                              return sum + (price * item.quantity);
                            }, 0) || 0;
                            
                            // Status config per ordini
                            const getOrderStatusConfig = (status: string) => {
                              switch (status?.toUpperCase()) {
                                case 'DELIVERED':
                                  return { label: 'Consegnato', cssGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', icon: '✓' };
                                case 'IN_TRANSIT':
                                  return { label: 'In consegna', cssGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', icon: '●' };
                                case 'ASSIGNED':
                                  return { label: 'Assegnato', cssGradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', icon: '!' };
                                default:
                                  return { label: 'In attesa', cssGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', icon: '○' };
                              }
                            };
                            const orderStatus = getOrderStatusConfig(order.status);
                            
                            return (
                              <motion.div 
                                key={service.id}
                                layoutId={service.id}
                                layout="position"
                                initial={false}
                                transition={{
                                  layout: {
                                    type: "spring",
                                    stiffness: 120,
                                    damping: 20,
                                    mass: 1
                                  }
                                }}
                                onClick={() => handleOpenOrderDetail(order)}
                                className="bg-white/80 backdrop-blur-sm rounded-3xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                                style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.04)' }}
                              >
                                <div className="flex h-32">
                                  {/* Foto/Placeholder con overlay arancione per consegne */}
                                  <div className="relative w-32 h-32 flex-shrink-0">
                                    {property?.imageUrl ? (
                                      <img 
                                        src={property.imageUrl} 
                                        alt={property?.name || ''} 
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div 
                                        className="w-full h-full flex items-center justify-center"
                                        style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
                                      >
                                        <LinenOnlyIcon className="w-12 h-12 text-white/30" />
                                      </div>
                                    )}
                                    {/* Overlay sfumato */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                                    
                                    {/* Badge Stato */}
                                    <div className="absolute top-2.5 left-2.5">
                                      <span 
                                        className="px-2.5 py-1 text-[10px] font-bold text-white rounded-lg flex items-center gap-1"
                                        style={{ 
                                          background: orderStatus.cssGradient,
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                                        }}
                                      >
                                        {orderStatus.icon === '✓' && (
                                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                        )}
                                        {orderStatus.icon === '●' && (
                                          <svg className="w-2.5 h-2.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                          </svg>
                                        )}
                                        {orderStatus.icon === '!' && (
                                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                                        )}
                                        {orderStatus.icon === '○' && (
                                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                        )}
                                        {orderStatus.label}
                                      </span>
                                    </div>
                                    
                                    {/* 🔴 PREZZO TOTALE sulla foto (invece di numero articoli) */}
                                    <div className="absolute bottom-2 right-2">
                                      <span className="text-2xl font-black text-white drop-shadow-lg">€{orderTotalPrice.toFixed(0)}</span>
                                    </div>
                                  </div>
                                  
                                  {/* Contenuto */}
                                  <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0">
                                    {/* Header */}
                                    <div>
                                      <div className="flex items-center gap-2">
                                        {/* Icona tipo servizio */}
                                        <div className="flex-shrink-0" title="Solo Biancheria">
                                          <LinenOnlyIcon className="w-4 h-4 text-orange-500" />
                                        </div>
                                        <h3 className="font-semibold text-[13px] text-gray-900 truncate leading-tight">{service.propertyName || property?.name}</h3>
                                        <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-bold rounded-md uppercase flex-shrink-0">
                                          Consegna
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{cleanAddress(property?.address)}</p>
                                    </div>
                                    
                                    {/* Info */}
                                    <div className="flex items-center gap-2 mt-2">
                                      {/* Orario */}
                                      <div 
                                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                        style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', boxShadow: '0 2px 8px rgba(249,115,22,0.1)' }}
                                      >
                                        <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="text-[11px] font-semibold text-orange-700">{service.scheduledTime || "TBD"}</span>
                                      </div>
                                      
                                      {/* Articoli */}
                                      <div 
                                        className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                                      >
                                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                        </svg>
                                        <span className="text-[11px] font-semibold text-gray-700">{totalItems} articoli</span>
                                      </div>
                                      
                                      {/* Rider se assegnato */}
                                      {service.riderName && (
                                        <div 
                                          className="h-7 px-2.5 rounded-xl flex items-center gap-1.5"
                                          style={{ background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)' }}
                                        >
                                          <svg className="w-3 h-3 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                          </svg>
                                          <span className="text-[11px] font-semibold text-violet-700 truncate max-w-[60px]">{service.riderName}</span>
                                        </div>
                                      )}
                                      
                                      {/* 🔴 PULSANTE ESPANDI */}
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); toggleCardExpand(service.id); }}
                                        className="ml-auto w-7 h-7 rounded-xl flex items-center justify-center transition-all hover:scale-110"
                                        style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                                      >
                                        <svg 
                                          className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
                                          fill="none" 
                                          stroke="currentColor" 
                                          viewBox="0 0 24 24"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* 🔴 DETTAGLI ESPANDIBILI PER CONSEGNA */}
                                <AnimatePresence>
                                {isExpanded && (
                                  <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 pb-4 pt-2 border-t border-orange-100">
                                      {/* Riga Totale */}
                                      <div className="flex items-center justify-between mb-4 py-2 px-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)' }}>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-orange-600">Totale articoli:</span>
                                          <span className="text-xs font-bold text-orange-800">{totalItems}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-orange-600">Costo totale:</span>
                                          <span className="text-sm font-bold text-orange-800">€{orderTotalPrice.toFixed(2)}</span>
                                        </div>
                                      </div>

                                      {/* Lista Articoli */}
                                      {service.items && service.items.length > 0 && (
                                        <div className="mb-4">
                                          <div className="flex items-center gap-2 mb-2">
                                            <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center">
                                              <LinenOnlyIcon className="w-3.5 h-3.5 text-orange-600" />
                                            </div>
                                            <span className="text-xs font-semibold text-gray-700">Articoli ordinati</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1.5">
                                            {service.items.map((item, idx) => {
                                              const itemName = item.name || item.id;
                                              return (
                                                <span key={idx} className="px-2 py-1 bg-orange-50 rounded-lg text-[10px] text-orange-700 border border-orange-200">
                                                  {itemName}: <span className="font-bold">{item.quantity}</span>
                                                </span>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      {/* Messaggio se non ci sono articoli */}
                                      {(!service.items || service.items.length === 0) && (
                                        <div className="mb-3 p-3 bg-orange-50 rounded-xl text-center">
                                          <p className="text-xs text-orange-600">Nessun articolo nella consegna</p>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                                </AnimatePresence>
                              </motion.div>
                            );
                          }
                        })}
                      </div>
                      </LayoutGroup>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {viewMode === "calendar" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
              
              {/* Navigation header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <button 
                  onClick={() => navigateCalendar(-1)}
                  className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 capitalize">{monthName}</h3>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="px-2 py-1 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-md"
                  >
                    Oggi
                  </button>
                </div>
                <button 
                  onClick={() => navigateCalendar(1)}
                  className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Header giorni */}
              <div 
                ref={headerRef}
                className="overflow-x-auto sticky top-[68px] z-40 bg-white"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <div className="grid border-b-2 border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `repeat(${ganttDays.length}, 60px)` }}>
                  {ganttDays.map((day, i) => (
                    <div key={i} className={`py-2 text-center border-r border-slate-200 last:border-r-0 ${day.isToday ? "bg-emerald-100" : "bg-slate-50"}`}>
                      <div className={`text-[9px] font-semibold ${day.isToday ? "text-emerald-600" : day.isSunday ? "text-rose-400" : "text-slate-400"}`}>
                        {day.dayName}
                      </div>
                      {day.isToday ? (
                        <div className="w-7 h-7 mx-auto rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center mt-0.5 shadow">
                          {day.day}
                        </div>
                      ) : (
                        <div className={`text-xs font-bold mt-0.5 ${day.isSunday ? "text-rose-400" : "text-slate-700"}`}>
                          {day.day}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Griglia proprietà */}
              <div 
                ref={calendarRef} 
                className="overflow-x-auto"
                onScroll={(e) => {
                  if (headerRef.current) {
                    headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
              >

                {/* Righe proprietà */}
                {filteredProperties.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">Nessuna proprietà trovata</div>
                ) : (
                  filteredProperties.map((property, propIndex) => {
                    const propertyCleanings = cleanings.filter(c => c.propertyId === property.id);
                    
                    return (
                      <div key={property.id} className="relative h-[70px] border-b-2 border-slate-200 last:border-b-0" style={{ width: `${ganttDays.length * 60}px` }}>
                        
                        {/* Badge nome proprietà */}
                        <div 
                          className="h-5 flex items-center gap-1.5 pl-1.5 pr-3 rounded-br-lg shadow-md sticky left-0 w-fit"
                          style={{ 
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
                            zIndex: 10, 
                            marginBottom: '-20px',
                            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                          }}
                        >
                          <div className="w-4 h-4 rounded bg-white/25 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[8px] font-bold drop-shadow-sm">{property.name.charAt(0)}</span>
                          </div>
                          <span className="text-white text-[10px] font-semibold whitespace-nowrap drop-shadow-sm">{property.name}</span>
                          {property.address && (
                            <>
                              <span className="text-white/60 text-[10px]">-</span>
                              <span className="text-white/80 text-[9px] whitespace-nowrap drop-shadow-sm">{cleanAddress(property.address)}</span>
                            </>
                          )}
                        </div>

                        {/* Griglia sfondo */}
                        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${ganttDays.length}, 60px)` }}>
                          {ganttDays.map((day, i) => (
                            <div key={i} className={`border-r border-slate-200 last:border-r-0 ${day.isToday ? "bg-emerald-50" : ""}`} />
                          ))}
                        </div>

                        {/* Blocchi pulizie */}
                        {propertyCleanings.map((cleaning) => {
                          const cleaningDate = new Date(cleaning.date);
                          const dayIndex = ganttDays.findIndex(d => d.date.toDateString() === cleaningDate.toDateString());
                          if (dayIndex === -1) return null;
                          const status = getStatusConfig(cleaning.status, !!cleaning.operator);
                          
                          return (
                            <div
                              key={cleaning.id}
                              className={`absolute top-[24px] ${status.bg} rounded-lg shadow-lg flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform z-10`}
                              style={{ left: `${dayIndex * 60 + 3}px`, width: "54px", height: "42px" }}
                              onClick={() => openEditModal(cleaning, property, cleaning.price || cleaning.contractPrice || property?.cleaningPrice || 0)}
                            >
                              <span className="text-white text-[10px] font-bold drop-shadow">{cleaning.scheduledTime || "TBD"}</span>
                              <div className="flex items-center gap-0.5">
                                <svg className="w-3 h-3 text-white/90" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                                </svg>
                                <span className="text-white/90 text-[9px] font-semibold">{cleaning.guestsCount || 0}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Legenda */}
              <div className="p-3 border-t border-slate-200 bg-slate-50">
                <div className="flex flex-wrap justify-center gap-3 text-[10px]">
                  {[
                    { bg: "from-emerald-400 to-teal-500", label: "Completata", icon: "✓" },
                    { bg: "from-amber-400 to-orange-500", label: "In corso", icon: "●" },
                    { bg: "from-sky-400 to-blue-500", label: "Programmata", icon: "○" },
                    ...(isAdmin ? [{ bg: "from-rose-400 to-red-500", label: "Da assegnare", icon: "!" }] : []),
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className={`w-4 h-4 rounded bg-gradient-to-r ${item.bg} flex items-center justify-center text-white text-[8px] font-bold shadow`}>
                        {item.icon}
                      </div>
                      <span className="text-slate-600">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showGuestModal && selectedCleaning && (() => {
        // 🔧 Calcola maxGuests dalla pulizia o dalla proprietà
        const cleaningProperty = properties.find(p => p.id === selectedCleaning.propertyId);
        const maxGuestsLimit = selectedCleaning.maxGuests || cleaningProperty?.maxGuests || 6;
        
        return (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          style={{ overflow: 'hidden' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowGuestModal(false); }}
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-slate-800">Numero ospiti</h3>
                <button 
                  onClick={() => setShowGuestModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
                >
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center justify-between py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-medium text-slate-800">Adulti</span>
                    <p className="text-xs text-slate-400">Max {maxGuestsLimit}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setAdulti(Math.max(1, adulti - 1))} className="w-9 h-9 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30" disabled={adulti <= 1}>
                    <span className="text-lg">−</span>
                  </button>
                  <span className="text-xl font-bold text-slate-800 w-6 text-center">{adulti}</span>
                  <button onClick={() => setAdulti(Math.min(maxGuestsLimit, adulti + 1))} disabled={adulti >= maxGuestsLimit} className="w-9 h-9 rounded-full bg-violet-500 flex items-center justify-center text-white shadow-lg disabled:opacity-30">
                    <span className="text-lg">+</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-medium text-slate-800">Neonati</span>
                    <p className="text-xs text-slate-400">0-2 anni</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setNeonati(Math.max(0, neonati - 1))} className="w-9 h-9 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30" disabled={neonati <= 0}>
                    <span className="text-lg">−</span>
                  </button>
                  <span className="text-xl font-bold text-slate-800 w-6 text-center">{neonati}</span>
                  <button onClick={() => setNeonati(neonati + 1)} className="w-9 h-9 rounded-full bg-rose-500 flex items-center justify-center text-white shadow-lg">
                    <span className="text-lg">+</span>
                  </button>
                </div>
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Totale ospiti</span>
                  <span className="text-lg font-bold text-slate-800">{adulti + neonati}</span>
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowGuestModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl">
                  Annulla
                </button>
                <button onClick={saveGuests} disabled={savingGuests} className="flex-1 py-3 bg-slate-800 text-white font-semibold rounded-xl disabled:opacity-50">
                  {savingGuests ? "Salvo..." : "Conferma"}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      <NewCleaningModal
        isOpen={showNewCleaningModal}
        onClose={() => setShowNewCleaningModal(false)}
        onSuccess={() => { setShowNewCleaningModal(false); window.location.reload(); }}
        userRole={isAdmin ? "ADMIN" : "PROPRIETARIO"}
        ownerId={ownerId}
      />

      {/* Modal Modifica Pulizia */}
      {showEditModal && editingCleaning && (
        <EditCleaningModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingCleaning(null);
            setEditingProperty(null);
          }}
          cleaning={{
            id: editingCleaning.id,
            propertyId: editingCleaning.propertyId,
            propertyName: editingCleaning.propertyName,
            date: editingCleaning.date,
            scheduledTime: editingCleaning.scheduledTime || "10:00",
            status: editingCleaning.status,
            guestsCount: editingCleaning.guestsCount || 2,
            notes: editingCleaning.notes || "",
            // Prezzi - usa quello della pulizia, poi della proprietà
            price: editingCleaning.price || editingCleaning.contractPrice || editingProperty?.cleaningPrice,
            contractPrice: editingCleaning.contractPrice || editingCleaning.price || editingProperty?.cleaningPrice,
            priceModified: editingCleaning.priceModified,
            priceChangeReason: editingCleaning.priceChangeReason,
            // Tipo servizio
            serviceType: editingCleaning.serviceType,
            serviceTypeName: editingCleaning.serviceTypeName,
            sgrossoReason: editingCleaning.sgrossoReason,
            sgrossoReasonLabel: editingCleaning.sgrossoReasonLabel,
            sgrossoNotes: editingCleaning.sgrossoNotes,
            // Campi per pulizie completate
            photos: editingCleaning.photos,
            startedAt: editingCleaning.startedAt,
            completedAt: editingCleaning.completedAt,
            // Campi per valutazione
            ratingScore: editingCleaning.ratingScore,
            ratingId: editingCleaning.ratingId,
            // Servizi extra
            extraServices: editingCleaning.extraServices,
            // Campi per deadline mancata
            missedDeadline: editingCleaning.missedDeadline,
            missedDeadlineAt: editingCleaning.missedDeadlineAt,
            // 🔧 FIX: Passa customLinenConfig per mantenere le modifiche salvate
            customLinenConfig: editingCleaning.customLinenConfig,
            // 🔥 FIX: Passa hasLinenOrder per toggle biancheria
            hasLinenOrder: editingCleaning.hasLinenOrder,
          }}
          property={{
            id: editingProperty?.id || editingCleaning.propertyId,
            name: editingProperty?.name || editingCleaning.propertyName || 'Proprietà',
            address: editingProperty?.address || '',
            maxGuests: editingProperty?.maxGuests || 6, // 🔧 Fallback ridotto
            bedrooms: editingProperty?.bedrooms,
            bathrooms: editingProperty?.bathrooms,
            bedsConfig: editingProperty?.bedsConfig,
            serviceConfigs: editingProperty?.serviceConfigs,
            // Calcola cleaningPrice: prima dalla pulizia, poi dalla proprietà
            cleaningPrice: editingCleaning.contractPrice || editingCleaning.price || editingProperty?.cleaningPrice || 0
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingCleaning(null);
            setEditingProperty(null);
          }}
          userRole={isAdmin ? "ADMIN" : "PROPRIETARIO"}
        />
      )}

      {/* ========== MODAL ORARIO ========== */}
      {showTimeModal && timeModalCleaning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden" style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
            {/* Header */}
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Modifica Orario</h3>
                    <p className="text-xs text-gray-500">Seleziona l'orario della pulizia</p>
                  </div>
                </div>
                <button onClick={() => setShowTimeModal(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-5">
              <input
                type="time"
                value={tempTime}
                onChange={(e) => setTempTime(e.target.value)}
                className="w-full h-14 text-center text-2xl font-bold text-gray-800 border-2 border-gray-200 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
              />
            </div>

            {/* Footer */}
            <div className="p-5 bg-gray-50 flex gap-3">
              <button 
                onClick={() => setShowTimeModal(false)} 
                className="flex-1 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-all"
              >
                Annulla
              </button>
              <button 
                onClick={saveTimeFromModal} 
                disabled={savingTime}
                className="flex-1 py-3.5 text-white font-semibold rounded-xl disabled:opacity-50 transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', boxShadow: '0 4px 12px rgba(59,130,246,0.4)' }}
              >
                {savingTime ? "Salvo..." : "Conferma"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL OPERATORE (MULTISELEZIONE) ========== */}
      {showOperatorModal && operatorModalCleaning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden" style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
            {/* Header */}
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Assegna Operatori</h3>
                    <p className="text-xs text-gray-500">Seleziona uno o più operatori</p>
                  </div>
                </div>
                <button onClick={() => setShowOperatorModal(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Contatore selezionati */}
            {selectedOperatorIds.length > 0 && (
              <div className="px-5 py-3 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
                <span className="text-sm font-medium text-purple-700">
                  {selectedOperatorIds.length} operatore{selectedOperatorIds.length > 1 ? 'i' : ''} selezionato{selectedOperatorIds.length > 1 ? 'i' : ''}
                </span>
                <button 
                  onClick={() => setSelectedOperatorIds([])}
                  className="text-xs font-medium text-purple-600 hover:text-purple-800"
                >
                  Deseleziona tutti
                </button>
              </div>
            )}

            {/* Content - Lista operatori con checkbox */}
            <div className="p-4 max-h-[300px] overflow-y-auto">
              {operators.map((op, index) => {
                const isSelected = selectedOperatorIds.includes(op.id);
                const colors = [
                  { bg: '#8b5cf6', bgEnd: '#7c3aed' },
                  { bg: '#3b82f6', bgEnd: '#2563eb' },
                  { bg: '#10b981', bgEnd: '#059669' },
                  { bg: '#f59e0b', bgEnd: '#d97706' },
                  { bg: '#ec4899', bgEnd: '#db2777' },
                ];
                const color = colors[index % colors.length];
                
                return (
                  <button
                    key={op.id}
                    onClick={() => toggleOperatorSelection(op.id)}
                    className={`w-full p-3 rounded-xl flex items-center gap-3 mb-2 transition-all ${
                      isSelected ? 'bg-purple-50 border-2 border-purple-400 shadow-sm' : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                    }`}
                  >
                    {/* Checkbox custom */}
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-300 bg-white'
                    }`}>
                      {isSelected && (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    
                    {/* Avatar */}
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: `linear-gradient(135deg, ${color.bg} 0%, ${color.bgEnd} 100%)` }}
                    >
                      {getInitials(op.name)}
                    </div>
                    
                    {/* Nome */}
                    <div className="text-left flex-1">
                      <p className="font-semibold text-gray-700">{op.name}</p>
                      <p className="text-xs text-gray-400">Operatore pulizie</p>
                    </div>
                    
                    {/* Indicatore selezione */}
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
                    )}
                  </button>
                );
              })}
              
              {operators.length === 0 && (
                <div className="p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">Nessun operatore disponibile</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 bg-gray-50 flex gap-3">
              <button 
                onClick={() => setShowOperatorModal(false)} 
                className="flex-1 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-all"
              >
                Annulla
              </button>
              <button 
                onClick={saveOperatorFromModal} 
                disabled={savingOperator}
                className="flex-1 py-3.5 text-white font-semibold rounded-xl disabled:opacity-50 transition-all hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', boxShadow: '0 4px 12px rgba(139,92,246,0.4)' }}
              >
                {savingOperator ? "Salvo..." : `Conferma${selectedOperatorIds.length > 0 ? ` (${selectedOperatorIds.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 Modal Dettaglio Ordine Biancheria */}
      <OrderDetailModal
        isOpen={showOrderDetailModal}
        onClose={() => { setShowOrderDetailModal(false); setSelectedOrderForDetail(null); }}
        order={selectedOrderForDetail as any}
        userRole={isAdmin ? "ADMIN" : "PROPRIETARIO"}
        inventory={inventory}
        onOrderUpdate={() => {
          // L'ordine si aggiornerà automaticamente tramite il listener onSnapshot
        }}
      />
    </div>
  );
}
