"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { collection, doc, updateDoc, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

// ═══════════════════════════════════════════════════════════════════════════
// RIDER DASHBOARD - Redesign Completo con Animazioni
// ═══════════════════════════════════════════════════════════════════════════

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  checked?: boolean;
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

type DeliveryStep = "list" | "prepare" | "departing" | "navigate" | "confirm" | "success";

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE CONFETTI
// ═══════════════════════════════════════════════════════════════════════════
function Confetti({ active }: { active: boolean }) {
  if (!active) return null;
  
  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 8 + Math.random() * 8,
    rotation: Math.random() * 360,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute"
          style={{
            left: `${piece.left}%`,
            top: '-20px',
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotation}deg)`,
            borderRadius: Math.random() > 0.5 ? '50%' : '0%',
            animation: `confetti-fall ${piece.duration}s linear ${piece.delay}s forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL PARTENZA CON SCOOTER ANIMATO
// ═══════════════════════════════════════════════════════════════════════════
function DepartureModal({ 
  show, 
  onComplete, 
  destination 
}: { 
  show: boolean; 
  onComplete: () => void;
  destination: string;
}) {
  const [phase, setPhase] = useState<'intro' | 'driving' | 'done'>('intro');

  useEffect(() => {
    if (show) {
      setPhase('intro');
      // Vibrazione se supportata
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      
      // Dopo 500ms inizia l'animazione dello scooter
      const t1 = setTimeout(() => setPhase('driving'), 500);
      // Dopo 2.5s completa
      const t2 = setTimeout(() => {
        setPhase('done');
        setTimeout(onComplete, 500);
      }, 2500);
      
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 overflow-hidden">
      {/* Sfondo animato - strada */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Linee strada che si muovono */}
        <div className="absolute inset-0 flex flex-col justify-center gap-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-2 bg-white/20 rounded-full"
              style={{
                marginLeft: `${i % 2 === 0 ? '10%' : '15%'}`,
                width: `${60 + Math.random() * 30}%`,
                animation: `road-line 1s linear ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
        
        {/* Particelle velocità */}
        {phase === 'driving' && [...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 bg-white/40 rounded-full"
            style={{
              height: `${20 + Math.random() * 40}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `speed-particle 0.5s linear ${Math.random() * 0.5}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Contenuto centrale */}
      <div className="relative z-10 text-center px-6">
        {/* Scooter/Moto animato */}
        <div 
          className="text-8xl mb-6 transition-all duration-1000"
          style={{
            transform: phase === 'intro' ? 'translateX(-100vw)' :
                       phase === 'driving' ? 'translateX(0)' :
                       'translateX(100vw)',
            animation: phase === 'driving' ? 'scooter-bounce 0.3s ease-in-out infinite' : 'none',
          }}
        >
          🛵
        </div>

        {/* Testo */}
        <div 
          className="transition-all duration-500"
          style={{
            opacity: phase === 'driving' ? 1 : 0,
            transform: phase === 'driving' ? 'scale(1)' : 'scale(0.9)',
          }}
        >
          <h1 className="text-4xl font-black text-white mb-2 animate-pulse">
            SI PARTE! 🚀
          </h1>
          <p className="text-white/80 text-lg">
            Direzione: <span className="font-semibold text-white">{destination}</span>
          </p>
        </div>

        {/* Indicatore caricamento */}
        <div className="mt-8 flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-3 h-3 bg-white rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes road-line {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100vw); }
        }
        
        @keyframes speed-particle {
          0% { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(-200px); opacity: 0; }
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
// MODAL SUCCESSO CONSEGNA
// ═══════════════════════════════════════════════════════════════════════════
function SuccessModal({ 
  show, 
  onClose,
  propertyName 
}: { 
  show: boolean; 
  onClose: () => void;
  propertyName: string;
}) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (show) {
      setShowConfetti(true);
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100, 50, 200]);
      }
      const timer = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!show) return null;

  return (
    <>
      <Confetti active={showConfetti} />
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div 
          className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
          style={{ animation: 'bounce-in 0.5s ease-out' }}
        >
          {/* Icona successo */}
          <div 
            className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30"
            style={{ animation: 'success-pop 0.6s ease-out' }}
          >
            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-2xl font-black text-slate-800 mb-2">
            Ottimo Lavoro! 🎉
          </h2>
          <p className="text-slate-500 mb-6">
            Consegna a <span className="font-semibold text-slate-700">{propertyName}</span> completata con successo!
          </p>

          <button
            onClick={onClose}
            className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-lg rounded-2xl shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform"
          >
            Continua 🚴
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce-in {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        
        @keyframes success-pop {
          0% { transform: scale(0) rotate(-180deg); }
          60% { transform: scale(1.2) rotate(10deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
      `}</style>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PROPERTY ACCESS CARD PER RIDER
// ═══════════════════════════════════════════════════════════════════════════
function RiderAccessCard({ 
  property, 
  onNavigate 
}: { 
  property: {
    address?: string;
    city?: string;
    postalCode?: string;
    floor?: string;
    apartment?: string;
    intercom?: string;
    doorCode?: string;
    keysLocation?: string;
    accessNotes?: string;
    images?: { door?: string; building?: string };
  };
  onNavigate: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

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

  const hasImages = property.images?.door || property.images?.building;
  const hasAccessInfo = property.doorCode || property.keysLocation || property.accessNotes;
  const hasLocationDetails = property.floor || property.apartment || property.intercom;

  if (!property.address && !hasImages && !hasAccessInfo) {
    return null;
  }

  return (
    <>
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200 overflow-hidden shadow-lg">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔐</span>
            <span className="font-bold text-white">Accesso Proprietà</span>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* BOTTONE NAVIGA - GRANDE E PROMINENTE */}
          <button
            onClick={onNavigate}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-lg rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center gap-3 active:scale-95 transition-transform"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Naviga con Google Maps
          </button>

          {/* Indirizzo */}
          {property.address && (
            <div className="bg-white rounded-xl p-3 border border-amber-100">
              <p className="text-xs font-semibold text-amber-600 mb-1">📍 INDIRIZZO</p>
              <p className="font-semibold text-slate-800">{property.address}</p>
              {(property.postalCode || property.city) && (
                <p className="text-sm text-slate-500">{property.postalCode} {property.city}</p>
              )}
              {hasLocationDetails && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {property.floor && (
                    <span className="px-2 py-1 bg-slate-100 rounded-lg text-xs text-slate-600">
                      🏢 Piano {property.floor}
                    </span>
                  )}
                  {property.apartment && (
                    <span className="px-2 py-1 bg-slate-100 rounded-lg text-xs text-slate-600">
                      🚪 Int. {property.apartment}
                    </span>
                  )}
                  {property.intercom && (
                    <span className="px-2 py-1 bg-slate-100 rounded-lg text-xs text-slate-600">
                      🔔 {property.intercom}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Foto Porta e Palazzo */}
          {hasImages && (
            <div className="grid grid-cols-2 gap-3">
              {property.images?.door && (
                <div 
                  className="relative aspect-square rounded-xl overflow-hidden border-2 border-amber-200 cursor-pointer group"
                  onClick={() => setLightboxImage(property.images!.door!)}
                >
                  <img 
                    src={property.images.door} 
                    alt="Porta" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <p className="text-white text-xs font-semibold flex items-center gap-1">
                      🚪 Porta <span className="text-white/70 text-[10px]">(tap)</span>
                    </p>
                  </div>
                </div>
              )}
              {property.images?.building && (
                <div 
                  className="relative aspect-square rounded-xl overflow-hidden border-2 border-slate-200 cursor-pointer group"
                  onClick={() => setLightboxImage(property.images!.building!)}
                >
                  <img 
                    src={property.images.building} 
                    alt="Palazzo" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <p className="text-white text-xs font-semibold">🏢 Palazzo</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Codice Porta - BEN VISIBILE */}
          {property.doorCode && (
            <button
              onClick={() => copyToClipboard(property.doorCode!, 'doorCode')}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all active:scale-95 ${
                copied === 'doorCode' 
                  ? 'bg-emerald-100 border-emerald-400' 
                  : 'bg-white border-amber-200 hover:border-amber-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-amber-600 mb-1">🚪 CODICE PORTA</p>
                  <p className="text-2xl font-black text-slate-800 tracking-wider">{property.doorCode}</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  copied === 'doorCode' ? 'bg-emerald-500' : 'bg-amber-100'
                }`}>
                  {copied === 'doorCode' ? (
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {copied === 'doorCode' ? '✓ Copiato!' : 'Tap per copiare'}
              </p>
            </button>
          )}

          {/* Posizione Chiavi */}
          {property.keysLocation && (
            <button
              onClick={() => copyToClipboard(property.keysLocation!, 'keysLocation')}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all active:scale-95 ${
                copied === 'keysLocation' 
                  ? 'bg-emerald-100 border-emerald-400' 
                  : 'bg-white border-amber-200 hover:border-amber-400'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-600 mb-1">🔑 POSIZIONE CHIAVI</p>
                  <p className="font-semibold text-slate-800">{property.keysLocation}</p>
                </div>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  copied === 'keysLocation' ? 'bg-emerald-500' : 'bg-amber-100'
                }`}>
                  {copied === 'keysLocation' ? (
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          )}

          {/* Istruzioni Accesso */}
          {property.accessNotes && (
            <div className="bg-white rounded-xl p-4 border-2 border-amber-200">
              <p className="text-xs font-semibold text-amber-600 mb-2">📝 ISTRUZIONI</p>
              <p className="text-slate-700 whitespace-pre-wrap">{property.accessNotes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button 
            className="absolute top-4 right-4 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center"
            onClick={() => setLightboxImage(null)}
          >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img 
            src={lightboxImage} 
            alt="Foto ingrandita" 
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMER COMPONENTE
// ═══════════════════════════════════════════════════════════════════════════
function TravelTimer({ startTime }: { startTime: Date }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2">
      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
      <span className="font-mono font-bold text-white">
        {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
      </span>
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
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [deliveryStep, setDeliveryStep] = useState<DeliveryStep>("list");
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [showDepartureModal, setShowDepartureModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [travelStartTime, setTravelStartTime] = useState<Date | null>(null);
  
  const today = new Date();

  // 🔥 REALTIME: usa onSnapshot
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(collection(db, "orders"), (snapshot) => {
      let allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      const filtered = allOrders.filter(o => {
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

  const pendingOrders = orders.filter(o => o.status === "PENDING" || o.status === "ASSIGNED");
  const inProgressOrders = orders.filter(o => o.status === "IN_PROGRESS" || o.status === "PICKING" || o.status === "IN_TRANSIT");
  const completedOrders = orders.filter(o => o.status === "DELIVERED" || o.status === "COMPLETED");

  // Inizia consegna
  const handleStartDelivery = async (order: Order) => {
    setActiveOrder(order);
    setCheckedItems({});
    
    try {
      await updateDoc(doc(db, "orders", order.id), {
        status: "PICKING",
        riderId: user?.id,
        startedAt: Timestamp.now(),
      });
    } catch (e) {
      console.error("Errore:", e);
    }
    
    setDeliveryStep("prepare");
  };

  const allItemsChecked = activeOrder?.items?.every(item => checkedItems[item.id]) ?? false;

  // Sacco pronto - mostra modal partenza
  const handleBagReady = async () => {
    if (!activeOrder || !allItemsChecked) return;
    
    setSaving(true);
    try {
      await updateDoc(doc(db, "orders", activeOrder.id), {
        status: "IN_TRANSIT",
        bagPreparedAt: Timestamp.now(),
      });
      
      // Mostra modal partenza
      setShowDepartureModal(true);
    } catch (e) {
      console.error("Errore:", e);
    } finally {
      setSaving(false);
    }
  };

  // Completata animazione partenza
  const handleDepartureComplete = useCallback(() => {
    setShowDepartureModal(false);
    setTravelStartTime(new Date());
    setDeliveryStep("navigate");
  }, []);

  // Sono arrivato
  const handleArrived = () => {
    setDeliveryStep("confirm");
  };

  // Conferma consegna
  const handleDeliveryComplete = async () => {
    if (!activeOrder) return;
    
    setSaving(true);
    try {
      await updateDoc(doc(db, "orders", activeOrder.id), {
        status: "DELIVERED",
        deliveredAt: Timestamp.now(),
      });
      
      // Mostra success modal
      setShowSuccessModal(true);
    } catch (e) {
      console.error("Errore:", e);
    } finally {
      setSaving(false);
    }
  };

  // Chiudi success modal e torna a lista
  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    setActiveOrder(null);
    setDeliveryStep("list");
    setCheckedItems({});
    setTravelStartTime(null);
  };

  // Annulla
  const handleCancel = () => {
    setActiveOrder(null);
    setDeliveryStep("list");
    setCheckedItems({});
    setTravelStartTime(null);
  };

  // Apri Google Maps
  const openMaps = () => {
    if (!activeOrder) return;
    const address = `${activeOrder.propertyAddress || ''}, ${activeOrder.propertyPostalCode || ''} ${activeOrder.propertyCity || ''}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DELIVERED":
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-700";
      case "IN_TRANSIT":
        return "bg-blue-100 text-blue-700";
      case "PICKING":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "DELIVERED":
      case "COMPLETED":
        return "✓ Consegnato";
      case "IN_TRANSIT":
        return "🚴 In Viaggio";
      case "PICKING":
        return "📦 Preparazione";
      default:
        return "Da Fare";
    }
  };

  // ════════════════════════════════════════════════════════════════
  // STEP: PREPARAZIONE SACCO
  // ════════════════════════════════════════════════════════════════
  if (deliveryStep === "prepare" && activeOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
        {/* Modal Partenza */}
        <DepartureModal 
          show={showDepartureModal} 
          onComplete={handleDepartureComplete}
          destination={activeOrder.propertyName || "destinazione"}
        />

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-6 rounded-b-3xl shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={handleCancel} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center active:scale-95">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold">📦 Prepara il Sacco</h1>
              <p className="text-white/80 text-sm">Spunta ogni articolo</p>
            </div>
          </div>
          
          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-3 bg-white/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${(Object.values(checkedItems).filter(Boolean).length / (activeOrder.items?.length || 1)) * 100}%` }}
              />
            </div>
            <span className="text-sm font-bold bg-white/20 px-3 py-1 rounded-full">
              {Object.values(checkedItems).filter(Boolean).length}/{activeOrder.items?.length || 0}
            </span>
          </div>
        </div>

        {/* Preview Destinazione */}
        <div className="mx-4 -mt-4 bg-white rounded-2xl shadow-lg p-4 border border-amber-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-2xl">
              🏠
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-500">PROSSIMA DESTINAZIONE</p>
              <p className="font-bold text-slate-800">{activeOrder.propertyName}</p>
              <p className="text-sm text-slate-500">{activeOrder.propertyAddress}</p>
            </div>
          </div>
        </div>

        {/* Lista Articoli */}
        <div className="p-4 space-y-3 mt-4 pb-32">
          <h2 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <span>📋</span> Articoli da preparare
          </h2>
          
          {activeOrder.items?.map((item, idx) => (
            <div 
              key={item.id || idx}
              onClick={() => setCheckedItems(prev => ({ ...prev, [item.id || idx]: !prev[item.id || idx] }))}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer active:scale-[0.98] ${
                checkedItems[item.id || idx] 
                  ? "bg-emerald-50 border-emerald-400 shadow-lg shadow-emerald-500/10" 
                  : "bg-white border-slate-200 hover:border-amber-300"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  checkedItems[item.id || idx] 
                    ? "bg-emerald-500 text-white scale-110" 
                    : "bg-slate-100 text-slate-400"
                }`}>
                  {checkedItems[item.id || idx] ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-bold">{idx + 1}</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className={`font-semibold ${checkedItems[item.id || idx] ? "text-emerald-700 line-through" : "text-slate-800"}`}>
                    {item.name}
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-xl font-bold text-lg ${
                  checkedItems[item.id || idx] 
                    ? "bg-emerald-100 text-emerald-700" 
                    : "bg-amber-100 text-amber-700"
                }`}>
                  x{item.quantity}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottone Conferma */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-slate-200">
          <button
            onClick={handleBagReady}
            disabled={!allItemsChecked || saving}
            className={`w-full py-5 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] ${
              allItemsChecked 
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30" 
                : "bg-slate-200 text-slate-400"
            }`}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Salvataggio...
              </span>
            ) : allItemsChecked ? (
              <span className="flex items-center justify-center gap-2">
                🛵 Sacco Pronto - Si Parte!
              </span>
            ) : (
              `Spunta tutti gli articoli (${Object.values(checkedItems).filter(Boolean).length}/${activeOrder.items?.length || 0})`
            )}
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // STEP: NAVIGAZIONE
  // ════════════════════════════════════════════════════════════════
  if (deliveryStep === "navigate" && activeOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white pb-28">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-6 rounded-b-3xl shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setDeliveryStep("prepare")} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center active:scale-95">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {travelStartTime && <TravelTimer startTime={travelStartTime} />}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-3xl animate-bounce">🛵</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">In Viaggio!</h1>
              <p className="text-white/80 text-sm">Raggiungi la destinazione</p>
            </div>
          </div>
        </div>

        {/* Destinazione */}
        <div className="mx-4 -mt-4 mb-4 bg-white rounded-2xl shadow-xl p-4 border border-blue-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl shadow-lg">
              🏠
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-500">DESTINAZIONE</p>
              <h2 className="font-bold text-lg text-slate-800">{activeOrder.propertyName}</h2>
              <p className="text-sm text-slate-500">#{activeOrder.id.slice(-6)}</p>
            </div>
          </div>
        </div>

        {/* Property Access Card */}
        <div className="mx-4 mb-4">
          <RiderAccessCard 
            property={{
              address: activeOrder.propertyAddress,
              city: activeOrder.propertyCity,
              postalCode: activeOrder.propertyPostalCode,
              floor: activeOrder.propertyFloor,
              apartment: activeOrder.propertyApartment,
              intercom: activeOrder.propertyIntercom,
              doorCode: activeOrder.propertyDoorCode || activeOrder.propertyAccessCode,
              keysLocation: activeOrder.propertyKeysLocation,
              accessNotes: activeOrder.propertyAccessNotes,
              images: activeOrder.propertyImages,
            }}
            onNavigate={openMaps}
          />
        </div>

        {/* Note Ordine */}
        {activeOrder.notes && (
          <div className="mx-4 mb-4 bg-amber-50 rounded-xl p-4 border border-amber-200">
            <p className="text-xs font-semibold text-amber-600 mb-1">📝 NOTE ORDINE</p>
            <p className="text-amber-800">{activeOrder.notes}</p>
          </div>
        )}

        {/* Riepilogo Articoli */}
        <div className="mx-4 bg-white rounded-2xl shadow-lg p-4 border border-slate-200">
          <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span>📦</span> Nel sacco ({activeOrder.items?.length || 0} articoli)
          </h3>
          <div className="space-y-2">
            {activeOrder.items?.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                <span className="text-slate-600">{item.name}</span>
                <span className="font-semibold text-slate-800">x{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottone Sono Arrivato */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-slate-200">
          <button
            onClick={handleArrived}
            className="w-full py-5 rounded-2xl font-bold text-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-transform"
          >
            📍 Sono Arrivato!
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // STEP: CONFERMA CONSEGNA
  // ════════════════════════════════════════════════════════════════
  if (deliveryStep === "confirm" && activeOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col">
        {/* Success Modal */}
        <SuccessModal 
          show={showSuccessModal} 
          onClose={handleSuccessClose}
          propertyName={activeOrder.propertyName || ""}
        />

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-8 rounded-b-3xl shadow-lg text-center">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-5xl">📦</span>
          </div>
          <h1 className="text-2xl font-bold">Conferma Consegna</h1>
          <p className="text-white/80 mt-1">Hai consegnato tutti gli articoli?</p>
        </div>

        {/* Riepilogo */}
        <div className="flex-1 p-4">
          <div className="bg-white rounded-2xl shadow-lg p-5 border border-emerald-100">
            <div className="text-center mb-6">
              <p className="text-slate-500 text-sm">Consegna per</p>
              <h2 className="font-bold text-xl text-slate-800">{activeOrder.propertyName}</h2>
              <p className="text-slate-600">{activeOrder.propertyAddress}</p>
            </div>

            <div className="bg-emerald-50 rounded-xl p-4">
              <p className="text-sm font-semibold text-emerald-700 mb-3 flex items-center gap-2">
                <span>✓</span> Articoli Consegnati
              </p>
              <div className="space-y-2">
                {activeOrder.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-emerald-600">{item.name}</span>
                    <span className="font-semibold text-emerald-700">x{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottoni */}
        <div className="p-4 space-y-3 bg-white border-t border-slate-200">
          <button
            onClick={handleDeliveryComplete}
            disabled={saving}
            className="w-full py-5 rounded-2xl font-bold text-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-transform"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Conferma in corso...
              </span>
            ) : (
              "✓ Confermo Consegna Completata"
            )}
          </button>
          <button
            onClick={() => setDeliveryStep("navigate")}
            className="w-full py-4 rounded-xl font-medium text-slate-600 bg-slate-100 active:scale-[0.98] transition-transform"
          >
            ← Torna Indietro
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // LISTA PRINCIPALE
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4 lg:p-8 pb-24">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-orange-500/20">
              🛵
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-black text-slate-800">
                Ciao, {user?.name?.split(" ")[0] || "Rider"}!
              </h1>
              <p className="text-slate-500">
                {today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-slate-800">{orders.length}</p>
            <p className="text-xs text-slate-500 font-medium">Totali</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-4 text-center shadow-lg shadow-orange-500/20">
            <p className="text-3xl font-black text-white">{pendingOrders.length + inProgressOrders.length}</p>
            <p className="text-xs text-white/80 font-medium">Da Fare</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl p-4 text-center shadow-lg shadow-emerald-500/20">
            <p className="text-3xl font-black text-white">{completedOrders.length}</p>
            <p className="text-xs text-white/80 font-medium">Completate</p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border p-12 text-center shadow-sm">
            <div className="w-16 h-16 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 mt-4 font-medium">Caricamento consegne...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">📦</span>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Nessuna consegna!</h3>
            <p className="text-slate-500">Controlla più tardi per nuovi ordini 😊</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Consegne da fare */}
            {(pendingOrders.length > 0 || inProgressOrders.length > 0) && (
              <div>
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="w-3 h-3 bg-amber-500 rounded-full animate-pulse"></span>
                  Da Consegnare ({pendingOrders.length + inProgressOrders.length})
                </h2>
                <div className="space-y-3">
                  {[...inProgressOrders, ...pendingOrders].map((order) => (
                    <div key={order.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center text-2xl">
                              🏠
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-800">{order.propertyName || "Proprietà"}</h3>
                              <p className="text-sm text-slate-500">{order.propertyAddress}</p>
                              {order.propertyCity && (
                                <p className="text-xs text-slate-400">{order.propertyPostalCode} {order.propertyCity}</p>
                              )}
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status)}`}>
                            {getStatusText(order.status)}
                          </span>
                        </div>
                        
                        {/* Articoli preview */}
                        {order.items?.length > 0 && (
                          <div className="bg-slate-50 rounded-xl p-3 mb-3">
                            <p className="text-xs font-semibold text-slate-500 mb-2">📦 {order.items.length} articoli</p>
                            <div className="flex flex-wrap gap-1">
                              {order.items.slice(0, 3).map((item, idx) => (
                                <span key={idx} className="px-2 py-1 bg-white rounded-lg text-xs text-slate-600 border">
                                  {item.name} x{item.quantity}
                                </span>
                              ))}
                              {order.items.length > 3 && (
                                <span className="px-2 py-1 bg-slate-200 rounded-lg text-xs text-slate-600 font-medium">
                                  +{order.items.length - 3} altri
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Bottone azione */}
                        {order.status === "PENDING" || order.status === "ASSIGNED" ? (
                          <button
                            onClick={() => handleStartDelivery(order)}
                            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-transform"
                          >
                            🛵 Inizia Consegna
                          </button>
                        ) : order.status === "PICKING" ? (
                          <button
                            onClick={() => {
                              setActiveOrder(order);
                              setDeliveryStep("prepare");
                            }}
                            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-transform"
                          >
                            📦 Continua Preparazione
                          </button>
                        ) : order.status === "IN_TRANSIT" ? (
                          <button
                            onClick={() => {
                              setActiveOrder(order);
                              setTravelStartTime(new Date());
                              setDeliveryStep("navigate");
                            }}
                            className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform"
                          >
                            🚴 Continua Navigazione
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Consegne completate */}
            {completedOrders.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="w-3 h-3 bg-emerald-500 rounded-full"></span>
                  Completate Oggi ({completedOrders.length})
                </h2>
                <div className="space-y-2">
                  {completedOrders.slice(0, 5).map((order) => (
                    <div key={order.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-700">{order.propertyName}</p>
                        <p className="text-xs text-slate-400">{order.items?.length} articoli</p>
                      </div>
                      <span className="text-xs text-emerald-600 font-medium">✓ Consegnato</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
