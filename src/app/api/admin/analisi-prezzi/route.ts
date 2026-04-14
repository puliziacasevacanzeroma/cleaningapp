import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  try {
    // ── 1. Verifica autenticazione ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);

    // ── 2. Verifica ruolo ADMIN ─────────────────────────────────────────────
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 });
    }

    // ── 3. Lettura proprietà - SOLO i campi necessari, zero scritture ───────
    const snapshot = await adminDb.collection('properties').get();

    const properties = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        nome: d.name ?? d.nome ?? '—',
        mq: d.squareMeters ?? d.mq ?? null,
        camere: d.bedrooms ?? d.camere ?? null,
        bagni: d.bathrooms ?? d.bagni ?? null,
        ospiti: d.maxGuests ?? d.ospiti ?? null,
        prezzo_pulizia: d.cleaningPrice ?? d.prezzoPulizia ?? null,
        status: d.status ?? null,
      };
    });

    // ── 4. Solo proprietà con prezzo impostato (quelle utili all'analisi) ───
    const conPrezzo = properties.filter(p => p.prezzo_pulizia !== null);
    const senzaPrezzo = properties.filter(p => p.prezzo_pulizia === null);

    return NextResponse.json({
      totale_proprieta: properties.length,
      con_prezzo: conPrezzo.length,
      senza_prezzo: senzaPrezzo.length,
      proprieta: conPrezzo,
      proprieta_senza_prezzo: senzaPrezzo.map(p => ({ id: p.id, nome: p.nome })),
    });

  } catch (err: any) {
    console.error('[analisi-prezzi] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
