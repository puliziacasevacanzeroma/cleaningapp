import { NextResponse } from "next/server";
import { getInventory } from "~/lib/firebase/firestore-data";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || undefined;
    
    const items = await getInventory(category);
    
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Errore caricamento inventario:", error);
    return NextResponse.json({ error: "Errore interno", items: [] }, { status: 500 });
  }
}
