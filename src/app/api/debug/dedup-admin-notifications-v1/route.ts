/**
 * DEDUP notifiche ADMIN duplicate (fix duplicati 27/07/2026).
 * GET /api/debug/dedup-admin-notifications-v1?cronSecret=XXX          → DRY-RUN
 * GET /api/debug/dedup-admin-notifications-v1?cronSecret=XXX&apply=1  → SCRIVE
 *
 * CONTESTO: le route sync-ical creavano una notifica PER OGNI utente ADMIN
 * (recipientRole:'ADMIN' + recipientId), ma il reader admin filtra solo per
 * recipientRole → ogni admin vedeva N copie identiche (N = utenti ADMIN).
 * Il writer è stato corretto (una sola notifica role-based); questa route
 * pulisce le copie GIÀ esistenti.
 *
 * CRITERIO (conservativo): considera duplicati SOLO le notifiche con
 * recipientRole='ADMIN' E recipientId valorizzato (il pattern moltiplicato),
 * raggruppate per titolo+messaggio+finestra di 5 minuti. In ogni gruppo con
 * più di 1 elemento: TIENE la più vecchia (e le toglie il recipientId, così è
 * una normale notifica role-based), CANCELLA le altre. Se una copia del gruppo
 * è già stata letta/gestita, lo stato più "avanzato" viene conservato sulla
 * superstite (READ batte UNREAD; actionStatus non-PENDING batte PENDING).
 *
 * BONUS: elenca gli utenti con ruolo ADMIN (per capire perché i duplicati
 * erano 4: al momento del bug c'erano 4 account ADMIN nel database).
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const apply = searchParams.get("apply") === "1";

  try {
    // ── censimento utenti ADMIN ────────────────────────────────────────────
    const adminsSnap = await adminDb.collection("users").where("role", "==", "ADMIN").get();
    const adminUsers = adminsSnap.docs.map((d) => {
      const u = d.data() as any;
      return { id: d.id, name: u.name || u.displayName || null, email: u.email || null };
    });

    // ── candidate: solo il pattern moltiplicato (ADMIN + recipientId) ─────
    const notifSnap = await adminDb
      .collection("notifications")
      .where("recipientRole", "==", "ADMIN")
      .get();
    const candidates = notifSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((n) => n.recipientId);

    // ── raggruppa per titolo+messaggio+finestra 5 min ─────────────────────
    const groups = new Map<string, any[]>();
    for (const n of candidates) {
      const ts = n.createdAt?.toDate?.()?.getTime?.() ?? 0;
      const bucket = Math.floor(ts / (5 * 60 * 1000)); // finestra 5 minuti
      const key = `${n.title}||${n.message}||${bucket}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }

    const dedupReport: any[] = [];
    let daCancellare = 0;
    let cancellate = 0;

    for (const [, list] of groups) {
      if (list.length < 2) continue;
      // ordina per createdAt crescente → tieni la prima
      list.sort((a, b) => (a.createdAt?.toDate?.()?.getTime?.() ?? 0) - (b.createdAt?.toDate?.()?.getTime?.() ?? 0));
      const keeper = list[0];
      const doomed = list.slice(1);
      daCancellare += doomed.length;

      // stato più "avanzato" del gruppo da conservare sulla superstite
      const anyRead = list.some((n) => n.status === "READ" || n.status === "ARCHIVED");
      const bestStatus = list.some((n) => n.status === "ARCHIVED") ? "ARCHIVED" : anyRead ? "READ" : keeper.status;
      const anyActionDone = list.find((n) => n.actionStatus && n.actionStatus !== "PENDING");

      dedupReport.push({
        titolo: keeper.title,
        creataIl: keeper.createdAt?.toDate?.()?.toISOString?.() ?? null,
        copie: list.length,
        tengo: keeper.id,
        cancello: doomed.map((n) => n.id),
        statoFinale: bestStatus,
      });

      if (apply) {
        const keeperUpdate: Record<string, any> = {
          recipientId: FieldValue.delete(), // diventa una normale role-based
          status: bestStatus,
        };
        if (anyActionDone) keeperUpdate.actionStatus = anyActionDone.actionStatus;
        await adminDb.collection("notifications").doc(keeper.id).update(keeperUpdate);
        for (const n of doomed) {
          await adminDb.collection("notifications").doc(n.id).delete();
          cancellate++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      mode: apply ? "APPLY (scritture eseguite)" : "DRY-RUN (nessuna scrittura — aggiungi &apply=1)",
      utentiADMIN: {
        totale: adminUsers.length,
        elenco: adminUsers,
        nota: adminUsers.length > 3
          ? "⚠️ Più di 3 account ADMIN: verifica se il quarto è voluto (i duplicati erano N = numero di admin)."
          : "Numero admin come atteso.",
      },
      duplicati: {
        gruppiConDuplicati: dedupReport.length,
        notificheDaCancellare: daCancellare,
        notificheCancellate: apply ? cancellate : 0,
      },
      dettaglio: dedupReport,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
