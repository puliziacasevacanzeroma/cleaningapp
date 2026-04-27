import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/inventory-fix-orders
 * 
 * Aggiorna gli items[] di tutti gli ordini per usare i nuovi docId canonici.
 * Da lanciare DOPO inventory-migrate.
 * 
 * Mappa applicata su items[].id:
 *   doubleSheets       → item_doublesheets       (Lenzuola Matrimoniali)
 *   singleSheets       → item_singlesheets       (Lenzuola Singole)
 *   pillowcases        → item_pillowcases        (Federe)
 *   towelsLarge        → item_towelslarge        (Telo Doccia)
 *   towelsFace         → item_towelsface         (Asciugamano Viso)
 *   towelsSmall        → item_towelssmall        (Asciugamano Bidet)
 *   bathMats           → item_bathmats           (Tappetino Scendibagno)
 *   cremaCorpo         → item_cuffia_doccia      (Cuffia Doccia, era nominato male)
 *   crema              → item_crema_corpo        (Crema Corpo)
 *   bagnoschiuma       → item_doccia_shampoo     (Doccia-Shampoo)
 *   shampoo            → item_set_cortesia       (Set di Cortesia, era nominato male)
 *   saponetta          → item_saponetta          (resta uguale)
 *   canavaccio_cucina  → item_canavaccio_cucina  (con prefisso item_)
 *   prosecco_dry       → item_prosecco_dry       (con prefisso item_)
 *   copripiumino_*     → item_copripiumino_*     (con prefisso item_)
 *
 * Aggiunge anche name e categoryName aggiornati a ogni item.
 *
 * Query params:
 * - dryRun = 'false' per eseguire davvero (default: true = solo simulazione)
 * - secret = secret per autorizzare
 * - month  = mese (es. 4) per limitare l'aggiornamento
 * - year   = anno (es. 2026) per limitare l'aggiornamento
 *   (se month e year sono entrambi specificati, aggiorna solo gli ordini di quel mese)
 */
export async function GET(req: NextRequest) {
  try {
    const dryRun = req.nextUrl.searchParams.get('dryRun') !== 'false';
    const secret = req.nextUrl.searchParams.get('secret');
    const monthStr = req.nextUrl.searchParams.get('month');
    const yearStr = req.nextUrl.searchParams.get('year');

    if (!dryRun) {
      const expected = process.env.MIGRATION_SECRET || process.env.CRON_SECRET;
      if (expected && secret !== expected) {
        return NextResponse.json({
          error: "Non autorizzato. Aggiungi &secret=XXX",
        }, { status: 401 });
      }
    }

    // Mappa di rinaming: vecchio id → nuovo {docId, name, category}
    const ID_MAP: Record<string, { docId: string; name: string; category: string }> = {
      // Biancheria letto
      "doubleSheets":   { docId: "item_doublesheets",   name: "Lenzuola Matrimoniali",      category: "biancheria_letto" },
      "doublesheets":   { docId: "item_doublesheets",   name: "Lenzuola Matrimoniali",      category: "biancheria_letto" },
      "item_doubleSheets": { docId: "item_doublesheets", name: "Lenzuola Matrimoniali",     category: "biancheria_letto" },
      "singleSheets":   { docId: "item_singlesheets",   name: "Lenzuola Singole",           category: "biancheria_letto" },
      "singlesheets":   { docId: "item_singlesheets",   name: "Lenzuola Singole",           category: "biancheria_letto" },
      "item_singleSheets": { docId: "item_singlesheets", name: "Lenzuola Singole",          category: "biancheria_letto" },
      "pillowcases":    { docId: "item_pillowcases",    name: "Federe",                     category: "biancheria_letto" },
      "copripiumino_matrimoniale": { docId: "item_copripiumino_matrimoniale", name: "Copripiumino Matrimoniale", category: "biancheria_letto" },
      "copripiumino_singolo": { docId: "item_copripiumino_singolo", name: "Copripiumino Singolo", category: "biancheria_letto" },
      // Biancheria bagno
      "towelsLarge":    { docId: "item_towelslarge",    name: "Telo Doccia",                category: "biancheria_bagno" },
      "towelslarge":    { docId: "item_towelslarge",    name: "Telo Doccia",                category: "biancheria_bagno" },
      "item_towelsLarge": { docId: "item_towelslarge",  name: "Telo Doccia",                category: "biancheria_bagno" },
      "towelsFace":     { docId: "item_towelsface",     name: "Asciugamano Viso",           category: "biancheria_bagno" },
      "towelsface":     { docId: "item_towelsface",     name: "Asciugamano Viso",           category: "biancheria_bagno" },
      "item_towelsFace": { docId: "item_towelsface",    name: "Asciugamano Viso",           category: "biancheria_bagno" },
      "towelsSmall":    { docId: "item_towelssmall",    name: "Asciugamano Bidet",          category: "biancheria_bagno" },
      "towelssmall":    { docId: "item_towelssmall",    name: "Asciugamano Bidet",          category: "biancheria_bagno" },
      "item_towelsSmall": { docId: "item_towelssmall",  name: "Asciugamano Bidet",          category: "biancheria_bagno" },
      "bathMats":       { docId: "item_bathmats",       name: "Tappetino Scendibagno",      category: "biancheria_bagno" },
      "bathmats":       { docId: "item_bathmats",       name: "Tappetino Scendibagno",      category: "biancheria_bagno" },
      "item_bathMats":  { docId: "item_bathmats",       name: "Tappetino Scendibagno",      category: "biancheria_bagno" },
      // Kit cortesia (i bug più gravi)
      "cremaCorpo":     { docId: "item_cuffia_doccia",  name: "Cuffia Doccia",              category: "kit_cortesia" }, // ⚠️ era nominato male
      "crema":          { docId: "item_crema_corpo",    name: "Crema Corpo",                category: "kit_cortesia" },
      "item_crema":     { docId: "item_crema_corpo",    name: "Crema Corpo",                category: "kit_cortesia" },
      "bagnoschiuma":   { docId: "item_doccia_shampoo", name: "Doccia-Shampoo",             category: "kit_cortesia" }, // ⚠️ era nominato male
      "shampoo":        { docId: "item_set_cortesia",   name: "Set di Cortesia",            category: "kit_cortesia" }, // ⚠️ era nominato male
      "item_shampoo":   { docId: "item_set_cortesia",   name: "Set di Cortesia",            category: "kit_cortesia" },
      "saponetta":      { docId: "item_saponetta",      name: "Saponetta",                  category: "kit_cortesia" },
      "item_saponetta": { docId: "item_saponetta",      name: "Saponetta",                  category: "kit_cortesia" },
      "canavaccio_cucina": { docId: "item_canavaccio_cucina", name: "Canavaccio Cucina",    category: "kit_cortesia" },
      "cuffia_doccia":  { docId: "item_cuffia_doccia",  name: "Cuffia Doccia",              category: "kit_cortesia" },
      "doccia_shampoo": { docId: "item_doccia_shampoo", name: "Doccia-Shampoo",             category: "kit_cortesia" },
      "set_cortesia":   { docId: "item_set_cortesia",   name: "Set di Cortesia",            category: "kit_cortesia" },
      "crema_corpo":    { docId: "item_crema_corpo",    name: "Crema Corpo",                category: "kit_cortesia" },
      // Servizi extra
      "prosecco_dry":   { docId: "item_prosecco_dry",   name: "Prosecco dry",               category: "servizi_extra" },
      // Vecchi docId Firestore casuali residui (alcuni ordini hanno questi al posto del key)
      "V1vp8PpPMrfdt9HWWqOm": { docId: "item_canavaccio_cucina", name: "Canavaccio Cucina", category: "kit_cortesia" },
      "HkWrWkdOGdAAvu0Z6TxI": { docId: "item_copripiumino_matrimoniale", name: "Copripiumino Matrimoniale", category: "biancheria_letto" },
      "4dAI4RBjbLkqww2F1U7d": { docId: "item_copripiumino_singolo", name: "Copripiumino Singolo", category: "biancheria_letto" },
      "h7Dtf8DsJdc1I0PZGccb": { docId: "item_prosecco_dry", name: "Prosecco dry",           category: "servizi_extra" },
      // Identità per i canonici (nessuna trasformazione, ma aggiorno name e categoryName)
      "item_canavaccio_cucina": { docId: "item_canavaccio_cucina", name: "Canavaccio Cucina", category: "kit_cortesia" },
      "item_doccia_shampoo": { docId: "item_doccia_shampoo", name: "Doccia-Shampoo",        category: "kit_cortesia" },
      "item_cuffia_doccia": { docId: "item_cuffia_doccia",  name: "Cuffia Doccia",          category: "kit_cortesia" },
      "item_crema_corpo": { docId: "item_crema_corpo",    name: "Crema Corpo",              category: "kit_cortesia" },
      "item_set_cortesia": { docId: "item_set_cortesia",  name: "Set di Cortesia",          category: "kit_cortesia" },
      "item_doublesheets": { docId: "item_doublesheets", name: "Lenzuola Matrimoniali",     category: "biancheria_letto" },
      "item_singlesheets": { docId: "item_singlesheets", name: "Lenzuola Singole",          category: "biancheria_letto" },
      "item_pillowcases": { docId: "item_pillowcases",  name: "Federe",                     category: "biancheria_letto" },
      "item_copripiumino_matrimoniale": { docId: "item_copripiumino_matrimoniale", name: "Copripiumino Matrimoniale", category: "biancheria_letto" },
      "item_copripiumino_singolo": { docId: "item_copripiumino_singolo", name: "Copripiumino Singolo", category: "biancheria_letto" },
      "item_towelslarge": { docId: "item_towelslarge",  name: "Telo Doccia",                category: "biancheria_bagno" },
      "item_towelsface": { docId: "item_towelsface",   name: "Asciugamano Viso",           category: "biancheria_bagno" },
      "item_towelssmall": { docId: "item_towelssmall", name: "Asciugamano Bidet",          category: "biancheria_bagno" },
      "item_bathmats":  { docId: "item_bathmats",      name: "Tappetino Scendibagno",      category: "biancheria_bagno" },
      "item_prosecco_dry": { docId: "item_prosecco_dry", name: "Prosecco dry",              category: "servizi_extra" },
    };

    // Carico ordini (filtrati se month/year specificati)
    let query: any = adminDb.collection("orders");
    if (monthStr && yearStr) {
      const month = parseInt(monthStr, 10);
      const year = parseInt(yearStr, 10);
      const { Timestamp } = await import("firebase-admin/firestore");
      const startTs = Timestamp.fromDate(new Date(year, month - 1, 1));
      const endTs = Timestamp.fromDate(new Date(year, month, 0, 23, 59, 59, 999));
      query = query.where("scheduledDate", ">=", startTs).where("scheduledDate", "<=", endTs);
    }
    const ordersSnap = await query.get();

    const stats = {
      ordersScanned: 0,
      ordersToUpdate: 0,
      itemsRenamed: 0,
      unmappedItemIds: new Set<string>(),
    };
    const updates: Array<{ docId: string; itemsBefore: any[]; itemsAfter: any[] }> = [];

    for (const doc of ordersSnap.docs) {
      stats.ordersScanned++;
      const d: any = doc.data();
      if (!d.items || !Array.isArray(d.items)) continue;

      let orderModified = false;
      const newItems = d.items.map((item: any) => {
        const oldId = item.itemId || item.id || "";
        const mapping = ID_MAP[oldId];
        if (!mapping) {
          if (oldId) stats.unmappedItemIds.add(oldId);
          return item;
        }
        // Solo se serve un cambio (id diverso o name/categoryName mancanti)
        if (item.id === mapping.docId && item.itemId === mapping.docId
            && item.name === mapping.name && item.categoryName === mapping.category) {
          return item;
        }
        orderModified = true;
        stats.itemsRenamed++;
        return {
          ...item,
          itemId: mapping.docId,
          id: mapping.docId,
          name: mapping.name,
          categoryName: mapping.category,
        };
      });

      if (orderModified) {
        stats.ordersToUpdate++;
        updates.push({
          docId: doc.id,
          itemsBefore: d.items.map((it: any) => ({ id: it.id, name: it.name })),
          itemsAfter: newItems.map((it: any) => ({ id: it.id, name: it.name })),
        });
      }
    }

    // Esecuzione
    let executedUpdates = 0;
    if (!dryRun) {
      // Batch da 400 (limite Firestore: 500)
      const BATCH_SIZE = 400;
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const slice = updates.slice(i, i + BATCH_SIZE);
        const batch = adminDb.batch();
        for (const upd of slice) {
          // Devo ricalcolare i newItems per ogni doc (li avevo già nello stats; ricostruisco)
          const ordDoc = await adminDb.collection("orders").doc(upd.docId).get();
          const ordData: any = ordDoc.data();
          const newItems = ordData.items.map((item: any) => {
            const oldId = item.itemId || item.id || "";
            const mapping = ID_MAP[oldId];
            if (!mapping) return item;
            return {
              ...item,
              itemId: mapping.docId,
              id: mapping.docId,
              name: mapping.name,
              categoryName: mapping.category,
            };
          });
          const ref = adminDb.collection("orders").doc(upd.docId);
          batch.update(ref, { items: newItems });
          executedUpdates++;
        }
        await batch.commit();
      }
    }

    return NextResponse.json({
      mode: dryRun ? "DRY RUN (nessuna modifica)" : "ESEGUITO",
      summary: {
        ...stats,
        unmappedItemIds: Array.from(stats.unmappedItemIds),
      },
      executedUpdates,
      sampleUpdates: updates.slice(0, 10),
      totalOrdersToUpdate: updates.length,
      nextSteps: dryRun
        ? "Se ok, rilancia con &dryRun=false&secret=TUO_SECRET per eseguire davvero"
        : "Aggiornamento completato. Lancia /api/debug/inventory-audit per verificare.",
    });
  } catch (err: any) {
    console.error("[inventory-fix-orders] errore:", err);
    return NextResponse.json({
      error: "Errore durante il fix degli ordini",
      message: err?.message || String(err),
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
    }, { status: 500 });
  }
}
