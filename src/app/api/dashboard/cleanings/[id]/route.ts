import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, deleteDoc, addDoc, updateDoc, collection, Timestamp } from "firebase/firestore";
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

// GET - Ottieni singola pulizia
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const docSnap = await getDoc(doc(db, "cleanings", id));

    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = { id: docSnap.id, ...docSnap.data() };
    const propertySnap = await getDoc(doc(db, "properties", cleaning.propertyId as string));
    const property = propertySnap.exists() ? propertySnap.data() : null;

    return NextResponse.json({
      id: cleaning.id,
      date: (cleaning.scheduledDate as any)?.toDate?.() || new Date(),
      scheduledTime: cleaning.scheduledTime || "10:00",
      status: cleaning.status || "pending",
      guestsCount: cleaning.guestsCount || 2,
      notes: cleaning.notes || "",
      bookingSource: cleaning.bookingSource || null,
      bookingId: cleaning.bookingId || null,
      property: {
        id: cleaning.propertyId || "",
        name: cleaning.propertyName || property?.name || "Proprietà",
        address: property?.address || "",
      },
      operator: cleaning.operatorId ? {
        id: cleaning.operatorId,
        name: cleaning.operatorName || "Operatore",
      } : null,
    });
  } catch (error) {
    console.error("Errore GET cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modifica pulizia (con gestione esclusione se cambia data)
export async function PATCH(
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
    const { scheduledDate, scheduledTime, guestsCount, status, notes, operatorId, operatorName, operators } = body;

    // Carica pulizia esistente
    const docSnap = await getDoc(doc(db, "cleanings", id));
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const existingCleaning = docSnap.data();
    const existingDate = existingCleaning.scheduledDate?.toDate?.();

    const updateData: Record<string, unknown> = {};
    let dateChanged = false;

    // Se cambia la data, crea esclusione per la data originale
    if (scheduledDate !== undefined) {
      const newDate = new Date(scheduledDate);
      
      if (existingDate) {
        const existingDateStr = existingDate.toISOString().split('T')[0];
        const newDateStr = newDate.toISOString().split('T')[0];
        
        if (existingDateStr !== newDateStr) {
          dateChanged = true;
          
          // 🔐 Crea esclusione per la data ORIGINALE (così non viene ricreata)
          if (existingCleaning.bookingSource) {
            await addDoc(collection(db, "syncExclusions"), {
              propertyId: existingCleaning.propertyId,
              originalDate: existingCleaning.scheduledDate,
              bookingSource: existingCleaning.bookingSource,
              reason: "MOVED",
              newDate: Timestamp.fromDate(newDate),
              cleaningId: id,
              createdAt: Timestamp.now(),
              createdBy: user.id || user.email,
            });
            console.log(`🔐 Esclusione creata: pulizia spostata da ${existingDateStr} a ${newDateStr}`);
          }
        }
      }
      
      updateData.scheduledDate = Timestamp.fromDate(newDate);
    }

    if (scheduledTime !== undefined) updateData.scheduledTime = scheduledTime;
    if (guestsCount !== undefined) updateData.guestsCount = guestsCount;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (operatorId !== undefined) updateData.operatorId = operatorId;
    if (operatorName !== undefined) updateData.operatorName = operatorName;
    if (operators !== undefined) updateData.operators = operators;

    // Marca come modificata manualmente
    if (dateChanged) {
      updateData.manuallyModified = true;
      updateData.modifiedAt = Timestamp.now();
      updateData.modifiedBy = user.id || user.email;
    }

    updateData.updatedAt = Timestamp.now();

    await updateDoc(doc(db, "cleanings", id), updateData);

    return NextResponse.json({
      success: true,
      dateChanged,
      message: dateChanged 
        ? "Pulizia spostata. La data originale non verrà ricreata dalla sync." 
        : "Pulizia aggiornata",
    });
  } catch (error) {
    console.error("Errore PATCH cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Elimina pulizia (con esclusione dalla sync)
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
    
    // Carica pulizia prima di eliminarla
    const docSnap = await getDoc(doc(db, "cleanings", id));
    if (!docSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = docSnap.data();

    // 🔐 Se la pulizia era collegata a una prenotazione iCal, crea esclusione
    if (cleaning.bookingSource && cleaning.scheduledDate) {
      await addDoc(collection(db, "syncExclusions"), {
        propertyId: cleaning.propertyId,
        originalDate: cleaning.scheduledDate,
        bookingSource: cleaning.bookingSource,
        bookingId: cleaning.bookingId || null,
        reason: "DELETED",
        createdAt: Timestamp.now(),
        createdBy: user.id || user.email,
      });
      
      const dateStr = cleaning.scheduledDate.toDate?.().toLocaleDateString("it-IT") || "?";
      console.log(`🔐 Esclusione creata: pulizia eliminata per ${cleaning.propertyName} del ${dateStr}`);
    }

    // Elimina la pulizia
    await deleteDoc(doc(db, "cleanings", id));

    return NextResponse.json({ 
      success: true,
      excluded: !!cleaning.bookingSource,
      message: cleaning.bookingSource 
        ? "Pulizia eliminata. Non verrà ricreata dalla sincronizzazione." 
        : "Pulizia eliminata.",
    });
  } catch (error) {
    console.error("Errore DELETE cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
