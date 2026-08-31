import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  buildExpectedItems,
  resolveEffectiveConfig,
  buildInvMap,
  resolveInv,
  MANAGED_CATS,
  type InventoryItem,
} from "~/lib/linen/linenCore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GUARDIA BIANCHERIA — controllo giornaliero di coerenza config ↔ ordine.
 *
 * PERCHE' ESISTE
 * Il 31/08/2026 un ordine e' partito per Via della Scala con SOLO il kit cortesia:
 * la card mostrava la biancheria giusta, l'ordine no. Ce ne siamo accorti la
 * mattina della consegna, guardando per caso. Prima di quel giorno lo stesso
 * problema era passato inosservato il 07/07 (consegna gia' effettuata) e stava
 * per ripetersi il 20/10 su Casa Galilei.
 * Questa guardia confronta ogni giorno cio' che la config prevede con cio' che
 * l'ordine contiene davvero, e avvisa. Entro 24 ore invece che il giorno stesso.
 *
 * NON MODIFICA NULLA. Legge, confronta, scrive un record in `auditLog` e — solo
 * se trova divergenze — una notifica agli ADMIN. Le riparazioni restano manuali
 * e consapevoli: POST /api/cleanings/[id]/update-linen-order.
 *
 * USO
 *   /api/cron/guardia-biancheria?cronSecret=XXX               → controlla i prossimi 60 giorni
 *   /api/cron/guardia-biancheria?cronSecret=XXX&giorni=180    → finestra piu' ampia
 *   /api/cron/guardia-biancheria?cronSecret=XXX&notifica=0    → solo report, nessuna notifica
 *
 * Da collegare a CRON-JOB.ORG una volta al giorno, presto la mattina.
 *
 * GUARDIE RISPETTATE (identiche a calculateDotazioni e alle route di update):
 *  - salta se cleaning.hasLinenOrder === false
 *  - salta se hasLinenOrder assente E property.usesOwnLinen === true
 *  - salta gli ordini non PENDING (i DELIVERED sono storia, non si toccano)
 */

interface Divergenza {
  gravita: "CRITICA" | "MEDIA";
  proprieta: string;
  data: string;
  cleaningId: string;
  orderId: string;
  ospiti: number;
  fonteConfig: string;
  linenConfigModified: boolean;
  dettaglio: Array<{ articolo: string; atteso: number; nellOrdine: number }>;
  capiBiancheriaAttesi: number;
  capiBiancheriaNellOrdine: number;
}

function isoGiorno(v: any): string {
  try {
    if (!v) return "?";
    if (typeof v?.toDate === "function") return v.toDate().toISOString().slice(0, 10);
    if (typeof v === "string") return v.slice(0, 10);
    if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString().slice(0, 10);
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString().slice(0, 10);
    return "?";
  } catch {
    return "?";
  }
}

function millis(v: any): number | null {
  try {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate().getTime();
    if (typeof v === "string") return new Date(v).getTime();
    if (typeof v?._seconds === "number") return v._seconds * 1000;
    if (typeof v?.seconds === "number") return v.seconds * 1000;
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("cronSecret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const giorni = Math.min(parseInt(req.nextUrl.searchParams.get("giorni") || "60", 10) || 60, 365);
  const inviaNotifica = req.nextUrl.searchParams.get("notifica") !== "0";

  const iniziato = Date.now();

  try {
    // ── Caricamento ────────────────────────────────────────────────────────
    const [invSnap, propSnap, ordSnap] = await Promise.all([
      adminDb.collection("inventory").get(),
      adminDb.collection("properties").get(),
      adminDb.collection("orders").where("status", "==", "PENDING").get(),
    ]);

    const inventory: InventoryItem[] = invSnap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        key: x.key ?? null,
        name: x.name,
        sellPrice: x.sellPrice,
        categoryId: x.categoryId ?? null,
      };
    });
    const invMap = buildInvMap(inventory);

    const props = new Map<string, any>();
    propSnap.docs.forEach((d) => props.set(d.id, d.data()));

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const limite = new Date(oggi);
    limite.setDate(limite.getDate() + giorni);

    // Solo ordini biancheria PENDING nella finestra futura
    const ordini = ordSnap.docs.filter((d) => {
      const o = d.data() as any;
      if (o.type !== "LINEN") return false;
      const ms = millis(o.scheduledDate);
      if (ms == null) return false;
      return ms >= oggi.getTime() && ms <= limite.getTime();
    });

    // ── Confronto ──────────────────────────────────────────────────────────
    const divergenze: Divergenza[] = [];
    let esaminati = 0;
    let saltati = 0;
    const motiviSalto: Record<string, number> = {};
    const salta = (m: string) => {
      saltati++;
      motiviSalto[m] = (motiviSalto[m] || 0) + 1;
    };

    for (const od of ordini) {
      const o = od.data() as any;
      if (!o.cleaningId) {
        salta("ordine senza cleaningId");
        continue;
      }

      const cSnap = await adminDb.collection("cleanings").doc(String(o.cleaningId)).get();
      if (!cSnap.exists) {
        salta("pulizia collegata inesistente");
        continue;
      }
      const c = cSnap.data() as any;
      const p = props.get(String(o.propertyId));
      if (!p) {
        salta("proprieta' non trovata");
        continue;
      }

      // GUARDIA BIANCHERIA — stessa regola del resto del sistema
      const hlo = c.hasLinenOrder;
      const usesOwn = p.usesOwnLinen === true;
      if (hlo === false || (hlo === undefined && usesOwn)) {
        salta("pulizia senza biancheria (hasLinenOrder=false o biancheria propria)");
        continue;
      }

      const ospiti = typeof c.guestsCount === "number" ? c.guestsCount : 2;
      const sc = p.serviceConfigs || {};
      const standard = sc[ospiti] ?? sc[String(ospiti)] ?? null;

      const { config, source } = resolveEffectiveConfig(
        {
          linenConfigModified: c.linenConfigModified ?? null,
          customLinenConfig: c.customLinenConfig ?? null,
          hasLinenOrder: hlo ?? null,
        },
        standard,
        usesOwn
      );
      if (!config) {
        salta(`nessuna config valutabile per ${ospiti} ospiti`);
        continue;
      }

      esaminati++;

      // Atteso dalla config (linenCore = unica fonte di verita')
      const atteso: Record<string, number> = {};
      buildExpectedItems(config).forEach((e) => {
        const inv = resolveInv(e.itemId, invMap);
        const id = inv?.id ?? e.itemId;
        atteso[id] = (atteso[id] || 0) + e.quantity;
      });

      // Presente nell'ordine, solo categorie gestite, ID normalizzati
      const presente: Record<string, number> = {};
      (Array.isArray(o.items) ? o.items : []).forEach((it: any) => {
        const q = typeof it?.quantity === "number" ? it.quantity : 0;
        if (q <= 0) return;
        const rawId = it?.itemId || it?.id;
        if (!rawId) return;
        const inv = resolveInv(rawId, invMap);
        let cat: string | null = it?.categoryId || null;
        if (!cat && it?.categoryName) {
          const cn = String(it.categoryName).toLowerCase();
          if (cn.includes("letto")) cat = "biancheria_letto";
          else if (cn.includes("bagno")) cat = "biancheria_bagno";
          else if (cn.includes("kit") || cn.includes("cortesia")) cat = "kit_cortesia";
        }
        if (!cat) cat = inv?.categoryId ?? null;
        if (!cat || !MANAGED_CATS.has(cat)) return;
        const id = inv?.id ?? rawId;
        presente[id] = (presente[id] || 0) + q;
      });

      // Diff
      const chiavi = new Set([...Object.keys(atteso), ...Object.keys(presente)]);
      const dettaglio: Divergenza["dettaglio"] = [];
      let capiAttesi = 0;
      let capiPresenti = 0;
      for (const k of chiavi) {
        const a = atteso[k] || 0;
        const b = presente[k] || 0;
        const inv = invMap.get(k);
        const cat = inv?.categoryId ?? null;
        if (cat === "biancheria_letto" || cat === "biancheria_bagno") {
          capiAttesi += a;
          capiPresenti += b;
        }
        if (a !== b) {
          dettaglio.push({ articolo: inv?.name || k, atteso: a, nellOrdine: b });
        }
      }

      if (dettaglio.length === 0) continue;

      // CRITICA = il caso Trastevere: biancheria prevista ma zero nell'ordine.
      // Il rider parte senza lenzuola. Tutto il resto e' MEDIA.
      const gravita: Divergenza["gravita"] =
        capiAttesi > 0 && capiPresenti === 0 ? "CRITICA" : "MEDIA";

      divergenze.push({
        gravita,
        proprieta: o.propertyName || p.name || "(senza nome)",
        data: isoGiorno(o.scheduledDate),
        cleaningId: String(o.cleaningId),
        orderId: od.id,
        ospiti,
        fonteConfig: source,
        linenConfigModified: c.linenConfigModified === true,
        dettaglio: dettaglio.sort((x, y) => x.articolo.localeCompare(y.articolo)),
        capiBiancheriaAttesi: capiAttesi,
        capiBiancheriaNellOrdine: capiPresenti,
      });
    }

    divergenze.sort((a, b) => {
      if (a.gravita !== b.gravita) return a.gravita === "CRITICA" ? -1 : 1;
      return a.data.localeCompare(b.data);
    });

    const critiche = divergenze.filter((d) => d.gravita === "CRITICA");
    const medie = divergenze.filter((d) => d.gravita === "MEDIA");

    // ── Traccia in auditLog (sempre, anche quando e' tutto a posto) ─────────
    try {
      await adminDb.collection("auditLog").add({
        action: "GUARDIA_BIANCHERIA",
        entityType: "order",
        entityId: null,
        propertyId: null,
        propertyName: null,
        source: "api/cron/guardia-biancheria",
        timestamp: Timestamp.now(),
        details: {
          finestraGiorni: giorni,
          ordiniPendingInFinestra: ordini.length,
          esaminati,
          saltati,
          motiviSalto,
          divergenzeTotali: divergenze.length,
          critiche: critiche.length,
          medie: medie.length,
          // Elenco compatto: il documento non deve diventare enorme
          elenco: divergenze.slice(0, 40).map((d) => ({
            gravita: d.gravita,
            proprieta: d.proprieta,
            data: d.data,
            orderId: d.orderId,
            cleaningId: d.cleaningId,
            capiAttesi: d.capiBiancheriaAttesi,
            capiNellOrdine: d.capiBiancheriaNellOrdine,
          })),
          durataMs: Date.now() - iniziato,
        },
      });
    } catch {
      /* il log non deve far fallire il controllo */
    }

    // ── Notifica agli ADMIN, solo se c'e' qualcosa da dire ──────────────────
    let notificati = 0;
    if (inviaNotifica && divergenze.length > 0) {
      try {
        const admins = await adminDb.collection("users").where("role", "==", "ADMIN").get();
        const righeCritiche = critiche
          .slice(0, 5)
          .map((d) => `• ${d.proprieta} ${d.data}: ${d.capiBiancheriaAttesi} capi previsti, 0 nell'ordine`)
          .join("\n");

        const titolo =
          critiche.length > 0
            ? `🚨 ${critiche.length} ordine/i biancheria SENZA lenzuola`
            : `⚠️ ${medie.length} ordine/i biancheria non allineati`;

        const messaggio =
          critiche.length > 0
            ? `Trovati ${critiche.length} ordini PENDING in cui la config prevede biancheria ma l'ordine non ne contiene.\n${righeCritiche}${
                critiche.length > 5 ? `\n…e altri ${critiche.length - 5}.` : ""
              }\n\nAltre divergenze minori: ${medie.length}.`
            : `Trovate ${medie.length} divergenze di quantita' tra config e ordine sui PENDING dei prossimi ${giorni} giorni.`;

        for (const a of admins.docs) {
          await adminDb.collection("notifications").add({
            title: titolo,
            message: messaggio,
            type: critiche.length > 0 ? "WARNING" : "INFO",
            recipientRole: "ADMIN",
            recipientId: a.id,
            senderId: "system",
            senderName: "Guardia Biancheria",
            relatedEntityId: critiche[0]?.orderId ?? medie[0]?.orderId ?? null,
            relatedEntityType: "ORDER",
            relatedEntityName: critiche[0]?.proprieta ?? medie[0]?.proprieta ?? null,
            link: "/dashboard/consegne",
            status: "UNREAD",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
          notificati++;
        }
      } catch {
        /* notifica best-effort */
      }
    }

    return NextResponse.json({
      success: true,
      eseguitoIl: new Date().toISOString(),
      finestra: `oggi → +${giorni} giorni`,
      RIEPILOGO: {
        ordiniPendingInFinestra: ordini.length,
        esaminati,
        saltati,
        motiviSalto,
        divergenze: divergenze.length,
        critiche: critiche.length,
        medie: medie.length,
        adminNotificati: notificati,
        durataMs: Date.now() - iniziato,
      },
      CRITICHE: critiche,
      MEDIE: medie,
      comeRiparare:
        divergenze.length > 0
          ? "Per ogni caso, da browser loggato come admin: fetch('/api/cleanings/<cleaningId>/update-linen-order', {method:'POST'}). Verifica il risultato prima di passare al successivo."
          : "Nessuna azione necessaria.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err), stack: process.env.NODE_ENV !== "production" ? err?.stack : undefined },
      { status: 500 }
    );
  }
}
