import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * 🔬 DIAGNOSI FINALE — Trova ESATTAMENTE perché l'inventario non torna
 * 
 * Controlla:
 * 1. Quanti ordini hanno inventoryDeductedBy = "fix-non-deducted-orders" (fix già eseguito)
 * 2. Quanti ordini dal 1 aprile hanno inventoryDeducted=true con rider (scalati dal deliver)
 * 3. Il deliver route scala l'inventario MA in passato settava inventoryDeducted=true?
 *    Se no → gli stessi ordini sono stati ri-scalati dal fix
 */
export async function GET(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user || _user.role?.toUpperCase() !== "ADMIN")
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const startDate = new Date("2026-04-01T00:00:00");

    // Inventario
    const inventorySnap = await adminDb.collection("inventory").get();
    const nameToDocId = new Map<string, string>();
    const keyToDocId = new Map<string, string>();
    inventorySnap.docs.forEach(doc => {
      const d = doc.data() as Record<string, any>;
      if (d.name) nameToDocId.set(d.name, doc.id);
      keyToDocId.set(doc.id, doc.id);
      if (d.key) keyToDocId.set(d.key, doc.id);
    });

    // Ordini DELIVERED dal 1 aprile
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "==", "DELIVERED")
      .get();

    // Analisi per ordine
    const fixedByScript: any[] = [];
    const deductedByDeliver: any[] = [];
    const notDeducted: any[] = [];
    
    // Conta QUANTE volte ogni item è stato PROBABILMENTE scalato
    // Se inventoryDeducted=true E deliveredByName esiste → scalato dal deliver (1 volta sicura)
    // Se inventoryDeductedBy="fix-non-deducted-orders" → scalato dal fix (1 volta aggiuntiva)
    //   MA se il deliver aveva GIA' scalato senza settare il flag → fix ha ri-scalato = DOPPIA
    
    const uscitePerItem = new Map<string, { byDeliver: number; byFix: number; notDeducted: number }>();

    for (const doc of ordersSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const schedDate = data.scheduledDate?.toDate?.();
      const delivDate = data.deliveredAt?.toDate?.();
      const orderDate = delivDate || schedDate;
      if (!orderDate || orderDate < startDate) continue;

      const dateStr = schedDate ? schedDate.toISOString().split('T')[0] : "???";
      const isDeducted = data.inventoryDeducted === true;
      const deductedBy = data.inventoryDeductedBy || null;
      const deductedAt = data.inventoryDeductedAt?.toDate?.()?.toISOString() || null;
      const rider = data.deliveredByName || "N/A";
      
      const info = {
        orderId: doc.id,
        property: data.propertyName || "???",
        date: dateStr,
        rider,
        inventoryDeducted: isDeducted,
        inventoryDeductedBy: deductedBy,
        inventoryDeductedAt: deductedAt,
        totalPcs: (data.items || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0),
      };

      if (deductedBy === "fix-non-deducted-orders") {
        fixedByScript.push(info);
        // Questo ordine è stato scalato dal fix
        // MA se il rider lo aveva già consegnato e il vecchio deliver aveva già scalato
        // senza settare inventoryDeducted → è doppia scalatura!
        for (const item of (data.items || [])) {
          const qty = item.quantity || 0;
          if (qty <= 0) continue;
          const name = item.name || item.id;
          const existing = uscitePerItem.get(name) || { byDeliver: 0, byFix: 0, notDeducted: 0 };
          existing.byFix += qty;
          // Se ha anche un rider → il deliver aveva probabilmente già scalato
          if (rider !== "N/A") existing.byDeliver += qty;
          uscitePerItem.set(name, existing);
        }
      } else if (isDeducted) {
        deductedByDeliver.push(info);
        for (const item of (data.items || [])) {
          const qty = item.quantity || 0;
          if (qty <= 0) continue;
          const name = item.name || item.id;
          const existing = uscitePerItem.get(name) || { byDeliver: 0, byFix: 0, notDeducted: 0 };
          existing.byDeliver += qty;
          uscitePerItem.set(name, existing);
        }
      } else {
        notDeducted.push(info);
        for (const item of (data.items || [])) {
          const qty = item.quantity || 0;
          if (qty <= 0) continue;
          const name = item.name || item.id;
          const existing = uscitePerItem.get(name) || { byDeliver: 0, byFix: 0, notDeducted: 0 };
          existing.notDeducted += qty;
          uscitePerItem.set(name, existing);
        }
      }
    }

    // Riepilogo biancheria
    const BIANCHERIA = ["Lenzuola Matrimoniali", "Federe", "Lenzuola Singole", "Telo Doccia", "Asciugamano Viso", "Asciugamano Bidet", "Tappetino Scendibagno"];
    
    // Entrate lavanderia
    const laundrySnap = await adminDb.collection("laundryDeliveries").get();
    const entratePerNome = new Map<string, number>();
    for (const doc of laundrySnap.docs) {
      const data = doc.data() as Record<string, any>;
      if (data.status !== "COMPLETED") continue;
      const dateKey = data.dateKey || doc.id;
      if (new Date(dateKey + "T12:00:00") < startDate) continue;
      for (const [name, qty] of Object.entries(data.deliveredItems || {})) {
        if ((qty as number) > 0) entratePerNome.set(name, (entratePerNome.get(name) || 0) + (qty as number));
      }
    }

    const biancheriaAnalisi = BIANCHERIA.map(name => {
      const entrate = entratePerNome.get(name) || 0;
      const data = uscitePerItem.get(name) || { byDeliver: 0, byFix: 0, notDeducted: 0 };
      const docId = nameToDocId.get(name);
      const invQty = docId ? (inventorySnap.docs.find(d => d.id === docId)?.data()?.quantity || 0) : "N/A";
      
      // Scalature effettive = deliver + fix (le notDeducted non scalano)
      const scalatureEffettive = data.byDeliver + data.byFix;
      // Se fix ha scalato ordini che il deliver aveva GIÀ scalato → doppie = byFix (perché il rider li aveva già scalati)
      const possibiliDoppie = data.byFix; // TUTTE le fix sono potenziali doppie se il deliver aveva già scalato
      
      const calcoloConDoppie = entrate - (data.byDeliver + data.notDeducted); // Uscite reali = deliver + non scalati (senza fix)
      
      return {
        item: name,
        entrate,
        usciteByDeliver: data.byDeliver,
        usciteByFix: data.byFix,
        usciteNotDeducted: data.notDeducted,
        scalatureEffettive,
        possibiliDoppie,
        calcoloCorretto: calcoloConDoppie,
        gestionale: invQty,
        differenza: typeof invQty === 'number' ? invQty - calcoloConDoppie : "N/A",
      };
    });

    return NextResponse.json({
      riepilogo: {
        ordiniDal1Aprile: deductedByDeliver.length + fixedByScript.length + notDeducted.length,
        scalatiDalDeliver: deductedByDeliver.length,
        scalatiDalFix: fixedByScript.length,
        nonScalati: notDeducted.length,
      },
      biancheriaAnalisi,
      ordiniScalatiDalFix: fixedByScript.sort((a, b) => a.date.localeCompare(b.date)),
      ordiniNonScalati: notDeducted.sort((a, b) => a.date.localeCompare(b.date)),
    });

  } catch (error) {
    console.error("❌ Errore audit-trace-final:", error);
    return NextResponse.json({ error: "Errore server", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
