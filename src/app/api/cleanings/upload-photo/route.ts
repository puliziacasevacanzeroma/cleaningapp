/**
 * POST /api/cleanings/upload-photo
 * Upload foto pulizia lato server via Admin SDK.
 * Bypassa le Storage Rules — stesso approccio del selfie contratto.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminStorage } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = await request.json();
    const { cleaningId, imageBase64, fileName } = body as {
      cleaningId: string;
      imageBase64: string;
      fileName?: string;
    };

    if (!cleaningId || !imageBase64) {
      return NextResponse.json({ error: "cleaningId e imageBase64 obbligatori" }, { status: 400 });
    }

    // Rimuovi prefisso data URL
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Foto troppo grande (max 10MB)" }, { status: 400 });
    }

    const finalFileName = fileName || `manual_${Date.now()}.jpg`;
    const filePath = `cleanings/${cleaningId}/photos/${finalFileName}`;

    const bucket = adminStorage.bucket();
    const file = bucket.file(filePath);

    await file.save(buffer, {
      metadata: {
        contentType: "image/jpeg",
        metadata: {
          uploadedBy: user.id,
          cleaningId,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // URL pubblico firmato (valido 10 anni)
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    });

    return NextResponse.json({ success: true, url: signedUrl, path: filePath });

  } catch (error: any) {
    console.error("Errore upload foto pulizia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
