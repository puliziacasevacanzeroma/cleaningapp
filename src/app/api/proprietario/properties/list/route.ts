import { NextResponse } from "next/server";
import { getPropertiesByOwner } from "~/lib/firebase/firestore-data-admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const allProperties = await getPropertiesByOwner(user.id);
    
    // Escludi proprietà disattivate (INACTIVE) - quelle vanno solo in admin
    const properties = allProperties.filter(p => p.status !== "INACTIVE");
    
    // Dividi in attive e pending
    const activeProperties = properties.filter(p => p.status === "ACTIVE");
    const pendingProperties = properties.filter(p => p.status === "PENDING");
    
    return NextResponse.json({
      activeProperties,
      pendingProperties
    });
  } catch (error) {
    console.error("Errore lista proprietà:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}