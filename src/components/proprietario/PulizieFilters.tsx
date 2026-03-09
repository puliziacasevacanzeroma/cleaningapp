"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

type TimeFilter = "all" | "today" | "week" | "month" | "custom";
type StatusFilter = "all" | "completed" | "in_progress" | "scheduled";

function cleanAddress(address: string | undefined): string {
  if (!address) return '';
  const firstPart = address.split(',')[0].trim();
  return firstPart.replace(/\s*\d{5}\s*/g, '').trim();
}

const PROPERTY_COLORS = ['#8b5cf6', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];

interface PulizieFiltersProps {
  // Current filter values (from parent)
  timeFilter: TimeFilter;
  statusFilter: StatusFilter;
  selectedPropertyIds: string[];
  sortBy: string;
  customDateFrom: string;
  customDateTo: string;
  viewMode: string;
  // Data
  properties: any[];
  statusStats: { all: number; completed: number; in_progress: number; scheduled: number };
  // Callbacks
  onTimeFilterChange: (v: TimeFilter) => void;
  onStatusFilterChange: (v: StatusFilter) => void;
  onSelectedPropertyIdsChange: (v: string[] | ((prev: string[]) => string[])) => void;
  onSortByChange: (v: string) => void;
  onCustomDateFromChange: (v: string) => void;
  onCustomDateToChange: (v: string) => void;
  onSearchChange: (v: string) => void; // debounced search value
}

export const PulizieFilters = React.memo(function PulizieFilters({
  timeFilter: parentTimeFilter, statusFilter: parentStatusFilter, 
  selectedPropertyIds: parentPropertyIds, sortBy: parentSortBy,
  customDateFrom: parentDateFrom, customDateTo: parentDateTo, viewMode,
  properties, statusStats,
  onTimeFilterChange, onStatusFilterChange, onSelectedPropertyIdsChange,
  onSortByChange, onCustomDateFromChange, onCustomDateToChange, onSearchChange,
}: PulizieFiltersProps) {

  // ═══ STATO LOCALE — filtri reagiscono ISTANTANEAMENTE ═══
  // I valori locali si aggiornano subito, poi propagano al parent in modo asincrono
  const [timeFilter, setTimeFilter] = useState(parentTimeFilter);
  const [statusFilter, setStatusFilter] = useState(parentStatusFilter);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState(parentPropertyIds);
  const [sortBy, setSortBy] = useState(parentSortBy);
  const [customDateFrom, setCustomDateFrom] = useState(parentDateFrom);
  const [customDateTo, setCustomDateTo] = useState(parentDateTo);

  // Sync da parent (quando deep-link o reset esterno cambia i filtri)
  useEffect(() => { setTimeFilter(parentTimeFilter); }, [parentTimeFilter]);
  useEffect(() => { setStatusFilter(parentStatusFilter); }, [parentStatusFilter]);
  useEffect(() => { setSelectedPropertyIds(parentPropertyIds); }, [parentPropertyIds]);
  useEffect(() => { setSortBy(parentSortBy); }, [parentSortBy]);
  useEffect(() => { setCustomDateFrom(parentDateFrom); }, [parentDateFrom]);
  useEffect(() => { setCustomDateTo(parentDateTo); }, [parentDateTo]);

  // Propaga al parent DOPO il paint (non blocca il touch)
  const propagate = useCallback((fn: () => void) => {
    requestAnimationFrame(() => setTimeout(fn, 0));
  }, []);

  // Wrapper che aggiornano locale + propagano
  const changeTimeFilter = useCallback((v: TimeFilter) => {
    setTimeFilter(v);
    propagate(() => onTimeFilterChange(v));
  }, [onTimeFilterChange, propagate]);
  
  const changeStatusFilter = useCallback((v: StatusFilter) => {
    setStatusFilter(v);
    propagate(() => onStatusFilterChange(v));
  }, [onStatusFilterChange, propagate]);
  
  const changeSortBy = useCallback((v: string) => {
    setSortBy(v);
    propagate(() => onSortByChange(v));
  }, [onSortByChange, propagate]);
  
  const changePropertyIds = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    if (typeof v === 'function') {
      setSelectedPropertyIds(prev => {
        const newVal = (v as (p: string[]) => string[])(prev);
        propagate(() => onSelectedPropertyIdsChange(newVal));
        return newVal;
      });
    } else {
      setSelectedPropertyIds(v);
      propagate(() => onSelectedPropertyIdsChange(v));
    }
  }, [onSelectedPropertyIdsChange, propagate]);
  
  const changeDateFrom = useCallback((v: string) => {
    setCustomDateFrom(v);
    propagate(() => onCustomDateFromChange(v));
  }, [onCustomDateFromChange, propagate]);
  
  const changeDateTo = useCallback((v: string) => {
    setCustomDateTo(v);
    propagate(() => onCustomDateToChange(v));
  }, [onCustomDateToChange, propagate]);

  // ═══ STATO UI INTERNO — dropdown, focus, etc ═══
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [dateSelectMode, setDateSelectMode] = useState<"from" | "to">("from");

  // 🚀 Date picker: stato temporaneo locale (selezione istantanea, zero propagazione)
  const [tempDateFrom, setTempDateFrom] = useState(customDateFrom);
  const [tempDateTo, setTempDateTo] = useState(customDateTo);
  // Sync quando si apre il picker o il parent cambia
  useEffect(() => { if (showDatePicker) { setTempDateFrom(customDateFrom); setTempDateTo(customDateTo); } }, [showDatePicker]);
  useEffect(() => { setTempDateFrom(parentDateFrom); }, [parentDateFrom]);
  useEffect(() => { setTempDateTo(parentDateTo); }, [parentDateTo]);

  // Debounce search
  // @ts-expect-error TODO-FIX: TS2554 Expected 1 arguments, but got 0.
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => onSearchChange(value), 200);
  }, [onSearchChange]);

  // Close dropdown on scroll
  useEffect(() => {
    if (!searchFocused) return;
    const handleScroll = () => { setSearchFocused(false); setSearchTerm(""); propagate(() => onSearchChange("")); };
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [searchFocused, onSearchChange]);

  const filtersRowRef = useRef<HTMLDivElement>(null);

  // In calendario: mostra solo ricerca + sort, nascondi date/periodo/stato
  const isCalendar = viewMode === "calendar";

  return (
    <>
      {/* ═══ FILTRI — Search full + Date/Periodo/Filtro sotto ═══ */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Riga 1: Search FULL WIDTH con multiselect */}
          <div className="relative">
            <div 
              className="flex items-center flex-wrap gap-[5px] min-h-[40px] py-1.5 pl-2 pr-3 bg-slate-50 border border-slate-200 rounded-[10px] focus-within:ring-2 focus-within:ring-violet-500 focus-within:border-transparent cursor-text"
              onClick={() => setSearchFocused(true)}
            >
              {/* Icona lente */}
              <svg className="w-[14px] h-[14px] text-slate-400 flex-shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {/* Chips proprietà selezionate */}
              {selectedPropertyIds.map(id => {
                const p = properties.find(pr => pr.id === id);
                if (!p) return null;
                const idx = properties.indexOf(p);
                return (
                  <div key={id} className="flex items-center gap-[4px] py-[3px] pl-[3px] pr-[6px] rounded-[7px] bg-violet-50 border border-violet-200">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-[22px] h-[22px] rounded-[5px] object-cover" />
                    ) : (
                      <div className="w-[22px] h-[22px] rounded-[5px] flex items-center justify-center text-white text-[9px] font-bold"
                        style={{ background: PROPERTY_COLORS[idx % PROPERTY_COLORS.length] }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[11px] font-semibold text-violet-700 max-w-[80px] truncate">{p.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); changePropertyIds(prev => prev.filter(x => x !== id)); }}
                      className="flex items-center justify-center w-[14px] h-[14px] rounded-full bg-violet-200 hover:bg-violet-300 transition-colors ml-[2px]"
                    >
                      <svg className="w-[8px] h-[8px] text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                );
              })}
              {/* Input */}
              <input
                type="text"
                placeholder={selectedPropertyIds.length > 0 ? "Aggiungi..." : "Cerca proprietà..."}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className="flex-1 min-w-[80px] py-1 bg-transparent text-[13px] focus:outline-none"
              />
              {/* Clear all */}
              {(selectedPropertyIds.length > 0 || searchTerm) && (
                <button
                  onClick={(e) => { e.stopPropagation(); changePropertyIds([]); setSearchTerm(""); propagate(() => onSearchChange("")); }}
                  className="flex items-center justify-center w-[20px] h-[20px] rounded-full bg-slate-200 hover:bg-slate-300 transition-colors flex-shrink-0"
                >
                  <svg className="w-[10px] h-[10px] text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              )}
            </div>
            {/* Multiselect dropdown — resta aperto finché non clicchi fuori o confermi */}
            {searchFocused && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-[60] overflow-hidden">
                  {/* Header con contatore + conferma */}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <span className="text-[11px] font-semibold text-slate-500">
                      {selectedPropertyIds.length > 0 
                        ? `${selectedPropertyIds.length} selezionat${selectedPropertyIds.length === 1 ? "a" : "e"}`
                        : "Seleziona proprietà"
                      }
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedPropertyIds.length > 0 && (
                        <button
                          onClick={() => { changePropertyIds([]); }}
                          className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          Deseleziona
                        </button>
                      )}
                      <button
                        onClick={() => { setSearchFocused(false); setSearchTerm(""); propagate(() => onSearchChange("")); }}
                        className="flex items-center gap-1 px-3 py-[5px] rounded-[7px] text-[10px] font-bold text-white transition-colors"
                        style={{ background: "#6366f1" }}
                      >
                        <svg className="w-[10px] h-[10px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                        OK
                      </button>
                    </div>
                  </div>
                  {/* Lista proprietà */}
                  <div className="max-h-[220px] overflow-y-auto">
                    {properties
                      .filter(p => {
                        if (!searchTerm) return true;
                        return p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.address && p.address.toLowerCase().includes(searchTerm.toLowerCase()));
                      })
                      .map((p, i) => {
                        const isSelected = selectedPropertyIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => { 
                              if (isSelected) {
                                changePropertyIds(prev => prev.filter(x => x !== p.id));
                              } else {
                                changePropertyIds(prev => [...prev, p.id]);
                              }
                              setSearchTerm(""); propagate(() => onSearchChange(""));
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left"
                            style={{ 
                              background: isSelected ? "#f5f3ff" : "transparent",
                              borderBottom: "1px solid #f1f5f9",
                            }}
                          >
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="w-[40px] h-[40px] rounded-[8px] object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-[40px] h-[40px] rounded-[8px] flex-shrink-0 flex items-center justify-center text-white text-[14px] font-bold"
                                style={{ background: PROPERTY_COLORS[i % PROPERTY_COLORS.length] }}
                              >
                                {p.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className={`text-[12px] font-bold truncate ${isSelected ? "text-violet-700" : "text-slate-800"}`}>{p.name}</div>
                              {p.address && <div className="text-[10px] text-slate-400 truncate">{cleanAddress(p.address)}</div>}
                              <div className="flex items-center gap-2 mt-[1px]">
                                {p.bedsConfig && p.bedsConfig.length > 0 && <span className="text-[9px] text-slate-400">{p.bedsConfig.length} letti</span>}
                                {p.maxGuests && <span className="text-[9px] text-slate-400">· max {p.maxGuests} ospiti</span>}
                              </div>
                            </div>
                            {/* Checkbox */}
                            <div className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center flex-shrink-0 transition-all"
                              style={{
                                background: isSelected ? "#6366f1" : "transparent",
                                border: isSelected ? "none" : "2px solid #cbd5e1",
                              }}
                            >
                              {isSelected && (
                                <svg className="w-[13px] h-[13px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                              )}
                            </div>
                          </button>
                        );
                      })
                    }
                    {properties.filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.address && p.address.toLowerCase().includes(searchTerm.toLowerCase()))).length === 0 && (
                      <div className="px-4 py-3 text-[11px] text-slate-400 text-center">Nessuna proprietà trovata</div>
                    )}
                  </div>
                </div>
            )}
          </div>

          {/* Riga 2: Date sx — Periodo centro — Filtro dx (solo lista) */}
          <div ref={filtersRowRef} data-filters-row className="flex items-center justify-between" style={{ display: isCalendar ? "none" : "flex" }}>
            {/* Date a sinistra */}
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-[5px] py-[6px] px-3 rounded-[8px] border text-[10px] font-bold cursor-pointer transition-all"
              style={{
                background: timeFilter === "custom" ? "#f0f0ff" : "#f8fafc",
                borderColor: timeFilter === "custom" ? "#e0e0ff" : "#e2e8f0",
                color: "#6366f1",
              }}
            >
              <svg className="w-[12px] h-[12px]" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              {timeFilter === "custom" && customDateFrom ? (
                <span>
                  {new Date(customDateFrom).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                  {customDateTo && ` → ${new Date(customDateTo).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`}
                </span>
              ) : (
                <span>Date</span>
              )}
            </button>

            {/* Periodo al centro */}
            <div className="relative">
              <button
                onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                className="flex items-center gap-[4px] py-[6px] px-3 rounded-[8px] border-none text-[11px] font-bold cursor-pointer"
                style={{ background: "#1e293b", color: "#fff" }}
              >
                <svg className="w-[12px] h-[12px]" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                {timeFilter === "today" ? "Oggi" : timeFilter === "week" ? "7 giorni" : timeFilter === "month" ? "30 giorni" : timeFilter === "all" ? "Tutte" : "Periodo"}
                <svg className="w-[10px] h-[10px]" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 9l-7 7-7-7"/></svg>
              </button>
              {showPeriodDropdown && (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setShowPeriodDropdown(false)} />
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden min-w-[160px]">
                    {[
                      { key: "today" as TimeFilter, label: "Oggi" },
                      { key: "week" as TimeFilter, label: "7 giorni" },
                      { key: "month" as TimeFilter, label: "30 giorni" },
                      { key: "all" as TimeFilter, label: "Tutte" },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => { changeTimeFilter(f.key); changeDateFrom(""); changeDateTo(""); setShowPeriodDropdown(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-3 text-[12px] font-semibold transition-colors ${
                          timeFilter === f.key && timeFilter !== "custom" ? "bg-slate-50 text-slate-900" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span>{f.label}</span>
                        {timeFilter === f.key && timeFilter !== "custom" && (
                          <svg className="w-4 h-4 ml-auto text-violet-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Filtro stato a destra */}
            {viewMode === "list" ? (
              <button
                onClick={() => setShowStatusPanel(!showStatusPanel)}
                className="relative flex items-center gap-[5px] py-[6px] px-3 rounded-[8px] border cursor-pointer transition-all"
                style={{
                  background: showStatusPanel || statusFilter !== "all" ? "#f0f0ff" : "#f8fafc",
                  borderColor: showStatusPanel || statusFilter !== "all" ? "#e0e0ff" : "#e2e8f0",
                  color: showStatusPanel || statusFilter !== "all" ? "#6366f1" : "#475569",
                  fontSize: 10, fontWeight: 700,
                }}
              >
                <svg className="w-[13px] h-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
                Filtro
                <span className="flex items-center justify-center min-w-[16px] h-[16px] px-[4px] rounded-[5px] text-[8px] font-extrabold text-white" style={{ background: "#6366f1" }}>{statusStats.all}</span>
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="flex items-center gap-1 px-2 py-[6px] bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:border-slate-300 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-50" onClick={() => setShowSortMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden min-w-[180px]">
                      <button onClick={() => { changeSortBy("name"); setShowSortMenu(false); }} className={`w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors ${sortBy === "name" ? "bg-violet-50 text-violet-700" : "text-slate-700 active:bg-slate-100"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9" /></svg>
                        <span>Ordine Alfabetico</span>
                        {sortBy === "name" && <svg className="w-4 h-4 ml-auto text-violet-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                      </button>
                      <button onClick={() => { changeSortBy("next_cleaning"); setShowSortMenu(false); }} className={`w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors ${sortBy === "next_cleaning" ? "bg-violet-50 text-violet-700" : "text-slate-700 active:bg-slate-100"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg>
                        <span>Prossima Pulizia</span>
                        {sortBy === "next_cleaning" && <svg className="w-4 h-4 ml-auto text-violet-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Calendario custom — Modal CENTRATA con conferma ═══ */}
      {showDatePicker && !isCalendar && (() => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDow = (firstDay.getDay() + 6) % 7;
        const daysInMonth = lastDay.getDate();
        const todayCal = new Date(); todayCal.setHours(0,0,0,0);
        const monthNames = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
        const fromDate = tempDateFrom ? new Date(tempDateFrom) : null;
        const toDate = tempDateTo ? new Date(tempDateTo) : null;
        if (fromDate) fromDate.setHours(0,0,0,0);
        if (toDate) toDate.setHours(0,0,0,0);
        const handleDayClick = (day: number) => {
          const clicked = new Date(year, month, day);
          const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          if (dateSelectMode === "from") {
            setTempDateFrom(dateStr);
            if (toDate && clicked > toDate) setTempDateTo("");
            setDateSelectMode("to");
          } else {
            if (fromDate && clicked < fromDate) { setTempDateTo(tempDateFrom); setTempDateFrom(dateStr); }
            else { setTempDateTo(dateStr); }
            setDateSelectMode("from");
          }
        };
        const isInRange = (day: number) => { if (!fromDate || !toDate) return false; const d = new Date(year, month, day); d.setHours(0,0,0,0); return d > fromDate && d < toDate; };
        const isFrom = (day: number) => { if (!fromDate) return false; const d = new Date(year, month, day); d.setHours(0,0,0,0); return d.getTime() === fromDate.getTime(); };
        const isTo = (day: number) => { if (!toDate) return false; const d = new Date(year, month, day); d.setHours(0,0,0,0); return d.getTime() === toDate.getTime(); };
        const isTodayCal = (day: number) => { const d = new Date(year, month, day); d.setHours(0,0,0,0); return d.getTime() === todayCal.getTime(); };
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-5" style={{ background: "rgba(0,0,0,0.45)" }}>
            <div className="absolute inset-0" onClick={() => setShowDatePicker(false)} />
            <div className="relative w-full max-w-[360px] bg-white rounded-[20px] px-5 pt-5 pb-4 shadow-2xl" style={{ animation: "banner-fade 0.25s ease" }}>
              {/* Titolo */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-[14px] font-bold text-slate-800">Seleziona periodo</span>
                <button onClick={() => setShowDatePicker(false)} className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              
              {/* Da → A selettori */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setDateSelectMode("from")}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-[8px] rounded-[10px] text-[11px] font-bold transition-all"
                  style={{ background: dateSelectMode === "from" ? "#6366f1" : "#f1f5f9", color: dateSelectMode === "from" ? "#fff" : "#64748b" }}
                >
                  Da: {tempDateFrom ? new Date(tempDateFrom).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—"}
                </button>
                <svg className="w-3 h-3 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                <button
                  onClick={() => setDateSelectMode("to")}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-[8px] rounded-[10px] text-[11px] font-bold transition-all"
                  style={{ background: dateSelectMode === "to" ? "#6366f1" : "#f1f5f9", color: dateSelectMode === "to" ? "#fff" : "#64748b" }}
                >
                  A: {tempDateTo ? new Date(tempDateTo).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—"}
                </button>
              </div>
              
              {/* Navigazione mese */}
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition-colors">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                </button>
                <span className="text-[13px] font-bold text-slate-800">{monthNames[month]} {year}</span>
                <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition-colors">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
              
              {/* Giorni settimana */}
              <div className="grid grid-cols-7 gap-0 mb-1">
                {["Lu","Ma","Me","Gi","Ve","Sa","Do"].map(d => (
                  <div key={d} className="text-center text-[9px] font-bold text-slate-400 uppercase py-1">{d}</div>
                ))}
              </div>
              
              {/* Griglia giorni */}
              <div className="grid grid-cols-7 gap-0 mb-4">
                {Array.from({ length: startDow }, (_, i) => (<div key={`e-${i}`} className="h-[38px]" />))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1; const from = isFrom(day); const to = isTo(day); const inRange = isInRange(day); const today = isTodayCal(day);
                  return (
                    <button key={day} onClick={() => handleDayClick(day)} className="h-[38px] flex items-center justify-center text-[12px] font-semibold transition-all relative"
                      style={{
                        background: from || to ? "#6366f1" : inRange ? "rgba(99,102,241,0.08)" : "transparent",
                        color: from || to ? "#fff" : inRange ? "#6366f1" : today ? "#6366f1" : "#334155",
                        borderRadius: from && to ? "8px" : from ? "8px 0 0 8px" : to ? "0 8px 8px 0" : (!tempDateTo && from) || (!tempDateFrom && to) ? "8px" : "0",
                      }}
                    >
                      {today && !from && !to && (<div className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-[4px] h-[4px] rounded-full bg-violet-500" />)}
                      {day}
                    </button>
                  );
                })}
              </div>
              
              {/* Bottoni azione: Reset + Conferma */}
              <div className="flex items-center gap-2">
                {(tempDateFrom || tempDateTo) && (
                  <button
                    onClick={() => { setTempDateFrom(""); setTempDateTo(""); changeDateFrom(""); changeDateTo(""); changeTimeFilter("week"); setDateSelectMode("from"); }}
                    className="flex-1 flex items-center justify-center gap-1 py-[10px] rounded-[10px] bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-500 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    Reset
                  </button>
                )}
                <button
                  onClick={() => { 
                    // 🚀 Propaga al parent SOLO al Conferma
                    changeDateFrom(tempDateFrom); 
                    changeDateTo(tempDateTo); 
                    if (tempDateFrom) changeTimeFilter("custom");
                    setShowDatePicker(false); 
                  }}
                  className="flex-1 flex items-center justify-center gap-1 py-[10px] rounded-[10px] text-[11px] font-bold text-white transition-colors"
                  style={{ background: tempDateFrom ? "#6366f1" : "#94a3b8" }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                  Conferma
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Status filter panel (espandibile) */}
      {showStatusPanel && viewMode === "list" && (
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
          <div className="max-w-4xl mx-auto flex items-center gap-[6px]">
            <span className="text-[9px] font-bold text-slate-400 uppercase flex-shrink-0" style={{ letterSpacing: "1px" }}>Stato</span>
            <div className="flex gap-[3px] flex-1">
              {[
                { key: "all" as StatusFilter, label: "Tutte", count: statusStats.all, activeBg: "#1e293b", activeText: "#fff", offBg: "#f1f5f9", offText: "#64748b", dotColor: "" },
                { key: "completed" as StatusFilter, label: "Fatte", count: statusStats.completed, activeBg: "#059669", activeText: "#fff", offBg: "#ecfdf5", offText: "#059669", dotColor: "#10b981" },
                { key: "in_progress" as StatusFilter, label: "Corso", count: statusStats.in_progress, activeBg: "#d97706", activeText: "#fff", offBg: "#fef9c3", offText: "#d97706", dotColor: "#f59e0b" },
                { key: "scheduled" as StatusFilter, label: "Prog.", count: statusStats.scheduled, activeBg: "#2563eb", activeText: "#fff", offBg: "#eff6ff", offText: "#2563eb", dotColor: "#3b82f6" },
              ].map(f => {
                const active = statusFilter === f.key;
                return (
                  <button key={f.key} onClick={() => changeStatusFilter(f.key)}
                    className="flex-1 flex items-center justify-center gap-[3px] py-[5px] rounded-[7px] cursor-pointer transition-all"
                    style={{ background: active ? f.activeBg : f.offBg, color: active ? f.activeText : f.offText, fontSize: 10, fontWeight: 700, fontFamily: "inherit", border: active ? "none" : `1px solid ${f.offBg}` }}
                  >
                    {f.dotColor && (<span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: active ? "#fff" : f.dotColor }} />)}
                    {f.label} {f.count}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}


    </>
  );
});
