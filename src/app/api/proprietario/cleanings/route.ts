import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    // 1. Proprietà del proprietario (query filtrata)
    const propsSnap = await adminDb.collection("properties").where("ownerId", "==", user.id).get();
    const properties = propsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
    const propertyIds = properties.map(p => p.id);
    
    if (propertyIds.length === 0) {
      return NextResponse.json([]);
    }

    // 2. Pulizie SOLO per le sue proprietà (query filtrata!)
    const cleaningsSnap = await adminDb.collection("cleanings").where("propertyId", "in", propertyIds).get();
    
    const cleanings = cleaningsSnap.docs.map(d => {
      const data = d.data() as Record<string, any>;
      return {
        id: d.id,
        ...data,
        scheduledDate: data.scheduledDate?.toDate?.() || data.scheduledDate,
        property: properties.find((p: any) => p.id === data.propertyId),
      };
    });
    
    return NextResponse.json(cleanings);
  } catch (error) {
    console.error("Errore pulizie proprietario:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
