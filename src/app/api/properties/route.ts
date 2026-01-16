import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { revalidateTag } from "next/cache";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const data = await request.json();
    const { 
      name, 
      propertyType,
      address, 
      city, 
      postalCode, 
      floor,
      accessCode,
      accessNotes,
      bathrooms,
      maxGuests, 
      checkInTime,
      checkOutTime,
      cleaningPrice, 
      linenPrice,
      cleaningDuration,
      checklistNotes,
      imageUrl,
      ownerMode,
      ownerId,
      clientId,
      newOwner,
      newClient,
    } = data;

    if (!name || !address || !city) {
      return NextResponse.json({ error: "Nome, indirizzo e città sono obbligatori" }, { status: 400 });
    }

    const userRole = session.user.role?.toUpperCase();
    const isAdmin = userRole === "ADMIN";

    // Determina l'ID del proprietario
    let finalClientId: string;

    if (isAdmin) {
      // Admin sta creando la proprietà
      if (clientId) {
        finalClientId = clientId;
      } else if (newClient) {
        // Crea nuovo proprietario
        const existingUser = await db.user.findUnique({
          where: { email: newClient.email }
        });

        if (existingUser) {
          finalClientId = existingUser.id;
        } else {
          const newUser = await db.user.create({
            data: {
              name: newClient.name,
              email: newClient.email,
              phone: newClient.phone || null,
              role: "PROPRIETARIO",
              status: "ACTIVE",
            }
          });
          finalClientId = newUser.id;
        }
      } else {
        return NextResponse.json({ error: "Seleziona un proprietario" }, { status: 400 });
      }
    } else if (ownerMode === "existing" && ownerId) {
      finalClientId = ownerId;
    } else if (ownerMode === "new" && newOwner) {
      // Proprietario crea nuovo sub-proprietario (caso raro)
      const existingUser = await db.user.findUnique({
        where: { email: newOwner.email }
      });

      if (existingUser) {
        finalClientId = existingUser.id;
      } else {
        const newUser = await db.user.create({
          data: {
            name: newOwner.name,
            email: newOwner.email,
            phone: newOwner.phone || null,
            role: "PROPRIETARIO",
            status: "ACTIVE",
          }
        });
        finalClientId = newUser.id;
      }
    } else {
      // Proprietario crea per se stesso - usa session.user.id
      if (!session.user.id) {
        return NextResponse.json({ error: "Impossibile identificare l'utente" }, { status: 400 });
      }
      finalClientId = session.user.id;
    }

    // Verifica che clientId esista nel database
    const ownerExists = await db.user.findUnique({
      where: { id: finalClientId }
    });

    if (!ownerExists) {
      return NextResponse.json({ error: "Proprietario non trovato nel sistema" }, { status: 400 });
    }

    // Se admin crea → ACTIVE, se proprietario crea → PENDING
    const status = isAdmin ? "ACTIVE" : "PENDING";

    const property = await db.property.create({
      data: {
        clientId: finalClientId,
        name,
        propertyType: propertyType || "APPARTAMENTO",
        address,
        city,
        postalCode: postalCode || null,
        floor: floor || null,
        accessNotes: accessCode || accessNotes || null,
        bathrooms: bathrooms || 1,
        maxGuests: maxGuests || 2,
        checkInTime: checkInTime || "15:00",
        checkOutTime: checkOutTime || "10:00",
        cleaningPrice: isAdmin ? (cleaningPrice || 0) : 0, // Solo admin può settare il prezzo
        linenPrice: linenPrice || 0,
        cleaningDuration: cleaningDuration || 2,
        checklistNotes: checklistNotes || null,
        imageUrl: imageUrl || null,
        status,
      }
    });

    // Invalida cache
    revalidateTag("properties");

    return NextResponse.json(property, { status: 201 });
  } catch (error: any) {
    console.error("Errore creazione proprietà:", error);
    
    // Errore più specifico per debug
    const errorMessage = error?.message || "Errore interno del server";
    const errorCode = error?.code || "UNKNOWN";
    
    return NextResponse.json({ 
      error: `Errore: ${errorMessage}`,
      code: errorCode
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const properties = await db.property.findMany({
      where: { clientId: session.user.id },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(properties);
  } catch (error) {
    console.error("Errore recupero proprietà:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}
