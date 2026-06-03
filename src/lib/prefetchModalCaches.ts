/**
 * 🚀 PERF: precarica in sottofondo le cache usate da EditCleaningModal
 * (inventario + service types). Va chiamato quando si monta una pagina da cui
 * l'utente può aprire la modal pulizia (pagina pulizie, dashboard, ecc.), così
 * la PRIMA apertura della modal trova le cache già calde e si apre veloce
 * invece di aspettare le fetch /api/inventory/list e /api/service-types.
 *
 * Sicuro: tutto in try/catch, fetch silenziose. Se fallisce, la modal fa le sue
 * fetch come fallback — nessuna regressione. Usa le STESSE chiavi/formato che la
 * modal legge (modal:inventory:v2, modal:serviceTypes) per compatibilità totale.
 */
import { browserCacheGet, browserCacheSet } from "~/lib/browserCache";

const CACHE_KEY_INVENTORY = "modal:inventory:v2";
const CACHE_KEY_SERVICE_TYPES = "modal:serviceTypes";
const CACHE_TTL = 10 * 60 * 1000; // 10 minuti

export function prefetchModalCaches(): void {
  // 1) Inventario — la chiamata più pesante della modal
  try {
    if (!browserCacheGet(CACHE_KEY_INVENTORY)) {
      fetch("/api/inventory/list")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.categories) return;
          const linen: any[] = [], bath: any[] = [], kit: any[] = [], extras: any[] = [];
          data.categories.forEach((cat: any) => {
            cat.items?.forEach((item: any) => {
              const m = { id: item.key || item.id, n: item.name, p: item.sellPrice || 0, d: 1 };
              if (cat.id === "biancheria_letto") linen.push(m);
              else if (cat.id === "biancheria_bagno") bath.push(m);
              else if (cat.id === "kit_cortesia") kit.push(m);
              else if (cat.id === "servizi_extra") extras.push({ ...m, desc: item.description || "" });
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
      fetch("/api/service-types?activeOnly=true")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const types = data?.serviceTypes || [];
          if (types.length > 0) browserCacheSet(CACHE_KEY_SERVICE_TYPES, types, CACHE_TTL);
        })
        .catch(() => { /* silenzioso: fallback nella modal */ });
    }
  } catch { /* no-op */ }
}
