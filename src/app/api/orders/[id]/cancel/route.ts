import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

// DELETE - Cancella un ordine standalone (senza cleaningId)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo gli admin possono cancellare consegne" }, { status: 403 });
    }

    const { id } = await params;
    const orderRef = adminDb.collection("orders").doc(id);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }

    const order = orderSnap.data() as Record<string, any>;

    // Non cancellare ordini già consegnati/completati
    if (order.status === "DELIVERED" || order.status === "COMPLETED") {
      return NextResponse.json({ error: "Non puoi cancellare una consegna già completata" }, { status: 400 });
    }

    // Se l'ordine è collegato a una pulizia, non cancellarlo da qui
    if (order.cleaningId) {
      return NextResponse.json({ error: "Questa consegna è collegata a una pulizia. Cancella la pulizia per rimuovere anche la consegna." }, { status: 400 });
    }

    await orderRef.delete();

    return NextResponse.json({ success: true, message: "Consegna cancellata con successo" });
  } catch (error) {
    console.error("Errore cancellazione ordine:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
