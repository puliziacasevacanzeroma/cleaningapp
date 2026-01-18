import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { db } from "~/server/db";
import { revalidateTag } from "next/cache";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // Verifica che sia admin
    const userRole = user.role?.toUpperCase();
    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Solo gli admin possono approvare" }, { status: 403 });
    }
    
    const { id } = await params;
    const { action, cleaningPrice } = await request.json();
    
    if (action === "approve") {
      // Approva la proprietà - cambia status in ACTIVE (maiuscolo!)
      await db.property.update({
        where: { id },
        data: { 
          status: "ACTIVE",
          // Se l'admin ha impostato un prezzo, lo aggiorna
          ...(cleaningPrice !== undefined && { cleaningPrice: parseFloat(cleaningPrice) || 0 })
        }
      });
    } else if (action === "reject") {
      // Rifiuta - elimina la proprietà
      await db.property.delete({
        where: { id }
      });
    }

    // Invalida cache
    revalidateTag("properties");
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore approvazione:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
