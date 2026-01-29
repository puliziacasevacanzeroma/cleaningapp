"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { doc, updateDoc, collection, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import NewCleaningModal from "~/components/NewCleaningModal";
import EditCleaningModal from "~/components/proprietario/EditCleaningModal";

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

  const calendarRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  
  // 🔥 Carica inventario da Firestore per avere i prezzi reali
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || "",
        sellPrice: doc.data().sellPrice || 0,
        category: doc.data().category || ""
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
        .map(doc => ({ id: doc.id, ...doc.data() } as Order))
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

  const filteredCleanings = useMemo(() => {
    let filtered = [...cleanings];
    const propertyIds = properties.map(p => p.id);
    filtered = filtered.filter(c => propertyIds.includes(c.propertyId));

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(c => {
        const prop = properties.find(p => p.id === c.propertyId);
        return prop?.name.toLowerCase().includes(search) || 
               prop?.ownerName?.toLowerCase().includes(search) ||
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
  }, [cleanings, properties, timeFilter, searchTerm]);

  // Proprietà filtrate per il calendario
  const filteredProperties = useMemo(() => {
    if (!searchTerm) return properties;
    const search = searchTerm.toLowerCase();
    return properties.filter(p => 
      p.name.toLowerCase().includes(search) || 
      p.address?.toLowerCase().includes(search) ||
      p.ownerName?.toLowerCase().includes(search)
    );
  }, [properties, searchTerm]);

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
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
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

  const navigateCalendar = (months: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + months);
    setCurrentDate(newDate);
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
  const handleQuickAssignOperator = async (cleaningId: string, operatorId: string) => {
    setSavingAssignment(true);
    try {
      const operator = operators.find(o => o.id === operatorId);
      if (!operator) {
        alert("Operatore non trovato");
        return;
      }

      const cleaningRef = doc(db, "cleanings", cleaningId);
      await updateDoc(cleaningRef, {
        operatorId: operatorId,
        operatorName: operator.name,
        status: "SCHEDULED",
        updatedAt: new Date()
      });
      
      setAssigningOperator(null);
      console.log("✅ Operatore assegnato:", operator.name);
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
      console.log("✅ Orario assegnato:", time);
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
      const cleaningRef = doc(db, "cleanings", cleaningId);
      await updateDoc(cleaningRef, {
        operatorId: null,
        operatorName: null,
        updatedAt: new Date()
      });
      
      console.log("✅ Operatore rimosso");
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
    <div className="min-h-screen bg-slate-50 pb-24">
      
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
          
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cerca proprietà o proprietario..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
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
                          const status = getStatusConfig(cleaning.status, !!cleaning.operator);
                          const isExpanded = expandedCards.has(cleaning.id);
                          const linenOrder = getLinenOrderForCleaning(cleaning.id, cleaning.propertyId);
                          
                          // Calcola prezzi
                          const cleaningPrice = cleaning.price || property?.cleaningPrice || 0;
                          // 🔥 FIX: Usa funzione di mapping per trovare i prezzi corretti
                          const dotazioniPrice = linenOrder?.items?.reduce((sum, item) => {
                            const itemPrice = findItemPrice(item, inventory);
                            return sum + (item.quantity * itemPrice);
                          }, 0) || 0;
                          const totalPrice = cleaningPrice + dotazioniPrice;
                          
                          return (
                            <div 
                              key={cleaning.id} 
                              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all"
                            >
                              {/* Status bar */}
                              <div className={`h-1.5 ${status.gradient}`}></div>
                              
                              <div className="p-4">
                                {/* Header Row */}
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => openEditModal(cleaning, property)}>
                                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                                      {property?.photos?.[0] ? (
                                        <img src={property.photos[0]} alt={property.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="font-bold text-slate-800 text-sm truncate">{property?.name || cleaning.propertyName}</h3>
                                      <p className="text-xs text-slate-500 truncate">{property?.address}</p>
                                      {property?.ownerName && (
                                        <p className="text-[10px] text-violet-500 font-medium truncate">👤 {property.ownerName}</p>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Badge Status */}
                                  <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold text-white ${status.gradient} flex items-center gap-1 flex-shrink-0`}>
                                    <span>{status.icon}</span>
                                    <span>{status.label}</span>
                                  </div>
                                </div>

                                {/* Info Row - ADMIN con dropdown */}
                                <div className="flex items-center gap-2 mb-3 flex-wrap">
                                  {/* Orario con dropdown */}
                                  <div className="relative">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setAssigningTime(assigningTime === cleaning.id ? null : cleaning.id); setAssigningOperator(null); }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                                    >
                                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span className="text-xs font-bold text-slate-700">{cleaning.scheduledTime || "TBD"}</span>
                                      <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                    
                                    {/* Dropdown Orari */}
                                    {assigningTime === cleaning.id && (
                                      <div 
                                        className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-48 overflow-y-auto w-24"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {TIME_SLOTS.map(time => (
                                          <button
                                            key={time}
                                            onClick={() => handleQuickAssignTime(cleaning.id, time)}
                                            className={`w-full px-3 py-2 text-left text-xs hover:bg-violet-50 transition-colors ${cleaning.scheduledTime === time ? "bg-violet-100 text-violet-700 font-semibold" : "text-slate-700"}`}
                                          >
                                            {time}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Ospiti */}
                                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50 rounded-lg border border-violet-200">
                                    <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                    <span className="text-xs font-medium text-violet-700">{cleaning.guestsCount || 2}</span>
                                  </div>

                                  {/* Prezzo */}
                                  <span className="text-sm font-bold text-slate-800 ml-auto">€{totalPrice.toFixed(0)}</span>
                                </div>

                                {/* Operatore con assegnazione rapida */}
                                <div className="flex items-center justify-between">
                                  <div className="relative flex-1">
                                    {cleaning.operator ? (
                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 shadow-sm">
                                          <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center">
                                            <span className="text-[9px] font-bold text-white">{getInitials(cleaning.operator.name)}</span>
                                          </div>
                                          <span className="text-xs font-medium text-white">{cleaning.operator.name}</span>
                                        </div>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleRemoveOperator(cleaning.id); }}
                                          className="w-6 h-6 rounded-lg bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 transition-colors"
                                          title="Rimuovi"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); setAssigningOperator(assigningOperator === cleaning.id ? null : cleaning.id); setAssigningTime(null); }}
                                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed border-rose-300 text-rose-500 hover:border-rose-400 hover:bg-rose-50 transition-colors"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                          </svg>
                                          <span className="text-xs font-medium">Assegna</span>
                                        </button>

                                        {/* Dropdown Operatori */}
                                        {assigningOperator === cleaning.id && (
                                          <div 
                                            className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 min-w-[180px] max-h-64 overflow-y-auto"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {operators.length === 0 ? (
                                              <div className="px-3 py-4 text-center text-sm text-slate-500">
                                                Nessun operatore
                                              </div>
                                            ) : (
                                              operators.map(op => (
                                                <button
                                                  key={op.id}
                                                  onClick={() => handleQuickAssignOperator(cleaning.id, op.id)}
                                                  disabled={savingAssignment}
                                                  className="w-full px-3 py-2.5 text-left flex items-center gap-2 hover:bg-violet-50 transition-colors disabled:opacity-50"
                                                >
                                                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-[9px] font-bold text-white">{getInitials(op.name)}</span>
                                                  </div>
                                                  <span className="text-sm font-medium text-slate-700 truncate">{op.name}</span>
                                                </button>
                                              ))
                                            )}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>

                                  {/* Pulsanti azioni */}
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => openEditModal(cleaning, property)}
                                      className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors"
                                      title="Modifica"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
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
          cleaning={editingCleaning}
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
    </div>
  );
}
