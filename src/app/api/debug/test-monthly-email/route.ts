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
      .where("proprietarioId", "==", clientId)
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

    // 4. Pulizie COMPLETED
    let cleaningsTotal = 0;
    let cleaningsCount = 0;
    const propertyIdsSet = new Set(propertyIds);
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();
    for (const doc of cleaningsSnap.docs) {
      const d: any = doc.data();
      if (d.status !== "COMPLETED") continue;
      if (!propertyIdsSet.has(d.propertyId)) continue;
      const price = typeof d.priceOverride === "number" ? d.priceOverride : (d.price || 0);
      const holidayFee = typeof d.holidayFee === "number" ? d.holidayFee : 0;
      cleaningsTotal += price + holidayFee;
      cleaningsCount++;
    }

    // 5. Ordini
    let laundryTotal = 0;
    let kitsTotal = 0;
    let extrasTotal = 0;
    let ordersCount = 0;
    const ordersSnap = await adminDb.collection("laundryOrders")
      .where("scheduledDate", ">=", startTs)
      .where("scheduledDate", "<=", endTs)
      .get();
    for (const doc of ordersSnap.docs) {
      const d: any = doc.data();
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
  const c = cat.toLowerCase();
  if (c.includes("kit") || c.includes("cortesia") || c.includes("welcome")) return "KIT_CORTESIA";
  if (c.includes("extra") || c.includes("special")) return "SERVIZI_EXTRA";
  return "BIANCHERIA";
}
