import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, AssignOperatorSchema } from "~/lib/validation/schemas";
import {
  checkPlannedAvailability,
  forceShiftOnException,
  dateKeyFromScheduled,
} from "~/lib/shifts/plannedAvailability";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// HELPER: Ottieni utente da cookie
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// HELPER: Carica operatori
// ═══════════════════════════════════════════════════════════════

async function getOperators() {
  const operatorsQuery = adminDb.collection("users").where("role", "==", "OPERATORE_PULIZIE");
  const snapshot = await operatorsQuery.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
}

// ═══════════════════════════════════════════════════════════════
// POST - Assegna operatore a pulizia
// ═══════════════════════════════════════════════════════════════

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Solo admin può assegnare
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può assegnare operatori" }, { status: 403 });
    }

    const { id } = await params;
    const body = await validateBody(request, AssignOperatorSchema);
    if (body instanceof Response) return body;
    const { operatorId, force, forceReason } = body;

    // Carica pulizia
    const cleaningRef = adminDb.collection("cleanings").doc(id);
    const cleaningSnap = await cleaningRef.get();

    if (!cleaningSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = cleaningSnap.data();

    // Verifica stato - non assegnare a pulizie in corso o completate
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.status === "IN_PROGRESS" || cleaning.status === "COMPLETED") {
      return NextResponse.json({ 
        error: "Non puoi assegnare operatori a pulizie in corso o completate" 
      }, { status: 400 });
    }

    // Carica operatore
    const operatorDoc = await adminDb.collection("users").doc(operatorId).get();
    
    if (!operatorDoc.exists) {
      return NextResponse.json({ error: "Operatore non trovato" }, { status: 404 });
    }

    const operator = operatorDoc.data() as Record<string, any>;

    if (operator.role !== "OPERATORE_PULIZIE") {
      return NextResponse.json({ error: "L'utente non è un operatore" }, { status: 400 });
    }

    // Verifica nome valido
    const operatorName = operator.name || operator.displayName;
    if (!operatorName || operatorName.trim() === '') {
      return NextResponse.json({ error: "Operatore senza nome valido" }, { status: 400 });
    }

    // ─── CHECK TURNO PIANIFICATO (pagina Turni) ───
    // Se l'operatore non è in turno il giorno della pulizia: 409 SHIFT_UNAVAILABLE.
    // Con force=true si procede comunque e si crea l'eccezione "ON" (urgenza) + notifica.
    // `operator` è il doc utente completo → contiene workSchedule, niente lettura extra.
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    const shiftDateKey = dateKeyFromScheduled(cleaning.scheduledDate);
    if (shiftDateKey) {
      const avail = await checkPlannedAvailability(operatorId, shiftDateKey, operator);
      if (!avail.available) {
        if (!force) {
          const dateLabel = new Date(shiftDateKey + "T12:00:00Z").toLocaleDateString("it-IT", {
            timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long",
          });
          return NextResponse.json({
            error: `${operatorName} non è in turno ${dateLabel}`,
            code: "SHIFT_UNAVAILABLE",
            conflicts: [{ userId: operatorId, userName: operatorName, dateKey: shiftDateKey }],
          }, { status: 409 });
        }
        await forceShiftOnException({
          userId: operatorId,
          userName: operatorName,
          userRole: "OPERATORE_PULIZIE",
          dateKey: shiftDateKey,
          createdBy: { id: user.id, name: user.name || user.email || "Admin" },
          reason: forceReason,
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          contextLabel: cleaning.propertyName,
        });
      }
    }

    // ─── GESTISCI ARRAY OPERATORI ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    let existingOperators: Array<{ id: string; name: string }> = cleaning.operators || [];

    // Migra vecchio formato singolo
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (existingOperators.length === 0 && cleaning.operatorId) {
      existingOperators = [{
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        id: cleaning.operatorId,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
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
    await cleaningRef.update({
      operators: newOperators,
      operatorId: newOperators[0].id,
      operatorName: newOperators[0].name,
      operator: newOperators[0] || null, // sync campo legacy (fallback card)
      status: "ASSIGNED",
      assignedBy: user.id,
      assignedAt: now,
      updatedAt: now,
    });

    // ─── NOTIFICA OPERATORE ───
    try {
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long"
      }) || "data da definire";

      await createNotification({
        title: "🧹 Nuova pulizia assegnata",
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        message: `Ti è stata assegnata la pulizia di "${cleaning.propertyName}" per ${dateStr}`,
        type: "CLEANING_ASSIGNED",
        recipientRole: "OPERATORE_PULIZIE",
        recipientId: operatorId,
        senderId: user.id,
        senderName: user.name || user.email,
        relatedEntityId: id,
        relatedEntityType: "CLEANING",
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        relatedEntityName: cleaning.propertyName,
        link: `/operatore/pulizie/${id}`,
      });
    } catch (notifError) {
      console.error("Errore notifica operatore:", notifError);
    }

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
    const user = await getApiUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Solo admin può rimuovere
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin può rimuovere operatori" }, { status: 403 });
    }

    const { id } = await params;
    const body = await validateBody(request, AssignOperatorSchema);
    if (body instanceof Response) return body;
    const { operatorId } = body;

    // Carica pulizia
    const cleaningRef = adminDb.collection("cleanings").doc(id);
    const cleaningSnap = await cleaningRef.get();

    if (!cleaningSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = cleaningSnap.data();

    // Verifica stato - non rimuovere da pulizie in corso o completate
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.status === "IN_PROGRESS" || cleaning.status === "COMPLETED") {
      return NextResponse.json({ 
        error: "Non puoi rimuovere operatori da pulizie in corso o completate" 
      }, { status: 400 });
    }

    // ─── GESTISCI ARRAY OPERATORI ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    let existingOperators: Array<{ id: string; name: string }> = cleaning.operators || [];

    // Migra vecchio formato singolo
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (existingOperators.length === 0 && cleaning.operatorId) {
      existingOperators = [{
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        id: cleaning.operatorId,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        name: cleaning.operatorName || "Operatore"
      }];
    }

    // Rimuovi operatore
    const newOperators = existingOperators.filter(op => op.id !== operatorId);

    const now = Timestamp.now();

    // ─── AGGIORNA PULIZIA ───
    await cleaningRef.update({
      operators: newOperators,
      operatorId: newOperators[0]?.id || "",
      operatorName: newOperators[0]?.name || "",
      operator: newOperators[0] || null, // sync campo legacy (fallback card)
      status: newOperators.length > 0 ? "ASSIGNED" : "SCHEDULED",
      updatedAt: now,
    });

    // ─── NOTIFICA OPERATORE RIMOSSO ───
    try {
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short"
      }) || "";

      await createNotification({
        title: "❌ Assegnazione rimossa",
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        message: `Sei stato rimosso dalla pulizia di "${cleaning.propertyName}" del ${dateStr}`,
        type: "INFO",
        recipientRole: "OPERATORE_PULIZIE",
        recipientId: operatorId,
        senderId: user.id,
        senderName: user.name || user.email,
        relatedEntityId: id,
        relatedEntityType: "CLEANING",
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        relatedEntityName: cleaning.propertyName,
        link: `/operatore`,
      });
    } catch (notifError) {
      console.error("Errore notifica operatore:", notifError);
    }

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
    const user = await getApiUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;

    // Carica pulizia
    const cleaningRef = adminDb.collection("cleanings").doc(id);
    const cleaningSnap = await cleaningRef.get();

    if (!cleaningSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = cleaningSnap.data();

    // Carica tutti gli operatori
    const allOperators = await getOperators();

    // Operatori già assegnati
    const assignedIds = new Set(
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      (cleaning.operators || []).map((op: { id: string }) => op.id)
    );
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.operatorId) {
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
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
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      assignedOperators: cleaning.operators || [],
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      cleaningStatus: cleaning.status,
    });
  } catch (error) {
    console.error("❌ Errore GET assign:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
