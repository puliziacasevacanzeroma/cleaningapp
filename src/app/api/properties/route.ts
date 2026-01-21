import { NextResponse } from "next/server";
import { getProperties, createProperty } from "~/lib/firebase/firestore-data";

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
    if (!data.name || !data.address || !data.ownerId) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti: name, address, ownerId" },
        { status: 400 }
      );
    }

    const propertyId = await createProperty({
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
      ownerId: data.ownerId,
      ownerName: data.ownerName || "",
      ownerEmail: data.ownerEmail || "",
      status: data.status || "PENDING",
      icalUrl: data.icalUrl || "",
      notes: data.notes || "",
      usesOwnLinen: data.usesOwnLinen || false,
      linenConfig: data.linenConfig || [],
    });

    return NextResponse.json({ 
      success: true, 
      propertyId,
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
