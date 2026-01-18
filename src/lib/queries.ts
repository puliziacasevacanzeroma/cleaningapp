import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

// ============================================================
// FETCHER
// ============================================================
const fetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Errore ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

// ============================================================
// QUERY KEYS (centralizzate per facile invalidazione)
// ============================================================
export const queryKeys = {
  dashboard: ["dashboard"] as const,
  properties: ["properties"] as const,
  inventory: ["inventory"] as const,
  cleanings: (date?: string) => ["cleanings", date] as const,
  users: (role?: string) => ["users", role] as const,
  property: (id: string) => ["property", id] as const,
};

// ============================================================
// TIPI
// ============================================================
interface DashboardData {
  stats: {
    cleaningsToday: number;
    operatorsActive: number;
    propertiesTotal: number;
    checkinsWeek: number;
  };
  cleanings: any[];
  operators: { id: string; name: string | null }[];
}

interface PropertiesData {
  activeProperties: any[];
  pendingProperties: any[];
  suspendedProperties: any[];
  proprietari: any[];
}

interface InventoryData {
  categories: any[];
  stats: {
    totalItems: number;
    lowStock: number;
    outOfStock: number;
    totalValue: number;
  };
}

// ============================================================
// HOOKS
// ============================================================

/**
 * Hook per i dati della dashboard
 * Cache: 1 minuto
 */
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => fetcher<DashboardData>("/api/dashboard/data"),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    // Placeholder mentre carica (evita skeleton)
    placeholderData: {
      stats: { cleaningsToday: 0, operatorsActive: 0, propertiesTotal: 0, checkinsWeek: 0 },
      cleanings: [],
      operators: [],
    },
  });
}

/**
 * Hook per la lista proprietà
 * Cache: 5 minuti
 */
export function useProperties() {
  return useQuery({
    queryKey: queryKeys.properties,
    queryFn: () => fetcher<PropertiesData>("/api/properties/list"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/**
 * Hook per l'inventario
 * Cache: 5 minuti
 */
export function useInventory() {
  return useQuery({
    queryKey: queryKeys.inventory,
    queryFn: () => fetcher<InventoryData>("/api/inventory/list"),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/**
 * Hook per utenti (filtrabili per ruolo)
 */
export function useUsers(role?: string) {
  return useQuery({
    queryKey: queryKeys.users(role),
    queryFn: () => fetcher<any[]>(`/api/dashboard/utenti${role ? `?role=${role}` : ""}`),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/**
 * Hook per singola proprietà
 * Usa initialData dalla cache delle proprietà per caricamento istantaneo
 */
export function useProperty(id: string | null) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.property(id!),
    queryFn: () => fetcher<any>(`/api/properties/${id}`),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Usa dati dalla lista se disponibili (caricamento istantaneo!)
    initialData: () => {
      const cache = queryClient.getQueryData<PropertiesData>(queryKeys.properties);
      if (!cache) return undefined;
      return (
        cache.activeProperties.find((p: any) => p.id === id) ||
        cache.pendingProperties.find((p: any) => p.id === id) ||
        cache.suspendedProperties.find((p: any) => p.id === id)
      );
    },
  });
}

// ============================================================
// PREFETCH
// ============================================================

/**
 * Hook per precaricare i dati critici
 */
export function usePrefetchCriticalData() {
  const queryClient = useQueryClient();

  const prefetch = async () => {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard,
        queryFn: () => fetcher<DashboardData>("/api/dashboard/data"),
        staleTime: 60 * 1000,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.properties,
        queryFn: () => fetcher<PropertiesData>("/api/properties/list"),
        staleTime: 5 * 60 * 1000,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.inventory,
        queryFn: () => fetcher<InventoryData>("/api/inventory/list"),
        staleTime: 5 * 60 * 1000,
      }),
    ]);
  };

  return { prefetch };
}

// ============================================================
// INVALIDAZIONE (da usare dopo le mutazioni)
// ============================================================

/**
 * Hook per invalidare le cache
 */
export function useInvalidate() {
  const queryClient = useQueryClient();

  return {
    dashboard: () => queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
    properties: () => queryClient.invalidateQueries({ queryKey: queryKeys.properties }),
    inventory: () => queryClient.invalidateQueries({ queryKey: queryKeys.inventory }),
    property: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.property(id) }),
    all: () => queryClient.invalidateQueries(),
  };
}

// ============================================================
// MUTAZIONI ESEMPIO (opzionali - usa come template)
// ============================================================

/**
 * Esempio: Aggiornare stato pulizia con optimistic update
 */
export function useUpdateCleaningStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/dashboard/cleanings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Errore aggiornamento");
      return res.json();
    },
    // Optimistic update
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.dashboard });
      const previous = queryClient.getQueryData<DashboardData>(queryKeys.dashboard);

      queryClient.setQueryData<DashboardData>(queryKeys.dashboard, (old) => {
        if (!old) return old;
        return {
          ...old,
          cleanings: old.cleanings.map((c) =>
            c.id === id ? { ...c, status } : c
          ),
        };
      });

      return { previous };
    },
    onError: (err, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.dashboard, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}
