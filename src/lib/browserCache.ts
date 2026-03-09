/**
 * Cache browser globale (window.__appCache__)
 * Sopravvive al lazy-loading dei moduli React.
 * I moduli caricati con lazy() vengono re-istanziati → le variabili module-level si resettano.
 * Usando window come storage la cache persiste per tutta la sessione.
 */

declare global {
  interface Window {
    __appCache__: Record<string, { data: unknown; expiresAt: number }>;
  }
}

function getStore() {
  if (typeof window === 'undefined') return null;
  if (!window.__appCache__) window.__appCache__ = {};
  return window.__appCache__;
}

export function browserCacheGet<T>(key: string): T | null {
  const store = getStore();
  if (!store) return null;
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete store[key];
    return null;
  }
  return entry.data as T;
}

export function browserCacheSet<T>(key: string, data: T, ttlMs: number): void {
  const store = getStore();
  if (!store) return;
  store[key] = { data, expiresAt: Date.now() + ttlMs };
}

export function browserCacheDelete(key: string): void {
  const store = getStore();
  if (!store) return;
  delete store[key];
}
