import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const snapshot = await adminDb.collection("properties").get();
    const analysis = { total: snapshot.docs.length, withCoordinates: 0, withoutCoordinates: 0, properties: [] as any[] };

    snapshot.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      const hasCoords = !!(data.coordinates?.lat && data.coordinates?.lng);
      if (hasCoords) analysis.withCoordinates++; else analysis.withoutCoordinates++;
      const address = data.address || null;
      const city = data.city || null;
      const postalCode = data.postalCode || null;
      const issues: string[] = [];
      if (!address) { issues.push("MANCA_INDIRIZZO"); } else {
        if (address.length < 10) issues.push("INDIRIZZO_TROPPO_CORTO");
        if (!/\d+/.test(address)) issues.push("MANCA_CIVICO");
        if (address.toLowerCase().includes("roma") && city?.toLowerCase().includes("roma")) issues.push("ROMA_DUPLICATO");
      }
      if (!city) issues.push("MANCA_CITTA");
      if (!postalCode) issues.push("MANCA_CAP");
      if (!hasCoords) {
        analysis.properties.push({ id: doc.id, name: data.name || "Senza nome", address, city, postalCode, hasCoordinates: hasCoords, addressLength: address?.length || 0, hasNumber: address ? /\d+/.test(address) : false, issues });
      }
    });

    analysis.properties.sort((a, b) => b.issues.length - a.issues.length);
    const issueStats: Record<string, number> = {};
    analysis.properties.forEach(p => p.issues.forEach((issue: string) => { issueStats[issue] = (issueStats[issue] || 0) + 1; }));

    return NextResponse.json({ summary: { total: analysis.total, withCoordinates: analysis.withCoordinates, withoutCoordinates: analysis.withoutCoordinates, issueStats }, properties: analysis.properties });
  } catch (error: any) {
    console.error("❌ Errore:", error);
    return NextResponse.json({ error: error.message || "Errore server" }, { status: 500 });
  }
}
