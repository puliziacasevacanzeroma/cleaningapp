import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * audit-dashboard-payload-v1 — READ ONLY
 *
 * Misura ESATTAMENTE quanto pesa il cold-load della dashboard admin,
 * replicando le 5 query di useDashboardRealtime:
 *   1. properties ACTIVE (doc interi)
 *   2. cleanings di oggi
 *   3. users role OPERATORE_PULIZIE
 *   4. orders ultimi 7 giorni
 *   5. users role RIDER
 *
 * Per ogni listener: numero doc, byte totali (JSON serializzato ≈ payload
 * di rete), top 10 doc più pesanti, e per i doc pesanti i 5 CAMPI più
 * grossi (per scovare base64/blob dimenticati: firme, immagini, pdf...).
 *
 * USO: GET ...?cronSecret=XXX
 */

function fieldSizes(data: Record<string, any>): Array<{ field: string; bytes: number }> {
  return Object.entries(data)
    .map(([k, v]) => {
      let bytes = 0;
      try { bytes = JSON.stringify(v)?.length || 0; } catch { bytes = -1; }
      return { field: k, bytes };
    })
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5);
}

async function measure(label: string, snap: FirebaseFirestore.QuerySnapshot) {
  const docs = snap.docs.map((d) => {
    const data = d.data() as Record<string, any>;
    let bytes = 0;
    try { bytes = JSON.stringify(data)?.length || 0; } catch { bytes = -1; }
    return { id: d.id, name: data.name || data.propertyName || null, bytes, data };
  });
  const totalBytes = docs.reduce((s, d) => s + Math.max(0, d.bytes), 0);
  const top = [...docs]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10)
    .map((d) => ({
      id: d.id,
      name: d.name,
      kb: Math.round(d.bytes / 102.4) / 10,
      topFields: fieldSizes(d.data).map((f) => ({ field: f.field, kb: Math.round(f.bytes / 102.4) / 10 })),
    }));
  return {
    label,
    docs: docs.length,
    totalKB: Math.round(totalBytes / 102.4) / 10,
    totalMB: Math.round(totalBytes / 10485.76) / 100,
    topDocs: top,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cronSecret = searchParams.get("cronSecret");
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const ordersStart = new Date(today);
    ordersStart.setDate(ordersStart.getDate() - 7);

    const [propsSnap, cleanSnap, opsSnap, ordersSnap, ridersSnap] = await Promise.all([
      adminDb.collection("properties").where("status", "==", "ACTIVE").get(),
      adminDb.collection("cleanings")
        .where("scheduledDate", ">=", Timestamp.fromDate(today))
        .where("scheduledDate", "<=", Timestamp.fromDate(todayEnd))
        .get(),
      adminDb.collection("users").where("role", "==", "OPERATORE_PULIZIE").get(),
      adminDb.collection("orders")
        .where("scheduledDate", ">=", Timestamp.fromDate(ordersStart))
        .get(),
      adminDb.collection("users").where("role", "==", "RIDER").get(),
    ]);

    const results = await Promise.all([
      measure("1. properties ACTIVE", propsSnap),
      measure("2. cleanings oggi", cleanSnap),
      measure("3. users OPERATORE_PULIZIE", opsSnap),
      measure("4. orders ultimi 7gg", ordersSnap),
      measure("5. users RIDER", ridersSnap),
    ]);

    const grandTotalMB = Math.round(results.reduce((s, r) => s + r.totalMB, 0) * 100) / 100;

    return NextResponse.json({
      note: "Byte = JSON serializzato dei doc, ≈ payload che il browser scarica a freddo. Guarda topDocs/topFields per scovare blob/base64.",
      grandTotalMB,
      results,
    });
  } catch (e) {
    console.error("audit-dashboard-payload-v1 errore:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
