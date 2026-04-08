import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * 🔬 TRACE MOVIMENTI — Analizza COME ogni ordine ha scalato l'inventario
 * 
 * Per ogni ordine DELIVERED dal 1 aprile:
 * - Chi l'ha consegnato (rider vs auto-conferma)
 * - Se inventoryDeducted = true
 * - Se è stato scalato sia dal rider che dalla complete (doppia scalatura)
 * - Quante volte ha effettivamente decrementato l'inventario
 */
export async function GET(request: NextRequest) {
  try {
    const _user = await getApiUser();
    if (!_user || _user.role?.toUpperCase() !== "ADMIN")
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const startDate = new Date("2026-04-01T00:00:00");

    // Carica inventario
    const inventorySnap = await adminDb.collection("inventory").get();
    const nameToDocId = new Map<string, string>();
    const keyToDocId = new Map<string, string>();
    inventorySnap.docs.forEach(doc => {
      const d = doc.data() as Record<string, any>;
      if (d.name) nameToDocId.set(d.name, doc.id);
      keyToDocId.set(doc.id, doc.id);
      if (d.key) keyToDocId.set(d.key, doc.id);
    });

    // Carica ordini DELIVERED dal 1 aprile
    const ordersSnap = await adminDb.collection("orders")
      .where("status", "==", "DELIVERED")
      .get();

    // Categorie di ordini
    const categories = {
      riderOnly: [] as any[],           // Consegnato dal rider, NO auto-conferma
      autoConfirmOnly: [] as any[],      // Auto-confermato dalla complete, MAI consegnato dal rider
      riderPlusAutoConfirm: [] as any[], // ENTRAMBI — possibile doppia scalatura!
      noDeliveryInfo: [] as any[],       // Né rider né auto-conferma
    };

    // Conta scalature per tipo
    const scalature = {
      byDeliver: 0,       // inventoryDeducted=true + deliveredByName presente + no autoConfirmed
      byComplete: 0,      // inventoryDeducted=true + autoConfirmedByCleaningCompletion=true + no deliveredByName
      byBoth: 0,          // inventoryDeducted=true + ENTRAMBI i flag
      notDeducted: 0,     // inventoryDeducted !== true
      total: 0,
    };

    // Calcola uscite reali (quante volte l'inventario è stato EFFETTIVAMENTE scalato)
    // Se un ordine ha inventoryDeducted=true, è stato scalato 1 volta
    // Se ha ENTRAMBI i flag (rider+autoConfirm), potrebbe essere stato scalato 2 volte
    const usciteEffettive = new Map<string, number>(); // inventoryDocId -> qty
    const uscitePossibiliDoppie = new Map<string, number>();

    for (const doc of ordersSnap.docs) {
      const data = doc.data() as Record<string, any>;
      const schedDate = data.scheduledDate?.toDate?.();
      const delivDate = data.deliveredAt?.toDate?.();
      const orderDate = delivDate || schedDate;
      if (!orderDate || orderDate < startDate) continue;

      scalature.total++;

      const hasRider = !!data.deliveredByName && data.deliveredByName !== "N/A";
      const hasAutoConfirm = data.autoConfirmedByCleaningCompletion === true;
      const isDeducted = data.inventoryDeducted === true;
      const dateStr = schedDate ? schedDate.toISOString().split('T')[0] : "???";

      const orderInfo = {
        orderId: doc.id,
        property: data.propertyName || "???",
        date: dateStr,
        rider: data.deliveredByName || "N/A",
        autoConfirmed: hasAutoConfirm,
        inventoryDeducted: isDeducted,
        completedCleaningId: data.completedCleaningId || null,
        itemsCount: (data.items || []).length,
        totalPcs: (data.items || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0),
      };

      // Categorizza
      if (hasRider && hasAutoConfirm) {
        categories.riderPlusAutoConfirm.push(orderInfo);
        scalature.byBoth++;
      } else if (hasRider) {
        categories.riderOnly.push(orderInfo);
        scalature.byDeliver++;
      } else if (hasAutoConfirm) {
        categories.autoConfirmOnly.push(orderInfo);
        scalature.byComplete++;
      } else {
        categories.noDeliveryInfo.push(orderInfo);
      }

      if (!isDeducted) scalature.notDeducted++;

      // Conta uscite effettive
      for (const item of (data.items || [])) {
        const qty = item.quantity || 0;
        if (qty <= 0) continue;
        const docId = keyToDocId.get(item.id) || nameToDocId.get(item.name);
        if (!docId) continue;

        // Se ha ENTRAMBI i flag, potrebbe aver scalato 2 volte
        if (hasRider && hasAutoConfirm && isDeducted) {
          uscitePossibiliDoppie.set(docId, (uscitePossibiliDoppie.get(docId) || 0) + qty);
        }

        // Conta come 1 uscita (la consegna fisica)
        usciteEffettive.set(docId, (usciteEffettive.get(docId) || 0) + qty);
      }
    }

    // Calcola impatto doppie scalature sulla biancheria
    const BIANCHERIA_KEYWORDS = ["lenzuol", "feder", "telo", "asciugaman", "tappetino", "scendi", "copri"];
    const impattoDoppie: any[] = [];
    
    for (const [docId, doppiaQty] of uscitePossibiliDoppie) {
      const invItem = inventorySnap.docs.find(d => d.id === docId);
      const name = invItem?.data()?.name || docId;
      if (!BIANCHERIA_KEYWORDS.some(kw => name.toLowerCase().includes(kw))) continue;
      
      const currentQty = invItem?.data()?.quantity || 0;
      impattoDoppie.push({
        item: name,
        pezziPossibileDoppia: doppiaQty,
        ordiniCoinvolti: categories.riderPlusAutoConfirm.length,
        inventarioAttuale: currentQty,
      });
    }
    impattoDoppie.sort((a, b) => b.pezziPossibileDoppia - a.pezziPossibileDoppia);

    // Riepilogo biancheria con entrate lavanderia
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

    // Tabella riepilogativa biancheria
    const biancheriaRiepilogo: any[] = [];
    const biancheriaNames = ["Lenzuola Matrimoniali", "Federe", "Lenzuola Singole", "Telo Doccia", "Asciugamano Viso", "Asciugamano Bidet", "Tappetino Scendibagno"];
    
    for (const name of biancheriaNames) {
      const docId = nameToDocId.get(name);
      if (!docId) continue;
      const invItem = inventorySnap.docs.find(d => d.id === docId);
      const currentQty = invItem?.data()?.quantity || 0;
      const entrate = entratePerNome.get(name) || 0;
      const uscite1x = usciteEffettive.get(docId) || 0;
      const possibileDoppia = uscitePossibiliDoppie.get(docId) || 0;
      const calcolatoSenzaDoppie = entrate - uscite1x;
      const calcolatoConDoppie = entrate - uscite1x - possibileDoppia;

      biancheriaRiepilogo.push({
        item: name,
        entrate,
        uscite1x: uscite1x,
        possibileDoppia,
        calcoloNormale: calcolatoSenzaDoppie,
        calcoloConDoppie: calcolatoConDoppie,
        gestionale: currentQty,
        differenzaNormale: currentQty - calcolatoSenzaDoppie,
        differenzaConDoppie: currentQty - calcolatoConDoppie,
      });
    }

    return NextResponse.json({
      riepilogo: {
        ordiniDal1Aprile: scalature.total,
        soloRider: categories.riderOnly.length,
        soloAutoConfirm: categories.autoConfirmOnly.length,
        riderPiuAutoConfirm: categories.riderPlusAutoConfirm.length,
        senzaInfo: categories.noDeliveryInfo.length,
        nonScalati: scalature.notDeducted,
      },
      biancheriaRiepilogo,
      impattoDoppieScalature: impattoDoppie,
      ordiniConDoppiaScalatura: categories.riderPlusAutoConfirm.sort((a, b) => a.date.localeCompare(b.date)),
      ordiniSenzaInfo: categories.noDeliveryInfo.sort((a, b) => a.date.localeCompare(b.date)),
      ordiniNonScalati: [...categories.riderOnly, ...categories.autoConfirmOnly, ...categories.noDeliveryInfo]
        .filter(o => !o.inventoryDeducted)
        .sort((a, b) => a.date.localeCompare(b.date)),
    });

  } catch (error) {
    console.error("❌ Errore audit-trace:", error);
    return NextResponse.json({ error: "Errore server", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
