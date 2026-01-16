"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface CreaProprietaModalProps {
  isOpen: boolean;
  onClose: () => void;
  proprietari: { id: string; name: string | null; email: string | null }[];
}

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

export function CreaProprietaModal({ isOpen, onClose, proprietari }: CreaProprietaModalProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [searchProprietario, setSearchProprietario] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    // Step 1
    nome: '',
    indirizzo: '',
    citta: '',
    cap: '',
    piano: '',
    citofonoAccesso: '',
    // Step 2
    bagni: 1,
    capacita: 2,
    checkInHour: 15,
    checkInMin: 0,
    checkOutHour: 10,
    checkOutMin: 0,
    // Step 3
    prezzoBase: '',
    // Step 4
    proprietarioId: '',
    nuovoProprietario: false,
    proprietarioNome: '',
    proprietarioEmail: '',
    proprietarioTelefono: '',
    // Step 5
    immagine: null as File | null,
  });

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
      setSearchProprietario('');
      setError('');
      setFormData({
        nome: '',
        indirizzo: '',
        citta: '',
        cap: '',
        piano: '',
        citofonoAccesso: '',
        bagni: 1,
        capacita: 2,
        checkInHour: 15,
        checkInMin: 0,
        checkOutHour: 10,
        checkOutMin: 0,
        prezzoBase: '',
        proprietarioId: '',
        nuovoProprietario: false,
        proprietarioNome: '',
        proprietarioEmail: '',
        proprietarioTelefono: '',
        immagine: null,
      });
    }
  }, [isOpen]);

  const filteredProprietari = proprietari.filter(p => 
    p.name?.toLowerCase().includes(searchProprietario.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchProprietario.toLowerCase())
  );

  const totalSteps = 5;

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  // Validazione per step
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
        if (formData.capacita < 1) return 'Inserisci almeno 1 ospite';
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

  const handleSubmit = async () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');
    
    try {
      const checkInTime = `${String(formData.checkInHour).padStart(2, '0')}:${String(formData.checkInMin).padStart(2, '0')}`;
      const checkOutTime = `${String(formData.checkOutHour).padStart(2, '0')}:${String(formData.checkOutMin).padStart(2, '0')}`;

      const data = {
        name: formData.nome.trim(),
        address: formData.indirizzo.trim(),
        city: formData.citta.trim(),
        postalCode: formData.cap.trim(),
        floor: formData.piano.trim(),
        accessCode: formData.citofonoAccesso.trim(),
        bathrooms: formData.bagni,
        maxGuests: formData.capacita,
        checkInTime,
        checkOutTime,
        cleaningPrice: parseFloat(formData.prezzoBase) || 0,
        clientId: formData.nuovoProprietario ? null : formData.proprietarioId,
        newClient: formData.nuovoProprietario ? {
          name: formData.proprietarioNome.trim(),
          email: formData.proprietarioEmail.trim().toLowerCase(),
          phone: formData.proprietarioTelefono.trim() || null,
        } : null,
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
      setError(err.message || 'Errore durante la creazione della proprietà');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[380px] max-h-[85vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 text-white rounded-t-3xl flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold">Nuova Proprietà</h2>
            <button 
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Progress */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex-1">
                <div className={`h-1 rounded-full transition-all ${
                  i <= step ? 'bg-emerald-400' : 'bg-white/20'
                }`} />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/60 mt-1.5">
            Step {step}/{totalSteps} • {
              step === 1 ? 'Info Base' :
              step === 2 ? 'Dettagli' :
              step === 3 ? 'Prezzi' :
              step === 4 ? 'Proprietario' : 'Foto'
            }
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          
          {/* STEP 1 - Info Base */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Nome Proprietà *
                  <InfoTooltip text="Un nome identificativo per riconoscere facilmente la proprietà (es. Appartamento Centro, Villa Mare)" />
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={e => updateField('nome', e.target.value)}
                  placeholder="es. Appartamento Colosseo"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Indirizzo *
                  <InfoTooltip text="L'indirizzo completo con numero civico" />
                </label>
                <input
                  type="text"
                  value={formData.indirizzo}
                  onChange={e => updateField('indirizzo', e.target.value)}
                  placeholder="Via Roma 123"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Città *</label>
                  <input
                    type="text"
                    value={formData.citta}
                    onChange={e => updateField('citta', e.target.value)}
                    placeholder="Roma"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">CAP *</label>
                  <input
                    type="text"
                    value={formData.cap}
                    onChange={e => updateField('cap', e.target.value)}
                    placeholder="00100"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Piano *
                  <InfoTooltip text="Indica il piano dell'appartamento (es. 3, PT per piano terra, S1 per seminterrato)" />
                </label>
                <input
                  type="text"
                  value={formData.piano}
                  onChange={e => updateField('piano', e.target.value)}
                  placeholder="es. 3, PT, S1"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Citofono / Codice Accesso *
                  <InfoTooltip text="Nome sul citofono, codice portone, istruzioni per chiavi o keybox. Queste info saranno visibili agli operatori." />
                </label>
                <textarea
                  value={formData.citofonoAccesso}
                  onChange={e => updateField('citofonoAccesso', e.target.value)}
                  placeholder="es. Citofono 'Rossi', codice portone 1234, keybox a destra del portone codice 5678"
                  rows={2}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}

          {/* STEP 2 - Dettagli */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Bagni */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-700">
                      Bagni *
                      <InfoTooltip text="Numero totale di bagni nella proprietà" />
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateField('bagni', Math.max(1, formData.bagni - 1))}
                      className="w-9 h-9 rounded-full border-2 border-slate-300 flex items-center justify-center text-slate-600 hover:border-slate-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="w-8 text-center text-lg font-bold text-slate-800">{formData.bagni}</span>
                    <button
                      type="button"
                      onClick={() => updateField('bagni', formData.bagni + 1)}
                      className="w-9 h-9 rounded-full bg-sky-500 flex items-center justify-center text-white hover:bg-sky-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Visual bagni */}
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: Math.min(formData.bagni, 10) }).map((_, i) => (
                    <div key={i} className="w-6 h-6 bg-sky-100 rounded flex items-center justify-center">
                      <span className="text-sky-600 text-xs">🚿</span>
                    </div>
                  ))}
                  {formData.bagni > 10 && (
                    <div className="w-6 h-6 bg-sky-100 rounded flex items-center justify-center">
                      <span className="text-sky-600 text-[10px] font-bold">+{formData.bagni - 10}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Ospiti */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-700">
                      Ospiti Max *
                      <InfoTooltip text="Numero massimo di ospiti che la proprietà può ospitare" />
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateField('capacita', Math.max(1, formData.capacita - 1))}
                      className="w-9 h-9 rounded-full border-2 border-slate-300 flex items-center justify-center text-slate-600 hover:border-slate-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="w-8 text-center text-lg font-bold text-slate-800">{formData.capacita}</span>
                    <button
                      type="button"
                      onClick={() => updateField('capacita', formData.capacita + 1)}
                      className="w-9 h-9 rounded-full bg-violet-500 flex items-center justify-center text-white hover:bg-violet-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Visual ospiti */}
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: Math.min(formData.capacita, 12) }).map((_, i) => (
                    <div key={i} className="w-6 h-6 bg-violet-100 rounded flex items-center justify-center">
                      <span className="text-violet-600 text-xs">👤</span>
                    </div>
                  ))}
                  {formData.capacita > 12 && (
                    <div className="w-6 h-6 bg-violet-100 rounded flex items-center justify-center">
                      <span className="text-violet-600 text-[10px] font-bold">+{formData.capacita - 12}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Check-in / Check-out */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-2xl p-4">
                  <label className="block text-sm font-semibold text-emerald-700 mb-2">
                    Check-in *
                    <InfoTooltip text="Orario in cui gli ospiti possono entrare" />
                  </label>
                  <div className="flex items-center justify-center gap-1">
                    <div className="flex flex-col items-center">
                      <button type="button" onClick={() => updateField('checkInHour', (formData.checkInHour + 1) % 24)} className="text-emerald-600 p-1">▲</button>
                      <span className="text-2xl font-bold text-emerald-700 w-8 text-center">{String(formData.checkInHour).padStart(2, '0')}</span>
                      <button type="button" onClick={() => updateField('checkInHour', (formData.checkInHour - 1 + 24) % 24)} className="text-emerald-600 p-1">▼</button>
                    </div>
                    <span className="text-2xl font-bold text-emerald-700">:</span>
                    <div className="flex flex-col items-center">
                      <button type="button" onClick={() => updateField('checkInMin', (formData.checkInMin + 5) % 60)} className="text-emerald-600 p-1">▲</button>
                      <span className="text-2xl font-bold text-emerald-700 w-8 text-center">{String(formData.checkInMin).padStart(2, '0')}</span>
                      <button type="button" onClick={() => updateField('checkInMin', (formData.checkInMin - 5 + 60) % 60)} className="text-emerald-600 p-1">▼</button>
                    </div>
                  </div>
                </div>
                <div className="bg-red-50 rounded-2xl p-4">
                  <label className="block text-sm font-semibold text-red-700 mb-2">
                    Check-out *
                    <InfoTooltip text="Orario entro cui gli ospiti devono lasciare" />
                  </label>
                  <div className="flex items-center justify-center gap-1">
                    <div className="flex flex-col items-center">
                      <button type="button" onClick={() => updateField('checkOutHour', (formData.checkOutHour + 1) % 24)} className="text-red-600 p-1">▲</button>
                      <span className="text-2xl font-bold text-red-700 w-8 text-center">{String(formData.checkOutHour).padStart(2, '0')}</span>
                      <button type="button" onClick={() => updateField('checkOutHour', (formData.checkOutHour - 1 + 24) % 24)} className="text-red-600 p-1">▼</button>
                    </div>
                    <span className="text-2xl font-bold text-red-700">:</span>
                    <div className="flex flex-col items-center">
                      <button type="button" onClick={() => updateField('checkOutMin', (formData.checkOutMin + 5) % 60)} className="text-red-600 p-1">▲</button>
                      <span className="text-2xl font-bold text-red-700 w-8 text-center">{String(formData.checkOutMin).padStart(2, '0')}</span>
                      <button type="button" onClick={() => updateField('checkOutMin', (formData.checkOutMin - 5 + 60) % 60)} className="text-red-600 p-1">▼</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-amber-700">Le pulizie vengono programmate tra il check-out e il check-in</p>
              </div>
            </div>
          )}

          {/* STEP 3 - Prezzi */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Prezzo Pulizia</h3>
                <p className="text-sm text-slate-500">Imposta il prezzo standard per ogni pulizia</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl p-6">
                <label className="block text-sm font-semibold text-emerald-700 mb-3 text-center">
                  Prezzo Pulizia Standard *
                  <InfoTooltip text="Il prezzo che verrà addebitato per ogni pulizia di questa proprietà" />
                </label>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl font-bold text-emerald-600">€</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.prezzoBase}
                    onChange={e => updateField('prezzoBase', e.target.value)}
                    placeholder="0.00"
                    className="w-32 px-4 py-3 bg-white border-2 border-emerald-300 rounded-xl text-2xl font-bold text-center text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-blue-700">Questo prezzo sarà applicato automaticamente a tutte le pulizie programmate per questa proprietà.</p>
              </div>
            </div>
          )}

          {/* STEP 4 - Proprietario */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Proprietario</h3>
                <p className="text-sm text-slate-500">Assegna questa proprietà a un cliente</p>
              </div>

              {/* Toggle */}
              <div className="flex bg-slate-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => updateField('nuovoProprietario', false)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    !formData.nuovoProprietario ? 'bg-white shadow text-slate-800' : 'text-slate-500'
                  }`}
                >
                  Esistente
                </button>
                <button
                  type="button"
                  onClick={() => updateField('nuovoProprietario', true)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    formData.nuovoProprietario ? 'bg-white shadow text-slate-800' : 'text-slate-500'
                  }`}
                >
                  Nuovo
                </button>
              </div>

              {!formData.nuovoProprietario ? (
                <div className="space-y-3">
                  {/* Search */}
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={searchProprietario}
                      onChange={e => setSearchProprietario(e.target.value)}
                      placeholder="Cerca per nome o email..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>

                  {/* Lista */}
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {filteredProprietari.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-slate-500">Nessun cliente trovato</p>
                        <button 
                          onClick={() => updateField('nuovoProprietario', true)}
                          className="mt-2 text-sm font-semibold text-slate-800 hover:underline"
                        >
                          + Crea nuovo cliente
                        </button>
                      </div>
                    ) : (
                      filteredProprietari.map(prop => (
                        <button
                          key={prop.id}
                          type="button"
                          onClick={() => updateField('proprietarioId', prop.id)}
                          className={`w-full p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                            formData.proprietarioId === prop.id
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                            formData.proprietarioId === prop.id ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}>
                            {prop.name?.charAt(0) || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 text-sm truncate">{prop.name}</p>
                            <p className="text-xs text-slate-500 truncate">{prop.email}</p>
                          </div>
                          {formData.proprietarioId === prop.id && (
                            <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                    <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <p className="text-xs text-blue-700">Il nuovo cliente riceverà un'email con le credenziali di accesso.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome Completo *</label>
                    <input
                      type="text"
                      value={formData.proprietarioNome}
                      onChange={e => updateField('proprietarioNome', e.target.value)}
                      placeholder="Mario Rossi"
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email *</label>
                    <input
                      type="email"
                      value={formData.proprietarioEmail}
                      onChange={e => updateField('proprietarioEmail', e.target.value)}
                      placeholder="mario@email.com"
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Telefono</label>
                    <input
                      type="tel"
                      value={formData.proprietarioTelefono}
                      onChange={e => updateField('proprietarioTelefono', e.target.value)}
                      placeholder="+39 333 1234567"
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5 - Immagini */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="text-center py-2">
                <h3 className="text-lg font-bold text-slate-800 mb-1">Foto Proprietà</h3>
                <p className="text-sm text-slate-500">Aggiungi una foto (opzionale)</p>
              </div>

              <label className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-slate-400 transition-colors cursor-pointer group block">
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden"
                  onChange={e => updateField('immagine', e.target.files?.[0] || null)}
                />
                {formData.immagine ? (
                  <div className="space-y-2">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto">
                      <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-slate-700 truncate">{formData.immagine.name}</p>
                    <p className="text-xs text-slate-400">Clicca per cambiare</p>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-slate-200">
                      <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-slate-600 mb-1">Clicca per caricare</p>
                    <p className="text-xs text-slate-400">PNG, JPG fino a 5MB</p>
                  </>
                )}
              </label>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2">
                <svg className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
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
                Creazione...
              </span>
            ) : step === totalSteps ? '✓ Crea Proprietà' : 'Avanti'}
          </button>
        </div>

      </div>
    </div>
  );
}
