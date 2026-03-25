import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = 'force-dynamic';

// GET - Anteprima: mostra cosa verrebbe aggiornato SENZA modificare nulla
// POST - Esegue il fix reale

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role?.toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const snap = await adminDb.collection("properties").get();
  const preview: any[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, any>;
    const currentBedrooms = data.bedrooms || 1;
    const bedConfiguration = data.bedConfiguration;

    // Calcola il valore corretto
    let correctBedrooms: number | null = null;
    if (Array.isArray(bedConfiguration) && bedConfiguration.length > 0) {
      correctBedrooms = bedConfiguration.length;
    }

    // Segnala solo quelle che hanno bedConfiguration e bedrooms sbagliato
    if (correctBedrooms !== null && correctBedrooms !== currentBedrooms) {
      preview.push({
        id: doc.id,
        name: data.name || "Senza nome",
        currentBedrooms,
        correctBedrooms,
        stanze: bedConfiguration.map((s: any) => s.nome || "Stanza"),
      });
    }
  }

  return NextResponse.json({
    message: `${preview.length} proprietà da aggiornare (anteprima, nessuna modifica)`,
    properties: preview,
  });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser();
  if (!user || user.role?.toUpperCase() !== "ADMIN") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const snap = await adminDb.collection("properties").get();
  const updated: any[] = [];
  const skipped: any[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, any>;
    const currentBedrooms = data.bedrooms || 1;
    const bedConfiguration = data.bedConfiguration;

    // Aggiorna SOLO se ha bedConfiguration valida E bedrooms è diverso
    if (Array.isArray(bedConfiguration) && bedConfiguration.length > 0) {
      const correctBedrooms = bedConfiguration.length;

      if (correctBedrooms !== currentBedrooms) {
        // Aggiorna SOLO il campo bedrooms, nient'altro
        await adminDb.collection("properties").doc(doc.id).update({
          bedrooms: correctBedrooms,
          updatedAt: Timestamp.now(),
        });

        updated.push({
          id: doc.id,
          name: data.name || "Senza nome",
          da: currentBedrooms,
          a: correctBedrooms,
        });
      } else {
        skipped.push({ id: doc.id, name: data.name, motivo: "già corretto" });
      }
    } else {
      skipped.push({ id: doc.id, name: data.name, motivo: "nessuna bedConfiguration" });
    }
  }

  return NextResponse.json({
    message: `Fix completato: ${updated.length} proprietà aggiornate`,
    updated,
    skipped,
  });
}
