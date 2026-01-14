import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // LinenConfig non implementato nello schema - da aggiungere in futuro
    console.log("LinenConfig PUT called for property:", id);
    return NextResponse.json({ success: true, message: "Feature non ancora implementata" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Errore" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    console.log("LinenConfig GET called for property:", id);
    return NextResponse.json([]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Errore" }, { status: 500 });
  }
}