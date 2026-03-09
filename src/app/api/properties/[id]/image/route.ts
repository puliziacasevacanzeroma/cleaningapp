import { NextResponse } from "next/server";
import { updateProperty, getPropertyById } from "~/lib/firebase/firestore-data-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

// POST - Aggiorna immagine proprietà
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { imageUrl } = body;

    // Verifica che la proprietà esista
    const property = await getPropertyById(id);
    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    // Verifica permessi (admin o proprietario)
    if (currentUser.role !== "ADMIN" && property.ownerId !== currentUser.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // @ts-expect-error TODO-FIX: TS2353 Object literal may only specify known properties, and 'imageUrl' does not exist ...
    await updateProperty(id, { imageUrl });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore update image:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}