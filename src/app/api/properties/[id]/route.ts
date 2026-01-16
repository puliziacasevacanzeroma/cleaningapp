import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

// GET - Get property details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const property = await db.property.findUnique({
      where: { id: params.id },
    });

    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // Check if user is owner or admin
    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (property.clientId !== session.user.id && user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    return NextResponse.json(property);
  } catch (error) {
    console.error("Error getting property:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

// PATCH - Update property
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const data = await req.json();
    const propertyId = params.id;

    // Verify property exists
    const property = await db.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // Check if user is owner or admin
    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (property.clientId !== session.user.id && user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // Update property
    const updatedProperty = await db.property.update({
      where: { id: propertyId },
      data: {
        name: data.name,
        address: data.address,
        apartment: data.apartment,
        floor: data.floor,
        intercom: data.intercom,
        city: data.city,
        postalCode: data.postalCode,
        maxGuests: data.maxGuests,
        bathrooms: data.bathrooms,
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
        cleaningPrice: data.cleaningPrice,
        imageUrl: data.imageUrl,
      },
    });

    return NextResponse.json({ success: true, property: updatedProperty });
  } catch (error) {
    console.error("Error updating property:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
