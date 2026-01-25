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
// GOOGLE MAPS LOGO
// ═══════════════════════════════════════════════════════════════════════════
function GoogleMapsLogo({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 92.3 132.3" className={className}>
      <path fill="#1a73e8" d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z"/>
      <path fill="#ea4335" d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z"/>
      <path fill="#4285f4" d="M46.1 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4 0 0 13.9-16.6 27.5-32.7-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-3.8 8.1-6.3 13.5-6.3"/>
      <path fill="#fbbc04" d="M46.1 63.5c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.6-8.3 4.2-11.4L4.6 68.1C7.4 74.8 12 82.2 19 91.2l31.6-37.7c-1.4.5-2.9.8-4.5.8"/>
      <path fill="#34a853" d="M59.2 83.9c9.6-14.7 15.1-24.6 19.9-35.9-5.6-10.8-15.3-19-27-22.7L19 91.2c7.4 9.5 17.5 22.5 23.4 34.8 1.2 2.5 2.3 5 3.4 7.3l13.4-49.4"/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL CONFERMA PREPARAZIONE
// ═══════════════════════════════════════════════════════════════════════════
function ConfirmPrepareModal({ 
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
        className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Preparare questo ordine?</h3>
          <p className="text-slate-500 text-sm mb-4">Dovrai spuntare tutti gli articoli prima di aggiungerlo al carico.</p>
          
          <div className="bg-slate-50 rounded-xl p-4 mb-6">
            <p className="font-semibold text-slate-900">{order.propertyName}</p>
            <p className="text-sm text-slate-500">{order.propertyAddress}, {order.propertyCity}</p>
            <p className="text-xs text-slate-400 mt-2">{order.items?.length || 0} articoli da preparare</p>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={onCancel}
              className="flex-1 py-3 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              Annulla
            </button>
            <button 
              onClick={onConfirm}
              className="flex-1 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all"
            >
              Prepara
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL CONFERMA PARTENZA
// ═══════════════════════════════════════════════════════════════════════════
function ConfirmDepartModal({ 
  bags, 
  onConfirm, 
  onCancel 
}: { 
  bags: Order[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (bags.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div 
        className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Iniziare le consegne?</h3>
          <p className="text-slate-500 text-sm mb-4">Hai {bags.length} {bags.length === 1 ? 'sacco pronto' : 'sacchi pronti'}.</p>
          
          <div className="bg-slate-50 rounded-xl divide-y divide-slate-200 mb-6 max-h-48 overflow-y-auto">
            {bags.map(bag => (
              <div key={bag.id} className="p-3">
                <p className="font-medium text-slate-900 text-sm">{bag.propertyName}</p>
                <p className="text-xs text-slate-500">{bag.propertyAddress}</p>
              </div>
            ))}
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={onCancel}
              className="flex-1 py-3 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              Annulla
            </button>
            <button 
              onClick={onConfirm}
              className="flex-1 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all"
            >
              Parti ora
            </button>
          </div>
        </div>
      </div>
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
        className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Conferma consegna</h3>
          <p className="text-slate-500 text-sm mb-4">Hai consegnato tutti gli articoli?</p>
          
          <div className="bg-slate-50 rounded-xl p-4 mb-6">
            <p className="font-semibold text-slate-900">{order.propertyName}</p>
            <p className="text-sm text-slate-500">{order.propertyAddress}</p>
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs text-slate-400 mb-2">Articoli:</p>
              {order.items?.map((item, idx) => (
                <p key={idx} className="text-sm text-slate-600">{item.name} × {item.quantity}</p>
              ))}
            </div>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={onCancel}
              className="flex-1 py-3 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              Annulla
            </button>
            <button 
              onClick={onConfirm}
              className="flex-1 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all"
            >
              Confermo
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
        className="relative bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Informazioni accesso</h3>
            <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 rounded-lg">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Indirizzo */}
          <div className="mb-4">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Indirizzo</label>
            <p className="text-slate-900 font-medium mt-1">{order.propertyAddress}</p>
            <p className="text-slate-500 text-sm">{order.propertyPostalCode} {order.propertyCity}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {order.propertyFloor && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">Piano {order.propertyFloor}</span>}
              {order.propertyApartment && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">Int. {order.propertyApartment}</span>}
              {order.propertyIntercom && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">Citofono: {order.propertyIntercom}</span>}
            </div>
          </div>
          
          {/* Codice Porta */}
          {doorCode && (
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Codice porta</label>
              <button 
                onClick={() => copyToClipboard(doorCode, 'code')}
                className={`w-full mt-1 p-4 rounded-xl text-left transition-all ${
                  copied === 'code' 
                    ? 'bg-emerald-600' 
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                <span className="text-2xl font-mono font-bold text-white tracking-widest">{doorCode}</span>
                <span className="block text-xs text-slate-400 mt-1">
                  {copied === 'code' ? 'Copiato!' : 'Tocca per copiare'}
                </span>
              </button>
            </div>
          )}
          
          {/* Chiavi */}
          {order.propertyKeysLocation && (
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Posizione chiavi</label>
              <p className="text-slate-900 mt-1 p-3 bg-slate-50 rounded-xl">{order.propertyKeysLocation}</p>
            </div>
          )}
          
          {/* Note */}
          {order.propertyAccessNotes && (
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Note</label>
              <p className="text-slate-700 mt-1 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">{order.propertyAccessNotes}</p>
            </div>
          )}
          
          {/* Google Maps */}
          <button 
            onClick={openMaps}
            className="w-full mt-2 py-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            <GoogleMapsLogo />
            <span className="font-medium text-slate-700">Apri in Google Maps</span>
          </button>
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
  const [confirmPrepareOrder, setConfirmPrepareOrder] = useState<Order | null>(null);
  const [showDepartModal, setShowDepartModal] = useState(false);
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<Order | null>(null);
  const [accessOrder, setAccessOrder] = useState<Order | null>(null);

  const today = new Date();

  // 🔥 REALTIME
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(collection(db, "orders"), (snapshot) => {
      let allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      // Filtra ordini disponibili per questo rider
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

  // Ordini disponibili (non ancora nel carico)
  const availableOrders = orders.filter(o => 
    !myBags.find(b => b.id === o.id) && 
    (o.status === "PENDING" || o.status === "ASSIGNED")
  );

  // ═══════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════
  
  // Click su "Prepara sacco" - mostra modal conferma
  const handlePrepareClick = (order: Order) => {
    setConfirmPrepareOrder(order);
  };

  // Conferma preparazione - vai a schermata prepara
  const handleConfirmPrepare = async () => {
    if (!confirmPrepareOrder) return;
    
    try {
      await updateDoc(doc(db, "orders", confirmPrepareOrder.id), {
        status: "PICKING",
        riderId: user?.id,
        startedAt: Timestamp.now(),
      });
    } catch (e) {
      console.error("Errore:", e);
    }
    
    setPreparingOrder(confirmPrepareOrder);
    setCheckedItems({});
    setConfirmPrepareOrder(null);
    setScreen("prepare");
  };

  // Toggle articolo
  const toggleItem = (itemId: string) => {
    setCheckedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // Completa preparazione sacco
  const handleCompletePrepare = () => {
    if (!preparingOrder) return;
    setMyBags(prev => [...prev, preparingOrder]);
    setPreparingOrder(null);
    setCheckedItems({});
    setScreen("home");
  };

  // Annulla preparazione
  const handleCancelPrepare = () => {
    setPreparingOrder(null);
    setCheckedItems({});
    setScreen("home");
  };

  // Rimuovi dal carico
  const handleRemoveFromBag = (orderId: string) => {
    setMyBags(prev => prev.filter(b => b.id !== orderId));
  };

  // Click su "Parti" - mostra modal conferma
  const handleDepartClick = () => {
    setShowDepartModal(true);
  };

  // Conferma partenza
  const handleConfirmDepart = async () => {
    // Aggiorna tutti gli ordini a IN_TRANSIT
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
    setShowDepartModal(false);
    setScreen("onTheRoad");
  };

  // Click su "Consegnato" - mostra modal conferma
  const handleDeliveryClick = (order: Order) => {
    setConfirmDeliveryOrder(order);
  };

  // Conferma consegna
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
    
    // Check se tutte consegnate
    const remaining = myBags.filter(b => !delivered[b.id] && b.id !== confirmDeliveryOrder.id);
    if (remaining.length === 0) {
      setScreen("success");
    }
  };

  // Apri Google Maps
  const openMaps = (order: Order) => {
    const address = `${order.propertyAddress || ''}, ${order.propertyPostalCode || ''} ${order.propertyCity || ''}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  // Reset tutto
  const handleReset = () => {
    setMyBags([]);
    setDelivered({});
    setScreen("home");
  };

  // Check articoli
  const allItemsChecked = preparingOrder?.items?.every(item => checkedItems[item.id]) ?? false;
  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  // ═══════════════════════════════════════════════════════════════
  // RENDER: PREPARA SACCO
  // ═══════════════════════════════════════════════════════════════
  if (screen === "prepare" && preparingOrder) {
    const progress = (checkedCount / (preparingOrder.items?.length || 1)) * 100;
    
    return (
      <div className="min-h-screen bg-slate-50 pb-28">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleCancelPrepare}
              className="p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1">
              <h1 className="font-semibold text-slate-900">Prepara sacco</h1>
              <p className="text-sm text-slate-500">{preparingOrder.propertyName}</p>
            </div>
            <span className="text-sm font-medium text-slate-900 bg-slate-100 px-3 py-1 rounded-full">
              {checkedCount}/{preparingOrder.items?.length || 0}
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-slate-900 transition-all duration-300 rounded-full" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </header>

        <div className="p-4">
          {/* Destination preview */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Destinazione</p>
            <p className="font-medium text-slate-900">{preparingOrder.propertyAddress}, {preparingOrder.propertyCity}</p>
            <div className="flex gap-2 mt-2">
              {preparingOrder.propertyFloor && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">Piano {preparingOrder.propertyFloor}</span>
              )}
              {preparingOrder.propertyApartment && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">Int. {preparingOrder.propertyApartment}</span>
              )}
            </div>
          </div>

          {/* Items list */}
          <div className="space-y-2">
            {preparingOrder.items?.map((item, idx) => (
              <button
                key={item.id || idx}
                onClick={() => toggleItem(item.id || String(idx))}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  checkedItems[item.id || idx]
                    ? 'bg-emerald-50 border-emerald-500'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    checkedItems[item.id || idx]
                      ? 'bg-emerald-500 border-emerald-500'
                      : 'border-slate-300'
                  }`}>
                    {checkedItems[item.id || idx] && (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`flex-1 font-medium ${checkedItems[item.id || idx] ? 'text-emerald-900' : 'text-slate-900'}`}>
                    {item.name}
                  </span>
                  <span className={`text-sm font-semibold ${checkedItems[item.id || idx] ? 'text-emerald-600' : 'text-slate-500'}`}>
                    ×{item.quantity}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Fixed bottom button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200">
          <button
            onClick={handleCompletePrepare}
            disabled={!allItemsChecked}
            className={`w-full py-4 font-medium rounded-xl transition-all ${
              allItemsChecked
                ? 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {allItemsChecked ? 'Aggiungi al carico' : 'Seleziona tutti gli articoli'}
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
      <div className="min-h-screen bg-slate-50 pb-8">
        {/* Modals */}
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
        <header className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">In corso</p>
              <h1 className="text-lg font-semibold text-slate-900">
                {remainingBags.length} {remainingBags.length === 1 ? 'consegna' : 'consegne'} rimanenti
              </h1>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Completate</p>
              <p className="text-lg font-semibold text-emerald-600">{deliveredCount}/{myBags.length}</p>
            </div>
          </div>
        </header>

        <div className="p-4 space-y-3">
          {myBags.map(order => {
            const isDelivered = delivered[order.id];
            return (
              <div 
                key={order.id}
                className={`bg-white rounded-xl border overflow-hidden transition-all ${
                  isDelivered ? 'border-emerald-200 opacity-60' : 'border-slate-200'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isDelivered ? 'bg-emerald-100' : 'bg-slate-100'
                    }`}>
                      {isDelivered ? (
                        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-900">{order.propertyName}</h3>
                      <p className="text-sm text-slate-500">{order.propertyAddress}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {order.propertyFloor && `Piano ${order.propertyFloor}`}
                        {order.propertyApartment && ` · Int. ${order.propertyApartment}`}
                        {` · ${order.items?.length || 0} articoli`}
                      </p>
                    </div>
                    {isDelivered && (
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                        Consegnato
                      </span>
                    )}
                  </div>
                  
                  {!isDelivered && (
                    <div className="flex gap-2 pt-3 border-t border-slate-100">
                      <button 
                        onClick={() => openMaps(order)}
                        className="flex-1 py-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
                      >
                        <GoogleMapsLogo className="h-4 w-auto" />
                        <span className="text-sm font-medium text-slate-600">Maps</span>
                      </button>
                      <button 
                        onClick={() => setAccessOrder(order)}
                        className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        Info accesso
                      </button>
                      <button 
                        onClick={() => handleDeliveryClick(order)}
                        className="flex-1 py-2.5 bg-emerald-600 text-white font-medium text-sm rounded-lg hover:bg-emerald-700 transition-colors"
                      >
                        Consegnato
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
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Giro completato</h1>
        <p className="text-slate-500 mb-8">{myBags.length} consegne effettuate</p>
        
        <button 
          onClick={handleReset}
          className="px-8 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors"
        >
          Torna alla home
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER: HOME
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Modals */}
      <ConfirmPrepareModal 
        order={confirmPrepareOrder}
        onConfirm={handleConfirmPrepare}
        onCancel={() => setConfirmPrepareOrder(null)}
      />
      <ConfirmDepartModal 
        bags={myBags}
        onConfirm={handleConfirmDepart}
        onCancel={() => setShowDepartModal(false)}
      />

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-5 py-4 sticky top-0 z-10">
        <p className="text-xs text-slate-400 uppercase tracking-wide">
          {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="text-xl font-semibold text-slate-900">Consegne</h1>
      </header>

      <div className="p-4 space-y-6">
        
        {/* CARICO ATTUALE */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Il tuo carico</h2>
            {myBags.length > 0 && (
              <span className="text-xs font-medium text-white bg-slate-900 px-2 py-0.5 rounded-full">
                {myBags.length}
              </span>
            )}
          </div>
          
          {myBags.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p className="text-sm text-slate-600 font-medium">Nessun sacco pronto</p>
              <p className="text-xs text-slate-400 mt-1">Seleziona un ordine dalla lista</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="divide-y divide-slate-100">
                {myBags.map(bag => (
                  <div key={bag.id} className="flex items-center p-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900">{bag.propertyName}</p>
                      <p className="text-sm text-slate-500 truncate">{bag.propertyAddress}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{bag.items?.length || 0} articoli</p>
                    </div>
                    <button 
                      onClick={() => handleRemoveFromBag(bag.id)}
                      className="ml-3 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="p-4 bg-slate-50 border-t border-slate-200">
                <button 
                  onClick={handleDepartClick}
                  className="w-full py-3.5 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all"
                >
                  Parti con {myBags.length} {myBags.length === 1 ? 'consegna' : 'consegne'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ORDINI DISPONIBILI */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ordini disponibili</h2>
            <span className="text-xs text-slate-400">{availableOrders.length}</span>
          </div>

          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Caricamento...</p>
            </div>
          ) : availableOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-slate-500">Nessun ordine disponibile</p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableOrders.map(order => (
                <div key={order.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-slate-900">{order.propertyName || "Proprietà"}</h3>
                        <p className="text-sm text-slate-500">{order.propertyAddress}, {order.propertyCity}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {order.items?.slice(0, 2).map((item, idx) => (
                        <span key={idx} className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">
                          {item.name} ×{item.quantity}
                        </span>
                      ))}
                      {(order.items?.length || 0) > 2 && (
                        <span className="text-xs text-slate-400 px-2 py-1">
                          +{(order.items?.length || 0) - 2} altri
                        </span>
                      )}
                    </div>

                    <button 
                      onClick={() => handlePrepareClick(order)}
                      className="w-full py-2.5 border border-slate-900 text-slate-900 font-medium rounded-xl hover:bg-slate-900 hover:text-white transition-colors"
                    >
                      Prepara sacco
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showDepartModal && (
        <ConfirmDepartModal 
          bags={myBags}
          onConfirm={handleConfirmDepart}
          onCancel={() => setShowDepartModal(false)}
        />
      )}
    </div>
  );
}
