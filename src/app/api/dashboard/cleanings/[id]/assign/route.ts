import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCleaningById, getUsers } from "~/lib/firebase/firestore-data";
import { doc, updateDoc, Timestamp, addDoc, collection } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// Funzione per inviare notifica all'operatore
async function notifyOperatorCleaningAssigned(
  operatorId: string,
  operatorName: string,
  propertyName: string,
  propertyAddress: string,
  scheduledDate: any,
  cleaningId: string
) {
  try {
    // Formatta la data
    let dateStr = "Oggi";
    if (scheduledDate?.toDate) {
      dateStr = scheduledDate.toDate().toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long"
      });
    } else if (scheduledDate) {
      dateStr = new Date(scheduledDate).toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long"
      });
    }

    await addDoc(collection(db, "notifications"), {
      title: "🧹 Nuova pulizia assegnata",
      message: `Ti è stata assegnata la pulizia di "${propertyName}" per ${dateStr}`,
      type: "CLEANING_ASSIGNED",
      recipientRole: "OPERATORE_PULIZIE",
      recipientId: operatorId,
      senderId: "system",
      senderName: "Sistema",
      status: "UNREAD",
      actionRequired: false,
      relatedEntityId: cleaningId,
      relatedEntityType: "CLEANING",
      relatedEntityName: propertyName,
      link: `/operatore/pulizie/${cleaningId}`,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    console.log("📬 Notifica pulizia inviata all'operatore:", operatorName, operatorId);
  } catch (error) {
    console.error("Errore invio notifica operatore:", error);
  }
}

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
      return NextResponse.json({ error: "Operatore già assegnato a questa pulizia" }, { status: 400 });
    }

    // 🔥 FIX: Costruisci il nome completo (name + surname), con fallback
    let operatorFullName = "";
    if (operator.name && operator.name.trim() !== '') {
      operatorFullName = operator.name.trim();
    }
    if (operator.surname && operator.surname.trim() !== '') {
      operatorFullName += (operatorFullName ? " " : "") + operator.surname.trim();
    }
    // Se ancora vuoto, usa l'email come fallback
    if (!operatorFullName) {
      operatorFullName = operator.email?.split('@')[0] || "Operatore";
    }
    
    console.log("👤 Nome operatore:", operatorFullName);

    // AGGIUNGI il nuovo operatore all'array
    const newOperators = [...existingOperators, { id: operatorId, name: operatorFullName }];
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

    // 📬 Notifica all'operatore appena assegnato
    await notifyOperatorCleaningAssigned(
      operatorId,
      operatorFullName,
      cleaning.propertyName || "Proprietà",
      cleaning.propertyAddress || "",
      cleaning.scheduledDate,
      id
    );

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