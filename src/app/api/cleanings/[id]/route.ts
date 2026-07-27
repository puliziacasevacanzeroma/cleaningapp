import { NextRequest, NextResponse } from "next/server";
import { healCustomConfig, isDegenerateCustomConfig } from "~/lib/linen/linenCore";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { createNotification } from "~/lib/firebase/notifications-admin";
import { getItemName } from "~/lib/itemNames";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, CleaningUpdateSchema } from "~/lib/validation/schemas";
import { transferCreditToNextMonth, checkIfServiceMonthIsPaid } from "~/lib/payments/creditTransfer";
import { confirmLinenDelivery } from "~/lib/cleanings/confirmLinenDelivery";
import { isTransitionToDone } from "~/lib/linen/orderLifecycle";

// ── Tipi locali ──────────────────────────────────────────────────────────────
type AuthUser = { id: string; role: string; status?: string };
type CleaningDoc = {
  id: string;
  propertyId: string;
  ownerId?: string;
  operatorId?: string;
  operators?: { id: string }[];
  status?: string;
  [key: string]: unknown;
};

export const dynamic = 'force-dynamic';

// ─── Tipi locali per dati Firestore ────────────────────────────────────────
interface FirestoreCleaning {
  id?: string;
  propertyId?: string;
  ownerId?: string;
  operatorId?: string | null;
  operators?: { id: string; name?: string }[];
  status?: string;
  scheduledDate?: { toDate?: () => Date };
  originalDate?: { toDate?: () => Date };
  propertyName?: string;
  propertyAddress?: string;
  guestsCount?: number;
  scheduledTime?: string;
  notes?: string;
  serviceType?: string;
  duration?: number;
  [key: string]: unknown;
}

interface FirestoreUser {
  id: string;
  role: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
}



// ═══════════════════════════════════════════════════════════════
// HELPER: Ottieni utente da cookie
// ═══════════════════════════════════════════════════════════════

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
  user: AuthUser, 
  cleaning: CleaningDoc,
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
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'string | undefined' is not assignable to parameter of type 'st...
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

    const cleaning = { id: cleaningSnap.id, ...(cleaningSnap.data() as Record<string, any>) };

    // Verifica permessi
    // @ts-expect-error TODO-FIX: TS2345 Argument of type '{ id: string; }' is not assignable to parameter of type 'Clean...
    const permission = await checkCleaningPermission(user, cleaning, "view");
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason }, { status: 403 });
    }

    // Carica proprietà per dati aggiuntivi
    let property = null;
    if ((cleaning as FirestoreCleaning).propertyId) {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'string | undefined' is not assignable to parameter of type 'st...
      const propertySnap = await adminDb.collection("properties").doc((cleaning as FirestoreCleaning).propertyId).get();
      if (propertySnap.exists) {
        property = { id: propertySnap.id, ...(propertySnap.data() as Record<string, any>) };
      }
    }

    // Carica operatore se assegnato
    let operator = null;
    if ((cleaning as FirestoreCleaning).operatorId) {
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'string | null | undefined' is not assignable to parameter of t...
      const operatorSnap = await adminDb.collection("users").doc((cleaning as FirestoreCleaning).operatorId).get();
      if (operatorSnap.exists) {
        const opData = operatorSnap.data() as Record<string, any>;
        operator = {
          id: operatorSnap.id,
          name: opData.name || opData.displayName || "Operatore",
          email: opData.email,
          phone: opData.phone,
        };
      }
    }

    // Costruisci risposta completa
    const cleaningData = cleaning as FirestoreCleaning;
    
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
        name: (property as Record<string, unknown>)['name'] as string || cleaningData.propertyName || "",
        address: (property as Record<string, unknown>)['address'] as string || cleaningData.propertyAddress || "",
        city: (property as Record<string, unknown>)['city'] as string || "",
        bedrooms: (property as Record<string, unknown>)['bedrooms'] as number || 1,
        bathrooms: (property as Record<string, unknown>)['bathrooms'] as number || 1,
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
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
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
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
      startedAt: cleaningData.startedAt?.toDate?.() || null,
      startedBy: cleaningData.startedBy || null,
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
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
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
      cancelledAt: cleaningData.cancelledAt?.toDate?.() || null,
      cancelledBy: cleaningData.cancelledBy || null,
      cancellationReason: cleaningData.cancellationReason || null,
      
      // Verifica
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
      verifiedAt: cleaningData.verifiedAt?.toDate?.() || null,
      verifiedBy: cleaningData.verifiedBy || null,
      verificationNotes: cleaningData.verificationNotes || null,
      
      // Tracking
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
      createdAt: cleaningData.createdAt?.toDate?.() || null,
      createdBy: cleaningData.createdBy || null,
      // @ts-expect-error TODO-FIX: TS2339 Property 'toDate' does not exist on type '{}'.
      updatedAt: cleaningData.updatedAt?.toDate?.() || null,
      
      // Meta permessi
      _permissions: {
        // @ts-expect-error TODO-FIX: TS2345 Argument of type '{ id: string; }' is not assignable to parameter of type 'Clean...
        canEdit: (await checkCleaningPermission(user, cleaning, "edit")).allowed,
        // @ts-expect-error TODO-FIX: TS2345 Argument of type '{ id: string; }' is not assignable to parameter of type 'Clean...
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
    const user = await getApiUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(request, CleaningUpdateSchema);
    if (body instanceof Response) return body;

    // Carica pulizia esistente
    const cleaningRef = adminDb.collection("cleanings").doc(id);
    const cleaningSnap = await cleaningRef.get();

    if (!cleaningSnap.exists) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const cleaning = cleaningSnap.data();

    // Verifica permessi
    // @ts-expect-error TODO-FIX: TS2345 Argument of type 'DocumentData | undefined' is not assignable to parameter of ty...
    const permission = await checkCleaningPermission(user, cleaning, "edit");
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason }, { status: 403 });
    }

    // Campi aggiornabili
    const {
      scheduledDate,
      scheduledTime,
      status,
      // @ts-expect-error TODO-FIX: TS2339 Property 'priority' does not exist on type '{ status?: "COMPLETED" | "CANCELLED"...
      priority,
      guestsCount,
      operatorId,
      operatorName,
      operators,
      // @ts-expect-error TODO-FIX: TS2339 Property 'adminNotes' does not exist on type '{ status?: "COMPLETED" | "CANCELLE...
      adminNotes,
      // @ts-expect-error TODO-FIX: TS2339 Property 'ownerNotes' does not exist on type '{ status?: "COMPLETED" | "CANCELLE...
      ownerNotes,
      notes,
      // @ts-expect-error TODO-FIX: TS2339 Property 'checkInTime' does not exist on type '{ status?: "COMPLETED" | "CANCELL...
      checkInTime,
      // @ts-expect-error TODO-FIX: TS2339 Property 'checkOutTime' does not exist on type '{ status?: "COMPLETED" | "CANCEL...
      checkOutTime,
      linenConfigModified,
      removeCustomLinenConfig,
      // @ts-expect-error TODO-FIX: TS2339 Property 'customLinenConfig' does not exist on type '{ status?: "COMPLETED" | "C...
      customLinenConfig,
    } = body;

    const now = Timestamp.now();
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    let dateChanged = false;
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
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
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          if (!cleaning.originalDate) {
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            updateData.originalDate = cleaning.scheduledDate;
          }
          
          // Crea esclusione sync se da iCal
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          if (cleaning.bookingSource || cleaning.externalUid) {
            await adminDb.collection("syncExclusions").add({
              // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
              propertyId: cleaning.propertyId,
              // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
              originalDate: cleaning.scheduledDate,
              // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
              bookingSource: cleaning.bookingSource || "manual",
              // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
              bookingId: cleaning.bookingId || null,
              reason: "MOVED",
              newDate: Timestamp.fromDate(newDate),
              cleaningId: id,
              createdAt: now,
              createdBy: user.id,
            });
          }
          
          updateData.movedAt = now;
          updateData.movedBy = user.id;
          updateData.manuallyModified = true;
          updateData.lockedFromSync = true;
          // Preserva originalScheduledDate originale se già presente
          // @ts-expect-error
          if (!cleaning.originalScheduledDate) {
            // @ts-expect-error
            updateData.originalScheduledDate = cleaning.scheduledDate;
          }
        }
      }
      
      updateData.scheduledDate = Timestamp.fromDate(newDate);
    }

    if (scheduledTime !== undefined) {
      updateData.scheduledTime = scheduledTime;
      updateData.timeManuallySet = true; // Flag: admin ha cambiato l'orario
    }
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
      
      // 🔧 Gestione biancheria personalizzata
      if (linenConfigModified !== undefined) {
        updateData.linenConfigModified = linenConfigModified;
      }
      if (customLinenConfig !== undefined) {
        // 🛡️ FIX v2 (caso Trastevere 27/07/2026): questa route accettava
        // QUALSIASI customLinenConfig dal client, verbatim — anche degenere
        // (bl+ba vuoti, solo kit), che poi generava ordini senza lenzuola.
        // Ora: se il custom è degenere e la biancheria è attiva
        // (hasLinenOrder !== false, proprietà non a biancheria propria),
        // viene GUARITO con bl/ba dallo standard, conservando ki/ex.
        // healCustomConfig è identità per i custom sani.
        let cfgToSave = customLinenConfig;
        try {
          const _hlo = (updateData.hasLinenOrder !== undefined ? updateData.hasLinenOrder : (cleaning as any)?.hasLinenOrder);
          if (
            cfgToSave && typeof cfgToSave === "object" &&
            isDegenerateCustomConfig(cfgToSave) &&
            _hlo !== false &&
            (cleaning as any)?.propertyId
          ) {
            const propSnapForHeal = await adminDb.collection("properties").doc((cleaning as any).propertyId).get();
            const propForHeal = propSnapForHeal.exists ? (propSnapForHeal.data() as Record<string, any>) : null;
            if (propForHeal && propForHeal.usesOwnLinen !== true) {
              const gForHeal = (updateData.guestsCount as number | undefined) ?? (cleaning as any)?.guestsCount ?? 2;
              const svc = propForHeal.serviceConfigs as Record<string | number, any> | undefined;
              const stdForHeal = svc ? (svc[gForHeal] ?? svc[String(gForHeal)]) : undefined;
              if (stdForHeal) {
                cfgToSave = healCustomConfig(cfgToSave, stdForHeal);
                console.warn(`🛡️ [GUARDIA-BIANCHERIA] Cleaning ${id}: customLinenConfig degenere dal client → guarita dallo standard`);
              }
            }
          }
        } catch (healErr) {
          console.error("Errore guardia customLinenConfig (salvo comunque l'originale):", healErr);
          cfgToSave = customLinenConfig;
        }
        updateData.customLinenConfig = cfgToSave;
      }
      // Se richiesto esplicitamente, rimuovi customLinenConfig
      if (removeCustomLinenConfig === true) {
        updateData.customLinenConfig = FieldValue.delete();
        updateData.linenConfigModified = false;
      }
    }

    // Aggiorna
    await cleaningRef.update(updateData);

    // ─── 🧺 FIX BUG B: se la pulizia PASSA a COMPLETED/VERIFIED, conferma la consegna biancheria ───
    // Centralizza la stessa logica del flusso operatore /complete (DELIVERED + scarico magazzino),
    // così completare/verificare una pulizia da QUALSIASI percorso (incluso questo PUT generico,
    // es. modifica da calendario / EditCleaningModal) non lascia ordini orfani in PENDING — causa
    // storica degli acconti fantasma — e scala correttamente il magazzino. Idempotente e non bloccante.
    try {
      // @ts-expect-error TODO-FIX: 'cleaning' possibly undefined
      const _oldStatus = cleaning?.status;
      if (isTransitionToDone(_oldStatus, status)) {
        // dati pulizia aggiornati = vecchi + patch appena scritta (laundryOrderId/propertyId/scheduledDate)
        // @ts-expect-error TODO-FIX: 'cleaning' possibly undefined
        const _freshCleaning = { ...(cleaning as Record<string, unknown>), ...updateData };
        const _res = await confirmLinenDelivery(id, _freshCleaning, now);
        if (process.env.NODE_ENV !== "production") console.log(`🧺 [cleaning PUT] confirmLinenDelivery(${id}) →`, _res);
      }
    } catch (e) {
      console.error("🧺 [cleaning PUT] Errore confirmLinenDelivery (non bloccante):", e);
    }

    // ─── AGGIORNA ORDINE COLLEGATO SE CAMBIA ORARIO ───
    if (scheduledTime !== undefined || scheduledDate !== undefined) {
      try {
        const ordersQuery = adminDb.collection("orders").where("cleaningId", "==", id);
        const ordersSnap = await ordersQuery.get();
        
        for (const orderDoc of ordersSnap.docs) {
          const orderUpdate: Record<string, unknown> = { updatedAt: Timestamp.now() };
          if (scheduledTime !== undefined) orderUpdate.scheduledTime = scheduledTime;
          if (scheduledDate !== undefined) orderUpdate.scheduledDate = updateData.scheduledDate;
          
          await adminDb.collection("orders").doc(orderDoc.id).update(orderUpdate);
        }
      } catch (orderError) {
        console.error("Errore aggiornamento ordini collegati:", orderError);
      }
    }

    // ─── 🔧 FIX: AGGIORNA ITEMS ORDINE SE CAMBIANO OSPITI O SI PASSA A CONFIG STANDARD ───
    // Ricalcola items ordine dalla serviceConfigs della proprietà se:
    // 1. Cambia il numero ospiti E la config NON è/sarà personalizzata
    // 2. Oppure si sta passando da personalizzato a standard (removeCustomLinenConfig o linenConfigModified=false)
    
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    const wasCustom = cleaning.linenConfigModified === true;
    const isBecomingStandard = removeCustomLinenConfig === true || linenConfigModified === false;
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    const shouldUpdateOrder = (guestsCount !== undefined && guestsCount !== cleaning.guestsCount) || 
                              (wasCustom && isBecomingStandard);
    
    if (shouldUpdateOrder) {
      try {
        // Se la pulizia HA config personalizzata E non sta passando a standard, NON toccare l'ordine
        if (wasCustom && !isBecomingStandard) {
          if (process.env.NODE_ENV !== "production") console.log(`⏭️ Pulizia ${id} ha config personalizzata, ordine non modificato`);
        } else {
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          const targetGuestsCount = guestsCount ?? cleaning.guestsCount;
          
          // Cerca ordini collegati PENDING
          const ordersQuery = adminDb.collection("orders").where("cleaningId", "==", id);
          const ordersSnap = await ordersQuery.get();
          
          if (!ordersSnap.empty) {
            // Carica proprietà per prendere serviceConfigs
            // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
            const propertyDoc = await adminDb.collection("properties").doc(cleaning.propertyId).get();
            const propData = propertyDoc.data() as Record<string, any>;
            
            if (propData?.serviceConfigs) {
              // Trova config per nuovo numero ospiti (gestisce chiavi stringa/numero)
              const newConfig = propData.serviceConfigs[targetGuestsCount] || 
                               propData.serviceConfigs[String(targetGuestsCount)];
              
              if (newConfig) {
                // Calcola nuovi items
                const newItems: { id: string; name: string; quantity: number }[] = [];
                
                // BIANCHERIA LETTO - usa 'all' se presente
                if (newConfig.bl) {
                  const hasAll = newConfig.bl['all'] && 
                                typeof newConfig.bl['all'] === 'object' && 
                                Object.keys(newConfig.bl['all']).length > 0;
                  
                  if (hasAll) {
                    // 🔥 FIX: usa 'all' come base + integra articoli mancanti dai gruppi letto
                    const mergedBl: Record<string, number> = {};
                    Object.entries(newConfig.bl).forEach(([key, val]) => {
                      if (key !== 'all' && typeof val === 'object' && val !== null) {
                        Object.entries(val as Record<string, number>).forEach(([itemId, qty]) => {
                          if (typeof qty === 'number' && qty > 0) mergedBl[itemId] = (mergedBl[itemId] || 0) + qty;
                        });
                      }
                    });
                    Object.entries(newConfig.bl['all']).forEach(([itemId, qty]) => {
                      if (typeof qty === 'number' && qty > 0) mergedBl[itemId] = qty as number;
                    });
                    Object.entries(mergedBl).forEach(([itemId, qty]) => {
                      if (qty > 0) newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                    });
                  } else {
                    // Somma da gruppi letto
                    Object.entries(newConfig.bl).forEach(([bedId, items]) => {
                      if (bedId !== 'all' && typeof items === 'object' && items !== null) {
                        Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                          if (typeof qty === 'number' && qty > 0) {
                            const existing = newItems.find(i => i.id === itemId);
                            if (existing) {
                              existing.quantity += qty;
                            } else {
                              newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                            }
                          }
                        });
                      }
                    });
                  }
                }
                
                // BIANCHERIA BAGNO
                if (newConfig.ba) {
                  Object.entries(newConfig.ba).forEach(([itemId, qty]) => {
                    if (typeof qty === 'number' && qty > 0) {
                      newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                    }
                  });
                }
                
                // KIT CORTESIA
                if (newConfig.ki) {
                  Object.entries(newConfig.ki).forEach(([itemId, qty]) => {
                    if (typeof qty === 'number' && qty > 0) {
                      newItems.push({ id: itemId, name: getItemName(itemId), quantity: qty });
                    }
                  });
                }
                
                // Aggiorna solo ordini PENDING
                for (const orderDoc of ordersSnap.docs) {
                  const orderData = orderDoc.data() as Record<string, any>;
                  if (orderData.status === "PENDING") {
                    await adminDb.collection("orders").doc(orderDoc.id).update({
                      items: newItems,
                      updatedAt: Timestamp.now(),
                      guestsCountUpdated: targetGuestsCount,
                    });
                  } else {
                    if (process.env.NODE_ENV !== "production") console.log(`⏭️ Ordine ${orderDoc.id} è ${orderData.status}, non modificato`);
                  }
                }
              } else {
              }
            }
          }
        }
      } catch (orderError) {
        console.error("Errore aggiornamento items ordine:", orderError);
        // Non bloccare l'operazione principale
      }
    }

    // ─── NOTIFICA SE DATA CAMBIATA ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (dateChanged && cleaning.operatorId) {
      const oldDateStr = existingDate?.toLocaleDateString("it-IT", {
        weekday: "short", day: "numeric", month: "short"
      }) || "";
      // @ts-expect-error TODO-FIX: TS2769 No overload matches this call.
      const newDateStr = new Date(scheduledDate).toLocaleDateString("it-IT", {
        weekday: "short", day: "numeric", month: "short"
      });

      try {
        await createNotification({
          title: "📅 Pulizia spostata",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          message: `La pulizia di "${cleaning.propertyName}" è stata spostata da ${oldDateStr} a ${newDateStr}`,
          type: "INFO",
          recipientRole: "OPERATORE_PULIZIE",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          recipientId: cleaning.operatorId,
          senderId: user.id,
          senderName: user.name || user.email,
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          relatedEntityName: cleaning.propertyName,
          link: `/operatore`,
        });
      } catch (notifError) {
        console.error("Errore notifica:", notifError);
      }
    }

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

    // Verifica permessi
    // @ts-expect-error TODO-FIX: TS2345 Argument of type 'DocumentData | undefined' is not assignable to parameter of ty...
    const permission = await checkCleaningPermission(user, cleaning, "delete");
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason }, { status: 403 });
    }

    // Verifica stato - DELETE solo per pending/scheduled
    const deletableStatuses = ["SCHEDULED", "pending", "PENDING"];
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (!deletableStatuses.includes(cleaning.status) && !permission.isAdmin) {
      return NextResponse.json({ 
        error: "Usa l'endpoint /cancel per annullare pulizie non pending" 
      }, { status: 400 });
    }

    const now = Timestamp.now();

    // ─── CREA ESCLUSIONE SYNC ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.bookingSource || cleaning.externalUid) {
      await adminDb.collection("syncExclusions").add({
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        propertyId: cleaning.propertyId,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        originalDate: cleaning.scheduledDate,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        bookingSource: cleaning.bookingSource || "manual",
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        bookingId: cleaning.bookingId || null,
        reason: "DELETED",
        createdAt: now,
        createdBy: user.id,
      });

      // Crea anche record di pulizia cancellata
      await adminDb.collection("cancelledCleanings").add({
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        propertyId: cleaning.propertyId,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        originalDate: cleaning.scheduledDate,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        externalUid: cleaning.externalUid || null,
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        bookingSource: cleaning.bookingSource || null,
        reason: "Eliminata manualmente",
        cleaningId: id,
        cancelledBy: user.id,
        cancelledByName: user.name || user.email,
        cancelledAt: now,
      });
    }

    // ─── NOTIFICA OPERATORE ───
    // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
    if (cleaning.operatorId && cleaning.operatorId !== user.id) {
      try {
        // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
        const dateStr = cleaning.scheduledDate?.toDate?.()?.toLocaleDateString("it-IT", {
          weekday: "short", day: "numeric", month: "short"
        }) || "";

        await createNotification({
          title: "❌ Pulizia eliminata",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          message: `La pulizia di "${cleaning.propertyName}" del ${dateStr} è stata eliminata`,
          type: "WARNING",
          recipientRole: "OPERATORE_PULIZIE",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          recipientId: cleaning.operatorId,
          senderId: user.id,
          senderName: user.name || user.email,
          relatedEntityId: id,
          relatedEntityType: "CLEANING",
          // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
          relatedEntityName: cleaning.propertyName,
          link: `/operatore`,
        });
      } catch (notifError) {
        console.error("Errore notifica:", notifError);
      }
    }

    // ─── ELIMINA ORDINE BIANCHERIA COLLEGATO ───
    try {
      const ordersQuery = adminDb.collection("orders").where("cleaningId", "==", id);
      const ordersSnap = await ordersQuery.get();
      
      if (!ordersSnap.empty) {
        for (const orderDoc of ordersSnap.docs) {
          const orderData = orderDoc.data();
          // Elimina solo se non già consegnato
          if (orderData.status !== "DELIVERED") {
            await adminDb.collection("orders").doc(orderDoc.id).delete();
            if (process.env.NODE_ENV !== "production") console.log(`🗑️ Ordine biancheria ${orderDoc.id} eliminato (collegato a pulizia ${id})`);
          }
        }
      }
    } catch (orderError) {
      console.error("Errore eliminazione ordini collegati:", orderError);
    }

    // ─── CREDITO AUTOMATICO SE MESE GIÀ PAGATO ───
    // Se la pulizia è in un mese già pagato, generiamo un credito che viene
    // automaticamente spostato sul mese successivo come acconto.
    let creditTransferResult: any = null;
    try {
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      const propertyId = cleaning.propertyId;
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      const scheduledDate = cleaning.scheduledDate;
      const paidCheck = await checkIfServiceMonthIsPaid({ propertyId, scheduledDate });

      if (paidCheck.isPaid && paidCheck.ownerId) {
        // Calcola il prezzo della pulizia (effettivo)
        const cleaningEffectivePrice =
          // @ts-expect-error TODO-FIX
          (cleaning.priceOverride ?? cleaning.price ?? paidCheck.propertyData?.cleaningPrice ?? 0) +
          // @ts-expect-error TODO-FIX
          (cleaning.holidayFee ?? 0);

        if (cleaningEffectivePrice > 0.01) {
          creditTransferResult = await transferCreditToNextMonth({
            ownerId: paidCheck.ownerId,
            ownerName: paidCheck.ownerName || "Proprietario",
            sourceMonth: paidCheck.month,
            sourceYear: paidCheck.year,
            creditAmount: cleaningEffectivePrice,
            sourceServiceType: "PULIZIA",
            sourceServiceId: id,
            actionType: "DELETED",
            adminId: user.id,
            adminName: user.name || user.email,
          });

          if (process.env.NODE_ENV !== "production") {
            console.log("💰 Credito trasferito:", creditTransferResult);
          }
        }
      }
    } catch (creditErr) {
      console.error("Errore trasferimento credito (eliminazione non bloccata):", creditErr);
      // NON blocchiamo l'eliminazione: meglio eliminare e segnalare il credito mancato
      // che lasciare il sistema in stato inconsistente
    }

    // ─── ELIMINA PULIZIA ───
    await cleaningRef.delete();

    return NextResponse.json({
      success: true,
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      excluded: !!(cleaning.bookingSource || cleaning.externalUid),
      creditTransfer: creditTransferResult,
      // @ts-expect-error TODO-FIX: TS18048 'cleaning' is possibly 'undefined'.
      message: (cleaning.bookingSource || cleaning.externalUid)
        ? "Pulizia eliminata. Non verrà ricreata dalla sincronizzazione."
        : "Pulizia eliminata.",
    });
  } catch (error) {
    console.error("❌ Errore DELETE cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
