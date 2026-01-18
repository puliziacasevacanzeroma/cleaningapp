import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUsers } from "~/lib/firebase/firestore-data";

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
    const role = searchParams.get("role");

    const users = await getUsers(role || undefined);

    return NextResponse.json({ 
      users: users.map(u => ({
        ...u,
        _count: { properties: 0 },
        properties: [],
      }))
    });
  } catch (error) {
    console.error("Errore fetch utenti:", error);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}