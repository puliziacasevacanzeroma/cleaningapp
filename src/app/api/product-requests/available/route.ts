import { NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════
// GET - Lista prodotti pulizia disponibili dall'inventario
// ═══════════════════════════════════════════════════════════════
export async function GET() {
  try {
    // Prendi tutti i prodotti della categoria "prodotti_pulizia"
    const snapshot = await getDocs(
      query(
        collection(db, "inventory"),
        where("categoryId", "==", "prodotti_pulizia")
      )
    );

    const products = snapshot.docs.map(doc => ({
      id: doc.id,
      itemId: doc.id,
      key: doc.data().key || doc.id,
      name: doc.data().name || "Prodotto",
      quantity: doc.data().quantity ?? 0,
      unit: doc.data().unit || "pz",
      categoryId: "prodotti_pulizia",
    }));

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Errore GET cleaning-products:", error);
    return NextResponse.json({ products: [] });
  }
}
