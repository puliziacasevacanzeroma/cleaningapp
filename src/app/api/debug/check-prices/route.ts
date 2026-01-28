import { NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

/**
 * 🔍 DIAGNOSI DETTAGLIATA PREZZI PROPRIETÀ
 * 
 * Controlla esattamente cosa c'è nel database per le proprietà
 * che risultano senza prezzo nell'analisi
 */

// Le 7 proprietà che risultano senza prezzo
const PROPERTY_IDS = [
  "1FL5mQUesPPXgvSPQO57",     // Airbnb
  "696a495661a46e94866ed9ae", // Ariele maria Damiani
  "696aeee3bd47b5508f18626c", // Stefano Damiani (INACTIVE)
  "696af1ba603aabe19b01efd3", // KrossBooking
  "6fcxcJuPmB86qNq57af8",     // ddsafs
  "Ae1VBxpuGX5tQuBmUrfK",     // Octorate
  "Ppd8TdkO9iQn63DVWFLV",     // Stefano Damiani (INACTIVE) duplicate
];

export async function GET() {
  console.log("\n" + "=".repeat(80));
  console.log("🔍 DIAGNOSI DETTAGLIATA PREZZI PROPRIETÀ");
  console.log("=".repeat(80) + "\n");

  const results = [];

  for (const id of PROPERTY_IDS) {
    try {
      const docRef = doc(db, "properties", id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        const result = {
          id,
          exists: true,
          name: data.name,
          status: data.status,
          // TUTTI i campi relativi al prezzo
          cleaningPrice: data.cleaningPrice,
          cleaningPriceType: typeof data.cleaningPrice,
          cleaningPriceRaw: JSON.stringify(data.cleaningPrice),
          price: data.price,
          priceType: typeof data.price,
          // Altri campi che potrebbero contenere prezzi
          basePrice: data.basePrice,
          prezzoBase: data.prezzoBase,
          // Check se è 0, null, undefined, stringa vuota
          isZero: data.cleaningPrice === 0,
          isNull: data.cleaningPrice === null,
          isUndefined: data.cleaningPrice === undefined,
          isEmptyString: data.cleaningPrice === "",
          isFalsy: !data.cleaningPrice,
          // Tutti i campi del documento
          allFields: Object.keys(data).sort(),
        };

        console.log(`\n📦 ${data.name} (${id}):`);
        console.log(`   cleaningPrice: ${data.cleaningPrice} (${typeof data.cleaningPrice})`);
        console.log(`   Raw: ${JSON.stringify(data.cleaningPrice)}`);
        console.log(`   isZero: ${result.isZero}, isNull: ${result.isNull}, isUndefined: ${result.isUndefined}`);
        
        results.push(result);
      } else {
        results.push({
          id,
          exists: false,
          error: "Documento non trovato"
        });
        console.log(`\n❌ ${id}: Documento non trovato`);
      }
    } catch (error: any) {
      results.push({
        id,
        exists: false,
        error: error.message
      });
      console.log(`\n❌ ${id}: Errore - ${error.message}`);
    }
  }

  // Riepilogo
  const withPrice = results.filter(r => r.exists && r.cleaningPrice && r.cleaningPrice > 0);
  const withoutPrice = results.filter(r => r.exists && (!r.cleaningPrice || r.cleaningPrice <= 0));

  console.log("\n" + "=".repeat(80));
  console.log(`📊 RIEPILOGO: ${withPrice.length} con prezzo, ${withoutPrice.length} senza prezzo`);
  console.log("=".repeat(80) + "\n");

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      checked: results.length,
      withPrice: withPrice.length,
      withoutPrice: withoutPrice.length,
    },
    results,
    // Lista proprietà che DAVVERO non hanno prezzo
    reallyWithoutPrice: withoutPrice.map(r => ({
      id: r.id,
      name: r.name,
      cleaningPrice: r.cleaningPrice,
      cleaningPriceType: r.cleaningPriceType,
    })),
  });
}
