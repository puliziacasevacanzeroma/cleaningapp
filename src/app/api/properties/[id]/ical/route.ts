import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { airbnb, booking, oktorate, inreception, krossbooking } = await req.json();

    await db.property.update({
      where: { id },
      data: { icalAirbnb: airbnb, icalBooking: booking, icalOktorate: oktorate, icalInreception: inreception, icalKrossbooking: krossbooking },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }
}
