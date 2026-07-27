/**
 * AUDIT FLEET (read-only): customLinenConfig DEGENERI su tutta la flotta.
 * GET /api/debug/audit-degenerate-customs-v1?cronSecret=XXX
 *
 * Un custom è DEGENERE se non ha né biancheria letto né bagno con qty>0
 * (bl:{}, bl:{all:{}}, gruppi vuoti) — caso Trastevere 27/07/2026: ordine
 * costruito dal custom = solo kit, rider senza lenzuola, card ≠ modal.
 *
 * Per ogni pulizia con linenConfigModified=true classifica il custom e, se
 * degenere, dice se la biancheria era ATTIVA (→ caso patologico) e cosa
 * contiene l'ordine collegato (PENDING riparabile / DELIVERED da decidere).
 * NESSUNA SCRITTURA.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import {
  isDegenerateCustomConfig,
  hasBedContent,
  hasBathContent,
  hasKitContent,
} from "~/lib/linen/linenCore";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret && searchParams.get("cronSecret") !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // 1. Tutte le pulizie con flag custom attivo
    const cleanSnap = await adminDb
      .collection("cleanings")
      .where("linenConfigModified", "==", true)
      .get();

    // 2. Proprietà (per usesOwnLinen + serviceConfigs)
    const propsSnap = await adminDb.collection("properties").get();
    const props = new Map<string, any>();
    propsSnap.docs.forEach((d) => props.set(d.id, d.data()));

    // 3. Ordini collegati (query 'in' a blocchi di 30)
    const cleaningIds = cleanSnap.docs.map((d) => d.id);
    const ordersByCleaning = new Map<string, any>();
    for (let i = 0; i < cleaningIds.length; i += 30) {
      const chunk = cleaningIds.slice(i, i + 30);
      if (chunk.length === 0) break;
      const os = await adminDb.collection("orders").where("cleaningId", "in", chunk).get();
      os.docs.forEach((d) => {
        const o = d.data() as any;
        if (o.status !== "CANCELLED" && !ordersByCleaning.has(o.cleaningId)) {
          ordersByCleaning.set(o.cleaningId, { id: d.id, ...o });
        }
      });
    }

    const summarizeItems = (items: any[]) => {
      const byCat: Record<string, number> = {};
      (items || []).forEach((it: any) => {
        const cat = it.categoryId || it.categoryName || "(senza categoria)";
        byCat[String(cat)] = (byCat[String(cat)] || 0) + (it.quantity || 0);
      });
      return byCat;
    };

    const degeneriAttivi: any[] = [];
    const degeneriInattivi: any[] = [];
    const sani: any[] = [];
    const senzaCustom: any[] = [];

    cleanSnap.docs.forEach((cd) => {
      const c = cd.data() as any;
      const custom = c.customLinenConfig;
      const prop = props.get(c.propertyId) || null;
      const usesOwn = prop?.usesOwnLinen === true;
      const linenActive = c.hasLinenOrder !== false && !usesOwn;
      const ord = ordersByCleaning.get(cd.id) || null;
      const base = {
        cleaningId: cd.id,
        propertyId: c.propertyId,
        propertyName: prop?.name || "(?)",
        data: c.scheduledDate?.toDate?.()?.toISOString()?.slice(0, 10) || null,
        status: c.status,
        guestsCount: c.guestsCount || null,
        hasLinenOrder: c.hasLinenOrder ?? null,
        usesOwnLinen: usesOwn,
        ordine: ord
          ? { orderId: ord.id, status: ord.status, itemsPerCategoria: summarizeItems(ord.items) }
          : "NESSUNO",
      };

      if (!custom || typeof custom !== "object") {
        senzaCustom.push(base);
        return;
      }
      if (!isDegenerateCustomConfig(custom)) {
        sani.push({ ...base });
        return;
      }
      const detail = {
        ...base,
        custom: {
          haLetto: hasBedContent(custom),
          haBagno: hasBathContent(custom),
          haKit: hasKitContent(custom),
          ki: custom.ki ?? null,
          ex: custom.ex ?? null,
        },
        standardDisponibile: !!(prop?.serviceConfigs && (prop.serviceConfigs[c.guestsCount] || prop.serviceConfigs[String(c.guestsCount)])),
        RIPARABILE:
          linenActive && ord && ord.status === "PENDING"
            ? "SÌ (config + ordine PENDING)"
            : linenActive
              ? "config sì; ordine " + (ord ? ord.status + " → decidere a mano" : "assente")
              : "n/a (biancheria non attiva)",
      };
      (linenActive ? degeneriAttivi : degeneriInattivi).push(detail);
    });

    return NextResponse.json({
      success: true,
      totali: {
        pulizieConFlagCustom: cleanSnap.size,
        customSani: sani.length,
        DEGENERI_CON_BIANCHERIA_ATTIVA: degeneriAttivi.length,
        degeneriConBiancheriaNonAttiva: degeneriInattivi.length,
        flagTrueSenzaCustom: senzaCustom.length,
      },
      DEGENERI_CON_BIANCHERIA_ATTIVA: degeneriAttivi,
      degeneriConBiancheriaNonAttiva: degeneriInattivi,
      flagTrueSenzaCustom: senzaCustom,
      nota: "DEGENERI_CON_BIANCHERIA_ATTIVA = i casi patologici (tipo Trastevere): ordine potenzialmente senza lenzuola. La riparazione automatica (repair-degenerate-customs-v1) tocca SOLO config + ordini PENDING; i DELIVERED vengono elencati e si decide a mano.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Errore", message: error?.message }, { status: 500 });
  }
}
