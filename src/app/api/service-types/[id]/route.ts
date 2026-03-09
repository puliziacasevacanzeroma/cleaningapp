import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";
import { invalidateCache } from "~/lib/cache";

const invalidateServiceTypesCache = () => Promise.all([
  invalidateCache("service-types:true:false:false"),
  invalidateCache("service-types:false:false:false"),
  invalidateCache("service-types:false:true:false"),
  invalidateCache("service-types:false:false:true"),
]);

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const docSnap = await adminDb.collection("serviceTypes").doc(id).get();

    if (!docSnap.exists) return NextResponse.json({ error: "Tipo servizio non trovato" }, { status: 404 });

    return NextResponse.json({ serviceType: { id: docSnap.id, ...(docSnap.data() as Record<string, any>) } });
  } catch (error) {
    console.error("Errore GET service-type:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo admin può modificare tipi servizio" }, { status: 403 });

    const { id } = await params;
    const body = await validateBody(req, GenericBodySchema);
    if (body instanceof Response) return body;

    const docRef = adminDb.collection("serviceTypes").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return NextResponse.json({ error: "Tipo servizio non trovato" }, { status: 404 });

    const allowedFields = [
      "name", "description", "baseSurcharge", "requiresManualPrice",
      "estimatedDuration", "extraDuration", "minPhotosRequired",
      "requiresRating", "adminOnly", "clientCanRequest", "requiresApproval",
      "requiresReason", "autoAssignEveryN", "sortOrder", "icon", "color",
      "availableForManual", "availableForAuto", "isActive",
    ];

    const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (["baseSurcharge"].includes(field)) {
          // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
          updateData[field] = body[field] !== null ? parseFloat(body[field]) : null;
        } else if (["estimatedDuration", "extraDuration", "minPhotosRequired", "sortOrder", "autoAssignEveryN"].includes(field)) {
          // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
          updateData[field] = body[field] !== null ? parseInt(body[field]) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    await docRef.update(updateData);
    await invalidateServiceTypesCache(); // 🔄 Invalida cache Redis
    return NextResponse.json({ success: true, message: "Tipo servizio aggiornato" });
  } catch (error) {
    console.error("Errore PATCH service-type:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo admin può eliminare tipi servizio" }, { status: 403 });

    const { id } = await params;
    const docRef = adminDb.collection("serviceTypes").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return NextResponse.json({ error: "Tipo servizio non trovato" }, { status: 404 });

    const serviceType = docSnap.data()!;
    const { searchParams } = new URL(req.url);
    const forceDelete = searchParams.get("force") === "true";

    if (forceDelete) {
      await docRef.delete();
      await invalidateServiceTypesCache(); // 🔄 Invalida cache Redis
      return NextResponse.json({ success: true, deleted: true, message: `Tipo servizio "${serviceType.name}" eliminato` });
    } else {
      await docRef.update({ isActive: false, deactivatedAt: Timestamp.now(), deactivatedBy: user.id, updatedAt: Timestamp.now() });
      await invalidateServiceTypesCache(); // 🔄 Invalida cache Redis
      return NextResponse.json({ success: true, deleted: false, deactivated: true, message: `Tipo servizio "${serviceType.name}" disattivato` });
    }
  } catch (error) {
    console.error("Errore DELETE service-type:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
