import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * 🔍 TRACE COMPLETO INVENTARIO — Ricostruisce tutti i movimenti
 * 
 * GET /api/admin/audit-inventory-trace
 * 
 * Per ogni item di biancheria, ricostruisce:
 * 1. Tutte le entrate lavanderia (laundryDeliveries COMPLETED) — TUTTE, non solo da aprile
 * 2. Tutte le uscite ordini DELIVERED con inventoryDeducted=true — TUTTE
 * 3. Uscite ordini DELIVERED senza inventoryDeducted (non scalati)
 * 4. Inventario attuale
 * 5. Confronto: entrate_totali - uscite_scalate = inventario? Se sì, il sistema è coerente
 */
export async function GET(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user || _user.role?.toUpperCase() !== "ADMIN")
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    // ── 1. Inventario attuale ──
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryData = new Map<string, { name: string; quantity: number; docId: string }>();
    const nameToDocId = new Map<string, string>();
    const keyToDocId = new Map<string, string>();

    inventorySnap.docs.forEach(doc => {
      const d = doc.data() as Record<string, any>;
      const item = { name: d.name || doc.id, quantity: d.quantity || 0, docId: doc.id };
      inventoryData.set(doc.id, item);
      if (d.name) nameToDocId.set(d.name, doc.id);
      keyToDocId.set(doc.id, doc.id);
      if (d.key) keyToDocId.set(d.key, doc.id);
    });

    // ── 2. TUTTE le entrate lavanderia (senza filtro data) ──
    const laundrySnap = await adminDb.collection("laundryDeliveries").get();
    const entrateTotali = new Map<string, { qty: number; perDay: { date: string; qty: number }[] }>();

    for (const doc of laundrySnap.docs) {
      const data = doc.data() as Record<string, any>;
      if (data.status !== "COMPLETED") continue;
      if (data.inventoryApplied !== true) continue; // Solo quelle effettivamente applicate all'inventario
      const dateKey = data.dateKey || doc.id;

      for (const [name, qty] of Object.entries(data.deliveredItems || {})) {
        const q = qty as number;
        if (q <= 0) continue;
        const existing = entrateTotali.get(name);
        if (existing) {
          existing.qty += q;
          existing.perDay.push({ date: dateKey, qty: q });
        } else {
          entrateTotali.set(name, { qty: q, perDay: [{ date: dateKey, qty: q }] });
        }
      }
    }

    // Conta anche quelle NON applicate
    const entrateNonApplicate = new Map<string, number>();
    for (const doc of laundrySnap.docs) {
      const data = doc.data() as Record<string, any>;
      if (data.status !== "COMPLETED") continue;
      if (data.inventoryApplied === true) continue;
      for (const [name, qty] of Object.entries(data.deliveredItems || {})) {
        if ((qty as number) > 0) {
          entrateNonApplicate.set(name, (entrateNonApplicate.get(name) || 0) + (qty as number));
        }
      }
    }

    // ── 3. TUTTE le uscite ordini (senza filtro data) ──
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "==", "DELIVERED")
      .get();

    const usciteScalate = new Map<string, number>();
    const usciteNonScalate = new Map<string, number>();
    let ordiniScalati = 0;
    let ordiniNonScalati = 0;

    for (const doc of ordersSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const isDeducted = data.inventoryDeducted === true;
      
      if (isDeducted) ordiniScalati++;
      else ordiniNonScalati++;

      for (const item of (data.items || [])) {
        const qty = item.quantity || 0;
        if (qty <= 0) continue;
        const name = item.name || item.id || "???";

        // Verifica che l'item sia tracciato in inventario
        const invDocId = keyToDocId.get(item.id) || nameToDocId.get(name);
        if (!invDocId) continue; // Non tracciato

        if (isDeducted) {
          usciteScalate.set(name, (usciteScalate.get(name) || 0) + qty);
        } else {
          usciteNonScalate.set(name, (usciteNonScalate.get(name) || 0) + qty);
        }
      }
    }

    // ── 4. Riconciliazione item per item ──
    const biancheriaNames = new Set<string>();
    const BIANCHERIA_KEYWORDS = ["lenzuol", "feder", "copri", "telo", "asciugaman", "tappetino", "scendi"];
    
    // Raccogli tutti i nomi
    entrateTotali.forEach((_, name) => { if (BIANCHERIA_KEYWORDS.some(kw => name.toLowerCase().includes(kw))) biancheriaNames.add(name); });
    usciteScalate.forEach((_, name) => { if (BIANCHERIA_KEYWORDS.some(kw => name.toLowerCase().includes(kw))) biancheriaNames.add(name); });
    usciteNonScalate.forEach((_, name) => { if (BIANCHERIA_KEYWORDS.some(kw => name.toLowerCase().includes(kw))) biancheriaNames.add(name); });

    const riconciliazione: any[] = [];
    for (const name of biancheriaNames) {
      const inApplicate = entrateTotali.get(name)?.qty || 0;
      const inNonApplicate = entrateNonApplicate.get(name) || 0;
      const outScalate = usciteScalate.get(name) || 0;
      const outNonScalate = usciteNonScalate.get(name) || 0;
      const invDocId = nameToDocId.get(name);
      const invQty = invDocId ? (inventoryData.get(invDocId)?.quantity ?? null) : null;

      // Formula: inventario_attuale = entrate_applicate - uscite_scalate
      // Se questo coincide → il sistema è coerente, i non-scalati sono il gap
      const calcolato = inApplicate - outScalate;
      const coerente = invQty !== null ? calcolato === invQty : null;

      riconciliazione.push({
        item: name,
        entrateApplicate: inApplicate,
        entrateNonApplicate: inNonApplicate,
        entrateTotali: inApplicate + inNonApplicate,
        usciteScalate: outScalate,
        usciteNonScalate: outNonScalate,
        usciteTotali: outScalate + outNonScalate,
        inventarioCalcolato: calcolato,
        inventarioReale: invQty ?? "N/A",
        coerente: coerente ?? "N/A",
        giorni: entrateTotali.get(name)?.perDay?.map(d => `${d.date}:${d.qty}`).join(", ") || "nessuna",
      });
    }

    riconciliazione.sort((a, b) => a.item.localeCompare(b.item));

    return NextResponse.json({
      riepilogo: {
        ordiniDeliveredTotali: ordiniScalati + ordiniNonScalati,
        ordiniScalati,
        ordiniNonScalati,
        consegneLavanderiaApplicate: laundrySnap.docs.filter(d => d.data().status === "COMPLETED" && d.data().inventoryApplied === true).length,
        consegneLavanderiaNonApplicate: laundrySnap.docs.filter(d => d.data().status === "COMPLETED" && d.data().inventoryApplied !== true).length,
      },
      riconciliazioneBiancheria: riconciliazione,
    });

  } catch (error) {
    console.error("❌ Errore audit-inventory-trace:", error);
    return NextResponse.json({ error: "Errore server", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
