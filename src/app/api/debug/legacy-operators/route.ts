import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { requireAdmin } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

// 🔍 DIAGNOSTICA (admin-only): conta quante pulizie usano il formato NUOVO
// (array `operators`) vs il formato VECCHIO (solo `operatorId`/`operatorName`)
// vs nessun operatore. Serve a capire se vale la pena aggiungere il fallback
// legacy nelle card. Sola lettura, non modifica nulla.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const snap = await adminDb.collection("cleanings").get();

    let total = 0;
    let conArrayOperatori = 0;   // formato nuovo: operators con almeno 1 elemento
    let soloVecchioFormato = 0;  // legacy: niente array, ma c'è operatorId/operatorName
    let nessunOperatore = 0;     // nessuno dei due
    const esempiLegacy: Array<{ id: string; operatorId?: string; operatorName?: string; scheduledDate?: string; status?: string }> = [];

    snap.forEach((doc) => {
      total++;
      const d = doc.data() as Record<string, any>;
      const hasArray = Array.isArray(d.operators) && d.operators.length > 0;
      const hasLegacy = !!(d.operatorId || d.operatorName);

      if (hasArray) {
        conArrayOperatori++;
      } else if (hasLegacy) {
        soloVecchioFormato++;
        if (esempiLegacy.length < 15) {
          esempiLegacy.push({
            id: doc.id,
            operatorId: d.operatorId || undefined,
            operatorName: d.operatorName || undefined,
            scheduledDate: d.scheduledDate?.toDate?.()?.toISOString?.() || undefined,
            status: d.status || undefined,
          });
        }
      } else {
        nessunOperatore++;
      }
    });

    return NextResponse.json(
      {
        totalePulizie: total,
        conArrayOperatori_formatoNuovo: conArrayOperatori,
        soloVecchioFormato_legacy: soloVecchioFormato,
        nessunOperatore: nessunOperatore,
        serveFallbackLegacy: soloVecchioFormato > 0,
        esempiLegacy,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("❌ legacy-operators diagnostica error:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
