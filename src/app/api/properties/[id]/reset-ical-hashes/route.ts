/**
 * Reset iCal feed hashes per forzare re-sync completo
 * POST /api/properties/[id]/reset-ical-hashes
 */

import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const docSnap = await getDoc(doc(db, 'properties', id));
    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Proprietà non trovata' }, { status: 404 });
    }
    
    // Reset tutti i feedHashes
    await updateDoc(doc(db, 'properties', id), {
      feedHashes: {},
      updatedAt: Timestamp.now(),
    });
    
    console.log(`🔄 Reset feedHashes per proprietà ${id}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Hash reset - il prossimo sync rielaborerà tutto' 
    });
    
  } catch (error: any) {
    console.error('Errore reset hash:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
