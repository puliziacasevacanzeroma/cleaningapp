import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  doc, 
  getDoc, 
  updateDoc,
  addDoc,
  collection,
  getDocs,
  query,
  where,
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNotification } from "~/lib/firebase/notifications";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// HELPER: Ottieni utente da cookie
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// HELPER: Carica operatori
// ═══════════════════════════════════════════════════════════════

async function getOperators() {
  const operatorsQuery = query(
    collection(db, "users"),
    where("role", "==", "OPERATORE_PULIZIE")
  );
  const snapshot = await getDocs(operatorsQuery);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

// ═══════════════════════════════════════════════════════════════
// POST - Assegna operatore a pulizia
// ═══════════════════════════════════════════════════════════════

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Solo admin può assegnare
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può assegnare operatori" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { operatorId } = body;

    if (!operatorId) {
      return NextResponse.json({ error: "operatorId è obbligatorio" }, { status: 400 });
    }

    // Carica pulizia
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);

    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = cleaningSnap.data();

    // Carica operatore
    const operatorDoc = await getDoc(doc(db, "users", operatorId));
    
    if (!operatorDoc.exists()) {
      return NextResponse.json({ error: "Operatore non trovato" }, { status: 404 });
    }

    const operator = operatorDoc.data();

    if (operator.role !== "OPERATORE_PULIZIE") {
      return NextResponse.json({ error: "L'utente non è un operatore" }, { status: 400 });
    }

    // Verifica nome valido
    const operatorName = operator.name || operator.displayName;
    if (!operatorName || operatorName.trim() === '') {
      return NextResponse.json({ error: "Operatore senza nome valido" }, { status: 400 });
    }

    // ─── GESTISCI ARRAY OPERATORI ───
    let existingOperators: Array<{ id: string; name: string }> = cleaning.operators || [];

    // Migra vecchio formato singolo
    if (existingOperators.length === 0 && cleaning.operatorId) {
      existingOperators = [{
        id: cleaning.operatorId,
        name: cleaning.operatorName || "Operatore"
      }];
    }

    // Verifica se già assegnato
    if (existingOperators.some(op => op.id === operatorId)) {
      return NextResponse.json({ error: "Operatore già assegnato" }, { status: 400 });
    }

    // Aggiungi nuovo operatore
    const newOperators = [...existingOperators, { id: operatorId, name: operatorName }];

    const now = Timestamp.now();

    // ─── AGGIORNA PULIZIA ───
    await updateDoc(cleaningRef, {
      operators: newOperators,
      operatorId: newOperators[0].id,
      operatorName: newOperators[0].name,
      status: "ASSIGNED",
      assignedBy: user.id,
      assignedAt: now,
      updatedAt: now,
    });

    // ─── NOTIFICA OPERATORE ───
    try {
      const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long"
      }) || "data da definire";

      await createNotification({
        title: "🧹 Nuova pulizia assegnata",
        message: `Ti è stata assegnata la pulizia di "${cleaning.propertyName}" per ${dateStr}`,
        type: "CLEANING_ASSIGNED",
        recipientRole: "OPERATORE_PULIZIE",
        recipientId: operatorId,
        senderId: user.id,
        senderName: user.name || user.email,
        relatedEntityId: id,
        relatedEntityType: "CLEANING",
        relatedEntityName: cleaning.propertyName,
        link: `/operatore/pulizie/${id}`,
      });
    } catch (notifError) {
      console.error("Errore notifica operatore:", notifError);
    }

    console.log(`✅ Operatore ${operatorName} assegnato a pulizia ${id}`);

    return NextResponse.json({
      success: true,
      operators: newOperators,
      message: `${operatorName} assegnato alla pulizia`,
    });
  } catch (error) {
    console.error("❌ Errore POST assign:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE - Rimuovi operatore da pulizia
// ═══════════════════════════════════════════════════════════════

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Solo admin può rimuovere
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può rimuovere operatori" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { operatorId } = body;

    if (!operatorId) {
      return NextResponse.json({ error: "operatorId è obbligatorio" }, { status: 400 });
    }

    // Carica pulizia
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);

    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = cleaningSnap.data();

    // Verifica stato - non rimuovere da pulizie in corso o completate
    if (cleaning.status === "IN_PROGRESS" || cleaning.status === "COMPLETED") {
      return NextResponse.json({ 
        error: "Non puoi rimuovere operatori da pulizie in corso o completate" 
      }, { status: 400 });
    }

    // ─── GESTISCI ARRAY OPERATORI ───
    let existingOperators: Array<{ id: string; name: string }> = cleaning.operators || [];

    // Migra vecchio formato singolo
    if (existingOperators.length === 0 && cleaning.operatorId) {
      existingOperators = [{
        id: cleaning.operatorId,
        name: cleaning.operatorName || "Operatore"
      }];
    }

    // Rimuovi operatore
    const newOperators = existingOperators.filter(op => op.id !== operatorId);

    const now = Timestamp.now();

    // ─── AGGIORNA PULIZIA ───
    await updateDoc(cleaningRef, {
      operators: newOperators,
      operatorId: newOperators[0]?.id || "",
      operatorName: newOperators[0]?.name || "",
      status: newOperators.length > 0 ? "ASSIGNED" : "SCHEDULED",
      updatedAt: now,
    });

    // ─── NOTIFICA OPERATORE RIMOSSO ───
    try {
      const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short"
      }) || "";

      await createNotification({
        title: "❌ Assegnazione rimossa",
        message: `Sei stato rimosso dalla pulizia di "${cleaning.propertyName}" del ${dateStr}`,
        type: "INFO",
        recipientRole: "OPERATORE_PULIZIE",
        recipientId: operatorId,
        senderId: user.id,
        senderName: user.name || user.email,
        relatedEntityId: id,
        relatedEntityType: "CLEANING",
        relatedEntityName: cleaning.propertyName,
      });
    } catch (notifError) {
      console.error("Errore notifica operatore:", notifError);
    }

    console.log(`✅ Operatore ${operatorId} rimosso da pulizia ${id}`);

    return NextResponse.json({
      success: true,
      operators: newOperators,
      message: "Operatore rimosso dalla pulizia",
    });
  } catch (error) {
    console.error("❌ Errore DELETE assign:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// GET - Lista operatori disponibili
// ═══════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;

    // Carica pulizia
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);

    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = cleaningSnap.data();

    // Carica tutti gli operatori
    const allOperators = await getOperators();

    // Operatori già assegnati
    const assignedIds = new Set(
      (cleaning.operators || []).map((op: { id: string }) => op.id)
    );
    if (cleaning.operatorId) {
      assignedIds.add(cleaning.operatorId);
    }

    // Formatta risposta
    const operators = allOperators.map((op: any) => ({
      id: op.id,
      name: op.name || op.displayName || "Operatore",
      email: op.email,
      phone: op.phone,
      isAssigned: assignedIds.has(op.id),
    }));

    return NextResponse.json({
      operators,
      assignedOperators: cleaning.operators || [],
      cleaningStatus: cleaning.status,
    });
  } catch (error) {
    console.error("❌ Errore GET assign:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
