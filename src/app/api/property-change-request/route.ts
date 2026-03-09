import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";
import { 
  createPropertyChangeRequestNotification,
  createActionResultNotification 
} from "~/lib/firebase/notifications-admin";

export const dynamic = 'force-dynamic';

// ─── Tipi locali ────────────────────────────────────────────────────────────
interface PropertyChangeData {
  name?: string;
  address?: string;
  city?: string;
  maxGuests?: number;
  cleaningPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  beds?: { id: string; name?: string; type?: string; capacity?: number }[];
  [key: string]: unknown;
}

interface ChangeRequest {
  id?: string;
  requesterId?: string;
  propertyId?: string;
  status?: string;
  newBeds?: { id: string; name?: string; type?: string }[];
  [key: string]: unknown;
}



const COLLECTION = "propertyChangeRequests";

// ==================== HELPERS ====================

function buildChangeDescription(current: PropertyChangeData, requested: PropertyChangeData): { oldDesc: string; newDesc: string; changesList: string[] } {
  const changes: string[] = [];
  const oldParts: string[] = [];
  const newParts: string[] = [];

  if (current.maxGuests !== requested.maxGuests) {
    oldParts.push(`Ospiti: ${current.maxGuests}`);
    newParts.push(`Ospiti: ${requested.maxGuests}`);
    changes.push(`ospiti da ${current.maxGuests} a ${requested.maxGuests}`);
  }
  if (current.bedrooms !== requested.bedrooms) {
    oldParts.push(`Camere: ${current.bedrooms}`);
    newParts.push(`Camere: ${requested.bedrooms}`);
    changes.push(`camere da ${current.bedrooms} a ${requested.bedrooms}`);
  }
  if (current.bathrooms !== requested.bathrooms) {
    oldParts.push(`Bagni: ${current.bathrooms}`);
    newParts.push(`Bagni: ${requested.bathrooms}`);
    changes.push(`bagni da ${current.bathrooms} a ${requested.bathrooms}`);
  }

  const oldBeds = Array.isArray(current.beds) ? current.beds : [];
  const newBeds = Array.isArray(requested.beds) ? requested.beds : [];
  if (JSON.stringify(oldBeds) !== JSON.stringify(newBeds)) {
    oldParts.push(`Letti: ${oldBeds.length}`);
    newParts.push(`Letti: ${newBeds.length}`);
    changes.push(`letti da ${oldBeds.length} a ${newBeds.length}`);
  }

  return {
    oldDesc: oldParts.join(', ') || 'Nessuna modifica',
    newDesc: newParts.join(', ') || 'Nessuna modifica',
    changesList: changes,
  };
}

// ==================== GET ====================

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const propertyId = searchParams.get("propertyId");
    const status = searchParams.get("status") || "PENDING";

    const snapshot = await adminDb.collection(COLLECTION).get();
    let requests = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

    if (user.role?.toUpperCase() !== "ADMIN") {
      requests = requests.filter((r: ChangeRequest) => r.requesterId === user.id);
    }

    if (propertyId) {
      requests = requests.filter((r: ChangeRequest) => r.propertyId === propertyId);
    }

    if (status !== "ALL") {
      requests = requests.filter((r: ChangeRequest) => r.status === status);
    }

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Errore GET change requests:", error);
    // @ts-expect-error TODO-FIX: TS18046 'error' is of type 'unknown'.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== POST ====================

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { propertyId, changeType, currentValue, requestedValue, reason, newBeds, requestedServiceConfigs, updateScendibagno } = body;

    if (!propertyId || !changeType || currentValue === undefined || requestedValue === undefined) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
    const propertySnap = await adminDb.collection("properties").doc(propertyId).get();
    if (!propertySnap.exists) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const propertyData = propertySnap.data() as Record<string, any>;
    
    if (user.role?.toUpperCase() !== "ADMIN" && propertyData.ownerId !== user.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // Verifica no richieste pendenti per questa proprietà
    const existingSnap = await adminDb.collection(COLLECTION).where("propertyId", "==", propertyId).where("status", "==", "PENDING").get();
    if (!existingSnap.empty) {
      return NextResponse.json({ 
        error: "Esiste già una richiesta pendente per questa proprietà" 
      }, { status: 400 });
    }

    // Crea la richiesta
    const requestData: Record<string, unknown> = {
      propertyId,
      propertyName: propertyData.name,
      requesterId: user.id,
      requesterName: user.name || user.email,
      requesterEmail: user.email,
      changeType,
      currentValue: typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue),
      requestedValue: typeof requestedValue === 'object' ? JSON.stringify(requestedValue) : String(requestedValue),
      reason: reason || null,
      status: "PENDING",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Salva newBeds normalizzati
    if (newBeds && Array.isArray(newBeds)) {
      requestData.newBeds = newBeds.map((b: { id: string; name?: string; type?: string; capacity?: number }) => ({
        id: b.id,
        type: b.type,
        name: b.name,
        // @ts-expect-error TODO-FIX: TS2339 Property 'loc' does not exist on type '{ id: string; name?: string | undefined; ...
        location: b.loc || b.location || 'Camera',
        // @ts-expect-error TODO-FIX: TS2339 Property 'cap' does not exist on type '{ id: string; name?: string | undefined; ...
        capacity: b.cap || b.capacity || 2,
      }));
    }

    // Salva la configurazione biancheria compilata dal proprietario
    if (requestedServiceConfigs) {
      if (typeof requestedServiceConfigs === 'string') {
        requestData.requestedServiceConfigs = requestedServiceConfigs;
      } else if (typeof requestedServiceConfigs === 'object') {
        requestData.requestedServiceConfigs = JSON.stringify(requestedServiceConfigs);
      }
    }

    const docRef = await adminDb.collection(COLLECTION).add( requestData);

    // Salva flag updateScendibagno se presente
    if (updateScendibagno !== undefined) {
      await docRef.update( { updateScendibagno: !!updateScendibagno });
    }

    // === NOTIFICA ADMIN ===
    let notifOld = String(currentValue);
    let notifNew = String(requestedValue);
    
    if (changeType === "PROPERTY_UPDATE") {
      try {
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
        const cv = typeof currentValue === 'object' ? currentValue : JSON.parse(requestData.currentValue);
        // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string'.
        const rv = typeof requestedValue === 'object' ? requestedValue : JSON.parse(requestData.requestedValue);
        const desc = buildChangeDescription(cv, rv);
        notifOld = desc.oldDesc;
        notifNew = desc.newDesc;
      } catch (e) { /* usa valori default */ }
    }
    
    await createPropertyChangeRequestNotification(
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
      propertyId,
      propertyData.name,
      user.id,
      user.name || user.email,
      changeType,
      notifOld,
      notifNew,
      reason
    );

    return NextResponse.json({ 
      success: true, 
      requestId: docRef.id,
      message: "Richiesta inviata. Riceverai una notifica quando verrà processata."
    });
  } catch (error) {
    console.error("Errore POST change request:", error);
    // @ts-expect-error TODO-FIX: TS18046 'error' is of type 'unknown'.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==================== PUT (APPROVE / REJECT) ====================

export async function PUT(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      console.error("❌ Non autorizzato - user:", user?.id, "role:", user?.role);
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { requestId, action, adminNote } = body;

    if (!requestId || !action) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
    const requestRef = adminDb.collection(COLLECTION).doc(requestId);
    const requestSnap = await requestRef.get();
    
    if (!requestSnap.exists) {
      console.error("❌ Richiesta non trovata:", requestId);
      return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 });
    }

    const requestData = requestSnap.data() as Record<string, any>;

    if (requestData.status !== "PENDING") {
      console.error("❌ Richiesta già processata:", requestData.status);
      return NextResponse.json({ error: "Richiesta già processata" }, { status: 400 });
    }

    let changesDescription = "";

    if (action === "APPROVE") {
      const propertyRef = adminDb.collection("properties").doc(requestData.propertyId);
      const propertySnap = await propertyRef.get();
      
      if (!propertySnap.exists) {
        return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
      }

      const propertyData = propertySnap.data() as Record<string, any>;
      const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };

      // ==========================================
      // CASE: MAX_GUESTS (legacy singolo campo)
      // ==========================================
      if (requestData.changeType === "MAX_GUESTS") {
        const newMaxGuests = parseInt(requestData.requestedValue);
        const oldMaxGuests = propertyData.maxGuests || 1;
        updateData.maxGuests = newMaxGuests;
        changesDescription = `Ospiti: ${oldMaxGuests} → ${newMaxGuests}`;

        if (propertyData.serviceConfigs) {
          const cfgs = { ...propertyData.serviceConfigs };
          if (newMaxGuests > oldMaxGuests) {
            const base = cfgs[String(oldMaxGuests)] || cfgs["1"];
            for (let g = oldMaxGuests + 1; g <= newMaxGuests; g++) {
              if (!cfgs[String(g)] && base) cfgs[String(g)] = JSON.parse(JSON.stringify(base));
            }
          } else {
            for (let g = newMaxGuests + 1; g <= oldMaxGuests; g++) delete cfgs[String(g)];
          }
          updateData.serviceConfigs = cfgs;
        }

      // ==========================================
      // CASE: PROPERTY_UPDATE (ospiti+camere+bagni+letti)
      // ==========================================
      } else if (requestData.changeType === "PROPERTY_UPDATE") {
        try {
          const newValues = JSON.parse(requestData.requestedValue);
          const oldMaxGuests = propertyData.maxGuests || 1;
          const changesParts: string[] = [];

          // --- MAXGUESTS ---
          if (newValues.maxGuests !== undefined && newValues.maxGuests !== null) {
            updateData.maxGuests = newValues.maxGuests;
            if (newValues.maxGuests !== oldMaxGuests) {
              changesParts.push(`Ospiti: ${oldMaxGuests} → ${newValues.maxGuests}`);
            }
          }

          // --- BEDROOMS ---
          if (newValues.bedrooms !== undefined && newValues.bedrooms !== null) {
            updateData.bedrooms = newValues.bedrooms;
            if (newValues.bedrooms !== (propertyData.bedrooms || 1)) {
              changesParts.push(`Camere: ${propertyData.bedrooms || 1} → ${newValues.bedrooms}`);
            }
          }

          // --- BATHROOMS ---
          if (newValues.bathrooms !== undefined && newValues.bathrooms !== null) {
            updateData.bathrooms = newValues.bathrooms;
            if (newValues.bathrooms !== (propertyData.bathrooms || 1)) {
              changesParts.push(`Bagni: ${propertyData.bathrooms || 1} → ${newValues.bathrooms}`);
              
              // Aggiorna scendibagno nelle serviceConfigs esistenti (solo se richiesto)
              if (propertyData.serviceConfigs && requestData.updateScendibagno !== false) {
                const newBathrooms = newValues.bathrooms;
                const cfgs = updateData.serviceConfigs || { ...propertyData.serviceConfigs };
                
                // Cerca l'articolo scendibagno nell'inventario (cerca nelle config esistenti)
                let scendiBagnoKey: string | null = null;
                for (const gKey of Object.keys(cfgs)) {
                  const ba = cfgs[gKey]?.ba;
                  if (ba) {
                    for (const key of Object.keys(ba)) {
                      const keyLower = key.toLowerCase();
                      if (keyLower.includes('scendi') || keyLower.includes('tappetino') || keyLower.includes('scendibagno') || keyLower.includes('scendi_bagno') || keyLower.includes('bathmat') || keyLower === 'bathmats') {
                        scendiBagnoKey = key;
                        break;
                      }
                    }
                    if (scendiBagnoKey) break;
                  }
                }
                
                if (scendiBagnoKey) {
                  for (const gKey of Object.keys(cfgs)) {
                    if (cfgs[gKey]?.ba && cfgs[gKey].ba[scendiBagnoKey] !== undefined) {
                      cfgs[gKey].ba[scendiBagnoKey] = newBathrooms;
                    }
                  }
                  if (process.env.NODE_ENV !== "production") console.log(`🛁 Aggiornato scendibagno (${scendiBagnoKey}) a ${newBathrooms} per tutte le configurazioni`);
                }
                
                updateData.serviceConfigs = cfgs;
              }
            }
          }

          // --- LETTI ---
          let finalBeds: { id: string; name?: string; type?: string }[] | null = null;
          
          // Priorità: newBeds normalizzati nella request > beds in requestedValue
          if (requestData.newBeds && Array.isArray(requestData.newBeds) && requestData.newBeds.length > 0) {
            finalBeds = requestData.newBeds;
          } else if (newValues.beds && Array.isArray(newValues.beds) && newValues.beds.length > 0) {
            finalBeds = newValues.beds.map((b: { id: string; name?: string; type?: string }) => ({
              id: b.id,
              type: b.type,
              name: b.name,
              // @ts-expect-error TODO-FIX: TS2339 Property 'loc' does not exist on type '{ id: string; name?: string | undefined; ...
              location: b.loc || b.location || 'Camera',
              // @ts-expect-error TODO-FIX: TS2339 Property 'cap' does not exist on type '{ id: string; name?: string | undefined; ...
              capacity: b.cap || b.capacity || 2,
            }));
          }

          if (finalBeds) {
            updateData.bedsConfig = finalBeds;
            const oldBedsArr = propertyData.bedsConfig || propertyData.beds || [];
            const oldBedsCount = Array.isArray(oldBedsArr) ? oldBedsArr.length : 0;
            if (finalBeds.length !== oldBedsCount || JSON.stringify(finalBeds) !== JSON.stringify(oldBedsArr)) {
              changesParts.push(`Letti: ${oldBedsCount} → ${finalBeds.length}`);
            }
          }

          // --- SERVICECONFIGS: usa quelle compilate dal proprietario se presenti ---
          let ownerConfigs: Record<string, any> | null = null;
          if (requestData.requestedServiceConfigs) {
            try {
              ownerConfigs = JSON.parse(requestData.requestedServiceConfigs);
            } catch (e) {
              console.warn("Errore parsing requestedServiceConfigs:", e);
            }
          }

          if (ownerConfigs && Object.keys(ownerConfigs).length > 0) {
            // Il proprietario ha compilato la configurazione biancheria — usala direttamente
            updateData.serviceConfigs = ownerConfigs;
            updateData.configNeedsReview = false;
            if (process.env.NODE_ENV !== "production") console.log(`✅ Applicate serviceConfigs dal proprietario (${Object.keys(ownerConfigs).length} configurazioni)`);
          } else if (updateData.serviceConfigs) {
            // Le serviceConfigs sono già state aggiornate (es. scendibagno per cambio bagni)
            // Non sovrascrivere e non richiedere review
            updateData.configNeedsReview = false;
            if (process.env.NODE_ENV !== "production") console.log(`✅ serviceConfigs già aggiornate (es. scendibagno), no review necessaria`);
          } else {
            // Nessuna config dal proprietario — genera automaticamente
            const targetMaxGuests = updateData.maxGuests || propertyData.maxGuests || 1;
            if (propertyData.serviceConfigs) {
              const cfgs = { ...propertyData.serviceConfigs };
              
              // Se maxGuests aumentato, genera config mancanti
              if (targetMaxGuests > oldMaxGuests) {
                const base = cfgs[String(oldMaxGuests)] || cfgs["1"];
                for (let g = oldMaxGuests + 1; g <= targetMaxGuests; g++) {
                  if (!cfgs[String(g)] && base) cfgs[String(g)] = JSON.parse(JSON.stringify(base));
                }
              }
              
              // Se maxGuests diminuito, rimuovi le config in eccesso
              if (targetMaxGuests < oldMaxGuests) {
                for (let g = targetMaxGuests + 1; g <= oldMaxGuests; g++) delete cfgs[String(g)];
              }

              // Se i letti sono cambiati, aggiorna i bed IDs nelle serviceConfigs
              if (finalBeds && finalBeds.length > 0) {
                const newBedIds = finalBeds.map((b: { id: string }) => b.id);
                for (let g = 1; g <= targetMaxGuests; g++) {
                  const key = String(g);
                  if (cfgs[key]) {
                    const neededBeds = Math.min(Math.ceil(g / 2), newBedIds.length);
                    cfgs[key] = { ...cfgs[key], beds: newBedIds.slice(0, neededBeds) };
                  }
                }
              }

              updateData.serviceConfigs = cfgs;
              // Segna che va rivista perché generata automaticamente
              updateData.configNeedsReview = true;
            }
          }

          changesDescription = changesParts.join(', ');
        } catch (e) {
          console.error("Errore parsing PROPERTY_UPDATE values:", e);
        }

      // ==========================================
      // CASE: BEDS (legacy solo letti)
      // ==========================================
      } else if (requestData.changeType === "BEDS" && requestData.newBeds) {
        updateData.bedsConfig = requestData.newBeds;
        changesDescription = `Letti aggiornati (${requestData.newBeds.length} letti)`;
        
        // Aggiorna bed IDs nelle serviceConfigs
        if (propertyData.serviceConfigs) {
          const cfgs = { ...propertyData.serviceConfigs };
          const newBedIds = (requestData.newBeds as { id: string }[]).map((b) => b.id);
          const maxG = propertyData.maxGuests || 1;
          for (let g = 1; g <= maxG; g++) {
            const key = String(g);
            if (cfgs[key]) {
              const neededBeds = Math.min(Math.ceil(g / 2), newBedIds.length);
              cfgs[key] = { ...cfgs[key], beds: newBedIds.slice(0, neededBeds) };
            }
          }
          updateData.serviceConfigs = cfgs;
        }
      }

      if (process.env.NODE_ENV !== "production") console.log("📝 PROPERTY_UPDATE - updateData:", JSON.stringify({
        maxGuests: updateData.maxGuests,
        bedrooms: updateData.bedrooms,
        bathrooms: updateData.bathrooms,
        // @ts-expect-error TODO-FIX: TS2339 Property 'length' does not exist on type '{}'.
        bedsConfigCount: updateData.bedsConfig?.length,
        hasServiceConfigs: !!updateData.serviceConfigs,
        configNeedsReview: updateData.configNeedsReview,
      }));
      await propertyRef.update( updateData);
      
      // ════════════════════════════════════════════════════════════
      // 🔄 CASCADE: Se maxGuests è cambiato, aggiorna pulizie future
      // Pulizie senza guestsConfirmed prendono il nuovo maxGuests
      // + aggiorna ordini biancheria collegati
      // ════════════════════════════════════════════════════════════
      const newMaxGuests = updateData.maxGuests ? Number(updateData.maxGuests) : null;
      const currentMaxGuests = Number(propertyData.maxGuests) || 1;
      
      if (newMaxGuests && newMaxGuests !== currentMaxGuests) {
        
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        const cleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "==", requestData.propertyId).get();
        
        let cleaningsUpdatedCount = 0;
        let ordersUpdatedCount = 0;
        
        // Carica le serviceConfigs finali (quelle appena salvate)
        const finalConfigs = updateData.serviceConfigs || propertyData.serviceConfigs || {};
        
        for (const cleaningDoc of cleaningsSnap.docs) {
          const cData = cleaningDoc.data() as Record<string, any>;
          const scheduledDate = cData.scheduledDate?.toDate?.();
          if (!scheduledDate || scheduledDate < now) continue;
          
          // Solo pulizie attive
          const activeStatuses = ["SCHEDULED", "ASSIGNED", "PENDING_APPROVAL"];
          if (!activeStatuses.includes(cData.status)) continue;
          
          // Solo pulizie senza ospiti confermati MANUALMENTE dal proprietario
          // Se guestsConfirmed === true MA guestsAppliedBySystem === true → è un default del sistema, va aggiornato
          if (cData.guestsConfirmed === true && cData.guestsAppliedBySystem !== true) continue;
          
          // Aggiorna se:
          // - ospiti a 0 (non impostati)
          // - ospiti == vecchio max (erano al default precedente)
          // - ospiti impostati dal sistema
          // - ospiti > nuovo max (superano la nuova capienza)
          const currentGuests = cData.guestsCount || 0;
          const shouldUpdate = currentGuests === 0 
            || currentGuests === currentMaxGuests 
            || cData.guestsAppliedBySystem === true 
            || currentGuests > newMaxGuests
            || currentGuests !== newMaxGuests;
          
          if (!shouldUpdate) continue;
          
          // Aggiorna guestsCount nella pulizia
          await adminDb.collection("cleanings").doc(cleaningDoc.id).update( {
            guestsCount: newMaxGuests,
            guestsAppliedBySystem: true,
            updatedAt: Timestamp.now(),
          });
          cleaningsUpdatedCount++;
          
          // Aggiorna anche l'ordine biancheria collegato (se esiste)
          if (cData.laundryOrderId && !propertyData.usesOwnLinen) {
            try {
              const config = finalConfigs[newMaxGuests] || finalConfigs[String(newMaxGuests)];
              if (config) {
                const ITEM_NAMES: Record<string, string> = {
                  'doubleSheets': 'Lenzuola Matrimoniali', 'singleSheets': 'Lenzuola Singole',
                  'pillowcases': 'Federe', 'towel_bath': 'Telo Doccia',
                  'towel_face': 'Asciugamano Viso', 'towel_bidet': 'Asciugamano Bidet',
                  'bathmat': 'Tappetino Scendibagno',
                };
                
                const newItems: { id: string; name: string; quantity: number }[] = [];
                
                if (config.bl) {
                  if (config.bl['all']) {
                    Object.entries(config.bl['all']).forEach(([itemId, qty]) => {
                      if (typeof qty === 'number' && qty > 0) newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
                    });
                  } else {
                    Object.entries(config.bl).forEach(([bedId, items]) => {
                      if (typeof items === 'object' && items !== null) {
                        Object.entries(items as Record<string, number>).forEach(([itemId, qty]) => {
                          if (typeof qty === 'number' && qty > 0) {
                            const existing = newItems.find(i => i.id === itemId);
                            if (existing) existing.quantity += qty;
                            else newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
                          }
                        });
                      }
                    });
                  }
                }
                if (config.ba) {
                  Object.entries(config.ba).forEach(([itemId, qty]) => {
                    if (typeof qty === 'number' && qty > 0) newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
                  });
                }
                if (config.ki) {
                  Object.entries(config.ki).forEach(([itemId, qty]) => {
                    if (typeof qty === 'number' && qty > 0) newItems.push({ id: itemId, name: ITEM_NAMES[itemId] || itemId, quantity: qty });
                  });
                }
                
                if (newItems.length > 0) {
                  await adminDb.collection("orders").doc(cData.laundryOrderId).update( {
                    items: newItems,
                    guestsCount: newMaxGuests,
                    updatedAt: Timestamp.now(),
                  });
                  ordersUpdatedCount++;
                }
              }
            } catch (e) {
              console.warn(`⚠️ Ordine ${cData.laundryOrderId} non aggiornato:`, e);
            }
          }
        }
      }
    }

    // Aggiorna stato della richiesta
    await requestRef.update( {
      status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      processedBy: user.id,
      processedByName: user.name || user.email,
      processedAt: Timestamp.now(),
      adminNote: adminNote || null,
      updatedAt: Timestamp.now(),
    });

    // === NOTIFICA PROPRIETARIO con dettaglio modifiche ===
    await createActionResultNotification(
      requestData.requesterId,
      requestData.propertyName,
      action === "APPROVE",
      changesDescription,
      // @ts-expect-error TODO-FIX: TS2345 Argument of type 'unknown' is not assignable to parameter of type 'string | unde...
      adminNote
    );

    return NextResponse.json({ 
      success: true, 
      message: action === "APPROVE" ? "Richiesta approvata" : "Richiesta rifiutata"
    });
  } catch (error) {
    console.error("Errore PUT change request:", error);
    // @ts-expect-error TODO-FIX: TS18046 'error' is of type 'unknown'.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
