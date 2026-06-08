/**
 * GET /api/geocode?q=...&limit=8
 * ────────────────────────────────────────────────────────────────────
 * Proxy server-side per la ricerca indirizzi (Nominatim + Photon via
 * ~/lib/geo). Perché passare dal server e non chiamare direttamente dal
 * browser come prima:
 *
 *  1. USER-AGENT: Nominatim richiede uno User-Agent identificativo. I browser
 *     NON permettono di impostarlo via fetch (viene strippato) → Nominatim
 *     spesso rispondeva 403/429 e tornava vuoto. Dal server l'header passa.
 *  2. CACHE: stessa query digitata da più utenti / ripetuta → 0 chiamate
 *     esterne, meno rate-limit, risposta istantanea.
 *  3. CORS: nessun problema, è il nostro dominio.
 *
 * Sicurezza: richiede utente autenticato (no proxy aperto).
 * ────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { searchAddress, type AddressResult } from "~/lib/geo";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ── Cache in-memory (per istanza) ──────────────────────────────────────
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minuti
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; results: AddressResult[] }>();

function cacheGet(key: string): AddressResult[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh LRU: rimetti in coda
  cache.delete(key);
  cache.set(key, hit);
  return hit.results;
}

function cacheSet(key: string, results: AddressResult[]) {
  if (cache.size >= CACHE_MAX) {
    // Evita crescita illimitata: rimuovi l'elemento più vecchio
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), results });
}

export async function GET(request: NextRequest) {
  // ── Auth: solo utenti loggati (admin/proprietario in creazione proprietà) ──
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const limitRaw = parseInt(searchParams.get("limit") || "8", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 10) : 8;

  if (q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  const cacheKey = `${q.toLowerCase()}|${limit}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json({ results: cached, cached: true });
  }

  try {
    const results = await searchAddress(q, {
      limit,
      countryCode: "it",
      lang: "it",
    });
    cacheSet(cacheKey, results);
    return NextResponse.json({ results, cached: false });
  } catch (error: any) {
    console.error("[geocode] errore:", error?.message || error);
    // Non bloccare l'utente: ritorna lista vuota, il client mostrerà comunque
    // l'inserimento manuale.
    return NextResponse.json({ results: [], error: "geocode_failed" });
  }
}
