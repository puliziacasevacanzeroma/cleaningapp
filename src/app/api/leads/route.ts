/**
 * /api/leads — API preventivi (widget pubblico + dashboard admin)
 * v2 — 08/07/2026: parametri motore da Firestore (engineConfig) a ogni calcolo,
 *      pipeline stati estesa, data ricontatto e motivo esito per il CRM.
 * v1 — 06/07/2026
 *
 * POST  (pubblico, rate limit nel middleware): valida input, RICALCOLA il preventivo lato
 *       server con quoteEngine (mai fidarsi dei numeri dal browser), verifica
 *       copertura zona, salva il lead e invia le email.
 *       DRY-RUN: body { dryRun: true } → restituisce il documento esatto che
 *       verrebbe scritto e le email che verrebbero inviate, SENZA scrivere nulla.
 * GET   (solo ADMIN): lista lead per la dashboard, filtro ?stato= opzionale.
 * PATCH (solo ADMIN): aggiorna stato/note di un lead.
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '~/lib/firebase/admin';
import { requireAdmin } from '~/lib/api-auth';
import { resend, FROM_EMAIL, isResendConfigured, logResendWarning } from '~/lib/email/config';
import { calcolaCasa, calcolaCase, calcolaBnbV2, calcolaPassaggioSoggiorno, verificaCopertura, formatEuro } from '~/lib/quote/quoteEngine';
import type { DatiCasa, DatiBnbV2, QuoteResult, QuoteMultiResult, QuoteBnbV2, TipoStruttura, CameraBnb } from '~/lib/quote/quoteEngine';
import { getCoveredCaps } from '~/lib/quote/coverageZones';
import { getEngineParams } from '~/lib/quote/engineConfig';
import { buildEmailPreventivo } from '~/lib/email/emailPreventivo';
import { buildPreventivoPdf } from '~/lib/email/preventivoPdf';

export const runtime = 'nodejs';

const LEADS_NOTIFY_EMAIL = process.env.LEADS_NOTIFY_EMAIL || 'info@puliziacasevacanze.it';
const STATI_VALIDI = ['nuovo', 'da_ricontattare', 'contattato', 'in_trattativa', 'sopralluogo', 'convertito', 'perso'] as const;
type StatoLead = (typeof STATI_VALIDI)[number];

// ─────────────────────────── Validazione input ───────────────────────────

interface LeadBody {
  dryRun?: boolean;
  tipo: TipoStruttura;
  casa?: Partial<DatiCasa>;
  unita?: Partial<DatiCasa>[];
  passaggioSoggiorno?: boolean;
  bnbV2?: {
    camere?: { persone?: number }[];
    frequenza?: 'checkout' | 'giornaliera';
    areaComune?: 'no' | 'inloco' | 'dedicata';
    areaComuneMq?: number;
    vuoleKit?: boolean;
  };
  zona: string;
  indirizzo: string;
  cap: string;
  nome: string;
  email: string;
  telefono: string;
  consensoNewsletter?: boolean;
  nomeStruttura?: string; // solo hotel
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
const int = (v: unknown, min: number, max: number): number => {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
};

function valida(body: LeadBody): { ok: true } | { ok: false; errore: string } {
  if (!['casa', 'case', 'bnb', 'hotel'].includes(body.tipo)) return { ok: false, errore: 'Tipo struttura non valido' };
  if (!/^\d{5}$/.test(str(body.cap, 5)) && body.tipo !== 'hotel') return { ok: false, errore: 'CAP non valido' };
  if (str(body.nome, 80).length < 2) return { ok: false, errore: 'Nome mancante' };
  if (!/.+@.+\..+/.test(str(body.email, 120))) return { ok: false, errore: 'Email non valida' };
  if (str(body.telefono, 20).replace(/\D/g, '').length < 8) return { ok: false, errore: 'Telefono non valido' };
  if (body.tipo === 'casa' && !body.casa) return { ok: false, errore: 'Dati appartamento mancanti' };
  if (body.tipo === 'case' && (!Array.isArray(body.unita) || body.unita.length < 1)) return { ok: false, errore: 'Dati unit\u00e0 mancanti' };
  if (body.tipo === 'bnb' && (!body.bnbV2 || !Array.isArray(body.bnbV2.camere) || body.bnbV2.camere.length < 1)) return { ok: false, errore: 'Dati camere mancanti' };
  return { ok: true };
}

function normalizzaCasa(c: Partial<DatiCasa> & { cap?: string }): DatiCasa & { cap?: string } {
  const tagli = ['mono', 'bilo', 'trilo', 'quadri', 'grande', 'villa'];
  const capU = str(c.cap, 5);
  return {
    nome: str(c.nome, 60),
    zona: str(c.zona, 80),
    indirizzo: str((c as { indirizzo?: string }).indirizzo, 160),
    ...(/^\d{5}$/.test(capU) ? { cap: capU } : {}),
    taglio: tagli.includes(c.taglio as string) ? (c.taglio as DatiCasa['taglio']) : 'mono',
    mq: int(c.mq, 15, 2000),
    matrimoniali: int(c.matrimoniali, 0, 20),
    singoli: int(c.singoli, 0, 20),
    divani: int(c.divani, 0, 20),
    bagni: int(c.bagni, 1, 20),
    cucina: ['angolo', 'sep', 'abit'].includes(c.cucina as string) ? (c.cucina as DatiCasa['cucina']) : 'angolo',
    esterno: ['no', 'balcone', 'terrazzo', 'terrazzoGrande', 'giardino'].includes(c.esterno as string) ? (c.esterno as DatiCasa['esterno']) : 'no',
    giardinoMq: int((c as { giardinoMq?: number }).giardinoMq, 0, 100000),
    vuoleBiancheria: c.vuoleBiancheria === true,
    vuoleKit: c.vuoleKit === true,
    ospiti: int(c.ospiti, 1, 30),
  };
}

// ─────────────────────────────── Email ───────────────────────────────

function emailAdmin(doc: Record<string, unknown>, q: QuoteResult): { subject: string; html: string } {
  const c = doc.contatti as { nome: string; email: string; telefono: string };
  return {
    subject: `\u{1F514} Nuovo preventivo: ${c.nome} \u2014 ${doc.tipo}${q.suMisura ? ' (SU MISURA)' : ` \u20ac${q.min}-${q.max}`}`,
    html: `<div style="font-family:Arial,sans-serif;color:#22333F">
      <h3>Nuovo lead dal preventivatore</h3>
      <p><b>${c.nome}</b> \u2014 ${c.telefono} \u2014 ${c.email}<br>
      Zona: <b>${doc.zona || '-'}</b> (${doc.cap || '-'}) \u2014 copertura: <b>${doc.copertura}</b><br>
      Newsletter: ${doc.consensoNewsletter ? 'S\u00cc' : 'no'}</p>
      <p>Apri la dashboard: <a href="https://gestionale.puliziacasevacanze.it/dashboard/preventivi">gestionale \u2192 Preventivi</a></p>
    </div>`,
  };
}

// ─────────────────────────────── POST ───────────────────────────────

export async function POST(request: NextRequest) {
  // Rate limit: gia' applicato dal middleware globale a tutte le /api/*.
  // Niente seconda chiamata qui: conterebbe ogni richiesta due volte.

  let body: LeadBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, errore: 'Body non valido' }, { status: 400 }); }

  const v = valida(body);
  if (!v.ok) return NextResponse.json({ ok: false, errore: v.errore }, { status: 400 });

  // Ricalcolo SERVER-SIDE: i numeri del browser non contano nulla.
  // I parametri arrivano da Firestore (config/preventivatore): se l'admin li ha
  // appena cambiati dalla dashboard, QUESTO calcolo usa già i numeri nuovi.
  const P = await getEngineParams();
  let quote: QuoteResult | QuoteMultiResult | QuoteBnbV2;
  let datiStruttura: Record<string, unknown> = {};
  let passaggio: ReturnType<typeof calcolaPassaggioSoggiorno> | null = null;

  if (body.tipo === 'casa') {
    const casa = normalizzaCasa(body.casa!);
    quote = calcolaCasa(casa, P);
    if (body.passaggioSoggiorno === true) passaggio = calcolaPassaggioSoggiorno(casa, P);
    datiStruttura = { ...casa };
  } else if (body.tipo === 'case') {
    const unita = body.unita!.slice(0, 8).map(normalizzaCasa);
    quote = calcolaCase(unita, P);
    if (body.passaggioSoggiorno === true && unita.length > 0) passaggio = calcolaPassaggioSoggiorno(unita[0]!, P);
    datiStruttura = { unita };
  } else if (body.tipo === 'bnb') {
    const b = body.bnbV2!;
    const camere: CameraBnb[] = (b.camere ?? []).slice(0, 15).map((c) => ({ persone: int(c?.persone, 1, 6) }));
    const bnb: DatiBnbV2 = {
      camere,
      frequenza: b.frequenza === 'giornaliera' ? 'giornaliera' : 'checkout',
      areaComune: b.areaComune === 'inloco' || b.areaComune === 'dedicata' ? b.areaComune : 'no',
      areaComuneMq: int(b.areaComuneMq, 0, 500),
      vuoleKit: b.vuoleKit === true,
    };
    quote = calcolaBnbV2(bnb, P);
    datiStruttura = { ...bnb };
  } else {
    quote = { suMisura: true, min: 0, max: 0, puntuale: 0, biancheria: 0, kit: 0 };
    datiStruttura = { nomeStruttura: str(body.nomeStruttura, 120) };
  }

  const cap = str(body.cap, 5);
  let copertura: string;
  if (body.tipo === 'hotel') {
    copertura = 'da_valutare';
  } else if (body.tipo === 'case') {
    // multi: le case possono stare in zone diverse → coperta solo se TUTTI i CAP lo sono
    const capsCoperti = await getCoveredCaps();
    const capUnita = ((datiStruttura.unita as { cap?: string }[] | undefined) ?? [])
      .map((u) => (u.cap || '').trim())
      .filter((c) => /^\d{5}$/.test(c));
    const daVerificare = capUnita.length > 0 ? capUnita : [cap];
    copertura = daVerificare.every((c) => verificaCopertura(c, capsCoperti) === 'coperta')
      ? 'coperta' : 'in_valutazione';
  } else {
    copertura = verificaCopertura(cap, await getCoveredCaps());
  }

  const leadDoc = {
    tipo: body.tipo,
    datiStruttura,
    quote: {
      suMisura: quote.suMisura, min: quote.min, max: quote.max,
      puntuale: quote.puntuale, biancheria: quote.biancheria, kit: quote.kit,
      taglioEffettivo: (quote as QuoteResult).taglioEffettivo ?? null,
      scontoPercento: (quote as QuoteMultiResult).scontoPercento ?? 0,
      unitaDettaglio: (quote as QuoteMultiResult).unitaDettaglio ?? null,
      camereDettaglio: (quote as QuoteBnbV2).camereDettaglio ?? null,
      rifacimentoGiornaliero: (quote as QuoteBnbV2).rifacimentoGiornaliero ?? 0,
      rifacimentoPerCamera: (quote as QuoteBnbV2).rifacimentoPerCamera ?? 0,
      rifacimentoUscita: (quote as QuoteBnbV2).rifacimentoUscita ?? 0,
      areaComuneImporto: (quote as QuoteBnbV2).areaComuneImporto ?? 0,
      areaComuneTipo: (quote as QuoteBnbV2).areaComuneTipo ?? 'no',
      passaggio,
      // caratteristiche dell'immobile (SOLO tipo 'casa'): senza queste il PDF
      // non pu\u00f2 disegnare le pill mq/bagni/posti letto nella pagina PULIZIA.
      // Per 'case' i dettagli sono gi\u00e0 dentro unitaDettaglio, per 'bnb'/'hotel'
      // non si applicano.
      ...(body.tipo === 'casa' ? {
        mq: (datiStruttura as { mq?: number }).mq ?? null,
        bagni: (datiStruttura as { bagni?: number }).bagni ?? null,
        ospiti: (datiStruttura as { ospiti?: number }).ospiti ?? null,
        taglio: (datiStruttura as { taglio?: string }).taglio ?? null,
      } : {}),
    },
    zona: str(body.zona, 80),
    indirizzo: str((body as { indirizzo?: string }).indirizzo, 160),
    cap,
    copertura,
    contatti: {
      nome: str(body.nome, 80),
      email: str(body.email, 120).toLowerCase(),
      telefono: str(body.telefono, 20),
    },
    consensoNewsletter: body.consensoNewsletter === true,
    stato: 'nuovo' as StatoLead,
    note: '',
    followUpAt: null as string | null,   // data ricontatto (ISO yyyy-mm-dd)
    motivoEsito: '',                     // perché perso/convertito (compilato dall'admin)
    foto: [] as string[], // popolate dallo step foto (v2 widget)
    fonte: 'widget',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const mailCliente = buildEmailPreventivo({
    nome: leadDoc.contatti.nome,
    tipo: body.tipo,
    zona: leadDoc.zona,
    copertura,
    quote: leadDoc.quote as Parameters<typeof buildEmailPreventivo>[0]['quote'],
  });
  const mailAdmin = emailAdmin(leadDoc, quote);

  // ── DRY RUN: mostra tutto, non scrive niente ──
  if (body.dryRun === true) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      documentoCheVerrebbeScritto: { ...leadDoc, createdAt: '(serverTimestamp)', updatedAt: '(serverTimestamp)' },
      emailChePartirebbero: [
        { a: leadDoc.contatti.email, oggetto: mailCliente.subject },
        { a: LEADS_NOTIFY_EMAIL, oggetto: mailAdmin.subject },
      ],
      resendConfigurato: isResendConfigured(),
    });
  }

  // ── Scrittura vera ──
  // Numero preventivo progressivo (come i preventivi manuali: N/ANNO)
  let numeroPreventivo = '';
  try {
    const counterRef = adminDb.collection('counters').doc('preventivi');
    const n = await adminDb.runTransaction(async (t) => {
      const snap = await t.get(counterRef);
      const prossimo = ((snap.data()?.n as number) ?? 282) + 1; // riparte dal tuo ultimo manuale
      t.set(counterRef, { n: prossimo }, { merge: true });
      return prossimo;
    });
    numeroPreventivo = n + '/' + new Date().getFullYear();
  } catch (err) {
    console.error('[leads] Contatore preventivi non disponibile:', err);
    numeroPreventivo = 'W-' + Date.now().toString().slice(-6);
  }
  (leadDoc as Record<string, unknown>).numeroPreventivo = numeroPreventivo;

  const ref = await adminDb.collection('leads').add(leadDoc);

  // Email best-effort: un errore email non deve far fallire il lead.
  if (isResendConfigured() && resend) {
    try {
      let attachments: { filename: string; content: Buffer }[] | undefined;
      try {
        const pdf = await buildPreventivoPdf({
          nome: leadDoc.contatti.nome,
          tipo: body.tipo,
          zona: leadDoc.zona,
          copertura,
          quote: leadDoc.quote as Parameters<typeof buildPreventivoPdf>[0]['quote'],
          numeroPreventivo,
          dataIt: new Date().toLocaleDateString('it-IT'),
        });
        attachments = [{ filename: 'Preventivo_N' + numeroPreventivo.replace('/', '-') + '_Puliziacasevacanze.pdf', content: pdf }];
      } catch (err) {
        console.error('[leads] PDF non generato, email inviata senza allegato:', err);
      }
      await resend.emails.send({ from: FROM_EMAIL, to: leadDoc.contatti.email, subject: mailCliente.subject, html: mailCliente.html, attachments });
      await resend.emails.send({ from: FROM_EMAIL, to: LEADS_NOTIFY_EMAIL, subject: mailAdmin.subject, html: mailAdmin.html });
    } catch (err) {
      console.error('[leads] Invio email fallito (lead salvato comunque):', err);
    }
  } else {
    logResendWarning('leads');
  }

  return NextResponse.json({
    ok: true,
    leadId: ref.id,
    quote: leadDoc.quote,
    copertura,
  });
}

// ─────────────────────────────── GET (ADMIN) ───────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const stato = request.nextUrl.searchParams.get('stato');
  let q = adminDb.collection('leads').orderBy('createdAt', 'desc').limit(300);
  if (stato && (STATI_VALIDI as readonly string[]).includes(stato)) {
    q = adminDb.collection('leads').where('stato', '==', stato).orderBy('createdAt', 'desc').limit(300);
  }
  const snap = await q.get();
  const leads = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id, ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      followUpAt: typeof data.followUpAt === 'string' ? data.followUpAt : (data.followUpAt?.toDate?.()?.toISOString()?.slice(0, 10) ?? null),
    };
  });
  return NextResponse.json({ ok: true, leads });
}

// ─────────────────────────────── PATCH (ADMIN) ───────────────────────────────

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: { id?: string; stato?: string; note?: string; followUpAt?: string | null; motivoEsito?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, errore: 'Body non valido' }, { status: 400 }); }

  const id = str(body.id, 40);
  if (!id) return NextResponse.json({ ok: false, errore: 'ID mancante' }, { status: 400 });

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (body.stato !== undefined) {
    if (!(STATI_VALIDI as readonly string[]).includes(body.stato)) {
      return NextResponse.json({ ok: false, errore: 'Stato non valido' }, { status: 400 });
    }
    update.stato = body.stato;
  }
  if (body.note !== undefined) update.note = str(body.note, 2000);
  if (body.followUpAt !== undefined) {
    if (body.followUpAt === null || body.followUpAt === '') update.followUpAt = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(body.followUpAt)) update.followUpAt = body.followUpAt;
    else return NextResponse.json({ ok: false, errore: 'Data ricontatto non valida (yyyy-mm-dd)' }, { status: 400 });
  }
  if (body.motivoEsito !== undefined) update.motivoEsito = str(body.motivoEsito, 300);

  await adminDb.collection('leads').doc(id).update(update);
  return NextResponse.json({ ok: true });
}
