/**
 * 🔍 DEBUG ENDPOINT — Diagnostica ordini biancheria
 * URL: /api/debug/linen-diagnosis?propertyName=Pellegrino
 * 
 * Analizza PERCHÉ gli ordini biancheria non vengono creati per una proprietà.
 * Da rimuovere dopo il debug.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

// Autorizzazione: solo admin o CRON_SECRET
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const urlSecret = req.nextUrl.searchParams.get("secret");
  if (authHeader !== `Bearer ${CRON_SECRET}` && urlSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const propertyName = req.nextUrl.searchParams.get("propertyName") || "";
  const propertyId = req.nextUrl.searchParams.get("propertyId") || "";

  const report: Record<string, any> = {
    timestamp: new Date().toISOString(),
    query: { propertyName, propertyId },
    properties: [],
  };

  try {
    // ── 1. Trova proprietà ──
    let propQuery;
    if (propertyId) {
      const single = await adminDb.collection("properties").doc(propertyId).get();
      propQuery = single.exists ? [single] : [];
    } else {
      const snap = await adminDb.collection("properties").where("status", "==", "ACTIVE").get();
      propQuery = snap.docs.filter(d => {
        const name = (d.data().name || "").toLowerCase();
        return !propertyName || name.includes(propertyName.toLowerCase());
      });
    }

    if (propQuery.length === 0) {
      return NextResponse.json({ error: "Nessuna proprietà trovata", query: { propertyName, propertyId } }, { status: 404 });
    }

    for (const propDoc of propQuery) {
      const prop = { id: propDoc.id, ...propDoc.data() } as Record<string, any>;

      const propReport: Record<string, any> = {
        id: prop.id,
        name: prop.name,
        status: prop.status,

        // ── Configurazione biancheria ──
        usesOwnLinen: prop.usesOwnLinen ?? false,
        maxGuests: prop.maxGuests,
        bedrooms: prop.bedrooms,
        bathrooms: prop.bathrooms,
        cleaningPrice: prop.cleaningPrice,
        checkOutTime: prop.checkOutTime,

        // ── iCal links ──
        icalLinks: {
          airbnb: prop.icalAirbnb ? "✅ presente" : "❌ assente",
          booking: prop.icalBooking ? "✅ presente" : "❌ assente",
          oktorate: prop.icalOktorate ? "✅ presente" : "❌ assente",
          inreception: prop.icalInreception ? "✅ presente" : "❌ assente",
          krossbooking: prop.icalKrossbooking ? "✅ presente" : "❌ assente",
        },
        lastIcalSync: prop.lastIcalSync?.toDate?.()?.toISOString() || "mai",

        // ── serviceConfigs analysis ──
        serviceConfigs: {},
        serviceConfigsRaw: {},

        // ── Pulizie e ordini ──
        cleanings: [],
        orders: [],
        diagnosis: [],
      };

      // ── Analisi serviceConfigs ──
      if (!prop.serviceConfigs) {
        propReport.serviceConfigs = { status: "❌ MANCANTE - Non configurata" };
        propReport.diagnosis.push("PROBLEMA: serviceConfigs non esistono → linenItems sarà sempre vuoto → nessun ordine creato");
      } else {
        const keys = Object.keys(prop.serviceConfigs);
        propReport.serviceConfigsRaw = prop.serviceConfigs;
        propReport.serviceConfigs = {
          status: "✅ Presente",
          chiavi_disponibili: keys,
          tipo_chiavi: keys.map(k => typeof k),
          note: keys.length > 0
            ? "⚠️ ATTENZIONE: Firestore salva chiavi come stringhe (\"2\", \"6\") non numeri (2, 6)"
            : "❌ Nessuna configurazione per nessun numero di ospiti",
        };

        // Verifica il bug chiave stringa vs numero
        for (const key of keys) {
          const numKey = parseInt(key);
          const config = prop.serviceConfigs[key];
          const hasBlAll = !!(config?.bl?.all && Object.keys(config.bl.all).length > 0);
          const hasBl = !!(config?.bl && Object.keys(config.bl).length > 0);
          const hasBa = !!(config?.ba && Object.keys(config.ba).length > 0);

          // Simula il bug: serviceConfigs[numKey] — questo FALLISCE se chiavi sono stringhe
          const bugCheck = prop.serviceConfigs[numKey] !== undefined;
          const fixedCheck = prop.serviceConfigs[key] !== undefined || prop.serviceConfigs[String(numKey)] !== undefined;

          propReport.serviceConfigs[`ospiti_${key}`] = {
            chiave_originale: key,
            tipo_chiave: typeof key,
            accesso_con_numero: bugCheck ? "✅ funziona" : "❌ BUG: undefined → linenItems vuoto → no ordine!",
            accesso_con_stringa: fixedCheck ? "✅ funziona" : "❌ fallisce",
            ha_bl_all: hasBlAll ? "✅" : "❌ (usa gruppi letto)",
            ha_bl: hasBl ? "✅" : "❌",
            ha_ba: hasBa ? "✅" : "❌",
            items_bl: hasBlAll
              ? Object.entries(config.bl.all).map(([id, qty]) => `${id}: ${qty}`)
              : (hasBl ? Object.keys(config.bl).filter(k => k !== "all") : []),
            items_ba: hasBa ? Object.entries(config.ba).map(([id, qty]) => `${id}: ${qty}`) : [],
          };

          if (!bugCheck) {
            propReport.diagnosis.push(
              `BUG TROVATO per ${key} ospiti: manual/route.ts usa serviceConfigs[${numKey}] (numero) ma Firestore ha la chiave "${key}" (stringa) → config non trovata → linenItems=[] → nessun ordine`
            );
          }
        }
      }

      // ── Pulizie future ──
      const now = new Date();
      const cleaningsSnap = await adminDb.collection("cleanings")
        .where("propertyId", "==", prop.id)
        .get();

      const ordersSnap = await adminDb.collection("orders")
        .where("propertyId", "==", prop.id)
        .get();

      const ordersByCleaningId = new Map<string, any>();
      const ordersByDate = new Map<string, any>();
      ordersSnap.docs.forEach(d => {
        const o = d.data() as Record<string, any>;
        if (o.cleaningId) ordersByCleaningId.set(o.cleaningId, { id: d.id, status: o.status, items: o.items?.length });
        const date = o.scheduledDate?.toDate?.();
        if (date) ordersByDate.set(date.toISOString().split("T")[0], { id: d.id, status: o.status });
      });

      for (const cDoc of cleaningsSnap.docs) {
        const c = cDoc.data() as Record<string, any>;
        const cDate = c.scheduledDate?.toDate?.();
        if (!cDate) continue;

        const dateStr = cDate.toISOString().split("T")[0];
        const orderByCleaning = ordersByCleaningId.get(cDoc.id);
        const orderByDate = ordersByDate.get(dateStr);
        const hasOrder = !!(orderByCleaning || orderByDate);

        const guestsCount = c.guestsCount || prop.maxGuests || 2;
        // Simula il bug
        const configWithNum = prop.serviceConfigs?.[guestsCount];
        const configWithStr = prop.serviceConfigs?.[String(guestsCount)];
        const configFound = !!(configWithNum || configWithStr);

        const cleaningInfo: Record<string, any> = {
          id: cDoc.id,
          date: dateStr,
          status: c.status,
          guestsCount,
          source: c.bookingSource || "manuale",
          hasLinenOrder: c.laundryOrderId ? `✅ ${c.laundryOrderId}` : "❌ mancante",
          requiresLaundry: c.requiresLaundry,
          ordineDB: hasOrder
            ? `✅ ${(orderByCleaning || orderByDate).id} [${(orderByCleaning || orderByDate).status}]`
            : "❌ NESSUN ORDINE",
        };

        if (!hasOrder && !prop.usesOwnLinen) {
          cleaningInfo.diagnosi = [];

          if (!configFound) {
            cleaningInfo.diagnosi.push(`❌ BUG CHIAVE: serviceConfigs[${guestsCount}] (numero) non trovata. Chiavi disponibili: [${Object.keys(prop.serviceConfigs || {}).join(", ")}]. Usa serviceConfigs["${guestsCount}"] (stringa)`);
          } else {
            cleaningInfo.diagnosi.push("✅ Config trovata ma ordine ancora mancante - controlla altro");
          }

          if (cDate < now) {
            cleaningInfo.diagnosi.push("⚠️ Pulizia nel passato - il cron non crea più ordini retroattivi");
          }

          propReport.diagnosis.push(`Pulizia ${dateStr} (${guestsCount} ospiti): ${cleaningInfo.diagnosi.join(" | ")}`);
        }

        propReport.cleanings.push(cleaningInfo);
      }

      // ── Riepilogo ordini ──
      propReport.ordini_totali = ordersSnap.docs.length;
      propReport.ordini_per_status = ordersSnap.docs.reduce((acc, d) => {
        const s = (d.data() as any).status || "unknown";
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // ── Fix automatico proposto ──
      propReport.fix_proposto = propReport.usesOwnLinen
        ? "N/A: proprietà usa biancheria propria"
        : propReport.diagnosis.some(d => d.includes("BUG CHIAVE"))
        ? "APPLICARE FIX: in manual/route.ts riga ~393 aggiungere: const config = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)]"
        : propReport.diagnosis.some(d => d.includes("serviceConfigs non esistono"))
        ? "CONFIGURARE: Andare in Proprietà > Configura Biancheria e salvare la configurazione per ogni numero di ospiti"
        : "Esegui /api/cron/sync-ical?force=true&secret=SECRET per ricreare ordini mancanti";

      report.properties.push(propReport);
    }

    return NextResponse.json(report, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
