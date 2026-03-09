import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { requireAdmin } from "~/lib/api-auth";

type ChecklistItem = { id: string; text: string; category: string };
type PropertyDoc = { checklist?: ChecklistItem[]; name?: string };

// GET /api/admin/checklist?propertyId=xxx
export async function GET(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("propertyId");

  if (!propertyId) {
    return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
  }

  const snap = await adminDb.collection("properties").doc(propertyId).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
  }

  const data = snap.data() as PropertyDoc;
  return NextResponse.json({
    checklist: data.checklist ?? [],
    propertyName: data.name ?? propertyId,
  });
}

// POST /api/admin/checklist
// Body: { propertyId, checklist: [{id, text, category}] }
export async function POST(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const body = await request.json() as { propertyId?: string; checklist?: unknown };
  const { propertyId, checklist } = body;

  if (!propertyId) {
    return NextResponse.json({ error: "propertyId richiesto" }, { status: 400 });
  }
  if (!Array.isArray(checklist)) {
    return NextResponse.json({ error: "checklist deve essere un array" }, { status: 400 });
  }

  await adminDb.collection("properties").doc(propertyId).update({
    checklist,
    checklistUpdatedAt: new Date(),
  });

  return NextResponse.json({ success: true, count: checklist.length });
}
