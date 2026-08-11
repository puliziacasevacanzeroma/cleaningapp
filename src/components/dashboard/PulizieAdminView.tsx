"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { doc, updateDoc, collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import NewCleaningModal from "~/components/NewCleaningModal";
import EditCleaningModal from "~/components/proprietario/EditCleaningModal";
import CleaningCardAdmin from "~/components/cleaning/CleaningCardAdmin";
import { calculateDotazioni } from "~/lib/calculateDotazioni";
import { PropertySearchBar, matchesPropertyQuery, type PropertyOption } from "~/components/ui/PropertySearchBar";

/**
 * 🎯 PASSO FINALE — Deriva le dotazioni (letto/bagno/kit/extra) da un ORDINE.
 *
 * La card storicamente RICALCOLA con calculateDotazioni; ma la pagina pagamenti
 * legge order.items. Per garantire card === pagamenti, quando esiste un ordine
 * con items la card mostra esattamente quelli (= ciò che si paga).
 *
 * Robusto sugli ordini vecchi: se manca categoryId/categoryName o il prezzo,
 * risolve via inventory (per id/key/nome). Le voci non-dotazione (prodotti
 * pulizia, fee, orfani) NON entrano nelle dotazioni.
 *
 * Forma voce restituita: { name, quantity, price } — identica a calculateDotazioni.
 */
function deriveDotazioniFromOrder(
  order: any,
  inventory: any[]
): { bedItems: any[]; bathItems: any[]; kitItems: any[]; extraItems: any[]; dotazioniPrice: number } {
  const bedItems: any[] = [];
  const bathItems: any[] = [];
  const kitItems: any[] = [];
  const extraItems: any[] = [];
  let dotazioniPrice = 0;

  const invMap = new Map<string, any>();
  (inventory || []).forEach((it: any) => {
    if (it?.id) invMap.set(it.id, it);
    if (it?.key) invMap.set(it.key, it);
  });

  const resolveCat = (item: any, inv: any): string | null => {
    if (item?.categoryId) return item.categoryId;
    const cn = String(item?.categoryName || "").toLowerCase();
    if (cn.includes("letto")) return "biancheria_letto";
    if (cn.includes("bagno")) return "biancheria_bagno";
    if (cn.includes("kit") || cn.includes("cortesia")) return "kit_cortesia";
    if (cn.includes("extra")) return "servizi_extra";
    return inv?.categoryId || null;
  };

  (order?.items || []).forEach((item: any) => {
    const qty = typeof item?.quantity === "number" ? item.quantity : 0;
    if (qty <= 0) return;
    const inv = invMap.get(item?.itemId) || invMap.get(item?.id);
    const cat = resolveCat(item, inv);

    let bucket: any[] | null = null;
    if (cat === "biancheria_letto") bucket = bedItems;
    else if (cat === "biancheria_bagno") bucket = bathItems;
    else if (cat === "kit_cortesia") bucket = kitItems;
    else if (cat === "servizi_extra") bucket = extraItems;
    if (!bucket) return; // prodotti pulizia / fee / orfani: fuori dalle dotazioni

    const price =
      typeof item?.unitPrice === "number"
        ? item.unitPrice
        : inv?.sellPrice ?? inv?.price ?? 0;
    const name = item?.name || inv?.name || item?.itemId || item?.id || "Articolo";

    bucket.push({ name, quantity: qty, price });
    dotazioniPrice += price * qty;
  });

  return { bedItems, bathItems, kitItems, extraItems, dotazioniPrice };
}

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
  ownerId?: string;
  ownerName?: string;
  bedsConfig?: BedConfig[];
  cleaningPrice?: number;
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
  photos?: string[];
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
  items: LinenItem[];
  status: string;
}

interface InventoryItem {
  id: string;
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
  price?: number;
  // Nuovi campi per tipo servizio e prezzo
  contractPrice?: number;
  serviceType?: string;
  serviceTypeName?: string;
  priceModified?: boolean;
  priceChangeReason?: string;
  sgrossoReason?: string;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  // Campi per tracciamento modifica data
  originalDate?: Date;
  dateModifiedAt?: Date;
  // Campi per pulizie completate
  photos?: string[];
  startedAt?: any;
  completedAt?: any;
  // 🔧 FIX: Campi per biancheria personalizzata
  customLinenConfig?: any;
  linenConfigModified?: boolean;
}

interface PulizieAdminViewProps {
  properties: Property[];
  cleanings: Cleaning[];
  operators: Operator[];
}

type ViewMode = "calendar" | "list";
type TimeFilter = "all" | "today" | "week" | "month";

const PROPERTY_COLORS = ['#8b5cf6', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];

// Icona Letto
const BedIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v11m0-4h18m0 4V8a1 1 0 00-1-1H4a1 1 0 00-1 1v3h18M6 15v3m12-3v3" />
  </svg>
);

// Orari disponibili
const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", 
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00"
];

// 🔥 Mapping tra ID semantici degli ordini e nomi inventario
const ORDER_ID_TO_INVENTORY_KEYWORDS: Record<string, string[]> = {
  // Biancheria Letto
  'lenzuola_matrimoniale': ['matrimoniale', 'lenzuolo matr'],
  'lenzuola_singolo': ['singol', 'lenzuola singol'],
  'lenzuolo_sotto': ['sotto', 'singol'],
  'lenzuolo_sopra': ['sopra', 'singol'],
  'copripiumino': ['copripiumino', 'piumino'],
  'federa': ['federa'],
  // Biancheria Bagno
  'asciugamano_grande': ['corpo', 'grande', 'doccia', 'telo corpo'],
  'asciugamano_piccolo': ['viso', 'piccolo', 'bidet', 'telo viso'],
  'asciugamano_viso': ['viso', 'telo viso'],
  'asciugamano_ospite': ['ospite', 'bidet'],
  'telo_doccia': ['corpo', 'doccia', 'telo corpo'],
  'tappetino_bagno': ['scendi', 'tappetino', 'bagno'],
  // Kit cortesia
  'shampoo': ['shampoo', 'doccia'],
  'sapone': ['sapone'],
  'cuffia': ['cuffia'],
  'crema': ['crema'],
};

// Funzione per trovare il prezzo di un item dell'ordine
const findItemPrice = (orderItem: { id: string; name: string }, inventory: InventoryItem[]): number => {
  // 1. Prova match esatto per ID
  const byId = inventory.find(i => i.id === orderItem.id);
  if (byId) return byId.sellPrice;
  
  // 2. Prova con le keywords mappate
  const keywords = ORDER_ID_TO_INVENTORY_KEYWORDS[orderItem.id];
  if (keywords) {
    for (const keyword of keywords) {
      const match = inventory.find(i => i.name.toLowerCase().includes(keyword.toLowerCase()));
      if (match) return match.sellPrice;
    }
  }
  
  // 3. Prova match per nome dell'item
  if (orderItem.name) {
    const nameLower = orderItem.name.toLowerCase();
    
    // Match diretto
    const byName = inventory.find(i => i.name.toLowerCase().includes(nameLower) || nameLower.includes(i.name.toLowerCase()));
    if (byName) return byName.sellPrice;
    
    // Match per parole chiave nel nome
    if (nameLower.includes('matrimoniale')) {
      const match = inventory.find(i => i.name.toLowerCase().includes('matrimoniale'));
      if (match) return match.sellPrice;
    }
    if (nameLower.includes('singol')) {
      const match = inventory.find(i => i.name.toLowerCase().includes('singol'));
      if (match) return match.sellPrice;
    }
    if (nameLower.includes('grande') || nameLower.includes('corpo')) {
      const match = inventory.find(i => i.name.toLowerCase().includes('corpo'));
      if (match) return match.sellPrice;
    }
    if (nameLower.includes('piccolo') || nameLower.includes('viso')) {
      const match = inventory.find(i => i.name.toLowerCase().includes('viso'));
      if (match) return match.sellPrice;
    }
    if (nameLower.includes('tappetino') || nameLower.includes('scendi')) {
      const match = inventory.find(i => i.name.toLowerCase().includes('scendi'));
      if (match) return match.sellPrice;
    }
  }
  
  // 4. Fallback: prezzo di default basato sul tipo
  if (orderItem.id.includes('lenzuol') || orderItem.name?.toLowerCase().includes('lenzuol')) return 1.8;
  if (orderItem.id.includes('asciugamano') || orderItem.name?.toLowerCase().includes('asciugamano')) return 1.2;
  if (orderItem.id.includes('tappetino') || orderItem.name?.toLowerCase().includes('tappetino')) return 1.0;
  
  return 0;
};

export function PulizieAdminView({ properties, cleanings, operators = [] }: PulizieAdminViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showNewCleaningModal, setShowNewCleaningModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // 🔎 Appartamento agganciato dalla barra di ricerca condivisa
  const [searchProperty, setSearchProperty] = useState<PropertyOption | null>(null);
  
  // Stato per card espanse
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  
  // Stato per ordini biancheria
  const [orders, setOrders] = useState<Order[]>([]);
  
  // 🔥 Stato per inventario prezzi
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  // Stato per modal modifica pulizia
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCleaning, setEditingCleaning] = useState<Cleaning | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  // Stato per dropdown assegnazione rapida
  const [assigningOperator, setAssigningOperator] = useState<string | null>(null);
  const [assigningTime, setAssigningTime] = useState<string | null>(null);
  const [savingAssignment, setSavingAssignment] = useState(false);

  // 🗑️ STATI PER ELIMINAZIONE PULIZIA ADMIN (vedi DashboardContent.tsx)
  const [cleaningToDelete, setCleaningToDelete] = useState<any | null>(null);
  const [deleteImpactCheck, setDeleteImpactCheck] = useState<{ isPaid: boolean; impactEur: number; monthLabel: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const calendarRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  
  // 🔥 Carica inventario da Firestore per avere i prezzi reali
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        name: (doc.data() as Record<string, any>).name || "",
        sellPrice: (doc.data() as Record<string, any>).sellPrice || 0,
        category: (doc.data() as Record<string, any>).category || ""
      }));
      setInventory(items);
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
        .map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) } as Order))
        .filter(o => propertyIds.includes(o.propertyId));
      setOrders(ordersData);
    });

    return () => unsubscribe();
  }, [properties]);

  // Chiudi dropdown quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = () => {
      setAssigningOperator(null);
      setAssigningTime(null);
    };
    
    if (assigningOperator || assigningTime) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [assigningOperator, assigningTime]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Opzioni per il selettore appartamento della barra di ricerca
  const propertySearchOptions: PropertyOption[] = useMemo(
    () =>
      [...properties]
        .map(p => ({
          id: p.id,
          name: p.name,
          subtitle: (p as any).address || p.ownerName,
          image: (p as any).images?.door || (p as any).imageUrl || undefined,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "it")),
    [properties],
  );

  const filteredCleanings = useMemo(() => {
    let filtered = [...cleanings];
    const propertyIds = properties.map(p => p.id);
    filtered = filtered.filter(c => propertyIds.includes(c.propertyId));

    // 🔎 Appartamento agganciato: filtro netto per id (nessuna ambiguità
    // su nomi simili). Altrimenti testo libero sulla stessa regola
    // condivisa con la campanella notifiche.
    if (searchProperty) {
      filtered = filtered.filter(c => c.propertyId === searchProperty.id);
    } else if (searchTerm) {
      filtered = filtered.filter(c => {
        const prop = properties.find(p => p.id === c.propertyId);
        return matchesPropertyQuery(
          [prop?.name, prop?.ownerName, (prop as any)?.address, c.operator?.name],
          searchTerm,
        );
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

    // Ordina: prima per data, poi completate in fondo
    return filtered.sort((a, b) => {
      // Prima le non completate
      const aCompleted = a.status === "COMPLETED" || a.status === "VERIFIED" ? 1 : 0;
      const bCompleted = b.status === "COMPLETED" || b.status === "VERIFIED" ? 1 : 0;
      if (aCompleted !== bCompleted) return aCompleted - bCompleted;
      
      // Poi per orario schedulato
      const aTime = a.scheduledTime || "23:59";
      const bTime = b.scheduledTime || "23:59";
      if (aTime !== bTime) return aTime.localeCompare(bTime);
      
      // Infine per data
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [cleanings, properties, timeFilter, searchTerm, searchProperty]);

  // Proprietà filtrate per il calendario
  const filteredProperties = useMemo(() => {
    if (searchProperty) return properties.filter(p => p.id === searchProperty.id);
    if (!searchTerm) return properties;
    return properties.filter(p =>
      matchesPropertyQuery([p.name, p.address, p.ownerName], searchTerm),
    );
  }, [properties, searchTerm, searchProperty]);

  const groupedByDate = useMemo(() => {
    const groups: { [key: string]: Cleaning[] } = {};
    filteredCleanings.forEach(c => {
      const dateKey = new Date(c.date).toDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(c);
    });
    
    // Ordina ogni gruppo: IN_PROGRESS prima, poi non completate, poi completate in fondo
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        // Normalizza gli stati in maiuscolo
        const aStatus = (a.status || "SCHEDULED").toUpperCase();
        const bStatus = (b.status || "SCHEDULED").toUpperCase();
        
        // Priorità stati (più basso = prima)
        // IN_PROGRESS = 0 (prima in assoluto - lavoro in corso)
        // SCHEDULED/ASSIGNED/altro non completato = 1
        // COMPLETED/VERIFIED = 2 (in fondo)
        const getStatusPriority = (status: string): number => {
          if (status === "IN_PROGRESS") return 0;
          if (status === "COMPLETED" || status === "VERIFIED") return 2;
          return 1; // SCHEDULED, ASSIGNED, etc.
        };
        
        const aPriority = getStatusPriority(aStatus);
        const bPriority = getStatusPriority(bStatus);
        
        if (aPriority !== bPriority) return aPriority - bPriority;
        
        // A parità di priorità, ordina per orario schedulato
        const aTime = a.scheduledTime || "23:59";
        const bTime = b.scheduledTime || "23:59";
        return aTime.localeCompare(bTime);
      });
    });
    
    return groups;
  }, [filteredCleanings]);

  const stats = useMemo(() => {
    const todayCleanings = cleanings.filter(c => 
      new Date(c.date).toDateString() === today.toDateString()
    );
    const weekCleanings = cleanings.filter(c => {
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
      pending: weekCleanings.filter(c => !c.operator).length,
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
        }, 200);
        
        return () => clearTimeout(timer);
      }
    }
  }, [viewMode, currentDate, ganttDays]);

  // Blocca scroll quando modal è aperta
  useEffect(() => {
    if (showNewCleaningModal || showEditModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showNewCleaningModal, showEditModal]);

  const monthName = currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  // Status config con gradienti e ombre
  const getStatusConfig = (status: string, hasOperator: boolean) => {
    switch (status) {
      case "COMPLETED":
        return { 
          bg: "bg-gradient-to-r from-emerald-400 to-teal-500", 
          gradient: "bg-gradient-to-r from-emerald-500 to-teal-400",
          shadow: "shadow-lg shadow-emerald-200",
          label: "Completata",
          icon: "✓"
        };
      case "IN_PROGRESS":
        return { 
          bg: "bg-gradient-to-r from-amber-400 to-orange-500", 
          gradient: "bg-gradient-to-r from-amber-500 to-orange-400",
          shadow: "shadow-lg shadow-amber-200",
          label: "In corso",
          icon: "●"
        };
      case "SCHEDULED":
        if (!hasOperator) {
          return { 
            bg: "bg-gradient-to-r from-rose-400 to-red-500", 
            gradient: "bg-gradient-to-r from-rose-500 to-pink-400",
            shadow: "shadow-lg shadow-rose-200",
            label: "Da assegnare",
            icon: "!"
          };
        }
        return { 
          bg: "bg-gradient-to-r from-sky-400 to-blue-500", 
          gradient: "bg-gradient-to-r from-blue-500 to-indigo-400",
          shadow: "shadow-lg shadow-blue-200",
          label: "Programmata",
          icon: "○"
        };
      default:
        return { 
          bg: "bg-gradient-to-r from-slate-400 to-slate-500", 
          gradient: "bg-gradient-to-r from-slate-500 to-slate-400",
          shadow: "shadow-lg shadow-slate-200",
          label: status,
          icon: "?"
        };
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // Apre la modal di modifica pulizia
  const openEditModal = (cleaning: Cleaning, property: Property | undefined) => {
    setEditingCleaning(cleaning);
    setEditingProperty(property || null);
    setShowEditModal(true);
  };

  // ============================================================
  // 🗑️ ELIMINAZIONE PULIZIA ADMIN
  // ============================================================
  const openDeleteCleaningModal = async (cleaning: any) => {
    setCleaningToDelete(cleaning);
    setDeleteImpactCheck(null);
    try {
      const dateRaw = (cleaning as any).scheduledDate || (cleaning as any).date;
      const d = dateRaw?.toDate?.() || (dateRaw instanceof Date ? dateRaw : null);
      if (!d) {
        setDeleteImpactCheck({ isPaid: false, impactEur: 0, monthLabel: "" });
        return;
      }
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const monthLabel = d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

      const propId = cleaning.propertyId;
      const propertyDoc = properties.find((p: any) => p.id === propId);
      const ownerId = (propertyDoc as any)?.ownerId;
      if (!ownerId) {
        setDeleteImpactCheck({ isPaid: false, impactEur: 0, monthLabel });
        return;
      }

      const paymentsQuery = query(
        collection(db, "payments"),
        where("proprietarioId", "==", ownerId),
        where("month", "==", month),
        where("year", "==", year)
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      // ⚠️ Escludo isCreditTransfer (vedi DashboardContent: stesso check eliminazione)
      const totalPaid = paymentsSnap.docs.reduce(
        (s, d) => {
          const data = d.data() as any;
          if (data.isCreditTransfer === true) return s;
          return s + ((data.amount as number) || 0);
        },
        0
      );

      const cleaningPrice =
        ((cleaning as any).priceOverride ?? (cleaning as any).price ?? (propertyDoc as any)?.cleaningPrice ?? 0) +
        ((cleaning as any).holidayFee ?? 0);

      setDeleteImpactCheck({ isPaid: totalPaid > 0.01, impactEur: cleaningPrice, monthLabel });
    } catch (err) {
      console.error("Errore check pagamenti:", err);
      setDeleteImpactCheck({ isPaid: false, impactEur: 0, monthLabel: "" });
    }
  };

  const executeDeleteCleaningAdmin = async () => {
    if (!cleaningToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/cleanings/${cleaningToDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Errore HTTP ${res.status}`);
      }
      setCleaningToDelete(null);
      setDeleteImpactCheck(null);
    } catch (err: any) {
      alert("Errore eliminazione: " + (err?.message || "sconosciuto"));
    } finally {
      setDeleteLoading(false);
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

  // ========== FUNZIONI ASSEGNAZIONE RAPIDA ADMIN ==========
  // FIX TURNI: prima scriveva updateDoc DIRETTO (solo operatorId, senza array
  // operators, senza check turni, status sempre "SCHEDULED"). Ora passa
  // dall'API dashboard: enforcement turni (409 + conferma urgenza), array
  // operators coerente, status corretto e notifica all'operatore.
  const handleQuickAssignOperator = async (cleaningId: string, operatorId: string) => {
    setSavingAssignment(true);
    try {
      const operator = operators.find(o => o.id === operatorId);
      if (!operator) {
        alert("Operatore non trovato");
        return;
      }

      // Semantica del calendario = SOSTITUZIONE: rimuovi gli operatori attuali
      const cl = cleanings.find(c => c.id === cleaningId);
      const existingIds = new Set<string>();
      (cl?.operators || []).forEach(o => { if (o?.id) existingIds.add(o.id); });
      if (cl?.operator?.id) existingIds.add(cl.operator.id);
      if ((cl as any)?.operatorId) existingIds.add((cl as any).operatorId);

      if (existingIds.has(operatorId)) { setAssigningOperator(null); return; } // già assegnato a lui

      for (const oldId of existingIds) {
        await fetch('/api/dashboard/cleanings/' + cleaningId + '/assign', {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operatorId: oldId })
        });
      }

      // Assegna con check turni
      let res = await fetch('/api/dashboard/cleanings/' + cleaningId + '/assign', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId })
      });
      if (res.status === 409) {
        const data = await res.clone().json().catch(() => ({} as Record<string, any>));
        if (data.code === "SHIFT_UNAVAILABLE") {
          const ok = window.confirm(
            `⚠️ ${data.error || operator.name + " non è in turno questo giorno"}.\n\n` +
            `Assegnare comunque come CHIAMATA D'URGENZA?\n` +
            `(Verrà aggiunto un turno extra nella pagina Turni e l'operatore riceverà una notifica)`
          );
          if (ok) {
            res = await fetch('/api/dashboard/cleanings/' + cleaningId + '/assign', {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ operatorId, force: true, forceReason: "Chiamata d'urgenza confermata da calendario" })
            });
          }
        }
      }
      if (!res.ok && res.status !== 409) {
        const err = await res.json().catch(() => ({}));
        alert("⚠️ " + (err.error || "Errore nell'assegnazione"));
      }
      
      setAssigningOperator(null);
    } catch (error) {
      console.error("Errore assegnazione operatore:", error);
      alert("Errore nell'assegnazione");
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleQuickAssignTime = async (cleaningId: string, time: string) => {
    setSavingAssignment(true);
    try {
      const cleaningRef = doc(db, "cleanings", cleaningId);
      await updateDoc(cleaningRef, {
        scheduledTime: time,
        updatedAt: new Date()
      });
      
      setAssigningTime(null);
    } catch (error) {
      console.error("Errore assegnazione orario:", error);
      alert("Errore nell'assegnazione");
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleRemoveOperator = async (cleaningId: string) => {
    setSavingAssignment(true);
    try {
      // FIX TURNI/STATUS: rimozione via API così il server riporta lo status
      // a SCHEDULED quando non restano operatori (prima updateDoc diretto
      // lasciava lo status sporco, es. badge "ASSEGNATA" senza operatori)
      const cl = cleanings.find(c => c.id === cleaningId);
      const existingIds = new Set<string>();
      (cl?.operators || []).forEach(o => { if (o?.id) existingIds.add(o.id); });
      if (cl?.operator?.id) existingIds.add(cl.operator.id);
      if ((cl as any)?.operatorId) existingIds.add((cl as any).operatorId);

      for (const oldId of existingIds) {
        const res = await fetch('/api/dashboard/cleanings/' + cleaningId + '/assign', {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operatorId: oldId })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert("⚠️ Errore rimozione: " + (err.error || res.status));
        }
      }
      
    } catch (error) {
      console.error("Errore rimozione operatore:", error);
      alert("Errore nella rimozione");
    } finally {
      setSavingAssignment(false);
    }
  };

  // Funzione per ottenere ordine biancheria collegato alla pulizia
  const getLinenOrderForCleaning = (cleaningId: string, propertyId: string) => {
    return orders.find(o => o.cleaningId === cleaningId || (o.propertyId === propertyId && !o.cleaningId));
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-4">
      
      {/* HEADER */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700"></div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-pink-500/20 rounded-full blur-2xl -ml-8 -mb-8"></div>
        
        <div className="relative px-4 pt-4 pb-5">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <span className="text-xl">✨</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Gestione Pulizie</h1>
                  <p className="text-violet-200 text-xs">Tutte le pulizie • Admin</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewCleaningModal(true)}
                className="px-3 py-2 rounded-xl bg-white/20 backdrop-blur-sm flex items-center gap-1.5 border border-white/30 hover:bg-white/30 transition-all"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-white text-[11px] font-semibold whitespace-nowrap">Nuovo Servizio</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-violet-200 text-[10px] font-medium">Oggi</p>
                <p className="text-2xl font-bold text-white">{stats.today}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-violet-200 text-[10px] font-medium">Settimana</p>
                <p className="text-2xl font-bold text-white">{stats.week}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-violet-200 text-[10px] font-medium">Proprietà</p>
                <p className="text-2xl font-bold text-white">{stats.properties}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <p className="text-rose-200 text-[10px] font-medium">Da assegnare</p>
                <p className="text-2xl font-bold text-white">{stats.pending}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-6xl mx-auto">
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
        <div className="max-w-6xl mx-auto space-y-3">
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
                  className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
                    timeFilter === filter.key ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
          
          {/* 🔎 Barra condivisa con la campanella notifiche/segnalazioni */}
          <PropertySearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            selected={searchProperty}
            onSelect={setSearchProperty}
            properties={propertySearchOptions}
            placeholder="Cerca proprietà, proprietario o operatore..."
          />
        </div>
      </div>

      {/* CONTENT */}
      <div className="px-4 py-4">
        <div className="max-w-6xl mx-auto">
          
          {/* ========== VISTA LISTA ========== */}
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
                Object.entries(groupedByDate).map(([dateKey, dayCleanings]) => {
                  const date = new Date(dateKey);
                  const isToday = date.toDateString() === today.toDateString();
                  const dateLabel = isToday ? "Oggi" : date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
                  
                  return (
                    <div key={dateKey}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`px-3 py-1 rounded-lg font-semibold text-sm ${isToday ? "bg-violet-500 text-white" : "bg-slate-200 text-slate-700"}`}>
                          {dateLabel}
                        </div>
                        <div className="flex-1 h-px bg-slate-200"></div>
                        <span className="text-xs text-slate-400">{dayCleanings.length} pulizie</span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {dayCleanings.map((cleaning) => {
                          const property = properties.find(p => p.id === cleaning.propertyId);
                          
                          // 🔥 FIX: Usa calculateDotazioni per calcolare bedItems e bathItems
                          const propertyForCalc = property ? {
                            id: property.id,
                            name: property.name,
                            bedrooms: property.bedrooms || 1,
                            bathrooms: property.bathrooms || 1,
                            maxGuests: property.maxGuests || 2,
                            cleaningPrice: property.cleaningPrice || 0,
                            bedsConfig: property.bedsConfig || [],
                            serviceConfigs: property.serviceConfigs || null,
                            usesOwnLinen: (property as any).usesOwnLinen || false,
                          } : { id: '', bedrooms: 1, bathrooms: 1, maxGuests: 2, cleaningPrice: 0 };
                          
                          const { cleaningPrice, dotazioniPrice: calcDotazioniPrice, totalPrice: calcTotalPrice, bedItems: calcBed, bathItems: calcBath, kitItems: calcKit, extraItems: calcExtra } = calculateDotazioni(
                            cleaning,
                            // @ts-expect-error TODO-FIX: TS2345 Argument of type '{ id: string; name: string; bedrooms: number; bathrooms: numbe...
                            propertyForCalc,
                            inventory
                          );

                          // 🎯 PASSO FINALE: se esiste un ordine con items, la card mostra
                          // ESATTAMENTE le dotazioni dell'ordine (= ciò che si paga). Così
                          // card === pagamenti per costruzione. Fallback al calcolo se non
                          // c'è ordine o se l'ordine non ha voci di dotazione riconoscibili.
                          let dotazioniPrice = calcDotazioniPrice;
                          let totalPrice = calcTotalPrice;
                          let bedItems = calcBed;
                          let bathItems = calcBath;
                          let kitItems = calcKit;
                          let extraItems = calcExtra;

                          const linenOrder: any = getLinenOrderForCleaning(cleaning.id, cleaning.propertyId);
                          if (linenOrder && Array.isArray(linenOrder.items) && linenOrder.items.length > 0) {
                            const d = deriveDotazioniFromOrder(linenOrder, inventory);
                            const hasAny = d.bedItems.length || d.bathItems.length || d.kitItems.length || d.extraItems.length;
                            if (hasAny) {
                              bedItems = d.bedItems;
                              bathItems = d.bathItems;
                              kitItems = d.kitItems;
                              extraItems = d.extraItems;
                              dotazioniPrice = d.dotazioniPrice;
                              totalPrice = (cleaningPrice || 0) + d.dotazioniPrice;
                            }
                          }
                          
                          const productItems = ((linenOrder?.items as any[]) || [])
                            .filter((i: any) => i.type === 'cleaning_product' || i.categoryId === 'prodotti_pulizia')
                            .map((i: any) => ({ name: i.name, quantity: i.quantity }));

                          return (
                            <CleaningCardAdmin
                              key={cleaning.id}
                              cleaning={cleaning}
                              property={property}
                              operators={operators}
                              totalPrice={totalPrice}
                              cleaningPrice={cleaningPrice}
                              dotazioniPrice={dotazioniPrice}
                              bedItems={bedItems}
                              bathItems={bathItems}
                              kitItems={kitItems || []}
                              extraItems={extraItems || []}
                              productItems={productItems}
                              onAssignOperator={handleQuickAssignOperator}
                              onRemoveOperator={handleRemoveOperator}
                              onChangeTime={handleQuickAssignTime}
                              // @ts-expect-error TODO-FIX: TS2345 Argument of type 'Cleaning' is not assignable to parameter of type 'Cleaning'.
                              onOpenDetail={(c) => openEditModal(c, property)}
                              onDeleteAdmin={(c) => openDeleteCleaningModal(c)}
                              savingAssignment={savingAssignment}
                              // @ts-expect-error TODO-FIX: TS2322 Type '{ key: string; cleaning: Cleaning; property: Property | undefined; operato...
                              assigningTime={assigningTime}
                              setAssigningTime={setAssigningTime}
                              assigningOperator={assigningOperator}
                              setAssigningOperator={setAssigningOperator}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ========== VISTA CALENDARIO ========== */}
          {viewMode === "calendar" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              
              {/* Navigation header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <button 
                  onClick={() => navigateCalendar(-1)}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-colors"
                >
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                <div className="text-center">
                  <h2 className="text-lg font-bold text-slate-800 capitalize">{monthName}</h2>
                  <button 
                    onClick={() => setCurrentDate(new Date())}
                    className="text-xs text-violet-500 font-medium hover:underline"
                  >
                    Vai a oggi
                  </button>
                </div>
                
                <button 
                  onClick={() => navigateCalendar(1)}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-colors"
                >
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Gantt Chart */}
              <div 
                ref={calendarRef}
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: "calc(100vh - 420px)" }}
              >
                <div style={{ minWidth: `${220 + ganttDays.length * 60}px` }}>
                  {/* Header giorni */}
                  <div className="flex sticky top-0 z-10 bg-white border-b border-slate-200">
                    <div className="w-[220px] flex-shrink-0 h-14 flex items-center justify-center bg-slate-50 border-r border-slate-200 sticky left-0 z-20">
                      <span className="text-xs font-semibold text-slate-600">Proprietà</span>
                    </div>
                    {ganttDays.map((day, i) => (
                      <div
                        key={i}
                        className={`w-[60px] flex-shrink-0 h-14 flex flex-col items-center justify-center border-r border-slate-100 ${
                          day.isToday ? "bg-violet-100" : day.isSunday ? "bg-slate-50" : ""
                        }`}
                      >
                        <span className={`text-[10px] font-medium ${day.isToday ? "text-violet-600" : "text-slate-400"}`}>
                          {day.dayName}
                        </span>
                        <span className={`text-sm font-bold ${day.isToday ? "text-violet-600" : day.isSunday ? "text-rose-400" : "text-slate-700"}`}>
                          {day.day}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Righe proprietà */}
                  {filteredProperties.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-slate-500">Nessuna proprietà trovata</p>
                    </div>
                  ) : (
                    filteredProperties.map((property, propIndex) => {
                      const propertyCleanings = cleanings.filter(c => 
                        c.propertyId === property.id && 
                        new Date(c.date).getMonth() === currentDate.getMonth() &&
                        new Date(c.date).getFullYear() === currentDate.getFullYear()
                      );
                      const propertyColor = PROPERTY_COLORS[propIndex % PROPERTY_COLORS.length];
                      
                      return (
                        <div 
                          key={property.id}
                          className="flex relative border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                          style={{ minHeight: '60px' }}
                        >
                          {/* Sidebar proprietà */}
                          <div 
                            className="w-[220px] flex-shrink-0 flex items-center gap-2 px-3 bg-white border-r border-slate-200 sticky left-0 z-10"
                            style={{ backgroundColor: `${propertyColor}08` }}
                          >
                            <div 
                              className="w-1.5 h-10 rounded-full flex-shrink-0"
                              style={{ backgroundColor: propertyColor }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-800 truncate">{property.name}</p>
                              <p className="text-[10px] text-slate-500 truncate">{property.address}</p>
                              {property.ownerName && (
                                <p className="text-[9px] text-violet-500 truncate">👤 {property.ownerName}</p>
                              )}
                            </div>
                          </div>

                          {/* Griglia giorni */}
                          <div className="flex relative flex-1">
                            {ganttDays.map((day, i) => (
                              <div 
                                key={i}
                                className={`w-[60px] flex-shrink-0 border-r border-slate-50 ${
                                  day.isToday ? "bg-violet-50/50" : day.isSunday ? "bg-slate-50/30" : ""
                                }`}
                              />
                            ))}

                            {/* Blocchi pulizie */}
                            {propertyCleanings.map((cleaning) => {
                              const cleaningDate = new Date(cleaning.date);
                              const dayIndex = ganttDays.findIndex(d => d.date.toDateString() === cleaningDate.toDateString());
                              if (dayIndex === -1) return null;
                              
                              const status = getStatusConfig(cleaning.status, !!cleaning.operator);
                              
                              return (
                                <div
                                  key={cleaning.id}
                                  className={`absolute top-2 ${status.bg} rounded-lg shadow-md flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform z-10`}
                                  style={{ left: `${dayIndex * 60 + 3}px`, width: "54px", height: "calc(100% - 16px)", minHeight: "44px" }}
                                  onClick={() => openEditModal(cleaning, property)}
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
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Legenda */}
              <div className="p-3 border-t border-slate-200 bg-slate-50">
                <div className="flex flex-wrap justify-center gap-3 text-[10px]">
                  {[
                    { bg: "from-emerald-400 to-teal-500", label: "Completata", icon: "✓" },
                    { bg: "from-amber-400 to-orange-500", label: "In corso", icon: "●" },
                    { bg: "from-rose-400 to-red-500", label: "Da assegnare", icon: "!" },
                    { bg: "from-sky-400 to-blue-500", label: "Programmata", icon: "○" },
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

      {/* Modal Nuova Pulizia */}
      <NewCleaningModal
        isOpen={showNewCleaningModal}
        onClose={() => setShowNewCleaningModal(false)}
        onSuccess={() => { setShowNewCleaningModal(false); window.location.reload(); }}
        userRole="ADMIN"
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
          // @ts-expect-error TODO-FIX: TS2719 Type 'Cleaning' is not assignable to type 'Cleaning'. Two different types with t...
          cleaning={editingCleaning}
          // @ts-expect-error TODO-FIX: TS2719 Type 'Property' is not assignable to type 'Property'. Two different types with t...
          property={editingProperty || {
            id: editingCleaning.propertyId,
            name: editingCleaning.propertyName || 'Proprietà',
            address: '',
            cleaningPrice: editingCleaning.contractPrice || editingCleaning.price || 0
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingCleaning(null);
            setEditingProperty(null);
          }}
          userRole="ADMIN"
        />
      )}

      {/* ========== MODAL CONFERMA ELIMINAZIONE PULIZIA ADMIN ========== */}
      {cleaningToDelete && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-gradient-to-br from-red-500 to-rose-600 px-6 py-6 text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white">Elimina pulizia</h3>
              <p className="text-white/80 text-sm mt-1">Azione irreversibile</p>
            </div>
            <div className="px-6 py-5">
              <div className="bg-slate-50 rounded-xl p-3 mb-4">
                <p className="text-sm font-semibold text-slate-800">{(cleaningToDelete as any).propertyName || "Pulizia"}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {(() => {
                    const dRaw = (cleaningToDelete as any).scheduledDate || (cleaningToDelete as any).date;
                    const d = dRaw?.toDate?.() || (dRaw instanceof Date ? dRaw : null);
                    return d ? d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
                  })()}
                </p>
                <p className="text-xs text-slate-500">Stato: <span className="font-semibold">{(cleaningToDelete as any).status}</span></p>
              </div>

              {!deleteImpactCheck && (
                <div className="text-center py-3">
                  <div className="inline-block w-6 h-6 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin"></div>
                  <p className="text-xs text-slate-500 mt-2">Verifica pagamenti in corso...</p>
                </div>
              )}

              {deleteImpactCheck && deleteImpactCheck.isPaid && (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-4">
                  <p className="text-sm font-bold text-red-800 mb-2">⚠️ Mese già pagato</p>
                  <p className="text-sm text-red-700 leading-relaxed">
                    Il proprietario ha già pagato (totalmente o parzialmente) per <strong>{deleteImpactCheck.monthLabel}</strong>.
                  </p>
                  <p className="text-sm text-red-700 leading-relaxed mt-2">
                    Eliminando questa pulizia creerai un <strong>credito di €{deleteImpactCheck.impactEur.toFixed(2)}</strong> per il cliente sui prossimi mesi.
                  </p>
                </div>
              )}

              {deleteImpactCheck && !deleteImpactCheck.isPaid && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                  <p className="text-sm text-amber-800">
                    La pulizia verrà rimossa da calendario, conteggi pagamenti, statistiche e storico operatori.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setCleaningToDelete(null); setDeleteImpactCheck(null); }}
                  disabled={deleteLoading}
                  className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  onClick={executeDeleteCleaningAdmin}
                  disabled={deleteLoading || !deleteImpactCheck}
                  className="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold hover:from-red-600 hover:to-red-700 disabled:opacity-50"
                >
                  {deleteLoading ? "Elimino..." : (deleteImpactCheck?.isPaid ? "Confermo, elimina" : "🗑️ Elimina")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
