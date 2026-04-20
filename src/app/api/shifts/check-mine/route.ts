import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { checkActiveShift } from "~/lib/shifts/checkActiveShift";

export const dynamic = "force-dynamic";

/**
 * API di check turno attivo dell'utente corrente.
 *
 * Usata dai client (rider.page.tsx, operatore.page.tsx) per:
 *   - verificare se possono cliccare "Prendi in carico" / "Inizia consegna"
 *   - prima di ogni updateDoc client-side su collections "orders" e "cleanings"
 *
 * Ritorna:
 *   { onShift: boolean, sessionId: string|null, startAtMs: number|null }
 *
 * NOTA: Questa è una chiamata di sola lettura (no side effects).
 */
export async function GET(_request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { onShift, sessionId, startAt } = await checkActiveShift(user.id);
  return NextResponse.json({
    onShift,
    sessionId,
    startAtMs: startAt?.toMillis?.() || null,
  });
}
