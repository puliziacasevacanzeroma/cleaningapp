import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * 🔍 AUDIT PROFONDO — Analizza ordini DELIVERED senza scalamento inventario
 * 
 * GET /api/admin/audit-inventory-deep?from=2026-04-01
 * 
 * Trova:
 * 1. Quali ordini NON hanno scalato l'inventario
 * 2. PERCHÉ (auto-conferma vs rider vs sconosciuto)
 * 3. Quanti pezzi mancano per ogni item
 * 4. Se il totale mancante spiega la differenza inventario
 */
export async function GET(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (_user.role?.toUpperCase() !== "ADMIN") return NextResponse.json({ error: "Accesso negato" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from") || "2026-04-01";
    const startDate = new Date(fromDate + "T00:00:00");

    // 1. Carica inventario per mapping
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryQuantities = new Map<string, number>();
    const nameToDocId = new Map<string, string>();
    const keyToDocId = new Map<string, string>();

    inventorySnap.docs.forEach(doc => {
      const d = doc.data() as Record<string, any>;
      inventoryQuantities.set(doc.id, d.quantity || 0);
      if (d.name) nameToDocId.set(d.name, doc.id);
      keyToDocId.set(doc.id, doc.id);
      if (d.key) keyToDocId.set(d.key, doc.id);
    });

    // 2. Tutti ordini DELIVERED dal periodo
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "==", "DELIVERED")
      .get();

    const notDeducted: any[] = [];
    const missingItems = new Map<string, number>();
    let deductedCount = 0;
    let totalDelivered = 0;

    for (const doc of ordersSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const schedDate = data.scheduledDate?.toDate?.();
      const delivDate = data.deliveredAt?.toDate?.();
      const orderDate = delivDate || schedDate;
      if (!orderDate || orderDate < startDate) continue;
      totalDelivered++;

      if (data.inventoryDeducted === true) {
        deductedCount++;
        continue;
      }

      // Ordine NON scalato
      const items = data.items || [];
      const itemDetails: any[] = [];
      let totalPcs = 0;

      for (const item of items) {
        const qty = item.quantity || 0;
        if (qty <= 0) continue;

        const inventoryDocId = keyToDocId.get(item.id) || nameToDocId.get(item.name);
        const itemName = item.name || item.id || "???";
        
        itemDetails.push({
          name: itemName,
          quantity: qty,
          foundInInventory: !!inventoryDocId,
          type: item.type || null,
          categoryId: item.categoryId || null,
        });
        totalPcs += qty;

        // Conta solo item tracciati in inventario
        if (inventoryDocId) {
          missingItems.set(itemName, (missingItems.get(itemName) || 0) + qty);
        }
      }

      notDeducted.push({
        orderId: doc.id,
        property: data.propertyName || "???",
        date: schedDate ? schedDate.toISOString().split('T')[0] : "???",
        deliveredAt: delivDate ? delivDate.toISOString() : "N/A",
        autoConfirmed: data.autoConfirmedByCleaningCompletion === true,
        deliveredByName: data.deliveredByName || "N/A",
        inventoryDeducted: data.inventoryDeducted,
        totalPcs,
        items: itemDetails,
      });
    }

    // 3. Calcola totale mancante per item
    const missingTotal = Array.from(missingItems.entries())
      .map(([name, qty]) => ({ item: name, nonScalato: qty }))
      .sort((a, b) => b.nonScalato - a.nonScalato);

    // 4. Ora carica audit entrate/uscite per confronto completo
    // Entrate lavanderia
    const laundrySnap = await adminDb.collection("laundryDeliveries").get();
    const entrate = new Map<string, number>();
    for (const doc of laundrySnap.docs) {
      const data = doc.data() as Record<string, any>;
      if (data.status !== "COMPLETED") continue;
      const dateKey = data.dateKey || doc.id;
      if (new Date(dateKey + "T12:00:00") < startDate) continue;
      for (const [name, qty] of Object.entries(data.deliveredItems || {})) {
        if ((qty as number) > 0) entrate.set(name, (entrate.get(name) || 0) + (qty as number));
      }
    }

    // Uscite totali (tutti ordini DELIVERED, sia scalati che non)
    const usciteTotali = new Map<string, number>();
    for (const doc of ordersSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const orderDate = data.deliveredAt?.toDate?.() || data.scheduledDate?.toDate?.();
      if (!orderDate || orderDate < startDate) continue;
      for (const item of (data.items || [])) {
        if ((item.quantity || 0) > 0) {
          const name = item.name || item.id || "???";
          usciteTotali.set(name, (usciteTotali.get(name) || 0) + item.quantity);
        }
      }
    }

    // 5. Report completo con riconciliazione
    const allNames = new Set<string>();
    entrate.forEach((_, n) => allNames.add(n));
    usciteTotali.forEach((_, n) => allNames.add(n));

    const riconciliazione: any[] = [];
    for (const name of allNames) {
      const inQty = entrate.get(name) || 0;
      const outQty = usciteTotali.get(name) || 0;
      const nonScalato = missingItems.get(name) || 0;
      const saldo = inQty - outQty;
      const invDocId = nameToDocId.get(name);
      const invQty = invDocId ? inventoryQuantities.get(invDocId) : null;

      // Il saldo teorico (entrate - uscite scalate) dovrebbe = inventario attuale
      // Se saldo - inventario = nonScalato, allora il problema sono gli ordini non scalati
      const differenza = invQty !== null ? saldo - invQty : null;

      riconciliazione.push({
        item: name,
        entrate: inQty,
        usciteTotali: outQty,
        usciteScalate: outQty - nonScalato,
        nonScalato,
        saldoReale: saldo,
        inventario: invQty ?? "N/A",
        differenza: differenza ?? "N/A",
        spiegato: differenza !== null ? Math.abs(differenza - nonScalato) <= 1 : false,
      });
    }

    riconciliazione.sort((a, b) => a.item.localeCompare(b.item));

    // Solo biancheria per leggibilità
    const biancheria = riconciliazione.filter(r => {
      const n = r.item.toLowerCase();
      return n.includes("lenzuol") || n.includes("feder") || n.includes("telo") || 
             n.includes("asciugaman") || n.includes("tappetino") || n.includes("scendi") ||
             n.includes("copri");
    });

    return NextResponse.json({
      periodo: { from: fromDate, to: "oggi" },
      riepilogo: {
        ordiniDelivered: totalDelivered,
        ordiniScalati: deductedCount,
        ordiniNONScalati: notDeducted.length,
        totPezziNonScalati: missingTotal.reduce((s, i) => s + i.nonScalato, 0),
      },
      itemNonScalati: missingTotal,
      riconciliazioneBiancheria: biancheria,
      riconciliazioneCompleta: riconciliazione,
      ordiniNonScalati: notDeducted.sort((a, b) => a.date.localeCompare(b.date)),
    });

  } catch (error) {
    console.error("❌ Errore audit-inventory-deep:", error);
    return NextResponse.json({ error: "Errore server", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
