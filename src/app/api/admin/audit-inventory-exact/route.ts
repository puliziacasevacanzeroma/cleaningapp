import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * 🔍 CALCOLO ESATTO INVENTARIO
 * 
 * GET  → Calcola quanti item dovrebbero esserci e trova doppie scalature
 * POST → Corregge l'inventario ai valori calcolati
 * 
 * Logica:
 * - Ogni ordine DELIVERED conta come UNA uscita (indipendentemente da inventoryDeducted)
 * - Entrate = TUTTE le laundryDeliveries COMPLETED con inventoryApplied=true
 * - Entrate NON applicate vengono segnalate
 * - Inventario corretto = Entrate applicate - Uscite (1 per ordine)
 * - Trova ordini scalati sia dal rider che dall'auto-conferma (doppia scalatura)
 */
export async function GET(request: NextRequest) { return handler(request, true); }
export async function POST(request: NextRequest) { return handler(request, false); }

async function handler(request: NextRequest, isDryRun: boolean) {
  try {
    const _user = await getApiUser();
    if (!_user || _user.role?.toUpperCase() !== "ADMIN")
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

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

    // ── 2. ENTRATE: laundryDeliveries COMPLETED con inventoryApplied=true ──
    const laundrySnap = await adminDb.collection("laundryDeliveries").get();
    // Mappa: inventoryDocId → quantità totale entrata
    const entratePerDocId = new Map<string, number>();
    let laundryApplied = 0;
    let laundryNotApplied = 0;
    const entrateNonApplicateDetail: any[] = [];

    for (const doc of laundrySnap.docs) {
      const data = doc.data() as Record<string, any>;
      if (data.status !== "COMPLETED") continue;

      const isApplied = data.inventoryApplied === true;
      if (isApplied) laundryApplied++;
      else {
        laundryNotApplied++;
        entrateNonApplicateDetail.push({ dateKey: data.dateKey || doc.id, items: data.deliveredItems || {} });
      }

      // Conta SOLO quelle applicate per il calcolo
      if (!isApplied) continue;

      for (const [itemName, qty] of Object.entries(data.deliveredItems || {})) {
        const q = qty as number;
        if (q <= 0) continue;
        const docId = nameToDocId.get(itemName);
        if (docId) {
          entratePerDocId.set(docId, (entratePerDocId.get(docId) || 0) + q);
        }
      }
    }

    // ── 3. USCITE: OGNI ordine DELIVERED = 1 uscita ──
    // Non importa se inventoryDeducted è true o false — l'ordine è stato consegnato fisicamente
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "==", "DELIVERED")
      .get();

    const uscitePerDocId = new Map<string, number>();
    let totalOrders = 0;
    let ordersDeducted = 0;
    let ordersNotDeducted = 0;
    
    // Trova possibili doppie scalature
    const doubleDeducted: any[] = [];

    for (const doc of ordersSnap.docs) {
      const data = doc.data() as Record<string, any>;
      totalOrders++;

      if (data.inventoryDeducted === true) ordersDeducted++;
      else ordersNotDeducted++;

      // Cerca doppie scalature: deliveredBy rider + autoConfirmedByCleaningCompletion
      if (data.inventoryDeducted === true && data.autoConfirmedByCleaningCompletion === true && data.deliveredByName) {
        doubleDeducted.push({
          orderId: doc.id,
          property: data.propertyName || "???",
          date: data.scheduledDate?.toDate?.()?.toISOString().split('T')[0] || "???",
          deliveredBy: data.deliveredByName,
          reason: "Rider ha consegnato + pulizia completata = possibile doppia scalatura",
        });
      }

      // Conta uscite per ogni item
      for (const item of (data.items || [])) {
        const qty = item.quantity || 0;
        if (qty <= 0) continue;
        const docId = keyToDocId.get(item.id) || nameToDocId.get(item.name);
        if (docId) {
          uscitePerDocId.set(docId, (uscitePerDocId.get(docId) || 0) + qty);
        }
      }
    }

    // ── 4. CALCOLO INVENTARIO ESATTO ──
    // Per ogni item: entrate_applicate - uscite_reali = quantità_corretta
    const risultato: any[] = [];
    const correzioni: { docId: string; name: string; from: number; to: number }[] = [];

    for (const [docId, invItem] of inventoryItems) {
      const entrate = entratePerDocId.get(docId) || 0;
      const uscite = uscitePerDocId.get(docId) || 0;
      const calcolato = entrate - uscite;
      const attuale = invItem.currentQty;
      const differenza = attuale - calcolato;

      // Filtra solo biancheria e items con movimenti
      if (entrate === 0 && uscite === 0) continue;

      const entry: any = {
        item: invItem.name,
        categoria: invItem.categoryId,
        entrate,
        uscite,
        calcolatoEsatto: calcolato,
        inventarioAttuale: attuale,
        differenza,
        stato: differenza === 0 ? "✅ OK" : differenza > 0 ? `⚠️ +${differenza} in più` : `❌ ${differenza} in meno`,
      };
      risultato.push(entry);

      if (differenza !== 0) {
        correzioni.push({ docId, name: invItem.name, from: attuale, to: calcolato });
      }
    }

    risultato.sort((a, b) => a.item.localeCompare(b.item));

    // ── 5. ESEGUI CORREZIONE se POST ──
    if (!isDryRun && correzioni.length > 0) {
      for (const corr of correzioni) {
        await adminDb.collection("inventory").doc(corr.docId).update({
          quantity: corr.to,
          updatedAt: Timestamp.now(),
          lastCorrectedAt: Timestamp.now(),
          lastCorrectedBy: "audit-inventory-exact",
          lastCorrectedFrom: corr.from,
        });
      }

      // Segna TUTTI gli ordini DELIVERED come inventoryDeducted
      // (perché il calcolo tiene conto di tutte le uscite)
      const batch = adminDb.batch();
      let batchCount = 0;
      for (const doc of ordersSnap.docs) {
        const data = doc.data() as Record<string, any>;
        if (data.inventoryDeducted !== true) {
          batch.update(doc.ref, { 
            inventoryDeducted: true, 
            inventoryDeductedAt: Timestamp.now(),
            inventoryDeductedBy: "audit-inventory-exact",
          });
          batchCount++;
          if (batchCount >= 490) break; // Firestore batch limit ~500
        }
      }
      if (batchCount > 0) {
        await batch.commit();
      }
    }

    return NextResponse.json({
      mode: isDryRun ? "DRY_RUN" : "EXECUTED",
      riepilogo: {
        ordiniDelivered: totalOrders,
        ordiniConInventoryDeducted: ordersDeducted,
        ordiniSenzaInventoryDeducted: ordersNotDeducted,
        consegneLavanderiaApplicate: laundryApplied,
        consegneLavanderiaNonApplicate: laundryNotApplied,
        possibiliDoppieScalature: doubleDeducted.length,
        itemDaCorreggere: correzioni.length,
      },
      calcoloEsatto: risultato,
      correzioni: correzioni.map(c => ({ item: c.name, da: c.from, a: c.to, differenza: c.from - c.to })),
      doppieScalature: doubleDeducted,
      entrateNonApplicate: entrateNonApplicateDetail,
    });

  } catch (error) {
    console.error("❌ Errore audit-inventory-exact:", error);
    return NextResponse.json({ error: "Errore server", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
