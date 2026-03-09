import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════
// TOOLS DISPONIBILI — L'AI può chiamarli per leggere o agire
// ═══════════════════════════════════════════════════════════════
const TOOLS = [
  {
    name: "get_cleanings",
    description: "Recupera le pulizie del proprietario. Filtra per stato, mese, anno o proprietà specifica. Usalo quando l'utente chiede informazioni su pulizie, calendario, prossimi appuntamenti.",
    input_schema: {
      type: "object",
      properties: {
        stato: { type: "string", enum: ["SCHEDULED","ASSIGNED","IN_PROGRESS","COMPLETED","CANCELLED","all"], description: "Filtro stato pulizia" },
        limite: { type: "number", description: "Numero max di risultati (default 10)" },
        prossime: { type: "boolean", description: "Se true, mostra solo le pulizie future" }
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
    description: "Sposta una pulizia a una nuova data. RICHIEDE CONFERMA ESPLICITA dall'utente prima di eseguire. Usalo solo quando l'utente ha già confermato esplicitamente di voler spostare.",
    input_schema: {
      type: "object",
      properties: {
        cleaningId: { type: "string", description: "ID della pulizia da spostare" },
        newDate: { type: "string", description: "Nuova data nel formato YYYY-MM-DD" },
        reason: { type: "string", description: "Motivo dello spostamento" }
      },
      required: ["cleaningId", "newDate"]
    }
  },
  {
    name: "cancel_cleaning",
    description: "Cancella una pulizia. RICHIEDE CONFERMA ESPLICITA. Usalo solo dopo che l'utente ha esplicitamente confermato la cancellazione.",
    input_schema: {
      type: "object",
      properties: {
        cleaningId: { type: "string", description: "ID della pulizia da cancellare" },
        reason: { type: "string", description: "Motivo della cancellazione" }
      },
      required: ["cleaningId"]
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
    description: "Aggiorna il numero di ospiti per una pulizia specifica. Usalo quando l'utente vuole cambiare il numero di ospiti.",
    input_schema: {
      type: "object",
      properties: {
        cleaningId: { type: "string", description: "ID della pulizia" },
        guests: { type: "number", description: "Nuovo numero di ospiti" }
      },
      required: ["cleaningId", "guests"]
    }
  },
  {
    name: "create_cleaning",
    description: "Crea una nuova pulizia straordinaria per una proprietà del proprietario. RICHIEDE CONFERMA ESPLICITA prima di eseguire. Chiedi sempre: proprietà, data, numero ospiti. Usalo quando l'utente vuole aggiungere/prenotare/inserire una nuova pulizia.",
    input_schema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "ID della proprietà" },
        propertyName: { type: "string", description: "Nome della proprietà (per conferma)" },
        date: { type: "string", description: "Data della pulizia in formato YYYY-MM-DD" },
        time: { type: "string", description: "Orario preferito es. '10:00' (opzionale, default 10:00)" },
        guests: { type: "number", description: "Numero di ospiti" },
        notes: { type: "string", description: "Note aggiuntive per l'operatore (opzionale)" }
      },
      required: ["propertyId", "date", "guests"]
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
        limite: { type: "number", description: "Numero max di risultati (default 8)" }
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

  let q: any = adminDb.collection("cleanings").where("propertyId", "in", propertyIds);

  const cleaningsSnap = await q.get();
  let cleanings = cleaningsSnap.docs.map((d: any) => {
    const data = d.data();
    const prop = properties.find((p: any) => p.id === data.propertyId);
    const date = data.scheduledDate?.toDate?.() || null;
    return {
      id: d.id,
      propertyName: prop?.name || data.propertyName || "Casa sconosciuta",
      propertyId: data.propertyId,
      date: date ? date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Data sconosciuta",
      dateISO: date ? date.toISOString().split("T")[0] : null,
      time: data.scheduledTime || null,
      status: data.status || "SCHEDULED",
      guests: data.guestCount || data.guests || 0,
      operatorName: data.operatorName || data.operators?.[0]?.name || null,
      price: data.priceOverride ?? data.price ?? null,
    };
  });

  const nowISO = new Date().toISOString().split("T")[0];

  if (input.stato && input.stato !== "all") {
    cleanings = cleanings.filter((c: any) => c.status === input.stato);
  }
  if (input.prossime) {
    cleanings = cleanings.filter((c: any) => c.dateISO && c.dateISO >= nowISO);
  }

  cleanings.sort((a: any, b: any) => {
    if (!a.dateISO) return 1;
    if (!b.dateISO) return -1;
    return a.dateISO.localeCompare(b.dateISO);
  });

  const limite = input.limite || 8;
  return { cleanings: cleanings.slice(0, limite), total: cleanings.length };
}

async function toolGetPayments(userId: string) {
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).where("status", "==", "ACTIVE").get();
  const propertyIds = propsSnap.docs.map((d: any) => d.id);

  if (propertyIds.length === 0) return { totaleDaPagare: 0, arretrati: [], meseCorrente: null };

  // Pagamenti registrati
  const paymentsSnap = await adminDb.collection("payments").where("proprietarioId", "==", userId).get();
  const totalePagato = paymentsSnap.docs.reduce((s: number, d: any) => s + (d.data().amount || 0), 0);

  // Pulizie completate
  const cleaningsSnap = await adminDb.collection("cleanings")
    .where("propertyId", "in", propertyIds)
    .where("status", "==", "COMPLETED")
    .get();
  const totalePulizie = cleaningsSnap.docs.reduce((s: number, d: any) => {
    const data = d.data();
    return s + (data.priceOverride ?? data.price ?? 0);
  }, 0);

  // Ordini biancheria consegnati (DELIVERED)
  const ordersSnap = await adminDb.collection("orders")
    .where("propertyId", "in", propertyIds)
    .where("status", "==", "DELIVERED")
    .get();

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

  return {
    totaleDaPagare: Math.round(saldo * 100) / 100,
    totaleServizi: Math.round(totaleServizi * 100) / 100,
    totalePulizie: Math.round(totalePulizie * 100) / 100,
    totaleOrdini: Math.round(totaleOrdini * 100) / 100,
    totalePagato: Math.round(totalePagato * 100) / 100,
    stato: saldo <= 0 ? "In regola ✅" : saldo < 100 ? "Piccolo saldo in sospeso" : "Saldo da saldare ⚠️",
    messaggioUmano: saldo <= 0
      ? "Sei in regola con i pagamenti!"
      : `Hai un saldo in sospeso di €${saldo.toFixed(2)} (IVA esclusa).`,
    nota: "IVA esclusa",
  };
}

async function toolGetProperties(userId: string) {
  const snap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
  return snap.docs.map((d: any) => {
    const data = d.data() as any;
    return {
      id: d.id,
      name: data.name || "Casa senza nome",
      address: data.address || null,
      status: data.status || "ACTIVE",
      maxGuests: data.maxGuests || null,
      cleaningPrice: data.cleaningPrice || null,
    };
  });
}

async function toolMoveClening(userId: string, input: any) {
  // Verifica ownership
  const cleaningRef = adminDb.collection("cleanings").doc(input.cleaningId);
  const cleaningSnap = await cleaningRef.get();
  if (!cleaningSnap.exists) return { success: false, error: "Pulizia non trovata" };

  const cleaning = cleaningSnap.data() as any;

  // Verifica che la proprietà appartenga al proprietario
  const propSnap = await adminDb.collection("properties").doc(cleaning.propertyId).get();
  const prop = propSnap.data() as any;
  if (prop?.ownerId !== userId) return { success: false, error: "Non sei il proprietario di questa pulizia" };

  if (["COMPLETED", "CANCELLED"].includes(cleaning.status)) {
    return { success: false, error: "Non puoi spostare una pulizia già completata o cancellata" };
  }

  const newDateObj = new Date(input.newDate);
  newDateObj.setHours(12, 0, 0, 0);

  await cleaningRef.update({
    scheduledDate: Timestamp.fromDate(newDateObj),
    movedAt: Timestamp.now(),
    movedBy: userId,
    moveReason: input.reason || "Richiesta proprietario via assistente",
    manuallyModified: true,
    updatedAt: Timestamp.now(),
  });

  return {
    success: true,
    message: `Pulizia di "${prop?.name || "casa"}" spostata al ${newDateObj.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}`
  };
}

async function toolCancelCleaning(userId: string, input: any) {
  const cleaningRef = adminDb.collection("cleanings").doc(input.cleaningId);
  const cleaningSnap = await cleaningRef.get();
  if (!cleaningSnap.exists) return { success: false, error: "Pulizia non trovata" };

  const cleaning = cleaningSnap.data() as any;

  const propSnap = await adminDb.collection("properties").doc(cleaning.propertyId).get();
  const prop = propSnap.data() as any;
  if (prop?.ownerId !== userId) return { success: false, error: "Non sei il proprietario" };

  if (["COMPLETED", "CANCELLED"].includes(cleaning.status)) {
    return { success: false, error: "Pulizia già completata o cancellata" };
  }

  await cleaningRef.update({
    status: "CANCELLED",
    cancelledAt: Timestamp.now(),
    cancelledBy: userId,
    cancelReason: input.reason || "Cancellata via assistente",
    updatedAt: Timestamp.now(),
  });

  return { success: true, message: `Pulizia cancellata con successo.` };
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
  const cleaningRef = adminDb.collection("cleanings").doc(input.cleaningId);
  const cleaningSnap = await cleaningRef.get();
  if (!cleaningSnap.exists) return { success: false, error: "Pulizia non trovata" };

  const cleaning = cleaningSnap.data() as any;
  const propSnap = await adminDb.collection("properties").doc(cleaning.propertyId).get();
  const prop = propSnap.data() as any;
  if (prop?.ownerId !== userId) return { success: false, error: "Non sei il proprietario" };

  await cleaningRef.update({
    guestCount: input.guests,
    guests: input.guests,
    guestsConfirmed: true,
    updatedAt: Timestamp.now(),
  });

  return { success: true, message: `Numero ospiti aggiornato a ${input.guests}.` };
}

async function toolCreateCleaning(userId: string, input: any) {
  // Verifica ownership della proprietà
  const propRef = adminDb.collection("properties").doc(input.propertyId);
  const propSnap = await propRef.get();
  if (!propSnap.exists) return { success: false, error: "Proprietà non trovata" };

  const prop = propSnap.data() as any;
  if (prop.ownerId !== userId) return { success: false, error: "Non sei il proprietario di questa proprietà" };

  const dateObj = new Date(input.date);
  dateObj.setHours(12, 0, 0, 0);

  // Non permettere date nel passato
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dateObj < today) {
    return { success: false, error: "Non puoi inserire una pulizia in una data passata" };
  }

  const now = Timestamp.now();
  const cleaningRef = await adminDb.collection("cleanings").add({
    propertyId: input.propertyId,
    propertyName: prop.name || input.propertyName || "",
    propertyAddress: prop.address || "",
    ownerId: userId,
    scheduledDate: Timestamp.fromDate(dateObj),
    scheduledTime: input.time || "10:00",
    guestCount: input.guests || 0,
    guestsCount: input.guests || 0,
    guestsConfirmed: true,
    status: "SCHEDULED",
    type: "STANDARD",
    notes: input.notes || "",
    price: prop.cleaningPrice || 0,
    source: "assistant",
    manuallyCreated: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  const dateFormatted = dateObj.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return {
    success: true,
    cleaningId: cleaningRef.id,
    message: `✅ Pulizia inserita per "${prop.name}" il ${dateFormatted} alle ${input.time || "10:00"} (${input.guests} ospiti). L'amministratore la vedrà e assegnerà un operatore.`
  };
}

async function toolGetBookings(userId: string, input: any) {
  const propsSnap = await adminDb.collection("properties").where("ownerId", "==", userId).get();
  const properties = propsSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  const propertyIds = properties.map((p: any) => p.id);
  if (propertyIds.length === 0) return { bookings: [], total: 0 };

  let q: any = adminDb.collection("bookings").where("propertyId", "in", propertyIds);
  const snap = await q.get();

  let bookings = snap.docs.map((d: any) => {
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
      checkIn: checkIn ? checkIn.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long" }) : "N/D",
      checkInISO: checkIn ? checkIn.toISOString().split("T")[0] : null,
      checkOut: checkOut ? checkOut.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long" }) : "N/D",
      checkOutISO: checkOut ? checkOut.toISOString().split("T")[0] : null,
      nights,
      guests: data.guests || data.guestsCount || data.adults || 0,
      status: data.status || "CONFIRMED",
      source: data.bookingSource || data.source || "manuale",
    };
  });

  const nowISO = new Date().toISOString().split("T")[0];
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

  const limite = input.limite || 8;
  const result = bookings.slice(0, limite);

  // Prossimo check-in
  const prossimo = result.find((b: any) => b.checkInISO && b.checkInISO >= nowISO);

  return {
    bookings: result,
    total: bookings.length,
    prossimo_checkin: prossimo ? `${prossimo.guestName} in ${prossimo.propertyName} il ${prossimo.checkIn}` : null,
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
    const allSnap = await adminDb.collection("cleanings")
      .where("propertyId", "in", propertyIds)
      .get();
    const completed = allSnap.docs
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
    stato: cleaningData.status,
    operatore: cleaningData.operatorName || cleaningData.operators?.[0]?.name || "Non assegnato",
    ospiti: cleaningData.guestCount || cleaningData.guestsCount || 0,
    noteOperatore: cleaningData.operatorNotes || cleaningData.notes || null,
    noteAmministratore: cleaningData.adminNotes || null,
    durata,
    orarioInizio: startedAt ? startedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : null,
    orarioFine: completedAt ? completedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : null,
    fotografie: Array.isArray(cleaningData.photos) ? cleaningData.photos.length : 0,
    valutazione: cleaningData.ratingScores
      ? Object.values(cleaningData.ratingScores as Record<string, number>).reduce((s: number, v: number) => s + v, 0) /
        Object.values(cleaningData.ratingScores as Record<string, number>).length
      : null,
    valutazioneNota: cleaningData.ratingNotes || null,
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
  const dalTimestamp = new Date(now.getFullYear(), now.getMonth() - (mesi - 1), 1);

  // Pulizie completate — filtra in memoria per data
  const cleaningsSnap = await adminDb.collection("cleanings")
    .where("propertyId", "in", propertyIds)
    .where("status", "==", "COMPLETED")
    .get();

  // Ordini consegnati — filtra in memoria per data
  const ordersSnap = await adminDb.collection("orders")
    .where("propertyId", "in", propertyIds)
    .where("status", "==", "DELIVERED")
    .get();

  // Inventory per prezzi ordini
  const invSnap = await adminDb.collection("inventory").get();
  const invById = new Map(invSnap.docs.map((d: any) => [d.id, d.data() as any]));

  // Aggrega per mese e per proprietà
  const MONTHS = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
  const byMonth: Record<string, number> = {};
  const byProperty: Record<string, { name: string; totale: number; pulizie: number }> = {};

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
      if (!byProperty[prop.id]) byProperty[prop.id] = { name: prop.name, totale: 0, pulizie: 0 };
      byProperty[prop.id].totale += price;
      byProperty[prop.id].pulizie += 1;
    }
    totale += price;
    totalePulizie += price;
  });

  ordersSnap.docs.forEach((d: any) => {
    const data = d.data();
    const date = data.scheduledDate?.toDate?.() || data.deliveredAt?.toDate?.();
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
      if (!byProperty[prop.id]) byProperty[prop.id] = { name: prop.name, totale: 0, pulizie: 0 };
      byProperty[prop.id].totale += effective;
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
      pulizie: p.pulizie,
    }));
    result.proprietaPiuCostosa = propMax ? `${propMax.name} (€${propMax.totale.toFixed(2)})` : null;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// ESEGUI TOOL — dispatch
// ═══════════════════════════════════════════════════════════════
async function executeTool(name: string, input: any, userId: string): Promise<string> {
  try {
    let result: any;
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
      default: result = { error: "Tool non riconosciuto" };
    }
    return JSON.stringify(result);
  } catch (err: any) {
    return JSON.stringify({ error: err.message || "Errore esecuzione tool" });
  }
}

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════
function buildSystemPrompt(userName: string): string {
  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `Sei l'assistente virtuale di CleaningApp per il proprietario ${userName}.

Oggi è ${today}.

Sei esperto di gestione pulizie case vacanza. Aiuti il proprietario a:
- Consultare pulizie, prenotazioni, pagamenti, proprietà
- Vedere segnalazioni/problemi aperti sulle sue case
- Dettagli e note delle pulizie completate
- Statistiche di spesa per periodo e per proprietà
- Inserire, spostare o cancellare pulizie
- Richiedere prodotti e materiali
- Aggiornare il numero di ospiti

REGOLE IMPORTANTI:
1. Per AZIONI che modificano dati (move_cleaning, cancel_cleaning, create_cleaning), chiedi SEMPRE conferma esplicita prima di eseguire.
2. Per create_cleaning, se mancano informazioni chiave (proprietà, data, ospiti), chiedi prima di procedere. Se il proprietario ha una sola proprietà, usala direttamente chiedendo conferma.
3. Per azioni di LETTURA (get_*) esegui direttamente senza chiedere conferma.
4. Per request_product esegui direttamente, è una richiesta innocua.
5. Rispondi SEMPRE in italiano, in modo conciso e friendly.
6. I prezzi sono sempre IVA esclusa.
7. Se non sai qualcosa, dillo chiaramente invece di inventare.
8. Quando mostri date e prezzi, formattali in modo leggibile.
9. Sii proattivo: se vedi problemi aperti o debiti, segnalalo.
10. Per le statistiche di spesa, usa get_spending_stats con per_proprieta: true se ha più proprietà.`;
}

// ═══════════════════════════════════════════════════════════════
// AGENTIC LOOP — Chiama Anthropic, esegue tool, richiama finché finisce
// ═══════════════════════════════════════════════════════════════
async function runAgentLoop(messages: any[], userName: string, userId: string): Promise<string> {
  const MAX_ITERATIONS = 5;
  let iteration = 0;
  let currentMessages = [...messages];

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: buildSystemPrompt(userName),
        tools: TOOLS,
        messages: currentMessages,
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
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block: any) => ({
          type: "tool_result",
          tool_use_id: block.id,
          content: await executeTool(block.name, block.input, userId),
        }))
      );
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
