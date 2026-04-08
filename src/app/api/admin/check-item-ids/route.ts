import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * 🔬 CHECK ID ITEMS — Vede tutti gli ID usati negli ordini per ogni nome item
 * e quale doc inventory viene decrementato
 */
export async function GET(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user || _user.role?.toUpperCase() !== "ADMIN")
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const startDate = new Date("2026-04-01T00:00:00");

    // 1. Mappa inventario completa
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryDocs: any[] = [];
    const nameToDocId = new Map<string, string>();
    const keyToDocId = new Map<string, string>();

    inventorySnap.docs.forEach(doc => {
      const d = doc.data() as Record<string, any>;
      inventoryDocs.push({
        docId: doc.id,
        name: d.name || "N/A",
        key: d.key || "N/A",
        quantity: d.quantity || 0,
        categoryId: d.categoryId || "N/A",
      });
      if (d.name) nameToDocId.set(d.name, doc.id);
      keyToDocId.set(doc.id, doc.id);
      if (d.key) keyToDocId.set(d.key, doc.id);
    });

    // 2. Analizza tutti gli ordini DELIVERED — per ogni item, traccia quale ID usa
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "==", "DELIVERED")
      .get();

    // Mappa: itemName → { ids usati, docId inventario che verrebbe scalato, count }
    const itemIdMap = new Map<string, Map<string, { count: number; qty: number; mapsToDocId: string | null; mapsToName: string | null }>>();

    for (const doc of ordersSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const orderDate = data.deliveredAt?.toDate?.() || data.scheduledDate?.toDate?.();
      if (!orderDate || orderDate < startDate) continue;

      for (const item of (data.items || [])) {
        const name = item.name || "???";
        const id = item.id || "???";
        const qty = item.quantity || 0;

        if (!itemIdMap.has(name)) itemIdMap.set(name, new Map());
        const idMap = itemIdMap.get(name)!;

        // Dove andrebbe a scalare il deliver?
        const targetDocId = keyToDocId.get(id) || nameToDocId.get(name) || null;
        const targetName = targetDocId ? inventoryDocs.find(d => d.docId === targetDocId)?.name : null;

        if (!idMap.has(id)) {
          idMap.set(id, { count: 0, qty: 0, mapsToDocId: targetDocId, mapsToName: targetName || null });
        }
        const entry = idMap.get(id)!;
        entry.count++;
        entry.qty += qty;
      }
    }

    // 3. Filtra solo biancheria
    const KEYWORDS = ["lenzuol", "feder", "telo", "asciugaman", "tappetino", "scendi", "copri"];
    const result: any[] = [];

    for (const [name, idMap] of itemIdMap) {
      if (!KEYWORDS.some(kw => name.toLowerCase().includes(kw))) continue;

      const ids: any[] = [];
      for (const [id, data] of idMap) {
        const isMismatch = data.mapsToName && data.mapsToName !== name;
        ids.push({
          id: id.length > 15 ? `${id.substring(0, 8)}...` : id,
          fullId: id,
          count: data.count,
          totalQty: data.qty,
          scalaDocId: data.mapsToDocId ? (data.mapsToDocId.length > 15 ? `${data.mapsToDocId.substring(0, 8)}...` : data.mapsToDocId) : "NESSUNO",
          scalaItemName: data.mapsToName || "NON TROVATO",
          MISMATCH: isMismatch ? `⚠️ SCALA ${data.mapsToName} INVECE DI ${name}!` : null,
        });
      }

      result.push({ itemName: name, variants: ids });
    }

    // 4. Lista inventario biancheria per riferimento
    const biancheriaInventory = inventoryDocs.filter(d => 
      KEYWORDS.some(kw => d.name.toLowerCase().includes(kw))
    );

    return NextResponse.json({
      inventarioBiancheria: biancheriaInventory,
      analisiIdPerItem: result,
    });

  } catch (error) {
    console.error("❌ Errore check-item-ids:", error);
    return NextResponse.json({ error: "Errore server", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
