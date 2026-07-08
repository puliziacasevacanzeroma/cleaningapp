/**
 * /api/admin/engine-config — Configurazione del preventivatore (solo ADMIN)
 * v1 — 08/07/2026
 *
 * GET    → { defaults, params (effettivi), override, history }
 * PUT    → salva i parametri: body { params } (validati; storico automatico)
 * DELETE → ripristina i default (storico automatico)
 * POST   → SIMULATORE: calcola un caso di prova con parametri arbitrari
 *          SENZA salvare nulla: body { params?, caso }
 *          caso = { tipo:'casa', casa:{...} } | { tipo:'bnb', camere:[{persone}], areaComune?, areaComuneMq? }
 *          Usa le stesse funzioni pure del motore: zero duplicazione di logica.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '~/lib/api-auth';
import { ENGINE, calcolaCasa, calcolaBnbV2 } from '~/lib/quote/quoteEngine';
import type { EngineParams, DatiCasa, DatiBnbV2 } from '~/lib/quote/quoteEngine';
import {
  getEngineParams, getEngineOverride, getEngineHistory,
  saveEngineParams, resetEngineParams, validaParams,
} from '~/lib/quote/engineConfig';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const [params, override, history] = await Promise.all([
    getEngineParams(),
    getEngineOverride(),
    getEngineHistory(20),
  ]);
  return NextResponse.json({ ok: true, defaults: ENGINE, params, override, history });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: { params?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, errore: 'Body non valido' }, { status: 400 }); }

  if (!body.params) return NextResponse.json({ ok: false, errore: 'params mancante' }, { status: 400 });

  const esito = await saveEngineParams(body.params, auth.user.email || auth.user.id);
  if (!esito.ok) return NextResponse.json({ ok: false, errore: esito.errore }, { status: 400 });

  return NextResponse.json({ ok: true, params: esito.effettivi });
}

export async function DELETE() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const params = await resetEngineParams(auth.user.email || auth.user.id);
  return NextResponse.json({ ok: true, params });
}

// ─────────────────────────── Simulatore ───────────────────────────

interface CasoTest {
  tipo: 'casa' | 'bnb';
  casa?: Partial<DatiCasa>;
  camere?: { persone?: number }[];
  areaComune?: 'no' | 'inloco' | 'dedicata';
  areaComuneMq?: number;
}

function mergeParams(base: EngineParams, override: unknown): EngineParams {
  // riuso della validazione + merge lato engineConfig non esportato:
  // qui basta un merge shallow-per-sezione, i tipi li garantisce validaParams.
  if (typeof override !== 'object' || override === null) return base;
  const out = JSON.parse(JSON.stringify(base)) as EngineParams;
  const o = override as Record<string, unknown>;
  const deep = (dst: Record<string, unknown>, src: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      if (!(k in dst)) continue;
      const cur = dst[k];
      if (typeof cur === 'number' && typeof v === 'number' && Number.isFinite(v)) dst[k] = v;
      else if (typeof cur === 'string' && typeof v === 'string') dst[k] = v;
      else if (typeof cur === 'object' && cur !== null && typeof v === 'object' && v !== null) {
        deep(cur as Record<string, unknown>, v as Record<string, unknown>);
      }
    }
  };
  deep(out as unknown as Record<string, unknown>, o);
  return out;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: { params?: unknown; caso?: CasoTest };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, errore: 'Body non valido' }, { status: 400 }); }

  if (body.params) {
    const v = validaParams(body.params);
    if (!v.ok) return NextResponse.json({ ok: false, errore: v.errore }, { status: 400 });
  }
  const base = await getEngineParams();
  const P = body.params ? mergeParams(base, body.params) : base;

  const caso = body.caso;
  if (!caso) return NextResponse.json({ ok: false, errore: 'caso mancante' }, { status: 400 });

  if (caso.tipo === 'casa') {
    const c = caso.casa || {};
    const casa: DatiCasa = {
      taglio: (['mono', 'bilo', 'trilo', 'quadri'].includes(c.taglio as string) ? c.taglio : 'bilo') as DatiCasa['taglio'],
      mq: Math.max(15, Math.min(400, Math.floor(Number(c.mq) || 50))),
      matrimoniali: Math.max(0, Math.floor(Number(c.matrimoniali) || 1)),
      singoli: Math.max(0, Math.floor(Number(c.singoli) || 0)),
      divani: Math.max(0, Math.floor(Number(c.divani) || 0)),
      bagni: Math.max(1, Math.floor(Number(c.bagni) || 1)),
      cucina: (['angolo', 'sep', 'abit'].includes(c.cucina as string) ? c.cucina : 'angolo') as DatiCasa['cucina'],
      esterno: (['no', 'balcone', 'terrazzo', 'terrazzoGrande'].includes(c.esterno as string) ? c.esterno : 'no') as DatiCasa['esterno'],
      vuoleBiancheria: c.vuoleBiancheria === true,
      vuoleKit: c.vuoleKit === true,
      ospiti: Math.max(1, Math.floor(Number(c.ospiti) || 2)),
    };
    return NextResponse.json({ ok: true, quote: calcolaCasa(casa, P) });
  }

  if (caso.tipo === 'bnb') {
    const bnb: DatiBnbV2 = {
      camere: (caso.camere ?? [{ persone: 2 }]).slice(0, 15).map((c) => ({ persone: Math.max(1, Math.min(6, Math.floor(Number(c?.persone) || 2))) })),
      frequenza: 'checkout',
      areaComune: caso.areaComune === 'inloco' || caso.areaComune === 'dedicata' ? caso.areaComune : 'no',
      areaComuneMq: Math.max(0, Math.min(500, Math.floor(Number(caso.areaComuneMq) || 0))),
      vuoleKit: false,
    };
    return NextResponse.json({ ok: true, quote: calcolaBnbV2(bnb, P) });
  }

  return NextResponse.json({ ok: false, errore: 'Tipo caso non valido' }, { status: 400 });
}
