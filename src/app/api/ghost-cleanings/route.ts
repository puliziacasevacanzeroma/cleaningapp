import { NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GhostCleaningActionSchema } from "~/lib/validation/schemas";
import { 
  getGhostCleanings, 
  // @ts-expect-error TODO-FIX: TS2724 '"~/lib/firebase/firestore-data-admin"' has no exported member named 'handleGhos...
  handleGhostCleanings, 
  // @ts-expect-error TODO-FIX: TS2724 '"~/lib/firebase/firestore-data-admin"' has no exported member named 'getGhostCl...
  getGhostCleaningsStats,
  markCleaningAsCompleted,
  markCleaningAsCancelled,
  // @ts-expect-error TODO-FIX: TS2305 Module '"~/lib/firebase/firestore-data-admin"' has no exported member 'deleteCle...
  deleteCleaning
} from "~/lib/firebase/firestore-data-admin";

export const dynamic = 'force-dynamic';

// GET - Ottieni lista pulizie fantasma
export async function GET(request: Request) {
  const currentUser = await getApiUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori possono vedere queste informazioni" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const daysBack = parseInt(searchParams.get("days") || "30");
    const statsOnly = searchParams.get("stats") === "true";

    if (statsOnly) {
      const stats = await getGhostCleaningsStats();
      return NextResponse.json({ success: true, stats });
    }

    const ghostCleanings = await getGhostCleanings(daysBack);

    return NextResponse.json({
      success: true,
      count: ghostCleanings.length,
      cleanings: ghostCleanings.map(g => ({
        ...g,
        scheduledDate: g.scheduledDate.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Errore GET ghost cleanings:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// POST - Gestisci pulizie fantasma (completa/annulla/elimina)
export async function POST(request: Request) {
  const currentUser = await getApiUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori possono eseguire questa operazione" }, { status: 403 });
  }

  try {
    const body = await validateBody(request, GhostCleaningActionSchema);
    if (body instanceof Response) return body;
    const { action, cleaningIds } = body;

    // Validazione action
    if (!action || !["complete", "cancel", "delete"].includes(action)) {
      return NextResponse.json({ 
        error: "Azione non valida. Usa: complete, cancel, delete" 
      }, { status: 400 });
    }

    if (process.env.NODE_ENV !== "production") console.log(`👻 Richiesta gestione pulizie fantasma: ${action} (${cleaningIds?.length || 'tutte'})`);

    const result = await handleGhostCleanings(action, cleaningIds);

    return NextResponse.json({
      success: true,
      action,
      processed: result.processed,
      errors: result.errors,
      message: `${result.processed} pulizie ${
        action === "complete" ? "completate" : 
        action === "cancel" ? "annullate" : "eliminate"
      }${result.errors > 0 ? ` (${result.errors} errori)` : ""}`
    });
  } catch (error) {
    console.error("Errore POST ghost cleanings:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// PATCH - Gestisci singola pulizia fantasma
export async function PATCH(request: Request) {
  const currentUser = await getApiUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori possono eseguire questa operazione" }, { status: 403 });
  }

  try {
    // @ts-expect-error TODO-FIX: TS2304 Cannot find name 'GenericBodySchema'.
    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { cleaningId, action } = body;

    if (!cleaningId) {
      return NextResponse.json({ error: "ID pulizia richiesto" }, { status: 400 });
    }

    if (!action || !["complete", "cancel", "delete"].includes(action)) {
      return NextResponse.json({ 
        error: "Azione non valida. Usa: complete, cancel, delete" 
      }, { status: 400 });
    }

    switch (action) {
      case "complete":
        await markCleaningAsCompleted(cleaningId);
        break;
      case "cancel":
        await markCleaningAsCancelled(cleaningId);
        break;
      case "delete":
        await deleteCleaning(cleaningId);
        break;
    }

    return NextResponse.json({
      success: true,
      cleaningId,
      action,
      message: `Pulizia ${
        action === "complete" ? "completata" : 
        action === "cancel" ? "annullata" : "eliminata"
      }`
    });
  } catch (error) {
    console.error("Errore PATCH ghost cleaning:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
