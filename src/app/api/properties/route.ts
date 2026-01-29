import { NextResponse } from "next/server";
import { getProperties } from "~/lib/firebase/firestore-data";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";
import { createNewPropertyNotification } from "~/lib/firebase/notifications";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "ACTIVE";
    const properties = await getProperties(status);
    return NextResponse.json({ properties });
  } catch (error) {
    console.error("Errore caricamento proprietà:", error);
    return NextResponse.json({ error: "Errore interno", properties: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validazione base
    if (!data.name || !data.address) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti: name, address" },
        { status: 400 }
      );
    }

    // Salva direttamente su Firestore con tutti i campi ricevuti
    const propertyData = {
      // Campi base
      name: data.name,
      address: data.address,
      city: data.city || "",
      zone: data.zone || "",
      type: data.type || "apartment",
      size: data.size || 0,
      bedrooms: data.bedrooms || 1,
      bathrooms: data.bathrooms || 1,
      maxGuests: data.maxGuests || 2,
      cleaningPrice: data.cleaningPrice || 0,
      ownerId: data.ownerId || "pending",
      ownerName: data.ownerName || "",
      ownerEmail: data.ownerEmail || "",
      status: data.status || "PENDING",
      icalUrl: data.icalUrl || "",
      notes: data.notes || "",
      usesOwnLinen: data.usesOwnLinen || false,
      linenConfig: data.linenConfig || [],
      // Campi extra dal form proprietario
      postalCode: data.postalCode || "",
      floor: data.floor || "",
      accessCode: data.accessCode || "",
      checkInTime: data.checkInTime || "15:00",
      checkOutTime: data.checkOutTime || "10:00",
      bedConfiguration: data.bedConfiguration || [],
      // ⭐ NUOVO: Letti e configurazioni biancheria nel formato STANDARD
      // Questi campi sono usati da tutto il resto dell'app:
      // - PropertyServiceConfig (configuratore biancheria)
      // - sync-ical (creazione ordini automatici)
      // - NewCleaningModal (creazione pulizie manuali)
      // - cleanings/manual API
      beds: data.beds || [],
      serviceConfigs: data.serviceConfigs || {},
      // Coordinate geografiche per calcolo distanze assegnazioni
      coordinates: data.coordinates || null,
      coordinatesVerified: data.coordinatesVerified || false,
      // Timestamps
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Log per debug
    if (data.serviceConfigs && Object.keys(data.serviceConfigs).length > 0) {
      console.log(`📦 Salvando proprietà "${data.name}" con ${Object.keys(data.serviceConfigs).length} configurazioni ospiti`);
      console.log(`   Esempio config 1 ospite:`, data.serviceConfigs[1] ? 'presente' : 'assente');
      console.log(`   Esempio config maxGuests (${data.maxGuests}):`, data.serviceConfigs[data.maxGuests] ? 'presente' : 'assente');
    }

    const docRef = await addDoc(collection(db, "properties"), propertyData);

    // Invia notifica all'admin per nuova proprietà da approvare
    try {
      await createNewPropertyNotification(
        docRef.id,
        data.name,
        data.ownerId || "unknown",
        data.ownerName || "Proprietario"
      );
      console.log("📬 Notifica inviata all'admin per nuova proprietà:", data.name);
    } catch (notifError) {
      console.error("Errore invio notifica:", notifError);
      // Non blocchiamo la creazione se la notifica fallisce
    }

    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      propertyId: docRef.id,
      message: "Proprietà creata con successo",
      hasServiceConfigs: data.serviceConfigs && Object.keys(data.serviceConfigs).length > 0
    });
  } catch (error) {
    console.error("Errore creazione proprietà:", error);
    return NextResponse.json(
      { error: "Errore nella creazione della proprietà" },
      { status: 500 }
    );
  }
}
