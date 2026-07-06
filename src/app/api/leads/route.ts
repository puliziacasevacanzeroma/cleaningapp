/**
 * /api/leads — API preventivi (widget pubblico + dashboard admin)
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

export const runtime = 'nodejs';

const LEADS_NOTIFY_EMAIL = process.env.LEADS_NOTIFY_EMAIL || 'info@puliziacasevacanze.it';
const STATI_VALIDI = ['nuovo', 'contattato', 'convertito', 'perso'] as const;
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

function normalizzaCasa(c: Partial<DatiCasa>): DatiCasa {
  const tagli = ['mono', 'bilo', 'trilo', 'quadri'];
  return {
    taglio: tagli.includes(c.taglio as string) ? (c.taglio as DatiCasa['taglio']) : 'mono',
    mq: int(c.mq, 15, 400),
    matrimoniali: int(c.matrimoniali, 0, 20),
    singoli: int(c.singoli, 0, 20),
    divani: int(c.divani, 0, 20),
    bagni: int(c.bagni, 1, 20),
    cucina: ['angolo', 'sep', 'abit'].includes(c.cucina as string) ? (c.cucina as DatiCasa['cucina']) : 'angolo',
    esterno: ['no', 'balcone', 'terrazzo', 'terrazzoGrande'].includes(c.esterno as string) ? (c.esterno as DatiCasa['esterno']) : 'no',
    vuoleBiancheria: c.vuoleBiancheria === true,
    vuoleKit: c.vuoleKit === true,
    ospiti: int(c.ospiti, 1, 30),
  };
}

// ─────────────────────────────── Email ───────────────────────────────

function emailCliente(nome: string, q: QuoteResult, tipo: TipoStruttura, extra?: { scontoPercento?: number; rifacimentoGiornaliero?: number; areaComuneImporto?: number; areaComuneTipo?: string; passaggio?: { totale: number } | null }): { subject: string; html: string } {
  const blu = '#3D5A73', scuro = '#2A4257', rame = '#B0764A';
  const prezzo = q.suMisura || tipo === 'hotel'
    ? '<p style="font-size:17px">La tua struttura merita un\u2019offerta costruita su misura: <b>ti ricontattiamo entro 24 ore</b>.</p>'
    : `<div style="background:${scuro};color:#fff;border-radius:14px;padding:26px;text-align:center;margin:18px 0">
         <div style="font-size:12px;letter-spacing:2px;opacity:.85">PULIZIA A OGNI CAMBIO OSPITE</div>
         <div style="font-size:14px;margin-top:10px">a partire da</div>
         <div style="font-size:46px;font-weight:800;line-height:1.1">\u20ac ${q.min}</div>
         <div style="display:inline-block;border:1px solid rgba(255,255,255,.4);border-radius:99px;padding:5px 14px;font-size:13px;margin-top:10px">stima massima \u20ac ${q.max}</div>
       </div>`
       + (q.biancheria ? `<p>Biancheria a noleggio (a cambio, consegna e ritiro inclusi): <b>${formatEuro(q.biancheria)}</b></p>` : '')
       + (q.kit ? `<p>Kit di cortesia ospiti: <b>${formatEuro(q.kit)}</b></p>` : '')
       + (extra?.scontoPercento ? `<p>Sconto multi-unit\u00e0: <b>-${extra.scontoPercento}%</b> gi\u00e0 applicato</p>` : '')
       + (extra?.rifacimentoGiornaliero ? `<p>Rifacimento letti giornaliero: <b>${formatEuro(extra.rifacimentoGiornaliero)}</b> a uscita</p>` : '')
       + (extra?.areaComuneImporto ? `<p>Aree comuni: <b>${formatEuro(extra.areaComuneImporto)}</b> ${extra.areaComuneTipo === 'dedicata' ? 'a uscita dedicata' : 'quando siamo gi\u00e0 in struttura'}</p>` : '')
       + (extra?.passaggio ? `<p>Servizio durante il soggiorno: <b>${formatEuro(extra.passaggio.totale)}</b> a passaggio</p>` : '');
  return {
    subject: 'Il tuo preventivo \u2014 Puliziacasevacanze.it',
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#22333F">
      <h2 style="color:${blu}">Ciao ${nome},</h2>
      <p>grazie per la richiesta! Ecco il preventivo indicativo per la tua struttura:</p>
      ${prezzo}
      <p style="font-size:13px;color:#7A8A96">Prezzi al netto di IVA. Il preventivo definitivo te lo confermiamo dopo un <b>sopralluogo gratuito e senza impegno</b>: prima di iniziare firmiamo insieme condizioni e costi.</p>
      <p>Ti contattiamo al pi\u00f9 presto per fissare il sopralluogo. Se preferisci anticiparci: <a href="tel:+393927830017" style="color:${rame}"><b>392 783 0017</b></a></p>
      <p style="color:${blu}"><b>Puliziacasevacanze.it</b><br><span style="font-size:12px;color:#7A8A96">Pulizie e noleggio biancheria per case vacanze, B&B e affittacamere a Roma \u2014 365 giorni l\u2019anno</span></p>
    </div>`,
  };
}

function emailAdmin(doc: Record<string, unknown>, q: QuoteResult): { subject: string; html: string } {
  const c = doc.contatti as { nome: string; email: string; telefono: string };
  return {
    subject: `\u{1F514} Nuovo preventivo: ${c.nome} \u2014 ${doc.tipo}${q.suMisura ? ' (SU MISURA)' : ` \u20ac${q.min}-${q.max}`}`,
    html: `<div style="font-family:Arial,sans-serif;color:#22333F">
      <h3>Nuovo lead dal preventivatore</h3>
      <p><b>${c.nome}</b> \u2014 ${c.telefono} \u2014 ${c.email}<br>
      Zona: <b>${doc.zona || '-'}</b> (${doc.cap || '-'}) \u2014 copertura: <b>${doc.copertura}</b><br>
      Newsletter: ${doc.consensoNewsletter ? 'S\u00cc' : 'no'}</p>
      <p>Apri la dashboard: <a href="https://gestionale.puliziacasevacanze.it/admin/preventivi">gestionale \u2192 Preventivi</a></p>
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
  let quote: QuoteResult | QuoteMultiResult | QuoteBnbV2;
  let datiStruttura: Record<string, unknown> = {};
  let passaggio: ReturnType<typeof calcolaPassaggioSoggiorno> | null = null;

  if (body.tipo === 'casa') {
    const casa = normalizzaCasa(body.casa!);
    quote = calcolaCasa(casa);
    if (body.passaggioSoggiorno === true) passaggio = calcolaPassaggioSoggiorno(casa);
    datiStruttura = { ...casa };
  } else if (body.tipo === 'case') {
    const unita = body.unita!.slice(0, 8).map(normalizzaCasa);
    quote = calcolaCase(unita);
    if (body.passaggioSoggiorno === true && unita.length > 0) passaggio = calcolaPassaggioSoggiorno(unita[0]!);
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
    quote = calcolaBnbV2(bnb);
    datiStruttura = { ...bnb };
  } else {
    quote = { suMisura: true, min: 0, max: 0, puntuale: 0, biancheria: 0, kit: 0 };
    datiStruttura = { nomeStruttura: str(body.nomeStruttura, 120) };
  }

  const cap = str(body.cap, 5);
  const copertura = body.tipo === 'hotel' ? 'da_valutare' : verificaCopertura(cap, await getCoveredCaps());

  const leadDoc = {
    tipo: body.tipo,
    datiStruttura,
    quote: {
      suMisura: quote.suMisura, min: quote.min, max: quote.max,
      puntuale: quote.puntuale, biancheria: quote.biancheria, kit: quote.kit,
      taglioEffettivo: (quote as QuoteResult).taglioEffettivo ?? null,
      scontoPercento: (quote as QuoteMultiResult).scontoPercento ?? 0,
      unitaDettaglio: (quote as QuoteMultiResult).unitaDettaglio ?? null,
      rifacimentoGiornaliero: (quote as QuoteBnbV2).rifacimentoGiornaliero ?? 0,
      areaComuneImporto: (quote as QuoteBnbV2).areaComuneImporto ?? 0,
      areaComuneTipo: (quote as QuoteBnbV2).areaComuneTipo ?? 'no',
      passaggio,
    },
    zona: str(body.zona, 80),
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
    foto: [] as string[], // popolate dallo step foto (v2 widget)
    fonte: 'widget',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const mailCliente = emailCliente(leadDoc.contatti.nome, quote, body.tipo, leadDoc.quote);
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
  const ref = await adminDb.collection('leads').add(leadDoc);

  // Email best-effort: un errore email non deve far fallire il lead.
  if (isResendConfigured() && resend) {
    try {
      await resend.emails.send({ from: FROM_EMAIL, to: leadDoc.contatti.email, subject: mailCliente.subject, html: mailCliente.html });
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
    return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null, updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null };
  });
  return NextResponse.json({ ok: true, leads });
}

// ─────────────────────────────── PATCH (ADMIN) ───────────────────────────────

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: { id?: string; stato?: string; note?: string };
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

  await adminDb.collection('leads').doc(id).update(update);
  return NextResponse.json({ ok: true });
}
