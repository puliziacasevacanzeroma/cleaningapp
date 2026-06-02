/**
 * DEBUG: pesa i campi dei documenti 'properties' per trovare cosa rallenta.
 * GET /api/debug/property-size-v1?cronSecret=XXX
 * Ritorna, per campo, la dimensione totale in KB su tutte le properties,
 * + le 5 properties più pesanti. SOLO LETTURA.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  try {
    const snap = await adminDb.collection("properties").where("status", "==", "ACTIVE").get();

    const fieldBytes: Record<string, number> = {};
    const perDoc: { id: string; name: string; totalKB: number; topField: string; topFieldKB: number }[] = [];
    let grandTotal = 0;

    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, any>;
      let docTotal = 0;
      let topField = "", topBytes = 0;
      for (const [k, v] of Object.entries(data)) {
        const bytes = Buffer.byteLength(JSON.stringify(v ?? null), "utf8");
        fieldBytes[k] = (fieldBytes[k] || 0) + bytes;
        docTotal += bytes;
        if (bytes > topBytes) { topBytes = bytes; topField = k; }
      }
      grandTotal += docTotal;
      perDoc.push({ id: d.id, name: data.name || d.id, totalKB: Math.round(docTotal / 1024 * 10) / 10, topField, topFieldKB: Math.round(topBytes / 1024 * 10) / 10 });
    });

    const fieldRanking = Object.entries(fieldBytes)
      .map(([campo, bytes]) => ({ campo, totaleKB: Math.round(bytes / 1024 * 10) / 10, mediaPerDocKB: Math.round(bytes / snap.size / 1024 * 10) / 10 }))
      .sort((a, b) => b.totaleKB - a.totaleKB);

    perDoc.sort((a, b) => b.totalKB - a.totalKB);

    return NextResponse.json({
      success: true,
      numProperties: snap.size,
      dimensioneTotaleKB: Math.round(grandTotal / 1024 * 10) / 10,
      dimensioneMediaPerPropertyKB: Math.round(grandTotal / snap.size / 1024 * 10) / 10,
      campiPiuPesanti: fieldRanking.slice(0, 12),
      proprietaPiuPesanti: perDoc.slice(0, 5),
      diagnosi: "Il campo in cima a 'campiPiuPesanti' è ciò che rallenta il caricamento. Se è 'images'/'imageUrl' con KB alti = immagini base64. Se è serviceConfigs/linenConfig = configurazioni pesanti. La cura: non caricare quel campo nella pagina pagamenti.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
