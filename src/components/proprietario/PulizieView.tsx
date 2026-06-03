"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { usePulizieData } from "~/hooks/usePulizieData";
import { PulizieContent } from "~/components/proprietario/PulizieContent";
import { browserCacheGet, browserCacheSet } from "~/lib/browserCache";

// 🚀 PERF: precarica in sottofondo la cache dell'inventario usata dalla modal
// pulizia. Senza questo, la PRIMA apertura della modal faceva la fetch
// /api/inventory/list bloccando lo spinner per 2-3 secondi. Precaricandola
// qui (quando la pagina pulizie si monta, prima che l'utente clicchi),
// la prima modal trova la cache già calda e si apre istantanea.
// Stessa chiave e stesso formato della modal (modal:inventory:v2) per
// compatibilità totale. Se questa fetch fallisce, la modal farà la sua
// fetch come prima: nessuna regressione.
const CACHE_KEY_INVENTORY = 'modal:inventory:v2';
const CACHE_KEY_SERVICE_TYPES = 'modal:serviceTypes';
const CACHE_TTL = 10 * 60 * 1000;

function prefetchModalCaches() {
  // 1) Inventario — la chiamata più pesante della modal
  try {
    if (!browserCacheGet(CACHE_KEY_INVENTORY)) {
      fetch('/api/inventory/list')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data?.categories) return;
          const linen: any[] = [], bath: any[] = [], kit: any[] = [], extras: any[] = [];
          data.categories.forEach((cat: any) => {
            cat.items?.forEach((item: any) => {
              const m = { id: item.key || item.id, n: item.name, p: item.sellPrice || 0, d: 1 };
              if (cat.id === 'biancheria_letto') linen.push(m);
              else if (cat.id === 'biancheria_bagno') bath.push(m);
              else if (cat.id === 'kit_cortesia') kit.push(m);
              else if (cat.id === 'servizi_extra') extras.push({ ...m, desc: item.description || '' });
            });
          });
          browserCacheSet(CACHE_KEY_INVENTORY, { linen, bath, kit, extras }, CACHE_TTL);
        })
        .catch(() => { /* silenzioso: fallback nella modal */ });
    }
  } catch { /* no-op */ }

  // 2) Service types — seconda chiamata più pesante della modal
  try {
    if (!browserCacheGet(CACHE_KEY_SERVICE_TYPES)) {
      fetch('/api/service-types?activeOnly=true')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          const types = data?.serviceTypes || [];
          if (types.length > 0) browserCacheSet(CACHE_KEY_SERVICE_TYPES, types, CACHE_TTL);
        })
        .catch(() => { /* silenzioso: fallback nella modal */ });
    }
  } catch { /* no-op */ }
}

interface PulizieViewProps {
  properties?: any[];
  cleanings?: any[];
  operators?: any[];
  ownerId?: string;
  isAdmin?: boolean;
  highlightCleaningId?: string | null;
  openCleaningId?: string | null;
}

export function PulizieView({
  properties: externalProperties,
  cleanings: externalCleanings,
  operators: externalOperators,
  ownerId: externalOwnerId,
  isAdmin: externalIsAdmin,
  highlightCleaningId: externalHighlight,
  openCleaningId: externalOpenCleaning,
}: PulizieViewProps = {}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  // Leggi search params senza useSearchParams (evita Suspense flash)
  const [urlParams] = useState(() => {
    if (typeof window === 'undefined') return { id: null, openCleaning: null };
    const p = new URLSearchParams(window.location.search);
    return { id: p.get('id'), openCleaning: p.get('openCleaning') };
  });
  const highlightCleaningId = externalHighlight ?? urlParams.id;
  const openCleaningId = externalOpenCleaning ?? urlParams.openCleaning;

  const isAdmin = externalIsAdmin !== undefined ? externalIsAdmin : (user?.role?.toUpperCase() === "ADMIN");
  const ownerId = externalOwnerId || user?.id;

  // 🚀 PERF: riscalda le cache (inventario + service types) in sottofondo
  // appena la pagina si monta, così la prima apertura della modal è veloce.
  useEffect(() => {
    prefetchModalCaches();
  }, []);

  // 🔵 DATI DAL STORE GLOBALE — cache persistente
  const {
    properties: storeProperties,
    cleanings: storeCleaning,
    operators: storeOperators,
    orders: storeOrders,
    inventory: storeInventory,
    hasData: storeHasData,
    initialLoading: storeInitialLoading,
  } = usePulizieData();

  const properties = externalProperties || storeProperties;
  const cleanings = externalCleanings || storeCleaning;
  const operators = externalOperators || storeOperators;
  const dataLoading = (externalProperties && externalCleanings) ? false : storeInitialLoading;

  // Ordini filtrati per proprietà visibili
  const orders = useMemo(() => {
    const propertyIds = new Set(properties.map((p: any) => p.id));
    return storeOrders.filter((o: any) => propertyIds.has(o.propertyId));
  }, [storeOrders, properties]);

  const inventory = storeInventory;

  // Auth redirect (solo se auth è completo e non c'è utente)
  if (!authLoading && !user) {
    router.push("/login");
    return null;
  }

  // Se non c'è utente E non ci sono dati in cache, aspetta auth
  if (!user && !storeHasData) return null;

  // 🚀 PulizieContent è React.memo — si ri-renderizza SOLO se i dati cambiano
  // Quando l'utente clicca filtri/toolbar, PulizieView NON si ri-renderizza
  // perché quei state sono DENTRO PulizieContent
  return (
    <PulizieContent
      properties={properties}
      cleanings={cleanings}
      operators={operators}
      orders={orders}
      inventory={inventory}
      isAdmin={isAdmin}
      user={user}
      ownerId={ownerId}
      highlightCleaningId={highlightCleaningId}
      openCleaningId={openCleaningId}
      storeHasData={storeHasData}
      storeInitialLoading={storeInitialLoading}
      dataLoading={dataLoading}
      authLoading={authLoading}
    />
  );
}
