import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, InventoryItemSchema } from "~/lib/validation/schemas";
import { invalidateCache } from "~/lib/cache";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || undefined;

    const snapshot = await adminDb.collection("inventory").get();
    let items = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));

    if (category) {
      items = items.filter((item: Record<string, unknown>) =>
        item.category === category || item.categoryId === category
      );
    }

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Errore caricamento inventario:", error);
    return NextResponse.json({ error: "Errore interno", items: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const data = await validateBody(request, InventoryItemSchema);
    if (data instanceof Response) return data;

    if (!data.name) {
      return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
    }

    const newItem = {
      name: data.name,
      // @ts-expect-error TODO-FIX: TS2551 Property 'categoryId' does not exist on type '{ name: string; quantity: number; ...
      categoryId: data.categoryId || "altro",
      // @ts-expect-error TODO-FIX: TS2551 Property 'categoryId' does not exist on type '{ name: string; quantity: number; ...
      category: data.category || data.categoryId || "altro",
      quantity: data.quantity || 0,
      minQuantity: data.minQuantity || 5,
      sellPrice: data.sellPrice || 0,
      unit: data.unit || "pz",
      // @ts-expect-error TODO-FIX: TS2339 Property 'isForLinen' does not exist on type '{ name: string; quantity: number; ...
      isForLinen: data.isForLinen || false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: user.id || user.email,
    };

    const docRef = await adminDb.collection("inventory").add(newItem);
    await invalidateCache("inventory:list"); // 🔄 Invalida cache Redis

    return NextResponse.json({
      success: true,
      id: docRef.id,
      message: "Articolo creato con successo",
    });
  } catch (error) {
    console.error("Errore creazione articolo:", error);
    return NextResponse.json({ error: "Errore durante la creazione" }, { status: 500 });
  }
}
