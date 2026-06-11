import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * fix-orphan-assigned-status-v1
 *
 * CONTESTO: il vecchio modal operatori (DashboardContent) e il calendario
 * (PulizieAdminView) rimuovevano gli operatori con updateDoc diretto SENZA
 * riportare lo status a SCHEDULED. Risultato: pulizie con badge "ASSEGNATA"
 * ma zero operatori. Il bug è stato corretto alla fonte (tutte le scritture
 * passano dall'API); questa route ripara i dati storici rimasti sporchi.
 *
 * COSA TROVA: cleanings con status ASSIGNED ma né operators[] popolato,
 * né operatorId, né operator.id — cioè "assegnate a nessuno".
 * Considera solo pulizie NON concluse (esclude COMPLETED/VERIFIED/CANCELLED,
 * che comunque non possono essere ASSIGNED, per sicurezza).
 *
 * USO (gated da cronSecret):
 *   GET /api/debug/fix-orphan-assigned-status-v1?cronSecret=XXX            → DRY-RUN (default)
 *   GET /api/debug/fix-orphan-assigned-status-v1?cronSecret=XXX&apply=1    → ripara (status → SCHEDULED)
 *
 * Riporta anche (solo segnalazione, mai toccati in automatico) i "fantasmi":
 * pulizie con operators[] vuoto ma campo legacy `operator` ancora valorizzato.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cronSecret = searchParams.get("cronSecret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const apply = searchParams.get("apply") === "1";

  try {
    const snap = await adminDb
      .collection("cleanings")
      .where("status", "==", "ASSIGNED")
      .get();

    const orphans: Array<Record<string, any>> = [];
    const ghosts: Array<Record<string, any>> = [];

    snap.docs.forEach((d) => {
      const c = d.data() as Record<string, any>;
      const hasArray = Array.isArray(c.operators) && c.operators.some((o: any) => o && o.id);
      const hasLegacyId = typeof c.operatorId === "string" && c.operatorId.trim() !== "";
      const hasLegacySingle = c.operator && c.operator.id;

      const dateStr = c.scheduledDate?.toDate?.()?.toISOString?.()?.slice(0, 10) || null;

      if (!hasArray && !hasLegacyId && !hasLegacySingle) {
        orphans.push({
          id: d.id,
          propertyName: c.propertyName || null,
          scheduledDate: dateStr,
          scheduledTime: c.scheduledTime || null,
        });
      } else if (!hasArray && !hasLegacyId && hasLegacySingle) {
        // solo il campo legacy singolare valorizzato: fantasma da segnalare
        ghosts.push({
          id: d.id,
          propertyName: c.propertyName || null,
          scheduledDate: dateStr,
          ghostOperator: c.operator,
        });
      }
    });

    let repaired = 0;
    if (apply && orphans.length > 0) {
      const now = Timestamp.now();
      for (const o of orphans) {
        await adminDb.collection("cleanings").doc(o.id).update({
          status: "SCHEDULED",
          operatorId: "",
          operatorName: "",
          operator: null,
          operators: [],
          updatedAt: now,
          _orphanStatusFixedAt: now, // traccia della riparazione
        });
        repaired++;
      }
    }

    return NextResponse.json({
      mode: apply ? "APPLY" : "DRY-RUN",
      totalAssigned: snap.size,
      orphansFound: orphans.length,
      orphans,
      repaired,
      ghostsFound: ghosts.length,
      ghosts,
      note: apply
        ? "Riparate: status → SCHEDULED, campi operatore azzerati."
        : "Nessuna scrittura eseguita. Aggiungi &apply=1 per riparare.",
    });
  } catch (e) {
    console.error("fix-orphan-assigned-status-v1 errore:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
