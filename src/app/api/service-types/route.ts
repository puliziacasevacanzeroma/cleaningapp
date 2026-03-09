import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { DEFAULT_SERVICE_TYPES } from "~/types/serviceType";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";
import { cachedQuery, invalidateCache } from "~/lib/cache";

export const dynamic = 'force-dynamic';

// TTL cache Redis: 5 minuti (service-types cambiano solo se admin li modifica)
const SERVICE_TYPES_REDIS_TTL = 300;

export async function GET(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const forManual = searchParams.get("forManual") === "true";
    const forAuto = searchParams.get("forAuto") === "true";

    // Chiave cache unica per combinazione di filtri
    const cacheKey = `service-types:${activeOnly}:${forManual}:${forAuto}`;

    const serviceTypes = await cachedQuery(
      cacheKey,
      async () => {
        const snapshot = await adminDb.collection("serviceTypes").get();
        let types = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) })) as Record<string, unknown>[];
        if (activeOnly) types = types.filter(st => st.isActive);
        if (forManual) types = types.filter(st => st.availableForManual);
        if (forAuto) types = types.filter(st => st.availableForAuto);
        types.sort((a, b) => ((a.sortOrder as number) || 0) - ((b.sortOrder as number) || 0));
        return types;
      },
      SERVICE_TYPES_REDIS_TTL
    );

    return NextResponse.json({ serviceTypes });
  } catch (error) {
    console.error("Errore GET service-types:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Solo admin può creare tipi servizio" }, { status: 403 });

    const body = await validateBody(req, GenericBodySchema);
    if (body instanceof Response) return body;
    const { name, description, code, baseSurcharge, requiresManualPrice, estimatedDuration,
      extraDuration, minPhotosRequired, requiresRating, adminOnly, clientCanRequest,
      requiresApproval, requiresReason, autoAssignEveryN, sortOrder, icon, color,
      availableForManual, availableForAuto } = body;

    if (!name || !code || !estimatedDuration) {
      return NextResponse.json({ error: "Nome, codice e durata stimata sono obbligatori" }, { status: 400 });
    }

    const validCodes = ["STANDARD", "APPROFONDITA", "SGROSSO"];
    // @ts-expect-error TODO-FIX: TS2339 Property 'toUpperCase' does not exist on type '{}'.
    if (!validCodes.includes(code.toUpperCase())) {
      return NextResponse.json({ error: `Codice non valido. Usa: ${validCodes.join(", ")}` }, { status: 400 });
    }

    const existingSnap = await adminDb.collection("serviceTypes").get();
    const existingCodes = existingSnap.docs.map(d => (d.data() as Record<string, any>).code);
    // @ts-expect-error TODO-FIX: TS2339 Property 'toUpperCase' does not exist on type '{}'.
    if (existingCodes.includes(code.toUpperCase())) {
      return NextResponse.json({ error: `Il codice "${code}" esiste già` }, { status: 400 });
    }

    const now = Timestamp.now();
    const docRef = await adminDb.collection("serviceTypes").add({
      // @ts-expect-error TODO-FIX: TS2339 Property 'toUpperCase' does not exist on type '{}'.
      name, description: description || "", code: code.toUpperCase(),
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
      baseSurcharge: baseSurcharge ? parseFloat(baseSurcharge) : 0,
      requiresManualPrice: requiresManualPrice ?? false,
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
      estimatedDuration: parseInt(estimatedDuration),
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
      extraDuration: extraDuration ? parseInt(extraDuration) : null,
      minPhotosRequired: minPhotosRequired ?? 10,
      requiresRating: requiresRating ?? true,
      adminOnly: adminOnly ?? false,
      clientCanRequest: clientCanRequest ?? true,
      requiresApproval: requiresApproval ?? false,
      requiresReason: requiresReason ?? false,
      // @ts-expect-error TODO-FIX: TS2345 Argument of type '{}' is not assignable to parameter of type 'string'.
      autoAssignEveryN: autoAssignEveryN ? parseInt(autoAssignEveryN) : null,
      sortOrder: sortOrder ?? 99,
      icon: icon || "🧹",
      color: color || "#3B82F6",
      availableForManual: availableForManual ?? true,
      availableForAuto: availableForAuto ?? false,
      isActive: true,
      createdAt: now, updatedAt: now, createdBy: user.id,
    });

    await invalidateCache("service-types:true:false:false"); // 🔄 Invalida cache Redis (query più comune)
    await invalidateCache("service-types:false:false:false");
    await invalidateCache("service-types:false:true:false");
    await invalidateCache("service-types:false:false:true");
    return NextResponse.json({ success: true, id: docRef.id, message: `Tipo servizio "${name}" creato` });
  } catch (error) {
    console.error("Errore POST service-types:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const existingSnap = await adminDb.collection("serviceTypes").get();
    if (existingSnap.docs.length > 0) {
      return NextResponse.json({ error: "Tipi servizio già presenti. Usa DELETE per resettare.", existing: existingSnap.docs.length }, { status: 400 });
    }

    const now = Timestamp.now();
    const created: string[] = [];

    for (const serviceType of DEFAULT_SERVICE_TYPES) {
      await adminDb.collection("serviceTypes").add({ ...serviceType, isActive: true, createdAt: now, updatedAt: now, createdBy: user.id });
      created.push(serviceType.name);
    }

    await invalidateCache("service-types:true:false:false");
    await invalidateCache("service-types:false:false:false");
    return NextResponse.json({ success: true, created: created.length, serviceTypes: created, message: `${created.length} tipi servizio predefiniti creati` });
  } catch (error) {
    console.error("Errore PUT service-types (seed):", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
