import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

/**
 * FIX: Pulizie con linenConfigModified=true che in realtà hanno biancheria standard.
 * 
 * GET  → Anteprima (dry-run): mostra quali pulizie verrebbero corrette
 * POST → Esegue il fix: setta linenConfigModified=false dove la config è standard
 * 
 * Logica di confronto:
 * - Legge customLinenConfig della pulizia (bl.all + ba)
 * - Legge serviceConfigs[guestsCount] della proprietà (bl.all + ba)
 * - Se le quantità di ogni articolo corrispondono → è standard → rimuovi il badge
 * - Se differiscono → è davvero personalizzata → lascia il badge
 */

// Confronta due oggetti { itemId: quantity } — true se identici
function mapsMatch(a: Record<string, number> | undefined, b: Record<string, number> | undefined): boolean {
  const mapA = a || {};
  const mapB = b || {};
  const allKeys = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);
  for (const key of allKeys) {
    const valA = mapA[key] || 0;
    const valB = mapB[key] || 0;
    if (valA !== valB) return false;
  }
  return true;
}

// Estrai bl.all da una config (gestisce sia bl.all che bl con letti individuali sommati)
function extractBlAll(config: any): Record<string, number> {
  if (!config?.bl) return {};
  if (config.bl['all']) return config.bl['all'];
  // Se non c'è 'all', somma da tutti i gruppi letto
  const merged: Record<string, number> = {};
  for (const [key, items] of Object.entries(config.bl)) {
    if (typeof items === 'object' && items !== null) {
      for (const [itemId, qty] of Object.entries(items as Record<string, number>)) {
        merged[itemId] = (merged[itemId] || 0) + (typeof qty === 'number' ? qty : 0);
      }
    }
  }
  return merged;
}

async function analyzeCleaning(
  cleaningDoc: FirebaseFirestore.QueryDocumentSnapshot,
  propertiesCache: Map<string, any>
): Promise<{
  id: string;
  propertyName: string;
  guestsCount: number;
  isReallyCustom: boolean;
  reason: string;
} | null> {
  const data = cleaningDoc.data();
  const propertyId = data.propertyId;
  const guestsCount = data.guestsCount || 2;
  const customConfig = data.customLinenConfig;

  // Se non ha customLinenConfig salvata, non possiamo confrontare → segna come da fixare
  if (!customConfig) {
    return {
      id: cleaningDoc.id,
      propertyName: data.propertyName || propertyId,
      guestsCount,
      isReallyCustom: false,
      reason: "linenConfigModified=true ma nessuna customLinenConfig salvata"
    };
  }

  // Carica la proprietà (con cache)
  let propertyData = propertiesCache.get(propertyId);
  if (!propertyData) {
    const propDoc = await adminDb.collection("properties").doc(propertyId).get();
    if (!propDoc.exists) {
      return {
        id: cleaningDoc.id,
        propertyName: data.propertyName || propertyId,
        guestsCount,
        isReallyCustom: true,
        reason: "Proprietà non trovata — lascio invariata per sicurezza"
      };
    }
    propertyData = propDoc.data();
    propertiesCache.set(propertyId, propertyData);
  }

  const serviceConfigs = propertyData.serviceConfigs;
  if (!serviceConfigs) {
    return {
      id: cleaningDoc.id,
      propertyName: data.propertyName || propertyId,
      guestsCount,
      isReallyCustom: true,
      reason: "Proprietà senza serviceConfigs — lascio invariata per sicurezza"
    };
  }

  // Trova la config standard per questo numero di ospiti
  const standardConfig = serviceConfigs[guestsCount] || serviceConfigs[String(guestsCount)];
  if (!standardConfig) {
    return {
      id: cleaningDoc.id,
      propertyName: data.propertyName || propertyId,
      guestsCount,
      isReallyCustom: true,
      reason: `Nessuna serviceConfig per ${guestsCount} ospiti — lascio invariata per sicurezza`
    };
  }

  // Confronta biancheria letto (bl.all)
  const customBl = extractBlAll(customConfig);
  const standardBl = extractBlAll(standardConfig);
  const blMatch = mapsMatch(customBl, standardBl);

  // Confronta biancheria bagno (ba)
  const customBa = customConfig.ba || {};
  const standardBa = standardConfig.ba || {};
  const baMatch = mapsMatch(customBa, standardBa);

  if (blMatch && baMatch) {
    return {
      id: cleaningDoc.id,
      propertyName: data.propertyName || propertyId,
      guestsCount,
      isReallyCustom: false,
      reason: "Biancheria letto e bagno identiche alla config standard"
    };
  }

  // Costruisci dettaglio differenze
  const diffs: string[] = [];
  if (!blMatch) diffs.push("biancheria letto diversa");
  if (!baMatch) diffs.push("biancheria bagno diversa");

  return {
    id: cleaningDoc.id,
    propertyName: data.propertyName || propertyId,
    guestsCount,
    isReallyCustom: true,
    reason: `Davvero personalizzata: ${diffs.join(", ")}`
  };
}


// GET = Anteprima (dry-run)
export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role?.toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const snap = await adminDb.collection("cleanings")
    .where("linenConfigModified", "==", true)
    .get();

  if (snap.empty) {
    return NextResponse.json({ 
      message: "Nessuna pulizia con linenConfigModified=true trovata",
      total: 0, toFix: 0, reallyCustom: 0 
    });
  }

  const propertiesCache = new Map<string, any>();
  const results: any[] = [];

  for (const doc of snap.docs) {
    const result = await analyzeCleaning(doc, propertiesCache);
    if (result) results.push(result);
  }

  const toFix = results.filter(r => !r.isReallyCustom);
  const reallyCustom = results.filter(r => r.isReallyCustom);

  return NextResponse.json({
    message: "ANTEPRIMA — nessuna modifica effettuata",
    total: snap.size,
    toFix: toFix.length,
    reallyCustom: reallyCustom.length,
    willFix: toFix.map(r => ({ id: r.id, property: r.propertyName, guests: r.guestsCount, reason: r.reason })),
    willKeep: reallyCustom.map(r => ({ id: r.id, property: r.propertyName, guests: r.guestsCount, reason: r.reason })),
  });
}


// POST = Esegue il fix
export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role?.toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const snap = await adminDb.collection("cleanings")
    .where("linenConfigModified", "==", true)
    .get();

  if (snap.empty) {
    return NextResponse.json({ 
      message: "Nessuna pulizia da correggere",
      fixed: 0, kept: 0 
    });
  }

  const propertiesCache = new Map<string, any>();
  let fixed = 0;
  let kept = 0;
  const fixedList: string[] = [];
  const errors: string[] = [];

  for (const doc of snap.docs) {
    const result = await analyzeCleaning(doc, propertiesCache);
    if (!result) continue;

    if (!result.isReallyCustom) {
      // È standard → rimuovi il badge
      try {
        await adminDb.collection("cleanings").doc(doc.id).update({
          linenConfigModified: false,
        });
        fixed++;
        fixedList.push(`${doc.id} (${result.propertyName})`);
      } catch (e: any) {
        errors.push(`Errore su ${doc.id}: ${e.message}`);
      }
    } else {
      kept++;
    }
  }

  return NextResponse.json({
    message: `Fix completato: ${fixed} corrette, ${kept} mantenute personalizzate`,
    fixed,
    kept,
    fixedList,
    errors: errors.length > 0 ? errors : undefined,
  });
}
