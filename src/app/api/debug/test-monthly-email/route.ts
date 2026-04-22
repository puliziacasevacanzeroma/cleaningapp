import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { resend, isResendConfigured, FROM_EMAIL } from "~/lib/email/config";
import { monthlyReportEmail, type MonthlyReportEmailParams } from "~/lib/email/monthlyReport";

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

    if (!email) {
      return NextResponse.json({
        error: "Parametro richiesto: email",
        example: "/api/debug/test-monthly-email?email=damianiariele@gmail.com&month=4&year=2026",
      }, { status: 400 });
    }

    const now = new Date();
    const month = monthStr ? parseInt(monthStr, 10) : (now.getMonth() + 1);
    const year = yearStr ? parseInt(yearStr, 10) : now.getFullYear();

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

    // 2. Trovo proprietà del cliente
    const propsSnap = await adminDb.collection("properties")
      .where("ownerId", "==", clientId)
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

    // 3b. Carico le properties del cliente in una mappa id → { name, cleaningPrice }
    // Serve come fallback quando cleaning.price non è settato
    const propertiesById = new Map<string, { name: string; cleaningPrice: number }>();
    for (const doc of propsSnap.docs) {
      const p: any = doc.data();
      propertiesById.set(doc.id, {
        name: p.name || "Proprietà",
        cleaningPrice: p.cleaningPrice || 0,
      });
    }

    // Diagnostica — raccolgo dettaglio per ogni entry se diag=true
    const diagCleanings: any[] = [];
    const diagOrders: any[] = [];

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

    // 4b. Carico inventario per classificare gli items degli ordini per categoria
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryById = new Map<string, { name: string; sellPrice: number; categoryName: string }>();
    for (const doc of inventorySnap.docs) {
      const d: any = doc.data();
      inventoryById.set(doc.id, {
        name: d.name || "Articolo",
        sellPrice: d.sellPrice || 0,
        categoryName: d.categoryName || d.category || "Biancheria",
      });
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

      // Calcolo mainCategory scandendo gli items
      let mainCategory = "Biancheria";
      let maxCategoryTotal = 0;
      const categoryTotals: { [key: string]: number } = {};
      let itemsTotal = 0;
      if (d.items && Array.isArray(d.items)) {
        for (const item of d.items) {
          const itemKey = item.itemId || item.id;
          const invItem = inventoryById.get(itemKey);
          const basePrice = item.unitPrice || item.price || invItem?.sellPrice || 0;
          const unitPrice = item.priceOverride ?? basePrice;
          const quantity = item.quantity || 1;
          const itemTotal = item.totalPrice || (unitPrice * quantity);
          itemsTotal += itemTotal;
          const categoryName = item.categoryName || invItem?.categoryName || "Biancheria";
          categoryTotals[categoryName] = (categoryTotals[categoryName] || 0) + itemTotal;
          if (categoryTotals[categoryName] > maxCategoryTotal) {
            maxCategoryTotal = categoryTotals[categoryName];
            mainCategory = categoryName;
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
      propertiesCount: propertyIds.length,
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

    const sendResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: `Resoconto ${params.monthLabel} ${year} · Puliziacasevacanze.it`,
      html,
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
