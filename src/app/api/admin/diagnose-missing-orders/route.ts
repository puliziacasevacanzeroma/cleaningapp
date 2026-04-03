import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";
import { getItemName } from "~/lib/itemNames";

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/diagnose-missing-orders
 * 
 * Trova pulizie SCHEDULED/ASSIGNED/IN_PROGRESS senza ordine biancheria collegato
 * e spiega perché l'ordine non è stato creato.
 * 
 * Query params:
 *   ?days=7            (default 7 — quanti giorni avanti guardare)
 *   ?propertyName=X    (opzionale — filtra per nome proprietà)
 *   ?includeCompleted  (opzionale — include anche COMPLETED)
 */

// Replica la logica di calculateLinenItemsForProperty per diagnosi
function diagnoseLinenCalculation(prop: any, guestsCount: number): { items: any[]; diagnosis: string[] } {
  const diagnosis: string[] = [];
  let items: { id: string; name: string; quantity: number }[] = [];

  if (!prop.serviceConfigs) {
    diagnosis.push("❌ Proprietà NON ha serviceConfigs — nessuna configurazione biancheria salvata");
    // Check fallback
    const bedrooms = prop.bedrooms || 0;
    const bathrooms = prop.bathrooms || 0;
    if (bedrooms === 0 && bathrooms === 0) {
      diagnosis.push("❌ Anche bedrooms=0 e bathrooms=0 — fallback produrrà 0 items");
    } else {
      diagnosis.push(`ℹ️ Fallback userebbe bedrooms=${bedrooms}, bathrooms=${bathrooms}`);
    }
    return { items, diagnosis };
  }

  const config = prop.serviceConfigs[guestsCount] || prop.serviceConfigs[String(guestsCount)];
  if (!config) {
    const availableKeys = Object.keys(prop.serviceConfigs);
    diagnosis.push(`❌ Nessuna serviceConfig per ${guestsCount} ospiti`);
    diagnosis.push(`   Configurazioni disponibili: ${availableKeys.join(", ") || "nessuna"}`);
    // Check if any config exists at all
    if (availableKeys.length > 0) {
      diagnosis.push(`   💡 Serve salvare la configurazione per ${guestsCount} ospiti dalla pagina proprietà`);
    }
    return { items, diagnosis };
  }

  diagnosis.push(`✅ serviceConfig trovata per ${guestsCount} ospiti`);

  // Check bl (biancheria letto)
  if (config.bl) {
    const hasAll = config.bl['all'] && typeof config.bl['all'] === 'object' && Object.keys(config.bl['all']).length > 0;
    if (hasAll) {
      Object.entries(config.bl['all']).forEach(([itemId, qty]: [string, any]) => {
        if (typeof qty === 'number' && qty > 0) items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
      });
      diagnosis.push(`✅ bl.all presente con ${Object.keys(config.bl['all']).length} items`);
    } else {
      // Per-bed format
      let bedCount = 0;
      Object.entries(config.bl).forEach(([bedId, bedItems]: [string, any]) => {
        if (bedId !== 'all' && typeof bedItems === 'object') {
          bedCount++;
          Object.entries(bedItems).forEach(([itemId, qty]: [string, any]) => {
            if (typeof qty === 'number' && qty > 0) {
              const existing = items.find(i => i.id === itemId);
              if (existing) existing.quantity += qty;
              else items.push({ id: itemId, name: getItemName(itemId), quantity: qty });
            }
          });
        }
      });
      if (bedCount > 0) {
        diagnosis.push(`✅ bl per-letto con ${bedCount} letti configurati`);
      } else {
        diagnosis.push("⚠️ bl presente ma vuoto (nessun letto con items)");
      }
    }
  } else {
    diagnosis.push("⚠️ Nessun bl (biancheria letto) nella config");
  }

  // Check ba (biancheria bagno)
  if (config.ba) {
    const baItems = Object.entries(config.ba).filter(([, qty]) => typeof qty === 'number' && (qty as number) > 0);
    if (baItems.length > 0) {
      baItems.forEach(([itemId, qty]: [string, any]) => items.push({ id: itemId, name: getItemName(itemId), quantity: qty }));
      diagnosis.push(`✅ ba presente con ${baItems.length} items`);
    } else {
      diagnosis.push("⚠️ ba presente ma tutte le quantità sono 0");
    }
  } else {
    diagnosis.push("ℹ️ Nessun ba (biancheria bagno) nella config");
  }

  // Check ki (kit cortesia)
  if (config.ki) {
    const kiItems = Object.entries(config.ki).filter(([, qty]) => typeof qty === 'number' && (qty as number) > 0);
    if (kiItems.length > 0) {
      kiItems.forEach(([itemId, qty]: [string, any]) => items.push({ id: itemId, name: getItemName(itemId), quantity: qty }));
      diagnosis.push(`✅ ki presente con ${kiItems.length} items`);
    }
  }

  if (items.length === 0) {
    diagnosis.push("❌ TOTALE ITEMS = 0 — calculateLinenItemsForProperty restituirà fallback o vuoto");
  } else {
    diagnosis.push(`✅ TOTALE: ${items.length} items calcolati`);
  }

  return { items, diagnosis };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Solo admin" }, { status: 403 });
    }

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") || "7");
    const filterPropertyName = url.searchParams.get("propertyName")?.toLowerCase();
    const includeCompleted = url.searchParams.has("includeCompleted");

    const now = new Date();
    const since = new Date();
    since.setDate(since.getDate() - 2); // include pulizie di ieri e oggi
    const until = new Date();
    until.setDate(until.getDate() + days);

    // Carica pulizie nel range
    const statuses = includeCompleted
      ? ["SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"]
      : ["SCHEDULED", "ASSIGNED", "IN_PROGRESS"];

    const cleaningsSnap = await adminDb.collection("cleanings")
      .where("scheduledDate", ">=", Timestamp.fromDate(since))
      .where("scheduledDate", "<=", Timestamp.fromDate(until))
      .orderBy("scheduledDate", "asc")
      .get();

    let cleanings = cleaningsSnap.docs
      .map(d => ({ id: d.id, ...d.data() as Record<string, any> }))
      .filter(c => statuses.includes(c.status));

    if (filterPropertyName) {
      cleanings = cleanings.filter(c =>
        (c.propertyName || "").toLowerCase().includes(filterPropertyName)
      );
    }

    // Carica proprietà
    const propertyIds = new Set(cleanings.map(c => c.propertyId).filter(Boolean));
    const propertiesMap = new Map<string, any>();
    for (const pid of propertyIds) {
      try {
        const doc = await adminDb.collection("properties").doc(pid).get();
        if (doc.exists) propertiesMap.set(pid, { id: doc.id, ...doc.data() as Record<string, any> });
      } catch { /* ignore */ }
    }

    // Carica ordini per matching
    const ordersSnap = await adminDb.collection("orders")
      .where("scheduledDate", ">=", Timestamp.fromDate(since))
      .where("scheduledDate", "<=", Timestamp.fromDate(until))
      .get();
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() as Record<string, any> }));

    // Mappa ordini per cleaningId e per propertyId+data
    const orderByCleaningId = new Map<string, any>();
    const orderByPropDate = new Map<string, any>();
    for (const o of orders) {
      if (o.status === "CANCELLED") continue;
      if (o.cleaningId) orderByCleaningId.set(o.cleaningId, o);
      if (o.propertyId && o.scheduledDate) {
        const d = o.scheduledDate?.toDate?.();
        if (d) orderByPropDate.set(`${o.propertyId}_${d.toISOString().split("T")[0]}`, o);
      }
    }

    const results: any[] = [];
    let missingOrders = 0;
    let okCount = 0;

    for (const cleaning of cleanings) {
      const scheduledDate = cleaning.scheduledDate?.toDate?.();
      const dateStr = scheduledDate?.toISOString()?.split("T")[0] || "?";
      const prop = propertiesMap.get(cleaning.propertyId);

      // Check if order exists
      const orderViaId = orderByCleaningId.get(cleaning.id);
      const orderViaLaundryId = cleaning.laundryOrderId
        ? orders.find(o => o.id === cleaning.laundryOrderId && o.status !== "CANCELLED")
        : null;
      const orderViaPropDate = orderByPropDate.get(`${cleaning.propertyId}_${dateStr}`);
      const order = orderViaId || orderViaLaundryId || orderViaPropDate;

      if (order) {
        okCount++;
        continue; // Ha ordine, tutto OK — skip
      }

      // Nessun ordine trovato — diagnosi
      const result: any = {
        cleaningId: cleaning.id,
        propertyName: cleaning.propertyName || "?",
        propertyId: cleaning.propertyId,
        scheduledDate: dateStr,
        status: cleaning.status,
        guestsCount: cleaning.guestsCount || "?",
        guestName: cleaning.guestName || "?",
        laundryOrderId: cleaning.laundryOrderId || null,
        requiresLaundry: cleaning.requiresLaundry || false,
        hasLinenOrder: cleaning.hasLinenOrder,
        problems: [],
        linenDiagnosis: [],
        calculatedItems: [],
      };

      // Motivo 1: usesOwnLinen
      if (prop?.usesOwnLinen === true) {
        result.problems.push("ℹ️ Proprietà usa biancheria propria (usesOwnLinen=true) — ordine non necessario");
        results.push(result);
        okCount++;
        continue;
      }

      // Motivo 2: laundryOrderId punta a ordine cancellato/inesistente
      if (cleaning.laundryOrderId) {
        const lOrder = orders.find(o => o.id === cleaning.laundryOrderId);
        if (!lOrder) {
          result.problems.push(`⚠️ laundryOrderId="${cleaning.laundryOrderId}" NON trovato nel range — forse più vecchio o eliminato`);
          // Check direttamente su Firestore
          try {
            const directCheck = await adminDb.collection("orders").doc(cleaning.laundryOrderId).get();
            if (directCheck.exists) {
              const data = directCheck.data() as Record<string, any>;
              result.problems.push(`   → Ordine esiste in Firestore con status="${data.status}"`);
              if (data.status === "CANCELLED") {
                result.problems.push("   → Ordine CANCELLATO — serve ricrearlo");
              }
            } else {
              result.problems.push("   → Ordine NON esiste in Firestore — eliminato");
            }
          } catch { /* ignore */ }
        } else if (lOrder.status === "CANCELLED") {
          result.problems.push(`⚠️ laundryOrderId="${cleaning.laundryOrderId}" è CANCELLATO`);
        }
      }

      // Motivo 3: Diagnostica configurazione biancheria
      if (prop) {
        const { items, diagnosis } = diagnoseLinenCalculation(prop, cleaning.guestsCount || 2);
        result.linenDiagnosis = diagnosis;
        result.calculatedItems = items.map(i => ({ id: i.id, name: i.name, qty: i.quantity }));

        if (items.length === 0) {
          result.problems.push("❌ calculateLinenItemsForProperty restituisce 0 items — ordine NON creabile");
        } else {
          result.problems.push(`✅ Biancheria calcolabile: ${items.length} items — ordine DOVREBBE esistere`);
          result.problems.push("❓ Possibile causa: cron sync non ha eseguito createLinenOrder per questa pulizia");
          result.problems.push("💡 Il prossimo sync dovrebbe creare l'ordine automaticamente (STEP 1.5 del cron)");
        }

        // Check se la proprietà ha autoGenerateLaundry
        if (prop.autoGenerateLaundry === false) {
          result.problems.push("⚠️ autoGenerateLaundry=false sulla proprietà");
        }
      } else {
        result.problems.push("❌ Proprietà non trovata in Firestore");
      }

      missingOrders++;
      results.push(result);
    }

    return NextResponse.json({
      summary: {
        totalCleanings: cleanings.length,
        withOrder: okCount,
        missingOrders,
        dateRange: `${since.toISOString().split("T")[0]} → ${until.toISOString().split("T")[0]}`,
      },
      missingOrderDetails: results,
    });
  } catch (error) {
    console.error("Errore diagnose-missing-orders:", error);
    return NextResponse.json({ error: "Errore: " + (error instanceof Error ? error.message : "sconosciuto") }, { status: 500 });
  }
}
