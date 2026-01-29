import { NextResponse } from "next/server";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// GET - DEBUG: Mostra i dati RAW dal database
export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Carica pulizie di oggi
    const cleaningsSnapshot = await getDocs(query(
      collection(db, "cleanings"),
      where("scheduledDate", ">=", Timestamp.fromDate(today)),
      where("scheduledDate", "<", Timestamp.fromDate(tomorrow))
    ));

    const cleaningsRaw = cleaningsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        propertyName: data.propertyName || "N/A",
        // 🔍 DEBUG: Mostra TUTTI i campi relativi agli operatori
        operatorId: data.operatorId || null,
        operatorName: data.operatorName || null,
        operators: data.operators || null,
        // Mostra il tipo di dato
        operatorsType: data.operators ? typeof data.operators : "undefined",
        operatorsIsArray: Array.isArray(data.operators),
        operatorsLength: Array.isArray(data.operators) ? data.operators.length : 0,
        // Altri campi utili
        status: data.status,
        scheduledTime: data.scheduledTime,
      };
    });

    // Carica operatori disponibili
    const operatorsSnapshot = await getDocs(query(
      collection(db, "users"),
      where("role", "==", "OPERATORE_PULIZIE")
    ));

    const operatorsRaw = operatorsSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      email: doc.data().email,
    }));

    return NextResponse.json({
      debug: true,
      timestamp: new Date().toISOString(),
      message: "Dati RAW dal database Firestore",
      cleaningsCount: cleaningsRaw.length,
      cleanings: cleaningsRaw,
      operatorsCount: operatorsRaw.length,
      operators: operatorsRaw,
    }, { status: 200 });

  } catch (error) {
    console.error("Errore debug:", error);
    return NextResponse.json({ 
      error: "Errore", 
      details: String(error) 
    }, { status: 500 });
  }
}
