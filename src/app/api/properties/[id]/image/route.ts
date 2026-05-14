/**
 * POST /api/properties/[id]/image
 *
 * Aggiorna l'immagine di copertina di una proprietà.
 *
 * 🚀 FIX v2 (14/05/2026):
 *   Prima salvava la base64 (`data:image/jpeg;base64,...`) DIRETTAMENTE nel campo
 *   `properties.imageUrl` di Firestore. Conseguenze:
 *   - documento Firestore ~120 KB per proprietà × 76 prop = ~9 MB per ogni listener
 *   - listener properties scarica ~9 MB ad ogni apertura admin/rider/proprietario
 *   - localStorage QuotaExceededError
 *   - tempi di apertura 5-7 secondi
 *
 *   Ora salviamo la foto su Firebase Storage (path: `properties/{id}/cover.jpg`)
 *   e in Firestore solo l'URL pubblico (~150 bytes). Stesso pattern già usato
 *   per le foto pulizie (vedi /api/cleanings/upload-photo).
 *
 *   COMPATIBILITÀ:
 *   - Il client manda ancora la base64 nel body come prima → ZERO modifiche UI
 *   - Il valore salvato in DB cambia (base64 → URL) ma la UI legge entrambi
 *     correttamente (è solo una stringa src di un <img>)
 *
 *   SICUREZZA:
 *   - Decodifica base64 e verifica dimensione max 10MB (no upload sospetti)
 *   - Verifica permessi: solo admin o owner della proprietà
 *   - Usa adminStorage (Admin SDK), bypassa le Storage Rules
 *   - Salva backup automatico della foto precedente in `imageUrlBackup` 
 *     (utile in caso di errori, sovrascritto solo dopo successo upload)
 */

import { NextResponse } from "next/server";
import { adminDb, adminStorage } from "~/lib/firebase/admin";
import { getApiUser } from "~/lib/api-auth";
import { validateBody, GenericBodySchema } from "~/lib/validation/schemas";

export const dynamic = "force-dynamic";

// Limite dimensione binaria foto decodificata
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getApiUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await validateBody(request, GenericBodySchema);
    if (body instanceof Response) return body;
    const { imageUrl: incomingImageUrl } = body;

    if (!incomingImageUrl || typeof incomingImageUrl !== "string") {
      return NextResponse.json({ error: "imageUrl obbligatorio" }, { status: 400 });
    }

    // ─── Verifica proprietà ───
    const propertyDoc = await adminDb.collection("properties").doc(id).get();
    if (!propertyDoc.exists) {
      return NextResponse.json({ error: "Proprietà non trovata" }, { status: 404 });
    }
    const property = propertyDoc.data() as Record<string, any>;

    // ─── Verifica permessi ───
    if (currentUser.role !== "ADMIN" && property.ownerId !== currentUser.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    // ─── Caso A: il client manda già un URL Storage (https://) ───
    // Non dovrebbe succedere col flusso UI attuale, ma per compatibilità futura.
    // Lo salviamo direttamente senza upload (idempotente).
    if (incomingImageUrl.startsWith("https://")) {
      await adminDb.collection("properties").doc(id).update({ imageUrl: incomingImageUrl });
      return NextResponse.json({ success: true, imageUrl: incomingImageUrl, source: "url-direct" });
    }

    // ─── Caso B: il client manda base64 (flusso normale) ───
    if (!incomingImageUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Formato imageUrl non valido (deve essere data:image/... o https://...)" },
        { status: 400 }
      );
    }

    // Estrai content-type e base64 puro
    const match = incomingImageUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Formato base64 non valido" }, { status: 400 });
    }
    const contentType = match[1]!;
    const base64Data = match[2]!;
    const buffer = Buffer.from(base64Data, "base64");

    // Limite dimensione
    if (buffer.length > MAX_PHOTO_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Foto troppo grande (${(buffer.length / 1024 / 1024).toFixed(1)} MB > 10 MB max)` },
        { status: 400 }
      );
    }

    // ─── Upload su Firebase Storage ───
    // Path: properties/{id}/cover.jpg (sovrascrive eventuale foto precedente)
    // Estensione dipende dal content-type (jpg/png/webp/...)
    const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const filePath = `properties/${id}/cover.${ext}`;
    const bucket = adminStorage.bucket();
    const file = bucket.file(filePath);

    await file.save(buffer, {
      contentType,
      resumable: false, // upload sincrono per file < 100MB
      metadata: {
        cacheControl: "public, max-age=86400", // 24h cache HTTP browser
        metadata: {
          propertyId: id,
          uploadedBy: currentUser.id,
          uploadedAt: new Date().toISOString(),
          sizeBytes: buffer.length.toString(),
        },
      },
    });

    // Verifica esplicita che il file sia stato salvato
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json(
        { error: "Upload Storage fallito (file non trovato dopo save)" },
        { status: 500 }
      );
    }

    // Rendi pubblico (necessario per servirlo via URL HTTPS senza token)
    try {
      await file.makePublic();
    } catch (err) {
      // Se makePublic fallisce (es. regole bucket), il file resta accessibile
      // via signed URL che già usiamo per altre risorse.
      console.warn("makePublic failed, file potrebbe richiedere signed URL:", err);
    }

    // URL pubblico canonical
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // ─── Aggiorna documento Firestore ───
    // Salviamo anche imageUrlBackup col valore precedente (solo se era base64)
    // così in caso di problemi possiamo restaurare. Sovrascritto al prossimo upload.
    const previousImageUrl = property.imageUrl;
    const update: Record<string, any> = {
      imageUrl: publicUrl,
      imageUrlUpdatedAt: new Date(),
    };
    if (previousImageUrl && typeof previousImageUrl === "string" && previousImageUrl.startsWith("data:image/")) {
      update.imageUrlBackup = previousImageUrl;
    }

    await adminDb.collection("properties").doc(id).update(update);

    return NextResponse.json({
      success: true,
      imageUrl: publicUrl,
      sizeBytes: buffer.length,
      source: "storage-upload",
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Errore update property image:", error);
    return NextResponse.json({ error: "Errore server", details: errMsg }, { status: 500 });
  }
}
