import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * 🔍 AUDIT INVENTARIO MAGAZZINO
 * 
 * GET /api/admin/audit-inventory?from=2026-04-01
 * 
 * Calcola:
 * 1. ENTRATE: biancheria consegnata dalla lavanderia (laundryDeliveries COMPLETED)
 * 2. USCITE: biancheria consegnata alle proprietà (ordini DELIVERED con inventoryDeducted)
 * 3. SALDO: entrate - uscite per ogni item
 * 4. INVENTARIO ATTUALE: quantità corrente in magazzino
 * 
 * NON modifica nulla.
 */
export async function GET(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from") || "2026-04-01";
    const startDate = new Date(fromDate + "T00:00:00");

    // ── 1. Carica inventario attuale ──────────
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryMap = new Map<string, { name: string; quantity: number; categoryId: string; docId: string }>();
    const nameToDocId = new Map<string, string>();

    inventorySnap.docs.forEach(doc => {
      const data = doc.data() as Record<string, any>;
      const item = {
        name: data.name || doc.id,
        quantity: data.quantity || 0,
        categoryId: data.categoryId || "",
        docId: doc.id,
      };
      inventoryMap.set(doc.id, item);
      if (data.name) nameToDocId.set(data.name, doc.id);
      if (data.key) inventoryMap.set(data.key, item);
    });

    // ── 2. ENTRATE: Consegne lavanderia COMPLETED dal fromDate ──────────
    const laundrySnap = await adminDb.collection("laundryDeliveries").get();
    
    const entrate = new Map<string, { name: string; quantity: number; days: number }>();
    let laundryDeliveriesCount = 0;

    for (const doc of laundrySnap.docs) {
      const data = doc.data() as Record<string, any>;
      if (data.status !== "COMPLETED") continue;
      
      // Filtra per data
      const dateKey = data.dateKey || doc.id; // es. "2026-04-05"
      const deliveryDate = new Date(dateKey + "T12:00:00");
      if (deliveryDate < startDate) continue;

      laundryDeliveriesCount++;
      const deliveredItems = data.deliveredItems || {};

      for (const [itemName, qty] of Object.entries(deliveredItems)) {
        const quantity = qty as number;
        if (quantity <= 0) continue;
        
        const existing = entrate.get(itemName);
        if (existing) {
          existing.quantity += quantity;
          existing.days++;
        } else {
          entrate.set(itemName, { name: itemName, quantity, days: 1 });
        }
      }
    }

    // ── 3. USCITE: Ordini DELIVERED dal fromDate ──────────
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "==", "DELIVERED")
      .get();

    const uscite = new Map<string, { name: string; quantity: number; orders: number }>();
    let deliveredOrdersCount = 0;
    let inventoryDeductedCount = 0;
    let notDeductedCount = 0;
    const notDeductedOrders: any[] = [];

    for (const doc of ordersSnap.docs) {
      const data = doc.data() as Record<string, any>;
      
      // Filtra per data
      const schedDate = data.scheduledDate?.toDate?.();
      const delivDate = data.deliveredAt?.toDate?.();
      const orderDate = delivDate || schedDate;
      if (!orderDate || orderDate < startDate) continue;

      deliveredOrdersCount++;
      
      if (data.inventoryDeducted === true) {
        inventoryDeductedCount++;
      } else {
        notDeductedCount++;
        notDeductedOrders.push({
          orderId: doc.id,
          property: data.propertyName || "???",
          date: schedDate ? schedDate.toISOString().split('T')[0] : "???",
          itemsCount: (data.items || []).length,
        });
      }

      const items = data.items || [];
      for (const item of items) {
        const qty = item.quantity || 0;
        if (qty <= 0) continue;

        // Usa il nome come chiave per match con entrate lavanderia
        const itemName = item.name || item.id || "???";
        const existing = uscite.get(itemName);
        if (existing) {
          existing.quantity += qty;
          existing.orders++;
        } else {
          uscite.set(itemName, { name: itemName, quantity: qty, orders: 1 });
        }
      }
    }

    // ── 4. Anche ordini auto-confermati dalla pulizia completata ──────────
    // (status DELIVERED + autoConfirmedByCleaningCompletion)

    // ── 5. Costruisci report unificato ──────────
    const allItemNames = new Set<string>();
    entrate.forEach((_, name) => allItemNames.add(name));
    uscite.forEach((_, name) => allItemNames.add(name));

    const report: any[] = [];
    for (const itemName of allItemNames) {
      const inData = entrate.get(itemName);
      const outData = uscite.get(itemName);
      
      // Cerca quantità attuale in inventario
      const invDocId = nameToDocId.get(itemName);
      const invItem = invDocId ? inventoryMap.get(invDocId) : null;

      report.push({
        item: itemName,
        entrate: inData?.quantity || 0,
        entrateGiorni: inData?.days || 0,
        uscite: outData?.quantity || 0,
        usciteOrdini: outData?.orders || 0,
        saldo: (inData?.quantity || 0) - (outData?.quantity || 0),
        inventarioAttuale: invItem?.quantity ?? "N/A",
        categoria: invItem?.categoryId || "???",
      });
    }

    // Ordina per nome
    report.sort((a, b) => a.item.localeCompare(b.item));

    // ── 6. Separa per categoria ──────────
    const biancheriaLetto = report.filter(r => {
      const name = r.item.toLowerCase();
      return name.includes("lenzuol") || name.includes("feder") || name.includes("copri");
    });
    const biancheriaBagno = report.filter(r => {
      const name = r.item.toLowerCase();
      return name.includes("telo") || name.includes("asciugaman") || name.includes("tappetino") || name.includes("scendi");
    });
    const kitCortesia = report.filter(r => {
      const name = r.item.toLowerCase();
      return name.includes("shampoo") || name.includes("sapone") || name.includes("bagnoschiuma") || name.includes("crema") || name.includes("cuffia") || name.includes("set di cortesia") || name.includes("doccia-shampoo") || name.includes("saponetta");
    });
    const prodottiPulizia = report.filter(r => {
      const name = r.item.toLowerCase();
      return name.includes("lavapav") || name.includes("vetri") || name.includes("spray") || name.includes("panni") || name.includes("aceto") || name.includes("buste") || name.includes("detersivo");
    });
    const altro = report.filter(r => {
      const name = r.item.toLowerCase();
      return !biancheriaLetto.some(b => b.item === r.item) && 
             !biancheriaBagno.some(b => b.item === r.item) && 
             !kitCortesia.some(b => b.item === r.item) &&
             !prodottiPulizia.some(b => b.item === r.item);
    });

    return NextResponse.json({
      periodo: { from: fromDate, to: "oggi" },
      riepilogo: {
        consegneLavanderia: laundryDeliveriesCount,
        ordiniConsegnati: deliveredOrdersCount,
        ordiniInventarioScalato: inventoryDeductedCount,
        ordiniInventarioNONScalato: notDeductedCount,
      },
      biancheriaLetto,
      biancheriaBagno,
      kitCortesia,
      prodottiPulizia,
      altro,
      tuttiGliItem: report,
      ordiniNonScalati: notDeductedOrders.slice(0, 20),
    });

  } catch (error) {
    console.error("❌ Errore audit-inventory:", error);
    return NextResponse.json({ 
      error: "Errore server", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
