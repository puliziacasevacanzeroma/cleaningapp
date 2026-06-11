import { NextResponse } from "next/server";
import { getCleaningById, getUsers } from "~/lib/firebase/firestore-data-admin";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { createNotificationDirect } from "~/lib/notifications/createNotification";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, AssignOperatorSchema } from "~/lib/validation/schemas";
import {
  checkPlannedAvailability,
  forceShiftOnException,
  dateKeyFromScheduled,
} from "~/lib/shifts/plannedAvailability";

export const dynamic = 'force-dynamic';

// Funzione per inviare notifica all'operatore (con supporto push)
async function notifyOperatorCleaningAssigned(
  operatorId: string,
  operatorName: string,
  propertyName: string,
  propertyAddress: string,
  scheduledDate: any,
  cleaningId: string,
  senderId: string,
  senderName: string
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

    const result = await createNotificationDirect({
      type: "CLEANING_ASSIGNED",
      recipientRole: "OPERATORE_PULIZIE",
      recipientId: operatorId,
      senderId: senderId,
      senderName: senderName,
      customTitle: "🧹 Nuova pulizia assegnata",
      customMessage: `Ti è stata assegnata la pulizia di "${propertyName}" per ${dateStr}`,
      relatedEntityId: cleaningId,
      relatedEntityType: "CLEANING",
      relatedEntityName: propertyName,
      link: `/operatore/pulizie/${cleaningId}`,
      sendPush: true,
    });
    
    if (!result.success) {
      console.error("❌ Errore creazione notifica:", result.error);
    }
  } catch (error) {
    console.error("Errore invio notifica operatore:", error);
  }
}

// POST - AGGIUNGI operatore (non sovrascrive!)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(request, AssignOperatorSchema);
    if (body instanceof Response) return body;
    const { operatorId, force, forceReason } = body;

    if (!operatorId) {
      return NextResponse.json({ error: "operatorId richiesto" }, { status: 400 });
    }

    // Trova il nome dell'operatore
    const allOperators = await getUsers("OPERATORE_PULIZIE");
    const operator = allOperators.find(o => o.id === operatorId);

    if (!operator) {
      if (process.env.NODE_ENV !== "production") console.log("❌ Operatore non trovato:", operatorId);
      return NextResponse.json({ error: "Operatore non trovato" }, { status: 404 });
    }

    // Carica la pulizia corrente
    const cleaning = await getCleaningById(id);
    if (!cleaning) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    // LEGGI l'array esistente di operatori
    let existingOperators: Array<{id: string, name: string}> = (cleaning as any).operators || [];
    
    // Migra il vecchio operatorId singolo se esiste e l'array è vuoto
    if (existingOperators.length === 0 && (cleaning as any).operatorId) {
      existingOperators = [{
        id: (cleaning as any).operatorId,
        name: (cleaning as any).operatorName || "Operatore"
      }];
    }

    // Controlla se l'operatore è già assegnato
    if (existingOperators.some(op => op.id === operatorId)) {
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

    // ─── CHECK TURNO PIANIFICATO (pagina Turni) ───
    // NOTA: getUsers() STRIPPA workSchedule, quindi qui NON passiamo l'oggetto
    // operator come userData: checkPlannedAvailability rilegge il doc utente
    // completo da Firestore (altrimenti il check risulterebbe sempre "disponibile").
    const shiftDateKey = dateKeyFromScheduled((cleaning as any).scheduledDate);
    if (shiftDateKey) {
      const avail = await checkPlannedAvailability(operatorId, shiftDateKey);
      if (!avail.available) {
        if (!force) {
          const dateLabel = new Date(shiftDateKey + "T12:00:00Z").toLocaleDateString("it-IT", {
            timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long",
          });
          return NextResponse.json({
            error: `${operatorFullName} non è in turno ${dateLabel}`,
            code: "SHIFT_UNAVAILABLE",
            conflicts: [{ userId: operatorId, userName: operatorFullName, dateKey: shiftDateKey }],
          }, { status: 409 });
        }
        await forceShiftOnException({
          userId: operatorId,
          userName: operatorFullName,
          userRole: "OPERATORE_PULIZIE",
          dateKey: shiftDateKey,
          createdBy: { id: user.id || "system", name: user.name || user.email || "Admin" },
          reason: forceReason,
          contextLabel: cleaning.propertyName || undefined,
        });
      }
    }

    // AGGIUNGI il nuovo operatore all'array
    const newOperators = [...existingOperators, { id: operatorId, name: operatorFullName }];

    // Aggiorna Firestore con l'array
    await adminDb.collection("cleanings").doc(id).update({
      operators: newOperators,
      operatorId: newOperators[0]?.id || "",
      operatorName: newOperators[0]?.name || "",
      // Campo LEGACY `operator` (singolare): alcune card lo usano come
      // fallback quando `operators` è vuoto. Va tenuto in sync, altrimenti
      // resta un "operatore fantasma" dopo le modifiche via API.
      operator: newOperators[0] || null,
      status: "ASSIGNED",
      updatedAt: Timestamp.now(),
    });

    // 📬 Notifica all'operatore appena assegnato
    await notifyOperatorCleaningAssigned(
      operatorId,
      operatorFullName,
      cleaning.propertyName || "Proprietà",
      cleaning.propertyAddress || "",
      cleaning.scheduledDate,
      id,
      user.id || "system",
      user.name || user.email || "Admin"
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
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    // @ts-expect-error TODO-FIX: TS2304 Cannot find name 'GenericBodySchema'.
    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { operatorId } = body;

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

    // Aggiorna Firestore
    await adminDb.collection("cleanings").doc(id).update({
      operators: newOperators,
      operatorId: newOperators[0]?.id || "",
      operatorName: newOperators[0]?.name || "",
      operator: newOperators[0] || null, // sync campo legacy (vedi POST)
      status: newOperators.length > 0 ? "ASSIGNED" : "SCHEDULED",
      updatedAt: Timestamp.now(),
    });

    // 📬 Notifica operatore rimosso
    try {
      let dateStr = "";
      const sd = (cleaning as any).scheduledDate;
      if (sd?.toDate) {
        dateStr = sd.toDate().toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
      }
      await createNotificationDirect({
        type: "INFO",
        recipientRole: "OPERATORE_PULIZIE",
        recipientId: operatorId,
        senderId: user.id || "system",
        senderName: user.name || user.email || "Admin",
        customTitle: "❌ Assegnazione rimossa",
        customMessage: `Sei stato rimosso dalla pulizia di "${cleaning.propertyName || 'Proprietà'}"${dateStr ? ` del ${dateStr}` : ''}`,
        relatedEntityId: id,
        relatedEntityType: "CLEANING",
        relatedEntityName: cleaning.propertyName || "",
        link: `/operatore`,
        sendPush: true,
      });
    } catch (notifError) {
      console.error("Errore notifica rimozione:", notifError);
    }

    return NextResponse.json({ 
      success: true, 
      operators: newOperators,
    });
  } catch (error) {
    console.error("❌ Errore delete assign:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
