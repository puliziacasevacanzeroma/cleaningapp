import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * API Consegne Lavanderia al Magazzino
 * 
 * GET  → Lista consegne (prossimi 7 giorni)
 * POST → Azioni: start (prendi in lavorazione), complete (conferma consegna)
 * 
 * Collection: laundryDeliveries
 * Documento per giorno con dateKey come ID (es. "2026-03-31")
 */

// GET — Lista consegne
export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const role = user.role?.toUpperCase();
  if (role !== "LAVANDERIA" && role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  try {
    const snap = await adminDb.collection("laundryDeliveries").get();
    const deliveries: any[] = [];
    
    snap.docs.forEach(doc => {
      const data = doc.data();
      deliveries.push({
        id: doc.id,
        dateKey: data.dateKey || doc.id,
        status: data.status || "PENDING",
        requestedItems: data.requestedItems || {},
        deliveredItems: data.deliveredItems || {},
        startedAt: data.startedAt?.toDate?.()?.toISOString() || null,
        completedAt: data.completedAt?.toDate?.()?.toISOString() || null,
        completedByName: data.completedByName || null,
        inventoryApplied: data.inventoryApplied || false,
      });
    });

    return NextResponse.json({ deliveries });
  } catch (error) {
    console.error("Errore caricamento consegne lavanderia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// POST — Azioni: start, complete
export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const role = user.role?.toUpperCase();
  if (role !== "LAVANDERIA" && role !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, dateKey, requestedItems, deliveredItems } = body;

    if (!dateKey) {
      return NextResponse.json({ error: "dateKey richiesto" }, { status: 400 });
    }

    const docRef = adminDb.collection("laundryDeliveries").doc(dateKey);
    const docSnap = await docRef.get();
    const now = Timestamp.now();

    if (action === "start") {
      // Prendi in lavorazione — crea il documento se non esiste
      if (docSnap.exists) {
        const currentStatus = docSnap.data()?.status;
        if (currentStatus === "COMPLETED") {
          return NextResponse.json({ error: "Consegna già completata" }, { status: 400 });
        }
        if (currentStatus === "IN_PROGRESS") {
          // Già in lavorazione, non sovrascrivere — aggiorna solo requestedItems se cambiati
          await docRef.update({ requestedItems: requestedItems || {}, updatedAt: now });
          return NextResponse.json({ success: true, status: "IN_PROGRESS" });
        }
      }

      await docRef.set({
        dateKey,
        status: "IN_PROGRESS",
        requestedItems: requestedItems || {},
        deliveredItems: {},
        startedAt: now,
        startedBy: user.id,
        startedByName: user.name || user.email,
        inventoryApplied: false,
        updatedAt: now,
      });

      return NextResponse.json({ success: true, status: "IN_PROGRESS" });

    } else if (action === "complete") {
      // Completa la consegna
      if (!docSnap.exists) {
        return NextResponse.json({ error: "Consegna non trovata" }, { status: 404 });
      }
      
      const currentData = docSnap.data();
      if (currentData?.status === "COMPLETED") {
        return NextResponse.json({ error: "Consegna già completata" }, { status: 400 });
      }

      if (!deliveredItems || Object.keys(deliveredItems).length === 0) {
        return NextResponse.json({ error: "Inserire le quantità consegnate" }, { status: 400 });
      }

      await docRef.update({
        status: "COMPLETED",
        deliveredItems: deliveredItems,
        completedAt: now,
        completedBy: user.id,
        completedByName: user.name || user.email,
        updatedAt: now,
      });

      return NextResponse.json({ success: true, status: "COMPLETED" });

    } else if (action === "save") {
      // Salvataggio parziale delle quantità (senza completare)
      if (!docSnap.exists) {
        return NextResponse.json({ error: "Consegna non trovata" }, { status: 404 });
      }
      
      const currentData = docSnap.data();
      if (currentData?.status === "COMPLETED") {
        return NextResponse.json({ error: "Consegna già completata" }, { status: 400 });
      }

      await docRef.update({
        deliveredItems: deliveredItems || {},
        updatedAt: now,
      });

      return NextResponse.json({ success: true, status: "saved" });

    } else {
      return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
    }

  } catch (error) {
    console.error("Errore consegna lavanderia:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
