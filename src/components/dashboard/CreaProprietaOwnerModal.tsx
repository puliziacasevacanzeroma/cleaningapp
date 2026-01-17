"use client";

import { useState, useEffect } from "react";
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

interface LinenConfigPerGuest {
  guestCount: number;
  selectedBeds: string[]; // IDs dei letti da preparare
  items: { itemId: string; quantity: number }[];
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

// Componente Tooltip Info
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

// Componente Counter
function Counter({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-full border-2 border-slate-200 hover:border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all active:scale-95"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
        </svg>
      </button>
      <span className="text-lg font-bold text-slate-800 w-6 text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white transition-all active:scale-95"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}

// Icone SVG
const Icons = {
  bed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M3 18V12C3 11 4 10 5 10H19C20 10 21 11 21 12V18M3 20V18M21 20V18M6 10V7C6 6 7 5 8 5H16C17 5 18 6 18 7V10"/>
      <rect x="6" y="10" width="12" height="4" rx="1" fill="currentColor" opacity="0.15"/>
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <path d="M12 5V19M5 12H19"/>
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M3 6H21M8 6V4C8 3 9 2 10 2H14C15 2 16 3 16 4V6M19 6V20C19 21 18 22 17 22H7C6 22 5 21 5 20V6H19Z"/>
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <path d="M18 6L6 18M6 6L18 18"/>
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-full h-full">
      <path d="M5 13L9 17L19 7"/>
    </svg>
  ),
  down: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full">
      <path d="M6 9L12 15L18 9"/>
    </svg>
  ),
  room: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/>
      <path d="M3 9H21M9 21V9"/>
    </svg>
  ),
};

export function CreaProprietaOwnerModal({ isOpen, onClose }: CreaProprietaOwnerModalProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Form Data
  const [formData, setFormData] = useState({
    // Step 1 - Info Base
    nome: '',
    indirizzo: '',
    citta: '',
    cap: '',
    piano: '',
    citofonoAccesso: '',
    // Step 2 - Dettagli
    bagni: 1,
    checkIn: '15:00',
    checkOut: '10:00',
    // Step 3 - Configurazione Letti
    stanze: [] as Stanza[],
    // Step 4 - Foto
    immagine: null as File | null,
  });

  // Stato per aggiungere stanza
  const [showAddStanza, setShowAddStanza] = useState(false);
  const [nuovaStanzaNome, setNuovaStanzaNome] = useState('');
  const [stanzaExpandedId, setStanzaExpandedId] = useState<string | null>(null);

  // Calcola capacità totale dai letti
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

  // Blocca scroll quando modal è aperta
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Reset form quando si chiude
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setError('');
      setShowAddStanza(false);
      setNuovaStanzaNome('');
      setStanzaExpandedId(null);
      setFormData({
        nome: '',
        indirizzo: '',
        citta: '',
        cap: '',
        piano: '',
        citofonoAccesso: '',
        bagni: 1,
        checkIn: '15:00',
        checkOut: '10:00',
        stanze: [],
        immagine: null,
      });
    }
  }, [isOpen]);

  const totalSteps = 4;

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  // ==================== GESTIONE STANZE E LETTI ====================
  
  const aggiungiStanza = (nome: string) => {
    if (!nome.trim()) return;
    const nuovaStanza: Stanza = {
      id: `stanza_${Date.now()}`,
      nome: nome.trim(),
      letti: [],
    };
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
        // Controlla se esiste già un letto di questo tipo
        const lettoEsistente = stanza.letti.find(l => l.tipo === tipo);
        if (lettoEsistente) {
          // Incrementa quantità
          return {
            ...stanza,
            letti: stanza.letti.map(l => 
              l.tipo === tipo ? { ...l, quantita: l.quantita + 1 } : l
            ),
          };
        } else {
          // Aggiungi nuovo letto
          return {
            ...stanza,
            letti: [...stanza.letti, { id: `letto_${Date.now()}`, tipo, quantita: 1 }],
          };
        }
      }
      return stanza;
    });
    updateField('stanze', nuoveStanze);
  };

  const aggiornaQuantitaLetto = (stanzaId: string, lettoId: string, nuovaQuantita: number) => {
    if (nuovaQuantita <= 0) {
      // Rimuovi letto
      const nuoveStanze = formData.stanze.map(stanza => {
        if (stanza.id === stanzaId) {
          return {
            ...stanza,
            letti: stanza.letti.filter(l => l.id !== lettoId),
          };
        }
        return stanza;
      });
      updateField('stanze', nuoveStanze);
    } else {
      // Aggiorna quantità
      const nuoveStanze = formData.stanze.map(stanza => {
        if (stanza.id === stanzaId) {
          return {
            ...stanza,
            letti: stanza.letti.map(l => 
              l.id === lettoId ? { ...l, quantita: nuovaQuantita } : l
            ),
          };
        }
        return stanza;
      });
      updateField('stanze', nuoveStanze);
    }
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
        if (formData.stanze.length === 0) return 'Aggiungi almeno una stanza con letti';
        const hasLetti = formData.stanze.some(s => s.letti.length > 0);
        if (!hasLetti) return 'Aggiungi almeno un letto';
        return null;
      case 4:
        return null; // Foto opzionale
      default:
        return null;
    }
  };

  const nextStep = () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setStep(s => Math.min(s + 1, totalSteps));
  };

  const prevStep = () => {
    setError('');
    setStep(s => Math.max(s - 1, 1));
  };

  // ==================== SUBMIT ====================

  const handleSubmit = async () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Prepara bedConfiguration nel formato corretto
      const bedConfiguration = formData.stanze.map(stanza => ({
        nome: stanza.nome,
        letti: stanza.letti.map(letto => ({
          tipo: letto.tipo,
          quantita: letto.quantita,
        })),
      }));

      const capacitaCalcolata = calcolaCapacita();

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
        bedConfiguration: bedConfiguration,
      };

      const response = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Errore durante la creazione');
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

  const capacitaTotale = calcolaCapacita();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[400px] max-h-[85vh] flex flex-col my-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 text-white rounded-t-3xl flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold">Nuova Proprietà</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <div className="w-4 h-4">{Icons.close}</div>
            </button>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className="flex-1 flex items-center">
                <div className={`h-1 flex-1 rounded-full transition-all ${
                  i + 1 <= step ? 'bg-emerald-400' : 'bg-white/20'
                }`} />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/60 mt-1.5">
            Step {step}/{totalSteps} • {
              step === 1 ? 'Info Base' :
              step === 2 ? 'Dettagli' :
              step === 3 ? 'Configurazione Letti' :
              'Foto'
            }
          </p>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* Error Message */}
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* STEP 1 - Informazioni Base */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nome Proprietà *
                  <InfoTooltip text="Un nome identificativo per la proprietà (es. Appartamento Centro, Villa Mare)" />
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={e => updateField('nome', e.target.value)}
                  placeholder="es. Appartamento Colosseo"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Indirizzo *
                  <InfoTooltip text="L'indirizzo completo con numero civico" />
                </label>
                <input
                  type="text"
                  value={formData.indirizzo}
                  onChange={e => updateField('indirizzo', e.target.value)}
                  placeholder="Via Roma 123"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Città *</label>
                  <input
                    type="text"
                    value={formData.citta}
                    onChange={e => updateField('citta', e.target.value)}
                    placeholder="Roma"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">CAP *</label>
                  <input
                    type="text"
                    value={formData.cap}
                    onChange={e => updateField('cap', e.target.value)}
                    placeholder="00100"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Piano *
                    <InfoTooltip text="Indica il piano (es. 3, PT, S1)" />
                  </label>
                  <input
                    type="text"
                    value={formData.piano}
                    onChange={e => updateField('piano', e.target.value)}
                    placeholder="es. 3°"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Citofono/Accesso *
                    <InfoTooltip text="Nome citofono, codice portone o istruzioni keybox" />
                  </label>
                  <input
                    type="text"
                    value={formData.citofonoAccesso}
                    onChange={e => updateField('citofonoAccesso', e.target.value)}
                    placeholder="es. Rossi / 1234"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 - Dettagli */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Bagni */}
              <div className="bg-slate-50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800">Bagni *</h4>
                      <p className="text-xs text-slate-500">Numero totale bagni</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateField('bagni', Math.max(1, formData.bagni - 1))}
                      className="w-10 h-10 rounded-full border-2 border-slate-200 hover:border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all active:scale-95"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="text-2xl font-bold text-slate-800 w-8 text-center">{formData.bagni}</span>
                    <button
                      type="button"
                      onClick={() => updateField('bagni', formData.bagni + 1)}
                      className="w-10 h-10 rounded-full bg-sky-500 hover:bg-sky-600 flex items-center justify-center text-white transition-all active:scale-95"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Check-in / Check-out Section */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Orari Standard *</h4>
                    <p className="text-xs text-slate-500">Orari predefiniti per questa proprietà</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Check-in */}
                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">CHECK-IN</span>
                    </div>
                    <select
                      value={formData.checkIn}
                      onChange={e => updateField('checkIn', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {Array.from({ length: 24 }).map((_, h) => (
                        ['00', '30'].map(m => (
                          <option key={`${h}:${m}`} value={`${String(h).padStart(2, '0')}:${m}`}>
                            {String(h).padStart(2, '0')}:{m}
                          </option>
                        ))
                      ))}
                    </select>
                  </div>

                  {/* Check-out */}
                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">CHECK-OUT</span>
                    </div>
                    <select
                      value={formData.checkOut}
                      onChange={e => updateField('checkOut', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      {Array.from({ length: 24 }).map((_, h) => (
                        ['00', '30'].map(m => (
                          <option key={`${h}:${m}`} value={`${String(h).padStart(2, '0')}:${m}`}>
                            {String(h).padStart(2, '0')}:{m}
                          </option>
                        ))
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 bg-amber-50 rounded-lg p-3">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-amber-700">
                    <strong>Nota:</strong> Le pulizie vengono programmate tra il check-out e il check-in.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 - Configurazione Letti */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Header con capacità */}
              <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                      <div className="w-6 h-6">{Icons.bed}</div>
                    </div>
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

              {/* Lista Stanze */}
              <div className="space-y-3">
                {formData.stanze.map(stanza => {
                  const isExpanded = stanzaExpandedId === stanza.id;
                  const capacitaStanza = stanza.letti.reduce((acc, l) => {
                    const tipo = TIPI_LETTO.find(t => t.tipo === l.tipo);
                    return acc + (tipo?.capacita || 1) * l.quantita;
                  }, 0);

                  return (
                    <div key={stanza.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      {/* Header Stanza */}
                      <div 
                        className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                        onClick={() => setStanzaExpandedId(isExpanded ? null : stanza.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                            <div className="w-5 h-5 text-violet-600">{Icons.room}</div>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{stanza.nome}</p>
                            <p className="text-xs text-slate-500">
                              {stanza.letti.length === 0 ? 'Nessun letto' : 
                               `${stanza.letti.reduce((a, l) => a + l.quantita, 0)} letti • ${capacitaStanza} posti`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); rimuoviStanza(stanza.id); }}
                            className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
                          >
                            <div className="w-4 h-4">{Icons.trash}</div>
                          </button>
                          <div className={`w-6 h-6 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            {Icons.down}
                          </div>
                        </div>
                      </div>

                      {/* Contenuto Espanso */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 p-3 bg-slate-50">
                          {/* Letti esistenti */}
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
                                        <p className="text-[10px] text-slate-400">{tipoInfo?.capacita} posti letto</p>
                                      </div>
                                    </div>
                                    <Counter 
                                      value={letto.quantita} 
                                      onChange={(v) => aggiornaQuantitaLetto(stanza.id, letto.id, v)}
                                      min={0}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Aggiungi Letto */}
                          <div>
                            <p className="text-xs font-semibold text-slate-500 mb-2">Aggiungi letto:</p>
                            <div className="flex flex-wrap gap-2">
                              {TIPI_LETTO.map(tipo => (
                                <button
                                  key={tipo.tipo}
                                  type="button"
                                  onClick={() => aggiungiLetto(stanza.id, tipo.tipo)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600 transition-all"
                                >
                                  <span>{tipo.icon}</span>
                                  <span>{tipo.nome}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Aggiungi Stanza */}
              {!showAddStanza ? (
                <button
                  type="button"
                  onClick={() => setShowAddStanza(true)}
                  className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm font-semibold text-slate-500 hover:border-violet-400 hover:text-violet-600 transition-colors flex items-center justify-center gap-2"
                >
                  <div className="w-5 h-5">{Icons.plus}</div>
                  Aggiungi Stanza
                </button>
              ) : (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-violet-800 mb-3">Nuova Stanza</p>
                  
                  {/* Stanze predefinite */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {STANZE_PREDEFINITE.map(nome => (
                      <button
                        key={nome}
                        type="button"
                        onClick={() => aggiungiStanza(nome)}
                        className="px-3 py-1.5 bg-white border border-violet-200 rounded-lg text-xs font-medium text-violet-600 hover:bg-violet-100 transition-colors"
                      >
                        {nome}
                      </button>
                    ))}
                  </div>

                  {/* Input personalizzato */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuovaStanzaNome}
                      onChange={e => setNuovaStanzaNome(e.target.value)}
                      placeholder="Nome personalizzato..."
                      className="flex-1 px-3 py-2 bg-white border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      onKeyDown={e => e.key === 'Enter' && aggiungiStanza(nuovaStanzaNome)}
                    />
                    <button
                      type="button"
                      onClick={() => aggiungiStanza(nuovaStanzaNome)}
                      disabled={!nuovaStanzaNome.trim()}
                      className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
                    >
                      Aggiungi
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => { setShowAddStanza(false); setNuovaStanzaNome(''); }}
                    className="w-full mt-2 text-xs text-slate-500 hover:text-slate-700"
                  >
                    Annulla
                  </button>
                </div>
              )}

              {/* Info */}
              {formData.stanze.length === 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-blue-700">
                    Aggiungi le stanze e configura i letti. La capacità ospiti verrà calcolata automaticamente.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 4 - Immagini */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Riepilogo */}
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

              {/* Info box */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-blue-700">La richiesta verrà inviata all'amministratore che definirà il prezzo della pulizia.</p>
              </div>

              <div className="text-center py-2">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Foto Proprietà</h3>
                <p className="text-sm text-slate-500">Aggiungi una foto per riconoscerla facilmente</p>
              </div>

              <label className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-slate-400 transition-colors cursor-pointer group block">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => updateField('immagine', e.target.files?.[0] || null)}
                />
                {formData.immagine ? (
                  <div className="space-y-2">
                    <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                      <div className="w-8 h-8 text-emerald-600">{Icons.check}</div>
                    </div>
                    <p className="text-sm font-medium text-slate-700">{formData.immagine.name}</p>
                    <p className="text-xs text-slate-400">Clicca per cambiare</p>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-slate-200 transition-colors">
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Clicca per caricare</p>
                    <p className="text-xs text-slate-400">PNG, JPG fino a 5MB</p>
                  </>
                )}
              </label>

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
            <button
              type="button"
              onClick={prevStep}
              disabled={saving}
              className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              Indietro
            </button>
          )}
          <button
            type="button"
            onClick={step === totalSteps ? handleSubmit : nextStep}
            disabled={saving}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 ${
              step === totalSteps
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-white'
            }`}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </span>
            ) : step === totalSteps ? '📤 Invia Richiesta' : 'Avanti'}
          </button>
        </div>

      </div>
    </div>
  );
}
