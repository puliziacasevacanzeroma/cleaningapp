import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc,
  collection,
  query,
  where,
  getDocs,
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
// HELPER: Verifica permessi su pulizia
// ═══════════════════════════════════════════════════════════════

interface PermissionResult {
  allowed: boolean;
  reason?: string;
  isAdmin: boolean;
  isOwner: boolean;
  isOperator: boolean;
}

async function checkCleaningPermission(
  user: any, 
  cleaning: any,
  action: "view" | "edit" | "delete"
): Promise<PermissionResult> {
  const isAdmin = user.role === "ADMIN";
  const isOwner = cleaning.ownerId === user.id;
  const isOperator = 
    cleaning.operatorId === user.id ||
    (cleaning.operators || []).some((op: { id: string }) => op.id === user.id);

  // Admin può fare tutto
  if (isAdmin) {
    return { allowed: true, isAdmin, isOwner, isOperator };
  }

  // Proprietario
  if (isOwner) {
    if (action === "view") return { allowed: true, isAdmin, isOwner, isOperator };
    if (action === "edit") {
      // Proprietario può modificare solo se non in corso o completata
      const blockedStatuses = ["IN_PROGRESS", "COMPLETED", "VERIFIED"];
      if (blockedStatuses.includes(cleaning.status)) {
        return { 
          allowed: false, 
          reason: "Non puoi modificare una pulizia in corso o completata",
          isAdmin, isOwner, isOperator 
        };
      }
      return { allowed: true, isAdmin, isOwner, isOperator };
    }
    if (action === "delete") {
      // Proprietario può cancellare solo se pending
      if (cleaning.status !== "SCHEDULED" && cleaning.status !== "pending") {
        return { 
          allowed: false, 
          reason: "Puoi cancellare solo pulizie non ancora iniziate",
          isAdmin, isOwner, isOperator 
        };
      }
      return { allowed: true, isAdmin, isOwner, isOperator };
    }
  }

  // Operatore assegnato
  if (isOperator) {
    if (action === "view") return { allowed: true, isAdmin, isOwner, isOperator };
    // Operatore non può modificare o cancellare, può solo usare start/complete
    return { 
      allowed: false, 
      reason: "Non hai i permessi per questa azione",
      isAdmin, isOwner, isOperator 
    };
  }

  return { 
    allowed: false, 
    reason: "Non hai accesso a questa pulizia",
    isAdmin, isOwner, isOperator 
  };
}

// ═══════════════════════════════════════════════════════════════
// GET - Dettaglio pulizia con controllo permessi
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

    const cleaning = { id: cleaningSnap.id, ...cleaningSnap.data() };

    // Verifica permessi
    const permission = await checkCleaningPermission(user, cleaning, "view");
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason }, { status: 403 });
    }

    // Carica proprietà per dati aggiuntivi
    let property = null;
    if ((cleaning as any).propertyId) {
      const propertySnap = await getDoc(doc(db, "properties", (cleaning as any).propertyId));
      if (propertySnap.exists()) {
        property = { id: propertySnap.id, ...propertySnap.data() };
      }
    }

    // Carica operatore se assegnato
    let operator = null;
    if ((cleaning as any).operatorId) {
      const operatorSnap = await getDoc(doc(db, "users", (cleaning as any).operatorId));
      if (operatorSnap.exists()) {
        const opData = operatorSnap.data();
        operator = {
          id: operatorSnap.id,
          name: opData.name || opData.displayName || "Operatore",
          email: opData.email,
          phone: opData.phone,
        };
      }
    }

    // Costruisci risposta completa
    const cleaningData = cleaning as any;
    
    const response = {
      id: cleaning.id,
      
      // Date
      scheduledDate: cleaningData.scheduledDate?.toDate?.() || new Date(),
      scheduledTime: cleaningData.scheduledTime || "10:00",
      originalDate: cleaningData.originalDate?.toDate?.() || null,
      
      // Status e tipo
      status: cleaningData.status || "pending",
      type: cleaningData.type || "checkout",
      priority: cleaningData.priority || "normal",
      
      // Service type
      serviceTypeId: cleaningData.serviceTypeId || null,
      serviceTypeName: cleaningData.serviceTypeName || "Standard",
      serviceTypeCode: cleaningData.serviceTypeCode || "STANDARD",
      
      // Prezzi
      basePrice: cleaningData.basePrice || cleaningData.price || 0,
      holidayFee: cleaningData.holidayFee || 0,
      holidayName: cleaningData.holidayName || null,
      extraChargesTotal: cleaningData.extraChargesTotal || 0,
      finalPrice: cleaningData.finalPrice || cleaningData.price || 0,
      
      // Proprietà
      propertyId: cleaningData.propertyId || "",
      property: property ? {
        id: property.id,
        name: (property as any).name || cleaningData.propertyName || "",
        address: (property as any).address || cleaningData.propertyAddress || "",
        city: (property as any).city || "",
        bedrooms: (property as any).bedrooms || 1,
        bathrooms: (property as any).bathrooms || 1,
      } : {
        id: cleaningData.propertyId || "",
        name: cleaningData.propertyName || "",
        address: cleaningData.propertyAddress || "",
        city: cleaningData.propertyCity || "",
      },
      
      // Owner
      ownerId: cleaningData.ownerId || "",
      ownerName: cleaningData.ownerName || "",
      
      // Operatore
      operatorId: cleaningData.operatorId || null,
      operatorName: cleaningData.operatorName || null,
      operator: operator,
      operators: cleaningData.operators || [],
      assignedAt: cleaningData.assignedAt?.toDate?.() || null,
      assignedBy: cleaningData.assignedBy || null,
      
      // Ospiti
      guestsCount: cleaningData.guestsCount || 2,
      
      // Booking
      bookingId: cleaningData.bookingId || null,
      bookingSource: cleaningData.bookingSource || null,
      externalUid: cleaningData.externalUid || null,
      guestName: cleaningData.guestName || "",
      
      // Esecuzione
      startedAt: cleaningData.startedAt?.toDate?.() || null,
      startedBy: cleaningData.startedBy || null,
      completedAt: cleaningData.completedAt?.toDate?.() || null,
      completedBy: cleaningData.completedBy || null,
      duration: cleaningData.duration || null,
      estimatedDuration: cleaningData.estimatedDuration || 90,
      
      // Checklist
      checklistCompleted: cleaningData.checklistCompleted || false,
      checklistItems: cleaningData.checklistItems || [],
      
      // Foto e issues
      photosCount: cleaningData.photosCount || 0,
      photoIds: cleaningData.photoIds || [],
      issuesCount: cleaningData.issuesCount || 0,
      issueIds: cleaningData.issueIds || [],
      extraChargeIds: cleaningData.extraChargeIds || [],
      
      // Rating
      ratingId: cleaningData.ratingId || null,
      averageRating: cleaningData.averageRating || null,
      
      // Note
      adminNotes: permission.isAdmin ? cleaningData.adminNotes || "" : undefined,
      ownerNotes: (permission.isAdmin || permission.isOwner) ? cleaningData.ownerNotes || "" : undefined,
      operatorNotes: cleaningData.operatorNotes || "",
      notes: cleaningData.notes || "",
      
      // Biancheria
      laundryOrderId: cleaningData.laundryOrderId || null,
      requiresLaundry: cleaningData.requiresLaundry || false,
      
      // Cancellazione
      cancelledAt: cleaningData.cancelledAt?.toDate?.() || null,
      cancelledBy: cleaningData.cancelledBy || null,
      cancellationReason: cleaningData.cancellationReason || null,
      
      // Verifica
      verifiedAt: cleaningData.verifiedAt?.toDate?.() || null,
      verifiedBy: cleaningData.verifiedBy || null,
      verificationNotes: cleaningData.verificationNotes || null,
      
      // Tracking
      createdAt: cleaningData.createdAt?.toDate?.() || null,
      createdBy: cleaningData.createdBy || null,
      updatedAt: cleaningData.updatedAt?.toDate?.() || null,
      
      // Meta permessi
      _permissions: {
        canEdit: (await checkCleaningPermission(user, cleaning, "edit")).allowed,
        canDelete: (await checkCleaningPermission(user, cleaning, "delete")).allowed,
        isAdmin: permission.isAdmin,
        isOwner: permission.isOwner,
        isOperator: permission.isOperator,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Errore GET cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH - Modifica pulizia con controllo permessi
// ═══════════════════════════════════════════════════════════════

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Carica pulizia esistente
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);

    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = cleaningSnap.data();

    // Verifica permessi
    const permission = await checkCleaningPermission(user, cleaning, "edit");
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason }, { status: 403 });
    }

    // Campi aggiornabili
    const {
      scheduledDate,
      scheduledTime,
      status,
      priority,
      guestsCount,
      operatorId,
      operatorName,
      operators,
      adminNotes,
      ownerNotes,
      notes,
      checkInTime,
      checkOutTime,
    } = body;

    const now = Timestamp.now();
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    let dateChanged = false;
    const existingDate = cleaning.scheduledDate?.toDate?.();

    // ─── AGGIORNA CAMPI ───
    
    if (scheduledDate !== undefined) {
      const newDate = new Date(scheduledDate);
      newDate.setHours(12, 0, 0, 0); // Mezzogiorno per timezone
      
      if (existingDate) {
        const existingDateStr = existingDate.toISOString().split('T')[0];
        const newDateStr = newDate.toISOString().split('T')[0];
        
        if (existingDateStr !== newDateStr) {
          dateChanged = true;
          
          // Salva data originale
          if (!cleaning.originalDate) {
            updateData.originalDate = cleaning.scheduledDate;
          }
          
          // Crea esclusione sync se da iCal
          if (cleaning.bookingSource || cleaning.externalUid) {
            await addDoc(collection(db, "syncExclusions"), {
              propertyId: cleaning.propertyId,
              originalDate: cleaning.scheduledDate,
              bookingSource: cleaning.bookingSource || "manual",
              bookingId: cleaning.bookingId || null,
              reason: "MOVED",
              newDate: Timestamp.fromDate(newDate),
              cleaningId: id,
              createdAt: now,
              createdBy: user.id,
            });
            
            console.log(`🔐 Esclusione sync creata per spostamento pulizia`);
          }
          
          updateData.movedAt = now;
          updateData.movedBy = user.id;
          updateData.manuallyModified = true;
        }
      }
      
      updateData.scheduledDate = Timestamp.fromDate(newDate);
    }

    if (scheduledTime !== undefined) updateData.scheduledTime = scheduledTime;
    if (guestsCount !== undefined) updateData.guestsCount = guestsCount;
    if (notes !== undefined) updateData.notes = notes;
    if (checkInTime !== undefined) updateData.checkInTime = checkInTime;
    if (checkOutTime !== undefined) updateData.checkOutTime = checkOutTime;

    // Campi solo admin
    if (permission.isAdmin) {
      if (status !== undefined) updateData.status = status.toUpperCase();
      if (priority !== undefined) updateData.priority = priority;
      if (operatorId !== undefined) updateData.operatorId = operatorId;
      if (operatorName !== undefined) updateData.operatorName = operatorName;
      if (operators !== undefined) updateData.operators = operators;
      if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    }

    // Campi owner o admin
    if (permission.isAdmin || permission.isOwner) {
      if (ownerNotes !== undefined) updateData.ownerNotes = ownerNotes;
    }

    // Aggiorna
    await updateDoc(cleaningRef, updateData);

    // ─── AGGIORNA ORDINE COLLEGATO SE CAMBIA ORARIO ───
    if (scheduledTime !== undefined || scheduledDate !== undefined) {
      try {
        const ordersQuery = query(
          collection(db, "orders"),
          where("cleaningId", "==", id)
        );
        const ordersSnap = await getDocs(ordersQuery);
        
        for (const orderDoc of ordersSnap.docs) {
          const orderUpdate: any = { updatedAt: Timestamp.now() };
          if (scheduledTime !== undefined) orderUpdate.scheduledTime = scheduledTime;
          if (scheduledDate !== undefined) orderUpdate.scheduledDate = updateData.scheduledDate;
          
          await updateDoc(doc(db, "orders", orderDoc.id), orderUpdate);
          console.log(`📦 Ordine ${orderDoc.id} aggiornato con nuovo orario/data`);
        }
      } catch (orderError) {
        console.error("Errore aggiornamento ordini collegati:", orderError);
      }
    }

    // ─── NOTIFICA SE DATA CAMBIATA ───
    if (dateChanged && cleaning.operatorId) {
      const oldDateStr = existingDate?.toLocaleDateString("it-IT", {
        weekday: "short", day: "numeric", month: "short"
      }) || "";
      const newDateStr = new Date(scheduledDate).toLocaleDateString("it-IT", {
        weekday: "short", day: "numeric", month: "short"
      });

      try {
        await createNotification({
          title: "📅 Pulizia spostata",
          message: `La pulizia di "${cleaning.propertyName}" è stata spostata da ${oldDateStr} a ${newDateStr}`,
          type: "INFO",
          recipientRole: "OPERATORE_PULIZIE",
          recipientId: cleaning.operatorId,
          senderId: user.id,
          senderName: user.name || user.email,
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          relatedEntityName: cleaning.propertyName,
          link: `/operatore`,
        });
      } catch (notifError) {
        console.error("Errore notifica:", notifError);
      }
    }

    console.log(`✅ Pulizia ${id} aggiornata`);

    return NextResponse.json({
      success: true,
      dateChanged,
      message: dateChanged 
        ? "Pulizia spostata. La data originale non verrà ricreata dalla sync."
        : "Pulizia aggiornata",
    });
  } catch (error) {
    console.error("❌ Errore PATCH cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE - Elimina pulizia (solo se pending, altrimenti usa cancel)
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

    const { id } = await params;

    // Carica pulizia
    const cleaningRef = doc(db, "cleanings", id);
    const cleaningSnap = await getDoc(cleaningRef);

    if (!cleaningSnap.exists()) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = cleaningSnap.data();

    // Verifica permessi
    const permission = await checkCleaningPermission(user, cleaning, "delete");
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason }, { status: 403 });
    }

    // Verifica stato - DELETE solo per pending/scheduled
    const deletableStatuses = ["SCHEDULED", "pending", "PENDING"];
    if (!deletableStatuses.includes(cleaning.status) && !permission.isAdmin) {
      return NextResponse.json({ 
        error: "Usa l'endpoint /cancel per annullare pulizie non pending" 
      }, { status: 400 });
    }

    const now = Timestamp.now();

    // ─── CREA ESCLUSIONE SYNC ───
    if (cleaning.bookingSource || cleaning.externalUid) {
      await addDoc(collection(db, "syncExclusions"), {
        propertyId: cleaning.propertyId,
        originalDate: cleaning.scheduledDate,
        bookingSource: cleaning.bookingSource || "manual",
        bookingId: cleaning.bookingId || null,
        reason: "DELETED",
        createdAt: now,
        createdBy: user.id,
      });

      // Crea anche record di pulizia cancellata
      await addDoc(collection(db, "cancelledCleanings"), {
        propertyId: cleaning.propertyId,
        originalDate: cleaning.scheduledDate,
        externalUid: cleaning.externalUid || null,
        bookingSource: cleaning.bookingSource || null,
        reason: "Eliminata manualmente",
        cleaningId: id,
        cancelledBy: user.id,
        cancelledByName: user.name || user.email,
        cancelledAt: now,
      });

      console.log(`🔐 Esclusione sync creata per pulizia eliminata`);
    }

    // ─── NOTIFICA OPERATORE ───
    if (cleaning.operatorId && cleaning.operatorId !== user.id) {
      try {
        const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
          weekday: "short", day: "numeric", month: "short"
        }) || "";

        await createNotification({
          title: "❌ Pulizia eliminata",
          message: `La pulizia di "${cleaning.propertyName}" del ${dateStr} è stata eliminata`,
          type: "WARNING",
          recipientRole: "OPERATORE_PULIZIE",
          recipientId: cleaning.operatorId,
          senderId: user.id,
          senderName: user.name || user.email,
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          relatedEntityName: cleaning.propertyName,
        });
      } catch (notifError) {
        console.error("Errore notifica:", notifError);
      }
    }

    // ─── ELIMINA ORDINE BIANCHERIA COLLEGATO ───
    try {
      const ordersQuery = query(
        collection(db, "orders"),
        where("cleaningId", "==", id)
      );
      const ordersSnap = await getDocs(ordersQuery);
      
      if (!ordersSnap.empty) {
        for (const orderDoc of ordersSnap.docs) {
          const orderData = orderDoc.data();
          // Elimina solo se non già consegnato
          if (orderData.status !== "DELIVERED") {
            await deleteDoc(doc(db, "orders", orderDoc.id));
            console.log(`🗑️ Ordine biancheria ${orderDoc.id} eliminato (collegato a pulizia ${id})`);
          }
        }
      }
    } catch (orderError) {
      console.error("Errore eliminazione ordini collegati:", orderError);
    }

    // ─── ELIMINA PULIZIA ───
    await deleteDoc(cleaningRef);

    console.log(`🗑️ Pulizia ${id} eliminata`);

    return NextResponse.json({
      success: true,
      excluded: !!(cleaning.bookingSource || cleaning.externalUid),
      message: (cleaning.bookingSource || cleaning.externalUid)
        ? "Pulizia eliminata. Non verrà ricreata dalla sincronizzazione."
        : "Pulizia eliminata.",
    });
  } catch (error) {
    console.error("❌ Errore DELETE cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
