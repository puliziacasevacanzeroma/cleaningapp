'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import EditCleaningModal from '~/components/proprietario/EditCleaningModal';

interface Cleaning {
  id: string;
  scheduledDate: string;
  scheduledTime: string | null;
  status: string;
  type: string;
  price: number;
  property: {
    id: string;
    name: string;
    address: string;
    maxGuests: number;
    imageUrl?: string;
  };
  operator: {
    id: string;
    name: string;
  } | null;
  booking: {
    guestName: string | null;
    guestsCount: number;
  } | null;
}

interface Operator {
  id: string;
  name: string;
  email: string;
}

export default function DashboardMobileClient() {
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentFilter, setCurrentFilter] = useState<string | null>(null);
  const [dateAnimation, setDateAnimation] = useState<'slide-left' | 'slide-right' | null>(null);
  
  const [showOverlay, setShowOverlay] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showOperatorPicker, setShowOperatorPicker] = useState(false);
  const [showGuestsPicker, setShowGuestsPicker] = useState(false);
  
  const [currentCardId, setCurrentCardId] = useState<string | null>(null);
  const [currentHour, setCurrentHour] = useState(10);
  const [currentMin, setCurrentMin] = useState(0);
  const [timeBump, setTimeBump] = useState(false);
  
  const [guestsData, setGuestsData] = useState({ adults: 2, infants: 0 });
  const [operatorSearch, setOperatorSearch] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  
  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCleaning, setEditingCleaning] = useState<Cleaning | null>(null);
  
  const hourScrollRef = useRef<HTMLDivElement>(null);
  const minScrollRef = useRef<HTMLDivElement>(null);
  const scrollYRef = useRef(0);
  const cardsListRef = useRef<HTMLDivElement>(null);
  const hourTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const minTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const ITEM_HEIGHT = 60;
  const HOURS = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'];
  const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  const formatDateForAPI = (date: Date) => date.toISOString().split('T')[0];

  const fetchCleanings = useCallback(async () => {
    try {
      const dateStr = formatDateForAPI(currentDate);
      const res = await fetch('/api/dashboard/cleanings?date=' + dateStr);
      if (res.ok) {
        const data = await res.json();
        setCleanings(data.cleanings || []);
      }
    } catch (error) {
      console.error('Error fetching cleanings:', error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  const fetchOperators = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/utenti?role=operatore');
      if (res.ok) {
        const data = await res.json();
        setOperators(data || []);
      }
    } catch (error) {
      console.error('Error fetching operators:', error);
    }
  }, []);

  useEffect(() => {
    fetchCleanings();
    fetchOperators();
  }, [fetchCleanings, fetchOperators]);

  const mapStatus = (status: string): 'todo' | 'inprogress' | 'done' => {
    switch (status) {
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

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  
  const getShortName = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0] + ' ' + parts[1][0] + '.';
    }
    return name;
  };

  const changeDay = (delta: number) => {
    setDateAnimation(delta > 0 ? 'slide-left' : 'slide-right');
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + delta);
    setCurrentDate(newDate);
    setTimeout(() => setDateAnimation(null), 300);
  };

  const formatDate = (date: Date) => {
    const day = date.getDate();
    const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    return { day, month: months[date.getMonth()], year: date.getFullYear() };
  };

  const setFilter = (status: string) => {
    setCurrentFilter(currentFilter === status ? null : status);
  };

  const getFilterTitle = () => {
    switch (currentFilter) {
      case 'todo': return 'Da fare';
      case 'inprogress': return 'In corso';
      case 'done': return 'Completate';
      default: return 'Tutte le pulizie';
    }
  };

  const closeAll = () => {
    setShowOverlay(false);
    setShowTimePicker(false);
    setShowOperatorPicker(false);
    setShowGuestsPicker(false);
    setKeyboardOpen(false);
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, scrollYRef.current);
  };

  const lockScroll = () => {
    scrollYRef.current = window.scrollY;
    document.body.classList.add('modal-open');
    document.body.style.top = '-' + scrollYRef.current + 'px';
  };

  const showSuccess = (text: string) => {
    setToastMessage(text);
    setShowToast(false);
    requestAnimationFrame(() => setShowToast(true));
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    successTimeoutRef.current = setTimeout(() => setShowToast(false), 1100);
  };

  // Demo data
  const demoCleanings: Cleaning[] = [
    { id: '1', scheduledDate: formatDateForAPI(currentDate), scheduledTime: '09:00', status: 'pending', type: 'standard', price: 80, property: { id: '1', name: 'Imperial House', address: 'Via Roma 42', maxGuests: 4, imageUrl: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=200&h=200&fit=crop' }, operator: { id: '1', name: 'Mario Rossi' }, booking: { guestName: 'John Doe', guestsCount: 2 } },
    { id: '2', scheduledDate: formatDateForAPI(currentDate), scheduledTime: '10:30', status: 'assigned', type: 'standard', price: 100, property: { id: '2', name: 'Luxury Suite', address: 'Corso Buenos Aires 15', maxGuests: 6, imageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=200&h=200&fit=crop' }, operator: null, booking: { guestName: 'Jane Smith', guestsCount: 3 } },
    { id: '3', scheduledDate: formatDateForAPI(currentDate), scheduledTime: '11:00', status: 'pending', type: 'standard', price: 90, property: { id: '3', name: 'Central Apartment', address: 'Piazza Duomo 8', maxGuests: 4, imageUrl: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=200&h=200&fit=crop' }, operator: null, booking: { guestName: 'Bob Wilson', guestsCount: 4 } },
    { id: '4', scheduledDate: formatDateForAPI(currentDate), scheduledTime: '14:00', status: 'pending', type: 'standard', price: 110, property: { id: '4', name: 'Navigli Loft', address: 'Ripa di Porta Ticinese', maxGuests: 5, imageUrl: 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=200&h=200&fit=crop' }, operator: { id: '2', name: 'Sofia Verdi' }, booking: { guestName: 'Alice Brown', guestsCount: 5 } },
    { id: '5', scheduledDate: formatDateForAPI(currentDate), scheduledTime: '08:00', status: 'in_progress', type: 'standard', price: 85, property: { id: '5', name: 'Brera Design Apt', address: 'Via Brera 22', maxGuests: 4, imageUrl: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=200&h=200&fit=crop' }, operator: { id: '1', name: 'Mario Rossi' }, booking: { guestName: 'Charlie Davis', guestsCount: 2 } },
    { id: '6', scheduledDate: formatDateForAPI(currentDate), scheduledTime: '07:00', status: 'completed', type: 'standard', price: 70, property: { id: '6', name: 'Porta Romana', address: 'Viale Sabotino 5', maxGuests: 2, imageUrl: 'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=200&h=200&fit=crop' }, operator: { id: '3', name: 'Marco Parisi' }, booking: { guestName: 'Diana Evans', guestsCount: 2 } },
    { id: '7', scheduledDate: formatDateForAPI(currentDate), scheduledTime: '07:30', status: 'completed', type: 'standard', price: 75, property: { id: '7', name: 'City Life', address: 'Piazza Tre Torri', maxGuests: 4, imageUrl: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=200&h=200&fit=crop' }, operator: { id: '4', name: 'Giulia Ferrari' }, booking: { guestName: 'Edward Frank', guestsCount: 3 } },
    { id: '8', scheduledDate: formatDateForAPI(currentDate), scheduledTime: '06:30', status: 'completed', type: 'standard', price: 70, property: { id: '8', name: 'Isola Loft', address: 'Via Pastrengo 14', maxGuests: 6, imageUrl: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=200&h=200&fit=crop' }, operator: { id: '5', name: 'Anna Moretti' }, booking: { guestName: 'Fiona Grant', guestsCount: 4 } }
  ];

  const demoOperators: Operator[] = [
    { id: '1', name: 'Mario Rossi', email: 'mario@example.com' },
    { id: '2', name: 'Laura Bianchi', email: 'laura@example.com' },
    { id: '3', name: 'Sofia Verdi', email: 'sofia@example.com' },
    { id: '4', name: 'Marco Parisi', email: 'marco@example.com' },
    { id: '5', name: 'Giulia Ferrari', email: 'giulia@example.com' },
    { id: '6', name: 'Anna Moretti', email: 'anna@example.com' },
    { id: '7', name: 'Luca Conti', email: 'luca@example.com' },
  ];

  const displayCleanings = cleanings.length > 0 ? cleanings : demoCleanings;
  const displayOperators = operators.length > 0 ? operators : demoOperators;

  const displayStats = {
    todo: displayCleanings.filter(c => mapStatus(c.status) === 'todo').length,
    inprogress: displayCleanings.filter(c => mapStatus(c.status) === 'inprogress').length,
    done: displayCleanings.filter(c => mapStatus(c.status) === 'done').length,
    totalEarnings: displayCleanings.reduce((sum, c) => sum + (c.price || 0), 0),
  };

  const displaySortedCleanings = [...displayCleanings].sort((a, b) => {
    const statusOrder: Record<string, number> = { todo: 0, inprogress: 1, done: 2 };
    const statusA = statusOrder[mapStatus(a.status)] || 0;
    const statusB = statusOrder[mapStatus(b.status)] || 0;
    if (statusA !== statusB) return statusA - statusB;
    return (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00');
  });

  const displayFilteredCleanings = currentFilter 
    ? displaySortedCleanings.filter(c => mapStatus(c.status) === currentFilter)
    : displaySortedCleanings;

  const displayFilteredOperators = displayOperators.filter(op => 
    op.name.toLowerCase().includes(operatorSearch.toLowerCase())
  );

  // TIME PICKER FUNCTIONS
  const openTimePicker = (cardId: string) => {
    const cleaning = displayCleanings.find(c => c.id === cardId);
    if (!cleaning) return;
    
    setCurrentCardId(cardId);
    const time = cleaning.scheduledTime || '10:00';
    const parts = time.split(':');
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    setCurrentHour(h);
    setCurrentMin(m);
    
    lockScroll();
    setShowOverlay(true);
    setShowTimePicker(true);
    
    setTimeout(() => {
      if (hourScrollRef.current) {
        hourScrollRef.current.scrollTop = (h - 6) * ITEM_HEIGHT;
      }
      if (minScrollRef.current) {
        minScrollRef.current.scrollTop = (m / 5) * ITEM_HEIGHT;
      }
    }, 100);
  };

  const handleHourScroll = () => {
    if (!hourScrollRef.current) return;
    if (hourTimeoutRef.current) clearTimeout(hourTimeoutRef.current);
    
    hourTimeoutRef.current = setTimeout(() => {
      if (!hourScrollRef.current) return;
      const finalIndex = Math.round(hourScrollRef.current.scrollTop / ITEM_HEIGHT);
      const clampedFinal = Math.max(0, Math.min(finalIndex, HOURS.length - 1));
      
      hourScrollRef.current.scrollTo({ top: clampedFinal * ITEM_HEIGHT, behavior: 'smooth' });
      
      const hour = HOURS[clampedFinal] || '10';
      const minIndex = minScrollRef.current ? Math.round(minScrollRef.current.scrollTop / ITEM_HEIGHT) : 0;
      const min = MINUTES[Math.max(0, Math.min(minIndex, MINUTES.length - 1))] || '00';
      
      setCurrentHour(parseInt(hour));
      setCurrentMin(parseInt(min));
      setTimeBump(false);
      requestAnimationFrame(() => setTimeBump(true));
    }, 80);
  };

  const handleMinScroll = () => {
    if (!minScrollRef.current) return;
    if (minTimeoutRef.current) clearTimeout(minTimeoutRef.current);
    
    minTimeoutRef.current = setTimeout(() => {
      if (!minScrollRef.current) return;
      const finalIndex = Math.round(minScrollRef.current.scrollTop / ITEM_HEIGHT);
      const clampedFinal = Math.max(0, Math.min(finalIndex, MINUTES.length - 1));
      
      minScrollRef.current.scrollTo({ top: clampedFinal * ITEM_HEIGHT, behavior: 'smooth' });
      
      const hourIndex = hourScrollRef.current ? Math.round(hourScrollRef.current.scrollTop / ITEM_HEIGHT) : 0;
      const hour = HOURS[Math.max(0, Math.min(hourIndex, HOURS.length - 1))] || '10';
      const min = MINUTES[clampedFinal] || '00';
      
      setCurrentHour(parseInt(hour));
      setCurrentMin(parseInt(min));
      setTimeBump(false);
      requestAnimationFrame(() => setTimeBump(true));
    }, 80);
  };

  const handleTimeItemClick = (type: 'hour' | 'min', index: number) => {
    const scroller = type === 'hour' ? hourScrollRef.current : minScrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
  };

  // REORDER CARDS - FLIP Animation
  const reorderCards = (changedCardId: string) => {
    const container = cardsListRef.current;
    if (!container) return;
    
    const cards = Array.from(container.querySelectorAll('.card-item')) as HTMLElement[];
    
    const positions = new Map<HTMLElement, { top: number; left: number }>();
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      positions.set(card, { top: rect.top, left: rect.left });
    });
    
    cards.sort((a, b) => {
      const statusOrder: Record<string, number> = { todo: 0, inprogress: 1, done: 2 };
      const statusA = statusOrder[a.dataset.status || 'todo'] || 0;
      const statusB = statusOrder[b.dataset.status || 'todo'] || 0;
      if (statusA !== statusB) return statusA - statusB;
      return (a.dataset.time || '00:00').localeCompare(b.dataset.time || '00:00');
    });
    
    cards.forEach(card => { card.style.transition = 'none'; });
    cards.forEach(card => container.appendChild(card));
    
    cards.forEach(card => {
      const oldPos = positions.get(card);
      if (!oldPos) return;
      
      const newRect = card.getBoundingClientRect();
      const deltaY = oldPos.top - newRect.top;
      
      if (Math.abs(deltaY) > 2) {
        card.style.transform = 'translateY(' + deltaY + 'px)';
        void card.offsetWidth;
        requestAnimationFrame(() => {
          card.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
          card.style.transform = 'translateY(0)';
        });
      }
      
      if (card.dataset.id === changedCardId) {
        setTimeout(() => {
          card.classList.add('card-flash');
          setTimeout(() => card.classList.remove('card-flash'), 600);
        }, 100);
      }
    });
    
    setTimeout(() => {
      cards.forEach(card => {
        card.style.transition = '';
        card.style.transform = '';
      });
    }, 700);
  };

  const confirmTime = async () => {
    if (!currentCardId) return;
    
    const hStr = currentHour.toString().padStart(2, '0');
    const mStr = currentMin.toString().padStart(2, '0');
    const timeStr = hStr + ':' + mStr;
    
    setCleanings(prev => prev.map(c => 
      c.id === currentCardId ? { ...c, scheduledTime: timeStr } : c
    ));
    
    closeAll();
    showSuccess('Orario: ' + timeStr);
    setTimeout(() => reorderCards(currentCardId), 300);
    
    try {
      await fetch('/api/dashboard/cleanings/' + currentCardId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledTime: timeStr }),
      });
    } catch (error) {
      console.error('Error updating time:', error);
    }
  };

  // OPERATOR PICKER
  const openOperatorPicker = (cardId: string) => {
    setCurrentCardId(cardId);
    setOperatorSearch('');
    lockScroll();
    setShowOverlay(true);
    setShowOperatorPicker(true);
  };

  const selectOperator = async (operator: Operator) => {
    if (!currentCardId) return;
    
    setCleanings(prev => prev.map(c => 
      c.id === currentCardId ? { ...c, operator: { id: operator.id, name: operator.name } } : c
    ));
    
    closeAll();
    showSuccess(getShortName(operator.name) + ' assegnato');
    
    try {
      await fetch('/api/dashboard/cleanings/' + currentCardId + '/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId: operator.id }),
      });
    } catch (error) {
      console.error('Error assigning operator:', error);
    }
  };

  // GUESTS PICKER
  const openGuestsPicker = (cardId: string) => {
    const cleaning = displayCleanings.find(c => c.id === cardId);
    if (!cleaning) return;
    
    setCurrentCardId(cardId);
    setGuestsData({ adults: cleaning.booking?.guestsCount || 2, infants: 0 });
    lockScroll();
    setShowOverlay(true);
    setShowGuestsPicker(true);
  };

  const changeGuests = (type: 'adults' | 'infants', delta: number) => {
    setGuestsData(prev => ({
      ...prev,
      [type]: type === 'adults' 
        ? Math.max(1, Math.min(10, prev.adults + delta))
        : Math.max(0, Math.min(5, prev.infants + delta))
    }));
  };

  const resetGuests = () => setGuestsData({ adults: 1, infants: 0 });

  const confirmGuests = async () => {
    if (!currentCardId) return;
    
    const total = guestsData.adults + guestsData.infants;
    
    setCleanings(prev => prev.map(c => 
      c.id === currentCardId ? { ...c, booking: { guestsCount: total, guestName: c.booking?.guestName || null } } : c
    ));
    
    let msg = total + ' ospiti';
    if (guestsData.infants > 0) {
      msg = msg + ' (+' + guestsData.infants + ' neonati)';
    }
    
    closeAll();
    showSuccess(msg);
    
    try {
      await fetch('/api/dashboard/cleanings/' + currentCardId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestsCount: total }),
      });
    } catch (error) {
      console.error('Error updating guests:', error);
    }
  };

  const { day, month, year } = formatDate(currentDate);

  const operatorColors = [
    'from-blue-400 to-blue-600',
    'from-pink-400 to-rose-600',
    'from-violet-400 to-purple-600',
    'from-emerald-400 to-teal-600',
    'from-amber-400 to-orange-600',
    'from-cyan-400 to-sky-600',
    'from-indigo-400 to-blue-600'
  ];
  
  const statusColors = ['bg-emerald-400', 'bg-emerald-400', 'bg-amber-400', 'bg-emerald-400', 'bg-red-400', 'bg-emerald-400', 'bg-slate-300'];
  const cleaningsToday = [3, 2, 1, 2, 4, 1, 0];

  return (
    <>
      <style jsx global>{`
        * { font-family: 'Inter', -apple-system, sans-serif; -webkit-tap-highlight-color: transparent; }
        body { background: #f1f5f9; }
        .hero-gradient { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%); }
        .picker-modal { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-radius: 24px 24px 0 0; transform: translateY(100%); transition: transform 0.3s ease; z-index: 60; }
        .picker-modal.active { transform: translateY(0); }
        .success-toast { position: fixed; top: 80px; left: 50%; transform: translateX(-50%) translateY(-20px) scale(0.9); opacity: 0; visibility: hidden; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); z-index: 200; pointer-events: none; }
        .success-toast.active { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; visibility: visible; }
        .success-toast.active .success-icon { animation: iconPop 0.5s ease forwards; }
        .success-toast.active .check-draw { animation: checkDraw 0.3s ease forwards 0.2s; }
        @keyframes iconPop { 0% { transform: scale(0) rotate(-180deg); } 100% { transform: scale(1) rotate(0deg); } }
        @keyframes checkDraw { 0% { stroke-dashoffset: 50; } 100% { stroke-dashoffset: 0; } }
        .check-draw { stroke-dasharray: 50; stroke-dashoffset: 50; }
        .date-navigator { background: linear-gradient(135deg, #fff 0%, #f8fafc 100%); box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .date-btn { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: all 0.2s ease; }
        .date-btn:active { transform: scale(0.92); }
        .date-display.slide-left { animation: slideLeft 0.3s ease; }
        .date-display.slide-right { animation: slideRight 0.3s ease; }
        @keyframes slideLeft { 0% { opacity: 0; transform: translateX(15px); } 100% { opacity: 1; transform: translateX(0); } }
        @keyframes slideRight { 0% { opacity: 0; transform: translateX(-15px); } 100% { opacity: 1; transform: translateX(0); } }
        .card-item { transition: transform 0.5s ease, opacity 0.3s ease; }
        .card-flash { animation: cardFlash 0.6s ease; }
        @keyframes cardFlash { 0%,100% { background: white; } 40% { background: #d1fae5; } }
        .filter-btn { transition: all 0.2s ease; }
        .filter-btn.active { background: rgba(255,255,255,0.35); transform: scale(1.02); box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
        .bottom-nav { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
        body.modal-open { overflow: hidden; position: fixed; width: 100%; }
        .operator-modal { max-height: 50vh; height: 50vh; }
        .operator-modal.keyboard-open { height: 380px; max-height: 380px; }
        .operator-modal .operators-list { height: calc(50vh - 140px); max-height: calc(50vh - 140px); }
        .operator-modal.keyboard-open .operators-list { height: 220px !important; max-height: 220px !important; }
        .stepper-btn { transition: all 0.15s ease; }
        .stepper-btn:active { transform: scale(0.9); }
        .stepper-btn:disabled { opacity: 0.3; pointer-events: none; }
        .btn-plus-adults { background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%); box-shadow: 0 4px 12px rgba(129, 140, 248, 0.3); }
        .btn-plus-infants { background: linear-gradient(135deg, #fda4af 0%, #fb7185 100%); box-shadow: 0 4px 12px rgba(251, 113, 133, 0.3); }
        @keyframes scaleIn { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .scale-in { animation: scaleIn 0.2s ease forwards; }
        .time-scroll { height: 180px; overflow-y: auto; scroll-snap-type: y mandatory; -webkit-overflow-scrolling: touch; mask-image: linear-gradient(to bottom, transparent, black 25%, black 75%, transparent); -webkit-mask-image: linear-gradient(to bottom, transparent, black 25%, black 75%, transparent); }
        .time-scroll::-webkit-scrollbar { display: none; }
        .time-item { height: 60px; scroll-snap-align: center; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 500; color: #cbd5e1; transition: all 0.15s ease; cursor: pointer; }
        .time-item.active { font-size: 34px; font-weight: 700; color: #0f172a; }
        .selection-indicator { position: absolute; top: 50%; left: 0; right: 0; height: 60px; transform: translateY(-50%); border-top: 2px solid #0ea5e9; border-bottom: 2px solid #0ea5e9; background: linear-gradient(90deg, rgba(14, 165, 233, 0.05) 0%, rgba(14, 165, 233, 0.08) 50%, rgba(14, 165, 233, 0.05) 100%); pointer-events: none; border-radius: 12px; }
        .time-display { transition: transform 0.2s ease; }
        .time-display.bump { animation: bump 0.3s ease; }
        @keyframes bump { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      `}</style>

      <div className="min-h-screen pb-24">
        <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-50 border-b border-slate-200/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                <span className="text-white text-lg">🏠</span>
              </div>
              <div>
                <h1 className="font-bold text-slate-800">CleanMaster</h1>
                <p className="text-[10px] text-slate-400">Gestione Pulizie</p>
              </div>
            </div>
            <button className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center relative">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </header>

        <main className="px-4 py-4">
          <div className="hero-gradient rounded-3xl p-4 mb-4 shadow-xl shadow-indigo-500/20">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-white/70 text-xs font-medium mb-1">Guadagno di oggi</p>
                <p className="text-4xl font-black text-white">€ {displayStats.totalEarnings}</p>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-1 bg-white/20 rounded-full px-2.5 py-1">
                  <svg className="w-3.5 h-3.5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
                  </svg>
                  <span className="text-xs font-bold text-white">+15%</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-white/20">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-300"></div>
                <span className="text-xs text-white/80">Pulizie: <span className="font-bold text-white">€{Math.round(displayStats.totalEarnings * 0.7)}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-300"></div>
                <span className="text-xs text-white/80">Biancheria: <span className="font-bold text-white">€{Math.round(displayStats.totalEarnings * 0.3)}</span></span>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setFilter('todo')} className={'filter-btn bg-white/20 rounded-2xl p-3 text-center ' + (currentFilter === 'todo' ? 'active' : '')}>
                <p className="text-2xl font-black text-white mb-0.5">{displayStats.todo}</p>
                <p className="text-[10px] font-medium text-white/80">Da fare</p>
              </button>
              <button onClick={() => setFilter('inprogress')} className={'filter-btn bg-white/20 rounded-2xl p-3 text-center ' + (currentFilter === 'inprogress' ? 'active' : '')}>
                <p className="text-2xl font-black text-white mb-0.5">{displayStats.inprogress}</p>
                <p className="text-[10px] font-medium text-white/80">In corso</p>
              </button>
              <button onClick={() => setFilter('done')} className={'filter-btn bg-white/20 rounded-2xl p-3 text-center ' + (currentFilter === 'done' ? 'active' : '')}>
                <p className="text-2xl font-black text-emerald-300 mb-0.5">{displayStats.done}</p>
                <p className="text-[10px] font-medium text-white/80">Completate</p>
              </button>
            </div>
          </div>

          <div className="date-navigator rounded-xl px-3 py-2 mb-3 flex items-center justify-between border border-slate-100">
            <button onClick={() => changeDay(-1)} className="date-btn w-9 h-9 rounded-lg flex items-center justify-center border border-slate-100">
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <div className={'date-display text-center flex items-center gap-2 ' + (dateAnimation || '')}>
              <p className="text-base font-black text-slate-800">{day}</p>
              <p className="text-xs font-medium text-slate-400">{month} {year}</p>
            </div>
            <button onClick={() => changeDay(1)} className="date-btn w-9 h-9 rounded-lg flex items-center justify-center border border-slate-100">
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-800">{getFilterTitle()}</h2>
            <span className="text-xs text-slate-400">{displayFilteredCleanings.length} attività</span>
          </div>

          <div className="space-y-3" ref={cardsListRef}>
            {displayFilteredCleanings.map((cleaning) => {
              const status = mapStatus(cleaning.status);
              const isDone = status === 'done';
              const isInProgress = status === 'inprogress';
              
              let cardClass = 'card-item bg-white rounded-2xl overflow-hidden shadow-sm ';
              if (isDone) {
                cardClass += 'border border-emerald-200 opacity-70';
              } else if (isInProgress) {
                cardClass += 'border-2 border-sky-300';
              } else {
                cardClass += 'border border-slate-200';
              }
              
              return (
                <div 
                  key={cleaning.id}
                  className={cardClass}
                  data-status={status}
                  data-time={cleaning.scheduledTime}
                  data-id={cleaning.id}
                >
                  <div className="flex items-center">
                    <div className="w-28 h-32 flex-shrink-0 relative">
                      <img src={cleaning.property.imageUrl || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=200&h=200&fit=crop'} className="w-full h-full object-cover" alt={cleaning.property.name}/>
                      {isDone && <div className="absolute inset-0 bg-emerald-500/20"></div>}
                      {isDone ? (
                        <div className="absolute top-2 left-2 px-2 py-1 text-white text-[10px] font-bold rounded-lg bg-emerald-500">✓ FATTO</div>
                      ) : isInProgress ? (
                        <div className="absolute top-2 left-2 px-2 py-1 text-white text-[10px] font-bold rounded-lg bg-sky-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>IN CORSO
                        </div>
                      ) : (
                        <div className="absolute top-2 left-2 px-2 py-1 text-white text-[10px] font-bold rounded-lg bg-amber-500">IN ATTESA</div>
                      )}
                    </div>
                    
                    <div className="flex-1 p-3">
                      <h3 className="font-bold text-slate-800 text-base mb-0.5">{cleaning.property.name}</h3>
                      <p className="text-xs text-slate-400 mb-3">{cleaning.property.address} • Max {cleaning.property.maxGuests} ospiti</p>
                      
                      <div className="flex items-center gap-2 mb-2">
                        {isDone ? (
                          <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
                            <span className="text-sm font-semibold">{cleaning.scheduledTime}</span>
                          </div>
                        ) : (
                          <button onClick={() => openTimePicker(cleaning.id)} className="flex items-center gap-1.5 text-sky-600 bg-sky-50 border border-sky-100 px-3 py-1.5 rounded-full">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <span className="text-sm font-semibold card-time">{cleaning.scheduledTime}</span>
                          </button>
                        )}
                        
                        {isDone ? (
                          <div className="flex items-center gap-1.5 text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                            <span className="text-sm font-semibold">{cleaning.booking?.guestsCount || 2}</span>
                          </div>
                        ) : (
                          <button onClick={() => openGuestsPicker(cleaning.id)} className="flex items-center gap-1.5 text-violet-600 bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-full">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            <span className="text-sm font-semibold">{cleaning.booking?.guestsCount || 2}</span>
                          </button>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {cleaning.operator && (
                          <button 
                            onClick={() => !isDone && !isInProgress && openOperatorPicker(cleaning.id)} 
                            className={'flex items-center gap-1 text-white pl-2 py-1 rounded-full ' + (isDone ? 'bg-slate-400 pr-2' : 'bg-emerald-500 pr-1.5')}
                          >
                            <span className="text-xs font-bold">{getInitials(cleaning.operator.name)}</span>
                            <span className="text-xs font-semibold">{getShortName(cleaning.operator.name)}</span>
                            {!isDone && !isInProgress && (
                              <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            )}
                          </button>
                        )}
                        {!isDone && !isInProgress && (
                          <button onClick={() => openOperatorPicker(cleaning.id)} className="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Freccia per aprire modal dettaglio */}
                    <button 
                      onClick={() => {
                        setEditingCleaning(cleaning);
                        setShowEditModal(true);
                      }}
                      className="pr-3 pl-2 py-4 -my-4 flex items-center justify-center hover:bg-slate-50 active:bg-slate-100 transition-colors"
                    >
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 bottom-nav z-40">
          <div className="flex items-center justify-around py-2">
            <button className="flex flex-col items-center gap-0.5 px-4 py-1 text-violet-600">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h1v7c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-7h1a1 1 0 00.707-1.707l-9-9a.999.999 0 00-1.414 0l-9 9A1 1 0 003 13zm7 7v-5h4v5h-4zm2-15.586l6 6V20h-3v-5c0-1.103-.897-2-2-2h-4c-1.103 0-2 .897-2 2v5H6v-8.586l6-6z"/></svg>
              <span className="text-[10px] font-semibold">Home</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 px-4 py-1 text-slate-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <span className="text-[10px] font-medium">Calendario</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 px-4 py-1 text-slate-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <span className="text-[10px] font-medium">Team</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 px-4 py-1 text-slate-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <span className="text-[10px] font-medium">Settings</span>
            </button>
          </div>
        </nav>

        {showOverlay && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={closeAll}/>}

        <div className={'success-toast ' + (showToast ? 'active' : '')}>
          <div className="flex items-center gap-2.5 bg-white px-4 py-3 rounded-full shadow-xl">
            <div className="success-icon w-8 h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path className="check-draw" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-700">{toastMessage}</span>
          </div>
        </div>

        <div className={'picker-modal shadow-2xl ' + (showTimePicker ? 'active' : '')}>
          <div className="p-6 pb-8">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-6"></div>
            <p className="text-center text-sm text-slate-400 mb-2">Seleziona orario</p>
            <div className="text-center mb-8">
              <span className={'time-display inline-block text-6xl font-extrabold text-slate-800 tracking-tight ' + (timeBump ? 'bump' : '')}>
                {currentHour.toString().padStart(2, '0')}:{currentMin.toString().padStart(2, '0')}
              </span>
            </div>
            
            <div className="flex items-center justify-center gap-2 mb-8">
              <div className="relative w-24">
                <div className="selection-indicator"></div>
                <div ref={hourScrollRef} className="time-scroll" onScroll={handleHourScroll}>
                  <div style={{height: '60px'}}></div>
                  {HOURS.map((hour, index) => (
                    <div 
                      key={hour} 
                      className={'time-item ' + (parseInt(hour) === currentHour ? 'active' : '')} 
                      data-val={hour} 
                      onClick={() => handleTimeItemClick('hour', index)}
                    >
                      {hour}
                    </div>
                  ))}
                  <div style={{height: '60px'}}></div>
                </div>
              </div>
              <span className="text-4xl font-bold text-slate-300 mx-2">:</span>
              <div className="relative w-24">
                <div className="selection-indicator"></div>
                <div ref={minScrollRef} className="time-scroll" onScroll={handleMinScroll}>
                  <div style={{height: '60px'}}></div>
                  {MINUTES.map((min, index) => (
                    <div 
                      key={min} 
                      className={'time-item ' + (parseInt(min) === currentMin ? 'active' : '')} 
                      data-val={min} 
                      onClick={() => handleTimeItemClick('min', index)}
                    >
                      {min}
                    </div>
                  ))}
                  <div style={{height: '60px'}}></div>
                </div>
              </div>
            </div>
            
            <button onClick={confirmTime} className="w-full py-4 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-2xl font-bold text-lg active:scale-[0.98] transition-transform shadow-lg shadow-sky-500/30">Conferma</button>
          </div>
        </div>

        <div className={'picker-modal operator-modal shadow-2xl ' + (showOperatorPicker ? 'active' : '') + ' ' + (keyboardOpen ? 'keyboard-open' : '')}>
          <div className="modal-content p-5 pb-6">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4"></div>
            <h3 className="text-base font-bold text-slate-800 mb-4">Seleziona operatore</h3>
            <div className="relative mb-4">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input 
                type="text" 
                value={operatorSearch} 
                onChange={(e) => setOperatorSearch(e.target.value)} 
                onFocus={() => setKeyboardOpen(true)} 
                onBlur={() => setTimeout(() => setKeyboardOpen(false), 150)} 
                placeholder="Cerca operatore..." 
                className="w-full pl-10 pr-4 py-3 bg-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
              />
            </div>
            <div className="operators-list overflow-y-auto space-y-2">
              {displayFilteredOperators.map((operator, index) => (
                <button 
                  key={operator.id} 
                  onClick={() => selectOperator(operator)} 
                  data-name={operator.name.toLowerCase()} 
                  className="operator-item w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 active:bg-slate-100"
                >
                  <div className={'w-10 h-10 rounded-full bg-gradient-to-br ' + operatorColors[index % operatorColors.length] + ' flex items-center justify-center text-white font-bold'}>{operator.name[0]}</div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-slate-800">{operator.name}</p>
                    <p className="text-xs text-slate-400">{cleaningsToday[index % cleaningsToday.length]} pulizie oggi</p>
                  </div>
                  <div className={'w-2 h-2 rounded-full ' + statusColors[index % statusColors.length]}></div>
                </button>
              ))}
            </div>
            {displayFilteredOperators.length === 0 && <div className="py-8 text-center"><p className="text-slate-400">Nessun operatore trovato</p></div>}
          </div>
        </div>

        <div className={'picker-modal shadow-2xl ' + (showGuestsPicker ? 'active' : '')}>
          <div className="p-5 pb-6">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5"></div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Numero ospiti</h3>
              <button onClick={resetGuests} className="text-sm text-slate-400">Reset</button>
            </div>
            
            <div className="flex items-center justify-between py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                </div>
                <p className="font-semibold text-slate-800">Adulti</p>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => changeGuests('adults', -1)} disabled={guestsData.adults <= 1} className="stepper-btn w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 12H4"/></svg>
                </button>
                <span className="text-xl font-bold text-slate-800 w-8 text-center">{guestsData.adults}</span>
                <button onClick={() => changeGuests('adults', 1)} className="stepper-btn btn-plus-adults w-10 h-10 rounded-full flex items-center justify-center text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
                </button>
              </div>
            </div>
            
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
                <button onClick={() => changeGuests('infants', -1)} disabled={guestsData.infants <= 0} className="stepper-btn w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M20 12H4"/></svg>
                </button>
                <span className="text-xl font-bold text-slate-800 w-8 text-center">{guestsData.infants}</span>
                <button onClick={() => changeGuests('infants', 1)} className="stepper-btn btn-plus-infants w-10 h-10 rounded-full flex items-center justify-center text-white">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16m8-8H4"/></svg>
                </button>
              </div>
            </div>
            
            <div className="bg-slate-50 rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-500">Anteprima</span>
                <span className="text-sm font-semibold text-slate-700">
                  {guestsData.infants > 0 ? (guestsData.adults + ' adulti + ' + guestsData.infants + ' neonati') : ((guestsData.adults + guestsData.infants) + ' ospiti')}
                </span>
              </div>
              <div className="flex items-end justify-center gap-1.5 min-h-[50px]">
                {Array.from({ length: guestsData.adults }).map((_, i) => (
                  <div key={'adult-' + i} className="scale-in flex flex-col items-center" style={{ animationDelay: (i * 0.03) + 's' }}>
                    <div className="w-5 h-5 rounded-full bg-indigo-200"></div>
                    <div className="w-7 h-9 bg-indigo-300 rounded-t-xl rounded-b-lg mt-0.5"></div>
                  </div>
                ))}
                {Array.from({ length: guestsData.infants }).map((_, i) => (
                  <div key={'infant-' + i} className="scale-in flex flex-col items-center" style={{ animationDelay: ((guestsData.adults + i) * 0.03) + 's' }}>
                    <div className="w-4 h-4 rounded-full bg-rose-200"></div>
                    <div className="w-5 h-6 bg-rose-300 rounded-t-lg rounded-b-md mt-0.5"></div>
                  </div>
                ))}
              </div>
            </div>
            
            <button onClick={confirmGuests} className="w-full py-4 bg-slate-800 text-white rounded-2xl font-semibold text-base active:scale-[0.98] transition-transform">Conferma</button>
          </div>
        </div>
      </div>

      {/* Modal Modifica Pulizia */}
      {showEditModal && editingCleaning && (
        <EditCleaningModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingCleaning(null);
          }}
          cleaning={{
            id: editingCleaning.id,
            propertyId: editingCleaning.property?.id || "",
            propertyName: editingCleaning.property?.name || "",
            date: new Date(editingCleaning.scheduledDate),
            scheduledTime: editingCleaning.scheduledTime || "10:00",
            status: editingCleaning.status,
            guestsCount: editingCleaning.booking?.guestsCount || 2,
            price: editingCleaning.price,
          }}
          property={{
            id: editingCleaning.property?.id || "",
            name: editingCleaning.property?.name || "",
            address: editingCleaning.property?.address || "",
            maxGuests: editingCleaning.property?.maxGuests || 10,
            cleaningPrice: editingCleaning.price || 0,
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingCleaning(null);
            fetchCleanings();
          }}
          userRole="ADMIN"
        />
      )}
    </>
  );
}
