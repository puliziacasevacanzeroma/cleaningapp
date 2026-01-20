"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface CreaProprietaModalProps {
  isOpen: boolean;
  onClose: () => void;
  proprietari: { id: string; name: string | null; email: string | null }[];
}

// ==================== TYPES ====================
interface Stanza {
  id: string;
  nome: string;
  letti: Letto[];
}

interface Letto {
  id: string;
  tipo: 'matrimoniale' | 'singolo' | 'piazza_mezza' | 'divano_letto' | 'castello';
  quantita: number;
}

interface GuestLinenConfig {
  selectedBeds: string[];
  bedLinen: Record<string, Record<string, number>>;
  bathItems: Record<string, number>;
  kitItems: Record<string, number>;
  extras: Record<string, boolean>;
}

// Tipi per articoli inventario
interface InventoryLinenItem { id: string; nome: string; prezzo: number; default: number; }
interface InventoryBathItem { id: string; nome: string; prezzo: number; defaultPerOspite: number; }
interface InventoryKitItem { id: string; nome: string; prezzo: number; defaultPerOspite: number; }
interface InventoryExtraItem { id: string; nome: string; prezzo: number; descrizione: string; }

// ==================== CONSTANTS ====================
const TIPI_LETTO = [
  { tipo: 'matrimoniale' as const, nome: 'Matrimoniale', capacita: 2, icon: '🛏️' },
  { tipo: 'singolo' as const, nome: 'Singolo', capacita: 1, icon: '🛏️' },
  { tipo: 'piazza_mezza' as const, nome: 'Piazza e Mezza', capacita: 1, icon: '🛏️' },
  { tipo: 'divano_letto' as const, nome: 'Divano Letto', capacita: 2, icon: '🛋️' },
  { tipo: 'castello' as const, nome: 'Letto a Castello', capacita: 2, icon: '🛏️' },
];

const STANZE_PREDEFINITE = [
  'Camera Matrimoniale',
  'Camera Singola', 
  'Camera Doppia',
  'Soggiorno',
  'Cameretta',
  'Studio',
];

// ==================== ICONS ====================
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
};

// ==================== HELPER COMPONENTS ====================
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block ml-1">
      <button type="button" onClick={() => setShow(!show)} onBlur={() => setShow(false)} className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold inline-flex items-center justify-center hover:bg-slate-300 transition-colors">?</button>
      {show && (<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[11px] rounded-lg shadow-lg z-50">{text}<div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" /></div>)}
    </div>
  );
}

function Counter({ value, onChange, small = false }: { value: number; onChange: (v: number) => void; small?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className={`${small ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg border border-slate-300 bg-white flex items-center justify-center active:scale-95`}>
        <div className={`${small ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-slate-500`}>{Icons.minus}</div>
      </button>
      <span className={`${small ? 'w-5 text-xs' : 'w-6 text-sm'} text-center font-semibold`}>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} className={`${small ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg bg-slate-900 flex items-center justify-center active:scale-95`}>
        <div className={`${small ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-white`}>{Icons.plus}</div>
      </button>
    </div>
  );
}

function Section({ title, icon, price, expanded, onToggle, color = "blue", children }: { title: string; icon: React.ReactNode; price: number; expanded: boolean; onToggle: () => void; color?: string; children: React.ReactNode }) {
  const colors: Record<string, string> = { blue: 'bg-blue-100 text-blue-600', purple: 'bg-purple-100 text-purple-600', amber: 'bg-amber-100 text-amber-600', emerald: 'bg-emerald-100 text-emerald-600' };
  return (
    <div className={`rounded-xl border ${expanded ? 'border-slate-300 shadow-sm' : 'border-slate-200'} overflow-hidden mb-2 transition-all bg-white`}>
      <button type="button" onClick={onToggle} className="w-full px-3 py-2.5 flex items-center justify-between active:bg-slate-50">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg ${colors[color]} flex items-center justify-center`}><div className="w-4 h-4">{icon}</div></div>
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">€{price.toFixed(2)}</span>
          <div className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>{Icons.down}</div>
        </div>
      </button>
      <div className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-3 py-2.5 bg-slate-50 border-t border-slate-100 overflow-y-auto max-h-[350px]">{children}</div>
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
  
  // Stato per articoli caricati dall'inventario
  const [invLinen, setInvLinen] = useState<InventoryLinenItem[]>([]);
  const [invBath, setInvBath] = useState<InventoryBathItem[]>([]);
  const [invKit, setInvKit] = useState<InventoryKitItem[]>([]);
  const [invExtras, setInvExtras] = useState<InventoryExtraItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  
  // Form Data
  const [formData, setFormData] = useState({
    nome: '', indirizzo: '', citta: '', cap: '', piano: '', citofonoAccesso: '',
    bagni: 1, checkIn: '15:00', checkOut: '10:00',
    prezzoBase: '',
    proprietarioId: '', nuovoProprietario: false, proprietarioNome: '', proprietarioEmail: '', proprietarioTelefono: '',
    stanze: [] as Stanza[],
  });
  
  // Immagine
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Configurazioni biancheria
  const [linenConfigs, setLinenConfigs] = useState<Record<number, GuestLinenConfig>>({});
  
  // Stati UI
  const [showAddStanza, setShowAddStanza] = useState(false);
  const [nuovaStanzaNome, setNuovaStanzaNome] = useState('');
  const [stanzaExpandedId, setStanzaExpandedId] = useState<string | null>(null);
  const [selectedGuestCount, setSelectedGuestCount] = useState(1);
  const [expandedSection, setExpandedSection] = useState<string | null>('beds');

  // Carica articoli dall'inventario
  useEffect(() => {
    async function loadInventory() {
      try {
        const res = await fetch('/api/inventory/list');
        const data = await res.json();
        const linenItems: InventoryLinenItem[] = [];
        const bathItemsLoaded: InventoryBathItem[] = [];
        const kitItemsLoaded: InventoryKitItem[] = [];
        const extrasLoaded: InventoryExtraItem[] = [];
        data.categories?.forEach((cat: any) => {
          cat.items?.forEach((item: any) => {
            if (cat.id === 'biancheria_letto') linenItems.push({ id: item.key || item.id, nome: item.name, prezzo: item.sellPrice || 0, default: 1 });
            else if (cat.id === 'biancheria_bagno') bathItemsLoaded.push({ id: item.key || item.id, nome: item.name, prezzo: item.sellPrice || 0, defaultPerOspite: 1 });
            else if (cat.id === 'kit_cortesia') kitItemsLoaded.push({ id: item.key || item.id, nome: item.name, prezzo: item.sellPrice || 0, defaultPerOspite: 1 });
            else if (cat.id === 'servizi_extra') extrasLoaded.push({ id: item.key || item.id, nome: item.name, prezzo: item.sellPrice || 0, descrizione: item.description || '' });
          });
        });
        setInvLinen(linenItems);
        setInvBath(bathItemsLoaded);
        setInvKit(kitItemsLoaded);
        setInvExtras(extrasLoaded);
      } catch (err) { console.error('Errore caricamento inventario:', err); }
      finally { setLoadingInventory(false); }
    }
    if (isOpen) loadInventory();
  }, [isOpen]);

  // Calcola capacità
  const calcolaCapacita = () => {
    let capacita = 0;
    formData.stanze.forEach(stanza => {
      stanza.letti.forEach(letto => {
        const tipoLetto = TIPI_LETTO.find(t => t.tipo === letto.tipo);
        capacita += (tipoLetto?.capacita || 1) * letto.quantita;
      });
    });
    return capacita;
  };

  // Genera tutti i letti
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

  // Genera config default
  const generateDefaultConfig = (guestCount: number): GuestLinenConfig => {
    const allBeds = getAllBeds();
    const selectedBeds: string[] = [];
    let remainingGuests = guestCount;
    for (const bed of allBeds) { if (remainingGuests <= 0) break; selectedBeds.push(bed.id); remainingGuests -= bed.capacita; }
    const bedLinen: Record<string, Record<string, number>> = {};
    selectedBeds.forEach(bedId => { bedLinen[bedId] = {}; invLinen.forEach(item => { bedLinen[bedId][item.id] = item.default; }); });
    const bathItems: Record<string, number> = {};
    invBath.forEach(item => { bathItems[item.id] = item.defaultPerOspite * guestCount; });
    const kitItems: Record<string, number> = {};
    invKit.forEach(item => { kitItems[item.id] = item.defaultPerOspite * guestCount; });
    const extras: Record<string, boolean> = {};
    invExtras.forEach(item => { extras[item.id] = false; });
    return { selectedBeds, bedLinen, bathItems, kitItems, extras };
  };

  // Init configs quando cambiano stanze o articoli inventario
  useEffect(() => {
    if (loadingInventory) return;
    const capacita = calcolaCapacita();
    if (capacita > 0) {
      const newConfigs: Record<number, GuestLinenConfig> = {};
      for (let i = 1; i <= capacita; i++) newConfigs[i] = generateDefaultConfig(i);
      setLinenConfigs(newConfigs);
      if (selectedGuestCount > capacita) setSelectedGuestCount(capacita);
    }
  }, [formData.stanze, invLinen, invBath, invKit, invExtras, loadingInventory]);

  // Blocca scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Reset
  useEffect(() => {
    if (!isOpen) {
      setStep(1); setError(''); setShowAddStanza(false); setNuovaStanzaNome(''); setStanzaExpandedId(null);
      setSelectedGuestCount(1); setExpandedSection('beds'); setLinenConfigs({}); setImageFile(null); setImagePreview(null);
      setSearchProprietario('');
      setFormData({ nome: '', indirizzo: '', citta: '', cap: '', piano: '', citofonoAccesso: '', bagni: 1, checkIn: '15:00', checkOut: '10:00', prezzoBase: '', proprietarioId: '', nuovoProprietario: false, proprietarioNome: '', proprietarioEmail: '', proprietarioTelefono: '', stanze: [] });
    }
  }, [isOpen]);

  const totalSteps = 7;
  const capacitaTotale = calcolaCapacita();
  const allBeds = getAllBeds();
  const currentConfig = linenConfigs[selectedGuestCount] || { selectedBeds: [], bedLinen: {}, bathItems: {}, kitItems: {}, extras: {} };

  const filteredProprietari = proprietari.filter(p => p.name?.toLowerCase().includes(searchProprietario.toLowerCase()) || p.email?.toLowerCase().includes(searchProprietario.toLowerCase()));

  const updateField = (field: string, value: any) => { setFormData(prev => ({ ...prev, [field]: value })); setError(''); };

  // ==================== GESTIONE STANZE ====================
  const aggiungiStanza = (nome: string) => {
    if (!nome.trim()) return;
    const newStanza: Stanza = { id: `stanza_${Date.now()}`, nome: nome.trim(), letti: [] };
    setFormData(prev => ({ ...prev, stanze: [...prev.stanze, newStanza] }));
    setStanzaExpandedId(newStanza.id);
    setShowAddStanza(false);
    setNuovaStanzaNome('');
  };

  const rimuoviStanza = (stanzaId: string) => {
    setFormData(prev => ({ ...prev, stanze: prev.stanze.filter(s => s.id !== stanzaId) }));
    if (stanzaExpandedId === stanzaId) setStanzaExpandedId(null);
  };

  const aggiungiLetto = (stanzaId: string, tipo: Letto['tipo']) => {
    setFormData(prev => ({
      ...prev,
      stanze: prev.stanze.map(s => {
        if (s.id !== stanzaId) return s;
        const existingLetto = s.letti.find(l => l.tipo === tipo);
        if (existingLetto) return { ...s, letti: s.letti.map(l => l.tipo === tipo ? { ...l, quantita: l.quantita + 1 } : l) };
        return { ...s, letti: [...s.letti, { id: `letto_${Date.now()}`, tipo, quantita: 1 }] };
      })
    }));
  };

  const rimuoviLetto = (stanzaId: string, tipo: Letto['tipo']) => {
    setFormData(prev => ({
      ...prev,
      stanze: prev.stanze.map(s => {
        if (s.id !== stanzaId) return s;
        const existingLetto = s.letti.find(l => l.tipo === tipo);
        if (!existingLetto) return s;
        if (existingLetto.quantita > 1) return { ...s, letti: s.letti.map(l => l.tipo === tipo ? { ...l, quantita: l.quantita - 1 } : l) };
        return { ...s, letti: s.letti.filter(l => l.tipo !== tipo) };
      })
    }));
  };

  // ==================== GESTIONE BIANCHERIA ====================
  const toggleBed = (bedId: string) => {
    const config = { ...currentConfig };
    if (config.selectedBeds.includes(bedId)) {
      config.selectedBeds = config.selectedBeds.filter(id => id !== bedId);
      delete config.bedLinen[bedId];
    } else {
      config.selectedBeds.push(bedId);
      config.bedLinen[bedId] = {};
      invLinen.forEach(item => { config.bedLinen[bedId][item.id] = item.default; });
    }
    setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config }));
  };

  const updateBedLinen = (bedId: string, itemId: string, quantity: number) => {
    const config = { ...currentConfig };
    if (!config.bedLinen[bedId]) config.bedLinen[bedId] = {};
    config.bedLinen[bedId][itemId] = quantity;
    setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config }));
  };

  const updateBathItem = (itemId: string, quantity: number) => {
    const config = { ...currentConfig };
    config.bathItems[itemId] = quantity;
    setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config }));
  };

  const updateKitItem = (itemId: string, quantity: number) => {
    const config = { ...currentConfig };
    config.kitItems[itemId] = quantity;
    setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config }));
  };

  const toggleExtra = (itemId: string) => {
    const config = { ...currentConfig };
    config.extras[itemId] = !config.extras[itemId];
    setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: config }));
  };

  // Calcola prezzi
  const calcBedLinenPrice = () => {
    let total = 0;
    Object.entries(currentConfig.bedLinen).forEach(([, items]) => {
      Object.entries(items).forEach(([itemId, qty]) => {
        const item = invLinen.find(i => i.id === itemId);
        if (item) total += item.prezzo * qty;
      });
    });
    return total;
  };

  const calcBathPrice = () => Object.entries(currentConfig.bathItems).reduce((total, [itemId, qty]) => {
    const item = invBath.find(i => i.id === itemId);
    return total + (item ? item.prezzo * qty : 0);
  }, 0);

  const calcKitPrice = () => Object.entries(currentConfig.kitItems).reduce((total, [itemId, qty]) => {
    const item = invKit.find(i => i.id === itemId);
    return total + (item ? item.prezzo * qty : 0);
  }, 0);

  const calcExtrasPrice = () => Object.entries(currentConfig.extras).reduce((total, [itemId, selected]) => {
    if (!selected) return total;
    const item = invExtras.find(i => i.id === itemId);
    return total + (item ? item.prezzo : 0);
  }, 0);

  // ==================== GESTIONE IMMAGINE ====================
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('L\'immagine deve essere inferiore a 5MB'); return; }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setError('');
  };

  // ==================== VALIDAZIONE ====================
  const validateStep = () => {
    switch (step) {
      case 1:
        if (!formData.nome.trim()) return 'Inserisci il nome della proprietà';
        if (!formData.indirizzo.trim()) return 'Inserisci l\'indirizzo';
        if (!formData.citta.trim()) return 'Inserisci la città';
        if (!formData.cap.trim()) return 'Inserisci il CAP';
        if (!formData.piano.trim()) return 'Inserisci il piano';
        if (!formData.citofonoAccesso.trim()) return 'Inserisci citofono o codice accesso';
        return null;
      case 2:
        if (formData.bagni < 1) return 'Inserisci almeno 1 bagno';
        return null;
      case 3:
        if (!formData.prezzoBase || parseFloat(formData.prezzoBase) <= 0) return 'Inserisci il prezzo pulizia';
        return null;
      case 4:
        if (formData.nuovoProprietario) {
          if (!formData.proprietarioNome.trim()) return 'Inserisci il nome del proprietario';
          if (!formData.proprietarioEmail.trim()) return 'Inserisci l\'email del proprietario';
          if (!formData.proprietarioEmail.includes('@')) return 'Email non valida';
        } else {
          if (!formData.proprietarioId) return 'Seleziona un proprietario';
        }
        return null;
      case 5:
        if (formData.stanze.length === 0) return 'Aggiungi almeno una stanza';
        if (calcolaCapacita() === 0) return 'Aggiungi almeno un letto';
        return null;
      case 6:
        return null; // Biancheria opzionale
      case 7:
        return null; // Foto opzionale
      default:
        return null;
    }
  };

  const nextStep = () => {
    const validationError = validateStep();
    if (validationError) { setError(validationError); return; }
    setError('');
    setStep(s => Math.min(s + 1, totalSteps));
  };

  const prevStep = () => { setError(''); setStep(s => Math.max(s - 1, 1)); };

  const handleSubmit = async () => {
    const validationError = validateStep();
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    try {
      const data = {
        name: formData.nome.trim(),
        address: formData.indirizzo.trim(),
        city: formData.citta.trim(),
        postalCode: formData.cap.trim(),
        floor: formData.piano.trim(),
        accessCode: formData.citofonoAccesso.trim(),
        bathrooms: formData.bagni,
        maxGuests: calcolaCapacita(),
        checkInTime: formData.checkIn,
        checkOutTime: formData.checkOut,
        cleaningPrice: parseFloat(formData.prezzoBase) || 0,
        clientId: formData.nuovoProprietario ? null : formData.proprietarioId,
        newClient: formData.nuovoProprietario ? { name: formData.proprietarioNome.trim(), email: formData.proprietarioEmail.trim().toLowerCase(), phone: formData.proprietarioTelefono.trim() || null } : null,
        stanze: formData.stanze,
        linenConfigs,
      };
      const response = await fetch('/api/properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Errore durante la creazione');
      onClose();
      router.refresh();
    } catch (err: any) {
      console.error('Errore creazione:', err);
      setError(err.message || 'Errore durante la creazione della proprietà');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const stepLabels = ['Info', 'Dettagli', 'Prezzo', 'Cliente', 'Stanze', 'Biancheria', 'Foto'];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[400px] max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 text-white rounded-t-3xl flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold">Nuova Proprietà</h2>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <div className="w-4 h-4">{Icons.close}</div>
            </button>
          </div>
          <div className="flex items-center gap-1">
            {[1,2,3,4,5,6,7].map(i => (<div key={i} className="flex-1"><div className={`h-1 rounded-full transition-all ${i <= step ? 'bg-emerald-400' : 'bg-white/20'}`} /></div>))}
          </div>
          <p className="text-[10px] text-white/60 mt-1.5">Step {step}/{totalSteps} • {stepLabels[step-1]}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          
          {/* STEP 1 - Info Base */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome Proprietà *<InfoTooltip text="Un nome identificativo per riconoscere facilmente la proprietà" /></label>
                <input type="text" value={formData.nome} onChange={e => updateField('nome', e.target.value)} placeholder="es. Appartamento Colosseo" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Indirizzo *</label>
                <input type="text" value={formData.indirizzo} onChange={e => updateField('indirizzo', e.target.value)} placeholder="Via Roma 123" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
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
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Piano *</label>
                <input type="text" value={formData.piano} onChange={e => updateField('piano', e.target.value)} placeholder="3" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Citofono / Codice Accesso *</label>
                <input type="text" value={formData.citofonoAccesso} onChange={e => updateField('citofonoAccesso', e.target.value)} placeholder="Rossi / 1234" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
            </div>
          )}

          {/* STEP 2 - Dettagli */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Dettagli</h3>
                <p className="text-sm text-slate-500">Bagni e orari</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Numero Bagni</label>
                <div className="flex items-center justify-center gap-4">
                  <Counter value={formData.bagni} onChange={v => updateField('bagni', v)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Check-in</label>
                  <input type="time" value={formData.checkIn} onChange={e => updateField('checkIn', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Check-out</label>
                  <input type="time" value={formData.checkOut} onChange={e => updateField('checkOut', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 - Prezzo */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Prezzo Pulizia</h3>
                <p className="text-sm text-slate-500">Tariffa base per il servizio</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Prezzo Base (€) *</label>
                <input type="number" value={formData.prezzoBase} onChange={e => updateField('prezzoBase', e.target.value)} placeholder="65" min="0" step="0.01" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
            </div>
          )}

          {/* STEP 4 - Proprietario/Cliente */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Proprietario</h3>
                <p className="text-sm text-slate-500">Assegna questa proprietà a un cliente</p>
              </div>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                <button type="button" onClick={() => updateField('nuovoProprietario', false)} className={`flex-1 py-2.5 text-sm font-semibold transition-all ${!formData.nuovoProprietario ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Esistente</button>
                <button type="button" onClick={() => updateField('nuovoProprietario', true)} className={`flex-1 py-2.5 text-sm font-semibold transition-all ${formData.nuovoProprietario ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Nuovo</button>
              </div>
              {!formData.nuovoProprietario ? (
                <div className="space-y-3">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input type="text" value={searchProprietario} onChange={e => setSearchProprietario(e.target.value)} placeholder="Cerca per nome o email..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                  </div>
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {filteredProprietari.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-slate-500">Nessun cliente trovato</p>
                        <button onClick={() => updateField('nuovoProprietario', true)} className="mt-2 text-sm font-semibold text-slate-800 hover:underline">+ Crea nuovo cliente</button>
                      </div>
                    ) : (
                      filteredProprietari.map(prop => (
                        <button key={prop.id} type="button" onClick={() => updateField('proprietarioId', prop.id)} className={`w-full p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${formData.proprietarioId === prop.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${formData.proprietarioId === prop.id ? 'bg-emerald-500' : 'bg-slate-400'}`}>{prop.name?.charAt(0) || '?'}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{prop.name}</p>
                            <p className="text-xs text-slate-500 truncate">{prop.email}</p>
                          </div>
                          {formData.proprietarioId === prop.id && (<svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                    <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                    <p className="text-xs text-blue-700">Il nuovo cliente riceverà un'email con le credenziali di accesso.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome Completo *</label>
                    <input type="text" value={formData.proprietarioNome} onChange={e => updateField('proprietarioNome', e.target.value)} placeholder="Mario Rossi" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email *</label>
                    <input type="email" value={formData.proprietarioEmail} onChange={e => updateField('proprietarioEmail', e.target.value)} placeholder="mario@email.com" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Telefono</label>
                    <input type="tel" value={formData.proprietarioTelefono} onChange={e => updateField('proprietarioTelefono', e.target.value)} placeholder="+39 333 1234567" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5 - Stanze */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">Configurazione Stanze</h3>
                    <p className="text-xs text-white/80">Aggiungi stanze e letti</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{capacitaTotale}</p>
                    <p className="text-xs text-white/80">ospiti max</p>
                  </div>
                </div>
              </div>

              {/* Lista Stanze */}
              <div className="space-y-2">
                {formData.stanze.map(stanza => {
                  const capacitaStanza = stanza.letti.reduce((sum, l) => { const tipo = TIPI_LETTO.find(t => t.tipo === l.tipo); return sum + (tipo?.capacita || 1) * l.quantita; }, 0);
                  return (
                    <div key={stanza.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                      <div className="p-3 flex items-center justify-between bg-slate-50 cursor-pointer" onClick={() => setStanzaExpandedId(stanzaExpandedId === stanza.id ? null : stanza.id)}>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center"><div className="w-4 h-4 text-violet-600">{Icons.room}</div></div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{stanza.nome}</p>
                            <p className="text-[10px] text-slate-500">{stanza.letti.length === 0 ? 'Nessun letto' : `${stanza.letti.reduce((s, l) => s + l.quantita, 0)} letti • ${capacitaStanza} ospiti`}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); rimuoviStanza(stanza.id); }} className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100"><div className="w-4 h-4 text-red-500">{Icons.trash}</div></button>
                          <div className={`w-5 h-5 text-slate-400 transition-transform ${stanzaExpandedId === stanza.id ? 'rotate-180' : ''}`}>{Icons.down}</div>
                        </div>
                      </div>
                      {stanzaExpandedId === stanza.id && (
                        <div className="p-3 border-t border-slate-100 space-y-2">
                          <p className="text-xs font-medium text-slate-500 mb-2">Aggiungi letti:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {TIPI_LETTO.map(tipo => {
                              const count = stanza.letti.find(l => l.tipo === tipo.tipo)?.quantita || 0;
                              return (
                                <div key={tipo.tipo} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">{tipo.icon}</span>
                                    <div>
                                      <p className="text-xs font-medium">{tipo.nome}</p>
                                      <p className="text-[10px] text-slate-400">{tipo.capacita}p</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => rimuoviLetto(stanza.id, tipo.tipo)} className="w-6 h-6 rounded bg-white border border-slate-200 flex items-center justify-center" disabled={count === 0}><div className="w-3 h-3 text-slate-500">{Icons.minus}</div></button>
                                    <span className="w-5 text-center text-sm font-semibold">{count}</span>
                                    <button type="button" onClick={() => aggiungiLetto(stanza.id, tipo.tipo)} className="w-6 h-6 rounded bg-violet-600 flex items-center justify-center"><div className="w-3 h-3 text-white">{Icons.plus}</div></button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Aggiungi Stanza */}
              {!showAddStanza ? (
                <button type="button" onClick={() => setShowAddStanza(true)} className="w-full py-3 border-2 border-dashed border-violet-300 rounded-xl text-violet-600 font-semibold text-sm hover:border-violet-400 hover:bg-violet-50 transition-colors flex items-center justify-center gap-2">
                  <div className="w-5 h-5">{Icons.plus}</div>
                  Aggiungi Stanza
                </button>
              ) : (
                <div className="bg-violet-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-violet-700">Scegli tipo stanza:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STANZE_PREDEFINITE.map(nome => (<button key={nome} type="button" onClick={() => aggiungiStanza(nome)} className="px-3 py-1.5 bg-white border border-violet-200 rounded-lg text-xs font-medium text-violet-700 hover:bg-violet-100">{nome}</button>))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={nuovaStanzaNome} onChange={e => setNuovaStanzaNome(e.target.value)} placeholder="Nome personalizzato..." className="flex-1 px-3 py-2 bg-white border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" onKeyDown={e => e.key === 'Enter' && aggiungiStanza(nuovaStanzaNome)} />
                    <button type="button" onClick={() => aggiungiStanza(nuovaStanzaNome)} disabled={!nuovaStanzaNome.trim()} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">Aggiungi</button>
                  </div>
                  <button type="button" onClick={() => { setShowAddStanza(false); setNuovaStanzaNome(''); }} className="w-full mt-2 text-xs text-slate-500 hover:text-slate-700">Annulla</button>
                </div>
              )}
            </div>
          )}

          {/* STEP 6 - Biancheria */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-4 text-white">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold">Configurazione Biancheria</h3>
                    <p className="text-xs text-white/80">Default per ogni numero di ospiti</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">€{(calcBedLinenPrice() + calcBathPrice() + calcKitPrice() + calcExtrasPrice()).toFixed(2)}</p>
                    <p className="text-xs text-white/80">totale</p>
                  </div>
                </div>
                <div className="bg-white/10 rounded-xl p-2">
                  <p className="text-xs text-white/70 mb-2">Configura per:</p>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: capacitaTotale }, (_, i) => i + 1).map(n => (
                      <button key={n} type="button" onClick={() => setSelectedGuestCount(n)} className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${n === selectedGuestCount ? 'bg-white text-blue-600' : 'bg-white/20 text-white hover:bg-white/30'}`}>{n}</button>
                    ))}
                  </div>
                </div>
              </div>

              {capacitaTotale === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-amber-700">Configura prima i letti nello step precedente</p>
                </div>
              ) : (
                <>
                  <Section title="Biancheria Letto" icon={Icons.bed} price={calcBedLinenPrice()} expanded={expandedSection === 'beds'} onToggle={() => setExpandedSection(expandedSection === 'beds' ? null : 'beds')} color="blue">
                    {invLinen.length === 0 ? (
                      <div className="text-center py-3">
                        <p className="text-xs text-slate-500">Nessun articolo biancheria letto</p>
                        <a href="/admin/inventario" className="text-xs text-blue-600 underline">Aggiungi nell'inventario →</a>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {allBeds.map(bed => {
                          const isSelected = currentConfig.selectedBeds.includes(bed.id);
                          const bedLinen = currentConfig.bedLinen[bed.id] || {};
                          return (
                            <div key={bed.id} className={`rounded-lg border-2 overflow-hidden transition-all ${isSelected ? 'border-blue-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                              <div className="p-2 flex items-center gap-2 cursor-pointer" onClick={() => toggleBed(bed.id)}>
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                  {isSelected && <div className="w-3 h-3 text-white">{Icons.check}</div>}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{bed.nome}</p>
                                  <p className="text-[10px] text-slate-500">{bed.stanza} • {bed.capacita}p</p>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="px-2 pb-2 pt-1 border-t border-blue-100 bg-blue-50/50 space-y-1.5">
                                  {invLinen.map(item => (
                                    <div key={item.id} className="flex items-center justify-between bg-white rounded p-1.5 border border-blue-100">
                                      <span className="text-xs text-slate-700">{item.nome} <span className="text-blue-500">€{item.prezzo}</span></span>
                                      <Counter value={bedLinen[item.id] || 0} onChange={v => updateBedLinen(bed.id, item.id, v)} small />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Section>

                  <Section title="Biancheria Bagno" icon={Icons.towel} price={calcBathPrice()} expanded={expandedSection === 'bath'} onToggle={() => setExpandedSection(expandedSection === 'bath' ? null : 'bath')} color="purple">
                    {invBath.length === 0 ? (
                      <div className="text-center py-3"><p className="text-xs text-slate-500">Nessun articolo</p><a href="/admin/inventario" className="text-xs text-blue-600 underline">Aggiungi →</a></div>
                    ) : (
                      <div className="space-y-2">
                        {invBath.map(item => (
                          <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-purple-100">
                            <span className="text-xs text-slate-700">{item.nome} <span className="text-purple-500">€{item.prezzo}</span></span>
                            <Counter value={currentConfig.bathItems[item.id] || 0} onChange={v => updateBathItem(item.id, v)} small />
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  <Section title="Kit Cortesia" icon={Icons.soap} price={calcKitPrice()} expanded={expandedSection === 'kit'} onToggle={() => setExpandedSection(expandedSection === 'kit' ? null : 'kit')} color="amber">
                    {invKit.length === 0 ? (
                      <div className="text-center py-3"><p className="text-xs text-slate-500">Nessun articolo</p><a href="/admin/inventario" className="text-xs text-blue-600 underline">Aggiungi →</a></div>
                    ) : (
                      <div className="space-y-2">
                        {invKit.map(item => (
                          <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-amber-100">
                            <span className="text-xs text-slate-700">{item.nome} <span className="text-amber-600">€{item.prezzo}</span></span>
                            <Counter value={currentConfig.kitItems[item.id] || 0} onChange={v => updateKitItem(item.id, v)} small />
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  <Section title="Servizi Extra" icon={Icons.gift} price={calcExtrasPrice()} expanded={expandedSection === 'extra'} onToggle={() => setExpandedSection(expandedSection === 'extra' ? null : 'extra')} color="emerald">
                    {invExtras.length === 0 ? (
                      <div className="text-center py-3"><p className="text-xs text-slate-500">Nessun servizio</p><a href="/admin/inventario" className="text-xs text-blue-600 underline">Aggiungi →</a></div>
                    ) : (
                      <div className="space-y-2">
                        {invExtras.map(item => (
                          <div key={item.id} onClick={() => toggleExtra(item.id)} className={`rounded-lg p-2.5 border-2 cursor-pointer transition-all ${currentConfig.extras[item.id] ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${currentConfig.extras[item.id] ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                                  {currentConfig.extras[item.id] && <div className="w-3 h-3 text-white">{Icons.check}</div>}
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{item.nome}</p>
                                  <p className="text-[10px] text-slate-500">{item.descrizione}</p>
                                </div>
                              </div>
                              <span className="text-sm font-bold text-emerald-600">€{item.prezzo}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </>
              )}
            </div>
          )}

          {/* STEP 7 - Foto */}
          {step === 7 && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Foto Proprietà</h3>
                <p className="text-sm text-slate-500">Aggiungi una foto (opzionale)</p>
              </div>
              <label className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-slate-400 transition-colors cursor-pointer group block">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                {imagePreview ? (
                  <div className="space-y-2">
                    <img src={imagePreview} alt="Preview" className="w-24 h-24 object-cover rounded-xl mx-auto" />
                    <p className="text-sm font-medium text-slate-700 truncate">{imageFile?.name}</p>
                    <p className="text-xs text-slate-400">Clicca per cambiare</p>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-slate-200">
                      <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Clicca per caricare</p>
                    <p className="text-xs text-slate-400">PNG, JPG fino a 5MB</p>
                  </>
                )}
              </label>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2">
                <svg className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Quasi fatto!</p>
                  <p className="text-xs text-emerald-600 mt-0.5">La foto è opzionale, puoi aggiungerla dopo.</p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 flex gap-2 border-t border-slate-100 flex-shrink-0">
          {step > 1 && (
            <button type="button" onClick={prevStep} disabled={saving} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors active:scale-[0.98] disabled:opacity-50">Indietro</button>
          )}
          <button type="button" onClick={step === totalSteps ? handleSubmit : nextStep} disabled={saving} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 ${step === totalSteps ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}>
            {saving ? (<span className="flex items-center justify-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Creazione...</span>) : step === totalSteps ? '✓ Crea Proprietà' : 'Avanti'}
          </button>
        </div>
      </div>
    </div>
  );
}
