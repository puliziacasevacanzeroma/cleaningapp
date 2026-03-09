import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

type InventoryDoc = {
  key?: string;
  name?: string;
  quantity?: number;
  unit?: string;
  categoryId?: string;
  category?: string;
  icon?: string;
};

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    // Fetch tutti i prodotti dell'inventario (no filtro Firestore perché
    // alcuni doc usano "category" invece di "categoryId")
    const snapshot = await adminDb.collection("inventory").get();

    const products = snapshot.docs
      .map(doc => {
        const d = doc.data() as InventoryDoc;
        return {
          id:         doc.id,
          key:        d.key ?? doc.id,
          name:       d.name ?? "Prodotto",
          quantity:   d.quantity ?? 0,
          unit:       d.unit ?? "pz",
          categoryId: d.categoryId ?? d.category ?? "altro",
          icon:       d.icon ?? null,
        };
      })
      // Filtra solo prodotti pulizia (accetta sia "categoryId" che "category" come field name)
      .filter(p =>
        p.categoryId === "prodotti_pulizia"
      )
      // Solo prodotti con quantità > 0 o comunque presenti (l'operatore sceglie quanti ne mancano)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Errore caricamento prodotti disponibili:", error);
    return NextResponse.json({ products: [] }, { status: 500 });
  }
}
