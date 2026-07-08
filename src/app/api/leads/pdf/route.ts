/**
 * /api/leads/pdf — PDF del preventivo di un lead (solo ADMIN)
 * v1 — 08/07/2026
 *
 * GET  ?id=<leadId>  → rigenera il PDF dal lead salvato e lo scarica
 * POST { id }        → rigenera il PDF e REINVIA l'email al cliente
 * Il PDF viene ricostruito con buildPreventivoPdf dagli stessi dati del
 * lead (quote salvata): identico a quello inviato la prima volta.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '~/lib/firebase/admin';
import { requireAdmin } from '~/lib/api-auth';
import { resend, FROM_EMAIL, isResendConfigured } from '~/lib/email/config';
import { buildEmailPreventivo } from '~/lib/email/emailPreventivo';
import { buildPreventivoPdf } from '~/lib/email/preventivoPdf';

export const runtime = 'nodejs';

async function caricaLead(id: string) {
  const snap = await adminDb.collection('leads').doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
}

function argsDaLead(lead: Record<string, unknown>) {
  const contatti = lead.contatti as { nome: string; email: string } | undefined;
  const createdAt = (lead.createdAt as { toDate?: () => Date } | undefined)?.toDate?.();
  return {
    nome: contatti?.nome || 'Cliente',
    tipo: (lead.tipo as string) || 'casa',
    zona: (lead.zona as string) || '',
    copertura: (lead.copertura as string) || 'coperta',
    quote: lead.quote as Parameters<typeof buildPreventivoPdf>[0]['quote'],
    numeroPreventivo: (lead.numeroPreventivo as string) || '-',
    dataIt: (createdAt ?? new Date()).toLocaleDateString('it-IT'),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const id = (request.nextUrl.searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, errore: 'id mancante' }, { status: 400 });

  const lead = await caricaLead(id);
  if (!lead) return NextResponse.json({ ok: false, errore: 'Lead non trovato' }, { status: 404 });

  try {
    const args = argsDaLead(lead);
    const pdf = await buildPreventivoPdf(args);
    const filename = 'Preventivo_N' + args.numeroPreventivo.replace('/', '-') + '_Puliziacasevacanze.pdf';
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[leads/pdf] Generazione fallita:', err);
    return NextResponse.json({ ok: false, errore: 'Generazione PDF fallita' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: { id?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, errore: 'Body non valido' }, { status: 400 }); }

  const id = (body.id || '').trim();
  if (!id) return NextResponse.json({ ok: false, errore: 'id mancante' }, { status: 400 });

  const lead = await caricaLead(id);
  if (!lead) return NextResponse.json({ ok: false, errore: 'Lead non trovato' }, { status: 404 });

  if (!isResendConfigured() || !resend) {
    return NextResponse.json({ ok: false, errore: 'Email non configurata (Resend)' }, { status: 500 });
  }

  const contatti = lead.contatti as { nome: string; email: string };
  if (!contatti?.email) return NextResponse.json({ ok: false, errore: 'Lead senza email' }, { status: 400 });

  try {
    const args = argsDaLead(lead);
    const mail = buildEmailPreventivo({
      nome: args.nome,
      tipo: args.tipo as Parameters<typeof buildEmailPreventivo>[0]['tipo'],
      zona: args.zona,
      copertura: args.copertura as Parameters<typeof buildEmailPreventivo>[0]['copertura'],
      quote: lead.quote as Parameters<typeof buildEmailPreventivo>[0]['quote'],
    });
    let attachments: { filename: string; content: Buffer }[] | undefined;
    try {
      const pdf = await buildPreventivoPdf(args);
      attachments = [{ filename: 'Preventivo_N' + args.numeroPreventivo.replace('/', '-') + '_Puliziacasevacanze.pdf', content: pdf }];
    } catch (err) {
      console.error('[leads/pdf] PDF non generato, reinvio senza allegato:', err);
    }
    await resend.emails.send({ from: FROM_EMAIL, to: contatti.email, subject: mail.subject, html: mail.html, attachments });
    await adminDb.collection('leads').doc(id).update({ ultimoReinvio: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[leads/pdf] Reinvio fallito:', err);
    return NextResponse.json({ ok: false, errore: 'Invio email fallito' }, { status: 500 });
  }
}
