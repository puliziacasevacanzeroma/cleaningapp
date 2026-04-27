import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { resend, isResendConfigured, FROM_EMAIL } from "~/lib/email/config";
import { monthlyReportEmail, type MonthlyReportEmailParams } from "~/lib/email/monthlyReport";
import { generateMonthlyReportPdf, type CleaningForPdf, type LaundryItemForPdf, type PropertyForPdf } from "~/lib/email/monthlyReportPdf";
import { resolveItemDisplayName } from "~/lib/itemNames";

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/test-monthly-email
 * 
 * Test completo: cerca cliente per email, calcola dati mensili, invia email.
 * 
 * Query params:
 * - email    = email del destinatario (richiesto, es. damianiariele@gmail.com)
 * - month    = mese (1-12, default: mese corrente)
 * - year     = anno (default: anno corrente)
 * - preview  = 'true' → solo HTML nel browser, NON invia (default: 'false' = invia)
 * 
 * Esempio — solo anteprima browser:
 *   /api/debug/test-monthly-email?email=damianiariele@gmail.com&month=4&year=2026&preview=true
 * 
 * Esempio — invia davvero:
 *   /api/debug/test-monthly-email?email=damianiariele@gmail.com&month=4&year=2026
 */
export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email');
    const monthStr = req.nextUrl.searchParams.get('month');
    const yearStr = req.nextUrl.searchParams.get('year');
    const preview = req.nextUrl.searchParams.get('preview') === 'true';
    const diag = req.nextUrl.searchParams.get('diag') === 'true';
    const pdfOnly = req.nextUrl.searchParams.get('pdf') === 'true';

    if (!email) {
      return NextResponse.json({
        error: "Parametro richiesto: email",
        example: "/api/debug/test-monthly-email?email=damianiariele@gmail.com&month=4&year=2026",
      }, { status: 400 });
    }

    const now = new Date();
    let month: number;
    let year: number;
    if (monthStr && yearStr) {
      // Modalità test: mese/anno espliciti
      month = parseInt(monthStr, 10);
      year = parseInt(yearStr, 10);
    } else {
      // Modalità cron: calcolo automatico del mese precedente
      // Es: oggi è 1° maggio 2026 → mese=4 (aprile), anno=2026
      // Es: oggi è 1° gennaio 2027 → mese=12 (dicembre), anno=2026
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      month = prevMonth.getMonth() + 1;
      year = prevMonth.getFullYear();
    }

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: "month deve essere 1-12, year 2020-2100" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Cerco utente per email
    const userQuery = await adminDb.collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();
    
    if (userQuery.empty) {
      return NextResponse.json({
        error: `Nessun utente trovato con email ${normalizedEmail}`,
        suggestion: "Verifica che l'email esista in users/email su Firestore",
      }, { status: 404 });
    }

    const userDoc = userQuery.docs[0]!;
    const clientId = userDoc.id;
    const owner = userDoc.data();
    const clientName = owner.displayName || owner.name || owner.email || "Cliente";

    // 2. Trovo proprietà ACTIVE del cliente (filtro identico a check-payment-blocks)
    const propsSnap = await adminDb.collection("properties")
      .where("ownerId", "==", clientId)
      .where("status", "==", "ACTIVE")
      .get();
    const propertyIds: string[] = propsSnap.docs.map((d: any) => d.id);

    if (propertyIds.length === 0) {
      return NextResponse.json({
        error: `Cliente ${clientName} (${clientId}) non ha proprietà`,
        clientId, clientName,
        suggestion: "Prova un altro account o assicurati che esista un proprietario con quell'email",
      }, { status: 200 });
    }

    // 3. Range mese
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const startTs = Timestamp.fromDate(monthStart);
    const endTs = Timestamp.fromDate(monthEnd);

    // 3b. Carico le properties del cliente in una mappa id → { name, address, cleaningPrice }
    // Serve come fallback quando cleaning.price non è settato e per il PDF
    const propertiesById = new Map<string, { name: string; address: string; cleaningPrice: number }>();
    for (const doc of propsSnap.docs) {
      const p: any = doc.data();
      propertiesById.set(doc.id, {
        name: p.name || "Proprietà",
        address: p.address || "",
        cleaningPrice: p.cleaningPrice || 0,
      });
    }

    // Diagnostica — raccolgo dettaglio per ogni entry se diag=true
    const diagCleanings: any[] = [];
    const diagOrders: any[] = [];

    // Set delle proprietà che hanno effettivamente avuto servizi nel mese
    // (per il conteggio "immobili" mostrato nell'email)
    const propertiesWithServices = new Set<string>();

    // Strutture dati per il PDF — popolate durante i loop sotto
    // Mappa cleaningId → CleaningForPdf (ci aggiungerò biancheria/kit/extra dagli ordini)
    const cleaningsForPdfById = new Map<string, CleaningForPdf>();
    // Lista degli ordini DELIVERED senza cleaningId collegato (saranno in una "pseudo-pulizia")
    const standaloneOrdersForPdf: { propertyId: string; date: Date; cleaning: CleaningForPdf }[] = [];

    // 4. Pulizie COMPLETED del mese - e memorizzo ID per filtro ordini
    // Logica allineata a useRealtimePayments.ts riga 445-449:
    //   basePrice = cleaning.price || prop.cleaningPrice || 0
    //   effectivePrice = (cleaning.priceOverride ?? basePrice) + holidayFee
    let cleaningsTotal = 0;
    let cleaningsCount = 0;
    const propertyIdsSet = new Set(propertyIds);
    const completedCleaningIds = new Set<string>();
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();
    for (const doc of cleaningsSnap.docs) {
      const d: any = doc.data();
      if (d.status !== "COMPLETED") continue;
      if (!propertyIdsSet.has(d.propertyId)) continue;
      const prop = propertiesById.get(d.propertyId);
      const basePrice = d.price || prop?.cleaningPrice || 0;
      const holidayFee = typeof d.holidayFee === "number" ? d.holidayFee : 0;
      const effectivePrice = (typeof d.priceOverride === "number" ? d.priceOverride : basePrice) + holidayFee;
      cleaningsTotal += effectivePrice;
      cleaningsCount++;
      completedCleaningIds.add(doc.id);
      propertiesWithServices.add(d.propertyId);

      // Dati per PDF
      const cleaningDate = d.scheduledDate?.toDate?.() || new Date();
      cleaningsForPdfById.set(doc.id, {
        id: doc.id,
        date: cleaningDate,
        isSgrosso: !!(d.sgrossoReasonLabel || d.sgrossoReason),
        sgrossoReasonLabel: d.sgrossoReasonLabel || undefined,
        basePrice: typeof d.priceOverride === "number" ? d.priceOverride : basePrice,
        holidayFee,
        laundryItems: [],
        laundryTotal: 0,
        kitItems: [],
        kitTotal: 0,
        extraItems: [],
        extraTotal: 0,
        deliveryFee: 0,
        bedMakingFee: 0,
        totalFormatted: formatCurrency(effectivePrice),
        // memorizzo il propertyId qui per ora, lo uso dopo per raggruppare
        // (lo aggiungo come campo extra non in interface)
      } as CleaningForPdf & { propertyId: string });
      // Aggancio propertyId con cast (è un campo interno)
      (cleaningsForPdfById.get(doc.id) as any).propertyId = d.propertyId;
      if (diag) {
        diagCleanings.push({
          id: doc.id,
          date: d.scheduledDate?.toDate?.()?.toISOString?.() || null,
          propertyName: prop?.name || d.propertyName || "?",
          dbPrice: d.price ?? null,
          propDefault: prop?.cleaningPrice ?? null,
          basePrice,
          priceOverride: d.priceOverride ?? null,
          holidayFee,
          effectivePrice,
          linkedOrderId: d.laundryOrderId ?? null,
        });
      }
    }

    // 4b. Carico inventario con STESSA indicizzazione del hook useRealtimePayments (riga 154-161):
    //   - doc.id (es. "item_bathMats")
    //   - data.key (es. "copripiumino_matr") se presente
    //   - versione senza prefisso "item_" (es. "bathMats")
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryById = new Map<string, { name: string; sellPrice: number; categoryName: string }>();
    for (const doc of inventorySnap.docs) {
      const d: any = doc.data();
      const itemData = {
        name: d.name || "Articolo",
        sellPrice: d.sellPrice || d.price || 0,
        categoryName: d.categoryName || d.category || "Altro",
      };
      inventoryById.set(doc.id, itemData);
      if (d.key) inventoryById.set(d.key, itemData);
      if (doc.id.startsWith("item_")) inventoryById.set(doc.id.replace("item_", ""), itemData);
    }

    // 5. Ordini (collection "orders")
    // Logica identica al hook useRealtimePayments:
    //  - Filtro data: deliveredAt || scheduledDate
    //  - Filtro status: DELIVERED oppure collegato a pulizia COMPLETED
    //  - Classificazione per categoria: scandisco items[] per trovare mainCategory
    //  - Includo deliveryFee e bedMakingFee nel totale
    let laundryTotal = 0;
    let kitsTotal = 0;
    let extrasTotal = 0;
    let ordersCount = 0;
    // Range più largo per catturare ordini con scheduledDate in altri mesi ma deliveredAt nel mese target
    const ordersSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", Timestamp.fromDate(new Date(year, month - 2, 1)))
      .where("scheduledDate", "<=", Timestamp.fromDate(new Date(year, month + 1, 0, 23, 59, 59, 999)))
      .get();
    for (const doc of ordersSnap.docs) {
      const d: any = doc.data();
      if (d.status === "CANCELLED") continue;
      if (!propertyIdsSet.has(d.propertyId)) continue;
      // Data effettiva: deliveredAt ha priorità su scheduledDate
      const dateToCheck = d.deliveredAt?.toDate?.() || d.scheduledDate?.toDate?.();
      if (!dateToCheck) continue;
      if (dateToCheck < monthStart || dateToCheck > monthEnd) continue;
      // Status: DELIVERED oppure collegato a pulizia COMPLETED del mese
      const isDelivered = d.status === "DELIVERED";
      const isLinkedToCompleted = d.cleaningId && completedCleaningIds.has(d.cleaningId);
      if (!isDelivered && !isLinkedToCompleted) continue;

      // Calcolo mainCategory scandendo gli items + colleziono items per categoria (per PDF)
      let mainCategory = "Biancheria";
      let maxCategoryTotal = 0;
      const categoryTotals: { [key: string]: number } = {};
      let itemsTotal = 0;
      const laundryItemsList: LaundryItemForPdf[] = [];
      const kitItemsList: LaundryItemForPdf[] = [];
      const extraItemsList: LaundryItemForPdf[] = [];
      let laundryItemsTotal = 0;
      let kitItemsTotal = 0;
      let extraItemsTotal = 0;
      if (d.items && Array.isArray(d.items)) {
        for (const item of d.items) {
          const itemKey = item.itemId || item.id;
          const invItem = inventoryById.get(itemKey);
          const itemBasePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
          const unitPrice = item.priceOverride ?? itemBasePrice;
          const quantity = item.quantity || 1;
          const itemTotal = item.totalPrice || (unitPrice * quantity);
          if (itemTotal <= 0) continue; // skip items a zero (per PDF non li mostro)
          itemsTotal += itemTotal;
          const categoryName = item.categoryName || invItem?.categoryName || "Biancheria";
          categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + itemTotal;
          if (categoryTotals[categoryName]! > maxCategoryTotal) {
            maxCategoryTotal = categoryTotals[categoryName]!;
            mainCategory = categoryName;
          }
          // Raccolgo l'item per PDF nella sua categoria di appartenenza
          // Uso la funzione ufficiale che gestisce id tecnici (towelsLarge) → italiano (Telo Doccia)
          const itemEntry: LaundryItemForPdf = {
            name: resolveItemDisplayName(itemKey, item.name || invItem?.name),
            quantity,
            unitPrice,
            totalPrice: itemTotal,
          };
          const itemServiceType = mapCategoryToServiceType(categoryName);
          if (itemServiceType === "KIT_CORTESIA") {
            kitItemsList.push(itemEntry);
            kitItemsTotal += itemTotal;
          } else if (itemServiceType === "SERVIZI_EXTRA") {
            extraItemsList.push(itemEntry);
            extraItemsTotal += itemTotal;
          } else {
            laundryItemsList.push(itemEntry);
            laundryItemsTotal += itemTotal;
          }
        }
      }

      // Aggiungo fee consegna e preparazione letti al totale items
      const deliveryFee = (d.deliveryFee && d.deliveryFeeEnabled !== false) ? d.deliveryFee : 0;
      const bedMakingFee = (d.bedMaking && d.bedMakingFee) ? d.bedMakingFee : 0;
      const calculatedTotal = itemsTotal + deliveryFee + bedMakingFee;

      // Prezzo effettivo (override se presente)
      const effectivePrice = typeof d.totalPriceOverride === "number" ? d.totalPriceOverride : calculatedTotal;
      const serviceType = mapCategoryToServiceType(mainCategory);
      if (serviceType === "KIT_CORTESIA") kitsTotal += effectivePrice;
      else if (serviceType === "SERVIZI_EXTRA") extrasTotal += effectivePrice;
      else laundryTotal += effectivePrice;
      ordersCount++;
      propertiesWithServices.add(d.propertyId);

      // Arricchimento dati per il PDF
      if (isLinkedToCompleted && d.cleaningId) {
        // Aggiungo gli items della order alla pulizia collegata
        const cl = cleaningsForPdfById.get(d.cleaningId);
        if (cl) {
          cl.laundryItems.push(...laundryItemsList);
          cl.laundryTotal += laundryItemsTotal;
          cl.kitItems.push(...kitItemsList);
          cl.kitTotal += kitItemsTotal;
          cl.extraItems.push(...extraItemsList);
          cl.extraTotal += extraItemsTotal;
          cl.deliveryFee += deliveryFee;
          cl.bedMakingFee += bedMakingFee;
          // Aggiorno il totalFormatted = base + holiday + tutto
          const newTotal = cl.basePrice + cl.holidayFee + cl.laundryTotal + cl.kitTotal + cl.extraTotal + cl.deliveryFee + cl.bedMakingFee;
          cl.totalFormatted = formatCurrency(newTotal);
        }
      } else if (isDelivered) {
        // Ordine DELIVERED senza pulizia collegata: creo una pseudo-pulizia per il PDF
        // Verrà raggruppata per propertyId
        const pseudoCleaning: CleaningForPdf = {
          id: doc.id,
          date: dateToCheck,
          isSgrosso: false,
          basePrice: 0,
          holidayFee: 0,
          laundryItems: laundryItemsList,
          laundryTotal: laundryItemsTotal,
          kitItems: kitItemsList,
          kitTotal: kitItemsTotal,
          extraItems: extraItemsList,
          extraTotal: extraItemsTotal,
          deliveryFee,
          bedMakingFee,
          totalFormatted: formatCurrency(effectivePrice),
        };
        standaloneOrdersForPdf.push({ propertyId: d.propertyId, date: dateToCheck, cleaning: pseudoCleaning });
      }
      if (diag) {
        diagOrders.push({
          id: doc.id,
          status: d.status,
          scheduledDate: d.scheduledDate?.toDate?.()?.toISOString?.() || null,
          deliveredAt: d.deliveredAt?.toDate?.()?.toISOString?.() || null,
          effectiveDate: dateToCheck.toISOString(),
          cleaningId: d.cleaningId ?? null,
          isLinkedToCompleted: !!isLinkedToCompleted,
          mainCategory,
          serviceType,
          itemsCount: (d.items || []).length,
          itemsTotal,
          deliveryFee,
          bedMakingFee,
          calculatedTotal,
          totalPriceOverride: d.totalPriceOverride ?? null,
          effectivePrice,
        });
      }
    }

    const grandTotal = cleaningsTotal + laundryTotal + kitsTotal + extrasTotal;
    const servicesCount = cleaningsCount + ordersCount;

    // ─── Costruzione struttura propertiesForPdf ──────────────────
    // Raggruppo le pulizie per propertyId
    const cleaningsByProperty = new Map<string, CleaningForPdf[]>();
    for (const cl of cleaningsForPdfById.values()) {
      const propId = (cl as any).propertyId;
      if (!propId) continue;
      if (!cleaningsByProperty.has(propId)) cleaningsByProperty.set(propId, []);
      cleaningsByProperty.get(propId)!.push(cl);
    }
    // Aggiungo le pseudo-pulizie da ordini standalone
    for (const so of standaloneOrdersForPdf) {
      if (!cleaningsByProperty.has(so.propertyId)) cleaningsByProperty.set(so.propertyId, []);
      cleaningsByProperty.get(so.propertyId)!.push(so.cleaning);
    }
    // Costruisco propertiesForPdf
    const propertiesForPdf: PropertyForPdf[] = [];
    for (const propId of propertiesWithServices) {
      const prop = propertiesById.get(propId);
      if (!prop) continue;
      const cleaningsList = (cleaningsByProperty.get(propId) || []).sort((a, b) => a.date.getTime() - b.date.getTime());
      // Calcolo totale proprietà sommando i totali dei servizi (parsing semplice del totalFormatted)
      let propTotal = 0;
      for (const cl of cleaningsList) {
        propTotal += cl.basePrice + cl.holidayFee + cl.laundryTotal + cl.kitTotal + cl.extraTotal + cl.deliveryFee + cl.bedMakingFee;
      }
      propertiesForPdf.push({
        id: propId,
        name: prop.name,
        address: prop.address,
        totalAmount: propTotal,
        totalAmountFormatted: formatCurrency(propTotal),
        cleanings: cleaningsList,
      });
    }
    propertiesForPdf.sort((a, b) => a.name.localeCompare(b.name));

    // ─── Modalità pdf=true: scarico solo il PDF ──────────────────
    if (pdfOnly) {
      const pdfBuffer = await generateMonthlyReportPdf({
        clientName, monthLabel: MONTHS_IT[month - 1] || "Mese", year,
        totalFormatted: formatCurrency(grandTotal),
        propertiesCount: propertiesWithServices.size,
        servicesCount, cleaningsCount,
        properties: propertiesForPdf,
      });
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="resoconto-${MONTHS_IT[month - 1]}-${year}.pdf"`,
        },
      });
    }

    // Diagnostica: restituisco dati grezzi se diag=true
    if (diag) {
      return NextResponse.json({
        meta: {
          clientId, clientName, email: normalizedEmail,
          month, monthLabel: MONTHS_IT[month - 1], year,
          propertiesCount: propertyIds.length,
        },
        summary: {
          cleaningsCount,
          cleaningsTotal: formatCurrency(cleaningsTotal),
          cleaningsTotalRaw: cleaningsTotal,
          ordersCount,
          laundryTotal: formatCurrency(laundryTotal),
          laundryTotalRaw: laundryTotal,
          kitsTotal: formatCurrency(kitsTotal),
          kitsTotalRaw: kitsTotal,
          extrasTotal: formatCurrency(extrasTotal),
          extrasTotalRaw: extrasTotal,
          grandTotal: formatCurrency(grandTotal),
          grandTotalRaw: grandTotal,
        },
        cleaningsDetail: diagCleanings.sort((a, b) => (a.date || "").localeCompare(b.date || "")),
        ordersDetail: diagOrders.sort((a, b) => (a.effectiveDate || "").localeCompare(b.effectiveDate || "")),
        inventory: Array.from(inventoryById.entries()).slice(0, 20).map(([id, v]) => ({ id, ...v })),
        note: "Confronta questi numeri con quelli della pagina Pagamenti del gestionale per lo stesso mese. Se cleaningsTotal corrisponde al 'totale del mese' che vedi nel gestionale, significa che gli ordini non devono essere sommati.",
      });
    }

    // Se zero servizi, mi fermo
    if (grandTotal === 0) {
      return NextResponse.json({
        error: `Nessun servizio trovato per ${clientName} a ${MONTHS_IT[month - 1]} ${year}`,
        clientId, clientName,
        propertiesCount: propertyIds.length,
        suggestion: "Prova un mese diverso dove ci sono pulizie/ordini completati",
      }, { status: 200 });
    }

    // 6. Params per template
    const pct = (n: number) => grandTotal > 0 ? Math.round((n / grandTotal) * 100) : 0;
    const params: MonthlyReportEmailParams = {
      clientName,
      monthLabel: MONTHS_IT[month - 1] || "Mese",
      year,
      totalFormatted: formatCurrency(grandTotal),
      propertiesCount: propertiesWithServices.size,
      servicesCount,
      cleaningsCount,
      breakdown: {
        cleanings: { amount: cleaningsTotal, amountFormatted: formatCurrency(cleaningsTotal), percent: pct(cleaningsTotal) },
        laundry: { amount: laundryTotal, amountFormatted: formatCurrency(laundryTotal), percent: pct(laundryTotal) },
        kits: { amount: kitsTotal, amountFormatted: formatCurrency(kitsTotal), percent: pct(kitsTotal) },
        extras: { amount: extrasTotal, amountFormatted: formatCurrency(extrasTotal), percent: pct(extrasTotal) },
      },
    };

    const html = monthlyReportEmail(params);

    // 7a. Se preview=true → restituisco solo HTML (niente invio)
    if (preview) {
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // 7b. Altrimenti invio davvero l'email
    if (!isResendConfigured() || !resend) {
      return NextResponse.json({
        error: "Resend non configurato",
        suggestion: "Aggiungi RESEND_API_KEY nelle variabili d'ambiente Railway",
      }, { status: 500 });
    }

    // Genero PDF allegato
    const pdfBuffer = await generateMonthlyReportPdf({
      clientName, monthLabel: MONTHS_IT[month - 1] || "Mese", year,
      totalFormatted: formatCurrency(grandTotal),
      propertiesCount: propertiesWithServices.size,
      servicesCount, cleaningsCount,
      properties: propertiesForPdf,
    });

    const sendResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: `Resoconto ${params.monthLabel} ${year} · Puliziacasevacanze.it`,
      html,
      attachments: [{
        filename: `resoconto-${(MONTHS_IT[month - 1] || "mese").toLowerCase()}-${year}.pdf`,
        content: pdfBuffer,
      }],
    });

    if (sendResult.error) {
      return NextResponse.json({
        error: "Errore invio email",
        resendError: sendResult.error,
        dataComputed: {
          clientName, clientId,
          propertiesCount: propertyIds.length,
          servicesCount, cleaningsCount, ordersCount,
          totals: { cleaningsTotal, laundryTotal, kitsTotal, extrasTotal, grandTotal },
        },
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Email inviata a ${normalizedEmail}`,
      messageId: sendResult.data?.id,
      details: {
        clientName, clientId,
        month: MONTHS_IT[month - 1], year,
        propertiesCount: propertyIds.length,
        servicesCount, cleaningsCount, ordersCount,
        totals: {
          cleaningsTotal: formatCurrency(cleaningsTotal),
          laundryTotal: formatCurrency(laundryTotal),
          kitsTotal: formatCurrency(kitsTotal),
          extrasTotal: formatCurrency(extrasTotal),
          grandTotal: formatCurrency(grandTotal),
        },
      },
      notes: [
        "Controlla la tua casella email (anche spam se non la vedi)",
        "Per vedere solo anteprima senza inviare: aggiungi &preview=true",
      ],
    });
  } catch (err: any) {
    console.error("[test-monthly-email] errore:", err);
    return NextResponse.json({
      error: "Errore durante il test",
      message: err?.message || String(err),
      stack: err?.stack?.split('\n').slice(0, 6).join('\n'),
    }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

function formatCurrency(amount: number): string {
  return "€ " + amount.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mapCategoryToServiceType(cat: string | undefined): string {
  if (!cat) return "BIANCHERIA";
  const lower = cat.toLowerCase();
  // Stessa logica di src/lib/billing/formatters.ts
  if (lower.includes("cortesia")) return "KIT_CORTESIA";
  if (lower.includes("extra") || lower.includes("servizi")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}
