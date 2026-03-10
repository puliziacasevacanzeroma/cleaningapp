"use client";

import { useState, useEffect, useMemo } from "react";
import { doc, updateDoc, deleteDoc, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { getItemName } from "~/lib/itemNames";

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price?: number;
  categoryName?: string;
}

interface Order {
  id: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  riderId?: string | null;
  riderName?: string | null;
  status: string;
  urgency?: 'normal' | 'urgent';
  items: OrderItem[];
  scheduledDate?: Date | { toDate: () => Date };
  scheduledTime?: string;
  cleaningId?: string;
  notes?: string;
  includePickup?: boolean;
  pickupItems?: OrderItem[];
  deliveryFee?: number;
  deliveryFeeEnabled?: boolean;
  bedMaking?: boolean;
  bedMakingCount?: number;
  bedMakingFee?: number;
}

interface LinenItem {
  id: string;
  n: string;
  p: number;
  categoryId?: string;
}

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  userRole: "ADMIN" | "PROPRIETARIO";
  riders?: { id: string; name: string }[];
  inventory?: any[];
  onOrderUpdate?: () => void;
  onOrderDelete?: () => void;
}

// ═══════════════════════════════════════
// SVG ICONS — stessi della EditCleaningModal
// ═══════════════════════════════════════
const I = {
  close: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>,
  home: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>,
  clock: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
  calendar: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
  user: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>,
  note: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>,
  status: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>,
  bed: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>,
  bath: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>,
  down: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>,
  check: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>,
};

// ═══════════════════════════════════════
// ACCORDION SECTION — Identico a EditCleaningModal
// ═══════════════════════════════════════
const formatPrice = (p: number) => p % 1 === 0 ? p.toString() : p.toFixed(2);

const Section = ({ title, icon, price, expanded, onToggle, children }: { 
  title: string; icon: React.ReactNode; price: number; expanded: boolean; onToggle: () => void; children: React.ReactNode; 
}) => (
  <div className={`rounded-xl border ${expanded ? 'border-slate-300 shadow-sm' : 'border-slate-200'} overflow-hidden mb-2 transition-all bg-white`}>
    <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between active:bg-slate-50">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${expanded ? 'bg-slate-900' : 'bg-slate-100'} flex items-center justify-center transition-colors`}>
          <div className={`w-5 h-5 ${expanded ? 'text-white' : 'text-slate-600'}`}>{icon}</div>
        </div>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold">€{formatPrice(price)}</span>
        <div className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>{I.down}</div>
      </div>
    </button>
    <div className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">{children}</div>
    </div>
  </div>
);

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export default function OrderDetailModal({
  isOpen,
  onClose,
  order: initialOrder,
  userRole,
  riders = [],
  inventory = [],
  onOrderUpdate,
  onOrderDelete,
}: OrderDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'linen'>('details');
  const [saving, setSaving] = useState(false);
  const [sec, setSec] = useState<string | null>('beds');
  
  // Inventario categorizzato
  const [invLinen, setInvLinen] = useState<LinenItem[]>([]);
  const [invBath, setInvBath] = useState<LinenItem[]>([]);
  const [invKit, setInvKit] = useState<LinenItem[]>([]);
  
  // Items editati — mappa itemId → quantity
  const [editedItems, setEditedItems] = useState<Record<string, number>>({});
  
  // Real-time order data
  const [liveOrder, setLiveOrder] = useState<Order | null>(null);
  const order = liveOrder || initialOrder;

  // ═══ REAL-TIME LISTENER ═══
  useEffect(() => {
    if (!isOpen || !initialOrder?.id) return;
    
    const unsub = onSnapshot(doc(db, "orders", initialOrder.id), (snap) => {
      if (snap.exists()) {
        const d = snap.data() as Record<string, any>;
        setLiveOrder({
          id: snap.id,
          propertyId: d.propertyId || '',
          propertyName: d.propertyName || '',
          propertyAddress: d.propertyAddress || '',
          riderId: d.riderId || null,
          riderName: d.riderName || null,
          status: d.status || 'PENDING',
          urgency: d.urgency,
          items: d.items || [],
          scheduledDate: d.scheduledDate,
          scheduledTime: d.scheduledTime || '',
          cleaningId: d.cleaningId,
          notes: d.notes || '',
          includePickup: d.includePickup,
          pickupItems: d.pickupItems,
          deliveryFee: d.deliveryFee,
          deliveryFeeEnabled: d.deliveryFeeEnabled,
          bedMaking: d.bedMaking || false,
          bedMakingCount: d.bedMakingCount || 0,
          bedMakingFee: d.bedMakingFee || 0,
        });
      }
    });
    
    return () => unsub();
  }, [isOpen, initialOrder?.id]);

  // ═══ LOAD INVENTORY ═══
  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      try {
        const res = await fetch('/api/inventory/list');
        const data = await res.json();
        const linen: LinenItem[] = [], bath: LinenItem[] = [], kit: LinenItem[] = [];
        data.categories?.forEach((cat: { id: string; items: { key?: string; id: string; name: string; sellPrice?: number }[] }) => {
          cat.items?.forEach((item) => {
            const m = { id: item.key || item.id, n: item.name, p: item.sellPrice || 0 };
            if (cat.id === 'biancheria_letto') linen.push(m);
            else if (cat.id === 'biancheria_bagno') bath.push(m);
            else if (cat.id === 'kit_cortesia') kit.push(m);
          });
        });
        setInvLinen(linen);
        setInvBath(bath);
        setInvKit(kit);
      } catch (e) {
        console.error("Errore caricamento inventario:", e);
      }
    }
    load();
  }, [isOpen]);

  // ═══ INIT EDITED ITEMS — include TUTTI gli items inventario, 0 se non nell'ordine ═══
  useEffect(() => {
    if (!order?.items || (invLinen.length === 0 && invBath.length === 0 && invKit.length === 0)) return;
    const map: Record<string, number> = {};
    // Prima metti tutti gli items inventario a 0
    [...invLinen, ...invBath, ...invKit].forEach(item => {
      map[item.id] = 0;
    });
    // Poi sovrascrivi con le quantità dall'ordine
    order.items.forEach(item => {
      map[item.id] = item.quantity;
    });
    setEditedItems(map);
  }, [order?.id, order?.items?.length, invLinen.length, invBath.length, invKit.length]);

  // ═══ BODY OVERFLOW ═══
  useEffect(() => {
    if (isOpen) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Reset tab on open
  useEffect(() => {
    if (isOpen) { setActiveTab('details'); setSec('beds'); }
  }, [isOpen]);

  // ═══ CALCULATE PRICES — must be before early return (hooks order) ═══
  const bedPrice = useMemo(() => {
    return invLinen.reduce((sum, item) => {
      const qty = editedItems[item.id] || 0;
      return sum + item.p * qty;
    }, 0);
  }, [invLinen, editedItems]);

  const bathPrice = useMemo(() => {
    return invBath.reduce((sum, item) => {
      const qty = editedItems[item.id] || 0;
      return sum + item.p * qty;
    }, 0);
  }, [invBath, editedItems]);

  const kitPrice = useMemo(() => {
    return invKit.reduce((sum, item) => {
      const qty = editedItems[item.id] || 0;
      return sum + item.p * qty;
    }, 0);
  }, [invKit, editedItems]);

  const totalDotazioni = bedPrice + bathPrice + kitPrice;
  const deliveryFee = (order?.deliveryFee && order?.deliveryFeeEnabled !== false) ? order.deliveryFee : 0;
  const bedMakingFee = (order?.bedMaking && order?.bedMakingFee) ? order.bedMakingFee : 0;
  const totalPrice = totalDotazioni + deliveryFee + bedMakingFee;

  // ═══ CHECK CHANGES ═══
  const hasChanges = useMemo(() => {
    if (!order?.items) return false;
    return order.items.some(item => {
      const edited = editedItems[item.id];
      return edited !== undefined && edited !== item.quantity;
    });
  }, [order?.items, editedItems]);

  if (!isOpen || !order || !order.id) return null;

  // ═══════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════
  const isAdmin = userRole === "ADMIN";
  const isDelivered = order.status === "DELIVERED" || order.status === "COMPLETED";

  const getScheduledDate = () => {
    if (!order.scheduledDate) return null;
    if (typeof (order.scheduledDate as any).toDate === 'function') {
      return (order.scheduledDate as { toDate: () => Date }).toDate();
    }
    return order.scheduledDate as Date;
  };
  const scheduledDate = getScheduledDate();

  const formatDateIT = (d: Date) => {
    try {
      if (d instanceof Date && !isNaN(d.getTime())) {
        return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      }
      return "Data non valida";
    } catch { return "Data non valida"; }
  };

  const getStatusConfig = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DELIVERED": case "COMPLETED":
        return { label: "Consegnato", bg: "bg-emerald-100", text: "text-emerald-700", icon: "✓" };
      case "IN_TRANSIT":
        return { label: "In Viaggio", bg: "bg-blue-100", text: "text-blue-700", icon: "🚴" };
      case "PICKING":
        return { label: "Preparazione", bg: "bg-amber-100", text: "text-amber-700", icon: "📦" };
      case "ASSIGNED":
        return { label: "Assegnato", bg: "bg-violet-100", text: "text-violet-700", icon: "👤" };
      default:
        return { label: "Da Assegnare", bg: "bg-rose-100", text: "text-rose-700", icon: "⏳" };
    }
  };
  const statusConfig = getStatusConfig(order.status);

  // ═══ FIND ITEM PRICE ═══
  const findItemPrice = (itemId: string): number => {
    const allInv = [...invLinen, ...invBath, ...invKit];
    const found = allInv.find(i => i.id === itemId);
    if (found) return found.p;
    // Fallback: cerca nel prop inventory
    const invItem = inventory.find(i => i.id === itemId || (i as any).key === itemId);
    return invItem?.sellPrice || (invItem as any)?.price || 0;
  };

  const findItemName = (itemId: string, originalName: string): string => {
    const allInv = [...invLinen, ...invBath, ...invKit];
    const found = allInv.find(i => i.id === itemId);
    if (found) return found.n;
    const translated = getItemName(itemId);
    if (translated !== itemId) return translated;
    return originalName || itemId;
  };

  // ═══ QUANTITY HANDLERS ═══
  const handleQtyChange = (itemId: string, delta: number) => {
    setEditedItems(prev => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] || 0) + delta)
    }));
  };

  // ═══ SAVE HANDLER — salva TUTTI gli items con qty > 0 ═══
  const handleSave = async () => {
    if (isDelivered && !isAdmin) return;
    setSaving(true);
    try {
      const allInv = [...invLinen, ...invBath, ...invKit];
      const newItems: OrderItem[] = [];
      
      Object.entries(editedItems).forEach(([itemId, qty]) => {
        if (qty > 0) {
          const invItem = allInv.find(i => i.id === itemId);
          const originalItem = order.items?.find(i => i.id === itemId);
          newItems.push({
            id: itemId,
            name: invItem?.n || findItemName(itemId, originalItem?.name || ''),
            quantity: qty,
            price: invItem?.p || findItemPrice(itemId),
            ...(originalItem?.categoryName && { categoryName: originalItem.categoryName }),
          });
        }
      });

      const res = await fetch(`/api/orders/${order.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: newItems }),
      });

      if (res.ok) {
        onOrderUpdate?.();
        onClose();
      } else {
        const data = await res.json();
        alert(data.error || "Errore salvataggio");
      }
    } catch (error) {
      alert("Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // ═══ RENDER ITEM ROW — mostra TUTTI gli items inventario con +/- ═══
  const renderInvItemRow = (item: LinenItem, borderColor: string, priceColor: string) => {
    const qty = editedItems[item.id] || 0;
    const canEdit = !isDelivered || isAdmin;

    return (
      <div key={item.id} className={`flex items-center justify-between bg-white rounded-lg p-2.5 border ${borderColor}`}>
        <span className="text-xs text-slate-700 font-medium">{item.n} <span className={priceColor}>€{(item.p || 0).toFixed(2)}</span></span>
        {canEdit ? (
          <div className="flex items-center gap-0">
            <button
              onClick={() => handleQtyChange(item.id, -1)}
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
            >
              <span className="text-lg font-bold leading-none">−</span>
            </button>
            <span className="min-w-[28px] text-center text-sm font-bold text-slate-800">{qty}</span>
            <button
              onClick={() => handleQtyChange(item.id, 1)}
              className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <span className="text-lg font-bold leading-none">+</span>
            </button>
          </div>
        ) : (
          <span className="text-sm font-bold text-slate-700">x{qty}</span>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ═══ HEADER ═══ */}
      <div className="flex-shrink-0 bg-white pt-12 px-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {isAdmin ? "Gestione Consegna" : "Dettaglio Consegna"}
            </h2>
            <p className="text-xs text-slate-500">{order.propertyName}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-95">
            <div className="w-5 h-5 text-slate-500">{I.close}</div>
          </button>
        </div>

        {/* Tab Navigation — Identico a EditCleaningModal */}
        <div className="flex bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-xs transition-all ${activeTab === 'details' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Dettagli
          </button>
          <button
            onClick={() => setActiveTab('linen')}
            className={`flex-1 py-2.5 px-3 rounded-lg font-semibold text-xs transition-all ${activeTab === 'linen' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Biancheria
          </button>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto px-4 py-3">

        {/* ==================== TAB DETTAGLI ==================== */}
        {activeTab === 'details' && (
          <>
            {/* Proprietà */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-blue-600">{I.home}</div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">{order.propertyName}</span>
                    {order.propertyAddress && <p className="text-xs text-slate-500">{order.propertyAddress}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Stato */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-amber-600">{I.status}</div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Stato Consegna</span>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${statusConfig.bg} ${statusConfig.text}`}>
                  {statusConfig.icon} {statusConfig.label}
                </span>
              </div>
            </div>

            {/* Orario */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-sky-600">{I.clock}</div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Orario</span>
                    {!isAdmin && <p className="text-[11px] text-slate-400">Assegnato dall'amministratore</p>}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <span className="text-lg font-bold text-slate-800">{order.scheduledTime || "Da definire"}</span>
                </div>
              </div>
            </div>

            {/* Data */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-pink-600">{I.calendar}</div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Data Consegna</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-center">
                  <span className="text-lg font-bold text-slate-800">
                    {scheduledDate ? formatDateIT(scheduledDate) : "Da definire"}
                  </span>
                </div>
              </div>
            </div>

            {/* Rider */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <div className="w-5 h-5 text-purple-600">{I.user}</div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-800">Rider</span>
                    {!isAdmin && <p className="text-[11px] text-slate-400">Assegnato dall'amministratore</p>}
                  </div>
                </div>
                {order.riderName ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #fdf4ff, #fae8ff)', border: '1px solid #e9d5ff' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-extrabold" style={{ background: 'linear-gradient(135deg, #a855f7, #9333ea)' }}>
                      {String(order.riderName).split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-purple-800">{String(order.riderName)}</div>
                      <div className="text-[10px] text-purple-400">Rider</div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl text-center">
                    <span className="text-sm text-slate-400 italic">Non ancora assegnato</span>
                  </div>
                )}
              </div>
            </div>

            {/* Note */}
            {order.notes && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-3">
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
                      <div className="w-5 h-5 text-yellow-600">{I.note}</div>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-800">Note</span>
                    </div>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-sm text-amber-800 leading-relaxed">{order.notes}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ==================== TAB BIANCHERIA ==================== */}
        {activeTab === 'linen' && (
          <>
            {/* Biancheria Letto */}
            <Section title="Biancheria Letto" icon={I.bed} price={bedPrice} expanded={sec === 'beds'} onToggle={() => setSec(sec === 'beds' ? null : 'beds')}>
              {invLinen.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun articolo</p></div>
              ) : (
                <div className="space-y-2">
                  {invLinen.map(item => renderInvItemRow(item, 'border-blue-100', 'text-blue-500'))}
                  <p className="text-[10px] text-slate-400 italic mt-2">Puoi modificare le quantità manualmente.</p>
                </div>
              )}
            </Section>

            {/* Biancheria Bagno */}
            <Section title="Biancheria Bagno" icon={I.bath} price={bathPrice} expanded={sec === 'baths'} onToggle={() => setSec(sec === 'baths' ? null : 'baths')}>
              {invBath.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun articolo</p></div>
              ) : (
                <div className="space-y-2">
                  {invBath.map(item => renderInvItemRow(item, 'border-purple-100', 'text-purple-500'))}
                </div>
              )}
            </Section>

            {/* Kit Cortesia */}
            <Section title="Kit Cortesia" icon={<span className="text-lg">🧴</span>} price={kitPrice} expanded={sec === 'kits'} onToggle={() => setSec(sec === 'kits' ? null : 'kits')}>
              {invKit.length === 0 ? (
                <div className="text-center py-4"><p className="text-sm text-slate-500">Nessun articolo</p></div>
              ) : (
                <div className="space-y-2">
                  {invKit.map(item => renderInvItemRow(item, 'border-amber-100', 'text-amber-600'))}
                </div>
              )}
            </Section>

            {/* Totale dark box */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-4 shadow-lg mt-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-slate-400">Biancheria Letto</span>
                <span className="text-sm font-bold text-slate-300">€{formatPrice(bedPrice)}</span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-slate-400">Biancheria Bagno</span>
                <span className="text-sm font-bold text-slate-300">€{formatPrice(bathPrice)}</span>
              </div>
              {kitPrice > 0 && (
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-slate-400">Kit Cortesia</span>
                  <span className="text-sm font-bold text-slate-300">€{formatPrice(kitPrice)}</span>
                </div>
              )}
              {deliveryFee > 0 && (
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-slate-400">Consegna</span>
                  <span className="text-sm font-bold text-slate-300">€{formatPrice(deliveryFee)}</span>
                </div>
              )}
              {bedMakingFee > 0 && (
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-slate-400">🛏️ Preparazione Letti ({order?.bedMakingCount || 0})</span>
                  <span className="text-sm font-bold text-violet-300">€{formatPrice(bedMakingFee)}</span>
                </div>
              )}
              <div className="h-px bg-white/10 my-2" />
              <div className="flex justify-between items-center">
                <span className="font-semibold text-white">Totale Dotazioni</span>
                <span className="text-2xl font-bold text-white">€{formatPrice(totalDotazioni)}</span>
              </div>
            </div>
          </>
        )}

        <div className="h-4"></div>
      </div>

      {/* ═══ FOOTER — Identico a EditCleaningModal ═══ */}
      <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-slate-200 bg-white" style={{ paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 80px), 96px)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-600">Totale consegna</span>
          <span className="text-2xl font-bold">€{formatPrice(totalPrice)}</span>
        </div>
        {(!isDelivered || isAdmin) ? (
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`w-full py-3.5 text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-transform shadow-md disabled:opacity-50 bg-gradient-to-r from-slate-600 to-slate-800`}
          >
            {saving ? 'Salvataggio...' : hasChanges ? 'Salva Modifiche' : 'Nessuna modifica'}
          </button>
        ) : (
          <button
            onClick={onClose}
            className="w-full py-3.5 text-slate-700 text-sm font-bold rounded-xl bg-slate-100 active:scale-[0.98] transition-transform"
          >
            Chiudi
          </button>
        )}
      </div>
    </div>
  );
}
