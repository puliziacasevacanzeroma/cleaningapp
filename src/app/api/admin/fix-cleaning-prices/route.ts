import { NextResponse } from "next/server";
import { collection, getDocs, doc, updateDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

/**
 * 🔧 API FIX: Ripara pulizie senza prezzo
 * 
 * Questo endpoint:
 * 1. Trova tutte le pulizie senza prezzo (price = null, undefined, 0)
 * 2. Le aggiorna con il prezzo dal contratto della proprietà
 * 3. Aggiunge anche guestsCount se mancante
 */

export async function GET() {
  return POST();
}

export async function POST() {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🔧 FIX: Riparazione pulizie senza prezzo");
    console.log("=".repeat(60) + "\n");

    // 1. Carica tutte le proprietà
    const propertiesSnap = await getDocs(collection(db, "properties"));
    const propertiesMap = new Map<string, any>();
    
    propertiesSnap.docs.forEach(doc => {
      propertiesMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
    
    console.log(`📋 Proprietà caricate: ${propertiesMap.size}`);

    // 2. Trova pulizie senza prezzo
    const cleaningsSnap = await getDocs(collection(db, "cleanings"));
    const cleaningsToFix: any[] = [];
    
    cleaningsSnap.docs.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      
      // Verifica se il prezzo è mancante o zero (escluso SGROSSO che può essere custom)
      const hasInvalidPrice = 
        data.price === null || 
        data.price === undefined || 
        (data.price === 0 && data.serviceType !== 'SGROSSO');
      
      const hasNoGuestsCount = !data.guestsCount || data.guestsCount === 0;
      
      if (hasInvalidPrice || hasNoGuestsCount) {
        cleaningsToFix.push(data);
      }
    });
    
    console.log(`⚠️ Pulizie da fixare: ${cleaningsToFix.length}`);

    // 3. Aggiorna le pulizie
    let fixed = 0;
    let errors = 0;
    const fixedDetails: any[] = [];
    const errorDetails: any[] = [];

    for (const cleaning of cleaningsToFix) {
      try {
        const property = propertiesMap.get(cleaning.propertyId);
        
        if (!property) {
          console.log(`⚠️ Proprietà non trovata per pulizia ${cleaning.id}`);
          errorDetails.push({
            cleaningId: cleaning.id,
            propertyId: cleaning.propertyId,
            error: "Proprietà non trovata"
          });
          errors++;
          continue;
        }

        const contractPrice = property.cleaningPrice || 0;
        const maxGuests = property.maxGuests || 2;
        
        // Prepara i dati da aggiornare
        const updateData: any = {
          updatedAt: Timestamp.now(),
        };
        
        // Fix prezzo se mancante
        const needsPriceFix = 
          cleaning.price === null || 
          cleaning.price === undefined || 
          (cleaning.price === 0 && cleaning.serviceType !== 'SGROSSO');
        
        if (needsPriceFix && contractPrice > 0) {
          updateData.price = contractPrice;
          updateData.contractPrice = contractPrice;
          
          // Aggiungi anche serviceType se mancante
          if (!cleaning.serviceType) {
            updateData.serviceType = 'STANDARD';
            updateData.serviceTypeName = 'Pulizia Standard';
          }
        }
        
        // Fix guestsCount se mancante
        if (!cleaning.guestsCount || cleaning.guestsCount === 0) {
          updateData.guestsCount = maxGuests;
        }
        
        // Aggiungi propertyAddress se mancante
        if (!cleaning.propertyAddress && property.address) {
          updateData.propertyAddress = property.address;
        }

        // Esegui update solo se ci sono modifiche
        if (Object.keys(updateData).length > 1) { // > 1 perché c'è sempre updatedAt
          await updateDoc(doc(db, "cleanings", cleaning.id), updateData);
          
          fixed++;
          fixedDetails.push({
            cleaningId: cleaning.id,
            propertyName: cleaning.propertyName || property.name,
            date: cleaning.scheduledDate?.toDate?.()?.toISOString().split("T")[0] || "N/A",
            oldPrice: cleaning.price,
            newPrice: updateData.price || cleaning.price,
            oldGuestsCount: cleaning.guestsCount,
            newGuestsCount: updateData.guestsCount || cleaning.guestsCount,
          });
          
          console.log(`✅ Fixed: ${property.name} - Prezzo: ${cleaning.price || 0} → ${updateData.price || cleaning.price}, Ospiti: ${cleaning.guestsCount || 0} → ${updateData.guestsCount || cleaning.guestsCount}`);
        } else {
          console.log(`⏭️ Skip: ${property.name} - nessuna modifica necessaria`);
        }
        
      } catch (e: any) {
        console.error(`❌ Errore fixing pulizia ${cleaning.id}:`, e);
        errorDetails.push({
          cleaningId: cleaning.id,
          error: e.message
        });
        errors++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(`✅ FIX COMPLETATO: ${fixed} pulizie corrette, ${errors} errori`);
    console.log("=".repeat(60) + "\n");

    return NextResponse.json({
      success: true,
      summary: {
        totalToFix: cleaningsToFix.length,
        fixed,
        errors,
      },
      fixedDetails: fixedDetails.slice(0, 100), // Limita per non sovraccaricare
      errorDetails,
    });

  } catch (error: any) {
    console.error("❌ Errore fix pulizie:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Errore sconosciuto",
    }, { status: 500 });
  }
}
