/**
 * 🔧 RIALLINEO ordini biancheria ↔ config standard (caso "canovaccio mancante").
 *
 * GET /api/debug/realign-config-items-v1?cronSecret=XXX                → DRY-RUN (nessuna scrittura)
 * GET /api/debug/realign-config-items-v1?cronSecret=XXX&apply=1        → APPLICA
 * Parametri opzionali: &propertyId=XXX (limita a una proprietà)
 *
 * COSA FA: per ogni pulizia FUTURA con biancheria STANDARD (linenConfigModified
 * ≠ true) e ordine attivo modificabile (PENDING/ASSIGNED), ricalcola gli
 * articoli gestiti (letto+bagno+kit) dalla config della proprietà usando
 * reconcileOrderItems di linenCore — la STESSA logica usata dai flussi vivi.
 * Gli articoli non gestiti (extra manuali, fee) vengono PRESERVATI.
 *
 * GUARDIE:
 *  - ordini IN_TRANSIT / DELIVERED / COMPLETED / CANCELLED: MAI toccati;
 *  - pulizie con biancheria personalizzata (badge): ESCLUSE (il custom è voluto);
 *  - default DRY-RUN: senza &apply=1 non scrive nulla;
 *  - scrive SOLO items + updatedAt dell'ordine, nient'altro.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { reconcileOrderItems, isManagedByRecompute, buildInvMap } from "~/lib/linen/linenCore";
import { getItemName } from "~/lib/itemNames";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODIFIABLE = new Set(["PENDING", "ASSIGNED"]);

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const apply = searchParams.get("apply") === "1";
  const onlyProperty = searchParams.get("propertyId");

  try {
    const [propsSnap, cleanSnap, ordersSnap, invSnap] = await Promise.all([
      adminDb.collection("properties").get(),
      adminDb.collection("cleanings").get(),
      adminDb.collection("orders").get(),
      adminDb.collection("inventory").get(),
    ]);

    const properties = new Map(propsSnap.docs.map(d => [d.id, d.data() as any]));
    const inventory = invSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const invMap = buildInvMap(inventory as any);

    // ordine attivo modificabile per cleaningId
    const orderByCleaning = new Map<string, { id: string; data: any }>();
    ordersSnap.docs.forEach(d => {
      const o = d.data() as any;
      if (o.cleaningId && MODIFIABLE.has(o.status) && !orderByCleaning.has(o.cleaningId)) {
        orderByCleaning.set(o.cleaningId, { id: d.id, data: o });
      }
    });

    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);

    // firma solo degli item GESTITI (id→qty) per capire se cambia qualcosa
    const managedSignature = (items: any[]): string => {
      const m = new Map<string, number>();
      (items || []).forEach((it: any) => {
        if (!isManagedByRecompute(it, invMap)) return;
        const key = String(it.itemId || it.id);
        m.set(key, (m.get(key) || 0) + (it.quantity || 0));
      });
      return [...m.entries()].filter(([, q]) => q > 0).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, q]) => `${k}:${q}`).join("|");
    };

    const diffItems = (before: any[], after: any[]) => {
      const b = new Map<string, number>(); const a = new Map<string, number>();
      (before || []).forEach((it: any) => { if (isManagedByRecompute(it, invMap)) b.set(String(it.itemId || it.id), (b.get(String(it.itemId || it.id)) || 0) + (it.quantity || 0)); });
      (after || []).forEach((it: any) => { if (isManagedByRecompute(it, invMap)) a.set(String(it.itemId || it.id), (a.get(String(it.itemId || it.id)) || 0) + (it.quantity || 0)); });
      const keys = new Set([...b.keys(), ...a.keys()]);
      const changes: string[] = [];
      for (const k of keys) {
        const qb = b.get(k) || 0; const qa = a.get(k) || 0;
        if (qb === qa) continue;
        if (qb === 0) changes.push(`+ ${getItemName(k)} ×${qa}`);
        else if (qa === 0) changes.push(`− ${getItemName(k)} ×${qb}`);
        else changes.push(`~ ${getItemName(k)} ${qb}→${qa}`);
      }
      return changes;
    };

    const candidati: any[] = [];
    let esaminati = 0, esclusiCustom = 0, senzaOrdine = 0, senzaConfig = 0;

    for (const cDoc of cleanSnap.docs) {
      const c = cDoc.data() as any;
      const d = c.scheduledDate?.toDate?.();
      if (!d || d < oggi) continue;
      if (!["SCHEDULED", "ASSIGNED", "IN_PROGRESS"].includes(c.status)) continue;
      if (onlyProperty && c.propertyId !== onlyProperty) continue;
      const prop = properties.get(c.propertyId);
      if (!prop || prop.usesOwnLinen === true) continue;
      esaminati++;
      if (c.linenConfigModified === true) { esclusiCustom++; continue; }   // custom voluto → non toccare
      const ord = orderByCleaning.get(cDoc.id);
      if (!ord) { senzaOrdine++; continue; }                               // se manca l'ordine, altro problema (check 1)
      const g = c.guestsCount || c.guests || 0;
      const std = prop.serviceConfigs ? (prop.serviceConfigs[g] ?? prop.serviceConfigs[String(g)]) : null;
      if (!std) { senzaConfig++; continue; }

      const rec = reconcileOrderItems(std, inventory as any, ord.data.items || [], getItemName);
      if (managedSignature(ord.data.items || []) === managedSignature(rec.finalItems)) continue; // già allineato

      candidati.push({
        orderId: ord.id,
        cleaningId: cDoc.id,
        proprieta: prop.name,
        data: d.toISOString().slice(0, 10),
        statusOrdine: ord.data.status,
        modifiche: diffItems(ord.data.items || [], rec.finalItems),
        _finalItems: rec.finalItems, // usato solo in apply, non mostrato
      });
    }

    // ── APPLY (solo con &apply=1) ──
    let applicati = 0;
    const erroriApply: any[] = [];
    if (apply && candidati.length > 0) {
      for (const cand of candidati) {
        try {
          await adminDb.collection("orders").doc(cand.orderId).update({
            items: cand._finalItems,
            updatedAt: Timestamp.now(),
          });
          applicati++;
        } catch (e: any) {
          erroriApply.push({ orderId: cand.orderId, errore: e?.message });
        }
      }
    }

    return NextResponse.json({
      modalita: apply ? "APPLY (scritture eseguite)" : "DRY-RUN (nessuna scrittura)",
      riepilogo: {
        pulizieEsaminate: esaminati,
        esclusePersonalizzate: esclusiCustom,
        senzaOrdineModificabile: senzaOrdine,
        senzaConfigStandard: senzaConfig,
        ordiniDaRiallineare: candidati.length,
        ...(apply ? { applicati, errori: erroriApply.length } : {}),
      },
      ordini: candidati.map(({ _finalItems, ...rest }) => rest),
      ...(erroriApply.length ? { erroriApply } : {}),
      nota: apply
        ? "Riallineo applicato. Ricontrolla il cruscotto Controllo Sistema: il check 'card proprietario ≠ ordine' dovrebbe tornare verde."
        : "Nessuna modifica eseguita. Controlla la lista 'ordini' e le 'modifiche' previste; se tutto torna, rilancia con &apply=1.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore riallineo", message: error?.message }, { status: 500 });
  }
}
