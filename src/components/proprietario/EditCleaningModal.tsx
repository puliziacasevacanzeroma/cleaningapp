"use client";

import { useState, useEffect, useMemo } from "react";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ==================== TYPES ====================
interface Bed {
  id: string;
  type: string;
  name: string;
  location: string;
  capacity: number;
}

interface Property {
  id: string;
  name: string;
  address?: string;
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
  cleaningPrice?: number;
  serviceConfigs?: Record<number, GuestConfig>;
}

interface GuestConfig {
  beds: string[];
  bl: Record<string, Record<string, number>>;
  ba: Record<string, number>;
  ki: Record<string, number>;
  ex: Record<string, boolean>;
}

interface Cleaning {
  id: string;
  propertyId: string;
  date: Date;
  scheduledTime?: string;
  status: string;
  guestsCount?: number;
  notes?: string;
  price?: number;
}

interface InventoryItem {
  id: string;
  name: string;
  sellPrice: number;
  categoryId: string;
}

interface EditCleaningModalProps {
  isOpen: boolean;
  onClose: () => void;
  cleaning: Cleaning;
  property: Property;
  onSuccess?: () => void;
}

// ==================== LOGICA CONFIGURATORE ====================

function generateAutoBeds(guests: number, bedrooms: number): Bed[] {
  const beds: Bed[] = [];
  let remaining = guests;
  let id = 1;
  
  for (let i = 0; i < bedrooms && remaining > 0; i++) {
    beds.push({ id: `bed_${id++}`, type: 'matr', name: 'Matrimoniale', location: `Camera ${i + 1}`, capacity: 2 });
    remaining -= 2;
  }
  
  if (remaining >= 2) {
    beds.push({ id: `bed_${id++}`, type: 'divano', name: 'Divano Letto', location: 'Soggiorno', capacity: 2 });
    remaining -= 2;
  }
  
  if (remaining === 1) {
    beds.push({ id: `bed_${id++}`, type: 'sing', name: 'Singolo', location: 'Cameretta', capacity: 1 });
    remaining -= 1;
  }
  
  while (remaining >= 2) {
    beds.push({ id: `bed_${id++}`, type: 'castello', name: 'Letto a Castello', location: 'Cameretta', capacity: 2 });
    remaining -= 2;
  }
  
  return beds;
}

function getLinenForBedType(type: string) {
  switch (type) {
    case 'matr': return { lenzMatr: 3, lenzSing: 0, federe: 2 };
    case 'sing': return { lenzMatr: 0, lenzSing: 3, federe: 1 };
    case 'divano': return { lenzMatr: 3, lenzSing: 0, federe: 2 };
    case 'castello': return { lenzMatr: 0, lenzSing: 6, federe: 2 };
    default: return { lenzMatr: 0, lenzSing: 3, federe: 1 };
  }
}

function getBedIcon(type: string) {
  switch (type) {
    case 'matr': return '🛏️';
    case 'sing': return '🛏️';
    case 'divano': return '🛋️';
    case 'castello': return '🪜';
    default: return '🛏️';
  }
}

// ==================== COMPONENTS ====================

const Counter = ({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) => (
  <div className="flex items-center gap-1.5">
    <button 
      onClick={() => onChange(Math.max(min, value - 1))}
      className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center hover:bg-slate-50 active:scale-95 transition-all"
    >
      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
      </svg>
    </button>
    <span className="w-6 text-center text-sm font-bold text-slate-800">{value}</span>
    <button 
      onClick={() => onChange(value + 1)}
      className="w-7 h-7 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 active:scale-95 transition-all shadow-sm"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>
);

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`w-12 h-7 rounded-full transition-all ${checked ? 'bg-blue-500' : 'bg-slate-200'} relative`}
  >
    <div className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-1 transition-all ${checked ? 'left-6' : 'left-1'}`} />
  </button>
);

const BedIconSvg = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v11m0-4h18m0 4V8a1 1 0 00-1-1H4a1 1 0 00-1 1v3h18M6 15v3m12-3v3" />
  </svg>
);

// ==================== MAIN COMPONENT ====================

export default function EditCleaningModal({ isOpen, onClose, cleaning, property, onSuccess }: EditCleaningModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'linen'>('details');
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(2);
  const [notes, setNotes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Inventory items
  const [inventoryBed, setInventoryBed] = useState<InventoryItem[]>([]);
  const [inventoryBath, setInventoryBath] = useState<InventoryItem[]>([]);
  const [inventoryKit, setInventoryKit] = useState<InventoryItem[]>([]);
  const [inventoryExtra, setInventoryExtra] = useState<InventoryItem[]>([]);

  // Linen state
  const [bedLinen, setBedLinen] = useState<Record<string, Record<string, number>>>({});
  const [bathLinen, setBathLinen] = useState<Record<string, number>>({});
  const [kitItems, setKitItems] = useState<Record<string, number>>({});
  const [extraItems, setExtraItems] = useState<Record<string, boolean>>({});

  // Load inventory on mount
  useEffect(() => {
    async function loadInventory() {
      try {
        const response = await fetch('/api/inventory/list');
        const data = await response.json();
        
        if (data.categories) {
          const bedItems = data.categories.find((c: { id: string }) => c.id === 'biancheria_letto')?.items || [];
          const bathItems = data.categories.find((c: { id: string }) => c.id === 'biancheria_bagno')?.items || [];
          const kitItemsArr = data.categories.find((c: { id: string }) => c.id === 'kit_cortesia')?.items || [];
          const extraItemsArr = data.categories.find((c: { id: string }) => c.id === 'servizi_extra')?.items || [];
          
          setInventoryBed(bedItems);
          setInventoryBath(bathItems);
          setInventoryKit(kitItemsArr);
          setInventoryExtra(extraItemsArr);
        }
      } catch (error) {
        console.error('Errore caricamento inventario:', error);
      }
    }
    
    if (isOpen) {
      loadInventory();
    }
  }, [isOpen]);

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen && cleaning) {
      const cleaningDate = cleaning.date instanceof Date 
        ? cleaning.date 
        : new Date(cleaning.date);
      setDate(cleaningDate.toISOString().split('T')[0]);
      setGuests(cleaning.guestsCount || 2);
      setNotes(cleaning.notes || '');
    }
  }, [isOpen, cleaning]);

  // Check if property has saved config
  const hasExistingConfig = property?.serviceConfigs && 
    property.serviceConfigs[guests] && 
    Object.keys(property.serviceConfigs[guests]).length > 0;

  // Generate auto config
  const autoGeneratedConfig = useMemo(() => {
    const bedrooms = property?.bedrooms || 1;
    const bathrooms = property?.bathrooms || 1;
    const beds = generateAutoBeds(guests, bedrooms);
    
    const bl: Record<string, Record<string, number>> = {};
    beds.forEach(bed => {
      const linen = getLinenForBedType(bed.type);
      bl[bed.id] = {};
      
      const lenzMatrItem = inventoryBed.find(i => i.name.toLowerCase().includes('matrimoniale'));
      const lenzSingItem = inventoryBed.find(i => i.name.toLowerCase().includes('singolo'));
      const federaItem = inventoryBed.find(i => i.name.toLowerCase().includes('federa'));
      
      if (lenzMatrItem && linen.lenzMatr > 0) bl[bed.id][lenzMatrItem.id] = linen.lenzMatr;
      if (lenzSingItem && linen.lenzSing > 0) bl[bed.id][lenzSingItem.id] = linen.lenzSing;
      if (federaItem && linen.federe > 0) bl[bed.id][federaItem.id] = linen.federe;
    });
    
    const ba: Record<string, number> = {};
    inventoryBath.forEach(item => {
      const name = item.name.toLowerCase();
      if (name.includes('corpo') || name.includes('viso') || name.includes('bidet')) {
        ba[item.id] = guests;
      } else if (name.includes('scendi')) {
        ba[item.id] = bathrooms;
      }
    });
    
    const ki: Record<string, number> = {};
    inventoryKit.forEach(item => {
      ki[item.id] = guests;
    });
    
    const ex: Record<string, boolean> = {};
    inventoryExtra.forEach(item => {
      ex[item.id] = false;
    });
    
    return { beds, bl, ba, ki, ex };
  }, [guests, property, inventoryBed, inventoryBath, inventoryKit, inventoryExtra]);

  // Current config (saved or generated)
  const currentConfig = useMemo(() => {
    if (hasExistingConfig && property.serviceConfigs) {
      const savedConfig = property.serviceConfigs[guests];
      const beds = generateAutoBeds(guests, property.bedrooms || 1);
      return { ...savedConfig, beds };
    }
    return autoGeneratedConfig;
  }, [hasExistingConfig, guests, autoGeneratedConfig, property]);

  // Update linen state when config changes
  useEffect(() => {
    if (currentConfig && inventoryBed.length > 0) {
      setBedLinen(currentConfig.bl || {});
      setBathLinen(currentConfig.ba || {});
      setKitItems(currentConfig.ki || {});
      setExtraItems(currentConfig.ex || {});
    }
  }, [currentConfig, inventoryBed]);

  // Calculate totals
  const calculateTotals = () => {
    let bedTotal = 0;
    Object.values(bedLinen).forEach(items => {
      Object.entries(items).forEach(([itemId, qty]) => {
        const item = inventoryBed.find(i => i.id === itemId);
        if (item) bedTotal += (item.sellPrice || 0) * qty;
      });
    });

    let bathTotal = 0;
    Object.entries(bathLinen).forEach(([itemId, qty]) => {
      const item = inventoryBath.find(i => i.id === itemId);
      if (item) bathTotal += (item.sellPrice || 0) * qty;
    });

    let kitTotal = 0;
    Object.entries(kitItems).forEach(([itemId, qty]) => {
      const item = inventoryKit.find(i => i.id === itemId);
      if (item) kitTotal += (item.sellPrice || 0) * qty;
    });

    let extraTotal = 0;
    Object.entries(extraItems).forEach(([itemId, enabled]) => {
      if (enabled) {
        const item = inventoryExtra.find(i => i.id === itemId);
        if (item) extraTotal += item.sellPrice || 0;
      }
    });

    return { bedTotal, bathTotal, kitTotal, extraTotal, dotazioniTotal: bedTotal + bathTotal + kitTotal + extraTotal };
  };

  const totals = calculateTotals();
  const cleaningPrice = property?.cleaningPrice || cleaning?.price || 0;
  const totalPrice = cleaningPrice + totals.dotazioniTotal;

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    try {
      const cleaningRef = doc(db, "cleanings", cleaning.id);
      await updateDoc(cleaningRef, {
        scheduledDate: new Date(date),
        guestsCount: guests,
        notes: notes,
        updatedAt: new Date(),
        customLinenConfig: {
          bl: bedLinen,
          ba: bathLinen,
          ki: kitItems,
          ex: extraItems
        }
      });
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Errore salvataggio:', error);
      alert('Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "cleanings", cleaning.id));
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Errore eliminazione:', error);
      alert('Errore nell\'eliminazione');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  // Delete Confirm Screen
  if (showDeleteConfirm) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl border border-slate-200">
          <div className="h-1.5 bg-gradient-to-r from-red-500 to-rose-400"></div>
          <div className="p-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-red-100 to-rose-100 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Eliminare la pulizia?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              Questa azione non può essere annullata.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(false)} 
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl"
                disabled={deleting}
              >
                Annulla
              </button>
              <button 
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white font-semibold rounded-xl shadow-lg shadow-red-200 disabled:opacity-50"
              >
                {deleting ? 'Elimino...' : 'Elimina'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
      <div className="flex-1 overflow-y-auto bg-slate-100">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-400"></div>
          <div className="px-4 py-4">
            <div className="max-w-lg mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button onClick={onClose} className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Modifica Servizio</h2>
                    <p className="text-xs text-slate-500">{property?.name}</p>
                  </div>
                </div>
                <div className="px-3 py-1.5 rounded-full text-[11px] font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-400 shadow-lg shadow-blue-200">
                  {cleaning?.scheduledTime || 'TBD'}
                </div>
              </div>
              
              {/* Tabs */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${activeTab === 'details' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  Dettagli
                </button>
                <button
                  onClick={() => setActiveTab('linen')}
                  className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${activeTab === 'linen' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  Biancheria
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-5 pb-28">
          <div className="max-w-lg mx-auto space-y-4">
            
            {activeTab === 'details' && (
              <>
                {/* Data */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">📅</div>
                      <span className="text-sm font-semibold text-slate-800">Data Pulizia</span>
                    </div>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Numero Ospiti */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-500">👥</div>
                      <span className="text-sm font-semibold text-slate-800">Numero Ospiti</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl">
                      <span className="text-sm text-slate-600">Ospiti totali</span>
                      <Counter value={guests} onChange={setGuests} min={1} />
                    </div>
                  </div>
                </div>

                {/* Note */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">📝</div>
                      <span className="text-sm font-semibold text-slate-800">Note (opzionale)</span>
                    </div>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Aggiungi note per questa pulizia..."
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Riepilogo Prezzi */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">💰</div>
                      <span className="text-sm font-semibold text-slate-800">Riepilogo</span>
                    </div>
                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Pulizia</span>
                        <span className="text-sm font-bold text-slate-800">€{cleaningPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Dotazioni</span>
                        <span className="text-sm font-bold text-slate-800">€{totals.dotazioniTotal.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-800">Totale</span>
                      <span className="text-xl font-bold text-emerald-600">€{totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'linen' && (
              <>
                {/* Config Status Banner */}
                <div className={`rounded-2xl p-4 border ${hasExistingConfig ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{hasExistingConfig ? '✓' : '⚡'}</span>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${hasExistingConfig ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {hasExistingConfig ? 'Configurazione salvata' : 'Generata automaticamente'}
                      </p>
                      <p className={`text-xs mt-0.5 ${hasExistingConfig ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {hasExistingConfig ? 'Usando le dotazioni configurate' : `${guests} ospiti, ${property?.bedrooms || 1} camere`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <p className="text-xs text-blue-800">ℹ️ Le modifiche valgono <strong>solo per questa pulizia</strong>.</p>
                </div>

                {/* Biancheria Letto */}
                {inventoryBed.length > 0 && Object.keys(bedLinen).length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="h-1 bg-gradient-to-r from-slate-500 to-slate-600"></div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600"><BedIconSvg /></div>
                          <span className="text-sm font-semibold text-slate-800">Biancheria Letto</span>
                        </div>
                        <span className="text-sm font-bold text-slate-600">€{totals.bedTotal.toFixed(2)}</span>
                      </div>
                      
                      <div className="space-y-4">
                        {currentConfig.beds.map((bed) => (
                          <div key={bed.id} className="bg-slate-50 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-lg">{getBedIcon(bed.type)}</span>
                              <span className="text-sm font-semibold text-slate-700">{bed.name}</span>
                              <span className="text-xs text-blue-500 font-medium px-2 py-0.5 bg-blue-50 rounded-full">{bed.location}</span>
                            </div>
                            <div className="space-y-2 ml-7">
                              {bedLinen[bed.id] && Object.entries(bedLinen[bed.id]).map(([itemId, qty]) => {
                                const item = inventoryBed.find(i => i.id === itemId);
                                if (!item || qty === 0) return null;
                                return (
                                  <div key={itemId} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-slate-200">
                                    <div>
                                      <span className="text-sm text-slate-700">{item.name}</span>
                                      <span className="text-xs text-slate-400 ml-2">€{(item.sellPrice || 0).toFixed(2)}</span>
                                    </div>
                                    <Counter value={qty} onChange={(newQty) => setBedLinen(prev => ({ ...prev, [bed.id]: { ...prev[bed.id], [itemId]: newQty } }))} />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Biancheria Bagno */}
                {inventoryBath.length > 0 && Object.keys(bathLinen).length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">🛁</div>
                          <span className="text-sm font-semibold text-slate-800">Biancheria Bagno</span>
                        </div>
                        <span className="text-sm font-bold text-blue-600">€{totals.bathTotal.toFixed(2)}</span>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(bathLinen).map(([itemId, qty]) => {
                          const item = inventoryBath.find(i => i.id === itemId);
                          if (!item) return null;
                          return (
                            <div key={itemId} className="flex items-center justify-between py-2.5 px-3 bg-blue-50 rounded-xl">
                              <div>
                                <span className="text-sm text-slate-700">{item.name}</span>
                                <span className="text-xs text-blue-400 ml-2">€{(item.sellPrice || 0).toFixed(2)}</span>
                              </div>
                              <Counter value={qty} onChange={(newQty) => setBathLinen(prev => ({ ...prev, [itemId]: newQty }))} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Kit Cortesia */}
                {inventoryKit.length > 0 && Object.keys(kitItems).length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500"></div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">🧴</div>
                          <span className="text-sm font-semibold text-slate-800">Kit Cortesia</span>
                        </div>
                        <span className="text-sm font-bold text-violet-600">€{totals.kitTotal.toFixed(2)}</span>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(kitItems).map(([itemId, qty]) => {
                          const item = inventoryKit.find(i => i.id === itemId);
                          if (!item) return null;
                          return (
                            <div key={itemId} className="flex items-center justify-between py-2.5 px-3 bg-violet-50 rounded-xl">
                              <div>
                                <span className="text-sm text-slate-700">{item.name}</span>
                                <span className="text-xs text-violet-400 ml-2">€{(item.sellPrice || 0).toFixed(2)}</span>
                              </div>
                              <Counter value={qty} onChange={(newQty) => setKitItems(prev => ({ ...prev, [itemId]: newQty }))} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Servizi Extra */}
                {inventoryExtra.length > 0 && Object.keys(extraItems).length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500"></div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">🎁</div>
                          <span className="text-sm font-semibold text-slate-800">Servizi Extra</span>
                        </div>
                        <span className="text-sm font-bold text-amber-600">€{totals.extraTotal.toFixed(2)}</span>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(extraItems).map(([itemId, enabled]) => {
                          const item = inventoryExtra.find(i => i.id === itemId);
                          if (!item) return null;
                          return (
                            <div key={itemId} className="flex items-center justify-between py-3 px-3 bg-amber-50 rounded-xl">
                              <div>
                                <span className="text-sm text-slate-700">{item.name}</span>
                                <span className="text-xs text-amber-500 ml-2 font-semibold">€{(item.sellPrice || 0).toFixed(2)}</span>
                              </div>
                              <Toggle checked={enabled} onChange={(newVal) => setExtraItems(prev => ({ ...prev, [itemId]: newVal }))} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Totale */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-4 shadow-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-white">Totale Dotazioni</span>
                    <span className="text-2xl font-bold text-white">€{totals.dotazioniTotal.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Footer */}
      <div className="bg-white border-t border-slate-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex gap-3">
          <button onClick={() => setShowDeleteConfirm(true)} className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-100 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all disabled:opacity-50">
            {saving ? 'Salvo...' : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Salva Modifiche
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
