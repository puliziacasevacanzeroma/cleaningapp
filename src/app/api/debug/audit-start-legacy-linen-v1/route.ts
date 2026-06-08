import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * DIAGNOSTICA READ-ONLY — uso del percorso legacy di /cleanings/[id]/start.
 *
 * Quel percorso crea biancheria SOLO se:
 *   property.autoGenerateLaundry === true  &&  property.usesOwnLinen !== true
 * leggendo property.linenConfig (ARRAY PIATTO legacy), non serviceConfigs.
 *
 * Questo endpoint conta/elenca le proprietà con:
 *   - autoGenerateLaundry === true
 *   - linenConfig (array piatto) valorizzato
 *   - entrambe (le uniche che attivano davvero il blocco biancheria di start)
 *
 * Se "activeForStart" è 0 → il blocco è di fatto morto e si può rimuovere/riscrivere
 * in sicurezza. Non scrive nulla.
 *
 * Uso: /api/debug/audit-start-legacy-linen-v1?cronSecret=XXX
 */

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await adminDb.collection("properties").get();

    let withAutoGenerate = 0;
    let withFlatLinenConfig = 0;
    let activeForStart = 0; // autoGenerate && !usesOwnLinen && linenConfig valorizzato

    const details: any[] = [];

    for (const d of snap.docs) {
      const p = d.data() as Record<string, any>;
      const autoGen = p.autoGenerateLaundry === true;
      const usesOwn = p.usesOwnLinen === true;
      const lc = p.linenConfig;
      const flatLen = Array.isArray(lc) ? lc.length : 0;
      const hasFlat = flatLen > 0;

      if (autoGen) withAutoGenerate++;
      if (hasFlat) withFlatLinenConfig++;

      const active = autoGen && !usesOwn && hasFlat;
      if (active) activeForStart++;

      if (autoGen || hasFlat) {
        details.push({
          propertyId: d.id,
          propertyName: p.name || "(senza nome)",
          autoGenerateLaundry: autoGen,
          usesOwnLinen: usesOwn,
          linenConfigFlatItems: flatLen,
          activeForStartLinen: active,
          hasServiceConfigs: !!(p.serviceConfigs && Object.keys(p.serviceConfigs).length > 0),
        });
      }
    }

    details.sort((a, b) => Number(b.activeForStartLinen) - Number(a.activeForStartLinen));

    return NextResponse.json({
      readOnly: true,
      generatedAt: new Date().toISOString(),
      summary: {
        totalProperties: snap.size,
        withAutoGenerateLaundry: withAutoGenerate,
        withFlatLinenConfig: withFlatLinenConfig,
        activeForStart,
        note:
          "activeForStart = proprietà che attivano DAVVERO il blocco biancheria legacy di /cleanings/[id]/start (autoGenerateLaundry && !usesOwnLinen && linenConfig array piatto valorizzato). Se 0 → blocco morto, rimovibile/riscrivibile in sicurezza.",
      },
      details,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Errore", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
