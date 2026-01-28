/**
 * USE PROPERTY CONFIG - Hook React per gestire configurazioni
 * 
 * Questo hook:
 * - Carica i dati della proprietà da Firebase
 * - Fornisce maxGuests, bedsConfig, serviceConfigs
 * - Fornisce funzioni per ottenere config per N ospiti
 * - Gestisce loading e error states
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  loadPropertyData,
  loadInventory,
  getConfigForGuests,
  configToItemsList,
  calculateTotalPrice,
  type PropertyData,
  type GuestConfig,
  type LinenOrderItem,
  type InventoryItem,
} from "./linenService";

export interface UsePropertyConfigResult {
  // Stati
  loading: boolean;
  error: string | null;
  
  // Dati proprietà
  property: PropertyData | null;
  maxGuests: number;
  bedsConfig: PropertyData["bedsConfig"];
  serviceConfigs: Record<number, GuestConfig>;
  
  // Inventario
  inventory: InventoryItem[];
  
  // Funzioni
  getConfigForGuests: (guestsCount: number) => Promise<{
    config: GuestConfig;
    items: LinenOrderItem[];
    totalPrice: number;
  }>;
  
  // Refresh
  refresh: () => Promise<void>;
}

export function usePropertyConfig(propertyId: string | null): UsePropertyConfigResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  // Carica dati iniziali
  const loadData = useCallback(async () => {
    if (!propertyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Carica proprietà e inventario in parallelo
      const [propertyData, inventoryData] = await Promise.all([
        loadPropertyData(propertyId),
        loadInventory(),
      ]);

      if (!propertyData) {
        throw new Error(`Proprietà ${propertyId} non trovata`);
      }

      setProperty(propertyData);
      setInventory(inventoryData?.all || []);
      
      console.log(`✅ usePropertyConfig: Caricati dati per ${propertyData.name}`);
      console.log(`   - maxGuests: ${propertyData.maxGuests}`);
      console.log(`   - bedsConfig: ${propertyData.bedsConfig.length} letti`);
      console.log(`   - serviceConfigs: ${Object.keys(propertyData.serviceConfigs).length} configs`);
      console.log(`   - inventory: ${inventoryData?.all.length || 0} items`);
    } catch (err) {
      console.error("❌ usePropertyConfig errore:", err);
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Funzione per ottenere config per N ospiti
  const getConfigForGuestsWrapper = useCallback(async (guestsCount: number) => {
    if (!propertyId) {
      throw new Error("PropertyId non disponibile");
    }

    const result = await getConfigForGuests(propertyId, guestsCount);
    
    return {
      config: result.config,
      items: result.items,
      totalPrice: calculateTotalPrice(result.items),
    };
  }, [propertyId]);

  return {
    loading,
    error,
    property,
    maxGuests: property?.maxGuests || 6,
    bedsConfig: property?.bedsConfig || [],
    serviceConfigs: property?.serviceConfigs || {},
    inventory,
    getConfigForGuests: getConfigForGuestsWrapper,
    refresh: loadData,
  };
}

// ==================== HOOK PER PULIZIA ====================

export interface UseCleaningConfigResult {
  loading: boolean;
  error: string | null;
  
  // Dati proprietà
  property: PropertyData | null;
  maxGuests: number;
  
  // Dati pulizia
  guestsCount: number;
  setGuestsCount: (n: number) => void;
  
  // Biancheria corrente
  currentConfig: GuestConfig | null;
  currentItems: LinenOrderItem[];
  totalPrice: number;
  
  // Funzioni
  refresh: () => Promise<void>;
}

export function useCleaningConfig(
  propertyId: string | null,
  initialGuestsCount: number = 2
): UseCleaningConfigResult {
  const {
    loading: propertyLoading,
    error: propertyError,
    property,
    maxGuests,
    inventory,
    refresh: refreshProperty,
  } = usePropertyConfig(propertyId);

  const [guestsCount, setGuestsCountInternal] = useState(initialGuestsCount);
  const [configLoading, setConfigLoading] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<GuestConfig | null>(null);
  const [currentItems, setCurrentItems] = useState<LinenOrderItem[]>([]);

  // Quando cambia numero ospiti, carica la config corrispondente
  useEffect(() => {
    async function loadConfigForGuests() {
      if (!propertyId || propertyLoading || !property) return;

      setConfigLoading(true);
      try {
        const result = await getConfigForGuests(propertyId, guestsCount);
        setCurrentConfig(result.config);
        setCurrentItems(result.items);
        console.log(`🔄 Config caricata per ${guestsCount} ospiti: ${result.items.length} items`);
      } catch (err) {
        console.error("Errore caricamento config:", err);
      } finally {
        setConfigLoading(false);
      }
    }

    loadConfigForGuests();
  }, [propertyId, guestsCount, property, propertyLoading]);

  // Setter con validazione
  const setGuestsCount = useCallback((n: number) => {
    // Valida limite
    if (n < 1) n = 1;
    if (n > maxGuests) n = maxGuests;
    setGuestsCountInternal(n);
  }, [maxGuests]);

  // Sync initialGuestsCount quando cambia
  useEffect(() => {
    setGuestsCountInternal(Math.min(initialGuestsCount, maxGuests));
  }, [initialGuestsCount, maxGuests]);

  const totalPrice = calculateTotalPrice(currentItems);

  return {
    loading: propertyLoading || configLoading,
    error: propertyError,
    property,
    maxGuests,
    guestsCount,
    setGuestsCount,
    currentConfig,
    currentItems,
    totalPrice,
    refresh: refreshProperty,
  };
}

// ==================== HOOK SEMPLICE PER LIMITE OSPITI ====================

/**
 * Hook semplice per ottenere solo maxGuests di una proprietà
 * Utile per modal ospiti che non hanno bisogno di tutta la config
 */
export function useMaxGuests(propertyId: string | null): {
  loading: boolean;
  maxGuests: number;
  propertyName: string;
} {
  const [loading, setLoading] = useState(true);
  const [maxGuests, setMaxGuests] = useState(10);
  const [propertyName, setPropertyName] = useState("");

  useEffect(() => {
    async function load() {
      if (!propertyId) {
        setLoading(false);
        return;
      }

      try {
        const property = await loadPropertyData(propertyId);
        if (property) {
          setMaxGuests(property.maxGuests);
          setPropertyName(property.name);
        }
      } catch (err) {
        console.error("Errore caricamento maxGuests:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [propertyId]);

  return { loading, maxGuests, propertyName };
}
