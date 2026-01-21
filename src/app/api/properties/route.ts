import { NextResponse } from "next/server";
import { getProperties } from "~/lib/firebase/firestore-data";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

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
      linenConfigs: data.linenConfigs || [],
      // Timestamps
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const docRef = await addDoc(collection(db, "properties"), propertyData);

    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      propertyId: docRef.id,
      message: "Proprietà creata con successo" 
    });
  } catch (error) {
    console.error("Errore creazione proprietà:", error);
    return NextResponse.json(
      { error: "Errore nella creazione della proprietà" },
      { status: 500 }
    );
  }
}
