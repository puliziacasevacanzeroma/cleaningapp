"use client";

/**
 * PROPERTY CREATION MODAL - COMPONENTE UNICO CENTRALIZZATO
 * 
 * mode="admin": 8 steps (Info, Capacità, Orari, Prezzo, Cliente, Stanze, Dotazioni, Foto)
 * mode="owner": 6 steps (Info, Capacità, Orari, Stanze, Dotazioni, Foto) - SENZA PREZZO!
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import AddressAutocomplete from "~/components/ui/AddressAutocomplete";
import type { AddressResult } from "~/lib/geo";
import {
  TIPI_LETTO,
  getTipoLettoInfo,
  getDbTypeForBed,
  getLinenForBedType,
  mapLinenToInventory,
  generateAllGuestConfigsLegacy,
  convertConfigsForDatabase,
  type TipoLetto,
  type GuestLinenConfigLegacy,
  type PropertyBed,
} from "~/lib/linenCalculator";

interface PropertyCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  mode: "admin" | "owner";
  proprietari?: { id: string; name: string | null; email: string | null }[];
  currentUser?: { id: string; name: string | null; email: string | null };
}

interface Stanza {
  id: string;
  nome: string;
  letti: { id: string; tipo: TipoLetto; quantita: number }[];
}

interface InventoryItem {
  id: string;
  nome: string;
  prezzo: number;
  key?: string;
}

const Icons = {
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/></svg>,
  towel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 7H18M6 11H18"/></svg>,
  soap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="6" y="8" width="12" height="12" rx="2"/><path d="M10 8V6C10 5 11 4 12 4C13 4 14 5 14 6V8"/></svg>,
  gift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8V21M3 12H21"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M12 5V19M5 12H19"/></svg>,
  minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M5 12H19"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M3 6H21M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6H19Z"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M18 6L6 18M6 6L18 18"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full h-full"><path d="M5 13L9 17L19 7"/></svg>,
  down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full"><path d="M6 9L12 15L18 9"/></svg>,
  room: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9H21M9 21V9"/></svg>,
  warn: <svg viewBox="0 0 20 20" fill="currentColor" className="w-full h-full"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>,
};

const STANZE_PREDEFINITE = ['Camera Matrimoniale', 'Camera Singola', 'Camera Doppia', 'Soggiorno', 'Cameretta', 'Studio'];

function Counter({ value, onChange, min = 0, max = 99, small = false }: { value: number; onChange: (v: number) => void; min?: number; max?: number; small?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className={`${small ? 'w-7 h-7' : 'w-9 h-9'} rounded-xl border border-slate-300 bg-white flex items-center justify-center active:scale-95`}>
        <div className={`${small ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-slate-500`}>{Icons.minus}</div>
      </button>
      <span className={`${small ? 'w-6 text-sm' : 'w-8 text-base'} text-center font-bold text-slate-800`}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className={`${small ? 'w-7 h-7' : 'w-9 h-9'} rounded-xl bg-slate-800 flex items-center justify-center active:scale-95`}>
        <div className={`${small ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-white`}>{Icons.plus}</div>
      </button>
    </div>
  );
}

function Section({ title, icon, price, expanded, onToggle, color = "blue", children }: { title: string; icon: React.ReactNode; price: number; expanded: boolean; onToggle: () => void; color?: string; children: React.ReactNode }) {
  const colors: Record<string, string> = { blue: 'bg-blue-100 text-blue-600', purple: 'bg-purple-100 text-purple-600', amber: 'bg-amber-100 text-amber-600', emerald: 'bg-emerald-100 text-emerald-600' };
  return (
    <div className={`rounded-xl border ${expanded ? 'border-slate-300 shadow-sm' : 'border-slate-200'} overflow-hidden mb-2 bg-white`}>
      <button type="button" onClick={onToggle} className="w-full px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg ${colors[color]} flex items-center justify-center`}><div className="w-4 h-4">{icon}</div></div>
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">€{price.toFixed(2)}</span>
          <div className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>{Icons.down}</div>
        </div>
      </button>
      {expanded && <div className="px-3 py-2.5 bg-slate-50 border-t border-slate-100 max-h-[300px] overflow-y-auto">{children}</div>}
    </div>
  );
}

function GuestSelector({ value, onChange, max = 10 }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="bg-white/10 rounded-xl p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-white/80">Seleziona ospiti</span>
        <span className="text-base font-bold text-white">{value} {value === 1 ? 'ospite' : 'ospiti'}</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {Array.from({ length: max }, (_, i) => i + 1).map(n => (
          <button 
            key={n} 
            type="button" 
            onClick={() => onChange(n)} 
            className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
              n === value 
                ? 'bg-white text-indigo-600 shadow-lg' 
                : 'bg-white/20 text-white hover:bg-white/30 border border-white/30'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PropertyCreationModal({ isOpen, onClose, onSuccess, mode, proprietari = [], currentUser }: PropertyCreationModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // STEPS DIVERSI per admin e owner
  // Admin: Info, Capacità, Orari, Prezzo, Cliente, Stanze, Dotazioni, Foto (8 steps)
  // Owner: Info, Capacità, Orari, Stanze, Dotazioni, Foto (6 steps) - NO PREZZO, NO CLIENTE
  const totalSteps = mode === "admin" ? 8 : 6;
  const stepLabels = mode === "admin" 
    ? ['Info', 'Capacità', 'Orari', 'Prezzo', 'Cliente', 'Stanze', 'Dotazioni', 'Foto']
    : ['Info', 'Capacità', 'Orari', 'Stanze', 'Dotazioni', 'Foto'];
  
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchProprietario, setSearchProprietario] = useState('');
  const [invLinen, setInvLinen] = useState<InventoryItem[]>([]);
  const [invBath, setInvBath] = useState<InventoryItem[]>([]);
  const [invKit, setInvKit] = useState<InventoryItem[]>([]);
  const [invExtras, setInvExtras] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  
  const [formData, setFormData] = useState({
    nome: '', indirizzo: '', citta: '', cap: '', piano: '', citofonoAccesso: '',
    maxGuests: 4, bagni: 1, checkIn: '15:00', checkOut: '10:00', prezzoBase: '',
    proprietarioId: '', nuovoProprietario: false, proprietarioNome: '', proprietarioEmail: '', proprietarioTelefono: '',
    stanze: [] as Stanza[],
    coordinates: null as { lat: number; lng: number } | null,
    addressVerified: false,
    usesOwnLinen: false,
  });
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [linenConfigs, setLinenConfigs] = useState<Record<number, GuestLinenConfigLegacy>>({});
  const [showAddStanza, setShowAddStanza] = useState(false);
  const [nuovaStanzaNome, setNuovaStanzaNome] = useState('');
  const [stanzaExpandedId, setStanzaExpandedId] = useState<string | null>(null);
  const [selectedGuestCount, setSelectedGuestCount] = useState(1);
  const [expandedSection, setExpandedSection] = useState<string | null>('beds');

  // Load inventory
  useEffect(() => {
    async function loadInventory() {
      try {
        const res = await fetch('/api/inventory/list');
        const data = await res.json();
        const linen: InventoryItem[] = [], bath: InventoryItem[] = [], kit: InventoryItem[] = [], extras: InventoryItem[] = [];
        data.categories?.forEach((cat: any) => {
          cat.items?.forEach((item: any) => {
            const invItem = { id: item.key || item.id, nome: item.name, prezzo: item.sellPrice || 0, key: item.key };
            if (cat.id === 'biancheria_letto') linen.push(invItem);
            else if (cat.id === 'biancheria_bagno') bath.push(invItem);
            else if (cat.id === 'kit_cortesia') kit.push(invItem);
            else if (cat.id === 'servizi_extra') extras.push(invItem);
          });
        });
        setInvLinen(linen); setInvBath(bath); setInvKit(kit); setInvExtras(extras);
      } catch (err) { console.error('Errore inventario:', err); }
      finally { setLoadingInventory(false); }
    }
    if (isOpen) loadInventory();
  }, [isOpen]);

  const getAllBeds = (): PropertyBed[] => {
    const beds: PropertyBed[] = [];
    formData.stanze.forEach(stanza => {
      stanza.letti.forEach(letto => {
        const tipoInfo = getTipoLettoInfo(letto.tipo);
        for (let i = 0; i < letto.quantita; i++) {
          beds.push({ id: `${stanza.id}_${letto.tipo}_${i}`, tipo: letto.tipo, nome: tipoInfo.nome, stanza: stanza.nome, capacita: tipoInfo.capacita });
        }
      });
    });
    return beds;
  };

  useEffect(() => {
    if (loadingInventory || formData.stanze.length === 0) return;
    const allBeds = getAllBeds();
    if (allBeds.length === 0) return;
    const newConfigs = generateAllGuestConfigsLegacy(formData.maxGuests, allBeds, formData.bagni, invLinen, invBath, invExtras);
    setLinenConfigs(newConfigs);
    if (selectedGuestCount > formData.maxGuests) setSelectedGuestCount(formData.maxGuests);
  }, [formData.stanze, formData.maxGuests, formData.bagni, invLinen, invBath, invExtras, loadingInventory]);

  useEffect(() => { 
    if (isOpen) document.body.style.overflow = 'hidden'; 
    else document.body.style.overflow = ''; 
    return () => { document.body.style.overflow = ''; }; 
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setStep(1); setError(''); setShowAddStanza(false); setNuovaStanzaNome(''); setStanzaExpandedId(null);
      setSelectedGuestCount(1); setExpandedSection('beds'); setLinenConfigs({}); 
      setImageFile(null); setImageBase64(null); setImagePreview(null); setSearchProprietario('');
      setFormData({ nome: '', indirizzo: '', citta: '', cap: '', piano: '', citofonoAccesso: '', 
        maxGuests: 4, bagni: 1, checkIn: '15:00', checkOut: '10:00', prezzoBase: '', 
        proprietarioId: '', nuovoProprietario: false, proprietarioNome: '', proprietarioEmail: '', proprietarioTelefono: '', 
        stanze: [], coordinates: null, addressVerified: false, usesOwnLinen: false });
    }
  }, [isOpen]);

  const allBeds = getAllBeds();
  const currentConfig = linenConfigs[selectedGuestCount] || { selectedBeds: [], bedLinen: {}, bathItems: {}, kitItems: {}, extras: {} };
  const filteredProprietari = proprietari.filter(p => p.name?.toLowerCase().includes(searchProprietario.toLowerCase()) || p.email?.toLowerCase().includes(searchProprietario.toLowerCase()));
  const currentBedCapacity = currentConfig.selectedBeds.reduce((t, bedId) => { const bed = allBeds.find(b => b.id === bedId); return t + (bed?.capacita || 0); }, 0);
  const isCapacityInsufficient = currentBedCapacity < selectedGuestCount;

  const updateField = (field: string, value: any) => { setFormData(prev => ({ ...prev, [field]: value })); setError(''); };
  
  const aggiungiStanza = (nome: string) => { 
    if (!nome.trim()) return; 
    const s: Stanza = { id: `stanza_${Date.now()}`, nome: nome.trim(), letti: [] }; 
    setFormData(prev => ({ ...prev, stanze: [...prev.stanze, s] })); 
    setStanzaExpandedId(s.id); 
    setShowAddStanza(false); 
    setNuovaStanzaNome(''); 
  };
  
  const rimuoviStanza = (id: string) => { 
    setFormData(prev => ({ ...prev, stanze: prev.stanze.filter(s => s.id !== id) })); 
    if (stanzaExpandedId === id) setStanzaExpandedId(null); 
  };
  
  const aggiungiLetto = (stanzaId: string, tipo: TipoLetto) => { 
    setFormData(prev => ({ ...prev, stanze: prev.stanze.map(s => { 
      if (s.id !== stanzaId) return s; 
      const e = s.letti.find(l => l.tipo === tipo); 
      if (e) return { ...s, letti: s.letti.map(l => l.tipo === tipo ? { ...l, quantita: l.quantita + 1 } : l) }; 
      return { ...s, letti: [...s.letti, { id: `letto_${Date.now()}`, tipo, quantita: 1 }] }; 
    }) })); 
  };
  
  const rimuoviLetto = (stanzaId: string, tipo: TipoLetto) => { 
    setFormData(prev => ({ ...prev, stanze: prev.stanze.map(s => { 
      if (s.id !== stanzaId) return s; 
      const e = s.letti.find(l => l.tipo === tipo); 
      if (!e) return s; 
      if (e.quantita > 1) return { ...s, letti: s.letti.map(l => l.tipo === tipo ? { ...l, quantita: l.quantita - 1 } : l) }; 
      return { ...s, letti: s.letti.filter(l => l.tipo !== tipo) }; 
    }) })); 
  };

  const toggleBed = (bedId: string) => { 
    const cfg = { ...currentConfig }; 
    if (cfg.selectedBeds.includes(bedId)) { 
      cfg.selectedBeds = cfg.selectedBeds.filter(id => id !== bedId); 
      delete cfg.bedLinen[bedId]; 
    } else { 
      cfg.selectedBeds.push(bedId); 
      const bed = allBeds.find(b => b.id === bedId); 
      if (bed) cfg.bedLinen[bedId] = mapLinenToInventory(getLinenForBedType(bed.tipo), invLinen); 
    } 
    setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: cfg })); 
  };
  
  const updateBedLinen = (bedId: string, itemId: string, qty: number) => { 
    const cfg = { ...currentConfig }; 
    if (!cfg.bedLinen[bedId]) cfg.bedLinen[bedId] = {}; 
    cfg.bedLinen[bedId][itemId] = qty; 
    setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: cfg })); 
  };
  
  const updateBathItem = (itemId: string, qty: number) => { 
    const cfg = { ...currentConfig }; 
    cfg.bathItems[itemId] = qty; 
    setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: cfg })); 
  };
  
  const updateKitItem = (itemId: string, qty: number) => { 
    const cfg = { ...currentConfig }; 
    cfg.kitItems[itemId] = qty; 
    setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: cfg })); 
  };
  
  const toggleExtra = (itemId: string) => { 
    const cfg = { ...currentConfig }; 
    cfg.extras[itemId] = !cfg.extras[itemId]; 
    setLinenConfigs(prev => ({ ...prev, [selectedGuestCount]: cfg })); 
  };

  const calcBedLinenPrice = () => { 
    let t = 0; 
    Object.values(currentConfig.bedLinen).forEach(items => { 
      Object.entries(items).forEach(([id, qty]) => { 
        const i = invLinen.find(x => x.id === id); 
        if (i) t += i.prezzo * qty; 
      }); 
    }); 
    return t; 
  };
  
  const calcBathPrice = () => Object.entries(currentConfig.bathItems).reduce((t, [id, q]) => t + (invBath.find(x => x.id === id)?.prezzo || 0) * q, 0);
  const calcKitPrice = () => Object.entries(currentConfig.kitItems).reduce((t, [id, q]) => t + (invKit.find(x => x.id === id)?.prezzo || 0) * q, 0);
  const calcExtrasPrice = () => Object.entries(currentConfig.extras).reduce((t, [id, sel]) => sel ? t + (invExtras.find(x => x.id === id)?.prezzo || 0) : t, 0);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => { 
    const f = e.target.files?.[0]; 
    if (!f) return; 
    if (f.size > 5 * 1024 * 1024) { setError('Max 5MB'); return; } 
    setImageFile(f); 
    const r = new FileReader(); 
    r.onload = (ev) => { const b = ev.target?.result as string; setImageBase64(b); setImagePreview(b); }; 
    r.readAsDataURL(f); 
    setError(''); 
  };

  // MAPPING STEPS - diverso per admin e owner
  const getActualStep = () => {
    if (mode === "admin") return step;
    // Owner: salta step 4 (prezzo) e step 5 (cliente)
    // step 1-3 = info, capacità, orari
    // step 4 = stanze (era 6 in admin)
    // step 5 = dotazioni (era 7 in admin)
    // step 6 = foto (era 8 in admin)
    if (step <= 3) return step;
    if (step === 4) return 6; // stanze
    if (step === 5) return 7; // dotazioni
    if (step === 6) return 8; // foto
    return step;
  };

  const validateStep = () => {
    const actualStep = getActualStep();
    
    if (actualStep === 1) { 
      if (!formData.nome.trim()) return 'Nome richiesto'; 
      if (!formData.indirizzo.trim()) return 'Indirizzo richiesto'; 
      if (!formData.citta.trim()) return 'Città richiesta'; 
      if (!formData.cap.trim()) return 'CAP richiesto'; 
      if (!formData.piano.trim()) return 'Piano richiesto'; 
      if (!formData.citofonoAccesso.trim()) return 'Citofono richiesto'; 
      return null; 
    }
    if (actualStep === 2) { 
      if (formData.maxGuests < 1) return 'Min 1 ospite'; 
      if (formData.bagni < 1) return 'Min 1 bagno'; 
      return null; 
    }
    if (actualStep === 3) return null;
    if (actualStep === 4 && mode === "admin") { 
      if (!formData.prezzoBase || parseFloat(formData.prezzoBase) <= 0) return 'Prezzo richiesto'; 
      return null; 
    }
    if (actualStep === 5 && mode === "admin") { 
      if (formData.nuovoProprietario) { 
        if (!formData.proprietarioNome.trim()) return 'Nome richiesto'; 
        if (!formData.proprietarioEmail.includes('@')) return 'Email non valida'; 
      } else { 
        if (!formData.proprietarioId) return 'Seleziona proprietario'; 
      } 
      return null; 
    }
    if (actualStep === 6) { 
      if (formData.stanze.length === 0) return 'Aggiungi una stanza'; 
      if (!formData.stanze.some(s => s.letti.length > 0)) return 'Aggiungi un letto'; 
      // 🔧 FIX: Verifica che i posti letto siano sufficienti per maxGuests
      const totalBedCapacity = formData.stanze.reduce((total, stanza) => {
        return total + stanza.letti.reduce((sum, letto) => {
          const tipoInfo = getTipoLettoInfo(letto.tipo);
          return sum + (tipoInfo.capacita * letto.quantita);
        }, 0);
      }, 0);
      if (totalBedCapacity < formData.maxGuests) {
        return `Servono almeno ${formData.maxGuests} posti letto (hai ${totalBedCapacity})`;
      }
      return null; 
    }
    if (actualStep === 7) { 
      for (let g = 1; g <= formData.maxGuests; g++) { 
        const cfg = linenConfigs[g]; 
        if (!cfg) continue; 
        const cap = cfg.selectedBeds.reduce((t, id) => t + (allBeds.find(b => b.id === id)?.capacita || 0), 0); 
        if (cap < g) return `${g} ospiti: servono ${g} posti (hai ${cap})`; 
      } 
      return null; 
    }
    return null;
  };

  const nextStep = () => { const e = validateStep(); if (e) { setError(e); return; } setError(''); setStep(s => Math.min(s + 1, totalSteps)); };
  const prevStep = () => { setError(''); setStep(s => Math.max(s - 1, 1)); };

  const handleSubmit = async () => {
    const e = validateStep(); if (e) { setError(e); return; }
    setSaving(true); setError('');
    try {
      const bedConfiguration = formData.stanze.map(s => ({ nome: s.nome, letti: s.letti.map(l => ({ tipo: l.tipo, quantita: l.quantita })) }));
      const bedsConfig = getAllBeds().map(b => ({ id: b.id, type: getDbTypeForBed(b.tipo), name: b.nome, loc: b.stanza, cap: b.capacita }));
      const serviceConfigs = convertConfigsForDatabase(linenConfigs);
      
      let ownerId: string | null = null, ownerName = '', ownerEmail = '';
      if (mode === "owner" && currentUser) { 
        ownerId = currentUser.id; 
        ownerName = currentUser.name || ''; 
        ownerEmail = currentUser.email || ''; 
      } else if (mode === "admin") { 
        if (formData.nuovoProprietario) { 
          ownerName = formData.proprietarioNome.trim(); 
          ownerEmail = formData.proprietarioEmail.trim().toLowerCase(); 
        } else { 
          ownerId = formData.proprietarioId; 
          const o = proprietari.find(p => p.id === formData.proprietarioId); 
          ownerName = o?.name || ''; 
          ownerEmail = o?.email || ''; 
        } 
      }
      
      // 🔴 DEBUG: log completo dei dati
      console.log("🔴 DEBUG PropertyCreationModal:");
      console.log("  mode:", mode);
      console.log("  currentUser:", currentUser);
      console.log("  ownerId calcolato:", ownerId);
      console.log("  ownerName:", ownerName);
      console.log("  ownerEmail:", ownerEmail);
      
      const data = { 
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
        cleaningPrice: mode === "admin" ? (parseFloat(formData.prezzoBase) || 0) : 0, // Owner non imposta prezzo
        ownerId, 
        ownerName, 
        ownerEmail, 
        clientId: ownerId, 
        newClient: (mode === "admin" && formData.nuovoProprietario) ? { 
          name: formData.proprietarioNome.trim(), 
          email: formData.proprietarioEmail.trim().toLowerCase(), 
          phone: formData.proprietarioTelefono.trim() || null 
        } : null, 
        bedConfiguration, 
        beds: bedsConfig, 
        serviceConfigs, 
        usesOwnLinen: formData.usesOwnLinen, 
        coordinates: formData.coordinates, 
        coordinatesVerified: formData.addressVerified,
        status: mode === "owner" ? "PENDING" : "ACTIVE", // Owner crea in pending
      };
      
      // 🔴 DEBUG: dati inviati all'API
      console.log("🔴 DEBUG: Dati inviati all'API:", JSON.stringify(data, null, 2));
      
      const res = await fetch('/api/properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await res.json();
      
      // 🔴 DEBUG: risposta API
      console.log("🔴 DEBUG: Risposta API:", { ok: res.ok, status: res.status, result });
      
      if (!res.ok) throw new Error(result.error || 'Errore');
      
      // 🔴 DEBUG: proprietà creata con successo
      console.log("🔴 DEBUG: Proprietà creata con ID:", result.id);
      
      if (imageBase64 && result.id) { 
        try { 
          await fetch(`/api/properties/${result.id}/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: imageBase64 }) }); 
        } catch {} 
      }
      
      onSuccess?.(); 
      onClose(); 
      router.refresh();
    } catch (err: any) { 
      console.error("🔴 DEBUG: Errore creazione proprietà:", err);
      setError(err.message || 'Errore'); 
    } finally { setSaving(false); }
  };

  if (!isOpen) return null;

  const actualStep = getActualStep();
  const showPrezzoStep = mode === "admin" && actualStep === 4;
  const showProprietarioStep = mode === "admin" && actualStep === 5;
  const showStanzeStep = actualStep === 6;
  const showDotazioniStep = actualStep === 7;
  const showFotoStep = actualStep === 8;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 text-white flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">
              {mode === "owner" ? "Richiedi Nuova Proprietà" : "Nuova Proprietà"}
            </h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
              <div className="w-4 h-4">{Icons.close}</div>
            </button>
          </div>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} className="flex-1">
                <div className={`h-1.5 rounded-full transition-colors ${i < step ? 'bg-emerald-400' : 'bg-white/20'}`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-white/60 mt-2">Step {step} di {totalSteps} • {stepLabels[step-1]}</p>
        </div>
        
        <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* STEP 1: Info */}
          {actualStep === 1 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Informazioni Base</h3>
                <p className="text-sm text-slate-500 mt-1">Inserisci i dati della proprietà</p>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nome Proprietà *</label>
                <input type="text" value={formData.nome} onChange={e => updateField('nome', e.target.value)} 
                  placeholder="es. Appartamento Colosseo" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              
              <div>
                <AddressAutocomplete 
                  label="Indirizzo *" 
                  placeholder="Inizia a digitare..." 
                  defaultValue={formData.indirizzo} 
                  required 
                  showVerifiedIcon={true} 
                  onSelect={(r: AddressResult) => setFormData(prev => ({ 
                    ...prev, 
                    indirizzo: r.street + (r.houseNumber ? ' ' + r.houseNumber : ''), 
                    citta: r.city, 
                    cap: r.postalCode, 
                    coordinates: r.coordinates, 
                    addressVerified: true 
                  }))} 
                />
                {formData.addressVerified && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Coordinate salvate
                  </p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Città *</label>
                  <input type="text" value={formData.citta} 
                    onChange={e => { updateField('citta', e.target.value); updateField('addressVerified', false); }} 
                    placeholder="Roma"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">CAP *</label>
                  <input type="text" value={formData.cap} 
                    onChange={e => { updateField('cap', e.target.value); updateField('addressVerified', false); }} 
                    placeholder="00100"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Piano *</label>
                  <input type="text" value={formData.piano} onChange={e => updateField('piano', e.target.value)} 
                    placeholder="3"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Citofono *</label>
                  <input type="text" value={formData.citofonoAccesso} onChange={e => updateField('citofonoAccesso', e.target.value)} 
                    placeholder="Rossi"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Capacità */}
          {actualStep === 2 && (
            <div className="space-y-5">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-violet-400 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Capacità</h3>
                <p className="text-sm text-slate-500 mt-1">Quanti ospiti può ospitare?</p>
              </div>
              
              <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-lg">Ospiti Massimi</h4>
                    <p className="text-sm text-white/80">Capacità totale</p>
                  </div>
                  <Counter value={formData.maxGuests} onChange={v => updateField('maxGuests', v)} min={1} max={20} />
                </div>
              </div>
              
              <div className="bg-slate-100 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800">Bagni</h4>
                      <p className="text-sm text-slate-500">Numero bagni</p>
                    </div>
                  </div>
                  <Counter value={formData.bagni} onChange={v => updateField('bagni', v)} min={1} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Orari */}
          {actualStep === 3 && (
            <div className="space-y-5">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Orari</h3>
                <p className="text-sm text-slate-500 mt-1">Check-in e check-out</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
                  <label className="block text-sm font-semibold text-emerald-700 mb-3">Check-in</label>
                  <input type="time" value={formData.checkIn} onChange={e => updateField('checkIn', e.target.value)} 
                    className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="bg-rose-50 rounded-2xl p-5 border border-rose-100">
                  <label className="block text-sm font-semibold text-rose-700 mb-3">Check-out</label>
                  <input type="time" value={formData.checkOut} onChange={e => updateField('checkOut', e.target.value)} 
                    className="w-full px-4 py-3 bg-white border border-rose-200 rounded-xl text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Prezzo (SOLO ADMIN) */}
          {showPrezzoStep && (
            <div className="space-y-5">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Prezzo Pulizia</h3>
                <p className="text-sm text-slate-500 mt-1">Tariffa contrattuale</p>
              </div>
              
              <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-8 text-white text-center">
                <p className="text-sm text-white/80 mb-3">Prezzo Base</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-4xl font-bold">€</span>
                  <input type="number" value={formData.prezzoBase} onChange={e => updateField('prezzoBase', e.target.value)} 
                    placeholder="65" min="0" step="0.01"
                    className="w-28 text-4xl font-bold bg-transparent border-b-2 border-white/50 text-center focus:outline-none focus:border-white" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Proprietario (SOLO ADMIN) */}
          {showProprietarioStep && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-400 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Proprietario</h3>
                <p className="text-sm text-slate-500 mt-1">Chi è il proprietario?</p>
              </div>
              
              <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                <button type="button" onClick={() => updateField('nuovoProprietario', false)} 
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${!formData.nuovoProprietario ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>
                  Esistente
                </button>
                <button type="button" onClick={() => updateField('nuovoProprietario', true)} 
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${formData.nuovoProprietario ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>
                  Nuovo
                </button>
              </div>
              
              {!formData.nuovoProprietario ? (
                <div className="space-y-3">
                  <input type="text" value={searchProprietario} onChange={e => setSearchProprietario(e.target.value)} 
                    placeholder="🔍 Cerca proprietario..." 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base" />
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {filteredProprietari.map(p => (
                      <button key={p.id} type="button" onClick={() => updateField('proprietarioId', p.id)} 
                        className={`w-full p-4 rounded-xl border-2 text-left flex items-center gap-3 transition-colors ${formData.proprietarioId === p.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${formData.proprietarioId === p.id ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                          {p.name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                          <p className="text-sm text-slate-500 truncate">{p.email}</p>
                        </div>
                        {formData.proprietarioId === p.id && <div className="w-6 h-6 text-emerald-500">{Icons.check}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-sm text-blue-700">📧 Il cliente riceverà email con credenziali.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nome *</label>
                    <input type="text" value={formData.proprietarioNome} onChange={e => updateField('proprietarioNome', e.target.value)} 
                      placeholder="Mario Rossi"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email *</label>
                    <input type="email" value={formData.proprietarioEmail} onChange={e => updateField('proprietarioEmail', e.target.value)} 
                      placeholder="mario@email.com"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Telefono</label>
                    <input type="tel" value={formData.proprietarioTelefono} onChange={e => updateField('proprietarioTelefono', e.target.value)} 
                      placeholder="+39 333 1234567"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP: Stanze */}
          {showStanzeStep && (
            <div className="space-y-4">
              {/* Header con conteggio posti letto */}
              {(() => {
                const totalBedCapacity = allBeds.reduce((s, b) => s + b.capacita, 0);
                const isEnough = totalBedCapacity >= formData.maxGuests;
                return (
                  <div className={`rounded-2xl p-5 text-white ${
                    isEnough 
                      ? 'bg-gradient-to-r from-violet-500 to-purple-600' 
                      : 'bg-gradient-to-r from-amber-500 to-orange-500'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-lg">Stanze e Letti</h3>
                        <p className="text-sm text-white/80">Configura la struttura</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold">{totalBedCapacity}</p>
                        <p className="text-xs text-white/80">posti letto</p>
                      </div>
                    </div>
                    {/* Indicatore requisito minimo */}
                    <div className={`mt-3 pt-3 border-t ${isEnough ? 'border-white/20' : 'border-white/30'}`}>
                      {isEnough ? (
                        <p className="text-sm text-white/90 flex items-center gap-2">
                          <span className="text-lg">✓</span>
                          Sufficiente per {formData.maxGuests} {formData.maxGuests === 1 ? 'ospite' : 'ospiti'}
                        </p>
                      ) : (
                        <p className="text-sm text-white font-medium flex items-center gap-2">
                          <span className="text-lg">⚠️</span>
                          Servono almeno {formData.maxGuests} posti (mancano {formData.maxGuests - totalBedCapacity})
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
              
              {/* Lista stanze */}
              <div className="space-y-3">
                {formData.stanze.map(stanza => { 
                  const cap = stanza.letti.reduce((s, l) => s + getTipoLettoInfo(l.tipo).capacita * l.quantita, 0); 
                  const isExpanded = stanzaExpandedId === stanza.id;
                  return (
                    <div key={stanza.id} className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                      {/* Header stanza - cliccabile per espandere */}
                      <div 
                        className="p-4 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white cursor-pointer active:bg-slate-100" 
                        onClick={() => setStanzaExpandedId(isExpanded ? null : stanza.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center shadow-sm">
                            <div className="w-6 h-6 text-violet-600">{Icons.room}</div>
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{stanza.nome}</p>
                            <p className="text-sm text-slate-500">
                              {stanza.letti.length === 0 ? '🛏️ Nessun letto' : `🛏️ ${cap} ${cap === 1 ? 'posto' : 'posti'} letto`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            type="button" 
                            onClick={e => { e.stopPropagation(); rimuoviStanza(stanza.id); }} 
                            className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center hover:bg-red-100 active:bg-red-200 transition-colors"
                          >
                            <div className="w-5 h-5 text-red-500">{Icons.trash}</div>
                          </button>
                          <div className={`w-6 h-6 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                            {Icons.down}
                          </div>
                        </div>
                      </div>
                      
                      {/* Contenuto espanso - Lista letti */}
                      {isExpanded && (
                        <div className="p-4 pt-2 border-t border-slate-100 bg-slate-50/50">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 px-1">Letti:</p>
                          <div className="space-y-2">
                            {TIPI_LETTO.map(tipo => { 
                              const count = stanza.letti.find(l => l.tipo === tipo.tipo)?.quantita || 0; 
                              return (
                                <div 
                                  key={tipo.tipo} 
                                  className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                                    count > 0 ? 'bg-violet-50 border border-violet-200' : 'bg-white border border-slate-100'
                                  }`}
                                >
                                  {/* Info letto */}
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className="text-2xl flex-shrink-0">{tipo.icon}</span>
                                    <div className="min-w-0">
                                      <p className={`text-sm font-semibold truncate ${count > 0 ? 'text-violet-800' : 'text-slate-700'}`}>
                                        {tipo.nome}
                                      </p>
                                      <p className="text-xs text-slate-400">
                                        {tipo.capacita}p
                                      </p>
                                    </div>
                                  </div>
                                  
                                  {/* Controlli quantità */}
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button 
                                      type="button" 
                                      onClick={() => rimuoviLetto(stanza.id, tipo.tipo)} 
                                      disabled={count === 0}
                                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                                        count > 0 
                                          ? 'bg-white border border-violet-200 text-violet-600 active:bg-violet-100' 
                                          : 'bg-slate-100 border border-slate-200 text-slate-300'
                                      }`}
                                    >
                                      <div className="w-4 h-4">{Icons.minus}</div>
                                    </button>
                                    <span className={`w-8 text-center text-base font-bold ${count > 0 ? 'text-violet-700' : 'text-slate-400'}`}>
                                      {count}
                                    </span>
                                    <button 
                                      type="button" 
                                      onClick={() => aggiungiLetto(stanza.id, tipo.tipo)} 
                                      className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center text-white active:bg-violet-700 transition-colors shadow-sm"
                                    >
                                      <div className="w-4 h-4">{Icons.plus}</div>
                                    </button>
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
              
              {/* Bottone aggiungi stanza */}
              {!showAddStanza ? (
                <button 
                  type="button" 
                  onClick={() => setShowAddStanza(true)} 
                  className="w-full py-4 border-2 border-dashed border-violet-300 rounded-2xl text-violet-600 font-semibold flex items-center justify-center gap-2 hover:border-violet-400 hover:bg-violet-50 active:bg-violet-100 transition-colors"
                >
                  <div className="w-5 h-5">{Icons.plus}</div>
                  Aggiungi Stanza
                </button>
              ) : (
                <div className="bg-violet-50 rounded-2xl p-4 space-y-4 border border-violet-200">
                  <p className="text-sm font-bold text-violet-700">Seleziona tipo stanza:</p>
                  
                  {/* Stanze predefinite - griglia 2 colonne */}
                  <div className="grid grid-cols-2 gap-2">
                    {STANZE_PREDEFINITE.map(n => (
                      <button 
                        key={n} 
                        type="button" 
                        onClick={() => aggiungiStanza(n)} 
                        className="px-3 py-3 bg-white border border-violet-200 rounded-xl text-sm font-medium text-violet-700 hover:bg-violet-100 active:bg-violet-200 transition-colors text-center"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  
                  {/* Input personalizzato */}
                  <div className="pt-2 border-t border-violet-200">
                    <p className="text-xs text-violet-600 mb-2">Oppure nome personalizzato:</p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={nuovaStanzaNome} 
                        onChange={e => setNuovaStanzaNome(e.target.value)} 
                        placeholder="Es: Suite, Mansarda..." 
                        className="flex-1 px-4 py-3 bg-white border border-violet-200 rounded-xl text-base focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none" 
                      />
                      <button 
                        type="button" 
                        onClick={() => aggiungiStanza(nuovaStanzaNome)} 
                        disabled={!nuovaStanzaNome.trim()} 
                        className="px-5 py-3 bg-violet-600 text-white rounded-xl font-bold disabled:opacity-50 active:bg-violet-700 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  {/* Annulla */}
                  <button 
                    type="button" 
                    onClick={() => { setShowAddStanza(false); setNuovaStanzaNome(''); }} 
                    className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 font-medium"
                  >
                    ✕ Annulla
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP: Dotazioni */}
          {showDotazioniStep && (
            <div className="space-y-4">
              <div className={`rounded-2xl p-4 border-2 ${formData.usesOwnLinen ? 'border-amber-300 bg-amber-50' : 'border-sky-300 bg-sky-50'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{formData.usesOwnLinen ? '🏠' : '🧺'}</span>
                  <h3 className="font-bold text-slate-800">Chi fornisce la biancheria?</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => updateField('usesOwnLinen', false)} 
                    className={`p-4 rounded-xl border-2 text-center transition-all ${!formData.usesOwnLinen ? 'border-sky-500 bg-white shadow-md' : 'border-slate-200 bg-white/50'}`}>
                    <span className="text-2xl block mb-1">🧺</span>
                    <p className="text-sm font-semibold text-slate-800">Nostra Ditta</p>
                    <p className="text-xs text-slate-500">Ordini automatici</p>
                  </button>
                  <button type="button" onClick={() => updateField('usesOwnLinen', true)} 
                    className={`p-4 rounded-xl border-2 text-center transition-all ${formData.usesOwnLinen ? 'border-amber-500 bg-white shadow-md' : 'border-slate-200 bg-white/50'}`}>
                    <span className="text-2xl block mb-1">🏠</span>
                    <p className="text-sm font-semibold text-slate-800">Propria</p>
                    <p className="text-xs text-slate-500">Nessun ordine</p>
                  </button>
                </div>
              </div>
              
              <div className="bg-slate-100 rounded-xl p-4">
                <p className="text-sm text-slate-600">
                  📋 <strong>Configura le dotazioni</strong> per ogni numero di ospiti. Questi dati servono ai nostri operatori.
                  {formData.usesOwnLinen && <span className="block mt-1 text-amber-700">⚠️ La biancheria non verrà ordinata automaticamente.</span>}
                </p>
              </div>
              
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-5 text-white">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-lg">Dotazioni per Ospiti</h3>
                    <p className="text-sm text-white/80">Valori pre-calcolati</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">€{(calcBedLinenPrice() + calcBathPrice() + calcKitPrice() + calcExtrasPrice()).toFixed(2)}</p>
                    <p className="text-xs text-white/80">totale</p>
                  </div>
                </div>
                <GuestSelector value={selectedGuestCount} onChange={setSelectedGuestCount} max={formData.maxGuests} />
                {isCapacityInsufficient && (
                  <div className="mt-3 bg-red-500/20 border border-red-400/50 rounded-lg p-3">
                    <p className="text-sm text-white">⚠️ Servono {selectedGuestCount} posti letto (hai {currentBedCapacity})</p>
                  </div>
                )}
              </div>
              
              {formData.stanze.length > 0 && (
                <>
                  <Section title="Biancheria Letto" icon={Icons.bed} price={calcBedLinenPrice()} expanded={expandedSection === 'beds'} onToggle={() => setExpandedSection(expandedSection === 'beds' ? null : 'beds')} color="blue">
                    <div className="space-y-2">
                      {allBeds.map(bed => { 
                        const sel = currentConfig.selectedBeds.includes(bed.id); 
                        const bl = currentConfig.bedLinen[bed.id] || {}; 
                        return (
                          <div key={bed.id} className={`rounded-lg border-2 overflow-hidden ${sel ? 'border-blue-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                            <div className="p-3 flex items-center gap-2 cursor-pointer" onClick={() => toggleBed(bed.id)}>
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${sel ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                                {sel && <div className="w-3 h-3 text-white">{Icons.check}</div>}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-slate-800">{bed.nome}</p>
                                <p className="text-xs text-slate-500">{bed.stanza}</p>
                              </div>
                            </div>
                            {sel && (
                              <div className="px-3 pb-3 border-t border-blue-100 bg-blue-50/50 space-y-2 pt-2">
                                {invLinen.map(item => (
                                  <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-blue-100">
                                    <span className="text-xs text-slate-700">{item.nome} <span className="text-blue-500 font-semibold">€{item.prezzo}</span></span>
                                    <Counter value={bl[item.id] || 0} onChange={v => updateBedLinen(bed.id, item.id, v)} small />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ); 
                      })}
                    </div>
                  </Section>
                  
                  <Section title="Biancheria Bagno" icon={Icons.towel} price={calcBathPrice()} expanded={expandedSection === 'bath'} onToggle={() => setExpandedSection(expandedSection === 'bath' ? null : 'bath')} color="purple">
                    <div className="space-y-2">
                      {invBath.map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-purple-100">
                          <span className="text-sm text-slate-700">{item.nome} <span className="text-purple-500 font-semibold">€{item.prezzo}</span></span>
                          <Counter value={currentConfig.bathItems[item.id] || 0} onChange={v => updateBathItem(item.id, v)} small />
                        </div>
                      ))}
                    </div>
                  </Section>
                  
                  <Section title="Kit Cortesia" icon={Icons.soap} price={calcKitPrice()} expanded={expandedSection === 'kit'} onToggle={() => setExpandedSection(expandedSection === 'kit' ? null : 'kit')} color="amber">
                    <div className="space-y-2">
                      {invKit.map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-100">
                          <span className="text-sm text-slate-700">{item.nome} <span className="text-amber-600 font-semibold">€{item.prezzo}</span></span>
                          <Counter value={currentConfig.kitItems[item.id] || 0} onChange={v => updateKitItem(item.id, v)} small />
                        </div>
                      ))}
                    </div>
                  </Section>
                  
                  <Section title="Extra" icon={Icons.gift} price={calcExtrasPrice()} expanded={expandedSection === 'extra'} onToggle={() => setExpandedSection(expandedSection === 'extra' ? null : 'extra')} color="emerald">
                    <div className="space-y-2">
                      {invExtras.map(item => (
                        <div key={item.id} onClick={() => toggleExtra(item.id)} 
                          className={`rounded-lg p-3 border-2 cursor-pointer transition-colors ${currentConfig.extras[item.id] ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${currentConfig.extras[item.id] ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                                {currentConfig.extras[item.id] && <div className="w-3 h-3 text-white">{Icons.check}</div>}
                              </div>
                              <span className="text-sm font-medium text-slate-800">{item.nome}</span>
                            </div>
                            <span className="text-sm font-bold text-emerald-600">€{item.prezzo}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                </>
              )}
            </div>
          )}

          {/* STEP: Foto */}
          {showFotoStep && (
            <div className="space-y-5">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Foto (opzionale)</h3>
                <p className="text-sm text-slate-500 mt-1">Aggiungi una foto della proprietà</p>
              </div>
              
              <div onClick={() => fileInputRef.current?.click()} 
                className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-colors">
                {imagePreview ? (
                  <div className="space-y-3">
                    <img src={imagePreview} alt="Preview" className="w-32 h-32 object-cover rounded-xl mx-auto shadow-lg" />
                    <p className="text-sm text-slate-600">{imageFile?.name}</p>
                    <p className="text-xs text-slate-400">Clicca per cambiare</p>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-base font-medium text-slate-600">Clicca per caricare</p>
                    <p className="text-sm text-slate-400 mt-1">PNG, JPG max 5MB</p>
                  </>
                )}
              </div>
              
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-6 h-6 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-semibold text-emerald-800">Quasi fatto!</p>
                  <p className="text-sm text-emerald-600 mt-1">
                    {mode === "owner" 
                      ? "La tua richiesta verrà inviata all'amministrazione per l'approvazione." 
                      : "La foto è opzionale, puoi aggiungerla anche dopo."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-5 py-4 flex gap-3 border-t border-slate-100 flex-shrink-0 bg-white">
          {step > 1 && (
            <button type="button" onClick={prevStep} disabled={saving} 
              className="flex-1 py-3.5 bg-slate-100 text-slate-700 rounded-xl text-base font-semibold hover:bg-slate-200 transition-colors disabled:opacity-50">
              Indietro
            </button>
          )}
          <button type="button" onClick={step === totalSteps ? handleSubmit : nextStep} disabled={saving} 
            className={`flex-1 py-3.5 rounded-xl text-base font-semibold transition-colors disabled:opacity-50 ${
              step === totalSteps 
                ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700' 
                : 'bg-gradient-to-r from-slate-700 to-slate-800 text-white hover:from-slate-800 hover:to-slate-900'
            }`}>
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creazione...
              </span>
            ) : step === totalSteps ? (mode === "owner" ? '📤 Invia Richiesta' : '✓ Crea Proprietà') : 'Avanti →'}
          </button>
        </div>
      </div>
    </div>
  );
}
