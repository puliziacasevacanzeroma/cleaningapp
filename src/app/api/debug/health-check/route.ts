/**
 * 🩺 HEALTH-CHECK — cruscotto di monitoraggio del gestionale (READ-ONLY).
 *
 * GET /api/debug/health-check?cronSecret=XXX            → JSON completo
 * GET /api/debug/health-check?cronSecret=XXX&notify=1   → se ci sono problemi, crea UNA notifica admin in-app
 *
 * Risposta HTTP:
 *  - 200 se tutti i controlli sono OK (per CRON-JOB.ORG = "verde", nessuna email)
 *  - 500 se almeno un controllo trova problemi (CRON-JOB.ORG manda l'email di allerta)
 *
 * NON SCRIVE MAI sui dati del gestionale. L'unica scrittura possibile è UNA
 * notifica in-app di riepilogo, e SOLO con &notify=1 (usato dal cron). Ogni
 * controllo è isolato: se uno va in errore, gli altri proseguono.
 *
 * Come aggiungere un controllo nuovo: aggiungi una funzione async che ritorna
 * un CheckResult e mettila nell'array CHECKS in fondo. Nient'altro.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ────────────────────────────────────────────────────────────────────────────
// TIPI
// ────────────────────────────────────────────────────────────────────────────
type Severity = "critico" | "attenzione" | "info";

interface CheckResult {
  id: string;
  titolo: string;
  severity: Severity;
  ok: boolean;
  count: number;              // quante anomalie trovate
  messaggio: string;          // riassunto leggibile
  esempi?: any[];             // primi N casi (per la pagina/diagnosi)
  errore?: string;            // se il controllo stesso è fallito
}

// contesto condiviso caricato UNA volta e passato a tutti i check (meno letture)
interface Ctx {
  properties: Map<string, any>;
  cleanings: any[];
  orders: any[];
}

const MAX_ESEMPI = 8;
const toDateStr = (ts: any) => ts?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? null;

// ────────────────────────────────────────────────────────────────────────────
// CONTROLLI (ognuno READ-ONLY, isolato, ritorna un CheckResult)
// ────────────────────────────────────────────────────────────────────────────

/** 1. Pulizie future SENZA ordine biancheria (proprietà a biancheria gestita). */
async function checkPulizieSenzaOrdine(ctx: Ctx): Promise<CheckResult> {
  const id = "pulizie-senza-ordine";
  const titolo = "Pulizie future senza ordine biancheria";
  try {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const ordersByCleaning = new Set(
      ctx.orders.filter(o => o.status !== "CANCELLED" && o.cleaningId).map(o => o.cleaningId)
    );
    const anomalie = ctx.cleanings.filter(c => {
      const d = c.scheduledDate?.toDate?.();
      if (!d || d < oggi) return false;
      if (!["SCHEDULED", "ASSIGNED"].includes(c.status)) return false;
      const prop = ctx.properties.get(c.propertyId);
      if (!prop || prop.usesOwnLinen === true) return false; // biancheria propria → ok
      if (c.hasLinenOrder === false) return false;            // esplicitamente senza biancheria → ok
      return !ordersByCleaning.has(c.id);                     // manca l'ordine
    });
    return {
      id, titolo, severity: "critico", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "Ogni pulizia futura con biancheria gestita ha il suo ordine."
        : `${anomalie.length} pulizie future senza ordine biancheria: il rider potrebbe non ricevere la biancheria.`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(c => ({
        cleaningId: c.id, proprieta: ctx.properties.get(c.propertyId)?.name, data: toDateStr(c.scheduledDate), status: c.status,
      })),
    };
  } catch (e: any) {
    return { id, titolo, severity: "critico", ok: false, count: 0, messaggio: "Controllo fallito", errore: e?.message };
  }
}

/** 2. Ordini PENDING che puntano a pulizie inesistenti (orfani). */
async function checkOrdiniOrfani(ctx: Ctx): Promise<CheckResult> {
  const id = "ordini-orfani";
  const titolo = "Ordini attivi collegati a pulizie inesistenti";
  try {
    const cleaningIds = new Set(ctx.cleanings.map(c => c.id));
    const anomalie = ctx.orders.filter(o =>
      ["PENDING", "ASSIGNED"].includes(o.status) && o.cleaningId && !cleaningIds.has(o.cleaningId)
    );
    return {
      id, titolo, severity: "attenzione", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "Nessun ordine attivo punta a una pulizia cancellata."
        : `${anomalie.length} ordini attivi puntano a pulizie che non esistono più.`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(o => ({
        orderId: o.id, proprieta: o.propertyName, cleaningId: o.cleaningId, status: o.status, data: toDateStr(o.scheduledDate),
      })),
    };
  } catch (e: any) {
    return { id, titolo, severity: "attenzione", ok: false, count: 0, messaggio: "Controllo fallito", errore: e?.message };
  }
}

/** 3. hasLinenOrder della pulizia in disaccordo con la proprietà. */
async function checkFlagBiancheriaIncoerente(ctx: Ctx): Promise<CheckResult> {
  const id = "flag-biancheria-incoerente";
  const titolo = "Flag biancheria pulizia ≠ realtà proprietà";
  try {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const anomalie = ctx.cleanings.filter(c => {
      const d = c.scheduledDate?.toDate?.();
      if (!d || d < oggi) return false;
      if (!["SCHEDULED", "ASSIGNED"].includes(c.status)) return false;
      const prop = ctx.properties.get(c.propertyId);
      if (!prop) return false;
      // proprietà a biancheria propria ma pulizia con hasLinenOrder=true → incoerente
      if (prop.usesOwnLinen === true && c.hasLinenOrder === true) return true;
      return false;
    });
    return {
      id, titolo, severity: "attenzione", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "I flag biancheria delle pulizie sono coerenti con le proprietà."
        : `${anomalie.length} pulizie hanno hasLinenOrder=true su proprietà a biancheria propria (flag stantio).`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(c => ({
        cleaningId: c.id, proprieta: ctx.properties.get(c.propertyId)?.name, data: toDateStr(c.scheduledDate),
      })),
    };
  } catch (e: any) {
    return { id, titolo, severity: "attenzione", ok: false, count: 0, messaggio: "Controllo fallito", errore: e?.message };
  }
}

/** 4. Doppio ordine attivo per la stessa pulizia. */
async function checkOrdiniDuplicati(ctx: Ctx): Promise<CheckResult> {
  const id = "ordini-duplicati";
  const titolo = "Pulizie con più di un ordine attivo";
  try {
    const perCleaning = new Map<string, any[]>();
    ctx.orders.filter(o => o.status !== "CANCELLED" && o.cleaningId).forEach(o => {
      if (!perCleaning.has(o.cleaningId)) perCleaning.set(o.cleaningId, []);
      perCleaning.get(o.cleaningId)!.push(o);
    });
    const anomalie = [...perCleaning.entries()].filter(([, list]) => list.length > 1);
    return {
      id, titolo, severity: "attenzione", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "Ogni pulizia ha al massimo un ordine attivo."
        : `${anomalie.length} pulizie hanno 2+ ordini attivi (rischio doppia consegna/fatturazione).`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(([cid, list]) => ({
        cleaningId: cid, proprieta: list[0]?.propertyName, ordini: list.map((o: any) => o.id),
      })),
    };
  } catch (e: any) {
    return { id, titolo, severity: "attenzione", ok: false, count: 0, messaggio: "Controllo fallito", errore: e?.message };
  }
}

/** 5. Pulizie assegnate a un operatore che non esiste più. */
async function checkAssegnazioniFantasma(ctx: Ctx, userIds: Set<string>): Promise<CheckResult> {
  const id = "assegnazioni-fantasma";
  const titolo = "Pulizie assegnate a utenti inesistenti";
  try {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const anomalie = ctx.cleanings.filter(c => {
      const d = c.scheduledDate?.toDate?.();
      if (!d || d < oggi) return false;
      if (c.status !== "ASSIGNED" || !c.assignedTo) return false;
      return !userIds.has(c.assignedTo);
    });
    return {
      id, titolo, severity: "attenzione", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "Ogni pulizia assegnata punta a un utente esistente."
        : `${anomalie.length} pulizie assegnate a operatori che non esistono più.`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(c => ({
        cleaningId: c.id, proprieta: ctx.properties.get(c.propertyId)?.name, data: toDateStr(c.scheduledDate), assignedTo: c.assignedTo,
      })),
    };
  } catch (e: any) {
    return { id, titolo, severity: "attenzione", ok: false, count: 0, messaggio: "Controllo fallito", errore: e?.message };
  }
}

/** 6. Ordini attivi con items vuoto (niente da consegnare ma ordine attivo). */
async function checkOrdiniVuoti(ctx: Ctx): Promise<CheckResult> {
  const id = "ordini-vuoti";
  const titolo = "Ordini attivi senza articoli";
  try {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const anomalie = ctx.orders.filter(o => {
      if (!["PENDING", "ASSIGNED"].includes(o.status)) return false;
      const d = o.scheduledDate?.toDate?.();
      if (!d || d < oggi) return false;
      return !Array.isArray(o.items) || o.items.length === 0 ||
             o.items.every((i: any) => (i.quantity || 0) <= 0);
    });
    return {
      id, titolo, severity: "attenzione", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "Ogni ordine attivo ha almeno un articolo."
        : `${anomalie.length} ordini attivi futuri non hanno articoli da consegnare.`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(o => ({
        orderId: o.id, proprieta: o.propertyName, data: toDateStr(o.scheduledDate), status: o.status,
      })),
    };
  } catch (e: any) {
    return { id, titolo, severity: "attenzione", ok: false, count: 0, messaggio: "Controllo fallito", errore: e?.message };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MOTORE
// ────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // Auth: accetta il cronSecret (chiamata da CRON-JOB.ORG) OPPURE una sessione
  // ADMIN valida (chiamata dalla pagina Controllo Sistema). Così la pagina non
  // deve conoscere il cronSecret.
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const secretOk = cronSecret && searchParams.get("cronSecret") === cronSecret;
  let sessionOk = false;
  if (!secretOk) {
    try {
      const u = await getApiUser();
      sessionOk = (u?.role || "").toUpperCase() === "ADMIN";
    } catch { sessionOk = false; }
  }
  if (!secretOk && !sessionOk) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const doNotify = searchParams.get("notify") === "1";

  try {
    // Carica il contesto UNA volta sola
    const [propsSnap, cleanSnap, ordersSnap, usersSnap] = await Promise.all([
      adminDb.collection("properties").get(),
      adminDb.collection("cleanings").get(),
      adminDb.collection("orders").get(),
      adminDb.collection("users").get(),
    ]);
    const ctx: Ctx = {
      properties: new Map(propsSnap.docs.map(d => [d.id, d.data()])),
      cleanings: cleanSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })),
      orders: ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })),
    };
    const userIds = new Set(usersSnap.docs.map(d => d.id));

    // Esegui tutti i controlli (isolati)
    const results: CheckResult[] = await Promise.all([
      checkPulizieSenzaOrdine(ctx),
      checkOrdiniOrfani(ctx),
      checkFlagBiancheriaIncoerente(ctx),
      checkOrdiniDuplicati(ctx),
      checkAssegnazioniFantasma(ctx, userIds),
      checkOrdiniVuoti(ctx),
    ]);

    const problemi = results.filter(r => !r.ok);
    const critici = problemi.filter(r => r.severity === "critico");
    const tuttoOk = problemi.length === 0;

    // Notifica in-app (SOLO con &notify=1 e SOLO se ci sono problemi): una sola,
    // role-based (visibile a tutti gli admin), con dedup giornaliero.
    if (doNotify && !tuttoOk) {
      try {
        const oggiStr = new Date().toISOString().slice(0, 10);
        const dedupId = `healthcheck_${oggiStr}`;
        const already = await adminDb.collection("healthCheckAlerts").doc(dedupId).get();
        if (!already.exists) {
          const righe = problemi.map(p => `${p.severity === "critico" ? "🔴" : "🟠"} ${p.titolo}: ${p.count}`).join("\n");
          await adminDb.collection("notifications").add({
            title: `🩺 Controllo gestionale: ${problemi.length} anomalie rilevate`,
            message: `Il controllo automatico ha trovato dei disallineamenti:\n\n${righe}\n\nApri la pagina Controllo Sistema per i dettagli.`,
            type: critici.length > 0 ? "WARNING" : "INFO",
            recipientRole: "ADMIN",
            senderId: "system", senderName: "Controllo Sistema",
            status: "UNREAD", createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
          });
          await adminDb.collection("healthCheckAlerts").doc(dedupId).set({
            createdAt: Timestamp.now(), problemi: problemi.length, critici: critici.length,
          });
        }
      } catch (notifErr: any) {
        console.error("[health-check] errore notifica:", notifErr?.message);
      }
    }

    const payload = {
      success: true,
      generatoIl: new Date().toISOString(),
      riepilogo: {
        totaleControlli: results.length,
        ok: results.length - problemi.length,
        problemi: problemi.length,
        critici: critici.length,
        statoGenerale: tuttoOk ? "VERDE" : critici.length > 0 ? "ROSSO" : "GIALLO",
      },
      controlli: results,
    };

    // HTTP 500 se ci sono problemi → CRON-JOB.ORG manda l'email di allerta.
    return NextResponse.json(payload, { status: tuttoOk ? 200 : 500 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "Errore motore health-check", message: error?.message }, { status: 500 });
  }
}
