/**
 * ════════════════════════════════════════════════════════════════════
 * ADMIN: Recalc Order Totals (backfill) v1
 * ════════════════════════════════════════════════════════════════════
 *
 * SCOPO
 *   Allinea il `calculatedTotal` salvato su OGNI ordine alla formula CANONICA
 *   (la stessa di debtCalculator/processOrder) e ripulisce le voci sintetiche
 *   (_delivery_fee / _bed_making_fee) eventualmente finite dentro `items` da
 *   salvataggi precedenti.
 *
 * PERCHÉ SERVE
 *   Il lato proprietario / le mail si fidano del `calculatedTotal` SALVATO
 *   (debtCalculator: `o.totalPriceOverride ?? calculatedTotal ?? ricalcolo`).
 *   La pagina admin invece ricalcola dal vivo dagli items. Se un ordine ha un
 *   `calculatedTotal` salfato sbagliato/vecchio, admin e proprietario/mail
 *   divergono. Questo backfill riscrive il valore corretto ovunque, così che
 *   "modifichi un item → il fatturato segue" valga al 100% su tutto lo storico.
 *
 * COSA FA / NON FA
 *   ✓ Strippa SOLO le voci sintetiche da `items` (id _delivery_fee/_bed_making_fee)
 *   ✓ Ricalcola `calculatedTotal` = Σ articoli fatturabili + consegna + letti
 *     (esclude i prodotti pulizia operatore — formula canonica identica)
 *   ✓ Preserva i prodotti pulizia e i loro flag (type/categoryId)
 *   ✗ NON tocca `totalPriceOverride` (il prezzo manuale dell'ordine resta)
 *   ✗ NON tocca deliveryFee / bedMakingFee / status / date / proprietà
 *   ✗ NON tocca le pulizie né i pagamenti
 *   ✓ Audit READ-ONLY degli override MENSILI (paymentOverrides): li elenca
 *     soltanto, non li modifica (decisione manuale dell'admin).
 *
 * SICUREZZA
 *   - Protetto da CRON_SECRET (?secret=XXX oppure ?cronSecret=XXX)
 *   - DRY-RUN di DEFAULT: nessuna scrittura senza ?apply=1
 *   - Idempotente: scrive solo gli ordini che cambiano davvero
 *   - Batch da 400 (limite Firestore 500) con commit progressivi
 *
 * MODALITÀ
 *   GET ?secret=XXX                 → DRY RUN (anteprima prima/dopo)
 *   GET ?secret=XXX&apply=1         → applica le scritture
 *   GET ?secret=XXX&limit=2000      → cap opzionale sul numero di ordini
 * ════════════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  buildInventoryMap,
  calculateOrderRawPrice,
  type DebtCalcOrder,
} from "~/lib/payments/debtCalculator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYNTHETIC_ITEM_IDS = new Set(["_delivery_fee", "_bed_making_fee"]);
const EPS = 0.01;
const BATCH_SIZE = 400;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get("secret") || searchParams.get("cronSecret");
  if (cronSecret && urlSecret !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const apply = searchParams.get("apply") === "1" || searchParams.get("apply") === "true";
  const limitParam = parseInt(searchParams.get("limit") || "0", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 0;

  try {
    // ── 1) Inventario (per il fallback prezzo nella formula canonica) ─────
    const inventorySnap = await adminDb.collection("inventory").get();
    const inventoryById = buildInventoryMap(
      inventorySnap.docs.map((d) => ({ id: d.id, data: d.data() })),
    );

    // ── 2) Tutti gli ordini ───────────────────────────────────────────────
    const ordersSnap = await adminDb.collection("orders").get();

    let scanned = 0;
    let needFix = 0;
    let syntheticStripped = 0;
    let totalDeltaAbs = 0;
    const samples: Array<{
      id: string;
      propertyName?: string;
      status?: string;
      storedTotal: number | null;
      newTotal: number;
      delta: number;
      removedSyntheticItems: number;
      hasOverride: boolean;
    }> = [];

    let batch = adminDb.batch();
    let batchCount = 0;
    let written = 0;

    for (const doc of ordersSnap.docs) {
      if (limit && scanned >= limit) break;
      scanned++;

      const o: any = doc.data();
      const rawItems: any[] = Array.isArray(o.items) ? o.items : [];

      // Rimuovo SOLO le voci sintetiche (i prodotti pulizia restano)
      const cleanedItems = rawItems.filter(
        (it: any) => !SYNTHETIC_ITEM_IDS.has(it?.itemId || it?.id),
      );
      const removedSyntheticItems = rawItems.length - cleanedItems.length;

      // Totale canonico (esclude prodotti pulizia, aggiunge fee abilitate).
      // Passo gli items GIÀ ripuliti dalle voci sintetiche.
      const orderForCalc: DebtCalcOrder = {
        id: doc.id,
        propertyId: o.propertyId,
        status: o.status,
        items: cleanedItems,
        totalPriceOverride: o.totalPriceOverride,
        deliveryFee: o.deliveryFee,
        deliveryFeeEnabled: o.deliveryFeeEnabled,
        bedMaking: o.bedMaking,
        bedMakingFee: o.bedMakingFee,
      };
      const newTotal = round2(calculateOrderRawPrice(orderForCalc, inventoryById));

      const storedTotal =
        typeof o.calculatedTotal === "number" ? round2(o.calculatedTotal) : null;

      const totalChanged = storedTotal === null || Math.abs(storedTotal - newTotal) > EPS;
      const itemsChanged = removedSyntheticItems > 0;
      const mustFix = totalChanged || itemsChanged;

      if (!mustFix) continue;

      needFix++;
      if (itemsChanged) syntheticStripped += removedSyntheticItems;
      const delta = storedTotal === null ? newTotal : round2(newTotal - storedTotal);
      totalDeltaAbs = round2(totalDeltaAbs + Math.abs(delta));

      if (samples.length < 40) {
        samples.push({
          id: doc.id,
          propertyName: o.propertyName,
          status: o.status,
          storedTotal,
          newTotal,
          delta,
          removedSyntheticItems,
          hasOverride: o.totalPriceOverride !== undefined && o.totalPriceOverride !== null,
        });
      }

      if (apply) {
        const totalItems = cleanedItems.reduce(
          (s: number, it: any) => s + (Number(it.quantity) || 0),
          0,
        );
        const update: Record<string, any> = {
          items: cleanedItems,
          itemDetails: cleanedItems,
          calculatedTotal: newTotal,
          totalItems,
          updatedAt: Timestamp.now(),
          lastModifiedReason: "Backfill recalc-order-totals v1",
        };
        batch.update(doc.ref, update);
        batchCount++;
        written++;
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = adminDb.batch();
          batchCount = 0;
        }
      }
    }

    if (apply && batchCount > 0) {
      await batch.commit();
    }

    // ── 3) Audit READ-ONLY degli override MENSILI ─────────────────────────
    //   Sono il SOLO punto in cui il fatturato di un mese NON segue gli items
    //   (debtCalculator usa override.overrideTotal). Qui li elenco soltanto.
    const overridesSnap = await adminDb.collection("paymentOverrides").get();
    const monthOverrides = overridesSnap.docs.map((d) => {
      const data: any = d.data();
      return {
        id: d.id,
        proprietarioId: data.proprietarioId,
        month: data.month,
        year: data.year,
        overrideTotal: data.overrideTotal,
        originalTotal: data.originalTotal,
        reason: data.reason,
      };
    });

    return NextResponse.json({
      mode: apply ? "APPLIED" : "DRY_RUN",
      ordersScanned: scanned,
      ordersNeedingFix: needFix,
      ordersWritten: apply ? written : 0,
      syntheticItemsStripped: syntheticStripped,
      sumOfAbsoluteDeltas: round2(totalDeltaAbs),
      sampleDiffs: samples,
      monthOverridesAudit: {
        count: monthOverrides.length,
        note:
          monthOverrides.length > 0
            ? "Questi mesi hanno un TOTALE MANUALE: il fatturato NON segue gli articoli finché l'override resta. Rimozione = decisione manuale, NON automatica."
            : "Nessun override mensile: il fatturato di tutti i mesi segue gli articoli.",
        items: monthOverrides,
      },
      hint: apply
        ? "Backfill applicato. Ri-eseguire senza ?apply=1 deve dare ordersNeedingFix ~0 (idempotente)."
        : "Anteprima. Per applicare: aggiungi &apply=1 all'URL.",
    });
  } catch (error: any) {
    console.error("[recalc-order-totals] errore:", error);
    return NextResponse.json(
      { error: error?.message || "Errore server" },
      { status: 500 },
    );
  }
}
