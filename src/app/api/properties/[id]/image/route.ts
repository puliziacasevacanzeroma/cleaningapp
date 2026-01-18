import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { updateProperty, getPropertyById } from "~/lib/firebase/firestore-data";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

// POST - Aggiorna immagine proprietà
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getFirebaseUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
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

    await updateProperty(id, { imageUrl });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore update image:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}