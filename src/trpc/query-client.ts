import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // ⚡ CACHE AGGRESSIVA - Navigazione istantanea
        staleTime: 2 * 60 * 1000,        // 2 minuti "fresco"
        gcTime: 60 * 60 * 1000,          // 1 ora in memoria
        
        // 🚀 NON ricaricare se già in cache
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        
        retry: 1,
        retryDelay: 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
