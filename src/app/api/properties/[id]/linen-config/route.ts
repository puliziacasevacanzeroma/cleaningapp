import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const docSnap = await adminDb.collection("properties").doc(id).get();
    if (!docSnap.exists) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    return NextResponse.json({ linenConfig: (docSnap.data() as Record<string, any>).linenConfig || {} });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const { id } = await params;
    const _body = await validateBody(req, GenericBodySchema);
    if (_body instanceof Response) return _body;
    const { linenConfig } = _body;
    
    await adminDb.collection("properties").doc(id).update( { linenConfig, updatedAt: new Date() });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}