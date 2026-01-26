"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { SGROSSO_REASONS, SgrossoReasonCode } from "~/types/serviceType";

interface Property {
  id: string;
  name: string;
  address: string;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  usesOwnLinen?: boolean;
  cleaningPrice?: number;
  ownerId?: string;
  imageUrl?: string;
}

interface SelectedItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  category?: string;
}

interface InventoryItem {
  id: string;
  key: string;
  name: string;
  icon: string;
  category: string;
  sellPrice: number;
}

interface InventoryCategory {
  id: string;
  name: string;
  icon: string;
  items: InventoryItem[];
}

interface GuestConfig {
  beds: string[];
  bl: Record<string, Record<string, number>>;
  ba: Record<string, number>;
  ki: Record<string, number>;
  ex: Record<string, boolean>;
}

interface ServiceType {
  id: string;
  name: string;
  code: string;
  icon: string;
  color: string;
  adminOnly: boolean;
  clientCanRequest: boolean;
  requiresApproval: boolean;
  requiresReason: boolean;
  requiresManualPrice: boolean;
}

interface NewCleaningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedPropertyId?: string;
  userRole?: "ADMIN" | "PROPRIETARIO";
  ownerId?: string;
  defaultRequestType?: "cleaning" | "linen_only";
}

const formatPrice = (price: number): string => price.toFixed(2);

export default function NewCleaningModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedPropertyId,
  userRole = "ADMIN",
  ownerId,
  defaultRequestType = "cleaning",
}: NewCleaningModalProps) {
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [propertySearch, setPropertySearch] = useState("");
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    propertyId: preselectedPropertyId || "",
    scheduledDate: new Date().toISOString().split("T")[0],
    scheduledTime: "10:00",
    guestsCount: 0,
    notes: "",
    type: "MANUAL" as const,
    requestType: defaultRequestType as "cleaning" | "linen_only",
    createLinenOrder: true,
    urgency: "normal" as "normal" | "urgent",
    includePickup: true, // Default ON - ritiro biancheria sporca
  });

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [isModified, setIsModified] = useState(false);
  
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategory[]>([]);
  const [allInventoryItems, setAllInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  
  const [propertyConfigs, setPropertyConfigs] = useState<Record<number, GuestConfig>>({});
  const [cleaningPrice, setCleaningPrice] = useState<number>(0);
  const [loadingConfig, setLoadingConfig] = useState(false);
  
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(true);
  const [selectedServiceType, setSelectedServiceType] = useState<string>("STANDARD");
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [sgrossoReason, setSgrossoReason] = useState<SgrossoReasonCode | "">("");
  const [sgrossoNotes, setSgrossoNotes] = useState<string>("");

  // Listener proprietà
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "properties"), orderBy("name", "asc")),
      (snapshot) => {
        const props = snapshot.docs
          .filter(doc => {
            const data = doc.data();
            if (data.status !== "ACTIVE") return false;
            if (userRole === "PROPRIETARIO" && ownerId) return data.ownerId === ownerId;
            return true;
          })
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || "",
              address: data.address || "",
              bedrooms: data.bedrooms,
              bathrooms: data.bathrooms,
              maxGuests: data.maxGuests || 10,
              usesOwnLinen: data.usesOwnLinen || false,
              cleaningPrice: data.cleaningPrice || 0,
              ownerId: data.ownerId,
              imageUrl: data.imageUrl || "",
            };
          });
        setProperties(props);
        setLoadingProperties(false);
      },
      () => setLoadingProperties(false)
    );
    return () => unsubscribe();
  }, [userRole, ownerId]);

  useEffect(() => {
    if (isOpen) setFormData(prev => ({ ...prev, requestType: defaultRequestType }));
  }, [isOpen, defaultRequestType]);

  useEffect(() => {
    async function loadServiceTypes() {
      try {
        const res = await fetch("/api/service-types?activeOnly=true");
        const data = await res.json();
        setServiceTypes(data.serviceTypes || []);
      } catch (error) {
        console.error("Errore caricamento tipi servizio:", error);
      } finally {
        setLoadingServiceTypes(false);
      }
    }
    if (isOpen) {
      loadServiceTypes();
      setSelectedServiceType("STANDARD");
      setCustomPrice(null);
      setSgrossoReason("");
      setSgrossoNotes("");
    }
  }, [isOpen]);

  useEffect(() => {
    async function loadInventory() {
      setLoadingInventory(true);
      try {
        const res = await fetch('/api/inventory/list');
        const data = await res.json();
        const categories: InventoryCategory[] = [];
        const allItems: InventoryItem[] = [];
        data.categories?.forEach((cat: any) => {
          const catItems: InventoryItem[] = [];
          cat.items?.forEach((item: any) => {
            const icon = cat.id === 'biancheria_letto' ? '🛏️' : cat.id === 'biancheria_bagno' ? '🛁' : cat.id === 'kit_cortesia' ? '🧴' : '📦';
            const invItem = { id: item.key || item.id, key: item.key || item.id, name: item.name, icon, category: cat.id, sellPrice: item.sellPrice || 0 };
            catItems.push(invItem);
            allItems.push(invItem);
          });
          if (catItems.length > 0) {
            const icon = cat.id === 'biancheria_letto' ? '🛏️' : cat.id === 'biancheria_bagno' ? '🛁' : cat.id === 'kit_cortesia' ? '🧴' : '📦';
            categories.push({ id: cat.id, name: cat.name, icon, items: catItems });
          }
        });
        setInventoryCategories(categories);
        setAllInventoryItems(allItems);
      } catch (err) {
        console.error('Errore caricamento inventario:', err);
      } finally {
        setLoadingInventory(false);
      }
    }
    if (isOpen) loadInventory();
  }, [isOpen]);

  const loadPropertyConfig = async (propertyId: string) => {
    setLoadingConfig(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}`);
      if (res.ok) {
        const data = await res.json();
        setCleaningPrice(data.cleaningPrice || 65);
        setPropertyConfigs(data.serviceConfigs && typeof data.serviceConfigs === 'object' ? data.serviceConfigs : {});
      }
    } catch (err) {
      console.error('Errore caricamento config:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  const applyStandardConfig = (guestsCount: number) => {
    if (guestsCount <= 0 || !propertyConfigs[guestsCount]) {
      setSelectedItems([]);
      return;
    }
    const config = propertyConfigs[guestsCount];
    const items: SelectedItem[] = [];
    if (config.bl?.['all']) {
      Object.entries(config.bl['all']).forEach(([itemId, qty]) => {
        if (qty > 0) {
          const invItem = allInventoryItems.find(i => i.id === itemId || i.key === itemId);
          if (invItem) items.push({ id: invItem.id, name: invItem.name, quantity: qty as number, price: invItem.sellPrice, category: 'biancheria_letto' });
        }
      });
    }
    if (config.ba) {
      Object.entries(config.ba).forEach(([itemId, qty]) => {
        if (qty > 0) {
          const invItem = allInventoryItems.find(i => i.id === itemId || i.key === itemId);
          if (invItem) items.push({ id: invItem.id, name: invItem.name, quantity: qty as number, price: invItem.sellPrice, category: 'biancheria_bagno' });
        }
      });
    }
    if (config.ki) {
      Object.entries(config.ki).forEach(([itemId, qty]) => {
        if (qty > 0) {
          const invItem = allInventoryItems.find(i => i.id === itemId || i.key === itemId);
          if (invItem) items.push({ id: invItem.id, name: invItem.name, quantity: qty as number, price: invItem.sellPrice, category: 'kit_cortesia' });
        }
      });
    }
    setSelectedItems(items);
    setIsModified(false);
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedItems([]);
      setActiveCategory("all");
      setIsModified(false);
      setPropertyConfigs({});
      setFormData(prev => ({ ...prev, guestsCount: 0 }));
      setCurrentStep(1);
      setPropertySearch("");
      setShowPropertyDropdown(false);
      if (preselectedPropertyId) {
        const prop = properties.find(p => p.id === preselectedPropertyId);
        if (prop) {
          setSelectedProperty(prop);
          setFormData(prev => ({ ...prev, propertyId: prop.id }));
          setPropertySearch(prop.name);
          loadPropertyConfig(prop.id);
        }
      }
    }
  }, [isOpen, preselectedPropertyId, properties]);

  useEffect(() => {
    if (formData.guestsCount > 0 && formData.createLinenOrder && !isModified) {
      applyStandardConfig(formData.guestsCount);
    }
  }, [formData.guestsCount, formData.createLinenOrder, allInventoryItems, propertyConfigs, isModified]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPropertyDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePropertySelect = (prop: Property) => {
    setSelectedProperty(prop);
    setFormData(prev => ({ ...prev, propertyId: prop.id, guestsCount: 0 }));
    setPropertySearch(prop.name);
    setShowPropertyDropdown(false);
    loadPropertyConfig(prop.id);
    setSelectedItems([]);
    setIsModified(false);
  };

  const handleGuestsChange = (value: number) => {
    setFormData(prev => ({ ...prev, guestsCount: value }));
    if (!isModified && formData.createLinenOrder) applyStandardConfig(value);
  };

  const handleAddItem = (item: InventoryItem) => {
    setIsModified(true);
    setSelectedItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: item.id, name: item.name, quantity: 1, price: item.sellPrice, category: item.category }];
    });
  };

  const handleItemQuantityChange = (itemId: string, newQty: number) => {
    setIsModified(true);
    if (newQty <= 0) setSelectedItems(prev => prev.filter(i => i.id !== itemId));
    else setSelectedItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: newQty } : i));
  };

  const handleRemoveItem = (itemId: string) => {
    setIsModified(true);
    setSelectedItems(prev => prev.filter(i => i.id !== itemId));
  };

  const filteredProperties = useMemo(() => {
    if (!propertySearch.trim()) return properties;
    const search = propertySearch.toLowerCase();
    return properties.filter(p => p.name.toLowerCase().includes(search) || p.address.toLowerCase().includes(search));
  }, [properties, propertySearch]);

  const availableServiceTypes = useMemo(() => {
    return serviceTypes.filter(st => userRole === "ADMIN" || (!st.adminOnly && st.clientCanRequest));
  }, [serviceTypes, userRole]);

  const selectedType = useMemo(() => serviceTypes.find(st => st.code === selectedServiceType), [serviceTypes, selectedServiceType]);
  const isSgrosso = selectedServiceType === "SGROSSO";
  const effectivePrice = useMemo(() => customPrice !== null ? customPrice : (selectedType?.requiresManualPrice ? 0 : cleaningPrice), [customPrice, selectedType, cleaningPrice]);
  const priceIsModified = customPrice !== null && customPrice !== cleaningPrice;
  const linenTotal = useMemo(() => selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0), [selectedItems]);
  const totalPrice = useMemo(() => {
    if (formData.requestType === "linen_only") return linenTotal;
    return effectivePrice + (formData.createLinenOrder ? linenTotal : 0);
  }, [effectivePrice, linenTotal, formData.requestType, formData.createLinenOrder]);
  const filteredItems = useMemo(() => activeCategory === "all" ? allInventoryItems : allInventoryItems.filter(item => item.category === activeCategory), [allInventoryItems, activeCategory]);
  const canProceedToStep2 = formData.propertyId && formData.scheduledDate && (formData.requestType === "linen_only" || selectedServiceType);
  const guestsValid = formData.guestsCount > 0;

  const handleSubmit = async () => {
    if (saving) return;
    if (isSgrosso && !sgrossoReason) { alert("Seleziona il motivo dello sgrosso"); return; }
    if (isSgrosso && sgrossoReason === "ALTRO" && !sgrossoNotes.trim()) { alert("Specifica il motivo nelle note"); return; }

    setSaving(true);
    try {
      const sgrossoReasonObj = SGROSSO_REASONS.find(r => r.code === sgrossoReason);
      
      // Prepara i dati per l'API
      const apiData = {
        propertyId: formData.propertyId,
        scheduledDate: formData.scheduledDate,
        scheduledTime: formData.scheduledTime,
        guestsCount: formData.guestsCount,
        notes: formData.notes,
        type: selectedServiceType === "SGROSSO" ? "SGROSSO" : "MANUAL",
        createLinenOrder: formData.createLinenOrder,
        linenOnly: formData.requestType === "linen_only",
        customLinenItems: selectedItems.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price || 0,
        })),
        cleaningPrice: effectivePrice,
        urgency: formData.urgency,
        includePickup: formData.includePickup,
        // Dati sgrosso
        sgrossoReason: isSgrosso ? sgrossoReason : null,
        sgrossoReasonLabel: isSgrosso && sgrossoReasonObj ? sgrossoReasonObj.label : null,
        sgrossoNotes: isSgrosso ? sgrossoNotes : null,
      };
      
      const response = await fetch("/api/cleanings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Errore nella creazione");
      alert(data.message || "Creato con successo!");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Errore:", error);
      alert(error.message || "Errore nella creazione");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-xl">{formData.requestType === "linen_only" ? "🛏️" : "🧹"}</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{formData.requestType === "linen_only" ? "Richiedi Biancheria" : "Nuova Pulizia"}</h2>
                <p className="text-xs text-white/80">Step {currentStep} di 2 • {currentStep === 1 ? "Proprietà e Servizio" : "Ospiti e Dotazioni"}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <div className={`h-1 flex-1 rounded-full ${currentStep >= 1 ? 'bg-white' : 'bg-white/30'}`}></div>
            <div className={`h-1 flex-1 rounded-full ${currentStep >= 2 ? 'bg-white' : 'bg-white/30'}`}></div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5" onScroll={() => setShowPropertyDropdown(false)}>
          {currentStep === 1 && (
            <div className="space-y-5">
              {/* Tipo Richiesta */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Cosa vuoi richiedere?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, requestType: "cleaning" }))}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${formData.requestType === "cleaning" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                    <span className="text-2xl block mb-1">🧹</span>
                    <span className="font-semibold text-slate-800">Pulizia</span>
                  </button>
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, requestType: "linen_only" }))}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${formData.requestType === "linen_only" ? "border-sky-500 bg-sky-50" : "border-slate-200"}`}>
                    <span className="text-2xl block mb-1">🛏️</span>
                    <span className="font-semibold text-slate-800">Solo Biancheria</span>
                  </button>
                </div>
              </div>

              {/* Proprietà */}
              <div ref={dropdownRef}>
                <label className="block text-sm font-semibold text-slate-700 mb-2">🏠 Proprietà <span className="text-red-500">*</span></label>
                {loadingProperties ? (
                  <div className="animate-pulse bg-slate-100 h-12 rounded-xl"></div>
                ) : (
                  <div className="relative">
                    <input type="text" value={propertySearch}
                      onChange={(e) => { setPropertySearch(e.target.value); setShowPropertyDropdown(true); if (!e.target.value) { setSelectedProperty(null); setFormData(prev => ({ ...prev, propertyId: "" })); } }}
                      onFocus={() => setShowPropertyDropdown(true)}
                      placeholder="🔍 Cerca proprietà..."
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none" />
                    {showPropertyDropdown && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {filteredProperties.length === 0 ? (
                          <div className="p-4 text-center text-slate-500">Nessuna proprietà trovata</div>
                        ) : filteredProperties.map(prop => (
                          <button key={prop.id} type="button" onClick={() => handlePropertySelect(prop)}
                            className={`w-full p-3 flex items-center gap-3 hover:bg-emerald-50 text-left border-b border-slate-100 last:border-0 ${selectedProperty?.id === prop.id ? 'bg-emerald-50' : ''}`}>
                            <div className="w-12 h-12 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
                              {prop.imageUrl ? <img src={prop.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400">🏠</div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-800 truncate">{prop.name}</p>
                              <p className="text-xs text-slate-500 truncate">{prop.address}</p>
                              <p className="text-[10px] text-slate-400">Max {prop.maxGuests} ospiti</p>
                            </div>
                            {selectedProperty?.id === prop.id && <span className="text-emerald-500">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedProperty && (
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-white shadow-sm overflow-hidden flex-shrink-0">
                      {selectedProperty.imageUrl ? <img src={selectedProperty.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-emerald-100 text-emerald-500 text-2xl">🏠</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-emerald-800 truncate">{selectedProperty.name}</p>
                      <p className="text-xs text-emerald-600 truncate">{selectedProperty.address}</p>
                      <div className="flex gap-3 mt-1 text-[10px] text-emerald-700">
                        <span>🛏️ {selectedProperty.bedrooms || 1} camere</span>
                        <span>👥 Max {selectedProperty.maxGuests}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Data e Orario */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">📅 Data *</label>
                  <input type="date" value={formData.scheduledDate} onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))} min={new Date().toISOString().split("T")[0]} className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    ⏰ {formData.requestType === "linen_only" ? "Ora Consegna" : "Orario"}
                  </label>
                  <select value={formData.scheduledTime} onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))} className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none">
                    {["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Disclaimer per Solo Biancheria */}
              {formData.requestType === "linen_only" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500 text-lg">ℹ️</span>
                    <div>
                      <p className="text-xs text-amber-800 font-medium">Orario indicativo</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        L'orario di consegna è indicativo. La consegna verrà effettuata in base alla disponibilità dei rider, 
                        nei tempi tra check-in e check-out.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Ritiro Biancheria Sporca - Toggle (Admin può disattivare) */}
              {(formData.requestType === "linen_only" || formData.createLinenOrder) && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📥</span>
                      <div>
                        <span className="font-semibold text-slate-800 block">Ritiro biancheria sporca</span>
                        <span className="text-xs text-slate-500">
                          {formData.includePickup 
                            ? "Il rider ritirerà la biancheria delle consegne precedenti" 
                            : "Solo consegna, nessun ritiro"}
                        </span>
                      </div>
                    </div>
                    {userRole === "ADMIN" ? (
                      <div 
                        onClick={() => setFormData(prev => ({ ...prev, includePickup: !prev.includePickup }))} 
                        className={`w-14 h-8 rounded-full p-1 cursor-pointer transition-colors ${formData.includePickup ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      >
                        <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${formData.includePickup ? 'translate-x-6' : 'translate-x-0'}`}></div>
                      </div>
                    ) : (
                      <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg">
                        ✓ Attivo
                      </span>
                    )}
                  </div>
                  {!formData.includePickup && userRole === "ADMIN" && (
                    <p className="text-xs text-amber-600 mt-3 flex items-center gap-1 bg-amber-50 p-2 rounded-lg">
                      <span>⚠️</span> Ritiro disattivato - Il rider porterà solo la biancheria pulita
                    </p>
                  )}
                </div>
              )}

              {/* Urgenza - Solo per Admin */}
              {userRole === "ADMIN" && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">🚨 Urgenza</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      type="button" 
                      onClick={() => setFormData(prev => ({ ...prev, urgency: "normal" }))}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${formData.urgency === "normal" ? "border-slate-500 bg-slate-50" : "border-slate-200"}`}
                    >
                      <span className="text-xl block mb-1">📦</span>
                      <span className="font-semibold text-slate-700 text-sm">Normale</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setFormData(prev => ({ ...prev, urgency: "urgent" }))}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${formData.urgency === "urgent" ? "border-red-500 bg-red-50" : "border-slate-200"}`}
                    >
                      <span className="text-xl block mb-1">🚨</span>
                      <span className="font-semibold text-red-700 text-sm">URGENTE</span>
                    </button>
                  </div>
                  {formData.urgency === "urgent" && (
                    <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                      <span>⚠️</span> I rider riceveranno una notifica immediata per questo ordine urgente
                    </p>
                  )}
                </div>
              )}

              {/* Tipo Servizio */}
              {formData.requestType === "cleaning" && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">🧹 Tipo di Servizio</label>
                  {loadingServiceTypes ? <div className="animate-pulse bg-slate-100 h-24 rounded-xl"></div> : (
                    <div className="grid grid-cols-3 gap-2">
                      {availableServiceTypes.map(st => (
                        <button key={st.code} type="button" onClick={() => { setSelectedServiceType(st.code); if (st.code !== "SGROSSO") { setSgrossoReason(""); setSgrossoNotes(""); } }}
                          className={`p-3 rounded-xl border-2 text-center ${selectedServiceType === st.code ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                          <span className="text-2xl block mb-1">{st.icon}</span>
                          <span className="text-xs font-semibold text-slate-700">{st.name}</span>
                          {st.adminOnly && <span className="text-[9px] text-amber-600 block">Solo Admin</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {isSgrosso && (
                    <div className="mt-3 bg-red-50 p-4 rounded-xl border border-red-200">
                      <label className="block text-sm font-semibold text-red-700 mb-2">Motivo Sgrosso *</label>
                      <select value={sgrossoReason} onChange={(e) => setSgrossoReason(e.target.value as SgrossoReasonCode)} className="w-full px-4 py-3 border border-red-200 rounded-xl bg-white text-sm">
                        <option value="">Seleziona motivo...</option>
                        {SGROSSO_REASONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                      </select>
                      {sgrossoReason === "ALTRO" && <textarea value={sgrossoNotes} onChange={(e) => setSgrossoNotes(e.target.value)} placeholder="Specifica..." rows={2} className="w-full mt-2 px-4 py-3 border border-red-200 rounded-xl bg-white text-sm resize-none" />}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-5">
              {/* Numero Ospiti */}
              {formData.requestType === "cleaning" && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">👥 Numero Ospiti *</label>
                  <div className="flex items-center justify-center gap-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <button type="button" onClick={() => handleGuestsChange(Math.max(0, formData.guestsCount - 1))} disabled={formData.guestsCount <= 0} className="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 hover:border-emerald-500 disabled:opacity-50">−</button>
                    <div className="text-center px-6">
                      <span className="text-3xl font-bold text-emerald-600">{formData.guestsCount || "—"}</span>
                      <p className="text-xs text-slate-500 mt-1">{formData.guestsCount === 1 ? "ospite" : "ospiti"}</p>
                    </div>
                    <button type="button" onClick={() => handleGuestsChange(Math.min(selectedProperty?.maxGuests || 10, formData.guestsCount + 1))} disabled={formData.guestsCount >= (selectedProperty?.maxGuests || 10)} className="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 hover:border-emerald-500 disabled:opacity-50">+</button>
                  </div>
                  {!guestsValid && <p className="text-xs text-amber-600 mt-2 text-center">⚠️ Seleziona il numero di ospiti</p>}
                </div>
              )}

              {/* Toggle Biancheria */}
              {formData.requestType === "cleaning" && (
                <div className="bg-sky-50 rounded-xl p-4 border border-sky-200">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🛏️</span>
                      <div>
                        <span className="font-semibold text-sky-800 block">Includi Biancheria</span>
                        <span className="text-xs text-sky-600">{formData.createLinenOrder ? "Biancheria inclusa" : "Solo pulizia"}</span>
                      </div>
                    </div>
                    <div onClick={() => setFormData(prev => ({ ...prev, createLinenOrder: !prev.createLinenOrder }))} className={`w-14 h-8 rounded-full p-1 cursor-pointer ${formData.createLinenOrder ? 'bg-sky-500' : 'bg-slate-300'}`}>
                      <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${formData.createLinenOrder ? 'translate-x-6' : 'translate-x-0'}`}></div>
                    </div>
                  </label>
                </div>
              )}

              {/* Sezione Biancheria */}
              {(formData.requestType === "linen_only" || (formData.requestType === "cleaning" && formData.createLinenOrder && guestsValid)) && (
                <div className="border-2 border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">📦 {formData.requestType === "linen_only" ? "Articoli" : `Dotazioni per ${formData.guestsCount} ospiti`}</h3>
                  </div>
                  {loadingInventory || loadingConfig ? (
                    <div className="p-8 text-center"><div className="animate-spin w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full mx-auto"></div></div>
                  ) : (
                    <>
                      {selectedItems.length > 0 ? (
                        <div className="p-3 border-b border-slate-200 bg-emerald-50/50">
                          <p className="text-[10px] font-semibold text-emerald-700 mb-2">✓ SELEZIONATI ({selectedItems.length})</p>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {selectedItems.map(item => (
                              <div key={item.id} className="flex items-center justify-between bg-white rounded-lg p-2 shadow-sm">
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-medium text-slate-700 truncate block">{item.name}</span>
                                  <span className="text-[10px] text-slate-400">€{formatPrice(item.price)} × {item.quantity}</span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button type="button" onClick={() => handleItemQuantityChange(item.id, item.quantity - 1)} className="w-6 h-6 rounded-lg bg-slate-100 border flex items-center justify-center font-bold text-slate-600 text-sm">−</button>
                                  <span className="w-6 text-center font-bold text-emerald-700 text-sm">{item.quantity}</span>
                                  <button type="button" onClick={() => handleItemQuantityChange(item.id, item.quantity + 1)} className="w-6 h-6 rounded-lg bg-slate-100 border flex items-center justify-center font-bold text-slate-600 text-sm">+</button>
                                  <button type="button" onClick={() => handleRemoveItem(item.id)} className="w-6 h-6 rounded-lg bg-red-50 text-red-500 flex items-center justify-center ml-1 text-sm">✕</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : <div className="p-4 border-b border-slate-200 text-center text-xs text-slate-500">Nessun articolo selezionato</div>}
                      <div className="px-3 py-2 border-b border-slate-100 bg-white overflow-x-auto">
                        <div className="flex gap-1.5 min-w-max">
                          <button type="button" onClick={() => setActiveCategory("all")} className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${activeCategory === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>Tutti</button>
                          {inventoryCategories.map(cat => (
                            <button key={cat.id} type="button" onClick={() => setActiveCategory(cat.id)} className={`px-3 py-1.5 rounded-full text-[11px] font-medium flex items-center gap-1 ${activeCategory === cat.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>{cat.icon} {cat.name}</button>
                          ))}
                        </div>
                      </div>
                      <div className="p-3 bg-white">
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                          {filteredItems.map(item => {
                            const isSelected = selectedItems.some(i => i.id === item.id);
                            const selectedQty = selectedItems.find(i => i.id === item.id)?.quantity || 0;
                            return (
                              <button key={item.id} type="button" onClick={() => handleAddItem(item)} className={`p-2 rounded-lg border text-left ${isSelected ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`}>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">{item.icon}</span>
                                  <span className="text-[11px] font-medium text-slate-700 truncate">{item.name}</span>
                                </div>
                                <div className="flex justify-between items-center mt-0.5">
                                  <span className="text-[10px] text-slate-400">€{formatPrice(item.sellPrice)}</span>
                                  {isSelected && <span className="text-[10px] text-emerald-600">✓ {selectedQty}</span>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">📝 Note (opzionale)</label>
                <textarea value={formData.notes} onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))} rows={2} placeholder="Istruzioni speciali..." className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl resize-none focus:border-emerald-500 outline-none text-sm" />
              </div>

              {/* Riepilogo */}
              {(guestsValid || formData.requestType === "linen_only") && (
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
                  <h3 className="font-semibold text-slate-800 mb-3">💰 Riepilogo Costi</h3>
                  <div className="space-y-2 text-sm">
                    {formData.requestType === "cleaning" && <div className="flex justify-between"><span className="text-slate-600">Pulizia</span><span className="font-medium">€{formatPrice(effectivePrice)}</span></div>}
                    {(formData.createLinenOrder || formData.requestType === "linen_only") && selectedItems.length > 0 && <div className="flex justify-between"><span className="text-slate-600">Biancheria</span><span className="font-medium">€{formatPrice(linenTotal)}</span></div>}
                    <div className="border-t border-slate-200 pt-2 flex justify-between"><span className="font-bold text-slate-800">TOTALE</span><span className="text-xl font-bold text-emerald-600">€{formatPrice(totalPrice)}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 pt-4 pb-20 border-t border-slate-200 bg-slate-50">
          <div className="flex gap-3">
            {currentStep === 1 ? (
              <>
                <button type="button" onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-100">Annulla</button>
                <button type="button" onClick={() => setCurrentStep(2)} disabled={!canProceedToStep2} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  Avanti <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setCurrentStep(1)} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-100 flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg> Indietro
                </button>
                <button type="button" onClick={handleSubmit} disabled={saving || (formData.requestType === "cleaning" && !guestsValid) || (formData.requestType === "linen_only" && selectedItems.length === 0)}
                  className={`flex-1 py-3 rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 ${formData.requestType === "linen_only" ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white" : "bg-gradient-to-r from-emerald-500 to-teal-600 text-white"}`}>
                  {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Creazione...</> : <>✓ {formData.requestType === "linen_only" ? "Richiedi" : "Crea Pulizia"}</>}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
