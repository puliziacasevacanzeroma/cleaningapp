import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    await db.cleaning.update({
      where: { id },
      data: { status: "in_progress", startedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Errore" }, { status: 500 });
  }
}
