import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

/**
 * FIX CHIRURGICO — imposta hasLinenOrder su pulizie SPECIFICHE (per ID).
 *
 * Serve a correggere pulizie con flag biancheria errato (es. hasLinenOrder=false
 * residuo da un periodo in cui la proprietà era a biancheria propria, mentre ora
 * usa la nostra e l'ordine ha giustamente la biancheria).
 *
 * SICUREZZA:
 *  - Opera SOLO sugli ID che passi tu (nessuno scan automatico).
 *  - DRY-RUN di default. Scrive solo con apply=1.
 *  - Mostra prima/dopo del flag per ogni pulizia.
 *
 * Uso: /api/debug/fix-cleaning-haslinenorder-v1?cronSecret=XXX
 *      &ids=ID1,ID2           (obbligatorio)
 *      &value=true            (true|false, default true)
 *      &apply=1               (per scrivere)
 */

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const idsParam = (req.nextUrl.searchParams.get("ids") || "").trim();
  const value = (req.nextUrl.searchParams.get("value") || "true") === "true";
  const apply = req.nextUrl.searchParams.get("apply") === "1";

  if (!idsParam) {
    return NextResponse.json({ error: "Manca ?ids=ID1,ID2" }, { status: 400 });
  }
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const results: any[] = [];
    let applied = 0;

    for (const id of ids) {
      const snap = await adminDb.collection("cleanings").doc(id).get();
      if (!snap.exists) {
        results.push({ cleaningId: id, verdict: "NOT_FOUND" });
        continue;
      }
      const c = snap.data() as any;
      const before = c.hasLinenOrder ?? null;

      const row: any = {
        cleaningId: id,
        propertyName: c.propertyName || null,
        scheduledDate: c.scheduledDate?.toDate?.()?.toISOString?.() || null,
        before,
        after: value,
        changed: before !== value,
        applied: false,
      };

      if (apply && before !== value) {
        await adminDb.collection("cleanings").doc(id).update({
          hasLinenOrder: value,
          requiresLaundry: value,
          updatedAt: Timestamp.now(),
        });
        row.applied = true;
        applied++;
      }
      results.push(row);
    }

    return NextResponse.json({
      mode: apply ? "APPLY" : "DRY-RUN",
      generatedAt: new Date().toISOString(),
      value,
      summary: { requested: ids.length, applied },
      results,
      hint: apply ? undefined : "Aggiungi &apply=1 per scrivere.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Errore", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
