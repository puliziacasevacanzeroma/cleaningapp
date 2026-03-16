/**
 * POST /api/contract/upload-selfie
 * 
 * Carica il selfie su Firebase Storage lato server usando Admin SDK.
 * Bypassa le Storage Rules — l'autenticazione è gestita dal JWT.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminStorage } from "~/lib/firebase/admin";
import { requireAuth } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Verifica JWT
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    const body = await request.json();
    const { imageBase64 } = body as { imageBase64: string };

    if (!imageBase64) {
      return NextResponse.json({ error: "Immagine mancante" }, { status: 400 });
    }

    // Rimuovi il prefisso data:image/jpeg;base64,
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Immagine troppo grande (max 5MB)" }, { status: 400 });
    }

    // Path: contract-selfies/{userId}/{timestamp}.jpg
    const fileName = `contract-selfies/${user.id}/${Date.now()}.jpg`;
    const bucket = adminStorage.bucket();
    const file = bucket.file(fileName);

    // Carica il buffer
    await file.save(buffer, {
      metadata: {
        contentType: "image/jpeg",
        metadata: {
          uploadedBy: user.id,
          userEmail: user.email,
          purpose: "contract-selfie",
        },
      },
    });

    // Genera URL pubblico firmato (valido 10 anni)
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    });

    return NextResponse.json({ 
      success: true, 
      url: signedUrl,
      path: fileName,
    });

  } catch (error: any) {
    console.error("Errore upload selfie:", error);
    return NextResponse.json(
      { error: "Errore durante il caricamento. Riprova." },
      { status: 500 }
    );
  }
}
