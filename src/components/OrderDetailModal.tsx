"use client";

import { useState, useEffect } from "react";
import { doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price?: number;
}

interface Order {
  id: string;
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyPostalCode?: string;
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
}

interface Rider {
  id: string;
  name: string;
}

interface InventoryItem {
  id: string;
  key: string;
  name: string;
  categoryId: string;
  sellPrice: number;
  unit?: string;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  items: InventoryItem[];
}

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  userRole: "ADMIN" | "PROPRIETARIO";
  riders?: Rider[];
  inventory?: InventoryItem[];
  onOrderUpdate?: () => void;
  onOrderDelete?: () => void;
}

// Colori per categorie
const CATEGORY_COLORS: { [key: string]: { bg: string; border: string; text: string; button: string } } = {
  biancheria_letto: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-800", button: "bg-sky-500 hover:bg-sky-600" },
  biancheria_bagno: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", button: "bg-emerald-500 hover:bg-emerald-600" },
  kit_cortesia: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-800", button: "bg-violet-500 hover:bg-violet-600" },
  prodotti_pulizia: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-800", button: "bg-rose-500 hover:bg-rose-600" },
  servizi_extra: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", button: "bg-amber-500 hover:bg-amber-600" },
  altro: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-800", button: "bg-slate-500 hover:bg-slate-600" },
};

const CATEGORY_ICONS: { [key: string]: string } = {
  biancheria_letto: "🛏️",
  biancheria_bagno: "🛁",
  kit_cortesia: "🧴",
  prodotti_pulizia: "🧹",
  servizi_extra: "🎁",
  altro: "📦",
};

const CATEGORY_NAMES: { [key: string]: string } = {
  biancheria_letto: "Biancheria Letto",
  biancheria_bagno: "Biancheria Bagno",
  kit_cortesia: "Kit Cortesia",
  prodotti_pulizia: "Prodotti Pulizia",
  servizi_extra: "Servizi Extra",
  altro: "Altro",
};

export default function OrderDetailModal({
  isOpen,
  onClose,
  order,
  userRole,
  riders = [],
  inventory = [],
  onOrderUpdate,
  onOrderDelete,
}: OrderDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAssignRider, setShowAssignRider] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editItemsMode, setEditItemsMode] = useState(false);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  
  const [formData, setFormData] = useState({
    scheduledTime: "",
    notes: "",
  });

  // Stato per items in modifica - mappa itemId -> quantity
  const [editedItems, setEditedItems] = useState<{[key: string]: number}>({});

  // Carica inventario completo quando si entra in modalità modifica items
  useEffect(() => {
    if (editItemsMode && allCategories.length === 0) {
      loadFullInventory();
    }
  }, [editItemsMode]);

  const loadFullInventory = async () => {
    setLoadingInventory(true);
    try {
      const res = await fetch("/api/inventory/list");
      const data = await res.json();
      setAllCategories(data.categories || []);
    } catch (err) {
      console.error("Errore caricamento inventario:", err);
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    if (order) {
      setFormData({
        scheduledTime: order.scheduledTime || "",
        notes: order.notes || "",
      });
      setEditMode(false);
      setEditItemsMode(false);
      
      // Inizializza editedItems con gli items correnti dell'ordine
      const itemsMap: {[key: string]: number} = {};
      order.items?.forEach(item => {
        itemsMap[item.id] = item.quantity;
      });
      setEditedItems(itemsMap);
    }
  }, [order]);

  // Blocca scroll body quando modal è aperta
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

  if (!isOpen || !order) return null;

  // Helpers
  const getScheduledDate = () => {
    if (!order.scheduledDate) return null;
    if (typeof (order.scheduledDate as any).toDate === 'function') {
      return (order.scheduledDate as { toDate: () => Date }).toDate();
    }
    return order.scheduledDate as Date;
  };

  const scheduledDate = getScheduledDate();

  const calculateTotalPrice = () => {
    return order.items?.reduce((sum, item) => {
      const invItem = inventory.find(i => i.id === item.id);
      const price = item.price || invItem?.sellPrice || 0;
      return sum + (price * item.quantity);
    }, 0) || 0;
  };

  // Calcola totale per items editati
  const calculateEditedTotal = () => {
    let total = 0;
    Object.entries(editedItems).forEach(([itemId, qty]) => {
      if (qty > 0) {
        // Cerca in tutte le categorie
        for (const cat of allCategories) {
          const item = cat.items.find(i => i.id === itemId);
          if (item) {
            total += item.sellPrice * qty;
            break;
          }
        }
      }
    });
    return total;
  };

  // Conta items selezionati per categoria
  const countCategoryItems = (categoryId: string) => {
    const cat = allCategories.find(c => c.id === categoryId);
    if (!cat) return 0;
    return cat.items.reduce((count, item) => {
      return count + (editedItems[item.id] || 0);
    }, 0);
  };

  const totalPrice = calculateTotalPrice();

  const getStatusConfig = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DELIVERED":
      case "COMPLETED":
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
  const isUrgent = order.urgency === 'urgent';
  
  const isDelivered = order.status === "DELIVERED" || order.status === "COMPLETED";
  const canEdit = !isDelivered;
  const canDelete = !isDelivered;
  const canAssignRider = userRole === "ADMIN";
  const canToggleUrgency = userRole === "ADMIN";

  // Handlers
  const handleSave = async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "orders", order.id), {
        scheduledTime: formData.scheduledTime,
        notes: formData.notes,
        updatedAt: Timestamp.now(),
      });
      setEditMode(false);
      onOrderUpdate?.();
    } catch (error) {
      alert("Errore salvataggio");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveItems = async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      // Costruisci array items dal map editedItems
      const newItems: OrderItem[] = [];
      Object.entries(editedItems).forEach(([itemId, qty]) => {
        if (qty > 0) {
          // Trova l'item nell'inventario
          let foundItem: InventoryItem | undefined;
          for (const cat of allCategories) {
            foundItem = cat.items.find(i => i.id === itemId);
            if (foundItem) break;
          }
          
          newItems.push({
            id: itemId,
            name: foundItem?.name || itemId,
            quantity: qty,
            price: foundItem?.sellPrice || 0,
          });
        }
      });

      const res = await fetch(`/api/orders/${order.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: newItems }),
      });

      if (res.ok) {
        setEditItemsMode(false);
        onOrderUpdate?.();
      } else {
        const data = await res.json();
        alert(data.error || "Errore salvataggio items");
      }
    } catch (error) {
      alert("Errore salvataggio items");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "orders", order.id));
      onOrderDelete?.();
      onClose();
    } catch (error) {
      alert("Errore eliminazione");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleAssignRider = async (riderId: string, riderName: string) => {
    if (!canAssignRider) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId, riderName }),
      });
      if (res.ok) {
        setShowAssignRider(false);
        onOrderUpdate?.();
      }
    } catch (e) {}
    finally { setLoading(false); }
  };

  const handleRemoveRider = async () => {
    if (!canAssignRider || !order.riderName) return;
    if (!confirm(`Rimuovere ${order.riderName}?`)) return;
    setLoading(true);
    try {
      await fetch(`/api/orders/${order.id}/assign`, { method: "DELETE" });
      onOrderUpdate?.();
    } catch (e) {}
    finally { setLoading(false); }
  };

  const toggleUrgency = async () => {
    if (!canToggleUrgency) return;
    setLoading(true);
    try {
      await fetch(`/api/orders/${order.id}/urgency`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urgency: order.urgency === 'urgent' ? 'normal' : 'urgent', userRole }),
      });
      onOrderUpdate?.();
    } catch (e) {}
    finally { setLoading(false); }
  };

  const handleQuantityChange = (itemId: string, delta: number) => {
    setEditedItems(prev => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] || 0) + delta)
    }));
  };

  const handleQuantityInput = (itemId: string, value: string) => {
    const num = parseInt(value) || 0;
    setEditedItems(prev => ({
      ...prev,
      [itemId]: Math.max(0, num)
    }));
  };

  // Raggruppa items dell'ordine per categoria
  const getOrderItemsByCategory = () => {
    const grouped: { [catId: string]: OrderItem[] } = {};
    order.items?.forEach(item => {
      const invItem = inventory.find(i => i.id === item.id);
      const catId = invItem?.categoryId || 'altro';
      if (!grouped[catId]) grouped[catId] = [];
      grouped[catId].push(item);
    });
    return grouped;
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-[100]"
        onClick={onClose}
      />
      
      {/* Modal Full Screen Mobile / Centered Desktop */}
      <div className="fixed inset-0 z-[101] flex flex-col bg-white sm:inset-4 sm:rounded-2xl sm:m-auto sm:max-w-2xl sm:max-h-[90vh] overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className={`flex-shrink-0 ${isUrgent ? 'bg-red-500' : 'bg-gradient-to-r from-orange-500 to-amber-500'}`}>
          {/* Handle Mobile */}
          <div className="pt-2 sm:hidden">
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto" />
          </div>
          
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">📦</span>
                  <h2 className="text-lg font-bold text-white truncate">
                    {editItemsMode ? "Modifica Carico" : "Dettaglio Consegna"}
                  </h2>
                  {isUrgent && <span className="text-xs bg-white/20 px-2 py-0.5 rounded">🚨 URGENTE</span>}
                </div>
                <p className="text-white/90 text-sm font-medium truncate">{order.propertyName}</p>
                <p className="text-white/70 text-xs truncate">{order.propertyAddress}</p>
              </div>
              <button 
                onClick={editItemsMode ? () => {
                  setEditItemsMode(false);
                  // Reset items
                  const itemsMap: {[key: string]: number} = {};
                  order.items?.forEach(item => { itemsMap[item.id] = item.quantity; });
                  setEditedItems(itemsMap);
                } : onClose}
                className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Info Badge */}
            {!editItemsMode && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${statusConfig.bg} ${statusConfig.text}`}>
                  {statusConfig.icon} {statusConfig.label}
                </span>
                {scheduledDate && (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/20 text-white">
                    📅 {scheduledDate.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                )}
                {order.scheduledTime && (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/20 text-white">
                    🕐 {order.scheduledTime}
                  </span>
                )}
              </div>
            )}

            {/* Totale in modalità modifica items */}
            {editItemsMode && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-white/80 text-sm">Totale carico:</span>
                <span className="text-white text-xl font-bold">€{calculateEditedTotal().toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content Scrollabile */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          
          {/* MODALITÀ MODIFICA ITEMS */}
          {editItemsMode ? (
            <div className="p-4 space-y-4">
              {loadingInventory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                  <span className="ml-3 text-slate-500">Caricamento inventario...</span>
                </div>
              ) : (
                <>
                  {/* Info */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
                    <strong>💡</strong> Seleziona gli articoli da consegnare. Usa +/- per modificare le quantità.
                  </div>

                  {/* Categorie con items */}
                  {allCategories.map(category => {
                    if (category.items.length === 0) return null;
                    
                    const colors = CATEGORY_COLORS[category.id] || CATEGORY_COLORS.altro;
                    const catCount = countCategoryItems(category.id);
                    
                    return (
                      <div key={category.id} className={`${colors.bg} rounded-2xl border ${colors.border} overflow-hidden`}>
                        {/* Category Header */}
                        <div className={`px-4 py-3 ${colors.text} font-semibold flex items-center justify-between`}>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{CATEGORY_ICONS[category.id] || "📦"}</span>
                            <span>{CATEGORY_NAMES[category.id] || category.name}</span>
                          </div>
                          {catCount > 0 && (
                            <span className="px-2 py-0.5 bg-white/80 rounded-lg text-xs font-bold">
                              {catCount} pz
                            </span>
                          )}
                        </div>
                        
                        {/* Items Grid */}
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {category.items.map(item => {
                            const qty = editedItems[item.id] || 0;
                            return (
                              <div key={item.id} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-slate-700 truncate flex-1">{item.name}</span>
                                  <span className={`text-xs ${colors.text} ml-2 font-medium`}>€{item.sellPrice?.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleQuantityChange(item.id, -1)}
                                    className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-200 font-bold text-lg"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    value={qty}
                                    onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                                    className={`w-14 h-9 text-center border rounded-lg font-semibold text-sm ${
                                      qty > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200'
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleQuantityChange(item.id, 1)}
                                    className={`w-9 h-9 rounded-lg ${colors.button} text-white flex items-center justify-center font-bold text-lg`}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : (
            /* VISTA NORMALE */
            <div className="p-4 space-y-4">
              
              {/* Articoli da Consegnare */}
              <div className="bg-emerald-50 rounded-2xl border border-emerald-200 overflow-hidden">
                <div className="px-4 py-3 bg-emerald-100/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📤</span>
                    <span className="font-semibold text-emerald-800">Da Consegnare</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-emerald-600">€{totalPrice.toFixed(2)}</span>
                    {canEdit && (
                      <button
                        onClick={() => setEditItemsMode(true)}
                        className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors"
                      >
                        ✏️ Modifica Carico
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="p-3">
                  {order.items && order.items.length > 0 ? (
                    <div className="space-y-2">
                      {/* Raggruppa per categoria */}
                      {Object.entries(getOrderItemsByCategory()).map(([catId, items]) => (
                        <div key={catId}>
                          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                            <span>{CATEGORY_ICONS[catId] || "📦"}</span>
                            {CATEGORY_NAMES[catId] || catId}
                          </div>
                          {items.map((item, idx) => {
                            const invItem = inventory.find(i => i.id === item.id);
                            const itemPrice = item.price || invItem?.sellPrice || 0;
                            const itemName = invItem?.name || item.name || item.id;
                            return (
                              <div key={idx} className="flex items-center justify-between py-2 px-3 bg-white rounded-xl mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-sm">
                                    {item.quantity}
                                  </span>
                                  <span className="text-sm text-slate-700">{itemName}</span>
                                </div>
                                <span className="text-sm text-emerald-600 font-medium">€{(itemPrice * item.quantity).toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-emerald-600 text-sm italic text-center py-4">Nessun articolo selezionato</p>
                  )}
                </div>
              </div>

              {/* Biancheria da Ritirare */}
              {order.includePickup !== false && (
                <div className="bg-orange-50 rounded-2xl border border-orange-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📥</span>
                    <span className="font-semibold text-orange-800">Biancheria da Ritirare</span>
                  </div>
                  {order.pickupItems && order.pickupItems.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {order.pickupItems.map((item, idx) => (
                        <span key={idx} className="px-3 py-1.5 bg-white rounded-xl text-sm border border-orange-200">
                          <span className="font-bold text-orange-600">{item.quantity}x</span> {item.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-orange-600 text-sm italic">Nessun articolo da ritirare</p>
                  )}
                </div>
              )}

              {/* Rider Assegnato */}
              <div className="bg-violet-50 rounded-2xl border border-violet-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🚴</span>
                  <span className="font-semibold text-violet-800">Rider Assegnato</span>
                </div>
                {order.riderName ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-lg">
                        <span className="text-white font-bold text-sm">
                          {order.riderName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <span className="font-medium text-slate-800">{order.riderName}</span>
                    </div>
                    {canAssignRider && (
                      <button onClick={handleRemoveRider} className="text-sm text-red-500 font-medium hover:text-red-600">
                        Rimuovi
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-violet-600 text-sm italic">Nessun rider assegnato</p>
                    {canAssignRider && (
                      <button
                        onClick={() => setShowAssignRider(true)}
                        className="px-4 py-2 bg-violet-500 text-white text-sm font-medium rounded-xl hover:bg-violet-600"
                      >
                        + Assegna Rider
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Note */}
              {(order.notes || editMode) && (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">📝</span>
                    <span className="font-semibold text-slate-700">Note</span>
                  </div>
                  {editMode ? (
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="Note per la consegna..."
                    />
                  ) : (
                    <p className="text-slate-600 text-sm">{order.notes}</p>
                  )}
                </div>
              )}

              {/* Orario in modalità edit */}
              {editMode && (
                <div className="bg-sky-50 rounded-2xl border border-sky-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🕐</span>
                    <span className="font-semibold text-sky-700">Orario Consegna</span>
                  </div>
                  <input
                    type="time"
                    value={formData.scheduledTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-sky-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Fisso */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200 bg-white" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          {editItemsMode ? (
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setEditItemsMode(false);
                  const itemsMap: {[key: string]: number} = {};
                  order.items?.forEach(item => { itemsMap[item.id] = item.quantity; });
                  setEditedItems(itemsMap);
                }} 
                className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50"
              >
                Annulla
              </button>
              <button 
                onClick={handleSaveItems} 
                disabled={loading} 
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-lg disabled:opacity-50"
              >
                {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "💾 Salva Carico"}
              </button>
            </div>
          ) : editMode ? (
            <div className="flex gap-3">
              <button onClick={() => setEditMode(false)} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50">
                Annulla
              </button>
              <button onClick={handleSave} disabled={loading} className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-lg disabled:opacity-50">
                {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "💾 Salva"}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              {canDelete && (
                <button onClick={() => setShowDeleteConfirm(true)} className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center text-xl hover:bg-red-100">
                  🗑️
                </button>
              )}
              {canToggleUrgency && (
                <button 
                  onClick={toggleUrgency} 
                  disabled={loading}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${isUrgent ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {isUrgent ? '🚨' : '📦'}
                </button>
              )}
              <button onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50">
                Chiudi
              </button>
              {canEdit && (
                <button onClick={() => setEditMode(true)} className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-bold hover:shadow-lg">
                  ✏️ Modifica
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Conferma Eliminazione */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[102] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">🗑️</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800">Eliminare questa consegna?</h3>
              <p className="text-sm text-slate-500 mt-1">{order.propertyName}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50">
                Annulla
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-600 disabled:opacity-50">
                {deleting ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Assegna Rider */}
      {showAssignRider && (
        <div className="fixed inset-0 z-[102] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAssignRider(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[70vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3">
              <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-2 sm:hidden" />
              <h3 className="text-lg font-bold text-white">Assegna Rider</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {riders.length === 0 ? (
                <p className="text-center text-slate-500 py-8">Nessun rider disponibile</p>
              ) : (
                <div className="space-y-2">
                  {riders.map((rider, index) => {
                    const colors = ["from-orange-400 to-red-500", "from-cyan-400 to-blue-500", "from-pink-400 to-rose-500", "from-lime-400 to-green-500", "from-purple-400 to-indigo-500"];
                    return (
                      <button 
                        key={rider.id} 
                        onClick={() => handleAssignRider(rider.id, rider.name)} 
                        disabled={loading}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200 hover:border-violet-400 hover:bg-violet-50 transition-all"
                      >
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-r ${colors[index % colors.length]} flex items-center justify-center shadow-lg`}>
                          <span className="text-sm font-bold text-white">{rider.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                        </div>
                        <span className="font-medium text-slate-800">{rider.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
              <button onClick={() => setShowAssignRider(false)} className="w-full py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
