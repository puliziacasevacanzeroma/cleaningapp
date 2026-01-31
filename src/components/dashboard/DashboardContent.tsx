"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { DeliveriesView } from "./DeliveriesView";
import EditCleaningModal from "~/components/proprietario/EditCleaningModal";
import CleaningActionModal from "~/components/cleaning/CleaningActionModal";
import { db } from "~/lib/firebase/config";
import { collection, query, where, onSnapshot, orderBy, Timestamp, getDocs } from "firebase/firestore";

interface Operator {
  id: string;
  name: string | null;
}

interface Property {
  id: string;
  name: string;
  address: string;
  imageUrl?: string | null;
  maxGuests?: number | null;
}

interface Booking {
  guestName: string;
  guestsCount?: number | null;
}

interface CleaningOperator {
  id: string;
  operator: Operator;
}

interface Cleaning {
  id: string;
  date: string | Date;
  scheduledTime?: string | null;
  status: string;
  guestsCount?: number | null;
  property: Property;
  operator?: Operator | null;
  operators?: CleaningOperator[];
  booking?: Booking | null;
  // Nuovi campi per tipo servizio e prezzo
  serviceType?: string;
  serviceTypeName?: string;
  price?: number;
  contractPrice?: number;
  priceModified?: boolean;
  priceChangeReason?: string;
  sgrossoReason?: string;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  notes?: string;
  // Campi per pulizie completate
  photos?: string[];
  startedAt?: any;
  completedAt?: any;
  // Campi per valutazione
  ratingScore?: number | null;
  ratingId?: string | null;
  extraServices?: {name: string; price: number}[];
  // Campi per tracciamento modifica data
  originalDate?: Date;
  dateModifiedAt?: Date;
  // Campi per deadline mancata
  missedDeadline?: boolean;
  missedDeadlineAt?: any;
  // 🔧 FIX: Configurazione biancheria salvata
  customLinenConfig?: any;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  propertyCity?: string;
  propertyPostalCode?: string;
  propertyFloor?: string;
  riderId?: string | null;
  riderName?: string | null;
  status: string;
  urgency?: 'normal' | 'urgent';
  items: OrderItem[];
  scheduledDate: Date;
  scheduledTime?: string | null;
  cleaningId?: string | null;
  notes?: string;
  createdAt: Date;
  includePickup?: boolean;
  pickupItems?: OrderItem[];
}

interface Rider {
  id: string;
  name: string;
}

interface DashboardContentProps {
  userName: string;
  stats: {
    cleaningsToday: number;
    operatorsActive: number;
    propertiesTotal: number;
    checkinsWeek: number;
    ordersToday?: number;
  };
  cleanings: Cleaning[];
  operators: Operator[];
  orders?: Order[];
  riders?: Rider[];
}

type ActiveTab = "cleanings" | "deliveries";

// CSS per mobile
const mobileStyles = `
  .mobile-picker-modal { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-radius: 24px 24px 0 0; transform: translateY(0); z-index: 60; }
  .mobile-success-toast { position: fixed; top: 80px; left: 50%; transform: translateX(-50%) translateY(-20px) scale(0.9); opacity: 0; visibility: hidden; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); z-index: 200; pointer-events: none; }
  .mobile-success-toast.active { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; visibility: visible; }
  .mobile-card-flash { animation: mobileCardFlash 0.6s ease; }
  @keyframes mobileCardFlash { 0%,100% { background: white; } 40% { background: #d1fae5; } }
  .mobile-time-scroll { height: 180px; overflow-y: auto; scroll-snap-type: y mandatory; -webkit-overflow-scrolling: touch; mask-image: linear-gradient(to bottom, transparent, black 25%, black 75%, transparent); -webkit-mask-image: linear-gradient(to bottom, transparent, black 25%, black 75%, transparent); }
  .mobile-time-scroll::-webkit-scrollbar { display: none; }
  .mobile-time-item { height: 60px; scroll-snap-align: center; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 500; color: #cbd5e1; transition: all 0.15s ease; cursor: pointer; }
  .mobile-time-item.active { font-size: 34px; font-weight: 700; color: #0f172a; }
  .mobile-selection-indicator { position: absolute; top: 50%; left: 0; right: 0; height: 60px; transform: translateY(-50%); border-top: 2px solid #0ea5e9; border-bottom: 2px solid #0ea5e9; background: linear-gradient(90deg, rgba(14, 165, 233, 0.05) 0%, rgba(14, 165, 233, 0.08) 50%, rgba(14, 165, 233, 0.05) 100%); pointer-events: none; border-radius: 12px; }
  body.mobile-modal-open { overflow: hidden; position: fixed; width: 100%; }
  @keyframes scaleIn { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
  .scale-in { animation: scaleIn 0.2s ease forwards; }
`;

export function DashboardContent({ userName, stats, cleanings: initialCleanings, operators, orders: initialOrders = [], riders = [] }: DashboardContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openCleaningId = searchParams.get('openCleaning');
  const urlDate = searchParams.get('date');
  const highlightId = searchParams.get('highlight');
  
  const [activeTab, setActiveTab] = useState<ActiveTab>("cleanings");
  // 🔄 Inizializza con valore corretto - assume mobile su SSR
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return true; // SSR: assume mobile
    return window.innerWidth < 1024;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [cleanings, setCleanings] = useState<Cleaning[]>(initialCleanings);
  const [loadingCleanings, setLoadingCleanings] = useState(false);
  
  // 🔧 NUOVO: Mappa propertyId -> maxGuests per le proprietà
  const [propertiesMaxGuests, setPropertiesMaxGuests] = useState<Record<string, number>>({});
  
  // 🔴 NUOVO: Stato per ordini con listener realtime
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState("");
  const [editingGuestsId, setEditingGuestsId] = useState<string | null>(null);
  const [editingGuests, setEditingGuests] = useState("");
  const timeInputRef = useRef<HTMLInputElement>(null);
  const guestsInputRef = useRef<HTMLInputElement>(null);
  const [cleaningOperators, setCleaningOperators] = useState<Record<string, Operator[]>>({});

  // Detail Modal state
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailCleaning, setDetailCleaning] = useState<Cleaning | null>(null);

  // Action Modal state (Sposta/Cancella)
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionCleaning, setActionCleaning] = useState<Cleaning | null>(null);

  // Mobile states
  const [statusFilter, setStatusFilter] = useState<string | null>(null); // Filtro per status (todo, inprogress, done)
  const [showMobileTimePicker, setShowMobileTimePicker] = useState(false);
  const [showMobileOperatorPicker, setShowMobileOperatorPicker] = useState(false);
  const [showMobileGuestsPicker, setShowMobileGuestsPicker] = useState(false);
  const [showMobileDeleteConfirm, setShowMobileDeleteConfirm] = useState(false);
  const [deleteOperatorData, setDeleteOperatorData] = useState<{ cleaningId: string; operator: Operator } | null>(null);
  const [mobileCurrentCardId, setMobileCurrentCardId] = useState<string | null>(null);
  const [mobileCurrentHour, setMobileCurrentHour] = useState(10);
  const [mobileCurrentMin, setMobileCurrentMin] = useState(0);
  const [mobileGuestsData, setMobileGuestsData] = useState({ adults: 2, infants: 0 });
  const [mobileToast, setMobileToast] = useState({ show: false, message: "" });
  const [mobileOperatorSearch, setMobileOperatorSearch] = useState("");
  
  // 🆕 Stati per modal conferma biancheria personalizzata
  const [showLinenConfirmModal, setShowLinenConfirmModal] = useState(false);
  const [pendingGuestChange, setPendingGuestChange] = useState<{ adults: number; infants: number } | null>(null);
  const [savingGuests, setSavingGuests] = useState(false);
  
  const hourScrollRef = useRef<HTMLDivElement>(null);
  const minScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollYRef = useRef(0);
  const mobileCardsRef = useRef<HTMLDivElement>(null);
  const hourTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ITEM_HEIGHT = 60;
  const HOURS = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'];
  const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  // Detect screen size
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 🔴 LEGGI DATA DA URL (per navigazione da modal duplicato)
  useEffect(() => {
    if (urlDate) {
      const [year, month, day] = urlDate.split('-').map(Number);
      if (year && month && day) {
        const dateFromUrl = new Date(year, month - 1, day);
        setSelectedDate(dateFromUrl);
        console.log('📅 Data impostata da URL:', dateFromUrl.toDateString());
      }
    }
  }, [urlDate]);

  // 🔴 HIGHLIGHT PULIZIA DA URL
  useEffect(() => {
    if (highlightId && cleanings.length > 0) {
      const cleaningToHighlight = cleanings.find(c => c.id === highlightId);
      if (cleaningToHighlight) {
        // Apri il dettaglio della pulizia
        setDetailCleaning(cleaningToHighlight);
        setShowDetailModal(true);
        console.log('🔍 Highlight pulizia:', highlightId);
        
        // Rimuovi il parametro dall'URL dopo averlo usato
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [highlightId, cleanings]);

  // Inject mobile styles
  useEffect(() => {
    if (isMobile) {
      const styleId = 'mobile-dashboard-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = mobileStyles;
        document.head.appendChild(style);
      }
    }
  }, [isMobile]);

  // 🔔 APRI MODAL PULIZIA DA URL (per notifiche)
  useEffect(() => {
    if (openCleaningId) {
      // Carica i dati della pulizia da Firestore
      const loadCleaningFromId = async () => {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const cleaningDoc = await getDoc(doc(db, 'cleanings', openCleaningId));
          
          if (cleaningDoc.exists()) {
            const data = cleaningDoc.data();
            const cleaning: Cleaning = {
              id: cleaningDoc.id,
              date: data.scheduledDate?.toDate?.() || new Date(),
              scheduledTime: data.scheduledTime || null,
              status: data.status || "SCHEDULED",
              guestsCount: data.guestsCount || null,
              property: {
                id: data.propertyId || "",
                name: data.propertyName || "",
                address: data.propertyAddress || "",
                imageUrl: data.propertyImageUrl || null,
                maxGuests: data.maxGuests || null,
              },
              operator: data.operatorId ? { id: data.operatorId, name: data.operatorName || null } : null,
              operators: data.operators || [],
              booking: data.guestName ? { guestName: data.guestName, guestsCount: data.guestsCount } : null,
              serviceType: data.serviceType,
              serviceTypeName: data.serviceTypeName,
              price: data.price,
              contractPrice: data.contractPrice,
              notes: data.notes,
              photos: data.photos,
              startedAt: data.startedAt,
              completedAt: data.completedAt,
              missedDeadline: data.missedDeadline,
              missedDeadlineAt: data.missedDeadlineAt,
            };
            
            setDetailCleaning(cleaning);
            setShowDetailModal(true);
            
            // Rimuovi il parametro dalla URL
            router.replace('/dashboard', { scroll: false });
          }
        } catch (error) {
          console.error('Errore caricamento pulizia da URL:', error);
        }
      };
      
      loadCleaningFromId();
    }
  }, [openCleaningId, router]);

  // 🔧 CARICA PROPRIETÀ per ottenere maxGuests
  useEffect(() => {
    const loadProperties = async () => {
      try {
        const propertiesSnapshot = await getDocs(collection(db, "properties"));
        const maxGuestsMap: Record<string, number> = {};
        propertiesSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.maxGuests) {
            maxGuestsMap[doc.id] = data.maxGuests;
          }
        });
        console.log("🏠 Caricati maxGuests per", Object.keys(maxGuestsMap).length, "proprietà");
        setPropertiesMaxGuests(maxGuestsMap);
      } catch (error) {
        console.error("Errore caricamento proprietà:", error);
      }
    };
    loadProperties();
  }, []);

  // 🔴 LISTENER REALTIME PER PULIZIE - Si aggiorna automaticamente
  useEffect(() => {
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    console.log("🔄 Attivo listener realtime pulizie per:", selectedDate.toDateString());

    const cleaningsQuery = query(
      collection(db, "cleanings"),
      where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
      where("scheduledDate", "<=", Timestamp.fromDate(endOfDay)),
      orderBy("scheduledDate", "asc")
    );

    const unsubscribe = onSnapshot(cleaningsQuery, (snapshot) => {
      console.log("🔴 Aggiornamento realtime pulizie:", snapshot.docs.length);
      const updatedCleanings: Cleaning[] = snapshot.docs.map(doc => {
        const data = doc.data();
        // 🔧 Usa maxGuests dalla pulizia, oppure dalla proprietà, oppure fallback
        const propertyMaxGuests = data.maxGuests || propertiesMaxGuests[data.propertyId] || null;
        return {
          id: doc.id,
          date: data.scheduledDate?.toDate?.() || new Date(),
          scheduledTime: data.scheduledTime || null,
          status: data.status || "SCHEDULED",
          guestsCount: data.guestsCount || null,
          property: {
            id: data.propertyId || "",
            name: data.propertyName || "",
            address: data.propertyAddress || "",
            imageUrl: data.propertyImageUrl || null,
            maxGuests: propertyMaxGuests,
          },
          operator: data.operatorId ? { id: data.operatorId, name: data.operatorName || null } : null,
          // Filtra duplicati negli operators
          operators: (data.operators || []).filter((op: any, index: number, arr: any[]) => 
            op && op.id && arr.findIndex((o: any) => o?.id === op.id) === index
          ),
          booking: data.guestName ? { guestName: data.guestName, guestsCount: data.guestsCount } : null,
          serviceType: data.serviceType,
          serviceTypeName: data.serviceTypeName,
          price: data.price,
          contractPrice: data.contractPrice,
          priceModified: data.priceModified,
          priceChangeReason: data.priceChangeReason,
          sgrossoReason: data.sgrossoReason,
          sgrossoReasonLabel: data.sgrossoReasonLabel,
          sgrossoNotes: data.sgrossoNotes,
          notes: data.notes,
          photos: data.photos,
          startedAt: data.startedAt,
          completedAt: data.completedAt,
          originalDate: data.originalDate?.toDate?.() || null,
          dateModifiedAt: data.dateModifiedAt?.toDate?.() || null,
          // Campi per valutazione
          ratingScore: data.ratingScore || null,
          ratingId: data.ratingId || null,
          extraServices: data.extraServices || [],
          // 🔧 FIX: Configurazione biancheria salvata
          customLinenConfig: data.customLinenConfig || null,
        };
      });
      setCleanings(updatedCleanings);
      setLoadingCleanings(false);
    }, (error) => {
      console.error("❌ Errore listener pulizie:", error);
      setLoadingCleanings(false);
    });

    return () => {
      console.log("🛑 Disattivo listener realtime pulizie");
      unsubscribe();
    };
  }, [selectedDate, propertiesMaxGuests]); // 🔧 Aggiunto propertiesMaxGuests

  // 🔴 LISTENER REALTIME PER ORDINI - Si aggiorna automaticamente al cambio data
  useEffect(() => {
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    console.log("🔄 Attivo listener realtime ordini per:", selectedDate.toDateString());
    setLoadingOrders(true);

    const ordersQuery = query(
      collection(db, "orders"),
      where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
      where("scheduledDate", "<=", Timestamp.fromDate(endOfDay)),
      orderBy("scheduledDate", "asc")
    );

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      console.log("🔴 Aggiornamento realtime ordini:", snapshot.docs.length);
      const updatedOrders: Order[] = snapshot.docs
        .filter(doc => {
          // 🔧 FIX: Escludi ordini cancellati
          const status = doc.data().status;
          return status !== "CANCELLED" && status !== "cancelled";
        })
        .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          propertyId: data.propertyId || "",
          propertyName: data.propertyName || "",
          propertyAddress: data.propertyAddress || "",
          propertyCity: data.propertyCity || "",
          propertyPostalCode: data.propertyPostalCode || "",
          propertyFloor: data.propertyFloor || "",
          riderId: data.riderId || null,
          riderName: data.riderName || null,
          status: data.status || "PENDING",
          urgency: data.urgency || "normal",
          items: data.items || [],
          scheduledDate: data.scheduledDate?.toDate?.() || new Date(),
          scheduledTime: data.scheduledTime || null,
          cleaningId: data.cleaningId || null,
          notes: data.notes || "",
          createdAt: data.createdAt?.toDate?.() || new Date(),
          includePickup: data.includePickup || false,
          pickupItems: data.pickupItems || [],
        };
      });
      console.log("🔴 Ordini attivi (esclusi cancellati):", updatedOrders.length);
      setOrders(updatedOrders);
      setLoadingOrders(false);
    }, (error) => {
      console.error("❌ Errore listener ordini:", error);
      setLoadingOrders(false);
    });

    return () => {
      console.log("🛑 Disattivo listener realtime ordini");
      unsubscribeOrders();
    };
  }, [selectedDate]);

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
    // Il listener realtime si attiverà automaticamente
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
    // Il listener realtime si attiverà automaticamente
  };

  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    // Il listener realtime si attiverà automaticamente
  };

  const isToday = () => selectedDate.toDateString() === new Date().toDateString();

  // 🔥 INIZIALIZZA cleaningOperators DAL SERVER
  useEffect(() => {
    const initial: Record<string, Operator[]> = {};
    
    console.log("🔄 Inizializzazione operatori da", cleanings.length, "pulizie");
    
    cleanings.forEach(c => {
      // PRIORITÀ: usa l'array operators se presente
      if (c.operators && c.operators.length > 0) {
        // Supporta ENTRAMBI i formati:
        // 1. Nuovo formato: [{ id, name }]
        // 2. Vecchio formato: [{ operator: { id, name } }]
        const validOperators = c.operators
          .map(co => {
            // Nuovo formato diretto: { id, name }
            if (co && (co as any).id && typeof (co as any).id === 'string' && !(co as any).operator) {
              return { id: (co as any).id, name: (co as any).name || "Operatore" };
            }
            // Vecchio formato nested: { operator: { id, name } }
            if (co && co.operator && co.operator.id) {
              return co.operator;
            }
            return null;
          })
          .filter((op): op is Operator => op !== null && op.id !== "");
        
        initial[c.id] = validOperators.filter((op, index, arr) => 
          arr.findIndex(o => o.id === op.id) === index
        );
        if (validOperators.length > 0) {
          console.log(`  ✅ ${c.property.name}: ${validOperators.length} operatori ->`, validOperators.map(o => o.name).join(", "));
        }
      } 
      // Fallback: usa il singolo operator se presente
      else if (c.operator && c.operator.id && c.operator.id !== "") {
        initial[c.id] = [c.operator];
        console.log(`  ✅ ${c.property.name}: 1 operatore (singolo) ->`, c.operator.name);
      } 
      else {
        initial[c.id] = [];
      }
    });
    
    setCleaningOperators(initial);
  }, [cleanings]);

  useEffect(() => {
    if (editingTimeId && timeInputRef.current) timeInputRef.current.focus();
  }, [editingTimeId]);

  useEffect(() => {
    if (editingGuestsId && guestsInputRef.current) {
      guestsInputRef.current.focus();
      guestsInputRef.current.select();
    }
  }, [editingGuestsId]);

  const formattedDate = selectedDate.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

  const mapStatus = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'pending':
      case 'assigned':
        return 'todo';
      case 'in_progress':
        return 'inprogress';
      case 'completed':
        return 'done';
      default:
        return 'todo';
    }
  };

  const filteredCleanings = cleanings
    .filter(c => {
      // Filtro per ricerca
      const matchesSearch = c.property.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.property.address.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Filtro per status
      const matchesStatus = statusFilter === null || mapStatus(c.status) === statusFilter;
      
      return matchesSearch && matchesStatus;
    })
    // 🔧 FIX: Ordinamento per status e orario (come mobile)
    .sort((a, b) => {
      const statusOrder: Record<string, number> = { todo: 0, inprogress: 1, done: 2 };
      const statusA = statusOrder[mapStatus(a.status)] || 0;
      const statusB = statusOrder[mapStatus(b.status)] || 0;
      // Prima ordina per status (da fare → in corso → completate)
      if (statusA !== statusB) return statusA - statusB;
      // Poi ordina per orario schedulato
      return (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00');
    });

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getShortName = (name: string | null) => {
    if (!name) return "??";
    const parts = name.split(" ");
    return parts.length >= 2 ? parts[0] + " " + parts[1][0] + "." : name;
  };

  const operatorColors = [
    "from-emerald-400 to-teal-500",
    "from-sky-400 to-blue-500",
    "from-violet-400 to-purple-500",
    "from-rose-400 to-pink-500",
    "from-amber-400 to-orange-500",
    "from-cyan-400 to-sky-500",
  ];

  const getOperatorColor = (operatorId: string) => {
    const index = operators.findIndex(o => o.id === operatorId);
    return operatorColors[Math.abs(index) % operatorColors.length];
  };

  // Desktop handlers
  const handleAssignClick = (cleaning: Cleaning) => {
    setSelectedCleaning(cleaning);
    setShowAssignModal(true);
  };

  const handleAssignOperator = async (operatorId: string) => {
    if (!selectedCleaning) return;
    
    // 🔒 Blocca modifiche a pulizie completate
    if (selectedCleaning.status?.toLowerCase() === 'completed') {
      alert("⚠️ Non puoi modificare una pulizia completata");
      return;
    }
    
    setAssigning(true);
    try {
      const response = await fetch('/api/dashboard/cleanings/' + selectedCleaning.id + '/assign', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId })
      });
      
      if (response.ok) {
        // 🔥 FIX: Non aggiornare manualmente - il listener realtime aggiornerà automaticamente
        // Questo evita duplicati causati dal doppio aggiornamento (manuale + realtime)
        setShowAssignModal(false);
        setSelectedCleaning(null);
      } else {
        // 🔥 Mostra errore all'utente
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || "Errore durante l'assegnazione";
        console.error("❌ Errore assegnazione:", errorMessage);
        alert("⚠️ " + errorMessage);
      }
    } catch (error) {
      console.error("Errore:", error);
      alert("⚠️ Errore di connessione. Riprova.");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveOperator = async (cleaningId: string, operatorId: string) => {
    // 🔒 Blocca modifiche a pulizie completate
    const cleaning = cleanings.find(c => c.id === cleaningId);
    if (cleaning?.status?.toLowerCase() === 'completed') {
      alert("⚠️ Non puoi modificare una pulizia completata");
      return;
    }
    
    try {
      await fetch('/api/dashboard/cleanings/' + cleaningId + '/assign', {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId })
      });
      setCleaningOperators(prev => ({
        ...prev,
        [cleaningId]: (prev[cleaningId] || []).filter(o => o.id !== operatorId)
      }));
      // 🔥 RIMOSSO router.refresh() - lo stato locale è già aggiornato!
    } catch (error) {
      console.error("Errore:", error);
    }
  };

  const handleTimeClick = (cleaning: Cleaning) => {
    // 🔒 Blocca modifiche a pulizie completate
    if (cleaning.status?.toLowerCase() === 'completed') {
      return;
    }
    setEditingTimeId(cleaning.id);
    setEditingTime(cleaning.scheduledTime || "10:00");
  };

  const handleTimeSave = async (cleaningId: string) => {
    // 🔒 Blocca modifiche a pulizie completate
    const cleaning = cleanings.find(c => c.id === cleaningId);
    if (cleaning?.status?.toLowerCase() === 'completed') {
      setEditingTimeId(null);
      return;
    }
    
    try {
      // 🔥 AGGIORNA STATO LOCALE (non perde gli operatori!)
      setCleanings(prev => prev.map(c => 
        c.id === cleaningId ? { ...c, scheduledTime: editingTime } : c
      ));
      setEditingTimeId(null);
      
      // Salva su server in background
      await fetch('/api/dashboard/cleanings/' + cleaningId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledTime: editingTime })
      });
    } catch (error) {
      console.error("Errore:", error);
    }
  };

  const handleGuestsClick = (cleaning: Cleaning) => {
    // 🔒 Blocca modifiche a pulizie completate
    if (cleaning.status?.toLowerCase() === 'completed') {
      return;
    }
    setEditingGuestsId(cleaning.id);
    setEditingGuests(String(cleaning.guestsCount || cleaning.booking?.guestsCount || 2));
  };

  const handleGuestsSave = async (cleaningId: string) => {
    // 🔒 Blocca modifiche a pulizie completate
    const cleaning = cleanings.find(c => c.id === cleaningId);
    if (cleaning?.status?.toLowerCase() === 'completed') {
      setEditingGuestsId(null);
      return;
    }
    
    try {
      const guestsNum = parseInt(editingGuests) || 2;
      
      // 🔥 AGGIORNA STATO LOCALE (non perde gli operatori!)
      setCleanings(prev => prev.map(c => 
        c.id === cleaningId ? { ...c, guestsCount: guestsNum } : c
      ));
      setEditingGuestsId(null);
      
      // Salva su server in background
      await fetch('/api/dashboard/cleanings/' + cleaningId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestsCount: guestsNum })
      });
    } catch (error) {
      console.error("Errore:", error);
    }
  };

  const getAvailableOperators = (cleaningId: string) => {
    const assigned = cleaningOperators[cleaningId] || [];
    const assignedIds = assigned.map(o => o.id);
    // 🔥 FIX: Escludi operatori già assegnati + filtra undefined
    return operators.filter(o => 
      !assignedIds.includes(o.id) && 
      o.name && 
      o.name.trim() !== '' && 
      o.name !== 'undefined'
    );
  };

  // Mobile handlers
  const mobileCloseAll = () => {
    setShowMobileTimePicker(false);
    setShowMobileOperatorPicker(false);
    setShowMobileGuestsPicker(false);
    setShowMobileDeleteConfirm(false);
    document.body.classList.remove('mobile-modal-open');
    document.body.style.top = '';
    window.scrollTo(0, mobileScrollYRef.current);
  };

  const mobileLockScroll = () => {
    mobileScrollYRef.current = window.scrollY;
    document.body.classList.add('mobile-modal-open');
    document.body.style.top = '-' + mobileScrollYRef.current + 'px';
  };

  // Funzioni per cancellazione operatore con conferma
  const mobileOpenDeleteConfirm = (cleaningId: string, operator: Operator) => {
    setDeleteOperatorData({ cleaningId, operator });
    mobileLockScroll();
    setShowMobileDeleteConfirm(true);
  };

  const mobileConfirmDelete = async () => {
    if (!deleteOperatorData) return;
    const { cleaningId, operator } = deleteOperatorData;
    
    // Rimuovi localmente
    setCleaningOperators(prev => ({
      ...prev,
      [cleaningId]: (prev[cleaningId] || []).filter(o => o.id !== operator.id)
    }));
    
    mobileCloseAll();
    mobileShowToast(getShortName(operator.name) + ' rimosso');
    
    // Rimuovi dal server
    try {
      await fetch('/api/dashboard/cleanings/' + cleaningId + '/assign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId: operator.id }),
      });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const mobileShowToast = (message: string) => {
    setMobileToast({ show: false, message: "" });
    requestAnimationFrame(() => setMobileToast({ show: true, message }));
    setTimeout(() => setMobileToast({ show: false, message: "" }), 1100);
  };

  const mobileOpenTimePicker = (cardId: string) => {
    const cleaning = cleanings.find(c => c.id === cardId);
    if (!cleaning) return;
    // 🔒 Blocca modifiche a pulizie completate
    if (cleaning.status?.toLowerCase() === 'completed') {
      mobileShowToast('⚠️ Non puoi modificare una pulizia completata');
      return;
    }
    setMobileCurrentCardId(cardId);
    const time = cleaning.scheduledTime || '10:00';
    const parts = time.split(':');
    setMobileCurrentHour(parseInt(parts[0]));
    setMobileCurrentMin(parseInt(parts[1]));
    mobileLockScroll();
    setShowMobileTimePicker(true);
    setTimeout(() => {
      if (hourScrollRef.current) hourScrollRef.current.scrollTop = (parseInt(parts[0]) - 6) * ITEM_HEIGHT;
      if (minScrollRef.current) minScrollRef.current.scrollTop = (parseInt(parts[1]) / 5) * ITEM_HEIGHT;
    }, 100);
  };

  const handleMobileHourScroll = () => {
    if (!hourScrollRef.current) return;
    if (hourTimeoutRef.current) clearTimeout(hourTimeoutRef.current);
    
    const scrollTop = hourScrollRef.current.scrollTop;
    const currentIndex = Math.round(scrollTop / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(currentIndex, HOURS.length - 1));
    const newHour = parseInt(HOURS[clampedIndex] || '10');
    
    // Update immediately for display
    if (newHour !== mobileCurrentHour) {
      setMobileCurrentHour(newHour);
    }
    
    // Debounce snap
    hourTimeoutRef.current = setTimeout(() => {
      if (!hourScrollRef.current) return;
      const finalIndex = Math.round(hourScrollRef.current.scrollTop / ITEM_HEIGHT);
      const clampedFinal = Math.max(0, Math.min(finalIndex, HOURS.length - 1));
      hourScrollRef.current.scrollTo({ top: clampedFinal * ITEM_HEIGHT, behavior: 'smooth' });
      setMobileCurrentHour(parseInt(HOURS[clampedFinal] || '10'));
    }, 80);
  };

  const handleMobileMinScroll = () => {
    if (!minScrollRef.current) return;
    if (minTimeoutRef.current) clearTimeout(minTimeoutRef.current);
    
    const scrollTop = minScrollRef.current.scrollTop;
    const currentIndex = Math.round(scrollTop / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(currentIndex, MINUTES.length - 1));
    const newMin = parseInt(MINUTES[clampedIndex] || '00');
    
    // Update immediately for display
    if (newMin !== mobileCurrentMin) {
      setMobileCurrentMin(newMin);
    }
    
    // Debounce snap
    minTimeoutRef.current = setTimeout(() => {
      if (!minScrollRef.current) return;
      const finalIndex = Math.round(minScrollRef.current.scrollTop / ITEM_HEIGHT);
      const clampedFinal = Math.max(0, Math.min(finalIndex, MINUTES.length - 1));
      minScrollRef.current.scrollTo({ top: clampedFinal * ITEM_HEIGHT, behavior: 'smooth' });
      setMobileCurrentMin(parseInt(MINUTES[clampedFinal] || '00'));
    }, 80);
  };

  const mobileReorderCards = (changedCardId: string) => {
    // Flash the changed card (Framer Motion handles the reordering animation)
    setTimeout(() => {
      const container = mobileCardsRef.current;
      if (!container) return;
      const card = container.querySelector('[data-id="' + changedCardId + '"]') as HTMLElement;
      if (card) {
        card.classList.add('mobile-card-flash');
        setTimeout(() => card.classList.remove('mobile-card-flash'), 600);
      }
    }, 100);
  };

  const mobileConfirmTime = async () => {
    if (!mobileCurrentCardId) return;
    
    // Read current scroll position to get exact values
    let finalHour = mobileCurrentHour;
    let finalMin = mobileCurrentMin;
    
    if (hourScrollRef.current) {
      const hourIndex = Math.round(hourScrollRef.current.scrollTop / ITEM_HEIGHT);
      const clampedHourIndex = Math.max(0, Math.min(hourIndex, HOURS.length - 1));
      finalHour = parseInt(HOURS[clampedHourIndex] || '10');
    }
    
    if (minScrollRef.current) {
      const minIndex = Math.round(minScrollRef.current.scrollTop / ITEM_HEIGHT);
      const clampedMinIndex = Math.max(0, Math.min(minIndex, MINUTES.length - 1));
      finalMin = parseInt(MINUTES[clampedMinIndex] || '00');
    }
    
    const timeStr = finalHour.toString().padStart(2, '0') + ':' + finalMin.toString().padStart(2, '0');
    
    // Store card id before closing
    const cardId = mobileCurrentCardId;
    
    // Update state
    setCleanings(prev => prev.map(c => c.id === cardId ? { ...c, scheduledTime: timeStr } : c));
    
    mobileCloseAll();
    mobileShowToast('Orario: ' + timeStr);
    
    // Reorder after state update
    setTimeout(() => mobileReorderCards(cardId), 300);
    
    try {
      await fetch('/api/dashboard/cleanings/' + cardId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledTime: timeStr }),
      });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const mobileOpenOperatorPicker = (cardId: string) => {
    // 🔒 Blocca modifiche a pulizie completate
    const cleaning = cleanings.find(c => c.id === cardId);
    if (cleaning?.status?.toLowerCase() === 'completed') {
      mobileShowToast('⚠️ Non puoi modificare una pulizia completata');
      return;
    }
    setMobileCurrentCardId(cardId);
    setMobileOperatorSearch('');
    mobileLockScroll();
    setShowMobileOperatorPicker(true);
  };

  const mobileSelectOperator = async (operator: Operator) => {
    if (!mobileCurrentCardId) return;
    
    // 🔒 Blocca modifiche a pulizie completate
    const cleaning = cleanings.find(c => c.id === mobileCurrentCardId);
    if (cleaning?.status?.toLowerCase() === 'completed') {
      mobileShowToast('⚠️ Non puoi modificare una pulizia completata');
      mobileCloseAll();
      return;
    }
    
    // 🔥 FIX: Non fare aggiornamento ottimistico - il listener realtime aggiornerà automaticamente
    mobileCloseAll();
    
    try {
      const response = await fetch('/api/dashboard/cleanings/' + mobileCurrentCardId + '/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId: operator.id }),
      });
      
      if (response.ok) {
        mobileShowToast(getShortName(operator.name) + ' assegnato');
      } else {
        const errorData = await response.json().catch(() => ({}));
        mobileShowToast('⚠️ ' + (errorData.error || 'Errore assegnazione'));
      }
    } catch (error) {
      console.error('Error:', error);
      mobileShowToast('⚠️ Errore di connessione');
    }
  };

  const mobileOpenGuestsPicker = (cardId: string) => {
    const cleaning = cleanings.find(c => c.id === cardId);
    if (!cleaning) return;
    // 🔒 Blocca modifiche a pulizie completate
    if (cleaning.status?.toLowerCase() === 'completed') {
      mobileShowToast('⚠️ Non puoi modificare una pulizia completata');
      return;
    }
    setMobileCurrentCardId(cardId);
    setMobileGuestsData({ adults: cleaning.guestsCount || cleaning.booking?.guestsCount || 2, infants: 0 });
    mobileLockScroll();
    setShowMobileGuestsPicker(true);
  };

  const mobileChangeGuests = (type: string, delta: number) => {
    // Trova la pulizia corrente per ottenere maxGuests
    const currentCleaning = cleanings.find(c => c.id === mobileCurrentCardId);
    const maxGuests = currentCleaning?.property?.maxGuests || 6; // 🔧 Fallback ridotto
    
    setMobileGuestsData(prev => ({
      ...prev,
      [type]: type === 'adults' 
        ? Math.max(1, Math.min(maxGuests, prev.adults + delta)) // Usa maxGuests della proprietà
        : Math.max(0, Math.min(5, prev.infants + delta))
    }));
  };

  const mobileConfirmGuests = async () => {
    if (!mobileCurrentCardId) return;
    
    // 🆕 Trova la pulizia corrente per controllare biancheria personalizzata
    const currentCleaning = cleanings.find(c => c.id === mobileCurrentCardId);
    const total = mobileGuestsData.adults + mobileGuestsData.infants;
    const oldGuestsCount = currentCleaning?.guestsCount || 2;
    
    // 🆕 Controlla se ha biancheria personalizzata E il numero ospiti è cambiato
    const hasCustomConfig = currentCleaning?.linenConfigModified || 
      (currentCleaning?.customLinenConfig && Object.keys(currentCleaning?.customLinenConfig?.bl || {}).length > 0);
    
    if (hasCustomConfig && total !== oldGuestsCount) {
      // Mostra modal di conferma
      setPendingGuestChange({ adults: mobileGuestsData.adults, infants: mobileGuestsData.infants });
      setShowLinenConfirmModal(true);
      return;
    }
    
    // Salva direttamente se non c'è biancheria personalizzata
    await saveGuestsDirectly(total, false);
  };

  // 🆕 Funzione per salvare ospiti con opzione di reset biancheria
  const saveGuestsDirectly = async (total: number, resetLinen: boolean) => {
    if (!mobileCurrentCardId) return;
    
    setSavingGuests(true);
    setCleanings(prev => prev.map(c => c.id === mobileCurrentCardId ? { ...c, guestsCount: total } : c));
    let msg = total + ' ospiti';
    if (mobileGuestsData.infants > 0) msg += ' (+' + mobileGuestsData.infants + ' neonati)';
    mobileCloseAll();
    setShowLinenConfirmModal(false);
    setPendingGuestChange(null);
    mobileShowToast(msg);
    
    try {
      const updateData: any = { guestsCount: total };
      if (resetLinen) {
        updateData.linenConfigModified = false;
      }
      
      await fetch('/api/dashboard/cleanings/' + mobileCurrentCardId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setSavingGuests(false);
    }
  };

  // 🆕 Handler per "Usa standard" dalla modal conferma biancheria
  const handleLinenUseStandard = () => {
    if (!pendingGuestChange) return;
    const total = pendingGuestChange.adults + pendingGuestChange.infants;
    saveGuestsDirectly(total, true);
  };

  // 🆕 Handler per "Mantieni personalizzata" dalla modal conferma biancheria
  const handleLinenKeepCustom = () => {
    if (!pendingGuestChange) return;
    const total = pendingGuestChange.adults + pendingGuestChange.infants;
    saveGuestsDirectly(total, false);
  };

  // Mobile computed values
  const mobileStats = {
    todo: cleanings.filter(c => mapStatus(c.status) === 'todo').length,
    inprogress: cleanings.filter(c => mapStatus(c.status) === 'inprogress').length,
    done: cleanings.filter(c => mapStatus(c.status) === 'done').length,
    totalEarnings: cleanings.reduce((sum, c) => sum + (c.price || c.contractPrice || 0), 0),
  };

  const mobileSortedCleanings = [...cleanings].sort((a, b) => {
    const statusOrder: Record<string, number> = { todo: 0, inprogress: 1, done: 2 };
    const statusA = statusOrder[mapStatus(a.status)] || 0;
    const statusB = statusOrder[mapStatus(b.status)] || 0;
    if (statusA !== statusB) return statusA - statusB;
    return (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00');
  });

  const statusFilteredCleanings = statusFilter 
    ? mobileSortedCleanings.filter(c => mapStatus(c.status) === statusFilter)
    : mobileSortedCleanings;

  // 🔥 FIX: Escludi operatori già assegnati + filtra undefined
  const statusFilteredOperators = operators.filter(op => {
    // Escludi operatori senza nome o con nome vuoto
    if (!op.name || op.name.trim() === '' || op.name === 'undefined') return false;
    
    // Filtra per ricerca
    if (mobileOperatorSearch && !(op.name || '').toLowerCase().includes(mobileOperatorSearch.toLowerCase())) {
      return false;
    }
    
    // Escludi operatori già assegnati a questa pulizia
    if (mobileCurrentCardId) {
      const assigned = cleaningOperators[mobileCurrentCardId] || [];
      if (assigned.some(a => a.id === op.id)) return false;
    }
    
    return true;
  });

  const { day, month, year } = {
    day: selectedDate.getDate(),
    month: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'][selectedDate.getMonth()],
    year: selectedDate.getFullYear()
  };

  // =====================================================
  // MOBILE LAYOUT
  // =====================================================
  
  // Calcola stats consegne per il banner
  const deliveryStats = {
    pending: orders.filter(o => o.status === 'PENDING').length,
    picking: orders.filter(o => o.status === 'PICKING').length,
    inTransit: orders.filter(o => o.status === 'IN_TRANSIT').length,
    delivered: orders.filter(o => o.status === 'DELIVERED').length,
    total: orders.length,
    urgent: orders.filter(o => o.urgency === 'urgent' && o.status !== 'DELIVERED').length,
    totalItems: orders.reduce((sum, o) => sum + (o.items?.reduce((s, i) => s + i.quantity, 0) || 0), 0),
  };

  if (isMobile) {
    return (
      <>
        {/* ═══════════════════════════════════════════════════════════════
            BANNER STATICO - Dimensione FISSA, cambia solo contenuto
        ═══════════════════════════════════════════════════════════════ */}
        <div className={`rounded-3xl p-4 mb-4 shadow-xl h-[200px] transition-colors duration-300 ${
          activeTab === "cleanings" 
            ? "bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600" 
            : "bg-gradient-to-br from-orange-500 via-red-500 to-rose-600"
        }`}>
          {activeTab === "cleanings" ? (
            /* ══════════ CONTENUTO BANNER PULIZIE ══════════ */
            <div className="h-full flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-white/70 text-xs font-medium mb-1">Guadagno di oggi</p>
                  <p className="text-4xl font-black text-white">€ {mobileStats.totalEarnings}</p>
                </div>
                <div className="inline-flex items-center gap-1 bg-white/20 rounded-full px-2.5 py-1">
                  <svg className="w-3.5 h-3.5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18"/>
                  </svg>
                  <span className="text-xs font-bold text-white">+15%</span>
                </div>
              </div>
              
              <div className="flex items-center gap-4 mb-3 pb-3 border-b border-white/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-300"></div>
                  <span className="text-xs text-white/80">Pulizie: <span className="font-bold text-white">€{Math.round(mobileStats.totalEarnings * 0.7)}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-violet-300"></div>
                  <span className="text-xs text-white/80">Biancheria: <span className="font-bold text-white">€{Math.round(mobileStats.totalEarnings * 0.3)}</span></span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 flex-1">
                <button onClick={() => setStatusFilter(statusFilter === 'todo' ? null : 'todo')} className={'bg-white/20 rounded-2xl p-2 text-center transition-all flex flex-col items-center justify-center' + (statusFilter === 'todo' ? ' ring-2 ring-white/50' : '')}>
                  <p className="text-2xl font-black text-white">{mobileStats.todo}</p>
                  <p className="text-[10px] font-medium text-white/80">Da fare</p>
                </button>
                <button onClick={() => setStatusFilter(statusFilter === 'inprogress' ? null : 'inprogress')} className={'bg-white/20 rounded-2xl p-2 text-center transition-all flex flex-col items-center justify-center' + (statusFilter === 'inprogress' ? ' ring-2 ring-white/50' : '')}>
                  <p className="text-2xl font-black text-white">{mobileStats.inprogress}</p>
                  <p className="text-[10px] font-medium text-white/80">In corso</p>
                </button>
                <button onClick={() => setStatusFilter(statusFilter === 'done' ? null : 'done')} className={'bg-white/20 rounded-2xl p-2 text-center transition-all flex flex-col items-center justify-center' + (statusFilter === 'done' ? ' ring-2 ring-white/50' : '')}>
                  <p className="text-2xl font-black text-emerald-300">{mobileStats.done}</p>
                  <p className="text-[10px] font-medium text-white/80">Completate</p>
                </button>
              </div>
            </div>
          ) : (
            /* ══════════ CONTENUTO BANNER CONSEGNE ══════════ */
            <div className="h-full flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-white/70 text-xs font-medium mb-1">Consegne di oggi</p>
                  <p className="text-4xl font-black text-white">{deliveryStats.total}</p>
                </div>
                {deliveryStats.urgent > 0 ? (
                  <div className="inline-flex items-center gap-1 bg-white/20 rounded-full px-2.5 py-1 animate-pulse">
                    <span className="text-lg">🚨</span>
                    <span className="text-xs font-bold text-white">{deliveryStats.urgent} urgenti</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1 bg-white/20 rounded-full px-2.5 py-1">
                    <span className="text-xs font-bold text-white">📦 {deliveryStats.totalItems} articoli</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-4 mb-3 pb-3 border-b border-white/20">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-300"></div>
                  <span className="text-xs text-white/80">Articoli: <span className="font-bold text-white">{deliveryStats.totalItems}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-300"></div>
                  <span className="text-xs text-white/80">Completate: <span className="font-bold text-white">{deliveryStats.delivered}</span></span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 flex-1">
                <div className="bg-white/20 rounded-2xl p-2 text-center flex flex-col items-center justify-center">
                  <p className="text-2xl font-black text-white">{deliveryStats.pending}</p>
                  <p className="text-[10px] font-medium text-white/80">In attesa</p>
                </div>
                <div className="bg-white/20 rounded-2xl p-2 text-center flex flex-col items-center justify-center">
                  <p className="text-2xl font-black text-amber-300">{deliveryStats.picking + deliveryStats.inTransit}</p>
                  <p className="text-[10px] font-medium text-white/80">In corso</p>
                </div>
                <div className="bg-white/20 rounded-2xl p-2 text-center flex flex-col items-center justify-center">
                  <p className="text-2xl font-black text-emerald-300">{deliveryStats.delivered}</p>
                  <p className="text-[10px] font-medium text-white/80">Consegnate</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            TAB SWITCH - sotto il banner
        ═══════════════════════════════════════════════════════════════ */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("cleanings")}
            className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all ${
              activeTab === "cleanings"
                ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-purple-500/30"
                : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Pulizie
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === "cleanings" ? "bg-white/20" : "bg-slate-100"}`}>
                {cleanings.length}
              </span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab("deliveries")}
            className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all ${
              activeTab === "deliveries"
                ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30"
                : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Consegne
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === "deliveries" ? "bg-white/20" : "bg-slate-100"}`}>
                {orders.length}
              </span>
            </span>
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            CONTENUTO TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "deliveries" ? (
          <DeliveriesView
            orders={orders}
            riders={riders}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onOrdersUpdate={() => {}}
          />
        ) : (
          <>

        {/* Date Navigator */}
        <div className="bg-white rounded-xl px-3 py-2 mb-3 flex items-center justify-between border border-slate-100 shadow-sm">
          <button onClick={goToPreviousDay} className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-50 border border-slate-100">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="text-center flex items-center gap-2">
            <p className="text-base font-black text-slate-800">{day}</p>
            <p className="text-xs font-medium text-slate-400">{month} {year}</p>
          </div>
          <button onClick={goToNextDay} className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-50 border border-slate-100">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        {/* List Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-800">
            {statusFilter === 'todo' ? 'Da fare' : statusFilter === 'inprogress' ? 'In corso' : statusFilter === 'done' ? 'Completate' : 'Tutte le pulizie'}
          </h2>
          <span className="text-xs text-slate-400">{statusFilteredCleanings.length} attività</span>
        </div>

        {/* Cards */}
        <LayoutGroup>
        <div className="space-y-3" ref={mobileCardsRef}>
          {loadingCleanings ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-slate-500 text-sm">Caricamento...</p>
            </div>
          ) : statusFilteredCleanings.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
              <p className="text-slate-500">Nessuna pulizia per oggi</p>
            </div>
          ) : statusFilteredCleanings.map((cleaning) => {
            const status = mapStatus(cleaning.status);
            const isDone = status === 'done';
            const isInProgress = status === 'inprogress';
            const assignedOps = cleaningOperators[cleaning.id] || [];

            return (
              <motion.div 
                key={cleaning.id}
                layoutId={cleaning.id}
                layout
                initial={false}
                transition={{
                  layout: {
                    type: "spring",
                    stiffness: 120,
                    damping: 20,
                    mass: 1
                  }
                }}
                className={'mobile-card-item bg-white rounded-2xl overflow-hidden shadow-sm' + (isDone ? ' border border-emerald-200 opacity-70' : isInProgress ? ' border-2 border-sky-300' : ' border border-slate-100')}
                data-status={status}
                data-time={cleaning.scheduledTime}
                data-id={cleaning.id}
              >
                <div className="flex">
                  {/* Image - compact */}
                  <div className="w-24 h-28 flex-shrink-0 relative">
                    {cleaning.property.imageUrl ? (
                      <img src={cleaning.property.imageUrl} className="w-full h-full object-cover" alt=""/>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                    )}
                    {isDone && <div className="absolute inset-0 bg-emerald-500/20"></div>}
                    {/* Badge SCADUTA per pulizie non completate con missedDeadline */}
                    {!isDone && cleaning.missedDeadline && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded-lg animate-pulse">
                        ⚠️ SCADUTA
                      </div>
                    )}
                    <div className={'absolute top-2 left-2 px-2 py-1 text-white text-[10px] font-bold rounded-lg' + (isDone ? ' bg-emerald-500' : isInProgress ? ' bg-sky-500 flex items-center gap-1' : ' bg-amber-500')}>
                      {isInProgress && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>}
                      {isDone ? '✓ FATTO' : isInProgress ? 'IN CORSO' : 'IN ATTESA'}
                    </div>
                  </div>
                  
                  {/* Content - compact */}
                  <div className="flex-1 p-3 min-w-0">
                    <h3 className="font-bold text-slate-800 text-sm mb-0.5 truncate">{cleaning.property.name}</h3>
                    <p className="text-[11px] text-slate-400 mb-2 truncate">{cleaning.property.address}</p>
                    
                    {/* Time & Guests buttons */}
                    <div className="flex items-center gap-2 mb-2">
                      {isDone ? (
                        <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-xs font-semibold">
                          {cleaning.scheduledTime || '10:00'}
                        </div>
                      ) : (
                        <button onClick={() => mobileOpenTimePicker(cleaning.id)} className="flex items-center gap-1 text-sky-600 bg-sky-50 border border-sky-100 px-2 py-1 rounded-full">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                          <span className="text-xs font-semibold">{cleaning.scheduledTime || '10:00'}</span>
                        </button>
                      )}
                      
                      {isDone ? (
                        <div className="flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-1 rounded-full text-xs font-semibold">
                          {cleaning.guestsCount || cleaning.booking?.guestsCount || 2}
                        </div>
                      ) : (
                        <button onClick={() => mobileOpenGuestsPicker(cleaning.id)} className="flex items-center gap-1 text-violet-600 bg-violet-50 border border-violet-100 px-2 py-1 rounded-full">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                          </svg>
                          <span className="text-xs font-semibold">{cleaning.guestsCount || cleaning.booking?.guestsCount || 2}</span>
                        </button>
                      )}
                    </div>
                    
                    {/* Operators */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {assignedOps.map((op) => (
                        <span key={op.id} className="inline-flex items-center gap-1 text-white bg-emerald-500 pl-1.5 pr-1 py-0.5 rounded-full text-[10px] font-semibold">
                          {getInitials(op.name)}
                          <span>{getShortName(op.name)}</span>
                          {!isDone && !isInProgress && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); mobileOpenDeleteConfirm(cleaning.id, op); }}
                              className="w-4 h-4 rounded-full bg-white/30 hover:bg-white/50 flex items-center justify-center ml-0.5"
                            >
                              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            </button>
                          )}
                        </span>
                      ))}
                      {!isDone && !isInProgress && (
                        <button onClick={() => mobileOpenOperatorPicker(cleaning.id)} className="w-6 h-6 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Freccia per aprire modal dettaglio */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDetailCleaning({
                        ...cleaning,
                        propertyId: cleaning.property.id,
                        propertyName: cleaning.property.name,
                        propertyAddress: cleaning.property.address,
                        scheduledDate: cleaning.date,
                      });
                      setShowDetailModal(true);
                    }}
                    className="pr-2 pl-2 flex items-center justify-center min-w-[44px] min-h-[44px]"
                  >
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
        </LayoutGroup>

        {/* Mobile Modals */}
        {(showMobileTimePicker || showMobileOperatorPicker || showMobileGuestsPicker || showMobileDeleteConfirm) && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={mobileCloseAll}/>
        )}

        {/* Delete Confirmation Modal */}
        {showMobileDeleteConfirm && deleteOperatorData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header con icona */}
              <div className="bg-gradient-to-br from-red-500 to-rose-600 px-6 py-8 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Rimuovi Operatore</h3>
                <p className="text-white/80 text-sm">Questa azione non può essere annullata</p>
              </div>
              
              {/* Content */}
              <div className="p-6">
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl mb-6">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                    {getInitials(deleteOperatorData.operator.name)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{deleteOperatorData.operator.name}</p>
                    <p className="text-sm text-slate-500">Verrà rimosso da questa pulizia</p>
                  </div>
                </div>
                
                {/* Buttons */}
                <div className="flex gap-3">
                  <button 
                    onClick={mobileCloseAll}
                    className="flex-1 py-3.5 px-4 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors"
                  >
                    Annulla
                  </button>
                  <button 
                    onClick={mobileConfirmDelete}
                    className="flex-1 py-3.5 px-4 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-semibold text-sm hover:from-red-600 hover:to-rose-700 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                    Rimuovi
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast - renderizza solo quando attivo */}
        {mobileToast.show && (
        <div className={'mobile-success-toast active'}>
          <div className="flex items-center gap-2.5 bg-white px-4 py-3 rounded-full shadow-xl">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-700">{mobileToast.message}</span>
          </div>
        </div>
        )}

        {/* Time Picker Modal */}
        {showMobileTimePicker && (
        <div className="mobile-picker-modal active shadow-2xl" style={{ transform: 'translateY(0)' }}>
          <div className="p-6 pb-8">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6"></div>
            <p className="text-center text-sm text-slate-400 mb-2">Seleziona orario</p>
            <div className="text-center mb-8">
              <span className="inline-block text-6xl font-extrabold text-slate-800 tracking-tight">
                {mobileCurrentHour.toString().padStart(2, '0')}:{mobileCurrentMin.toString().padStart(2, '0')}
              </span>
            </div>
            
            <div className="flex items-center justify-center gap-2 mb-8">
              <div className="relative w-24">
                <div className="mobile-selection-indicator"></div>
                <div ref={hourScrollRef} className="mobile-time-scroll" onScroll={handleMobileHourScroll}>
                  <div style={{height: 60}}></div>
                  {HOURS.map((hour, idx) => (
                    <div key={hour} className={'mobile-time-item' + (parseInt(hour) === mobileCurrentHour ? ' active' : '')} onClick={() => hourScrollRef.current?.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' })}>{hour}</div>
                  ))}
                  <div style={{height: 60}}></div>
                </div>
              </div>
              <span className="text-4xl font-bold text-slate-300 mx-2">:</span>
              <div className="relative w-24">
                <div className="mobile-selection-indicator"></div>
                <div ref={minScrollRef} className="mobile-time-scroll" onScroll={handleMobileMinScroll}>
                  <div style={{height: 60}}></div>
                  {MINUTES.map((min, idx) => (
                    <div key={min} className={'mobile-time-item' + (parseInt(min) === mobileCurrentMin ? ' active' : '')} onClick={() => minScrollRef.current?.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' })}>{min}</div>
                  ))}
                  <div style={{height: 60}}></div>
                </div>
              </div>
            </div>
            
            <button onClick={mobileConfirmTime} className="w-full py-4 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-2xl font-bold text-lg active:scale-[0.98] transition-transform shadow-lg">Conferma</button>
          </div>
        </div>
        )}

        {/* Operator Picker Modal */}
        {showMobileOperatorPicker && (
        <div className="mobile-picker-modal active shadow-2xl" style={{ maxHeight: '50vh', transform: 'translateY(0)' }}>
          <div className="p-5 pb-6">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
            <h3 className="text-base font-bold text-slate-800 mb-4">Seleziona operatore</h3>
            <div className="relative mb-4">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input type="text" value={mobileOperatorSearch} onChange={(e) => setMobileOperatorSearch(e.target.value)} placeholder="Cerca operatore..." className="w-full pl-10 pr-4 py-3 bg-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-500"/>
            </div>
            <div className="space-y-2 max-h-[30vh] overflow-y-auto">
              {statusFilteredOperators.map((operator, index) => (
                <button key={operator.id} onClick={() => mobileSelectOperator(operator)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 active:bg-slate-100">
                  <div className={'w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold ' + operatorColors[index % operatorColors.length]}>{(operator.name || '?')[0]}</div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-slate-800">{operator.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        )}

        {/* Guests Picker Modal */}
        {showMobileGuestsPicker && (() => {
          // Calcola maxGuests della pulizia corrente
          const currentCleaningForGuests = cleanings.find(c => c.id === mobileCurrentCardId);
          const currentMaxGuests = currentCleaningForGuests?.property?.maxGuests || 6;
          
          return (
        <div className="mobile-picker-modal active shadow-2xl" style={{ transform: 'translateY(0)' }}>
          <div className="p-5 pb-6">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5"></div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Numero ospiti</h3>
              <button onClick={() => setMobileGuestsData({ adults: 1, infants: 0 })} className="text-sm text-slate-400">Reset</button>
            </div>
            
            {/* Adults */}
            <div className="flex items-center justify-between py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Adulti</p>
                  <p className="text-xs text-slate-400">Max {currentMaxGuests}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => mobileChangeGuests('adults', -1)} disabled={mobileGuestsData.adults <= 1} className="w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 12H4"/></svg>
                </button>
                <span className="text-xl font-bold text-slate-800 w-8 text-center">{mobileGuestsData.adults}</span>
                <button onClick={() => mobileChangeGuests('adults', 1)} disabled={mobileGuestsData.adults >= currentMaxGuests} className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white disabled:opacity-30">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
                </button>
              </div>
            </div>
            
            {/* Infants */}
            <div className="flex items-center justify-between py-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-rose-300" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="3"/><path d="M12 11c-2 0-4 1.5-4 3v4h8v-4c0-1.5-2-3-4-3z"/></svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Neonati</p>
                  <p className="text-xs text-slate-400">0-2 anni</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => mobileChangeGuests('infants', -1)} disabled={mobileGuestsData.infants <= 0} className="w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 12H4"/></svg>
                </button>
                <span className="text-xl font-bold text-slate-800 w-8 text-center">{mobileGuestsData.infants}</span>
                <button onClick={() => mobileChangeGuests('infants', 1)} className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
                </button>
              </div>
            </div>
            
            {/* Totale */}
            <div className="bg-slate-50 rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Totale ospiti</span>
                <span className="text-lg font-bold text-slate-800">{mobileGuestsData.adults + mobileGuestsData.infants}</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button onClick={mobileCloseAll} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-semibold">Annulla</button>
              <button onClick={mobileConfirmGuests} className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-semibold">Conferma</button>
            </div>
          </div>
        </div>
          );
        })()}
        </>
        )}

        {/* 🆕 Modal Conferma Biancheria Personalizzata */}
        {showLinenConfirmModal && mobileCurrentCardId && pendingGuestChange && (() => {
          const currentCleaning = cleanings.find(c => c.id === mobileCurrentCardId);
          return (
            <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-sky-500 to-blue-500 p-5 text-center">
                  <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white">Biancheria personalizzata</h3>
                </div>
                
                {/* Content */}
                <div className="p-5">
                  <div className="bg-slate-50 rounded-xl p-4 mb-4">
                    <p className="text-sm text-slate-700 text-center">
                      Hai modificato la biancheria per <strong>{currentCleaning?.guestsCount || 2} ospiti</strong>.
                    </p>
                    <p className="text-sm text-slate-600 text-center mt-2">
                      Vuoi usare la biancheria <strong>standard</strong> per <strong>{pendingGuestChange.adults + pendingGuestChange.infants} ospiti</strong> o <strong>mantenere</strong> la tua personalizzazione?
                    </p>
                  </div>
                  
                  {/* Bottoni */}
                  <div className="space-y-2">
                    <button
                      onClick={handleLinenUseStandard}
                      disabled={savingGuests}
                      className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {savingGuests ? "Salvo..." : `Usa standard per ${pendingGuestChange.adults + pendingGuestChange.infants} ospiti`}
                    </button>
                    
                    <button
                      onClick={handleLinenKeepCustom}
                      disabled={savingGuests}
                      className="w-full py-3 bg-white border-2 border-sky-500 text-sky-600 font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Mantieni personalizzata
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowLinenConfirmModal(false);
                        setPendingGuestChange(null);
                      }}
                      disabled={savingGuests}
                      className="w-full py-3 text-slate-500 font-medium"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal Modifica Pulizia - MOBILE */}
        {showDetailModal && detailCleaning && (
          <EditCleaningModal
            isOpen={showDetailModal}
            onClose={() => {
              setShowDetailModal(false);
              setDetailCleaning(null);
            }}
            cleaning={{
              id: detailCleaning.id,
              propertyId: detailCleaning.property?.id || "",
              propertyName: detailCleaning.property?.name || "",
              date: typeof detailCleaning.date === 'string' ? new Date(detailCleaning.date) : detailCleaning.date,
              scheduledTime: detailCleaning.scheduledTime || "10:00",
              status: detailCleaning.status,
              guestsCount: detailCleaning.guestsCount || 2,
              notes: detailCleaning.notes || "",
              price: detailCleaning.price,
              serviceType: detailCleaning.serviceType,
              serviceTypeName: detailCleaning.serviceTypeName,
              contractPrice: detailCleaning.contractPrice,
              priceModified: detailCleaning.priceModified,
              priceChangeReason: detailCleaning.priceChangeReason,
              sgrossoReason: detailCleaning.sgrossoReason as any,
              sgrossoReasonLabel: detailCleaning.sgrossoReasonLabel,
              sgrossoNotes: detailCleaning.sgrossoNotes,
              // Campi per pulizie completate
              photos: detailCleaning.photos,
              startedAt: detailCleaning.startedAt,
              completedAt: detailCleaning.completedAt,
              // Campi per valutazione
              ratingScore: detailCleaning.ratingScore,
              ratingId: detailCleaning.ratingId,
              extraServices: detailCleaning.extraServices,
              // 🔧 FIX: Passa customLinenConfig
              customLinenConfig: detailCleaning.customLinenConfig,
            }}
            property={{
              id: detailCleaning.property?.id || "",
              name: detailCleaning.property?.name || "",
              address: detailCleaning.property?.address || "",
              maxGuests: detailCleaning.property?.maxGuests || 6, // 🔧 Fallback ridotto
              cleaningPrice: detailCleaning.contractPrice || detailCleaning.price || 0,
            }}
            onSuccess={() => {
              setShowDetailModal(false);
              setDetailCleaning(null);
              router.refresh();
            }}
            userRole="ADMIN"
          />
        )}
      </>
    );
  }

  // =====================================================
  // DESKTOP LAYOUT (existing code)
  // =====================================================
  return (
    <>
      <div className="overflow-x-hidden pb-24 lg:pb-8">
        {/* Welcome */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">👋</span>
            <h1 className="text-3xl font-bold text-slate-800">Buongiorno, {userName.split(" ")[0]}!</h1>
          </div>
          <p className="text-slate-500">Ecco cosa succede oggi nella tua attività</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-8">
          <div className="group bg-white rounded-2xl border border-slate-200/60 p-4 lg:p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 cursor-pointer">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-sky-400 to-blue-600 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="relative">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center mb-3 lg:mb-4 shadow-lg shadow-sky-500/30">
                <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-xs lg:text-sm font-medium text-slate-500 mb-1">{isToday() ? "Pulizie Oggi" : `Pulizie ${day} ${month.substring(0, 3)}`}</p>
              <span className="text-2xl lg:text-3xl font-bold text-slate-800">{cleanings.length}</span>
            </div>
          </div>

          <div className="group bg-white rounded-2xl border border-slate-200/60 p-4 lg:p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 cursor-pointer">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400 to-teal-600 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="relative">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-3 lg:mb-4 shadow-lg shadow-emerald-500/30">
                <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xs lg:text-sm font-medium text-slate-500 mb-1">Operatori Attivi</p>
              <span className="text-2xl lg:text-3xl font-bold text-slate-800">{stats.operatorsActive}</span>
            </div>
          </div>

          <div className="group bg-white rounded-2xl border border-slate-200/60 p-4 lg:p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 cursor-pointer">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-400 to-purple-600 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="relative">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center mb-3 lg:mb-4 shadow-lg shadow-violet-500/30">
                <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-xs lg:text-sm font-medium text-slate-500 mb-1">Proprietà</p>
              <span className="text-2xl lg:text-3xl font-bold text-slate-800">{stats.propertiesTotal}</span>
            </div>
          </div>

          <div className="group bg-white rounded-2xl border border-slate-200/60 p-4 lg:p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 cursor-pointer">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400 to-orange-500 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="relative">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-3 lg:mb-4 shadow-lg shadow-amber-500/30">
                <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <p className="text-xs lg:text-sm font-medium text-slate-500 mb-1">Check-in Settimana</p>
              <span className="text-2xl lg:text-3xl font-bold text-slate-800">{stats.checkinsWeek}</span>
            </div>
          </div>
        </div>

        {/* Tab Switch Desktop */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setActiveTab("cleanings")}
            className={`flex items-center gap-3 px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === "cleanings"
                ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-purple-500/30"
                : "bg-white text-slate-600 border border-slate-200 hover:border-purple-300 hover:bg-purple-50"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Pulizie
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === "cleanings" ? "bg-white/20" : "bg-slate-100"}`}>
              {cleanings.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("deliveries")}
            className={`flex items-center gap-3 px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === "deliveries"
                ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30"
                : "bg-white text-slate-600 border border-slate-200 hover:border-orange-300 hover:bg-orange-50"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            Consegne Biancheria
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === "deliveries" ? "bg-white/20" : "bg-slate-100"}`}>
              {orders.length}
            </span>
          </button>
        </div>

        {/* Contenuto basato sulla tab attiva */}
        {activeTab === "deliveries" ? (
          <DeliveriesView
            orders={orders}
            riders={riders}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onOrdersUpdate={() => {}}
          />
        ) : (
        <>
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {isToday() ? "Pulizie di Oggi" : "Pulizie del " + formattedDate}
            </h2>
            <p className="text-slate-500 text-sm">{formattedDate}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Filtri Status */}
            <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
              <button 
                onClick={() => setStatusFilter(statusFilter === null ? null : null)} 
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === null ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Tutte ({mobileStats.todo + mobileStats.inprogress + mobileStats.done})
              </button>
              <button 
                onClick={() => setStatusFilter(statusFilter === 'todo' ? null : 'todo')} 
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === 'todo' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-amber-50'}`}
              >
                Da fare ({mobileStats.todo})
              </button>
              <button 
                onClick={() => setStatusFilter(statusFilter === 'inprogress' ? null : 'inprogress')} 
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === 'inprogress' ? 'bg-sky-500 text-white' : 'text-slate-600 hover:bg-sky-50'}`}
              >
                In corso ({mobileStats.inprogress})
              </button>
              <button 
                onClick={() => setStatusFilter(statusFilter === 'done' ? null : 'done')} 
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === 'done' ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-emerald-50'}`}
              >
                ✓ Completate ({mobileStats.done})
              </button>
            </div>
            
            <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
              <button onClick={goToPreviousDay} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button onClick={goToToday} className={'px-4 py-2 rounded-lg font-medium text-sm transition-colors ' + (isToday() ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
                Oggi
              </button>
              <button onClick={goToNextDay} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Cerca proprietà..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm w-40 placeholder:text-slate-400"/>
            </div>
          </div>
        </div>

        {/* Cleaning Cards */}
        <div className="space-y-4">
          {loadingCleanings ? (
            <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Caricamento...</h3>
            </div>
          ) : filteredCleanings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessuna pulizia per {isToday() ? "oggi" : "questo giorno"}</h3>
              <p className="text-slate-500">Le pulizie programmate appariranno qui</p>
            </div>
          ) : (
            filteredCleanings.map((cleaning) => {
              const assignedOperators = cleaningOperators[cleaning.id] || [];
              const status = mapStatus(cleaning.status);
              const isDone = status === 'done';
              const isInProgress = status === 'inprogress';

              return (
                <div key={cleaning.id} className={`group bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 ${isDone ? 'border-emerald-300 opacity-80' : isInProgress ? 'border-sky-300' : 'border-slate-200/60'}`}>
                  <div className="flex">
                    <div className="w-56 h-44 overflow-hidden bg-slate-100 flex-shrink-0 relative">
                      {cleaning.property.imageUrl ? (
                        <img src={cleaning.property.imageUrl} alt={cleaning.property.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"/>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                          <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                      )}
                      {/* Status Badge */}
                      <div className={`absolute top-3 left-3 px-3 py-1.5 text-white text-xs font-bold rounded-lg shadow-lg ${isDone ? 'bg-emerald-500' : isInProgress ? 'bg-sky-500 flex items-center gap-1.5' : 'bg-amber-500'}`}>
                        {isInProgress && <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>}
                        {isDone ? '✓ COMPLETATA' : isInProgress ? 'IN CORSO' : 'DA FARE'}
                      </div>
                    </div>

                    <div className="flex-1 p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-slate-800 mb-1">{cleaning.property.name}</h3>
                          <div className="flex items-center gap-2 text-slate-500 text-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{cleaning.property.address}</span>
                          </div>

                          {/* Time & Guests */}
                          <div className="flex items-center gap-4 mt-3">
                            {editingTimeId === cleaning.id ? (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-50 rounded-lg border-2 border-sky-400">
                                <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <input ref={timeInputRef} type="time" value={editingTime} onChange={(e) => setEditingTime(e.target.value)} onBlur={() => handleTimeSave(cleaning.id)} onKeyDown={(e) => e.key === "Enter" && handleTimeSave(cleaning.id)} className="bg-transparent border-none outline-none text-sm font-medium text-sky-700 w-20"/>
                              </div>
                            ) : (
                              isDone ? (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
                                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span className="text-sm font-medium text-slate-500">{cleaning.scheduledTime || "10:00"}</span>
                                </div>
                              ) : (
                                <button onClick={() => handleTimeClick(cleaning)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-sky-50 hover:ring-2 hover:ring-sky-200 transition-all cursor-pointer" title="Clicca per modificare">
                                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span className="text-sm font-medium text-slate-700">{cleaning.scheduledTime || "10:00"}</span>
                                  <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                              )
                            )}

                            {editingGuestsId === cleaning.id ? (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-50 rounded-lg border-2 border-sky-400">
                                <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <input ref={guestsInputRef} type="number" min="1" max={cleaning.property.maxGuests || 6} value={editingGuests} onChange={(e) => {
                                  const max = cleaning.property.maxGuests || 6;
                                  const val = Math.min(parseInt(e.target.value) || 1, max);
                                  setEditingGuests(String(val));
                                }} onBlur={() => handleGuestsSave(cleaning.id)} onKeyDown={(e) => e.key === "Enter" && handleGuestsSave(cleaning.id)} className="bg-transparent border-none outline-none text-sm font-medium text-sky-700 w-12"/>
                                <span className="text-sm text-sky-600">/ {cleaning.property.maxGuests || "?"}</span>
                              </div>
                            ) : (
                              isDone ? (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
                                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                  </svg>
                                  <span className="text-sm font-medium text-slate-500">{cleaning.guestsCount || cleaning.booking?.guestsCount || 2} ospiti</span>
                                </div>
                              ) : (
                                <button onClick={() => handleGuestsClick(cleaning)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-sky-50 hover:ring-2 hover:ring-sky-200 transition-all cursor-pointer" title="Clicca per modificare">
                                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                  </svg>
                                  <span className="text-sm font-medium text-slate-700">{cleaning.guestsCount || cleaning.booking?.guestsCount || 2} ospiti</span>
                                  <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                              )
                            )}
                          </div>

                          {/* Operatori */}
                          <div className="mt-4">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Operatori</p>
                            <div className="flex flex-wrap items-center gap-2">
                              {assignedOperators.map((operator) => (
                                <div key={operator.id} className={'flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r shadow-md ' + getOperatorColor(operator.id)}>
                                  <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">{getInitials(operator.name)}</span>
                                  </div>
                                  <span className="text-sm font-medium text-white">{operator.name}</span>
                                  {/* Bottone X - nascosto se completata */}
                                  {!isDone && (
                                    <button onClick={() => handleRemoveOperator(cleaning.id, operator.id)} className="ml-1 w-5 h-5 rounded-full bg-white/20 hover:bg-red-500 flex items-center justify-center transition-colors" title="Rimuovi operatore">
                                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              ))}

                              {/* Pulsante Assegna - nascosto se completata */}
                              {!isDone && (
                                <button onClick={() => handleAssignClick(cleaning)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                  <span className="text-sm font-medium">{assignedOperators.length === 0 ? "Assegna operatore" : "Aggiungi"}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 ml-4">
                          <button 
                            onClick={() => {
                              setDetailCleaning({
                                ...cleaning,
                                propertyId: cleaning.property.id,
                                propertyName: cleaning.property.name,
                                propertyAddress: cleaning.property.address,
                                scheduledDate: cleaning.date,
                              });
                              setShowDetailModal(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-100 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span className="text-sm font-medium">Dettagli</span>
                          </button>
                          {/* Bottone Gestisci (Sposta/Cancella) - solo per pulizie non completate */}
                          {!isDone && (
                            <button 
                              onClick={() => {
                                setActionCleaning({
                                  ...cleaning,
                                  propertyId: cleaning.property.id,
                                  propertyName: cleaning.property.name,
                                  scheduledDate: cleaning.date,
                                });
                                setShowActionModal(true);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                              </svg>
                              <span className="text-sm font-medium">Gestisci</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </>
      )}
      </div>

      {/* Modal Assegna Operatore (Desktop) */}
      {showAssignModal && selectedCleaning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Assegna Operatore</h3>
                  <p className="text-sky-100 text-sm">{selectedCleaning.property.name}</p>
                </div>
                <button onClick={() => { setShowAssignModal(false); setSelectedCleaning(null); }} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-500 mb-4">Seleziona un operatore</p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {getAvailableOperators(selectedCleaning.id).length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <p>Tutti gli operatori sono già assegnati</p>
                  </div>
                ) : (
                  getAvailableOperators(selectedCleaning.id).map((operator, index) => (
                    <button key={operator.id} onClick={() => handleAssignOperator(operator.id)} disabled={assigning} className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-sky-400 hover:bg-sky-50 transition-all disabled:opacity-50">
                      <div className={'w-10 h-10 rounded-xl bg-gradient-to-r flex items-center justify-center shadow-md ' + operatorColors[index % operatorColors.length]}>
                        <span className="text-sm font-bold text-white">{getInitials(operator.name)}</span>
                      </div>
                      <span className="font-medium text-slate-800">{operator.name}</span>
                    </button>
                  ))
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowAssignModal(false); setSelectedCleaning(null); }} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium">
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Modifica Pulizia */}
      {showDetailModal && detailCleaning && (
        <EditCleaningModal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setDetailCleaning(null);
          }}
          cleaning={{
            id: detailCleaning.id,
            propertyId: detailCleaning.property?.id || "",
            propertyName: detailCleaning.property?.name || "",
            date: typeof detailCleaning.date === 'string' ? new Date(detailCleaning.date) : detailCleaning.date,
            scheduledTime: detailCleaning.scheduledTime || "10:00",
            status: detailCleaning.status,
            guestsCount: detailCleaning.guestsCount || 2,
            notes: detailCleaning.notes || "",
            price: detailCleaning.price,
            serviceType: detailCleaning.serviceType,
            serviceTypeName: detailCleaning.serviceTypeName,
            contractPrice: detailCleaning.contractPrice,
            priceModified: detailCleaning.priceModified,
            priceChangeReason: detailCleaning.priceChangeReason,
            sgrossoReason: detailCleaning.sgrossoReason as any,
            sgrossoReasonLabel: detailCleaning.sgrossoReasonLabel,
            sgrossoNotes: detailCleaning.sgrossoNotes,
            // Campi per pulizie completate
            photos: detailCleaning.photos,
            startedAt: detailCleaning.startedAt,
            completedAt: detailCleaning.completedAt,
            // Campi per valutazione
            ratingScore: detailCleaning.ratingScore,
            ratingId: detailCleaning.ratingId,
            extraServices: detailCleaning.extraServices,
            // Campi per deadline mancata
            missedDeadline: detailCleaning.missedDeadline,
            missedDeadlineAt: detailCleaning.missedDeadlineAt,
            // 🔧 FIX: Passa customLinenConfig
            customLinenConfig: detailCleaning.customLinenConfig,
          }}
          property={{
            id: detailCleaning.property?.id || "",
            name: detailCleaning.property?.name || "",
            address: detailCleaning.property?.address || "",
            maxGuests: detailCleaning.property?.maxGuests || 6, // 🔧 Fallback ridotto
            cleaningPrice: detailCleaning.contractPrice || detailCleaning.price || 0,
          }}
          onSuccess={() => {
            setShowDetailModal(false);
            setDetailCleaning(null);
            router.refresh();
          }}
          userRole="ADMIN"
        />
      )}

      {/* Modal Gestisci Pulizia (Sposta/Cancella) */}
      {showActionModal && actionCleaning && (
        <CleaningActionModal
          isOpen={showActionModal}
          onClose={() => {
            setShowActionModal(false);
            setActionCleaning(null);
          }}
          cleaning={{
            id: actionCleaning.id,
            propertyId: actionCleaning.property?.id || "",
            propertyName: actionCleaning.property?.name || "",
            scheduledDate: actionCleaning.date,
            scheduledTime: actionCleaning.scheduledTime || "10:00",
            status: actionCleaning.status,
            operatorName: actionCleaning.operator?.name || actionCleaning.operators?.[0]?.operator?.name,
          }}
          onSuccess={() => {
            setShowActionModal(false);
            setActionCleaning(null);
            router.refresh();
          }}
          isAdmin={true}
        />
      )}
    </>
  );
}
