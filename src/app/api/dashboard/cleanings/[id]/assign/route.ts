import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCleaningById, getUsers } from "~/lib/firebase/firestore-data";
import { doc, updateDoc, Timestamp } from "firebase/firestore";
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

// POST - AGGIUNGI operatore (non sovrascrive!)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { operatorId } = body;

    console.log("📥 POST assign - cleaningId:", id, "operatorId:", operatorId);

    if (!operatorId) {
      return NextResponse.json({ error: "operatorId richiesto" }, { status: 400 });
    }

    // Trova il nome dell'operatore
    const allOperators = await getUsers("OPERATORE_PULIZIE");
    const operator = allOperators.find(o => o.id === operatorId);

    if (!operator) {
      console.log("❌ Operatore non trovato:", operatorId);
      return NextResponse.json({ error: "Operatore non trovato" }, { status: 404 });
    }

    // Carica la pulizia corrente
    const cleaning = await getCleaningById(id);
    if (!cleaning) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    // LEGGI l'array esistente di operatori
    let existingOperators: Array<{id: string, name: string}> = (cleaning as any).operators || [];
    console.log("📋 Operatori esistenti:", existingOperators);
    
    // Migra il vecchio operatorId singolo se esiste e l'array è vuoto
    if (existingOperators.length === 0 && (cleaning as any).operatorId) {
      existingOperators = [{
        id: (cleaning as any).operatorId,
        name: (cleaning as any).operatorName || "Operatore"
      }];
      console.log("🔄 Migrato da singolo:", existingOperators);
    }

    // Controlla se l'operatore è già assegnato
    if (existingOperators.some(op => op.id === operatorId)) {
      console.log("⚠️ Operatore già assegnato");
      return NextResponse.json({ error: "Operatore già assegnato" }, { status: 400 });
    }

    // 🔥 FIX: Verifica che l'operatore abbia un nome valido
    if (!operator.name || operator.name.trim() === '' || operator.name === 'undefined') {
      console.log("❌ Operatore senza nome valido");
      return NextResponse.json({ error: "Operatore non valido" }, { status: 400 });
    }

    // AGGIUNGI il nuovo operatore all'array
    const newOperators = [...existingOperators, { id: operatorId, name: operator.name }];
    console.log("✅ Nuovi operatori:", newOperators);

    // Aggiorna Firestore con l'array
    await updateDoc(doc(db, "cleanings", id), {
      operators: newOperators,
      operatorId: newOperators[0]?.id || "",
      operatorName: newOperators[0]?.name || "",
      status: "ASSIGNED",
      updatedAt: Timestamp.now(),
    });

    console.log("💾 Salvato in Firestore");

    return NextResponse.json({ 
      success: true, 
      operators: newOperators,
    });
  } catch (error) {
    console.error("❌ Errore assign:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - RIMUOVI singolo operatore
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { operatorId } = body;

    console.log("🗑️ DELETE assign - cleaningId:", id, "operatorId:", operatorId);

    if (!operatorId) {
      return NextResponse.json({ error: "operatorId richiesto" }, { status: 400 });
    }

    // Carica la pulizia corrente
    const cleaning = await getCleaningById(id);
    if (!cleaning) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    // LEGGI l'array esistente
    let existingOperators: Array<{id: string, name: string}> = (cleaning as any).operators || [];
    
    // Migra il vecchio operatorId singolo se l'array è vuoto
    if (existingOperators.length === 0 && (cleaning as any).operatorId) {
      existingOperators = [{
        id: (cleaning as any).operatorId,
        name: (cleaning as any).operatorName || "Operatore"
      }];
    }

    // RIMUOVI solo l'operatore specifico
    const newOperators = existingOperators.filter(op => op.id !== operatorId);
    console.log("✅ Operatori rimasti:", newOperators);

    // Aggiorna Firestore
    await updateDoc(doc(db, "cleanings", id), {
      operators: newOperators,
      operatorId: newOperators[0]?.id || "",
      operatorName: newOperators[0]?.name || "",
      status: newOperators.length > 0 ? "ASSIGNED" : "SCHEDULED",
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ 
      success: true, 
      operators: newOperators,
    });
  } catch (error) {
    console.error("❌ Errore delete assign:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}