/**
 * DELETE /api/orders/[id]
 *
 * Elimina definitivamente un ordine biancheria. Diversamente da `/cancel`,
 * questo endpoint:
 *   - permette la cancellazione anche di ordini DELIVERED/COMPLETED (admin only)
 *   - permette la cancellazione anche di ordini con cleaningId (linked)
 *
 * Caso d'uso: admin che vuole eliminare un servizio dalla pagina Pagamenti
 * per casi di errore inserimento, contestazione, ecc.
 *
 * AUTH: solo ADMIN.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    if (user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Solo l'admin può eliminare ordini" }, { status: 403 });
    }

    const { id } = await params;
    const ref = adminDb.collection("orders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Ordine non trovato" }, { status: 404 });
    }

    await ref.delete();

    return NextResponse.json({
      success: true,
      message: "Ordine eliminato definitivamente",
    });
  } catch (err: any) {
    console.error("[orders/DELETE] errore:", err);
    return NextResponse.json({
      error: err?.message || "Errore interno",
    }, { status: 500 });
  }
}
