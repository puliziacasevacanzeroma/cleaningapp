import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { revalidateTag } from "next/cache";

// Helper per calcolare capacità dai letti
function calculateCapacityFromBeds(bedConfiguration: any[]): number {
  let capacity = 0;
  
  const bedCapacities: Record<string, number> = {
    'matrimoniale': 2,
    'singolo': 1,
    'piazza_mezza': 1,
    'divano_letto': 2,
    'castello': 2,
  };

  if (!bedConfiguration || !Array.isArray(bedConfiguration)) {
    return 0;
  }

  bedConfiguration.forEach((room: any) => {
    if (room.letti && Array.isArray(room.letti)) {
      room.letti.forEach((bed: any) => {
        const bedCap = bedCapacities[bed.tipo] || 1;
        capacity += bedCap * (bed.quantita || 1);
      });
    }
  });

  return capacity;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const data = await request.json();
    const {
      name,
      address,
      city,
      postalCode,
      floor,
      accessCode,
      accessNotes,
      description,
      bathrooms,
      maxGuests,
      checkInTime,
      checkOutTime,
      cleaningPrice,
      imageUrl,
      ownerMode,
      ownerId,
      clientId,
      newOwner,
      newClient,
      bedConfiguration, // NUOVO: configurazione letti
    } = data;

    if (!name || !address || !city) {
      return NextResponse.json({ error: "Nome, indirizzo e città sono obbligatori" }, { status: 400 });
    }

    const userRole = session.user.role?.toUpperCase();
    const isAdmin = userRole === "ADMIN";

    // Determina l'ID del proprietario
    let finalClientId: string;

    if (isAdmin) {
      if (clientId) {
        finalClientId = clientId;
      } else if (newClient) {
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
      if (!session.user.id) {
        return NextResponse.json({ error: "Impossibile identificare l'utente" }, { status: 400 });
      }
      finalClientId = session.user.id;
    }

    // Verifica che clientId esista
    const ownerExists = await db.user.findUnique({
      where: { id: finalClientId }
    });

    if (!ownerExists) {
      return NextResponse.json({ error: "Proprietario non trovato nel sistema" }, { status: 400 });
    }

    const status = isAdmin ? "ACTIVE" : "PENDING";

    // Combina piano e codice accesso nella descrizione
    const fullAccessNotes = [
      floor ? `Piano: ${floor}` : null,
      accessCode || accessNotes ? `Accesso: ${accessCode || accessNotes}` : null
    ].filter(Boolean).join(' | ') || null;

    // Calcola maxGuests da bedConfiguration se presente, altrimenti usa il valore passato
    let finalMaxGuests = maxGuests || 2;
    if (bedConfiguration && Array.isArray(bedConfiguration) && bedConfiguration.length > 0) {
      const calculatedCapacity = calculateCapacityFromBeds(bedConfiguration);
      if (calculatedCapacity > 0) {
        finalMaxGuests = calculatedCapacity;
      }
    }

    // Crea la proprietà con bedConfiguration
    const property = await db.property.create({
      data: {
        clientId: finalClientId,
        name,
        address,
        city,
        postalCode: postalCode || null,
        description: fullAccessNotes || description || null,
        bathrooms: bathrooms || 1,
        maxGuests: finalMaxGuests,
        checkInTime: checkInTime || "15:00",
        checkOutTime: checkOutTime || "10:00",
        cleaningPrice: isAdmin ? (cleaningPrice || 0) : 0,
        imageUrl: imageUrl || null,
        bedConfiguration: bedConfiguration || null, // NUOVO: salva configurazione letti
        status,
      }
    });

    revalidateTag("properties");

    return NextResponse.json(property, { status: 201 });
  } catch (error: any) {
    console.error("Errore creazione proprietà:", error);

    return NextResponse.json({
      error: error?.message || "Errore interno del server"
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
