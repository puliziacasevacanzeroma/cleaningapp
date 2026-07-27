/**
 * RIPARAZIONE customLinenConfig DEGENERI (caso Trastevere 27/07/2026).
 * GET /api/debug/repair-degenerate-customs-v1?cronSecret=XXX            → DRY-RUN (default, nessuna scrittura)
 * GET /api/debug/repair-degenerate-customs-v1?cronSecret=XXX&apply=1    → SCRIVE
 * Opzionale: &cleaningId=XXX per limitare a una singola pulizia.
 *
 * COSA FA (solo per custom DEGENERI con biancheria ATTIVA e standard disponibile):
 *  1. cleaning.customLinenConfig → GUARITA (bl/ba dallo standard, ki/ex conservati)
 *  2. ordine collegato SOLO SE PENDING → items riallineati via reconcileOrderItems
 *     (ricalcola solo letto/bagno/kit, preserva fee/prodotti/altro)
 *  3. ordini DELIVERED → MAI toccati, solo elencati (decisione manuale: se mandi
 *     fisicamente la biancheria mancante, si aggiorna a mano quel singolo ordine)
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  isDegenerateCustomConfig,
  healCustomConfig,
  reconcileOrderItems,
  type InventoryItem,
} from "~/lib/linen/linenCore";
import { getItemName } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const apply = searchParams.get("apply") === "1";
  const onlyCleaningId = searchParams.get("cleaningId");

  try {
    // inventario per il ricalcolo items
    const invSnap = await adminDb.collection("inventory").get();
    const inventory: InventoryItem[] = invSnap.docs.map((d) => {
      const x = d.data() as any;
      return { id: d.id, key: x.key ?? null, name: x.name, sellPrice: x.sellPrice, categoryId: x.categoryId ?? null };
    });

    // proprietà
    const propsSnap = await adminDb.collection("properties").get();
    const props = new Map<string, any>();
    propsSnap.docs.forEach((d) => props.set(d.id, d.data()));

    // pulizie target
    let cleanDocs;
    if (onlyCleaningId) {
      const one = await adminDb.collection("cleanings").doc(onlyCleaningId).get();
      cleanDocs = one.exists ? [one] : [];
    } else {
      const snap = await adminDb.collection("cleanings").where("linenConfigModified", "==", true).get();
      cleanDocs = snap.docs;
    }

    const riparate: any[] = [];
    const soloConfig: any[] = [];
    const saltate: any[] = [];

    for (const cd of cleanDocs) {
      const c = cd.data() as any;
      const custom = c.customLinenConfig;
      if (c.linenConfigModified !== true || !custom || typeof custom !== "object") {
        saltate.push({ cleaningId: cd.id, motivo: "flag non true o custom assente" });
        continue;
      }
      if (!isDegenerateCustomConfig(custom)) {
        saltate.push({ cleaningId: cd.id, motivo: "custom sano" });
        continue;
      }
      const prop = props.get(c.propertyId) || null;
      const usesOwn = prop?.usesOwnLinen === true;
      if (c.hasLinenOrder === false || usesOwn) {
        saltate.push({ cleaningId: cd.id, propertyName: prop?.name, motivo: "biancheria non attiva (hasLinenOrder=false o biancheria propria)" });
        continue;
      }
      const g = c.guestsCount || 2;
      const std = prop?.serviceConfigs ? (prop.serviceConfigs[g] ?? prop.serviceConfigs[String(g)]) : undefined;
      if (!std) {
        saltate.push({ cleaningId: cd.id, propertyName: prop?.name, motivo: `serviceConfigs[${g}] assente — impossibile guarire` });
        continue;
      }
      const healed = healCustomConfig(custom, std);
      if (healed === custom) {
        saltate.push({ cleaningId: cd.id, propertyName: prop?.name, motivo: "heal = identità (standard senza biancheria?)" });
        continue;
      }

      // ordine collegato non-CANCELLED
      const os = await adminDb.collection("orders").where("cleaningId", "==", cd.id).get();
      const ordDoc = os.docs.find((d) => (d.data() as any).status !== "CANCELLED") || null;
      const ord = ordDoc ? ({ id: ordDoc.id, ...(ordDoc.data() as any) }) : null;

      const entry: any = {
        cleaningId: cd.id,
        propertyName: prop?.name,
        data: c.scheduledDate?.toDate?.()?.toISOString()?.slice(0, 10),
        statusPulizia: c.status,
        guestsCount: g,
        configPrima: { bl: custom.bl ?? null, ba: custom.ba ?? null, ki: custom.ki ?? null },
        configDopo: { bl: healed.bl, ba: healed.ba, ki: healed.ki },
      };

      if (ord && ord.status === "PENDING") {
        const rec = reconcileOrderItems(healed, inventory, ord.items || [], (id) => getItemName(id));
        entry.ordine = {
          orderId: ord.id,
          status: ord.status,
          itemsPrima: (ord.items || []).map((i: any) => `${i.name || i.itemId || i.id} x${i.quantity}`),
          itemsDopo: rec.finalItems.map((i: any) => `${i.name} x${i.quantity}`),
          preservati: rec.preserved.map((i: any) => i.name || i.itemId || i.id),
          priceWarnings: rec.priceWarnings,
        };
        if (apply) {
          await adminDb.collection("cleanings").doc(cd.id).update({ customLinenConfig: healed, updatedAt: Timestamp.now() });
          await adminDb.collection("orders").doc(ord.id).update({ items: rec.finalItems, updatedAt: Timestamp.now() });
        }
        riparate.push(entry);
      } else {
        entry.ordine = ord
          ? { orderId: ord.id, status: ord.status, nota: "NON toccato (non PENDING) — decidere a mano se aggiornare" }
          : "NESSUN ORDINE";
        if (apply) {
          await adminDb.collection("cleanings").doc(cd.id).update({ customLinenConfig: healed, updatedAt: Timestamp.now() });
        }
        soloConfig.push(entry);
      }
    }

    return NextResponse.json({
      success: true,
      mode: apply ? "APPLY (scritture eseguite)" : "DRY-RUN (nessuna scrittura — aggiungi &apply=1 per applicare)",
      totali: {
        configEOrdineRiparati: riparate.length,
        soloConfigRiparata_ordineNonPending: soloConfig.length,
        saltate: saltate.length,
      },
      riparate,
      soloConfigRiparata: soloConfig,
      saltate,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
