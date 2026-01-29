import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  addDoc, 
  updateDoc, 
  query, 
  where,
  Timestamp 
} from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { 
  createPropertyChangeRequestNotification,
  createActionResultNotification 
} from "~/lib/firebase/notifications";

export const dynamic = 'force-dynamic';

const COLLECTION = "propertyChangeRequests";

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

// GET - Lista richieste (admin) o stato richieste (proprietario)
export async function GET(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const propertyId = searchParams.get("propertyId");
    const status = searchParams.get("status") || "PENDING";

    const snapshot = await getDocs(collection(db, COLLECTION));
    let requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filtra per ruolo
    if (user.role?.toUpperCase() !== "ADMIN") {
      // Proprietario vede solo le sue richieste
      requests = requests.filter((r: any) => r.requesterId === user.id);
    }

    // Filtra per proprietà se specificato
    if (propertyId) {
      requests = requests.filter((r: any) => r.propertyId === propertyId);
    }

    // Filtra per stato
    if (status !== "ALL") {
      requests = requests.filter((r: any) => r.status === status);
    }

    return NextResponse.json({ requests });
  } catch (error: any) {
    console.error("Errore GET change requests:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Crea nuova richiesta di modifica
export async function POST(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      propertyId, 
      changeType, // "MAX_GUESTS" | "BEDS" | "PROPERTY_UPDATE"
      currentValue,
      requestedValue,
      reason,
      newBeds // Solo per changeType === "BEDS"
    } = body;

    if (!propertyId || !changeType || currentValue === undefined || requestedValue === undefined) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    // Verifica proprietà esiste e appartiene all'utente
    const propertySnap = await getDoc(doc(db, "properties", propertyId));
    if (!propertySnap.exists()) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const propertyData = propertySnap.data();
    
    // Solo proprietario può creare richieste (admin può modificare direttamente)
    if (user.role?.toUpperCase() !== "ADMIN" && propertyData.ownerId !== user.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // Verifica non ci siano già richieste pendenti per questa proprietà e tipo
    const existingQuery = query(
      collection(db, COLLECTION),
      where("propertyId", "==", propertyId),
      where("changeType", "==", changeType),
      where("status", "==", "PENDING")
    );
    const existingSnap = await getDocs(existingQuery);
    if (!existingSnap.empty) {
      return NextResponse.json({ 
        error: "Esiste già una richiesta pendente per questa modifica" 
      }, { status: 400 });
    }

    // Crea la richiesta
    const requestData: any = {
      propertyId,
      propertyName: propertyData.name,
      requesterId: user.id,
      requesterName: user.name || user.email,
      requesterEmail: user.email,
      changeType,
      // Per PROPERTY_UPDATE, salva come JSON; altrimenti come stringa
      currentValue: changeType === "PROPERTY_UPDATE" ? JSON.stringify(currentValue) : String(currentValue),
      requestedValue: changeType === "PROPERTY_UPDATE" ? JSON.stringify(requestedValue) : String(requestedValue),
      reason: reason || null,
      status: "PENDING",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Se è modifica letti, salva la nuova configurazione
    if (changeType === "BEDS" && newBeds) {
      requestData.newBeds = newBeds;
    }

    const docRef = await addDoc(collection(db, COLLECTION), requestData);

    // Crea notifica per admin
    let notifCurrentValue = String(currentValue);
    let notifRequestedValue = String(requestedValue);
    
    if (changeType === "PROPERTY_UPDATE") {
      try {
        const cv = typeof currentValue === 'object' ? currentValue : JSON.parse(currentValue);
        const rv = typeof requestedValue === 'object' ? requestedValue : JSON.parse(requestedValue);
        notifCurrentValue = `Ospiti: ${cv.maxGuests}, Camere: ${cv.bedrooms}, Bagni: ${cv.bathrooms}`;
        notifRequestedValue = `Ospiti: ${rv.maxGuests}, Camere: ${rv.bedrooms}, Bagni: ${rv.bathrooms}`;
      } catch (e) { /* usa valori default */ }
    }
    
    await createPropertyChangeRequestNotification(
      propertyId,
      propertyData.name,
      user.id,
      user.name || user.email,
      changeType,
      notifCurrentValue,
      notifRequestedValue,
      reason
    );

    return NextResponse.json({ 
      success: true, 
      requestId: docRef.id,
      message: "Richiesta inviata. Riceverai una notifica quando verrà processata."
    });
  } catch (error: any) {
    console.error("Errore POST change request:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Admin approva/rifiuta richiesta
export async function PUT(request: NextRequest) {
  try {
    const user = await getFirebaseUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json();
    const { requestId, action, adminNote } = body; // action: "APPROVE" | "REJECT"

    if (!requestId || !action) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    // Recupera la richiesta
    const requestRef = doc(db, COLLECTION, requestId);
    const requestSnap = await getDoc(requestRef);
    
    if (!requestSnap.exists()) {
      return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 });
    }

    const requestData = requestSnap.data();

    if (requestData.status !== "PENDING") {
      return NextResponse.json({ error: "Richiesta già processata" }, { status: 400 });
    }

    if (action === "APPROVE") {
      // Applica la modifica alla proprietà
      const propertyRef = doc(db, "properties", requestData.propertyId);
      const propertySnap = await getDoc(propertyRef);
      
      if (!propertySnap.exists()) {
        return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
      }

      const propertyData = propertySnap.data();
      const updateData: any = { updatedAt: Timestamp.now() };

      if (requestData.changeType === "MAX_GUESTS") {
        const newMaxGuests = parseInt(requestData.requestedValue);
        const oldMaxGuests = propertyData.maxGuests || 1;
        
        updateData.maxGuests = newMaxGuests;

        // Se aumentato, genera config mancanti
        if (newMaxGuests > oldMaxGuests && propertyData.serviceConfigs) {
          const existingConfigs = propertyData.serviceConfigs;
          const baseConfig = existingConfigs[String(oldMaxGuests)] || existingConfigs["1"];
          
          // Genera config per i nuovi ospiti
          for (let guests = oldMaxGuests + 1; guests <= newMaxGuests; guests++) {
            if (!existingConfigs[String(guests)]) {
              // Copia dalla config più vicina
              existingConfigs[String(guests)] = JSON.parse(JSON.stringify(baseConfig));
            }
          }
          updateData.serviceConfigs = existingConfigs;
        }
      } else if (requestData.changeType === "PROPERTY_UPDATE") {
        // Applica modifiche ospiti/camere/bagni/letti
        try {
          const newValues = JSON.parse(requestData.requestedValue);
          const oldMaxGuests = propertyData.maxGuests || 1;
          
          if (newValues.maxGuests) {
            updateData.maxGuests = newValues.maxGuests;
            
            // Se aumentato, genera config mancanti
            if (newValues.maxGuests > oldMaxGuests && propertyData.serviceConfigs) {
              const existingConfigs = { ...propertyData.serviceConfigs };
              const baseConfig = existingConfigs[String(oldMaxGuests)] || existingConfigs["1"];
              
              for (let guests = oldMaxGuests + 1; guests <= newValues.maxGuests; guests++) {
                if (!existingConfigs[String(guests)] && baseConfig) {
                  existingConfigs[String(guests)] = JSON.parse(JSON.stringify(baseConfig));
                }
              }
              updateData.serviceConfigs = existingConfigs;
            }
          }
          if (newValues.bedrooms) updateData.bedrooms = newValues.bedrooms;
          if (newValues.bathrooms) updateData.bathrooms = newValues.bathrooms;
          
          // Aggiorna anche i letti se presenti
          if (newValues.beds && Array.isArray(newValues.beds)) {
            updateData.bedsConfig = newValues.beds.map((b: any) => ({
              id: b.id,
              type: b.type,
              name: b.name,
              location: b.loc || b.location,
              capacity: b.cap || b.capacity
            }));
          }
          
          // O usa newBeds dalla richiesta
          if (requestData.newBeds && Array.isArray(requestData.newBeds)) {
            updateData.bedsConfig = requestData.newBeds;
          }
        } catch (e) {
          console.error("Errore parsing PROPERTY_UPDATE values:", e);
        }
      } else if (requestData.changeType === "BEDS" && requestData.newBeds) {
        // Aggiorna i letti
        updateData.beds = requestData.newBeds;
        
        // Ricalcola la capacità
        const totalCapacity = requestData.newBeds.reduce((sum: number, bed: any) => {
          return sum + (bed.cap || bed.capacity || 1);
        }, 0);
        
        // Aggiorna bedConfiguration se presente
        if (propertyData.bedConfiguration) {
          // TODO: Ricostruire bedConfiguration dai nuovi beds
        }
      }

      await updateDoc(propertyRef, updateData);
    }

    // Aggiorna lo stato della richiesta
    await updateDoc(requestRef, {
      status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      processedBy: user.id,
      processedByName: user.name || user.email,
      processedAt: Timestamp.now(),
      adminNote: adminNote || null,
      updatedAt: Timestamp.now(),
    });

    // Notifica il proprietario
    await createActionResultNotification(
      requestData.requesterId,
      requestData.propertyName,
      action === "APPROVE",
      adminNote
    );

    return NextResponse.json({ 
      success: true, 
      message: action === "APPROVE" ? "Richiesta approvata" : "Richiesta rifiutata"
    });
  } catch (error: any) {
    console.error("Errore PUT change request:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
