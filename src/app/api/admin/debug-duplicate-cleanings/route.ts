import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not available in production" }, { status: 403 });

  const cleaningsSnap = await adminDb.collection('cleanings').get();
  const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })) as any[];

  const byKey = new Map<string, any[]>();
  for (const c of cleanings) {
    if (c.status === 'CANCELLED') continue;
    const d = c.scheduledDate?.toDate?.();
    if (!d) continue;
    const key = `${c.propertyId}|${d.toISOString().split('T')[0]}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(c);
  }

  const duplicates = [];
  for (const [key, items] of byKey.entries()) {
    if (items.length > 1) {
      duplicates.push({ key, count: items.length, items: items.map(i => ({ id: i.id, status: i.status, source: i.source, propertyName: i.propertyName, createdAt: i.createdAt?.toDate?.()?.toISOString() })) });
    }
  }

  return NextResponse.json({ total: cleanings.length, duplicateGroups: duplicates.length, duplicates });
}
