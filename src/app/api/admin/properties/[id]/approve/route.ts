import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { action } = await request.json();

    if (action === "approve") {
      await db.property.update({
        where: { id: params.id },
        data: { status: "active" }
      });
    } else if (action === "reject") {
      await db.property.delete({
        where: { id: params.id }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore approvazione:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
