import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, UpdateQuantitySchema } from "~/lib/validation/schemas";
import { invalidateCache } from "~/lib/cache";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await validateBody(req, UpdateQuantitySchema);
    if (body instanceof Response) return body;
    // @ts-expect-error TODO-FIX: TS2339 Property 'id' does not exist on type '{ quantity: number; itemId: string; reason...
    const id = body.id || body.itemId;

    if (!id) {
      return NextResponse.json({ error: "ID mancante" }, { status: 400 });
    }

    const docRef = adminDb.collection("inventory").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
    }

    let newQuantity: number;

    // @ts-expect-error TODO-FIX: TS2551 Property 'newQuantity' does not exist on type '{ quantity: number; itemId: strin...
    if (body.newQuantity !== undefined) {
      // @ts-expect-error TODO-FIX: TS2551 Property 'newQuantity' does not exist on type '{ quantity: number; itemId: strin...
      newQuantity = body.newQuantity;
    } else if (body.quantity !== undefined) {
      newQuantity = body.quantity;
    // @ts-expect-error TODO-FIX: TS2339 Property 'delta' does not exist on type '{ quantity: number; itemId: string; rea...
    } else if (body.delta !== undefined) {
      const currentQty = (docSnap.data()!.quantity as number) || 0;
      // @ts-expect-error TODO-FIX: TS2339 Property 'delta' does not exist on type '{ quantity: number; itemId: string; rea...
      newQuantity = Math.max(0, currentQty + body.delta);
    } else {
      return NextResponse.json({ error: "Quantità mancante" }, { status: 400 });
    }

    await docRef.set({ quantity: newQuantity, updatedAt: Timestamp.now() }, { merge: true });
    await invalidateCache("inventory:list"); // 🔄 Invalida cache Redis

    return NextResponse.json({ success: true, quantity: newQuantity });
  } catch (error: unknown) {
    console.error("Errore aggiornamento quantità:", error);
    const message = error instanceof Error ? error.message : "Errore server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
