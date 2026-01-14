"use client";

import { useState, useRef, useEffect } from "react";
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

export function DashboardContent({ userName, stats, cleanings: initialCleanings, operators }: DashboardContentProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Stato per la data selezionata
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [cleanings, setCleanings] = useState<Cleaning[]>(initialCleanings);
  const [loadingCleanings, setLoadingCleanings] = useState(false);

  // Stati per modifica inline
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState("");
  const [editingGuestsId, setEditingGuestsId] = useState<string | null>(null);
  const [editingGuests, setEditingGuests] = useState("");
  const timeInputRef = useRef<HTMLInputElement>(null);
  const guestsInputRef = useRef<HTMLInputElement>(null);

  // Stato locale per operatori multipli
  const [cleaningOperators, setCleaningOperators] = useState<Record<string, Operator[]>>({});

  // Carica pulizie per data selezionata
  const loadCleaningsForDate = async (date: Date) => {
    setLoadingCleanings(true);
    try {
      const dateStr = date.toISOString().split('T')[0];
      const response = await fetch(`/api/dashboard/cleanings?date=${dateStr}`);
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

  // Navigazione giorni
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

  const isToday = () => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  };

  // Inizializza operatori dalle pulizie
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

  // Focus sull'input quando si attiva editing
  useEffect(() => {
    if (editingTimeId && timeInputRef.current) {
      timeInputRef.current.focus();
    }
  }, [editingTimeId]);

  useEffect(() => {
    if (editingGuestsId && guestsInputRef.current) {
      guestsInputRef.current.focus();
      guestsInputRef.current.select();
    }
  }, [editingGuestsId]);

  const formattedDate = selectedDate.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const filteredCleanings = cleanings.filter(c =>
    c.property.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.property.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // Colori per operatori
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

  const handleAssignClick = (cleaning: Cleaning) => {
    setSelectedCleaning(cleaning);
    setShowAssignModal(true);
  };

  const handleAssignOperator = async (operatorId: string) => {
    if (!selectedCleaning) return;

    setAssigning(true);
    try {
      const response = await fetch(`/api/dashboard/cleanings/${selectedCleaning.id}/assign`, {
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
      await fetch(`/api/dashboard/cleanings/${cleaningId}/assign`, {
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
      await fetch(`/api/dashboard/cleanings/${cleaningId}`, {
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
      await fetch(`/api/dashboard/cleanings/${cleaningId}`, {
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

  return (
    <>
      <div className="p-8 overflow-x-hidden">
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
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-slate-800">{stats.cleaningsToday}</span>
              </div>
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
              <button 
                onClick={goToPreviousDay}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button 
                onClick={goToToday}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  isToday() 
                    ? "bg-sky-500 text-white" 
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Oggi
              </button>
              <button 
                onClick={goToNextDay}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Cerca proprietà..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm w-40 placeholder:text-slate-400"
              />
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
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                Nessuna pulizia per {isToday() ? "oggi" : "questo giorno"}
              </h3>
              <p className="text-slate-500">Le pulizie programmate appariranno qui</p>
            </div>
          ) : (
            filteredCleanings.map((cleaning) => {
              const assignedOperators = cleaningOperators[cleaning.id] || [];

              return (
                <div
                  key={cleaning.id}
                  className="group bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50"
                >
                  <div className="flex">
                    <div className="w-56 h-44 overflow-hidden bg-slate-100 flex-shrink-0">
                      {cleaning.property.imageUrl ? (
                        <img
                          src={cleaning.property.imageUrl}
                          alt={cleaning.property.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
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
                                <input
                                  ref={timeInputRef}
                                  type="time"
                                  value={editingTime}
                                  onChange={(e) => setEditingTime(e.target.value)}
                                  onBlur={() => handleTimeSave(cleaning.id)}
                                  onKeyDown={(e) => e.key === "Enter" && handleTimeSave(cleaning.id)}
                                  className="bg-transparent border-none outline-none text-sm font-medium text-sky-700 w-20"
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => handleTimeClick(cleaning)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-sky-50 hover:ring-2 hover:ring-sky-200 transition-all cursor-pointer"
                                title="Clicca per modificare"
                              >
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
                                <input
                                  ref={guestsInputRef}
                                  type="number"
                                  min="1"
                                  value={editingGuests}
                                  onChange={(e) => setEditingGuests(e.target.value)}
                                  onBlur={() => handleGuestsSave(cleaning.id)}
                                  onKeyDown={(e) => e.key === "Enter" && handleGuestsSave(cleaning.id)}
                                  className="bg-transparent border-none outline-none text-sm font-medium text-sky-700 w-12"
                                />
                                <span className="text-sm text-sky-600">ospiti</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleGuestsClick(cleaning)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-sky-50 hover:ring-2 hover:ring-sky-200 transition-all cursor-pointer"
                                title="Clicca per modificare"
                              >
                                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <span className="text-sm font-medium text-slate-700">
                                  {cleaning.guestsCount || cleaning.booking?.guestsCount || 2} ospiti
                                </span>
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
                                <div
                                  key={operator.id}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r ${getOperatorColor(operator.id)} shadow-md group/op`}
                                >
                                  <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">{getInitials(operator.name)}</span>
                                  </div>
                                  <span className="text-sm font-medium text-white">{operator.name}</span>
                                  <button
                                    onClick={() => handleRemoveOperator(cleaning.id, operator.id)}
                                    className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center opacity-0 group-hover/op:opacity-100 transition-opacity"
                                    title="Rimuovi operatore"
                                  >
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}

                              <button
                                onClick={() => handleAssignClick(cleaning)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="text-sm font-medium">
                                  {assignedOperators.length === 0 ? "Assegna operatore" : "Aggiungi"}
                                </span>
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

      {/* Modal Assegna Operatore */}
      {showAssignModal && selectedCleaning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Assegna Operatore</h3>
                  <p className="text-sky-100 text-sm">{selectedCleaning.property.name}</p>
                </div>
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedCleaning(null);
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
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
                    <button
                      key={operator.id}
                      onClick={() => handleAssignOperator(operator.id)}
                      disabled={assigning}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-sky-400 hover:bg-sky-50 transition-all disabled:opacity-50"
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-r ${operatorColors[index % operatorColors.length]} flex items-center justify-center shadow-md`}>
                        <span className="text-sm font-bold text-white">{getInitials(operator.name)}</span>
                      </div>
                      <span className="font-medium text-slate-800">{operator.name}</span>
                    </button>
                  ))
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedCleaning(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium"
                >
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
