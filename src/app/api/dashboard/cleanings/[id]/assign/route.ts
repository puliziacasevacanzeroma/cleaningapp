import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { updateCleaning, getCleaningById, getUsers } from "~/lib/firebase/firestore-data";

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

// POST - Assegna operatore
export async function POST(
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
    const { operatorId } = body;

    // Trova il nome dell'operatore
    const operators = await getUsers("OPERATORE_PULIZIE");
    const operator = operators.find(o => o.id === operatorId);

    await updateCleaning(id, {
      operatorId,
      operatorName: operator?.name || "",
      status: "ASSIGNED",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore assign:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Rimuovi operatore
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getFirebaseUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;

    await updateCleaning(id, {
      operatorId: "",
      operatorName: "",
      status: "SCHEDULED",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore delete assign:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}