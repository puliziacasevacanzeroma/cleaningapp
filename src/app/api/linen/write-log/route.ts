import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * LINEN WRITE LOG — traccia le scritture CLIENT-SIDE degli ordini biancheria.
 *
 * PERCHE' ESISTE
 * EditCleaningModal scrive l'ordine con updateDoc() direttamente dal browser,
 * senza passare da nessuna route API. Risultato: e' l'UNICO percorso di scrittura
 * ordini che non finisce in `auditLog`, ed e' proprio quello che ha generato gli
 * ordini "solo kit" (Trastevere 07/07 e 31/08, Casa Galilei 20/10).
 * Questa route riceve la fotografia del salvataggio e la registra.
 *
 * NON MODIFICA NULLA. Scrive solo su `auditLog`.
 * L'identita' NON viene dal client: la legge il server da getApiUser().
 *
 * DIAGNOSI AUTOMATICA (campo details.diagnosi):
 *   BUG_CONFIG_VUOTA  la config grezza del modal non aveva biancheria letto/bagno
 *                     mentre lo standard della proprieta' la prevede → e' il bug.
 *   PERSA_BIANCHERIA  l'ordine aveva biancheria prima e dopo non ce l'ha piu',
 *                     senza che la config fosse vuota → anomalia da guardare.
 *   MODIFICA_UMANA    quantita' cambiate in modo coerente con la config → qualcuno
 *                     ha deciso, non e' un bug.
 *   OK                nessuna variazione sospetta.
 *
 * Consultare con:
 *   /api/debug/audit-lookup-v1?action=LINEN_ORDER_CLIENT_WRITE&scan=500
 *   /api/debug/audit-lookup-v1?action=LINEN_ORDER_CLIENT_WRITE&propertyName=trastevere
 */

const CAT_LETTO = "biancheria_letto";
const CAT_BAGNO = "biancheria_bagno";

/** true se la sezione `bl` della config contiene almeno un articolo con qta > 0 */
function hasBedContent(cfg: any): boolean {
  const bl = cfg?.bl;
  if (!bl || typeof bl !== "object") return false;
  for (const gruppo of Object.values(bl)) {
    if (gruppo && typeof gruppo === "object") {
      for (const q of Object.values(gruppo as Record<string, any>)) {
        if (typeof q === "number" && q > 0) return true;
      }
    }
  }
  return false;
}

/** true se la sezione `ba` della config contiene almeno un articolo con qta > 0 */
function hasBathContent(cfg: any): boolean {
  const ba = cfg?.ba;
  if (!ba || typeof ba !== "object") return false;
  for (const q of Object.values(ba as Record<string, any>)) {
    if (typeof q === "number" && q > 0) return true;
  }
  return false;
}

/** somma le quantita' degli articoli letto+bagno presenti in una lista di items */
function contaBiancheria(items: any[]): number {
  if (!Array.isArray(items)) return 0;
  let tot = 0;
  for (const it of items) {
    const q = typeof it?.quantity === "number" ? it.quantity : 0;
    if (q <= 0) continue;
    const cat = String(it?.categoryId || "").toLowerCase();
    const nome = String(it?.categoryName || "").toLowerCase();
    const eLetto = cat === CAT_LETTO || nome.includes("letto");
    const eBagno = cat === CAT_BAGNO || nome.includes("bagno");
    if (eLetto || eBagno) tot += q;
  }
  return tot;
}

/** proiezione compatta {id, quantity} — tiene piccolo il documento di log */
function compatta(items: any[]): Array<{ id: string; quantity: number }> {
  if (!Array.isArray(items)) return [];
  return items
    .filter((it) => typeof it?.quantity === "number" && it.quantity > 0)
    .map((it) => ({
      id: String(it?.itemId || it?.id || "?"),
      quantity: Number(it.quantity),
    }));
}

export async function POST(request: NextRequest) {
  // Identita' letta dal SERVER: il client non puo' dichiarare chi e'.
  let user: any = null;
  try {
    user = await getApiUser();
  } catch {
    /* prosegue: meglio un log senza identita' che nessun log */
  }

  try {
    const body = await request.json();

    const {
      orderId = null,
      cleaningId = null,
      propertyId = null,
      propertyName = null,
      guestsCount = null,
      linenEnabled = null,
      linenConfigModified = null,
      rawConfig = null,
      usedConfig = null,
      itemsBefore = null,
      itemsAfter = null,
      operazione = "update",
    } = body || {};

    // ── Standard della proprieta' per il numero di ospiti (per la diagnosi) ──
    let standardConfig: any = null;
    let usesOwnLinen: boolean | null = null;
    if (propertyId) {
      try {
        const pSnap = await adminDb.collection("properties").doc(String(propertyId)).get();
        if (pSnap.exists) {
          const p = pSnap.data() as any;
          usesOwnLinen = p?.usesOwnLinen === true;
          const sc = p?.serviceConfigs;
          if (sc && guestsCount != null) {
            standardConfig = sc[guestsCount] ?? sc[String(guestsCount)] ?? null;
          }
        }
      } catch {
        /* la diagnosi degrada, il log resta */
      }
    }

    // ── Diagnosi ────────────────────────────────────────────────────────────
    const rawVuota = !hasBedContent(rawConfig) && !hasBathContent(rawConfig);
    const standardPrevedeBiancheria =
      !!standardConfig && (hasBedContent(standardConfig) || hasBathContent(standardConfig));
    const biancheriaPrima = contaBiancheria(itemsBefore || []);
    const biancheriaDopo = contaBiancheria(itemsAfter || []);

    let diagnosi = "OK";
    const motivi: string[] = [];

    if (linenEnabled !== false && !usesOwnLinen) {
      if (rawVuota && standardPrevedeBiancheria) {
        diagnosi = "BUG_CONFIG_VUOTA";
        motivi.push(
          "la config del modal non conteneva biancheria letto/bagno mentre lo standard della proprieta' la prevede"
        );
      } else if (biancheriaPrima > 0 && biancheriaDopo === 0) {
        diagnosi = "PERSA_BIANCHERIA";
        motivi.push(
          `l'ordine aveva ${biancheriaPrima} capi di biancheria e dopo il salvataggio ne ha 0`
        );
      } else if (biancheriaPrima !== biancheriaDopo) {
        diagnosi = "MODIFICA_UMANA";
        motivi.push(`capi di biancheria: ${biancheriaPrima} → ${biancheriaDopo}`);
      }
    }

    if (rawVuota && !standardPrevedeBiancheria) {
      motivi.push("anche lo standard della proprieta' e' vuoto per questo numero di ospiti");
    }
    if (usesOwnLinen) motivi.push("proprieta' a biancheria propria");

    // ── Scrittura del log ───────────────────────────────────────────────────
    await adminDb.collection("auditLog").add({
      action: "LINEN_ORDER_CLIENT_WRITE",
      entityType: "order",
      entityId: orderId,
      propertyId: propertyId,
      propertyName: propertyName,
      source: "components/proprietario/EditCleaningModal (scrittura diretta client)",
      timestamp: Timestamp.now(),
      details: {
        cleaningId,
        operazione,
        diagnosi,
        motivi,
        snapshot: {
          guestsCount,
          linenEnabled,
          linenConfigModified,
          usesOwnLinen,
          configGrezzaVuota: rawVuota,
          standardPrevedeBiancheria,
        },
        config: {
          raw: rawConfig,
          usata: usedConfig,
          standard: standardConfig,
        },
        result: {
          itemsCountBefore: Array.isArray(itemsBefore) ? itemsBefore.length : null,
          itemsCountAfter: Array.isArray(itemsAfter) ? itemsAfter.length : null,
          itemsBefore: compatta(itemsBefore || []),
          itemsAfter: compatta(itemsAfter || []),
          capiBiancheriaPrima: biancheriaPrima,
          capiBiancheriaDopo: biancheriaDopo,
        },
        caller: {
          userId: user?.id ?? null,
          userEmail: user?.email ?? null,
          userRole: user?.role ?? null,
          ip:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            request.headers.get("x-real-ip") ||
            null,
          userAgent: request.headers.get("user-agent") || null,
        },
      },
    });

    return NextResponse.json({ success: true, diagnosi, motivi });
  } catch (err: any) {
    // Non deve MAI far fallire il salvataggio a monte: risponde sempre 200.
    return NextResponse.json({ success: false, error: err?.message || String(err) });
  }
}
