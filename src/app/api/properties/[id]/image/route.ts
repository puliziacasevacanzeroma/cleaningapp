import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { db } from "~/server/db";

// POST - Update property image
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { imageUrl } = await req.json();
    const propertyId = params.id;

    // Verify property exists and user has access
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

    // Update property image
    const updatedProperty = await db.property.update({
      where: { id: propertyId },
      data: { imageUrl },
    });

    return NextResponse.json({ success: true, imageUrl: updatedProperty.imageUrl });
  } catch (error) {
    console.error("Error updating property image:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

// DELETE - Remove property image
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const propertyId = params.id;

    // Verify property exists and user has access
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

    // Remove property image
    await db.property.update({
      where: { id: propertyId },
      data: { imageUrl: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing property image:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
