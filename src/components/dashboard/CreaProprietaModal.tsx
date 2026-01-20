"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface CreaProprietaModalProps {
  isOpen: boolean;
  onClose: () => void;
  proprietari: { id: string; name: string | null; email: string | null }[];
}

// ==================== TYPES ====================
interface Stanza { id: string; nome: string; letti: Letto[]; }
interface Letto { id: string; tipo: 'matrimoniale' | 'singolo' | 'piazza_mezza' | 'divano_letto' | 'castello'; quantita: number; }
interface GuestLinenConfig { selectedBeds: string[]; bedLinen: Record<string, Record<string, number>>; bathItems: Record<string, number>; kitItems: Record<string, number>; extras: Record<string, boolean>; }
interface InventoryLinenItem { id: string; nome: string; prezzo: number; default: number; }
interface InventoryBathItem { id: string; nome: string; prezzo: number; defaultPerOspite: number; }
interface InventoryKitItem { id: string; nome: string; prezzo: number; defaultPerOspite: number; }
interface InventoryExtraItem { id: string; nome: string; prezzo: number; descrizione: string; }

const TIPI_LETTO = [
  { tipo: 'matrimoniale' as const, nome: 'Matrimoniale', capacita: 2, icon: '🛏️' },
  { tipo: 'singolo' as const, nome: 'Singolo', capacita: 1, icon: '🛏️' },
  { tipo: 'piazza_mezza' as const, nome: 'Piazza e Mezza', capacita: 1, icon: '🛏️' },
  { tipo: 'divano_letto' as const, nome: 'Divano Letto', capacita: 2, icon: '🛋️' },
  { tipo: 'castello' as const, nome: 'Letto a Castello', capacita: 2, icon: '🛏️' },
];

const STANZE_PREDEFINITE = ['Camera Matrimoniale', 'Camera Singola', 'Camera Doppia', 'Soggiorno', 'Cameretta', 'Studio'];

const Icons = {
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  towel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="3" width="12" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M6 7H18M6 11H18"/></svg>,
  soap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="8" width="12" height="12" rx="2" fill="currentColor" opacity="0.1"/><path d="M10 8V6C10 5 11 4 12 4C13 4 14 5 14 6V8M9 12H15M9 15H13"/></svg>,
  gift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="8" width="18" height="13" rx="2" fill="currentColor" opacity="0.1"/><path d="M12 8V21M3 12H21M12 8C12 8 12 5 9.5 5C8 5 7 6 7 7C7 8 8 8 12 8M12 8C12 8 12 5 14.5 5C16 5 17 6 17 7C17 8 16 8 12 8"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M12 5V19M5 12H19"/></svg>,
  minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M5 12H19"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 6H21M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6H19Z"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M18 6L6 18M6 6L18 18"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full h-full"><path d="M5 13L9 17L19 7"/></svg>,
  down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M6 9L12 15L18 9"/></svg>,
  room: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M3 9H21M9 21V9"/></svg>,
  warn: <svg viewBox="0 0 20 20" fill="currentColor" className="w-full h-full"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>,
};

// ==================== HELPER COMPONENTS ====================
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (<div className="relative inline-block ml-1"><button type="button" onClick={() => setShow(!show)} onBlur={() => setShow(false)} className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold inline-flex items-center justify-center hover:bg-slate-300">?</button>{show && (<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[11px] rounded-lg shadow-lg z-50">{text}<div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" /></div>)}</div>);
}

function Counter({ value, onChange, min = 0, max = 99, small = false }: { value: number; onChange: (v: number) => void; min?: number; max?: number; small?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className={`${small ? 'w-7 h-7' : 'w-9 h-9'} rounded-xl border border-slate-300 bg-white flex items-center justify-center active:scale-95`}><div className={`${small ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-slate-500`}>{Icons.minus}</div></button>
      <span className={`${small ? 'w-6 text-sm' : 'w-8 text-base'} text-center font-bold`}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className={`${small ? 'w-7 h-7' : 'w-9 h-9'} rounded-xl bg-slate-800 flex items-center justify-center active:scale-95`}><div className={`${small ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-white`}>{Icons.plus}</div></button>
    </div>
  );
}

function Section({ title, icon, price, expanded, onToggle, color = "blue", children }: { title: string; icon: React.ReactNode; price: number; expanded: boolean; onToggle: () => void; color?: string; children: React.ReactNode }) {
  const colors: Record<string, string> = { blue: 'bg-blue-100 text-blue-600', purple: 'bg-purple-100 text-purple-600', amber: 'bg-amber-100 text-amber-600', emerald: 'bg-emerald-100 text-emerald-600' };
  return (
    <div className={`rounded-xl border ${expanded ? 'border-slate-300 shadow-sm' : 'border-slate-200'} overflow-hidden mb-2 bg-white`}>
      <button type="button" onClick={onToggle} className="w-full px-3 py-2.5 flex items-center justify-between active:bg-slate-50">
        <div className="flex items-center gap-2"><div className={`w-8 h-8 rounded-lg ${colors[color]} flex items-center justify-center`}><div className="w-4 h-4">{icon}</div></div><span className="text-sm font-semibold text-slate-800">{title}</span></div>
        <div className="flex items-center gap-2"><span className="text-sm font-bold text-slate-700">€{price.toFixed(2)}</span><div className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>{Icons.down}</div></div>
      </button>
      <div className={`overflow-hidden transition-all ${expanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}><div className="px-3 py-2.5 bg-slate-50 border-t border-slate-100 overflow-y-auto max-h-[350px]">{children}</div></div>
    </div>
  );
}

const PersonIcon = ({ filled = false }: { filled?: boolean }) => (<svg viewBox="0 0 24 24" className="w-full h-full"><circle cx="12" cy="7" r="3.5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"/><path d="M5.5 21C5.5 16.5 8 13 12 13S18.5 16.5 18.5 21" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>);

function GuestSelector({ value, onChange, max = 10 }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="bg-slate-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2"><span className="text-xs font-medium text-slate-500">Seleziona numero ospiti</span><span className="text-base font-bold text-slate-800">{value} {value === 1 ? 'ospite' : 'ospiti'}</span></div>
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: max }, (_, i) => i + 1).map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} className={`w-9 h-9 flex flex-col items-center justify-center rounded-lg transition-all active:scale-95 ${n === value ? 'bg-slate-800 shadow-lg' : 'bg-white border border-slate-200'}`}>
            <div className={`w-4 h-4 ${n === value ? 'text-white' : n <= value ? 'text-slate-600' : 'text-slate-300'}`}><PersonIcon filled={n <= value} /></div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export function CreaProprietaModal({ isOpen, onClose, proprietari }: CreaProprietaModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchProprietario, setSearchProprietario] = useState('');

  // Inventario
  const [invLinen, setInvLinen] = useState<InventoryLinenItem[]>([]);
  const [invBath, setInvBath] = useState<InventoryBathItem[]>([]);
  const [invKit, setInvKit] = useState<InventoryKitItem[]>([]);
  const [invExtras, setInvExtras] = useState<InventoryExtraItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);

  // Form Data - NOTA: maxGuests è inserito manualmente, NON calcolato dai letti
  const [formData, setFormData] = useState({
    nome: '', indirizzo: '', citta: '', cap: '', piano: '', citofonoAccesso: '',
    maxGuests: 4, // CAPACITÀ MASSIMA INSERITA MANUALMENTE
    bagni: 1,
    checkIn: '15:00', checkOut: '10:00',
    prezzoBase: '',
    proprietarioId: '', nuovoProprietario: false, proprietarioNome: '', proprietarioEmail: '', proprietarioTelefono: '',
    stanze: [] as Stanza[],
  });

  // Immagine
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Configurazioni biancheria per N° ospiti
  const [linenConfigs, setLinenConfigs] = useState<Record<number, GuestLinenConfig>>({});

  // UI states
  const [showAddStanza, setShowAddStanza] = useState(false);
  const [nuovaStanzaNome, setNuovaStanzaNome] = useState('');
  const [stanzaExpandedId, setStanzaExpandedId] = useState<string | null>(null);
  const [selectedGuestCount, setSelectedGuestCount] = useState(1);
  const [expandedSection, setExpandedSection] = useState<string | null>('beds');

  // Carica inventario
  useEffect(() => {
    async function loadInventory() {
      try {
        const res = await fetch('/api/inventory/list');
        const data = await res.json();
        const linenItems: InventoryLinenItem[] = [], bathItems: InventoryBathItem[] = [], kitItems: InventoryKitItem[] = [], extrasItems: InventoryExtraItem[] = [];
        data.categories?.forEach((cat: any) => {
          cat.items?.forEach((item: any) => {
            if (cat.id === 'biancheria_letto') linenItems.push({ id: item.key || item.id, nome: item.name, prezzo: item.sellPrice || 0, default: 1 });
            else if (cat.id === 'biancheria_bagno') bathItems.push({ id: item.key || item.id, nome: item.name, prezzo: item.sellPrice || 0, defaultPerOspite: 1 });
            else if (cat.id === 'kit_cortesia') kitItems.push({ id: item.key || item.id, nome: item.name, prezzo: item.sellPrice || 0, defaultPerOspite: 1 });
            else if (cat.id === 'servizi_extra') extrasItems.push({ id: item.key || item.id, nome: item.name, prezzo: item.sellPrice || 0, descrizione: item.description || '' });
          });
        });
        setInvLinen(linenItems); setInvBath(bathItems); setInvKit(kitItems); setInvExtras(extrasItems);
      } catch (err) { console.error('Errore caricamento inventario:', err); }
      finally { setLoadingInventory(false); }
    }
    if (isOpen) loadInventory();
  }, [isOpen]);

  // Genera tutti i letti configurati
  const getAllBeds = () => {
    const beds: { id: string; tipo: string; nome: string; stanza: string; capacita: number }[] = [];
    formData.stanze.forEach(stanza => {
      stanza.letti.forEach(letto => {
        const tipoInfo = TIPI_LETTO.find(t => t.tipo === letto.tipo);
        for (let i = 0; i < letto.quantita; i++) {
          beds.push({ id: `${stanza.id}_${letto.tipo}_${i}`, tipo: letto.tipo, nome: tipoInfo?.nome || 'Letto', stanza: stanza.nome, capacita: tipoInfo?.capacita || 1 });
        }
      });
    });
    return beds;
  };

  // Genera config default per N ospiti
  const generateDefaultConfig = (guestCount: number): GuestLinenConfig => {
    const allBeds = getAllBeds();
    const selectedBeds: string[] = [];
    let remainingGuests = guestCount;
    for (const bed of allBeds) { if (remainingGuests <= 0) break; selectedBeds.push(bed.id); remainingGuests -= bed.capacita; }
    const bedLinen: Record<string, Record<string, number>> = {};
    selectedBeds.forEach(bedId => { bedLinen[bedId] = {}; invLinen.forEach(item => { bedLinen[bedId][item.id] = item.default; }); });
    const bathItems: Record<string, number> = {}; invBath.forEach(item => { bathItems[item.id] = item.defaultPerOspite * guestCount; });
    const kitItems: Record<string, number> = {}; invKit.forEach(item => { kitItems[item.id] = item.defaultPerOspite * guestCount; });
    const extras: Record<string, boolean> = {}; invExtras.forEach(item => { extras[item.id] = false; });
    return { selectedBeds, bedLinen, bathItems, kitItems, extras };
  };

  // Rigenera config quando cambiano stanze o maxGuests
  useEffect(() => {
    if (loadingInventory) return;
    const maxG = formData.maxGuests;
    if (maxG > 0 && formData.stanze.length > 0) {
      const newConfigs: Record<number, GuestLinenConfig> = {};
      for (let i = 1; i <= maxG; i++) newConfigs[i] = generateDefaultConfig(i);
      setLinenConfigs(newConfigs);
      if (selectedGuestCount > maxG) setSelectedGuestCount(maxG);
    }
  }, [formData.stanze, formData.maxGuests, invLinen, invBath, invKit, invExtras, loadingInventory]);

  useEffect(() => { if (isOpen) document.body.style.overflow = 'hidden'; else document.body.style.overflow = ''; return () => { document.body.style.overflow = ''; }; }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setStep(1); setError(''); setShowAddStanza(false); setNuovaStanzaNome(''); setStanzaExpandedId(null);
      setSelectedGuestCount(1); setExpandedSection('beds'); setLinenConfigs({}); setImageFile(null); setImageBase64(null); setImagePreview(null); setSearchProprietario('');
      setFormData({ nome: '', indirizzo: '', citta: '', cap: '', piano: '', citofonoAccesso: '', maxGuests: 4, bagni: 1, checkIn: '15:00', checkOut: '10:00', prezzoBase: '', proprietarioId: '', nuovoProprietario: false, proprietarioNome: '', proprietarioEmail: '', proprietarioTelefono: '', stanze: [] });
    }
  }, [isOpen]);

  const totalSteps = 8;
  const allBeds = getAllBeds();
  const currentConfig = linenConfigs[selectedGuestCount] || { selectedBeds: [], bedLinen: {}, bathItems: {}, kitItems: {}, extras: {} };
  const filteredProprietari = proprietari.filter(p => p.name?.toLowerCase().includes(searchProprietario.toLowerCase()) || p.email?.toLowerCase().includes(searchProprietario.toLowerCase()));

  // Calcola capacità posti letto selezionati per la configurazione corrente
  const currentBedCapacity = currentConfig.selectedBeds.reduce((t, bedId) => {
    const bed = allBeds.find(b => b.id === bedId);
    return t + (bed?.capacita || 0);
  }, 0);
  const isCapacityInsufficient = currentBedCapacity < selectedGuestCount;

  const updateField = (field: string, value: any) => { setFormData(prev => ({ ...prev, [field]: value })); setError(''); };

  // Gestione stanze
  const aggiungiStanza = (nome: string) => { if (!nome.trim()) return; const newStanza: Stanza = { id: `stanza_${Date.now()}`, nome: nome.trim(), letti: [] }; setFormData(prev => ({ ...prev, stanze: [...prev.stanze, newStanza] })); setStanzaExpandedId(newStanza.id); setShowAddStanza(false); setNuovaStanzaNome(''); };
  const rimuoviStanza = (stanzaId: string) => { setFormData(prev => ({ ...prev, stanze: prev.stanze.filter(s => s.id !== stanzaId) })); if (stanzaExpandedId === stanzaId) setStanzaExpandedId(null); };
  const aggiungiLetto = (stanzaId: string, tipo: Letto['tipo']) => { setFormData(prev => ({ ...prev, stanze: prev.stanze.map(s => { if (s.id !== stanzaId) return s; const existing = s.letti.find(l => l.tipo === tipo); if (existing) return { ...s, letti: s.letti.map(l => l.tipo === tipo ? { ...l, quantita: l.quantita + 1 } : l) }; return { ...s, letti: [...s.letti, { id: `letto_${Date.now()}`, tipo, quantita: 1 }] }; }) })); };
  const rimuoviLetto = (stanzaId: string, tipo: Letto['tipo']) => { setFormData(prev => ({ ...prev, stanze: prev.stanze.map(s => { if (s.id !== stanzaId) return s; const existing = s.letti.find(l => l.tipo === tipo); if (!existing) return s; if (existing.quantita > 1) return { ...s, letti: s.letti.map(l => l.tipo === tipo ? { ...l, quantita: l.quantita - 1 } : l) }; return { ...s, letti: s.letti.filter(l => l.tipo !== tipo) }; }) })); };

  // Gestione biancheria
  const toggleBed = (bedId: string) => { const config = { ...currentConfig }; if (config.selectedBeds.includes(bedId)) { config.selectedBeds = config.selectedBeds.filter(id => id !== bedId); delete config.bedLinen[bedId]; } else { config.selectedBeds.push(bedId); config.bedLinen[bedId] = {}; invLinen.forEach(item => { config.bedLinen[bedId][item.id] = item.default; }); } setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config })); };
  const updateBedLinen = (bedId: string, itemId: string, qty: number) => { const config = { ...currentConfig }; if (!config.bedLinen[bedId]) config.bedLinen[bedId] = {}; config.bedLinen[bedId][itemId] = qty; setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config })); };
  const updateBathItem = (itemId: string, qty: number) => { const config = { ...currentConfig }; config.bathItems[itemId] = qty; setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config })); };
  const updateKitItem = (itemId: string, qty: number) => { const config = { ...currentConfig }; config.kitItems[itemId] = qty; setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config })); };
  const toggleExtra = (itemId: string) => { const config = { ...currentConfig }; config.extras[itemId] = !config.extras[itemId]; setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config })); };

  // Calcolo prezzi
  const calcBedLinenPrice = () => { let t = 0; Object.entries(currentConfig.bedLinen).forEach(([, items]) => { Object.entries(items).forEach(([itemId, qty]) => { const i = invLinen.find(x => x.id === itemId); if (i) t += i.prezzo * qty; }); }); return t; };
  const calcBathPrice = () => Object.entries(currentConfig.bathItems).reduce((t, [id, q]) => { const i = invBath.find(x => x.id === id); return t + (i ? i.prezzo * q : 0); }, 0);
  const calcKitPrice = () => Object.entries(currentConfig.kitItems).reduce((t, [id, q]) => { const i = invKit.find(x => x.id === id); return t + (i ? i.prezzo * q : 0); }, 0);
  const calcExtrasPrice = () => Object.entries(currentConfig.extras).reduce((t, [id, sel]) => { if (!sel) return t; const i = invExtras.find(x => x.id === id); return t + (i ? i.prezzo : 0); }, 0);

  // Gestione immagine
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { setError('Immagine max 5MB'); return; } setImageFile(file); const reader = new FileReader(); reader.onload = (e) => { const b64 = e.target?.result as string; setImageBase64(b64); setImagePreview(b64); }; reader.readAsDataURL(file); setError(''); };

  // Validazione
  const validateStep = () => {
    switch (step) {
      case 1: if (!formData.nome.trim()) return 'Inserisci il nome'; if (!formData.indirizzo.trim()) return 'Inserisci l\'indirizzo'; if (!formData.citta.trim()) return 'Inserisci la città'; if (!formData.cap.trim()) return 'Inserisci il CAP'; if (!formData.piano.trim()) return 'Inserisci il piano'; if (!formData.citofonoAccesso.trim()) return 'Inserisci citofono/accesso'; return null;
      case 2: if (formData.maxGuests < 1) return 'Inserisci almeno 1 ospite'; if (formData.bagni < 1) return 'Inserisci almeno 1 bagno'; return null;
      case 3: return null;
      case 4: if (!formData.prezzoBase || parseFloat(formData.prezzoBase) <= 0) return 'Inserisci il prezzo pulizia'; return null;
      case 5: if (formData.nuovoProprietario) { if (!formData.proprietarioNome.trim()) return 'Nome proprietario richiesto'; if (!formData.proprietarioEmail.includes('@')) return 'Email non valida'; } else { if (!formData.proprietarioId) return 'Seleziona un proprietario'; } return null;
      case 6: if (formData.stanze.length === 0) return 'Aggiungi almeno una stanza'; const hasLetti = formData.stanze.some(s => s.letti.length > 0); if (!hasLetti) return 'Aggiungi almeno un letto'; return null;
      case 7: 
        // Valida TUTTE le configurazioni: per ogni N° ospiti, i posti letto devono essere >= N
        for (let g = 1; g <= formData.maxGuests; g++) {
          const cfg = linenConfigs[g];
          if (!cfg) continue;
          const cap = cfg.selectedBeds.reduce((t, bedId) => {
            const bed = allBeds.find(b => b.id === bedId);
            return t + (bed?.capacita || 0);
          }, 0);
          if (cap < g) return `Configurazione ${g} ospiti: servono almeno ${g} posti letto (hai ${cap})`;
        }
        return null;
      case 8: return null;
      default: return null;
    }
  };

  const nextStep = () => { const err = validateStep(); if (err) { setError(err); return; } setError(''); setStep(s => Math.min(s + 1, totalSteps)); };
  const prevStep = () => { setError(''); setStep(s => Math.max(s - 1, 1)); };

  const handleSubmit = async () => {
    const err = validateStep(); if (err) { setError(err); return; }
    setSaving(true); setError('');
    try {
      const bedConfiguration = formData.stanze.map(s => ({ nome: s.nome, letti: s.letti.map(l => ({ tipo: l.tipo, quantita: l.quantita })) }));
      const linenConfigsForSave = Object.entries(linenConfigs).map(([gc, cfg]) => ({ guestCount: parseInt(gc), selectedBeds: cfg.selectedBeds, bedLinen: cfg.bedLinen, bathItems: cfg.bathItems, kitItems: cfg.kitItems, extras: cfg.extras }));
      const data = {
        name: formData.nome.trim(), address: formData.indirizzo.trim(), city: formData.citta.trim(), postalCode: formData.cap.trim(), floor: formData.piano.trim(), accessCode: formData.citofonoAccesso.trim(),
        bathrooms: formData.bagni, maxGuests: formData.maxGuests, checkInTime: formData.checkIn, checkOutTime: formData.checkOut, cleaningPrice: parseFloat(formData.prezzoBase) || 0,
        clientId: formData.nuovoProprietario ? null : formData.proprietarioId,
        newClient: formData.nuovoProprietario ? { name: formData.proprietarioNome.trim(), email: formData.proprietarioEmail.trim().toLowerCase(), phone: formData.proprietarioTelefono.trim() || null } : null,
        bedConfiguration, linenConfigs: linenConfigsForSave,
      };
      const response = await fetch('/api/properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Errore durante la creazione');
      if (imageBase64 && result.id) { try { await fetch(`/api/properties/${result.id}/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: imageBase64 }) }); } catch (e) { console.error('Errore upload immagine'); } }
      onClose(); router.refresh();
    } catch (e: any) { console.error('Errore:', e); setError(e.message || 'Errore'); } finally { setSaving(false); }
  };

  if (!isOpen) return null;
  const stepLabels = ['Info', 'Capacità', 'Orari', 'Prezzo', 'Cliente', 'Stanze', 'Dotazioni', 'Foto'];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[400px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 text-white rounded-t-3xl flex-shrink-0">
          <div className="flex items-center justify-between mb-3"><h2 className="text-base font-bold">Nuova Proprietà</h2><button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"><div className="w-4 h-4">{Icons.close}</div></button></div>
          <div className="flex items-center gap-1">{[1,2,3,4,5,6,7,8].map(i => (<div key={i} className="flex-1"><div className={`h-1 rounded-full ${i <= step ? 'bg-emerald-400' : 'bg-white/20'}`} /></div>))}</div>
          <p className="text-[10px] text-white/60 mt-1.5">Step {step}/{totalSteps} • {stepLabels[step-1]}</p>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (<div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2"><svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg><p className="text-xs text-red-600">{error}</p></div>)}

          {/* STEP 1 - Info Base */}
          {step === 1 && (<div className="space-y-3">
            <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome Proprietà *</label><input type="text" value={formData.nome} onChange={e => updateField('nome', e.target.value)} placeholder="es. Appartamento Colosseo" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" /></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Indirizzo *</label><input type="text" value={formData.indirizzo} onChange={e => updateField('indirizzo', e.target.value)} placeholder="Via Roma 123" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" /></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Città *</label><input type="text" value={formData.citta} onChange={e => updateField('citta', e.target.value)} placeholder="Roma" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" /></div><div><label className="block text-sm font-semibold text-slate-700 mb-1.5">CAP *</label><input type="text" value={formData.cap} onChange={e => updateField('cap', e.target.value)} placeholder="00100" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" /></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Piano *</label><input type="text" value={formData.piano} onChange={e => updateField('piano', e.target.value)} placeholder="3" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" /></div><div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Citofono *</label><input type="text" value={formData.citofonoAccesso} onChange={e => updateField('citofonoAccesso', e.target.value)} placeholder="Rossi" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" /></div></div>
          </div>)}

          {/* STEP 2 - Capacità e Bagni */}
          {step === 2 && (<div className="space-y-5">
            <div className="text-center py-2"><h3 className="text-lg font-bold text-slate-800 mb-1">Capacità e Bagni</h3><p className="text-sm text-slate-500">Quanti ospiti può ospitare</p></div>
            <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl p-4 text-white">
              <div className="flex items-center justify-between"><div><h4 className="font-bold">Capacità Massima</h4><p className="text-xs text-white/80">Numero massimo di ospiti</p></div><Counter value={formData.maxGuests} onChange={v => updateField('maxGuests', v)} min={1} max={20} /></div>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4">
              <div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center"><svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg></div><div><h4 className="font-semibold text-slate-800">Bagni</h4><p className="text-xs text-slate-500">Numero totale</p></div></div><Counter value={formData.bagni} onChange={v => updateField('bagni', v)} min={1} /></div>
            </div>
          </div>)}

          {/* STEP 3 - Orari */}
          {step === 3 && (<div className="space-y-5">
            <div className="text-center py-2"><h3 className="text-lg font-bold text-slate-800 mb-1">Orari</h3><p className="text-sm text-slate-500">Check-in e Check-out</p></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 rounded-2xl p-4"><label className="block text-sm font-semibold text-emerald-700 mb-2">Check-in</label><input type="time" value={formData.checkIn} onChange={e => updateField('checkIn', e.target.value)} className="w-full px-3 py-2.5 bg-white border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
              <div className="bg-rose-50 rounded-2xl p-4"><label className="block text-sm font-semibold text-rose-700 mb-2">Check-out</label><input type="time" value={formData.checkOut} onChange={e => updateField('checkOut', e.target.value)} className="w-full px-3 py-2.5 bg-white border border-rose-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" /></div>
            </div>
          </div>)}

          {/* STEP 4 - Prezzo */}
          {step === 4 && (<div className="space-y-5">
            <div className="text-center py-2"><h3 className="text-lg font-bold text-slate-800 mb-1">Prezzo Pulizia</h3><p className="text-sm text-slate-500">Tariffa base per il servizio</p></div>
            <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-6 text-white text-center">
              <p className="text-sm text-white/80 mb-2">Prezzo Base</p>
              <div className="flex items-center justify-center gap-2"><span className="text-3xl font-bold">€</span><input type="number" value={formData.prezzoBase} onChange={e => updateField('prezzoBase', e.target.value)} placeholder="65" min="0" step="0.01" className="w-24 text-3xl font-bold bg-transparent border-b-2 border-white/50 text-center focus:outline-none focus:border-white" /></div>
            </div>
          </div>)}

          {/* STEP 5 - Cliente */}
          {step === 5 && (<div className="space-y-4">
            <div className="text-center py-2"><h3 className="text-lg font-bold text-slate-800 mb-1">Proprietario</h3><p className="text-sm text-slate-500">Assegna a un cliente</p></div>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden"><button type="button" onClick={() => updateField('nuovoProprietario', false)} className={`flex-1 py-2.5 text-sm font-semibold ${!formData.nuovoProprietario ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>Esistente</button><button type="button" onClick={() => updateField('nuovoProprietario', true)} className={`flex-1 py-2.5 text-sm font-semibold ${formData.nuovoProprietario ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>Nuovo</button></div>
            {!formData.nuovoProprietario ? (<div className="space-y-3">
              <div className="relative"><svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg><input type="text" value={searchProprietario} onChange={e => setSearchProprietario(e.target.value)} placeholder="Cerca..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" /></div>
              <div className="space-y-2 max-h-44 overflow-y-auto">{filteredProprietari.length === 0 ? (<div className="text-center py-6"><p className="text-sm text-slate-500">Nessun cliente</p><button type="button" onClick={() => updateField('nuovoProprietario', true)} className="mt-2 text-sm font-semibold text-slate-800 hover:underline">+ Crea nuovo</button></div>) : filteredProprietari.map(p => (<button key={p.id} type="button" onClick={() => updateField('proprietarioId', p.id)} className={`w-full p-3 rounded-xl border-2 text-left flex items-center gap-3 ${formData.proprietarioId === p.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}><div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${formData.proprietarioId === p.id ? 'bg-emerald-500' : 'bg-slate-400'}`}>{p.name?.charAt(0) || '?'}</div><div className="flex-1 min-w-0"><p className="font-semibold text-slate-800 text-sm truncate">{p.name}</p><p className="text-xs text-slate-500 truncate">{p.email}</p></div>{formData.proprietarioId === p.id && <div className="w-5 h-5 text-emerald-500">{Icons.check}</div>}</button>))}</div>
            </div>) : (<div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3"><p className="text-xs text-blue-700">Il nuovo cliente riceverà un'email con le credenziali.</p></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome *</label><input type="text" value={formData.proprietarioNome} onChange={e => updateField('proprietarioNome', e.target.value)} placeholder="Mario Rossi" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Email *</label><input type="email" value={formData.proprietarioEmail} onChange={e => updateField('proprietarioEmail', e.target.value)} placeholder="mario@email.com" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Telefono</label><input type="tel" value={formData.proprietarioTelefono} onChange={e => updateField('proprietarioTelefono', e.target.value)} placeholder="+39 333 1234567" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" /></div>
            </div>)}
          </div>)}

          {/* STEP 6 - Stanze e Letti */}
          {step === 6 && (<div className="space-y-4">
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-4 text-white">
              <div className="flex items-center justify-between"><div><h3 className="font-bold">Stanze e Letti</h3><p className="text-xs text-white/80">Configura la struttura</p></div><div className="text-right"><p className="text-2xl font-bold">{allBeds.reduce((s, b) => s + b.capacita, 0)}</p><p className="text-xs text-white/80">posti letto</p></div></div>
            </div>
            <div className="space-y-2">{formData.stanze.map(stanza => { const capStanza = stanza.letti.reduce((s, l) => { const t = TIPI_LETTO.find(x => x.tipo === l.tipo); return s + (t?.capacita || 1) * l.quantita; }, 0); return (<div key={stanza.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white"><div className="p-3 flex items-center justify-between bg-slate-50 cursor-pointer" onClick={() => setStanzaExpandedId(stanzaExpandedId === stanza.id ? null : stanza.id)}><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center"><div className="w-4 h-4 text-violet-600">{Icons.room}</div></div><div><p className="text-sm font-semibold text-slate-800">{stanza.nome}</p><p className="text-[10px] text-slate-500">{stanza.letti.length === 0 ? 'Nessun letto' : `${stanza.letti.reduce((s, l) => s + l.quantita, 0)} letti • ${capStanza} posti`}</p></div></div><div className="flex items-center gap-2"><button type="button" onClick={e => { e.stopPropagation(); rimuoviStanza(stanza.id); }} className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100"><div className="w-4 h-4 text-red-500">{Icons.trash}</div></button><div className={`w-5 h-5 text-slate-400 transition-transform ${stanzaExpandedId === stanza.id ? 'rotate-180' : ''}`}>{Icons.down}</div></div></div>{stanzaExpandedId === stanza.id && (<div className="p-3 border-t border-slate-100 space-y-2"><p className="text-xs font-medium text-slate-500 mb-2">Letti:</p><div className="grid grid-cols-2 gap-2">{TIPI_LETTO.map(tipo => { const count = stanza.letti.find(l => l.tipo === tipo.tipo)?.quantita || 0; return (<div key={tipo.tipo} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"><div className="flex items-center gap-2"><span className="text-lg">{tipo.icon}</span><div><p className="text-xs font-medium">{tipo.nome}</p><p className="text-[10px] text-slate-400">{tipo.capacita}p</p></div></div><div className="flex items-center gap-1"><button type="button" onClick={() => rimuoviLetto(stanza.id, tipo.tipo)} className="w-6 h-6 rounded bg-white border border-slate-200 flex items-center justify-center" disabled={count === 0}><div className="w-3 h-3 text-slate-500">{Icons.minus}</div></button><span className="w-5 text-center text-sm font-semibold">{count}</span><button type="button" onClick={() => aggiungiLetto(stanza.id, tipo.tipo)} className="w-6 h-6 rounded bg-violet-600 flex items-center justify-center"><div className="w-3 h-3 text-white">{Icons.plus}</div></button></div></div>); })}</div></div>)}</div>); })}</div>
            {!showAddStanza ? (<button type="button" onClick={() => setShowAddStanza(true)} className="w-full py-3 border-2 border-dashed border-violet-300 rounded-xl text-violet-600 font-semibold text-sm hover:border-violet-400 hover:bg-violet-50 flex items-center justify-center gap-2"><div className="w-5 h-5">{Icons.plus}</div>Aggiungi Stanza</button>) : (<div className="bg-violet-50 rounded-xl p-3 space-y-2"><p className="text-xs font-semibold text-violet-700">Tipo stanza:</p><div className="flex flex-wrap gap-1.5">{STANZE_PREDEFINITE.map(n => (<button key={n} type="button" onClick={() => aggiungiStanza(n)} className="px-3 py-1.5 bg-white border border-violet-200 rounded-lg text-xs font-medium text-violet-700 hover:bg-violet-100">{n}</button>))}</div><div className="flex gap-2"><input type="text" value={nuovaStanzaNome} onChange={e => setNuovaStanzaNome(e.target.value)} placeholder="Nome personalizzato..." className="flex-1 px-3 py-2 bg-white border border-violet-200 rounded-lg text-sm" onKeyDown={e => e.key === 'Enter' && aggiungiStanza(nuovaStanzaNome)} /><button type="button" onClick={() => aggiungiStanza(nuovaStanzaNome)} disabled={!nuovaStanzaNome.trim()} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">Aggiungi</button></div><button type="button" onClick={() => { setShowAddStanza(false); setNuovaStanzaNome(''); }} className="w-full mt-2 text-xs text-slate-500">Annulla</button></div>)}
          </div>)}

          {/* STEP 7 - Configurazione Dotazioni */}
          {step === 7 && (<div className="space-y-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-4 text-white">
              <div className="flex items-center justify-between mb-3"><div><h3 className="font-bold">Configurazione Dotazioni</h3><p className="text-xs text-white/80">Default per ogni N° ospiti</p></div><div className="text-right"><p className="text-xl font-bold">€{(calcBedLinenPrice() + calcBathPrice() + calcKitPrice() + calcExtrasPrice()).toFixed(2)}</p><p className="text-xs text-white/80">totale</p></div></div>
              <GuestSelector value={selectedGuestCount} onChange={setSelectedGuestCount} max={formData.maxGuests} />
              {/* Warning se posti letto insufficienti */}
              {isCapacityInsufficient && (
                <div className="mt-2 bg-red-500/20 border border-red-400/50 rounded-lg p-2 flex items-center gap-2">
                  <div className="w-4 h-4 text-red-200">{Icons.warn}</div>
                  <p className="text-xs text-white">Servono almeno {selectedGuestCount} posti letto (hai {currentBedCapacity})</p>
                </div>
              )}
            </div>
            {formData.stanze.length === 0 ? (<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center"><p className="text-sm text-amber-700">Configura prima le stanze nello step precedente</p></div>) : (<>
              <Section title="Biancheria Letto" icon={Icons.bed} price={calcBedLinenPrice()} expanded={expandedSection === 'beds'} onToggle={() => setExpandedSection(expandedSection === 'beds' ? null : 'beds')} color="blue">
                {invLinen.length === 0 ? (<div className="text-center py-3"><p className="text-xs text-slate-500">Nessun articolo</p><a href="/admin/inventario" className="text-xs text-blue-600 underline">Aggiungi →</a></div>) : (<div className="space-y-2">{allBeds.map(bed => { const isSelected = currentConfig.selectedBeds.includes(bed.id); const bedLinen = currentConfig.bedLinen[bed.id] || {}; return (<div key={bed.id} className={`rounded-lg border-2 overflow-hidden ${isSelected ? 'border-blue-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}><div className="p-2 flex items-center gap-2 cursor-pointer" onClick={() => toggleBed(bed.id)}><div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>{isSelected && <div className="w-3 h-3 text-white">{Icons.check}</div>}</div><div className="flex-1"><p className="text-sm font-medium">{bed.nome}</p><p className="text-[10px] text-slate-500">{bed.stanza} • {bed.capacita}p</p></div></div>{isSelected && (<div className="px-2 pb-2 pt-1 border-t border-blue-100 bg-blue-50/50 space-y-1.5">{invLinen.map(item => (<div key={item.id} className="flex items-center justify-between bg-white rounded p-1.5 border border-blue-100"><span className="text-xs text-slate-700">{item.nome} <span className="text-blue-500">€{item.prezzo}</span></span><Counter value={bedLinen[item.id] || 0} onChange={v => updateBedLinen(bed.id, item.id, v)} small /></div>))}</div>)}</div>); })}</div>)}
              </Section>
              <Section title="Biancheria Bagno" icon={Icons.towel} price={calcBathPrice()} expanded={expandedSection === 'bath'} onToggle={() => setExpandedSection(expandedSection === 'bath' ? null : 'bath')} color="purple">
                {invBath.length === 0 ? (<div className="text-center py-3"><p className="text-xs text-slate-500">Nessun articolo</p></div>) : (<div className="space-y-2">{invBath.map(item => (<div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-purple-100"><span className="text-xs text-slate-700">{item.nome} <span className="text-purple-500">€{item.prezzo}</span></span><Counter value={currentConfig.bathItems[item.id] || 0} onChange={v => updateBathItem(item.id, v)} small /></div>))}</div>)}
              </Section>
              <Section title="Kit Cortesia" icon={Icons.soap} price={calcKitPrice()} expanded={expandedSection === 'kit'} onToggle={() => setExpandedSection(expandedSection === 'kit' ? null : 'kit')} color="amber">
                {invKit.length === 0 ? (<div className="text-center py-3"><p className="text-xs text-slate-500">Nessun articolo</p></div>) : (<div className="space-y-2">{invKit.map(item => (<div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-amber-100"><span className="text-xs text-slate-700">{item.nome} <span className="text-amber-600">€{item.prezzo}</span></span><Counter value={currentConfig.kitItems[item.id] || 0} onChange={v => updateKitItem(item.id, v)} small /></div>))}</div>)}
              </Section>
              <Section title="Servizi Extra" icon={Icons.gift} price={calcExtrasPrice()} expanded={expandedSection === 'extra'} onToggle={() => setExpandedSection(expandedSection === 'extra' ? null : 'extra')} color="emerald">
                {invExtras.length === 0 ? (<div className="text-center py-3"><p className="text-xs text-slate-500">Nessun servizio</p></div>) : (<div className="space-y-2">{invExtras.map(item => (<div key={item.id} onClick={() => toggleExtra(item.id)} className={`rounded-lg p-2.5 border-2 cursor-pointer ${currentConfig.extras[item.id] ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${currentConfig.extras[item.id] ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>{currentConfig.extras[item.id] && <div className="w-3 h-3 text-white">{Icons.check}</div>}</div><div><p className="text-sm font-medium">{item.nome}</p><p className="text-[10px] text-slate-500">{item.descrizione}</p></div></div><span className="text-sm font-bold text-emerald-600">€{item.prezzo}</span></div></div>))}</div>)}
              </Section>
            </>)}
          </div>)}

          {/* STEP 8 - Foto */}
          {step === 8 && (<div className="space-y-4">
            <div className="text-center py-2"><h3 className="text-lg font-bold text-slate-800 mb-1">Foto Proprietà</h3><p className="text-sm text-slate-500">Aggiungi una foto (opzionale)</p></div>
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center cursor-pointer hover:border-slate-400 group">
              {imagePreview ? (<div className="space-y-2"><img src={imagePreview} alt="Preview" className="w-32 h-32 object-cover rounded-xl mx-auto" /><p className="text-sm font-medium text-slate-700 truncate">{imageFile?.name}</p><p className="text-xs text-slate-400">Clicca per cambiare</p></div>) : (<><div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-slate-200"><svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div><p className="text-sm font-medium text-slate-600 mb-1">Clicca per caricare</p><p className="text-xs text-slate-400">PNG, JPG fino a 5MB</p></>)}
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2"><svg className="w-4 h-4 text-emerald-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg><div><p className="text-sm font-semibold text-emerald-800">Quasi fatto!</p><p className="text-xs text-emerald-600 mt-0.5">La foto è opzionale.</p></div></div>
          </div>)}

        </div>
        {/* Footer */}
        <div className="px-4 pb-4 pt-2 flex gap-2 border-t border-slate-100 flex-shrink-0">
          {step > 1 && (<button type="button" onClick={prevStep} disabled={saving} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50">Indietro</button>)}
          <button type="button" onClick={step === totalSteps ? handleSubmit : nextStep} disabled={saving} className={`flex-1 py-3 rounded-xl text-sm font-semibold active:scale-[0.98] disabled:opacity-50 ${step === totalSteps ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}>{saving ? (<span className="flex items-center justify-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Creazione...</span>) : step === totalSteps ? '✓ Crea Proprietà' : 'Avanti'}</button>
        </div>
      </div>
    </div>
  );
}
