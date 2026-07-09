/**
 * /api/leads/photos — Upload foto per un lead appena creato
 * v1 — 06/07/2026
 *
 * v2 — 08/07/2026: fino a 10 foto; per il multi, campo `unita` (JSON array
 *   di indici, parallelo ai file) per associare ogni foto alla sua casa.
 * POST multipart (pubblico, rate limit nel middleware):
 *   campi: leadId, foto (fino a 10 file), unita? (es. [0,0,1,2])
 * Protezioni anti-abuso (endpoint pubblico ma NON libero):
 *   - il lead deve esistere, essere stato 'nuovo' e creato da meno di 30 minuti
 *   - massimo 10 foto per lead (30 se multi: 10 a casa), max 15MB a file
 * HEIC/HEIF: convertite in JPEG lato server con heic-convert (già in package.json).
 * Upload su Firebase Storage via Admin SDK → le regole Storage restano chiuse.
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '~/lib/firebase/admin';
import convert from 'heic-convert';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FOTO = 10;
const MAX_FOTO_MULTI = 30;
const MAX_BYTES = 15 * 1024 * 1024;
const FINESTRA_MINUTI = 30;

function isHeic(nome: string, tipo: string): boolean {
  return /\.heic$|\.heif$/i.test(nome) || /heic|heif/i.test(tipo);
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ ok: false, errore: 'Form non valido' }, { status: 400 }); }

  const leadId = String(form.get('leadId') ?? '').trim().slice(0, 40);
  if (!leadId) return NextResponse.json({ ok: false, errore: 'leadId mancante' }, { status: 400 });

  // ── Guardie anti-abuso ──
  const ref = adminDb.collection('leads').doc(leadId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ ok: false, errore: 'Lead non trovato' }, { status: 404 });
  const lead = snap.data()!;
  const creato: Date | null = lead.createdAt?.toDate?.() ?? null;
  const etaMinuti = creato ? (Date.now() - creato.getTime()) / 60000 : Infinity;
  if (lead.stato !== 'nuovo' || etaMinuti > FINESTRA_MINUTI) {
    return NextResponse.json({ ok: false, errore: 'Finestra di caricamento chiusa' }, { status: 403 });
  }
  const fotoEsistenti: string[] = Array.isArray(lead.foto) ? lead.foto : [];
  const limite = lead.tipo === 'case' ? MAX_FOTO_MULTI : MAX_FOTO;
  if (fotoEsistenti.length >= limite) {
    return NextResponse.json({ ok: false, errore: 'Limite foto raggiunto' }, { status: 403 });
  }

  // indice unità (multi): array parallelo ai file, es. [0,0,1,2]
  let unitaIdx: (number | null)[] = [];
  try {
    const raw = form.get('unita');
    if (typeof raw === 'string') {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) unitaIdx = arr.map((v) => (Number.isInteger(v) && v >= 0 && v < 30 ? v : null));
    }
  } catch { /* facoltativo */ }

  const files = form.getAll('foto').filter((f): f is File => f instanceof File);
  const daCaricare = files.slice(0, limite - fotoEsistenti.length);
  if (daCaricare.length === 0) return NextResponse.json({ ok: false, errore: 'Nessun file' }, { status: 400 });

  const bucket = adminStorage.bucket();
  const urls: string[] = [];
  const urlUnita: (number | null)[] = []; // allineato a urls, anche con file saltati

  for (let i = 0; i < daCaricare.length; i++) {
    const file = daCaricare[i]!;
    if (file.size > MAX_BYTES) continue;

    let buffer = Buffer.from(await file.arrayBuffer());
    // Conversione HEIC → JPEG lato server (le foto iPhone passano sempre)
    if (isHeic(file.name, file.type)) {
      try {
        const out = await convert({ buffer: buffer as unknown as ArrayBufferLike, format: 'JPEG', quality: 0.8 });
        buffer = Buffer.from(out as ArrayBuffer);
      } catch (err) {
        console.error('[leads/photos] Conversione HEIC fallita, file saltato:', err);
        continue;
      }
    }

    const nome = `leads/${leadId}/foto-${fotoEsistenti.length + i + 1}-${Date.now()}.jpg`;
    const oggetto = bucket.file(nome);
    try {
      await oggetto.save(buffer, { contentType: 'image/jpeg', resumable: false });
      // URL firmato a lunga scadenza: visibile dalla dashboard senza aprire il bucket
      const [url] = await oggetto.getSignedUrl({ action: 'read', expires: '01-01-2100' });
      urls.push(url);
      urlUnita.push(unitaIdx[i] ?? null);
    } catch (err) {
      console.error('[leads/photos] Upload fallito:', err);
    }
  }

  if (urls.length > 0) {
    const update: Record<string, unknown> = { foto: FieldValue.arrayUnion(...urls), updatedAt: FieldValue.serverTimestamp() };

    // multi: aggancia ogni URL alla sua casa dentro datiStruttura.unita[i].foto
    const unitaArr = (lead.datiStruttura?.unita as Record<string, unknown>[] | undefined);
    if (Array.isArray(unitaArr) && unitaIdx.length > 0) {
      const nuove = unitaArr.map((u) => ({ ...u, foto: Array.isArray(u.foto) ? [...(u.foto as string[])] : [] }));
      urls.forEach((url, i) => {
        const idx = urlUnita[i];
        if (idx !== null && idx !== undefined && nuove[idx]) (nuove[idx].foto as string[]).push(url);
      });
      update['datiStruttura.unita'] = nuove;
    }

    await ref.update(update);
  }

  return NextResponse.json({ ok: true, caricate: urls.length });
}
