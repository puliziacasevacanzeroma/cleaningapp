import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cleanOrphanedData } from "~/lib/firebase/firestore-data";

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

// POST - Pulisce tutti i dati orfani (pulizie, ordini, prenotazioni senza proprietà)
// SOLO ADMIN può eseguire questa operazione
export async function POST(request: Request) {
  const currentUser = await getFirebaseUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  // Solo ADMIN può pulire i dati orfani
  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori possono eseguire questa operazione" }, { status: 403 });
  }

  try {
    console.log(`🧹 Pulizia dati orfani richiesta da: ${currentUser.email}`);
    
    const result = await cleanOrphanedData();

    console.log(`✅ Pulizia completata:`, result);

    return NextResponse.json({
      success: true,
      message: "Pulizia dati orfani completata",
      deleted: {
        cleanings: result.deletedCleanings,
        orders: result.deletedOrders,
        bookings: result.deletedBookings,
        total: result.deletedCleanings + result.deletedOrders + result.deletedBookings
      }
    });
  } catch (error) {
    console.error("Errore pulizia dati orfani:", error);
    return NextResponse.json({ error: "Errore durante la pulizia" }, { status: 500 });
  }
}

// GET - Mostra solo info (senza eliminare)
export async function GET(request: Request) {
  const currentUser = await getFirebaseUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori possono vedere queste informazioni" }, { status: 403 });
  }

  return NextResponse.json({
    message: "Usa POST per pulire i dati orfani",
    description: "Questa API elimina pulizie, ordini e prenotazioni che fanno riferimento a proprietà non più esistenti",
    warning: "L'operazione è irreversibile"
  });
}
