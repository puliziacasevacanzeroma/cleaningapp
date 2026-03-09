import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getPropertiesByOwner } from "~/lib/firebase/firestore-data-admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const properties = await getPropertiesByOwner(user.id);
    return NextResponse.json(properties);
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    
    const data = await validateBody(req, GenericBodySchema);
    if (data instanceof Response) return data;
    
    const docRef = await adminDb.collection("properties").add({
      ...data,
      ownerId: user.id,
      ownerName: user.name || user.email,
      ownerEmail: user.email,
      status: "PENDING",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    return NextResponse.json({ id: docRef.id, success: true });
  } catch (error) {
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}