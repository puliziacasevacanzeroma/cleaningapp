import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GAP DECISION — l'admin chiude un sospetto sollevato da gap-audit-weekly.
 *
 * POST body: { notificationId: string, decision: 'OK' | 'NEEDED' }
 *   - OK     → verificato su Booking: è un solo ospite / chiusura calendario,
 *              la pulizia NON serve. La data finisce in `verifiedGaps` e non
 *              verrà mai più segnalata.
 *   - NEEDED → verificato: c'è davvero un cambio ospiti, la pulizia serve.
 *              La data finisce comunque in `verifiedGaps` (con esito NEEDED),
 *              così l'audit smette di ripeterla, e l'admin la crea a mano.
 *
 * ⚠️ SCELTA DI PROGETTO: 'NEEDED' **non crea** la pulizia in automatico.
 * Creare una pulizia richiede numero ospiti, prezzo e configurazione biancheria:
 * indovinarli da qui produrrebbe ordini sbagliati. La creazione resta il
 * percorso ufficiale (calendario → Nuova pulizia), che passa da linenCore.
 *
 * Autorizzazione: SOLO ADMIN (l'audit è indirizzato solo a loro).
 */

const fmtIt = (s: string) => {
  const p = String(s || "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
};

export async function POST(req: NextRequest) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if ((user.role || "").toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Accesso negato: solo amministrazione" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body non valido" }, { status: 400 }); }
  const { notificationId, decision } = body || {};
  if (!notificationId || !["OK", "NEEDED"].includes(decision)) {
    return NextResponse.json({ error: "Parametri non validi (notificationId, decision OK|NEEDED)" }, { status: 400 });
  }

  try {
    const notifRef = adminDb.collection("notifications").doc(notificationId);
    const notifSnap = await notifRef.get();
    if (!notifSnap.exists) return NextResponse.json({ error: "Notifica non trovata" }, { status: 404 });
    const notif = notifSnap.data() as any;

    if (notif.actionType !== "GAP_VERIFICATION" || !notif.gapAction?.date) {
      return NextResponse.json({ error: "Questa notifica non prevede azioni" }, { status: 400 });
    }
    if (notif.actionResolved) {
      return NextResponse.json({
        error: `Già gestita: ${notif.actionResolved === "OK" ? "nessuna pulizia necessaria" : "pulizia da creare"}`,
        alreadyResolved: notif.actionResolved,
      }, { status: 409 });
    }

    const ga = notif.gapAction as {
      propertyId: string; propertyName: string; date: string;
      bookingId?: string; blockCheckIn?: string; blockCheckOut?: string;
    };
    const gapKey = notif.actionKey || `${ga.propertyId}_${ga.date}`;
    const now = Timestamp.now();

    // Registro permanente: l'audit non ripeterà più questa data
    await adminDb.collection("verifiedGaps").doc(gapKey).set({
      gapKey,
      propertyId: ga.propertyId,
      propertyName: ga.propertyName,
      date: ga.date,
      bookingId: ga.bookingId || null,
      blockCheckIn: ga.blockCheckIn || null,
      blockCheckOut: ga.blockCheckOut || null,
      outcome: decision, // OK = nessuna pulizia dovuta, NEEDED = pulizia da creare
      verifiedBy: user.name || user.id,
      verifiedById: user.id,
      verifiedAt: now,
    });

    // Chiude tutte le copie della notifica (una per admin, stesso actionKey)
    if (notif.actionKey) {
      const twins = await adminDb.collection("notifications").where("actionKey", "==", notif.actionKey).get();
      for (const t of twins.docs) {
        await adminDb.collection("notifications").doc(t.id).update({
          actionResolved: decision,
          actionResolvedBy: user.name || user.id,
          actionResolvedByRole: "ADMIN",
          actionResolvedAt: now,
          actionRequired: false,
          actionStatus: "DONE",
          updatedAt: now,
        });
      }
    } else {
      await notifRef.update({
        actionResolved: decision, actionResolvedBy: user.name || user.id,
        actionResolvedByRole: "ADMIN", actionResolvedAt: now,
        actionRequired: false, actionStatus: "DONE", updatedAt: now,
      });
    }

    const message = decision === "OK"
      ? `Segnato: il ${fmtIt(ga.date)} non serve nessuna pulizia. Non te lo chiederò più.`
      : `Segnato: il ${fmtIt(ga.date)} serve la pulizia. Creala dal calendario — da qui non la creo in automatico per non sbagliare ospiti e biancheria.`;

    return NextResponse.json({
      success: true,
      decision,
      message,
      creaPuliziaLink: decision === "NEEDED" ? `/dashboard/calendario/pulizie?date=${ga.date}` : null,
    });
  } catch (e: any) {
    console.error("[gap-decision] errore:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
