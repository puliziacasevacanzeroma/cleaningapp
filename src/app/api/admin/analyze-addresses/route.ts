/**
 * API per analizzare gli indirizzi delle proprietà
 * GET /api/admin/analyze-addresses
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const propertiesRef = collection(db, "properties");
    const snapshot = await getDocs(propertiesRef);

    const analysis = {
      total: snapshot.docs.length,
      withCoordinates: 0,
      withoutCoordinates: 0,
      properties: [] as Array<{
        id: string;
        name: string;
        address: string | null;
        city: string | null;
        postalCode: string | null;
        hasCoordinates: boolean;
        addressLength: number;
        hasNumber: boolean;
        issues: string[];
      }>,
    };

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const hasCoords = !!(data.coordinates?.lat && data.coordinates?.lng);
      
      if (hasCoords) {
        analysis.withCoordinates++;
      } else {
        analysis.withoutCoordinates++;
      }

      const address = data.address || null;
      const city = data.city || null;
      const postalCode = data.postalCode || null;
      
      // Analizza problemi
      const issues: string[] = [];
      
      if (!address) {
        issues.push("MANCA_INDIRIZZO");
      } else {
        if (address.length < 10) issues.push("INDIRIZZO_TROPPO_CORTO");
        if (!/\d+/.test(address)) issues.push("MANCA_CIVICO");
        if (address.toLowerCase().includes("roma") && city?.toLowerCase().includes("roma")) {
          issues.push("ROMA_DUPLICATO");
        }
      }
      
      if (!city) issues.push("MANCA_CITTA");
      if (!postalCode) issues.push("MANCA_CAP");
      
      // Solo proprietà senza coordinate
      if (!hasCoords) {
        analysis.properties.push({
          id: doc.id,
          name: data.name || "Senza nome",
          address,
          city,
          postalCode,
          hasCoordinates: hasCoords,
          addressLength: address?.length || 0,
          hasNumber: address ? /\d+/.test(address) : false,
          issues,
        });
      }
    });

    // Ordina per numero di problemi (più problemi prima)
    analysis.properties.sort((a, b) => b.issues.length - a.issues.length);

    // Statistiche problemi
    const issueStats: Record<string, number> = {};
    analysis.properties.forEach(p => {
      p.issues.forEach(issue => {
        issueStats[issue] = (issueStats[issue] || 0) + 1;
      });
    });

    return NextResponse.json({
      summary: {
        total: analysis.total,
        withCoordinates: analysis.withCoordinates,
        withoutCoordinates: analysis.withoutCoordinates,
        issueStats,
      },
      properties: analysis.properties,
    });

  } catch (error: any) {
    console.error("❌ Errore:", error);
    return NextResponse.json(
      { error: error.message || "Errore server" },
      { status: 500 }
    );
  }
}
