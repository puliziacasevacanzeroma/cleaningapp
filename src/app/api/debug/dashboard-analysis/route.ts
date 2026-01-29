import { NextResponse } from "next/server";
import { collection, getDocs, query, where, Timestamp, orderBy } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

/**
 * 🔍 API DEBUG: Analisi completa Dashboard
 * 
 * Questo endpoint analizza:
 * 1. Conteggio pulizie vs ordini (dovrebbero coincidere spesso)
 * 2. Pulizie senza prezzo calcolato
 * 3. Ordini biancheria senza cleaningId collegato
 * 4. Pulizie con proprietà che usano biancheria propria ma hanno ordini
 * 5. Inconsistenze nei conteggi delle tabs
 */

interface AnalysisResult {
  summary: {
    totalCleanings: number;
    totalOrders: number;
    cleaningsWithOrders: number;
    orphanOrders: number;
    cleaningsWithoutPrice: number;
    cleaningsWithPrice: number;
    activeProperties: number;
    propertiesWithOwnLinen: number;
  };
  todayStats: {
    cleaningsToday: number;
    cleaningsTodayActive: number;
    ordersToday: number;
    ordersTodayActive: number;
    mismatch: boolean;
    details: string;
  };
  priceIssues: {
    cleaningId: string;
    propertyName: string;
    propertyId: string;
    date: string;
    price: number | null;
    contractPrice: number | null;
    serviceType: string | null;
    issue: string;
  }[];
  orphanOrders: {
    orderId: string;
    propertyName: string;
    date: string;
    cleaningId: string | null;
    hasMatchingCleaning: boolean;
    issue: string;
  }[];
  linenIssues: {
    propertyId: string;
    propertyName: string;
    usesOwnLinen: boolean;
    hasOrders: boolean;
    orderCount: number;
    issue: string;
  }[];
  cleaningsWithoutMatchingOrders: {
    cleaningId: string;
    propertyName: string;
    date: string;
    usesOwnLinen: boolean;
    hasOrder: boolean;
    issue: string;
  }[];
  duplicates: {
    type: "cleaning" | "order";
    propertyName: string;
    date: string;
    ids: string[];
    issue: string;
  }[];
}

export async function GET() {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("🔍 ANALISI COMPLETA DASHBOARD - DEBUG");
    console.log("=".repeat(80) + "\n");

    // 1. Carica tutti i dati necessari
    const [propertiesSnap, cleaningsSnap, ordersSnap] = await Promise.all([
      getDocs(collection(db, "properties")),
      getDocs(collection(db, "cleanings")),
      getDocs(collection(db, "orders")),
    ]);

    // Mappa proprietà
    const propertiesMap = new Map<string, any>();
    const activePropertyIds = new Set<string>();
    let propertiesWithOwnLinen = 0;

    propertiesSnap.docs.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      propertiesMap.set(doc.id, data);
      if (data.status === "ACTIVE") {
        activePropertyIds.add(doc.id);
      }
      if (data.usesOwnLinen) {
        propertiesWithOwnLinen++;
      }
    });

    console.log(`📋 Proprietà totali: ${propertiesMap.size}`);
    console.log(`✅ Proprietà ATTIVE: ${activePropertyIds.size}`);
    console.log(`🏠 Proprietà con biancheria propria: ${propertiesWithOwnLinen}`);

    // Mappa pulizie
    const cleaningsMap = new Map<string, any>();
    const cleaningsByPropertyDate = new Map<string, any[]>(); // key: propertyId-YYYY-MM-DD
    let cleaningsWithoutPrice = 0;
    let cleaningsWithPrice = 0;

    cleaningsSnap.docs.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      cleaningsMap.set(doc.id, data);

      // Verifica prezzo
      if (data.price === null || data.price === undefined || data.price === 0) {
        cleaningsWithoutPrice++;
      } else {
        cleaningsWithPrice++;
      }

      // Raggruppa per proprietà-data
      const scheduledDate = data.scheduledDate?.toDate?.();
      if (scheduledDate && data.propertyId) {
        const dateStr = scheduledDate.toISOString().split("T")[0];
        const key = `${data.propertyId}-${dateStr}`;
        if (!cleaningsByPropertyDate.has(key)) {
          cleaningsByPropertyDate.set(key, []);
        }
        cleaningsByPropertyDate.get(key)!.push(data);
      }
    });

    console.log(`🧹 Pulizie totali: ${cleaningsMap.size}`);
    console.log(`💰 Pulizie CON prezzo: ${cleaningsWithPrice}`);
    console.log(`⚠️ Pulizie SENZA prezzo: ${cleaningsWithoutPrice}`);

    // Mappa ordini
    const ordersMap = new Map<string, any>();
    const ordersByPropertyDate = new Map<string, any[]>();
    let orphanOrdersCount = 0;
    let cleaningsWithOrders = 0;

    ordersSnap.docs.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      ordersMap.set(doc.id, data);

      // Verifica se ha cleaning collegato
      if (data.cleaningId && cleaningsMap.has(data.cleaningId)) {
        cleaningsWithOrders++;
      } else if (data.cleaningId) {
        orphanOrdersCount++;
      }

      // Raggruppa per proprietà-data
      const scheduledDate = data.scheduledDate?.toDate?.();
      if (scheduledDate && data.propertyId) {
        const dateStr = scheduledDate.toISOString().split("T")[0];
        const key = `${data.propertyId}-${dateStr}`;
        if (!ordersByPropertyDate.has(key)) {
          ordersByPropertyDate.set(key, []);
        }
        ordersByPropertyDate.get(key)!.push(data);
      }
    });

    console.log(`📦 Ordini totali: ${ordersMap.size}`);
    console.log(`🔗 Pulizie con ordini collegati: ${cleaningsWithOrders}`);
    console.log(`❌ Ordini orfani (cleaningId non trovato): ${orphanOrdersCount}`);

    // 2. Analisi OGGI
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let cleaningsToday = 0;
    let cleaningsTodayActive = 0;
    let ordersToday = 0;
    let ordersTodayActive = 0;

    cleaningsMap.forEach(cleaning => {
      const scheduledDate = cleaning.scheduledDate?.toDate?.();
      if (scheduledDate && scheduledDate >= today && scheduledDate < tomorrow) {
        cleaningsToday++;
        if (activePropertyIds.has(cleaning.propertyId)) {
          cleaningsTodayActive++;
        }
      }
    });

    ordersMap.forEach(order => {
      const scheduledDate = order.scheduledDate?.toDate?.();
      if (scheduledDate && scheduledDate >= today && scheduledDate < tomorrow) {
        ordersToday++;
        if (activePropertyIds.has(order.propertyId)) {
          ordersTodayActive++;
        }
      }
    });

    console.log(`\n📅 OGGI (${todayStr}):`);
    console.log(`   🧹 Pulizie: ${cleaningsToday} (attive: ${cleaningsTodayActive})`);
    console.log(`   📦 Ordini: ${ordersToday} (attivi: ${ordersTodayActive})`);

    // 3. Analisi problemi prezzi
    const priceIssues: AnalysisResult["priceIssues"] = [];

    cleaningsMap.forEach(cleaning => {
      const property = propertiesMap.get(cleaning.propertyId);
      const scheduledDate = cleaning.scheduledDate?.toDate?.();
      const dateStr = scheduledDate ? scheduledDate.toISOString().split("T")[0] : "N/A";

      let issue = "";

      // Caso 1: Prezzo mancante o zero
      if (cleaning.price === null || cleaning.price === undefined) {
        issue = "Prezzo NULL";
      } else if (cleaning.price === 0 && cleaning.serviceType !== "SGROSSO") {
        // SGROSSO può avere prezzo 0 se è custom
        const contractPrice = property?.cleaningPrice || 0;
        if (contractPrice > 0) {
          issue = `Prezzo 0 ma contratto prevede €${contractPrice}`;
        }
      }

      // Caso 2: Prezzo contratto non applicato
      if (!issue && property?.cleaningPrice && cleaning.price !== property.cleaningPrice) {
        // Questo potrebbe essere intenzionale (modifica manuale), ma lo segnaliamo
        if (!cleaning.priceModified && !cleaning.serviceType) {
          issue = `Prezzo (€${cleaning.price}) diverso da contratto (€${property.cleaningPrice})`;
        }
      }

      if (issue) {
        priceIssues.push({
          cleaningId: cleaning.id,
          propertyName: cleaning.propertyName || property?.name || "N/A",
          propertyId: cleaning.propertyId,
          date: dateStr,
          price: cleaning.price,
          contractPrice: property?.cleaningPrice || null,
          serviceType: cleaning.serviceType || null,
          issue,
        });
      }
    });

    console.log(`\n💰 PROBLEMI PREZZI: ${priceIssues.length}`);

    // 4. Analisi ordini orfani (senza pulizia collegata)
    const orphanOrders: AnalysisResult["orphanOrders"] = [];

    ordersMap.forEach(order => {
      const scheduledDate = order.scheduledDate?.toDate?.();
      const dateStr = scheduledDate ? scheduledDate.toISOString().split("T")[0] : "N/A";

      // Verifica se esiste pulizia stessa proprietà/data
      const key = `${order.propertyId}-${dateStr}`;
      const matchingCleanings = cleaningsByPropertyDate.get(key) || [];
      const hasMatchingCleaning = matchingCleanings.length > 0;

      let issue = "";

      if (order.cleaningId) {
        // Ha cleaningId ma la pulizia non esiste
        if (!cleaningsMap.has(order.cleaningId)) {
          issue = `CleaningId '${order.cleaningId}' non esiste nel database`;
        }
      } else {
        // Non ha cleaningId - potrebbe essere intenzionale (solo biancheria)
        if (hasMatchingCleaning) {
          issue = `Ordine senza cleaningId ma esiste pulizia per stessa proprietà/data`;
        }
      }

      if (issue) {
        orphanOrders.push({
          orderId: order.id,
          propertyName: order.propertyName || "N/A",
          date: dateStr,
          cleaningId: order.cleaningId || null,
          hasMatchingCleaning,
          issue,
        });
      }
    });

    console.log(`\n📦 ORDINI ORFANI: ${orphanOrders.length}`);

    // 5. Analisi problemi biancheria propria
    const linenIssues: AnalysisResult["linenIssues"] = [];

    propertiesMap.forEach(property => {
      if (property.usesOwnLinen) {
        // Cerca ordini per questa proprietà
        const propertyOrders = Array.from(ordersMap.values()).filter(
          o => o.propertyId === property.id
        );

        if (propertyOrders.length > 0) {
          linenIssues.push({
            propertyId: property.id,
            propertyName: property.name,
            usesOwnLinen: true,
            hasOrders: true,
            orderCount: propertyOrders.length,
            issue: `Proprietà usa biancheria propria ma ha ${propertyOrders.length} ordini biancheria`,
          });
        }
      }
    });

    console.log(`\n🏠 PROBLEMI BIANCHERIA PROPRIA: ${linenIssues.length}`);

    // 6. Pulizie senza ordini corrispondenti (per proprietà senza biancheria propria)
    const cleaningsWithoutMatchingOrders: AnalysisResult["cleaningsWithoutMatchingOrders"] = [];

    cleaningsMap.forEach(cleaning => {
      const property = propertiesMap.get(cleaning.propertyId);
      if (!property) return;

      // Se la proprietà usa biancheria propria, è normale non avere ordini
      if (property.usesOwnLinen) return;

      // Se la proprietà non è attiva, skippa
      if (property.status !== "ACTIVE") return;

      const scheduledDate = cleaning.scheduledDate?.toDate?.();
      if (!scheduledDate) return;

      const dateStr = scheduledDate.toISOString().split("T")[0];
      const key = `${cleaning.propertyId}-${dateStr}`;
      const matchingOrders = ordersByPropertyDate.get(key) || [];

      // Verifica anche se c'è un ordine collegato direttamente
      const hasLinkedOrder = matchingOrders.some(o => o.cleaningId === cleaning.id);
      const hasAnyOrder = matchingOrders.length > 0;

      if (!hasLinkedOrder && !hasAnyOrder) {
        // Solo per pulizie recenti (ultimi 30 giorni) o future
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        if (scheduledDate >= thirtyDaysAgo) {
          cleaningsWithoutMatchingOrders.push({
            cleaningId: cleaning.id,
            propertyName: cleaning.propertyName || property.name,
            date: dateStr,
            usesOwnLinen: property.usesOwnLinen || false,
            hasOrder: false,
            issue: `Pulizia senza ordine biancheria (proprietà NON usa biancheria propria)`,
          });
        }
      }
    });

    console.log(`\n🧹 PULIZIE SENZA ORDINI: ${cleaningsWithoutMatchingOrders.length}`);

    // 7. Duplicati
    const duplicates: AnalysisResult["duplicates"] = [];

    // Duplicati pulizie
    cleaningsByPropertyDate.forEach((cleanings, key) => {
      if (cleanings.length > 1) {
        const [propertyId, dateStr] = key.split("-").slice(0, 2);
        const property = propertiesMap.get(propertyId);
        const fullDate = key.substring(propertyId.length + 1);

        duplicates.push({
          type: "cleaning",
          propertyName: property?.name || propertyId,
          date: fullDate,
          ids: cleanings.map(c => c.id),
          issue: `${cleanings.length} pulizie duplicate per stessa proprietà/data`,
        });
      }
    });

    // Duplicati ordini
    ordersByPropertyDate.forEach((orders, key) => {
      if (orders.length > 1) {
        const [propertyId, dateStr] = key.split("-").slice(0, 2);
        const property = propertiesMap.get(propertyId);
        const fullDate = key.substring(propertyId.length + 1);

        duplicates.push({
          type: "order",
          propertyName: property?.name || propertyId,
          date: fullDate,
          ids: orders.map(o => o.id),
          issue: `${orders.length} ordini duplicati per stessa proprietà/data`,
        });
      }
    });

    console.log(`\n🔄 DUPLICATI: ${duplicates.length}`);

    // Risultato finale
    const result: AnalysisResult = {
      summary: {
        totalCleanings: cleaningsMap.size,
        totalOrders: ordersMap.size,
        cleaningsWithOrders,
        orphanOrders: orphanOrdersCount,
        cleaningsWithoutPrice,
        cleaningsWithPrice,
        activeProperties: activePropertyIds.size,
        propertiesWithOwnLinen,
      },
      todayStats: {
        cleaningsToday,
        cleaningsTodayActive,
        ordersToday,
        ordersTodayActive,
        mismatch: cleaningsTodayActive !== ordersTodayActive,
        details: cleaningsTodayActive !== ordersTodayActive
          ? `Discrepanza: ${cleaningsTodayActive} pulizie vs ${ordersTodayActive} ordini attivi oggi`
          : "OK - Numeri coincidono",
      },
      priceIssues: priceIssues.slice(0, 50), // Limita a 50 per non sovraccaricare
      orphanOrders: orphanOrders.slice(0, 50),
      linenIssues,
      cleaningsWithoutMatchingOrders: cleaningsWithoutMatchingOrders.slice(0, 50),
      duplicates,
    };

    console.log("\n" + "=".repeat(80));
    console.log("✅ ANALISI COMPLETATA");
    console.log("=".repeat(80) + "\n");

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      analysis: result,
    });

  } catch (error: any) {
    console.error("❌ Errore analisi dashboard:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Errore sconosciuto",
    }, { status: 500 });
  }
}
