"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "~/lib/firebase/AuthContext";
import { usePulizieData } from "~/hooks/usePulizieData";
import { PulizieContent } from "~/components/proprietario/PulizieContent";
import { prefetchModalCaches } from "~/lib/prefetchModalCaches";
import { splashOverlay } from "~/components/SplashOverlay";

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

  // 📶 Segnala allo splash che i dati pulizie sono a schermo (cache del store o
  // primo caricamento completato): lo splash chiude a pagina già popolata.
  useEffect(() => {
    if (storeHasData || !storeInitialLoading) splashOverlay.signalPageReady();
  }, [storeHasData, storeInitialLoading]);

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
