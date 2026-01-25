"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import AddressAutocomplete from "~/components/ui/AddressAutocomplete";
import { type AddressResult } from "~/lib/geo";

interface CreaProprietaOwnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

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

const PRIORITA_LETTI: Record<string, number> = { 'matrimoniale': 1, 'singolo': 2, 'piazza_mezza': 3, 'divano_letto': 4, 'castello': 5 };
const STANZE_PREDEFINITE = ['Camera Matrimoniale', 'Camera Singola', 'Camera Doppia', 'Soggiorno', 'Cameretta', 'Studio'];

// ==================== CALCOLO BIANCHERIA LETTO ====================
interface LinenRequirement { lenzuoloMatrimoniale: number; lenzuoloSingolo: number; federa: number; }

function getLinenForBedType(tipoLetto: string): LinenRequirement {
  switch (tipoLetto) {
    case 'matrimoniale': return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'singolo':
    case 'piazza_mezza': return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
    case 'divano_letto': return { lenzuoloMatrimoniale: 3, lenzuoloSingolo: 0, federa: 2 };
    case 'castello': return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 6, federa: 2 };
    default: return { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 3, federa: 1 };
  }
}

function calculateTotalLinenForBeds(beds: { tipo: string }[]): LinenRequirement {
  const total: LinenRequirement = { lenzuoloMatrimoniale: 0, lenzuoloSingolo: 0, federa: 0 };
  beds.forEach(bed => {
    const req = getLinenForBedType(bed.tipo);
    total.lenzuoloMatrimoniale += req.lenzuoloMatrimoniale;
    total.lenzuoloSingolo += req.lenzuoloSingolo;
    total.federa += req.federa;
  });
  return total;
}

function mapLinenToInventory(linenReq: LinenRequirement, inventoryItems: InventoryLinenItem[]): Record<string, number> {
  const result: Record<string, number> = {};
  const findItem = (keywords: string[]): InventoryLinenItem | undefined => {
    return inventoryItems.find(item => {
      const name = (item.nome || '').toLowerCase();
      const id = (item.id || '').toLowerCase();
      return keywords.some(kw => name.includes(kw.toLowerCase()) || id.includes(kw.toLowerCase()));
    });
  };
  const lenzMatr = findItem(['matrimoniale', 'matr']);
  if (lenzMatr && linenReq.lenzuoloMatrimoniale > 0) result[lenzMatr.id] = linenReq.lenzuoloMatrimoniale;
  const lenzSing = findItem(['singolo', 'sing']);
  if (lenzSing && linenReq.lenzuoloSingolo > 0) result[lenzSing.id] = linenReq.lenzuoloSingolo;
  const federa = findItem(['federa', 'federe']);
  if (federa && linenReq.federa > 0) result[federa.id] = linenReq.federa;
  return result;
}

// ==================== CALCOLO BIANCHERIA BAGNO ====================
interface BathRequirement { teloCorpo: number; teloViso: number; teloBidet: number; scendiBagno: number; }

function calculateBathLinen(guestsCount: number, bathroomsCount: number): BathRequirement {
  return { teloCorpo: guestsCount, teloViso: guestsCount, teloBidet: guestsCount, scendiBagno: bathroomsCount };
}

function mapBathToInventory(bathReq: BathRequirement, inventoryItems: InventoryBathItem[]): Record<string, number> {
  const result: Record<string, number> = {};
  const findItem = (keywords: string[]): InventoryBathItem | undefined => {
    return inventoryItems.find(item => {
      const name = (item.nome || '').toLowerCase();
      const id = (item.id || '').toLowerCase();
      return keywords.some(kw => name.includes(kw.toLowerCase()) || id.includes(kw.toLowerCase()));
    });
  };
  const teloCorpo = findItem(['telo corpo', 'telocorpo', 'telo doccia', 'asciugamano grande']);
  if (teloCorpo && bathReq.teloCorpo > 0) result[teloCorpo.id] = bathReq.teloCorpo;
  const teloViso = findItem(['telo viso', 'teloviso', 'asciugamano viso']);
  if (teloViso && bathReq.teloViso > 0) result[teloViso.id] = bathReq.teloViso;
  const teloBidet = findItem(['telo bidet', 'telobidet', 'bidet']);
  if (teloBidet && bathReq.teloBidet > 0) result[teloBidet.id] = bathReq.teloBidet;
  const scendiBagno = findItem(['scendi bagno', 'scendibagno', 'tappetino', 'scendidoccia']);
  if (scendiBagno && bathReq.scendiBagno > 0) result[scendiBagno.id] = bathReq.scendiBagno;
  return result;
}

const Icons = {
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/><rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/></svg>,
  towel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="3" width="12" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M6 7H18M6 11H18"/></svg>,
  soap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="8" width="12" height="12" rx="2" fill="currentColor" opacity="0.1"/><path d="M10 8V6C10 5 11 4 12 4C13 4 14 5 14 6V8M9 12H15M9 15H13"/></svg>,
  gift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="8" width="18" height="13" rx="2" fill="currentColor" opacity="0.1"/><path d="M12 8V21M3 12H21M12 8C12 8 12 5 9.5 5C8 5 7 6 7 7C7 8 8 8 12 8M12 8C12 8 12 5 14.5 5C16 5 17 6 17 7C17 8 16 8 12 8"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M12 5V19M5 12H19"/></svg>,
  minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M5 12H19"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 6H21M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6H19Z"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M6 18L18 6M6 6L18 18"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M5 13L9 17L19 7"/></svg>,
  down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M6 9L12 15L18 9"/></svg>,
  room: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/><path d="M9 21V12H15V21M3 12H21"/></svg>,
  warn: <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>,
  location: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
};

// Counter component
function Counter({ value, onChange, min = 0, max = 99, small = false }: { value: number; onChange: (v: number) => void; min?: number; max?: number; small?: boolean }) {
  return (
    <div className={`flex items-center ${small ? 'gap-1' : 'gap-2'}`}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className={`${small ? 'w-6 h-6' : 'w-8 h-8'} rounded-lg bg-slate-200 flex items-center justify-center hover:bg-slate-300`} disabled={value <= min}>
        <div className={`${small ? 'w-3 h-3' : 'w-4 h-4'} text-slate-600`}>{Icons.minus}</div>
      </button>
      <span className={`${small ? 'w-5 text-xs' : 'w-8 text-base'} text-center font-bold`}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className={`${small ? 'w-6 h-6' : 'w-8 h-8'} rounded-lg bg-slate-800 flex items-center justify-center hover:bg-slate-700`} disabled={value >= max}>
        <div className={`${small ? 'w-3 h-3' : 'w-4 h-4'} text-white`}>{Icons.plus}</div>
      </button>
    </div>
  );
}

// Guest selector
function GuestSelector({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <button key={n} type="button" onClick={() => onChange(n)} className={`w-8 h-8 rounded-lg text-sm font-bold ${value === n ? 'bg-white text-blue-600' : 'bg-white/20 text-white hover:bg-white/30'}`}>{n}</button>
      ))}
    </div>
  );
}

// Section component
function Section({ title, icon, price, expanded, onToggle, children, color }: { title: string; icon: React.ReactNode; price: number; expanded: boolean; onToggle: () => void; children: React.ReactNode; color: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  };
  const c = colors[color] || colors.blue;
  return (
    <div className={`rounded-xl border ${c.border} overflow-hidden`}>
      <button type="button" onClick={onToggle} className={`w-full p-3 flex items-center justify-between ${c.bg}`}>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}><div className={`w-4 h-4 ${c.text}`}>{icon}</div></div>
          <span className="font-semibold text-slate-800">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold ${c.text}`}>€{price.toFixed(2)}</span>
          <div className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>{Icons.down}</div>
        </div>
      </button>
      {expanded && <div className="p-3 bg-white">{children}</div>}
    </div>
  );
}

export default function CreaProprietaOwnerModal({ isOpen, onClose, onSuccess }: CreaProprietaOwnerModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [invLinen, setInvLinen] = useState<InventoryLinenItem[]>([]);
  const [invBath, setInvBath] = useState<InventoryBathItem[]>([]);
  const [invKit, setInvKit] = useState<InventoryKitItem[]>([]);
  const [invExtras, setInvExtras] = useState<InventoryExtraItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);

  // ═══════════════════════════════════════════════════════════════
  // FORM DATA CON COORDINATE E VERIFICA INDIRIZZO
  // ═══════════════════════════════════════════════════════════════
  const [formData, setFormData] = useState({
    nome: '', 
    indirizzo: '', 
    citta: '', 
    cap: '', 
    piano: '', 
    citofonoAccesso: '',
    maxGuests: 4, 
    bagni: 1, 
    checkIn: '15:00', 
    checkOut: '10:00',
    stanze: [] as Stanza[],
    // NUOVI CAMPI PER GEOCODING
    coordinates: null as { lat: number; lng: number } | null,
    addressVerified: false,
    houseNumber: '', // Numero civico separato
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [linenConfigs, setLinenConfigs] = useState<Record<number, GuestLinenConfig>>({});
  const [showAddStanza, setShowAddStanza] = useState(false);
  const [nuovaStanzaNome, setNuovaStanzaNome] = useState('');
  const [stanzaExpandedId, setStanzaExpandedId] = useState<string | null>(null);
  const [selectedGuestCount, setSelectedGuestCount] = useState(1);
  const [expandedSection, setExpandedSection] = useState<string | null>('beds');

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

  const generateDefaultConfig = (guestCount: number): GuestLinenConfig => {
    const allBeds = getAllBeds();
    const sortedBeds = [...allBeds].sort((a, b) => (PRIORITA_LETTI[a.tipo] || 99) - (PRIORITA_LETTI[b.tipo] || 99));
    const selectedBeds: string[] = [];
    let remainingGuests = guestCount;
    for (const bed of sortedBeds) { if (remainingGuests <= 0) break; selectedBeds.push(bed.id); remainingGuests -= bed.capacita; }
    const selectedBedsData = allBeds.filter(b => selectedBeds.includes(b.id));
    const linenReq = calculateTotalLinenForBeds(selectedBedsData);
    const mappedLinen = mapLinenToInventory(linenReq, invLinen);
    const bedLinen: Record<string, Record<string, number>> = { 'all': mappedLinen };
    const bathReq = calculateBathLinen(guestCount, formData.bagni);
    const mappedBath = mapBathToInventory(bathReq, invBath);
    const kitItems: Record<string, number> = {};
    const extras: Record<string, boolean> = {};
    invExtras.forEach(item => { extras[item.id] = false; });
    return { selectedBeds, bedLinen, bathItems: mappedBath, kitItems, extras };
  };

  useEffect(() => {
    if (loadingInventory) return;
    if (formData.maxGuests > 0 && formData.stanze.length > 0) {
      const newConfigs: Record<number, GuestLinenConfig> = {};
      for (let i = 1; i <= formData.maxGuests; i++) newConfigs[i] = generateDefaultConfig(i);
      setLinenConfigs(newConfigs);
      if (selectedGuestCount > formData.maxGuests) setSelectedGuestCount(formData.maxGuests);
    }
  }, [formData.stanze, formData.maxGuests, formData.bagni, invLinen, invBath, invKit, invExtras, loadingInventory]);

  useEffect(() => { if (isOpen) document.body.style.overflow = 'hidden'; else document.body.style.overflow = ''; return () => { document.body.style.overflow = ''; }; }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setStep(1); setError(''); setShowAddStanza(false); setNuovaStanzaNome(''); setStanzaExpandedId(null);
      setSelectedGuestCount(1); setExpandedSection('beds'); setLinenConfigs({}); setImageFile(null); setImageBase64(null); setImagePreview(null);
      setFormData({ nome: '', indirizzo: '', citta: '', cap: '', piano: '', citofonoAccesso: '', maxGuests: 4, bagni: 1, checkIn: '15:00', checkOut: '10:00', stanze: [], coordinates: null, addressVerified: false, houseNumber: '' });
      setShowSuccessModal(false);
    }
  }, [isOpen]);

  const totalSteps = 6;
  const allBeds = getAllBeds();
  const totalPostiLetto = allBeds.reduce((s, b) => s + b.capacita, 0);
  const currentConfig = linenConfigs[selectedGuestCount] || { selectedBeds: [], bedLinen: {}, bathItems: {}, kitItems: {}, extras: {} };
  const currentBedCapacity = currentConfig.selectedBeds.reduce((t, bedId) => { const bed = allBeds.find(b => b.id === bedId); return t + (bed?.capacita || 0); }, 0);
  const isCapacityInsufficient = currentBedCapacity < selectedGuestCount;

  const updateField = (field: string, value: any) => { 
    setFormData(prev => ({ ...prev, [field]: value })); 
    setError(''); 
    // Se modificano manualmente città o CAP, reset verifica
    if (field === 'citta' || field === 'cap') {
      setFormData(prev => ({ ...prev, [field]: value, addressVerified: false }));
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // HANDLER SELEZIONE INDIRIZZO DA AUTOCOMPLETE
  // ═══════════════════════════════════════════════════════════════
  const handleAddressSelect = (result: AddressResult) => {
    setFormData(prev => ({
      ...prev,
      indirizzo: result.fullAddress,
      citta: result.city || prev.citta,
      cap: result.postalCode || prev.cap,
      houseNumber: result.houseNumber || '',
      coordinates: result.coordinates,
      addressVerified: true,
    }));
    setError('');
  };

  const aggiungiStanza = (nome: string) => { if (!nome.trim()) return; const newStanza: Stanza = { id: `stanza_${Date.now()}`, nome: nome.trim(), letti: [] }; setFormData(prev => ({ ...prev, stanze: [...prev.stanze, newStanza] })); setStanzaExpandedId(newStanza.id); setShowAddStanza(false); setNuovaStanzaNome(''); };
  const rimuoviStanza = (stanzaId: string) => { setFormData(prev => ({ ...prev, stanze: prev.stanze.filter(s => s.id !== stanzaId) })); if (stanzaExpandedId === stanzaId) setStanzaExpandedId(null); };
  const aggiungiLetto = (stanzaId: string, tipo: Letto['tipo']) => { setFormData(prev => ({ ...prev, stanze: prev.stanze.map(s => { if (s.id !== stanzaId) return s; const existing = s.letti.find(l => l.tipo === tipo); if (existing) return { ...s, letti: s.letti.map(l => l.tipo === tipo ? { ...l, quantita: l.quantita + 1 } : l) }; return { ...s, letti: [...s.letti, { id: `letto_${Date.now()}`, tipo, quantita: 1 }] }; }) })); };
  const rimuoviLetto = (stanzaId: string, tipo: Letto['tipo']) => { setFormData(prev => ({ ...prev, stanze: prev.stanze.map(s => { if (s.id !== stanzaId) return s; const existing = s.letti.find(l => l.tipo === tipo); if (!existing) return s; if (existing.quantita > 1) return { ...s, letti: s.letti.map(l => l.tipo === tipo ? { ...l, quantita: l.quantita - 1 } : l) }; return { ...s, letti: s.letti.filter(l => l.tipo !== tipo) }; }) })); };

  const toggleBed = (bedId: string) => { const config = { ...currentConfig }; if (config.selectedBeds.includes(bedId)) { config.selectedBeds = config.selectedBeds.filter(id => id !== bedId); delete config.bedLinen[bedId]; } else { config.selectedBeds.push(bedId); config.bedLinen[bedId] = {}; invLinen.forEach(item => { config.bedLinen[bedId][item.id] = item.default; }); } setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config })); };
  const updateBedLinen = (bedId: string, itemId: string, qty: number) => { const config = { ...currentConfig }; if (!config.bedLinen[bedId]) config.bedLinen[bedId] = {}; config.bedLinen[bedId][itemId] = qty; setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config })); };
  const updateBathItem = (itemId: string, qty: number) => { const config = { ...currentConfig }; config.bathItems[itemId] = qty; setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config })); };
  const updateKitItem = (itemId: string, qty: number) => { const config = { ...currentConfig }; config.kitItems[itemId] = qty; setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config })); };
  const toggleExtra = (itemId: string) => { const config = { ...currentConfig }; config.extras[itemId] = !config.extras[itemId]; setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config })); };

  const calcBedLinenPrice = () => { let t = 0; Object.entries(currentConfig.bedLinen).forEach(([, items]) => { Object.entries(items).forEach(([itemId, qty]) => { const i = invLinen.find(x => x.id === itemId); if (i) t += i.prezzo * qty; }); }); return t; };
  const calcBathPrice = () => Object.entries(currentConfig.bathItems).reduce((t, [id, q]) => { const i = invBath.find(x => x.id === id); return t + (i ? i.prezzo * q : 0); }, 0);
  const calcKitPrice = () => Object.entries(currentConfig.kitItems).reduce((t, [id, q]) => { const i = invKit.find(x => x.id === id); return t + (i ? i.prezzo * q : 0); }, 0);
  const calcExtrasPrice = () => Object.entries(currentConfig.extras).reduce((t, [id, sel]) => { if (!sel) return t; const i = invExtras.find(x => x.id === id); return t + (i ? i.prezzo : 0); }, 0);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { setError('Immagine troppo grande (max 5MB)'); return; }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => { setImageBase64(reader.result as string); setImagePreview(reader.result as string); };
      reader.readAsDataURL(file);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // VALIDAZIONE CON CONTROLLO CIVICO
  // ═══════════════════════════════════════════════════════════════
  const validateStep = (): string | null => {
    switch (step) {
      case 1:
        if (!formData.nome.trim()) return 'Inserisci il nome della proprietà';
        if (!formData.indirizzo.trim()) return 'Inserisci l\'indirizzo';
        // NUOVO: Verifica che l'indirizzo sia stato selezionato dall'autocomplete
        if (!formData.addressVerified) return 'Seleziona un indirizzo dalla lista suggerimenti';
        // NUOVO: Verifica presenza numero civico
        if (!formData.houseNumber && !formData.indirizzo.match(/\d+/)) {
          return 'L\'indirizzo deve includere il numero civico';
        }
        if (!formData.citta.trim()) return 'Inserisci la città';
        if (!formData.cap.trim()) return 'Inserisci il CAP';
        if (!formData.piano.trim()) return 'Inserisci il piano';
        if (!formData.citofonoAccesso.trim()) return 'Inserisci il citofono/accesso';
        return null;
      case 2:
        if (formData.maxGuests < 1) return 'Inserisci almeno 1 ospite';
        if (formData.bagni < 1) return 'Inserisci almeno 1 bagno';
        return null;
      case 3:
        if (!formData.checkIn || !formData.checkOut) return 'Imposta gli orari di check-in e check-out';
        return null;
      case 4:
        if (formData.stanze.length === 0) return 'Aggiungi almeno una stanza';
        if (totalPostiLetto < formData.maxGuests) return `Servono almeno ${formData.maxGuests} posti letto`;
        return null;
      case 5: return null;
      case 6: return null;
      default: return null;
    }
  };

  const nextStep = () => { const err = validateStep(); if (err) { setError(err); return; } setError(''); setStep(s => Math.min(s + 1, totalSteps)); };
  const prevStep = () => { setError(''); setStep(s => Math.max(s - 1, 1)); };

  // ═══════════════════════════════════════════════════════════════
  // SUBMIT CON COORDINATE
  // ═══════════════════════════════════════════════════════════════
  const handleSubmit = async () => {
    const err = validateStep(); if (err) { setError(err); return; }
    setSaving(true); setError('');
    try {
      const bedConfiguration = formData.stanze.map(s => ({ nome: s.nome, letti: s.letti.map(l => ({ tipo: l.tipo, quantita: l.quantita })) }));
      const linenConfigsForSave = Object.entries(linenConfigs).map(([gc, cfg]) => ({ guestCount: parseInt(gc), selectedBeds: cfg.selectedBeds, bedLinen: cfg.bedLinen, bathItems: cfg.bathItems, kitItems: cfg.kitItems, extras: cfg.extras }));
      
      const data = { 
        ownerId: user?.id, 
        ownerName: user?.name, 
        ownerEmail: user?.email,
        name: formData.nome.trim(), 
        address: formData.indirizzo.trim(), 
        city: formData.citta.trim(), 
        postalCode: formData.cap.trim(), 
        floor: formData.piano.trim(), 
        accessCode: formData.citofonoAccesso.trim(), 
        bathrooms: formData.bagni, 
        maxGuests: formData.maxGuests, 
        checkInTime: formData.checkIn, 
        checkOutTime: formData.checkOut, 
        bedConfiguration, 
        linenConfigs: linenConfigsForSave,
        // NUOVI CAMPI GEOCODING
        coordinates: formData.coordinates,
        coordinatesVerified: formData.addressVerified,
      };
      
      const response = await fetch('/api/properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Errore durante la creazione');
      if (imageBase64 && result.id) { try { await fetch(`/api/properties/${result.id}/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: imageBase64 }) }); } catch (e) { console.error('Errore upload immagine'); } }
      setShowSuccessModal(true);
    } catch (e: any) { console.error('Errore:', e); setError(e.message || 'Errore'); } finally { setSaving(false); }
  };

  if (!isOpen) return null;
  const stepLabels = ['Info', 'Capacità', 'Orari', 'Stanze', 'Dotazioni', 'Foto'];

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    onClose();
    if (onSuccess) onSuccess();
    window.location.reload();
  };

  // Modal di successo
  if (showSuccessModal) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[350px] p-6 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Proprietà Creata!</h3>
          <p className="text-slate-500 text-sm mb-6">La tua proprietà è stata inviata ed è in attesa di approvazione.</p>
          {formData.coordinates && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <div className="w-4 h-4 text-emerald-600">{Icons.location}</div>
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-emerald-700">Posizione salvata</p>
                <p className="text-[10px] text-emerald-600">Coordinate GPS registrate</p>
              </div>
            </div>
          )}
          <button onClick={handleSuccessClose} className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800">Ho capito</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[400px] max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 text-white rounded-t-3xl flex-shrink-0">
          <div className="flex items-center justify-between mb-3"><h2 className="text-base font-bold">Nuova Proprietà</h2><button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"><div className="w-4 h-4">{Icons.close}</div></button></div>
          <div className="flex items-center gap-1">{[1,2,3,4,5,6].map(i => (<div key={i} className="flex-1"><div className={`h-1 rounded-full ${i <= step ? 'bg-emerald-400' : 'bg-white/20'}`} /></div>))}</div>
          <p className="text-[10px] text-white/60 mt-1.5">Step {step}/{totalSteps} - {stepLabels[step-1]}</p>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
        <div className="flex-1 overflow-y-auto p-4">
          {error && (<div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2"><svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg><p className="text-xs text-red-600">{error}</p></div>)}

          {/* ═══════════════════════════════════════════════════════════════
              STEP 1: INFO CON ADDRESS AUTOCOMPLETE
          ═══════════════════════════════════════════════════════════════ */}
          {step === 1 && (<div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome Proprietà *</label>
              <input type="text" value={formData.nome} onChange={e => updateField('nome', e.target.value)} placeholder="es. Appartamento Colosseo" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
            </div>
            
            {/* ADDRESS AUTOCOMPLETE */}
            <div>
              <AddressAutocomplete
                label="Indirizzo completo"
                required
                placeholder="Via Roma 123, Roma"
                onSelect={handleAddressSelect}
                defaultValue={formData.indirizzo}
                showVerifiedIcon={true}
              />
              {formData.addressVerified && formData.coordinates && (
                <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>✓ Coordinate GPS salvate per calcolo distanze</span>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Città *</label>
                <input type="text" value={formData.citta} onChange={e => updateField('citta', e.target.value)} placeholder="Roma" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">CAP *</label>
                <input type="text" value={formData.cap} onChange={e => updateField('cap', e.target.value)} placeholder="00100" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Piano *</label>
                <input type="text" value={formData.piano} onChange={e => updateField('piano', e.target.value)} placeholder="3" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Citofono *</label>
                <input type="text" value={formData.citofonoAccesso} onChange={e => updateField('citofonoAccesso', e.target.value)} placeholder="Rossi" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
            </div>
          </div>)}

          {step === 2 && (<div className="space-y-5">
            <div className="text-center py-2"><h3 className="text-lg font-bold text-slate-800 mb-1">Capacità e Bagni</h3><p className="text-sm text-slate-500">Quanti ospiti può ospitare</p></div>
            <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl p-4 text-white"><div className="flex items-center justify-between"><div><h4 className="font-bold">Capacità Massima</h4><p className="text-xs text-white/80">Numero massimo di ospiti</p></div><Counter value={formData.maxGuests} onChange={v => updateField('maxGuests', v)} min={1} max={20} /></div></div>
            <div className="bg-slate-50 rounded-2xl p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center"><svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg></div><div><h4 className="font-semibold text-slate-800">Bagni</h4><p className="text-xs text-slate-500">Numero totale</p></div></div><Counter value={formData.bagni} onChange={v => updateField('bagni', v)} min={1} /></div></div>
          </div>)}

          {step === 3 && (<div className="space-y-5">
            <div className="text-center py-2"><h3 className="text-lg font-bold text-slate-800 mb-1">Orari</h3><p className="text-sm text-slate-500">Check-in e Check-out</p></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 rounded-2xl p-4"><label className="block text-sm font-semibold text-emerald-700 mb-2">Check-in</label><input type="time" value={formData.checkIn} onChange={e => updateField('checkIn', e.target.value)} className="w-full px-3 py-2.5 bg-white border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
              <div className="bg-rose-50 rounded-2xl p-4"><label className="block text-sm font-semibold text-rose-700 mb-2">Check-out</label><input type="time" value={formData.checkOut} onChange={e => updateField('checkOut', e.target.value)} className="w-full px-3 py-2.5 bg-white border border-rose-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" /></div>
            </div>
          </div>)}

          {step === 4 && (<div className="space-y-4">
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-4 text-white">
              <div className="flex items-center justify-between"><div><h3 className="font-bold">Stanze e Letti</h3><p className="text-xs text-white/80">Configura la struttura</p></div><div className="text-right"><p className="text-2xl font-bold">{totalPostiLetto}</p><p className="text-xs text-white/80">posti letto</p></div></div>
              {totalPostiLetto < formData.maxGuests && totalPostiLetto > 0 && (<div className="mt-2 bg-red-500/20 border border-red-400/50 rounded-lg p-2 flex items-center gap-2"><div className="w-4 h-4 text-red-200">{Icons.warn}</div><p className="text-xs text-white">Servono almeno {formData.maxGuests} posti letto (hai {totalPostiLetto})</p></div>)}
            </div>
            <div className="space-y-2">{formData.stanze.map(stanza => { const capStanza = stanza.letti.reduce((s, l) => { const t = TIPI_LETTO.find(x => x.tipo === l.tipo); return s + (t?.capacita || 1) * l.quantita; }, 0); return (<div key={stanza.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white"><div className="p-3 flex items-center justify-between bg-slate-50 cursor-pointer" onClick={() => setStanzaExpandedId(stanzaExpandedId === stanza.id ? null : stanza.id)}><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center"><div className="w-4 h-4 text-violet-600">{Icons.room}</div></div><div><p className="text-sm font-semibold text-slate-800">{stanza.nome}</p><p className="text-[10px] text-slate-500">{stanza.letti.length === 0 ? 'Nessun letto' : `${stanza.letti.reduce((s, l) => s + l.quantita, 0)} letti - ${capStanza} posti`}</p></div></div><div className="flex items-center gap-2"><button type="button" onClick={e => { e.stopPropagation(); rimuoviStanza(stanza.id); }} className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100"><div className="w-4 h-4 text-red-500">{Icons.trash}</div></button><div className={`w-5 h-5 text-slate-400 transition-transform ${stanzaExpandedId === stanza.id ? 'rotate-180' : ''}`}>{Icons.down}</div></div></div>{stanzaExpandedId === stanza.id && (<div className="p-3 border-t border-slate-100 space-y-2"><p className="text-xs font-medium text-slate-500 mb-2">Letti:</p><div className="grid grid-cols-2 gap-2">{TIPI_LETTO.map(tipo => { const count = stanza.letti.find(l => l.tipo === tipo.tipo)?.quantita || 0; return (<div key={tipo.tipo} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"><div className="flex items-center gap-2"><span className="text-lg">{tipo.icon}</span><div><p className="text-xs font-medium">{tipo.nome}</p><p className="text-[10px] text-slate-400">{tipo.capacita}p</p></div></div><div className="flex items-center gap-1"><button type="button" onClick={() => rimuoviLetto(stanza.id, tipo.tipo)} className="w-6 h-6 rounded bg-white border border-slate-200 flex items-center justify-center" disabled={count === 0}><div className="w-3 h-3 text-slate-500">{Icons.minus}</div></button><span className="w-5 text-center text-sm font-semibold">{count}</span><button type="button" onClick={() => aggiungiLetto(stanza.id, tipo.tipo)} className="w-6 h-6 rounded bg-violet-600 flex items-center justify-center"><div className="w-3 h-3 text-white">{Icons.plus}</div></button></div></div>); })}</div></div>)}</div>); })}</div>
            {!showAddStanza ? (<button type="button" onClick={() => setShowAddStanza(true)} className="w-full py-3 border-2 border-dashed border-violet-300 rounded-xl text-violet-600 font-semibold text-sm hover:border-violet-400 hover:bg-violet-50 flex items-center justify-center gap-2"><div className="w-5 h-5">{Icons.plus}</div>Aggiungi Stanza</button>) : (<div className="bg-violet-50 rounded-xl p-3 space-y-2"><p className="text-xs font-semibold text-violet-700">Tipo stanza:</p><div className="flex flex-wrap gap-1.5">{STANZE_PREDEFINITE.map(n => (<button key={n} type="button" onClick={() => aggiungiStanza(n)} className="px-3 py-1.5 bg-white border border-violet-200 rounded-lg text-xs font-medium text-violet-700 hover:bg-violet-100">{n}</button>))}</div><div className="flex gap-2"><input type="text" value={nuovaStanzaNome} onChange={e => setNuovaStanzaNome(e.target.value)} placeholder="Nome personalizzato..." className="flex-1 px-3 py-2 bg-white border border-violet-200 rounded-lg text-sm" onKeyDown={e => e.key === 'Enter' && aggiungiStanza(nuovaStanzaNome)} /><button type="button" onClick={() => aggiungiStanza(nuovaStanzaNome)} disabled={!nuovaStanzaNome.trim()} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">Aggiungi</button></div><button type="button" onClick={() => { setShowAddStanza(false); setNuovaStanzaNome(''); }} className="w-full mt-2 text-xs text-slate-500">Annulla</button></div>)}
          </div>)}

          {step === 5 && (<div className="space-y-4">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-4 text-white">
              <div className="flex items-center justify-between mb-3"><div><h3 className="font-bold">Configurazione Dotazioni</h3><p className="text-xs text-white/80">Default per ogni N ospiti</p></div><div className="text-right"><p className="text-xl font-bold">€{(calcBedLinenPrice() + calcBathPrice() + calcKitPrice() + calcExtrasPrice()).toFixed(2)}</p><p className="text-xs text-white/80">totale</p></div></div>
              <GuestSelector value={selectedGuestCount} onChange={setSelectedGuestCount} max={formData.maxGuests} />
              {isCapacityInsufficient && (<div className="mt-2 bg-red-500/20 border border-red-400/50 rounded-lg p-2 flex items-center gap-2"><div className="w-4 h-4 text-red-200">{Icons.warn}</div><p className="text-xs text-white">Servono almeno {selectedGuestCount} posti letto (hai {currentBedCapacity})</p></div>)}
            </div>
            {formData.stanze.length === 0 ? (<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center"><p className="text-sm text-amber-700">Configura prima le stanze nello step precedente</p></div>) : (<>
              <Section title="Biancheria Letto" icon={Icons.bed} price={calcBedLinenPrice()} expanded={expandedSection === 'beds'} onToggle={() => setExpandedSection(expandedSection === 'beds' ? null : 'beds')} color="blue">
                {invLinen.length === 0 ? (<div className="text-center py-3"><p className="text-xs text-slate-500">Nessun articolo</p></div>) : (<div className="space-y-2">{allBeds.map(bed => { const isSelected = currentConfig.selectedBeds.includes(bed.id); const bedLinen = currentConfig.bedLinen[bed.id] || {}; return (<div key={bed.id} className={`rounded-lg border-2 overflow-hidden ${isSelected ? 'border-blue-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}><div className="p-2 flex items-center gap-2 cursor-pointer" onClick={() => toggleBed(bed.id)}><div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>{isSelected && <div className="w-3 h-3 text-white">{Icons.check}</div>}</div><div className="flex-1"><p className="text-sm font-medium">{bed.nome}</p><p className="text-[10px] text-slate-500">{bed.stanza} - {bed.capacita}p</p></div></div>{isSelected && (<div className="px-2 pb-2 pt-1 border-t border-blue-100 bg-blue-50/50 space-y-1.5">{invLinen.map(item => (<div key={item.id} className="flex items-center justify-between bg-white rounded p-1.5 border border-blue-100"><span className="text-xs text-slate-700">{item.nome} <span className="text-blue-500">€{item.prezzo}</span></span><Counter value={bedLinen[item.id] || 0} onChange={v => updateBedLinen(bed.id, item.id, v)} small /></div>))}</div>)}</div>); })}</div>)}
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

          {step === 6 && (<div className="space-y-4">
            <div className="text-center py-2"><h3 className="text-lg font-bold text-slate-800 mb-1">Foto Proprietà</h3><p className="text-sm text-slate-500">Aggiungi una foto (opzionale)</p></div>
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center cursor-pointer hover:border-slate-400 group">
              {imagePreview ? (<div className="space-y-2"><img src={imagePreview} alt="Preview" className="w-32 h-32 object-cover rounded-xl mx-auto" /><p className="text-sm font-medium text-slate-700 truncate">{imageFile?.name}</p><p className="text-xs text-slate-400">Clicca per cambiare</p></div>) : (<><div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-slate-200"><svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div><p className="text-sm font-medium text-slate-600 mb-1">Clicca per caricare</p><p className="text-xs text-slate-400">PNG, JPG fino a 5MB</p></>)}
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2"><svg className="w-4 h-4 text-emerald-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg><div><p className="text-sm font-semibold text-emerald-800">Quasi fatto!</p><p className="text-xs text-emerald-600 mt-0.5">La foto è opzionale.</p></div></div>
          </div>)}
        </div>
        <div className="px-4 pb-4 pt-2 flex gap-2 border-t border-slate-100 flex-shrink-0">
          {step > 1 && (<button type="button" onClick={prevStep} disabled={saving} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 active:scale-[0.98] disabled:opacity-50">Indietro</button>)}
          <button type="button" onClick={step === totalSteps ? handleSubmit : nextStep} disabled={saving} className={`flex-1 py-3 rounded-xl text-sm font-semibold active:scale-[0.98] disabled:opacity-50 ${step === totalSteps ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}>{saving ? (<span className="flex items-center justify-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Creazione...</span>) : step === totalSteps ? 'Crea Proprietà' : 'Avanti'}</button>
        </div>
      </div>
    </div>
  );
}
