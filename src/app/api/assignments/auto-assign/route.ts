/**
 * AUTO-ASSIGN ENRICHMENT API
 * 
 * NON fa assegnazioni — ritorna solo dati di arricchimento:
 * - Durate storiche per proprietà (mediana ultimi 6 mesi)
 * - Familiarità operatore-proprietà (conteggi pulizie completate)
 * - checkInTime dalle proprietà (per deadline)
 * 
 * L'algoritmo di assegnazione gira client-side con questi dati.
 * Se questa API fallisce, il client usa fallback locali.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin" }, { status: 403 });
    }

    const { propertyIds, operatorIds } = await request.json() as {
      propertyIds: string[];
      operatorIds: string[];
    };

    if (!propertyIds?.length) {
      return NextResponse.json({ durations: {}, familiarity: {}, checkInTimes: {} });
    }

    const propSet = new Set(propertyIds);
    const opSet = new Set(operatorIds || []);

    // ── 1. Carica proprietà (checkInTime) ──
    const checkInTimes: Record<string, string> = {};
    for (const pid of propertyIds) {
      try {
        const doc = await adminDb.collection("properties").doc(pid).get();
        if (doc.exists) {
          const d = doc.data() as Record<string, any>;
          if (d.checkInTime) checkInTimes[pid] = d.checkInTime;
        }
      } catch { /* ignora */ }
    }

    // ── 2. Singola query: durate + familiarità ──
    const durations: Record<string, number> = {};   // propertyId → mediana minuti
    const familiarity: Record<string, number> = {};  // "opId:propId" → count
    
    try {
      const snap = await adminDb.collection("cleanings")
        .where("status", "in", ["COMPLETED", "completed", "VERIFIED", "verified"])
        .get();

      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 6);
      const dursByProp = new Map<string, number[]>();

      snap.docs.forEach(doc => {
        const d = doc.data() as Record<string, any>;
        const pid = d.propertyId;
        if (!pid || !propSet.has(pid)) return;

        // Familiarità
        if (d.operatorId && opSet.has(d.operatorId)) {
          const k = `${d.operatorId}:${pid}`;
          familiarity[k] = (familiarity[k] || 0) + 1;
        }

        // Durate
        if (!d.startedAt || !d.completedAt) return;
        try {
          const s = d.startedAt.toDate?.() ?? new Date(d.startedAt);
          const e = d.completedAt.toDate?.() ?? new Date(d.completedAt);
          if (e < cutoff) return;
          const mins = Math.round((e.getTime() - s.getTime()) / 60000);
          if (mins < 15 || mins > 480) return;
          const arr = dursByProp.get(pid) || [];
          arr.push(mins);
          dursByProp.set(pid, arr);
        } catch { /* ignora */ }
      });

      for (const [pid, durs] of dursByProp) {
        const sorted = durs.sort((a, b) => a - b);
        durations[pid] = sorted[Math.floor(sorted.length / 2)] || 90;
      }
    } catch (err) {
      console.error("Errore query storico:", err);
    }

    return NextResponse.json({ durations, familiarity, checkInTimes });
  } catch (error) {
    console.error("❌ Errore enrichment:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
