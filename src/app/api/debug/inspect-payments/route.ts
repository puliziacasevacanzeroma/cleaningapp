/**
 * GET /api/debug/inspect-payments?cronSecret=XXX&name=festa
 *
 * Mostra TUTTI i pagamenti di un proprietario con TUTTI i campi raw del database,
 * incluse note, type, method, createdBy, e qualsiasi altro campo.
 *
 * Serve a capire da dove arriva un pagamento "anomalo" (es. include tassa soggiorno,
 * deposito, mancia, ecc.) per diagnosticare falsi positivi nel calcolo carryover.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("cronSecret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const nameFilter = searchParams.get("name");
  const ownerIdParam = searchParams.get("ownerId");

  if (!nameFilter && !ownerIdParam) {
    return NextResponse.json({ error: "Specifica name o ownerId" }, { status: 400 });
  }

  try {
    let ownerId = ownerIdParam;
    let ownerData: any = null;

    if (!ownerId && nameFilter) {
      const usersSnap = await adminDb.collection("users").get();
      for (const d of usersSnap.docs) {
        const u = d.data() as any;
        const name = u.name || u.fullName || u.displayName || "";
        if (name.toLowerCase().includes(nameFilter.toLowerCase())) {
          ownerId = d.id;
          ownerData = u;
          break;
        }
      }
    } else if (ownerId) {
      const u = await adminDb.collection("users").doc(ownerId).get();
      if (u.exists) ownerData = u.data();
    }

    if (!ownerId) {
      return NextResponse.json({ error: "Owner non trovato" }, { status: 404 });
    }

    // Tutti i pagamenti
    const paymentsSnap = await adminDb.collection("payments")
      .where("proprietarioId", "==", ownerId)
      .get();

    // Tutti gli override
    const overridesSnap = await adminDb.collection("paymentOverrides")
      .where("proprietarioId", "==", ownerId)
      .get();

    const payments = paymentsSnap.docs.map(d => {
      const p = d.data() as any;
      return {
        id: d.id,
        month: p.month,
        year: p.year,
        amount: p.amount,
        type: p.type,
        method: p.method,
        note: p.note ?? null,
        isCreditTransfer: p.isCreditTransfer === true,
        sourceMonth: p.sourceMonth ?? null,
        sourceYear: p.sourceYear ?? null,
        sourceServiceId: p.sourceServiceId ?? null,
        sourceServiceType: p.sourceServiceType ?? null,
        actionType: p.actionType ?? null,
        createdAt: p.createdAt?.toDate?.()?.toISOString() ?? null,
        createdBy: p.createdBy ?? null,
        createdByName: p.createdByName ?? null,
        updatedAt: p.updatedAt?.toDate?.()?.toISOString() ?? null,
        // TUTTI gli altri campi raw
        _allFields: Object.keys(p).sort(),
        _raw: p,
      };
    });

    // Ordina cronologicamente
    payments.sort((a: any, b: any) => {
      if (a.year !== b.year) return a.year - b.year;
      return (a.month || 0) - (b.month || 0);
    });

    const overrides = overridesSnap.docs.map(d => {
      const o = d.data() as any;
      return {
        id: d.id,
        month: o.month,
        year: o.year,
        overrideTotal: o.overrideTotal,
        reason: o.reason ?? null,
        originalTotal: o.originalTotal ?? null,
        createdAt: o.createdAt?.toDate?.()?.toISOString() ?? null,
        createdBy: o.createdBy ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      ownerId,
      ownerName: ownerData?.name ?? ownerData?.fullName ?? "?",
      ownerEmail: ownerData?.email ?? null,
      paymentsCount: payments.length,
      paymentsTotal: round(payments.reduce((s, p) => s + (p.amount || 0), 0)),
      paymentsRealTotal: round(payments.filter(p => !p.isCreditTransfer).reduce((s, p) => s + (p.amount || 0), 0)),
      payments,
      overrides,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: "Errore server",
      message: error.message,
    }, { status: 500 });
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
