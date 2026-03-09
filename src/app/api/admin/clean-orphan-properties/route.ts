import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { deletePropertyWithCascade } from "~/lib/firebase/firestore-data-admin";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const dryRun = req.nextUrl.searchParams.get("dryRun") !== "false";

  try {
    const usersSnap = await adminDb.collection("users").get();
    const existingUserIds = new Set(usersSnap.docs.map(d => d.id));
    const propsSnap = await adminDb.collection("properties").get();

    const orphanProperties: Array<{ id: string; name: string; ownerId: string; status: string }> = [];
    for (const propDoc of propsSnap.docs) {
      const data = propDoc.data() as Record<string, any>;
      const ownerId = data.ownerId;
      if (!ownerId || !existingUserIds.has(ownerId)) {
        orphanProperties.push({ id: propDoc.id, name: data.name || "Senza nome", ownerId: ownerId || "NESSUNO", status: data.status || "UNKNOWN" });
      }
    }

    if (dryRun) {
      return NextResponse.json({ mode: "🔍 DRY RUN (anteprima)", orphanProperties, count: orphanProperties.length, message: orphanProperties.length > 0 ? `Trovate ${orphanProperties.length} proprietà di utenti cancellati. Usa ?dryRun=false per eliminarle.` : "Nessuna proprietà orfana trovata." });
    }

    const totalDeleted = { properties: 0, cleanings: 0, orders: 0, bookings: 0 };
    for (const prop of orphanProperties) {
      try {
        const result = await deletePropertyWithCascade(prop.id);
        totalDeleted.cleanings += result.deletedCleanings;
        totalDeleted.orders += result.deletedOrders;
        totalDeleted.bookings += result.deletedBookings;
        await adminDb.collection("properties").doc(prop.id).delete();
        totalDeleted.properties++;
      } catch (e) { console.error(`❌ Errore eliminazione ${prop.name}:`, e); }
    }

    return NextResponse.json({ mode: "🗑️ ESEGUITO", deleted: totalDeleted, message: `Eliminate ${totalDeleted.properties} proprietà, ${totalDeleted.cleanings} pulizie, ${totalDeleted.orders} ordini, ${totalDeleted.bookings} prenotazioni.` });
  } catch (error: any) {
    console.error("❌ Errore:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
