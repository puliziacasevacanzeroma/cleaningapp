"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";

interface Operator {
  id: string;
  name: string | null;
}

interface Property {
  id: string;
  name: string;
  address: string;
  imageUrl?: string | null;
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
}

interface DashboardContentProps {
  userName: string;
  stats: {
    cleaningsToday: number;
    operatorsActive: number;
    propertiesTotal: number;
    checkinsWeek: number;
  };
  cleanings: Cleaning[];
  operators: Operator[];
}

// CSS per mobile
const mobileStyles = `
  .mobile-picker-modal { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-radius: 24px 24px 0 0; transform: translateY(100%); transition: transform 0.3s ease; z-index: 60; }
  .mobile-picker-modal.active { transform: translateY(0); }
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

export function DashboardContent({ userName, stats, cleanings: initialCleanings, operators }: DashboardContentProps) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [cleanings, setCleanings] = useState<Cleaning[]>(initialCleanings);
  const [loadingCleanings, setLoadingCleanings] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState("");
  const [editingGuestsId, setEditingGuestsId] = useState<string | null>(null);
  const [editingGuests, setEditingGuests] = useState("");
  const timeInputRef = useRef<HTMLInputElement>(null);
  const guestsInputRef = useRef<HTMLInputElement>(null);
  const [cleaningOperators, setCleaningOperators] = useState<Record<string, Operator[]>>({});

  // Mobile states
  const [mobileFilter, setMobileFilter] = useState<string | null>(null);
  const [showMobileTimePicker, setShowMobileTimePicker] = useState(false);
  const [showMobileOperatorPicker, setShowMobileOperatorPicker] = useState(false);
  const [showMobileGuestsPicker, setShowMobileGuestsPicker] = useState(false);
  const [mobileCurrentCardId, setMobileCurrentCardId] = useState<string | null>(null);
  const [mobileCurrentHour, setMobileCurrentHour] = useState(10);
  const [mobileCurrentMin, setMobileCurrentMin] = useState(0);
  const [mobileGuestsData, setMobileGuestsData] = useState({ adults: 2, infants: 0 });
  const [mobileToast, setMobileToast] = useState({ show: false, message: "" });
  const [mobileOperatorSearch, setMobileOperatorSearch] = useState("");
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

  const loadCleaningsForDate = async (date: Date) => {
    setLoadingCleanings(true);
    try {
      const dateStr = date.toISOString().split('T')[0];
      const response = await fetch('/api/dashboard/cleanings?date=' + dateStr);
      if (response.ok) {
        const data = await response.json();
        setCleanings(data.cleanings || []);
      }
    } catch (error) {
      console.error("Errore caricamento pulizie:", error);
    } finally {
      setLoadingCleanings(false);
    }
  };

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
    loadCleaningsForDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
    loadCleaningsForDate(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    loadCleaningsForDate(today);
  };

  const isToday = () => selectedDate.toDateString() === new Date().toDateString();

  useEffect(() => {
    const initial: Record<string, Operator[]> = {};
    cleanings.forEach(c => {
      if (c.operator) {
        initial[c.id] = [c.operator];
      } else if (c.operators && c.operators.length > 0) {
        initial[c.id] = c.operators.map(co => co.operator);
      } else {
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

  const filteredCleanings = cleanings.filter(c =>
    c.property.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.property.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  // Desktop handlers
  const handleAssignClick = (cleaning: Cleaning) => {
    setSelectedCleaning(cleaning);
    setShowAssignModal(true);
  };

  const handleAssignOperator = async (operatorId: string) => {
    if (!selectedCleaning) return;
    setAssigning(true);
    try {
      const response = await fetch('/api/dashboard/cleanings/' + selectedCleaning.id + '/assign', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId })
      });
      if (response.ok) {
        const newOperator = operators.find(o => o.id === operatorId);
        if (newOperator) {
          setCleaningOperators(prev => ({
            ...prev,
            [selectedCleaning.id]: [...(prev[selectedCleaning.id] || []), newOperator]
          }));
        }
        setShowAssignModal(false);
        setSelectedCleaning(null);
        router.refresh();
      }
    } catch (error) {
      console.error("Errore:", error);
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveOperator = async (cleaningId: string, operatorId: string) => {
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
      router.refresh();
    } catch (error) {
      console.error("Errore:", error);
    }
  };

  const handleTimeClick = (cleaning: Cleaning) => {
    setEditingTimeId(cleaning.id);
    setEditingTime(cleaning.scheduledTime || "10:00");
  };

  const handleTimeSave = async (cleaningId: string) => {
    try {
      await fetch('/api/dashboard/cleanings/' + cleaningId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledTime: editingTime })
      });
      setEditingTimeId(null);
      router.refresh();
    } catch (error) {
      console.error("Errore:", error);
    }
  };

  const handleGuestsClick = (cleaning: Cleaning) => {
    setEditingGuestsId(cleaning.id);
    setEditingGuests(String(cleaning.guestsCount || cleaning.booking?.guestsCount || 2));
  };

  const handleGuestsSave = async (cleaningId: string) => {
    try {
      await fetch('/api/dashboard/cleanings/' + cleaningId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestsCount: parseInt(editingGuests) || 2 })
      });
      setEditingGuestsId(null);
      router.refresh();
    } catch (error) {
      console.error("Errore:", error);
    }
  };

  const getAvailableOperators = (cleaningId: string) => {
    const assigned = cleaningOperators[cleaningId] || [];
    const assignedIds = assigned.map(o => o.id);
    return operators.filter(o => !assignedIds.includes(o.id));
  };

  // Mobile handlers
  const mobileCloseAll = () => {
    setShowMobileTimePicker(false);
    setShowMobileOperatorPicker(false);
    setShowMobileGuestsPicker(false);
    document.body.classList.remove('mobile-modal-open');
    document.body.style.top = '';
    window.scrollTo(0, mobileScrollYRef.current);
  };

  const mobileLockScroll = () => {
    mobileScrollYRef.current = window.scrollY;
    document.body.classList.add('mobile-modal-open');
    document.body.style.top = '-' + mobileScrollYRef.current + 'px';
  };

  const mobileShowToast = (message: string) => {
    setMobileToast({ show: false, message: "" });
    requestAnimationFrame(() => setMobileToast({ show: true, message }));
    setTimeout(() => setMobileToast({ show: false, message: "" }), 1100);
  };

  const mobileOpenTimePicker = (cardId: string) => {
    const cleaning = cleanings.find(c => c.id === cardId);
    if (!cleaning) return;
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

  // Store previous positions for FLIP animation
  const cardPositionsRef = useRef<Map<string, number>>(new Map());
  
  // Save positions before render
  useEffect(() => {
    const container = mobileCardsRef.current;
    if (!container || !isMobile) return;
    
    const cards = Array.from(container.querySelectorAll('.mobile-card-item')) as HTMLElement[];
    cards.forEach(card => {
      const id = card.dataset.id;
      if (id) {
        cardPositionsRef.current.set(id, card.getBoundingClientRect().top);
      }
    });
  });
  
  // Apply FLIP animation after render
  useEffect(() => {
    const container = mobileCardsRef.current;
    if (!container || !isMobile) return;
    
    const cards = Array.from(container.querySelectorAll('.mobile-card-item')) as HTMLElement[];
    
    cards.forEach(card => {
      const id = card.dataset.id;
      if (!id) return;
      
      const oldTop = cardPositionsRef.current.get(id);
      if (oldTop === undefined) return;
      
      const newTop = card.getBoundingClientRect().top;
      const deltaY = oldTop - newTop;
      
      if (Math.abs(deltaY) > 5) {
        // Apply FLIP
        card.style.transition = 'none';
        card.style.transform = 'translateY(' + deltaY + 'px)';
        
        // Force reflow
        card.offsetHeight;
        
        // Animate to new position
        requestAnimationFrame(() => {
          card.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
          card.style.transform = 'translateY(0)';
        });
        
        // Cleanup
        setTimeout(() => {
          card.style.transition = '';
          card.style.transform = '';
        }, 550);
      }
    });
  }, [cleanings, isMobile]);

  const mobileReorderCards = (changedCardId: string) => {
    // Flash the changed card
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
    setMobileCurrentCardId(cardId);
    setMobileOperatorSearch('');
    mobileLockScroll();
    setShowMobileOperatorPicker(true);
  };

  const mobileSelectOperator = async (operator: Operator) => {
    if (!mobileCurrentCardId) return;
    setCleaningOperators(prev => ({
      ...prev,
      [mobileCurrentCardId]: [...(prev[mobileCurrentCardId] || []), operator]
    }));
    mobileCloseAll();
    mobileShowToast(getShortName(operator.name) + ' assegnato');
    try {
      await fetch('/api/dashboard/cleanings/' + mobileCurrentCardId + '/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId: operator.id }),
      });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const mobileOpenGuestsPicker = (cardId: string) => {
    const cleaning = cleanings.find(c => c.id === cardId);
    if (!cleaning) return;
    setMobileCurrentCardId(cardId);
    setMobileGuestsData({ adults: cleaning.guestsCount || cleaning.booking?.guestsCount || 2, infants: 0 });
    mobileLockScroll();
    setShowMobileGuestsPicker(true);
  };

  const mobileChangeGuests = (type: string, delta: number) => {
    setMobileGuestsData(prev => ({
      ...prev,
      [type]: type === 'adults' ? Math.max(1, Math.min(10, prev.adults + delta)) : Math.max(0, Math.min(5, prev.infants + delta))
    }));
  };

  const mobileConfirmGuests = async () => {
    if (!mobileCurrentCardId) return;
    const total = mobileGuestsData.adults + mobileGuestsData.infants;
    setCleanings(prev => prev.map(c => c.id === mobileCurrentCardId ? { ...c, guestsCount: total } : c));
    let msg = total + ' ospiti';
    if (mobileGuestsData.infants > 0) msg += ' (+' + mobileGuestsData.infants + ' neonati)';
    mobileCloseAll();
    mobileShowToast(msg);
    try {
      await fetch('/api/dashboard/cleanings/' + mobileCurrentCardId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestsCount: total }),
      });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Mobile computed values
  const mobileStats = {
    todo: cleanings.filter(c => mapStatus(c.status) === 'todo').length,
    inprogress: cleanings.filter(c => mapStatus(c.status) === 'inprogress').length,
    done: cleanings.filter(c => mapStatus(c.status) === 'done').length,
    totalEarnings: cleanings.length * 80,
  };

  const mobileSortedCleanings = [...cleanings].sort((a, b) => {
    const statusOrder: Record<string, number> = { todo: 0, inprogress: 1, done: 2 };
    const statusA = statusOrder[mapStatus(a.status)] || 0;
    const statusB = statusOrder[mapStatus(b.status)] || 0;
    if (statusA !== statusB) return statusA - statusB;
    return (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00');
  });

  const mobileFilteredCleanings = mobileFilter 
    ? mobileSortedCleanings.filter(c => mapStatus(c.status) === mobileFilter)
    : mobileSortedCleanings;

  const mobileFilteredOperators = operators.filter(op => 
    (op.name || '').toLowerCase().includes(mobileOperatorSearch.toLowerCase())
  );

  const { day, month, year } = {
    day: selectedDate.getDate(),
    month: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'][selectedDate.getMonth()],
    year: selectedDate.getFullYear()
  };

  // Loading state
  if (isMobile === null) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-3 border-slate-200 border-t-sky-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  // =====================================================
  // MOBILE LAYOUT
  // =====================================================
  if (isMobile) {
    return (
      <>
        {/* Hero Card */}
        <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600 rounded-3xl p-4 mb-4 shadow-xl">
          <div className="flex items-start justify-between mb-4">
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
          
          <div className="flex items-center gap-4 mb-4 pb-4 border-b border-white/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-300"></div>
              <span className="text-xs text-white/80">Pulizie: <span className="font-bold text-white">€{Math.round(mobileStats.totalEarnings * 0.7)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-violet-300"></div>
              <span className="text-xs text-white/80">Biancheria: <span className="font-bold text-white">€{Math.round(mobileStats.totalEarnings * 0.3)}</span></span>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setMobileFilter(mobileFilter === 'todo' ? null : 'todo')} className={'bg-white/20 rounded-2xl p-3 text-center transition-all' + (mobileFilter === 'todo' ? ' ring-2 ring-white/50 scale-[1.02]' : '')}>
              <p className="text-2xl font-black text-white mb-0.5">{mobileStats.todo}</p>
              <p className="text-[10px] font-medium text-white/80">Da fare</p>
            </button>
            <button onClick={() => setMobileFilter(mobileFilter === 'inprogress' ? null : 'inprogress')} className={'bg-white/20 rounded-2xl p-3 text-center transition-all' + (mobileFilter === 'inprogress' ? ' ring-2 ring-white/50 scale-[1.02]' : '')}>
              <p className="text-2xl font-black text-white mb-0.5">{mobileStats.inprogress}</p>
              <p className="text-[10px] font-medium text-white/80">In corso</p>
            </button>
            <button onClick={() => setMobileFilter(mobileFilter === 'done' ? null : 'done')} className={'bg-white/20 rounded-2xl p-3 text-center transition-all' + (mobileFilter === 'done' ? ' ring-2 ring-white/50 scale-[1.02]' : '')}>
              <p className="text-2xl font-black text-emerald-300 mb-0.5">{mobileStats.done}</p>
              <p className="text-[10px] font-medium text-white/80">Completate</p>
            </button>
          </div>
        </div>

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
            {mobileFilter === 'todo' ? 'Da fare' : mobileFilter === 'inprogress' ? 'In corso' : mobileFilter === 'done' ? 'Completate' : 'Tutte le pulizie'}
          </h2>
          <span className="text-xs text-slate-400">{mobileFilteredCleanings.length} attività</span>
        </div>

        {/* Cards */}
        <div className="space-y-3" ref={mobileCardsRef}>
          {loadingCleanings ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-slate-500 text-sm">Caricamento...</p>
            </div>
          ) : mobileFilteredCleanings.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
              <p className="text-slate-500">Nessuna pulizia per oggi</p>
            </div>
          ) : mobileFilteredCleanings.map((cleaning) => {
            const status = mapStatus(cleaning.status);
            const isDone = status === 'done';
            const isInProgress = status === 'inprogress';
            const assignedOps = cleaningOperators[cleaning.id] || [];

            return (
              <div 
                key={cleaning.id}
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
                        <span key={op.id} className="inline-flex items-center gap-1 text-white bg-emerald-500 pl-1.5 pr-2 py-0.5 rounded-full text-[10px] font-semibold">
                          {getInitials(op.name)}
                          <span>{getShortName(op.name)}</span>
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
                  
                  <div className="pr-2 flex items-center">
                    <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile Modals */}
        {(showMobileTimePicker || showMobileOperatorPicker || showMobileGuestsPicker) && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={mobileCloseAll}/>
        )}

        {/* Toast */}
        <div className={'mobile-success-toast' + (mobileToast.show ? ' active' : '')}>
          <div className="flex items-center gap-2.5 bg-white px-4 py-3 rounded-full shadow-xl">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-700">{mobileToast.message}</span>
          </div>
        </div>

        {/* Time Picker Modal */}
        <div className={'mobile-picker-modal shadow-2xl' + (showMobileTimePicker ? ' active' : '')}>
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

        {/* Operator Picker Modal */}
        <div className={'mobile-picker-modal shadow-2xl' + (showMobileOperatorPicker ? ' active' : '')} style={{ maxHeight: '50vh' }}>
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
              {mobileFilteredOperators.map((operator, index) => (
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

        {/* Guests Picker Modal */}
        <div className={'mobile-picker-modal shadow-2xl' + (showMobileGuestsPicker ? ' active' : '')}>
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
                <p className="font-semibold text-slate-800">Adulti</p>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => mobileChangeGuests('adults', -1)} disabled={mobileGuestsData.adults <= 1} className="w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400 disabled:opacity-30">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 12H4"/></svg>
                </button>
                <span className="text-xl font-bold text-slate-800 w-8 text-center">{mobileGuestsData.adults}</span>
                <button onClick={() => mobileChangeGuests('adults', 1)} className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white">
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
            
            {/* Preview */}
            <div className="bg-slate-50 rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-500">Anteprima</span>
                <span className="text-sm font-semibold text-slate-700">
                  {mobileGuestsData.infants > 0 ? mobileGuestsData.adults + ' adulti + ' + mobileGuestsData.infants + ' neonati' : (mobileGuestsData.adults + mobileGuestsData.infants) + ' ospiti'}
                </span>
              </div>
              <div className="flex items-end justify-center gap-1.5 min-h-[50px]">
                {Array.from({ length: mobileGuestsData.adults }).map((_, i) => (
                  <div key={'a' + i} className="scale-in flex flex-col items-center" style={{ animationDelay: (i * 0.03) + 's' }}>
                    <div className="w-5 h-5 rounded-full bg-indigo-200"></div>
                    <div className="w-7 h-9 bg-indigo-300 rounded-t-xl rounded-b-lg mt-0.5"></div>
                  </div>
                ))}
                {Array.from({ length: mobileGuestsData.infants }).map((_, i) => (
                  <div key={'i' + i} className="scale-in flex flex-col items-center" style={{ animationDelay: ((mobileGuestsData.adults + i) * 0.03) + 's' }}>
                    <div className="w-4 h-4 rounded-full bg-rose-200"></div>
                    <div className="w-5 h-6 bg-rose-300 rounded-t-lg rounded-b-md mt-0.5"></div>
                  </div>
                ))}
              </div>
            </div>
            
            <button onClick={mobileConfirmGuests} className="w-full py-4 bg-slate-800 text-white rounded-2xl font-semibold text-base active:scale-[0.98] transition-transform">Conferma</button>
          </div>
        </div>
      </>
    );
  }

  // =====================================================
  // DESKTOP LAYOUT (existing code)
  // =====================================================
  return (
    <>
      <div className="overflow-x-hidden">
        {/* Welcome */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">👋</span>
            <h1 className="text-3xl font-bold text-slate-800">Buongiorno, {userName.split(" ")[0]}!</h1>
          </div>
          <p className="text-slate-500">Ecco cosa succede oggi nella tua attività</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="group bg-white rounded-2xl border border-slate-200/60 p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 cursor-pointer">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-sky-400 to-blue-600 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-sky-500/30">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-500 mb-1">Pulizie Oggi</p>
              <span className="text-3xl font-bold text-slate-800">{stats.cleaningsToday}</span>
            </div>
          </div>

          <div className="group bg-white rounded-2xl border border-slate-200/60 p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 cursor-pointer">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400 to-teal-600 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/30">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-500 mb-1">Operatori Attivi</p>
              <span className="text-3xl font-bold text-slate-800">{stats.operatorsActive}</span>
            </div>
          </div>

          <div className="group bg-white rounded-2xl border border-slate-200/60 p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 cursor-pointer">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-400 to-purple-600 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/30">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-500 mb-1">Proprietà</p>
              <span className="text-3xl font-bold text-slate-800">{stats.propertiesTotal}</span>
            </div>
          </div>

          <div className="group bg-white rounded-2xl border border-slate-200/60 p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 cursor-pointer">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400 to-orange-500 opacity-10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/30">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-500 mb-1">Check-in Settimana</p>
              <span className="text-3xl font-bold text-slate-800">{stats.checkinsWeek}</span>
            </div>
          </div>
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {isToday() ? "Pulizie di Oggi" : "Pulizie del " + formattedDate}
            </h2>
            <p className="text-slate-500 text-sm">{formattedDate}</p>
          </div>
          <div className="flex items-center gap-3">
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

              return (
                <div key={cleaning.id} className="group bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50">
                  <div className="flex">
                    <div className="w-56 h-44 overflow-hidden bg-slate-100 flex-shrink-0">
                      {cleaning.property.imageUrl ? (
                        <img src={cleaning.property.imageUrl} alt={cleaning.property.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"/>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                          <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                      )}
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
                              <button onClick={() => handleTimeClick(cleaning)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-sky-50 hover:ring-2 hover:ring-sky-200 transition-all cursor-pointer" title="Clicca per modificare">
                                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-medium text-slate-700">{cleaning.scheduledTime || "10:00"}</span>
                                <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            )}

                            {editingGuestsId === cleaning.id ? (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-50 rounded-lg border-2 border-sky-400">
                                <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <input ref={guestsInputRef} type="number" min="1" value={editingGuests} onChange={(e) => setEditingGuests(e.target.value)} onBlur={() => handleGuestsSave(cleaning.id)} onKeyDown={(e) => e.key === "Enter" && handleGuestsSave(cleaning.id)} className="bg-transparent border-none outline-none text-sm font-medium text-sky-700 w-12"/>
                                <span className="text-sm text-sky-600">ospiti</span>
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
                            )}
                          </div>

                          {/* Operatori */}
                          <div className="mt-4">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Operatori</p>
                            <div className="flex flex-wrap items-center gap-2">
                              {assignedOperators.map((operator) => (
                                <div key={operator.id} className={'flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r shadow-md group/op ' + getOperatorColor(operator.id)}>
                                  <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">{getInitials(operator.name)}</span>
                                  </div>
                                  <span className="text-sm font-medium text-white">{operator.name}</span>
                                  <button onClick={() => handleRemoveOperator(cleaning.id, operator.id)} className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center opacity-0 group-hover/op:opacity-100 transition-opacity" title="Rimuovi operatore">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}

                              <button onClick={() => handleAssignClick(cleaning)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="text-sm font-medium">{assignedOperators.length === 0 ? "Assegna operatore" : "Aggiungi"}</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 ml-4">
                          <button className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-100 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span className="text-sm font-medium">Dettagli</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
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
    </>
  );
}
