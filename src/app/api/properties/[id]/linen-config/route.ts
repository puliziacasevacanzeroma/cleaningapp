import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { configs } = await req.json();

    for (const [guestsCount, config] of Object.entries(configs)) {
      const pax = parseInt(guestsCount);
      const data = config as Record<string, number>;
      
      await db.linenConfig.upsert({
        where: { propertyId_guestsCount: { propertyId: id, guestsCount: pax } },
        update: { ...data },
        create: { propertyId: id, guestsCount: pax, ...data },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }
}
