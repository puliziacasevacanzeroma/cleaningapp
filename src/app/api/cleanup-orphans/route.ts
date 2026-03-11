import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const execute = req.nextUrl.searchParams.get("execute") === "true";

    // 1. Carica TUTTI i cleaningId esistenti
    const cleaningsSnap = await adminDb.collection("cleanings").get();
    const existingCleaningIds = new Set(cleaningsSnap.docs.map(d => d.id));

    // 2. Carica TUTTI gli ordini
    const ordersSnap = await adminDb.collection("orders").get();
    
    const orphans: { id: string; propertyName: string; cleaningId: string; status: string; scheduledDate: string }[] = [];
    let cancelled = 0;

    for (const oDoc of ordersSnap.docs) {
      const data = oDoc.data() as Record<string, any>;
      
      // Solo ordini con cleaningId che puntano a pulizie inesistenti
      if (!data.cleaningId) continue;
      if (existingCleaningIds.has(data.cleaningId)) continue;
      
      // Non toccare ordini già consegnati, completati, in transito o cancellati
      if (["DELIVERED", "COMPLETED", "IN_TRANSIT", "CANCELLED"].includes(data.status)) continue;

      orphans.push({
        id: oDoc.id,
        propertyName: data.propertyName || "?",
        cleaningId: data.cleaningId,
        status: data.status,
        scheduledDate: data.scheduledDate?.toDate?.()?.toISOString()?.split("T")[0] || "?",
      });

      if (execute) {
        await adminDb.collection("orders").doc(oDoc.id).update({
          status: "CANCELLED",
          cancelReason: "Pulizia collegata non esistente (cleanup manuale admin)",
          cancelledAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        cancelled++;
      }
    }

    return NextResponse.json({
      mode: execute ? "ESEGUITO" : "DRY RUN — aggiungi ?execute=true per cancellare",
      orphansFound: orphans.length,
      cancelled,
      orphans,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
