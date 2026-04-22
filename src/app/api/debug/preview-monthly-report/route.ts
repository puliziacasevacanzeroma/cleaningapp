import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { monthlyReportEmail, type MonthlyReportEmailParams } from "~/lib/email/monthlyReport";

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/preview-monthly-report
 * 
 * Preview email mensile con dati reali Firestore. NON invia email.
 * 
 * Query params:
 * - clientId  = ID del proprietario (richiesto)
 * - month     = mese (1-12, richiesto)
 * - year      = anno (es. 2026, richiesto)
 * - format    = 'html' (default) | 'json' per vedere i dati grezzi
 * 
 * Esempio:
 *   /api/debug/preview-monthly-report?clientId=ABC123&month=4&year=2026
 *   /api/debug/preview-monthly-report?clientId=ABC123&month=4&year=2026&format=json
 */
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get('clientId');
    const monthStr = req.nextUrl.searchParams.get('month');
    const yearStr = req.nextUrl.searchParams.get('year');
    const format = req.nextUrl.searchParams.get('format') || 'html';

    if (!clientId || !monthStr || !yearStr) {
      return NextResponse.json({
        error: "Parametri richiesti: clientId, month, year",
        example: "/api/debug/preview-monthly-report?clientId=ABC123&month=4&year=2026",
      }, { status: 400 });
    }

    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: "month deve essere 1-12, year 2020-2100" }, { status: 400 });
    }

    // 1. Leggo il proprietario
    const ownerSnap = await adminDb.collection("users").doc(clientId).get();
    if (!ownerSnap.exists) {
      return NextResponse.json({ error: `Cliente ${clientId} non trovato` }, { status: 404 });
    }
    const owner = ownerSnap.data()!;
    const clientName = owner.displayName || owner.name || owner.email || "Cliente";

    // 2. Trovo proprietà del cliente
    const propsSnap = await adminDb.collection("properties").where("proprietarioId", "==", clientId).get();
    const propertyIds: string[] = propsSnap.docs.map((d: any) => d.id);
    if (propertyIds.length === 0) {
      return NextResponse.json({ error: `Cliente ${clientId} non ha proprietà`, clientName }, { status: 200 });
    }

    // 3. Range del mese
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const startTs = Timestamp.fromDate(monthStart);
    const endTs = Timestamp.fromDate(monthEnd);

    // 4. Pulizie COMPLETED del mese, filtrando per propertyIds in batch (Firestore limit 30 per 'in')
    let cleaningsTotal = 0;
    let cleaningsCount = 0;
    const propertyIdsSet = new Set(propertyIds);
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();
    for (const doc of cleaningsSnap.docs) {
      const d = doc.data();
      if (d.status !== "COMPLETED") continue;
      if (!propertyIdsSet.has(d.propertyId)) continue;
      const price = typeof d.priceOverride === "number" ? d.priceOverride : (d.price || 0);
      const holidayFee = typeof d.holidayFee === "number" ? d.holidayFee : 0;
      cleaningsTotal += price + holidayFee;
      cleaningsCount++;
    }

    // 5. Ordini del mese (biancheria + kit + extras)
    let laundryTotal = 0;
    let kitsTotal = 0;
    let extrasTotal = 0;
    let ordersCount = 0;
    const ordersSnap = await adminDb.collection("laundryOrders")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();
    for (const doc of ordersSnap.docs) {
      const d = doc.data();
      if (!propertyIdsSet.has(d.propertyId)) continue;
      const effectivePrice = typeof d.totalPriceOverride === "number" ? d.totalPriceOverride : (d.calculatedTotal || 0);
      const cat = mapCategoryToServiceType(d.mainCategory);
      if (cat === "KIT_CORTESIA") kitsTotal += effectivePrice;
      else if (cat === "SERVIZI_EXTRA") extrasTotal += effectivePrice;
      else laundryTotal += effectivePrice;
      ordersCount++;
    }

    const grandTotal = cleaningsTotal + laundryTotal + kitsTotal + extrasTotal;
    const servicesCount = cleaningsCount + ordersCount;

    // 6. Preparo i params per il template
    const pct = (n: number) => grandTotal > 0 ? Math.round((n / grandTotal) * 100) : 0;
    const params: MonthlyReportEmailParams = {
      clientName,
      monthLabel: MONTHS_IT[month - 1],
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

    // 7. Ritorno HTML o JSON
    if (format === "json") {
      return NextResponse.json({
        clientId, clientName, month, year,
        monthLabel: MONTHS_IT[month - 1],
        propertiesCount: propertyIds.length,
        cleaningsCount, ordersCount, servicesCount,
        cleaningsTotal, laundryTotal, kitsTotal, extrasTotal, grandTotal,
        params,
      });
    }

    const html = monthlyReportEmail(params);
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err: any) {
    console.error("[preview-monthly-report] errore:", err);
    return NextResponse.json({
      error: "Errore durante la generazione del preview",
      message: err?.message || String(err),
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
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
  const c = cat.toLowerCase();
  if (c.includes("kit") || c.includes("cortesia") || c.includes("welcome")) return "KIT_CORTESIA";
  if (c.includes("extra") || c.includes("special")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}
