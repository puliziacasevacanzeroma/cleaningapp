import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/debug/fix-override-to-paid-v1?secret=CRON_SECRET[&apply=true]
 *
 * DRY-RUN di default (NESSUNA scrittura).
 *
 * Ripara l'INVARIANTE degli override "congelato al pagato": quel job di reset
 * doveva fissare overrideTotal = somma incassata del mese. Su Ariele Maria
 * Damiani (marzo 2026) ha sbagliato e ha messo 2710,38 invece di 2589,32 →
 * 121,06 di debito fantasma → blocco persistente nonostante la pagina mostri
 * saldo 0.
 *
 * Per ogni paymentOverride con reason che contiene "congelato al pagato":
 *   - calcola il pagato reale del mese (somma payments, escluso isCreditTransfer)
 *   - se |overrideTotal - pagato| > 0.01 → riallinea overrideTotal = pagato
 *   - altrimenti lo lascia invariato (già coerente)
 *
 * NON tocca override con altri reason (impostati a mano dall'admin).
 * Con ?apply=true esegue gli update. Senza, mostra solo cosa farebbe.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("secret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const apply = searchParams.get("apply") === "true";

  try {
    const [usersSnap, paymentsSnap, overridesSnap] = await Promise.all([
      adminDb.collection("users").get(),
      adminDb.collection("payments").get(),
      adminDb.collection("paymentOverrides").get(),
    ]);

    const userName = new Map<string, string>();
    usersSnap.docs.forEach(d => {
      const u = d.data();
      userName.set(d.id, u.name || u.displayName || u.email || d.id);
    });

    const paymentsByOwner = new Map<string, { month: number; year: number; amount: number; isCreditTransfer?: boolean }[]>();
    paymentsSnap.docs.forEach(doc => {
      const data = doc.data();
      const ownerId = data.proprietarioId;
      if (!ownerId) return;
      if (!paymentsByOwner.has(ownerId)) paymentsByOwner.set(ownerId, []);
      paymentsByOwner.get(ownerId)!.push({ month: data.month, year: data.year, amount: data.amount || 0, isCreditTransfer: data.isCreditTransfer === true });
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const paidMonth = (ownerId: string, m: number, y: number): number =>
      round2((paymentsByOwner.get(ownerId) || [])
        .filter(p => p.month === m && p.year === y && p.isCreditTransfer !== true)
        .reduce((s, p) => s + p.amount, 0));

    const rows: any[] = [];
    const toUpdate: { id: string; nuovo: number }[] = [];

    overridesSnap.docs.forEach(doc => {
      const o = doc.data();
      const reason = String(o.reason || "");
      if (!reason.includes("congelato al pagato")) return; // solo override del reset acconti

      const ownerId = o.proprietarioId;
      const m = o.month, y = o.year;
      if (!ownerId || typeof m !== "number" || typeof y !== "number") return;

      const overrideTotal = round2(o.overrideTotal ?? 0);
      const pagato = paidMonth(ownerId, m, y);
      const delta = round2(overrideTotal - pagato);
      const daRiallineare = Math.abs(delta) > 0.01;

      if (daRiallineare) toUpdate.push({ id: doc.id, nuovo: pagato });

      rows.push({
        overrideId: doc.id,
        cliente: userName.get(ownerId) || ownerId,
        mese: `${m}/${y}`,
        overrideTotal_attuale: overrideTotal,
        pagato,
        delta,
        nuovoOverride: daRiallineare ? pagato : overrideTotal,
        azione: daRiallineare ? (apply ? "RIALLINEATO" : "DA RIALLINEARE (dry-run)") : "gia coerente",
      });
    });

    let updated = 0;
    if (apply && toUpdate.length > 0) {
      const BATCH = 400;
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const chunk = toUpdate.slice(i, i + BATCH);
        const batch = adminDb.batch();
        for (const u of chunk) {
          batch.update(adminDb.collection("paymentOverrides").doc(u.id), {
            overrideTotal: u.nuovo,
            reason: "Azzeramento acconto: totale congelato al pagato (riallineato)",
            updatedAt: Timestamp.now(),
          });
        }
        await batch.commit();
        updated += chunk.length;
      }
    }

    return NextResponse.json({
      success: true,
      mode: apply ? "APPLY (scritture eseguite)" : "DRY-RUN (nessuna scrittura)",
      overrideCongelatoAlPagato: rows.length,
      daRiallineare: toUpdate.length,
      riallineati: apply ? updated : 0,
      nota: "Riallinea SOLO override 'congelato al pagato' dove il totale è diverso dal pagato reale. Atteso: 1 riga (Ariele marzo 2710,38 -> 2589,32).",
      righe: rows,
    }, { status: 200 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Errore server", details: errMsg }, { status: 500 });
  }
}
