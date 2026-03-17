/**
 * POST /api/admin/fix-all-duplicates
 * Elimina tutte le pulizie duplicate in tutte le proprietà
 * Mantiene la prima pulizia per ogni (propertyId + data), elimina le altre
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { dryRun = true } = await request.json().catch(() => ({ dryRun: true }));

    // Carica tutte le pulizie SCHEDULED o ASSIGNED (non toccare COMPLETED/IN_PROGRESS)
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("status", "in", ["SCHEDULED", "ASSIGNED"])
      .get();

    const cleanings = cleaningsSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as any),
    }));

    // Raggruppa per propertyId + data
    const byKey = new Map<string, any[]>();
    for (const c of cleanings) {
      const date = c.scheduledDate?.toDate?.()?.toISOString().split("T")[0];
      if (!date || !c.propertyId) continue;
      const key = `${c.propertyId}__${date}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(c);
    }

    // Trova duplicati
    const toDelete: { id: string; propertyName: string; date: string }[] = [];
    for (const [key, group] of byKey.entries()) {
      if (group.length <= 1) continue;
      // Ordina: preferisci quelli con bookingId, poi i più vecchi (createdAt)
      group.sort((a, b) => {
        if (a.bookingId && !b.bookingId) return -1;
        if (!a.bookingId && b.bookingId) return 1;
        const ta = a.createdAt?.toDate?.()?.getTime() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime() || 0;
        return ta - tb;
      });
      // Tieni il primo, elimina gli altri
      const [, ...dups] = group;
      for (const dup of dups) {
        const date = dup.scheduledDate?.toDate?.()?.toISOString().split("T")[0] || "?";
        toDelete.push({ id: dup.id, propertyName: dup.propertyName || dup.propertyId, date });
      }
    }

    if (dryRun) {
      // Solo anteprima — non elimina nulla
      const byProp = new Map<string, number>();
      for (const d of toDelete) {
        byProp.set(d.propertyName, (byProp.get(d.propertyName) || 0) + 1);
      }
      return NextResponse.json({
        dryRun: true,
        totalDuplicates: toDelete.length,
        byProperty: Object.fromEntries(byProp),
        message: `Trovati ${toDelete.length} duplicati. Chiama con dryRun:false per eliminare.`,
      });
    }

    // Elimina tutti i duplicati
    const batch_size = 400;
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += batch_size) {
      const batch = adminDb.batch();
      for (const dup of toDelete.slice(i, i + batch_size)) {
        batch.delete(adminDb.collection("cleanings").doc(dup.id));
      }
      await batch.commit();
      deleted += Math.min(batch_size, toDelete.length - i);
    }

    const byProp = new Map<string, number>();
    for (const d of toDelete) {
      byProp.set(d.propertyName, (byProp.get(d.propertyName) || 0) + 1);
    }

    return NextResponse.json({
      success: true,
      deleted,
      byProperty: Object.fromEntries(byProp),
      message: `✅ Eliminati ${deleted} duplicati`,
    });

  } catch (error: any) {
    console.error("Errore fix-all-duplicates:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
