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
// QUERY KEYS
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
// HOOKS CON CACHE AGGRESSIVA
// ============================================================

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => fetcher<any>("/api/dashboard/data"),
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useProperties() {
  return useQuery({
    queryKey: queryKeys.properties,
    queryFn: () => fetcher<any>("/api/properties/list"),
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useInventory() {
  return useQuery({
    queryKey: queryKeys.inventory,
    queryFn: () => fetcher<any>("/api/inventory/list"),
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useUsers(role?: string) {
  return useQuery({
    queryKey: queryKeys.users(role),
    queryFn: () => fetcher<any[]>(`/api/dashboard/utenti${role ? `?role=${role}` : ""}`),
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useProperty(id: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.property(id!),
    queryFn: () => fetcher<any>(`/api/properties/${id}`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    initialData: () => {
      const cache = queryClient.getQueryData<any>(queryKeys.properties);
      if (!cache) return undefined;
      return (
        cache.activeProperties?.find((p: any) => p.id === id) ||
        cache.pendingProperties?.find((p: any) => p.id === id) ||
        cache.suspendedProperties?.find((p: any) => p.id === id)
      );
    },
  });
}

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