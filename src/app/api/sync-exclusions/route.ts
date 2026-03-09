import { NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

// GET - Lista esclusioni (opzionalmente per proprietà)
export async function GET(request: Request) {
  const currentUser = await getApiUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");

    let exclusionsQuery: FirebaseFirestore.Query = adminDb.collection("syncExclusions");
    if (propertyId) {
      exclusionsQuery = adminDb.collection("syncExclusions")
        .where("propertyId", "==", propertyId);
    }

    const snapshot = await exclusionsQuery.get();

    // Carica nomi proprietà
    const propertiesSnapshot = await adminDb.collection("properties").get();
    const propertiesMap = new Map<string, string>();
    propertiesSnapshot.docs.forEach(d => {
      propertiesMap.set(d.id, (d.data() as Record<string, any>).name || "Proprietà");
    });

    const exclusions = snapshot.docs.map(d => {
      const data = d.data() as Record<string, any>;
      return {
        id: d.id,
        propertyId: data.propertyId,
        propertyName: propertiesMap.get(data.propertyId) || "Proprietà eliminata",
        originalDate: data.originalDate?.toDate?.()?.toISOString() || null,
        bookingSource: data.bookingSource || null,
        reason: data.reason,
        newDate: data.newDate?.toDate?.()?.toISOString() || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        createdBy: data.createdBy || null,
      };
    });

    // Ordina per data (più recenti prima)
    exclusions.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json({
      success: true,
      count: exclusions.length,
      exclusions,
    });
  } catch (error) {
    console.error("Errore GET exclusions:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// DELETE - Rimuovi un'esclusione (per permettere la ricreazione della pulizia)
export async function DELETE(request: Request) {
  const currentUser = await getApiUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const exclusionId = searchParams.get("id");

    if (!exclusionId) {
      return NextResponse.json({ error: "ID esclusione richiesto" }, { status: 400 });
    }

    await adminDb.collection("syncExclusions").doc(exclusionId).delete();

    return NextResponse.json({
      success: true,
      message: "Esclusione rimossa. La pulizia potrà essere ricreata alla prossima sincronizzazione.",
    });
  } catch (error) {
    console.error("Errore DELETE exclusion:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// POST - Pulisci esclusioni vecchie (più di 90 giorni)
export async function POST(request: Request) {
  const currentUser = await getApiUser();
  
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo gli amministratori" }, { status: 403 });
  }

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const snapshot = await adminDb.collection("syncExclusions").get();
    
    let deleted = 0;
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as Record<string, any>;
      const originalDate = data.originalDate?.toDate?.();
      
      if (originalDate && originalDate < ninetyDaysAgo) {
        await adminDb.collection("syncExclusions").doc(docSnap.id).delete();
        deleted++;
      }
    }

    if (process.env.NODE_ENV !== "production") console.log(`🧹 Pulite ${deleted} esclusioni vecchie`);

    return NextResponse.json({
      success: true,
      deleted,
      message: `${deleted} esclusioni vecchie eliminate`,
    });
  } catch (error) {
    console.error("Errore POST cleanup exclusions:", error);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
