import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // ⚡ CACHE AGGRESSIVA
        staleTime: 5 * 60 * 1000,        // 5 minuti "fresco"
        gcTime: 60 * 60 * 1000,          // 1 ora in memoria
        
        // 🚀 NON ricaricare se già in cache
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        
        retry: 1,
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