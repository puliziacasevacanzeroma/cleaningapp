"use client";

import { useState, useEffect, useMemo } from "react";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { SGROSSO_REASONS, SgrossoReasonCode } from "~/types/serviceType";

// ==================== ICONS ====================
const I: { [key: string]: React.ReactNode } = {
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  bedSingle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M5 18V13C5 12 6 11 7 11H17C18 11 19 12 19 13V18M5 20V18M19 20V18M8 11V9C8 8 9 7 10 7H14C15 7 16 8 16 9V11"/><rect x="8" y="11" width="8" height="3" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  bedDouble: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/><path d="M12 10V7"/></svg>,
  sofa: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 12V10C4 9 5 8 6 8H18C19 8 20 9 20 10V12"/><rect x="4" y="12" width="16" height="5" rx="1" fill="currentColor" opacity="0.15"/><path d="M6 17V19M18 17V19"/></svg>,
  bunk: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M4 22V2M20 22V2M4 14H20M4 8H20"/><rect x="6" y="9" width="12" height="4" rx="1" fill="currentColor" opacity="0.1"/><rect x="6" y="15" width="12" height="4" rx="1" fill="currentColor" opacity="0.1"/></svg>,
  towel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="3" width="12" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M6 7H18M6 11H18"/></svg>,
  soap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="8" width="12" height="12" rx="2" fill="currentColor" opacity="0.1"/><path d="M10 8V6C10 5 11 4 12 4C13 4 14 5 14 6V8M9 12H15M9 15H13"/></svg>,
  gift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="8" width="18" height="13" rx="2" fill="currentColor" opacity="0.1"/><path d="M12 8V21M3 12H21M12 8C12 8 12 5 9.5 5C8 5 7 6 7 7C7 8 8 8 12 8M12 8C12 8 12 5 14.5 5C16 5 17 6 17 7C17 8 16 8 12 8"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full h-full"><path d="M5 13L9 17L19 7"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M12 5V19M5 12H19"/></svg>,
  minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M5 12H19"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M18 6L6 18M6 6L18 18"/></svg>,
  down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M6 9L12 15L18 9"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M3 10H21M8 2V6M16 2V6"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1"/><path d="M12 6V12L16 14"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><circle cx="9" cy="7" r="3" fill="currentColor" opacity="0.1"/><path d="M9 13C5 13 3 16 3 19H15C15 16 13 13 9 13Z" fill="currentColor" opacity="0.1"/><circle cx="17" cy="7" r="2.5"/><path d="M17 11.5C19 11.5 21 13.5 21 16H15"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 6H21M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6H19Z" fill="currentColor" opacity="0.1"/></svg>,
  edit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M11 4H4C2.9 4 2 4.9 2 6V20C2 21.1 2.9 22 4 22H18C19.1 22 20 21.1 20 20V13"/><path d="M18.5 2.5C19.3 1.7 20.7 1.7 21.5 2.5C22.3 3.3 22.3 4.7 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z"/></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 12L12 3L21 12" /><path d="M5 10V20C5 20.6 5.4 21 6 21H9V15H15V21H18C18.6 21 19 20.6 19 20V10" fill="currentColor" opacity="0.1"/></svg>,
};

const PersonIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <circle cx="12" cy="7" r="3.5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5.5 21C5.5 16.5 8 13 12 13S18.5 16.5 18.5 21" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ==================== TYPES ====================
interface Bed { id: string; type: string; name: string; loc: string; cap: number; }
interface Property { id: string; name: string; address?: string; maxGuests?: number; bedrooms?: number; bathrooms?: number; cleaningPrice?: number; bedsConfig?: Bed[]; serviceConfigs?: Record<number, GuestConfig>; }
interface GuestConfig { beds: string[]; bl: Record<string, Record<string, number>>; ba: Record<string, number>; ki: Record<string, number>; ex: Record<string, boolean>; }
interface Cleaning { 
  id: string; 
  propertyId: string; 
  propertyName?: string; 
  date: Date; 
  scheduledTime?: string; 
  status: string; 
  guestsCount?: number; 
  notes?: string; 
  price?: number;
  // Nuovi campi per tipo servizio
  serviceType?: string;
  serviceTypeName?: string;
  sgrossoReason?: SgrossoReasonCode;
  sgrossoReasonLabel?: string;
  sgrossoNotes?: string;
  contractPrice?: number;
  priceModified?: boolean;
  priceChangeReason?: string;
}
interface LinenItem { id: string; n: string; p: number; d: number; }
interface ServiceType { id: string; name: string; code: string; icon: string; color: string; adminOnly: boolean; }
interface EditCleaningModalProps { 
  isOpen: boolean; 
  onClose: () => void; 
  cleaning: Cleaning; 
  property: Property; 
  onSuccess?: () => void;
  userRole?: "ADMIN" | "PROPRIETARIO" | "OPERATORE";
}

// ==================== UTILITY FUNCTIONS ====================
const formatPrice = (price: number): string => Number.isInteger(price) ? price.toString() : price.toFixed(2);

const getBedIcon = (type: string) => {
  switch(type) { case 'matr': return I.bedDouble; case 'sing': return I.bedSingle; case 'divano': return I.sofa; case 'castello': return I.bunk; default: return I.bed; }
};

function generateAutoBeds(maxGuests: number, bedrooms: number): Bed[] {
  const beds: Bed[] = []; let rem = maxGuests, id = 1;
  for (let i = 0; i < bedrooms && rem > 0; i++) { beds.push({ id: `b${id++}`, type: 'matr', name: 'Matrimoniale', loc: `Camera ${i + 1}`, cap: 2 }); rem -= 2; }
  if (rem >= 2) { beds.push({ id: `b${id++}`, type: 'divano', name: 'Divano Letto', loc: 'Soggiorno', cap: 2 }); rem -= 2; }
  if (rem === 1) { beds.push({ id: `b${id++}`, type: 'sing', name: 'Singolo', loc: bedrooms > 1 ? 'Cameretta' : 'Camera', cap: 1 }); rem -= 1; }
  while (rem >= 2) { beds.push({ id: `b${id++}`, type: 'castello', name: 'Letto a Castello', loc: 'Cameretta', cap: 2 }); rem -= 2; }
  if (rem === 1) { beds.push({ id: `b${id++}`, type: 'sing', name: 'Singolo', loc: 'Cameretta', cap: 1 }); }
  return beds;
}

function getLinenForBedType(t: string) {
  switch (t) { case 'matr': return { m: 3, s: 0, f: 2 }; case 'sing': return { m: 0, s: 3, f: 1 }; case 'divano': return { m: 3, s: 0, f: 2 }; case 'castello': return { m: 0, s: 6, f: 2 }; default: return { m: 0, s: 3, f: 1 }; }
}

function calcLinenForBeds(beds: Bed[]) {
  const t = { m: 0, s: 0, f: 0 };
  beds.forEach(b => { const r = getLinenForBedType(b.type); t.m += r.m; t.s += r.s; t.f += r.f; });
  return t;
}

function mapLinenToInv(req: { m: number; s: number; f: number }, inv: LinenItem[]) {
  const r: Record<string, number> = {};
  const find = (kw: string[]) => inv.find(i => kw.some(k => i.n.toLowerCase().includes(k)));
  const lm = find(['matrimoniale', 'matr']); if (lm && req.m > 0) r[lm.id] = req.m;
  const ls = find(['singolo', 'sing']); if (ls && req.s > 0) r[ls.id] = req.s;
  const fe = find(['federa']); if (fe && req.f > 0) r[fe.id] = req.f;
  return r;
}

const calcArr = (obj: Record<string, number | boolean>, arr: { id: string; p: number }[]): number => 
  Object.entries(obj).reduce((t, [id, q]) => { const i = arr.find(x => x.id === id); return t + (i ? i.p * (typeof q === 'boolean' ? (q ? 1 : 0) : q) : 0); }, 0);

// ==================== SMALL COMPONENTS ====================
const Cnt = ({ v, onChange }: { v: number; onChange: (v: number) => void }) => (
  <div className="flex items-center gap-1">
    <button onClick={() => onChange(Math.max(0, v - 1))} className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center active:scale-95"><div className="w-3.5 h-3.5 text-slate-500">{I.minus}</div></button>
    <span className="w-6 text-center text-sm font-semibold">{v}</span>
    <button onClick={() => onChange(v + 1)} className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center active:scale-95"><div className="w-3.5 h-3.5 text-white">{I.plus}</div></button>
  </div>
);

const Section = ({ title, icon, price, expanded, onToggle, children }: { title: string; icon: React.ReactNode; price: number; expanded: boolean; onToggle: () => void; children: React.ReactNode; }) => (
  <div className={`rounded-xl border ${expanded ? 'border-slate-300 shadow-sm' : 'border-slate-200'} overflow-hidden mb-2 transition-all bg-white`}>
    <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between active:bg-slate-50">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${expanded ? 'bg-slate-900' : 'bg-slate-100'} flex items-center justify-center transition-colors`}>
          <div className={`w-5 h-5 ${expanded ? 'text-white' : 'text-slate-600'}`}>{icon}</div>
        </div>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold">€{formatPrice(price)}</span>
        <div className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>{I.down}</div>
      </div>
    </button>
    <div className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">{children}</div>
    </div>
  </div>
);

const GuestSelector = ({ value, onChange, max = 7 }: { value: number; onChange: (n: number) => void; max?: number }) => (
  <div className="bg-slate-100 rounded-xl p-3">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-medium text-slate-500">Seleziona numero ospiti</span>
      <span className="text-base font-bold text-slate-800">{value} {value === 1 ? 'ospite' : 'ospiti'}</span>
    </div>
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button key={n} onClick={() => onChange(n)} className={`flex-1 flex flex-col items-center py-1.5 rounded-lg transition-all active:scale-95 ${n === value ? 'bg-slate-800 shadow-lg' : 'bg-white border border-slate-200'}`}>
          <div className={`w-4 h-4 mb-0.5 ${n === value ? 'text-white' : n <= value ? 'text-slate-600' : 'text-slate-300'}`}><PersonIcon filled={n <= value} /></div>
          <span className={`text-[10px] font-bold ${n === value ? 'text-white' : 'text-slate-600'}`}>{n}</span>
        </button>
      ))}
    </div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function EditCleaningModal({ isOpen, onClose, cleaning, property, onSuccess, userRole = "PROPRIETARIO" }: EditCleaningModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'service' | 'linen'>('details');
  const [g, setG] = useState(cleaning?.guestsCount || 2);
  const [sec, setSec] = useState<string | null>('beds');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Service type state
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(true);
  const [selectedServiceType, setSelectedServiceType] = useState<string>("STANDARD");
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [priceChangeReason, setPriceChangeReason] = useState<string>("");
  const [sgrossoReason, setSgrossoReason] = useState<SgrossoReasonCode | "">("");
  const [sgrossoNotes, setSgrossoNotes] = useState<string>("");

  const isAdmin = userRole === "ADMIN";
  const isReadOnly = userRole === "OPERATORE";

  const [cfgs, setCfgs] = useState<Record<number, GuestConfig>>({});
  const [invLinen, setInvLinen] = useState<LinenItem[]>([]);
  const [invBath, setInvBath] = useState<LinenItem[]>([]);
  const [invKit, setInvKit] = useState<LinenItem[]>([]);
  const [invExtras, setInvExtras] = useState<{ id: string; n: string; p: number; desc: string }[]>([]);

  const currentBeds = useMemo(() => {
    if (property?.bedsConfig && property.bedsConfig.length > 0) return property.bedsConfig;
    return generateAutoBeds(property?.maxGuests || 6, property?.bedrooms || 2);
  }, [property]);

  useEffect(() => {
    if (isOpen && cleaning) {
      const d = cleaning.date instanceof Date ? cleaning.date : new Date(cleaning.date);
      setDate(d.toISOString().split('T')[0]);
      setTime(cleaning.scheduledTime || '10:00');
      setG(cleaning.guestsCount || 2);
      setNotes(cleaning.notes || '');
      if (property?.serviceConfigs && Object.keys(property.serviceConfigs).length > 0) setCfgs(property.serviceConfigs);
      
      // Inizializza campi servizio dalla cleaning esistente
      setSelectedServiceType(cleaning.serviceType || "STANDARD");
      setCustomPrice(cleaning.priceModified ? (cleaning.price || null) : null);
      setPriceChangeReason(cleaning.priceChangeReason || "");
      setSgrossoReason(cleaning.sgrossoReason || "");
      setSgrossoNotes(cleaning.sgrossoNotes || "");
    }
  }, [isOpen, cleaning, property]);

  // Carica Service Types
  useEffect(() => {
    async function loadServiceTypes() {
      try {
        const res = await fetch("/api/service-types?activeOnly=true");
        const data = await res.json();
        setServiceTypes(data.serviceTypes || []);
      } catch (error) {
        console.error("Errore caricamento tipi servizio:", error);
      } finally {
        setLoadingServiceTypes(false);
      }
    }
    
    if (isOpen) {
      loadServiceTypes();
    }
  }, [isOpen]);

  useEffect(() => {
    async function load() {
      if (!isOpen) return;
      setLoading(true);
      try {
        const res = await fetch('/api/inventory/list');
        const data = await res.json();
        const linen: LinenItem[] = [], bath: LinenItem[] = [], kit: LinenItem[] = [], extras: { id: string; n: string; p: number; desc: string }[] = [];
        data.categories?.forEach((cat: { id: string; items: { key?: string; id: string; name: string; sellPrice?: number; description?: string }[] }) => {
          cat.items?.forEach((item) => {
            const m = { id: item.key || item.id, n: item.name, p: item.sellPrice || 0, d: 1 };
            if (cat.id === 'biancheria_letto') linen.push(m);
            else if (cat.id === 'biancheria_bagno') bath.push(m);
            else if (cat.id === 'kit_cortesia') kit.push(m);
            else if (cat.id === 'servizi_extra') extras.push({ ...m, desc: item.description || '' });
          });
        });
        setInvLinen(linen); setInvBath(bath); setInvKit(kit); setInvExtras(extras);
        if (Object.keys(cfgs).length === 0) {
          const newC: Record<number, GuestConfig> = {};
          const maxG = property?.maxGuests || 6;
          for (let i = 1; i <= maxG; i++) {
            const beds = generateAutoBeds(i, property?.bedrooms || 1);
            const sel = beds.slice(0, Math.ceil(i / 2));
            const ids = sel.map(b => b.id);
            const lr = calcLinenForBeds(sel);
            const ml = mapLinenToInv(lr, linen);
            const ba: Record<string, number> = {}; bath.forEach(it => { const n = it.n.toLowerCase(); if (n.includes('corpo') || n.includes('viso') || n.includes('bidet')) ba[it.id] = i; else if (n.includes('scendi')) ba[it.id] = property?.bathrooms || 1; });
            const ki: Record<string, number> = {}; kit.forEach(it => { ki[it.id] = 0; });
            const ex: Record<string, boolean> = {}; extras.forEach(it => { ex[it.id] = false; });
            newC[i] = { beds: ids, bl: { 'all': ml }, ba, ki, ex };
          }
          setCfgs(newC);
        }
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    load();
  }, [isOpen]);

  const c = cfgs[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} };
  const selectedBedIds = c.beds || [];
  const selectedBedsData = currentBeds.filter(b => selectedBedIds.includes(b.id));
  const totalCap = selectedBedsData.reduce((s, b) => s + b.cap, 0);
  const warn = totalCap < g;

  const toggleBed = (bedId: string) => {
    setCfgs(prev => {
      const cur = prev[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} };
      const isSel = cur.beds.includes(bedId);
      const newBeds = isSel ? cur.beds.filter(id => id !== bedId) : [...cur.beds, bedId];
      const newSelBeds = currentBeds.filter(b => newBeds.includes(b.id));
      const lr = calcLinenForBeds(newSelBeds);
      const ml = mapLinenToInv(lr, invLinen);
      return { ...prev, [g]: { ...cur, beds: newBeds, bl: { 'all': ml } } };
    });
  };

  const updL = (id: string, v: number) => setCfgs(p => ({ ...p, [g]: { ...(p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }), bl: { 'all': { ...(p[g]?.bl?.['all'] || {}), [id]: v } } } }));
  const updB = (id: string, v: number) => setCfgs(p => ({ ...p, [g]: { ...(p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }), ba: { ...(p[g]?.ba || {}), [id]: v } } }));
  const updK = (id: string, v: number) => setCfgs(p => ({ ...p, [g]: { ...(p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }), ki: { ...(p[g]?.ki || {}), [id]: v } } }));
  const togE = (id: string) => setCfgs(p => ({ ...p, [g]: { ...(p[g] || { beds: [], bl: {}, ba: {}, ki: {}, ex: {} }), ex: { ...(p[g]?.ex || {}), [id]: !(p[g]?.ex?.[id]) } } }));

  const bedP = invLinen.reduce((s, i) => s + i.p * (c.bl?.['all']?.[i.id] || 0), 0);
  const bathP = calcArr(c.ba || {}, invBath);
  const kitP = calcArr(c.ki || {}, invKit);
  const exP = calcArr((c.ex || {}) as Record<string, boolean>, invExtras);
  const contractPrice = property?.cleaningPrice || cleaning?.contractPrice || 0;
  const totalDotazioni = bedP + bathP + kitP + exP;
  
  // Calcolo prezzo effettivo
  const selectedType = serviceTypes.find(st => st.code === selectedServiceType);
  const isSgrosso = selectedServiceType === "SGROSSO";
  const effectiveCleaningPrice = customPrice !== null ? customPrice : contractPrice;
  const priceIsModified = customPrice !== null && customPrice !== contractPrice;
  const totalPrice = effectiveCleaningPrice + totalDotazioni;

  const handleSave = async () => {
    // Validazioni
    if (isAdmin && priceIsModified && !priceChangeReason.trim()) {
      alert("Inserisci la motivazione del cambio prezzo");
      return;
    }
    
    if (isAdmin && isSgrosso && !sgrossoReason) {
      alert("Seleziona il motivo dello sgrosso");
      return;
    }
    
    if (isAdmin && sgrossoReason === "ALTRO" && !sgrossoNotes.trim()) {
      alert("Per 'Altro' devi specificare il motivo nelle note");
      return;
    }

    setSaving(true);
    try {
      // Prepara dati base
      const updateData: Record<string, unknown> = {
        scheduledDate: new Date(date), 
        guestsCount: g, 
        notes, 
        updatedAt: new Date(), 
        customLinenConfig: cfgs[g]
      };
      
      // Se admin, aggiungi campi servizio
      if (isAdmin) {
        updateData.serviceType = selectedServiceType;
        updateData.serviceTypeName = selectedType?.name || "Pulizia Standard";
        
        if (priceIsModified) {
          updateData.price = effectiveCleaningPrice;
          updateData.priceModified = true;
          updateData.priceChangeReason = priceChangeReason;
          updateData.contractPrice = contractPrice;
        }
        
        if (isSgrosso) {
          updateData.sgrossoReason = sgrossoReason;
          updateData.sgrossoNotes = sgrossoNotes || null;
          const reasonObj = SGROSSO_REASONS.find(r => r.code === sgrossoReason);
          updateData.sgrossoReasonLabel = reasonObj?.label || "";
        } else {
          // Pulisci campi SGROSSO se cambio tipo
          updateData.sgrossoReason = null;
          updateData.sgrossoNotes = null;
          updateData.sgrossoReasonLabel = null;
        }
      }
      
      await updateDoc(doc(db, "cleanings", cleaning.id), updateData);
      onSuccess?.(); onClose();
    } catch (e) { console.error(e); alert('Errore nel salvataggio'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await deleteDoc(doc(db, "cleanings", cleaning.id)); onSuccess?.(); onClose(); } catch (e) { console.error(e); alert('Errore'); } finally { setDeleting(false); }
  };

  if (!isOpen) return null;

  if (showDeleteConfirm) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-red-500 to-rose-400"></div>
          <div className="p-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center"><div className="w-7 h-7 text-red-500">{I.trash}</div></div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Eliminare la prenotazione?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">Questa azione non può essere annullata.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl" disabled={deleting}>Annulla</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl disabled:opacity-50">{deleting ? 'Elimino...' : 'Elimina'}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (<div className="fixed inset-0 z-50 flex flex-col bg-white items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div><p className="mt-3 text-slate-500">Caricamento...</p></div>);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 bg-white pt-12 px-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Modifica Servizio</h2>
            <p className="text-xs text-slate-500">{property?.name}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-95">
            <div className="w-5 h-5 text-slate-500">{I.close}</div>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-xs transition-all ${activeTab === 'details' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Dettagli
          </button>
          <button
            onClick={() => setActiveTab('service')}
            className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-xs transition-all ${activeTab === 'service' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Servizio
          </button>
          <button
            onClick={() => setActiveTab('linen')}
            className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-xs transition-all ${activeTab === 'linen' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Biancheria
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* ==================== TAB DETTAGLI ==================== */}
        {activeTab === 'details' && (
          <>
            {/* Proprietà */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-blue-600">{I.home}</div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">{property?.name}</span>
                    {property?.address && <p className="text-xs text-slate-500">{property.address}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Data */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-slate-600">{I.calendar}</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">Data Pulizia</span>
                </div>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"/>
              </div>
            </div>

            {/* Orario - Solo visualizzazione */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <div className="w-5 h-5 text-slate-600">{I.clock}</div>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-800">Orario</span>
                      <p className="text-xs text-slate-400">Assegnato dall'amministratore</p>
                    </div>
                  </div>
                  <div className="px-4 py-2 bg-slate-100 rounded-xl">
                    <span className="text-lg font-bold text-slate-700">{time || 'Da assegnare'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Numero Ospiti */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-slate-600">{I.users}</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">Numero Ospiti</span>
                </div>
                <GuestSelector value={g} onChange={setG} max={property?.maxGuests || 6} />
              </div>
            </div>

            {/* Note */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-slate-600">{I.edit}</div>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">Note (opzionale)</span>
                </div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Aggiungi note..." rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none"/>
              </div>
            </div>

            {/* Riepilogo Prezzi */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">💰</span>
                  <span className="text-sm font-semibold text-slate-800">Riepilogo</span>
                </div>
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">
                      Pulizia {selectedType?.name ? `(${selectedType.name})` : ""}
                      {priceIsModified && <span className="text-amber-500 ml-1">*</span>}
                    </span>
                    <span className={`text-sm font-bold ${priceIsModified ? 'text-amber-600' : 'text-slate-800'}`}>
                      €{effectiveCleaningPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-sm text-slate-500">Dotazioni</span><span className="text-sm font-bold text-slate-800">€{totalDotazioni.toFixed(2)}</span></div>
                </div>
                <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800">Totale</span>
                  <span className="text-xl font-bold text-emerald-600">€{totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Elimina Prenotazione */}
            {!isReadOnly && (
              <button onClick={() => setShowDeleteConfirm(true)} className="w-full py-3.5 bg-red-50 border border-red-200 text-red-600 font-semibold rounded-xl flex items-center justify-center gap-2 mb-4">
                <div className="w-5 h-5">{I.trash}</div>
                <span>Elimina Prenotazione</span>
              </button>
            )}
          </>
        )}

        {/* ==================== TAB SERVIZIO ==================== */}
        {activeTab === 'service' && (
          <>
            {/* Tipo Servizio */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="h-1 bg-gradient-to-r from-sky-400 to-blue-500"></div>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                    <span className="text-lg">🧹</span>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Tipo di Servizio</span>
                    {!isAdmin && <p className="text-xs text-slate-400">Solo visualizzazione</p>}
                  </div>
                </div>
                
                {loadingServiceTypes ? (
                  <div className="animate-pulse bg-slate-100 h-24 rounded-xl"></div>
                ) : isAdmin ? (
                  <div className="grid grid-cols-3 gap-2">
                    {serviceTypes.map(st => (
                      <button
                        key={st.code}
                        type="button"
                        onClick={() => {
                          setSelectedServiceType(st.code);
                          if (st.code !== "SGROSSO") {
                            setSgrossoReason("");
                            setSgrossoNotes("");
                          }
                        }}
                        className={`p-3 rounded-xl border-2 transition-all text-center ${
                          selectedServiceType === st.code
                            ? "border-sky-500 bg-sky-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <span className="text-xl block mb-1">{st.icon}</span>
                        <span className="text-[10px] font-medium text-slate-700">{st.name}</span>
                        {st.adminOnly && (
                          <span className="text-[8px] text-amber-600 block">Solo Admin</span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <span className="text-2xl">{selectedType?.icon || "🧹"}</span>
                    <div>
                      <span className="font-medium text-slate-800">{cleaning.serviceTypeName || selectedType?.name || "Standard"}</span>
                      {cleaning.priceModified && (
                        <p className="text-xs text-amber-600">Prezzo personalizzato</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Motivo SGROSSO */}
            {isSgrosso && (
              <div className="bg-white rounded-2xl border border-red-200 overflow-hidden shadow-sm mb-3">
                <div className="h-1 bg-gradient-to-r from-red-400 to-rose-500"></div>
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                      <span className="text-lg">⚠️</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">Motivo Sgrosso</span>
                  </div>
                  
                  {isAdmin ? (
                    <>
                      <select
                        value={sgrossoReason}
                        onChange={(e) => setSgrossoReason(e.target.value as SgrossoReasonCode)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium mb-2"
                      >
                        <option value="">Seleziona motivo...</option>
                        {SGROSSO_REASONS.map(reason => (
                          <option key={reason.code} value={reason.code}>
                            {reason.icon} {reason.label}
                          </option>
                        ))}
                      </select>
                      {sgrossoReason === "ALTRO" && (
                        <textarea
                          value={sgrossoNotes}
                          onChange={(e) => setSgrossoNotes(e.target.value)}
                          placeholder="Specifica il motivo..."
                          rows={2}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none"
                        />
                      )}
                    </>
                  ) : (
                    <div className="p-3 bg-red-50 rounded-xl">
                      <p className="font-medium text-red-800">{cleaning.sgrossoReasonLabel || "Non specificato"}</p>
                      {cleaning.sgrossoNotes && (
                        <p className="text-sm text-red-600 mt-1">{cleaning.sgrossoNotes}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Prezzo */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className={`h-1 ${priceIsModified ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500'}`}></div>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${priceIsModified ? 'bg-amber-100' : 'bg-emerald-100'} flex items-center justify-center`}>
                    <span className="text-lg">💰</span>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Prezzo Pulizia</span>
                    <p className="text-xs text-slate-400">Contratto: €{contractPrice.toFixed(2)}</p>
                  </div>
                </div>
                
                {isAdmin ? (
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={customPrice !== null ? customPrice : contractPrice}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCustomPrice(val === contractPrice ? null : val);
                      }}
                      className={`w-full pl-8 pr-4 py-3 border rounded-xl text-lg font-bold ${
                        priceIsModified ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {priceIsModified && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-600 text-xs font-medium">
                        Modificato
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-2xl font-bold text-slate-800">€{effectiveCleaningPrice.toFixed(2)}</span>
                    {cleaning.priceModified && (
                      <span className="text-sm text-slate-500 ml-2">(era €{contractPrice.toFixed(2)})</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Motivazione Cambio Prezzo */}
            {(priceIsModified || cleaning.priceChangeReason) && (
              <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm mb-3">
                <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500"></div>
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                      <span className="text-lg">📝</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800">Motivazione Cambio Prezzo</span>
                  </div>
                  
                  {isAdmin && priceIsModified ? (
                    <textarea
                      value={priceChangeReason}
                      onChange={(e) => setPriceChangeReason(e.target.value)}
                      placeholder="Es: Pulizia extra accurata richiesta, intervento su macchie difficili..."
                      rows={2}
                      className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm resize-none"
                    />
                  ) : cleaning.priceChangeReason ? (
                    <div className="p-3 bg-amber-50 rounded-xl">
                      <p className="text-sm text-amber-800">{cleaning.priceChangeReason}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </>
        )}

        {/* ==================== TAB BIANCHERIA ==================== */}
        {activeTab === 'linen' && (
          <>
            {/* Guest Selector */}
            <div className="mb-3">
              <GuestSelector value={g} onChange={setG} max={property?.maxGuests || 6} />
              {warn && (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <p className="text-xs text-amber-700">⚠️ Capacità letti ({totalCap}) inferiore a {g} ospiti</p>
                </div>
              )}
            </div>

            {/* Biancheria Letto */}
            <Section title="Biancheria Letto" icon={I.bed} price={bedP} expanded={sec === 'beds'} onToggle={() => setSec(sec === 'beds' ? null : 'beds')}>
              {currentBeds.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun letto configurato</p></div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">🛏️ Seleziona i letti da usare per {g} ospiti:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {currentBeds.map(bed => {
                        const isSel = selectedBedIds.includes(bed.id);
                        return (
                          <button key={bed.id} onClick={() => toggleBed(bed.id)} className={`p-2.5 rounded-lg border-2 text-left transition-all ${isSel ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                            <div className="flex items-center gap-2">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSel ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                                {isSel && <div className="w-3 h-3 text-white">{I.check}</div>}
                              </div>
                              <div className="w-6 h-6 text-slate-500">{getBedIcon(bed.type)}</div>
                            </div>
                            <p className="text-xs font-medium mt-1">{bed.name}</p>
                            <p className="text-[10px] text-slate-500">{bed.loc} • {bed.cap}p</p>
                          </button>
                        );
                      })}
                    </div>
                    {selectedBedsData.length > 0 && (
                      <div className="mt-2 p-2 bg-blue-50 rounded-lg"><p className="text-xs text-blue-700">✓ {selectedBedsData.length} letti selezionati = {totalCap} posti</p></div>
                    )}
                  </div>
                  {invLinen.length > 0 && selectedBedsData.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">📦 Biancheria necessaria (calcolata automaticamente):</p>
                      <div className="space-y-2">
                        {invLinen.map(item => (
                          <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-blue-100">
                            <span className="text-xs text-slate-700 font-medium">{item.n} <span className="text-blue-500">€{item.p}</span></span>
                            <Cnt v={c.bl?.['all']?.[item.id] || 0} onChange={v => updL(item.id, v)} />
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 italic">Quantità calcolate in base ai letti selezionati. Puoi modificarle manualmente.</p>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Biancheria Bagno */}
            <Section title="Biancheria Bagno" icon={I.towel} price={bathP} expanded={sec === 'bath'} onToggle={() => setSec(sec === 'bath' ? null : 'bath')}>
              {invBath.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun articolo</p></div>
              ) : (
                <div className="space-y-2">
                  {invBath.map(i => (
                    <div key={i.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-purple-100">
                      <span className="text-xs text-slate-700 font-medium">{i.n} <span className="text-purple-500">€{i.p}</span></span>
                      <Cnt v={c.ba?.[i.id] || 0} onChange={v => updB(i.id, v)} />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Kit Cortesia */}
            <Section title="Kit Cortesia" icon={I.soap} price={kitP} expanded={sec === 'kit'} onToggle={() => setSec(sec === 'kit' ? null : 'kit')}>
              {invKit.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun articolo</p></div>
              ) : (
                <div className="space-y-2">
                  {invKit.map(i => (
                    <div key={i.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-amber-100">
                      <span className="text-xs text-slate-700 font-medium">{i.n} <span className="text-amber-600">€{i.p}</span></span>
                      <Cnt v={c.ki?.[i.id] || 0} onChange={v => updK(i.id, v)} />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Servizi Extra */}
            <Section title="Servizi Extra" icon={I.gift} price={exP} expanded={sec === 'extra'} onToggle={() => setSec(sec === 'extra' ? null : 'extra')}>
              {invExtras.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun servizio</p></div>
              ) : (
                <div className="space-y-2">
                  {invExtras.map(i => (
                    <div key={i.id} onClick={() => togE(i.id)} className={`rounded-lg p-2.5 border-2 transition-all cursor-pointer ${c.ex?.[i.id] ? 'border-slate-400 bg-white shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${c.ex?.[i.id] ? 'bg-slate-900 border-slate-900' : 'border-slate-300'}`}>
                            {c.ex?.[i.id] && <div className="w-3 h-3 text-white">{I.check}</div>}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{i.n}</p>
                            {i.desc && <p className="text-[10px] text-slate-500">{i.desc}</p>}
                          </div>
                        </div>
                        <span className="text-sm font-bold">€{i.p}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Totale Dotazioni */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-4 shadow-lg mt-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-white">Totale Dotazioni</span>
                <span className="text-2xl font-bold text-white">€{totalDotazioni.toFixed(2)}</span>
              </div>
            </div>
          </>
        )}

        <div className="h-4"></div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 pt-3 pb-20 border-t border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-600">Totale per <strong>{g}</strong> ospiti</span>
          <span className="text-2xl font-bold">€{formatPrice(totalPrice)}</span>
        </div>
        <button onClick={handleSave} disabled={saving} className="w-full py-3.5 bg-gradient-to-r from-slate-600 to-slate-800 text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-transform shadow-md disabled:opacity-50">
          {saving ? 'Salvataggio...' : 'Salva Modifiche'}
        </button>
      </div>
    </div>
  );
}
