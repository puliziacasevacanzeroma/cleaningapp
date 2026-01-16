"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface CreaProprietaModalProps {
  isOpen: boolean;
  onClose: () => void;
  proprietari: { id: string; name: string | null; email: string | null }[];
}

export function CreaProprietaModal({ isOpen, onClose, proprietari }: CreaProprietaModalProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [searchProprietario, setSearchProprietario] = useState('');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    // Step 1
    nome: '',
    indirizzo: '',
    citta: '',
    cap: '',
    piano: '',
    codiceAccesso: '',
    // Step 2
    bagni: 1,
    capacita: 2,
    checkIn: '15:00',
    checkOut: '10:00',
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
      setFormData({
        nome: '',
        indirizzo: '',
        citta: '',
        cap: '',
        piano: '',
        codiceAccesso: '',
        bagni: 1,
        capacita: 2,
        checkIn: '15:00',
        checkOut: '10:00',
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

  const nextStep = () => setStep(s => Math.min(s + 1, totalSteps));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const selectedProprietario = proprietari.find(p => p.id === formData.proprietarioId);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const data = {
        name: formData.nome,
        address: formData.indirizzo,
        city: formData.citta,
        postalCode: formData.cap,
        floor: formData.piano,
        accessCode: formData.codiceAccesso,
        bathrooms: formData.bagni,
        maxGuests: formData.capacita,
        checkInTime: formData.checkIn,
        checkOutTime: formData.checkOut,
        cleaningPrice: parseFloat(formData.prezzoBase) || 0,
        clientId: formData.nuovoProprietario ? null : formData.proprietarioId,
        newClient: formData.nuovoProprietario ? {
          name: formData.proprietarioNome,
          email: formData.proprietarioEmail,
          phone: formData.proprietarioTelefono,
        } : null,
      };

      const response = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        onClose();
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.message || 'Errore durante la creazione');
      }
    } catch (error) {
      console.error('Errore:', error);
      alert('Errore durante la creazione');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5 text-white rounded-t-3xl flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Nuova Proprietà</h2>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Progress */}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex-1 flex items-center">
                <div className={`h-1.5 flex-1 rounded-full transition-all ${
                  i <= step ? 'bg-emerald-400' : 'bg-white/20'
                }`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-white/60 mt-2">
            Step {step} di {totalSteps} • {
              step === 1 ? 'Informazioni Base' :
              step === 2 ? 'Dettagli Alloggio' :
              step === 3 ? 'Prezzi' :
              step === 4 ? 'Proprietario' :
              'Immagini'
            }
          </p>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* STEP 1 - Informazioni Base */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nome Proprietà *</label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={e => updateField('nome', e.target.value)}
                  placeholder="es. Appartamento Colosseo"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Indirizzo *</label>
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
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Piano</label>
                  <input
                    type="text"
                    value={formData.piano}
                    onChange={e => updateField('piano', e.target.value)}
                    placeholder="es. 3°"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Codice Accesso</label>
                  <input
                    type="text"
                    value={formData.codiceAccesso}
                    onChange={e => updateField('codiceAccesso', e.target.value)}
                    placeholder="es. 1234"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 - Dettagli Alloggio */}
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
                      <h4 className="font-semibold text-slate-800">Bagni</h4>
                      <p className="text-xs text-slate-500">Numero totale bagni</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateField('bagni', Math.max(1, formData.bagni - 1))}
                      className="w-10 h-10 rounded-full border-2 border-slate-200 hover:border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all active:scale-95"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="text-2xl font-bold text-slate-800 w-8 text-center">{formData.bagni}</span>
                    <button
                      onClick={() => updateField('bagni', formData.bagni + 1)}
                      className="w-10 h-10 rounded-full bg-sky-500 hover:bg-sky-600 flex items-center justify-center text-white transition-all active:scale-95"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {/* Visual Bagni Icons */}
                <div className="bg-white rounded-xl p-4 flex items-center justify-center gap-2 flex-wrap">
                  {Array.from({ length: Math.min(formData.bagni, 10) }).map((_, i) => (
                    <div key={i} className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center transition-all">
                      <svg className="w-5 h-5 text-sky-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M21 10H7V7a2 2 0 012-2h2a2 2 0 012 2v1h2V7a4 4 0 00-4-4H9a4 4 0 00-4 4v3H3a1 1 0 00-1 1v2a6 6 0 006 6h8a6 6 0 006-6v-2a1 1 0 00-1-1z"/>
                      </svg>
                    </div>
                  ))}
                  {formData.bagni > 10 && (
                    <span className="text-sm text-slate-500 font-medium">+{formData.bagni - 10}</span>
                  )}
                </div>
              </div>

              {/* Ospiti */}
              <div className="bg-slate-50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800">Ospiti</h4>
                      <p className="text-xs text-slate-500">Capacità massima</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateField('capacita', Math.max(1, formData.capacita - 1))}
                      className="w-10 h-10 rounded-full border-2 border-slate-200 hover:border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all active:scale-95"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="text-2xl font-bold text-slate-800 w-8 text-center">{formData.capacita}</span>
                    <button
                      onClick={() => updateField('capacita', formData.capacita + 1)}
                      className="w-10 h-10 rounded-full bg-violet-500 hover:bg-violet-600 flex items-center justify-center text-white transition-all active:scale-95"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {/* Visual Ospiti Icons */}
                <div className="bg-white rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">Anteprima</span>
                    <span className="text-sm font-semibold text-slate-700">{formData.capacita} ospiti</span>
                  </div>
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    {Array.from({ length: Math.min(formData.capacita, 12) }).map((_, i) => (
                      <div key={i} className="transition-all">
                        <svg className="w-8 h-10 text-violet-400" fill="currentColor" viewBox="0 0 24 30">
                          <circle cx="12" cy="6" r="5" />
                          <path d="M12 14c-6 0-9 3-9 6v4a2 2 0 002 2h14a2 2 0 002-2v-4c0-3-3-6-9-6z" />
                        </svg>
                      </div>
                    ))}
                    {formData.capacita > 12 && (
                      <span className="text-sm text-slate-500 font-medium ml-2">+{formData.capacita - 12}</span>
                    )}
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
                    <h4 className="text-sm font-bold text-slate-800">Orari Standard</h4>
                    <p className="text-xs text-slate-500">Orari predefiniti per questa proprietà</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">CHECK-IN</span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      {/* Ore */}
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => {
                            const [h, m] = formData.checkIn.split(':').map(Number);
                            const newH = h === 23 ? 0 : h + 1;
                            updateField('checkIn', `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                          }}
                          className="w-10 h-7 bg-slate-100 hover:bg-slate-200 rounded-t-lg flex items-center justify-center transition-colors active:scale-95"
                        >
                          <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <div className="w-10 h-10 bg-slate-50 flex items-center justify-center">
                          <span className="text-xl font-bold text-slate-800">{formData.checkIn.split(':')[0]}</span>
                        </div>
                        <button
                          onClick={() => {
                            const [h, m] = formData.checkIn.split(':').map(Number);
                            const newH = h === 0 ? 23 : h - 1;
                            updateField('checkIn', `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                          }}
                          className="w-10 h-7 bg-slate-100 hover:bg-slate-200 rounded-b-lg flex items-center justify-center transition-colors active:scale-95"
                        >
                          <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      
                      <span className="text-xl font-bold text-slate-400 mx-1">:</span>
                      
                      {/* Minuti */}
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => {
                            const [h, m] = formData.checkIn.split(':').map(Number);
                            const newM = m >= 55 ? 0 : m + 5;
                            const newH = m >= 55 ? (h === 23 ? 0 : h + 1) : h;
                            updateField('checkIn', `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
                          }}
                          className="w-10 h-7 bg-slate-100 hover:bg-slate-200 rounded-t-lg flex items-center justify-center transition-colors active:scale-95"
                        >
                          <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <div className="w-10 h-10 bg-slate-50 flex items-center justify-center">
                          <span className="text-xl font-bold text-slate-800">{formData.checkIn.split(':')[1]}</span>
                        </div>
                        <button
                          onClick={() => {
                            const [h, m] = formData.checkIn.split(':').map(Number);
                            const newM = m < 5 ? 55 : m - 5;
                            const newH = m < 5 ? (h === 0 ? 23 : h - 1) : h;
                            updateField('checkIn', `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
                          }}
                          className="w-10 h-7 bg-slate-100 hover:bg-slate-200 rounded-b-lg flex items-center justify-center transition-colors active:scale-95"
                        >
                          <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center mt-2">Arrivo ospiti</p>
                  </div>

                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">CHECK-OUT</span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      {/* Ore */}
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => {
                            const [h, m] = formData.checkOut.split(':').map(Number);
                            const newH = h === 23 ? 0 : h + 1;
                            updateField('checkOut', `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                          }}
                          className="w-10 h-7 bg-slate-100 hover:bg-slate-200 rounded-t-lg flex items-center justify-center transition-colors active:scale-95"
                        >
                          <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <div className="w-10 h-10 bg-slate-50 flex items-center justify-center">
                          <span className="text-xl font-bold text-slate-800">{formData.checkOut.split(':')[0]}</span>
                        </div>
                        <button
                          onClick={() => {
                            const [h, m] = formData.checkOut.split(':').map(Number);
                            const newH = h === 0 ? 23 : h - 1;
                            updateField('checkOut', `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                          }}
                          className="w-10 h-7 bg-slate-100 hover:bg-slate-200 rounded-b-lg flex items-center justify-center transition-colors active:scale-95"
                        >
                          <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      
                      <span className="text-xl font-bold text-slate-400 mx-1">:</span>
                      
                      {/* Minuti */}
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => {
                            const [h, m] = formData.checkOut.split(':').map(Number);
                            const newM = m >= 55 ? 0 : m + 5;
                            const newH = m >= 55 ? (h === 23 ? 0 : h + 1) : h;
                            updateField('checkOut', `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
                          }}
                          className="w-10 h-7 bg-slate-100 hover:bg-slate-200 rounded-t-lg flex items-center justify-center transition-colors active:scale-95"
                        >
                          <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <div className="w-10 h-10 bg-slate-50 flex items-center justify-center">
                          <span className="text-xl font-bold text-slate-800">{formData.checkOut.split(':')[1]}</span>
                        </div>
                        <button
                          onClick={() => {
                            const [h, m] = formData.checkOut.split(':').map(Number);
                            const newM = m < 5 ? 55 : m - 5;
                            const newH = m < 5 ? (h === 0 ? 23 : h - 1) : h;
                            updateField('checkOut', `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
                          }}
                          className="w-10 h-7 bg-slate-100 hover:bg-slate-200 rounded-b-lg flex items-center justify-center transition-colors active:scale-95"
                        >
                          <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center mt-2">Uscita ospiti</p>
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

          {/* STEP 3 - Prezzi */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Prezzo Pulizia</h3>
                <p className="text-sm text-slate-500">Imposta il prezzo standard per ogni pulizia</p>
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">€</span>
                <input
                  type="number"
                  value={formData.prezzoBase}
                  onChange={e => updateField('prezzoBase', e.target.value)}
                  placeholder="0"
                  className="w-full pl-12 pr-4 py-5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-3xl font-bold text-center text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 text-center">
                  💡 Questo sarà il prezzo predefinito. Potrai modificarlo per singole pulizie.
                </p>
              </div>
            </div>
          )}

          {/* STEP 4 - Proprietario */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  onClick={() => updateField('nuovoProprietario', false)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    !formData.nuovoProprietario
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Esistente
                </button>
                <button
                  onClick={() => updateField('nuovoProprietario', true)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    formData.nuovoProprietario
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  + Nuovo
                </button>
              </div>

              {!formData.nuovoProprietario ? (
                <div className="space-y-3">
                  {/* Search Bar */}
                  <div className="relative">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={searchProprietario}
                      onChange={e => setSearchProprietario(e.target.value)}
                      placeholder="Cerca cliente per nome o email..."
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                    />
                    {searchProprietario && (
                      <button 
                        onClick={() => setSearchProprietario('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-slate-300 rounded-full flex items-center justify-center hover:bg-slate-400 transition-colors"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Selected Client Banner */}
                  {formData.proprietarioId && selectedProprietario && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold">
                        {selectedProprietario.name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-800">{selectedProprietario.name}</p>
                        <p className="text-xs text-emerald-600">{selectedProprietario.email}</p>
                      </div>
                      <button 
                        onClick={() => updateField('proprietarioId', '')}
                        className="w-8 h-8 bg-emerald-200 rounded-full flex items-center justify-center hover:bg-emerald-300 transition-colors"
                      >
                        <svg className="w-4 h-4 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Results List */}
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {filteredProprietari.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
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
                          onClick={() => updateField('proprietarioId', prop.id)}
                          className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                            formData.proprietarioId === prop.id
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                            formData.proprietarioId === prop.id ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}>
                            {prop.name?.charAt(0) || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{prop.name}</p>
                            <p className="text-xs text-slate-500 truncate">{prop.email}</p>
                          </div>
                          {formData.proprietarioId === prop.id && (
                            <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 mb-4">
                    <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <p className="text-xs text-blue-700">
                      Il nuovo cliente riceverà un'email con le credenziali per accedere al portale.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nome Completo *</label>
                    <input
                      type="text"
                      value={formData.proprietarioNome}
                      onChange={e => updateField('proprietarioNome', e.target.value)}
                      placeholder="Mario Rossi"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email *</label>
                    <input
                      type="email"
                      value={formData.proprietarioEmail}
                      onChange={e => updateField('proprietarioEmail', e.target.value)}
                      placeholder="mario@email.com"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Telefono</label>
                    <input
                      type="tel"
                      value={formData.proprietarioTelefono}
                      onChange={e => updateField('proprietarioTelefono', e.target.value)}
                      placeholder="+39 333 1234567"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5 - Immagini */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="text-center py-4">
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
                      <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
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
                  <svg className="w-5 h-5 text-emerald-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
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
        <div className="px-6 pb-6 pt-2 flex gap-3 border-t border-slate-100 flex-shrink-0">
          {step > 1 && (
            <button
              onClick={prevStep}
              disabled={saving}
              className="flex-1 py-3.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              Indietro
            </button>
          )}
          <button
            onClick={step === totalSteps ? handleSubmit : nextStep}
            disabled={saving}
            className={`flex-1 py-3.5 rounded-xl font-semibold transition-all active:scale-[0.98] disabled:opacity-50 ${
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
                Salvataggio...
              </span>
            ) : step === totalSteps ? '✓ Crea Proprietà' : 'Continua'}
          </button>
        </div>

      </div>
    </div>
  );
}
