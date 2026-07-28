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
  bookings: any[];
  excludedByProp: Map<string, Set<string>>; // propertyId → date escluse (YYYY-MM-DD)
}

const MAX_ESEMPI = 8;
const toDateStr = (ts: any) => ts?.toDate?.()?.toISOString?.()?.slice(0, 10) ?? null;

// L'operatore assegnato: il gestionale usa operatorId (verificato sul codice
// di assegnazione). Fallback su assignedTo per compatibilità con dati vecchi.
const getOperator = (c: any): string | null => c?.operatorId || c?.assignedTo || null;

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
      const op = getOperator(c);
      if (c.status !== "ASSIGNED" || !op) return false;
      return !userIds.has(op);
    });
    return {
      id, titolo, severity: "attenzione", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "Ogni pulizia assegnata punta a un utente esistente."
        : `${anomalie.length} pulizie assegnate a operatori che non esistono più.`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(c => ({
        cleaningId: c.id, proprieta: ctx.properties.get(c.propertyId)?.name, data: toDateStr(c.scheduledDate), operatore: getOperator(c),
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

/** 7. Prenotazioni future CONFERMATE senza pulizia al checkout.
 *  Sfaccettature gestite (per evitare falsi allarmi):
 *   - solo prenotazioni FUTURE (checkout ≥ oggi); il passato non conta;
 *   - esclude storiche (historicBooking), manuali/dirette/telefoniche;
 *   - esclude prenotazioni CANCELLED;
 *   - esclude proprietà SENZA feed iCal attivo (non generano pulizie auto);
 *   - la pulizia è "trovata" se combacia per bookingId OPPURE per data di
 *     checkout (copre le pulizie spostate a mano, originalScheduledDate);
 *   - rispetta le date escluse volontariamente (syncExclusions). */
async function checkPrenotazioniSenzaPulizia(ctx: Ctx): Promise<CheckResult> {
  const id = "prenotazioni-senza-pulizia";
  const titolo = "Prenotazioni future senza pulizia al checkout";
  try {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    // indice pulizie per proprietà (per non ciclare tutto ogni volta)
    const cleanByProp = new Map<string, any[]>();
    ctx.cleanings.forEach(c => {
      if (!cleanByProp.has(c.propertyId)) cleanByProp.set(c.propertyId, []);
      cleanByProp.get(c.propertyId)!.push(c);
    });

    const hasFeed = (p: any) =>
      !!(p?.icalAirbnb || p?.icalBooking || p?.icalOktorate || p?.icalInreception || p?.icalKrossbooking);

    // Tolleranza "sync non ancora passato": il sync crea la pulizia nello stesso
    // ciclo in cui vede la prenotazione, ma tra un sync e l'altro (o subito dopo
    // un import) esiste una finestra normale in cui la prenotazione c'è e la
    // pulizia non ancora. Per NON generare falsi allarmi:
    //  - ignoro prenotazioni importate da meno di 6 ore (createdAt recente);
    //  - considero solo checkout entro i prossimi 45 giorni: oltre, anche se il
    //    sync deve ancora arrivarci, non è azionabile ora e crea solo rumore.
    const seiOreFa = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const orizzonte = new Date(); orizzonte.setDate(orizzonte.getDate() + 45); orizzonte.setHours(23, 59, 59, 999);

    const anomalie = ctx.bookings.filter(b => {
      if (b.status === "CANCELLED") return false;
      if (b.historicBooking === true) return false;
      if (b.isManual === true || ["manual", "direct", "phone"].includes(b.source)) return false;
      const co = b.checkOut?.toDate?.();
      if (!co || co < oggi || co > orizzonte) return false;     // solo futuro entro 45gg
      // prenotazione appena importata → il sync deve ancora creare la pulizia
      const created = b.createdAt?.toDate?.();
      if (created && created > seiOreFa) return false;
      const prop = ctx.properties.get(b.propertyId);
      if (!prop || prop.status !== "ACTIVE" || !hasFeed(prop)) return false; // niente feed → niente pulizia auto
      // proprietà non ancora assegnata a un owner (in fase di onboarding)
      if (!prop.ownerId || prop.ownerId === "pending") return false;
      // data esclusa volontariamente (pulizia tolta a mano)?
      const coStr = co.toISOString().slice(0, 10);
      if (ctx.excludedByProp.get(b.propertyId)?.has(coStr)) return false;
      // esiste una pulizia collegata? (per bookingId o per data checkout, anche se spostata)
      const list = cleanByProp.get(b.propertyId) || [];
      const trovata = list.some(c => {
        if (c.status === "CANCELLED") return false;             // una pulizia cancellata non conta
        if (c.bookingId === b.id) return true;
        const cd = c.scheduledDate?.toDate?.();
        if (cd && sameDay(cd, co)) return true;
        const orig = c.originalScheduledDate?.toDate?.();
        if (orig && sameDay(orig, co)) return true;
        return false;
      });
      return !trovata;
    });

    return {
      id, titolo, severity: "critico", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "Ogni prenotazione futura ha la sua pulizia al checkout."
        : `${anomalie.length} prenotazioni future senza pulizia: l'ospite successivo troverebbe la casa non pulita.`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(b => ({
        proprieta: ctx.properties.get(b.propertyId)?.name, ospite: b.guestName, checkout: toDateStr(b.checkOut), canale: b.source,
      })),
    };
  } catch (e: any) {
    return { id, titolo, severity: "critico", ok: false, count: 0, messaggio: "Controllo fallito", errore: e?.message };
  }
}

/** 9. Pulizie COMPLETATE senza importo → rischio di non fatturarle.
 *  Sfaccettature: il prezzo può stare in price O contractPrice; considero solo
 *  pulizie completate recenti (ultimi 60gg) per non pescare storico antico. */
async function checkCompletateSenzaImporto(ctx: Ctx): Promise<CheckResult> {
  const id = "completate-senza-importo";
  const titolo = "Pulizie completate senza importo";
  try {
    const limite = new Date(); limite.setDate(limite.getDate() - 60);
    const anomalie = ctx.cleanings.filter(c => {
      if (c.status !== "COMPLETED") return false;
      const d = c.scheduledDate?.toDate?.();
      if (!d || d < limite) return false;
      const prezzo = (typeof c.price === "number" ? c.price : 0) ||
                     (typeof c.contractPrice === "number" ? c.contractPrice : 0);
      if (prezzo > 0) return false;
      // Se la proprietà stessa non ha un prezzo pulizia configurato, la pulizia
      // a 0 è una conseguenza (va sistemata la proprietà, non la singola pulizia):
      // non la conto qui per non moltiplicare l'allarme.
      const prop = ctx.properties.get(c.propertyId);
      const propHaPrezzo = typeof prop?.cleaningPrice === "number" && prop.cleaningPrice > 0;
      return propHaPrezzo; // segnalo solo pulizie a 0 su proprietà CHE HANNO un prezzo
    });
    return {
      id, titolo, severity: "attenzione", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "Ogni pulizia completata di recente ha un importo."
        : `${anomalie.length} pulizie completate (ultimi 60gg) hanno importo 0: rischi di non fatturarle.`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(c => ({
        cleaningId: c.id, proprieta: ctx.properties.get(c.propertyId)?.name, data: toDateStr(c.scheduledDate),
      })),
    };
  } catch (e: any) {
    return { id, titolo, severity: "attenzione", ok: false, count: 0, messaggio: "Controllo fallito", errore: e?.message };
  }
}

/** 13. Pulizie imminenti (oggi/domani) ancora NON assegnate a nessuno.
 *  Sfaccettatura: solo status SCHEDULED (ASSIGNED = già assegnata, ok). */
async function checkImminentiNonAssegnate(ctx: Ctx): Promise<CheckResult> {
  const id = "imminenti-non-assegnate";
  const titolo = "Pulizie imminenti non ancora assegnate";
  try {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const domaniSera = new Date(); domaniSera.setDate(domaniSera.getDate() + 1); domaniSera.setHours(23, 59, 59, 999);
    const anomalie = ctx.cleanings.filter(c => {
      const d = c.scheduledDate?.toDate?.();
      if (!d || d < oggi || d > domaniSera) return false;
      if (c.status !== "SCHEDULED") return false;   // ASSIGNED/IN_PROGRESS/COMPLETED = ok
      return !getOperator(c);                        // né operatorId né assignedTo
    
    });
    return {
      id, titolo, severity: "attenzione", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "Tutte le pulizie di oggi e domani hanno un operatore."
        : `${anomalie.length} pulizie di oggi/domani non sono ancora assegnate a nessuno.`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(c => ({
        cleaningId: c.id, proprieta: ctx.properties.get(c.propertyId)?.name, data: toDateStr(c.scheduledDate), ora: c.scheduledTime,
      })),
    };
  } catch (e: any) {
    return { id, titolo, severity: "attenzione", ok: false, count: 0, messaggio: "Controllo fallito", errore: e?.message };
  }
}

/** 14. Pulizie del PASSATO rimaste "in corso" (IN_PROGRESS mai chiuse).
 *  Sfaccettatura: soglia 2 giorni fa, per non pescare quella di ieri sera
 *  ancora legittimamente aperta. */
async function checkInCorsoIncastrate(ctx: Ctx): Promise<CheckResult> {
  const id = "in-corso-incastrate";
  const titolo = "Pulizie passate rimaste in corso";
  try {
    const limite = new Date(); limite.setDate(limite.getDate() - 2); limite.setHours(0, 0, 0, 0);
    const anomalie = ctx.cleanings.filter(c => {
      if (c.status !== "IN_PROGRESS") return false;
      // Misura da quando è INIZIATA (startedAt) se disponibile: è il dato giusto
      // per "in corso da troppo". Fallback sulla data programmata.
      const rif = c.startedAt?.toDate?.() || c.scheduledDate?.toDate?.();
      return rif && rif < limite;
    });
    return {
      id, titolo, severity: "attenzione", ok: anomalie.length === 0, count: anomalie.length,
      messaggio: anomalie.length === 0
        ? "Nessuna pulizia passata è rimasta bloccata in corso."
        : `${anomalie.length} pulizie di 2+ giorni fa sono ancora 'in corso' (mai chiuse).`,
      esempi: anomalie.slice(0, MAX_ESEMPI).map(c => ({
        cleaningId: c.id, proprieta: ctx.properties.get(c.propertyId)?.name, data: toDateStr(c.scheduledDate), iniziata: toDateStr(c.startedAt), operatore: getOperator(c),
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
    const [propsSnap, cleanSnap, ordersSnap, usersSnap, bookingsSnap, exclSnap] = await Promise.all([
      adminDb.collection("properties").get(),
      adminDb.collection("cleanings").get(),
      adminDb.collection("orders").get(),
      adminDb.collection("users").get(),
      adminDb.collection("bookings").get(),
      adminDb.collection("syncExclusions").get(),
    ]);
    // mappa date escluse per proprietà (pulizie tolte volontariamente)
    const excludedByProp = new Map<string, Set<string>>();
    exclSnap.docs.forEach(d => {
      const x = d.data() as any;
      const pid = x.propertyId;
      const orig = x.originalDate?.toDate?.();
      if (!pid || !orig) return;
      if (!excludedByProp.has(pid)) excludedByProp.set(pid, new Set());
      excludedByProp.get(pid)!.add(orig.toISOString().slice(0, 10));
    });
    const ctx: Ctx = {
      properties: new Map(propsSnap.docs.map(d => [d.id, d.data()])),
      cleanings: cleanSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })),
      orders: ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })),
      bookings: bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })),
      excludedByProp,
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
      checkPrenotazioniSenzaPulizia(ctx),
      checkCompletateSenzaImporto(ctx),
      checkImminentiNonAssegnate(ctx),
      checkInCorsoIncastrate(ctx),
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
