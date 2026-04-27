import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/property-images
 * 
 * Mostra cosa c'è nei campi foto delle proprietà del cliente.
 * Tenta anche di fare HEAD su ogni URL trovata per diagnosticare problemi.
 */
export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email') || 'damianiariele@gmail.com';

    // Trovo l'utente
    const userQuery = await adminDb.collection("users")
      .where("email", "==", email.toLowerCase().trim())
      .limit(1)
      .get();
    if (userQuery.empty) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }
    const userDoc = userQuery.docs[0]!;

    // Carico le proprietà attive
    const propsSnap = await adminDb.collection("properties")
      .where("ownerId", "==", userDoc.id)
      .where("status", "==", "ACTIVE")
      .get();

    const properties: any[] = [];
    for (const doc of propsSnap.docs) {
      const p: any = doc.data();
      const propData: any = {
        id: doc.id,
        name: p.name,
        // Tutti i possibili campi foto
        imageUrl: p.imageUrl ?? null,
        photoUrl: p.photoUrl ?? null,
        photoURL: p.photoURL ?? null,
        coverPhoto: p.coverPhoto ?? null,
        coverImage: p.coverImage ?? null,
        thumbnail: p.thumbnail ?? null,
        photos: p.photos ?? null,
        photoUrls: p.photoUrls ?? null,
        images: p.images ?? null,
        // Qualunque altra chiave che contiene "image" o "photo" o "foto"
        otherFields: Object.keys(p).filter(k =>
          /image|photo|foto|cover|thumb/i.test(k)
        ),
      };

      // Provo a fare HEAD su ogni URL trovata
      const urlsToCheck: { source: string; url: string }[] = [];
      if (typeof p.imageUrl === "string") urlsToCheck.push({ source: "imageUrl", url: p.imageUrl });
      if (typeof p.photoUrl === "string") urlsToCheck.push({ source: "photoUrl", url: p.photoUrl });
      if (p.images?.door) urlsToCheck.push({ source: "images.door", url: p.images.door });
      if (p.images?.building) urlsToCheck.push({ source: "images.building", url: p.images.building });
      if (Array.isArray(p.photos) && p.photos[0]) urlsToCheck.push({ source: "photos[0]", url: p.photos[0] });

      const urlChecks: any[] = [];
      for (const u of urlsToCheck) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(u.url, { method: "HEAD", signal: controller.signal });
          clearTimeout(timeoutId);
          urlChecks.push({
            source: u.source,
            url: u.url.length > 100 ? u.url.substring(0, 100) + "..." : u.url,
            ok: res.ok,
            status: res.status,
            contentType: res.headers.get("content-type"),
            contentLength: res.headers.get("content-length"),
          });
        } catch (e: any) {
          urlChecks.push({
            source: u.source,
            url: u.url.length > 100 ? u.url.substring(0, 100) + "..." : u.url,
            error: e?.name === "AbortError" ? "TIMEOUT (>5s)" : e?.message || String(e),
          });
        }
      }
      propData.urlChecks = urlChecks;
      properties.push(propData);
    }

    // Conteggio sommario
    const summary = {
      totalProperties: properties.length,
      withImageUrl: properties.filter(p => p.imageUrl).length,
      withPhotoUrl: properties.filter(p => p.photoUrl).length,
      withImagesDoor: properties.filter(p => p.images?.door).length,
      withImagesBuilding: properties.filter(p => p.images?.building).length,
      withPhotosArray: properties.filter(p => Array.isArray(p.photos) && p.photos.length > 0).length,
      withAnyImage: properties.filter(p =>
        p.imageUrl || p.photoUrl || p.images?.door || p.images?.building ||
        (Array.isArray(p.photos) && p.photos.length > 0)
      ).length,
    };

    return NextResponse.json({
      summary,
      properties,
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({
      error: "Errore",
      message: err?.message || String(err),
    }, { status: 500 });
  }
}
