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
  baseSurcharge?: number;
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

// ═══════════════════════════════════════════════════════════════
// TIPI SERVIZIO HARDCODED (fallback se Firestore vuoto)
// ═══════════════════════════════════════════════════════════════
const DEFAULT_SERVICE_TYPES: ServiceType[] = [
  {
    id: "standard",
    name: "Standard",
    code: "STANDARD",
    icon: "🧹",
    color: "#10B981",
    adminOnly: false,
    clientCanRequest: true,
    requiresApproval: false,
    requiresReason: false,
    requiresManualPrice: false,
    baseSurcharge: 0,
  },
  {
    id: "approfondita",
    name: "Approfondita",
    code: "APPROFONDITA",
    icon: "✨",
    color: "#F59E0B",
    adminOnly: true,        // 🔒 Solo Admin
    clientCanRequest: false, // Proprietario NON può richiederla
    requiresApproval: false,
    requiresReason: false,
    requiresManualPrice: false,
    baseSurcharge: 0,
  },
  {
    id: "sgrosso",
    name: "Sgrosso",
    code: "SGROSSO",
    icon: "🔧",
    color: "#8B5CF6",
    adminOnly: false,        // Entrambi possono crearla
    clientCanRequest: true,  // Proprietario può RICHIEDERE
    requiresApproval: true,  // ⚠️ Richiede approvazione (se proprietario)
    requiresReason: true,    // Richiede motivo
    requiresManualPrice: true,
    baseSurcharge: 0,
  },
];

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
    guestsCount: 2,
    notes: "",
    type: "MANUAL" as const,
    requestType: defaultRequestType as "cleaning" | "linen_only",
    createLinenOrder: true,
    urgency: "normal" as "normal" | "urgent",
    includePickup: true,
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
  
  // ═══════════════════════════════════════════════════════════════
  // SERVICE TYPE STATE - LOGICA CORRETTA
  // ═══════════════════════════════════════════════════════════════
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>(DEFAULT_SERVICE_TYPES);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(false); // FALSE per mostrare subito i default
  const [selectedServiceType, setSelectedServiceType] = useState<string>("STANDARD");
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [sgrossoReason, setSgrossoReason] = useState<SgrossoReasonCode | "">("");
  const [sgrossoNotes, setSgrossoNotes] = useState<string>("");

  // Stato per errore duplicato
  const [duplicateError, setDuplicateError] = useState<{
    show: boolean;
    message: string;
    existingId: string;
    existingType: "cleaning" | "order";
    existingStatus: string;
    propertyName: string;
    date: string;
  } | null>(null);

  const isAdmin = userRole === "ADMIN";
  const isProprietario = userRole === "PROPRIETARIO";

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
              maxGuests: data.maxGuests || 6,
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

  // Carica Service Types da Firestore (con fallback ROBUSTO)
  useEffect(() => {
    async function loadServiceTypes() {
      console.log("🔄 Caricamento tipi servizio...");
      try {
        const res = await fetch("/api/service-types?activeOnly=true");
        const data = await res.json();
        console.log("📥 Risposta API service-types:", data);
        
        if (data.serviceTypes && Array.isArray(data.serviceTypes) && data.serviceTypes.length > 0) {
          // Verifica che abbiano i campi necessari
          const validTypes = data.serviceTypes.filter((st: any) => st.code && st.name);
          if (validTypes.length > 0) {
            console.log("✅ Tipi servizio da API:", validTypes.length);
            setServiceTypes(validTypes);
          } else {
            console.log("⚠️ API ha restituito tipi non validi, uso default");
            setServiceTypes(DEFAULT_SERVICE_TYPES);
          }
        } else {
          // Array vuoto o risposta non valida - usa default
          console.log("⚠️ Nessun tipo servizio da API, uso default hardcoded");
          setServiceTypes(DEFAULT_SERVICE_TYPES);
        }
      } catch (error) {
        console.error("❌ Errore caricamento tipi servizio:", error);
        setServiceTypes(DEFAULT_SERVICE_TYPES);
      } finally {
        setLoadingServiceTypes(false);
      }
    }
    if (isOpen) {
      // Imposta subito i default per evitare flash vuoto
      setServiceTypes(DEFAULT_SERVICE_TYPES);
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
        const seenIds = new Set<string>();
        
        data.categories?.forEach((cat: any) => {
          const catItems: InventoryItem[] = [];
          cat.items?.forEach((item: any) => {
            const itemId = item.key || item.id;
            if (seenIds.has(itemId)) return;
            seenIds.add(itemId);
            const icon = cat.id === 'biancheria_letto' ? '🛏️' : cat.id === 'biancheria_bagno' ? '🛁' : cat.id === 'kit_cortesia' ? '🧴' : '📦';
            const invItem = { id: itemId, key: itemId, name: item.name, icon, category: cat.id, sellPrice: item.sellPrice || 0 };
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
        
        if (data.serviceConfigs && typeof data.serviceConfigs === 'object' && Object.keys(data.serviceConfigs).length > 0) {
          setPropertyConfigs(data.serviceConfigs);
        } else {
          setPropertyConfigs({});
        }
      }
    } catch (err) {
      console.error('Errore caricamento config:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  const applyStandardConfig = async (guestsCount: number) => {
    if (guestsCount <= 0) {
      setSelectedItems([]);
      return;
    }
    
    const config = propertyConfigs[guestsCount] || propertyConfigs[String(guestsCount)];
    
    if (config) {
      const { configToSelectedItems } = await import('~/lib/linenCalculator');
      const items = configToSelectedItems(config, allInventoryItems);
      setSelectedItems(items);
      setIsModified(false);
      return;
    }
    
    setSelectedItems([]);
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedItems([]);
      setActiveCategory("all");
      setIsModified(false);
      setPropertyConfigs({});
      setFormData(prev => ({ ...prev, guestsCount: 2 }));
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
    const shouldApply = formData.guestsCount > 0 && !isModified && (
      formData.requestType === "linen_only" || 
      (formData.requestType === "cleaning" && formData.createLinenOrder)
    );
    
    if (shouldApply) {
      applyStandardConfig(formData.guestsCount);
    }
  }, [formData.guestsCount, formData.createLinenOrder, formData.requestType, allInventoryItems, propertyConfigs, isModified]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      setTimeout(() => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setShowPropertyDropdown(false);
        }
      }, 100);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePropertySelect = (prop: Property) => {
    setSelectedProperty(prop);
    setFormData(prev => ({ ...prev, propertyId: prop.id, guestsCount: 2 }));
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

  // ═══════════════════════════════════════════════════════════════
  // LOGICA TIPI SERVIZIO DISPONIBILI
  // ═══════════════════════════════════════════════════════════════
  // Admin: vede tutti (Standard, Approfondita, Sgrosso)
  // Proprietario: vede solo Standard e Sgrosso (NO Approfondita)
  const availableServiceTypes = useMemo(() => {
    if (isAdmin) {
      // Admin vede tutti
      return serviceTypes.filter(st => 
        st.code === "STANDARD" || st.code === "APPROFONDITA" || st.code === "SGROSSO"
      );
    } else {
      // Proprietario: solo Standard e Sgrosso
      return serviceTypes.filter(st => 
        st.code === "STANDARD" || st.code === "SGROSSO"
      );
    }
  }, [serviceTypes, isAdmin]);

  const selectedType = useMemo(() => serviceTypes.find(st => st.code === selectedServiceType), [serviceTypes, selectedServiceType]);
  const isSgrosso = selectedServiceType === "SGROSSO";
  const isApprofondita = selectedServiceType === "APPROFONDITA";
  
  // ═══════════════════════════════════════════════════════════════
  // LOGICA PREZZO
  // ═══════════════════════════════════════════════════════════════
  // - Sgrosso da Admin: prezzo manuale (customPrice)
  // - Sgrosso da Proprietario: nessun prezzo (va in pending)
  // - Standard/Approfondita: prezzo da contratto + baseSurcharge
  const effectivePrice = useMemo(() => {
    if (isSgrosso) {
      if (isAdmin) {
        // Admin: usa prezzo personalizzato o 0 se non inserito
        return customPrice !== null ? customPrice : 0;
      } else {
        // Proprietario: prezzo 0 (verrà definito da admin dopo approvazione)
        return 0;
      }
    }
    // Standard e Approfondita: prezzo contratto + sovrapprezzo (se c'è)
    const surcharge = selectedType?.baseSurcharge || 0;
    return cleaningPrice + surcharge;
  }, [customPrice, selectedType, cleaningPrice, isSgrosso, isAdmin]);

  const priceIsModified = customPrice !== null && customPrice !== cleaningPrice;
  const linenTotal = useMemo(() => selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0), [selectedItems]);
  
  const totalPrice = useMemo(() => {
    if (formData.requestType === "linen_only") return linenTotal;
    // Per sgrosso da proprietario, mostra solo biancheria (prezzo pulizia TBD)
    if (isSgrosso && isProprietario) return linenTotal;
    return effectivePrice + (formData.createLinenOrder ? linenTotal : 0);
  }, [effectivePrice, linenTotal, formData.requestType, formData.createLinenOrder, isSgrosso, isProprietario]);

  const filteredItems = useMemo(() => activeCategory === "all" ? allInventoryItems : allInventoryItems.filter(item => item.category === activeCategory), [allInventoryItems, activeCategory]);
  const canProceedToStep2 = formData.propertyId && formData.scheduledDate && (formData.requestType === "linen_only" || selectedServiceType);
  const guestsValid = formData.guestsCount > 0;

  // ═══════════════════════════════════════════════════════════════
  // SUBMIT - LOGICA COMPLETA
  // ═══════════════════════════════════════════════════════════════
  const handleSubmit = async () => {
    if (saving) return;
    
    // Validazione Sgrosso
    if (isSgrosso) {
      if (!sgrossoReason) { 
        alert("Seleziona il motivo dello sgrosso"); 
        return; 
      }
      if (sgrossoReason === "ALTRO" && !sgrossoNotes.trim()) { 
        alert("Specifica il motivo nelle note"); 
        return; 
      }
      // Solo Admin deve inserire prezzo per Sgrosso
      if (isAdmin && (customPrice === null || customPrice <= 0)) {
        alert("Inserisci un prezzo valido per lo sgrosso");
        return;
      }
    }

    setSaving(true);
    try {
      const sgrossoReasonObj = SGROSSO_REASONS.find(r => r.code === sgrossoReason);
      
      // ═══════════════════════════════════════════════════════════════
      // DETERMINA STATO E TIPO PULIZIA
      // ═══════════════════════════════════════════════════════════════
      // - Sgrosso da Proprietario → PENDING_APPROVAL
      // - Tutto il resto → SCHEDULED (attivo)
      const isPendingApproval = isSgrosso && isProprietario;
      
      const apiData = {
        propertyId: formData.propertyId,
        scheduledDate: formData.scheduledDate,
        scheduledTime: formData.scheduledTime,
        guestsCount: formData.guestsCount,
        notes: formData.notes,
        // Tipo servizio
        serviceType: selectedServiceType,
        serviceTypeName: selectedType?.name || "Pulizia Standard",
        type: selectedServiceType === "SGROSSO" ? "SGROSSO" : "MANUAL",
        // Biancheria
        createLinenOrder: formData.createLinenOrder && !isPendingApproval, // No ordine biancheria se pending
        linenOnly: formData.requestType === "linen_only",
        customLinenItems: selectedItems.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price || 0,
        })),
        // 🔥 NUOVO: Flag per indicare se la config biancheria è stata modificata manualmente
        linenConfigModified: isModified,
        // Prezzo
        cleaningPrice: effectivePrice,
        priceModified: priceIsModified,
        // Urgenza e ritiro
        urgency: formData.urgency,
        includePickup: formData.includePickup && !isPendingApproval,
        // Dati Sgrosso
        sgrossoReason: isSgrosso ? sgrossoReason : null,
        sgrossoReasonLabel: isSgrosso && sgrossoReasonObj ? sgrossoReasonObj.label : null,
        sgrossoNotes: isSgrosso ? sgrossoNotes : null,
        // ⭐ NUOVO: Stato richiesta
        requestedByRole: userRole,
        isPendingApproval: isPendingApproval,
      };
      
      const response = await fetch("/api/cleanings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiData),
      });
      const data = await response.json();
      
      // Gestione errore duplicato
      if (response.status === 409 && (data.error === "DUPLICATE_CLEANING" || data.error === "DUPLICATE_ORDER")) {
        setDuplicateError({
          show: true,
          message: data.message,
          existingId: data.existingId,
          existingType: data.existingType,
          existingStatus: data.existingStatus,
          propertyName: data.propertyName,
          date: data.date,
        });
        return;
      }
      
      if (!response.ok) throw new Error(data.error || "Errore nella creazione");
      
      // Messaggio successo personalizzato
      if (isPendingApproval) {
        alert("✅ Richiesta sgrosso inviata!\n\nL'admin riceverà la notifica e approverà la richiesta con il prezzo concordato.");
      } else {
        alert(data.message || "Creato con successo!");
      }
      
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

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
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
        <div className="flex-1 overflow-y-auto p-5">
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
              <div ref={dropdownRef} className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">🏠 Proprietà <span className="text-red-500">*</span></label>
                {loadingProperties ? (
                  <div className="animate-pulse bg-slate-100 h-12 rounded-xl"></div>
                ) : (
                  <>
                    <input type="text" value={propertySearch}
                      onChange={(e) => { setPropertySearch(e.target.value); setShowPropertyDropdown(true); if (!e.target.value) { setSelectedProperty(null); setFormData(prev => ({ ...prev, propertyId: "" })); } }}
                      onFocus={() => setShowPropertyDropdown(true)}
                      placeholder="🔍 Cerca proprietà..."
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none" />
                    {showPropertyDropdown && filteredProperties.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                        {filteredProperties.map(prop => (
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
                    {showPropertyDropdown && propertySearch && filteredProperties.length === 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 text-center text-slate-500">
                        Nessuna proprietà trovata per "{propertySearch}"
                      </div>
                    )}
                  </>
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
                        <span>💰 €{selectedProperty.cleaningPrice || 0}</span>
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

              {/* Urgenza - Solo per Admin */}
              {isAdmin && (
                <div onClick={(e) => e.stopPropagation()}>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">🚨 Priorità</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFormData(prev => ({ ...prev, urgency: "normal" })); }}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${formData.urgency === "normal" ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <span className="text-xl block mb-1">📦</span>
                      <span className="text-sm font-semibold text-slate-700">Normale</span>
                    </button>
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFormData(prev => ({ ...prev, urgency: "urgent" })); }}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${formData.urgency === "urgent" ? "border-red-500 bg-red-50 ring-2 ring-red-200" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <span className="text-xl block mb-1">🚨</span>
                      <span className="text-sm font-semibold text-red-600">URGENTE</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════ */}
              {/* TIPO SERVIZIO - LOGICA CORRETTA                                 */}
              {/* ═══════════════════════════════════════════════════════════════ */}
              {formData.requestType === "cleaning" && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">🧹 Tipo di Servizio</label>
                  {/* SEMPRE mostra i bottoni - non usare loadingServiceTypes */}
                  <div className={`grid gap-2 ${availableServiceTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {availableServiceTypes.length > 0 ? (
                      availableServiceTypes.map(st => {
                        const isSelected = selectedServiceType === st.code;
                        const colorClasses = st.code === 'STANDARD' 
                          ? (isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200')
                          : st.code === 'APPROFONDITA'
                          ? (isSelected ? 'border-amber-500 bg-amber-50' : 'border-slate-200')
                          : (isSelected ? 'border-purple-500 bg-purple-50' : 'border-slate-200');
                        
                        const textColor = st.code === 'STANDARD' 
                          ? (isSelected ? 'text-emerald-700' : 'text-slate-700')
                          : st.code === 'APPROFONDITA'
                          ? (isSelected ? 'text-amber-700' : 'text-slate-700')
                          : (isSelected ? 'text-purple-700' : 'text-slate-700');
                        
                        return (
                          <button 
                            key={st.code} 
                            type="button" 
                            onClick={() => { 
                              setSelectedServiceType(st.code); 
                              if (st.code !== "SGROSSO") { 
                                setSgrossoReason(""); 
                                setSgrossoNotes(""); 
                                setCustomPrice(null);
                              } 
                            }}
                            className={`p-3 rounded-xl border-2 text-center transition-all ${colorClasses}`}
                          >
                            <span className="text-2xl block mb-1">{st.icon}</span>
                            <span className={`text-xs font-semibold ${textColor}`}>{st.name}</span>
                            {st.code === "APPROFONDITA" && <span className="text-[9px] text-amber-600 block">Solo Admin</span>}
                            {st.code === "SGROSSO" && isProprietario && <span className="text-[9px] text-purple-600 block">Richiede approvazione</span>}
                          </button>
                        );
                      })
                    ) : (
                      // Fallback se per qualche motivo availableServiceTypes è vuoto
                      <>
                        <button type="button" onClick={() => setSelectedServiceType("STANDARD")}
                          className={`p-3 rounded-xl border-2 text-center transition-all ${selectedServiceType === "STANDARD" ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                          <span className="text-2xl block mb-1">🧹</span>
                          <span className="text-xs font-semibold text-slate-700">Standard</span>
                        </button>
                        {isAdmin && (
                          <button type="button" onClick={() => setSelectedServiceType("APPROFONDITA")}
                            className={`p-3 rounded-xl border-2 text-center transition-all ${selectedServiceType === "APPROFONDITA" ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
                            <span className="text-2xl block mb-1">✨</span>
                            <span className="text-xs font-semibold text-slate-700">Approfondita</span>
                            <span className="text-[9px] text-amber-600 block">Solo Admin</span>
                          </button>
                        )}
                        <button type="button" onClick={() => setSelectedServiceType("SGROSSO")}
                          className={`p-3 rounded-xl border-2 text-center transition-all ${selectedServiceType === "SGROSSO" ? 'border-purple-500 bg-purple-50' : 'border-slate-200'}`}>
                          <span className="text-2xl block mb-1">🔧</span>
                          <span className="text-xs font-semibold text-slate-700">Sgrosso</span>
                          {isProprietario && <span className="text-[9px] text-purple-600 block">Richiede approvazione</span>}
                        </button>
                      </>
                    )}
                  </div>
                  
                  {/* ═══════════════════════════════════════════════════════════════ */}
                  {/* SGROSSO: Motivo e Prezzo                                        */}
                  {/* ═══════════════════════════════════════════════════════════════ */}
                  {isSgrosso && (
                    <div className="mt-3 bg-purple-50 p-4 rounded-xl border border-purple-200 space-y-3">
                      {/* Motivo */}
                      <div>
                        <label className="block text-sm font-semibold text-purple-700 mb-2">Motivo Sgrosso *</label>
                        <select 
                          value={sgrossoReason} 
                          onChange={(e) => setSgrossoReason(e.target.value as SgrossoReasonCode)} 
                          className="w-full px-4 py-3 border border-purple-200 rounded-xl bg-white text-sm"
                        >
                          <option value="">Seleziona motivo...</option>
                          {SGROSSO_REASONS.map(r => (
                            <option key={r.code} value={r.code}>{r.icon} {r.label}</option>
                          ))}
                        </select>
                        {sgrossoReason === "ALTRO" && (
                          <textarea 
                            value={sgrossoNotes} 
                            onChange={(e) => setSgrossoNotes(e.target.value)} 
                            placeholder="Specifica il motivo..." 
                            rows={2} 
                            className="w-full mt-2 px-4 py-3 border border-purple-200 rounded-xl bg-white text-sm resize-none" 
                          />
                        )}
                      </div>
                      
                      {/* Prezzo - Solo Admin */}
                      {isAdmin && (
                        <div>
                          <label className="block text-sm font-semibold text-purple-700 mb-2">💰 Prezzo Sgrosso *</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">€</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={customPrice ?? ''}
                              onChange={(e) => setCustomPrice(e.target.value ? parseFloat(e.target.value) : null)}
                              placeholder="Inserisci prezzo..."
                              className="w-full pl-8 pr-4 py-3 border border-purple-200 rounded-xl bg-white text-sm"
                            />
                          </div>
                          <p className="text-xs text-purple-600 mt-1">⚠️ Inserisci il prezzo concordato con il proprietario</p>
                        </div>
                      )}
                      
                      {/* Messaggio per Proprietario */}
                      {isProprietario && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 text-lg">⏳</span>
                            <div>
                              <p className="text-sm font-semibold text-amber-800">Richiesta in attesa</p>
                              <p className="text-xs text-amber-700 mt-0.5">
                                La richiesta sarà inviata all'admin che approverà e definirà il prezzo. 
                                Riceverai una notifica quando sarà approvata.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-5">
              {/* Numero Ospiti */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  👥 Numero Ospiti * {formData.requestType === "linen_only" && <span className="font-normal text-slate-500">(per calcolo dotazioni)</span>}
                </label>
                <div className="flex items-center justify-center gap-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <button type="button" onClick={() => handleGuestsChange(Math.max(0, formData.guestsCount - 1))} disabled={formData.guestsCount <= 0} className="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 hover:border-emerald-500 disabled:opacity-50">−</button>
                  <div className="text-center px-6">
                    <span className="text-3xl font-bold text-emerald-600">{formData.guestsCount || "—"}</span>
                    <p className="text-xs text-slate-500 mt-1">{formData.guestsCount === 1 ? "ospite" : "ospiti"}</p>
                  </div>
                  <button type="button" onClick={() => handleGuestsChange(Math.min(selectedProperty?.maxGuests || 6, formData.guestsCount + 1))} disabled={formData.guestsCount >= (selectedProperty?.maxGuests || 6)} className="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 hover:border-emerald-500 disabled:opacity-50">+</button>
                </div>
                {!guestsValid && <p className="text-xs text-amber-600 mt-2 text-center">⚠️ Seleziona il numero di ospiti</p>}
              </div>

              {/* Toggle Biancheria - Solo per pulizie e non per sgrosso pending */}
              {formData.requestType === "cleaning" && !(isSgrosso && isProprietario) && (
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

              {/* Messaggio per Sgrosso Pending */}
              {isSgrosso && isProprietario && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">📋</span>
                    <div>
                      <p className="font-semibold text-purple-800">Richiesta Sgrosso</p>
                      <p className="text-xs text-purple-600">La biancheria sarà gestita dopo l'approvazione</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sezione Biancheria */}
              {guestsValid && (formData.requestType === "linen_only" || (formData.requestType === "cleaning" && formData.createLinenOrder)) && !(isSgrosso && isProprietario) && (
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
                      ) : (
                        <div className="p-4 border-b border-slate-200 text-center text-xs text-slate-500">Nessun articolo selezionato</div>
                      )}
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
                  <h3 className="font-semibold text-slate-800 mb-3">💰 Riepilogo</h3>
                  <div className="space-y-2 text-sm">
                    {/* Info tipo servizio */}
                    {formData.requestType === "cleaning" && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 flex items-center gap-2">
                          {selectedType?.icon} {selectedType?.name || "Pulizia"}
                        </span>
                        {isSgrosso && isProprietario ? (
                          <span className="text-purple-600 font-medium">In approvazione</span>
                        ) : (
                          <span className="font-medium">€{formatPrice(effectivePrice)}</span>
                        )}
                      </div>
                    )}
                    {(formData.createLinenOrder || formData.requestType === "linen_only") && selectedItems.length > 0 && !(isSgrosso && isProprietario) && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Biancheria</span>
                        <span className="font-medium">€{formatPrice(linenTotal)}</span>
                      </div>
                    )}
                    <div className="border-t border-slate-200 pt-2 flex justify-between">
                      <span className="font-bold text-slate-800">TOTALE</span>
                      {isSgrosso && isProprietario ? (
                        <span className="text-lg font-bold text-purple-600">Da definire</span>
                      ) : (
                        <span className="text-xl font-bold text-emerald-600">€{formatPrice(totalPrice)}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Badge stato */}
                  {isSgrosso && isProprietario && (
                    <div className="mt-3 bg-purple-100 rounded-lg p-2 text-center">
                      <span className="text-xs font-semibold text-purple-700">⏳ Richiesta in attesa di approvazione Admin</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 pt-4 pb-6 border-t border-slate-200 bg-slate-50">
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
                <button 
                  type="button" 
                  onClick={handleSubmit} 
                  disabled={saving || (formData.requestType === "cleaning" && !guestsValid) || (formData.requestType === "linen_only" && selectedItems.length === 0)}
                  className={`flex-1 py-3 rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 ${
                    isSgrosso && isProprietario 
                      ? "bg-gradient-to-r from-purple-500 to-violet-600 text-white" 
                      : formData.requestType === "linen_only" 
                        ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white" 
                        : "bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                  }`}
                >
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Creazione...</>
                  ) : (
                    <>
                      {isSgrosso && isProprietario ? "📤 Invia Richiesta" : 
                       formData.requestType === "linen_only" ? "✓ Richiedi" : "✓ Crea Pulizia"}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal Errore Duplicato */}
      {duplicateError?.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Servizio già esistente</h2>
                  <p className="text-xs text-white/80">Non è possibile creare duplicati</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-slate-700 mb-4">{duplicateError.message}</p>
              <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-200">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{duplicateError.existingType === "cleaning" ? "🧹" : "📦"}</span>
                  <div>
                    <p className="font-semibold text-slate-800">{duplicateError.propertyName}</p>
                    <p className="text-sm text-slate-500">
                      {new Date(duplicateError.date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDuplicateError(null)} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-colors">
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
