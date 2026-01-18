import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "~/lib/api-auth";
import { db } from "~/server/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;

    // Verifica che la proprietà appartenga all'utente
    const property = await db.property.findFirst({
      where: { id, ownerId: user.id }
    });

    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const data = await request.json();
    const { 
      guestsCount, 
      singleSheets, 
      doubleSheets, 
      pillowcases, 
      towelsLarge, 
      towelsSmall, 
      towelsFace, 
      bathMats, 
      bathrobe 
    } = data;

    if (!guestsCount || guestsCount < 1) {
      return NextResponse.json({ error: "Numero ospiti non valido" }, { status: 400 });
    }

    // Cerca se esiste già una configurazione per questo numero di ospiti
    const existingConfig = await db.linenConfig.findFirst({
      where: { propertyId: id, guestsCount }
    });

    let linenConfig;

    if (existingConfig) {
      // Aggiorna la configurazione esistente
      linenConfig = await db.linenConfig.update({
        where: { id: existingConfig.id },
        data: {
          singleSheets: singleSheets || 0,
          doubleSheets: doubleSheets || 0,
          pillowcases: pillowcases || 0,
          towelsLarge: towelsLarge || 0,
          towelsSmall: towelsSmall || 0,
          towelsFace: towelsFace || 0,
          bathMats: bathMats || 0,
          bathrobe: bathrobe || 0
        }
      });
    } else {
      // Crea una nuova configurazione
      linenConfig = await db.linenConfig.create({
        data: {
          propertyId: id,
          guestsCount,
          singleSheets: singleSheets || 0,
          doubleSheets: doubleSheets || 0,
          pillowcases: pillowcases || 0,
          towelsLarge: towelsLarge || 0,
          towelsSmall: towelsSmall || 0,
          towelsFace: towelsFace || 0,
          bathMats: bathMats || 0,
          bathrobe: bathrobe || 0
        }
      });
    }

    return NextResponse.json(linenConfig);
  } catch (error) {
    console.error("Errore salvataggio configurazione biancheria:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;

    // Verifica che la proprietà appartenga all'utente
    const property = await db.property.findFirst({
      where: { id, ownerId: user.id }
    });

    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const url = new URL(request.url);
    const guestsCount = parseInt(url.searchParams.get("guestsCount") || "0");

    if (!guestsCount) {
      return NextResponse.json({ error: "Numero ospiti non specificato" }, { status: 400 });
    }

    await db.linenConfig.deleteMany({
      where: { propertyId: id, guestsCount }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Errore eliminazione configurazione biancheria:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;

    const property = await db.property.findFirst({
      where: { id, ownerId: user.id }
    });

    if (!property) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }

    const configs = await db.linenConfig.findMany({
      where: { propertyId: id },
      orderBy: { guestsCount: "asc" }
    });

    return NextResponse.json(configs);
  } catch (error) {
    console.error("Errore recupero configurazioni biancheria:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}