import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/lookup-user?id=XXXX
 */
export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const uid = new URL(request.url).searchParams.get("id");
  if (!uid) return NextResponse.json({ error: "Parametro ?id= richiesto" }, { status: 400 });

  const doc = await adminDb.collection("users").doc(uid).get();
  if (!doc.exists) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });

  const d = doc.data() as Record<string, any>;
  return NextResponse.json({
    id: uid,
    name: d.name || null,
    surname: d.surname || null,
    email: d.email || null,
    role: d.role || null,
    phone: d.phone || null,
    status: d.status || null,
    createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
  });
}
