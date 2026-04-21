import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Endpoint ONE-SHOT di cleanup: rimuove le notifiche SHIFT_STARTED/SHIFT_ENDED
 * create dal bug dei duplicati (una per admin invece di una sola).
 *
 * SICUREZZA: solo admin può invocare. Non cancella nulla di sensibile.
 *
 * Da chiamare manualmente (UNA VOLTA) dopo il deploy del fix:
 *   POST /api/admin/cleanup-shift-notifications
 *
 * O via browser come admin loggato (apri URL in una tab):
 *   https://gestionale.puliziacasevacanze.it/api/admin/cleanup-shift-notifications
 */
export async function GET(_request: NextRequest) {
  return await runCleanup();
}

export async function POST(_request: NextRequest) {
  return await runCleanup();
}

async function runCleanup() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const isAdmin = user.role?.toUpperCase() === "ADMIN";
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  try {
    // Cerca tutte le notifiche di tipo SHIFT_STARTED o SHIFT_ENDED
    const [startedSnap, endedSnap] = await Promise.all([
      adminDb.collection("notifications").where("type", "==", "SHIFT_STARTED").get(),
      adminDb.collection("notifications").where("type", "==", "SHIFT_ENDED").get(),
    ]);

    const allDocs = [...startedSnap.docs, ...endedSnap.docs];

    if (allDocs.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: "Nessuna notifica turno da pulire",
      });
    }

    // Cancella in batch (Firestore max 500 per batch)
    let deleted = 0;
    const BATCH_SIZE = 450;
    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      const slice = allDocs.slice(i, i + BATCH_SIZE);
      for (const doc of slice) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      deleted += slice.length;
    }

    return NextResponse.json({
      success: true,
      deleted,
      message: `Cancellate ${deleted} notifiche di turno (${startedSnap.size} start + ${endedSnap.size} end).`,
    });
  } catch (error: any) {
    console.error("[cleanup-shift-notifications] Errore:", error);
    return NextResponse.json(
      { error: error?.message || "Errore cleanup" },
      { status: 500 }
    );
  }
}
