"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { doc, updateDoc, collection, query, where, onSnapshot } from "firebase/firestore";
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

interface Cleaning {
  id: string;
  propertyId: string;
  propertyName?: string;
  date: Date;
  status: string;
  scheduledTime?: string | null;
  operator?: Operator | null;
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

  // Stato per modal modifica pulizia
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCleaning, setEditingCleaning] = useState<Cleaning | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  const calendarRef = useRef<HTMLDivElement>(null);
  
  // Refs per sticky scroll sync
  const gridRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  
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
          shadow: "shadow-lg shadow-emerald-200",
          badge: "bg-emerald-100 text-emerald-700",
          label: "Completata",
          icon: "✓"
        };
      case "IN_PROGRESS":
        return { 
          bg: "bg-gradient-to-r from-amber-400 to-orange-500", 
          gradient: "bg-gradient-to-r from-amber-500 to-orange-400",
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
            shadow: "shadow-lg shadow-rose-200",
            badge: "bg-rose-100 text-rose-700",
            label: isAdmin ? "Da assegnare" : "In attesa",
            icon: "!"
          };
        }
        return { 
          bg: "bg-gradient-to-r from-sky-400 to-blue-500", 
          gradient: "bg-gradient-to-r from-blue-500 to-indigo-400",
          shadow: "shadow-lg shadow-blue-200",
          badge: "bg-sky-100 text-sky-700",
          label: "Programmata",
          icon: "○"
        };
      default:
        return { 
          bg: "bg-gradient-to-r from-slate-400 to-slate-500", 
          gradient: "bg-gradient-to-r from-slate-500 to-slate-400",
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

  // Funzione per raggruppare items biancheria per tipo
  const groupLinenItems = (items: LinenItem[], property: Property | undefined) => {
    const bedItems: { name: string; location: string; items: LinenItem[] }[] = [];
    const bathItems: LinenItem[] = [];

    // Parole chiave per biancheria bagno
    const bathKeywords = ['bagno', 'telo', 'asciugamano', 'scendi', 'bidet', 'viso', 'corpo'];
    
    items.forEach(item => {
      const itemNameLower = item.name.toLowerCase();
      const isBathItem = bathKeywords.some(k => itemNameLower.includes(k));
      
      if (isBathItem) {
        bathItems.push(item);
      } else {
        // Prova a matchare con i letti della proprietà
        if (property?.bedsConfig && property.bedsConfig.length > 0) {
          // Per ora raggruppiamo tutto sotto "Letto"
          const existingBed = bedItems.find(b => b.name === "Letto");
          if (existingBed) {
            existingBed.items.push(item);
          } else {
            bedItems.push({ name: "Letto", location: "", items: [item] });
          }
        } else {
          const existingBed = bedItems.find(b => b.name === "Letto");
          if (existingBed) {
            existingBed.items.push(item);
          } else {
            bedItems.push({ name: "Letto", location: "", items: [item] });
          }
        }
      }
    });

    // Se la proprietà ha configurazione letti, usa quella
    if (property?.bedsConfig && property.bedsConfig.length > 0 && bedItems.length > 0) {
      const configuredBeds = property.bedsConfig.map(bed => {
        const bedTypeName = bed.type === 'matr' ? 'Matrimoniale' : 
                           bed.type === 'sing' ? 'Singolo' : 
                           bed.type === 'divano' ? 'Divano Letto' : 
                           bed.type === 'castello' ? 'Castello' : bed.name;
        return {
          name: bedTypeName,
          location: bed.location,
          items: bedItems[0]?.items || []
        };
      });
      return { bedItems: configuredBeds, bathItems };
    }

    return { bedItems, bathItems };
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
                          const linenOrder = getLinenOrderForCleaning(cleaning.id, cleaning.propertyId);
                          
                          // Calcola prezzi
                          const cleaningPrice = cleaning.price || property?.cleaningPrice || 0;
                          const dotazioniPrice = linenOrder?.items?.reduce((sum, item) => sum + (item.quantity * 2), 0) || 0;
                          const totalPrice = cleaningPrice + dotazioniPrice;

                          // Raggruppa items biancheria
                          const { bedItems, bathItems } = linenOrder?.items 
                            ? groupLinenItems(linenOrder.items, property)
                            : { bedItems: [], bathItems: [] };
                          
                          return (
                            <div 
                              key={cleaning.id} 
                              onClick={() => openEditModal(cleaning, property)}
                              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm cursor-pointer hover:shadow-md hover:border-slate-300 transition-all active:scale-[0.98]"
                            >
                              {/* Status bar con gradiente */}
                              <div className={`h-1.5 ${status.gradient}`}></div>
                              
                              <div className="p-4">
                                {/* Header Row */}
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                      </svg>
                                    </div>
                                    <div>
                                      <h3 className="font-bold text-slate-800 text-sm">{property?.name || cleaning.propertyName}</h3>
                                      <p className="text-xs text-slate-500">{property?.address}</p>
                                    </div>
                                  </div>
                                  
                                  {/* Badge Status con effetto */}
                                  <div className={`px-3 py-1.5 rounded-full text-[11px] font-bold text-white ${status.gradient} ${status.shadow} flex items-center gap-1.5`}>
                                    <span className="text-white/90">{status.icon}</span>
                                    <span>{status.label}</span>
                                  </div>
                                </div>

                                {/* Info Row */}
                                <div className="flex items-center gap-2 mb-3">
                                  {/* Orario PIÙ GRANDE */}
                                  <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 rounded-xl">
                                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-sm font-bold text-slate-700">{cleaning.scheduledTime || "TBD"}</span>
                                  </div>
                                  
                                  {/* Ospiti - Solo visualizzazione */}
                                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50 rounded-lg border border-violet-200">
                                    <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                    <span className="text-xs font-medium text-violet-700">{cleaning.guestsCount || 2} ospiti</span>
                                  </div>
                                </div>

                                {/* Footer Row con TOTALE e FRECCIA */}
                                <div className="flex items-center justify-between">
                                  {/* Operatore */}
                                  {cleaning.operator ? (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 shadow-sm">
                                      <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-white">{getInitials(cleaning.operator.name)}</span>
                                      </div>
                                      <span className="text-xs font-medium text-white">{cleaning.operator.name}</span>
                                    </div>
                                  ) : isAdmin ? (
                                    <button 
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                      </svg>
                                      <span className="text-xs font-medium">Assegna</span>
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span className="text-xs font-medium">In attesa di assegnazione</span>
                                    </div>
                                  )}

                                  {/* TOTALE + FRECCIA */}
                                  <div className="flex items-center gap-3">
                                    {/* Prezzo totale */}
                                    <span className="text-lg font-bold text-slate-800">€{totalPrice.toFixed(2)}</span>
                                    
                                    {/* Freccia */}
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); toggleCardExpand(cleaning.id); }}
                                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                                        isExpanded 
                                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-200' 
                                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                      }`}
                                    >
                                      <svg 
                                        className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
                                        fill="none" 
                                        stroke="currentColor" 
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>

                                {/* ========== DETTAGLI ESPANDIBILI ========== */}
                                <div 
                                  onClick={(e) => e.stopPropagation()}
                                  className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}
                                >
                                  <div className="pt-4 border-t border-slate-100">
                                    
                                    {/* Riga Pulizia / Dotazioni */}
                                    <div className="flex items-center justify-between mb-5">
                                      <div className="flex items-center gap-1">
                                        <span className="text-sm text-slate-500">Pulizia:</span>
                                        <span className="text-sm font-bold text-slate-800">€{cleaningPrice.toFixed(2)}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-sm text-slate-500">Dotazioni:</span>
                                        <span className="text-sm font-bold text-slate-800">€{dotazioniPrice.toFixed(2)}</span>
                                      </div>
                                    </div>

                                    {/* Biancheria Letto */}
                                    {bedItems.length > 0 && (
                                      <div className="mb-5">
                                        <div className="flex items-center gap-2 mb-3">
                                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                                            <BedIcon />
                                          </div>
                                          <span className="text-sm font-semibold text-slate-800">Biancheria Letto</span>
                                        </div>

                                        <div className="space-y-3 pl-2">
                                          {bedItems.map((bed, idx) => (
                                            <div key={idx} className="bg-slate-50 rounded-xl p-3">
                                              <div className="flex items-center gap-2 mb-2">
                                                <div className="w-5 h-5 rounded bg-slate-200 flex items-center justify-center text-slate-500">
                                                  <BedIcon />
                                                </div>
                                                <span className="text-sm font-semibold text-slate-700">{bed.name}</span>
                                                {bed.location && (
                                                  <span className="text-xs text-blue-500 font-medium">({bed.location})</span>
                                                )}
                                              </div>
                                              <div className="flex flex-wrap gap-2 ml-7">
                                                {bed.items.map((item, itemIdx) => (
                                                  <span key={itemIdx} className="px-2.5 py-1 bg-white rounded-lg text-xs text-slate-600 border border-slate-200">
                                                    {item.name}: <span className="font-semibold">{item.quantity}</span>
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Biancheria Bagno */}
                                    {bathItems.length > 0 && (
                                      <div className="mb-5">
                                        <div className="flex items-center gap-2 mb-3">
                                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 6v12a2 2 0 002 2h12a2 2 0 002-2V6M4 6l2-2h12l2 2M9 10h6" />
                                            </svg>
                                          </div>
                                          <span className="text-sm font-semibold text-slate-800">Biancheria Bagno</span>
                                        </div>

                                        <div className="flex flex-wrap gap-2 pl-2">
                                          {bathItems.map((item, idx) => (
                                            <span key={idx} className="px-3 py-1.5 bg-blue-50 rounded-lg text-xs text-blue-600 font-medium">
                                              {item.name}: <span className="font-bold">{item.quantity}</span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Messaggio se non ci sono dati biancheria */}
                                    {bedItems.length === 0 && bathItems.length === 0 && (
                                      <div className="mb-3 p-4 bg-slate-50 rounded-xl text-center">
                                        <p className="text-sm text-slate-500">Nessuna dotazione biancheria configurata</p>
                                      </div>
                                    )}

                                    {/* Pulsante Modifica */}
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openEditModal(cleaning, property); }}
                                      className="w-full py-3.5 bg-gradient-to-r from-slate-600 to-slate-800 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                      </svg>
                                      Modifica Servizio
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
    </div>
  );
}
