/**
 * engineConfig.ts — Parametri del preventivatore su Firestore
 * v1 — 08/07/2026
 *
 * Struttura Firestore:
 *   config/preventivatore            → { params: <override parziale di ENGINE>, updatedAt, updatedBy }
 *   config/preventivatore/history/*  → { prima, dopo, updatedBy, at }  (una voce per salvataggio)
 *
 * PRINCIPI (stesso schema di coverageZones):
 * - I DEFAULT sono i valori congelati in quoteEngine.ENGINE: se il documento
 *   non esiste o un campo manca, vale il default. Mai numeri inventati.
 * - Cache in memoria con TTL breve + invalidazione esplicita al salvataggio:
 *   dal momento in cui l'admin salva, il preventivo successivo usa i numeri nuovi.
 * - Merge SOLO su chiavi già presenti nei default e con lo stesso tipo:
 *   un dato sporco su Firestore non può rompere il motore.
 */
import { adminDb } from '~/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ENGINE } from '~/lib/quote/quoteEngine';
import type { EngineParams } from '~/lib/quote/quoteEngine';

const DOC_PATH = 'config/preventivatore';
const CACHE_TTL_MS = 60 * 1000;

let cache: { params: EngineParams; scadenza: number } | null = null;

// ─────────────────────────── Merge sicuro ───────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge di override su base: accetta solo chiavi esistenti e tipi coerenti. */
function mergeSicuro<T>(base: T, override: unknown): T {
  if (!isPlainObject(override) || !isPlainObject(base)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, vBase] of Object.entries(base as Record<string, unknown>)) {
    const vOvr = (override as Record<string, unknown>)[k];
    if (vOvr === undefined) continue;
    if (typeof vBase === 'number' && typeof vOvr === 'number' && Number.isFinite(vOvr)) {
      out[k] = vOvr;
    } else if (typeof vBase === 'string' && typeof vOvr === 'string') {
      out[k] = vOvr;
    } else if (isPlainObject(vBase) && isPlainObject(vOvr)) {
      out[k] = mergeSicuro(vBase, vOvr);
    }
  }
  return out as T;
}

/** Clona i default (evita che qualcuno muti ENGINE per riferimento). */
function cloneDefaults(): EngineParams {
  return JSON.parse(JSON.stringify(ENGINE)) as EngineParams;
}

// ─────────────────────────── Validazione ───────────────────────────

/** Tutti i numeri finiti e >= 0; percento 0-100; MQ_MAX ragionevole. */
export function validaParams(p: unknown): { ok: true } | { ok: false; errore: string } {
  const problemi: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || v < 0) problemi.push(path + ' deve essere un numero >= 0');
    } else if (isPlainObject(v)) {
      for (const [k, x] of Object.entries(v)) walk(x, path ? path + '.' + k : k);
    }
  };
  walk(p, '');
  if (isPlainObject(p)) {
    const sc = (p as Record<string, unknown>).scontoMultiUnita;
    if (isPlainObject(sc) && typeof sc.percento === 'number' && sc.percento > 100) {
      problemi.push('scontoMultiUnita.percento non può superare 100');
    }
    const mqMax = (p as Record<string, unknown>).mqMax;
    if (typeof mqMax === 'number' && (mqMax < 30 || mqMax > 2000)) {
      problemi.push('mqMax deve essere tra 30 e 2000');
    }
  }
  return problemi.length ? { ok: false, errore: problemi.slice(0, 5).join('; ') } : { ok: true };
}

// ─────────────────────────── Lettura ───────────────────────────

/** Parametri effettivi (default + override Firestore). Mai lancia: peggio che vada, i default. */
export async function getEngineParams(): Promise<EngineParams> {
  if (cache && Date.now() < cache.scadenza) return cache.params;
  try {
    const snap = await adminDb.doc(DOC_PATH).get();
    const override = snap.exists ? (snap.data()?.params as unknown) : undefined;
    const params = mergeSicuro(cloneDefaults(), override);
    cache = { params, scadenza: Date.now() + CACHE_TTL_MS };
    return params;
  } catch (err) {
    console.error('[engineConfig] Errore lettura Firestore, uso i default/cache:', err);
    return cache?.params ?? cloneDefaults();
  }
}

/** Override grezzo salvato (per la UI admin: cosa differisce dai default). */
export async function getEngineOverride(): Promise<Record<string, unknown> | null> {
  try {
    const snap = await adminDb.doc(DOC_PATH).get();
    return snap.exists ? ((snap.data()?.params as Record<string, unknown>) ?? null) : null;
  } catch {
    return null;
  }
}

export function invalidateEngineCache(): void {
  cache = null;
}

// ─────────────────────────── Scrittura ───────────────────────────

/** Salva i parametri completi come override, con voce di storico. */
export async function saveEngineParams(
  params: unknown,
  updatedBy: string
): Promise<{ ok: true; effettivi: EngineParams } | { ok: false; errore: string }> {
  const v = validaParams(params);
  if (!v.ok) return v;

  const effettivi = mergeSicuro(cloneDefaults(), params);
  const prima = await getEngineParams();

  const docRef = adminDb.doc(DOC_PATH);
  await docRef.set(
    { params: effettivi, updatedAt: FieldValue.serverTimestamp(), updatedBy },
    { merge: false }
  );
  await docRef.collection('history').add({
    prima,
    dopo: effettivi,
    updatedBy,
    at: FieldValue.serverTimestamp(),
  });

  invalidateEngineCache();
  return { ok: true, effettivi };
}

/** Ripristina i default: cancella l'override (lo storico resta). */
export async function resetEngineParams(updatedBy: string): Promise<EngineParams> {
  const prima = await getEngineParams();
  const docRef = adminDb.doc(DOC_PATH);
  await docRef.set(
    { params: {}, updatedAt: FieldValue.serverTimestamp(), updatedBy },
    { merge: false }
  );
  await docRef.collection('history').add({
    prima,
    dopo: cloneDefaults(),
    updatedBy,
    at: FieldValue.serverTimestamp(),
    reset: true,
  });
  invalidateEngineCache();
  return cloneDefaults();
}

/** Ultime voci di storico per la UI (quando, chi, cosa). */
export async function getEngineHistory(limit = 20): Promise<
  { at: string | null; updatedBy: string; reset: boolean; prima: EngineParams; dopo: EngineParams }[]
> {
  try {
    const snap = await adminDb.doc(DOC_PATH).collection('history').orderBy('at', 'desc').limit(limit).get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        at: data.at?.toDate?.()?.toISOString() ?? null,
        updatedBy: (data.updatedBy as string) || '-',
        reset: data.reset === true,
        prima: data.prima as EngineParams,
        dopo: data.dopo as EngineParams,
      };
    });
  } catch {
    return [];
  }
}
