import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getInventory } from "~/lib/firebase/firestore-data";

export const dynamic = 'force-dynamic';

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) {
      return JSON.parse(decodeURIComponent(userCookie.value));
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await getFirebaseUser();
  
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const items = await getInventory(category || undefined);

    return NextResponse.json({ 
      items: items.map(item => ({
        ...item,
        createdAt: item.createdAt?.toDate?.() || new Date(),
        updatedAt: item.updatedAt?.toDate?.() || new Date(),
      }))
    });
  } catch (error) {
    console.error("Errore fetch inventory:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}