import { NextResponse } from "next/server";
import { db } from "~/lib/firebase/config";
import { collection, getDocs, query, limit, orderBy } from "firebase/firestore";

export const dynamic = 'force-dynamic';

// GET - Mostra i dati grezzi delle ultime proprietà
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('id');
    
    if (propertyId) {
      // Mostra una proprietà specifica
      const { doc, getDoc } = await import("firebase/firestore");
      const propertyRef = doc(db, "properties", propertyId);
      const propertySnap = await getDoc(propertyRef);
      
      if (!propertySnap.exists()) {
        return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
      }
      
      const data = propertySnap.data();
      
      return NextResponse.json({
        id: propertySnap.id,
        allFields: Object.keys(data),
        // Campi specifici per debug
        beds: data.beds || "❌ NON PRESENTE",
        bedsConfig: data.bedsConfig || "❌ NON PRESENTE", 
        bedConfiguration: data.bedConfiguration || "❌ NON PRESENTE",
        serviceConfigs: data.serviceConfigs ? {
          numConfigs: Object.keys(data.serviceConfigs).length,
          sample: data.serviceConfigs[1] || data.serviceConfigs["1"] || "nessuna config per 1 ospite"
        } : "❌ NON PRESENTE",
        maxGuests: data.maxGuests,
        name: data.name,
        // Raw data per confronto
        rawData: data
      });
    }
    
    // Mostra le ultime 5 proprietà
    const propertiesQuery = query(
      collection(db, "properties"),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    
    const snapshot = await getDocs(propertiesQuery);
    
    const properties = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        allFields: Object.keys(data),
        hasBeds: !!data.beds,
        hasBedsConfig: !!data.bedsConfig,
        hasBedConfiguration: !!data.bedConfiguration,
        hasServiceConfigs: !!data.serviceConfigs,
        bedsCount: data.beds?.length || 0,
        bedsConfigCount: data.bedsConfig?.length || 0,
        bedConfigurationCount: data.bedConfiguration?.length || 0,
        serviceConfigsCount: data.serviceConfigs ? Object.keys(data.serviceConfigs).length : 0,
      };
    });
    
    return NextResponse.json({
      message: "Debug proprietà - mostra i campi salvati",
      properties,
      hint: "Aggiungi ?id=PROPERTY_ID per vedere i dettagli di una proprietà specifica"
    });
    
  } catch (error) {
    console.error("Errore debug:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
