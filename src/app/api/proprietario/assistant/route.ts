import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

// Converte una Date in stringa YYYY-MM-DD usando il fuso orario Italia
// EVITA il bug UTC dove mezzanotte italiana = giorno prima in UTC
function dateToItalyISO(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

// Restituisce la data odierna in ISO (Italia)
function todayItalyISO(): string {
  return dateToItalyISO(new Date());
}

// Divide array in chunk (per query Firestore "in" che ha limite 10)
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// Esegue query Firestore "in" in chunk sicuri da max 10 elementi
async function queryWhereIn(collection: any, field: string, values: string[]): Promise<any[]> {
  if (values.length === 0) return [];
  const chunks = chunkArray(values, 10);
  const results: any[] = [];
  for (const chunk of chunks) {
    const snap = await collection.where(field, "in", chunk).get();
    snap.docs.forEach((d: any) => results.push(d));
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════
// TOOLS DISPONIBILI — L'AI può chiamarli per leggere o agire
// ═══════════════════════════════════════════════════════════════
const TOOLS = [
  {
    name: "get_cleanings",
    description: "Recupera le pulizie del proprietario. IMPORTANTE: se l'utente menziona una casa/proprietà specifica, usa prima get_properties per trovare il propertyId corretto e poi passalo qui. Filtra per stato, mese, anno o proprietà. Usalo quando l'utente chiede pulizie, calendario, storico, completate, prossime.",
    input_schema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "ID della proprietà specifica — OBBLIGATORIO se l'utente nomina una casa. Recuperalo prima con get_properties." },
        stato: { type: "string", enum: ["SCHEDULED","ASSIGNED","IN_PROGRESS","COMPLETED","CANCELLED","all"], description: "Filtro stato pulizia" },
        limite: { type: "number", description: "Numero max di risultati (default 30)" },
        prossime: { type: "boolean", description: "Se true, mostra solo le pulizie future" },
        data: { type: "string", description: "Filtra per data esatta in formato YYYY-MM-DD. Usalo quando devi trovare la pulizia di un giorno specifico per spostare/cancellare/aggiornare ospiti." }
      },
      required: []
    }
  },
  {
    name: "get_payments",
    description: "Recupera il saldo, i debiti e la situazione pagamenti del proprietario. Usalo quando chiede di pagamenti, debiti, quanto deve, saldo mensile.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_properties",
    description: "Recupera le proprietà del proprietario con dettagli (nome, indirizzo, configurazione). Usalo quando chiede info sulle sue case/appartamenti.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "move_cleaning",
    description: "Sposta una pulizia ESISTENTE a una nuova data. RICHIEDE CONFERMA ESPLICITA. Passa il nome della proprietà e la data attuale — il server trova da solo la pulizia. NON serve il cleaningId.",
    input_schema: {
      type: "object",
      properties: {
        propertyName: { type: "string", description: "Nome della proprietà ESATTAMENTE come appare in get_properties (es: 'Pellegrino 62')" },
        currentDate: { type: "string", description: "Data ATTUALE della pulizia da spostare in formato YYYY-MM-DD" },
        newDate: { type: "string", description: "Nuova data destinazione in formato YYYY-MM-DD" },
        reason: { type: "string", description: "Motivo dello spostamento (opzionale)" },
        confirmed: { type: "boolean", description: "OBBLIGATORIO: true solo se l'utente ha già confermato esplicitamente." }
      },
      required: ["propertyName", "currentDate", "newDate", "confirmed"]
    }
  },
  {
    name: "cancel_cleaning",
    description: "Cancella una pulizia. RICHIEDE CONFERMA ESPLICITA. Passa il nome della proprietà e la data — il server trova da solo la pulizia. NON serve il cleaningId.",
    input_schema: {
      type: "object",
      properties: {
        propertyName: { type: "string", description: "Nome della proprietà ESATTAMENTE come appare in get_properties (es: 'Pellegrino 62')" },
        currentDate: { type: "string", description: "Data della pulizia da cancellare in formato YYYY-MM-DD" },
        reason: { type: "string", description: "Motivo della cancellazione (opzionale)" },
        confirmed: { type: "boolean", description: "OBBLIGATORIO: true solo se l'utente ha già confermato esplicitamente." }
      },
      required: ["propertyName", "currentDate", "confirmed"]
    }
  },
  {
    name: "request_product",
    description: "Invia una richiesta di prodotti o materiali (asciugamani, lenzuola, prodotti pulizia, kit cortesia, ecc.) per una proprietà specifica.",
    input_schema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "ID della proprietà per cui richiedere il prodotto" },
        propertyName: { type: "string", description: "Nome della proprietà" },
        productName: { type: "string", description: "Nome del prodotto o materiale richiesto" },
        quantity: { type: "number", description: "Quantità richiesta" },
        note: { type: "string", description: "Note aggiuntive sulla richiesta" }
      },
      required: ["propertyId", "productName"]
    }
  },
  {
    name: "update_guests",
    description: "Aggiorna il numero di ospiti per una pulizia. Passa il nome della proprietà e la data — il server trova da solo la pulizia. NON serve il cleaningId.",
    input_schema: {
      type: "object",
      properties: {
        propertyName: { type: "string", description: "Nome della proprietà ESATTAMENTE come appare in get_properties (es: 'Pellegrino 62')" },
        currentDate: { type: "string", description: "Data della pulizia in formato YYYY-MM-DD" },
        guests: { type: "number", description: "Nuovo numero di ospiti" }
      },
      required: ["propertyName", "currentDate", "guests"]
    }
  },
  {
    name: "create_cleaning",
    description: "Crea una nuova pulizia da zero. USA SOLO se l'utente vuole aggiungere una nuova pulizia — NON usare per spostare una pulizia esistente (usa move_cleaning). RICHIEDE CONFERMA ESPLICITA. Chiedi solo: proprietà (se non specificata), data, numero ospiti. NON chiedere l'orario. Date in formato YYYY-MM-DD. La biancheria è automatica.",
    input_schema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "ID della proprietà (recuperalo sempre con get_properties prima)" },
        propertyName: { type: "string", description: "Nome della proprietà" },
        date: { type: "string", description: "Data della pulizia in formato YYYY-MM-DD" },
        guests: { type: "number", description: "Numero di ospiti" },
        notes: { type: "string", description: "Note aggiuntive per l'operatore (opzionale)" },
        confirmed: { type: "boolean", description: "OBBLIGATORIO: true solo se l'utente ha già confermato esplicitamente con 'sì', 'confermo', 'ok' o simili nella sua ultima risposta. Se non ha ancora confermato, NON chiamare questo tool — chiedi prima conferma." }
      },
      required: ["propertyId", "date", "guests", "confirmed"]
    }
  },
  {
    name: "get_bookings",
    description: "Recupera le prenotazioni (booking) del proprietario. Mostra check-in, check-out, nome ospite, numero persone. Usalo quando l'utente chiede: prossimi ospiti, prenotazioni, check-in, chi arriva, calendario ospiti.",
    input_schema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Filtra per una proprietà specifica (opzionale)" },
        solo_future: { type: "boolean", description: "Se true mostra solo prenotazioni future (default true)" },
        limite: { type: "number", description: "Numero max di risultati (default 30)" }
      },
      required: []
    }
  },
  {
    name: "get_issues",
    description: "Recupera le segnalazioni/problemi aperti sulle proprietà del proprietario. Gli operatori segnalano danni, manutenzione, oggetti mancanti dopo le pulizie. Usalo quando l'utente chiede: problemi, segnalazioni, danni, guasti, manutenzione.",
    input_schema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Filtra per una proprietà specifica (opzionale)" },
        solo_aperti: { type: "boolean", description: "Se true mostra solo problemi non risolti (default true)" }
      },
      required: []
    }
  },
  {
    name: "get_cleaning_detail",
    description: "Recupera il dettaglio di una pulizia specifica o dell'ultima pulizia completata di una proprietà: note operatore, checklist, orari, operatore assegnato. Usalo quando l'utente chiede: com'è andata la pulizia, note operatore, dettaglio, ultima pulizia.",
    input_schema: {
      type: "object",
      properties: {
        cleaningId: { type: "string", description: "ID specifico della pulizia (opzionale se si vuole l'ultima)" },
        propertyId: { type: "string", description: "ID proprietà per trovare l'ultima pulizia completata (usalo se non si ha cleaningId)" }
      },
      required: []
    }
  },
  {
    name: "get_spending_stats",
    description: "Calcola statistiche di spesa del proprietario: totale per periodo, confronto tra proprietà, mese più costoso. Usalo quando chiede: quanto ho speso, statistiche, costi, confronto proprietà, andamento spese.",
    input_schema: {
      type: "object",
      properties: {
        mesi: { type: "number", description: "Quanti mesi indietro analizzare (default 3, max 12)" },
        per_proprieta: { type: "boolean", description: "Se true mostra il breakdown per proprietà" }
      },
      required: []
    }
  },
  {
    name: "get_orders",
    description: "Recupera gli ordini di biancheria CONSEGNATI (DELIVERED) del proprietario. Ci sono due tipi: biancheria annessa a una pulizia (tipo=annessa a pulizia) e consegne standalone (tipo=consegna standalone). Mostra articoli, quantità, prezzi, casa, data consegna effettiva. Usalo quando chiede: ordini biancheria, cosa ho ordinato, consegne, kit, lenzuola, biancheria di una pulizia. NON mostrare mai ordini pending — il proprietario vede solo quelli consegnati.",
    input_schema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Filtra per una proprietà specifica (opzionale)" },
        limite: { type: "number", description: "Numero max di risultati (default 10)" },
        solo_consegnati: { type: "boolean", description: "Se true mostra solo ordini DELIVERED (default true)" }
      },
      required: []
    }
  }
];

// ═══════════════════════════════════════════════════════════════
// ESECUTORI TOOL — Ogni tool ha la sua funzione server-side
// ═══════════════════════════════════════════════════════════════

async function toolGetCleanings(userId: string, input: any) {
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
  const properties = propsSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  const propertyIds = properties.map((p: any) => p.id);
  if (propertyIds.length === 0) return { cleanings: [], total: 0 };

  // Carica inventory per calcolo prezzi biancheria annessa
  const invSnap = await adminDb.collection("inventory").get();
  const invById = new Map(invSnap.docs.map((d: any) => [d.id, d.data() as any]));

  // Carica ordini DELIVERED collegati alle pulizie (hanno cleaningId)
  // Carica ordini collegati alle pulizie — sia DELIVERED che PENDING
  // (PENDING = ordine creato per pulizia futura, DELIVERED = già consegnato)
  // Filtriamo per cleaningId != null in memoria
  const ordersDocs = (input.propertyId && propertyIds.includes(input.propertyId))
    ? (await adminDb.collection("orders").where("propertyId", "==", input.propertyId).get()).docs
    : await queryWhereIn(adminDb.collection("orders"), "propertyId", propertyIds);
  const ordersByCleaningId = new Map<string, { totale: number; articoli: any[] }>();
  ordersDocs.forEach((od: any) => {
    const odata = od.data() as any;
    if (!odata.cleaningId) return;
    let tot = 0;
    const articoli: any[] = [];
    if (Array.isArray(odata.items)) {
      odata.items.forEach((item: any) => {
        const inv = invById.get(item.id) as any;
        const price = item.priceOverride ?? item.unitPrice ?? item.price ?? inv?.sellPrice ?? 0;
        const qty = item.quantity || 1;
        const sub = item.totalPrice || price * qty;
        tot += sub;
        articoli.push({ nome: item.name || inv?.name || item.id, qty, prezzoUnitario: Math.round(price * 100) / 100, subtotale: Math.round(sub * 100) / 100 });
      });
    }
    const delivery = (odata.deliveryFee && odata.deliveryFeeEnabled !== false) ? odata.deliveryFee : 0;
    tot += delivery;
    if (odata.totalPriceOverride != null) tot = odata.totalPriceOverride;
    ordersByCleaningId.set(odata.cleaningId, { totale: Math.round(tot * 100) / 100, articoli });
  });

  // Se propertyId specificato, filtra direttamente; altrimenti tutte le proprietà
  const cleaningsDocs = (input.propertyId && propertyIds.includes(input.propertyId))
    ? (await adminDb.collection("cleanings").where("propertyId", "==", input.propertyId).get()).docs
    : await queryWhereIn(adminDb.collection("cleanings"), "propertyId", propertyIds);

  let cleanings = cleaningsDocs.map((d: any) => {
    const data = d.data();
    const prop = properties.find((p: any) => p.id === data.propertyId);
    const date = data.scheduledDate?.toDate?.() || null;
    return {
      id: d.id,
      cleaningId: d.id,  // usa questo valore per move_cleaning, cancel_cleaning, update_guests
      propertyName: prop?.name || data.propertyName || "Casa sconosciuta",
      propertyId: data.propertyId,
      date: date ? date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Data sconosciuta",
      dateISO: date ? dateToItalyISO(date) : null,
      orarioProgrammato: data.scheduledTime || null,
      status: data.status || "SCHEDULED",
      statusLeggibile: ({
        SCHEDULED: "Programmata",
        ASSIGNED: "Assegnata",
        IN_PROGRESS: "In corso",
        COMPLETED: "Completata",
        CANCELLED: "Cancellata",
      } as Record<string, string>)[data.status] || data.status,
      guests: data.guestCount || data.guestsCount || data.guests || 0,
      operatori: data.operators?.map((o: any) => o.name).filter(Boolean) || (data.operatorName ? [data.operatorName] : []),
      tipoServizio: data.serviceType || "STANDARD",
      tipoServizioLeggibile: ({
        STANDARD: "Pulizia standard",
        APPROFONDITA: "Pulizia approfondita",
        SGROSSO: "Sgrosso/Prima pulizia",
      } as Record<string, string>)[data.serviceType] || data.serviceType || "Standard",
      price: data.priceOverride ?? data.price ?? null,
      prezzoModificato: data.priceModified || false,
      motivoPrezzo: data.priceChangeReason || null,
      noteServizio: data.notes || null,
      motivoSgrosso: data.sgrossoReason || null,
      noteAggiuntive: data.sgrossoNotes || null,
      serviziExtra: Array.isArray(data.extraServices) ? data.extraServices : [],
      haOrdineBiancheria: !!(data.hasLinenOrder || data.hasLinen || data.linenOrdered),
      biancheriaAnnessa: (() => {
        const linked = ordersByCleaningId.get(d.id);
        if (!linked) return null;
        return { totale: linked.totale, articoli: linked.articoli };
      })(),
      fotografie: Array.isArray(data.photos) ? data.photos.length : 0,
      guestName: data.guestName || null,
      bookingSource: data.bookingSource || null,
    };
  });

  const nowISO = todayItalyISO();

  if (input.stato && input.stato !== "all") {
    cleanings = cleanings.filter((c: any) => c.status === input.stato);
  }
  if (input.prossime) {
    cleanings = cleanings.filter((c: any) => c.dateISO && c.dateISO >= nowISO);
  }
  // Filtro per data esatta — usato per trovare la pulizia giusta prima di move/cancel
  if (input.data) {
    cleanings = cleanings.filter((c: any) => c.dateISO === input.data);
  }

  cleanings.sort((a: any, b: any) => {
    if (!a.dateISO) return 1;
    if (!b.dateISO) return -1;
    return a.dateISO.localeCompare(b.dateISO);
  });

  // Limite alto di default quando si cerca su tutte le pulizie (es. per spostamento)
  // Limite basso solo se esplicitamente richiesto dall'utente
  const limite = input.limite || (input.propertyId && !input.stato && !input.prossime ? 200 : 50);
  const totalCompletate = cleanings.filter((c: any) => c.status === "COMPLETED").length;
  const totalProgrammate = cleanings.filter((c: any) => c.status === "SCHEDULED" || c.status === "ASSIGNED").length;
  const sliced = cleanings.slice(0, limite);
  // Mappa data→cleaningId esplicita: l'AI DEVE usare questi ID, non inventarli
  const mappaDatiId: Record<string, string> = {};
  sliced.forEach((c: any) => { if (c.dateISO && c.cleaningId) mappaDatiId[c.dateISO] = c.cleaningId; });

  console.log(`[get_cleanings] propertyId=${input.propertyId || "ALL"} → ${sliced.length} pulizie. IDs: ${sliced.map((c: any) => c.cleaningId + "@" + c.dateISO).join(", ")}`);
  return {
    cleanings: sliced,
    total: cleanings.length,
    totalCompletate,
    totalProgrammate,
    totalCancellate: cleanings.filter((c: any) => c.status === "CANCELLED").length,

  };
}

async function toolGetPayments(userId: string) {
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).where("status", "==", "ACTIVE").get();
  const propertyIds = propsSnap.docs.map((d: any) => d.id);

  if (propertyIds.length === 0) return { totaleDaPagare: 0, arretrati: [], meseCorrente: null };

  // Pagamenti registrati
  // Prova prima con proprietarioId, poi con ownerId (compatibilità)
  let paymentsSnap = await adminDb.collection("payments").where("proprietarioId", "==", userId).get();
  if (paymentsSnap.empty) {
    paymentsSnap = await adminDb.collection("payments").where("ownerId", "==", userId).get();
  }
  const totalePagato = paymentsSnap.docs.reduce((s: number, d: any) => s + (d.data().amount || 0), 0);

  // Pulizie completate — chunk sicuro per Firestore "in" limit 10
  const cleaningsDocsPayment = await queryWhereIn(adminDb.collection("cleanings"), "propertyId", propertyIds);
  const cleaningsSnap = { docs: cleaningsDocsPayment.filter((d: any) => d.data().status === "COMPLETED") };
  const totalePulizie = cleaningsSnap.docs.reduce((s: number, d: any) => {
    const data = d.data();
    return s + (data.priceOverride ?? data.price ?? 0);
  }, 0);

  // Ordini biancheria consegnati (DELIVERED) — chunk sicuro
  const ordersDocsPayment = await queryWhereIn(adminDb.collection("orders"), "propertyId", propertyIds);
  const ordersSnap = { docs: ordersDocsPayment.filter((d: any) => d.data().status === "DELIVERED") };

  // Inventory per prezzi
  const invSnap = await adminDb.collection("inventory").get();
  const invById = new Map(invSnap.docs.map((d: any) => [d.id, d.data() as any]));

  const totaleOrdini = ordersSnap.docs.reduce((s: number, d: any) => {
    const data = d.data();
    if (data.totalPriceOverride != null) return s + data.totalPriceOverride;
    let orderTotal = 0;
    if (Array.isArray(data.items)) {
      data.items.forEach((item: any) => {
        const inv = invById.get(item.id) as any;
        const price = item.priceOverride ?? inv?.sellPrice ?? item.price ?? 0;
        orderTotal += price * (item.quantity || 1);
      });
    }
    if (data.deliveryFee && data.deliveryFeeEnabled !== false) orderTotal += data.deliveryFee;
    return s + orderTotal;
  }, 0);

  const totaleServizi = totalePulizie + totaleOrdini;
  const saldo = Math.max(0, totaleServizi - totalePagato);

  // Breakdown per tipo di servizio (come vede il proprietario nella pagina Pagamenti)
  const propsInfo = new Map(propsSnap.docs.map((d: any) => [d.id, (d.data() as any).name || "Casa"]));

  const serviziPerProprietà: Record<string, { nome: string; pulizie: number; biancheria: number; kitCortesia: number; extra: number; totale: number }> = {};
  cleaningsSnap.docs.forEach((d: any) => {
    const data = d.data();
    const pid = data.propertyId;
    if (!serviziPerProprietà[pid]) serviziPerProprietà[pid] = { nome: propsInfo.get(pid) || pid, pulizie: 0, biancheria: 0, kitCortesia: 0, extra: 0, totale: 0 };
    const price = data.priceOverride ?? data.price ?? 0;
    serviziPerProprietà[pid].pulizie += price;
    serviziPerProprietà[pid].totale += price;
    // Servizi extra inclusi nella pulizia
    if (Array.isArray(data.extraServices)) {
      data.extraServices.forEach((es: any) => {
        serviziPerProprietà[pid].extra += es.price || 0;
        serviziPerProprietà[pid].totale += es.price || 0;
      });
    }
  });
  ordersSnap.docs.forEach((d: any) => {
    const data = d.data();
    const pid = data.propertyId;
    if (!serviziPerProprietà[pid]) serviziPerProprietà[pid] = { nome: propsInfo.get(pid) || pid, pulizie: 0, biancheria: 0, kitCortesia: 0, extra: 0, totale: 0 };
    let ot = 0;
    if (data.totalPriceOverride != null) { ot = data.totalPriceOverride; }
    else if (Array.isArray(data.items)) {
      data.items.forEach((item: any) => {
        const inv = invById.get(item.id) as any;
        ot += (item.priceOverride ?? inv?.sellPrice ?? item.price ?? 0) * (item.quantity || 1);
      });
    }
    if (data.deliveryFee && data.deliveryFeeEnabled !== false) ot += data.deliveryFee;
    // Distingui tipo ordine
    const tipo = data.orderType || data.type || "biancheria";
    if (tipo === "kit_cortesia" || tipo === "KIT_CORTESIA") serviziPerProprietà[pid].kitCortesia += ot;
    else serviziPerProprietà[pid].biancheria += ot;
    serviziPerProprietà[pid].totale += ot;
  });

    // Dettaglio pagamenti effettuati
  const pagamentiDettaglio = paymentsSnap.docs.map((d: any) => {
    const data = d.data();
    const date = data.date?.toDate?.() || data.createdAt?.toDate?.() || null;
    return {
      importo: data.amount || 0,
      data: date ? date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "N/D",
      dataISO: date ? dateToItalyISO(date) : null,
      metodo: data.method || data.paymentMethod || "Bonifico",
      nota: data.note || data.notes || null,
    };
  }).sort((a: any, b: any) => {
    // Ordina per data effettiva (ISO se disponibile, altrimenti fallback)
    const da = a.dataISO || a.data;
    const db = b.dataISO || b.data;
    return db.localeCompare(da);
  });

  // Aggregazione per mese (stessa logica UI pagamenti)
  const MONTHS_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const byMonth: Record<string, { mese: string; anno: number; pulizie: number; biancheria: number; totaleServizi: number; totalePagato: number; saldo: number; scadenza: string }> = {};

  cleaningsSnap.docs.forEach((d: any) => {
    const data = d.data();
    const date = data.scheduledDate?.toDate?.();
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    if (!byMonth[key]) { const scad = new Date(date.getFullYear(), date.getMonth()+1, 10); byMonth[key] = { mese: MONTHS_IT[date.getMonth()], anno: date.getFullYear(), pulizie: 0, biancheria: 0, totaleServizi: 0, totalePagato: 0, saldo: 0, scadenza: scad.toLocaleDateString("it-IT") }; }
    byMonth[key].pulizie += data.priceOverride ?? data.price ?? 0;
    byMonth[key].totaleServizi += data.priceOverride ?? data.price ?? 0;
  });

  ordersSnap.docs.forEach((d: any) => {
    const data = d.data();
    const date = data.deliveredAt?.toDate?.() || data.scheduledDate?.toDate?.();
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    if (!byMonth[key]) { const scad = new Date(date.getFullYear(), date.getMonth()+1, 10); byMonth[key] = { mese: MONTHS_IT[date.getMonth()], anno: date.getFullYear(), pulizie: 0, biancheria: 0, totaleServizi: 0, totalePagato: 0, saldo: 0, scadenza: scad.toLocaleDateString("it-IT") }; }
    let tot = 0;
    if (Array.isArray(data.items)) { data.items.forEach((item: any) => { const inv = invById.get(item.id) as any; const price = item.priceOverride ?? inv?.sellPrice ?? item.price ?? 0; tot += price * (item.quantity || 1); }); }
    if (data.deliveryFee && data.deliveryFeeEnabled !== false) tot += data.deliveryFee;
    const effective = data.totalPriceOverride ?? tot;
    byMonth[key].biancheria += effective;
    byMonth[key].totaleServizi += effective;
  });

  // Distribuisci pagamenti per mese (in ordine cronologico)
  let pagamentiRimanenti = totalePagato;
  Object.keys(byMonth).sort().forEach(key => {
    const m = byMonth[key];
    const pagato = Math.min(pagamentiRimanenti, m.totaleServizi);
    m.totalePagato = Math.round(pagato * 100) / 100;
    m.saldo = Math.round(Math.max(0, m.totaleServizi - pagato) * 100) / 100;
    m.pulizie = Math.round(m.pulizie * 100) / 100;
    m.biancheria = Math.round(m.biancheria * 100) / 100;
    m.totaleServizi = Math.round(m.totaleServizi * 100) / 100;
    pagamentiRimanenti -= pagato;
  });

  const totalePagatiContanti = paymentsSnap.docs.filter((d: any) => (d.data().method || "").toLowerCase().includes("contant")).reduce((s: number, d: any) => s + (d.data().amount || 0), 0);
  const totalePagatiBonifico = totalePagato - totalePagatiContanti;

  return {
    totaleDaPagare: Math.round(saldo * 100) / 100,
    totaleServizi: Math.round(totaleServizi * 100) / 100,
    totalePulizie: Math.round(totalePulizie * 100) / 100,
    totaleOrdini: Math.round(totaleOrdini * 100) / 100,
    totalePagato: Math.round(totalePagato * 100) / 100,
    pagatoContanti: Math.round(totalePagatiContanti * 100) / 100,
    pagatoBonifico: Math.round(totalePagatiBonifico * 100) / 100,
    percentualePagata: totaleServizi > 0 ? Math.round((totalePagato / totaleServizi) * 100) : 0,
    stato: saldo <= 0 ? "In regola ✅" : saldo < 100 ? "Piccolo saldo in sospeso" : "Saldo da saldare ⚠️",
    messaggioUmano: saldo <= 0
      ? "Sei in regola con i pagamenti!"
      : `Hai un saldo in sospeso di €${saldo.toFixed(2)} (IVA esclusa).`,
    pagamentiEffettuati: pagamentiDettaglio,
    dettaglioPerMese: Object.entries(byMonth).sort((a,b) => b[0].localeCompare(a[0])).map(([k,v]) => v),
    breakdownPerProprietà: Object.values(serviziPerProprietà).map((p: any) => ({
      nome: p.nome,
      pulizie: Math.round(p.pulizie * 100) / 100,
      biancheria: Math.round(p.biancheria * 100) / 100,
      kitCortesia: Math.round(p.kitCortesia * 100) / 100,
      extra: Math.round(p.extra * 100) / 100,
      totale: Math.round(p.totale * 100) / 100,
    })).sort((a: any, b: any) => b.totale - a.totale),
    nota: "Tutti gli importi IVA esclusa. Scadenza pagamento: 10 del mese successivo.",
  };
}

async function toolGetProperties(userId: string) {
  const snap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
  const docs = snap.docs.map((d: any) => {
    const data = d.data() as any;
    const beds = Array.isArray(data.bedsConfig) ? data.bedsConfig : (Array.isArray(data.beds) ? data.beds : []);
    const icalFonti: string[] = [];
    if (data.icalAirbnb) icalFonti.push("Airbnb");
    if (data.icalBooking) icalFonti.push("Booking.com");
    if (data.icalOktorate) icalFonti.push("Oktorate");
    if (data.icalInreception) icalFonti.push("InReception");
    if (data.icalKrossbooking) icalFonti.push("KrossBooking");
    return {
      id: d.id,
      nome: data.name || "Casa senza nome",
      indirizzo: [data.address, data.apartment, data.city].filter(Boolean).join(", ") || null,
      stato: data.status || "ACTIVE",
      prezzoPulizia: data.cleaningPrice || data.cleanPrice || data.price || null,
      prezzoNota: "IVA esclusa",
      maxOspiti: data.maxGuests || null,
      camere: data.bedrooms || null,
      bagni: data.bathrooms || null,
      piano: data.floor || null,
      citofono: data.intercom || null,
      checkIn: data.checkIn || null,
      checkOut: data.checkOut || null,
      codiceAccesso: data.doorCode || null,
      posizioneChiavi: data.keysLocation || null,
      noteAccesso: data.accessNotes || null,
      noteOperatori: data.operatorNotes || data.notes || null,
      lettiConfigurazione: beds.map((b: any) => ({ nome: b.name, tipo: b.type, stanza: b.room || b.location || null })),
      calendariCollegati: icalFonti.length > 0 ? icalFonti.join(", ") : "Nessun calendario collegato",
      biancheria: data.usesOwnLinen === true
        ? "propria (nessun ordine automatico)"
        : Object.keys(data.serviceConfigs || {}).length > 0
          ? "aziendale a noleggio (ordine creato automaticamente in base agli ospiti)"
          : "non configurata",
      usesOwnLinen: data.usesOwnLinen === true,
    };
  });
  // Nota esplicita per l'AI: solo questi nomi esistono
  return {
    properties: docs,
    nomiDisponibili: docs.map((p: any) => p.nome),
    nota: "USA SOLO i nomi in 'nomiDisponibili'. Se l'utente nomina una casa non presente → mostra questa lista e chiedi quale intende. NON inventare proprietà."
  };
}

// ═══════════════════════════════════════════════════════════════
// CONTROLLO DEADLINE 20:00 — uguale alle API REST del proprietario
// Regola: il proprietario può modificare/cancellare/aggiornare ospiti
// SOLO entro le 20:00 del giorno PRIMA della pulizia.
// ═══════════════════════════════════════════════════════════════
function checkDeadline(cleaningDate: Date, azione: string): { blocked: boolean; error?: string } {
  // Usa ora italiana per confronto corretto
  const nowItaly = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  // Costruisci deadline come "giorno prima alle 20:00 ora italiana"
  const cleaningDateItaly = new Date(cleaningDate.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const deadline = new Date(cleaningDateItaly);
  deadline.setDate(deadline.getDate() - 1);
  deadline.setHours(20, 0, 0, 0);

  if (nowItaly <= deadline) return { blocked: false };

  const dataFormatted = cleaningDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const deadlineFormatted = deadline.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return {
    blocked: true,
    error: `Non puoi più ${azione} questa pulizia. Il termine era ${deadlineFormatted} alle 20:00. Per modifiche urgenti chiama o scrivi direttamente all'amministratore.`,
  };
}


// ═══════════════════════════════════════════════════════════════
// HELPER CENTRALE — Risolve propertyName + currentDate → cleaning doc
// Usato da move_cleaning, cancel_cleaning, update_guests
// L'AI non deve mai gestire cleaningId o propertyId direttamente
// ═══════════════════════════════════════════════════════════════
async function resolveCleaningByNameAndDate(
  userId: string,
  propertyName: string,
  currentDate: string
): Promise<{ success: false; error: string } | { success: true; cleaningRef: any; cleaning: any; prop: any; propName: string }> {
  if (!propertyName || !currentDate) {
    return { success: false, error: "Parametri mancanti: serve il nome della casa e la data." };
  }

  // 1. Trova proprietà per nome (match flessibile ma verificato sul DB reale)
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
  // Normalizza: minuscolo + apostrofi uniformi + spazi multipli ridotti
  const normalize = (s: string) => s.toLowerCase().trim()
    .replace(/[\u2018\u2019\u0060]/g, "'")
    .replace(/'\s+/g, "' ")
    .replace(/\s+'/g, " '")
    .replace(/\s+/g, " ");
  const nameLower = normalize(propertyName);

  // Match esatto prima, poi parziale, poi per parole chiave
  let propDoc = propsSnap.docs.find((d: any) => normalize(d.data().name || "") === nameLower);
  if (!propDoc) {
    propDoc = propsSnap.docs.find((d: any) => {
      const n = normalize(d.data().name || "");
      return n.includes(nameLower) || nameLower.includes(n);
    });
  }
  if (!propDoc) {
    const keywords = nameLower.split(" ").filter((w: string) => w.length > 3);
    if (keywords.length > 0) {
      propDoc = propsSnap.docs.find((d: any) => {
        const n = normalize(d.data().name || "");
        return keywords.every((kw: string) => n.includes(kw));
      });
    }
  }

  if (!propDoc) {
    const nomi = propsSnap.docs.map((d: any) => `"${d.data().name}"`).join(", ");
    return { success: false, error: `Casa "${propertyName}" non trovata. Le tue proprietà sono: ${nomi}. Riprova con il nome esatto.` };
  }

  const propertyId = propDoc.id;
  const propData = propDoc.data() as any;

  // 2. Trova pulizia per data (cerca nel DB, non in memoria)
  const cleaningsSnap = await adminDb.collection("cleanings")
    .where("propertyId", "==", propertyId)
    .get();

  const matchDoc = cleaningsSnap.docs.find((d: any) => {
    const date = d.data().scheduledDate?.toDate?.();
    if (!date) return false;
    const dateISO = dateToItalyISO(date);
    return dateISO === currentDate && !["COMPLETED", "CANCELLED"].includes(d.data().status);
  });

  if (!matchDoc) {
    // Mostra le prossime disponibili per aiutare
    const nowISO = todayItalyISO();
    const disponibili = cleaningsSnap.docs
      .map((d: any) => {
        const date = d.data().scheduledDate?.toDate?.();
        return date ? dateToItalyISO(date) : null;
      })
      .filter((iso: any) => iso && iso >= nowISO && !["COMPLETED","CANCELLED"].includes(
        cleaningsSnap.docs.find((d: any) => dateToItalyISO(d.data().scheduledDate?.toDate?.()) === iso)?.data()?.status
      ))
      .sort()
      .slice(0, 5);
    
    return {
      success: false,
      error: `Nessuna pulizia trovata il ${currentDate} per "${propData.name}". Prossime disponibili: ${disponibili.join(", ") || "nessuna"}`
    };
  }

  console.log(`[resolve] ✅ "${propData.name}" ${currentDate} → cleaningId=${matchDoc.id}`);
  return {
    success: true,
    cleaningRef: adminDb.collection("cleanings").doc(matchDoc.id),
    cleaning: matchDoc.data(),
    prop: propData,
    propName: propData.name,
  };
}

async function toolMoveClening(userId: string, input: any) {
  console.log(`[move_cleaning] propertyName="${input.propertyName}" currentDate=${input.currentDate} newDate=${input.newDate} confirmed=${input.confirmed}`);

  if (!input.confirmed) {
    return { success: false, needsConfirmation: true, error: "Operazione non confermata. Chiedi conferma all'utente prima di spostare la pulizia." };
  }

  // Risolvi casa + data → cleaning reale nel DB
  const resolved = await resolveCleaningByNameAndDate(userId, input.propertyName, input.currentDate);
  if (!resolved.success) return resolved;
  const { cleaningRef, cleaning, prop, propName } = resolved;

  if (["COMPLETED", "CANCELLED"].includes(cleaning.status)) {
    return { success: false, error: "Non puoi spostare una pulizia già completata o cancellata." };
  }

  // Controllo deadline 20:00
  const cleaningDate = cleaning.scheduledDate?.toDate?.();
  if (cleaningDate) {
    const dl = checkDeadline(cleaningDate, "spostare");
    if (dl.blocked) return { success: false, deadlineExceeded: true, error: dl.error };
  }

  // Parsa nuova data
  const isoMatch = (input.newDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!isoMatch) return { success: false, error: `Data destinazione non valida: "${input.newDate}". Usa YYYY-MM-DD.` };
  const newDateObj = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]), 12, 0, 0, 0);

  const todayMove = new Date(todayItalyISO() + "T00:00:00");
  if (newDateObj < todayMove) {
    return { success: false, error: "Non puoi spostare una pulizia in una data passata." };
  }

  // Aggiorna ordine biancheria PENDING se collegato
  if (cleaning.laundryOrderId) {
    try {
      const orderRef = adminDb.collection("orders").doc(cleaning.laundryOrderId);
      const orderSnap = await orderRef.get();
      if (orderSnap.exists && ["PENDING", "ASSIGNED"].includes((orderSnap.data() as any).status)) {
        await orderRef.update({ scheduledDate: Timestamp.fromDate(newDateObj), updatedAt: Timestamp.now() });
      }
    } catch (e) { /* ignora */ }
  }

  await cleaningRef.update({
    scheduledDate: Timestamp.fromDate(newDateObj),
    movedAt: Timestamp.now(),
    movedBy: userId,
    moveReason: input.reason || "Richiesta proprietario via assistente",
    manuallyModified: true,
    updatedAt: Timestamp.now(),
  });

  const movedDateStr = newDateObj.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  console.log(`[move_cleaning] ✅ "${propName}" spostata a ${input.newDate}`);
  return { success: true, message: `✅ Pulizia di "${propName}" spostata a ${movedDateStr}.` };
}


async function toolCancelCleaning(userId: string, input: any) {
  console.log(`[cancel_cleaning] propertyName="${input.propertyName}" currentDate=${input.currentDate} confirmed=${input.confirmed}`);

  if (!input.confirmed) {
    return { success: false, needsConfirmation: true, error: "Operazione non confermata. Chiedi conferma all'utente prima di cancellare la pulizia." };
  }

  const resolved = await resolveCleaningByNameAndDate(userId, input.propertyName, input.currentDate);
  if (!resolved.success) return resolved;
  const { cleaningRef, cleaning, propName } = resolved;

  if (["COMPLETED", "CANCELLED"].includes(cleaning.status)) {
    return { success: false, error: "Pulizia già completata o cancellata." };
  }

  // Controllo deadline 20:00
  const cleaningDate = cleaning.scheduledDate?.toDate?.();
  if (cleaningDate) {
    const dl = checkDeadline(cleaningDate, "cancellare");
    if (dl.blocked) return { success: false, deadlineExceeded: true, error: dl.error };
  }

  // Cancella ordine biancheria PENDING associato
  if (cleaning.laundryOrderId) {
    try {
      const orderRef = adminDb.collection("orders").doc(cleaning.laundryOrderId);
      const orderSnap = await orderRef.get();
      if (orderSnap.exists && ["PENDING", "ASSIGNED"].includes((orderSnap.data() as any).status)) {
        await orderRef.update({ status: "CANCELLED", cancelledAt: Timestamp.now(), cancelReason: "Pulizia cancellata", updatedAt: Timestamp.now() });
      }
    } catch (e) { /* ignora */ }
  }

  await cleaningRef.update({
    status: "CANCELLED",
    cancelledAt: Timestamp.now(),
    cancelledBy: userId,
    cancelReason: input.reason || "Cancellata via assistente",
    updatedAt: Timestamp.now(),
  });

  console.log(`[cancel_cleaning] ✅ "${propName}" ${input.currentDate} cancellata`);
  return { success: true, message: `✅ Pulizia di "${propName}" del ${input.currentDate} cancellata.` };
}


async function toolRequestProduct(userId: string, input: any) {
  const now = Timestamp.now();

  await adminDb.collection("productRequests").add({
    propertyId: input.propertyId,
    propertyName: input.propertyName || "",
    proprietarioId: userId,
    productName: input.productName,
    quantity: input.quantity || 1,
    note: input.note || "",
    status: "pending",
    source: "assistant",
    createdAt: now,
    updatedAt: now,
  });

  return {
    success: true,
    message: `Richiesta inviata: ${input.quantity || 1}x ${input.productName}. L'amministratore la vedrà e provvederà.`
  };
}

async function toolUpdateGuests(userId: string, input: any) {
  console.log(`[update_guests] propertyName="${input.propertyName}" currentDate=${input.currentDate} guests=${input.guests}`);

  const resolved = await resolveCleaningByNameAndDate(userId, input.propertyName, input.currentDate);
  if (!resolved.success) return resolved;
  const { cleaningRef, cleaning, propName } = resolved;

  // Controllo deadline 20:00
  const cleaningDate = cleaning.scheduledDate?.toDate?.();
  if (cleaningDate) {
    const dl = checkDeadline(cleaningDate, "aggiornare gli ospiti di");
    if (dl.blocked) return { success: false, deadlineExceeded: true, error: dl.error };
  }

  // Aggiorna ordine biancheria PENDING se esiste
  if (cleaning.laundryOrderId) {
    try {
      const orderRef = adminDb.collection("orders").doc(cleaning.laundryOrderId);
      const orderSnap = await orderRef.get();
      if (orderSnap.exists && ["PENDING", "ASSIGNED"].includes((orderSnap.data() as any).status)) {
        await orderRef.update({ guestsCount: input.guests, updatedAt: Timestamp.now() });
      }
    } catch (e) { /* ignora */ }
  }

  await cleaningRef.update({
    guestCount: input.guests,
    guestsCount: input.guests,
    guests: input.guests,
    guestsConfirmed: true,
    updatedAt: Timestamp.now(),
  });

  console.log(`[update_guests] ✅ "${propName}" ${input.currentDate} → ${input.guests} ospiti`);
  return { success: true, message: `✅ Ospiti aggiornati a ${input.guests} per "${propName}" del ${input.currentDate}.` };
}


async function toolCreateCleaning(userId: string, input: any) {
  // PROTEZIONE: deve essere confermato esplicitamente dall'utente
  if (!input.confirmed) {
    return { success: false, needsConfirmation: true, error: "Operazione non confermata. Chiedi conferma all'utente prima di creare la pulizia." };
  }
  // Verifica ownership della proprietà
  const propRef = adminDb.collection("properties").doc(input.propertyId);
  const propSnap = await propRef.get();
  if (!propSnap.exists) return { success: false, error: "Proprietà non trovata" };

  const prop = propSnap.data() as any;
  if (prop.ownerId !== userId) return { success: false, error: "Non sei il proprietario di questa proprietà" };

  // Parsa data ISO esplicitamente come in move_cleaning (evita bug UTC midnight)
  const isoCreateMatch = (input.date || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!isoCreateMatch) return { success: false, error: `Data non valida: "${input.date}". Usa YYYY-MM-DD.` };
  const dateObj = new Date(parseInt(isoCreateMatch[1]), parseInt(isoCreateMatch[2]) - 1, parseInt(isoCreateMatch[3]), 12, 0, 0, 0);

  // Non permettere date nel passato (confronto con oggi in ora italiana)
  const today = new Date(todayItalyISO() + "T00:00:00");
  if (dateObj < today) {
    return { success: false, error: "Non puoi inserire una pulizia in una data passata" };
  }

  // ── Controllo deadline 20:00: non si può inserire una pulizia per domani dopo le 20:00 ──
  // La logica è la stessa del cancel/move: deadline = giorno prima alle 20:00
  const createDeadlineCheck = checkDeadline(dateObj, "inserire una pulizia per");
  if (createDeadlineCheck.blocked) {
    return { success: false, deadlineExceeded: true, error: createDeadlineCheck.error };
  }

  // Controlla se esiste già una pulizia nella stessa data per la stessa proprietà
  const dayStart = new Date(dateObj); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dateObj); dayEnd.setHours(23, 59, 59, 999);
  const existingSnap = await adminDb.collection("cleanings")
    .where("propertyId", "==", input.propertyId)
    .where("scheduledDate", ">=", Timestamp.fromDate(dayStart))
    .where("scheduledDate", "<=", Timestamp.fromDate(dayEnd))
    .get();
  const existing = existingSnap.docs.filter((d: any) => d.data().status !== "CANCELLED");
  if (existing.length > 0) {
    const ex = existing[0].data() as any;
    const exDate = ex.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    return {
      success: false,
      alreadyExists: true,
      error: `Esiste già una pulizia per "${prop.name}" in questa data (${exDate}, stato: ${ex.status}). Non è possibile inserirne un'altra nello stesso giorno.`
    };
  }

  const now = Timestamp.now();
  const basePrice = prop.cleaningPrice || prop.cleanPrice || prop.price || 0;
  const scheduledTime = prop.checkOutTime || "10:00";
  const guestsCount = input.guests || 2;

  // ─── Biancheria: leggi configurazione proprietà ───
  // usesOwnLinen = false  → usa biancheria aziendale noleggio → crea ordine
  // usesOwnLinen = true   → usa la propria biancheria → nessun ordine
  const usesOwnLinen = prop.usesOwnLinen === true;
  const serviceConfigs = prop.serviceConfigs || {};
  const linenConfig = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)] || null;

  // Calcola articoli biancheria per N ospiti
  const ITEM_NAMES: Record<string, string> = {
    doubleSheets: "Lenzuola Matrimoniali",
    singleSheets: "Lenzuola Singole",
    pillowcases: "Federe",
    towel_bath: "Telo Doccia",
    towel_face: "Asciugamano Viso",
    towel_bidet: "Asciugamano Bidet",
    bathmat: "Tappetino Scendibagno",
  };
  const linennItems: { id: string; name: string; quantity: number }[] = [];
  if (!usesOwnLinen && linenConfig) {
    const addItems = (section: any) => {
      if (!section) return;
      Object.entries(section).forEach(([itemId, qty]: [string, any]) => {
        if (typeof qty === "number" && qty > 0) {
          const existing = linennItems.find(i => i.id === itemId);
          if (existing) existing.quantity += qty;
          else linennItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
        }
      });
    };
    // bl = biancheria letto (può avere sub-oggetti per letto o "all")
    if (linenConfig.bl) {
      if (linenConfig.bl["all"]) {
        addItems(linenConfig.bl["all"]);
      } else {
        Object.values(linenConfig.bl).forEach((bedItems: any) => {
          if (typeof bedItems === "object") addItems(bedItems);
        });
      }
    }
    if (linenConfig.ba) addItems(linenConfig.ba); // biancheria bagno
    if (linenConfig.ki) addItems(linenConfig.ki); // kit cortesia
  }

  const requiresLaundry = !usesOwnLinen && linennItems.length > 0;

  // ─── Crea pulizia ───
  const cleaningRef = await adminDb.collection("cleanings").add({
    propertyId: input.propertyId,
    propertyName: prop.name || "",
    propertyAddress: prop.address || "",
    propertyCity: prop.city || "",
    ownerId: prop.ownerId || userId,
    ownerName: prop.ownerName || "",
    scheduledDate: Timestamp.fromDate(dateObj),
    scheduledTime,
    type: "checkout",
    status: "SCHEDULED",
    priority: "normal",
    serviceTypeName: "Standard",
    serviceTypeCode: "STANDARD",
    serviceTypeId: null,
    price: basePrice,
    basePrice,
    finalPrice: basePrice,
    contractPrice: basePrice,
    guestCount: guestsCount,
    guestsCount,
    maxGuests: prop.maxGuests || null,
    guestsConfirmed: true,
    notes: input.notes || "",
    adminNotes: "",
    ownerNotes: input.notes || "",
    requiresLaundry,
    hasLinenOrder: false, // aggiornato sotto se viene creato ordine
    checklistCompleted: false,
    photosCount: 0,
    photoIds: [],
    issuesCount: 0,
    issueIds: [],
    source: "assistant",
    sourceCalendar: "manual",
    manuallyCreated: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  // ─── Crea ordine biancheria se necessario ───
  let linenMessage = "";
  if (requiresLaundry) {
    // Calcola prezzi articoli dall'inventory
    const invSnap = await adminDb.collection("inventory").get();
    const invById = new Map(invSnap.docs.map((d: any) => [d.id, d.data() as any]));
    const itemsWithPrices = linennItems.map(item => {
      const inv = invById.get(item.id) as any;
      const unitPrice = inv?.sellPrice ?? 0;
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice,
        totalPrice: unitPrice * item.quantity,
      };
    });
    const orderTotal = itemsWithPrices.reduce((s, i) => s + i.totalPrice, 0);

    const orderRef = await adminDb.collection("orders").add({
      totalPrice: Math.round(orderTotal * 100) / 100,
      cleaningId: cleaningRef.id,
      propertyId: input.propertyId,
      propertyName: prop.name || "",
      propertyAddress: prop.address || "",
      propertyCity: prop.city || "",
      propertyPostalCode: prop.postalCode || "",
      propertyFloor: prop.floor || "",
      propertyApartment: prop.apartment || "",
      propertyIntercom: prop.intercom || "",
      propertyDoorCode: prop.doorCode || "",
      propertyKeysLocation: prop.keysLocation || "",
      propertyAccessNotes: prop.accessNotes || "",
      ownerId: prop.ownerId || userId,
      ownerName: prop.ownerName || "",
      items: itemsWithPrices,
      guestsCount,
      status: "PENDING",
      type: "LINEN",
      scheduledDate: Timestamp.fromDate(dateObj),
      scheduledTime,
      source: "assistant",
      createdAt: now,
      updatedAt: now,
    });

    // Aggiorna pulizia con riferimento ordine
    await adminDb.collection("cleanings").doc(cleaningRef.id).update({
      laundryOrderId: orderRef.id,
      hasLinenOrder: true,
      updatedAt: Timestamp.now(),
    });

    const articoliStr = itemsWithPrices.map(i => `${i.name} ×${i.quantity}`).join(", ");
    linenMessage = ` · Biancheria inclusa automaticamente (${articoliStr})`;
  } else if (usesOwnLinen) {
    linenMessage = " · Nessuna biancheria (la casa usa biancheria propria)";
  } else if (!linenConfig) {
    linenMessage = " · Biancheria non configurata per questa casa — contatta l'amministratore";
  }

  const dateFormatted = dateObj.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return {
    success: true,
    cleaningId: cleaningRef.id,
    message: `✅ Pulizia inserita per "${prop.name}" il ${dateFormatted} (${guestsCount} ospiti)${linenMessage}. L'amministratore la vedrà e assegnerà un operatore.`
  };
}

async function toolGetBookings(userId: string, input: any) {
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
  const properties = propsSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  const propertyIds = properties.map((p: any) => p.id);
  if (propertyIds.length === 0) return { bookings: [], total: 0 };

  const bookingsDocs = (input.propertyId && propertyIds.includes(input.propertyId))
    ? (await adminDb.collection("bookings").where("propertyId", "==", input.propertyId).get()).docs
    : await queryWhereIn(adminDb.collection("bookings"), "propertyId", propertyIds);

  let bookings = bookingsDocs.map((d: any) => {
    const data = d.data();
    const prop = properties.find((p: any) => p.id === data.propertyId);
    const checkIn = data.checkIn?.toDate?.() || null;
    const checkOut = data.checkOut?.toDate?.() || null;
    const nights = checkIn && checkOut
      ? Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      id: d.id,
      propertyId: data.propertyId,
      propertyName: prop?.name || data.propertyName || "Casa sconosciuta",
      guestName: data.guestName || data.summary || "Ospite",
      checkIn: checkIn ? checkIn.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "N/D",
      checkInISO: checkIn ? dateToItalyISO(checkIn) : null,
      checkOut: checkOut ? checkOut.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "N/D",
      checkOutISO: checkOut ? dateToItalyISO(checkOut) : null,
      nights,
      guests: data.guests || data.guestsCount || data.adults || data.numberOfGuests || data.persons || data.numGuests || 0,
      status: data.status || "CONFIRMED",
      source: data.bookingSource || data.source || "manuale",
      note: data.notes || data.guestNotes || null,
      guestEmail: data.guestEmail || null,
      guestPhone: data.guestPhone || null,
      importoPrenotazione: data.amount || data.totalPrice || null,
    };
  });

  const nowISO = todayItalyISO();
  const soloFuture = input.solo_future !== false;
  if (soloFuture) {
    // BUG 1 FIX: confronta ISO string, non Date object
    bookings = bookings.filter((b: any) => b.checkOutISO && b.checkOutISO >= nowISO);
  }
  if (input.propertyId) {
    // BUG 1 FIX: filtra per propertyId (ID), non per nome
    bookings = bookings.filter((b: any) => b.propertyId === input.propertyId);
  }

  bookings.sort((a: any, b: any) => {
    if (!a.checkInISO) return 1;
    if (!b.checkInISO) return -1;
    return a.checkInISO.localeCompare(b.checkInISO);
  });

  const limite = input.limite || 30;
  const result = bookings.slice(0, limite);

  // Ospite attualmente in casa (checkIn passato ma checkOut futuro)
  const inCasa = result.find((b: any) => b.checkInISO && b.checkOutISO && b.checkInISO <= nowISO && b.checkOutISO >= nowISO);
  // Prossimo check-in futuro (checkIn strettamente dopo oggi)
  const prossimoArrivo = result.find((b: any) => b.checkInISO && b.checkInISO > nowISO);

  return {
    bookings: result,
    total: bookings.length,
    ospite_in_casa: inCasa ? `${inCasa.guestName} in ${inCasa.propertyName} — check-out ${inCasa.checkOut}` : null,
    prossimo_checkin: prossimoArrivo ? `${prossimoArrivo.guestName} in ${prossimoArrivo.propertyName} il ${prossimoArrivo.checkIn}` : null,
  };
}

async function toolGetIssues(userId: string, input: any) {
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
  const properties = propsSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  const propertyIds = properties.map((p: any) => p.id);
  if (propertyIds.length === 0) return { issues: [], total: 0, aperti: 0 };

  const soloAperti = input.solo_aperti !== false;

  // Query per ogni propertyId (Firestore non supporta "in" con where multipli)
  const allIssues: any[] = [];
  for (const pid of propertyIds) {
    let q: any = adminDb.collection("issues").where("propertyId", "==", pid);
    if (soloAperti) q = q.where("resolved", "==", false);
    const snap = await q.get();
    snap.docs.forEach((d: any) => {
      const data = d.data();
      const prop = properties.find((p: any) => p.id === pid);
      allIssues.push({
        id: d.id,
        propertyId: pid,
        propertyName: prop?.name || data.propertyName || "Casa sconosciuta",
        tipo: data.type || "other",
        tipoLeggibile: {
          damage: "🔨 Danno",
          missing_item: "📦 Oggetto mancante",
          maintenance: "🔧 Manutenzione",
          cleanliness: "🧹 Pulizia insufficiente",
          safety: "⚠️ Sicurezza",
          other: "📋 Altro",
        }[data.type as string] || "📋 Altro",
        titolo: data.title || "Segnalazione",
        descrizione: data.description || "",
        severita: data.severity || "medium",
        severitaLeggibile: {
          low: "bassa",
          medium: "media",
          high: "alta",
          critical: "🚨 critica",
        }[data.severity as string] || "media",
        stato: data.resolved ? "risolto" : "aperto",
        segnalatoIl: data.reportedAt?.toDate?.()?.toLocaleDateString("it-IT") || "N/D",
        segnalato: data.reportedByName || "Operatore",
      });
    });
  }

  if (input.propertyId) {
    // BUG 2 FIX: filtra direttamente per propertyId sul campo, non confrontando nomi
    const filtered = allIssues.filter((issue: any) => issue.propertyId === input.propertyId);
    return { issues: filtered, total: filtered.length, aperti: filtered.filter((i: any) => i.stato === "aperto").length };
  }

  allIssues.sort((a: any, b: any) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severita] ?? 2) - (order[b.severita] ?? 2);
  });

  const aperti = allIssues.filter((i: any) => i.stato === "aperto").length;
  return {
    issues: allIssues,
    total: allIssues.length,
    aperti,
    sommario: aperti === 0
      ? "Nessun problema aperto ✅"
      : `Hai ${aperti} problema${aperti > 1 ? "i" : ""} aperto${aperti > 1 ? "i" : ""} da risolvere.`
  };
}

async function toolGetCleaningDetail(userId: string, input: any) {
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
  const propertyIds = propsSnap.docs.map((d: any) => d.id);

  let cleaningData: any = null;
  let cleaningId: string | null = null;

  if (input.cleaningId) {
    // Recupera pulizia specifica
    const snap = await adminDb.collection("cleanings").doc(input.cleaningId).get();
    if (!snap.exists) return { success: false, error: "Pulizia non trovata" };
    cleaningData = snap.data();
    cleaningId = snap.id;
    if (!propertyIds.includes(cleaningData.propertyId)) {
      return { success: false, error: "Non sei il proprietario di questa pulizia" };
    }
  } else if (input.propertyId) {
    // BUG 4 FIX: evita query composita, filtra in memoria
    if (!propertyIds.includes(input.propertyId)) {
      return { success: false, error: "Non sei il proprietario di questa proprietà" };
    }
    const snap = await adminDb.collection("cleanings")
      .where("propertyId", "==", input.propertyId)
      .get();
    const completed = snap.docs
      .filter((d: any) => d.data().status === "COMPLETED")
      .sort((a: any, b: any) => {
        const da = a.data().scheduledDate?.toMillis?.() || 0;
        const db = b.data().scheduledDate?.toMillis?.() || 0;
        return db - da;
      });
    if (completed.length === 0) return { success: false, error: "Nessuna pulizia completata trovata per questa proprietà" };
    cleaningData = completed[0].data();
    cleaningId = completed[0].id;
  } else {
    // BUG 4 FIX: evita query composita (propertyId "in" + status + orderBy) che richiede indice.
    // Recupera tutte le pulizie delle proprietà, filtra in memoria.
    const allDocs = await queryWhereIn(adminDb.collection("cleanings"), "propertyId", propertyIds);
    const completed = allDocs
      .filter((d: any) => d.data().status === "COMPLETED")
      .sort((a: any, b: any) => {
        const da = a.data().scheduledDate?.toMillis?.() || 0;
        const db = b.data().scheduledDate?.toMillis?.() || 0;
        return db - da; // desc
      });
    if (completed.length === 0) return { success: false, error: "Nessuna pulizia completata trovata" };
    cleaningData = completed[0].data();
    cleaningId = completed[0].id;
  }

  const scheduledDate = cleaningData.scheduledDate?.toDate?.();
  const completedAt = cleaningData.completedAt?.toDate?.();
  const startedAt = cleaningData.startedAt?.toDate?.();

  // Calcola durata se disponibile
  let durata: string | null = null;
  if (startedAt && completedAt) {
    const minuti = Math.round((completedAt.getTime() - startedAt.getTime()) / 60000);
    durata = minuti >= 60
      ? `${Math.floor(minuti / 60)}h ${minuti % 60}min`
      : `${minuti} minuti`;
  }

  return {
    id: cleaningId,
    propertyName: cleaningData.propertyName || "Casa",
    data: scheduledDate?.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) || "N/D",
    orarioProgrammato: cleaningData.scheduledTime || null,
    stato: cleaningData.status,
    statoLeggibile: ({
      SCHEDULED: "Programmata", ASSIGNED: "Assegnata", IN_PROGRESS: "In corso",
      COMPLETED: "Completata", CANCELLED: "Cancellata",
    } as Record<string, string>)[cleaningData.status] || cleaningData.status,
    operatori: cleaningData.operators?.map((o: any) => o.name).filter(Boolean) || (cleaningData.operatorName ? [cleaningData.operatorName] : []),
    ospiti: cleaningData.guestCount || cleaningData.guestsCount || 0,
    nomeOspite: cleaningData.guestName || null,
    fontePrenotazione: cleaningData.bookingSource || null,
    tipoServizio: cleaningData.serviceType || "STANDARD",
    tipoServizioLeggibile: ({
      STANDARD: "Pulizia standard", APPROFONDITA: "Pulizia approfondita", SGROSSO: "Sgrosso",
    } as Record<string, string>)[cleaningData.serviceType] || cleaningData.serviceType || "Standard",
    prezzo: cleaningData.priceOverride ?? cleaningData.price ?? null,
    prezzoModificato: cleaningData.priceModified || false,
    motivoPrezzo: cleaningData.priceChangeReason || null,
    motivoSgrosso: cleaningData.sgrossoReason || null,
    serviziExtra: Array.isArray(cleaningData.extraServices) ? cleaningData.extraServices : [],
    note: cleaningData.notes || null,
    noteAggiuntive: cleaningData.sgrossoNotes || null,
    noteAmministratore: cleaningData.adminNotes || null,
    durata,
    orarioInizio: startedAt ? startedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : null,
    orarioFine: completedAt ? completedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : null,
    fotografie: Array.isArray(cleaningData.photos) ? cleaningData.photos.length : 0,
    haOrdineBiancheria: !!(cleaningData.hasLinenOrder || cleaningData.hasLinen || cleaningData.linenOrdered),
    ordineBiancheria: await (async () => {
      if (!cleaningData.hasLinenOrder) return null;
      const invSnap = await adminDb.collection("inventory").get();
      const invById = new Map(invSnap.docs.map((d: any) => [d.id, d.data() as any]));
      // Cerca ordine collegato a questa pulizia
      // Cerca ordine sia DELIVERED (già consegnato) che PENDING (in attesa)
      const ordSnap = await adminDb.collection("orders")
        .where("cleaningId", "==", cleaningId)
        .get();
      const validOrders = ordSnap.docs.filter((d: any) => ["DELIVERED","PENDING","ASSIGNED"].includes(d.data().status));
      if (validOrders.length === 0) return { nota: "Ordine biancheria registrato ma dati non trovati" };
      const ordDoc = validOrders[0];
      const ord = ordDoc.data() as any;
      let totale = 0;
      const articoli: any[] = [];
      if (Array.isArray(ord.items)) {
        ord.items.forEach((item: any) => {
          const inv = invById.get(item.id) as any;
          const price = item.priceOverride ?? item.unitPrice ?? item.price ?? inv?.sellPrice ?? 0;
          const qty = item.quantity || 1;
          const subtotale = item.totalPrice || (price * qty);
          totale += subtotale;
          articoli.push({
            nome: item.name || inv?.name || item.id,
            quantita: qty,
            prezzoUnitario: Math.round(price * 100) / 100,
            subtotale: Math.round(subtotale * 100) / 100,
          });
        });
      }
      const deliveryFee = (ord.deliveryFee && ord.deliveryFeeEnabled !== false) ? ord.deliveryFee : 0;
      totale += deliveryFee;
      if (ord.totalPriceOverride != null) totale = ord.totalPriceOverride;
      return {
        articoli,
        costoConsegna: Math.round(deliveryFee * 100) / 100,
        totale: Math.round(totale * 100) / 100,
      };
    })(),
    valutazione: cleaningData.ratingScores
      ? Object.values(cleaningData.ratingScores as Record<string, number>).reduce((s: number, v: number) => s + v, 0) /
        Object.values(cleaningData.ratingScores as Record<string, number>).length
      : null,
    valutazioneNota: cleaningData.ratingNotes || null,
    dataOriginale: cleaningData.originalDate ? (cleaningData.originalDate?.toDate?.() || new Date(cleaningData.originalDate))?.toLocaleDateString("it-IT") : null,
    dataModificata: !!cleaningData.dateModifiedAt,
  };
}

async function toolGetSpendingStats(userId: string, input: any) {
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).where("status", "==", "ACTIVE").get();
  const properties = propsSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  const propertyIds = properties.map((p: any) => p.id);
  if (propertyIds.length === 0) return { totale: 0, messaggio: "Nessuna proprietà attiva trovata." };

  const mesi = Math.min(input.mesi || 3, 12);
  const now = new Date();
  // BUG 3 FIX: non usare range date in query Firestore con "in" (richiede indice composito).
  // Recupera tutto e filtra in memoria.
  // Usa data italiana per calcolo periodo corretto
  const nowIT = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const dalTimestamp = new Date(nowIT.getFullYear(), nowIT.getMonth() - (mesi - 1), 1);

  // Pulizie completate — chunk sicuro per Firestore "in" limit 10, filtra in memoria
  const cleaningsDocsStats = await queryWhereIn(adminDb.collection("cleanings"), "propertyId", propertyIds);
  const cleaningsSnap = { docs: cleaningsDocsStats.filter((d: any) => d.data().status === "COMPLETED") };

  // Ordini consegnati — chunk sicuro, filtra in memoria
  const ordersDocsStats = await queryWhereIn(adminDb.collection("orders"), "propertyId", propertyIds);
  const ordersSnap = { docs: ordersDocsStats.filter((d: any) => d.data().status === "DELIVERED") };

  // Inventory per prezzi ordini
  const invSnap = await adminDb.collection("inventory").get();
  const invById = new Map(invSnap.docs.map((d: any) => [d.id, d.data() as any]));

  // Aggrega per mese e per proprietà
  const MONTHS = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
  const byMonth: Record<string, number> = {};
  const byProperty: Record<string, { name: string; totale: number; pulizie: number; costoTotPulizie: number; costoTotBiancheria: number }> = {};

  let totale = 0;
  let totalePulizie = 0;
  let totaleOrdini = 0;

  cleaningsSnap.docs.forEach((d: any) => {
    const data = d.data();
    const date = data.scheduledDate?.toDate?.();
    if (!date || date < dalTimestamp) return; // filtra in memoria per data
    const prop = properties.find((p: any) => p.id === data.propertyId);
    const price = data.priceOverride ?? data.price ?? 0;
    const key = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    byMonth[key] = (byMonth[key] || 0) + price;
    if (prop) {
      if (!byProperty[prop.id]) byProperty[prop.id] = { name: prop.name, totale: 0, pulizie: 0, costoTotPulizie: 0, costoTotBiancheria: 0 };
      byProperty[prop.id].totale += price;
      byProperty[prop.id].pulizie += 1;
      byProperty[prop.id].costoTotPulizie += price;
    }
    totale += price;
    totalePulizie += price;
  });

  ordersSnap.docs.forEach((d: any) => {
    const data = d.data();
    const date = data.deliveredAt?.toDate?.() || data.scheduledDate?.toDate?.();
    if (!date || date < dalTimestamp) return; // filtra in memoria per data
    let orderTotal = 0;
    if (Array.isArray(data.items)) {
      data.items.forEach((item: any) => {
        const inv = invById.get(item.id) as any;
        const price = item.priceOverride ?? inv?.sellPrice ?? item.price ?? 0;
        orderTotal += price * (item.quantity || 1);
      });
    }
    if (data.deliveryFee && data.deliveryFeeEnabled !== false) orderTotal += data.deliveryFee;
    const effective = data.totalPriceOverride ?? orderTotal;
    const key = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    byMonth[key] = (byMonth[key] || 0) + effective;
    const prop = properties.find((p: any) => p.id === data.propertyId);
    if (prop) {
      if (!byProperty[prop.id]) byProperty[prop.id] = { name: prop.name, totale: 0, pulizie: 0, costoTotPulizie: 0, costoTotBiancheria: 0 };
      byProperty[prop.id].totale += effective;
      byProperty[prop.id].costoTotBiancheria += effective;
    }
    totale += effective;
    totaleOrdini += effective;
  });

  // Mese più costoso
  const meseMax = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];
  // Proprietà più costosa
  const propMax = Object.values(byProperty).sort((a, b) => b.totale - a.totale)[0];

  const result: any = {
    periodo: `ultimi ${mesi} mesi (da ${dalTimestamp.toLocaleDateString("it-IT", { month: "long", year: "numeric" })})`,
    totale: Math.round(totale * 100) / 100,
    totalePulizie: Math.round(totalePulizie * 100) / 100,
    totaleServiziBiancheria: Math.round(totaleOrdini * 100) / 100,
    mediaPerMese: Math.round((totale / mesi) * 100) / 100,
    andamentoMensile: byMonth,
    meseMaxSpesa: meseMax ? `${meseMax[0]} (€${meseMax[1].toFixed(2)})` : null,
    nota: "Tutti gli importi sono IVA esclusa",
  };

  if (input.per_proprieta) {
    result.perProprieta = Object.values(byProperty).sort((a, b) => b.totale - a.totale).map((p: any) => ({
      nome: p.name,
      totale: Math.round(p.totale * 100) / 100,
      numeroPulizie: p.pulizie,
      costoTotPulizie: Math.round(p.costoTotPulizie * 100) / 100,
      costoTotBiancheria: Math.round(p.costoTotBiancheria * 100) / 100,
    }));
    result.proprietaPiuCostosa = propMax ? `${propMax.name} (€${propMax.totale.toFixed(2)})` : null;
  }

  return result;
}

async function toolGetOrders(userId: string, input: any) {
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).where("status", "==", "ACTIVE").get();
  const propertyIds = propsSnap.docs.map((d: any) => d.id);
  const propNames = new Map(propsSnap.docs.map((d: any) => [d.id, (d.data() as any).name || "Casa senza nome"]));
  if (propertyIds.length === 0) return { ordini: [], totale: 0 };

  const invSnap = await adminDb.collection("inventory").get();
  const invById = new Map(invSnap.docs.map((d: any) => [d.id, d.data() as any]));

  // Sicurezza: propertyId deve appartenere all'owner
  const orderDocsFull = input.propertyId && propertyIds.includes(input.propertyId)
    ? (await adminDb.collection("orders").where("propertyId", "==", input.propertyId).get()).docs
    : await queryWhereIn(adminDb.collection("orders"), "propertyId", propertyIds);

  // IMPORTANTE — logica app:
  // Esistono DUE tipi di biancheria visibili al proprietario:
  // 1. "annessa a pulizia": ordine con cleaningId, visibile nel dettaglio pulizia
  // 2. "standalone": ordine senza cleaningId (consegna indipendente)
  // Il proprietario vede SOLO ordini DELIVERED (consegnati) — mai PENDING o altri stati

  const ordini = orderDocsFull.map((d: any) => {
    const data = d.data() as any;

    // Solo DELIVERED — il proprietario non vede ordini in pending/altri stati
    if (data.status !== "DELIVERED") return null;

    let totale = 0;
    const articoli: any[] = [];
    if (Array.isArray(data.items)) {
      data.items.forEach((item: any) => {
        const inv = invById.get(item.id) as any;
        const price = item.priceOverride ?? item.unitPrice ?? item.price ?? inv?.sellPrice ?? 0;
        const qty = item.quantity || 1;
        const subtotale = item.totalPrice || (price * qty);
        totale += subtotale;
        articoli.push({
          nome: item.name || inv?.name || item.id,
          quantita: qty,
          prezzoUnitario: Math.round(price * 100) / 100,
          subtotale: Math.round(subtotale * 100) / 100,
        });
      });
    }
    const deliveryFee = (data.deliveryFee && data.deliveryFeeEnabled !== false) ? data.deliveryFee : 0;
    totale += deliveryFee;
    if (data.totalPriceOverride != null) totale = data.totalPriceOverride;

    // Data: usa deliveredAt (quando è stato effettivamente consegnato), mai scheduledDate
    const deliveredAt = data.deliveredAt?.toDate?.() || null;

    return {
      id: d.id,
      casa: propNames.get(data.propertyId) || data.propertyId,
      tipo: data.cleaningId ? "annessa a pulizia" : "consegna standalone",
      cleaningId: data.cleaningId || null,
      dataConsegna: deliveredAt ? deliveredAt.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "Data non disponibile",
      dataConsegnaISO: deliveredAt ? dateToItalyISO(deliveredAt) : null,
      articoli,
      costoConsegna: Math.round(deliveryFee * 100) / 100,
      totale: Math.round(totale * 100) / 100,
    };
  }).filter(Boolean);

  ordini.sort((a: any, b: any) => {
    if (!a.dataConsegnaISO) return 1;
    if (!b.dataConsegnaISO) return -1;
    return b.dataConsegnaISO.localeCompare(a.dataConsegnaISO);
  });

  const limite = input.limite || 50;
  return {
    ordini: ordini.slice(0, limite),
    totaleOrdini: ordini.length,
    nota: "IVA esclusa",
  };
}

// ═══════════════════════════════════════════════════════════════
// ESEGUI TOOL — dispatch
// ═══════════════════════════════════════════════════════════════
async function executeTool(name: string, input: any, userId: string): Promise<string> {
  try {
    let result: any;
    console.log(`[tool call] ${name}`, JSON.stringify(input));
    switch (name) {
      case "get_cleanings":       result = await toolGetCleanings(userId, input); break;
      case "get_payments":        result = await toolGetPayments(userId); break;
      case "get_properties":      result = await toolGetProperties(userId); break;
      case "move_cleaning":       result = await toolMoveClening(userId, input); break;
      case "cancel_cleaning":     result = await toolCancelCleaning(userId, input); break;
      case "request_product":     result = await toolRequestProduct(userId, input); break;
      case "update_guests":       result = await toolUpdateGuests(userId, input); break;
      case "create_cleaning":     result = await toolCreateCleaning(userId, input); break;
      case "get_bookings":        result = await toolGetBookings(userId, input); break;
      case "get_issues":          result = await toolGetIssues(userId, input); break;
      case "get_cleaning_detail": result = await toolGetCleaningDetail(userId, input); break;
      case "get_spending_stats":  result = await toolGetSpendingStats(userId, input); break;
      case "get_orders":          result = await toolGetOrders(userId, input); break;
      default: result = { error: "Tool non riconosciuto" };
    }
    const resultStr = JSON.stringify(result);
    if (["move_cleaning","cancel_cleaning","create_cleaning","update_guests"].includes(name)) {
      console.log(`[tool result] ${name}:`, resultStr);
    }
    return resultStr;
  } catch (err: any) {
    console.error(`[assistant tool error] ${name}:`, err?.message || err);
    return JSON.stringify({ error: err.message || "Errore esecuzione tool", tool: name });
  }
}

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════
function buildSystemPrompt(userName: string): string {
  // Usa timezone Italia (Europe/Rome) per date corrette
  const todayISO = todayItalyISO();
  const tomorrowDate = new Date(todayISO + "T12:00:00");
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowISO = dateToItalyISO(tomorrowDate);
  const nowItaly = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const oraItalia = nowItaly.getHours().toString().padStart(2, "0") + ":" + nowItaly.getMinutes().toString().padStart(2, "0");
  const todayLeggibile = new Date(todayISO + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `Sei l'assistente virtuale di CleaningApp per il proprietario ${userName}.
Oggi è ${todayLeggibile} (${todayISO}). Ora italiana: ${oraItalia}. Domani è ${tomorrowISO}.
⚠️ Usa SEMPRE queste date come riferimento. NON ricalcolare mai oggi/domani/ieri — usa i valori qui sopra.

Sei esperto di gestione pulizie case vacanza. Puoi sia RECUPERARE DATI tramite i tool, sia RISPONDERE A DOMANDE sull'app senza usare tool.

STRUTTURA DELL'APP
==================

STRUTTURA APP — AREA PROPRIETARIO
===================================

NAVIGAZIONE:
- Navbar mobile (bassa, 4 voci): Dashboard / Proprietà / Pulizie / Prenotazioni
- Menu hamburger (icona ≡ in alto): Pagamenti / Centro Messaggi / Impostazioni / Esci

════════════════════════════════════════════════
DASHBOARD (/proprietario)
════════════════════════════════════════════════
Cosa si vede:
- Banner scorrevole (auto ogni 5s, toccabile): slide 1 = stato pagamenti/debiti aperti, slide 2 = spesa mese corrente vs mese precedente
- 4 KPI: proprietà attive, prenotazioni attive, pulizie oggi, spesa mese
- Grafico barre: servizi per giorno della settimana (questa settimana)
- Grafico donut: spesa per proprietà nel mese corrente
- Grafico stacked bars: spesa 6 mesi (pulizie vs biancheria)
- Sezione debiti: appare solo se ci sono mesi non pagati, con scadenza e importo
A cosa serve: panoramica rapida di tutto; se ha un debito appare subito qui.

════════════════════════════════════════════════
PROPRIETÀ (/proprietario/proprieta)
════════════════════════════════════════════════
Cosa si vede: lista delle sue case con foto, nome, indirizzo, stato badge.
Stati possibili: ACTIVE (operativa), PENDING (attesa approvazione admin), PENDING_SIGNATURE (deve firmare Allegato D).

Come aggiungere una proprietà:
→ Clicca "Aggiungi proprietà" (o "+") in alto → /proprietario/proprieta/nuova
→ Campi da compilare: nome*, indirizzo* (con autocomplete Google — OBBLIGATORIO selezionare dalla lista per verificare GPS), numero civico*, città*, CAP, piano, interno, max ospiti (default 4), costo pulizia, URL iCal (opzionale), note, toggle "Usa biancheria propria"
→ Dopo invio: stato = PENDING, visibile solo dopo approvazione admin
→ Se usa biancheria propria: NON vengono generati ordini biancheria automatici

Dettaglio proprietà (/proprietario/proprieta/[id]):
→ Mostra: dati, foto, configurazione servizi, prezzi per numero ospiti
→ Modifica DIRETTA (senza approvazione): nome, piano, interno, note, URL iCal
→ Modifica CON APPROVAZIONE admin: numero max ospiti, configurazione letti/camere (invia richiesta → admin approva/rifiuta)
→ Foto accesso: foto portone e palazzo per gli operatori
→ Info accesso: codice porta, dove trovare le chiavi, note accesso

Configurazione biancheria (/proprietario/proprieta/[id]/biancheria):
→ Per ogni numero di ospiti (1,2,3...N) definisce quante lenzuola, asciugamani, ecc. servono
→ Questa configurazione genera automaticamente gli ordini biancheria per ogni pulizia

Collegare iCal (Airbnb, Booking.com, Oktorate, ecc.):
→ Vai su Proprietà → seleziona la casa → dettaglio → campo "URL iCal"
→ Incolla il link iCal che trovi nelle impostazioni del tuo annuncio su Airbnb/Booking
→ Poi vai su Prenotazioni → Calendario → pulsante "Sincronizza iCal" per importare

════════════════════════════════════════════════
PULIZIE (/proprietario/pulizie o /proprietario/calendario/pulizie)
════════════════════════════════════════════════
Cosa si vede: lista/calendario delle pulizie, filtrabili per proprietà, periodo, stato.
Stati pulizia: SCHEDULED (programmata) / ASSIGNED (operatore assegnato) / IN_PROGRESS (in corso) / COMPLETED (completata) / CANCELLED (cancellata)

Card pulizia mostra: foto proprietà, data, ora (default 10:00), operatore (o "Da assegnare"), n.ospiti, badge allerta se ospiti non confermati, prezzo.

Dettaglio pulizia (click sulla card):
→ Info: data, ora, proprietà, operatore, n.ospiti, nome ospite/fonte prenotazione, stato, prezzo (IVA esclusa)
→ Ordine biancheria collegato (se presente): articoli e quantità
→ Foto completamento: le foto caricate dall'operatore dopo aver finito
→ Segnalazioni: problemi trovati durante la pulizia

AZIONI che può fare il proprietario (direttamente o chiedendo a me):
→ SPOSTARE data pulizia → solo entro le 20:00 del giorno PRIMA della pulizia
→ CANCELLARE pulizia → solo entro le 20:00 del giorno PRIMA
→ AGGIORNARE numero ospiti → aggiorna anche l'ordine biancheria automaticamente
→ CREARE nuova pulizia manualmente → per date non collegate a prenotazioni
→ RICHIEDERE prodotti/materiali → segnalazione all'admin (es: mancano asciugamani, sapone ecc.)

AZIONI riservate SOLO all'admin (non posso farle):
→ Assegnare/cambiare operatore
→ Modificare il prezzo della pulizia
→ Segnare come completata

Limite orario 20:00: dopo le 20:00 del giorno prima NON è possibile spostare, cancellare o creare pulizie per il giorno successivo. Questo per permettere all'admin di organizzare gli operatori.

════════════════════════════════════════════════
PRENOTAZIONI (/proprietario/prenotazioni o /proprietario/calendario/prenotazioni)
════════════════════════════════════════════════
Cosa si vede:
- Vista CALENDARIO GANTT: ogni proprietà è una riga con colori diversi, le prenotazioni appaiono come barre colorate (verde=nuova, rosso=attiva, arancio=checkout oggi, grigio=passata)
- Vista LISTA: elenco prenotazioni con casa, ospite, check-in, check-out, n.ospiti, fonte

Badge colorati sulla lista:
- Giallo/arancio "⚠️ Urgente": prenotazione con checkout oggi o domani senza n.ospiti inseriti
- "Da inserire": mancano n.ospiti (importante per la biancheria!)

Come inserire una prenotazione MANUALE:
→ Clicca "+" o "Nuova prenotazione" nella sezione Prenotazioni
→ Seleziona la casa, inserisci nome ospite, data check-in, data check-out, numero ospiti
→ Clicca Conferma → la prenotazione viene creata
→ AUTOMATICAMENTE viene creata una pulizia SCHEDULED per il giorno del check-out
→ Se la casa usa biancheria aziendale: viene creato anche l'ordine biancheria automaticamente

Come sincronizzare da Airbnb/Booking (iCal):
→ Prima collega l'URL iCal nel dettaglio proprietà (vedi sopra)
→ Poi vai su Prenotazioni → Calendario → pulsante "Sincronizza" (icona aggiorna)
→ Il sistema importa le prenotazioni e genera le pulizie mancanti
→ Risultato: mostra quante prenotazioni importate/aggiornate e quante pulizie create

Dettaglio prenotazione (/proprietario/prenotazioni/[id]):
→ Info: casa, ospite, check-in, check-out, fonte (Airbnb/Booking/Manuale), pagamento
→ AGGIORNARE numero ospiti: campo editabile entro mezzanotte del giorno del check-out
  ⚠️ Dopo la mezzanotte del checkout NON si può più modificare → la biancheria viene preparata per max ospiti della proprietà
→ Pulizia collegata: link alla pulizia generata al checkout

════════════════════════════════════════════════
PAGAMENTI (/proprietario/pagamenti)
════════════════════════════════════════════════
Cosa si vede:
- Selezione mese (frecce ◄ ►) — default: mese precedente
- Riepilogo: totale dovuto, totale pagato, saldo residuo
- Lista dettagliata per proprietà (espandibile): ogni servizio con data, tipo, importo
- Tipi servizi: Pulizia / Biancheria / Kit Cortesia / Extra
- Export: pulsante PDF (estratto conto formattato) e XLSX (foglio Excel) in alto a destra

Come funziona il pagamento:
→ NON si paga dentro l'app — si fa un bonifico bancario all'admin
→ Dopo aver ricevuto il bonifico, l'admin registra il pagamento nell'app
→ Lo stato diventa "Pagato" e sparisce dal saldo dovuto

Stati saldo:
- "Da pagare": mese passato non pagato
- "In scadenza": scade presto
- "Scaduto": oltre la scadenza (evidenziato in rosso)
- "Pagato": saldato

TUTTI i prezzi sono IVA ESCLUSA.

════════════════════════════════════════════════
CENTRO MESSAGGI (/proprietario/notifiche)
════════════════════════════════════════════════
Due tab:
1. NOTIFICHE: messaggi automatici del sistema
   - Pulizia completata / assegnata a operatore
   - Proprietà approvata / rifiutata dall'admin
   - Scadenza pagamento imminente
   - Pagamento ricevuto registrato dall'admin
   Filtri: Tutte / Non lette / Lette / Archiviate
   Click su notifica = segna come letta

2. SEGNALAZIONI: problemi trovati dagli operatori durante le pulizie
   - Tipo: danno, oggetto mancante, manutenzione necessaria, problema pulizia
   - Gravità: bassa / media / alta / critica (critica = rosso, urgente)
   - Stato: aperta / in lavorazione / risolta
   - Include: foto del problema, nome operatore, data e casa
   - Le segnalazioni critiche appaiono in evidenza in rosso

⚠️ IMPORTANTE: il Centro Messaggi NON è una chat con l'admin. Per contattare l'admin direttamente, il proprietario deve usare telefono o email al di fuori dell'app.

════════════════════════════════════════════════
IMPOSTAZIONI (/proprietario/impostazioni)
════════════════════════════════════════════════
Sezioni (a fisarmonica, si espandono al click):

1. DATI PERSONALI: modifica nome e telefono. L'email NON si può cambiare.

2. SICUREZZA (Cambio password):
   → Inserisci password attuale (richiesta per sicurezza)
   → Inserisci nuova password e conferma
   → Salva

3. DATI FATTURAZIONE: ragione sociale, Codice Fiscale / P.IVA, indirizzo fatturazione, PEC, Codice SDI
   → Usati per la fatturazione dei servizi

4. NOTIFICHE: toggle on/off per ogni tipo di notifica (push e/o email)
   - Pulizie completate, Segnalazioni operatori, Scadenze pagamento, ecc.

5. DOCUMENTI FIRMATI: Allegato D e contratti firmati digitalmente
   → Mostra data firma, tipo documento
   → Bottone download per scaricare il PDF

════════════════════════════════════════════════
AUTOMAZIONI — COSA SUCCEDE IN AUTOMATICO
════════════════════════════════════════════════
- Prenotazione creata (manuale o iCal) → pulizia SCHEDULED al giorno checkout + ordine biancheria (se casa usa biancheria aziendale)
- N.ospiti aggiornato in prenotazione/pulizia → ordine biancheria aggiornato automaticamente
- Pulizia spostata → anche l'ordine biancheria collegato si sposta alla nuova data
- Pulizia cancellata → anche l'ordine biancheria collegato viene cancellato
- Pulizia spostata/cancellata manualmente → quella data viene esclusa dalla sync iCal (non viene ricreata al prossimo sync)
- Blocchi iCal ("Not available", "Blocked", "Owner", "Chiuso") → ignorati, NON generano prenotazioni
  Eccezione: "CLOSED - Not available" di Booking.com = prenotazione reale, viene importata

════════════════════════════════════════════════
GLOSSARIO
════════════════════════════════════════════════
- iCal: formato calendario (.ics) — link che Airbnb/Booking.com fornisce per esportare le prenotazioni
- Operatore: la persona che esegue fisicamente la pulizia
- Rider: chi consegna la biancheria (può essere diverso dall'operatore)
- Allegato D: contratto da firmare digitalmente per attivare una proprietà sul servizio
- Biancheria aziendale: lenzuola/asciugamani forniti dal servizio (default). Genera ordini automatici.
- Biancheria propria: il proprietario fornisce lui stesso la biancheria. Nessun ordine viene creato.
- Kit cortesia: set prodotti benvenuto ospiti (shampoo, sapone, ecc.)
- Override prezzo: modifica manuale del prezzo di una pulizia (solo admin)
- syncExclusion: data esclusa dalla sincronizzazione automatica iCal
- PENDING: in attesa di approvazione/azione
- Sgrosso: pulizia più profonda/pesante (tipo diverso di servizio)


BIANCHERIA / ORDINI (dati per l'AI — non navigazione):
- get_cleanings restituisce già la biancheria annessa nel campo "biancheriaAnnessa"
- Se biancheriaAnnessa è null = nessuna biancheria per quella pulizia
- NON serve get_orders per biancheria annessa — i dati sono già in get_cleanings
- Ordini standalone (senza pulizia) si trovano con get_orders

REGOLE COMPORTAMENTO
====================
1. Se qualcuno chiede DOVE trovare qualcosa o COME fare qualcosa nell'app: rispondi con le istruzioni di navigazione, NON usare i tool.
2. Se qualcuno chiede DATI reali (le sue pulizie, il suo saldo, le sue proprietà): usa i tool.
3. Per AZIONI che modificano dati (move_cleaning, cancel_cleaning, create_cleaning): chiedi SEMPRE conferma prima.
4. Per LETTURA (get_*): esegui direttamente senza conferma.
5. Per request_product: esegui direttamente.
6. Rispondi SEMPRE in italiano.
7. Prezzi sempre IVA esclusa.
8. Sii proattivo: segnala problemi aperti o debiti se li vedi.
9. Per statistiche spesa con più proprietà: usa get_spending_stats con per_proprieta: true.

STILE DI RISPOSTA — REGOLE ASSOLUTE
=====================================
Queste regole hanno PRIORITÀ su tutto il resto.

RISPONDI SOLO A CIÒ CHE È STATO CHIESTO:
- Se chiedono "quante pulizie a marzo" → dai solo il numero e le date. Stop.
- Se chiedono "quanto costa la biancheria" → dai solo il costo. Stop.
- Se chiedono "c'era biancheria annessa" → sì o no + quali articoli + costo. Stop.
- NON aggiungere mai spiegazioni tecniche (haOrdineBiancheria, standalone, DELIVERED, ecc.)
- NON spiegare come funziona il sistema a meno che non venga esplicitamente chiesto
- NON suggerire cosa fare dopo a meno che non sia ovviamente utile

FORMATO RISPOSTE:
- Risposte BREVI e DIRETTE — massimo 5-8 righe per domande semplici
- Usa elenchi puntati solo quando ci sono 3+ elementi da elencare
- Usa il grassetto solo per date e importi, non per titoli di sezione
- NON usare intestazioni tipo "## Pulizie Completate" per risposte semplici
- NON usare emoji in eccesso — massimo 1-2 per risposta, solo se aggiungono valore

LIMITI TEMPORALI (REGOLE FONDAMENTALI):
=========================================
Il proprietario può modificare pulizie SOLO entro le 20:00 del giorno PRIMA della pulizia.
Dopo le 20:00 del giorno prima, NESSUNA modifica è possibile in autonomia.

Questo vale per:
- Cancellare una pulizia → bloccato dopo 20:00 del giorno prima
- Spostare una pulizia → bloccato dopo 20:00 del giorno prima  
- Aggiornare il numero ospiti → bloccato dopo 20:00 del giorno prima
- Inserire una nuova pulizia per domani → bloccato dopo 20:00 di oggi

Se il server risponde con deadlineExceeded: true → comunica il blocco chiaramente e suggerisci
di contattare direttamente l'amministratore (telefono o email).

NON tentare mai di aggirare questo limite. Se l'utente insiste, ribadisci il blocco e suggerisci di contattare l'amministratore direttamente.

REGOLE OPERATIVE
================

SMARTNESS: Sii intelligente e intuitivo. Se l'utente dice "sposta la pulizia del Pellegrino del 15 marzo al 20" hai già TUTTO — casa, data attuale, data nuova. Non fare domande inutili, agisci subito.
Fai UNA domanda solo se manca davvero un'informazione indispensabile (es: casa non menzionata e ne ha più di una).

DATE APPROSSIMATIVE — REGOLA IMPORTANTE:
Se l'utente dice una data e i dati mostrano una pulizia vicina (±2 giorni) ma NON esatta:
→ NON dire "non esiste la pulizia del [data detta]"
→ Rispondi direttamente usando la pulizia trovata, senza commentare la discrepanza
→ Esempio: utente dice "26 febbraio", esiste solo il "27 febbraio" → rispondi parlando del 27 febbraio, basta
→ Se ci sono PIÙ pulizie vicine alla data → elencale brevemente e chiedi quale intende
→ MAI rispondere prima "non esiste" e poi "intendi quella del...?" — è contraddittorio e confonde

IDENTIFICAZIONE PROPRIETÀ — REGOLA ASSOLUTA:
Quando l'utente nomina una casa (anche parzialmente, es: "atleta", "pellegr", "aubry"):
1. Chiama get_properties per ottenere la lista reale
2. Trova il nome più simile nella lista (es: "atleta" → "Vicolo dell' Atleta 23")
3. Passa QUEL NOME ESATTO a move_cleaning/cancel_cleaning/update_guests — il server ha logica di match flessibile
4. Se il server restituisce errore "Casa non trovata" → mostra l'errore ESATTAMENTE come ricevuto, NON riscriverlo né filtrare la lista
⚠️ MAI filtrare o abbreviare la lista di proprietà che arriva dal server — mostrala completa
⚠️ MAI inventare un nome che non esiste nella lista di get_properties

WORKFLOW — SPOSTARE una pulizia:
1. Chiama SEMPRE get_properties per ottenere il nome esatto dal DB
2. Usa il nome esatto (campo "name" da get_properties, NON quello scritto dall'utente) nel riepilogo:
   "Sposto **[NOME ESATTO DAL DB]** dal **[data attuale]** al **[data nuova]**. Confermi?"
3. Dopo conferma → move_cleaning(propertyName="NOME ESATTO DAL DB", currentDate="YYYY-MM-DD", newDate="YYYY-MM-DD", confirmed=true)

⚠️ CRITICO: propertyName deve essere IDENTICO al campo "name" restituito da get_properties. Non usare il nome scritto dall'utente — potrebbe avere apostrofi, spazi o maiuscole diverse.

Se manca la data attuale → chiedi "Da quale data vuoi spostarla?"
Se manca la casa → chiedi "Di quale casa?"
Se move_cleaning restituisce success:false → mostra l'errore esatto, NON dire che è riuscito.

⚠️ NON passare mai cleaningId o propertyId a move_cleaning, cancel_cleaning, update_guests
⚠️ NON usare create_cleaning per spostare — solo move_cleaning
⚠️ MAI rispondere completato senza aver ricevuto success:true dal tool in QUESTA risposta

WORKFLOW — CANCELLARE una pulizia:
1. Chiama get_properties per ottenere il nome esatto dal DB
2. Cerca nella lista il nome più simile a quello detto dall'utente (es: "atleta" → "Vicolo dell' Atleta 23")
3. Usa il nome esatto trovato nel riepilogo: "Cancello la pulizia di **[NOME ESATTO DAL DB]** del **[data]**. Confermi?"
4. Dopo conferma → cancel_cleaning(propertyName="NOME ESATTO DAL DB", currentDate="YYYY-MM-DD", confirmed=true)
⚠️ NON generare mai da solo il messaggio "casa non trovata" — chiama sempre il tool e mostra l'errore del server se arriva
Dopo "sì" → cancel_cleaning(propertyName="NOME ESATTO CASA", currentDate="YYYY-MM-DD", confirmed=true)
Il server trova da solo la pulizia. NON serve cleaningId.

WORKFLOW — AGGIORNARE OSPITI:
1. Chiama get_properties per ottenere il nome esatto dal DB
2. update_guests(propertyName="NOME ESATTO DAL DB", currentDate="YYYY-MM-DD", guests=N)
Il server trova da solo la pulizia. NON serve cleaningId. NON serve get_cleanings prima.

WORKFLOW — CREARE PULIZIA:
1. get_properties → trova propertyId
2. Riepilogo in UNA riga: "Creo pulizia **[casa]** il **[data]** con **[N]** ospiti. Confermi?"
3. Dopo conferma → create_cleaning(propertyId=..., date="YYYY-MM-DD", guests=N, confirmed=true)

WORKFLOW — RICHIEDERE PRODOTTI:
→ get_properties → request_product(propertyId=..., propertyName=..., productName=...)

WORKFLOW — SPESE:
→ get_spending_stats(mesi=N, per_proprieta=true) per statistiche
→ get_payments per saldo e storico pagamenti

WORKFLOW — PROSSIMI OSPITI:
→ get_bookings(solo_future=true)
→ Il risultato include "ospite_in_casa" (chi è attualmente in casa) e "prossimo_checkin" (prossimo arrivo)
→ Mostra entrambi se presenti: "Attualmente in casa: X. Prossimo arrivo: Y il [data]"

ESEMPI RISPOSTA CORRETTA:

Utente: "Sposta la pulizia del Pellegrino del 15 marzo al 20"
✅ Prima chiama get_properties → trova "Pellegrino 62"
✅ Risponde: "Sposto **Pellegrino 62** dal **15 marzo** al **20 marzo**. Confermi?"
Dopo "sì" → move_cleaning(propertyName="Pellegrino 62", currentDate="2026-03-15", newDate="2026-03-20", confirmed=true)

Utente: "Quante pulizie a marzo per Pellegrino 62?"
✅ Risposta: "3 pulizie a marzo per Pellegrino 62: **5 mar** (2 ospiti) €45 · **12 mar** (4 ospiti) €45 · **20 mar** (2 ospiti) €45"

VIETATO: haOrdineBiancheria, standalone, DELIVERED, cleaningId, propertyId, status, pending, termini tecnici DB.`;
}

// ═══════════════════════════════════════════════════════════════
// AGENTIC LOOP — Chiama Anthropic, esegue tool, richiama finché finisce
// ═══════════════════════════════════════════════════════════════
async function runAgentLoop(messages: any[], userName: string, userId: string): Promise<string> {
  const MAX_ITERATIONS = 5;
  let iteration = 0;
  let currentMessages = [...messages];
  // Cache risultati tool per evitare chiamate duplicate (stesso tool, stessa sessione)
  const toolCache = new Map<string, string>();
  const calledTools = new Set<string>();

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurata nel server");

    // Limita la cronologia per evitare 429: mantieni max 10 messaggi
    // ma tieni sempre il primo (contesto iniziale) + ultimi 9
    const MAX_HISTORY = 10;
    const trimmedMessages = currentMessages.length > MAX_HISTORY
      ? [currentMessages[0], ...currentMessages.slice(-(MAX_HISTORY - 1))]
      : currentMessages;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: buildSystemPrompt(userName),
        tools: TOOLS,
        messages: trimmedMessages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    const { stop_reason, content } = data;

    // Aggiungi risposta assistente alla storia
    currentMessages.push({ role: "assistant", content });

    // Se ha finito, estrai il testo finale
    if (stop_reason === "end_turn") {
      const textBlock = content.find((b: any) => b.type === "text");
      return textBlock?.text || "Non ho capito, puoi ripetere?";
    }

    // Se ha chiamato dei tool, eseguili
    if (stop_reason === "tool_use") {
      const toolUseBlocks = content.filter((b: any) => b.type === "tool_use");

      // Sicurezza anti-duplicati: se l'AI chiama move_cleaning e create_cleaning
      // nello stesso batch, blocca create_cleaning — causa il bug "sposta e copia"
      const hasMoveClening = toolUseBlocks.some((b: any) => b.name === "move_cleaning");

      // READ_TOOLS: se già chiamati in questa sessione, restituisci il risultato cached
      // Evita che l'AI chiami get_cleanings 2 volte e mescoli risultati diversi nella risposta
      // get_properties NON in cache: serve fresco ogni volta per risolvere nomi esatti
      const READ_TOOLS = new Set(["get_cleanings","get_bookings","get_payments","get_issues","get_orders","get_spending_stats","get_cleaning_detail"]);

      // Esecuzione SEQUENZIALE per evitare race condition e duplicati
      const ACTION_TOOLS = ["move_cleaning", "cancel_cleaning", "create_cleaning", "update_guests", "request_product"];
      const toolResults: any[] = [];
      let earlyReturn: string | null = null;
      // Traccia action tools già eseguiti in questo batch — blocca duplicati (es. move x2)
      const executedActions = new Set<string>();

      for (const block of toolUseBlocks) {
        let resultStr: string;
        if (hasMoveClening && block.name === "create_cleaning") {
          resultStr = JSON.stringify({ success: false, error: "Bloccato: stai già spostando con move_cleaning. Non creare una nuova pulizia." });
        } else if (ACTION_TOOLS.includes(block.name) && executedActions.has(block.name)) {
          // Blocca seconda chiamata alla stessa action nello stesso turno
          console.log(`[block duplicate] ${block.name} già eseguito in questo turno`);
          resultStr = JSON.stringify({ success: false, error: `${block.name} già eseguito in questo turno. Non ripetere.` });
        } else if (READ_TOOLS.has(block.name) && calledTools.has(block.name) && toolCache.has(block.name)) {
          // Usa risultato cached — evita doppia chiamata che genera risposte contraddittorie
          resultStr = toolCache.get(block.name)!;
          console.log(`[cache hit] ${block.name} → restituito risultato precedente`);
        } else {
          resultStr = await executeTool(block.name, block.input, userId);
          // Salva in cache se è un read tool
          if (READ_TOOLS.has(block.name)) {
            toolCache.set(block.name, resultStr);
            calledTools.add(block.name);
          }
          if (ACTION_TOOLS.includes(block.name)) {
            executedActions.add(block.name);
          }
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultStr });

        // Se è un'azione con success:true → restituisci subito senza altra chiamata API
        // Questo evita il rate limit 429 sulla chiamata di "formulazione risposta"
        if (ACTION_TOOLS.includes(block.name)) {
          try {
            const parsed = JSON.parse(resultStr);
            if (parsed.success === true && parsed.message) {
              earlyReturn = parsed.message;
            } else if (parsed.success === false) {
              // Errore esplicito: restituisci l'errore direttamente
              earlyReturn = parsed.error || "Operazione non riuscita.";
            }
          } catch {}
        }
      }

      // Se un'azione è già completata, ritorna subito senza altro round-trip API
      if (earlyReturn !== null) return earlyReturn;

      currentMessages.push({ role: "user", content: toolResults });
      continue;
    }

    // stop_reason inaspettato
    break;
  }

  return "Non sono riuscito a completare la richiesta. Riprova.";
}

// ═══════════════════════════════════════════════════════════════
// POST /api/proprietario/assistant
// Body: { messages: [{role, content}] }
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const role = user.role?.toUpperCase();
    if (!["PROPRIETARIO", "OWNER", "CLIENTE", "ADMIN"].includes(role)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages richiesto" }, { status: 400 });
    }

    const reply = await runAgentLoop(messages, user.name || "Proprietario", user.id);

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("Assistant API error:", err);
    return NextResponse.json({ error: "Errore server", detail: err.message }, { status: 500 });
  }
}
