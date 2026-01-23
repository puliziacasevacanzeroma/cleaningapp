"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { doc, updateDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import NewCleaningModal from "~/components/NewCleaningModal";
import EditCleaningModal from "~/components/proprietario/EditCleaningModal";
import { ALL_INVENTORY_ITEMS, getDefaultLinenConfig } from "~/lib/linenItems";

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
}

interface PulizieViewProps {
  properties: Property[];
  cleanings: Cleaning[];
  operators?: Operator[];
  ownerId?: string;
  isAdmin?: boolean;
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

export function PulizieView({ properties, cleanings, operators = [], ownerId, isAdmin = false }: PulizieViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showNewCleaningModal, setShowNewCleaningModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
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

  const calendarRef = useRef<HTMLDivElement>(null);
  
  // Refs per sticky scroll sync
  const gridRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  
  // Carica inventario da Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || "",
        sellPrice: doc.data().sellPrice || 0,
        category: doc.data().category || ""
      }));
      setInventory(items);
      console.log("✅ Inventario caricato:", items.length);
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

  // Sync scroll: header segue scroll X della griglia, sidebar segue scroll Y
  const handleGridScroll = () => {
    if (gridRef.current && headerRef.current && sidebarRef.current) {
      headerRef.current.scrollLeft = gridRef.current.scrollLeft;
      sidebarRef.current.scrollTop = gridRef.current.scrollTop;
    }
  };

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

    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [cleanings, properties, timeFilter, searchTerm]);

  // Proprietà filtrate per il calendario
  const filteredProperties = useMemo(() => {
    if (!searchTerm) return properties;
    const search = searchTerm.toLowerCase();
    return properties.filter(p => 
      p.name.toLowerCase().includes(search) || 
      p.address?.toLowerCase().includes(search)
    );
  }, [properties, searchTerm]);

  const groupedByDate = useMemo(() => {
    const groups: { [key: string]: Cleaning[] } = {};
    filteredCleanings.forEach(c => {
      const dateKey = new Date(c.date).toDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(c);
    });
    return groups;
  }, [filteredCleanings]);

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
          icon: "✓"
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
          icon: "●"
        };
      case "SCHEDULED":
        if (!hasOperator) {
          return { 
            bg: "bg-gradient-to-r from-rose-400 to-red-500", 
            gradient: "bg-gradient-to-r from-rose-500 to-pink-400",
            cssGradient: "linear-gradient(135deg, rgba(244,63,94,0.9), rgba(251,113,133,0.85))",
            shadowColor: "rgba(244,63,94,0.4)",
            shadow: "shadow-lg shadow-rose-200",
            badge: "bg-rose-100 text-rose-700",
            label: isAdmin ? "Da assegnare" : "In attesa",
            icon: "!"
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
          icon: "○"
        };
      default:
        return { 
          bg: "bg-gradient-to-r from-slate-400 to-slate-500", 
          gradient: "bg-gradient-to-r from-slate-500 to-slate-400",
          cssGradient: "linear-gradient(135deg, rgba(100,116,139,0.9), rgba(71,85,105,0.85))",
          shadowColor: "rgba(100,116,139,0.4)",
          shadow: "shadow-lg shadow-slate-200",
          badge: "bg-slate-100 text-slate-700",
          label: status,
          icon: "?"
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

  // Salva orario da modal
  const saveTimeFromModal = async () => {
    if (!timeModalCleaning) return;
    setSavingTime(true);
    try {
      const cleaningRef = doc(db, "cleanings", timeModalCleaning.id);
      await updateDoc(cleaningRef, {
        scheduledTime: tempTime,
        updatedAt: new Date()
      });
      setShowTimeModal(false);
      setTimeModalCleaning(null);
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
  const openEditModal = (cleaning: Cleaning, property: Property | undefined) => {
    setEditingCleaning(cleaning);
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

  // Funzione per ottenere ordine biancheria collegato alla pulizia
  const getLinenOrderForCleaning = (cleaningId: string, propertyId: string) => {
    return orders.find(o => o.cleaningId === cleaningId || (o.propertyId === propertyId && !o.cleaningId));
  };

  // ========== FUNZIONE PER OTTENERE BIANCHERIA DA SERVICECONFIGS ==========
  const getLinenFromServiceConfig = (property: Property | undefined, guestsCount: number) => {
    const bedItems: { name: string; items: { name: string; quantity: number }[] }[] = [];
    const bathItems: { name: string; quantity: number }[] = [];
    const kitItems: { name: string; quantity: number }[] = [];
    
    if (!property) return { bedItems, bathItems, kitItems, totalPrice: 0 };

    // Controlla se la proprietà ha serviceConfigs per questo numero di ospiti
    const config = property.serviceConfigs?.[guestsCount];
    
    let totalPrice = 0;

    if (config) {
      // USA CONFIGURAZIONE SALVATA
      
      // Biancheria Letto (bl)
      if (config.bl) {
        Object.entries(config.bl).forEach(([bedKey, items]) => {
          const bedName = bedKey === 'all' ? 'Biancheria Letto' : bedKey;
          const bedLinenItems: { name: string; quantity: number }[] = [];
          
          Object.entries(items).forEach(([itemId, qty]) => {
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
        Object.entries(config.ba).forEach(([itemId, qty]) => {
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
        Object.entries(config.ki).forEach(([itemId, qty]) => {
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
      // USA CONFIGURAZIONE DEFAULT
      const defaultConfig = getDefaultLinenConfig(guestsCount);
      
      // Biancheria Letto
      const bedLinenItems: { name: string; quantity: number }[] = [];
      ['lenzuolo_sotto', 'lenzuolo_sopra', 'copripiumino', 'federa'].forEach(itemId => {
        const qty = defaultConfig[itemId as keyof typeof defaultConfig] || 0;
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
        bedItems.push({ name: 'Biancheria Letto (default)', items: bedLinenItems });
      }

      // Biancheria Bagno
      ['asciugamano_viso', 'asciugamano_ospite', 'telo_doccia'].forEach(itemId => {
        const qty = defaultConfig[itemId as keyof typeof defaultConfig] || 0;
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

    return { bedItems, bathItems, kitItems, totalPrice };
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      
      {/* HEADER */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700"></div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-pink-500/20 rounded-full blur-2xl -ml-8 -mb-8"></div>
        
        <div className="relative px-4 pt-4 pb-5">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <span className="text-xl">✨</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {isAdmin ? "Gestione Pulizie" : "Le Mie Pulizie"}
                  </h1>
                  <p className="text-violet-200 text-xs">
                    {isAdmin ? "Gestisci tutte le pulizie" : "Gestisci le pulizie delle tue proprietà"}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewCleaningModal(true)}
                className="px-3 py-2 rounded-xl bg-white/20 backdrop-blur-sm flex items-center gap-1.5 border border-white/30 hover:bg-white/30 transition-all animate-pulse"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-white text-[11px] font-semibold whitespace-nowrap">Aggiungi Servizio</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
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
            </div>
          </div>
        </div>
      </div>

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
          
          <div className="relative">
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

                      <div className="space-y-3">
                        {dayCleanings.map((cleaning) => {
                          const property = properties.find(p => p.id === cleaning.propertyId);
                          const status = getStatusConfig(cleaning.status, !!cleaning.operator);
                          const isExpanded = expandedCards.has(cleaning.id);
                          
                          // Ottieni biancheria da serviceConfigs o default
                          const guestsCount = cleaning.guestsCount || 2;
                          const { bedItems, bathItems, kitItems, totalPrice: linenPrice } = getLinenFromServiceConfig(property, guestsCount);
                          
                          // Calcola prezzi
                          const cleaningPrice = cleaning.price || property?.cleaningPrice || 0;
                          const totalPrice = cleaningPrice + linenPrice;
                          
                          return (
                            <div 
                              key={cleaning.id} 
                              className="bg-white/80 backdrop-blur-sm rounded-3xl overflow-hidden transition-all duration-300 hover:scale-[1.02]"
                              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.04)' }}
                            >
                              <div className="flex">
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
                                  <div className="cursor-pointer" onClick={() => openEditModal(cleaning, property)}>
                                    <h3 className="font-semibold text-[13px] text-gray-900 truncate leading-tight">{property?.name || cleaning.propertyName}</h3>
                                    <p className="text-[10px] text-gray-400 truncate mt-0.5">{property?.address}</p>
                                  </div>
                                  
                                  {/* Controlli con ombre */}
                                  <div className="flex items-center gap-2 mt-2">
                                    {/* ORARIO - apre modal */}
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
                                    
                                    {/* OSPITI - apre modal */}
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openGuestModal(cleaning); }}
                                      className="h-7 px-2.5 rounded-xl flex items-center gap-1.5 transition-all hover:scale-105"
                                      style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' }}
                                    >
                                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                      <span className="text-[11px] font-semibold text-gray-700">{guestsCount}</span>
                                    </button>
                                  </div>
                                  
                                  {/* Operatori (supporto multi-selezione) */}
                                  <div className="flex items-center justify-between mt-2">
                                    {isAdmin ? (
                                      <div onClick={(e) => e.stopPropagation()}>
                                        {(cleaning.operators && cleaning.operators.length > 0) || cleaning.operator ? (
                                          <button 
                                            onClick={() => openOperatorModal(cleaning)}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-xl transition-all hover:scale-105"
                                            style={{ background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)', boxShadow: '0 2px 8px rgba(168,85,247,0.15)' }}
                                          >
                                            {/* Mostra avatar operatori */}
                                            <div className="flex -space-x-1.5">
                                              {(cleaning.operators && cleaning.operators.length > 0 ? cleaning.operators : [cleaning.operator]).slice(0, 3).map((op, idx) => (
                                                op && (
                                                  <div 
                                                    key={op.id || idx}
                                                    className="w-5 h-5 rounded-md flex items-center justify-center border border-white"
                                                    style={{ background: `linear-gradient(135deg, ${['#a855f7', '#3b82f6', '#10b981'][idx % 3]} 0%, ${['#9333ea', '#2563eb', '#059669'][idx % 3]} 100%)`, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                                                  >
                                                    <span className="text-[7px] font-bold text-white">{getInitials(op.name)}</span>
                                                  </div>
                                                )
                                              ))}
                                            </div>
                                            {/* Nome/i operatore/i */}
                                            <span className="text-[10px] font-semibold text-purple-700 max-w-[60px] truncate">
                                              {cleaning.operators && cleaning.operators.length > 1 
                                                ? `${cleaning.operators.length} op.`
                                                : (cleaning.operators?.[0]?.name || cleaning.operator?.name)?.split(' ')[0]
                                              }
                                            </span>
                                          </button>
                                        ) : (
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
                                        )}
                                      </div>
                                    ) : (
                                      (cleaning.operators && cleaning.operators.length > 0) || cleaning.operator ? (
                                        <div 
                                          className="flex items-center gap-1.5 px-2 py-1 rounded-xl"
                                          style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', boxShadow: '0 2px 8px rgba(16,185,129,0.15)' }}
                                        >
                                          <div className="flex -space-x-1.5">
                                            {(cleaning.operators && cleaning.operators.length > 0 ? cleaning.operators : [cleaning.operator]).slice(0, 3).map((op, idx) => (
                                              op && (
                                                <div 
                                                  key={op.id || idx}
                                                  className="w-5 h-5 rounded-md flex items-center justify-center border border-white"
                                                  style={{ background: `linear-gradient(135deg, ${['#10b981', '#3b82f6', '#a855f7'][idx % 3]} 0%, ${['#059669', '#2563eb', '#9333ea'][idx % 3]} 100%)` }}
                                                >
                                                  <span className="text-[7px] font-bold text-white">{getInitials(op.name)}</span>
                                                </div>
                                              )
                                            ))}
                                          </div>
                                          <span className="text-[10px] font-semibold text-emerald-700 max-w-[60px] truncate">
                                            {cleaning.operators && cleaning.operators.length > 1 
                                              ? `${cleaning.operators.length} op.`
                                              : (cleaning.operators?.[0]?.name || cleaning.operator?.name)?.split(' ')[0]
                                            }
                                          </span>
                                        </div>
                                      ) : (
                                        <div 
                                          className="flex items-center gap-1 px-2 py-1 rounded-xl"
                                          style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)' }}
                                        >
                                          <span className="text-[10px] font-medium text-rose-600">In attesa</span>
                                        </div>
                                      )
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
                              {isExpanded && (
                                <div 
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-4 pb-4 pt-2 border-t border-gray-100"
                                >
                                  {/* Riga Pulizia / Dotazioni */}
                                  <div className="flex items-center justify-between mb-4 py-2 px-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-500">Pulizia:</span>
                                      <span className="text-xs font-bold text-gray-800">€{cleaningPrice.toFixed(2)}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-500">Dotazioni:</span>
                                      <span className="text-xs font-bold text-gray-800">€{linenPrice.toFixed(2)}</span>
                                    </div>
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
                                        {bedItems.map((bed, idx) => (
                                          bed.items.map((item, itemIdx) => (
                                            <span key={`${idx}-${itemIdx}`} className="px-2 py-1 bg-slate-50 rounded-lg text-[10px] text-gray-600 border border-slate-200">
                                              {item.name}: <span className="font-bold">{item.quantity}</span>
                                            </span>
                                          ))
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

                                  {/* Kit Cortesia */}
                                  {kitItems.length > 0 && (
                                    <div className="mb-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center">
                                          <span className="text-xs">🧴</span>
                                        </div>
                                        <span className="text-xs font-semibold text-gray-700">Kit Cortesia</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {kitItems.map((item, idx) => (
                                          <span key={idx} className="px-2 py-1 bg-amber-50 rounded-lg text-[10px] text-amber-600 border border-amber-100">
                                            {item.name}: <span className="font-bold">{item.quantity}</span>
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Messaggio se non ci sono dati */}
                                  {bedItems.length === 0 && bathItems.length === 0 && kitItems.length === 0 && (
                                    <div className="mb-3 p-3 bg-slate-50 rounded-xl text-center">
                                      <p className="text-xs text-gray-500">Nessuna dotazione configurata</p>
                                    </div>
                                  )}

                                  {/* Pulsante Modifica */}
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); openEditModal(cleaning, property); }}
                                    className="w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', boxShadow: '0 4px 12px rgba(15,23,42,0.25)' }}
                                  >
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-white">Modifica Servizio</span>
                                  </button>
                                </div>
                              )}
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
                              <span className="text-white/80 text-[9px] whitespace-nowrap drop-shadow-sm">{property.address}</span>
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
                    { bg: "from-rose-400 to-red-500", label: isAdmin ? "Da assegnare" : "In attesa", icon: "!" },
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

      {showGuestModal && selectedCleaning && (
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
                  <span className="font-medium text-slate-800">Adulti</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setAdulti(Math.max(1, adulti - 1))} className="w-9 h-9 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400">
                    <span className="text-lg">−</span>
                  </button>
                  <span className="text-xl font-bold text-slate-800 w-6 text-center">{adulti}</span>
                  <button onClick={() => setAdulti(adulti + 1)} className="w-9 h-9 rounded-full bg-violet-500 flex items-center justify-center text-white shadow-lg">
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
                  <button onClick={() => setNeonati(Math.max(0, neonati - 1))} className="w-9 h-9 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400">
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
      )}

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
          cleaning={editingCleaning}
          property={editingProperty || {
            id: editingCleaning.propertyId,
            name: editingCleaning.propertyName || 'Proprietà',
            address: '',
            cleaningPrice: editingCleaning.price || 0
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingCleaning(null);
            setEditingProperty(null);
          }}
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
    </div>
  );
}
