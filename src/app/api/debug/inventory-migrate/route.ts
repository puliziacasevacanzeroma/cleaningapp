import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/inventory-migrate
 * 
 * Ripulisce e normalizza la collection inventory.
 * Operazioni:
 *  1. Crea i documenti standardizzati con docId pulito (item_<key>)
 *  2. Per i documenti con nome sbagliato (cremaCorpo, bagnoschiuma, item_shampoo)
 *     copia i dati in nuovi documenti corretti e marca i vecchi come deprecated
 *  3. Aggiunge campi mancanti (active, deleted, category) a tutti i doc validi
 *  4. NON tocca i prodotti pulizia interni (categoryId="prodotti_pulizia")
 * 
 * Query params:
 * - dryRun = 'false' per eseguire davvero (default: true = solo simulazione)
 * - secret = devi passare il secret per autorizzare
 */
export async function GET(req: NextRequest) {
  try {
    const dryRun = req.nextUrl.searchParams.get('dryRun') !== 'false';
    const secret = req.nextUrl.searchParams.get('secret');
    
    // Sicurezza: richiedi secret in modalità apply (non dry-run)
    if (!dryRun) {
      const expected = process.env.MIGRATION_SECRET || process.env.CRON_SECRET;
      if (expected && secret !== expected) {
        return NextResponse.json({
          error: "Non autorizzato. Aggiungi &secret=XXX dove XXX è MIGRATION_SECRET o CRON_SECRET.",
        }, { status: 401 });
      }
    }

    // ─── CONFIGURAZIONE FINALE INVENTARIO ────────────────────────
    // Questa è la fonte di verità. Ogni item:
    //  - canonicalDocId: il docId che vogliamo che abbia
    //  - key: la key canonica (snake_case)
    //  - name: nome italiano corretto
    //  - sellPrice: prezzo
    //  - category: categoria (uno dei 4 valori)
    //  - sourceDocId: (opzionale) docId attuale da cui prendere i dati storici
    const TARGET_INVENTORY: Array<{
      canonicalDocId: string;
      key: string;
      name: string;
      sellPrice: number;
      category: "biancheria_letto" | "biancheria_bagno" | "kit_cortesia" | "servizi_extra";
      unit: string;
      sourceDocIds?: string[];
    }> = [
      // KIT CORTESIA (6)
      { canonicalDocId: "item_canavaccio_cucina", key: "canavaccio_cucina", name: "Canavaccio Cucina", sellPrice: 1.50, category: "kit_cortesia", unit: "pz", sourceDocIds: ["V1vp8PpPMrfdt9HWWqOm"] },
      { canonicalDocId: "item_doccia_shampoo", key: "doccia_shampoo", name: "Doccia-Shampoo", sellPrice: 0.48, category: "kit_cortesia", unit: "pz", sourceDocIds: ["bagnoschiuma"] },
      { canonicalDocId: "item_cuffia_doccia", key: "cuffia_doccia", name: "Cuffia Doccia", sellPrice: 0.40, category: "kit_cortesia", unit: "pz", sourceDocIds: ["cremaCorpo"] },
      { canonicalDocId: "item_crema_corpo", key: "crema_corpo", name: "Crema Corpo", sellPrice: 0.50, category: "kit_cortesia", unit: "pz", sourceDocIds: ["item_crema"] },
      { canonicalDocId: "item_saponetta", key: "saponetta", name: "Saponetta", sellPrice: 0.28, category: "kit_cortesia", unit: "pz", sourceDocIds: ["item_saponetta"] },
      { canonicalDocId: "item_set_cortesia", key: "set_cortesia", name: "Set di Cortesia", sellPrice: 0.40, category: "kit_cortesia", unit: "pz", sourceDocIds: ["item_shampoo"] },
      // BIANCHERIA LETTO (5)
      { canonicalDocId: "item_doublesheets", key: "doublesheets", name: "Lenzuola Matrimoniali", sellPrice: 1.90, category: "biancheria_letto", unit: "pz", sourceDocIds: ["item_doubleSheets"] },
      { canonicalDocId: "item_singlesheets", key: "singlesheets", name: "Lenzuola Singole", sellPrice: 1.70, category: "biancheria_letto", unit: "pz", sourceDocIds: ["item_singleSheets"] },
      { canonicalDocId: "item_pillowcases", key: "pillowcases", name: "Federe", sellPrice: 0.90, category: "biancheria_letto", unit: "pz", sourceDocIds: ["item_pillowcases"] },
      { canonicalDocId: "item_copripiumino_matrimoniale", key: "copripiumino_matrimoniale", name: "Copripiumino Matrimoniale", sellPrice: 5.80, category: "biancheria_letto", unit: "pz", sourceDocIds: ["HkWrWkdOGdAAvu0Z6TxI"] },
      { canonicalDocId: "item_copripiumino_singolo", key: "copripiumino_singolo", name: "Copripiumino Singolo", sellPrice: 5.50, category: "biancheria_letto", unit: "pz", sourceDocIds: ["4dAI4RBjbLkqww2F1U7d"] },
      // BIANCHERIA BAGNO (4)
      { canonicalDocId: "item_towelslarge", key: "towelslarge", name: "Telo Doccia", sellPrice: 1.90, category: "biancheria_bagno", unit: "pz", sourceDocIds: ["item_towelsLarge"] },
      { canonicalDocId: "item_towelsface", key: "towelsface", name: "Asciugamano Viso", sellPrice: 1.00, category: "biancheria_bagno", unit: "pz", sourceDocIds: ["item_towelsFace"] },
      { canonicalDocId: "item_towelssmall", key: "towelssmall", name: "Asciugamano Bidet", sellPrice: 0.90, category: "biancheria_bagno", unit: "pz", sourceDocIds: ["item_towelsSmall"] },
      { canonicalDocId: "item_bathmats", key: "bathmats", name: "Tappetino Scendibagno", sellPrice: 1.00, category: "biancheria_bagno", unit: "pz", sourceDocIds: ["item_bathMats"] },
      // SERVIZI EXTRA (1)
      { canonicalDocId: "item_prosecco_dry", key: "prosecco_dry", name: "Prosecco dry", sellPrice: 18.00, category: "servizi_extra", unit: "pz", sourceDocIds: ["h7Dtf8DsJdc1I0PZGccb"] },
    ];

    // Documenti inventory che NON vanno toccati (prodotti pulizia interni + extra rimossi)
    // Ho rimosso "Anticalcare Bagno" dai servizi extra come richiesto
    const ANTICALCARE_DOC_ID = "anticalcare"; // Lo lascio in inventario ma cambio category a prodotti_pulizia

    // Carico tutto l'inventario attuale
    const inventorySnap = await adminDb.collection("inventory").get();
    const currentDocs = new Map<string, any>();
    for (const doc of inventorySnap.docs) {
      currentDocs.set(doc.id, doc.data());
    }

    // Operazioni pianificate
    const operations: Array<{
      action: "create" | "update" | "deprecate" | "categorize";
      docId: string;
      changes: any;
      reason: string;
    }> = [];

    // ─── 1. Per ogni item target: crea/aggiorna ─────────────────
    for (const target of TARGET_INVENTORY) {
      const targetDoc = currentDocs.get(target.canonicalDocId);
      
      if (targetDoc) {
        // Documento canonico esiste già: solo update dei campi
        const updates: any = {};
        if (targetDoc.name !== target.name) updates.name = target.name;
        if (targetDoc.key !== target.key) updates.key = target.key;
        if (targetDoc.sellPrice !== target.sellPrice) updates.sellPrice = target.sellPrice;
        if (targetDoc.category !== target.category) updates.category = target.category;
        if (targetDoc.categoryId !== target.category) updates.categoryId = target.category;
        if (targetDoc.unit !== target.unit) updates.unit = target.unit;
        if (targetDoc.active !== true) updates.active = true;
        if (targetDoc.deleted !== false) updates.deleted = false;
        if (Object.keys(updates).length > 0) {
          operations.push({
            action: "update",
            docId: target.canonicalDocId,
            changes: updates,
            reason: "Allineo campi al canonico",
          });
        }
      } else {
        // Documento canonico NON esiste: provo a usare un sourceDocId
        const sourceData = (target.sourceDocIds || []).map(id => ({ id, data: currentDocs.get(id) }))
                            .find(x => !!x.data);
        operations.push({
          action: "create",
          docId: target.canonicalDocId,
          changes: {
            name: target.name,
            key: target.key,
            sellPrice: target.sellPrice,
            category: target.category,
            categoryId: target.category,
            unit: target.unit,
            active: true,
            deleted: false,
            createdAt: new Date(),
          },
          reason: sourceData ? `Migrato da ${sourceData.id}` : "Creato ex novo",
        });
      }

      // Marca i sourceDocIds (tranne il canonico) come deprecated
      for (const srcId of target.sourceDocIds || []) {
        if (srcId === target.canonicalDocId) continue;
        if (!currentDocs.has(srcId)) continue;
        operations.push({
          action: "deprecate",
          docId: srcId,
          changes: {
            active: false,
            deleted: true,
            deprecatedAt: new Date(),
            deprecatedReason: `Sostituito da ${target.canonicalDocId}`,
            replacedBy: target.canonicalDocId,
          },
          reason: `Deprecato in favore di ${target.canonicalDocId}`,
        });
      }
    }

    // ─── 2. Anticalcare: lo sposto da servizi_extra a prodotti_pulizia ─────────
    if (currentDocs.has(ANTICALCARE_DOC_ID)) {
      operations.push({
        action: "categorize",
        docId: ANTICALCARE_DOC_ID,
        changes: {
          category: "prodotti_pulizia",
          categoryId: "prodotti_pulizia",
          active: true,
          deleted: false,
        },
        reason: "Spostato da servizi_extra a prodotti_pulizia (non fatturato)",
      });
    }

    // ─── 3. Tutti gli altri documenti prodotti_pulizia: aggiungo active/deleted ─
    for (const [docId, data] of currentDocs.entries()) {
      const isAlreadyPlanned = operations.some(op => op.docId === docId);
      if (isAlreadyPlanned) continue;
      const isProductoPulizia = data.categoryId === "prodotti_pulizia" || data.category === "prodotti_pulizia";
      if (isProductoPulizia) {
        const updates: any = {};
        if (data.active !== true) updates.active = true;
        if (data.deleted !== false) updates.deleted = false;
        if (data.category !== "prodotti_pulizia") updates.category = "prodotti_pulizia";
        if (Object.keys(updates).length > 0) {
          operations.push({
            action: "categorize",
            docId,
            changes: updates,
            reason: "Prodotto pulizia interno: aggiungo flag standard",
          });
        }
      }
    }

    // ─── ESECUZIONE ──────────────────────────────────────────────
    let executedOps = 0;
    if (!dryRun) {
      const batch = adminDb.batch();
      for (const op of operations) {
        const ref = adminDb.collection("inventory").doc(op.docId);
        if (op.action === "create") {
          batch.set(ref, op.changes);
        } else {
          batch.update(ref, op.changes);
        }
        executedOps++;
      }
      await batch.commit();
    }

    return NextResponse.json({
      mode: dryRun ? "DRY RUN (nessuna modifica eseguita)" : "ESEGUITO",
      summary: {
        currentInventoryCount: currentDocs.size,
        targetCanonicalCount: TARGET_INVENTORY.length,
        plannedOperations: operations.length,
        executedOperations: executedOps,
        breakdown: {
          create: operations.filter(o => o.action === "create").length,
          update: operations.filter(o => o.action === "update").length,
          deprecate: operations.filter(o => o.action === "deprecate").length,
          categorize: operations.filter(o => o.action === "categorize").length,
        },
      },
      operations,
      nextSteps: dryRun
        ? "Se ti sembra ok, rilancia con &dryRun=false&secret=TUO_SECRET per eseguire davvero"
        : "Migrazione completata. Ora lancia /api/debug/inventory-fix-orders per aggiornare i riferimenti negli ordini.",
    });
  } catch (err: any) {
    console.error("[inventory-migrate] errore:", err);
    return NextResponse.json({
      error: "Errore durante la migrazione",
      message: err?.message || String(err),
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
    }, { status: 500 });
  }
}
