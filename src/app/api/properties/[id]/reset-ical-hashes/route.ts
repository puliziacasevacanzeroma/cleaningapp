/**
 * Reset iCal feed hashes per forzare re-sync completo
 * POST /api/properties/[id]/reset-ical-hashes
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";


export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  // ── Auth ──────────────────────────────────────────────
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  // ─────────────────────────────────────────────────────

    const { id } = await params;
    
    const docSnap = await adminDb.collection("properties").doc(id).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Proprietà non trovata' }, { status: 404 });
    }
    
    // Reset tutti i feedHashes
    await adminDb.collection("properties").doc(id).update( {
      feedHashes: {},
      updatedAt: Timestamp.now(),
    });
    
    return NextResponse.json({ 
      success: true, 
      message: 'Hash reset - il prossimo sync rielaborerà tutto' 
    });
    
  } catch (error: any) {
    console.error('Errore reset hash:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
