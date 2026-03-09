import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, ApprovePropertySchema } from "~/lib/validation/schemas";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }
    const { id } = await params;
    const body = await validateBody(req, ApprovePropertySchema);
    if (body instanceof Response) return body;
    const { status } = body;
    
    await adminDb.collection("properties").doc(id).update({ 
      status: status || "PENDING_SIGNATURE",
      updatedAt: Timestamp.now()
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore approvazione:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}