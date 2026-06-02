/**
 * DEBUG: misura il tempo delle query DAL SERVER (Admin SDK).
 * GET /api/debug/server-query-timing-v1?cronSecret=XXX
 *
 * Serve a capire se la lentezza (~10s nel browser) è:
 *  - SOLO lato browser (qui sarà veloce <1s) → problema Security Rules o rete client
 *  - ANCHE lato server (qui sarà lento) → problema del database (regione/indici)
 *
 * L'Admin SDK gira nei data center Google e bypassa le Security Rules.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  try {
    const now = new Date();
    const start = new Date(now.getFullYear() - 1, 6, 1);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    const t1 = Date.now();
    const propsSnap = await adminDb.collection("properties").where("status", "==", "ACTIVE").get();
    const tProps = Date.now() - t1;

    const t2 = Date.now();
    const invSnap = await adminDb.collection("inventory").get();
    const tInv = Date.now() - t2;

    const t3 = Date.now();
    const cleanSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", start)
      .where("scheduledDate", "<=", end)
      .get();
    const tClean = Date.now() - t3;

    const t4 = Date.now();
    const ordSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", start)
      .where("scheduledDate", "<=", end)
      .get();
    const tOrd = Date.now() - t4;

    const t5 = Date.now();
    const paySnap = await adminDb.collection("payments").get();
    const tPay = Date.now() - t5;

    return NextResponse.json({
      success: true,
      nota: "Tempi misurati DAL SERVER (Admin SDK). Confronta con i tempi del browser (~10s).",
      tempiServer: {
        properties_ms: tProps,
        properties_docs: propsSnap.size,
        inventory_ms: tInv,
        inventory_docs: invSnap.size,
        cleanings_ms: tClean,
        cleanings_docs: cleanSnap.size,
        orders_ms: tOrd,
        orders_docs: ordSnap.size,
        payments_ms: tPay,
        payments_docs: paySnap.size,
      },
      verdetto:
        tProps < 2000
          ? "Server VELOCE → il database va bene. La lentezza del browser è lato CLIENT (Security Rules o rete/connessione del browser). Prossimo passo: scheda Network del browser + controllo Security Rules."
          : "Server LENTO anche qui → il problema è il DATABASE (regione lontana, indici mancanti, o troppi dati). Prossimo passo: verificare regione Firestore e indici.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
