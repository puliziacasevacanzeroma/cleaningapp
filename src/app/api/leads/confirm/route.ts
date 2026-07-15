/**
 * /api/leads/confirm — Conferma del prezzo da parte del CLIENTE (pubblico, senza login).
 *
 * L'autenticazione È il token: una stringa casuale di 48 caratteri generata alla
 * creazione del lead, presente solo nella mail del cliente e nella schermata
 * risultato del wizard. Senza token valido non si conferma niente.
 *
 * GET  ?t=TOKEN  → info di cortesia per la pagina di conferma (nome, numero, prezzo).
 *                  NESSUNA scrittura: gli scanner antivirus delle mail seguono i link
 *                  GET, quindi la conferma NON può avvenire qui.
 * POST { token } → segna prezzoAccettato=true. Idempotente: confermare due volte
 *                  non è un errore.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '~/lib/firebase/admin';

function tokenValido(t: unknown): t is string {
  return typeof t === 'string' && /^[a-f0-9]{48}$/.test(t);
}

async function trovaLead(token: string) {
  const snap = await adminDb.collection('leads').where('confirmToken', '==', token).limit(1).get();
  return snap.empty ? null : snap.docs[0]!;
}

export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get('t');
  if (!tokenValido(t)) return NextResponse.json({ ok: false, errore: 'Link non valido' }, { status: 400 });

  const doc = await trovaLead(t);
  if (!doc) return NextResponse.json({ ok: false, errore: 'Preventivo non trovato' }, { status: 404 });

  const d = doc.data();
  const q = (d.quote ?? {}) as { min?: number; max?: number; suMisura?: boolean; unitaDettaglio?: { nome: string; min: number; max: number }[] | null };
  return NextResponse.json({
    ok: true,
    nome: (d.contatti as { nome?: string } | undefined)?.nome ?? '',
    numeroPreventivo: d.numeroPreventivo ?? '',
    tipo: d.tipo ?? 'casa',
    min: q.min ?? 0,
    max: q.max ?? 0,
    unitaDettaglio: Array.isArray(q.unitaDettaglio) ? q.unitaDettaglio.map((u) => ({ nome: u.nome, min: u.min, max: u.max })) : null,
    giaAccettato: d.prezzoAccettato === true,
  });
}

export async function POST(request: NextRequest) {
  let body: { token?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, errore: 'Body non valido' }, { status: 400 }); }

  if (!tokenValido(body.token)) return NextResponse.json({ ok: false, errore: 'Token non valido' }, { status: 400 });

  const doc = await trovaLead(body.token);
  if (!doc) return NextResponse.json({ ok: false, errore: 'Preventivo non trovato' }, { status: 404 });

  const gia = doc.data().prezzoAccettato === true;
  if (!gia) {
    await doc.ref.update({
      prezzoAccettato: true,
      prezzoAccettatoAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return NextResponse.json({ ok: true, giaAccettato: gia });
}
