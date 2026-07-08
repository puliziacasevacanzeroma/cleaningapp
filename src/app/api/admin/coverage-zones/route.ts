/**
 * /api/admin/coverage-zones — CAP coperti dal servizio (solo ADMIN)
 * v1 — 08/07/2026
 *
 * GET    → lista { cap, attivo, note }
 * POST   → aggiungi CAP: body { cap, note? }
 * PATCH  → attiva/disattiva: body { cap, attivo }
 * DELETE → elimina: body { cap }
 * Ogni scrittura invalida la cache di coverageZones: il widget vede la
 * modifica alla richiesta successiva.
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '~/lib/firebase/admin';
import { requireAdmin } from '~/lib/api-auth';
import { invalidateCoverageCache } from '~/lib/quote/coverageZones';

export const runtime = 'nodejs';

const CAP_RE = /^\d{5}$/;

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const snap = await adminDb.collection('coverageZones').get();
  const zone = snap.docs
    .map((d) => ({ cap: d.id, attivo: d.data()?.attivo !== false, note: (d.data()?.note as string) || '' }))
    .sort((a, b) => a.cap.localeCompare(b.cap));
  return NextResponse.json({ ok: true, zone });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: { cap?: string; note?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, errore: 'Body non valido' }, { status: 400 }); }

  const cap = (body.cap || '').trim();
  if (!CAP_RE.test(cap)) return NextResponse.json({ ok: false, errore: 'CAP non valido (5 cifre)' }, { status: 400 });

  await adminDb.collection('coverageZones').doc(cap).set({
    attivo: true,
    note: typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '',
    aggiornatoIl: FieldValue.serverTimestamp(),
  }, { merge: true });
  invalidateCoverageCache();
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: { cap?: string; attivo?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, errore: 'Body non valido' }, { status: 400 }); }

  const cap = (body.cap || '').trim();
  if (!CAP_RE.test(cap)) return NextResponse.json({ ok: false, errore: 'CAP non valido' }, { status: 400 });

  await adminDb.collection('coverageZones').doc(cap).set({
    attivo: body.attivo !== false,
    aggiornatoIl: FieldValue.serverTimestamp(),
  }, { merge: true });
  invalidateCoverageCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: { cap?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, errore: 'Body non valido' }, { status: 400 }); }

  const cap = (body.cap || '').trim();
  if (!CAP_RE.test(cap)) return NextResponse.json({ ok: false, errore: 'CAP non valido' }, { status: 400 });

  await adminDb.collection('coverageZones').doc(cap).delete();
  invalidateCoverageCache();
  return NextResponse.json({ ok: true });
}
