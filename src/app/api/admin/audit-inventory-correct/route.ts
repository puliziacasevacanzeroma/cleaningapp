import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * 🔍 CALCOLO INVENTARIO CORRETTO — Solo dal 1 aprile
 * 
 * GET  → Calcola (dry-run)
 * POST → Corregge inventario
 * 
 * Logica:
 * - Inventario iniziale 1 aprile = 0
 * - + TUTTE le consegne lavanderia COMPLETED dal 1 aprile (sia applicate che non)
 * - - TUTTI gli ordini DELIVERED dal 1 aprile (ogni ordine = 1 uscita)
 * - = Inventario corretto
 */
export async function GET(request: NextRequest) { return handler(request, true); }
export async function POST(request: NextRequest) { return handler(request, false); }

async function handler(request: NextRequest, isDryRun: boolean) {
  try {
    const _user = await getApiUser();
    if (!_user || _user.role?.toUpperCase() !== "ADMIN")
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const startDate = new Date("2026-04-01T00:00:00");

    // ── 1. Inventario attuale ──
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryItems = new Map<string, { docId: string; name: string; currentQty: number; categoryId: string }>();
    const nameToDocId = new Map<string, string>();
    const keyToDocId = new Map<string, string>();

    inventorySnap.docs.forEach(doc => {
      const d = doc.data() as Record<string, any>;
      inventoryItems.set(doc.id, { docId: doc.id, name: d.name || doc.id, currentQty: d.quantity || 0, categoryId: d.categoryId || "" });
      if (d.name) nameToDocId.set(d.name, doc.id);
      keyToDocId.set(doc.id, doc.id);
      if (d.key) keyToDocId.set(d.key, doc.id);
    });

    // ── 2. ENTRATE: TUTTE le laundryDeliveries COMPLETED dal 1 aprile ──
    // Include sia applicate che non applicate — la lavanderia ha consegnato fisicamente
    const laundrySnap = await adminDb.collection("laundryDeliveries").get();
    const entratePerDocId = new Map<string, number>();
    const entratePerNome = new Map<string, number>();
    let laundryCount = 0;
    const laundryDetail: any[] = [];

    for (const doc of laundrySnap.docs) {
      const data = doc.data() as Record<string, any>;
      if (data.status !== "COMPLETED") continue;

      const dateKey = data.dateKey || doc.id;
      const deliveryDate = new Date(dateKey + "T12:00:00");
      if (deliveryDate < startDate) continue;

      laundryCount++;
      const dayItems: Record<string, number> = {};

      for (const [itemName, qty] of Object.entries(data.deliveredItems || {})) {
        const q = qty as number;
        if (q <= 0) continue;
        
        const docId = nameToDocId.get(itemName);
        if (docId) {
          entratePerDocId.set(docId, (entratePerDocId.get(docId) || 0) + q);
        }
        entratePerNome.set(itemName, (entratePerNome.get(itemName) || 0) + q);
        dayItems[itemName] = q;
      }

      laundryDetail.push({
        date: dateKey,
        applied: data.inventoryApplied === true,
        items: dayItems,
      });
    }

    // ── 3. USCITE: Ordini DELIVERED dal 1 aprile — ogni ordine 1 volta ──
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "==", "DELIVERED")
      .get();

    const uscitePerDocId = new Map<string, number>();
    const uscitePerNome = new Map<string, number>();
    let ordersCount = 0;

    for (const doc of ordersSnap.docs) {
      const data = doc.data() as Record<string, any>;

      // Filtra SOLO dal 1 aprile
      const schedDate = data.scheduledDate?.toDate?.();
      const delivDate = data.deliveredAt?.toDate?.();
      const orderDate = delivDate || schedDate;
      if (!orderDate || orderDate < startDate) continue;

      ordersCount++;

      for (const item of (data.items || [])) {
        const qty = item.quantity || 0;
        if (qty <= 0) continue;
        const itemName = item.name || item.id || "???";

        const docId = keyToDocId.get(item.id) || nameToDocId.get(itemName);
        if (docId) {
          uscitePerDocId.set(docId, (uscitePerDocId.get(docId) || 0) + qty);
        }
        uscitePerNome.set(itemName, (uscitePerNome.get(itemName) || 0) + qty);
      }
    }

    // ── 4. CALCOLO: inventario_iniziale(0) + entrate - uscite = corretto ──
    const risultato: any[] = [];
    const correzioni: { docId: string; name: string; from: number; to: number }[] = [];

    // Raccogli tutti gli inventoryDocId con movimenti
    const allDocIds = new Set<string>();
    entratePerDocId.forEach((_, id) => allDocIds.add(id));
    uscitePerDocId.forEach((_, id) => allDocIds.add(id));

    for (const docId of allDocIds) {
      const invItem = inventoryItems.get(docId);
      if (!invItem) continue;

      const entrate = entratePerDocId.get(docId) || 0;
      const uscite = uscitePerDocId.get(docId) || 0;
      const calcolato = 0 + entrate - uscite; // Iniziale = 0
      const attuale = invItem.currentQty;
      const differenza = attuale - calcolato;

      risultato.push({
        item: invItem.name,
        categoria: invItem.categoryId,
        entrateLavanderia: entrate,
        usciteConsegne: uscite,
        calcolatoCorretto: calcolato,
        inventarioAttuale: attuale,
        differenza,
        stato: differenza === 0 ? "✅ OK" : differenza > 0 ? `⚠️ ${differenza} in più nel gestionale` : `❌ ${Math.abs(differenza)} in meno nel gestionale`,
      });

      if (differenza !== 0) {
        correzioni.push({ docId, name: invItem.name, from: attuale, to: calcolato });
      }
    }

    risultato.sort((a, b) => a.item.localeCompare(b.item));
    correzioni.sort((a, b) => a.name.localeCompare(b.name));

    // ── 5. Separa biancheria per leggibilità ──
    const biancheria = risultato.filter(r => {
      const n = r.item.toLowerCase();
      return n.includes("lenzuol") || n.includes("feder") || n.includes("telo") ||
             n.includes("asciugaman") || n.includes("tappetino") || n.includes("scendi") || n.includes("copri");
    });

    // ── 6. ESEGUI se POST ──
    if (!isDryRun && correzioni.length > 0) {
      for (const corr of correzioni) {
        await adminDb.collection("inventory").doc(corr.docId).update({
          quantity: corr.to,
          updatedAt: Timestamp.now(),
          lastCorrectedAt: Timestamp.now(),
          lastCorrectedBy: "audit-inventory-correct",
          lastCorrectedFrom: corr.from,
        });
      }
    }

    return NextResponse.json({
      mode: isDryRun ? "DRY_RUN" : "EXECUTED",
      nota: "Calcolo: inventario_iniziale(0) + entrate_lavanderia(dal 1 aprile) - uscite_consegne(dal 1 aprile) = inventario_corretto",
      riepilogo: {
        consegneLavanderia: laundryCount,
        ordiniConsegnati: ordersCount,
        itemDaCorreggere: correzioni.length,
      },
      biancheria,
      tuttiGliItem: risultato,
      correzioni: correzioni.map(c => ({ item: c.name, da: c.from, a: c.to })),
      dettaglioConsegneLavanderia: laundryDetail,
    });

  } catch (error) {
    console.error("❌ Errore audit-inventory-correct:", error);
    return NextResponse.json({ error: "Errore server", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
