import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const _user = await getApiUser();
  if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

  const cleaningId = req.nextUrl.searchParams.get('id');
  if (!cleaningId) return NextResponse.json({ error: "id richiesto" }, { status: 400 });

  const cleaningDoc = await adminDb.collection('cleanings').doc(cleaningId).get();
  if (!cleaningDoc.exists) return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });

  await cleaningDoc.ref.delete();
  return NextResponse.json({ success: true, deleted: cleaningId });
}
