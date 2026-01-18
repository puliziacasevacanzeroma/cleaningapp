import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { db } from "~/server/db";

// GET - Get property details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getApiUser();
    if (!user) {
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
      where: { id: user.id },
    });

    if (property.clientId !== user.id && user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    return NextResponse.json(property);
  } catch (error) {
    console.error("Error getting property:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

// PATCH - Update property (including iCal links)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getApiUser();
    if (!user) {
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
      where: { id: user.id },
    });

    if (property.clientId !== user.id && user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // Build update data object
    const updateData: any = {
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
    };

    // Add iCal fields if provided
    if (data.icalAirbnb !== undefined) {
      updateData.icalAirbnb = data.icalAirbnb || null;
    }
    if (data.icalBooking !== undefined) {
      updateData.icalBooking = data.icalBooking || null;
    }
    if (data.icalOktorate !== undefined) {
      updateData.icalOktorate = data.icalOktorate || null;
    }
    if (data.icalInreception !== undefined) {
      updateData.icalInreception = data.icalInreception || null;
    }
    if (data.icalKrossbooking !== undefined) {
      updateData.icalKrossbooking = data.icalKrossbooking || null;
    }

    // Update lastSync if any iCal link is being saved
    if (
      data.icalAirbnb !== undefined ||
      data.icalBooking !== undefined ||
      data.icalOktorate !== undefined ||
      data.icalInreception !== undefined ||
      data.icalKrossbooking !== undefined
    ) {
      updateData.lastSync = new Date();
    }

    // Update property
    const updatedProperty = await db.property.update({
      where: { id: propertyId },
      data: updateData,
    });

    return NextResponse.json({ success: true, property: updatedProperty });
  } catch (error) {
    console.error("Error updating property:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
