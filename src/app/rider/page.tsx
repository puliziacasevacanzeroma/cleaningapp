"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, doc, updateDoc, Timestamp, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { NotificationBell } from "~/components/notifications";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
}

interface CleaningData {
  id: string;
  scheduledTime: string;
  status: string;
  operatorName?: string;
}

interface Order {
  id: string;
  propertyId?: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyPostalCode?: string;
  propertyFloor?: string;
  propertyApartment?: string;
  propertyIntercom?: string;
  propertyAccessCode?: string;
  propertyDoorCode?: string;
  propertyKeysLocation?: string;
  propertyAccessNotes?: string;
  propertyImages?: { door?: string; building?: string };
  riderId?: string;
  status: string;
  items: OrderItem[];
  createdAt: any;
  scheduledDate?: string;
  scheduledTime?: string;
  urgency?: 'normal' | 'urgent';
  cleaningId?: string;
  notes?: string;
  deliveredAt?: any;
  // Dati pulizia collegata (caricati dinamicamente)
  cleaning?: CleaningData;
  // Ora per ordinamento (calcolata)
  sortTime?: string;
  // Ritiro biancheria sporca
  includePickup?: boolean;
  pickupItems?: OrderItem[];
  pickupCompleted?: boolean;
}

// Stato del ritiro per ogni articolo
interface PickupItemStatus {
  id: string;
  status: 'ok' | 'missing' | 'different';
  actualQuantity?: number;
  note?: string;
}

type Screen = "home" | "prepare" | "delivering";
type HomeTab = "attivi" | "consegnati";

// ═══════════════════════════════════════════════════════════════════════════
// CONFETTI COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function Confetti({ active }: { active: boolean }) {
  if (!active) return null;
  
  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 8 + Math.random() * 8,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.left}%`,
            top: '-20px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '0%',
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          to { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPARTURE MODAL (Scooter Animation)
// ═══════════════════════════════════════════════════════════════════════════
function DepartureModal({ 
  show, 
  onComplete, 
  count 
}: { 
  show: boolean; 
  onComplete: () => void;
  count: number;
}) {
  const [phase, setPhase] = useState<'intro' | 'driving'>('intro');

  useEffect(() => {
    if (show) {
      setPhase('intro');
      const t1 = setTimeout(() => setPhase('driving'), 300);
      const t2 = setTimeout(() => onComplete(), 2500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700">
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute h-2 bg-white/20 rounded-full"
            style={{
              top: `${20 + i * 10}%`,
              left: '-100%',
              width: '200%',
              animation: `roadLine 0.8s linear ${i * 0.1}s infinite`,
            }}
          />
        ))}
      </div>
      
      <div className="relative z-10 text-center">
        <div 
          className="text-8xl mb-6"
          style={{
            transform: phase === 'intro' ? 'translateX(-200px)' : 'translateX(0)',
            transition: 'transform 0.5s ease-out',
            animation: phase === 'driving' ? 'scooter-bounce 0.3s ease-in-out infinite' : 'none',
          }}
        >
          🛵
        </div>
        <h1 className="text-4xl font-black text-white mb-2">SI PARTE! 🚀</h1>
        <p className="text-white/80 text-xl">
          {count === 1 ? "1 consegna da effettuare" : `${count} consegne da effettuare`}
        </p>
        <p className="text-white/50 text-sm mt-2">Buon viaggio!</p>
      </div>
      
      <style>{`
        @keyframes roadLine {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes scooter-bounce {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-10px) rotate(2deg); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL CONFERMA AGGIUNTA AL CARICO
// ═══════════════════════════════════════════════════════════════════════════
function ConfirmAddModal({ 
  order, 
  onConfirm, 
  onCancel 
}: { 
  order: Order | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div 
        className="relative bg-white rounded-3xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'modalSlideUp 0.3s ease-out' }}
      >
        <div className="p-6">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📦</span>
          </div>
          
          <h3 className="text-xl font-bold text-slate-800 text-center mb-2">Preparare questo ordine?</h3>
          <p className="text-slate-500 text-sm text-center mb-4">Dovrai spuntare tutti gli articoli nel sacco.</p>
          
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center text-2xl">
                🏠
              </div>
              <div>
                <p className="font-bold text-slate-800">{order.propertyName}</p>
                <p className="text-sm text-slate-500">{order.propertyAddress}</p>
                <p className="text-xs text-slate-400 mt-1">📦 {order.items?.length || 0} articoli</p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={onCancel}
              className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              Annulla
            </button>
            <button 
              onClick={onConfirm}
              className="flex-1 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-2xl shadow-lg shadow-orange-500/30 hover:shadow-orange-500/40 active:scale-[0.98] transition-all"
            >
              Prepara 📦
            </button>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes modalSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL CONFERMA CONSEGNA
// ═══════════════════════════════════════════════════════════════════════════
function ConfirmDeliveryModal({ 
  order, 
  onConfirm, 
  onCancel 
}: { 
  order: Order | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div 
        className="relative bg-white rounded-3xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'modalSlideUp 0.3s ease-out' }}
      >
        <div className="p-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✅</span>
          </div>
          
          <h3 className="text-xl font-bold text-slate-800 text-center mb-2">Conferma Consegna</h3>
          <p className="text-slate-500 text-sm text-center mb-4">Hai consegnato tutti gli articoli?</p>
          
          <div className="bg-emerald-50 rounded-2xl p-4 mb-6">
            <p className="font-bold text-slate-800">{order.propertyName}</p>
            <p className="text-sm text-slate-500">{order.propertyAddress}</p>
            <div className="mt-3 pt-3 border-t border-emerald-200">
              <p className="text-xs text-emerald-600 font-semibold mb-2">📤 Articoli consegnati:</p>
              {order.items?.map((item, idx) => (
                <p key={idx} className="text-sm text-emerald-700">• {item.name} × {item.quantity}</p>
              ))}
            </div>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={onCancel}
              className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              Annulla
            </button>
            <button 
              onClick={onConfirm}
              className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-2xl shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-all"
            >
              Confermo ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL CONFERMA RITIRO - NUOVA! 📥
// ═══════════════════════════════════════════════════════════════════════════
function PickupConfirmModal({ 
  order, 
  onConfirm, 
  onCancel 
}: { 
  order: Order | null;
  onConfirm: (pickupStatus: PickupItemStatus[], generalNote: string) => void;
  onCancel: () => void;
}) {
  const [itemStatuses, setItemStatuses] = useState<Record<string, PickupItemStatus>>({});
  const [generalNote, setGeneralNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  // Inizializza tutti gli item come "ok" di default
  useEffect(() => {
    if (order?.pickupItems) {
      const initial: Record<string, PickupItemStatus> = {};
      order.pickupItems.forEach(item => {
        initial[item.id] = { id: item.id, status: 'ok', actualQuantity: item.quantity };
      });
      setItemStatuses(initial);
    }
  }, [order]);

  if (!order || !order.includePickup || !order.pickupItems?.length) return null;

  const handleStatusChange = (itemId: string, status: 'ok' | 'missing' | 'different') => {
    setItemStatuses(prev => ({
      ...prev,
      [itemId]: { 
        ...prev[itemId], 
        id: itemId,
        status,
        actualQuantity: status === 'missing' ? 0 : prev[itemId]?.actualQuantity
      }
    }));
  };

  const handleQuantityChange = (itemId: string, quantity: number) => {
    setItemStatuses(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], id: itemId, actualQuantity: Math.max(0, quantity) }
    }));
  };

  const allOk = Object.values(itemStatuses).every(s => s.status === 'ok');
  const hasIssues = Object.values(itemStatuses).some(s => s.status !== 'ok');

  const handleConfirm = () => {
    onConfirm(Object.values(itemStatuses), generalNote);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div 
        className="relative bg-white rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'modalSlideUp 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-5 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">📥</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Conferma Ritiro</h3>
              <p className="text-white/80 text-sm">{order.propertyName}</p>
            </div>
          </div>
        </div>

        {/* Content - Scrollabile */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-slate-600 text-sm mb-4">
            Verifica la biancheria sporca che hai ritirato:
          </p>

          {/* Lista articoli da ritirare */}
          <div className="space-y-3">
            {order.pickupItems.map((item) => {
              const status = itemStatuses[item.id];
              return (
                <div 
                  key={item.id} 
                  className={`rounded-2xl border-2 overflow-hidden transition-all ${
                    status?.status === 'ok' ? 'border-emerald-200 bg-emerald-50/50' :
                    status?.status === 'missing' ? 'border-red-200 bg-red-50/50' :
                    status?.status === 'different' ? 'border-amber-200 bg-amber-50/50' :
                    'border-slate-200'
                  }`}
                >
                  {/* Info articolo */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🧺</span>
                        <span className="font-semibold text-slate-800">{item.name}</span>
                      </div>
                      <span className="px-3 py-1 bg-slate-200 rounded-full text-sm font-bold text-slate-700">
                        x{item.quantity}
                      </span>
                    </div>

                    {/* Bottoni stato */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleStatusChange(item.id, 'ok')}
                        className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                          status?.status === 'ok'
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                            : 'bg-slate-100 text-slate-600 hover:bg-emerald-100'
                        }`}
                      >
                        ✅ OK
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.id, 'missing')}
                        className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                          status?.status === 'missing'
                            ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                            : 'bg-slate-100 text-slate-600 hover:bg-red-100'
                        }`}
                      >
                        ❌ Manca
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.id, 'different')}
                        className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                          status?.status === 'different'
                            ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                            : 'bg-slate-100 text-slate-600 hover:bg-amber-100'
                        }`}
                      >
                        🔢 Diverso
                      </button>
                    </div>

                    {/* Input quantità se "diverso" */}
                    {status?.status === 'different' && (
                      <div className="mt-3 flex items-center gap-3 bg-amber-100 rounded-xl p-3">
                        <span className="text-sm text-amber-800">Quantità trovata:</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleQuantityChange(item.id, (status.actualQuantity || 0) - 1)}
                            className="w-8 h-8 rounded-lg bg-white border border-amber-300 flex items-center justify-center font-bold text-amber-700"
                          >
                            −
                          </button>
                          <span className="w-10 text-center font-bold text-amber-800">
                            {status.actualQuantity || 0}
                          </span>
                          <button
                            onClick={() => handleQuantityChange(item.id, (status.actualQuantity || 0) + 1)}
                            className="w-8 h-8 rounded-lg bg-white border border-amber-300 flex items-center justify-center font-bold text-amber-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Note aggiuntive */}
          <div className="mt-4">
            {!showNoteInput ? (
              <button
                onClick={() => setShowNoteInput(true)}
                className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 text-sm hover:border-slate-400 hover:text-slate-600 transition-colors"
              >
                💬 Aggiungi una nota (opzionale)
              </button>
            ) : (
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <label className="text-xs font-semibold text-slate-600 mb-2 block">💬 Note:</label>
                <textarea
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  placeholder="Es: Trovato asciugamano macchiato, copriletto mancante..."
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none"
                  rows={3}
                />
              </div>
            )}
          </div>

          {/* Avviso se ci sono problemi */}
          {hasIssues && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-700 flex items-center gap-2">
                <span>⚠️</span>
                <span>Hai segnalato delle differenze. L'admin verrà notificato.</span>
              </p>
            </div>
          )}
        </div>

        {/* Footer con bottoni */}
        <div className="p-5 border-t border-slate-200 bg-slate-50 rounded-b-3xl">
          <div className="flex gap-3">
            <button 
              onClick={onCancel}
              className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-white active:scale-[0.98] transition-all"
            >
              Indietro
            </button>
            <button 
              onClick={handleConfirm}
              className={`flex-1 py-3.5 font-semibold rounded-2xl shadow-lg active:scale-[0.98] transition-all ${
                allOk 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/30'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/30'
              }`}
            >
              {allOk ? '✅ Tutto OK' : '⚠️ Conferma con problemi'}
            </button>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes modalSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// MODAL INFO ACCESSO (COMPLETA)
// ═══════════════════════════════════════════════════════════════════════════
function AccessModal({ 
  order, 
  onClose 
}: { 
  order: Order | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<{url: string; title: string} | null>(null);

  if (!order) return null;

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      if (navigator.vibrate) navigator.vibrate(50);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      console.error("Errore copia:", e);
    }
  };

  const openMaps = () => {
    const address = `${order.propertyAddress || ''}, ${order.propertyPostalCode || ''} ${order.propertyCity || ''}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  // Prendi il codice porta da entrambi i possibili campi
  const doorCode = order.propertyDoorCode || order.propertyAccessCode || null;
  const keysLocation = order.propertyKeysLocation || null;
  const accessNotes = order.propertyAccessNotes || null;
  const floor = order.propertyFloor || null;
  const apartment = order.propertyApartment || null;
  const intercom = order.propertyIntercom || null;
  const doorImage = order.propertyImages?.door || null;
  const buildingImage = order.propertyImages?.building || null;

  // Modal immagine ingrandita
  if (selectedImage) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90" onClick={() => setSelectedImage(null)}>
        <button 
          onClick={() => setSelectedImage(null)}
          className="absolute top-4 right-4 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white text-2xl hover:bg-white/30 z-10"
        >
          ✕
        </button>
        <div className="text-center">
          <p className="text-white text-lg font-semibold mb-4">{selectedImage.title}</p>
          <img 
            src={selectedImage.url} 
            alt={selectedImage.title}
            className="max-w-full max-h-[80vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div 
        className="relative bg-white w-full max-w-md rounded-3xl max-h-[75vh] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'modalSlideUp 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 flex justify-between items-center">
          <div className="flex items-center gap-2 text-white">
            <span className="text-xl">🔐</span>
            <span className="font-bold">Accesso Proprietà</span>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(75vh-130px)]">
          {/* Google Maps Button - PRIMO */}
          <button
            onClick={openMaps}
            className="w-full py-4 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.98]"
          >
            <svg viewBox="0 0 92.3 132.3" className="h-6 w-auto">
              <path fill="#1a73e8" d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z"/>
              <path fill="#ea4335" d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z"/>
              <path fill="#4285f4" d="M46.1 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4 0 0 13.9-16.6 27.5-32.7-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-3.8 8.1-6.3 13.5-6.3"/>
              <path fill="#fbbc04" d="M46.1 63.5c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.6-8.3 4.2-11.4L4.6 68.1C7.4 74.8 12 82.2 19 91.2l31.6-37.7c-1.4.5-2.9.8-4.5.8"/>
              <path fill="#34a853" d="M59.2 83.9c9.6-14.7 15.1-24.6 19.9-35.9-5.6-10.8-15.3-19-27-22.7L19 91.2c7.4 9.5 17.5 22.5 23.4 34.8 1.2 2.5 2.3 5 3.4 7.3l13.4-49.4"/>
            </svg>
            <span className="font-semibold text-slate-700">Apri in Google Maps</span>
          </button>

          {/* Indirizzo */}
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-xs font-semibold text-amber-600 mb-2">📍 INDIRIZZO</p>
            <p className="font-bold text-slate-800 text-lg">{order.propertyAddress}</p>
            <p className="text-sm text-slate-500">{order.propertyPostalCode} {order.propertyCity}</p>
            
            {/* Info aggiuntive */}
            {(floor || apartment || intercom) && (
              <div className="flex flex-wrap gap-2 mt-3">
                {floor && (
                  <span className="px-3 py-1.5 bg-white rounded-xl text-sm text-slate-700 font-medium shadow-sm">
                    🏢 Piano {floor}
                  </span>
                )}
                {apartment && (
                  <span className="px-3 py-1.5 bg-white rounded-xl text-sm text-slate-700 font-medium shadow-sm">
                    🚪 Int. {apartment}
                  </span>
                )}
                {intercom && (
                  <span className="px-3 py-1.5 bg-white rounded-xl text-sm text-slate-700 font-medium shadow-sm">
                    🔔 {intercom}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Foto Portone e Porta - PRIMA DEL CODICE */}
          {(buildingImage || doorImage) && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-amber-600">📷 FOTO ACCESSO <span className="text-slate-400 font-normal">(tocca per ingrandire)</span></p>
              <div className="grid grid-cols-2 gap-3">
                {buildingImage && (
                  <button 
                    onClick={() => setSelectedImage({url: buildingImage, title: "Portone / Edificio"})}
                    className="space-y-1 text-left active:scale-95 transition-transform"
                  >
                    <p className="text-xs text-slate-500 text-center">Portone/Edificio</p>
                    <img 
                      src={buildingImage} 
                      alt="Portone" 
                      className="w-full h-32 object-cover rounded-xl border-2 border-slate-200 hover:border-amber-400 transition-colors"
                    />
                  </button>
                )}
                {doorImage && (
                  <button 
                    onClick={() => setSelectedImage({url: doorImage, title: "Porta di casa"})}
                    className="space-y-1 text-left active:scale-95 transition-transform"
                  >
                    <p className="text-xs text-slate-500 text-center">Porta di casa</p>
                    <img 
                      src={doorImage} 
                      alt="Porta" 
                      className="w-full h-32 object-cover rounded-xl border-2 border-slate-200 hover:border-amber-400 transition-colors"
                    />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Codice Porta */}
          {doorCode && (
            <button
              onClick={() => copyToClipboard(doorCode, 'code')}
              className={`w-full p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                copied === 'code' 
                  ? 'bg-emerald-100 border-emerald-400' 
                  : 'bg-white border-amber-200 hover:border-amber-400'
              }`}
            >
              <p className="text-xs font-semibold text-amber-600 mb-2">🚪 CODICE PORTA</p>
              <p className="text-4xl font-black text-slate-800 tracking-widest font-mono">{doorCode}</p>
              <p className="text-xs text-slate-400 mt-2">
                {copied === 'code' ? '✓ Copiato negli appunti!' : 'Tocca per copiare'}
              </p>
            </button>
          )}

          {/* Chiavi */}
          {keysLocation && (
            <button
              onClick={() => copyToClipboard(keysLocation, 'keys')}
              className={`w-full p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                copied === 'keys' 
                  ? 'bg-emerald-100 border-emerald-400' 
                  : 'bg-white border-amber-200 hover:border-amber-400'
              }`}
            >
              <p className="text-xs font-semibold text-amber-600 mb-2">🔑 POSIZIONE CHIAVI</p>
              <p className="font-semibold text-slate-800 text-lg">{keysLocation}</p>
              <p className="text-xs text-slate-400 mt-1">
                {copied === 'keys' ? '✓ Copiato!' : 'Tocca per copiare'}
              </p>
            </button>
          )}

          {/* Note Accesso */}
          {accessNotes && (
            <div className="bg-amber-50 rounded-2xl p-4 border-2 border-amber-200">
              <p className="text-xs font-semibold text-amber-600 mb-2">📝 ISTRUZIONI ACCESSO</p>
              <p className="text-slate-700 leading-relaxed">{accessNotes}</p>
            </div>
          )}

          {/* Nessuna info disponibile */}
          {!doorCode && !keysLocation && !accessNotes && !floor && !apartment && !intercom && !doorImage && !buildingImage && (
            <div className="bg-slate-50 rounded-2xl p-6 text-center">
              <span className="text-3xl mb-2 block">ℹ️</span>
              <p className="text-slate-500">Nessuna informazione di accesso disponibile per questa proprietà.</p>
            </div>
          )}
        </div>
        
        {/* Bottone Chiudi fisso in basso */}
        <div className="p-4 border-t border-slate-200 bg-white">
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 active:scale-[0.98] transition-all"
          >
            Chiudi
          </button>
        </div>
      </div>
      
      <style>{`
        @keyframes modalSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function RiderDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  
  // Screen state
  const [screen, setScreen] = useState<Screen>("home");
  const [homeTab, setHomeTab] = useState<HomeTab>("attivi");
  const [preparingOrder, setPreparingOrder] = useState<Order | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  
  // Modal state
  const [confirmAddOrder, setConfirmAddOrder] = useState<Order | null>(null);
  const [showDepartureModal, setShowDepartureModal] = useState(false);
  const [departingCount, setDepartingCount] = useState(0);
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<Order | null>(null);
  const [confirmPickupOrder, setConfirmPickupOrder] = useState<Order | null>(null); // NUOVO: modal ritiro
  const [accessOrder, setAccessOrder] = useState<Order | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const today = new Date();

  // Logout handler
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Errore logout:", error);
      setLoggingOut(false);
    }
  };

  // 🔥 State per dati di supporto (proprietà e pulizie)
  const [propertiesMap, setPropertiesMap] = useState<Map<string, any>>(new Map());
  const [cleaningsMap, setCleaningsMap] = useState<Map<string, CleaningData>>(new Map());

  // 🔥 REALTIME - Listener per proprietà
  useEffect(() => {
    const unsubProperties = onSnapshot(collection(db, "properties"), (snapshot) => {
      const newMap = new Map<string, any>();
      snapshot.docs.forEach(doc => {
        newMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
      setPropertiesMap(newMap);
      console.log("🏠 Proprietà aggiornate:", newMap.size);
    });

    return () => unsubProperties();
  }, []);

  // 🔥 REALTIME - Listener per pulizie
  useEffect(() => {
    const unsubCleanings = onSnapshot(collection(db, "cleanings"), (snapshot) => {
      const newMap = new Map<string, CleaningData>();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        newMap.set(doc.id, {
          id: doc.id,
          scheduledTime: data.scheduledTime || "10:00",
          status: data.status || "SCHEDULED",
          operatorName: data.operatorName || data.operators?.[0]?.name || undefined,
        });
      });
      setCleaningsMap(newMap);
      console.log("🧹 Pulizie aggiornate:", newMap.size);
    });

    return () => unsubCleanings();
  }, []);

  // 🔥 REALTIME - Listener per ordini (dipende da properties e cleanings)
  useEffect(() => {
    if (!user) return;

    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      const orders = snapshot.docs.map(doc => {
        const data = doc.data();
        const property = propertiesMap.get(data.propertyId);
        const cleaning = data.cleaningId ? cleaningsMap.get(data.cleaningId) : undefined;
        
        // Calcola ora per ordinamento
        // Priorità: ora pulizia > ora ordine > 23:59 (in fondo)
        const sortTime = cleaning?.scheduledTime || data.scheduledTime || "23:59";
        
        return { 
          id: doc.id, 
          ...data,
          // Prendi i dati di accesso dalla proprietà se non sono sull'ordine
          propertyDoorCode: data.propertyDoorCode || property?.doorCode || "",
          propertyKeysLocation: data.propertyKeysLocation || property?.keysLocation || "",
          propertyAccessNotes: data.propertyAccessNotes || property?.accessNotes || "",
          propertyFloor: data.propertyFloor || property?.floor || "",
          propertyApartment: data.propertyApartment || property?.apartment || "",
          propertyIntercom: data.propertyIntercom || property?.intercom || "",
          propertyPostalCode: data.propertyPostalCode || property?.postalCode || "",
          propertyCity: data.propertyCity || property?.city || "",
          propertyAddress: data.propertyAddress || property?.address || "",
          propertyName: data.propertyName || property?.name || "Proprietà",
          propertyImages: data.propertyImages || property?.images || null,
          // Nuovi campi
          urgency: data.urgency || "normal",
          scheduledTime: data.scheduledTime,
          cleaningId: data.cleaningId,
          cleaning: cleaning,
          sortTime: sortTime,
          // Campi ritiro
          includePickup: data.includePickup !== false, // Default true
          pickupItems: data.pickupItems || [],
          pickupCompleted: data.pickupCompleted || false,
        } as Order;
      });
      
      // Debug urgency
      console.log("🚨 Ordini con urgency:", orders.map(o => ({ id: o.id, name: o.propertyName, urgency: o.urgency })));

      // Filtra ordini rilevanti per questo rider:
      // - PENDING/ASSIGNED senza riderId (disponibili per tutti)
      // - Qualsiasi ordine con riderId = questo rider
      const filtered = orders.filter(o => {
        // Ordini disponibili (senza rider assegnato)
        if ((o.status === "PENDING" || o.status === "ASSIGNED") && (!o.riderId || o.riderId === "")) {
          return true;
        }
        // Ordini assegnati a me (qualsiasi stato)
        if (o.riderId === user?.id) {
          return true;
        }
        return false;
      });

      // 🔄 ORDINAMENTO:
      // 1. URGENTI prima
      // 2. Per ora (pulizia o consegna)
      filtered.sort((a, b) => {
        // Prima per urgenza
        const aUrgent = a.urgency === 'urgent' ? 0 : 1;
        const bUrgent = b.urgency === 'urgent' ? 0 : 1;
        if (aUrgent !== bUrgent) return aUrgent - bUrgent;
        
        // Poi per ora
        const aTime = a.sortTime || "23:59";
        const bTime = b.sortTime || "23:59";
        return aTime.localeCompare(bTime);
      });

      console.log("📦 Ordini aggiornati:", filtered.length, "- Urgenti:", filtered.filter(o => o.urgency === 'urgent').length);
      setAllOrders(filtered);
      setLoading(false);
    });

    return () => unsubOrders();
  }, [user, propertiesMap, cleaningsMap]); // 🔑 Dipende anche da properties e cleanings!

  // ═══════════════════════════════════════════════════════════════
  // COMPUTED: Categorie di ordini basate su stato Firebase
  // ═══════════════════════════════════════════════════════════════
  
  // Ordini disponibili da preparare (PENDING/ASSIGNED senza rider)
  const availableOrders = allOrders.filter(o => 
    (o.status === "PENDING" || o.status === "ASSIGNED") && 
    (!o.riderId || o.riderId === "")
  );
  
  // Ordini nel mio carico (PICKING - li sto preparando)
  const myPickingOrders = allOrders.filter(o => 
    o.riderId === user?.id && o.status === "PICKING"
  );
  
  // Ordini in consegna (IN_TRANSIT)
  const myInTransitOrders = allOrders.filter(o => 
    o.riderId === user?.id && o.status === "IN_TRANSIT"
  );
  
  // Ordini consegnati oggi (DELIVERED)
  const myDeliveredOrders = allOrders.filter(o => {
    if (o.riderId !== user?.id || o.status !== "DELIVERED") return false;
    // Solo di oggi
    const deliveredDate = o.deliveredAt?.toDate?.() || o.createdAt?.toDate?.();
    if (!deliveredDate) return true;
    const isToday = deliveredDate.toDateString() === today.toDateString();
    return isToday;
  });

  // ═══════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════
  
  const handleAddClick = (order: Order) => {
    setConfirmAddOrder(order);
  };

  const handleConfirmAdd = async () => {
    if (!confirmAddOrder) return;
    
    try {
      await updateDoc(doc(db, "orders", confirmAddOrder.id), {
        status: "PICKING",
        riderId: user?.id,
        startedAt: Timestamp.now(),
      });
    } catch (e) {
      console.error("Errore:", e);
    }
    
    setPreparingOrder(confirmAddOrder);
    setCheckedItems({});
    setConfirmAddOrder(null);
    setScreen("prepare");
  };

  const toggleItem = (itemId: string) => {
    setCheckedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleCompletePrepare = () => {
    // L'ordine è già PICKING in Firebase, torna semplicemente alla home
    setPreparingOrder(null);
    setCheckedItems({});
    setScreen("home");
  };

  const handleCancelPrepare = async () => {
    // Rimetti l'ordine in PENDING se annulli
    if (preparingOrder) {
      try {
        await updateDoc(doc(db, "orders", preparingOrder.id), {
          status: "PENDING",
          riderId: "",
        });
      } catch (e) {
        console.error("Errore:", e);
      }
    }
    setPreparingOrder(null);
    setCheckedItems({});
    setScreen("home");
  };

  const handleRemoveFromBag = async (orderId: string) => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: "PENDING",
        riderId: "",
      });
    } catch (e) {
      console.error("Errore:", e);
    }
  };

  const handleDepart = async () => {
    // Salva il count PRIMA di aggiornare gli ordini
    const countToDeliver = myPickingOrders.length;
    setDepartingCount(countToDeliver);
    
    // Aggiorna tutti gli ordini PICKING a IN_TRANSIT
    for (const order of myPickingOrders) {
      try {
        await updateDoc(doc(db, "orders", order.id), {
          status: "IN_TRANSIT",
          departedAt: Timestamp.now(),
        });
      } catch (e) {
        console.error("Errore:", e);
      }
    }
    setShowDepartureModal(true);
  };

  const handleDepartureComplete = useCallback(() => {
    setShowDepartureModal(false);
    setScreen("delivering");
  }, []);

  const handleDeliveryClick = (order: Order) => {
    setConfirmDeliveryOrder(order);
  };

  const handleConfirmDelivery = async () => {
    if (!confirmDeliveryOrder) return;
    
    // Se c'è ritiro da fare, mostra la modal di ritiro
    if (confirmDeliveryOrder.includePickup && confirmDeliveryOrder.pickupItems && confirmDeliveryOrder.pickupItems.length > 0) {
      setConfirmPickupOrder(confirmDeliveryOrder);
      setConfirmDeliveryOrder(null);
      return;
    }
    
    // Altrimenti completa direttamente la consegna
    await completeDelivery(confirmDeliveryOrder.id, false, [], "");
    setConfirmDeliveryOrder(null);
  };

  // Gestisce la conferma del ritiro
  const handleConfirmPickup = async (pickupStatus: PickupItemStatus[], generalNote: string) => {
    if (!confirmPickupOrder) return;
    
    const hasIssues = pickupStatus.some(s => s.status !== 'ok');
    
    await completeDelivery(
      confirmPickupOrder.id, 
      true, 
      pickupStatus, 
      generalNote,
      confirmPickupOrder.pickupItems || []
    );
    
    setConfirmPickupOrder(null);
  };

  // Funzione unificata per completare la consegna
  const completeDelivery = async (
    orderId: string, 
    withPickup: boolean, 
    pickupStatus: PickupItemStatus[], 
    pickupNote: string,
    expectedPickupItems?: OrderItem[]
  ) => {
    try {
      const updateData: any = {
        status: "DELIVERED",
        deliveredAt: Timestamp.now(),
      };
      
      // Se c'era ritiro, aggiungi i dati
      if (withPickup) {
        updateData.pickupCompleted = true;
        updateData.pickupStatus = pickupStatus;
        updateData.pickupNote = pickupNote;
        updateData.pickupCompletedAt = Timestamp.now();
        
        // Segnala se ci sono problemi
        const hasIssues = pickupStatus.some(s => s.status !== 'ok');
        if (hasIssues) {
          updateData.pickupHasIssues = true;
        }
      }
      
      await updateDoc(doc(db, "orders", orderId), updateData);
      
      // Se era l'ultimo, mostra confetti
      if (myInTransitOrders.length === 1) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }
    } catch (e) {
      console.error("Errore:", e);
    }
  };

  const openMaps = (order: Order) => {
    const address = `${order.propertyAddress || ''}, ${order.propertyPostalCode || ''} ${order.propertyCity || ''}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  // Check articoli per preparazione
  const allItemsChecked = preparingOrder?.items?.every(item => checkedItems[item.id]) ?? false;
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  // ═══════════════════════════════════════════════════════════════
  // RENDER: PREPARA SACCO
  // ═══════════════════════════════════════════════════════════════
  if (screen === "prepare" && preparingOrder) {
    const progress = (checkedCount / (preparingOrder.items?.length || 1)) * 100;
    
    return (
      <div className="h-screen bg-amber-50 flex flex-col overflow-hidden">
        {/* Header - fisso */}
        <div className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-6 rounded-b-3xl shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <button 
              onClick={handleCancelPrepare}
              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center active:scale-95"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold">📦 Prepara Sacco</h1>
              <p className="text-white/80 text-sm">{preparingOrder.propertyName}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex-1 h-3 bg-white/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm font-bold bg-white/20 px-3 py-1 rounded-full">
              {checkedCount}/{preparingOrder.items?.length || 0}
            </span>
          </div>
        </div>

        {/* Content scrollabile */}
        <main className="flex-1 overflow-y-auto overscroll-none" style={{ paddingBottom: '120px' }}>
            {/* Destination preview */}
            <div className="mx-4 -mt-4 bg-white rounded-2xl shadow-lg p-4 border border-amber-100 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-2xl">
                  🏠
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-500">DESTINAZIONE</p>
                  <p className="font-bold text-slate-800">{preparingOrder.propertyAddress}</p>
                  <p className="text-sm text-slate-500">{preparingOrder.propertyCity}</p>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="px-4 space-y-3">
              {/* 🛏️ SEZIONE BIANCHERIA */}
              {(() => {
                const linenItems = preparingOrder.items?.filter((item: any) => 
                  !item.type || item.type === 'linen'
                ) || [];
                const productItems = preparingOrder.items?.filter((item: any) => 
                  item.type === 'cleaning_product'
                ) || [];
                
                return (
                  <>
                    {linenItems.length > 0 && (
                      <>
                        <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                          🛏️ Biancheria
                        </h2>
                        {linenItems.map((item: any, idx: number) => (
                          <div
                            key={item.id || `linen-${idx}`}
                            onClick={() => toggleItem(item.id || `linen-${idx}`)}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all active:scale-[0.98] ${
                              checkedItems[item.id || `linen-${idx}`]
                                ? 'bg-emerald-50 border-emerald-400 shadow-lg shadow-emerald-500/10'
                                : 'bg-white border-slate-200 hover:border-amber-300'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                checkedItems[item.id || `linen-${idx}`]
                                  ? 'bg-emerald-500 text-white scale-110'
                                  : 'bg-sky-100 text-sky-600'
                              }`}>
                                {checkedItems[item.id || `linen-${idx}`] ? (
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <span className="text-lg">🛏️</span>
                                )}
                              </div>
                              <span className={`flex-1 font-semibold ${
                                checkedItems[item.id || `linen-${idx}`] ? 'text-emerald-700 line-through' : 'text-slate-800'
                              }`}>
                                {item.name}
                              </span>
                              <span className={`px-4 py-2 rounded-xl font-bold text-lg ${
                                checkedItems[item.id || `linen-${idx}`]
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-sky-100 text-sky-700'
                              }`}>
                                x{item.quantity}
                              </span>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {/* 🧴 SEZIONE PRODOTTI PULIZIA */}
                    {productItems.length > 0 && (
                      <>
                        <h2 className="font-semibold text-slate-700 flex items-center gap-2 mt-4">
                          🧴 Prodotti Pulizia
                        </h2>
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-2 mb-2">
                          <p className="text-xs text-rose-600 text-center">
                            ⚠️ Richiesti dall'operatore per questa proprietà
                          </p>
                        </div>
                        {productItems.map((item: any, idx: number) => (
                          <div
                            key={item.id || `product-${idx}`}
                            onClick={() => toggleItem(item.id || `product-${idx}`)}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all active:scale-[0.98] ${
                              checkedItems[item.id || `product-${idx}`]
                                ? 'bg-emerald-50 border-emerald-400 shadow-lg shadow-emerald-500/10'
                                : 'bg-white border-rose-200 hover:border-rose-300'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                checkedItems[item.id || `product-${idx}`]
                                  ? 'bg-emerald-500 text-white scale-110'
                                  : 'bg-rose-100 text-rose-600'
                              }`}>
                                {checkedItems[item.id || `product-${idx}`] ? (
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <span className="text-lg">🧴</span>
                                )}
                              </div>
                              <span className={`flex-1 font-semibold ${
                                checkedItems[item.id || `product-${idx}`] ? 'text-emerald-700 line-through' : 'text-slate-800'
                              }`}>
                                {item.name}
                              </span>
                              <span className={`px-4 py-2 rounded-xl font-bold text-lg ${
                                checkedItems[item.id || `product-${idx}`]
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}>
                                x{item.quantity}
                              </span>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </main>

          {/* Bottom button - fisso */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-lg border-t border-slate-200 z-50" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button
              onClick={handleCompletePrepare}
              disabled={!allItemsChecked}
              className={`w-full py-5 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] ${
                allItemsChecked
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              {allItemsChecked ? '✅ Fatto - Aggiungi al Carico' : `Spunta tutti (${checkedCount}/${preparingOrder.items?.length || 0})`}
            </button>
          </div>
        </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: IN CONSEGNA
  // ═══════════════════════════════════════════════════════════════
  if (screen === "delivering") {
    const deliveredCount = myDeliveredOrders.length;
    const totalDeliveries = myInTransitOrders.length + deliveredCount;

    return (
      <div className="h-screen bg-blue-50 flex flex-col overflow-hidden">
        <Confetti active={showConfetti} />
        
        <ConfirmDeliveryModal 
            order={confirmDeliveryOrder}
            onConfirm={handleConfirmDelivery}
            onCancel={() => setConfirmDeliveryOrder(null)}
          />
          
        <PickupConfirmModal 
            order={confirmPickupOrder}
            onConfirm={handleConfirmPickup}
            onCancel={() => setConfirmPickupOrder(null)}
          />
          
          <AccessModal 
            order={accessOrder}
            onClose={() => setAccessOrder(null)}
          />

          {/* Header - fisso */}
          <div className="flex-shrink-0 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-6 rounded-b-3xl shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <button 
                onClick={() => setScreen("home")}
                className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center active:scale-95"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="text-right bg-white/20 rounded-xl px-4 py-2">
                <p className="text-xs text-white/70">Completate</p>
                <p className="text-xl font-bold">{deliveredCount}/{totalDeliveries}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                <span className="text-3xl animate-bounce">🛵</span>
              </div>
              <div>
                <h1 className="text-xl font-bold">In Consegna</h1>
                <p className="text-white/80">{myInTransitOrders.length} consegne rimanenti</p>
              </div>
            </div>
          </div>

          {/* Content scrollabile */}
          <main className="flex-1 overflow-y-auto overscroll-none pb-32">
            {/* Consegne rimanenti */}
            {myInTransitOrders.length === 0 ? (
              <div className="p-4">
                <div className="bg-emerald-50 rounded-2xl p-8 text-center border-2 border-emerald-200">
                  <span className="text-5xl mb-4 block">🎉</span>
                  <h2 className="text-xl font-bold text-emerald-800 mb-2">Tutte le consegne completate!</h2>
                  <p className="text-emerald-600 mb-4">Ottimo lavoro!</p>
                  <button
                    onClick={() => setScreen("home")}
                    className="px-6 py-3 bg-emerald-500 text-white font-bold rounded-xl"
                  >
                    Torna alla Home
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {myInTransitOrders.map(order => (
                  <div 
                    key={order.id}
                    className={`bg-white rounded-2xl border-2 shadow-lg overflow-hidden ${
                      order.urgency === 'urgent' ? 'border-red-300' : 'border-emerald-200'
                    }`}
                  >
                    {/* Badge Urgenza */}
                    {order.urgency === 'urgent' ? (
                      <div className="bg-gradient-to-r from-red-500 to-rose-500 px-4 py-2 flex items-center gap-2">
                        <span className="text-white text-lg">🚨</span>
                        <span className="text-white text-sm font-bold">CONSEGNA URGENTE</span>
                      </div>
                    ) : (
                      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 flex items-center gap-2">
                        <span className="text-white text-lg">📦</span>
                        <span className="text-white text-sm font-bold">CONSEGNA NORMALE</span>
                      </div>
                    )}
                    
                    <div className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                          order.urgency === 'urgent' 
                            ? 'bg-gradient-to-br from-red-100 to-rose-100' 
                            : 'bg-gradient-to-br from-emerald-100 to-teal-100'
                        }`}>
                          📦
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-slate-800">{order.propertyName}</h3>
                          <p className="text-sm text-slate-500">{order.propertyAddress}</p>
                          <p className="text-xs text-slate-400">
                            {order.propertyFloor && `Piano ${order.propertyFloor}`}
                            {order.propertyApartment && ` • Int. ${order.propertyApartment}`}
                            {` • ${order.items?.length || 0} articoli`}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => openMaps(order)}
                          className="flex-1 py-3 bg-white border-2 border-slate-200 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all"
                        >
                          <svg viewBox="0 0 92.3 132.3" className="h-5 w-auto">
                            <path fill="#1a73e8" d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z"/>
                            <path fill="#ea4335" d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z"/>
                            <path fill="#4285f4" d="M46.1 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4 0 0 13.9-16.6 27.5-32.7-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-3.8 8.1-6.3 13.5-6.3"/>
                            <path fill="#fbbc04" d="M46.1 63.5c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.6-8.3 4.2-11.4L4.6 68.1C7.4 74.8 12 82.2 19 91.2l31.6-37.7c-1.4.5-2.9.8-4.5.8"/>
                            <path fill="#34a853" d="M59.2 83.9c9.6-14.7 15.1-24.6 19.9-35.9-5.6-10.8-15.3-19-27-22.7L19 91.2c7.4 9.5 17.5 22.5 23.4 34.8 1.2 2.5 2.3 5 3.4 7.3l13.4-49.4"/>
                          </svg>
                          <span className="font-semibold text-slate-600">Maps</span>
                        </button>
                        <button 
                          onClick={() => setAccessOrder(order)}
                          className="flex-1 py-3 bg-amber-50 text-amber-700 font-semibold rounded-xl hover:bg-amber-100 active:scale-95 transition-all"
                        >
                          🔐 Accesso
                        </button>
                        <button 
                          onClick={() => handleDeliveryClick(order)}
                          className="flex-1 py-3 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 active:scale-95 transition-all"
                        >
                          ✅ Fatto
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: HOME
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Modals */}
        <ConfirmAddModal 
          order={confirmAddOrder}
          onConfirm={handleConfirmAdd}
          onCancel={() => setConfirmAddOrder(null)}
        />
        <DepartureModal 
          show={showDepartureModal}
          onComplete={handleDepartureComplete}
          count={departingCount}
        />
        <AccessModal 
          order={accessOrder}
          onClose={() => setAccessOrder(null)}
        />

        {/* Header - fisso */}
        <div className="flex-shrink-0 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-6 rounded-b-3xl shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl">
                🛵
              </div>
              <div>
                <h1 className="text-xl font-bold">Ciao, {user?.name?.split(" ")[0] || "Rider"}!</h1>
                <p className="text-white/80 text-sm">
                  {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <NotificationBell isAdmin={false} />
              
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 active:scale-95 transition-all disabled:opacity-50"
              >
                {loggingOut ? (
                  <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Content scrollabile */}
        <main className="flex-1 overflow-y-auto overscroll-none pb-32">
          {/* Tab Bar */}
          <div className="px-4 py-3">
            <div className="bg-slate-100 rounded-2xl p-1 flex">
              <button
                onClick={() => setHomeTab("attivi")}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                  homeTab === "attivi" 
                ? "bg-white text-slate-800 shadow-md" 
                : "text-slate-500"
            }`}
          >
            🚚 Attivi ({myPickingOrders.length + myInTransitOrders.length + availableOrders.length})
          </button>
          <button
            onClick={() => setHomeTab("consegnati")}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
              homeTab === "consegnati" 
                ? "bg-white text-slate-800 shadow-md" 
                : "text-slate-500"
            }`}
          >
            ✅ Consegnati ({myDeliveredOrders.length})
          </button>
        </div>
      </div>

      {/* TAB CONSEGNATI */}
      {homeTab === "consegnati" && (
        <div className="px-4 space-y-4">
          {myDeliveredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <span className="text-4xl mb-2 block">📭</span>
              <p className="text-slate-500">Nessuna consegna completata oggi</p>
            </div>
          ) : (
            myDeliveredOrders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-emerald-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-2xl">
                    ✅
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800">{order.propertyName}</h3>
                    <p className="text-sm text-slate-500">{order.propertyAddress}</p>
                    <p className="text-xs text-emerald-600 mt-1">
                      Consegnato alle {order.deliveredAt?.toDate?.().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) || "—"}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                    Completato
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB ATTIVI */}
      {homeTab === "attivi" && (
        <div className="px-4 space-y-6">
          
          {/* BANNER: Hai ordini in consegna */}
          {myInTransitOrders.length > 0 && (
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-4 text-white shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl animate-bounce">🛵</span>
                  <div>
                    <p className="font-bold">{myInTransitOrders.length} consegne in corso</p>
                    <p className="text-blue-100 text-sm">Tocca per vedere i dettagli</p>
                  </div>
                </div>
                <button
                  onClick={() => setScreen("delivering")}
                  className="px-4 py-2 bg-white text-blue-600 font-bold rounded-xl"
                >
                  Vai →
                </button>
              </div>
            </div>
          )}

          {/* IL TUO CARICO */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                🎒 Il tuo carico
              </h2>
              {myPickingOrders.length > 0 && (
                <span className="text-xs font-bold text-white bg-emerald-500 px-2.5 py-1 rounded-full">
                  {myPickingOrders.length} {myPickingOrders.length === 1 ? 'sacco' : 'sacchi'}
                </span>
              )}
            </div>
            
            {myPickingOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">📦</span>
                </div>
                <p className="font-semibold text-slate-600">Nessun sacco pronto</p>
                <p className="text-sm text-slate-400 mt-1">Seleziona un ordine dalla lista sotto 👇</p>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border-2 border-emerald-300 overflow-hidden">
                <div className="divide-y divide-emerald-200">
                  {myPickingOrders.map(bag => (
                    <div key={bag.id} className="flex items-center justify-between p-4 bg-white/50">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📦</span>
                        <div>
                          <p className="font-semibold text-slate-800">{bag.propertyName}</p>
                          <p className="text-xs text-slate-500">{bag.propertyAddress} • {bag.items?.length} art.</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleRemoveFromBag(bag.id)}
                        className="w-8 h-8 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-sm font-bold hover:bg-red-200 active:scale-95 transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className="p-4 bg-emerald-100/50">
                  <button
                    onClick={handleDepart}
                    className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-lg rounded-xl shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    🛵 CARICA E PARTI
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ORDINI DISPONIBILI */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                📋 Ordini da Preparare
              </h2>
              <span className="text-xs text-slate-400">{availableOrders.length} ordini</span>
            </div>

            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-500">Caricamento...</p>
              </div>
            ) : availableOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <span className="text-4xl">✅</span>
                <p className="text-slate-500 mt-2">Nessun ordine disponibile</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableOrders.map(order => (
                  <div 
                    key={order.id} 
                    className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${
                      order.urgency === 'urgent' 
                        ? 'border-red-300 ring-2 ring-red-100' 
                        : 'border-emerald-200'
                    }`}
                  >
                    {/* Badge Urgenza */}
                    {order.urgency === 'urgent' ? (
                      <div className="bg-gradient-to-r from-red-500 to-rose-500 px-4 py-2 flex items-center gap-2">
                        <span className="text-white text-lg">🚨</span>
                        <span className="text-white text-sm font-bold">CONSEGNA URGENTE</span>
                      </div>
                    ) : (
                      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 flex items-center gap-2">
                        <span className="text-white text-lg">📦</span>
                        <span className="text-white text-sm font-bold">CONSEGNA NORMALE</span>
                      </div>
                    )}
                    
                    <div className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                          order.urgency === 'urgent' 
                            ? 'bg-gradient-to-br from-red-100 to-rose-100' 
                            : 'bg-gradient-to-br from-emerald-100 to-teal-100'
                        }`}>
                          🏠
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-slate-800">{order.propertyName || "Proprietà"}</h3>
                          <p className="text-sm text-slate-500">{order.propertyAddress}, {order.propertyCity}</p>
                          <p className="text-xs text-slate-400">{order.items?.length || 0} articoli</p>
                        </div>
                      </div>
                      
                      {/* Stato Pulizia / Ora Consegna */}
                      <div className={`rounded-xl p-3 mb-3 ${
                        order.cleaning 
                          ? 'bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200' 
                          : 'bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200'
                      }`}>
                        {order.cleaning ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">🧹</span>
                              <span className="text-sm font-semibold text-slate-700">
                                Pulizia: {order.cleaning.scheduledTime}
                              </span>
                            </div>
                            <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                              order.cleaning.status === 'SCHEDULED' 
                                ? 'bg-amber-100 text-amber-700' 
                              : order.cleaning.status === 'IN_PROGRESS' 
                                ? 'bg-green-100 text-green-700' 
                              : order.cleaning.status === 'COMPLETED' 
                                ? 'bg-slate-200 text-slate-600' 
                              : 'bg-red-100 text-red-700'
                            }`}>
                              {order.cleaning.status === 'SCHEDULED' && '🟡 Non iniziata'}
                              {order.cleaning.status === 'IN_PROGRESS' && '🟢 In corso'}
                              {order.cleaning.status === 'COMPLETED' && '✅ Completata'}
                              {order.cleaning.status === 'CANCELLED' && '❌ Annullata'}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🛏️</span>
                            <span className="text-sm font-semibold text-sky-700">
                              Solo Biancheria
                            </span>
                            {order.scheduledTime && (
                              <span className="text-xs text-sky-600 ml-auto">
                                Consegna: {order.scheduledTime}
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Avviso se pulizia completata ma non consegnato */}
                        {order.cleaning?.status === 'COMPLETED' && order.status !== 'DELIVERED' && (
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                              <span>⚠️</span> Pulizia già completata - consegna in ritardo
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* 📤 DA PORTARE */}
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-emerald-600 mb-2 flex items-center gap-1">
                          <span>📤</span> DA PORTARE
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {order.items?.slice(0, 3).map((item, idx) => (
                            <span key={idx} className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
                              {item.name} x{item.quantity}
                            </span>
                          ))}
                          {(order.items?.length || 0) > 3 && (
                            <span className="px-2 py-1 bg-emerald-100 rounded-lg text-xs text-emerald-600">
                              +{(order.items?.length || 0) - 3} altri
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 📥 DA RITIRARE */}
                      {order.includePickup && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-orange-600 mb-2 flex items-center gap-1">
                            <span>📥</span> DA RITIRARE
                          </p>
                          {order.pickupItems && order.pickupItems.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {order.pickupItems.slice(0, 3).map((item, idx) => (
                                <span key={idx} className="px-2 py-1 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700">
                                  {item.name} x{item.quantity}
                                </span>
                              ))}
                              {order.pickupItems.length > 3 && (
                                <span className="px-2 py-1 bg-orange-100 rounded-lg text-xs text-orange-600">
                                  +{order.pickupItems.length - 3} altri
                                </span>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic">Nessun ritiro precedente</p>
                          )}
                        </div>
                      )}

                      {/* Nessun ritiro */}
                      {!order.includePickup && (
                        <div className="mb-4">
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <span>📥</span> Nessun ritiro
                          </p>
                        </div>
                      )}

                      <button
                        onClick={() => handleAddClick(order)}
                        className={`w-full py-3 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${
                          order.urgency === 'urgent'
                            ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-red-500/20'
                            : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-orange-500/20'
                        }`}
                      >
                        ➕ Aggiungi al Carico
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
        </main>
      </div>
  );
}
