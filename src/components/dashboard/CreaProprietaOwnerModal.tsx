"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface CreaProprietaOwnerModalProps {
  isOpen: boolean;
  onClose: () => void;
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

// Biancheria letto per tipo
const BIANCHERIA_LETTO: Record<string, { id: string; nome: string; prezzo: number; default: number }[]> = {
  matrimoniale: [
    { id: 'lenzuolo_sotto_matr', nome: 'Lenzuolo Sotto', prezzo: 6, default: 1 },
    { id: 'lenzuolo_sopra_matr', nome: 'Lenzuolo Sopra', prezzo: 6, default: 1 },
    { id: 'copripiumino_matr', nome: 'Copripiumino', prezzo: 12, default: 1 },
    { id: 'federa', nome: 'Federa', prezzo: 2, default: 2 },
  ],
  singolo: [
    { id: 'lenzuolo_sotto_sing', nome: 'Lenzuolo Sotto', prezzo: 4, default: 1 },
    { id: 'lenzuolo_sopra_sing', nome: 'Lenzuolo Sopra', prezzo: 4, default: 1 },
    { id: 'copripiumino_sing', nome: 'Copripiumino', prezzo: 8, default: 1 },
    { id: 'federa', nome: 'Federa', prezzo: 2, default: 1 },
  ],
  piazza_mezza: [
    { id: 'lenzuolo_sotto_pmezza', nome: 'Lenzuolo Sotto', prezzo: 5, default: 1 },
    { id: 'lenzuolo_sopra_pmezza', nome: 'Lenzuolo Sopra', prezzo: 5, default: 1 },
    { id: 'copripiumino_pmezza', nome: 'Copripiumino', prezzo: 10, default: 1 },
    { id: 'federa', nome: 'Federa', prezzo: 2, default: 1 },
  ],
  divano_letto: [
    { id: 'lenzuolo_sotto_matr', nome: 'Lenzuolo Sotto', prezzo: 6, default: 1 },
    { id: 'lenzuolo_sopra_matr', nome: 'Lenzuolo Sopra', prezzo: 6, default: 1 },
    { id: 'federa', nome: 'Federa', prezzo: 2, default: 2 },
  ],
  castello: [
    { id: 'lenzuolo_sotto_sing', nome: 'Lenzuolo Sotto', prezzo: 4, default: 2 },
    { id: 'lenzuolo_sopra_sing', nome: 'Lenzuolo Sopra', prezzo: 4, default: 2 },
    { id: 'copripiumino_sing', nome: 'Copripiumino', prezzo: 8, default: 2 },
    { id: 'federa', nome: 'Federa', prezzo: 2, default: 2 },
  ],
};

const BIANCHERIA_BAGNO = [
  { id: 'asciugamano_viso', nome: 'Asciugamano Viso', prezzo: 2, defaultPerOspite: 1 },
  { id: 'asciugamano_ospite', nome: 'Asciugamano Ospite', prezzo: 1.5, defaultPerOspite: 1 },
  { id: 'telo_doccia', nome: 'Telo Doccia', prezzo: 4, defaultPerOspite: 1 },
  { id: 'tappetino_bagno', nome: 'Tappetino Bagno', prezzo: 3, defaultPerOspite: 0 },
  { id: 'accappatoio', nome: 'Accappatoio', prezzo: 6, defaultPerOspite: 0 },
];

const KIT_CORTESIA = [
  { id: 'shampoo', nome: 'Shampoo', prezzo: 1, defaultPerOspite: 1 },
  { id: 'bagnoschiuma', nome: 'Bagnoschiuma', prezzo: 1, defaultPerOspite: 1 },
  { id: 'saponetta', nome: 'Saponetta', prezzo: 0.5, defaultPerOspite: 1 },
  { id: 'crema_corpo', nome: 'Crema Corpo', prezzo: 1.5, defaultPerOspite: 0 },
  { id: 'cuffia_doccia', nome: 'Cuffia Doccia', prezzo: 0.3, defaultPerOspite: 0 },
  { id: 'kit_cucito', nome: 'Kit Cucito', prezzo: 1, defaultPerOspite: 0 },
  { id: 'spazzolino_dentifricio', nome: 'Spazzolino + Dentifricio', prezzo: 1.5, defaultPerOspite: 0 },
];

const SERVIZI_EXTRA = [
  { id: 'welcome_kit', nome: 'Welcome Kit', prezzo: 15, descrizione: 'Vino, snack, acqua' },
  { id: 'fiori_freschi', nome: 'Fiori Freschi', prezzo: 20, descrizione: 'Composizione floreale' },
  { id: 'frigo_pieno', nome: 'Frigo Pieno', prezzo: 50, descrizione: 'Colazione e snack' },
  { id: 'culla_baby', nome: 'Culla Baby', prezzo: 25, descrizione: 'Culla e biancheria neonato' },
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
  camera: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="currentColor" opacity="0.1"/><circle cx="12" cy="13" r="4"/></svg>,
  image: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full"><rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
};

// ==================== HELPER COMPONENTS ====================

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block ml-1">
      <button
        type="button"
        onClick={() => setShow(!show)}
        onBlur={() => setShow(false)}
        className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold inline-flex items-center justify-center hover:bg-slate-300 transition-colors"
      >
        ?
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[11px] rounded-lg shadow-lg z-50">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  );
}

function Counter({ value, onChange, min = 0, max = 99, small = false }: { 
  value: number; 
  onChange: (v: number) => void; 
  min?: number; 
  max?: number;
  small?: boolean;
}) {
  const size = small ? 'w-7 h-7' : 'w-8 h-8';
  const iconSize = small ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const textSize = small ? 'text-sm w-5' : 'text-lg w-6';
  
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${size} rounded-full border border-slate-300 bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-all active:scale-95`}
      >
        <div className={iconSize}>{Icons.minus}</div>
      </button>
      <span className={`${textSize} text-center font-semibold text-slate-800`}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${size} rounded-full bg-slate-800 flex items-center justify-center text-white hover:bg-slate-700 transition-all active:scale-95`}
      >
        <div className={iconSize}>{Icons.plus}</div>
      </button>
    </div>
  );
}

function Section({ 
  title, icon, price, expanded, onToggle, children, color = 'slate'
}: { 
  title: string; icon: React.ReactNode; price: number; expanded: boolean; onToggle: () => void; children: React.ReactNode; color?: string;
}) {
  const colorClasses: Record<string, { bg: string; bgExpanded: string }> = {
    slate: { bg: 'bg-slate-100', bgExpanded: 'bg-slate-900' },
    blue: { bg: 'bg-blue-100', bgExpanded: 'bg-blue-600' },
    purple: { bg: 'bg-purple-100', bgExpanded: 'bg-purple-600' },
    amber: { bg: 'bg-amber-100', bgExpanded: 'bg-amber-600' },
    emerald: { bg: 'bg-emerald-100', bgExpanded: 'bg-emerald-600' },
  };
  const c = colorClasses[color] || colorClasses.slate;
  
  return (
    <div className={`rounded-xl border ${expanded ? 'border-slate-300 shadow-sm' : 'border-slate-200'} overflow-hidden mb-2 transition-all bg-white`}>
      <button onClick={onToggle} className="w-full px-3 py-2.5 flex items-center justify-between active:bg-slate-50">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-lg ${expanded ? c.bgExpanded : c.bg} flex items-center justify-center transition-colors`}>
            <div className={`w-4.5 h-4.5 ${expanded ? 'text-white' : 'text-slate-600'}`}>{icon}</div>
          </div>
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

export function CreaProprietaOwnerModal({ isOpen, onClose }: CreaProprietaOwnerModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Form Data
  const [formData, setFormData] = useState({
    nome: '',
    indirizzo: '',
    citta: '',
    cap: '',
    piano: '',
    citofonoAccesso: '',
    bagni: 1,
    checkIn: '15:00',
    checkOut: '10:00',
    stanze: [] as Stanza[],
  });

  // Immagine - salviamo sia il File che il base64
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Configurazioni biancheria
  const [linenConfigs, setLinenConfigs] = useState<Record<number, GuestLinenConfig>>({});
  
  // Stati UI
  const [showAddStanza, setShowAddStanza] = useState(false);
  const [nuovaStanzaNome, setNuovaStanzaNome] = useState('');
  const [stanzaExpandedId, setStanzaExpandedId] = useState<string | null>(null);
  const [selectedGuestCount, setSelectedGuestCount] = useState(1);
  const [expandedSection, setExpandedSection] = useState<string | null>('beds');

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
          beds.push({
            id: `${stanza.id}_${letto.tipo}_${i}`,
            tipo: letto.tipo,
            nome: tipoInfo?.nome || 'Letto',
            stanza: stanza.nome,
            capacita: tipoInfo?.capacita || 1,
          });
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
    
    for (const bed of allBeds) {
      if (remainingGuests <= 0) break;
      selectedBeds.push(bed.id);
      remainingGuests -= bed.capacita;
    }
    
    const bedLinen: Record<string, Record<string, number>> = {};
    selectedBeds.forEach(bedId => {
      const bed = allBeds.find(b => b.id === bedId);
      if (bed) {
        const items = BIANCHERIA_LETTO[bed.tipo] || [];
        bedLinen[bedId] = {};
        items.forEach(item => { bedLinen[bedId][item.id] = item.default; });
      }
    });
    
    const bathItems: Record<string, number> = {};
    BIANCHERIA_BAGNO.forEach(item => { bathItems[item.id] = item.defaultPerOspite * guestCount; });
    
    const kitItems: Record<string, number> = {};
    KIT_CORTESIA.forEach(item => { kitItems[item.id] = item.defaultPerOspite * guestCount; });
    
    const extras: Record<string, boolean> = {};
    SERVIZI_EXTRA.forEach(item => { extras[item.id] = false; });
    
    return { selectedBeds, bedLinen, bathItems, kitItems, extras };
  };

  // Init configs quando cambiano stanze
  useEffect(() => {
    const capacita = calcolaCapacita();
    if (capacita > 0) {
      const newConfigs: Record<number, GuestLinenConfig> = {};
      for (let i = 1; i <= capacita; i++) {
        newConfigs[i] = linenConfigs[i] || generateDefaultConfig(i);
      }
      setLinenConfigs(newConfigs);
      if (selectedGuestCount > capacita) setSelectedGuestCount(capacita);
    }
  }, [formData.stanze]);

  // Blocca scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Reset
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setError('');
      setShowAddStanza(false);
      setNuovaStanzaNome('');
      setStanzaExpandedId(null);
      setSelectedGuestCount(1);
      setExpandedSection('beds');
      setLinenConfigs({});
      setImageFile(null);
      setImageBase64(null);
      setImagePreview(null);
      setFormData({
        nome: '', indirizzo: '', citta: '', cap: '', piano: '', citofonoAccesso: '',
        bagni: 1, checkIn: '15:00', checkOut: '10:00', stanze: [],
      });
    }
  }, [isOpen]);

  const totalSteps = 5;
  const capacitaTotale = calcolaCapacita();
  const allBeds = getAllBeds();

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  // ==================== GESTIONE IMMAGINE ====================
  
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Verifica dimensione (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('L\'immagine deve essere inferiore a 5MB');
      return;
    }
    
    setImageFile(file);
    
    // Crea preview
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    
    // Converti in base64
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImageBase64(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ==================== GESTIONE STANZE ====================
  
  const aggiungiStanza = (nome: string) => {
    if (!nome.trim()) return;
    const nuovaStanza: Stanza = { id: `stanza_${Date.now()}`, nome: nome.trim(), letti: [] };
    updateField('stanze', [...formData.stanze, nuovaStanza]);
    setNuovaStanzaNome('');
    setShowAddStanza(false);
    setStanzaExpandedId(nuovaStanza.id);
  };

  const rimuoviStanza = (stanzaId: string) => {
    updateField('stanze', formData.stanze.filter(s => s.id !== stanzaId));
  };

  const aggiungiLetto = (stanzaId: string, tipo: Letto['tipo']) => {
    const nuoveStanze = formData.stanze.map(stanza => {
      if (stanza.id === stanzaId) {
        const lettoEsistente = stanza.letti.find(l => l.tipo === tipo);
        if (lettoEsistente) {
          return { ...stanza, letti: stanza.letti.map(l => l.tipo === tipo ? { ...l, quantita: l.quantita + 1 } : l) };
        } else {
          return { ...stanza, letti: [...stanza.letti, { id: `letto_${Date.now()}`, tipo, quantita: 1 }] };
        }
      }
      return stanza;
    });
    updateField('stanze', nuoveStanze);
  };

  const aggiornaQuantitaLetto = (stanzaId: string, lettoId: string, nuovaQuantita: number) => {
    if (nuovaQuantita <= 0) {
      const nuoveStanze = formData.stanze.map(stanza => {
        if (stanza.id === stanzaId) return { ...stanza, letti: stanza.letti.filter(l => l.id !== lettoId) };
        return stanza;
      });
      updateField('stanze', nuoveStanze);
    } else {
      const nuoveStanze = formData.stanze.map(stanza => {
        if (stanza.id === stanzaId) {
          return { ...stanza, letti: stanza.letti.map(l => l.id === lettoId ? { ...l, quantita: nuovaQuantita } : l) };
        }
        return stanza;
      });
      updateField('stanze', nuoveStanze);
    }
  };

  // ==================== GESTIONE BIANCHERIA ====================

  const currentConfig = linenConfigs[selectedGuestCount] || generateDefaultConfig(selectedGuestCount);

  const toggleBed = (bedId: string) => {
    const config = { ...currentConfig };
    if (config.selectedBeds.includes(bedId)) {
      config.selectedBeds = config.selectedBeds.filter(id => id !== bedId);
      delete config.bedLinen[bedId];
    } else {
      config.selectedBeds.push(bedId);
      const bed = allBeds.find(b => b.id === bedId);
      if (bed) {
        const items = BIANCHERIA_LETTO[bed.tipo] || [];
        config.bedLinen[bedId] = {};
        items.forEach(item => { config.bedLinen[bedId][item.id] = item.default; });
      }
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
    Object.entries(currentConfig.bedLinen).forEach(([bedId, items]) => {
      const bed = allBeds.find(b => b.id === bedId);
      if (bed) {
        const linenItems = BIANCHERIA_LETTO[bed.tipo] || [];
        Object.entries(items).forEach(([itemId, qty]) => {
          const item = linenItems.find(i => i.id === itemId);
          if (item) total += item.prezzo * qty;
        });
      }
    });
    return total;
  };

  const calcBathPrice = () => Object.entries(currentConfig.bathItems).reduce((total, [itemId, qty]) => {
    const item = BIANCHERIA_BAGNO.find(i => i.id === itemId);
    return total + (item ? item.prezzo * qty : 0);
  }, 0);

  const calcKitPrice = () => Object.entries(currentConfig.kitItems).reduce((total, [itemId, qty]) => {
    const item = KIT_CORTESIA.find(i => i.id === itemId);
    return total + (item ? item.prezzo * qty : 0);
  }, 0);

  const calcExtrasPrice = () => Object.entries(currentConfig.extras).reduce((total, [itemId, selected]) => {
    if (!selected) return total;
    const item = SERVIZI_EXTRA.find(i => i.id === itemId);
    return total + (item ? item.prezzo : 0);
  }, 0);

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
        if (formData.stanze.length === 0) return 'Aggiungi almeno una stanza';
        const hasLetti = formData.stanze.some(s => s.letti.length > 0);
        if (!hasLetti) return 'Aggiungi almeno un letto';
        return null;
      case 4: return null;
      case 5: return null;
      default: return null;
    }
  };

  const nextStep = () => {
    const validationError = validateStep();
    if (validationError) { setError(validationError); return; }
    setError('');
    setStep(s => Math.min(s + 1, totalSteps));
  };

  const prevStep = () => { setError(''); setStep(s => Math.max(s - 1, 1)); };

  // ==================== SUBMIT ====================

  const handleSubmit = async () => {
    const validationError = validateStep();
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError('');

    try {
      const bedConfiguration = formData.stanze.map(stanza => ({
        nome: stanza.nome,
        letti: stanza.letti.map(letto => ({ tipo: letto.tipo, quantita: letto.quantita })),
      }));

      const capacitaCalcolata = calcolaCapacita();

      const linenConfigsForSave = Object.entries(linenConfigs).map(([guestCount, config]) => ({
        guestCount: parseInt(guestCount),
        selectedBeds: config.selectedBeds,
        bedLinen: config.bedLinen,
        bathItems: config.bathItems,
        kitItems: config.kitItems,
        extras: config.extras,
      }));

      const data = {
        name: formData.nome.trim(),
        address: formData.indirizzo.trim(),
        city: formData.citta.trim(),
        postalCode: formData.cap.trim(),
        floor: formData.piano.trim(),
        accessCode: formData.citofonoAccesso.trim(),
        bathrooms: formData.bagni,
        maxGuests: capacitaCalcolata,
        checkInTime: formData.checkIn,
        checkOutTime: formData.checkOut,
        bedConfiguration,
        linenConfigs: linenConfigsForSave,
      };

      // 1. Crea la proprietà
      const response = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Errore durante la creazione');
      }

      // 2. Se c'è un'immagine, caricala usando l'ID della proprietà appena creata
      if (imageBase64 && result.id) {
        try {
          const imageResponse = await fetch(`/api/properties/${result.id}/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: imageBase64 }),
          });
          
          if (!imageResponse.ok) {
            console.error('Errore upload immagine, ma proprietà creata');
          }
        } catch (imgError) {
          console.error('Errore upload immagine:', imgError);
          // Non blocchiamo, la proprietà è stata creata
        }
      }

      onClose();
      router.refresh();
    } catch (err: any) {
      console.error('Errore creazione:', err);
      setError(err.message || 'Errore durante l\'invio della richiesta');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[420px] max-h-[90vh] flex flex-col my-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 text-white rounded-t-3xl flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold">Nuova Proprietà</h2>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <div className="w-4 h-4">{Icons.close}</div>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className="flex-1">
                <div className={`h-1 rounded-full transition-all ${i + 1 <= step ? 'bg-emerald-400' : 'bg-white/20'}`} />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/60 mt-1.5">
            Step {step}/{totalSteps} • {step === 1 ? 'Info Base' : step === 2 ? 'Dettagli' : step === 3 ? 'Letti' : step === 4 ? 'Biancheria' : 'Foto'}
          </p>
        </div>

        {/* Hidden file input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleImageSelect} 
          accept="image/*" 
          className="hidden" 
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* STEP 1 - Info Base */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nome Proprietà *
                  <InfoTooltip text="Un nome identificativo (es. Appartamento Centro)" />
                </label>
                <input type="text" value={formData.nome} onChange={e => updateField('nome', e.target.value)} placeholder="es. Appartamento Colosseo" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Indirizzo *</label>
                <input type="text" value={formData.indirizzo} onChange={e => updateField('indirizzo', e.target.value)} placeholder="Via Roma 123" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Città *</label>
                  <input type="text" value={formData.citta} onChange={e => updateField('citta', e.target.value)} placeholder="Roma" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">CAP *</label>
                  <input type="text" value={formData.cap} onChange={e => updateField('cap', e.target.value)} placeholder="00100" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Piano *</label>
                  <input type="text" value={formData.piano} onChange={e => updateField('piano', e.target.value)} placeholder="es. 3°" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Citofono/Accesso *</label>
                  <input type="text" value={formData.citofonoAccesso} onChange={e => updateField('citofonoAccesso', e.target.value)} placeholder="Rossi / 1234" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 - Dettagli */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="bg-slate-50 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800">Bagni</h4>
                      <p className="text-xs text-slate-500">Numero totale</p>
                    </div>
                  </div>
                  <Counter value={formData.bagni} onChange={v => updateField('bagni', v)} min={1} />
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Orari Standard</h4>
                    <p className="text-xs text-slate-500">Check-in e check-out</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl p-3 border border-slate-200">
                    <p className="text-xs font-semibold text-emerald-600 mb-2">CHECK-IN</p>
                    <select value={formData.checkIn} onChange={e => updateField('checkIn', e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold">
                      {Array.from({ length: 24 }).flatMap((_, h) => ['00', '30'].map(m => <option key={`${h}:${m}`} value={`${String(h).padStart(2, '0')}:${m}`}>{String(h).padStart(2, '0')}:{m}</option>))}
                    </select>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-slate-200">
                    <p className="text-xs font-semibold text-red-500 mb-2">CHECK-OUT</p>
                    <select value={formData.checkOut} onChange={e => updateField('checkOut', e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold">
                      {Array.from({ length: 24 }).flatMap((_, h) => ['00', '30'].map(m => <option key={`${h}:${m}`} value={`${String(h).padStart(2, '0')}:${m}`}>{String(h).padStart(2, '0')}:{m}</option>))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 - Letti */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center"><div className="w-6 h-6">{Icons.bed}</div></div>
                    <div>
                      <h3 className="font-bold">Configurazione Letti</h3>
                      <p className="text-xs text-white/80">Aggiungi stanze e letti</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{capacitaTotale}</p>
                    <p className="text-xs text-white/80">ospiti max</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {formData.stanze.map(stanza => {
                  const isExpanded = stanzaExpandedId === stanza.id;
                  const capacitaStanza = stanza.letti.reduce((acc, l) => {
                    const tipo = TIPI_LETTO.find(t => t.tipo === l.tipo);
                    return acc + (tipo?.capacita || 1) * l.quantita;
                  }, 0);

                  return (
                    <div key={stanza.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={() => setStanzaExpandedId(isExpanded ? null : stanza.id)}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center"><div className="w-5 h-5 text-violet-600">{Icons.room}</div></div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{stanza.nome}</p>
                            <p className="text-xs text-slate-500">{stanza.letti.length === 0 ? 'Nessun letto' : `${stanza.letti.reduce((a, l) => a + l.quantita, 0)} letti • ${capacitaStanza} posti`}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); rimuoviStanza(stanza.id); }} className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100"><div className="w-4 h-4">{Icons.trash}</div></button>
                          <div className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>{Icons.down}</div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-slate-100 p-3 bg-slate-50">
                          {stanza.letti.length > 0 && (
                            <div className="space-y-2 mb-3">
                              {stanza.letti.map(letto => {
                                const tipoInfo = TIPI_LETTO.find(t => t.tipo === letto.tipo);
                                return (
                                  <div key={letto.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-slate-200">
                                    <div className="flex items-center gap-2">
                                      <span className="text-lg">{tipoInfo?.icon}</span>
                                      <div>
                                        <p className="text-sm font-medium text-slate-700">{tipoInfo?.nome}</p>
                                        <p className="text-[10px] text-slate-400">{tipoInfo?.capacita} posti</p>
                                      </div>
                                    </div>
                                    <Counter value={letto.quantita} onChange={(v) => aggiornaQuantitaLetto(stanza.id, letto.id, v)} min={0} small />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <p className="text-xs font-semibold text-slate-500 mb-2">Aggiungi letto:</p>
                          <div className="flex flex-wrap gap-2">
                            {TIPI_LETTO.map(tipo => (
                              <button key={tipo.tipo} type="button" onClick={() => aggiungiLetto(stanza.id, tipo.tipo)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600 transition-all">
                                <span>{tipo.icon}</span><span>{tipo.nome}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {!showAddStanza ? (
                <button type="button" onClick={() => setShowAddStanza(true)} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm font-semibold text-slate-500 hover:border-violet-400 hover:text-violet-600 transition-colors flex items-center justify-center gap-2">
                  <div className="w-5 h-5">{Icons.plus}</div>Aggiungi Stanza
                </button>
              ) : (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-violet-800 mb-3">Nuova Stanza</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {STANZE_PREDEFINITE.map(nome => (
                      <button key={nome} type="button" onClick={() => aggiungiStanza(nome)} className="px-3 py-1.5 bg-white border border-violet-200 rounded-lg text-xs font-medium text-violet-600 hover:bg-violet-100">{nome}</button>
                    ))}
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

          {/* STEP 4 - Biancheria */}
          {step === 4 && (
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
                      <button key={n} onClick={() => setSelectedGuestCount(n)} className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${n === selectedGuestCount ? 'bg-white text-blue-600' : 'bg-white/20 text-white hover:bg-white/30'}`}>{n}</button>
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
                    <div className="space-y-2">
                      {allBeds.map(bed => {
                        const isSelected = currentConfig.selectedBeds.includes(bed.id);
                        const bedItems = BIANCHERIA_LETTO[bed.tipo] || [];
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
                                {bedItems.map(item => (
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
                  </Section>

                  <Section title="Biancheria Bagno" icon={Icons.towel} price={calcBathPrice()} expanded={expandedSection === 'bath'} onToggle={() => setExpandedSection(expandedSection === 'bath' ? null : 'bath')} color="purple">
                    <div className="space-y-2">
                      {BIANCHERIA_BAGNO.map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-purple-100">
                          <span className="text-xs text-slate-700">{item.nome} <span className="text-purple-500">€{item.prezzo}</span></span>
                          <Counter value={currentConfig.bathItems[item.id] || 0} onChange={v => updateBathItem(item.id, v)} small />
                        </div>
                      ))}
                    </div>
                  </Section>

                  <Section title="Kit Cortesia" icon={Icons.soap} price={calcKitPrice()} expanded={expandedSection === 'kit'} onToggle={() => setExpandedSection(expandedSection === 'kit' ? null : 'kit')} color="amber">
                    <div className="space-y-2">
                      {KIT_CORTESIA.map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2 border border-amber-100">
                          <span className="text-xs text-slate-700">{item.nome} <span className="text-amber-600">€{item.prezzo}</span></span>
                          <Counter value={currentConfig.kitItems[item.id] || 0} onChange={v => updateKitItem(item.id, v)} small />
                        </div>
                      ))}
                    </div>
                  </Section>

                  <Section title="Servizi Extra" icon={Icons.gift} price={calcExtrasPrice()} expanded={expandedSection === 'extra'} onToggle={() => setExpandedSection(expandedSection === 'extra' ? null : 'extra')} color="emerald">
                    <div className="space-y-2">
                      {SERVIZI_EXTRA.map(item => (
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
                  </Section>
                </>
              )}
            </div>
          )}

          {/* STEP 5 - Foto */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="font-semibold text-slate-800 mb-2">Riepilogo Proprietà</h4>
                <div className="space-y-1 text-sm">
                  <p><span className="text-slate-500">Nome:</span> <span className="font-medium">{formData.nome}</span></p>
                  <p><span className="text-slate-500">Indirizzo:</span> <span className="font-medium">{formData.indirizzo}, {formData.citta}</span></p>
                  <p><span className="text-slate-500">Capacità:</span> <span className="font-medium">{capacitaTotale} ospiti</span></p>
                  <p><span className="text-slate-500">Stanze:</span> <span className="font-medium">{formData.stanze.length}</span></p>
                  <p><span className="text-slate-500">Bagni:</span> <span className="font-medium">{formData.bagni}</span></p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-blue-700">La richiesta verrà inviata all'amministratore per l'approvazione.</p>
              </div>

              {/* Area foto con preview */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
                  imagePreview ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                {imagePreview ? (
                  <div className="space-y-3">
                    <div className="relative w-32 h-32 mx-auto rounded-xl overflow-hidden">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeImage(); }}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                      >
                        <div className="w-3 h-3">{Icons.close}</div>
                      </button>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-700">{imageFile?.name}</p>
                      <p className="text-xs text-emerald-600">Clicca per cambiare</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <div className="w-8 h-8 text-slate-400">{Icons.camera}</div>
                    </div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Clicca per caricare una foto</p>
                    <p className="text-xs text-slate-400">PNG, JPG fino a 5MB</p>
                  </>
                )}
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 text-emerald-600">{Icons.check}</div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Quasi fatto!</p>
                    <p className="text-xs text-emerald-600 mt-0.5">La foto è opzionale, puoi aggiungerla dopo.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 flex gap-2 border-t border-slate-100 flex-shrink-0">
          {step > 1 && (
            <button type="button" onClick={prevStep} disabled={saving} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors active:scale-[0.98] disabled:opacity-50">
              Indietro
            </button>
          )}
          <button
            type="button"
            onClick={step === totalSteps ? handleSubmit : nextStep}
            disabled={saving}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 ${
              step === totalSteps ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'
            }`}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creazione...
              </span>
            ) : step === totalSteps ? '📤 Invia Richiesta' : 'Avanti'}
          </button>
        </div>

      </div>
    </div>
  );
}
