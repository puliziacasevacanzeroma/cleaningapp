import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const propertyName = url.searchParams.get("name");
  const date = url.searchParams.get("date"); // formato YYYY-MM-DD

  if (!id && !propertyName) {
    return NextResponse.json({ error: "Parametro ?id= o ?name= richiesto" }, { status: 400 });
  }

  const results: any[] = [];

  if (id) {
    // Cerca per ID specifico
    const doc = await adminDb.collection("cleanings").doc(id).get();
    if (doc.exists) {
      results.push({ collection: "cleanings", ...formatDoc(doc) });
    }
    // Cerca anche negli ordini
    const orderDoc = await adminDb.collection("orders").doc(id).get();
    if (orderDoc.exists) {
      results.push({ collection: "orders", ...formatDoc(orderDoc) });
    }
  }

  if (propertyName) {
    // Cerca tutte le pulizie e ordini per questa proprietà
    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("propertyId", "==", await findPropertyId(propertyName))
      .get();
    
    const ordersSnap = await adminDb.collection("orders")
      .where("propertyId", "==", await findPropertyId(propertyName))
      .get();

    for (const doc of cleaningsSnap.docs) {
      const data = doc.data();
      const docDate = data.scheduledDate?.toDate?.();
      
      // Se filtro data specificato, filtra
      if (date && docDate) {
        const docDateStr = docDate.toISOString().split('T')[0];
        const romeDate = docDate.toLocaleString('en-CA', { timeZone: 'Europe/Rome' }).split(',')[0];
        if (docDateStr !== date && romeDate !== date) continue;
      }
      
      results.push({ collection: "cleanings", ...formatDoc(doc) });
    }

    for (const doc of ordersSnap.docs) {
      const data = doc.data();
      const docDate = data.scheduledDate?.toDate?.();
      
      if (date && docDate) {
        const docDateStr = docDate.toISOString().split('T')[0];
        const romeDate = docDate.toLocaleString('en-CA', { timeZone: 'Europe/Rome' }).split(',')[0];
        if (docDateStr !== date && romeDate !== date) continue;
      }
      
      results.push({ collection: "orders", ...formatDoc(doc) });
    }
  }

  // Simula anche la query che fa il frontend per "oggi"
  const testDate = date || new Date().toISOString().split('T')[0];
  const [y, m, d2] = testDate.split('-').map(Number);
  const browserStartOfDay = new Date(y, m - 1, d2, 0, 0, 0, 0);
  const browserEndOfDay = new Date(y, m - 1, d2, 23, 59, 59, 999);
  
  // Simula come se il browser fosse a Roma (UTC+2)
  const romeStartUTC = new Date(Date.UTC(y, m - 1, d2 - 1, 22, 0, 0, 0)); // 00:00 Roma = 22:00 UTC giorno prima
  const romeEndUTC = new Date(Date.UTC(y, m - 1, d2, 21, 59, 59, 999)); // 23:59 Roma = 21:59 UTC

  return NextResponse.json({
    query: { id, propertyName, date },
    resultsCount: results.length,
    results,
    frontendQuerySimulation: {
      testDate,
      browserLocal: {
        startOfDay: browserStartOfDay.toISOString(),
        endOfDay: browserEndOfDay.toISOString(),
        note: "Questo è quello che il frontend usa con setHours(0,0,0,0) - dipende dal timezone del browser"
      },
      romeTimezone: {
        startUTC: romeStartUTC.toISOString(),
        endUTC: romeEndUTC.toISOString(),
        note: "Equivalente di mezzanotte-23:59 ora Roma in UTC"
      },
      explanation: "Se scheduledDate.raw è FUORI da browserLocal.startOfDay-endOfDay, la pulizia NON appare nel frontend"
    }
  });
}

async function findPropertyId(name: string): Promise<string> {
  const snap = await adminDb.collection("properties").get();
  const found = snap.docs.find(d => (d.data().name || "").toLowerCase().includes(name.toLowerCase()));
  return found?.id || "";
}

function formatDoc(doc: FirebaseFirestore.DocumentSnapshot): any {
  const data = doc.data() as Record<string, any>;
  const readable: Record<string, any> = { id: doc.id };
  
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
      const d = value.toDate();
      readable[key] = {
        raw: d.toISOString(),
        utc: d.toUTCString(),
        rome: d.toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
        seconds: value.seconds || Math.floor(d.getTime() / 1000),
      };
    } else if (Array.isArray(value)) {
      readable[key] = `[Array: ${value.length} items]`;
    } else if (typeof value === 'object' && value !== null) {
      readable[key] = `{Object: ${Object.keys(value).join(', ')}}`;
    } else {
      readable[key] = value;
    }
  }
  
  return readable;
}
