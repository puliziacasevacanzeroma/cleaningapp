"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, doc, updateDoc, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
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
  notes?: string;
}

type Screen = "home" | "prepare" | "onTheRoad" | "success";

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
        <p className="text-white/80 text-xl">{count} consegne da fare</p>
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
              <p className="text-xs text-emerald-600 font-semibold mb-2">Articoli consegnati:</p>
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
// MODAL INFO ACCESSO
// ═══════════════════════════════════════════════════════════════════════════
function AccessModal({ 
  order, 
  onClose 
}: { 
  order: Order | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

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

  const doorCode = order.propertyDoorCode || order.propertyAccessCode;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div 
        className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'modalSlideUp 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 rounded-t-3xl sm:rounded-t-3xl flex justify-between items-center">
          <div className="flex items-center gap-2 text-white">
            <span className="text-xl">🔐</span>
            <span className="font-bold">Accesso Proprietà</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Google Maps Button */}
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
            <p className="text-xs font-semibold text-amber-600 mb-1">📍 INDIRIZZO</p>
            <p className="font-semibold text-slate-800">{order.propertyAddress}</p>
            <p className="text-sm text-slate-500">{order.propertyPostalCode} {order.propertyCity}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {order.propertyFloor && <span className="px-2 py-1 bg-white rounded-lg text-xs text-slate-600">🏢 Piano {order.propertyFloor}</span>}
              {order.propertyApartment && <span className="px-2 py-1 bg-white rounded-lg text-xs text-slate-600">🚪 Int. {order.propertyApartment}</span>}
              {order.propertyIntercom && <span className="px-2 py-1 bg-white rounded-lg text-xs text-slate-600">🔔 {order.propertyIntercom}</span>}
            </div>
          </div>

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
              <p className="text-xs font-semibold text-amber-600 mb-1">🚪 CODICE PORTA</p>
              <p className="text-3xl font-black text-slate-800 tracking-wider">{doorCode}</p>
              <p className="text-xs text-slate-400 mt-1">
                {copied === 'code' ? '✓ Copiato!' : 'Tap per copiare'}
              </p>
            </button>
          )}

          {/* Chiavi */}
          {order.propertyKeysLocation && (
            <button
              onClick={() => copyToClipboard(order.propertyKeysLocation!, 'keys')}
              className={`w-full p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                copied === 'keys' 
                  ? 'bg-emerald-100 border-emerald-400' 
                  : 'bg-white border-amber-200 hover:border-amber-400'
              }`}
            >
              <p className="text-xs font-semibold text-amber-600 mb-1">🔑 POSIZIONE CHIAVI</p>
              <p className="font-semibold text-slate-800">{order.propertyKeysLocation}</p>
            </button>
          )}

          {/* Note */}
          {order.propertyAccessNotes && (
            <div className="bg-white rounded-2xl p-4 border-2 border-amber-200">
              <p className="text-xs font-semibold text-amber-600 mb-2">📝 ISTRUZIONI</p>
              <p className="text-slate-700">{order.propertyAccessNotes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function RiderDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Screen state
  const [screen, setScreen] = useState<Screen>("home");
  const [myBags, setMyBags] = useState<Order[]>([]);
  const [preparingOrder, setPreparingOrder] = useState<Order | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [delivered, setDelivered] = useState<Record<string, boolean>>({});
  
  // Modal state
  const [confirmAddOrder, setConfirmAddOrder] = useState<Order | null>(null);
  const [showDepartureModal, setShowDepartureModal] = useState(false);
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<Order | null>(null);
  const [accessOrder, setAccessOrder] = useState<Order | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const today = new Date();

  // 🔥 REALTIME
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(collection(db, "orders"), (snapshot) => {
      let allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      const filtered = allOrders.filter(o => {
        if (o.status === "DELIVERED" || o.status === "COMPLETED") return false;
        if (!o.riderId || o.riderId === "") return true;
        if (o.riderId === user?.id) return true;
        return false;
      });

      filtered.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      setOrders(filtered);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  // Ordini disponibili
  const availableOrders = orders.filter(o => 
    !myBags.find(b => b.id === o.id) && 
    (o.status === "PENDING" || o.status === "ASSIGNED")
  );

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
    if (!preparingOrder) return;
    setMyBags(prev => [...prev, preparingOrder]);
    setPreparingOrder(null);
    setCheckedItems({});
    setScreen("home");
  };

  const handleCancelPrepare = () => {
    setPreparingOrder(null);
    setCheckedItems({});
    setScreen("home");
  };

  const handleRemoveFromBag = (orderId: string) => {
    setMyBags(prev => prev.filter(b => b.id !== orderId));
  };

  const handleDepart = async () => {
    for (const bag of myBags) {
      try {
        await updateDoc(doc(db, "orders", bag.id), {
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
    setScreen("onTheRoad");
  }, []);

  const handleDeliveryClick = (order: Order) => {
    setConfirmDeliveryOrder(order);
  };

  const handleConfirmDelivery = async () => {
    if (!confirmDeliveryOrder) return;
    
    try {
      await updateDoc(doc(db, "orders", confirmDeliveryOrder.id), {
        status: "DELIVERED",
        deliveredAt: Timestamp.now(),
      });
    } catch (e) {
      console.error("Errore:", e);
    }
    
    setDelivered(prev => ({ ...prev, [confirmDeliveryOrder.id]: true }));
    setConfirmDeliveryOrder(null);
    
    const remaining = myBags.filter(b => !delivered[b.id] && b.id !== confirmDeliveryOrder.id);
    if (remaining.length === 0) {
      setShowConfetti(true);
      setTimeout(() => setScreen("success"), 500);
    }
  };

  const openMaps = (order: Order) => {
    const address = `${order.propertyAddress || ''}, ${order.propertyPostalCode || ''} ${order.propertyCity || ''}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const handleReset = () => {
    setMyBags([]);
    setDelivered({});
    setShowConfetti(false);
    setScreen("home");
  };

  const allItemsChecked = preparingOrder?.items?.every(item => checkedItems[item.id]) ?? false;
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  // ═══════════════════════════════════════════════════════════════
  // RENDER: PREPARA SACCO
  // ═══════════════════════════════════════════════════════════════
  if (screen === "prepare" && preparingOrder) {
    const progress = (checkedCount / (preparingOrder.items?.length || 1)) * 100;
    
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white pb-28">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-6 rounded-b-3xl shadow-lg">
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

        {/* Destination preview */}
        <div className="mx-4 -mt-4 bg-white rounded-2xl shadow-lg p-4 border border-amber-100 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-2xl">
              🏠
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-500">PROSSIMA DESTINAZIONE</p>
              <p className="font-bold text-slate-800">{preparingOrder.propertyAddress}</p>
              <p className="text-sm text-slate-500">{preparingOrder.propertyCity}</p>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="px-4 space-y-3">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            📋 Articoli da preparare
          </h2>
          
          {preparingOrder.items?.map((item, idx) => (
            <div
              key={item.id || idx}
              onClick={() => toggleItem(item.id || String(idx))}
              className={`p-4 rounded-2xl border-2 cursor-pointer transition-all active:scale-[0.98] ${
                checkedItems[item.id || idx]
                  ? 'bg-emerald-50 border-emerald-400 shadow-lg shadow-emerald-500/10'
                  : 'bg-white border-slate-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  checkedItems[item.id || idx]
                    ? 'bg-emerald-500 text-white scale-110'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  {checkedItems[item.id || idx] ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-bold">{idx + 1}</span>
                  )}
                </div>
                <span className={`flex-1 font-semibold ${
                  checkedItems[item.id || idx] ? 'text-emerald-700 line-through' : 'text-slate-800'
                }`}>
                  {item.name}
                </span>
                <span className={`px-4 py-2 rounded-xl font-bold text-lg ${
                  checkedItems[item.id || idx]
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  x{item.quantity}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-slate-200">
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
  // RENDER: IN GIRO
  // ═══════════════════════════════════════════════════════════════
  if (screen === "onTheRoad") {
    const remainingBags = myBags.filter(b => !delivered[b.id]);
    const deliveredCount = Object.keys(delivered).length;

    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white pb-8">
        <Confetti active={showConfetti} />
        
        <ConfirmDeliveryModal 
          order={confirmDeliveryOrder}
          onConfirm={handleConfirmDelivery}
          onCancel={() => setConfirmDeliveryOrder(null)}
        />
        <AccessModal 
          order={accessOrder}
          onClose={() => setAccessOrder(null)}
        />

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-6 rounded-b-3xl shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                <span className="text-3xl animate-bounce">🛵</span>
              </div>
              <div>
                <h1 className="text-xl font-bold">In Giro</h1>
                <p className="text-white/80">{remainingBags.length} consegne rimanenti</p>
              </div>
            </div>
            <div className="text-right bg-white/20 rounded-xl px-4 py-2">
              <p className="text-xs text-white/70">Completate</p>
              <p className="text-xl font-bold">{deliveredCount}/{myBags.length}</p>
            </div>
          </div>
        </div>

        {/* Orders */}
        <div className="p-4 space-y-4">
          {myBags.map(order => {
            const isDelivered = delivered[order.id];
            return (
              <div 
                key={order.id}
                className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${
                  isDelivered ? 'border-emerald-300 opacity-60' : 'border-slate-200 shadow-lg'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                      isDelivered ? 'bg-emerald-100' : 'bg-gradient-to-br from-blue-100 to-indigo-100'
                    }`}>
                      {isDelivered ? '✅' : '📦'}
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
                    {isDelivered && (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                        Consegnato
                      </span>
                    )}
                  </div>
                  
                  {!isDelivered && (
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
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: SUCCESS
  // ═══════════════════════════════════════════════════════════════
  if (screen === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-400 to-teal-500 flex items-center justify-center p-4">
        <Confetti active={true} />
        <div className="text-center">
          <div className="text-8xl mb-6">🎉</div>
          <h1 className="text-3xl font-black text-white mb-2">GIRO COMPLETATO!</h1>
          <p className="text-white/80 text-lg mb-8">{myBags.length} consegne effettuate</p>
          <button
            onClick={handleReset}
            className="px-8 py-4 bg-white text-emerald-600 font-bold rounded-2xl shadow-lg active:scale-95 transition-transform"
          >
            🏠 Torna al Magazzino
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: HOME
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-8">
      {/* Modals */}
      <ConfirmAddModal 
        order={confirmAddOrder}
        onConfirm={handleConfirmAdd}
        onCancel={() => setConfirmAddOrder(null)}
      />
      <DepartureModal 
        show={showDepartureModal}
        onComplete={handleDepartureComplete}
        count={myBags.length}
      />

      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-6 rounded-b-3xl shadow-lg">
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
      </div>

      <div className="p-4 space-y-6">
        
        {/* IL TUO CARICO */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              🎒 Il tuo carico
            </h2>
            {myBags.length > 0 && (
              <span className="text-xs font-bold text-white bg-emerald-500 px-2.5 py-1 rounded-full">
                {myBags.length} {myBags.length === 1 ? 'sacco' : 'sacchi'}
              </span>
            )}
          </div>
          
          {myBags.length === 0 ? (
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
                {myBags.map(bag => (
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
              <p className="text-slate-500 mt-2">Tutti gli ordini sono nel tuo carico!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableOrders.map(order => (
                <div key={order.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center text-2xl">
                        🏠
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800">{order.propertyName || "Proprietà"}</h3>
                        <p className="text-sm text-slate-500">{order.propertyAddress}, {order.propertyCity}</p>
                        <p className="text-xs text-slate-400">{order.items?.length || 0} articoli</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {order.items?.slice(0, 3).map((item, idx) => (
                        <span key={idx} className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                          {item.name} x{item.quantity}
                        </span>
                      ))}
                      {(order.items?.length || 0) > 3 && (
                        <span className="px-2 py-1 bg-slate-100 rounded-lg text-xs text-slate-500">
                          +{(order.items?.length || 0) - 3} altri
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleAddClick(order)}
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
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
    </div>
  );
}
