import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * API: ritorna i lavori attivi dell'utente corrente.
 *
 * Usato dal ShiftBadge prima di chiudere il turno:
 *   - se ci sono pulizie IN_PROGRESS dell'operatore → mostra modal alert
 *   - se ci sono ordini in stato attivo per il rider → mostra modal alert
 *
 * Ritorna:
 *   {
 *     cleanings: [{id, propertyName, startedAt}],
 *     orders: [{id, propertyName, status}],
 *     hasActiveWork: boolean
 *   }
 *
 * NOTA: le query usano where su un solo campo (userId/riderId) per evitare
 * composite index. Il filtro sullo status viene fatto in memory.
 */
export async function GET(_request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const role = user.role?.toUpperCase();

  try {
    const result: any = {
      cleanings: [],
      orders: [],
      hasActiveWork: false,
    };

    // ── PULIZIE IN_PROGRESS dell'operatore ──
    if (role === "OPERATORE_PULIZIE" || role === "ADMIN") {
      // Strategia: filtro per status=IN_PROGRESS (più efficiente dello scan completo,
      // perché le pulizie IN_PROGRESS sono pochissime in un dato momento — max qualche decina).
      // Poi filtro in-memory per operatorId O operators[] contiene user.id.
      //
      // Alternative scartate:
      // - array-contains con {id, name}: non funziona (Firestore richiede uguaglianza esatta
      //   dell'oggetto, e `operators` ha anche `name` quindi l'ignoto).
      // - where operatorId == userId: non basta, perché se l'operatore è il 2°/3° della lista
      //   operatorId punta al primo (non a lui).
      const cleaningsSnap = await adminDb
        .collection("cleanings")
        .where("status", "==", "IN_PROGRESS")
        .get();

      // Fallback: anche lowercase per compatibilità storica
      const cleaningsSnapLower = await adminDb
        .collection("cleanings")
        .where("status", "==", "in_progress")
        .get();

      const activeCleanings: any[] = [];
      const seen = new Set<string>();
      const allDocs = [...cleaningsSnap.docs, ...cleaningsSnapLower.docs];

      for (const doc of allDocs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        const data = doc.data();
        const isMainOperator = data.operatorId === user.id;
        const isInOperatorsList = Array.isArray(data.operators) &&
          data.operators.some((op: any) => op && op.id === user.id);
        const isStarter = data.startedBy === user.id;

        if (isMainOperator || isInOperatorsList || isStarter) {
          activeCleanings.push({
            id: doc.id,
            propertyName: data.propertyName || "Proprietà",
            propertyAddress: data.propertyAddress || "",
            startedAt: data.startedAt?.toMillis?.() || null,
          });
        }
      }

      result.cleanings = activeCleanings;
    }

    // ── ORDINI biancheria del rider (PICKING o IN_TRANSIT) ──
    if (role === "RIDER" || role === "ADMIN") {
      const ordersSnap = await adminDb
        .collection("orders")
        .where("riderId", "==", user.id)
        .get();

      const activeOrders: any[] = [];
      for (const doc of ordersSnap.docs) {
        const data = doc.data();
        // Status considerati "lavoro in corso" per il rider:
        // PICKING = ordine preso in carico, in preparazione
        // IN_TRANSIT = in consegna
        if (data.status === "PICKING" || data.status === "IN_TRANSIT") {
          activeOrders.push({
            id: doc.id,
            propertyName: data.propertyName || "Proprietà",
            status: data.status,
          });
        }
      }

      result.orders = activeOrders;
    }

    result.hasActiveWork = result.cleanings.length > 0 || result.orders.length > 0;

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Errore check-active-work:", error);
    // In caso di errore ritorniamo hasActiveWork=false per non bloccare
    // la chiusura del turno (meglio permettere che bloccare).
    return NextResponse.json({
      cleanings: [],
      orders: [],
      hasActiveWork: false,
      error: error.message,
    });
  }
}
