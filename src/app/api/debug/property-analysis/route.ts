import { NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

/**
 * 🔍 ANALISI COMPLETA PROPRIETÀ
 * 
 * Analizza tutte le proprietà per trovare:
 * - Configurazioni mancanti (prezzo, biancheria, etc)
 * - Incongruenze nei dati
 * - Proprietà "segnaposto" vs reali
 * - Flag biancheria propria
 */

export async function GET() {
  console.log("\n" + "=".repeat(80));
  console.log("🏠 ANALISI COMPLETA PROPRIETÀ");
  console.log("=".repeat(80) + "\n");

  try {
    // Carica tutti i dati
    const [propertiesSnap, cleaningsSnap, ordersSnap, ownersSnap] = await Promise.all([
      getDocs(collection(db, "properties")),
      getDocs(collection(db, "cleanings")),
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "users")),
    ]);

    const properties = propertiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cleanings = cleaningsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const owners = ownersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Mappa owners
    const ownersMap = new Map();
    owners.forEach(o => ownersMap.set(o.id, o));

    // Conta pulizie e ordini per proprietà
    const cleaningsByProperty = new Map<string, any[]>();
    const ordersByProperty = new Map<string, any[]>();
    
    cleanings.forEach(c => {
      if (!cleaningsByProperty.has(c.propertyId)) {
        cleaningsByProperty.set(c.propertyId, []);
      }
      cleaningsByProperty.get(c.propertyId)!.push(c);
    });

    orders.forEach(o => {
      if (!ordersByProperty.has(o.propertyId)) {
        ordersByProperty.set(o.propertyId, []);
      }
      ordersByProperty.get(o.propertyId)!.push(o);
    });

    // Analisi proprietà
    const analysis = {
      total: properties.length,
      active: 0,
      inactive: 0,
      
      // Configurazione
      withCleaningPrice: 0,
      withoutCleaningPrice: [] as any[],
      
      // Biancheria
      usesOwnLinen: [] as any[],
      usesServiceLinen: 0,
      linenNotConfigured: [] as any[],
      
      // Proprietà "segnaposto" (create da sync senza dati completi)
      placeholder: [] as any[],
      
      // Proprietà senza owner valido
      noOwner: [] as any[],
      
      // Incongruenze
      ownLinenWithOrders: [] as any[], // Dice biancheria propria ma ha ordini
      noLinenButNoOrders: [] as any[], // Non ha biancheria propria ma non ha ordini
      
      // Dettaglio completo
      allProperties: [] as any[],
    };

    for (const prop of properties) {
      const propCleanings = cleaningsByProperty.get(prop.id) || [];
      const propOrders = ordersByProperty.get(prop.id) || [];
      const owner = ownersMap.get(prop.ownerId);
      
      // Status
      if (prop.status === "ACTIVE") {
        analysis.active++;
      } else {
        analysis.inactive++;
      }

      // Prezzo pulizia
      if (prop.cleaningPrice && prop.cleaningPrice > 0) {
        analysis.withCleaningPrice++;
      } else {
        analysis.withoutCleaningPrice.push({
          id: prop.id,
          name: prop.name,
          status: prop.status,
          ownerId: prop.ownerId,
          ownerName: owner?.displayName || owner?.email || 'N/A',
          cleaningsCount: propCleanings.length,
        });
      }

      // Biancheria
      if (prop.usesOwnLinen === true) {
        analysis.usesOwnLinen.push({
          id: prop.id,
          name: prop.name,
          status: prop.status,
          ordersCount: propOrders.length,
          hasOrders: propOrders.length > 0,
        });
        
        // Incongruenza: dice biancheria propria ma ha ordini
        if (propOrders.length > 0) {
          analysis.ownLinenWithOrders.push({
            id: prop.id,
            name: prop.name,
            ordersCount: propOrders.length,
            lastOrderDate: propOrders.length > 0 ? 
              propOrders.sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0))[0]?.createdAt?.toDate?.()?.toLocaleDateString() : 'N/A',
          });
        }
      } else if (prop.usesOwnLinen === false) {
        analysis.usesServiceLinen++;
      } else {
        // usesOwnLinen non configurato
        analysis.linenNotConfigured.push({
          id: prop.id,
          name: prop.name,
          status: prop.status,
        });
      }

      // Proprietà "segnaposto" (probabilmente create da sync iCal)
      const isPlaceholder = 
        !prop.address && 
        !prop.cleaningPrice && 
        (!prop.ownerId || !owner) &&
        (prop.name?.includes('Airbnb') || 
         prop.name?.includes('Booking') || 
         prop.name?.includes('KrossBooking') ||
         prop.name === 'Stefano Damiani');
      
      if (isPlaceholder) {
        analysis.placeholder.push({
          id: prop.id,
          name: prop.name,
          status: prop.status,
          cleaningsCount: propCleanings.length,
          reason: !prop.address ? 'No indirizzo' : !prop.cleaningPrice ? 'No prezzo' : 'No owner',
        });
      }

      // No owner
      if (!prop.ownerId || !owner) {
        analysis.noOwner.push({
          id: prop.id,
          name: prop.name,
          status: prop.status,
          ownerId: prop.ownerId || 'N/A',
        });
      }

      // Dettaglio completo
      analysis.allProperties.push({
        id: prop.id,
        name: prop.name,
        status: prop.status,
        address: prop.address || null,
        cleaningPrice: prop.cleaningPrice || null,
        usesOwnLinen: prop.usesOwnLinen ?? null,
        ownerId: prop.ownerId || null,
        ownerName: owner?.displayName || owner?.email || null,
        maxGuests: prop.maxGuests || null,
        bedrooms: prop.bedrooms || null,
        bathrooms: prop.bathrooms || null,
        cleaningsCount: propCleanings.length,
        ordersCount: propOrders.length,
        hasIcalUrl: !!(prop.icalUrl || prop.airbnbIcalUrl || prop.bookingIcalUrl),
        isPlaceholder,
        issues: [
          !prop.cleaningPrice ? '❌ No prezzo' : null,
          !prop.address ? '⚠️ No indirizzo' : null,
          prop.usesOwnLinen === undefined ? '⚠️ Biancheria non configurata' : null,
          !prop.ownerId ? '⚠️ No proprietario' : null,
          (prop.usesOwnLinen && propOrders.length > 0) ? '🔄 Biancheria propria ma ha ordini' : null,
        ].filter(Boolean),
      });
    }

    // Ordina per numero di problemi
    analysis.allProperties.sort((a, b) => b.issues.length - a.issues.length);

    // Log riepilogo
    console.log(`📋 Totale proprietà: ${analysis.total}`);
    console.log(`   ✅ Attive: ${analysis.active}`);
    console.log(`   ❌ Inattive: ${analysis.inactive}`);
    console.log(`\n💰 Prezzo pulizia:`);
    console.log(`   ✅ Configurato: ${analysis.withCleaningPrice}`);
    console.log(`   ❌ Mancante: ${analysis.withoutCleaningPrice.length}`);
    console.log(`\n🧺 Biancheria:`);
    console.log(`   🏠 Propria: ${analysis.usesOwnLinen.length}`);
    console.log(`   📦 Servizio: ${analysis.usesServiceLinen}`);
    console.log(`   ⚠️ Non configurata: ${analysis.linenNotConfigured.length}`);
    console.log(`\n⚠️ Problemi:`);
    console.log(`   🔄 Biancheria propria con ordini: ${analysis.ownLinenWithOrders.length}`);
    console.log(`   📍 Segnaposto: ${analysis.placeholder.length}`);
    console.log(`   👤 Senza proprietario: ${analysis.noOwner.length}`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total: analysis.total,
        active: analysis.active,
        inactive: analysis.inactive,
        withCleaningPrice: analysis.withCleaningPrice,
        withoutCleaningPrice: analysis.withoutCleaningPrice.length,
        usesOwnLinen: analysis.usesOwnLinen.length,
        usesServiceLinen: analysis.usesServiceLinen,
        linenNotConfigured: analysis.linenNotConfigured.length,
        ownLinenWithOrders: analysis.ownLinenWithOrders.length,
        placeholder: analysis.placeholder.length,
        noOwner: analysis.noOwner.length,
      },
      details: {
        withoutCleaningPrice: analysis.withoutCleaningPrice,
        usesOwnLinen: analysis.usesOwnLinen,
        linenNotConfigured: analysis.linenNotConfigured,
        ownLinenWithOrders: analysis.ownLinenWithOrders,
        placeholder: analysis.placeholder,
        noOwner: analysis.noOwner,
        allProperties: analysis.allProperties,
      },
    });

  } catch (error: any) {
    console.error("❌ Errore analisi proprietà:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
