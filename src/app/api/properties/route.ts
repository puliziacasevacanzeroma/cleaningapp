import { NextResponse } from "next/server";
import { getProperties } from "~/lib/firebase/firestore-data";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "ACTIVE";
    
    const properties = await getProperties(status);
    
    return NextResponse.json({ properties });
  } catch (error) {
    console.error("Errore caricamento proprietà:", error);
    return NextResponse.json({ error: "Errore interno", properties: [] }, { status: 500 });
  }
}
