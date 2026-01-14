import { NextResponse } from "next/server";
import { db } from "~/server/db";

export async function GET() {
  try {
    // Aggiorna tutti gli utenti con questa email a admin
    const result = await db.user.updateMany({
      where: {
        email: "damianiariele@gmail.com"
      },
      data: {
        role: "admin"
      }
    });

    // Verifica
    const user = await db.user.findFirst({
      where: { email: "damianiariele@gmail.com" },
      select: { id: true, name: true, email: true, role: true }
    });

    return NextResponse.json({ 
      success: true, 
      message: "Ruolo aggiornato a admin! Ora fai LOGOUT e LOGIN di nuovo.",
      user 
    });
  } catch (error) {
    console.error("Errore:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

