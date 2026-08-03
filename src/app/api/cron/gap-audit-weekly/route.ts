import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * CRON SETTIMANALE — RETE DI SICUREZZA SULLE PULIZIE DI TURNOVER MANCANTI
 *
 * NON crea, NON sposta e NON cancella pulizie. Legge e avvisa. Basta.
 *
 * PERCHÉ ESISTE: la turnover recovery copre UN solo caso (blocco Booking che si
 * allunga a destra col check-in invariato). Restano scoperti almeno tre casi:
 *   - fusione a SINISTRA (nuovo ospite attaccato prima): solo notifica, nessuna
 *     pulizia creata, nessun pulsante;
 *   - blocco che arriva nel feed GIÀ FUSO: nessuna estensione da osservare;
 *   - check-in e checkout che cambiano insieme: percorso standard = spostamento.
 * Questo audit non si fida delle notifiche: ricontrolla i DATI. Quindi copre
 * anche bug che oggi non conosciamo.
 *
 * COME RAGIONA (stessa logica di debug/audit-slipped-turnovers-v1):
 *   1. auditLog → date in cui una pulizia era stata creata;
 *   2. oggi a quella data NON c'è più nessuna pulizia;
 *   3. la data cade DENTRO un blocco Booking attivo (firma della fusione);
 *   4. la data è entro `days` giorni (default 30).
 *
 * ANTI-RUMORE (fondamentale: un allarme che suona sempre è un allarme spento):
 *   - le date già marcate in `verifiedGaps` non vengono più segnalate (l'admin
 *     ha verificato su Booking e ha deciso: vedi /api/gap-decision);
 *   - stessa data ri-segnalata al massimo una volta ogni 6 giorni
 *     (`gapAlerts/{gapKey}.lastNotifiedAt`), così avvicinandosi alla data il
 *     promemoria torna, ma senza sommergere.
 *
 * DESTINATARI: SOLO ADMIN. Mai i proprietari: sono CANDIDATI, non errori
 * accertati, e un falso allarme mandato a 42 proprietari brucia la credibilità
 * di tutti i messaggi automatici.
 *
 * Uso (CRON-JOB.ORG, settimanale):
 *   /api/cron/gap-audit-weekly?cronSecret=XXX
 *   [&days=30]   quanto avanti guardare (default 30)
 *   [&dryRun=1]  simula: nessuna notifica, nessuna scrittura
 */

type AnyRec = Record<string, any>;

const RENOTIFY_AFTER_DAYS = 6;

const dayOf = (t: any): string | null => {
  try {
    const d = typeof t?.toDate === "function" ? t.toDate() : t instanceof Date ? t : null;
    return d ? d.toISOString().split("T")[0]! : null;
  } catch { return null; }
};
const fmtIt = (s: string) => {
  const p = String(s || "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
};

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const days = Math.max(1, Number(req.nextUrl.searchParams.get("days") || 30));
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const todayStr = new Date().toISOString().split("T")[0]!;
  const limitStr = new Date(Date.now() + days * 86400000).toISOString().split("T")[0]!;

  const out: AnyRec = {
    dryRun,
    finestra: { da: todayStr, a: limitStr, giorni: days },
    segnalati: [] as AnyRec[],
    scartati: { fuoriFinestra: 0, giaCoperte: 0, nessunBlocco: 0, giaVerificate: 0, giaSegnalateDiRecente: 0 },
    errori: [] as string[],
  };

  try {
    // ── Proprietà ───────────────────────────────────────────────
    const propsSnap = await adminDb.collection("properties").get();
    const propById = new Map<string, AnyRec>();
    propsSnap.docs.forEach(d => propById.set(d.id, { id: d.id, ...(d.data() as AnyRec) }));

    // ── Pulizie attuali → cosa è coperto oggi ───────────────────
    const cleanSnap = await adminDb.collection("cleanings").get();
    const covered = new Set<string>();
    const cleaningById = new Map<string, { date: string | null; status: string | null }>();
    cleanSnap.docs.forEach(d => {
      const c = d.data() as AnyRec;
      const date = dayOf(c.scheduledDate);
      cleaningById.set(d.id, { date, status: c.status || null });
      if (date && c.status !== "CANCELLED") covered.add(`${c.propertyId}|${date}`);
    });

    // ── Blocchi Booking attivi ──────────────────────────────────
    const bookSnap = await adminDb.collection("bookings").get();
    const blocksByProp = new Map<string, AnyRec[]>();
    bookSnap.docs.forEach(d => {
      const b = d.data() as AnyRec;
      const src = String(b.source || b.bookingSource || "").toLowerCase();
      if (src !== "booking") return; // solo Booking fonde le contigue
      if (String(b.status || "").toLowerCase() === "cancelled") return;
      const ci = dayOf(b.checkIn), co = dayOf(b.checkOut);
      if (!ci || !co) return;
      const pid = b.propertyId || "";
      if (!blocksByProp.has(pid)) blocksByProp.set(pid, []);
      blocksByProp.get(pid)!.push({ id: d.id, checkIn: ci, checkOut: co });
    });

    // ── auditLog: pulizie create in passato ─────────────────────
    const logSnap = await adminDb.collection("auditLog").where("action", "==", "CLEANING_CREATED").get();

    const seen = new Set<string>();
    const candidati: AnyRec[] = [];

    for (const d of logSnap.docs) {
      const a = d.data() as AnyRec;
      const pid = a.propertyId || "";
      const prop = propById.get(pid);
      if (!prop) continue;

      const loggedDate: string | undefined = a.details?.scheduledDate;
      if (!loggedDate || loggedDate < todayStr || loggedDate > limitStr) { out.scartati.fuoriFinestra++; continue; }

      const key = `${pid}|${loggedDate}`;
      if (seen.has(key)) continue;
      if (covered.has(key)) { out.scartati.giaCoperte++; seen.add(key); continue; }

      const block = (blocksByProp.get(pid) || []).find(b => b.checkIn < loggedDate && loggedDate < b.checkOut);
      if (!block) { out.scartati.nessunBlocco++; continue; }

      seen.add(key);
      const cur = a.entityId ? cleaningById.get(a.entityId) : undefined;
      candidati.push({
        gapKey: `${pid}_${loggedDate}`,
        propertyId: pid,
        propertyName: prop.name,
        date: loggedDate,
        block,
        esito: !cur ? "cancellata" : cur.date === loggedDate ? "presente ma non coperta" : `spostata al ${cur.date}`,
      });
    }

    // ── Filtri anti-rumore + invio ──────────────────────────────
    const nowMs = Date.now();
    for (const c of candidati) {
      // (1) già verificata dall'admin?
      const vSnap = await adminDb.collection("verifiedGaps").doc(c.gapKey).get();
      if (vSnap.exists) { out.scartati.giaVerificate++; continue; }

      // (2) già segnalata negli ultimi 6 giorni?
      const alertRef = adminDb.collection("gapAlerts").doc(c.gapKey);
      const alertSnap = await alertRef.get();
      if (alertSnap.exists) {
        const last = (alertSnap.data() as AnyRec)?.lastNotifiedAt;
        const lastMs = typeof last?.toMillis === "function" ? last.toMillis() : 0;
        if (lastMs && nowMs - lastMs < RENOTIFY_AFTER_DAYS * 86400000) {
          out.scartati.giaSegnalateDiRecente++;
          continue;
        }
      }

      const giorni = Math.round(
        (new Date(`${c.date}T12:00:00Z`).getTime() - new Date(`${todayStr}T12:00:00Z`).getTime()) / 86400000
      );
      const quando = giorni <= 0 ? "OGGI" : giorni === 1 ? "DOMANI" : `tra ${giorni} giorni`;

      const gapAction = {
        propertyId: c.propertyId,
        propertyName: c.propertyName,
        date: c.date,
        bookingId: c.block.id,
        blockCheckIn: c.block.checkIn,
        blockCheckOut: c.block.checkOut,
      };

      const titolo = `🔍 Possibile pulizia mancante il ${fmtIt(c.date)} (${quando})`;
      const corpo =
        `🏠 ${c.propertyName}\n\n` +
        `Il ${fmtIt(c.date)} non c'è nessuna pulizia in programma, ma quel giorno cade dentro un blocco Booking che va dal ${fmtIt(c.block.checkIn)} al ${fmtIt(c.block.checkOut)}.\n\n` +
        `In passato una pulizia a quella data era stata creata, poi è ${c.esito}. Questo succede quando Booking unisce due prenotazioni attaccate: se il ${fmtIt(c.date)} c'è davvero un cambio ospiti, la pulizia serve e al momento non c'è.\n\n` +
        `⚠️ Attenzione: questo è un SOSPETTO, non una certezza. Se è un solo ospite che sta ${Math.round((new Date(c.block.checkOut).getTime() - new Date(c.block.checkIn).getTime()) / 86400000)} notti, allora va bene così.\n\n` +
        `👉 Controlla su Booking cosa succede il ${fmtIt(c.date)}, poi apri questa notifica e dimmelo: se mi dici che va bene non te lo chiedo più.`;

      if (!dryRun) {
        const adminsSnap = await adminDb.collection("users").where("role", "==", "ADMIN").get();
        for (const aDoc of adminsSnap.docs) {
          await adminDb.collection("notifications").add({
            title: titolo,
            message: corpo,
            type: "WARNING",
            actionRequired: true,
            actionStatus: "PENDING",
            actionType: "GAP_VERIFICATION",
            actionKey: c.gapKey,
            gapAction,
            recipientRole: "ADMIN", recipientId: aDoc.id,
            senderId: "system", senderName: "Audit settimanale pulizie",
            status: "UNREAD", createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
          });
        }
        try {
          const { sendPushNotification } = await import("~/lib/notifications/sendPushNotification");
          await sendPushNotification(
            { title: titolo, body: `${c.propertyName}: il ${fmtIt(c.date)} potrebbe mancare la pulizia del cambio ospiti. Controlla su Booking.` },
            { role: "ADMIN", priority: "high" }
          );
        } catch { /* push non bloccante */ }

        await alertRef.set({
          gapKey: c.gapKey, propertyId: c.propertyId, propertyName: c.propertyName,
          date: c.date, bookingId: c.block.id,
          lastNotifiedAt: Timestamp.now(),
          notifyCount: ((alertSnap.data() as AnyRec)?.notifyCount || 0) + 1,
        }, { merge: true });
      }

      out.segnalati.push({ ...gapAction, esitoPuliziaOriginale: c.esito, giorniMancanti: giorni });
    }

    return NextResponse.json({
      success: true,
      nota: "SOSPETTI da verificare su Booking, non errori accertati. Nessuna pulizia è stata creata, spostata o cancellata.",
      candidatiTotali: candidati.length,
      notificati: out.segnalati.length,
      ...out,
    }, { status: 200 });
  } catch (e: any) {
    console.error("[gap-audit-weekly] errore:", e);
    return NextResponse.json({ error: e?.message || String(e), parziale: out }, { status: 500 });
  }
}
