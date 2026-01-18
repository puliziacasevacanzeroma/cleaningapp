import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCleaningById, updateCleaning, getPropertyById } from "~/lib/firebase/firestore-data";

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

// GET - Ottieni singola pulizia
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const cleaning = await getCleaningById(id);

    if (!cleaning) {
      return NextResponse.json({ error: "Pulizia non trovata" }, { status: 404 });
    }

    const property = await getPropertyById(cleaning.propertyId);

    return NextResponse.json({
      id: cleaning.id,
      date: cleaning.scheduledDate?.toDate?.() || new Date(),
      scheduledTime: cleaning.scheduledTime || "10:00",
      status: cleaning.status || "pending",
      guestsCount: cleaning.guestsCount || 2,
      notes: cleaning.notes || "",
      property: {
        id: cleaning.propertyId || "",
        name: cleaning.propertyName || property?.name || "Proprietà",
        address: property?.address || "",
      },
      operator: cleaning.operatorId ? {
        id: cleaning.operatorId,
        name: cleaning.operatorName || "Operatore",
      } : null,
    });
  } catch (error) {
    console.error("Errore GET cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Modifica pulizia
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { scheduledTime, guestsCount, status, notes } = body;

    const updateData: Record<string, unknown> = {};
    if (scheduledTime !== undefined) updateData.scheduledTime = scheduledTime;
    if (guestsCount !== undefined) updateData.guestsCount = guestsCount;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    await updateCleaning(id, updateData);

    const cleaning = await getCleaningById(id);
    
    return NextResponse.json({
      id: cleaning?.id,
      scheduledTime: cleaning?.scheduledTime,
      guestsCount: cleaning?.guestsCount,
      status: cleaning?.status,
      success: true,
    });
  } catch (error) {
    console.error("Errore PATCH cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}