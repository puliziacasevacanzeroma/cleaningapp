import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, doc, updateDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// Sincronizza i rating esistenti con i documenti cleanings
export async function POST(req: NextRequest) {
  try {
    console.log("🔄 Avvio sincronizzazione rating -> cleanings...");
    
    // 1. Carica tutti i rating dalla collezione propertyRatings
    const ratingsSnap = await getDocs(collection(db, "propertyRatings"));
    
    if (ratingsSnap.empty) {
      return NextResponse.json({ 
        message: "Nessun rating da sincronizzare",
        synced: 0 
      });
    }

    let synced = 0;
    let errors = 0;
    const results: any[] = [];

    // 2. Per ogni rating, aggiorna il documento cleaning corrispondente
    for (const ratingDoc of ratingsSnap.docs) {
      const rating = ratingDoc.data();
      const cleaningId = rating.cleaningId;
      
      if (!cleaningId) {
        results.push({ ratingId: ratingDoc.id, status: "skip", reason: "no cleaningId" });
        continue;
      }

      try {
        // Verifica se il cleaning esiste
        const cleaningRef = doc(db, "cleanings", cleaningId);
        const cleaningSnap = await getDoc(cleaningRef);
        
        if (!cleaningSnap.exists()) {
          results.push({ ratingId: ratingDoc.id, cleaningId, status: "skip", reason: "cleaning not found" });
          continue;
        }

        // Calcola media se non presente
        let avgScore = rating.averageScore;
        if (!avgScore && rating.scores) {
          const scores = Object.values(rating.scores).filter((s): s is number => typeof s === 'number' && s > 0);
          avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        }

        // Aggiorna il cleaning con i dati del rating
        await updateDoc(cleaningRef, {
          ratingId: ratingDoc.id,
          ratingScore: avgScore ? Math.round(avgScore * 100) / 100 : null,
          ratingScores: rating.scores || null,
          issueIds: rating.issueIds || [],
        });

        synced++;
        results.push({ 
          ratingId: ratingDoc.id, 
          cleaningId, 
          propertyName: rating.propertyName,
          ratingScore: avgScore,
          status: "synced" 
        });
        
        console.log(`✅ Sincronizzato: ${rating.propertyName} - Score: ${avgScore}`);
        
      } catch (err) {
        errors++;
        results.push({ 
          ratingId: ratingDoc.id, 
          cleaningId, 
          status: "error", 
          error: (err as any).message 
        });
        console.error(`❌ Errore sync ${cleaningId}:`, err);
      }
    }

    console.log(`🏁 Sincronizzazione completata: ${synced} ok, ${errors} errori`);

    return NextResponse.json({
      message: `Sincronizzazione completata`,
      totalRatings: ratingsSnap.size,
      synced,
      errors,
      results
    });

  } catch (error) {
    console.error("Errore sincronizzazione:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// GET - Mostra stato sincronizzazione
export async function GET() {
  try {
    // Conta rating
    const ratingsSnap = await getDocs(collection(db, "propertyRatings"));
    
    // Conta cleanings con ratingScore
    const cleaningsSnap = await getDocs(
      query(collection(db, "cleanings"), where("status", "==", "COMPLETED"))
    );
    
    let withRating = 0;
    let withoutRating = 0;
    
    cleaningsSnap.docs.forEach(doc => {
      if (doc.data().ratingScore) {
        withRating++;
      } else {
        withoutRating++;
      }
    });

    return NextResponse.json({
      totalRatings: ratingsSnap.size,
      cleaningsWithRating: withRating,
      cleaningsWithoutRating: withoutRating,
      needsSync: ratingsSnap.size > withRating
    });

  } catch (error) {
    console.error("Errore:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
